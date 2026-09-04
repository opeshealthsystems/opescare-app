/**
 * CARE-013 — Cancellation Confirmation.
 *
 * `POST /patient/appointments/{id}/cancel { reason? }`. The API frees the held
 * slot; on success this screen re-renders from the cancelled appointment the
 * API returned, so the status pill and cancel reason are the stored ones.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  cancelAppointment,
  fetchAppointment,
  NotLinkedError,
  PortalConflictError,
  ValidationError,
  type PortalAppointment,
} from '../../api';
import { Card, EmptyState, Icon, IconName, ScreenHeader } from '../../components';
import { useTranslation } from '../../i18n';
import { describeFailure, writeFailureMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { typeLabelOf } from './apptLabels';
import {
  AsyncBoundary,
  CareButton,
  fmtDateLong,
  fmtDuration,
  fmtTime,
  NoticeBanner,
  ProviderAvatar,
  StatusPill,
  useAsync,
} from './shared';

const REASON_MAX = 250;

/**
 * Preset cancellation reasons are sent as a STABLE CODE, never as English
 * prose — the old build sent "I can no longer make this time" and the desktop
 * record then read « Motif : I can no longer make this time » to a French
 * clinician. The last entry is free text: the patient's own words are sent as
 * typed. `labelKey` is the catalog key for display in the app; `cancelReasonLabel`
 * below maps a stored code back to that label so the app renders it in the
 * reader's language without a backend change.
 */
const REASONS: { code: string; labelKey: string }[] = [
  { code: 'no_longer_available', labelKey: 'care.cancel.reasonNoLongerAvailable' },
  { code: 'feeling_better', labelKey: 'care.cancel.reasonFeelingBetter' },
  { code: 'found_another_provider', labelKey: 'care.cancel.reasonFoundAnotherProvider' },
  { code: 'schedule_conflict', labelKey: 'care.cancel.reasonScheduleConflict' },
  { code: 'personal', labelKey: 'care.cancel.reasonPersonal' },
  { code: 'other', labelKey: 'care.cancel.reasonOther' },
];

/** A stored reason that is one of our known codes renders as its localized label. */
function cancelReasonLabel(t: (k: string) => string, raw: string): string {
  const hit = REASONS.find((r) => r.code === raw);
  return hit ? t(hit.labelKey) : raw;
}

export function CancellationConfirmationScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'CancellationConfirmation'>>();
  const id = params.appointmentId;

  const state = useAsync<PortalAppointment>(() => fetchAppointment(id), [id]);

  const [choice, setChoice] = useState(0);
  const [other, setOther] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [problem, setProblem] = useState<{ title: string; detail: string } | null>(null);
  const [cancelled, setCancelled] = useState<PortalAppointment | null>(null);

  const isOther = choice === REASONS.length - 1;
  // For a preset, send the STABLE CODE; for "Other", send the patient's own
  // text. Never a hardcoded English sentence.
  const reasonValue = isOther ? other.trim() : REASONS[choice].code;
  // Whether the Confirm button is allowed: a preset is always valid; "Other"
  // needs the patient to type something.
  const canSubmit = !isOther || other.trim().length > 0;

  async function submit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setProblem(null);
    setSubmitting(true);
    try {
      const result = await cancelAppointment(id, reasonValue || undefined);
      setCancelled(result);
      state.setData(result);
    } catch (e) {
      if (e instanceof PortalConflictError) setProblem({ title: e.title || t('care.cancel.cannotCancelTitle'), detail: e.detail });
      else if (e instanceof ValidationError)
        setProblem({ title: t('care.cancel.checkReasonTitle'), detail: e.violations.map((v) => v.message).join(' ') || e.message });
      else if (e instanceof NotLinkedError)
        setProblem({ title: t('care.appt.linkHealthId'), detail: t('care.appt.notLinkedDetail') });
      else {
        // A timed-out cancellation may well have been applied. Classify it and
        // preserve the uncertainty rather than asserting it failed.
        const f = describeFailure(e);
        setProblem({ title: f.title, detail: writeFailureMessage(e, t('care.cancel.checkHint')) });
      }
    } finally {
      // Reset the in-flight guard too, or a failed attempt would brick the
      // Confirm button forever (its guard would keep returning early).
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (cancelled) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={t('care.cancel.doneTitle')} align="center" showBack={false} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.doneHero}>
            <View style={styles.doneMark}>
              <Icon name="check" size={36} color={colors.textOnBrand} />
            </View>
            <Text style={styles.doneTitle}>{t('care.cancel.doneTitle')}</Text>
            <Text style={styles.doneText}>{t('care.cancel.doneText')}</Text>
          </View>

          <Card>
            <View style={styles.doneRow}>
              <StatusPill status={cancelled.status} size="sm" />
            </View>
            <Text style={styles.doneName}>{cancelled.provider_name ?? typeLabelOf(t, cancelled.appointment_type)}</Text>
            <Text style={styles.doneMeta}>
              {fmtDateLong(cancelled.scheduled_at)} · {fmtTime(cancelled.scheduled_at)}
            </Text>
            {!!cancelled.cancel_reason && (
              <Text style={styles.doneReason}>
                {t('care.cancel.doneReason', { reason: cancelReasonLabel(t, cancelled.cancel_reason) })}
              </Text>
            )}
            {!!cancelled.cancelled_at && (
              <Text style={styles.doneMeta}>
                {t('care.cancel.doneCancelledOn', {
                  date: fmtDateLong(cancelled.cancelled_at),
                  time: fmtTime(cancelled.cancelled_at),
                })}
              </Text>
            )}
          </Card>

          <CareButton
            label={t('care.cancel.bookNew')}
            icon="calendar-plus"
            onPress={() =>
              cancelled.provider_id
                ? navigation.replace('AvailableTimeSlots', { providerId: String(cancelled.provider_id) })
                : navigation.replace('FindProvider')
            }
          />
          <CareButton
            label={t('care.cancel.backToAppointments')}
            variant="secondary"
            onPress={() => navigation.navigate('AppointmentList', { filter: 'upcoming' })}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('care.cancel.title')} subtitle={t('care.cancel.subtitle')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('care.cancel.loading')}>
          {(a) => {
            if (!a.can_cancel) {
              return (
                <Card>
                  <EmptyState
                    icon="alert-circle"
                    tint="amber"
                    title={t('care.cancel.blockedTitle')}
                    message={
                      a.status === 'cancelled'
                        ? t('care.cancel.blockedCancelled')
                        : t('care.cancel.blockedPast')
                    }
                    actionLabel={t('care.cancel.backToAppointment')}
                    onAction={() => navigation.goBack()}
                  />
                </Card>
              );
            }

            return (
              <>
                {!!problem && (
                  <NoticeBanner icon="alert-triangle" tone="critical" title={problem.title} message={problem.detail} />
                )}

                <View style={styles.warning}>
                  <View style={styles.warningIcon}>
                    <Icon name="alert-triangle" size={22} color={colors.textOnBrand} />
                  </View>
                  <View style={styles.warningBody}>
                    <Text style={styles.warningTitle}>{t('care.cancel.noticeTitle')}</Text>
                    <Text style={styles.warningText}>{t('care.cancel.noticeText')}</Text>
                  </View>
                </View>

                <Card>
                  <View style={styles.cardHead}>
                    <Icon name="calendar" size={22} color={colors.blue} />
                    <Text style={styles.cardTitle}>{t('care.cancel.apptTitle')}</Text>
                  </View>
                  <View style={styles.providerRow}>
                    <ProviderAvatar name={a.provider_name ?? t('care.appt.careTeam')} size={64} />
                    <View style={styles.providerBody}>
                      <Text style={styles.providerName} numberOfLines={2}>
                        {a.provider_name ?? t('care.appt.providerTbd')}
                      </Text>
                      {!!a.provider_specialty && <Text style={styles.providerSpecialty}>{a.provider_specialty}</Text>}
                      <View style={styles.metaRow}>
                        <Icon name="building" size={15} color={colors.textSecondary} />
                        <Text style={styles.meta} numberOfLines={1}>
                          {a.facility_name ?? t('care.appt.facilityTbd')}
                        </Text>
                      </View>
                      {!!a.location && (
                        <View style={styles.metaRow}>
                          <Icon name="location" size={15} color={colors.textSecondary} />
                          <Text style={styles.meta} numberOfLines={1}>
                            {a.location}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.split}>
                    <Fact icon="calendar" label={t('care.appt.date')} value={fmtDateLong(a.scheduled_at)} />
                    <View style={styles.splitRule} />
                    <Fact
                      icon="clock"
                      label={t('care.appt.time')}
                      value={fmtTime(a.scheduled_at)}
                      sub={`(${fmtDuration(a.duration_minutes)})`}
                    />
                  </View>
                  {!!a.reason && (
                    <View style={styles.reasonBlock}>
                      <Text style={styles.reasonLabel}>{t('care.cancel.reasonForVisit')}</Text>
                      <Text style={styles.reasonValue}>{a.reason}</Text>
                    </View>
                  )}
                </Card>

                <View style={styles.feeStrip}>
                  <Icon name="info" size={18} color={colors.blue} />
                  <View style={styles.feeBody}>
                    <Text style={styles.feeTitle}>{t('care.cancel.feeTitle')}</Text>
                    <Text style={styles.feeText}>{t('care.cancel.feeText')}</Text>
                  </View>
                </View>

                <Card>
                  <View style={styles.cardHead}>
                    <Icon name="edit" size={22} color={colors.blue} />
                    <Text style={styles.cardTitle}>
                      {t('care.cancel.reasonTitle')} <Text style={styles.required}>{t('care.cancel.required')}</Text>
                    </Text>
                  </View>
                  {REASONS.map((r, i) => (
                    <TouchableOpacity
                      key={r.code}
                      style={styles.radio}
                      onPress={() => setChoice(i)}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: choice === i }}
                    >
                      <View style={[styles.radioMark, choice === i && styles.radioMarkOn]}>
                        {choice === i && <View style={styles.radioDot} />}
                      </View>
                      <Text style={styles.radioLabel}>{t(r.labelKey)}</Text>
                    </TouchableOpacity>
                  ))}
                  {isOther && (
                    <>
                      <TextInput
                        style={styles.textarea}
                        value={other}
                        onChangeText={(v) => setOther(v.slice(0, REASON_MAX))}
                        placeholder={t('care.cancel.otherPlaceholder')}
                        placeholderTextColor={colors.textMuted}
                        multiline
                        textAlignVertical="top"
                      />
                      <Text style={styles.counter}>
                        {other.length}/{REASON_MAX}
                      </Text>
                    </>
                  )}
                </Card>

                <NoticeBanner
                  icon="info"
                  tone="pending"
                  title={t('care.cancel.policyTitle')}
                  message={t('care.cancel.policyText')}
                />

                <CareButton
                  label={submitting ? t('care.cancel.cancelling') : t('care.cancel.confirmCta')}
                  icon="trash"
                  variant="dangerSolid"
                  loading={submitting}
                  disabled={!canSubmit}
                  onPress={submit}
                />
                <CareButton label={t('care.cancel.keepCta')} variant="secondary" onPress={() => navigation.goBack()} />
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Fact({ icon, label, value, sub }: { icon: IconName; label: string; value: string; sub?: string }) {
  return (
    <View style={styles.fact}>
      <View style={styles.factHead}>
        <Icon name={icon} size={20} color={colors.blue} />
        <Text style={styles.factLabel}>{label}</Text>
      </View>
      <Text style={styles.factValue}>{value}</Text>
      {!!sub && <Text style={styles.factSub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 4,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.statusCriticalBg,
  },
  warningIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.statusCritical,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningBody: { flex: 1, minWidth: 0 },
  warningTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.statusCritical,
  },
  warningText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md - 4 },
  cardTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  required: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textMuted },

  providerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 2 },
  providerBody: { flex: 1, minWidth: 0, gap: 2 },
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  meta: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  split: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  splitRule: { width: 1, backgroundColor: colors.divider, marginHorizontal: spacing.md },
  fact: { flex: 1, minWidth: 0 },
  factHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  factValue: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  factSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },

  reasonBlock: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  reasonLabel: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },
  reasonValue: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    marginTop: 2,
  },

  feeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.sm + 4,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  feeBody: { flex: 1, minWidth: 0 },
  feeTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: colors.textPrimary },
  feeText: { fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.textSecondary },

  radio: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  radioMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioMarkOn: { borderColor: colors.blue },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blue },
  radioLabel: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },

  textarea: {
    minHeight: 88,
    marginTop: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm + 4,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  counter: {
    alignSelf: 'flex-end',
    marginTop: 4,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  doneHero: { alignItems: 'center', gap: spacing.sm + 2, paddingVertical: spacing.md },
  doneMark: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.statusNormal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  doneText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  doneRow: { flexDirection: 'row', marginBottom: spacing.sm },
  doneName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  doneMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  doneReason: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    marginTop: 6,
  },
});
