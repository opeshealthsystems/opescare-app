/**
 * The clinician area (`/clinician/…`) — its gate and its bottom bar.
 *
 * ── THE GATE ──────────────────────────────────────────────────────────────
 * When `useIsDoctor()` is false this layout renders `WrongAppScreen` INSTEAD
 * of the navigator, so no clinician route can be reached by typing a URL,
 * following a deep link or restoring history. Rendering an alternative in
 * place of the navigator is the same shape as expo-router's own auth-guard
 * pattern (`if (!session) return <Redirect …/>`) — the group's children simply
 * never mount.
 *
 * It is a UI gate, NOT a security boundary. The server authorises every
 * request on the token it was given; this only decides what is worth drawing.
 *
 * Today `useIsDoctor()` is false for every real session — the finder mints
 * only patient tokens — so this screen IS what `/clinician` shows unless the
 * dev override `EXPO_PUBLIC_DOCTOR_PERSONA=1` is set. See `lib/store/auth.ts`.
 *
 * ── THE BACKEND GAP ───────────────────────────────────────────────────────
 * The finder serves no `/mobile/doctor/*` routes yet, so EVERY doctor hook
 * 404s — including the unread-count query behind the messages badge. Nothing
 * here may spin forever or crash on that: `doctorRetry` does not retry a 404,
 * the badge simply stays absent, and each screen renders an honest
 * `EmptyState`.
 *
 * ── THE BAR (UIUX/DESIGN_SPEC.md §11) ─────────────────────────────────────
 * Five slots, no centre FAB — a clinician's bar has no Quick Add:
 *
 *     Home  |  Schedule  |  Patients  |  Results  |  Messages•
 *
 * Height `62 + insets.bottom`, `colors.surface` on a 1px `colors.border` top
 * line, active `colors.blue`, inactive `colors.textMuted`, 11px medium labels,
 * 24px icons at stroke 2.0, and the `colors.badge` pip on Messages. Every
 * value is a kit token; nothing here is a literal colour.
 *
 * ── EVERY OTHER ROUTE IN THE GROUP ────────────────────────────────────────
 * A `Tabs` navigator turns EVERY child route into a tab button unless it is
 * registered with `href: null`. The detail routes below are therefore listed
 * explicitly. Several of them (and some of the five slots) are still being
 * written by other agents: expo-router answers a `Tabs.Screen` naming a file
 * that does not exist yet with a dev-only `console.warn`, which is the right
 * trade — the alternative is a stray tab button appearing in the bar the
 * moment someone adds a file. Route paths come from
 * `components/doctor/chartRoutes.ts`, which is the map all of us build to.
 */
import { useCallback } from 'react';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon, iconStroke, typography, useTheme, type IconName } from '@/components/opes-ui';
import { useDoctorUnreadCounts } from '@/lib/api/doctorQueries';
import { useIsDoctor } from '@/lib/store/auth';
import { WrongAppScreen } from './wrong-app';

/**
 * Tab glyphs are 24px at stroke 2.0 (§6 / §11). React Navigation types the
 * tint as `ColorValue`; the kit `Icon` takes a string, so an opaque value
 * falls back to the kit's default colour rather than crashing.
 */
function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number; focused: boolean }) => (
    <Icon
      name={name}
      size={size}
      color={typeof color === 'string' ? color : undefined}
      strokeWidth={iconStroke.bold}
    />
  );
}

export default function DoctorLayout() {
  const isDoctor = useIsDoctor();

  // The gate. Hooks that only the clinician bar needs live in <DoctorTabs/>,
  // so a patient session never starts a doctor query at all.
  if (!isDoctor) return <WrongAppScreen />;

  return <DoctorTabs />;
}

function DoctorTabs() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Cheap: one 30s-stale query shared with the messages screen, polled a
  // minute apart, with no retry on the 404 this server currently answers.
  // A count we do not have is NO badge — never a zero, and never a guess.
  const unread = useDoctorUnreadCounts();
  const unreadThreads = unread.data?.unread_threads ?? 0;

  const tx = useCallback(
    (key: string, defaultValue: string) => String(t(`opesDoctor.${key}`, { defaultValue })),
    [t],
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontFamily: typography.fontFamily.medium,
          fontSize: 11,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.badge,
          color: colors.textOnBrand,
          fontFamily: typography.fontFamily.semiBold,
          fontSize: 10,
        },
      }}
    >
      {/* ── The five slots ─────────────────────────────────────────────── */}
      <Tabs.Screen
        name="home"
        options={{ title: tx('tabs.home', 'Today'), tabBarIcon: tabIcon('home') }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: tx('tabs.schedule', 'Schedule'), tabBarIcon: tabIcon('calendar') }}
      />
      <Tabs.Screen
        name="patients"
        options={{ title: tx('tabs.patients', 'Patients'), tabBarIcon: tabIcon('person-search') }}
      />
      <Tabs.Screen
        name="results"
        options={{ title: tx('tabs.results', 'Results'), tabBarIcon: tabIcon('flask') }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: tx('tabs.messages', 'Messages'),
          tabBarIcon: tabIcon('chat'),
          tabBarBadge: unreadThreads > 0 ? unreadThreads : undefined,
        }}
      />

      {/* ── Everything else in the group: routable, never a tab button ─── */}
      <Tabs.Screen name="requests" options={{ href: null }} />
      <Tabs.Screen name="results/[id]" options={{ href: null }} />
      <Tabs.Screen name="messages/[id]" options={{ href: null }} />
      <Tabs.Screen name="appointments/[id]" options={{ href: null }} />
      <Tabs.Screen name="patient/[id]" options={{ href: null }} />
      <Tabs.Screen name="patient/[id]/[section]" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="wrong-app" options={{ href: null }} />
    </Tabs>
  );
}
