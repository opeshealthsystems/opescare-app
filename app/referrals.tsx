/**
 * Referral cases — read-only (GET /mobile/referrals).
 *
 * Presentation follows the OPES kit's CARE-020 Referral Detail: each case is
 * a flush card headed by its status badge (and an urgency badge when the
 * clinician marked it urgent or emergency), then the referring → receiving
 * facilities, urgency and reason as `InfoRow`s, the milestones the record
 * actually carries, and the clinician's notes as a soft notice. An open case
 * closes with the reference's "Next steps" rows, each wired to a real route.
 *
 * A referral is authored by a clinician, never by the patient. What the patient
 * CAN do is ASK: `/referrals/request` files a request
 * (`POST /mobile/referral-requests`) that a clinician must act on before any
 * referral exists.
 *
 * Those requests appear here, but in their OWN section, below the issued
 * referrals, under their own heading, each carrying a "Request" chip and the
 * API's own `status_detail` sentence. They are never merged into the referrals
 * list: a request drawn as a card among referrals is a patient believing they
 * have been referred when nobody has referred them. The two come from two
 * different hooks over two different endpoints, so no code path here can
 * concatenate them.
 */
import { useMemo, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatDate,
  formatLabel,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { AsyncBoundary, InfoRow, NoticeBanner } from '@/components/care/shared';
import { asyncStateOf } from '@/components/docs/shared';
import { useIsOnline } from '@/lib/offline';
import {
  useReferrals,
  type Referral,
  type ReferralStatus,
  type ReferralUrgency,
} from '@/lib/api/queries';
import {
  useReferralRequests,
  type ReferralRequest,
  type ReferralRequestStatus,
} from '@/lib/api/patientWriteQueries';

/**
 * Patient-facing tone for the referral lifecycle. `sent` is a live case the
 * receiving facility has not answered yet, so it reads as pending, not done.
 */
const STATUS_TONE: Record<ReferralStatus, StatusTone> = {
  draft: 'warning',
  sent: 'pending',
  accepted: 'normal',
  rejected: 'critical',
  cancelled: 'neutral',
  completed: 'normal',
  expired: 'warning',
};

const URGENCY_TONE: Record<ReferralUrgency, StatusTone> = {
  routine: 'neutral',
  urgent: 'warning',
  emergency: 'critical',
};

const URGENCY_TINT: Record<ReferralUrgency, Tint> = {
  routine: 'blue',
  urgent: 'amber',
  emergency: 'red',
};

const OPEN_STATUSES: ReferralStatus[] = ['sent', 'accepted'];

/**
 * Tone for a REQUEST's lifecycle. `accepted` is the only one a referral exists
 * behind, and it is the only one that reads as done; everything else reads as
 * waiting, closed or withdrawn — never as "you have been referred".
 */
const REQUEST_TONE: Record<ReferralRequestStatus, StatusTone> = {
  submitted: 'pending',
  under_review: 'pending',
  accepted: 'normal',
  declined: 'neutral',
  withdrawn: 'neutral',
};

export default function ReferralsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const online = useIsOnline();
  const query = useReferrals();
  const requestsQuery = useReferralRequests();

  const state = asyncStateOf(query, {
    offline: !online,
    offlineMessage: t('opesCore.errors.offlineBody'),
  });

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <ScreenHeader title={t('referrals.title')} subtitle={t('referrals.subtitle')} />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.blue} />
        }
      >
        <AsyncBoundary
          state={state}
          loadingLabel={t('opesCore.common.loading')}
          isEmpty={(res) => (res.data ?? []).length === 0}
          empty={<EmptyReferrals />}
        >
          {(res) => {
            const referrals = res.data ?? [];
            return (
              <>
                <SectionHeader variant="overline" title={t('referrals.countLabel', { count: referrals.length })} />
                {referrals.map((referral) => (
                  <ReferralCard key={referral.id} referral={referral} />
                ))}
              </>
            );
          }}
        </AsyncBoundary>

        {/*
          Requests the patient made. Rendered OUTSIDE the boundary above so
          they show whether or not the patient has any issued referrals — and
          rendered under their own heading, never inside that list.
        */}
        <ReferralRequestsSection requests={requestsQuery.data?.data ?? []} />

        <WhatYouCanDo />
      </ScrollView>
    </SafeAreaView>
  );
}

/* -------------------------------------------------- requests (not referrals) */

/**
 * The patient's own requests. Every card leads with a "Request" chip and the
 * status badge, then the API's `status_detail` — the sentence that says, in
 * plain language, that no referral exists yet.
 */
function ReferralRequestsSection({ requests }: { requests: ReferralRequest[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  if (requests.length === 0) return null;

  return (
    <>
      <SectionHeader
        title={t('patientWrites.referralRequest.listTitle', { defaultValue: 'Your referral requests' })}
        style={s.sectionAfterCard}
      />
      <NoticeBanner
        icon="info"
        tone="pending"
        message={t('patientWrites.referralRequest.listSubtitle', {
          defaultValue: 'Requests you sent. These are not referrals.',
        })}
      />
      {requests.map((request) => (
        <Card key={request.id} variant="flush">
          <View style={s.cardTop}>
            <View style={s.requestChip}>
              <Icon name="send" size={12} strokeWidth={2} color={colors.tintAmber} />
              <Text style={[s.requestChipText, { color: colors.tintAmber }]}>
                {t('patientWrites.referralRequest.notAReferralTitle', {
                  defaultValue: 'This is a request, not a referral',
                })}
              </Text>
            </View>
            <StatusBadge
              status={request.status}
              tone={REQUEST_TONE[request.status] ?? 'neutral'}
              label={request.status_label}
            />
          </View>

          <View style={s.rows}>
            {request.requested_specialty_label ? (
              <InfoRow
                icon="person-search"
                tint="blue"
                label={t('patientWrites.referralRequest.requestedLabel', { defaultValue: 'You asked for' })}
                value={request.requested_specialty_label}
                divider
              />
            ) : null}
            <InfoRow
              icon="alert-circle"
              tint="amber"
              label={t('patientWrites.referralRequest.urgencyCaveatTitle', {
                defaultValue: 'How urgent it feels to you',
              })}
              value={request.reported_urgency_label}
              divider
            />
            <InfoRow
              icon="document-text"
              tint="blue"
              label={t('patientWrites.referralRequest.yourWordsLabel', { defaultValue: 'In your words' })}
              value={request.reason}
              divider
            />
            <InfoRow
              icon="id-card"
              tint="purple"
              label={t('patientWrites.referralRequest.referenceLabel', { defaultValue: 'Reference' })}
              value={request.reference}
              divider
            />
            <InfoRow
              icon="calendar"
              tint="green"
              label={t('patientWrites.referralRequest.sentAtLabel', { defaultValue: 'Sent' })}
              value={formatDate(request.submitted_at, '')}
            />
          </View>

          <View style={s.inset}>
            <NoticeBanner icon="info" tone="pending" message={request.status_detail} />
          </View>
        </Card>
      ))}
    </>
  );
}

/* ---------------------------------------------------------- what you can do */

/**
 * The two write paths a patient owns, wired to real routes.
 *
 * "Log a reading" sits here because it is the evidence a referral request is
 * built on — a fortnight of home blood pressures is what turns "I feel unwell"
 * into something a clinician can act on. Its natural home is also the vitals
 * card on the home screen; see the hand-off note in the pull request.
 */
function WhatYouCanDo() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return (
    <>
      <SectionHeader
        title={t('patientWrites.common.whatYouCanDo', { defaultValue: 'What you can do' })}
        style={s.sectionAfterCard}
      />
      <Card variant="flush">
        <ListRow
          icon="send"
          tint="purple"
          title={t('patientWrites.referralRequest.openCta', { defaultValue: 'Ask for a referral' })}
          subtitle={t('patientWrites.referralRequest.openCtaSubtitle', {
            defaultValue: 'Tell a clinician why you think you need to see a specialist',
          })}
          onPress={() => router.push('/referrals/request')}
          divider
        />
        <ListRow
          icon="heart-pulse"
          tint="blue"
          title={t('patientWrites.vitals.title', { defaultValue: 'Log a reading' })}
          subtitle={t('patientWrites.vitals.subtitle', { defaultValue: 'A measurement you took yourself' })}
          onPress={() => router.push('/vitals/log')}
        />
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ card */

function ReferralCard({ referral }: { referral: Referral }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const isUrgent = referral.urgency === 'urgent' || referral.urgency === 'emergency';
  const isOpen = OPEN_STATUSES.includes(referral.status);
  const statusLabel = t(`referrals.status.${referral.status}`, { defaultValue: formatLabel(referral.status) });
  const urgencyLabel = t(`referrals.urgency.${referral.urgency}`, { defaultValue: formatLabel(referral.urgency) });

  // Show every milestone the record actually carries, oldest first — a single
  // "latest date" line throws away the rest of the case history.
  const milestones = [
    { key: 'referredOn', icon: 'calendar' as IconName, date: formatDate(referral.referred_at, '') },
    { key: 'acceptedOn', icon: 'calendar-check' as IconName, date: formatDate(referral.accepted_at, '') },
    { key: 'completedOn', icon: 'check-circle' as IconName, date: formatDate(referral.completed_at, '') },
  ].filter((m) => m.date !== '');

  const rows: ReactNode[] = [
    <InfoRow key="from" icon="building" tint="blue" label={t('referrals.from')} value={referral.referring_facility} divider />,
    <InfoRow key="to" icon="building" tint="purple" label={t('referrals.to')} value={referral.receiving_facility} divider />,
    <InfoRow
      key="urgency"
      icon="alert-circle"
      tint={URGENCY_TINT[referral.urgency] ?? 'blue'}
      label={t('opesCare.referral.urgency', { defaultValue: 'Urgency' })}
      value={urgencyLabel}
      divider
    />,
    <InfoRow key="reason" icon="document-text" tint="blue" label={t('referrals.reason')} value={referral.reason} divider={milestones.length > 0} />,
    ...milestones.map((m, i) => (
      <InfoRow
        key={m.key}
        icon={m.icon}
        tint="green"
        label={t(`opesCare.referral.${m.key}`, {
          defaultValue: m.key === 'referredOn' ? 'Referred' : m.key === 'acceptedOn' ? 'Accepted' : 'Completed',
        })}
        value={m.date}
        divider={i < milestones.length - 1}
      />
    )),
  ];

  return (
    <>
      <Card variant="flush">
        <View style={s.cardTop}>
          <StatusBadge status={referral.status} tone={STATUS_TONE[referral.status] ?? 'neutral'} label={statusLabel} />
          {isUrgent ? (
            <StatusBadge
              status={referral.urgency}
              tone={URGENCY_TONE[referral.urgency] ?? 'warning'}
              icon="alert-triangle"
              label={urgencyLabel}
            />
          ) : null}
        </View>

        <View style={s.rows}>{rows}</View>

        {referral.notes ? (
          <View style={s.inset}>
            <NoticeBanner icon="edit" tone="pending" title={t('referrals.notes')} message={referral.notes} />
          </View>
        ) : null}
      </Card>

      {isOpen ? (
        <Card variant="flush">
          <View style={s.cardHead}>
            <Icon name="list" size={22} color={colors.blue} />
            <Text style={s.cardTitle}>{t('opesCare.referral.nextSteps', { defaultValue: 'Next steps' })}</Text>
          </View>
          <ListRow
            icon="calendar-plus"
            tint="blue"
            title={t('opesCare.referral.scheduleTitle', { defaultValue: 'Book an appointment' })}
            subtitle={t('opesCare.referral.scheduleText', { defaultValue: 'Arrange your visit at the receiving facility.' })}
            onPress={() => router.push('/appointments/book')}
            divider
          />
          <ListRow
            icon="clipboard"
            tint="green"
            title={t('opesCare.referral.bringTitle', { defaultValue: 'Bring your documents' })}
            subtitle={t('opesCare.referral.bringText', { defaultValue: 'Carry this referral and any relevant results.' })}
            onPress={() => router.push('/documents')}
            divider
          />
          <ListRow
            icon="phone"
            tint="purple"
            title={t('opesCare.referral.helpTitle', { defaultValue: 'Need help?' })}
            subtitle={t('opesCare.referral.helpText', { defaultValue: 'Contact us if you need assistance.' })}
            onPress={() => router.push('/help')}
          />
        </Card>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ empty */

/** Explain the process rather than show a void. */
function EmptyReferrals() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const steps: { icon: IconName; title: string; body: string }[] = [
    { icon: 'stethoscope', title: t('referrals.step1Title'), body: t('referrals.step1Body') },
    { icon: 'building', title: t('referrals.step2Title'), body: t('referrals.step2Body') },
    { icon: 'calendar-check', title: t('referrals.step3Title'), body: t('referrals.step3Body') },
  ];
  return (
    <>
      <Card>
        <EmptyState icon="send" tint="purple" title={t('referrals.emptyTitle')} message={t('referrals.emptyBody')} />
      </Card>
      <SectionHeader title={t('referrals.howItWorksTitle')} style={s.sectionAfterCard} />
      <Card variant="flush">
        {steps.map((step, i) => (
          <StepRow key={step.title} icon={step.icon} title={step.title} body={step.body} divider={i < steps.length - 1} />
        ))}
      </Card>
      {/*
        The shipped copy for `referrals.emptyCallout*` reads "You cannot raise
        a referral yourself. Discuss it at your next appointment." That was true
        when this screen had no write path; it is now false, and it would sit
        directly above a button that does exactly what it says cannot be done.
        Rather than edit the shared locale files, the callout points at this
        feature's own keys, which say the accurate thing: you cannot write a
        referral, but you can ask for one.
      */}
      <NoticeBanner
        icon="info"
        tone="pending"
        title={t('patientWrites.referralRequest.emptyCalloutTitle', {
          defaultValue: 'Referrals are written for you',
        })}
        message={t('patientWrites.referralRequest.emptyCalloutBody', {
          defaultValue:
            'You cannot write a referral yourself — but you can ask for one, and a clinician will decide.',
        })}
      />
    </>
  );
}

/** A §8 row whose body is allowed to wrap — explanatory prose, not a record. */
function StepRow({ icon, title, body, divider }: { icon: IconName; title: string; body: string; divider: boolean }) {
  const { colors, tintMap } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const tint = tintMap.purple;
  return (
    <View style={[s.stepRow, divider && s.rowDivider]} accessible accessibilityLabel={`${title}. ${body}`}>
      <View style={[s.stepMark, { backgroundColor: tint.bg }]}>
        <Icon name={icon} size={20} color={tint.fg} />
      </View>
      <View style={s.stepBody}>
        <Text style={s.stepTitle}>{title}</Text>
        <Text style={s.stepText}>{body}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ styles */

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
    sectionAfterCard: { marginTop: spacing.sm },

    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    // InfoRow carries no horizontal inset of its own — it expects a padded card.
    rows: { paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
    inset: { padding: spacing.md, paddingTop: spacing.sm },

    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    cardTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },

    // Outlined, amber, `send` glyph — deliberately unlike the filled status
    // badges the issued referrals wear, so a request never reads as one.
    requestChip: {
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.tintAmber,
      backgroundColor: 'transparent',
    },
    requestChipText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
    },

    rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
    },
    stepMark: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBody: { flex: 1, minWidth: 0, gap: 2 },
    stepTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    stepText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
  });
