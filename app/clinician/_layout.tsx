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
 * ── THE BAR (UIUX/DESIGN_SPEC.md §11) ─────────────────────────────────────
 * Five slots at most, no centre FAB — a clinician's bar has no Quick Add.
 * Height `62 + insets.bottom`, `colors.surface` on a 1px `colors.border` top
 * line, active `colors.blue`, inactive `colors.textMuted`, 11px medium labels,
 * 24px icons at stroke 2.0, and the `colors.badge` pip on Messages. Every
 * value is a kit token; nothing here is a literal colour.
 *
 * ── THE BAR, PER ROLE ─────────────────────────────────────────────────────
 * Every professional with a posting holds a provider token — receptionists,
 * pharmacists, lab staff as well as doctors and nurses — and the server
 * refuses each of them the routes their role lacks (403 `role_forbidden`, per
 * `config/staff_capabilities.php`, mirrored in `lib/staffCapabilities.ts`).
 * Each role gets ITS desk in the second slot, and a slot whose capability the
 * role does not hold is registered with `href: null`: still a route, never a
 * button. Today and Patients stay for everyone, so the bar never has fewer
 * than two slots:
 *
 *     doctor / nurse / trainee / supervisor (clinical_chart)
 *                      Today · Schedule · Patients · Results · Messages
 *     pharmacist (dispense)
 *                      Today · Pharmacy · Patients · Messages
 *     medicine_stock (pharmacy_stock without dispense)
 *                      Today · Stock · Patients
 *     lab (lab_results | sample_collection)
 *                      Today · Lab · Patients · Messages
 *     receptionist (front_desk)
 *                      Today · Desk · Patients · Messages
 *
 * Why the diary and the inbox are not simply "whoever holds the capability":
 *   • `schedule` — the front desk holds it on the server (it reads the
 *     FACILITY's book), but the Schedule tab here is the clinician's OWN diary
 *     (`/mobile/doctor/appointments`, provider = me). The facility book is the
 *     Desk tab, so the diary slot is hidden for a front-desk role.
 *   • `results` — the inbox is the CLINICIAN's acknowledgement queue. Lab
 *     staff enter and release results on the Lab tab; showing them the
 *     acknowledgement inbox as well would be two doors onto one bench.
 *
 * The clinician PREVIEW (`EXPO_PUBLIC_DOCTOR_PERSONA`, no provider account)
 * is unrestricted by `useStaffCapability`, which would put every desk in the
 * bar at once — eight buttons. It gets the doctor's bar; the desks stay
 * routable for it, just not as buttons.
 *
 * ── EVERY OTHER ROUTE IN THE GROUP ────────────────────────────────────────
 * A `Tabs` navigator turns EVERY child route into a tab button unless it is
 * registered with `href: null`. The detail routes below are therefore listed
 * explicitly. Several of them are still being written by other agents
 * (`pharmacy/*`, `lab/*`, `desk/*`): expo-router answers a `Tabs.Screen`
 * naming a file that does not exist yet with a dev-only `console.warn`,
 * which is the right trade — the alternative is a stray tab button appearing
 * in the bar the moment someone adds a file. Route paths come from
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
import { useHasProviderSession, useStaffCapability } from '@/lib/staffCapabilities';
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

/** `href` for a slot: a button when the role holds it, a hidden route otherwise. */
const slot = (held: boolean) => (held ? undefined : null);

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

  // ── Which slots this ROLE gets (`lib/staffCapabilities.ts`) ─────────────
  const realSession = useHasProviderSession();
  const canChart = useStaffCapability('clinical_chart');
  const canMessage = useStaffCapability('messaging');
  const holdsSchedule = useStaffCapability('schedule');
  const holdsFrontDesk = useStaffCapability('front_desk');
  const holdsDispense = useStaffCapability('dispense');
  const holdsStock = useStaffCapability('pharmacy_stock');
  const holdsLab = useStaffCapability('lab_results', 'sample_collection');

  // The desks are drawn only for a real provider session (see the module note).
  const canFrontDesk = realSession && holdsFrontDesk;
  const canDispense = realSession && holdsDispense;
  const canLab = realSession && holdsLab;
  // Stock is a TAB only for a role that holds stock without the counter
  // (medicine_stock); a pharmacist reaches it from inside Pharmacy.
  const stockIsTab = realSession && holdsStock && !holdsDispense;
  // The clinician's own diary — not the facility book (that is Desk).
  const canSchedule = holdsSchedule && !canFrontDesk;
  // The acknowledgement inbox is the clinician's; lab staff have the Lab tab.
  const canResults = canChart;

  // Cheap: one 30s-stale query shared with the messages screen, polled a
  // minute apart, with no retry on a final answer. A count we do not have is
  // NO badge — never a zero, and never a guess. Not asked at all for a role
  // without messaging: the server would only refuse it.
  const unread = useDoctorUnreadCounts({ enabled: canMessage });
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
      {/* ── Slot 1: Today, for everyone ──────────────────────────────────── */}
      <Tabs.Screen
        name="home"
        options={{ title: tx('tabs.home', 'Today'), tabBarIcon: tabIcon('home') }}
      />

      {/* ── Slot 2: the role's desk — exactly one of these is a button ──── */}
      <Tabs.Screen
        name="schedule"
        options={{
          href: slot(canSchedule),
          title: tx('tabs.schedule', 'Schedule'),
          tabBarIcon: tabIcon('calendar'),
        }}
      />
      {/* A directory's index is registered by its directory name: expo-router
          matches `name` against both `pharmacy` and `pharmacy/index`
          (useScreens.getSortedChildren), and the plain name is what the
          route audit can resolve to the file. */}
      <Tabs.Screen
        name="pharmacy"
        options={{
          href: slot(canDispense),
          title: tx('tabs.pharmacy', 'Pharmacy'),
          tabBarIcon: tabIcon('pill'),
        }}
      />
      <Tabs.Screen
        name="pharmacy/stock"
        options={{
          href: slot(stockIsTab),
          title: tx('tabs.stock', 'Stock'),
          tabBarIcon: tabIcon('archive'),
        }}
      />
      <Tabs.Screen
        name="lab"
        options={{
          href: slot(canLab),
          title: tx('tabs.lab', 'Lab'),
          tabBarIcon: tabIcon('flask'),
        }}
      />
      <Tabs.Screen
        name="desk"
        options={{
          href: slot(canFrontDesk),
          title: tx('tabs.desk', 'Desk'),
          tabBarIcon: tabIcon('calendar'),
        }}
      />

      {/* ── Slot 3: Patients, for everyone ───────────────────────────────── */}
      <Tabs.Screen
        name="patients"
        options={{ title: tx('tabs.patients', 'Patients'), tabBarIcon: tabIcon('person-search') }}
      />

      {/* ── Slots 4–5: the clinician's inbox, and messaging ──────────────── */}
      <Tabs.Screen
        name="results"
        options={{
          href: slot(canResults),
          title: tx('tabs.results', 'Results'),
          tabBarIcon: tabIcon('flask'),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          href: slot(canMessage),
          title: tx('tabs.messages', 'Messages'),
          tabBarIcon: tabIcon('chat'),
          tabBarBadge: unreadThreads > 0 ? unreadThreads : undefined,
        }}
      />

      {/* ── Everything else in the group: routable, never a tab button ─── */}
      <Tabs.Screen name="break-glass" options={{ href: null }} />
      <Tabs.Screen name="request-access" options={{ href: null }} />
      <Tabs.Screen name="scan" options={{ href: null }} />
      <Tabs.Screen name="prescribe" options={{ href: null }} />
      <Tabs.Screen name="requests" options={{ href: null }} />
      <Tabs.Screen name="results/[id]" options={{ href: null }} />
      <Tabs.Screen name="messages/[id]" options={{ href: null }} />
      <Tabs.Screen name="appointments/[id]" options={{ href: null }} />
      <Tabs.Screen name="patient/[id]" options={{ href: null }} />
      <Tabs.Screen name="patient/[id]/[section]" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="wrong-app" options={{ href: null }} />

      {/* The desks' detail routes (built by the desk agents; paths per chartRoutes). */}
      <Tabs.Screen name="pharmacy/prescription/[id]" options={{ href: null }} />
      <Tabs.Screen name="pharmacy/reservation/[id]" options={{ href: null }} />
      <Tabs.Screen name="lab/order/[id]" options={{ href: null }} />
      <Tabs.Screen name="desk/appointment/[id]" options={{ href: null }} />
      <Tabs.Screen name="desk/new-appointment" options={{ href: null }} />
      <Tabs.Screen name="desk/register-patient" options={{ href: null }} />
    </Tabs>
  );
}
