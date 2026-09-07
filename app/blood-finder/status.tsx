import { useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatDateTime,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import { CareButton, InfoRow, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import { useBloodRequest } from '@/lib/api/bloodRequestQueries';

/**
 * Blood Request Status (PM-BLOOD-05) — tracking one request.
 *
 * ── The rail is the screen ────────────────────────────────────────────────
 * The reference's five-stop progress rail is the thing a patient actually came
 * for, so it sits above everything but the reference number. Each stop is a
 * real status the API returns, in the order a request moves through them; a
 * stop is only "done" when the request has genuinely reached or passed it.
 * Nothing here interpolates a step the server has not reported.
 *
 * ── It refreshes itself ───────────────────────────────────────────────────
 * The status is written by the BLOOD BANK, not by this app, and a hold expires
 * on a clock. A tracking screen that shows a stale "Reserved" while the
 * reservation has lapsed is worse than one that says nothing, so the query
 * polls (see useBloodRequest) and every timestamp is printed with its date.
 *
 * ── Expiry is stated in the patient's favour ──────────────────────────────
 * `expires_at` is shown as an explicit warning rather than a quiet field. The
 * whole reason a reservation exists is that units are held for a while and
 * then let go, and a patient who misses that has travelled for nothing.
 */

/** The stops, in the order a request passes through them. */
const RAIL: { key: string; icon: IconName; statuses: string[] }[] = [
  { key: 'received', icon: 'receipt', statuses: ['pending', 'confirmed', 'ready', 'fulfilled'] },
  { key: 'confirmed', icon: 'check-circle', statuses: ['confirmed', 'ready', 'fulfilled'] },
  { key: 'ready', icon: 'shield-check', statuses: ['ready', 'fulfilled'] },
  { key: 'collected', icon: 'check-double', statuses: ['fulfilled'] },
];

const STATUS_TONE: Record<string, StatusTone> = {
  pending: 'pending',
  confirmed: 'info',
  ready: 'normal',
  fulfilled: 'normal',
  cancelled: 'neutral',
  rejected: 'critical',
  expired: 'warning',
};

function dial(number: string | null | undefined): void {
  if (!number) return;
  void Linking.openURL(`tel:${number.replace(/\s+/g, '')}`);
}

export default function BloodRequestStatusScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const request = useBloodRequest(requestId ?? null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  if (request.isPending) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodStatus.title')} onBack={goBack} />
        <View style={styles.centred}>
          <LoadingBlock label={t('bloodStatus.loading')} />
        </View>
      </Screen>
    );
  }

  if (request.isError || !request.data) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodStatus.title')} onBack={goBack} />
        <View style={styles.centred}>
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('bloodStatus.notFoundTitle')}
              message={t('bloodStatus.notFoundBody')}
              actionLabel={t('bloodStatus.backToFinder')}
              onAction={() => router.replace('/blood-finder')}
            />
          </Card>
        </View>
      </Screen>
    );
  }

  const data = request.data;
  const status = data.status;
  const closed = ['cancelled', 'rejected', 'expired'].includes(status);
  const reachedIndex = RAIL.findIndex((stop) => !stop.statuses.includes(status));
  const doneCount = reachedIndex === -1 ? RAIL.length : reachedIndex;

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('bloodStatus.title')}
        subtitle={t('bloodStatus.subtitle')}
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Reference number and current status, the two things a patient reads
            out over the phone. */}
        <Card>
          <View style={styles.headRow}>
            <View style={styles.headMain}>
              <Text style={styles.label}>{t('bloodStatus.reference')}</Text>
              <Text style={[styles.reference, { color: colors.blue }]}>{data.reference}</Text>
              {data.created_at ? (
                <Text style={styles.muted}>
                  {t('bloodStatus.requestedOn', { when: formatDateTime(data.created_at) })}
                </Text>
              ) : null}
            </View>
            <StatusBadge
              status={status}
              tone={STATUS_TONE[status] ?? 'neutral'}
              label={data.status_label}
            />
          </View>
        </Card>

        {/* ── The rail ─────────────────────────────────────────────────────── */}
        {closed ? (
          <NoticeBanner
            icon="info"
            tone={status === 'rejected' ? 'critical' : 'warning'}
            title={data.status_label}
            message={t(`bloodStatus.closed.${status}`, {
              defaultValue: t('bloodStatus.closed.generic'),
            })}
          />
        ) : (
          <Card>
            <View style={styles.rail}>
              {RAIL.map((stop, index) => {
                const done = index < doneCount;
                const current = index === doneCount;
                const tone = done
                  ? colors.statusNormal
                  : current
                    ? colors.blue
                    : colors.textMuted;

                return (
                  <View key={stop.key} style={styles.railStop}>
                    <View style={styles.railColumn}>
                      <View
                        style={[
                          styles.railMark,
                          {
                            backgroundColor: done
                              ? colors.statusNormalBg
                              : current
                                ? colors.tintBlueBg
                                : colors.surfaceMuted,
                          },
                        ]}
                      >
                        <Icon name={stop.icon} size={17} color={tone} />
                      </View>
                      {index < RAIL.length - 1 ? (
                        <View
                          style={[
                            styles.railLine,
                            { backgroundColor: done ? colors.statusNormal : colors.border },
                          ]}
                        />
                      ) : null}
                    </View>
                    <View style={styles.railBody}>
                      <Text style={[styles.railTitle, current && { color: colors.blue }]}>
                        {t(`bloodStatus.rail.${stop.key}`)}
                      </Text>
                      <Text style={styles.muted}>
                        {done
                          ? t('bloodStatus.done')
                          : current
                            ? t('bloodStatus.inProgress')
                            : t('bloodStatus.waiting')}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {/* Expiry, stated as a warning because missing it means a wasted
            journey — not buried among the other facts. */}
        {data.expires_at && !closed ? (
          <NoticeBanner
            icon="clock"
            tone="warning"
            title={t('bloodStatus.expiresTitle')}
            message={t('bloodStatus.expiresBody', { when: formatDateTime(data.expires_at) })}
          />
        ) : null}

        {/* ── The request itself ───────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodStatus.detailsTitle')} />
          <Card>
            <InfoRow
              icon="droplet"
              label={t('bloodStatus.group')}
              value={`${data.blood_group}  ·  ${data.component_label ?? data.component_type}`}
            />
            <InfoRow
              icon="receipt"
              label={t('bloodStatus.quantity')}
              value={t('bloodStatus.units', { count: data.quantity })}
            />
            <InfoRow
              icon="alert-triangle"
              label={t('bloodStatus.urgency')}
              value={t(`bloodFinder.urgency.${data.urgency}`, { defaultValue: data.urgency })}
            />
            {data.needed_by ? (
              <InfoRow
                icon="calendar"
                label={t('bloodStatus.neededBy')}
                value={formatDateTime(data.needed_by)}
              />
            ) : null}
            {data.contact_phone ? (
              <InfoRow
                icon="phone"
                label={t('bloodStatus.contact')}
                value={data.contact_phone}
              />
            ) : null}
            {data.patient_note ? (
              <InfoRow
                icon="document-text"
                label={t('bloodStatus.note')}
                value={data.patient_note}
              />
            ) : null}
          </Card>
        </View>

        {/* ── Where to collect ─────────────────────────────────────────────── */}
        {data.facility ? (
          <View style={styles.stack}>
            <SectionHeader title={t('bloodStatus.facilityTitle')} />
            <Card>
              <Text style={styles.facilityName}>{data.facility.name}</Text>
              {data.facility.address || data.facility.city ? (
                <Text style={styles.muted}>
                  {[data.facility.address, data.facility.city].filter(Boolean).join(', ')}
                </Text>
              ) : null}
              <CareButton
                label={data.facility.phone ? t('bloodStatus.call') : t('bloodStatus.noPhone')}
                icon="phone"
                variant="secondary"
                size="sm"
                disabled={!data.facility.phone}
                onPress={() => dial(data.facility?.phone)}
                style={styles.facilityCall}
              />
            </Card>
          </View>
        ) : null}

        {/* The facility answers a request; the patient may amend it while it is
            still open. Both actions are only offered when they are real. */}
        {data.is_cancellable ? (
          <CareButton
            label={t('bloodStatus.modify')}
            icon="edit"
            variant="primary"
            onPress={() =>
              router.push({
                pathname: '/blood-finder/modify',
                params: { requestId: data.id },
              })
            }
          />
        ) : null}

        <View style={styles.notice} accessibilityRole="summary">
          <Icon name="shield-check" size={20} color={colors.blue} />
          <View style={styles.noticeBody}>
            <Text style={styles.noticeTitle}>{t('bloodFinder.safetyTitle')}</Text>
            <Text style={styles.noticeText}>{t('bloodFinder.safetyBody')}</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.sm },
    centred: { padding: spacing.md },

    headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    headMain: { flex: 1 },
    label: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    reference: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      marginTop: 2,
    },
    muted: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      marginTop: 2,
    },

    rail: { gap: 0 },
    railStop: { flexDirection: 'row', gap: spacing.sm },
    railColumn: { alignItems: 'center', width: 34 },
    railMark: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    railLine: { width: 2, flex: 1, minHeight: 18, marginVertical: 2 },
    railBody: { flex: 1, paddingBottom: spacing.md },
    railTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    facilityName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    facilityCall: { marginTop: spacing.sm, alignSelf: 'flex-start' },

    notice: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      paddingHorizontal: spacing.xs,
    },
    noticeBody: { flex: 1 },
    noticeTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    noticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
      marginTop: 2,
    },
  });
