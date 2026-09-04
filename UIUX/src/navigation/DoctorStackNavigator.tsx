import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { createPlaceholderScreen } from '../screens/PlaceholderScreen';
import { AppointmentRequestsScreen } from '../screens/doctor/AppointmentRequestsScreen';
import { DoctorAppointmentDetailScreen } from '../screens/doctor/DoctorAppointmentDetailScreen';
import { DoctorHomeScreen } from '../screens/doctor/DoctorHomeScreen';
import { DoctorScheduleScreen } from '../screens/doctor/DoctorScheduleScreen';
import { DoctorMessageThreadScreen } from '../screens/doctor/DoctorMessageThreadScreen';
import { DoctorMessagesScreen } from '../screens/doctor/DoctorMessagesScreen';
import { DoctorProfileScreen } from '../screens/doctor/DoctorProfileScreen';
import { PatientChartScreen } from '../screens/doctor/PatientChartScreen';
import { PatientChartSectionScreen } from '../screens/doctor/PatientChartSectionScreen';
import { PatientSearchScreen } from '../screens/doctor/PatientSearchScreen';
import { ResultDetailScreen } from '../screens/doctor/ResultDetailScreen';
import { ResultsInboxScreen } from '../screens/doctor/ResultsInboxScreen';
import { WrongAppScreen } from '../screens/doctor/WrongAppScreen';
import { DoctorTabNavigator } from './DoctorTabNavigator';
import { AppBackground } from '../components/Watermark';
import { DoctorStackParamList } from './routes';

/**
 * The CLINICIAN half of the app. Mirrors `AppStackNavigator.tsx` exactly: a
 * flat native stack of every clinician screen, sitting above the doctor tabs.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SCREEN AGENTS — READ THIS, IT IS THE WHOLE CONTRACT
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Your route is ALREADY declared: its params are in `routes.ts`, its URL is in
 * `linking.ts`, and it is registered below as a `P(...)` placeholder. To ship a
 * screen you change exactly TWO lines in this file and nothing else:
 *
 *   1. add your import at the top
 *   2. swap `P('...', '...')` for your component in `doctorScreens`
 *
 * e.g.  ResultsInbox: P('Results', 'flask'),
 *   →   ResultsInbox: ResultsInboxScreen,
 *
 * Do NOT edit `<Stack.Screen>` lines, `DoctorTabNavigator.tsx`, `routes.ts` or
 * `linking.ts`. The four tab destinations (DoctorSchedule, PatientSearch,
 * ResultsInbox, DoctorMessages, DoctorProfile) are rendered from this same
 * `doctorScreens` map by the tab navigator, so swapping the entry here is all
 * it takes for the tab to become real too. That is why the map exists.
 *
 * If your screen genuinely needs a param this file does not declare, add it to
 * `DoctorStackParamList` in `routes.ts` — additively, without changing anyone
 * else's entry.
 *
 * Design system: use `src/theme/theme.ts` tokens, `src/components/*` and the
 * `<Icon />` set. The clinician app is the same product as the patient app and
 * must look like it. No new colours, radii, type scales or icon libraries.
 */

const Stack = createNativeStackNavigator<DoctorStackParamList>();

// TODO(screen-agent): replace each `P(...)` below with the real screen component.
const P = createPlaceholderScreen;

/**
 * The single registry of clinician screen components.
 *
 * ONE line per route. Both this stack and `DoctorTabNavigator` read from here,
 * so a sibling agent has exactly one place to swap their screen in.
 */
export const doctorScreens = {
  // -- Schedule & appointments ---------------------------------------------
  DoctorHome: DoctorHomeScreen,
  DoctorSchedule: DoctorScheduleScreen,
  AppointmentRequests: AppointmentRequestsScreen,
  AppointmentDetail: DoctorAppointmentDetailScreen,

  // -- Patients --------------------------------------------------------------
  PatientSearch: PatientSearchScreen,
  PatientChart: PatientChartScreen,
  PatientChartSection: PatientChartSectionScreen,

  // -- Messaging -------------------------------------------------------------
  DoctorMessages: DoctorMessagesScreen,
  DoctorMessageThread: DoctorMessageThreadScreen,

  // -- Results ---------------------------------------------------------------
  ResultsInbox: ResultsInboxScreen,
  ResultDetail: ResultDetailScreen,

  // -- Account ---------------------------------------------------------------
  DoctorProfile: DoctorProfileScreen,
} as const;

/**
 * The boundary, enforced in the navigator rather than by hiding tabs.
 *
 * `RootNavigator` already picks the tree by session kind, so a patient session
 * never mounts this component at all. This second check is what makes that a
 * guarantee rather than a convention: if anything ever renders the clinician
 * stack under a patient (or non-clinical staff) session — a deep link, a stale
 * navigation state restored from a URL, a future refactor of RootNavigator —
 * the stack refuses to build and renders an explanation instead. There is no
 * arrangement of navigation state that yields a clinician screen without
 * `isClinician` being true.
 */
export function DoctorStackNavigator() {
  const { isClinician } = useAuth();

  if (!isClinician) {
    return <WrongAppScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      screenLayout={({ children }) => <AppBackground>{children}</AppBackground>}
    >
      <Stack.Screen name="DoctorTabs" component={DoctorTabNavigator} />

      {/* -- Schedule & appointments ------------------------------------- */}
      <Stack.Screen name="DoctorHome" component={doctorScreens.DoctorHome} />
      <Stack.Screen name="DoctorSchedule" component={doctorScreens.DoctorSchedule} />
      <Stack.Screen name="AppointmentRequests" component={doctorScreens.AppointmentRequests} />
      <Stack.Screen name="AppointmentDetail" component={doctorScreens.AppointmentDetail} />

      {/* -- Patients ----------------------------------------------------- */}
      <Stack.Screen name="PatientSearch" component={doctorScreens.PatientSearch} />
      <Stack.Screen name="PatientChart" component={doctorScreens.PatientChart} />
      <Stack.Screen name="PatientChartSection" component={doctorScreens.PatientChartSection} />

      {/* -- Messaging ---------------------------------------------------- */}
      <Stack.Screen name="DoctorMessages" component={doctorScreens.DoctorMessages} />
      <Stack.Screen name="DoctorMessageThread" component={doctorScreens.DoctorMessageThread} />

      {/* -- Results ------------------------------------------------------ */}
      <Stack.Screen name="ResultsInbox" component={doctorScreens.ResultsInbox} />
      <Stack.Screen name="ResultDetail" component={doctorScreens.ResultDetail} />

      {/* -- Account ------------------------------------------------------ */}
      <Stack.Screen name="DoctorProfile" component={doctorScreens.DoctorProfile} />
    </Stack.Navigator>
  );
}
