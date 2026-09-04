/**
 * CARE-014 — Appointment Check-in.
 *
 * "Start Check-in" calls `POST /patient/appointments/{id}/check-in` for real.
 * The server flips the appointment to `arrived` and creates the clinic-queue
 * entry that CARE-015 then polls, so the position shown next is genuine.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { checkInAppointment, fetchAppointment, type PortalAppointment } from '../../api';
import { Card, Icon, IconName, ScreenHeader } from '../../components';
import { useTranslation, type TFunction } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { typeLabelOf, visitModeLabelOf } from './apptLabels';
import {
  AsyncBoundary,
  CareButton,
  fmtDateLong,
  fmtDuration,
  fmtTime,
  ProviderAvatar,
  useAsync,
} from './shared';

function endTime(a: PortalAppointment): string {
  return fmtTime(new Date(new Date(a.scheduled_at).getTime() + a.duration_minutes * 60_000).toISOString());
}

type Step = { title: string; description: string; state: 'done' | 'current' | 'todo' };

/** The four steps, with their state derived from the appointment itself. */
function stepsFor(t: TFunction, a: PortalAppointment): Step[] {
  const arrived = a.checked_in_at !== null;
  return [
    {
      title: t('care.checkIn.step1Title'),
      description: t('care.checkIn.step1Desc'),
      state: 'done',
    },
    {
      title: t('care.checkIn.step2Title'),
      description: t('care.checkIn.step2Desc'),
      state: arrived ? 'done' : 'current',
    },
    {
      title: t('care.checkIn.step3Title'),
      description: t('care.checkIn.step3Desc'),
      state: arrived ? 'done' : 'todo',
    },
    {
      title: t('care.checkIn.step4Title'),
      description: t('care.checkIn.step4Desc'),
      state: arrived ? 'done' : 'todo',
    },
  ];
}

function FactColumn({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <View style={styles.factHead}>
        <Icon name={icon} size={18} color={colors.blue} />
        <Text style={styles.factLabel} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function StepRow({ step, index, last }: { step: Step; index: number; last: boolean }) {
  const active = step.state !== 'todo';
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepRail}>
        <View style={[styles.stepBubble, active ? styles.stepBubbleOn : styles.stepBubbleOff]}>
          <Text style={[styles.stepNumber, active ? styles.stepNumberOn : styles.stepNumberOff]}>{index + 1}</Text>
        </View>
        {!last && <View style={styles.stepConnector} />}
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{step.title}</Text>
        <Text style={styles.stepDescription}>{step.description}</Text>
      </View>
      {step.state === 'done' ? (
        <View style={styles.stepDone}>
          <Icon name="check" size={14} color={colors.textOnBrand} />
        </View>
      ) : (
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      )}
    </View>
  );
}

export function AppointmentCheckInScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'AppointmentCheckIn'>>();
  const id = params.appointmentId;

  const state = useAsync<PortalAppointment>(() => fetchAppointment(id), [id]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const busyRef = useRef(false);

  const startCheckIn = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await checkInAppointment(id);
      navigation.replace('WaitingRoom', { appointmentId: id });
    } catch (e) {
      setProblem(writeFailureMessage(e, t('care.checkIn.checkHint'), t('care.checkIn.failFallback')));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('care.checkIn.title')}
        subtitle={t('care.checkIn.subtitle')}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('care.checkIn.loading')}
        >
          {(a) => {
            const arrived = a.checked_in_at !== null;
            return (
              <>
                <View style={styles.banner}>
                  <View style={styles.bannerMark}>
                    <Icon name="check" size={18} color={colors.textOnBrand} />
                  </View>
                  <View style={styles.bannerBody}>
                    <Text style={styles.bannerTitle}>
                      {arrived ? t('care.checkIn.bannerCheckedInTitle') : t('care.checkIn.bannerAlmostTitle')}
                    </Text>
                    <Text style={styles.bannerText}>
                      {arrived
                        ? t('care.checkIn.bannerCheckedInText')
                        : t('care.checkIn.bannerAlmostText')}
                    </Text>
                  </View>
                </View>

                <Card variant="flush">
                  <View style={styles.cardHead}>
                    <Icon name="calendar" size={22} color={colors.blue} />
                    <Text style={styles.cardTitle}>{t('care.checkIn.todaysAppointment')}</Text>
                  </View>

                  <View style={styles.providerRow}>
                    <ProviderAvatar name={a.provider_name ?? t('care.checkIn.avatarFallback')} size={72} />
                    <View style={styles.providerBody}>
                      <Text style={styles.providerName}>{a.provider_name ?? t('care.checkIn.careTeam')}</Text>
                      <Text style={styles.providerSpecialty}>
                        {a.provider_specialty ?? typeLabelOf(t, a.appointment_type)}
                      </Text>
                      <View style={styles.providerMeta}>
                        <Icon name="building" size={16} color={colors.blue} />
                        <Text style={styles.providerMetaText} numberOfLines={1}>
                          {a.facility_name ?? t('care.appt.facilityTbd')}
                        </Text>
                      </View>
                      {!!a.location && (
                        <View style={styles.providerMeta}>
                          <Icon name="location" size={16} color={colors.blue} />
                          <Text style={styles.providerMetaText} numberOfLines={1}>
                            {a.location}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.factRow}>
                    <FactColumn icon="calendar" label={t('care.checkIn.labelDate')} value={fmtDateLong(a.scheduled_at)} />
                    <View style={styles.factDivider} />
                    <FactColumn
                      icon="clock"
                      label={t('care.checkIn.labelTime')}
                      value={`${fmtTime(a.scheduled_at)} – ${endTime(a)}\n(${fmtDuration(a.duration_minutes)})`}
                    />
                    <View style={styles.factDivider} />
                    <FactColumn
                      icon="person"
                      label={t('care.checkIn.labelType')}
                      value={visitModeLabelOf(t, a.visit_mode)}
                    />
                  </View>

                  <View style={styles.strip}>
                    <Icon name="info" size={18} color={colors.blue} />
                    <Text style={styles.stripText}>{t('care.checkIn.checkInEarly')}</Text>
                  </View>
                </Card>

                <Card variant="flush">
                  <View style={styles.cardHead}>
                    <Icon name="document-text" size={22} color={colors.blue} />
                    <Text style={styles.cardTitle}>{t('care.checkIn.stepsTitle')}</Text>
                  </View>
                  <View style={styles.steps}>
                    {stepsFor(t, a).map((step, i, all) => (
                      <StepRow key={step.title} step={step} index={i} last={i === all.length - 1} />
                    ))}
                  </View>
                </Card>

                <View style={styles.idCard}>
                  <View style={styles.idMark}>
                    <Icon name="id-card" size={24} color={colors.blue} />
                  </View>
                  <View style={styles.idBody}>
                    <Text style={styles.idTitle}>{t('care.checkIn.idTitle')}</Text>
                    <Text style={styles.idText}>{t('care.checkIn.idText')}</Text>
                  </View>
                </View>

                {!!problem && (
                  <View style={styles.errorStrip}>
                    <Icon name="alert-circle" size={18} color={colors.statusCritical} />
                    <Text style={styles.errorText}>{problem}</Text>
                  </View>
                )}

                {arrived ? (
                  <CareButton
                    label={t('care.checkIn.goWaitingRoom')}
                    icon="clock"
                    onPress={() => navigation.replace('WaitingRoom', { appointmentId: id })}
                  />
                ) : (
                  <CareButton
                    label={t('care.checkIn.startCheckIn')}
                    icon="qr"
                    onPress={startCheckIn}
                    loading={busy}
                    disabled={!a.can_check_in}
                  />
                )}
                <CareButton
                  label={t('care.checkIn.checkInLater')}
                  icon="calendar"
                  variant="secondary"
                  onPress={() => navigation.goBack()}
                />
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.statusNormalBg,
  },
  bannerMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.statusNormal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBody: { flex: 1, minWidth: 0, gap: 2 },
  bannerTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.statusNormal,
  },
  bannerText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm + 2,
  },
  cardTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },

  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 2,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  providerBody: { flex: 1, minWidth: 0, gap: 3 },
  providerName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  providerSpecialty: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  providerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  providerMetaText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },

  factRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.sm + 2,
  },
  factDivider: { width: 1, backgroundColor: colors.divider, marginVertical: 2 },
  fact: { flex: 1, paddingHorizontal: spacing.sm, gap: 4 },
  factHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  factLabel: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  factValue: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    margin: spacing.md,
    marginTop: 0,
    padding: spacing.sm + 4,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  stripText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  steps: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 4 },
  stepRail: { alignItems: 'center', alignSelf: 'stretch' },
  stepBubble: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepBubbleOn: { backgroundColor: colors.navy },
  stepBubbleOff: { backgroundColor: colors.surfaceMuted },
  stepNumber: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
  stepNumberOn: { color: colors.textOnBrand },
  stepNumberOff: { color: colors.textMuted },
  // Dashed rail between the step bubbles, as in the reference.
  stepConnector: {
    flex: 1,
    width: 0,
    marginVertical: 4,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  stepBody: { flex: 1, minWidth: 0, paddingBottom: spacing.md, gap: 2 },
  stepTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  stepDescription: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  stepDone: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginTop: 4,
    backgroundColor: colors.statusNormal,
    alignItems: 'center',
    justifyContent: 'center',
  },

  idCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md - 4,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  idMark: {
    width: 44,
    height: 44,
    borderRadius: radii.sm + 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idBody: { flex: 1, minWidth: 0, gap: 3 },
  idTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  idText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  errorStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 4,
    borderRadius: radii.sm,
    backgroundColor: colors.statusCriticalBg,
  },
  errorText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.statusCritical,
  },
});
