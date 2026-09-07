/**
 * Sample Collection — `/labs/sample[?appointmentId=…]`.
 *
 * Port of OPES DIA-005 (UIUX/src/screens/diagnostics/SampleCollectionScreen.tsx):
 * where and when to give a sample, who it is for, who ordered it, what the
 * laboratory is still waiting on, and the patient's other lab visits.
 *
 * What changed from the OPES source, and why:
 *  - Four fetches (appointments + one appointment + lab orders + profile)
 *    become one `useSampleCollection(appointmentId)`: this app's contract
 *    already returns `{ appointment, others, pending, patient }` from
 *    `/mobile/labs/collection`, and the server picks the visit (the named one,
 *    else the soonest upcoming, else the most recent).
 *  - The reference's provider profile, department directions, reschedule,
 *    cancel and check-in buttons are NOT drawn. `LabVisit` carries no
 *    provider id, department id, `can_reschedule`, `can_cancel` or
 *    `can_check_in`, and this app owns those writes on the appointment screens
 *    — so the visit links to `/appointments/[id]`, which really can do them,
 *    instead of shipping four controls that go nowhere.
 *  - `@react-navigation/native` → expo-router; "find a laboratory" and
 *    "directions" open `/care-map`.
 *
 * NOT SHOWN, DELIBERATELY: sample type, fasting hours and preparation
 * instructions. No endpoint carries them, and the app must not invent clinical
 * preparation advice — the "before you go" strip says who does hold it.
 *
 * A failed read renders
 * the kit `EmptyState` (`LabsUnavailable`), never a crash or an endless spinner.
 */
import React, { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  ResultList,
  ScreenHeader,
  StatusBadge,
  a11yJoin,
  decorative,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import {
  DiagButton,
  HeroBand,
  InfoStrip,
  LoadingBlock,
  Overline,
  StatGrid,
  errorMessage,
  fmtDate,
  fmtDateTime,
  titleCase,
} from '@/components/diagnostics/shared';
import {
  isLabsUnavailable,
  useSampleCollection,
  type LabVisit,
} from '@/lib/api/labsQueries';
import { LabsUnavailable, useLabsT, type Tx } from './index';

/** "45 min" / "—". The lab visit is the only place this app prints a duration. */
function duration(minutes: number | null | undefined, tx: Tx): string {
  if (minutes == null || minutes <= 0) return '—';
  return tx('collection.minutes', '{{count}} min', { count: minutes });
}

export default function SampleCollectionScreen() {
  const { t, tx } = useLabsT();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ appointmentId?: string }>();
  const appointmentId = Array.isArray(params.appointmentId) ? params.appointmentId[0] : params.appointmentId;

  const query = useSampleCollection(appointmentId);
  const data = query.data ?? null;

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/labs');
  }, [router]);

  const findLab = useCallback(() => router.push('/care-map'), [router]);
  const openVisit = useCallback(
    (visit: LabVisit) => router.push({ pathname: '/appointments/[id]', params: { id: visit.id } }),
    [router]
  );

  function renderBody() {
    if (query.isLoading && !data) {
      return <LoadingBlock label={tx('collection.loading', 'Loading your lab visit…')} />;
    }
    if (query.error && !data) {
      return (
        <LabsUnavailable
          unavailable={isLabsUnavailable(query.error)}
          message={errorMessage(query.error)}
          onRetry={() => void query.refetch()}
          onFindLab={findLab}
          tx={tx}
        />
      );
    }
    if (!data) return <LoadingBlock label={tx('collection.loading', 'Loading your lab visit…')} />;

    const a = data.appointment;
    const patient = data.patient;
    const pending = data.pending ?? [];
    const others = data.others ?? [];

    return (
      <>
        {a ? (
          <>
            {/* ── When and where ─────────────────────────────────────── */}
            <Card>
              <View style={styles.headRow}>
                <StatusBadge status={a.status} label={titleCase(a.status)} size="sm" />
                {a.is_upcoming && (
                  <Text style={styles.upcoming}>{tx('collection.upcoming', 'Upcoming visit')}</Text>
                )}
              </View>

              <View style={styles.whenRow}>
                <View style={styles.whenIcon} {...decorative}>
                  <Icon name="calendar-check" size={24} color={colors.tintGreen} />
                </View>
                <View style={styles.whenBody}>
                  <Text style={styles.whenDate}>{fmtDateTime(a.scheduled_at)}</Text>
                  <Text style={styles.whenMeta} numberOfLines={1}>
                    {a.facility_name ?? tx('collection.locationFallback', 'Laboratory')}
                  </Text>
                </View>
              </View>

              <View style={styles.gridGap}>
                <StatGrid
                  tiles={[
                    {
                      key: 'duration',
                      label: tx('collection.statDuration', 'Duration'),
                      value: duration(a.duration_minutes, tx),
                      icon: 'clock',
                      tint: 'blue',
                    },
                    {
                      key: 'status',
                      label: tx('collection.statStatus', 'Status'),
                      value: titleCase(a.status),
                      icon: 'check-circle',
                      tint: 'green',
                    },
                    {
                      key: 'type',
                      label: tx('collection.statVisit', 'Visit'),
                      value: titleCase(a.appointment_type),
                      icon: 'building',
                      tint: 'purple',
                    },
                    {
                      key: 'checkin',
                      label: tx('collection.statCheckedIn', 'Checked in'),
                      value: a.checked_in_at ? fmtDate(a.checked_in_at) : tx('collection.notYet', 'Not yet'),
                      icon: 'qr',
                      tint: 'amber',
                    },
                  ]}
                />
              </View>
            </Card>

            {/* ── Patient ────────────────────────────────────────────── */}
            {!!patient && (
              <Card>
                <Overline
                  label={tx('collection.patientInformation', 'Patient Information')}
                  style={styles.overlineGap}
                />
                <View style={styles.personRow}>
                  <View style={styles.avatar} {...decorative}>
                    <Icon name="person" size={24} color={colors.blue} />
                  </View>
                  <View style={styles.personBody}>
                    <Text style={styles.personName} numberOfLines={1}>
                      {patient.name}
                    </Text>
                    <Text style={styles.personMeta} numberOfLines={1}>
                      {[
                        patient.health_id,
                        patient.sex ? titleCase(patient.sex) : null,
                        patient.age != null
                          ? tx('collection.years', '{{count}} yrs', { count: patient.age })
                          : null,
                      ]
                        .filter(Boolean)
                        .join('  •  ')}
                    </Text>
                  </View>
                  <DiagButton
                    label={tx('collection.profile', 'Health ID')}
                    icon="id-card"
                    variant="secondary"
                    size="sm"
                    onPress={() => router.push('/(tabs)/health-id')}
                  />
                </View>
              </Card>
            )}

            {/* ── Who ordered it ─────────────────────────────────────── */}
            <Card>
              <Overline label={tx('collection.orderDetails', 'Order Details')} style={styles.overlineGap} />
              <View style={styles.personRow}>
                <View style={styles.avatar} {...decorative}>
                  <Icon name="stethoscope" size={24} color={colors.blue} />
                </View>
                <View style={styles.personBody}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {a.provider_name ?? tx('collection.yourCareTeam', 'Your care team')}
                  </Text>
                  <Text style={styles.personRole} numberOfLines={1}>
                    {tx('collection.laboratory', 'Laboratory visit')}
                  </Text>
                </View>
                <DiagButton
                  label={tx('collection.view', 'View')}
                  icon="chevron-right"
                  variant="secondary"
                  size="sm"
                  onPress={() => openVisit(a)}
                  a11yLabel={tx('collection.viewA11y', 'Open this appointment')}
                />
              </View>

              {!!a.reason && (
                <View style={styles.reasonBlock}>
                  <Text style={styles.reasonLabel}>{tx('collection.reasonLabel', 'Reason for the visit')}</Text>
                  <Text style={styles.reasonText}>{a.reason}</Text>
                </View>
              )}
            </Card>

            {/* ── Where to go ────────────────────────────────────────── */}
            <Card>
              <Overline label={tx('collection.location', 'Location')} style={styles.overlineGap} />
              <View style={styles.personRow}>
                <View style={styles.avatar} {...decorative}>
                  <Icon name="location" size={24} color={colors.blue} />
                </View>
                <View style={styles.personBody}>
                  <Text style={styles.personName} numberOfLines={2}>
                    {a.facility_name ?? tx('collection.locationFallback', 'Laboratory')}
                  </Text>
                  {!!a.facility_address && (
                    <Text style={styles.personMeta} numberOfLines={2}>
                      {a.facility_address}
                    </Text>
                  )}
                </View>
                <DiagButton
                  label={tx('collection.directions', 'Map')}
                  icon="location"
                  variant="secondary"
                  size="sm"
                  onPress={findLab}
                  a11yLabel={tx('collection.directionsA11y', 'Find this laboratory on the care map')}
                />
              </View>

              <View style={styles.stripGap}>
                <InfoStrip icon="info" tone="pending">
                  <Text style={styles.noticeTitle}>{tx('collection.beforeTitle', 'Before you go')}</Text>
                  <Text style={styles.noticeBody}>
                    {tx(
                      'collection.beforeBody',
                      'Bring your Health ID and arrive a few minutes early. If a test needs any preparation — fasting, for instance — the laboratory or your care team will tell you; this app does not hold those instructions.'
                    )}
                  </Text>
                </InfoStrip>
              </View>

              <Text style={styles.techCaption} accessible accessibilityLabel={a11yJoin(
                tx('collection.factAppointmentRef', 'Appointment reference'),
                a.id
              )}>
                {tx('collection.factAppointmentRef', 'Appointment reference')}
                {`: ${a.id}`}
              </Text>
            </Card>
          </>
        ) : (
          <Card>
            <EmptyState
              icon="calendar"
              tint="green"
              title={tx('collection.noAppointmentTitle', 'No lab visit booked')}
              message={tx(
                'collection.noAppointmentBody',
                'You have no laboratory appointment on file. Find a laboratory near you and book a time to give your sample.'
              )}
              actionLabel={tx('collection.noAppointmentCta', 'Book at a facility')}
              onAction={findLab}
            />
          </Card>
        )}

        {/* ── What the lab is waiting on ─────────────────────────────── */}
        <Card variant={pending.length > 0 ? 'flush' : 'padded'}>
          {pending.length === 0 ? (
            <>
              <Overline label={tx('collection.awaitingSample', 'Awaiting a sample')} style={styles.overlineGap} />
              <Text style={styles.emptyLine}>
                {tx('collection.awaitingEmpty', 'No test is waiting on a sample from you right now.')}
              </Text>
            </>
          ) : (
            <>
              <Overline
                label={tx('collection.awaitingSample', 'Awaiting a sample')}
                style={styles.overlineFlush}
              />
              {pending.map((o, i) => (
                <ListRow
                  key={o.id}
                  icon="flask"
                  tint="green"
                  title={o.name}
                  meta={[titleCase(o.priority), fmtDate(o.ordered_at)]}
                  onPress={() => router.push({ pathname: '/labs/[id]', params: { id: o.id } })}
                  accessibilityHint={tx('collection.orderHint', 'Opens this laboratory order')}
                  divider={i < pending.length - 1}
                />
              ))}
            </>
          )}
        </Card>

        {/* ── Other lab visits ───────────────────────────────────────── */}
        {others.length > 0 && (
          <ResultList>
            <Overline label={tx('collection.otherVisits', 'Other lab visits')} style={styles.overlineStandalone} />
            {others.map((o) => (
              <Card key={o.id} variant="flush">
                <ListRow
                  icon="syringe"
                  tint="blue"
                  title={fmtDateTime(o.scheduled_at)}
                  meta={[titleCase(o.status), o.facility_name]}
                  onPress={() => router.push({ pathname: '/labs/sample', params: { appointmentId: o.id } })}
                  accessibilityHint={tx('collection.otherVisitHint', 'Shows this visit instead')}
                  divider={false}
                />
              </Card>
            ))}
          </ResultList>
        )}

        <View style={styles.actions}>
          <DiagButton
            label={tx('collection.requestTest', 'Request a test')}
            icon="flask"
            variant="secondary"
            style={styles.actionButton}
            onPress={() => router.push('/labs/request')}
          />
          <DiagButton
            label={tx('collection.findLab', 'Find a lab')}
            icon="location"
            variant="secondary"
            style={styles.actionButton}
            onPress={findLab}
          />
        </View>
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('collection.title', 'Sample Collection')}
        align="center"
        onBack={goBack}
        actions={[
          {
            icon: 'bell',
            onPress: () => router.push('/notifications'),
            accessibilityLabel: t('opesCore.common.notifications', { defaultValue: 'Notifications' }),
          },
          {
            icon: 'more-vertical',
            onPress: () => router.push('/labs'),
            accessibilityLabel: t('opesCore.common.moreOptions', { defaultValue: 'More options' }),
          },
        ]}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching && !!data}
            onRefresh={() => void query.refetch()}
            tintColor={colors.blue}
          />
        }
      >
        <HeroBand
          title={tx('collection.heroTitle', 'Giving Your Sample')}
          subtitle={tx('collection.heroSubtitle', 'Where and when to give your sample, and what the lab is waiting on.')}
          icon="syringe"
        />
        {renderBody()}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

    headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    upcoming: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },

    whenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
    whenIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.tintGreenBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    whenBody: { flex: 1, minWidth: 0 },
    whenDate: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: colors.textPrimary,
    },
    whenMeta: {
      marginTop: 2,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.link,
    },
    gridGap: { marginTop: spacing.md },

    overlineGap: { marginBottom: spacing.sm },
    overlineFlush: { marginBottom: spacing.sm, paddingTop: spacing.md, paddingHorizontal: spacing.md },
    // Outside a card now: the ResultList gap supplies the space the card
    // padding used to, so only the horizontal inset is still needed.
    overlineStandalone: { paddingHorizontal: spacing.xs },

    personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.tintBlueBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    personBody: { flex: 1, minWidth: 0 },
    personName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: colors.textPrimary,
    },
    personRole: {
      marginTop: 2,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
    },
    personMeta: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },

    reasonBlock: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    reasonLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    reasonText: {
      marginTop: 2,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },

    stripGap: { marginTop: spacing.md },
    noticeTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    noticeBody: {
      marginTop: spacing.xs / 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    techCaption: {
      marginTop: spacing.md,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    emptyLine: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },

    actions: { flexDirection: 'row', gap: spacing.sm },
    actionButton: { flex: 1 },
  });
