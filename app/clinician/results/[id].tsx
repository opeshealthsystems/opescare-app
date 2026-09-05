/**
 * Doctor — Result detail + acknowledgement (`/clinician/results/[id]`).
 *
 * Port of `UIUX/src/screens/doctor/ResultDetailScreen.tsx` onto expo-router,
 * the OPES UI kit and this app's doctor foundation.
 *
 * The highest-stakes screen in the doctor app, so its rules are explicit:
 *
 *  1. ACKNOWLEDGEMENT IS A CLINICAL ACT. Nothing here acknowledges as a side
 *     effect. Opening the screen does not. Only the button does, and only
 *     after a confirmation sheet that names the patient and the result.
 *  2. NEVER CLAIM SUCCESS WE CANNOT SEE. A failed acknowledgement is reported
 *     in a Dialog that says plainly when the outcome is unknown and where to
 *     check. The result is only shown as acknowledged when the server
 *     answered with an `acknowledged_at`.
 *  3. NEVER PRESENT STALE DATA AS CURRENT. A refresh that failed over data
 *     already on screen renders the kit's `StaleNotice` above it.
 *  4. NEVER INVENT A THRESHOLD. Reference intervals and flags are printed as
 *     the laboratory recorded them; where there is none, the screen says so.
 *
 * `id` is the id of the notification row the inbox listed — the same
 * identifier the desktop inbox acknowledges against.
 *
 * Backend gap: the finder does not serve `/mobile/doctor/*` yet. A 404 (or any
 * failure with nothing on screen) renders an honest EmptyState with a retry.
 *
 * i18n: `opesDoctor.*` is being migrated; every string carries a
 * `defaultValue` until the keys land. Locale files are not edited here.
 */
import { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
  StatusBadge,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import {
  CareButton,
  InfoRow,
  LoadingBlock,
  NoticeBanner,
  SummaryLine,
  describeFailure,
  type Translate,
} from '@/components/care/shared';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  useAcknowledgeResult,
  useResultDetail,
  type InboxAnalyte,
  type InboxResultDetail,
  isDoctorFeatureUnserved,
} from '@/lib/api/doctorQueries';
import { categoryLabel, fmtReported } from '@/components/doctor/shared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';

/**
 * The server's own sentence, when it sent one.
 *
 * On a 404 the API says which of "not yours / not here / gone" applies, in the
 * clinician's language. Replacing that with a generic classification would
 * throw away the only specific thing anyone knows about the failure.
 */
function serverMessage(e: unknown): string | null {
  if (!axios.isAxiosError(e)) return null;
  const body = e.response?.data as { message?: string } | undefined;
  return typeof body?.message === 'string' && body.message !== '' ? body.message : null;
}

/** Failure copy for a write, saying plainly when the outcome is unknown. */
function writeFailureMessage(t: Translate, e: unknown, checkHint: string): string {
  const f = describeFailure(e);
  const outcomeUnknown = f.kind === 'timeout' || f.kind === 'server' || f.kind === 'unknown';
  return outcomeUnknown
    ? t('opesCore.errors.unknownOutcome', { message: f.message, checkHint })
    : f.message;
}

/**
 * The laboratory's own flag → a badge tone. Mirrors the patient diagnostics
 * screens' `toneForFlag`: this screen classifies nothing itself.
 */
function toneForFlag(flag: string | null | undefined): StatusTone {
  switch ((flag ?? '').toLowerCase()) {
    case 'normal':
      return 'normal';
    case 'low':
      return 'warning';
    case 'high':
    case 'abnormal':
    case 'critical':
      return 'critical';
    // An ordered-but-unresulted analyte is not a result at all — never the
    // alarming critical tone, a calm neutral.
    case 'pending':
    default:
      return 'neutral';
  }
}

export default function ResultDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const { id } = useLocalSearchParams<{ id: string }>();
  const resultId = typeof id === 'string' ? id : '';

  /** `opesDoctor.<key>` with a readable default until the catalogue lands. */
  const tx = useCallback(
    (key: string, defaultValue: string, params?: Record<string, unknown>) =>
      String(t(`opesDoctor.${key}`, { defaultValue, ...params })),
    [t]
  );
  const tr = useCallback<Translate>(
    (key, params) => String(t(key, params as Record<string, unknown>)),
    [t]
  );

  const detail = useResultDetail(resultId);
  const acknowledge = useAcknowledgeResult();
  const { refetch } = detail;

  /**
   * The confirmation. It names the patient, their number and the result in
   * the question itself, so an accidental tap cannot become an
   * acknowledgement.
   */
  function askToAcknowledge(result: InboxResultDetail) {
    const patient = result.patient_name ?? tx('result.confirmThisPatient', 'this patient');
    dialog.confirm({
      title: result.is_critical
        ? tx('result.confirmCriticalTitle', 'Acknowledge this CRITICAL result?')
        : tx('result.confirmTitle', 'Acknowledge this result?'),
      message: tx(
        'result.confirmMessage',
        '{{patient}}{{number}} — {{title}}.\n\nYour name and the time will be recorded against this result on the hospital record, and it will show as acknowledged on the desktop inbox too. This cannot be undone from the app.',
        {
          patient,
          number: result.patient_health_id ? ` (${result.patient_health_id})` : '',
          title: result.title,
        }
      ),
      confirmLabel: tx('result.confirmCta', 'Acknowledge'),
      cancelLabel: tx('result.confirmCancel', 'Not yet'),
      tone: result.is_critical ? 'critical' : 'warning',
      destructive: result.is_critical,
      onConfirm: async () => {
        try {
          // The mutation takes the notification id itself. It is idempotent on
          // the server: a second call answers 200 with the ORIGINAL signature,
          // so a retry after a dropped response cannot make a landed
          // acknowledgement look failed.
          const updated = await acknowledge.mutateAsync(result.id);
          if (!updated?.acknowledged_at) {
            // The server answered, but not with an acknowledgement. Do not
            // paint the screen as done on the strength of a 200 alone.
            dialog.alert(
              tx('result.notAckedTitle', 'Not acknowledged'),
              tx(
                'result.notAckedBody',
                'The hospital record did not come back with an acknowledgement. Please try again, or acknowledge it on a workstation.'
              ),
              'critical'
            );
            void refetch();
            return;
          }
          // Re-read so what is on screen is the server's row, not our guess.
          void refetch();
          dialog.alert(
            tx('result.doneTitle', 'Acknowledged'),
            tx('result.doneBody', 'Recorded against {{patient}} at {{when}} in the name of {{name}}.', {
              patient,
              when: fmtReported(updated.acknowledged_at),
              name: updated.acknowledged_by_name ?? tx('result.doneNameYou', 'you'),
            }),
            'success'
          );
        } catch (e) {
          dialog.alert(
            tx('result.failedTitle', 'Could not acknowledge'),
            writeFailureMessage(
              tr,
              e,
              tx(
                'result.failedHint',
                'Open this result again — if it shows as acknowledged, it was recorded. If it does not, acknowledge it again or use a workstation.'
              )
            ),
            'critical'
          );
          void refetch();
        }
      },
    });
  }

  // A refresh that failed while the result is on screen must never pass as fresh.
  const stale =
    detail.isError && detail.data !== undefined ? (
      <StaleNotice
        message={describeFailure(detail.error).message}
        loadedAt={detail.dataUpdatedAt ? new Date(detail.dataUpdatedAt) : null}
        onRetry={() => void refetch()}
        retrying={detail.isFetching}
      />
    ) : null;

  let body: React.ReactNode;
  if (!resultId) {
    body = (
      <EmptyState
        icon="alert-circle"
        tint="amber"
        title={tr('opesCore.errors.notFoundTitle')}
        message={tr('opesCore.errors.notFoundBody')}
      />
    );
  } else if (detail.isPending) {
    body = <LoadingBlock label={tx('result.loading', 'Loading this result…')} />;
  } else if (detail.isError && detail.data === undefined) {
    const notServed = isDoctorFeatureUnserved(detail.error);
    // An expired clinician session, a result that is not theirs and a dead
    // network are three different problems with three different fixes.
    // `describeFailure` names each in both languages; the server's own 404
    // sentence is more specific still, so it wins when there is one.
    const failure = describeFailure(detail.error);
    body = (
      <EmptyState
        icon={notServed ? 'flask' : 'alert-circle'}
        tint={notServed ? 'green' : 'red'}
        title={
          notServed
            ? tx('shared.notServedTitle', 'Not available on this server yet')
            : failure.title
        }
        message={
          notServed
            ? tx(
                'shared.notServedResult',
                'This result cannot be opened until the clinician service is enabled for this app.'
              )
            : (serverMessage(detail.error) ?? failure.message)
        }
        actionLabel={tr('opesCore.common.retry')}
        onAction={() => void refetch()}
      />
    );
  } else if (detail.data) {
    const r = detail.data;
    const acked = !!r.acknowledged_at;
    const analytes = r.result?.kind === 'lab' ? r.result.analytes ?? [] : [];

    body = (
      <>
        {r.is_critical && !acked && (
          <NoticeBanner
            icon="alert-triangle"
            tone="critical"
            title={tx('result.criticalTitle', 'CRITICAL RESULT — NOT ACKNOWLEDGED')}
            message={tx(
              'result.criticalBody',
              'This result was flagged critical when it was released. It stays unacknowledged until you confirm below.'
            )}
          />
        )}

        <Card>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{r.title}</Text>
            <StatusBadge
              status={
                acked
                  ? tx('result.badgeAcknowledged', 'Acknowledged')
                  : r.is_critical
                    ? tx('result.badgeCritical', 'Critical')
                    : tx('result.badgeAwaiting', 'Awaiting review')
              }
              tone={acked ? 'normal' : r.is_critical ? 'critical' : 'pending'}
              icon={acked ? 'check' : undefined}
              size="sm"
            />
          </View>
          {!!r.body && <Text style={styles.body}>{r.body}</Text>}

          <View style={styles.divider} />

          <InfoRow
            icon="person"
            tint="blue"
            label={tx('result.patient', 'Patient')}
            value={r.patient_name ?? tx('result.patientNotOnRecord', 'Not on record')}
            divider
          />
          {!!r.patient_health_id && (
            <InfoRow
              icon="id-card"
              tint="purple"
              label={tx('result.healthId', 'Health ID')}
              value={r.patient_health_id}
              divider
            />
          )}
          <InfoRow
            icon="flask"
            tint="green"
            label={tx('result.test', 'Test')}
            value={r.result?.test_name ?? categoryLabel(r.category)}
            divider
          />
          <InfoRow
            icon="clock"
            tint="amber"
            label={tx('result.reported', 'Reported')}
            value={fmtReported(r.reported_at)}
          />
        </Card>

        {!!r.patient_id && (
          <CareButton
            label={tx('appointment.openChart', 'Open Patient Chart')}
            icon="person"
            iconRight="chevron-right"
            variant="secondary"
            onPress={() => router.push(doctorRoutes.patient(r.patient_id as string))}
          />
        )}

        {r.result?.kind === 'lab' && (
          <>
            <SectionHeader title={tx('result.values', 'Values')} />
            <Card variant="flush">
              {analytes.length === 0 ? (
                <Text style={styles.none}>
                  {tx(
                    'result.noValues',
                    'The laboratory has not released individual values for this order.'
                  )}
                </Text>
              ) : (
                analytes.map((a, i) => (
                  <AnalyteRow
                    key={a.id ?? `${a.analyte}-${i}`}
                    analyte={a}
                    divider={i < analytes.length - 1}
                    styles={styles}
                    valueColor={statusMap[toneForFlag(a.flag)].fg}
                    tx={tx}
                  />
                ))
              )}
            </Card>
            <Text style={styles.caption}>
              {tx(
                'result.valuesCaption',
                'Values, flags and reference intervals are shown exactly as the laboratory released them. Where no interval was recorded, none is shown.'
              )}
            </Text>
          </>
        )}

        {r.result?.kind === 'radiology' && (
          <>
            <SectionHeader title={tx('result.report', 'Report')} />
            <Card>
              <SummaryLine
                label={tx('result.reportNumber', 'Report')}
                value={r.result.report_number ?? '—'}
              />
              <SummaryLine
                label={tx('result.reportStatus', 'Status')}
                value={r.result.report_status ?? '—'}
              />
              <SummaryLine
                label={tx('result.radiologist', 'Radiologist')}
                value={r.result.reported_by_name ?? '—'}
              />
              {(
                [
                  ['technique', 'Technique', r.result.technique],
                  ['findings', 'Findings', r.result.findings],
                  ['impression', 'Impression', r.result.impression],
                  ['recommendation', 'Recommendation', r.result.recommendation],
                ] as const
              ).map(([key, fallback, text]) =>
                text ? (
                  <View key={key}>
                    <View style={styles.divider} />
                    <Text style={styles.blockLabel}>{tx(`result.${key}`, fallback)}</Text>
                    <Text style={styles.blockText}>{text}</Text>
                  </View>
                ) : null
              )}
            </Card>
          </>
        )}

        {r.result === null && (
          <NoticeBanner
            icon="info"
            tone="pending"
            title={tx('result.noDetailTitle', 'Detail not available on this device')}
            message={tx(
              'result.noDetailBody',
              'The underlying record could not be loaded for this notification. What is shown above is the notification as it was raised — open the patient’s chart on a workstation for the full report.'
            )}
          />
        )}

        {acked ? (
          <Card style={styles.ackedCard}>
            <View style={styles.ackedRow}>
              <Icon name="check-circle" size={20} color={colors.statusNormal} />
              <Text style={styles.ackedText}>
                {tx('result.ackedBy', 'Acknowledged by {{name}} — {{when}}.', {
                  name: r.acknowledged_by_name ?? tx('result.ackedByUnknown', 'a clinician'),
                  when: fmtReported(r.acknowledged_at),
                })}
              </Text>
            </View>
            <Text style={styles.caption}>
              {tx(
                'result.ackedCaption',
                'This is the same acknowledgement the desktop results inbox shows.'
              )}
            </Text>
          </Card>
        ) : (
          <>
            <CareButton
              label={
                r.is_critical
                  ? tx('result.ackCritical', 'Acknowledge Critical Result')
                  : tx('result.ack', 'Acknowledge Result')
              }
              icon="check-circle"
              variant={r.is_critical ? 'dangerSolid' : 'primary'}
              loading={acknowledge.isPending}
              onPress={() => askToAcknowledge(r)}
            />
            <Text style={styles.caption}>
              {tx(
                'result.ackCaption',
                'Acknowledging records your name and the time against this result on the hospital record. You will be asked to confirm.'
              )}
            </Text>
          </>
        )}
      </>
    );
  } else {
    body = <LoadingBlock label={tx('result.loading', 'Loading this result…')} />;
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={tx('result.title', 'Result')} align="center" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={detail.isFetching && !detail.isPending}
            onRefresh={() => void refetch()}
            tintColor={colors.blue}
          />
        }
      >
        {stale}
        {body}
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

/**
 * One analyte. The flag is the laboratory's own (`flag`), mapped to a tone by
 * `toneForFlag` — this row classifies nothing itself.
 */
function AnalyteRow({
  analyte,
  divider,
  styles,
  valueColor,
  tx,
}: {
  analyte: InboxAnalyte;
  divider: boolean;
  styles: ReturnType<typeof makeStyles>;
  valueColor: string;
  tx: (key: string, defaultValue: string, params?: Record<string, unknown>) => string;
}) {
  const tone = toneForFlag(analyte.flag);
  return (
    <View style={[styles.analyte, divider && styles.analyteDivider]}>
      <View style={styles.analyteHead}>
        <Text style={styles.analyteName}>{analyte.analyte}</Text>
        {analyte.flag ? (
          <StatusBadge status={analyte.flag} tone={tone} size="sm" />
        ) : (
          <Text style={styles.analyteNoFlag}>{tx('result.noFlag', 'No flag recorded')}</Text>
        )}
      </View>
      <Text style={[styles.analyteValue, { color: valueColor }]}>
        {analyte.value ?? '—'}
        {analyte.unit ? <Text style={styles.analyteUnit}>{` ${analyte.unit}`}</Text> : null}
      </Text>
      <Text style={styles.analyteRef}>
        {analyte.reference
          ? tx('result.reference', 'Reference {{range}}', { range: analyte.reference })
          : tx('result.noReference', 'No reference interval recorded by the laboratory')}
      </Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },

    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    title: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: colors.textPrimary,
    },
    body: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },

    blockLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textMuted,
      marginBottom: 2,
    },
    blockText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },

    analyte: { padding: spacing.md - 2, gap: 2 },
    analyteDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    analyteHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    analyteName: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    analyteNoFlag: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    analyteValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
    },
    analyteUnit: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    analyteRef: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    none: {
      padding: spacing.md,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    caption: {
      paddingHorizontal: spacing.xs,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    ackedCard: { gap: spacing.sm },
    ackedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    ackedText: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
  });
