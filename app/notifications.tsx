import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  BellOff,
  Calendar,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  FlaskConical,
  HeartPulse,
  Lock,
  MessageCircle,
  Pill,
  Settings as SettingsIcon,
  ShieldAlert,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../components/ui/Screen';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/Skeleton';
import { InlineNotice, ScreenHeader } from '../components/settings/SettingsUi';
import { toneOf, type Tone } from '../components/ui/tone';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type NotificationItem,
} from '../lib/api/queries';
import { colors, radii, sizing, spacing, typography } from '../theme/tokens';

/**
 * Notification Center.
 *
 * Reference: `Mobile app screens/a_crisp_mobile_app_screenshot_of_a_notification_c.png`
 * — title + "Mark all as read", a counted filter-chip row, then Today /
 * Yesterday / Earlier groups of rows, each with a tinted rounded-square icon
 * tile, title, body, an action link and a right-hand timestamp over an
 * unread dot, closing on a privacy assurance block.
 *
 * Everything comes from GET /mobile/notifications. Two things the API gives us
 * are deliberately NOT rendered as-is:
 *
 *  - **`action_url` is a web-portal path** (`/portals/patient/logs`,
 *    `/portals/patient/health-id`), not an app route. Pushing it into the
 *    router would 404, so it is mapped to the equivalent screen in this app and
 *    ignored when there is no equivalent.
 *  - **`action_label` is hardcoded English** on the API side ("View Access
 *    Logs"), so rendering it would put English into the French app. The label
 *    is taken from this app's own translations for the resolved destination.
 *
 * The demo patient currently has zero notifications, so the empty state is the
 * state most sessions will show: it is a full `EmptyState` with a real next
 * step (notification preferences), and it changes copy when the emptiness is
 * caused by the active filter rather than by having nothing at all.
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

/** Fallback by notification `type`, for the emitters that send no action at all. */
const TYPE_ROUTES: { match: string; destination: Destination }[] = [
  { match: 'appointment', destination: { route: '/appointments', labelKey: 'notifications.action.appointments' } },
  { match: 'lab', destination: { route: '/labs', labelKey: 'notifications.action.labs' } },
  { match: 'prescription', destination: { route: '/prescriptions', labelKey: 'notifications.action.prescriptions' } },
  { match: 'health_id', destination: { route: '/(tabs)/health-id', labelKey: 'notifications.action.healthId' } },
  { match: 'message', destination: { route: '/(tabs)/messages', labelKey: 'notifications.action.messages' } },
  { match: 'family', destination: { route: '/family', labelKey: 'notifications.action.family' } },
  { match: 'emergency', destination: { route: '/privacy/access-logs', labelKey: 'notifications.action.accessLogs' } },
  { match: 'security', destination: { route: '/privacy/access-logs', labelKey: 'notifications.action.accessLogs' } },
];

/** Every route above is a real file under `app/` — no dead taps. */
function destinationFor(item: NotificationItem): Destination | null {
  if (item.action_url && PORTAL_PATH_ROUTES[item.action_url]) {
    return PORTAL_PATH_ROUTES[item.action_url];
  }
  const type = item.type?.toLowerCase() ?? '';
  return TYPE_ROUTES.find((entry) => type.includes(entry.match))?.destination ?? null;
}

function iconForType(type: string): LucideIcon {
  const value = type?.toLowerCase() ?? '';
  if (value.includes('emergency') || value.includes('security')) return ShieldAlert;
  if (value.includes('health_id')) return HeartPulse;
  if (value.includes('appointment')) return Calendar;
  if (value.includes('lab')) return FlaskConical;
  if (value.includes('prescription')) return Pill;
  if (value.includes('family')) return Users;
  if (value.includes('message')) return MessageCircle;
  if (value.includes('tip')) return Sparkles;
  return Bell;
}

function iconForCategory(category: Category): LucideIcon {
  switch (category) {
    case 'appointments':
      return Calendar;
    case 'health':
      return HeartPulse;
    case 'messages':
      return MessageCircle;
    case 'system':
      return SettingsIcon;
    default:
      return Bell;
  }
}

/** `severity` is `high | medium | normal` (MobileNotificationController). */
function toneForSeverity(severity: string): Tone {
  if (severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  return 'gold';
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

type SectionKey = 'today' | 'yesterday' | 'earlier';

function timestampLabel(
  iso: string | null,
  sectionKey: SectionKey,
  sectionLabel: string,
  locale: string,
): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  if (sectionKey === 'today') return time;
  if (sectionKey === 'yesterday') return `${sectionLabel}, ${time}`;
  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function NotificationsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const [filter, setFilter] = useState<Category>('all');

  const { data, isLoading, isError, refetch, isRefetching } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = data?.data ?? [];
  const unreadCount = data?.unread_count ?? 0;

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

  const sectionLabels: Record<SectionKey, string> = {
    today: t('notifications.sectionToday'),
    yesterday: t('notifications.sectionYesterday'),
    earlier: t('notifications.sectionEarlier'),
  };

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
      .map((key) => ({ key, label: sectionLabels[key], items: byKey.get(key)! }));
  }, [filtered, sectionLabels.today, sectionLabels.yesterday, sectionLabels.earlier]);

  const chips: { key: Category; label: string }[] = [
    { key: 'all', label: t('notifications.filterAll') },
    { key: 'appointments', label: t('notifications.filterAppointments') },
    { key: 'messages', label: t('notifications.filterMessages') },
    { key: 'health', label: t('notifications.filterHealth') },
    { key: 'system', label: t('notifications.filterSystem') },
  ];

  const handlePress = (item: NotificationItem, destination: Destination | null) => {
    if (!item.read) markRead.mutate(item.id);
    if (destination) router.push(destination.route);
  };

  const canMarkAll = unreadCount > 0 && !markAllRead.isPending;

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing['4xl'] }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.brand[500]}
          />
        }
      >
        <View style={{ paddingHorizontal: spacing['2xl'] }}>
          <ScreenHeader
            title={t('notifications.title')}
            subtitle={t('notifications.subtitle')}
            onBack={() => router.back()}
            action={
              <Pressable
                onPress={() => markAllRead.mutate()}
                disabled={!canMarkAll}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canMarkAll }}
                accessibilityLabel={t('notifications.markAllRead')}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  opacity: !canMarkAll ? 0.4 : pressed ? 0.6 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.semantic.success,
                  }}
                >
                  {t('notifications.markAllRead')}
                </Text>
                <CheckCheck
                  color={colors.semantic.success}
                  size={sizing.icon.sm}
                  style={{ marginLeft: 5 }}
                />
              </Pressable>
            }
          />

          {unreadCount > 0 ? (
            <View style={{ marginTop: spacing.md, flexDirection: 'row' }}>
              <Chip
                label={t('notifications.unreadCount', { count: unreadCount })}
                tone="gold"
                variant="soft"
                icon={Bell}
              />
            </View>
          ) : null}

          {markAllRead.isError ? (
            <InlineNotice
              className="mt-3"
              tone="danger"
              icon={CircleAlert}
              body={t('notifications.markAllError')}
            />
          ) : null}
        </View>

        {/* Counted filter row — the reference's "All (7) · Appointments (2) …" */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-5 flex-grow-0"
          contentContainerStyle={{ paddingHorizontal: spacing['2xl'], gap: spacing.sm }}
        >
          {chips.map((chip) => (
            <Chip
              key={chip.key}
              label={chip.label}
              count={counts[chip.key]}
              icon={iconForCategory(chip.key)}
              size="md"
              variant="outline"
              tone="gold"
              selected={filter === chip.key}
              onPress={() => setFilter(chip.key)}
            />
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: spacing['2xl'], marginTop: spacing.xl }}>
          {isLoading ? (
            <View style={{ gap: spacing.lg }}>
              <SkeletonCard rows={3} />
              <SkeletonCard rows={2} />
            </View>
          ) : isError ? (
            <Card padding="none">
              <EmptyState
                compact
                tone="danger"
                icon={CircleAlert}
                title={t('notifications.errorTitle')}
                description={t('notifications.errorBody')}
                actionLabel={t('notifications.retry')}
                onAction={() => refetch()}
              />
            </Card>
          ) : filtered.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={filter === 'all' ? BellOff : iconForCategory(filter)}
                title={
                  filter === 'all'
                    ? t('notifications.emptyTitle')
                    : t('notifications.emptyFilteredTitle')
                }
                description={
                  filter === 'all'
                    ? t('notifications.emptySubtitle')
                    : t('notifications.emptyFilteredSubtitle')
                }
                actionLabel={
                  filter === 'all'
                    ? t('notifications.emptyAction')
                    : t('notifications.emptyFilteredAction')
                }
                onAction={() =>
                  filter === 'all' ? router.push('/settings') : setFilter('all')
                }
              />
            </Card>
          ) : (
            <>
              {groups.map((group) => (
                <View key={group.key} style={{ marginBottom: spacing.xl }}>
                  <Text
                    style={{
                      marginBottom: spacing.md,
                      fontSize: typography.size.xs,
                      lineHeight: typography.lineHeight.xs,
                      fontWeight: typography.weight.bold,
                      letterSpacing: typography.tracking.overline,
                      textTransform: 'uppercase',
                      color: colors.brand[600],
                    }}
                  >
                    {group.label}
                  </Text>

                  <Card padding="none">
                    {group.items.map((item, index) => (
                      <NotificationRow
                        key={item.id}
                        item={item}
                        timestamp={timestampLabel(item.created_at, group.key, group.label, locale)}
                        destination={destinationFor(item)}
                        divider={index < group.items.length - 1}
                        onPress={handlePress}
                        importantLabel={t('notifications.important')}
                        actionLabelFor={(labelKey) => t(labelKey)}
                      />
                    ))}
                  </Card>
                </View>
              ))}

              <InlineNotice
                tone="gold"
                icon={Lock}
                title={t('notifications.privacyTitle')}
                body={t('notifications.privacySubtitle')}
              />
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

/**
 * One notification. Bespoke rather than a `ListRow` because the reference puts
 * the timestamp at the *top* right, level with the title, and lets the body
 * run full width beneath it — a shape `ListRow`'s right-hand value/meta column
 * cannot express.
 */
function NotificationRow({
  item,
  timestamp,
  destination,
  divider,
  onPress,
  importantLabel,
  actionLabelFor,
}: {
  item: NotificationItem;
  timestamp: string;
  destination: Destination | null;
  divider: boolean;
  onPress: (item: NotificationItem, destination: Destination | null) => void;
  importantLabel: string;
  actionLabelFor: (labelKey: string) => string;
}) {
  const Icon = iconForType(item.type);
  const palette = toneOf(toneForSeverity(item.severity));

  return (
    <Pressable
      onPress={() => onPress(item, destination)}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
        borderBottomWidth: divider ? sizing.hairline : 0,
        borderBottomColor: colors.line.subtle,
        backgroundColor: pressed ? colors.surface.scrim : 'transparent',
      })}
    >
      <View
        style={{
          width: sizing.tile.lg,
          height: sizing.tile.lg,
          borderRadius: radii.tile,
          backgroundColor: palette.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon color={palette.fg} size={sizing.icon.xl} />
      </View>

      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Text
            style={{
              flex: 1,
              paddingRight: spacing.sm,
              fontSize: typography.size.md,
              lineHeight: typography.lineHeight.md,
              fontWeight: item.read ? typography.weight.semibold : typography.weight.bold,
              color: colors.navy.text,
            }}
          >
            {item.title}
          </Text>
          {timestamp ? (
            <Text
              numberOfLines={1}
              style={{
                fontSize: typography.size.xs,
                lineHeight: typography.lineHeight.xs,
                color: colors.navy.muted,
              }}
            >
              {timestamp}
            </Text>
          ) : null}
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: radii.pill,
              marginLeft: spacing.sm,
              marginTop: 5,
              backgroundColor: item.read ? colors.cream[300] : colors.brand[500],
            }}
          />
        </View>

        {item.message ? (
          <Text
            style={{
              marginTop: 3,
              fontSize: typography.size.sm,
              lineHeight: typography.lineHeight.sm,
              color: colors.navy.secondary,
            }}
          >
            {item.message}
          </Text>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: spacing.sm,
            marginTop: destination || item.severity === 'high' ? spacing.sm : 0,
          }}
        >
          {item.severity === 'high' ? (
            <Chip label={importantLabel} tone="danger" icon={ShieldAlert} />
          ) : null}

          {destination ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: typography.size.sm,
                  fontWeight: typography.weight.semibold,
                  color: colors.brand[600],
                }}
              >
                {actionLabelFor(destination.labelKey)}
              </Text>
              <ChevronRight color={colors.brand[600]} size={sizing.icon.sm} />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
