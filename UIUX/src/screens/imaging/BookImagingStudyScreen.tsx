/**
 * DIA-016 — Book Imaging Study.
 *
 * The four sections the reference lays out — study, facility, date & time,
 * clinical information — over real data:
 *
 *  - the study picker is the `imaging_procedures` catalogue;
 *  - the facility picker only lists sites with a rostered radiologist and free
 *    future capacity;
 *  - the time slots are the same `provider_availability_slots` rows the
 *    consultation flow books.
 *
 * "Review Booking" summarises the choice and then POSTs it. The write goes
 * through `AppointmentBookingService`, which row-locks the slot — this is the
 * one booking path, not a second one — and files the radiology order against
 * the appointment it creates. A slot claimed in the meantime surfaces as the
 * server's own 409 rather than a silent double booking.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  bookImagingStudy,
  fetchImagingBookingOptions,
  fetchImagingBookingSlots,
  type ImagingBookingOptions,
  type ImagingBookingSlot,
  type ImagingFacilityOption,
  type ImagingProcedureOption,
} from '../../api/imaging';
import { fetchImagingStudy } from '../../api';
import { Card, Icon, ScreenHeader, useDialog } from '../../components';
import { a11yJoin } from '../../components/a11y';
import { getLocale, toBcp47, useTranslation, type TFunction } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { AsyncBoundary, DiagButton, useAsync } from '../diagnostics/shared';
import { fmtDate, fmtTime } from './detailShared';

/** The wizard rail across the top. Reflects progress; not a navigation control. */
const STEPS = [
  'imaging.book.stepStudy',
  'imaging.book.stepDateTime',
  'imaging.book.stepFacility',
  'imaging.book.stepReview',
] as const;

function StepRail({ done, t }: { done: number; t: TFunction }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {STEPS.map((key, i) => {
        const on = i <= done;
        return (
          <View key={key} style={[styles.railChip, on && styles.railChipOn]}>
            <Text style={[styles.railNum, on && styles.railTextOn]}>{i + 1}</Text>
            <Text style={[styles.railLabel, on && styles.railTextOn]}>{t(key)}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** A tap-to-expand select. Keeps the flow on one screen, as the reference does. */
function Select<T extends { id: string }>({
  label,
  placeholder,
  value,
  options,
  optionLabel,
  optionSub,
  onSelect,
}: {
  label: string;
  placeholder: string;
  value: T | null;
  options: T[];
  optionLabel: (o: T) => string;
  optionSub?: (o: T) => string | null;
  onSelect: (o: T) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen((o) => !o)}
        style={styles.selectBox}
        accessibilityRole="button"
      >
        <Text style={[styles.selectValue, !value && styles.selectPlaceholder]} numberOfLines={1}>
          {value ? optionLabel(value) : placeholder}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {open && (
        <View style={styles.options}>
          {options.length === 0 ? (
            <Text style={styles.hint}>{t('imaging.book.nothingAvailable')}</Text>
          ) : (
            options.map((o, i) => {
              const on = value?.id === o.id;
              const sub = optionSub?.(o) ?? null;
              return (
                <TouchableOpacity
                  key={o.id}
                  activeOpacity={0.8}
                  onPress={() => {
                    onSelect(o);
                    setOpen(false);
                  }}
                  style={[styles.option, i > 0 && styles.optionDivider]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={a11yJoin(optionLabel(o), sub)}
                >
                  <View style={styles.optionBody}>
                    <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>
                      {optionLabel(o)}
                    </Text>
                    {!!sub && <Text style={styles.optionSub}>{sub}</Text>}
                  </View>
                  {on && <Icon name="check" size={18} color={colors.blue} strokeWidth={2.4} />}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}

/**
 * The next 14 bookable days, as a horizontal strip. The weekday abbreviation
 * is a date, not a catalogue string (contract rule 8), so it comes from Intl
 * on the active locale: `Mon` in English, « lun. » in French.
 */
function useDayStrip(t: TFunction): { iso: string; day: string; num: string }[] {
  return useMemo(() => {
    const fallback = [
      'imaging.book.daySun',
      'imaging.book.dayMon',
      'imaging.book.dayTue',
      'imaging.book.dayWed',
      'imaging.book.dayThu',
      'imaging.book.dayFri',
      'imaging.book.daySat',
    ];
    let weekday: Intl.DateTimeFormat | null = null;
    try {
      weekday = new Intl.DateTimeFormat(toBcp47(getLocale()), { weekday: 'short' });
    } catch {
      weekday = null; // No ICU: the catalogue's own abbreviations stand in.
    }

    const days: { iso: string; day: string; num: string }[] = [];
    const now = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      days.push({
        iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')}`,
        day: weekday ? weekday.format(d) : t(fallback[d.getDay()]),
        num: String(d.getDate()).padStart(2, '0'),
      });
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
}

export function BookImagingStudyScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'BookImagingStudy'>>();

  const { t } = useTranslation();
  const state = useAsync<ImagingBookingOptions>(() => fetchImagingBookingOptions(), []);
  const days = useDayStrip(t);

  /**
   * Reached from an existing order (DIA-015 "Book this study"), so pre-select
   * the catalogue entry that matches it and carry its indication over.
   */
  const priorOrderId = params?.orderId;
  const prior = useAsync(
    () => (priorOrderId ? fetchImagingStudy(priorOrderId) : Promise.resolve(null)),
    [priorOrderId]
  );

  const [procedure, setProcedure] = useState<ImagingProcedureOption | null>(null);
  const [facility, setFacility] = useState<ImagingFacilityOption | null>(null);
  const [date, setDate] = useState<string>(days[0]?.iso ?? '');
  const [slots, setSlots] = useState<ImagingBookingSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slot, setSlot] = useState<ImagingBookingSlot | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useDialog();
  const bookingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Default the facility to the first offered one so the picker is never the
  // only thing standing between the patient and a visible list of times.
  useEffect(() => {
    if (!facility && state.data?.facilities.length) {
      setFacility(state.data.facilities[0]);
    }
  }, [facility, state.data]);

  useEffect(() => {
    const p = prior.data;
    if (!p || procedure || !state.data) return;
    const match = state.data.procedures.find(
      (o) => o.modality === p.modality && o.body_part === p.body_part
    );
    if (match) setProcedure(match);
    if (p.clinical_indication) setReason(p.clinical_indication);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prior.data, state.data]);

  // Slots depend on facility + date; re-fetch whenever either moves.
  useEffect(() => {
    if (!facility || !date) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSlot(null);
    fetchImagingBookingSlots(facility.id, date)
      .then((res) => {
        if (!cancelled) setSlots(res.slots);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [facility, date]);

  const done = !procedure ? 0 : !slot ? 1 : !facility ? 2 : 3;
  const ready = !!procedure && !!facility && !!slot && !busy;

  const submit = useCallback(async () => {
    if (!procedure || !facility || !slot) return;
    // A second tap on a slow link must not book the same slot twice.
    if (bookingRef.current) return;
    bookingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await bookImagingStudy({
        procedure_id: procedure.id,
        facility_id: facility.id,
        slot_id: slot.id,
        reason: reason.trim() || undefined,
      });
      dialog.show({
        title: t('imaging.book.bookedTitle'),
        tone: 'success',
        cancelLabel: t('imaging.book.bookedDone'),
        message: t('imaging.book.bookedBody', {
          study: res.study_name,
          date: fmtDate(res.scheduled_at),
          time: fmtTime(res.scheduled_at),
          facility: res.facility_name ?? '',
          order: res.order_number ?? '—',
        }),
        actions: [
          {
            label: t('imaging.book.viewPreparation'),
            onPress: () => navigation.replace('ImagingPreparation', { studyId: res.study_id }),
          },
        ],
      });
    } catch (e) {
      setError(
        writeFailureMessage(
          e,
          t('imaging.book.bookFailedHint'),
          t('imaging.book.bookFailed')
        )
      );
      // The slot list is now stale — a 409 means someone else took it.
      if (facility && date) {
        fetchImagingBookingSlots(facility.id, date)
          .then((res) => setSlots(res.slots))
          .catch(() => undefined);
      }
      setSlot(null);
    } finally {
      bookingRef.current = false;
      setBusy(false);
    }
  }, [procedure, facility, slot, reason, navigation, date, dialog, t]);

  const review = useCallback(() => {
    if (!procedure || !facility || !slot) return;
    dialog.show({
      title: t('imaging.book.reviewTitle'),
      tone: 'info',
      cancelLabel: t('imaging.book.reviewBack'),
      message: [
        procedure.name,
        t('imaging.book.reviewWhen', {
          date: fmtDate(slot.slot_start),
          time: fmtTime(slot.slot_start),
        }),
        facility.name,
        procedure.preparation_summary
          ? t('imaging.book.reviewPreparation', { value: procedure.preparation_summary })
          : '',
        reason.trim() ? t('imaging.book.reviewReason', { value: reason.trim() }) : '',
      ]
        .filter(Boolean)
        .join('\n'),
      actions: [{ label: t('imaging.book.reviewConfirm'), onPress: submit }],
    });
  }, [procedure, facility, slot, reason, submit, dialog, t]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.book.title')}
        subtitle={t('imaging.book.subtitle')}
        actions={[{ icon: 'more-vertical', onPress: () => navigation.navigate('ImagingResults') }]}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('imaging.book.loading')}
        >
          {(opts) => (
            <>
              <StepRail done={done} t={t} />

              {/* ── Who ─────────────────────────────────────────────── */}
              <Card style={styles.patientCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {opts.patient.name
                      .split(' ')
                      .map((p) => p.charAt(0))
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </Text>
                </View>
                <View style={styles.patientBody}>
                  <Text style={styles.patientName}>{opts.patient.name}</Text>
                  <Text style={styles.patientMeta}>
                    {t('imaging.book.healthId', { id: opts.patient.medical_id ?? '—' })}
                  </Text>
                  <Text style={styles.patientMeta}>
                    {opts.patient.age != null && opts.patient.age >= 18
                      ? t('imaging.book.adultPatient')
                      : t('imaging.book.paediatricPatient')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => navigation.navigate('MainTabs', { screen: 'ProfileTab', params: { sheet: 'personal' } })}
                  accessibilityRole="button"
                  accessibilityLabel={t('imaging.book.change')}
                >
                  <Text style={styles.changeLink}>{t('imaging.book.change')}</Text>
                </TouchableOpacity>
              </Card>

              {/* ── 1. Study ────────────────────────────────────────── */}
              <Text style={styles.sectionTitle}>{t('imaging.book.section1')}</Text>
              <Card>
                <Select
                  label={t('imaging.book.studyField')}
                  placeholder={t('imaging.book.studyPlaceholder')}
                  value={procedure}
                  options={opts.procedures}
                  optionLabel={(p) => p.name}
                  optionSub={(p) =>
                    t('imaging.book.procedureSub', {
                      scanType: p.modality_label,
                      bodyPart: p.body_part,
                      minutes: p.duration_minutes,
                    })
                  }
                  onSelect={setProcedure}
                />
                {procedure ? (
                  <>
                    <Text style={styles.hint}>
                      {t('imaging.book.procedureHint', {
                        scanType: procedure.modality_label,
                        bodyPart: procedure.body_part,
                      })}
                    </Text>
                    {!!procedure.preparation_summary && (
                      <Text style={styles.hint}>{procedure.preparation_summary}</Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.hint}>{t('imaging.book.chooseStudyHint')}</Text>
                )}
              </Card>

              {/* ── 2. Facility ─────────────────────────────────────── */}
              <Text style={styles.sectionTitle}>{t('imaging.book.section2')}</Text>
              <Card>
                <Select
                  label={t('imaging.book.facilityField')}
                  placeholder={t('imaging.book.facilityPlaceholder')}
                  value={facility}
                  options={opts.facilities}
                  optionLabel={(f) => f.name}
                  optionSub={(f) => f.city}
                  onSelect={setFacility}
                />
                <Text style={styles.hint}>
                  {facility
                    ? t('imaging.book.facilityLive')
                    : t('imaging.book.facilityPending')}
                </Text>
              </Card>

              {/* ── 3. Date & time ──────────────────────────────────── */}
              <Text style={styles.sectionTitle}>{t('imaging.book.section3')}</Text>
              <Card>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryBox}>
                    <Text style={styles.fieldLabel}>{t('imaging.book.preferredDate')}</Text>
                    <Text style={styles.summaryValue}>{fmtDate(date)}</Text>
                  </View>
                  <View style={styles.summaryBox}>
                    <Text style={styles.fieldLabel}>{t('imaging.book.availableTime')}</Text>
                    <Text style={styles.summaryValue}>
                      {slot ? fmtTime(slot.slot_start) : t('imaging.book.notSelected')}
                    </Text>
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.dayStrip}
                >
                  {days.map((d) => {
                    const on = d.iso === date;
                    return (
                      <TouchableOpacity
                        key={d.iso}
                        activeOpacity={0.85}
                        onPress={() => setDate(d.iso)}
                        style={[styles.dayChip, on && styles.dayChipOn]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        // Weekday and day number are two Text nodes for layout;
                        // spoken they are one date.
                        accessibilityLabel={a11yJoin(d.day, d.num)}
                      >
                        <Text style={[styles.dayName, on && styles.railTextOn]}>{d.day}</Text>
                        <Text style={[styles.dayNum, on && styles.railTextOn]}>{d.num}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </Card>

              <Text style={styles.sectionTitle}>{t('imaging.book.slotsTitle')}</Text>
              {slotsLoading ? (
                <Card>
                  <Text style={styles.hint}>{t('imaging.book.slotsChecking')}</Text>
                </Card>
              ) : slots.length === 0 ? (
                <Card>
                  <Text style={styles.hint}>
                    {facility
                      ? t('imaging.book.slotsNone')
                      : t('imaging.book.slotsPickFacility')}
                  </Text>
                </Card>
              ) : (
                <View style={styles.slotGrid}>
                  {slots.map((s) => {
                    const on = slot?.id === s.id;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        activeOpacity={0.85}
                        disabled={!s.is_available}
                        onPress={() => setSlot(s)}
                        style={[
                          styles.slot,
                          on && styles.slotOn,
                          !s.is_available && styles.slotOff,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on, disabled: !s.is_available }}
                        accessibilityLabel={fmtTime(s.slot_start)}
                      >
                        <Text
                          style={[
                            styles.slotText,
                            on && styles.railTextOn,
                            !s.is_available && styles.slotTextOff,
                          ]}
                        >
                          {fmtTime(s.slot_start)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* ── 4. Clinical information ─────────────────────────── */}
              <Text style={styles.sectionTitle}>{t('imaging.book.section4')}</Text>
              <Card>
                <Text style={styles.fieldLabel}>{t('imaging.book.reasonLabel')}</Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  placeholder={t('imaging.book.reasonPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  style={styles.textArea}
                  autoComplete="off"
                  textContentType="none"
                  accessibilityLabel={t('imaging.book.reasonLabel')}
                />
              </Card>

              {!!error && <Text style={styles.error}>{error}</Text>}

              {/* ── Actions ─────────────────────────────────────────── */}
              <View style={styles.actions}>
                <DiagButton
                  label={t('imaging.book.cancel')}
                  variant="secondary"
                  onPress={() => navigation.goBack()}
                  style={styles.actionCancel}
                />
                <DiagButton
                  label={busy ? t('imaging.book.booking') : t('imaging.book.reviewCta')}
                  variant="primary"
                  disabled={!ready}
                  onPress={review}
                  style={styles.actionNext}
                />
              </View>
            </>
          )}
        </AsyncBoundary>
      </ScrollView>

      {dialog.element}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm + 2, paddingBottom: spacing.xxl },

  rail: { gap: spacing.sm, paddingRight: spacing.md },
  railChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  railChipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  railNum: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  railLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  railTextOn: { color: colors.textOnBrand },

  patientCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.blue,
  },
  patientBody: { flex: 1, gap: 1 },
  patientName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  patientMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  changeLink: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },

  sectionTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },

  field: { gap: 6 },
  fieldLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectValue: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  selectPlaceholder: {
    fontFamily: typography.fontFamily.regular,
    color: colors.textMuted,
  },

  options: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginTop: 6,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  optionBody: { flex: 1, gap: 2 },
  optionLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  optionLabelOn: { fontFamily: typography.fontFamily.semiBold, color: colors.blue },
  optionSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  hint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 8,
  },

  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 12,
    gap: 4,
  },
  summaryValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },

  dayStrip: { gap: spacing.sm, paddingTop: spacing.md, paddingRight: spacing.sm },
  dayChip: {
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 54,
  },
  dayChipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  dayName: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  dayNum: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    width: '48%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingVertical: 12,
  },
  slotOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  slotOff: { backgroundColor: colors.divider, borderColor: colors.divider },
  slotText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  slotTextOff: { color: colors.textMuted },

  textArea: {
    marginTop: 6,
    minHeight: 76,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 12,
    textAlignVertical: 'top',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },

  error: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.statusCritical,
  },

  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  actionCancel: { flex: 1 },
  actionNext: { flex: 2 },
});
