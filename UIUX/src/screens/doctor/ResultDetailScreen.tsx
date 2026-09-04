/**
 * Result detail + acknowledgement.
 *
 * The highest-stakes screen in the app, so its rules are explicit:
 *
 *  1. ACKNOWLEDGEMENT IS A CLINICAL ACT. Nothing here acknowledges as a side
 *     effect. Opening the screen does not. Only the button does, and only
 *     after a confirmation sheet that names the patient and the result.
 *  2. NEVER CLAIM SUCCESS WE CANNOT SEE. A failed acknowledgement is reported
 *     through `writeFailureMessage`, which says plainly when the outcome is
 *     unknown and where to check. The row is only shown as acknowledged when
 *     the server answered with an `acknowledged_at`.
 *  3. NEVER PRESENT STALE DATA AS CURRENT. `AsyncBoundary` renders the
 *     `StaleNotice` when a refresh failed over data already on screen.
 *  4. NEVER INVENT A THRESHOLD. Reference intervals and flags are printed as
 *     the laboratory recorded them; where there is none, the screen says so.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  acknowledgeResult,
  fetchResult,
  type InboxAnalyte,
  type InboxResultDetail,
} from '../../api';
import { Card, Icon, ScreenHeader, SectionHeader, StatusBadge, useDialog } from '../../components';
import { useTranslation } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import { colors, spacing, statusMap, typography } from '../../theme/theme';
import { AsyncBoundary, CareButton, InfoRow, NoticeBanner, SummaryLine, useAsync } from '../care/shared';
import { toneForFlag } from '../diagnostics/shared';
import { categoryLabel, fmtReported } from './shared';

/**
 * `resultId` is the id of the `app_notifications` row the inbox listed — the
 * same identifier the desktop inbox acknowledges against. The route declares
 * an optional `kind`; this screen does not need it, because the server tells
 * us what the notification points at.
 */
type Params = { ResultDetail: { resultId: string; kind?: 'lab' | 'imaging' } };

export function ResultDetailScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<Params, 'ResultDetail'>>();
  const { t } = useTranslation();
  const dialog = useDialog();

  const state = useAsync<InboxResultDetail>(
    useCallback(() => fetchResult(params.resultId), [params.resultId]),
    [params.resultId]
  );
  const { setData } = state;

  /**
   * The confirmation. It names the patient and the result in the question
   * itself, so an accidental tap cannot become an acknowledgement.
   */
  function askToAcknowledge(result: InboxResultDetail) {
    const patient = result.patient_name ?? t('doctor.result.confirmThisPatient');
    dialog.confirm({
      title: t(
        result.is_critical ? 'doctor.result.confirmCriticalTitle' : 'doctor.result.confirmTitle'
      ),
      // The patient, their number and the result are IN the question — an
      // accidental tap must not be able to become an acknowledgement.
      message: t('doctor.result.confirmMessage', {
        patient,
        number: result.patient_number ? ` (${result.patient_number})` : '',
        title: result.title,
      }),
      confirmLabel: t('doctor.result.confirmCta'),
      cancelLabel: t('doctor.result.confirmCancel'),
      tone: result.is_critical ? 'critical' : 'warning',
      destructive: result.is_critical,
      onConfirm: async () => {
        try {
          const updated = await acknowledgeResult(result.id);
          if (!updated.acknowledged_at) {
            // The server answered, but not with an acknowledgement. Do not
            // paint the screen as done on the strength of a 200 alone.
            dialog.alert(
              t('doctor.result.notAckedTitle'),
              t('doctor.result.notAckedBody'),
              'critical'
            );
            state.reload();
            return;
          }
          setData(updated);
          dialog.alert(
            t('doctor.result.doneTitle'),
            t('doctor.result.doneBody', {
              patient,
              when: fmtReported(updated.acknowledged_at),
              name: updated.acknowledged_by_name ?? t('doctor.result.doneNameYou'),
            }),
            'success'
          );
        } catch (e) {
          dialog.alert(
            t('doctor.result.failedTitle'),
            writeFailureMessage(e, t('doctor.result.failedHint')),
            'critical'
          );
          state.reload();
        }
      },
    });
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('doctor.result.title')} align="center" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.loading && state.data !== null}
            onRefresh={state.reload}
            tintColor={colors.blue}
          />
        }
      >
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('DoctorHome')}
          loadingLabel={t('doctor.result.loading')}
        >
          {(r) => {
            const acked = !!r.acknowledged_at;
            return (
              <>
                {r.is_critical && !acked && (
                  <NoticeBanner
                    icon="alert-triangle"
                    tone="critical"
                    title={t('doctor.result.criticalTitle')}
                    message={t('doctor.result.criticalBody')}
                  />
                )}

                <Card>
                  <View style={styles.titleRow}>
                    <Text style={styles.title}>{r.title}</Text>
                    <StatusBadge
                      status={t(
                        acked
                          ? 'doctor.result.badgeAcknowledged'
                          : r.is_critical
                            ? 'doctor.result.badgeCritical'
                            : 'doctor.result.badgeAwaiting'
                      )}
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
                    label={t('doctor.result.patient')}
                    value={r.patient_name ?? t('doctor.result.patientNotOnRecord')}
                    divider
                  />
                  {!!r.patient_number && (
                    <InfoRow
                      icon="id-card"
                      tint="purple"
                      label={t('doctor.result.medicalId')}
                      value={r.patient_number}
                      divider
                    />
                  )}
                  <InfoRow
                    icon="flask"
                    tint="green"
                    label={t('doctor.result.test')}
                    value={r.result?.test_name ?? categoryLabel(r.category)}
                    divider
                  />
                  <InfoRow
                    icon="clock"
                    tint="amber"
                    label={t('doctor.result.reported')}
                    value={fmtReported(r.reported_at)}
                  />
                </Card>

                {r.result?.kind === 'lab' && (
                  <>
                    <SectionHeader title={t('doctor.result.values')} />
                    <Card variant="flush">
                      {r.result.analytes.length === 0 ? (
                        <Text style={styles.none}>{t('doctor.result.noValues')}</Text>
                      ) : (
                        r.result.analytes.map((a, i) => (
                          <AnalyteRow
                            key={a.id}
                            analyte={a}
                            divider={i < (r.result?.analytes.length ?? 0) - 1}
                          />
                        ))
                      )}
                    </Card>
                    <Text style={styles.caption}>{t('doctor.result.valuesCaption')}</Text>
                  </>
                )}

                {r.result?.kind === 'radiology' && (
                  <>
                    <SectionHeader title={t('doctor.result.report')} />
                    <Card>
                      <SummaryLine
                        label={t('doctor.result.reportNumber')}
                        value={r.result.report_number ?? '—'}
                      />
                      <SummaryLine
                        label={t('doctor.result.reportStatus')}
                        value={r.result.report_status ?? '—'}
                      />
                      <SummaryLine
                        label={t('doctor.result.radiologist')}
                        value={r.result.reported_by_name ?? '—'}
                      />
                      {!!r.result.technique && (
                        <>
                          <View style={styles.divider} />
                          <Text style={styles.blockLabel}>{t('doctor.result.technique')}</Text>
                          <Text style={styles.blockText}>{r.result.technique}</Text>
                        </>
                      )}
                      {!!r.result.findings && (
                        <>
                          <View style={styles.divider} />
                          <Text style={styles.blockLabel}>{t('doctor.result.findings')}</Text>
                          <Text style={styles.blockText}>{r.result.findings}</Text>
                        </>
                      )}
                      {!!r.result.impression && (
                        <>
                          <View style={styles.divider} />
                          <Text style={styles.blockLabel}>{t('doctor.result.impression')}</Text>
                          <Text style={styles.blockText}>{r.result.impression}</Text>
                        </>
                      )}
                      {!!r.result.recommendation && (
                        <>
                          <View style={styles.divider} />
                          <Text style={styles.blockLabel}>{t('doctor.result.recommendation')}</Text>
                          <Text style={styles.blockText}>{r.result.recommendation}</Text>
                        </>
                      )}
                    </Card>
                  </>
                )}

                {r.result === null && (
                  <NoticeBanner
                    icon="info"
                    tone="pending"
                    title={t('doctor.result.noDetailTitle')}
                    message={t('doctor.result.noDetailBody')}
                  />
                )}

                {acked ? (
                  <Card style={styles.ackedCard}>
                    <View style={styles.ackedRow}>
                      <Icon name="check-circle" size={20} color={colors.statusNormal} />
                      <Text style={styles.ackedText}>
                        {t('doctor.result.ackedBy', {
                          name: r.acknowledged_by_name ?? t('doctor.result.ackedByUnknown'),
                          when: fmtReported(r.acknowledged_at),
                        })}
                      </Text>
                    </View>
                    <Text style={styles.caption}>{t('doctor.result.ackedCaption')}</Text>
                  </Card>
                ) : (
                  <>
                    <CareButton
                      label={t(r.is_critical ? 'doctor.result.ackCritical' : 'doctor.result.ack')}
                      icon="check-circle"
                      variant={r.is_critical ? 'dangerSolid' : 'primary'}
                      onPress={() => askToAcknowledge(r)}
                    />
                    <Text style={styles.caption}>{t('doctor.result.ackCaption')}</Text>
                  </>
                )}
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
      {dialog.element}
    </View>
  );
}

/**
 * One analyte. The flag is the laboratory's own (`flag`), mapped to a tone by
 * the diagnostics `toneForFlag` the patient screens already use — this screen
 * classifies nothing itself.
 */
function AnalyteRow({ analyte, divider }: { analyte: InboxAnalyte; divider: boolean }) {
  const { t } = useTranslation();
  const tone = analyte.flag ? toneForFlag(analyte.flag) : 'neutral';
  return (
    <View style={[styles.analyte, divider && styles.analyteDivider]}>
      <View style={styles.analyteHead}>
        <Text style={styles.analyteName}>{analyte.analyte}</Text>
        {analyte.flag ? (
          <StatusBadge status={analyte.flag} tone={tone} size="sm" />
        ) : (
          <Text style={styles.analyteNoFlag}>{t('doctor.result.noFlag')}</Text>
        )}
      </View>
      <Text style={[styles.analyteValue, { color: statusMap[tone].fg }]}>
        {analyte.value ?? '—'}
        {analyte.unit ? <Text style={styles.analyteUnit}>{` ${analyte.unit}`}</Text> : null}
      </Text>
      <Text style={styles.analyteRef}>
        {analyte.reference
          ? t('doctor.result.reference', { range: analyte.reference })
          : t('doctor.result.noReference')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },

  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
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
  analyteHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
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
