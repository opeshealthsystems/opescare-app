/**
 * CARE-008 — Available Time Slots.
 *
 * `GET /patient/providers/{id}/slots?from=&to=&include_booked=1` for the whole
 * 21-day bookable window in one call. Booked slots are rendered as disabled
 * ("Not Available") rather than hidden, so the grid matches the reference.
 */
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  fetchProvider,
  fetchProviderSlots,
  type AvailabilityDay,
  type AvailabilitySlot,
  type PortalProviderDetail,
  type ProviderAvailability,
} from '../../api';
import { Card, EmptyState, Icon, IconName, ScreenHeader, SectionHeader } from '../../components';
import type { AppStackParamList } from '../../navigation/routes';
import { useTranslation } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { AsyncBoundary, CareButton, isoDay, useAsync } from './shared';
import { shortMonthDay, shortWeekday } from './dayStrip';
import { formatDateLong, formatTime } from '../../utils/format';

const WINDOW_DAYS = 21;
const STRIP = 7;

type Data = { provider: PortalProviderDetail; availability: ProviderAvailability };

type Bucket = { key: string; labelKey: string; icon: IconName; slots: AvailabilitySlot[] };

export function AvailableTimeSlotsScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'AvailableTimeSlots'>>();
  const providerId = Number(params.providerId);

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

  const [page, setPage] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>(params.date ?? isoDay(today));
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);

  const load = useCallback(async (): Promise<Data> => {
    const from = isoDay(windowDates[0]);
    const to = isoDay(windowDates[windowDates.length - 1]);
    const [provider, availability] = await Promise.all([
      fetchProvider(providerId),
      fetchProviderSlots(providerId, { from, to, include_booked: true }),
    ]);
    return { provider, availability };
  }, [providerId, windowDates]);

  const state = useAsync<Data>(load, [providerId]);
  const { reload } = state;

  // A booking made further down the flow frees/consumes slots — always refetch.
  useFocusEffect(
    useCallback(() => {
      setSelectedSlot(null);
      reload();
    }, [reload])
  );

  const maxPage = Math.ceil(WINDOW_DAYS / STRIP) - 1;
  const stripDates = windowDates.slice(page * STRIP, page * STRIP + STRIP);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('care.slots.title')} subtitle={t('care.slots.subtitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('care.slots.loading')}>
          {(data) => {
            const byDate = new Map<string, AvailabilityDay>(data.availability.days.map((d) => [d.date, d]));
            const day = byDate.get(selectedDate);
            const buckets = bucketise(day?.slots ?? []);
            const p = data.provider;

            return (
              <>
                <Card>
                  <View style={styles.providerRow}>
                    <View style={styles.providerCircle}>
                      <Icon name="stethoscope" size={26} color={colors.blue} />
                    </View>
                    <View style={styles.providerBody}>
                      <Text style={styles.providerName} numberOfLines={2}>
                        {p.name}
                      </Text>
                      <Text style={styles.providerSpecialty}>{p.specialty ?? p.title ?? t('care.appt.provider')}</Text>
                      <View style={styles.metaRow}>
                        <Icon name="building" size={15} color={colors.textSecondary} />
                        <Text style={styles.meta} numberOfLines={1}>
                          {p.facility_name ?? t('care.appt.facilityTbd')}
                        </Text>
                      </View>
                      {!!p.room && (
                        <View style={styles.metaRow}>
                          <Icon name="location" size={15} color={colors.textSecondary} />
                          <Text style={styles.meta} numberOfLines={1}>
                            {p.room}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <CareButton
                    label={t('care.appt.changeProvider')}
                    variant="secondary"
                    size="sm"
                    onPress={() => navigation.navigate('FindProvider')}
                    style={{ marginTop: spacing.md }}
                  />
                </Card>

                <View>
                  <SectionHeader title={t('care.slots.selectDate')} />
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
                              setSelectedSlot(null);
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
                </View>

                <View style={styles.tzStrip}>
                  <Icon name="info" size={18} color={colors.blue} />
                  <Text style={styles.tzText}>{t('care.slots.timezoneNote')}</Text>
                </View>

                <View>
                  <SectionHeader title={t('care.slots.heading')} />
                  {buckets.every((b) => b.slots.length === 0) ? (
                    <Card>
                      <EmptyState
                        icon="clock"
                        tint="amber"
                        title={t('care.appt.noSlotsTitle')}
                        message={t('care.slots.emptyMessage')}
                      />
                    </Card>
                  ) : (
                    <View style={styles.buckets}>
                      {buckets
                        .filter((b) => b.slots.length > 0)
                        .map((b) => (
                          <View key={b.key}>
                            <View style={styles.bucketHead}>
                              <Icon name={b.icon} size={18} color={colors.statusWarning} />
                              <Text style={styles.bucketLabel}>{t(b.labelKey)}</Text>
                              <View style={styles.bucketRule} />
                            </View>
                            <View style={styles.slotGrid}>
                              {b.slots.map((s) => {
                                const on = selectedSlot?.id === s.id;
                                const off = !s.is_bookable;
                                return (
                                  <TouchableOpacity
                                    key={s.id}
                                    disabled={off}
                                    activeOpacity={0.85}
                                    onPress={() => setSelectedSlot(s)}
                                    style={[styles.slot, off ? styles.slotOff : on ? styles.slotOn : styles.slotFree]}
                                  >
                                    <Text
                                      style={[
                                        styles.slotText,
                                        off ? styles.slotTextOff : on ? styles.slotTextOn : styles.slotTextFree,
                                      ]}
                                    >
                                      {formatTime(s.slot_start)}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        ))}
                    </View>
                  )}
                </View>

                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, { backgroundColor: colors.blue }]} />
                    <Text style={styles.legendText}>{t('care.slots.legendAvailable')}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, { backgroundColor: colors.divider }]} />
                    <Text style={styles.legendText}>{t('care.slots.legendUnavailable')}</Text>
                  </View>
                </View>

                <Card>
                  <View style={styles.footerRow}>
                    <View style={styles.footerIcon}>
                      <Icon name="calendar-check" size={24} color={colors.blue} />
                    </View>
                    <View style={styles.footerBody}>
                      <Text style={styles.footerTitle}>
                        {t('care.slots.selectedDate', { date: formatDateLong(`${selectedDate}T12:00:00`) })}
                      </Text>
                      <Text style={styles.footerText}>
                        {selectedSlot
                          ? t('care.slots.selectedSlot', {
                              time: formatTime(selectedSlot.slot_start),
                              minutes: selectedSlot.duration_minutes,
                            })
                          : t('care.slots.selectPrompt')}
                      </Text>
                    </View>
                  </View>
                </Card>

                <CareButton
                  label={t('care.slots.continue')}
                  iconRight="arrow-right"
                  disabled={!selectedSlot}
                  onPress={() =>
                    navigation.navigate('BookAppointmentForm', {
                      providerId: String(providerId),
                      slot: selectedSlot!.id,
                      facilityId: selectedSlot!.facility_id ?? undefined,
                    })
                  }
                />
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

function bucketise(slots: AvailabilitySlot[]): Bucket[] {
  const buckets: Bucket[] = [
    { key: 'morning', labelKey: 'care.slots.morning', icon: 'sun', slots: [] },
    { key: 'afternoon', labelKey: 'care.slots.afternoon', icon: 'sun', slots: [] },
    { key: 'evening', labelKey: 'care.slots.evening', icon: 'moon', slots: [] },
  ];
  for (const s of [...slots].sort((a, b) => a.slot_start.localeCompare(b.slot_start))) {
    const h = new Date(s.slot_start).getHours();
    if (h < 12) buckets[0].slots.push(s);
    else if (h < 17) buckets[1].slots.push(s);
    else buckets[2].slots.push(s);
  }
  return buckets;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  providerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 2 },
  providerCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  dayChip: {
    width: 74,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: 9,
    alignItems: 'center',
    gap: 1,
  },
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

  buckets: { gap: spacing.md },
  bucketHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm + 2 },
  bucketLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  bucketRule: { flex: 1, height: 1, backgroundColor: colors.border },

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

  legend: { flexDirection: 'row', gap: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendSwatch: { width: 16, height: 16, borderRadius: 4 },
  legendText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4 },
  footerIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBody: { flex: 1, minWidth: 0 },
  footerTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  footerText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
