import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  a11yJoin,
  Card,
  Chip,
  EmptyState,
  formatDate,
  formatTime,
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
  type Tint,
} from '@/components/opes-ui';
import { Screen } from '../components/ui/Screen';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type NotificationItem,
} from '../lib/api/queries';
import { useUnreadNotificationCount } from '../lib/api/appConfigQueries';
import { useIsOnline } from '../lib/offline/connectivity';

/**
 * Notification Center — the OPES `NotificationsScreen` (MSG-001) layout on
 * this app's data layer.
 *
 * Presentation: `ScreenHeader` with a "Mark all read" right action, a counted
 * filter-chip row, Today / Yesterday / Earlier `SectionHeader` overlines, one
 * `Card variant="flush"` of `ListRow`s per day, an unread dot in the trailing
 * column, a `StatusBadge` on high-severity items, `StaleNotice` when offline or
 * when a refresh fails over data already on screen, and `EmptyState`s that
 * change copy when the emptiness is caused by the active filter.
 *
 * Data: everything comes from GET /mobile/notifications. Two things the API
 * gives us are deliberately NOT rendered as-is:
 *
 *  - **`action_url` is sometimes a web-portal path** (`/portals/patient/logs`,
 *    `/portals/patient/health-id`) rather than an app route. Pushing one of
 *    those into the router would 404, so they are mapped to the equivalent
 *    screen here and ignored when there is no equivalent (`destinationFor`).
 *    Most emitters, though, send a path this app really has — the live server
 *    sends `/labs/<order>`, `/labs`, `/appointments`, `/privacy` and
 *    `/prescriptions` — and those are honoured, but only after being matched
 *    against `IN_APP_ROOTS`. An allow-list, not a passthrough: `action_url` is
 *    server-supplied text and must never be able to steer the router at will.
 *  - **`action_label` is hardcoded English** on the API side ("View Access
 *    Logs"), so rendering it would put English into the French app. The label
 *    is taken from this app's own translations for the resolved destination and
 *    is spoken as the row's accessibility hint.
 *
 * A record with nothing in it still gets a real screen, not a blank one: the
 * empty state is a full `EmptyState` with a next step (notification
 * preferences). (The seeded demo patients DO carry notifications now — the
 * note that used to say otherwise was written before the demo seeders landed.
 * Checked 2026-09-07 against finder.opescare.cloud.)
 */

type Category = 'all' | 'appointments' | 'health' | 'messages' | 'system';

/** In-app destination + the translation key naming it. */
interface Destination {
  route: string;
  labelKey: string;
}

/**
 * The portal paths the API actually emits today
 * (EmergencyAccessAlertNotification, HealthIdExpiryNotification), mapped to
 * this app's equivalent screens.
 */
const PORTAL_PATH_ROUTES: Record<string, Destination> = {
  '/portals/patient/logs': { route: '/privacy/access-logs', labelKey: 'notifications.action.accessLogs' },
  '/portals/patient/health-id': { route: '/(tabs)/health-id', labelKey: 'notifications.action.healthId' },
};

/**
 * The `action_url` shapes this app is willing to follow, and the translation
 * that names where each one goes.
 *
 * The API's own `action_url` is usually a perfectly good in-app path — the
 * live server sends `/labs/<order-id>`, `/labs`, `/appointments`, `/privacy`
 * and `/prescriptions` — but it is server text, so it is matched against this
 * table rather than pushed as given. Anything that does not match is dropped
 * and the `type` fallback below decides instead.
 *
 * `child` says what may follow the root, and every accepted shape is a real
 * file under `app/`:
 *   'none'   the root only              (`/health-id`)
 *   'id'     the root, or root + one id (`/labs`, `/labs/<order>` → labs/[id])
 *   [names]  the root, or these exact children (`/privacy/access-logs`)
 * A second segment is never waved through, so a path the app has no screen for
 * cannot reach the router and land on expo-router's not-found page.
 */
const IN_APP_ROOTS: Record<string, { labelKey: string; child: 'none' | 'id' | readonly string[] }> = {
  labs: { labelKey: 'notifications.action.labs', child: 'id' },
  appointments: { labelKey: 'notifications.action.appointments', child: 'id' },
  prescriptions: { labelKey: 'notifications.action.prescriptions', child: 'id' },
  messages: { labelKey: 'notifications.action.messages', child: 'id' },
  family: { labelKey: 'notifications.action.family', child: 'id' },
  privacy: { labelKey: 'privacy.title', child: ['access', 'access-logs', 'export'] },
  'health-id': { labelKey: 'notifications.action.healthId', child: 'none' },
};

/** Fallback by notification `type`, for the emitters that send no action at all. */
const TYPE_ROUTES: { match: string; destination: Destination }[] = [
  { match: 'appointment', destination: { route: '/appointments', labelKey: 'notifications.action.appointments' } },
  { match: 'prescription', destination: { route: '/prescriptions', labelKey: 'notifications.action.prescriptions' } },
  { match: 'health_id', destination: { route: '/(tabs)/health-id', labelKey: 'notifications.action.healthId' } },
  { match: 'message', destination: { route: '/(tabs)/messages', labelKey: 'notifications.action.messages' } },
  { match: 'family', destination: { route: '/family', labelKey: 'notifications.action.family' } },
  { match: 'emergency', destination: { route: '/privacy/access-logs', labelKey: 'notifications.action.accessLogs' } },
  { match: 'security', destination: { route: '/privacy/access-logs', labelKey: 'notifications.action.accessLogs' } },
  // Laboratory and consent notifications carry no 'appointment'/'prescription'
  // word, so before these two lines every `lab_*` and `consent_*` row on a real
  // record was a tap that did nothing at all — four of the six the demo patient
  // holds, the consent request among them.
  { match: 'lab', destination: { route: '/labs', labelKey: 'notifications.action.labs' } },
  { match: 'consent', destination: { route: '/privacy', labelKey: 'privacy.title' } },
];

/**
 * An `action_url` this app can actually open, or null.
 *
 * Relative in-app path only: anything absolute (`http…`), protocol-relative
 * (`//host`) or shaped unlike an entry in `IN_APP_ROOTS` is refused.
 */
function inAppDestination(actionUrl: string | null | undefined): Destination | null {
  if (!actionUrl || !actionUrl.startsWith('/') || actionUrl.startsWith('//')) return null;
  const segments = actionUrl.split('?')[0].split('#')[0].split('/').filter(Boolean);
  if (segments.length === 0 || segments.length > 2) return null;
  const entry = IN_APP_ROOTS[segments[0]];
  if (!entry) return null;
  const child = segments[1];
  if (child !== undefined) {
    if (entry.child === 'none') return null;
    if (entry.child !== 'id' && !entry.child.includes(child)) return null;
  }
  // Rebuilt from the matched segments, not passed through: any query string or
  // fragment the server appended is dropped rather than forwarded.
  // (String concat, not a `/${…}` template — `scripts/nav-audit.mjs` reads one
  // of those as a literal route and reports it as dangling.)
  return { route: '/' + segments.join('/'), labelKey: entry.labelKey };
}

/** Every route this returns is a real file under `app/` — no dead taps. */
function destinationFor(item: NotificationItem): Destination | null {
  if (item.action_url && PORTAL_PATH_ROUTES[item.action_url]) {
    return PORTAL_PATH_ROUTES[item.action_url];
  }
  const inApp = inAppDestination(item.action_url);
  if (inApp) return inApp;
  const type = item.type?.toLowerCase() ?? '';
  return TYPE_ROUTES.find((entry) => type.includes(entry.match))?.destination ?? null;
}

/** Kit glyph for the tint circle, by notification `type`. */
function iconForType(type: string | null | undefined): IconName {
  const value = type?.toLowerCase() ?? '';
  if (value.includes('emergency') || value.includes('security')) return 'shield';
  if (value.includes('blood')) return 'droplet';
  if (value.includes('health_id')) return 'id-card';
  if (value.includes('appointment') || value.includes('booking')) return 'calendar';
  if (value.includes('lab')) return 'flask';
  if (value.includes('prescription') || value.includes('pharmacy') || value.includes('medication')) return 'pill';
  if (value.includes('family')) return 'users';
  if (value.includes('message')) return 'chat';
  if (value.includes('consent') || value.includes('access')) return 'lock';
  if (value.includes('document')) return 'document';
  if (value.includes('payment') || value.includes('invoice') || value.includes('billing')) return 'receipt';
  if (value.includes('tip')) return 'bulb';
  return 'bell';
}

/**
 * Tint circle by notification `type`, per DESIGN_SPEC §1: red for critical
 * alerts (blood / emergency / security), green for pharmacy, prescriptions,
 * medications and labs, blue for appointments, Health ID and documents (the
 * default), purple for messages, consultations and referrals, amber for
 * reminders and expiries. Returns null when the type says nothing.
 */
function tintForType(type: string | null | undefined): Tint | null {
  const value = type?.toLowerCase() ?? '';
  if (value.includes('blood') || value.includes('emergency') || value.includes('security')) return 'red';
  if (
    value.includes('pharmacy') ||
    value.includes('prescription') ||
    value.includes('medication') ||
    value.includes('lab')
  ) {
    return 'green';
  }
  if (value.includes('appointment') || value.includes('booking') || value.includes('health_id') || value.includes('document')) {
    return 'blue';
  }
  if (value.includes('message') || value.includes('consult') || value.includes('referral')) return 'purple';
  if (value.includes('reminder') || value.includes('expir') || value.includes('renew')) return 'amber';
  return null;
}

/**
 * `severity` is `high | medium | normal` (MobileNotificationController). A
 * high-severity item is a critical alert whatever its type; otherwise the type
 * decides, and a medium-severity item of unknown type reads as a warning.
 */
function tintFor(item: NotificationItem): Tint {
  if (item.severity === 'high') return 'red';
  return tintForType(item.type) ?? (item.severity === 'medium' ? 'amber' : 'blue');
}

function iconForCategory(category: Category): IconName {
  switch (category) {
    case 'appointments':
      return 'calendar';
    case 'health':
      return 'heart-pulse';
    case 'messages':
      return 'chat';
    case 'system':
      return 'settings';
    default:
      return 'bell';
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

type SectionKey = 'today' | 'yesterday' | 'earlier';

const SECTION_LABEL_KEY: Record<SectionKey, string> = {
  today: 'notifications.sectionToday',
  yesterday: 'notifications.sectionYesterday',
  earlier: 'notifications.sectionEarlier',
};

/**
 * Trailing timestamp. Rows already sit under a "TODAY" / "YESTERDAY" overline,
 * so those show the clock only; older rows show the date. Both come from the
 * kit formatters, so they read exactly as the web portal prints them.
 */
function whenLabel(iso: string | null, sectionKey: SectionKey): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return sectionKey === 'earlier' ? formatDate(date) : formatTime(date);
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, statusMap, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isOnline = useIsOnline();
  const [filter, setFilter] = useState<Category>('all');

  const { data, isLoading, isError, refetch, isRefetching, dataUpdatedAt } = useNotifications();
  // The lightweight badge count keeps the header subtitle honest while the
  // full list is still loading; once the list is here it is the source of truth.
  const badgeCount = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = useMemo(() => data?.data ?? [], [data]);
  const unreadCount = data ? (data.unread_count ?? 0) : badgeCount;

  const counts = useMemo(() => {
    const base: Record<Category, number> = {
      all: items.length,
      appointments: 0,
      health: 0,
      messages: 0,
      system: 0,
    };
    for (const item of items) {
      if (item.category in base) base[item.category as Category] += 1;
    }
    return base;
  }, [items]);

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((n) => n.category === filter)),
    [items, filter],
  );

  const groups = useMemo(() => {
    const now = new Date();
    const yesterdayRef = new Date(now);
    yesterdayRef.setDate(yesterdayRef.getDate() - 1);

    const byKey = new Map<SectionKey, NotificationItem[]>();

    for (const item of filtered) {
      let key: SectionKey = 'earlier';
      if (item.created_at) {
        const date = new Date(item.created_at);
        if (!Number.isNaN(date.getTime())) {
          if (isSameDay(date, now)) key = 'today';
          else if (isSameDay(date, yesterdayRef)) key = 'yesterday';
        }
      }
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(item);
    }

    // Fixed Today / Yesterday / Earlier order, empty buckets skipped. Items
    // already arrive newest-first from the API within each bucket.
    return (['today', 'yesterday', 'earlier'] as const)
      .filter((key) => byKey.has(key))
      .map((key) => ({ key, items: byKey.get(key)! }));
  }, [filtered]);

  const chips: { key: Category; label: string }[] = [
    { key: 'all', label: t('notifications.filterAll') },
    { key: 'appointments', label: t('notifications.filterAppointments') },
    { key: 'messages', label: t('notifications.filterMessages') },
    { key: 'health', label: t('notifications.filterHealth') },
    { key: 'system', label: t('notifications.filterSystem') },
  ];

  const handlePress = useCallback(
    (item: NotificationItem, destination: Destination | null) => {
      if (!item.read) markRead.mutate(item.id);
      if (destination) router.push(destination.route);
    },
    [markRead, router],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  }, [router]);

  const canMarkAll = unreadCount > 0 && !markAllRead.isPending;
  const markAllLabel = t('opesMessaging.notifications.markAllRead');

  // A failed refresh over data already on screen — or no connection at all —
  // must say so, otherwise the previous payload is indistinguishable from fresh.
  const loadedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const showStale = !!data && (isError || !isOnline);
  const staleMessage = !isOnline ? t('offline.statusOffline') : t('notifications.errorBody');

  const unreadA11y = t('notifications.unread', { defaultValue: 'Unread' });
  const importantLabel = t('notifications.important');

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('opesMessaging.notifications.title')}
        subtitle={
          unreadCount > 0
            ? t('opesMessaging.notifications.subtitleUnread', { count: unreadCount })
            : t('opesMessaging.notifications.subtitleNone')
        }
        onBack={goBack}
        right={
          <TouchableOpacity
            onPress={() => markAllRead.mutate()}
            disabled={!canMarkAll}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={markAllLabel}
            accessibilityState={{ disabled: !canMarkAll, busy: markAllRead.isPending }}
            style={styles.headerAction}
          >
            <Icon name="check-double" size={16} color={canMarkAll ? colors.link : colors.textMuted} />
            <Text style={[styles.headerActionText, !canMarkAll && styles.headerActionOff]}>
              {markAllLabel}
            </Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.blue}
            colors={[colors.blue]}
          />
        }
      >
        {/* Counted filter row — "All 7 · Appointments 2 …" */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}
        >
          {chips.map((chip) => (
            <Chip
              key={chip.key}
              label={chip.label}
              count={counts[chip.key]}
              icon={iconForCategory(chip.key)}
              selected={filter === chip.key}
              onPress={() => setFilter(chip.key)}
            />
          ))}
        </ScrollView>

        {showStale ? (
          <StaleNotice
            message={staleMessage}
            loadedAt={loadedAt}
            onRetry={() => refetch()}
            retrying={isRefetching}
          />
        ) : null}

        {markAllRead.isError ? (
          <View
            style={[styles.notice, { backgroundColor: statusMap.critical.bg }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            <Icon name="alert-circle" size={18} color={statusMap.critical.fg} />
            <Text style={[styles.noticeText, { color: statusMap.critical.fg }]}>
              {t('opesMessaging.notifications.markAllFailed')}
            </Text>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loading} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.blue} />
            <Text style={styles.loadingText}>{t('opesMessaging.notifications.loading')}</Text>
          </View>
        ) : isError && !data ? (
          <EmptyState
            icon="alert-circle"
            tint="red"
            title={t('notifications.errorTitle')}
            message={t('notifications.errorBody')}
            actionLabel={t('notifications.retry')}
            onAction={() => refetch()}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={filter === 'all' ? 'bell-off' : iconForCategory(filter)}
            tint="blue"
            title={
              filter === 'all'
                ? t('opesMessaging.notifications.emptyTitle')
                : t('notifications.emptyFilteredTitle')
            }
            message={
              filter === 'all'
                ? t('opesMessaging.notifications.emptyMessage')
                : t('notifications.emptyFilteredSubtitle')
            }
            actionLabel={
              filter === 'all' ? t('notifications.emptyAction') : t('notifications.emptyFilteredAction')
            }
            onAction={() => (filter === 'all' ? router.push('/settings') : setFilter('all'))}
          />
        ) : (
          <>
            {groups.map((group) => (
              <View key={group.key}>
                <SectionHeader title={t(SECTION_LABEL_KEY[group.key])} variant="overline" />
                <Card variant="flush">
                  {group.items.map((item, index) => {
                    const destination = destinationFor(item);
                    const when = whenLabel(item.created_at, group.key);
                    const important = item.severity === 'high';
                    const actionLabel = destination ? t(destination.labelKey) : undefined;
                    return (
                      <ListRow
                        key={item.id}
                        icon={iconForType(item.type)}
                        tint={tintFor(item)}
                        title={item.title}
                        subtitle={item.message || actionLabel}
                        divider={index < group.items.length - 1}
                        chevron={!!destination}
                        onPress={() => handlePress(item, destination)}
                        accessibilityLabel={a11yJoin(
                          !item.read && unreadA11y,
                          important && importantLabel,
                          item.title,
                          item.message,
                          when,
                        )}
                        accessibilityHint={actionLabel}
                        trailing={
                          <View style={styles.trailing}>
                            {important ? (
                              <StatusBadge
                                status="high"
                                tone="critical"
                                size="sm"
                                icon="alert-triangle"
                                label={importantLabel}
                              />
                            ) : null}
                            <View style={styles.whenRow}>
                              {when ? (
                                <Text
                                  style={[styles.when, !item.read && styles.whenUnread]}
                                  numberOfLines={1}
                                >
                                  {when}
                                </Text>
                              ) : null}
                              {!item.read ? <View style={styles.dot} /> : null}
                            </View>
                          </View>
                        }
                      />
                    );
                  })}
                </Card>
              </View>
            ))}

            {/* Privacy assurance — the reference closes the list on this. */}
            <Card>
              <View style={styles.privacy}>
                <View style={styles.privacyCircle}>
                  <Icon name="lock" size={24} color={tintMap.blue.fg} />
                </View>
                <View style={styles.privacyBody}>
                  <Text style={styles.privacyTitle}>{t('notifications.privacyTitle')}</Text>
                  <Text style={styles.privacyText}>{t('notifications.privacySubtitle')}</Text>
                </View>
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },

    headerAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: 40,
    },
    headerActionText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
    },
    headerActionOff: { color: colors.textMuted },

    // Bleeds to the screen edges so the chips scroll under the gutter.
    chipsScroll: { flexGrow: 0, marginHorizontal: -spacing.md },
    chips: { paddingHorizontal: spacing.md, gap: spacing.sm },

    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md - 2,
      borderRadius: radii.md,
    },
    noticeText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
    },

    loading: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
    },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    trailing: { alignItems: 'flex-end', gap: spacing.xs },
    whenRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    when: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    whenUnread: {
      fontFamily: typography.fontFamily.semiBold,
      color: colors.link,
    },
    dot: {
      width: spacing.sm,
      height: spacing.sm,
      borderRadius: radii.pill,
      backgroundColor: colors.badge,
    },

    privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    privacyCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    privacyBody: { flex: 1, minWidth: 0, gap: 2 },
    privacyTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    privacyText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
  });
