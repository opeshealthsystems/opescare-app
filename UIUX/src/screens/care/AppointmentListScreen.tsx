/**
 * CARE-002 — Appointment List.
 *
 * Upcoming / Past / Cancelled tabs over `GET /patient/appointments`, with a
 * client-side text filter and newest/oldest sort. The summary strip is the
 * live `/patient/appointments/summary` counter plus the next real visit.
 */
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  fetchAppointments,
  fetchAppointmentSummary,
  type AppointmentQuery,
  type AppointmentSummary,
  type PortalAppointment,
} from '../../api';
import { Card, EmptyState, Icon, ScreenHeader, SectionHeader } from '../../components';
import type { AppStackParamList } from '../../navigation/routes';
import { useTranslation, type TFunction } from '../../i18n';
import { colors, radii, spacing, typography, tintMap } from '../../theme/theme';
import { cacheKeys } from '../../lib/offlineCache';
import { AsyncBoundary, CareButton, DateBlock, SearchField, statusTint, StatusPill, useAsync } from './shared';
import { relativeDay, typeLabelOf } from './apptLabels';
import { formatTime } from '../../utils/format';

type Tab = 'upcoming' | 'past' | 'cancelled';

const TABS: { key: Tab; labelKey: string; headingKey: string; emptyTitleKey: string }[] = [
  { key: 'upcoming', labelKey: 'care.list.tabUpcoming', headingKey: 'care.list.headingUpcoming', emptyTitleKey: 'care.list.emptyUpcomingTitle' },
  { key: 'past', labelKey: 'care.list.tabPast', headingKey: 'care.list.headingPast', emptyTitleKey: 'care.list.emptyPastTitle' },
  { key: 'cancelled', labelKey: 'care.list.tabCancelled', headingKey: 'care.list.headingCancelled', emptyTitleKey: 'care.list.emptyCancelledTitle' },
];

const QUERY: Record<Tab, AppointmentQuery> = {
  upcoming: { scope: 'upcoming', per_page: 50 },
  past: { scope: 'past', per_page: 50 },
  cancelled: { scope: 'all', status: 'cancelled,no_show', per_page: 50 },
};

type ListData = {
  items: PortalAppointment[];
  past: PortalAppointment[];
  summary: AppointmentSummary;
};

export function AppointmentListScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'AppointmentList'>>();
  const initial: Tab = params?.filter === 'past' ? 'past' : 'upcoming';

  const [tab, setTab] = useState<Tab>(initial);
  const [query, setQuery] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);

  const load = useCallback(async (): Promise<ListData> => {
    const [page, summary, past] = await Promise.all([
      fetchAppointments(QUERY[tab]),
      fetchAppointmentSummary(),
      tab === 'upcoming' ? fetchAppointments({ scope: 'past', per_page: 3 }) : Promise.resolve(null),
    ]);
    return { items: page.data, summary, past: past?.data ?? [] };
  }, [tab]);

  const state = useAsync<ListData>(load, [tab], { cacheKey: cacheKeys.appointmentList(tab) });
  const { reload, reloadIfStale } = state;

  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  const filter = useCallback(
    (list: PortalAppointment[]) => {
      const q = query.trim().toLowerCase();
      const matched = q
        ? list.filter((a) =>
            [
              a.provider_name,
              a.provider_specialty,
              a.facility_name,
              a.location,
              a.reason,
              typeLabelOf(t, a.appointment_type),
            ]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q))
          )
        : list;
      return [...matched].sort((a, b) => {
        const d = new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
        return newestFirst ? -d : d;
      });
    },
    // `t` is stable per locale: listing it re-filters against French type
    // labels after a language switch instead of holding the English ones.
    [query, newestFirst, t]
  );

  const open = useCallback(
    (id: string) => navigation.navigate('AppointmentDetail', { appointmentId: id }),
    [navigation]
  );

  // Stable identities. An inline arrow in `renderItem` is recreated on every
  // render and defeats FlatList's row memoisation, which is the whole point.
  const keyOf = useCallback((a: PortalAppointment) => a.id, []);
  const renderAppointment = useCallback(
    ({ item }: { item: PortalAppointment }) => (
      <AppointmentListCard t={t} appointment={item} onPress={() => open(item.id)} />
    ),
    [open, t]
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('care.list.title')}
        subtitle={t('care.list.subtitle')}
        right={
          <CareButton
            label={t('care.list.bookCta')}
            icon="plus"
            size="sm"
            onPress={() => navigation.navigate('FindProvider')}
          />
        }
      />
      {/* Search and tabs sit outside the list so they stay usable while it
          loads, and are not re-mounted by every list update. */}
      <View style={styles.controls}>
        <View style={styles.searchRow}>
          <SearchField value={query} onChangeText={setQuery} placeholder={t('care.list.searchPlaceholder')} />
          <TouchableOpacity
            style={styles.filterButton}
            activeOpacity={0.8}
            onPress={() => setNewestFirst((v) => !v)}
            accessibilityLabel={t('care.list.sortOrder')}
          >
            <Icon name="filter" size={18} color={colors.link} />
            <Text style={styles.filterText}>{t('care.list.filter')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabs}>
          {TABS.map((tabDef) => {
            const on = tabDef.key === tab;
            return (
              <TouchableOpacity
                key={tabDef.key}
                onPress={() => setTab(tabDef.key)}
                activeOpacity={0.85}
                style={[styles.tab, on ? styles.tabOn : styles.tabOff]}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t(tabDef.labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('care.list.loading')}>
        {(data) => {
          const list = filter(data.items);
          const nextVisit = data.items.find((a) => a.is_upcoming) ?? null;
          return (
            /**
             * FlatList, not ScrollView + .map().
             *
             * This screen renders every appointment the server returns (50 a
             * page) and each row is a nested View/Text/SVG tree. Mounting them
             * all up front is where the dropped frames come from on a 2 GB
             * budget Android: survivable on the demo dataset, unusable for a
             * patient with three years of history.
             */
            <FlatList
              data={list}
              keyExtractor={keyOf}
              renderItem={renderAppointment}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  refreshing={state.loading && state.data !== null}
                  onRefresh={reload}
                  tintColor={colors.blue}
                />
              }
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={7}
              removeClippedSubviews
              ItemSeparatorComponent={RowGap}
              ListHeaderComponent={
                <View style={styles.listHeader}>
                  <Card>
                    <View style={styles.summary}>
                      <View style={styles.summaryLeft}>
                        <Text style={styles.summaryKicker}>{t('care.list.kickerUpcoming')}</Text>
                        <View style={styles.summaryCountRow}>
                          <Text style={styles.summaryCount}>{data.summary.upcoming}</Text>
                          <Text style={styles.summaryCountLabel}>{t('care.list.countLabel')}</Text>
                        </View>
                      </View>
                      <View style={styles.summaryRight}>
                        <Text style={styles.summaryKicker}>{t('care.list.kickerNextVisit')}</Text>
                        {nextVisit ? (
                          <>
                            <Text style={styles.summaryHeadline}>
                              {relativeDay(t, nextVisit.scheduled_at)} • {formatTime(nextVisit.scheduled_at)}
                            </Text>
                            <Text style={styles.summaryMeta} numberOfLines={1}>
                              {[nextVisit.provider_specialty, nextVisit.facility_name].filter(Boolean).join(' • ') ||
                                typeLabelOf(t, nextVisit.appointment_type)}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.summaryHeadline}>{t('care.list.noneScheduled')}</Text>
                        )}
                      </View>
                    </View>
                  </Card>

                  <SectionHeader
                    title={t(TABS.find((d) => d.key === tab)!.headingKey)}
                    actionLabel={newestFirst ? t('care.list.newestFirst') : t('care.list.oldestFirst')}
                    onAction={() => setNewestFirst((v) => !v)}
                  />
                </View>
              }
              ListEmptyComponent={
                <Card>
                  <EmptyState
                    icon="calendar"
                    tint="blue"
                    title={
                      query
                        ? t('care.list.emptyMatchTitle')
                        : t(TABS.find((d) => d.key === tab)!.emptyTitleKey)
                    }
                    message={
                      query
                        ? t('care.list.emptyMatchMessage')
                        : tab === 'upcoming'
                          ? t('care.list.emptyUpcomingMessage')
                          : t('care.list.emptyOtherMessage')
                    }
                    actionLabel={tab === 'upcoming' && !query ? t('care.appt.findProvider') : undefined}
                    onAction={tab === 'upcoming' && !query ? () => navigation.navigate('FindProvider') : undefined}
                  />
                </Card>
              }
              ListFooterComponent={
                <View style={styles.listFooter}>
                  {tab === 'upcoming' && data.past.length > 0 && (
                    <View>
                      <SectionHeader
                        title={t('care.list.headingPast')}
                        actionLabel={t('care.list.viewAll')}
                        onAction={() => setTab('past')}
                      />
                      <View style={styles.stack}>
                        {data.past.map((a) => (
                          <CompactCard key={a.id} t={t} appointment={a} onPress={() => open(a.id)} />
                        ))}
                      </View>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.helper}
                    activeOpacity={0.85}
                    onPress={() => (list[0] ? open(list[0].id) : navigation.navigate('FindProvider'))}
                  >
                    <View style={styles.helperBody}>
                      <Text style={styles.helperTitle}>{t('care.list.helperTitle')}</Text>
                      <Text style={styles.helperText}>{t('care.list.helperText')}</Text>
                    </View>
                    <Icon name="chevron-right" size={18} color={colors.link} />
                  </TouchableOpacity>
                </View>
              }
            />
          );
        }}
      </AsyncBoundary>
    </View>
  );
}

/** The gap `styles.stack` used to provide, as a list separator. */
function RowGap() {
  return <View style={styles.rowGap} />;
}

function AppointmentListCard({
  t,
  appointment,
  onPress,
}: {
  t: TFunction;
  appointment: PortalAppointment;
  onPress: () => void;
}) {
  const a = appointment;
  const tint = statusTint(a.status);
  const kind = typeLabelOf(t, a.appointment_type);
  return (
    <Card variant="flush" onPress={onPress}>
      <View style={styles.row}>
        <View style={[styles.timeBlock, { backgroundColor: tintMap[tint].bg }]}>
          <Text style={[styles.timeDay, { color: tintMap[tint].fg }]}>{relativeDay(t, a.scheduled_at)}</Text>
          <Text style={styles.timeValue}>{formatTime(a.scheduled_at)}</Text>
          <Text style={styles.timeKind}>{kind}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {a.provider_specialty ? `${a.provider_specialty} ${kind}` : kind}
          </Text>
          <Text style={styles.rowProvider} numberOfLines={1}>
            {a.provider_name ?? a.reason ?? t('care.appt.providerTbd')}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {[a.facility_name, a.location].filter(Boolean).join(' • ') || t('care.appt.locationTbd')}
          </Text>
          <Text style={styles.rowLink}>{t('care.list.viewDetails')}</Text>
          <Text style={styles.rowFootnote}>
            {t('care.list.bookedVia', {
              channel: a.booking_channel === 'patient_app' ? 'OPES EMR' : a.booking_channel.replace(/_/g, ' '),
            })}
          </Text>
        </View>
        <View style={styles.rowTrailing}>
          <StatusPill status={a.status} size="sm" />
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </View>
      </View>
    </Card>
  );
}

function CompactCard({
  t,
  appointment,
  onPress,
}: {
  t: TFunction;
  appointment: PortalAppointment;
  onPress: () => void;
}) {
  const a = appointment;
  const kind = typeLabelOf(t, a.appointment_type);
  return (
    <Card variant="flush" onPress={onPress}>
      <View style={styles.compact}>
        <DateBlock iso={a.scheduled_at} tint={statusTint(a.status)} />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {a.provider_specialty ? `${a.provider_specialty} ${kind}` : kind}
          </Text>
          <Text style={styles.rowProvider} numberOfLines={1}>
            {a.provider_name ?? '—'}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {formatTime(a.scheduled_at)} • {a.facility_name ?? t('care.appt.facilityTbd')}
          </Text>
        </View>
        <View style={styles.rowTrailing}>
          <StatusPill status={a.status} size="sm" />
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  controls: { padding: spacing.md, paddingBottom: 0, gap: spacing.md },
  listHeader: { gap: spacing.md, marginBottom: spacing.sm + 2 },
  listFooter: { gap: spacing.md, marginTop: spacing.md },
  rowGap: { height: spacing.sm + 2 },
  stack: { gap: spacing.sm + 2 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },

  tabs: { flexDirection: 'row', gap: spacing.sm + 2 },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  tabOff: { backgroundColor: colors.surface, borderColor: colors.border },
  tabText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  tabTextOn: { color: colors.textOnBrand },

  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  summaryLeft: { width: 118 },
  summaryRight: { flex: 1, minWidth: 0 },
  summaryKicker: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    letterSpacing: 0.6,
    color: colors.link,
  },
  summaryCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  summaryCount: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
  },
  summaryCountLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  summaryHeadline: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    marginTop: 2,
  },
  summaryMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 4, padding: spacing.md - 2 },
  compact: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4, padding: spacing.md - 2 },
  timeBlock: {
    width: 96,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 2,
  },
  timeDay: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs },
  timeValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  timeKind: { fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.textMuted },

  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  rowProvider: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  rowMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  rowLink: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.link,
    marginTop: 4,
  },
  rowFootnote: {
    // This slot holds a translated SENTENCE with the booking channel spliced
    // in mid-phrase. 'capitalize' upper-cased every word of it, and the
    // channel belongs in lower case where it sits. No transform.
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  rowTrailing: { alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', gap: spacing.md },

  helper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  helperBody: { flex: 1, minWidth: 0 },
  helperTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  helperText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
