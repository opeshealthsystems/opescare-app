/**
 * CARE-012 — Reschedule Appointment.
 *
 * `PATCH /patient/appointments/{id}/reschedule { slot_id, reason? }`. The API
 * creates the replacement, links it through `rescheduled_from_id`, cancels the
 * original and frees the slot it held — so we route to the *new* appointment id
 * that comes back, never to an optimistic guess.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  fetchAppointment,
  fetchProviderSlots,
  rescheduleAppointment,
  type AvailabilityDay,
  type AvailabilitySlot,
  type PortalAppointment,
  type ProviderAvailability,
} from '../../api';
import { Card, EmptyState, Icon, IconName, ScreenHeader } from '../../components';
import { useTranslation } from '../../i18n';
import { describeFailure, writeFailureMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { shortMonthDay, shortWeekday } from './dayStrip';
import {
  AsyncBoundary,
  CareButton,
  fmtDateLong,
  fmtDuration,
  fmtTime,
  isoDay,
  NoticeBanner,
  ProviderAvatar,
  useAsync,
} from './shared';

const WINDOW_DAYS = 21;
const STRIP = 7;
const REASON_MAX = 250;

type Data = { appointment: PortalAppointment; availability: ProviderAvailability | null };

export function RescheduleAppointmentScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'RescheduleAppointment'>>();
  const id = params.appointmentId;

  const today = useMemo(() => new Date(), []);
  const windowDates = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < WINDOW_DAYS; i += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      out.push(d);
    }
    return out;
  }, [today]);

  const load = useCallback(async (): Promise<Data> => {
    const appointment = await fetchAppointment(id);
    if (!appointment.provider_id) return { appointment, availability: null };
    const availability = await fetchProviderSlots(appointment.provider_id, {
      from: isoDay(windowDates[0]),
      to: isoDay(windowDates[windowDates.length - 1]),
      include_booked: true,
    });
    return { appointment, availability };
  }, [id, windowDates]);

  const state = useAsync<Data>(load, [id]);

  const [page, setPage] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>(isoDay(today));
  const [slot, setSlot] = useState<AvailabilitySlot | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [problem, setProblem] = useState<{ title: string; detail: string; tone: 'warning' | 'critical' } | null>(null);

  const maxPage = Math.ceil(WINDOW_DAYS / STRIP) - 1;
  const stripDates = windowDates.slice(page * STRIP, page * STRIP + STRIP);

  async function submit() {
    if (!slot) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setProblem(null);
    setSubmitting(true);
    try {
      const result = await rescheduleAppointment(id, {
        slot_id: slot.id,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      navigation.replace('AppointmentConfirmed', { appointmentId: result.appointment.id });
    } catch (e) {
      // One classifier for every failure, so the copy is translated and — for a
      // timeout, where the PATCH may well have been applied — says outright
      // that the outcome is unknown instead of claiming nothing moved.
      const failure = describeFailure(e);
      const conflict = failure.kind === 'conflict';
      setProblem({
        title: failure.title,
        detail: writeFailureMessage(e, t('care.reschedule.checkHint')),
        tone: conflict ? 'warning' : 'critical',
      });
      if (conflict) {
        // The slot we held is gone or was taken: drop the selection and pull
        // fresh availability rather than let the patient re-submit it.
        setSlot(null);
        state.reload();
      }
    } finally {
      // Reset the synchronous guard too, not just the state flag: without this
      // a failed reschedule leaves submittingRef stuck true and the Confirm
      // button silently fires nothing until the patient leaves and re-enters.
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('care.reschedule.title')} subtitle={t('care.reschedule.subtitle')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('care.slots.loading')}>
          {(data) => {
            const a = data.appointment;
            const byDate = new Map<string, AvailabilityDay>((data.availability?.days ?? []).map((d) => [d.date, d]));
            const daySlots = [...(byDate.get(selectedDate)?.slots ?? [])].sort((x, y) =>
              x.slot_start.localeCompare(y.slot_start)
            );

            if (!a.can_reschedule) {
              return (
                <Card>
                  <EmptyState
                    icon="alert-circle"
                    tint="amber"
                    title={t('care.reschedule.blockedTitle')}
                    message={
                      a.status === 'cancelled'
                        ? t('care.reschedule.blockedCancelled')
                        : t('care.reschedule.blockedPast')
                    }
                    actionLabel={t('care.appt.findProvider')}
                    onAction={() => navigation.navigate('FindProvider')}
                  />
                </Card>
              );
            }

            return (
              <>
                {!!problem && (
                  <NoticeBanner
                    icon="alert-triangle"
                    tone={problem.tone === 'warning' ? 'warning' : 'critical'}
                    title={problem.title}
                    message={problem.detail}
                  />
                )}

                <Card>
                  <View style={styles.cardHead}>
                    <Icon name="calendar" size={22} color={colors.blue} />
                    <Text style={styles.cardTitle}>{t('care.reschedule.currentHeading')}</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('FindProvider')} hitSlop={8}>
                      <Text style={styles.cardAction}>{t('care.appt.changeProvider')}</Text>
                    </TouchableOpacity>
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
                  <View style={styles.currentSplit}>
                    <Current icon="calendar" label={t('care.appt.date')} value={fmtDateLong(a.scheduled_at)} />
                    <View style={styles.currentRule} />
                    <Current
                      icon="clock"
                      label={t('care.appt.time')}
                      value={fmtTime(a.scheduled_at)}
                      sub={`(${fmtDuration(a.duration_minutes)})`}
                    />
                  </View>
                </Card>

                <View style={styles.sectionHead}>
                  <Icon name="calendar" size={22} color={colors.blue} />
                  <Text style={styles.sectionTitle}>{t('care.reschedule.selectDate')}</Text>
                </View>
                <View style={styles.strip}>
                  <TouchableOpacity
                    style={[styles.arrow, page === 0 && styles.arrowOff]}
                    disabled={page === 0}
                    onPress={() => setPage((n) => Math.max(0, n - 1))}
                    accessibilityLabel={t('care.appt.previousWeek')}
                  >
                    <Icon name="chevron-left" size={18} color={colors.link} />
                  </TouchableOpacity>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripDays}>
                    {stripDates.map((d) => {
                      const key = isoDay(d);
                      const on = key === selectedDate;
                      const count = byDate.get(key)?.available_count ?? 0;
                      return (
                        <TouchableOpacity
                          key={key}
                          onPress={() => {
                            setSelectedDate(key);
                            setSlot(null);
                          }}
                          activeOpacity={0.85}
                          style={[styles.dayChip, on ? styles.dayChipOn : styles.dayChipOff]}
                        >
                          <Text style={[styles.dayWeek, on && styles.dayTextOn]}>{shortWeekday(d)}</Text>
                          <Text style={[styles.dayDate, on && styles.dayTextOn]}>{shortMonthDay(d)}</Text>
                          <Text style={[styles.dayCount, on && styles.dayTextOn, count === 0 && styles.dayCountNone]}>
                            {count === 0 ? t('care.appt.dayFull') : t('care.appt.dayFree', { count })}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <TouchableOpacity
                    style={[styles.arrow, page === maxPage && styles.arrowOff]}
                    disabled={page === maxPage}
                    onPress={() => setPage((n) => Math.min(maxPage, n + 1))}
                    accessibilityLabel={t('care.appt.nextWeek')}
                  >
                    <Icon name="chevron-right" size={18} color={colors.link} />
                  </TouchableOpacity>
                </View>

                <View style={styles.tzStrip}>
                  <Icon name="info" size={18} color={colors.blue} />
                  <Text style={styles.tzText}>{t('care.reschedule.facilityNote')}</Text>
                </View>

                <View style={styles.sectionHead}>
                  <Icon name="clock" size={22} color={colors.blue} />
                  <Text style={styles.sectionTitle}>{t('care.reschedule.selectTime')}</Text>
                </View>
                {daySlots.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon="clock"
                      tint="amber"
                      title={t('care.appt.noSlotsTitle')}
                      message={t('care.reschedule.emptyMessage')}
                    />
                  </Card>
                ) : (
                  <View style={styles.slotGrid}>
                    {daySlots.map((s) => {
                      const on = slot?.id === s.id;
                      const off = !s.is_bookable;
                      return (
                        <TouchableOpacity
                          key={s.id}
                          disabled={off}
                          activeOpacity={0.85}
                          onPress={() => setSlot(s)}
                          style={[styles.slot, off ? styles.slotOff : on ? styles.slotOn : styles.slotFree]}
                        >
                          <Text
                            style={[
                              styles.slotText,
                              off ? styles.slotTextOff : on ? styles.slotTextOn : styles.slotTextFree,
                            ]}
                          >
                            {fmtTime(s.slot_start)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <Card>
                  <View style={styles.cardHead}>
                    <Icon name="edit" size={22} color={colors.blue} />
                    <Text style={styles.cardTitle}>{t('care.reschedule.reasonHeading')}</Text>
                  </View>
                  <TextInput
                    style={styles.textarea}
                    value={reason}
                    onChangeText={(v) => setReason(v.slice(0, REASON_MAX))}
                    placeholder={t('care.reschedule.reasonPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                  <Text style={styles.counter}>
                    {t('care.reschedule.reasonCounter', { used: reason.length, max: REASON_MAX })}
                  </Text>
                </Card>

                {!!slot && (
                  <NoticeBanner
                    icon="refresh"
                    tone="pending"
                    title={t('care.reschedule.movingTitle', {
                      date: fmtDateLong(slot.slot_start),
                      time: fmtTime(slot.slot_start),
                    })}
                    message={t('care.reschedule.movingMessage')}
                  />
                )}

                <CareButton
                  label={submitting ? t('care.reschedule.submitting') : t('care.reschedule.submit')}
                  icon="calendar-check"
                  disabled={!slot}
                  loading={submitting}
                  onPress={submit}
                />
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Current({ icon, label, value, sub }: { icon: IconName; label: string; value: string; sub?: string }) {
  return (
    <View style={styles.current}>
      <View style={styles.currentHead}>
        <Icon name={icon} size={20} color={colors.blue} />
        <Text style={styles.currentLabel}>{label}</Text>
      </View>
      <Text style={styles.currentValue}>{value}</Text>
      {!!sub && <Text style={styles.currentSub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md - 4 },
  cardTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  cardAction: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },

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

  currentSplit: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  currentRule: { width: 1, backgroundColor: colors.divider, marginHorizontal: spacing.md },
  current: { flex: 1, minWidth: 0 },
  currentHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currentLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  currentValue: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  currentSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },

  strip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  arrow: {
    width: 38,
    height: 62,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowOff: { opacity: 0.35 },
  stripDays: { gap: spacing.sm, paddingRight: 2 },
  dayChip: { width: 74, borderRadius: radii.md, borderWidth: 1, paddingVertical: 9, alignItems: 'center', gap: 1 },
  dayChipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  dayChipOff: { backgroundColor: colors.surface, borderColor: colors.border },
  dayWeek: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  dayDate: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  dayCount: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.statusNormal },
  dayCountNone: { color: colors.textMuted },
  dayTextOn: { color: colors.textOnBrand },

  tzStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 4,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  tzText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    minWidth: 92,
    flexGrow: 1,
    flexBasis: '30%',
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  slotFree: { backgroundColor: colors.surface, borderColor: colors.border },
  slotOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  slotOff: { backgroundColor: colors.divider, borderColor: colors.divider },
  slotText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
  slotTextFree: { color: colors.link },
  slotTextOn: { color: colors.textOnBrand },
  slotTextOff: { color: colors.textMuted },

  textarea: {
    minHeight: 92,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm + 4,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  counter: {
    alignSelf: 'flex-end',
    marginTop: 4,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
