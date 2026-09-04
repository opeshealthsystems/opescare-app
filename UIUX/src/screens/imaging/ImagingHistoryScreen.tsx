/**
 * DIA-019 — Imaging History.
 *
 * The complete activity trail for the patient's imaging, from
 * `GET /patient/imaging`. DIA-007 (Imaging Results) is a browser for studies
 * that have a result; this screen is the chronology — every study that was
 * ordered, scheduled, performed, reported or cancelled, newest first, grouped
 * by month, so a patient can answer "when did I last have a scan of this?".
 *
 * It is the destination of the "Activity" tab on the study screens, so it
 * accepts no parameters and always shows the whole record.
 *
 * Composition only: tokens from `theme`, glyphs from `<Icon />`, async
 * plumbing from `../diagnostics/shared`, imaging vocabulary from
 * `./detailShared`. Identifiers stay behind `TechnicalDetails`.
 */
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  fetchImagingStudies,
  type ImagingModality,
  type Page,
  type PortalImagingStudy,
} from '../../api';
import { Card, Chip, EmptyState, Icon, ScreenHeader, StatusBadge } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { getLocale, toBcp47, useTranslation, type TFunction } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { cacheKeys } from '../../lib/offlineCache';
import {
  flagLabel,
  flagTone,
  fmtDate,
  fmtTime,
  statusIcon,
  statusLabel,
  statusTone,
  StudyThumb,
  TechnicalDetails,
} from './detailShared';
import { modalityLabel } from './viewerShared';
import {
  AsyncBoundary,
  DiagButton,
  HeroBand,
  Overline,
  StatGrid,
  useAsync,
  type StatTile,
} from '../diagnostics/shared';

const PER_PAGE = 8;

/** Same vocabulary as DIA-007 so the two screens read as one family. */
const FILTERS: { key: string; modality?: ImagingModality }[] = [
  { key: 'all' },
  { key: 'xray', modality: 'xray' },
  { key: 'ultrasound', modality: 'ultrasound' },
  { key: 'ct', modality: 'ct' },
  { key: 'mri', modality: 'mri' },
  { key: 'other', modality: 'other' },
];

/**
 * "August 2026" / « août 2026 ». The month name is a date, not a string in the
 * catalogue (contract rule 8), so it comes from Intl on the active locale —
 * Hermes ships a full ICU, so this is the same answer on web and on device.
 */
function monthKey(t: TFunction, iso?: string | null): string {
  if (!iso) return t('imaging.history.noDate');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('imaging.history.noDate');
  try {
    return new Intl.DateTimeFormat(toBcp47(getLocale()), {
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    // No ICU (a stripped JSC build): a numeric month beats throwing mid-render.
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
}

type Group = { key: string; rows: PortalImagingStudy[] };

function groupByMonth(t: TFunction, rows: PortalImagingStudy[]): Group[] {
  const groups: Group[] = [];
  for (const row of rows) {
    const key = monthKey(t, row.ordered_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, rows: [row] });
  }
  return groups;
}

/** What happened, in the patient's words — never a raw status token. */
function activityLine(t: TFunction, study: PortalImagingStudy): string {
  switch (study.status) {
    case 'reported':
      return t('imaging.history.activityReported');
    case 'performed':
      return t('imaging.history.activityPerformed');
    case 'scheduled':
      return t('imaging.history.activityScheduled');
    case 'ordered':
      return t('imaging.history.activityOrdered');
    case 'cancelled':
      return t('imaging.history.activityCancelled');
    default:
      return statusLabel(t, study.status);
  }
}

export function ImagingHistoryScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();

  const [filter, setFilter] = useState<string>('all');
  const [limit, setLimit] = useState(PER_PAGE);

  const modality = FILTERS.find((f) => f.key === filter)?.modality;
  const state = useAsync<Page<PortalImagingStudy>>(
    () => fetchImagingStudies({ modality, per_page: 100 }),
    [modality],
    { cacheKey: cacheKeys.imagingHistory(filter) }
  );

  const openStudy = (study: PortalImagingStudy) =>
    study.has_report
      ? navigation.navigate('ImagingResultDetail', { studyId: study.id })
      : navigation.navigate('ImagingOrderDetail', { orderId: study.id });

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.history.navTitle')}
        align="center"
        actions={[
          { icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications') },
          { icon: 'more-vertical', onPress: () => navigation.navigate('DiagnosticsDashboard') },
        ]}
      />

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
        <HeroBand
          title={t('imaging.history.title')}
          subtitle={t('imaging.history.subtitle')}
          icon="history"
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={
                f.key === 'all'
                  ? t('imaging.results.filterAll')
                  : f.key === 'other'
                    ? t('imaging.results.filterOthers')
                    : modalityLabel(t, f.key)
              }
              selected={f.key === filter}
              onPress={() => {
                setFilter(f.key);
                setLimit(PER_PAGE);
              }}
            />
          ))}
        </ScrollView>

        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('imaging.history.loading')}
        >
          {(page) => <HistoryBody page={page} limit={limit} onMore={() => setLimit((n) => n + PER_PAGE)} onOpen={openStudy} filtered={filter !== 'all'} onClearFilter={() => setFilter('all')} onBook={() => navigation.navigate('BookImagingStudy')} onResults={() => navigation.navigate('ImagingResults')} />}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

function HistoryBody({
  page,
  limit,
  filtered,
  onMore,
  onOpen,
  onClearFilter,
  onBook,
  onResults,
}: {
  page: Page<PortalImagingStudy>;
  limit: number;
  filtered: boolean;
  onMore: () => void;
  onOpen: (s: PortalImagingStudy) => void;
  onClearFilter: () => void;
  onBook: () => void;
  onResults: () => void;
}) {
  const { t } = useTranslation();
  const rows = page.data;

  // Counts are derived from the studies actually returned — never assumed.
  // `t` is in the dependency list: without it the memo would hold English
  // labels after a language switch (contract rule 3).
  const tiles = useMemo<StatTile[]>(() => {
    const reported = rows.filter((s) => s.status === 'reported').length;
    const awaiting = rows.filter((s) => s.status === 'performed').length;
    const upcoming = rows.filter((s) => s.status === 'ordered' || s.status === 'scheduled').length;
    return [
      {
        key: 'total',
        label: t('imaging.history.tileStudies'),
        value: rows.length,
        icon: 'image',
        tint: 'blue',
      },
      {
        key: 'reported',
        label: t('imaging.history.tileReported'),
        value: reported,
        icon: 'check-circle',
        tint: 'green',
      },
      {
        key: 'awaiting',
        label: t('imaging.history.tileAwaiting'),
        value: awaiting,
        icon: 'clock',
        tint: 'amber',
      },
      {
        key: 'upcoming',
        label: t('imaging.history.tileUpcoming'),
        value: upcoming,
        icon: 'calendar',
        tint: 'purple',
      },
    ];
  }, [rows, t]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="history"
        tint="blue"
        title={filtered ? t('imaging.history.filteredTitle') : t('imaging.history.emptyTitle')}
        message={filtered ? t('imaging.history.filteredBody') : t('imaging.history.emptyBody')}
        actionLabel={filtered ? t('imaging.history.filteredCta') : t('imaging.history.emptyCta')}
        onAction={filtered ? onClearFilter : onBook}
      />
    );
  }

  const shown = rows.slice(0, limit);
  const groups = groupByMonth(t, shown);

  return (
    <>
      <StatGrid tiles={tiles} />

      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <Overline label={group.key} style={styles.groupHead} />

          {group.rows.map((study) => {
            const flag = flagLabel(t, study);
            return (
              /*
                The card is the outer element and the touchable is INSIDE it,
                not the other way round. `TechnicalDetails` is a disclosure
                with its own button, and it used to sit inside this row's
                touchable — which on the web build renders a <button> inside a
                <button>. That is invalid HTML: the browser hoists the inner
                control out during parsing, so the "Technical details" toggle
                either does nothing or opens the study instead of expanding.
                Keeping the disclosure a SIBLING of the touchable is what makes
                the two targets separable. Do not nest it back inside.
              */
              <Card key={study.id}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => onOpen(study)}
                  accessibilityRole="button"
                  accessibilityLabel={`${study.study_name}, ${activityLine(t, study)}`}
                >
                  <View style={styles.row}>
                    <View style={styles.rail}>
                      <View style={styles.railDot} />
                      <View style={styles.railLine} />
                    </View>

                    <StudyThumb url={study.thumbnail_url} width={56} height={64} />

                    <View style={styles.body}>
                      <Text style={styles.title} numberOfLines={2}>
                        {study.study_name}
                      </Text>
                      <Text style={styles.date}>
                        {fmtDate(study.ordered_at)}  •  {fmtTime(study.ordered_at)}
                      </Text>
                      <Text style={styles.activity} numberOfLines={1}>
                        {activityLine(t, study)}
                      </Text>
                      <Text style={styles.place} numberOfLines={1}>
                        {study.location ??
                          study.facility_name ??
                          t('imaging.common.facilityFallback')}
                      </Text>

                      <View style={styles.badgeRow}>
                        <StatusBadge
                          status={statusLabel(t, study.status)}
                          tone={statusTone(study.status)}
                          icon={statusIcon(study.status)}
                          size="sm"
                        />
                        {!!flag && (
                          <StatusBadge status={flag} tone={flagTone(study.result_flag)} size="sm" />
                        )}
                      </View>

                      {!!study.impression && (
                        <Text style={styles.impression} numberOfLines={2}>
                          {study.impression}
                        </Text>
                      )}
                    </View>

                    <Icon name="chevron-right" size={18} color={colors.link} />
                  </View>
                </TouchableOpacity>

                <View style={styles.techSlot}>
                  <TechnicalDetails
                    facts={[
                      { label: t('imaging.tech.scanType'), value: study.modality_label },
                      {
                        label: t('imaging.tech.accessionNumber'),
                        value: study.accession_number,
                      },
                      { label: t('imaging.tech.orderReference'), value: study.order_number },
                      { label: t('imaging.tech.studyUid'), value: study.study_uid },
                    ]}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      ))}

      {rows.length > shown.length && (
        <TouchableOpacity onPress={onMore} activeOpacity={0.75} style={styles.loadMore} accessibilityRole="button">
          <Text style={styles.loadMoreText}>{t('imaging.history.showEarlier')}</Text>
          <Icon name="chevron-down" size={18} color={colors.link} />
        </TouchableOpacity>
      )}

      <DiagButton
        label={t('imaging.history.backToResults')}
        icon="image"
        variant="secondary"
        onPress={onResults}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },

  chipRow: { gap: spacing.sm, paddingRight: spacing.md },

  group: { gap: spacing.sm },
  groupHead: { paddingTop: spacing.xs },

  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },

  rail: { width: 10, alignItems: 'center', alignSelf: 'stretch', paddingTop: 6 },
  railDot: { width: 10, height: 10, borderRadius: radii.pill, backgroundColor: colors.blue },
  railLine: { flex: 1, width: 2, backgroundColor: colors.divider, marginTop: 4 },

  body: { flex: 1, minWidth: 0, gap: 2 },
  /* Indented to the body column so the disclosure still lines up with the
     text now that it hangs off the card rather than out of the row. */
  techSlot: { marginLeft: 10 + 56 + spacing.sm * 2 },
  title: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.md,
    color: colors.textPrimary,
  },
  date: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },
  activity: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  place: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  impression: {
    marginTop: spacing.xs,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  loadMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  loadMoreText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },
});
