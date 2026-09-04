/**
 * DIA-013 — Add Imaging to Health Record.
 *
 * A confirmation sheet over the study detail. `GET /patient/imaging/{id}/health-record`
 * states exactly what would be filed — the study, the radiologist report when
 * one has been issued, and the image series with its real instance count — and
 * the POST performs the write.
 *
 * The write is idempotent on the server (`radiology_orders.saved_to_record_at`
 * is set once), so a study already in the record opens in its saved state
 * rather than offering to file it twice.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  fetchImagingHealthRecord,
  saveImagingToHealthRecord,
  type HealthRecordComponent,
  type ImagingHealthRecordState,
} from '../../api/imaging';
import { Icon, ScreenHeader, StatusBadge } from '../../components';
import { a11yJoin } from '../../components/a11y';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  fmtDate,
  fmtDateTime,
  fmtTime,
  statusLabel,
  statusTone,
  TechnicalDetails,
} from './detailShared';
import { AsyncBoundary, DiagButton, errorMessage, useAsync } from '../diagnostics/shared';

/** A "what will be saved" line. Excluded components read muted, not hidden. */
function ComponentRow({ component }: { component: HealthRecordComponent }) {
  const on = component.included;
  return (
    <View style={styles.componentRow}>
      <View style={[styles.check, !on && styles.checkOff]}>
        <Icon
          name={on ? 'check' : 'minus'}
          size={13}
          color={colors.textOnBrand}
          strokeWidth={2.6}
        />
      </View>
      <View style={styles.componentBody}>
        <Text style={[styles.componentTitle, !on && styles.componentTitleOff]}>
          {component.title}
        </Text>
        <Text style={styles.componentSub}>{component.subtitle}</Text>
      </View>
    </View>
  );
}

export function AddImagingToHealthRecordScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'AddImagingToHealthRecord'>>();
  const studyId = params.studyId;

  const state = useAsync<ImagingHealthRecordState>(
    () => fetchImagingHealthRecord(studyId),
    [studyId]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      state.setData(await saveImagingToHealthRecord(studyId));
    } catch (e) {
      setError(errorMessage(e, t('imaging.addToRecord.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.addToRecord.title')}
        align="center"
        actions={[{ icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications') }]}
      />

      <AsyncBoundary
        state={state}
        onLink={() => navigation.navigate('MyHealthId')}
        loadingLabel={t('imaging.addToRecord.loading')}
      >
        {(rec) => {
          const study = rec.study;

          return (
            <ScrollView contentContainerStyle={styles.content}>
              {/* ── Context behind the sheet ─────────────────────────── */}
              <View style={styles.contextCard}>
                <View style={styles.contextHead}>
                  <Text style={styles.contextName}>{study.study_name}</Text>
                  <StatusBadge
                    status={statusLabel(t, study.status as never)}
                    tone={statusTone(study.status as never)}
                  />
                </View>
                <Text style={styles.contextMeta}>
                  {t('imaging.addToRecord.contextMeta', {
                    status: statusLabel(t, study.status as never),
                  })}
                </Text>

                <View style={styles.plate}>
                  <Text style={styles.plateView}>
                    {(study.view_label ?? study.body_part).toUpperCase()}
                  </Text>
                  <Text style={styles.plateLine}>{study.study_name}</Text>
                  <Text style={styles.plateLine}>
                    {fmtDate(study.studied_at)} •{' '}
                    {study.facility_name ?? t('imaging.common.facilityFallback')}
                  </Text>
                </View>
              </View>

              {/* ── Sheet ────────────────────────────────────────────── */}
              <View style={styles.sheet}>
                <View style={styles.grabber} />

                <View style={styles.sheetHead}>
                  <View style={styles.sheetHeadBody}>
                    <Text style={styles.sheetTitle}>{t('imaging.addToRecord.sheetTitle')}</Text>
                    <Text style={styles.sheetSub}>{t('imaging.addToRecord.sheetSub')}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.close}
                    accessibilityRole="button"
                    accessibilityLabel={t('imaging.addToRecord.close')}
                  >
                    <Icon name="close" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Study summary */}
                <View style={styles.summary}>
                  <Text style={styles.summaryOverline}>
                    {t('imaging.addToRecord.summaryOverline')}
                  </Text>
                  <Text style={styles.summaryName}>{study.study_name}</Text>
                  <Text style={styles.summaryMeta}>
                    {fmtDate(rec.scheduled_at)} • {fmtTime(rec.scheduled_at)}
                  </Text>
                  <TechnicalDetails
                    facts={[
                      { label: t('imaging.tech.studyUid'), value: study.study_uid },
                      { label: t('imaging.tech.accessionNumber'), value: study.accession_number },
                    ]}
                  />
                </View>

                {/* What will be saved */}
                <Text style={styles.overline}>{t('imaging.addToRecord.whatWillBeSaved')}</Text>
                <View style={styles.componentList}>
                  {rec.components.map((c) => (
                    <ComponentRow key={c.key} component={c} />
                  ))}
                </View>

                {/* Destination */}
                <Text style={styles.overline}>{t('imaging.addToRecord.destination')}</Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('ImagingResults')}
                  style={styles.destination}
                  accessibilityRole="button"
                  accessibilityLabel={a11yJoin(rec.destination.title, rec.destination.subtitle)}
                >
                  <View style={styles.destinationBody}>
                    <Text style={styles.destinationTitle}>{rec.destination.title}</Text>
                    <Text style={styles.destinationSub}>{rec.destination.subtitle}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.link} />
                </TouchableOpacity>

                {/* Provenance note */}
                <View style={styles.noteCard}>
                  <Icon name="shield-check" size={20} color={colors.blue} />
                  <View style={styles.noteBody}>
                    <Text style={styles.noteTitle}>{t('imaging.addToRecord.noteTitle')}</Text>
                    <Text style={styles.noteText}>{t('imaging.addToRecord.noteBody')}</Text>
                  </View>
                </View>

                {!!error && <Text style={styles.error}>{error}</Text>}

                {/* Actions */}
                {rec.is_saved ? (
                  <>
                    <View style={styles.savedBar}>
                      <Icon name="check-circle" size={20} color={colors.statusNormal} />
                      <Text style={styles.savedText}>
                        {t('imaging.addToRecord.savedOn', { when: fmtDateTime(rec.saved_at) })}
                      </Text>
                    </View>
                    <DiagButton
                      label={t('imaging.addToRecord.viewInRecord')}
                      icon="folder"
                      variant="secondary"
                      onPress={() => navigation.navigate('ImagingResults')}
                    />
                  </>
                ) : (
                  <View style={styles.actions}>
                    <DiagButton
                      label={t('imaging.addToRecord.cancel')}
                      variant="secondary"
                      onPress={() => navigation.goBack()}
                      style={styles.actionCancel}
                    />
                    <DiagButton
                      label={busy ? t('imaging.addToRecord.saving') : t('imaging.addToRecord.saveCta')}
                      icon="folder-plus"
                      variant="primary"
                      disabled={busy}
                      onPress={save}
                      style={styles.actionSave}
                    />
                  </View>
                )}
              </View>
            </ScrollView>
          );
        }}
      </AsyncBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },

  contextCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: 4,
  },
  contextHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  contextName: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  contextMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  plate: {
    marginTop: spacing.sm,
    backgroundColor: colors.navy,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 4,
  },
  plateView: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    letterSpacing: 0.6,
    color: colors.textOnBrand,
  },
  plateLine: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textOnBrand,
    opacity: 0.75,
  },

  sheet: {
    marginTop: spacing.md,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  grabber: {
    alignSelf: 'center',
    width: 56,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.divider,
    marginBottom: spacing.sm,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sheetHeadBody: { flex: 1, gap: 2 },
  sheetTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
  },
  sheetSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },

  summary: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 2,
  },
  summaryOverline: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
    marginBottom: 2,
  },
  summaryName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  summaryMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  overline: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    color: colors.link,
    marginTop: spacing.sm,
  },

  componentList: { gap: spacing.md },
  componentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  check: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkOff: { backgroundColor: colors.textMuted },
  componentBody: { flex: 1, gap: 2 },
  componentTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  componentTitleOff: { color: colors.textMuted },
  componentSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  destination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  destinationBody: { flex: 1, gap: 2 },
  destinationTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  destinationSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  noteBody: { flex: 1, gap: 2 },
  noteTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  noteText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  error: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.statusCritical,
  },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  actionCancel: { flex: 1 },
  actionSave: { flex: 2 },

  savedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.statusNormalBg,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  savedText: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.statusNormal,
  },
});
