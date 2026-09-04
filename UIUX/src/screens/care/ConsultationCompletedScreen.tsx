/**
 * CARE-018 — Consultation Completed.
 *
 * The whole screen is the persisted session record: the clinician's summary,
 * diagnosis (with its ICD-10 code), recommendations and follow-up interval,
 * plus live counts of the prescriptions and documents attached to the visit's
 * encounter. The star rating writes back through `…/telemedicine/rate`.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchTelemedicineSession, rateTelemedicine, type TelemedicineSession } from '../../api';
import { Card, Icon, IconName, ScreenHeader, SectionHeader, useDialog } from '../../components';
import { useTranslation } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, statusMap, typography } from '../../theme/theme';
import { formatDateLong, formatTime } from '../../utils/format';
import { AsyncBoundary, CareButton, ProviderAvatar, useAsync } from './shared';

export function ConsultationCompletedScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'ConsultationCompleted'>>();
  const appointmentId = params.appointmentId;

  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const dialog = useDialog();
  const savingRef = useRef(false);

  const load = useCallback(() => fetchTelemedicineSession(appointmentId), [appointmentId]);
  const state = useAsync<TelemedicineSession>(load, [appointmentId]);
  const { setData } = state;

  async function rate(stars: number) {
    if (savingRef.current) return;
    savingRef.current = true;
    setRating(stars);
    setSaving(true);
    try {
      setData(await rateTelemedicine(appointmentId, stars));
    } catch (e) {
      dialog.show({
        title: t('care.consultDone.rateFailTitle'),
        tone: 'critical',
        cancelLabel: 'OK',
        message: writeFailureMessage(
          e,
          t('care.consultDone.rateFailHint'),
          t('care.consultDone.rateFailFallback')
        ),
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={t('care.consultDone.title')}
        subtitle={t('care.consultDone.subtitle')}
      />

      <ScrollView contentContainerStyle={s.body}>
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('care.consultDone.loading')}
        >
          {(sess) => {
            const a = sess.appointment;
            const stars = rating || sess.patient_rating || 0;
            const minutes = Math.max(1, Math.round((sess.duration_seconds || 0) / 60));
            return (
              <>
                {/* Confirmation */}
                <View style={s.done}>
                  <View style={s.doneIcon}>
                    <Icon name="check" size={26} color={colors.textOnBrand} strokeWidth={2.4} />
                  </View>
                  <View style={s.doneBody}>
                    <Text style={s.doneTitle}>{t('care.consultDone.doneTitle')}</Text>
                    <Text style={s.doneText}>
                      {t('care.consultDone.doneText', { count: minutes })}
                    </Text>
                  </View>
                </View>

                {/* Summary card */}
                <Card variant="flush" style={s.summaryCard}>
                  <View style={s.summaryHead}>
                    <Icon name="calendar" size={20} color={colors.textOnBrand} />
                    <Text style={s.summaryHeadText}>{t('care.consultDone.summaryHead')}</Text>
                  </View>

                  <View style={s.summaryTop}>
                    <ProviderAvatar
                      name={a.provider_name ?? t('care.consultDone.avatarFallback')}
                      size={72}
                    />
                    <View style={s.summaryWho}>
                      <Text style={s.summaryName} numberOfLines={1}>
                        {a.provider_name ?? t('care.consultDone.providerFallback')}
                      </Text>
                      <Text style={s.summarySpecialty} numberOfLines={1}>
                        {a.provider_specialty ?? t('care.consultDone.specialtyFallback')}
                      </Text>
                      <View style={s.line}>
                        <Icon name="building" size={14} color={colors.textSecondary} />
                        <Text style={s.lineText} numberOfLines={1}>
                          {a.facility_name ?? t('care.consultDone.facilityFallback')}
                        </Text>
                      </View>
                      <View style={s.line}>
                        <Icon name="video" size={14} color={colors.textSecondary} />
                        <Text style={s.lineText}>{t('care.consultDone.telemedicineConsultation')}</Text>
                      </View>
                    </View>
                    <View style={s.completedPill}>
                      <Icon name="check-circle" size={16} color={statusMap.normal.fg} />
                      <Text style={s.completedText}>{t('care.consultDone.completed')}</Text>
                    </View>
                  </View>

                  <View style={s.whenRow}>
                    <View style={s.line}>
                      <Icon name="calendar" size={16} color={colors.blue} />
                      <Text style={s.whenText}>{formatDateLong(a.scheduled_at)}</Text>
                    </View>
                    <View style={s.line}>
                      <Icon name="clock" size={16} color={colors.blue} />
                      <Text style={s.whenText}>
                        {formatTime(a.scheduled_at)} · {t('care.consultDone.minutes', { count: minutes })}
                      </Text>
                    </View>
                  </View>

                  <View style={s.factRow}>
                    <Fact
                      icon="document-text"
                      label={t('care.consultDone.labelReason')}
                      value={a.reason ?? t('care.consultDone.reasonFallback')}
                    />
                    <Fact
                      icon="stethoscope"
                      label={t('care.consultDone.labelDiagnosis')}
                      value={sess.diagnosis ?? t('common.notRecorded')}
                      code={sess.diagnosis_code}
                      divider
                    />
                    <Fact
                      icon="person"
                      label={t('care.consultDone.labelConsultType')}
                      value={t('care.consultDone.consultTypeValue')}
                      divider
                    />
                  </View>
                </Card>

                {/* Clinician's note */}
                {!!sess.summary && (
                  <Card style={s.noteCard}>
                    <Text style={s.noteTitle}>{t('care.consultDone.clinicalSummary')}</Text>
                    <Text style={s.noteText}>{sess.summary}</Text>
                  </Card>
                )}

                {/* Treatment & plan */}
                <SectionHeader title={t('care.consultDone.treatmentPlan')} variant="overline" />
                <Card variant="flush">
                  <PlanRow
                    icon="pill"
                    title={t('care.consultDone.prescriptions')}
                    subtitle={
                      sess.prescription_count === 0
                        ? t('care.consultDone.noPrescription')
                        : t('care.consultDone.newPrescriptions', { count: sess.prescription_count })
                    }
                    actionLabel={t('care.consultDone.viewPrescription')}
                    onPress={() => navigation.navigate('Medications')}
                    disabled={sess.prescription_count === 0}
                    divider
                  />
                  <PlanRow
                    icon="list"
                    title={t('care.consultDone.recommendations')}
                    subtitle={t('care.consultDone.recommendationsCount', {
                      count: sess.recommendations.length,
                    })}
                    actionLabel={t('care.consultDone.viewDetails')}
                    onPress={() =>
                      dialog.show({
                        title: t('care.consultDone.recommendations'),
                        tone: 'info',
                        cancelLabel: t('common.close'),
                        message: sess.recommendations.length
                          ? sess.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n\n')
                          : t('care.consultDone.noRecommendations'),
                      })
                    }
                    divider
                  />
                  <PlanRow
                    icon="calendar-plus"
                    title={t('care.consultDone.followUp')}
                    subtitle={
                      sess.follow_up_weeks
                        ? t('care.consultDone.followUpIn', { count: sess.follow_up_weeks })
                        : t('care.consultDone.noFollowUp')
                    }
                    actionLabel={t('care.consultDone.scheduleNow')}
                    onPress={() => navigation.navigate('FindProvider', {})}
                  />
                  <View style={s.important}>
                    <Icon name="info" size={20} color={colors.link} />
                    <View style={s.importantBody}>
                      <Text style={s.importantTitle}>{t('care.consultDone.important')}</Text>
                      <Text style={s.importantText}>{t('care.consultDone.importantText')}</Text>
                    </View>
                  </View>
                </Card>

                {/* Documents */}
                <SectionHeader title={t('care.consultDone.documentsSection')} variant="overline" />
                <Text style={s.docsLead}>{t('care.consultDone.docsLead')}</Text>
                <View style={s.docTiles}>
                  <DocTile
                    icon="document-text"
                    title={t('care.consultDone.docNote')}
                    subtitle={t('care.consultDone.docNoteSub')}
                    onPress={() => navigation.navigate('MainTabs', { screen: 'HealthTab', params: { screen: 'Documents' } })}
                  />
                  <DocTile
                    icon="paperclip"
                    title={t('care.consultDone.docShared')}
                    subtitle={t('care.consultDone.files', { count: sess.document_count })}
                    onPress={() => navigation.navigate('MainTabs', { screen: 'HealthTab', params: { screen: 'Documents' } })}
                  />
                  <DocTile
                    icon="folder"
                    title={t('care.consultDone.docAll')}
                    subtitle={t('care.consultDone.docAllSub')}
                    onPress={() => navigation.navigate('MainTabs', { screen: 'HealthTab', params: { screen: 'Documents' } })}
                  />
                </View>

                {/* Rating */}
                <SectionHeader title={t('care.consultDone.rateSection')} variant="overline" />
                <Card style={s.rateCard}>
                  <Text style={s.rateLead}>{t('care.consultDone.rateLead')}</Text>
                  <View style={s.rateRow}>
                    <View style={s.starsRow}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <TouchableOpacity
                          key={n}
                          onPress={() => rate(n)}
                          disabled={saving}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel={t('care.consultDone.rateStarA11y', { stars: n })}
                        >
                          <Icon
                            name="star"
                            size={30}
                            color={n <= stars ? colors.statusWarning : colors.blueLight}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={s.rateNote}>
                      {sess.patient_rating
                        ? t('care.consultDone.rateThanks')
                        : t('care.consultDone.rateHelp')}
                    </Text>
                  </View>
                </Card>

                <View style={s.cta}>
                  <CareButton
                    label={t('care.consultDone.backToAppointments')}
                    icon="chevron-left"
                    variant="secondary"
                    onPress={() => navigation.navigate('AppointmentList', {})}
                    style={s.ctaHalf}
                  />
                  <CareButton
                    label={t('care.consultDone.viewInRecord')}
                    icon="folder"
                    onPress={() => navigation.navigate('MainTabs', { screen: 'HealthTab', params: { screen: 'RecordsHub' } })}
                    style={s.ctaHalf}
                  />
                </View>
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>

      {dialog.element}
    </View>
  );
}

function Fact({
  icon,
  label,
  value,
  code,
  divider,
}: {
  icon: IconName;
  label: string;
  value: string;
  code?: string | null;
  divider?: boolean;
}) {
  return (
    <View style={[s.fact, divider && s.factDivider]}>
      <View style={s.factHead}>
        <Icon name={icon} size={18} color={colors.blue} />
        <Text style={s.factLabel}>{label}</Text>
      </View>
      <Text style={s.factValue}>{value}</Text>
      {!!code && (
        <View style={s.codeChip}>
          <Text style={s.codeText}>{code}</Text>
        </View>
      )}
    </View>
  );
}

function PlanRow({
  icon,
  title,
  subtitle,
  actionLabel,
  onPress,
  disabled,
  divider,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  actionLabel: string;
  onPress: () => void;
  disabled?: boolean;
  divider?: boolean;
}) {
  return (
    <View style={[s.planRow, divider && s.planDivider]}>
      <Icon name={icon} size={24} color={colors.blue} />
      <View style={s.planBody}>
        <Text style={s.planTitle}>{title}</Text>
        <Text style={s.planSub}>{subtitle}</Text>
      </View>
      <TouchableOpacity
        style={[s.planAction, disabled && s.planActionOff]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Text style={s.planActionText}>{actionLabel}</Text>
        <Icon name="chevron-right" size={16} color={colors.link} />
      </TouchableOpacity>
    </View>
  );
}

function DocTile({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.docTile} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <Icon name={icon} size={22} color={colors.blue} />
      <Text style={s.docTitle} numberOfLines={2}>
        {title}
      </Text>
      <Text style={s.docSub} numberOfLines={1}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: statusMap.normal.bg,
  },
  doneIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: statusMap.normal.fg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBody: { flex: 1, gap: 3 },
  doneTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: statusMap.normal.fg },
  doneText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: statusMap.normal.fg,
  },

  summaryCard: { overflow: 'hidden' },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.blue,
  },
  summaryHeadText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    letterSpacing: 0.8,
    color: colors.textOnBrand,
  },
  summaryTop: { flexDirection: 'row', gap: spacing.md - 4, padding: spacing.md },
  summaryWho: { flex: 1, minWidth: 0, gap: 3 },
  summaryName: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.lg, color: colors.textPrimary },
  summarySpecialty: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineText: { flex: 1, fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },
  completedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: statusMap.normal.bg,
  },
  completedText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: statusMap.normal.fg },

  whenRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md, flexWrap: 'wrap' },
  whenText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.textPrimary },

  factRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.divider },
  fact: { flex: 1, padding: spacing.md - 4, gap: 4 },
  factDivider: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  factHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.textPrimary },
  factValue: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  codeChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: colors.divider,
  },
  codeText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.textSecondary },

  noteCard: { gap: spacing.sm },
  noteTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
  noteText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.md,
    color: colors.textSecondary,
  },

  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4, padding: spacing.md },
  planDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  planBody: { flex: 1, minWidth: 0, gap: 2 },
  planTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
  planSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },
  planAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planActionOff: { opacity: 0.45 },
  planActionText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.link },

  important: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    margin: spacing.sm,
    padding: spacing.md - 4,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  importantBody: { flex: 1, gap: 2 },
  importantTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.textPrimary },
  importantText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  docsLead: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
  },
  docTiles: { flexDirection: 'row', gap: spacing.sm },
  docTile: {
    flex: 1,
    gap: 4,
    padding: spacing.md - 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  docTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: colors.textPrimary },
  docSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },

  rateCard: { gap: spacing.md },
  rateLead: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  starsRow: { flexDirection: 'row', gap: spacing.sm },
  rateNote: { flex: 1, minWidth: 140, fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },

  cta: { flexDirection: 'row', gap: spacing.sm },
  ctaHalf: { flex: 1 },
});
