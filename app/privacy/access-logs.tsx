import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  a11yJoin,
  Card,
  CardStack,
  Chip,
  EmptyState,
  formatDate,
  formatLabel,
  formatTime,
  GradientButton,
  Icon,
  ListRow,
  radii,
  ScreenHeader,
  SectionHeader,
  spacing,
  StaleNotice,
  StatusBadge,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import type { AccessLogItem } from '../../lib/api/queries';
import { useAccessLogHistory } from '../../lib/api/privacyQueries';
import { useIsOnline } from '../../lib/offline/connectivity';

/**
 * Access log — the privacy centrepiece, on the OPES kit.
 *
 * Every entry answers the four questions a patient asks of an audit log:
 *   WHO   — the facility that opened the record, or the patient themselves,
 *           or the platform for automated processes (`facility` + `purpose`).
 *   WHEN  — the exact date and time (`created_at`), under a day heading.
 *   WHERE — the facility name and type (`facility.name` / `facility.type`).
 *   WHY   — the recorded purpose, with the data category and the kind of
 *           access (`purpose`, `data_category`, `access_type`).
 *
 * WHY is the one that was not being answered. `access_logs.purpose` is a
 * compound audit value — `treatment:treating_clinician`,
 * `emergency:break_glass:<event id>` — and this screen title-cased the whole
 * string, so the line meant to tell a patient why their record was opened read
 * `Treatment:treating clinician`, in English in both locales. It is now
 * resolved by the server, both halves, in the patient's language, out of
 * lang/{en,fr}/access_log.php; the raw value still travels beside the label
 * because an audit trail records what happened, not how it is worded.
 *
 * The API returns no clinician name (only `actor_id`/`actor_type`), so no
 * person is ever named here — inventing one would be a fabrication in an audit
 * trail. Counts come from a real total, and the summary is only shown once the
 * whole history is loaded, so a number can never describe one page while
 * appearing to describe everything; until then the screen says how many of how
 * many it holds, and that the filters only cover those.
 *
 * Presentation: `ScreenHeader`, a `StaleNotice` when the refresh failed or
 * there is no connection (the entries on screen are then *old* entries, and an
 * audit log that looks live but isn't is a safety problem), the append-only
 * assurance, a summary card, counted filter `Chip`s, then day-grouped
 * `SectionHeader variant="overline"` + `Card variant="flush"` stacks of
 * `ListRow`s, each with a `StatusBadge` for the access type. Colours come from
 * `useTheme()` — the OpesCare brand, not the kit's template blue.
 *
 * Glyph substitutions, the kit carrying its own outline set: `Eye` → `eye`,
 * `FilePlus` → `folder-plus`, `Pencil` → `edit`, `ShieldAlert` → `shield`,
 * `Siren` → `alert-triangle`, `Smartphone` → `person`, `Activity` → `activity`,
 * `Building2` → `building`, `History` → `history`.
 */

type FilterValue = 'all' | 'facility' | 'self' | 'emergency';

const FILTERS: FilterValue[] = ['all', 'facility', 'self', 'emergency'];

const FILTER_ICON: Record<FilterValue, IconName> = {
  all: 'history',
  facility: 'building',
  self: 'person',
  emergency: 'alert-triangle',
};

/** Icon, tint circle and badge tone per recorded access type; anything
 * unrecognised falls back to a neutral "activity". */
const ACCESS_TYPE_META: Record<string, { icon: IconName; tint: Tint; tone: StatusTone }> = {
  view: { icon: 'eye', tint: 'blue', tone: 'pending' },
  create: { icon: 'folder-plus', tint: 'blue', tone: 'pending' },
  update: { icon: 'edit', tint: 'amber', tone: 'warning' },
  approve: { icon: 'check-circle', tint: 'green', tone: 'normal' },
  reject: { icon: 'x-circle', tint: 'red', tone: 'critical' },
  download: { icon: 'download', tint: 'blue', tone: 'pending' },
  override: { icon: 'shield', tint: 'red', tone: 'critical' },
};

const FALLBACK_META: { icon: IconName; tint: Tint; tone: StatusTone } = {
  icon: 'activity',
  tint: 'blue',
  tone: 'neutral',
};

/** `patient_request` is written only by the patient's own governance actions
 * (see DataExportService / CorrectionRequestService), so an entry with that
 * purpose and no facility is the patient acting in this app. */
function actorKind(item: AccessLogItem): 'facility' | 'self' | 'platform' {
  if (item.facility) return 'facility';
  if (item.purpose === 'patient_request') return 'self';
  return 'platform';
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type DayGroup = { key: string; label: string; items: AccessLogItem[] };
type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** Coarse "how long ago", matching the wording used by the offline banner. */
function relativeTime(date: Date, t: TFn): string {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return t('privacy.time.justNow');
  if (minutes < 60) return t('privacy.time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('privacy.time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('privacy.time.daysAgo', { count: days });
  return t('privacy.time.monthsAgo', { count: Math.floor(days / 30) });
}

export default function AccessLogsScreen() {
  usePrivateScreen();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isOnline = useIsOnline();
  const [filter, setFilter] = useState<FilterValue>('all');

  const history = useAccessLogHistory();
  const entries = useMemo(() => history.data?.entries ?? [], [history.data]);
  const total = history.data?.total ?? 0;
  const complete = history.data?.complete ?? false;

  const counts = useMemo(() => {
    let facility = 0;
    let self = 0;
    let emergency = 0;
    const facilities = new Set<string>();
    for (const entry of entries) {
      if (entry.emergency_access) emergency += 1;
      const kind = actorKind(entry);
      if (kind === 'facility') {
        facility += 1;
        if (entry.facility) facilities.add(entry.facility.id);
      } else if (kind === 'self') {
        self += 1;
      }
    }
    return {
      all: entries.length,
      facility,
      self,
      emergency,
      facilities: facilities.size,
    };
  }, [entries]);

  const visible = useMemo(() => {
    if (filter === 'all') return entries;
    if (filter === 'emergency') return entries.filter((e) => e.emergency_access);
    return entries.filter((e) => actorKind(e) === filter);
  }, [entries, filter]);

  /**
   * Day headings. Today and Yesterday are named; every older day carries its
   * own date, so the log reads as a diary rather than one undifferentiated
   * "Earlier" pile. Entries already arrive newest-first from the API.
   */
  const groups = useMemo<DayGroup[]>(() => {
    const now = new Date();
    const yesterdayRef = new Date(now);
    yesterdayRef.setDate(yesterdayRef.getDate() - 1);

    const order: string[] = [];
    const byKey = new Map<string, DayGroup>();

    for (const item of visible) {
      const date = new Date(item.created_at);
      const valid = !Number.isNaN(date.getTime());
      const key = valid ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : 'unknown';
      const label = !valid
        ? t('notifications.sectionEarlier')
        : isSameDay(date, now)
          ? t('notifications.sectionToday')
          : isSameDay(date, yesterdayRef)
            ? t('notifications.sectionYesterday')
            : formatDate(date);

      if (!byKey.has(key)) {
        byKey.set(key, { key, label, items: [] });
        order.push(key);
      }
      byKey.get(key)!.items.push(item);
    }

    return order.map((key) => byKey.get(key)!);
  }, [t, visible]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/privacy');
  };

  // A failed refresh — or no connection at all — over entries already on
  // screen must say so: an audit log that looks current but is not is exactly
  // the thing a patient must not learn later.
  const loadedAt = history.dataUpdatedAt ? new Date(history.dataUpdatedAt) : null;
  const showStale = entries.length > 0 && (history.isError || !isOnline);
  const staleMessage = !isOnline ? t('offline.statusOffline') : t('privacy.accessLogsErrorBody');

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title={t('privacy.accessLogsTitle')} subtitle={t('privacy.accessLogsSubtitle')} onBack={goBack} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={history.isRefetching && !history.isFetchingNextPage}
            onRefresh={() => history.refetch()}
            tintColor={colors.blue}
            colors={[colors.blue]}
          />
        }
      >
        {showStale ? (
          <StaleNotice
            message={staleMessage}
            loadedAt={loadedAt}
            onRetry={() => history.refetch()}
            retrying={history.isRefetching}
          />
        ) : null}

        {/* Append-only. Kept verbatim — it is the promise the log rests on. */}
        <Notice
          tone="pending"
          icon="shield-check"
          title={t('privacy.accessLogsAssuranceTitle')}
          body={t('privacy.accessLogsAssuranceBody')}
        />

        {history.isLoading ? (
          <Card>
            <View style={styles.loading} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.blue} />
              <Text style={styles.loadingText}>{t('privacy.accessLogsLoading')}</Text>
            </View>
          </Card>
        ) : history.isError && entries.length === 0 ? (
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('privacy.accessLogsErrorTitle')}
              message={t('privacy.accessLogsErrorBody')}
              actionLabel={t('privacy.retry')}
              onAction={() => history.refetch()}
            />
          </Card>
        ) : entries.length === 0 ? (
          <Card variant="flush">
            <EmptyState
              icon="shield-check"
              tint="green"
              title={t('privacy.accessLogsEmptyTitle')}
              message={t('privacy.accessLogsEmptyBody')}
            />
          </Card>
        ) : (
          <>
            {/* ── Summary ─────────────────────────────────────────────────
                Only exact once the whole history is loaded; until then the
                screen says what it actually holds instead of implying a total
                it cannot see. */}
            {complete ? (
              <CardStack spacing="sm">
                <Card variant="flush">
                  <SummaryRow icon="history" tint="blue" label={t('privacy.summaryTotal')} value={total} />
                </Card>
                <Card variant="flush">
                  <SummaryRow
                    icon="building"
                    tint="purple"
                    label={t('privacy.summaryFacilities')}
                    value={counts.facilities}
                  />
                </Card>
                <Card variant="flush">
                  <SummaryRow
                    icon="alert-triangle"
                    tint={counts.emergency > 0 ? 'amber' : 'green'}
                    label={t('privacy.summaryEmergency')}
                    value={counts.emergency}
                  />
                </Card>
              </CardStack>
            ) : (
              <Card variant="flush">
                <ListRow
                  icon="history"
                  tint="blue"
                  title={t('privacy.loadedOf', {
                    loaded: entries.length,
                    total,
                  })}
                  subtitle={t('privacy.filterScopeNote')}
                  chevron={false}
                />
              </Card>
            )}

            {/* Counted filter row — "All 12 · Facilities 9 …" */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chips}
            >
              {FILTERS.map((value) => (
                <Chip
                  key={value}
                  label={t(`privacy.logFilter.${value}`)}
                  count={counts[value]}
                  icon={FILTER_ICON[value]}
                  selected={value === filter}
                  onPress={() => setFilter(value)}
                />
              ))}
            </ScrollView>

            {visible.length === 0 ? (
              <Card variant="flush">
                <EmptyState
                  icon="history"
                  tint="blue"
                  title={t('privacy.filterEmptyTitle')}
                  message={t('privacy.filterEmptyBody')}
                  actionLabel={t('privacy.logFilter.all')}
                  onAction={() => setFilter('all')}
                />
              </Card>
            ) : (
              groups.map((group) => (
                <View key={group.key}>
                  <SectionHeader title={group.label} variant="overline" />
                  <CardStack spacing="sm">
                    {group.items.map((item) => (
                      <Card key={item.id} variant="flush">
                        <AccessLogEntry item={item} />
                      </Card>
                    ))}
                  </CardStack>
                </View>
              ))
            )}

            {history.hasNextPage ? (
              <GradientButton
                label={t('privacy.loadMore')}
                onPress={() => history.fetchNextPage()}
                loading={history.isFetchingNextPage}
                disabled={history.isFetchingNextPage}
                icon="none"
              />
            ) : null}

            {/* Kept verbatim: you are told about an emergency override, you do
                not have to come here to find out. */}
            <Notice tone="neutral" icon="alert-triangle" body={t('privacy.emergencyAlertNote')} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/**
 * One recorded access. The row carries who, from where and when plus the
 * access-type badge; the strip under it carries the reason the facility gave
 * and the data category, because "why" is the part a patient actually reads.
 */
function AccessLogEntry({ item }: { item: AccessLogItem }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const meta = ACCESS_TYPE_META[item.access_type] ?? FALLBACK_META;
  const emergency = item.emergency_access;

  const kind = actorKind(item);
  const who =
    kind === 'facility'
      ? (item.facility?.name ?? t('privacy.unknownFacility'))
      : kind === 'self'
        ? t('privacy.actorYou')
        : t('privacy.viaPlatform');

  const whoDetail =
    kind === 'facility'
      ? item.facility?.type
        ? t(`privacy.facilityType.${item.facility.type}`, {
            defaultValue: formatLabel(item.facility.type),
          })
        : t('privacy.facilityGeneric')
      : kind === 'self'
        ? t('privacy.actorYouDetail')
        : t('privacy.actorPlatformDetail');

  const when = new Date(item.created_at);
  const validWhen = !Number.isNaN(when.getTime());
  // The day heading above already carries the date, so the row says the clock
  // time and how long ago that was — the two things a heading cannot.
  const clock = validWhen ? formatTime(when) : undefined;
  const ago = validWhen ? relativeTime(when, t as TFn) : undefined;

  const accessLabel = t(`privacy.accessType.${item.access_type}`, {
    defaultValue: formatLabel(item.access_type),
  });

  // Both from the server (App\Support\PatientVocabulary → lang/*/access_log.php).
  //
  // `purpose` is a compound audit value — `treatment:treating_clinician`,
  // `emergency:break_glass:<event id>` — and this screen used to title-case the
  // whole thing, so the line answering "why was my record opened?" read
  // `Treatment:treating clinician`, in English in both locales. Both halves are
  // now words: "Your care and treatment — they had treated you".
  //
  // A value with no entry in that vocabulary comes back verbatim with
  // `purpose_recognised: false`, and is shown verbatim. An audit line is the
  // last place to smooth over a code nobody can explain.
  const categoryLabel = item.data_category_label ?? formatLabel(item.data_category);
  const purposeLabel = item.purpose_label ?? formatLabel(item.purpose);
  const purposeNote = item.purpose_recognised === false ? item.purpose_note : null;

  return (
    <View>
      <ListRow
        icon={emergency ? 'shield' : meta.icon}
        tint={emergency ? 'red' : meta.tint}
        title={who}
        meta={[whoDetail, clock, ago]}
        chevron={false}
        accessibilityLabel={a11yJoin(
          emergency && t('privacy.emergencyAccess'),
          who,
          whoDetail,
          accessLabel,
          categoryLabel,
          clock,
          ago,
        )}
        trailing={
          <View style={styles.trailing}>
            <StatusBadge
              status={item.access_type}
              tone={emergency ? 'critical' : meta.tone}
              label={accessLabel}
              size="sm"
            />
            {emergency ? (
              <StatusBadge
                status="emergency"
                tone="critical"
                label={t('privacy.emergencyAccess')}
                icon="alert-triangle"
                size="sm"
              />
            ) : null}
          </View>
        }
      />

      <View style={styles.detail}>
        <Text style={styles.detailLabel}>{t('privacy.reasonGiven')}</Text>
        <Text style={styles.detailValue}>{purposeLabel}</Text>
        {purposeNote ? <Text style={styles.detailNote}>{purposeNote}</Text> : null}
        <View style={styles.chipRow}>
          <Chip label={categoryLabel} />
        </View>
      </View>
    </View>
  );
}

/** One summary figure, as a row: tint circle, label, count. */
function SummaryRow({ icon, tint, label, value }: { icon: IconName; tint: Tint; label: string; value: number }) {
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ListRow
      icon={icon}
      tint={tint}
      title={label}
      chevron={false}
      accessibilityLabel={`${value} ${label}`}
      trailing={<Text style={[styles.statValue, { color: tintMap[tint].fg }]}>{String(value)}</Text>}
    />
  );
}

/** Tinted inline notice: icon in a status circle, optional title, body. */
function Notice({ tone, icon, title, body }: { tone: StatusTone; icon: IconName; title?: string; body: string }) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = statusMap[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: skin.bg }]}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.noticeIcon}>
        <Icon name={icon} size={20} color={skin.fg} />
      </View>
      <View style={styles.noticeBody}>
        {title ? <Text style={[styles.noticeTitle, { color: skin.fg }]}>{title}</Text> : null}
        <Text style={styles.noticeText}>{body}</Text>
      </View>
    </View>
  );
}

// ── Styles (colour-dependent, built per palette) ───────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: {
      padding: spacing.md,
      paddingTop: 0,
      gap: spacing.md,
      paddingBottom: spacing.xxl,
    },

    loading: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    statValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
    },

    // Bleeds to the screen edges so the chips scroll under the gutter.
    chipsScroll: { flexGrow: 0, marginHorizontal: -spacing.md },
    chips: { paddingHorizontal: spacing.md, gap: spacing.sm },

    trailing: { alignItems: 'flex-end', gap: spacing.xs },

    // Entry detail strip
    detail: {
      paddingHorizontal: spacing.md,
      paddingBottom: 14,
      marginTop: -spacing.sm,
    },
    detailLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    detailValue: {
      marginTop: spacing.xs,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    // Shown only under a purpose code OpesCare has no name for: it says the
    // value above is the raw record, not a rendering of one.
    detailNote: {
      marginTop: spacing.xs,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: 17,
      color: colors.textSecondary,
    },
    chipRow: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },

    // Inline notice
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      padding: spacing.md,
      borderRadius: radii.md,
    },
    noticeIcon: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noticeBody: { flex: 1, minWidth: 0, gap: 2 },
    noticeTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    noticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
  });
