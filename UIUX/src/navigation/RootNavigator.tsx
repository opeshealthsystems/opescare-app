import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { UnreadProvider } from '../context/UnreadContext';
import { LoginScreen } from '../screens/LoginScreen';
import { SignupScreen } from '../screens/SignupScreen';
import { SplashScreen } from '../screens/SplashScreen';
import { colors } from '../theme/theme';
import { WrongAppScreen } from '../screens/doctor/WrongAppScreen';
import { createLazyTree } from './lazyTree';
import { OnboardingWelcomeScreen } from '../screens/core/OnboardingWelcomeScreen';
import { hasSeenOnboarding } from './firstRun';
import { BASE_PATH, linking } from './linking';
import { RootStackParamList } from './routes';

export type { RootStackParamList };

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * THE CLINICIAN TREE IS NOT IN THE PATIENT'S BUNDLE.
 *
 * The boundary below already guarantees that a patient session never *mounts*
 * the clinician tree. This import makes sure a patient never *downloads* it
 * either: `import()` is a split point, so `DoctorStackNavigator` and every
 * clinician screen it pulls in — schedule, chart viewer, results inbox, staff
 * messaging — land in their own chunk that a patient session never requests.
 *
 * It must stay a bare `() => import('./DoctorStackNavigator')`. Anything the
 * bundler cannot see statically (a variable path, or a barrel that also pulls
 * the module in synchronously) silently folds the chunk back into the main
 * bundle and the patient pays for it again, with no error anywhere to say so.
 *
 * Loading and failure states live in `lazyTree.tsx`; see its header for why a
 * failed chunk fetch needs more than a plain error boundary.
 */
const LazyDoctorStack = createLazyTree(() =>
  import('./DoctorStackNavigator').then((m) => ({ default: m.DoctorStackNavigator }))
);

/**
 * THE PATIENT TREE IS NOT IN THE COLD-BOOT BUNDLE EITHER.
 *
 * Symmetric with the clinician split above (audit 39, F1): the patient tree was
 * a static import, so Metro folded the whole of it — every care, messaging,
 * billing and profile screen — into the one chunk the app downloads before it
 * can paint anything. On Slow-3G that measured ~10–15 s to interactive. Splitting
 * it here lets the welcome/sign-in shell paint from a small chunk while the
 * patient tree arrives in its own, behind the same Suspense loader auth uses.
 *
 * Same rule as the doctor split: this MUST stay a bare
 * `() => import('./AppStackNavigator')`, or the bundler folds it back in silently.
 */
const LazyMainStack = createLazyTree(() =>
  import('./AppStackNavigator').then((m) => ({ default: m.AppStackNavigator }))
);

function Loader() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page }}>
      <ActivityIndicator size="large" color={colors.blue} />
    </View>
  );
}

/**
 * The app's scenes are TRANSPARENT on purpose (see `colors.background` and
 * `components/Watermark.tsx`): the opaque page colour and the faded OPES seal
 * are painted once, per-screen, by each navigator's `screenLayout`. React
 * Navigation would otherwise paint every card/scene an opaque theme colour and
 * bury that layer, so the container theme is made transparent here. An opaque
 * `page` base still sits behind the whole tree (below) so nothing ever falls
 * through to the device background — including the auth screens, which carry no
 * seal, matching the desktop app where sign-in is outside the watermarked body.
 */
const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent', card: 'transparent' },
};

/**
 * True when the browser was loaded on a path *below* /app/ — i.e. a refresh, a
 * bookmark or a shared deep link. In that case the splash is skipped so the
 * requested screen comes back immediately instead of after a branded delay.
 */
function isDeepLinkEntry(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '');
  return path !== BASE_PATH && path !== '' && path.startsWith(BASE_PATH);
}

export function RootNavigator() {
  const { isAuthenticated, isLoading, sessionKind, isClinician } = useAuth();
  const [showSplash, setShowSplash] = useState(() => !isDeepLinkEntry());
  const handleSplashFinished = useCallback(() => setShowSplash(false), []);

  /**
   * FIRST RUN — see `firstRun.ts`.
   *
   * `null` means the flag has not been read yet. It is read once, at mount,
   * and never again: onboarding is decided for this launch, so a patient who
   * signs out mid-session does not suddenly get the carousel back.
   */
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    hasSeenOnboarding().then((seen) => {
      if (!cancelled) setFirstRun(!seen);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (showSplash) {
    return <SplashScreen onFinished={handleSplashFinished} />;
  }

  if (isLoading || firstRun === null) {
    return <Loader />;
  }

  return (
    <UnreadProvider>
      {/* Opaque base behind the whole (transparent-scened) navigation tree, so
          no screen can fall through to the device background. */}
      <View style={{ flex: 1, backgroundColor: colors.page }}>
      <NavigationContainer theme={navTheme} linking={linking} fallback={<Loader />}>
        <Stack.Navigator
          screenOptions={{ headerShown: false }}
          /*
            Only ever names a route that is actually registered below: when the
            patient is authenticated the unauthenticated group does not exist,
            and `undefined` leaves React Navigation's own default alone. A deep
            link still wins over this — someone opening /app/login on a fresh
            phone gets the sign-in they asked for, not an explainer.
          */
          initialRouteName={!isAuthenticated && firstRun ? 'OnboardingWelcome' : undefined}
        >
          {/*
            THE BOUNDARY.

            Exactly one of these trees is ever registered, chosen by the kind of
            session that is live. This is not a hiding trick: a route that is
            not registered does not exist for that session, so a patient token
            cannot reach a clinician screen by deep link, by restored navigation
            state, by `navigate('PatientChart')`, or by any URL under /app/dr/*
            — React Navigation has no such route to resolve, and the link
            resolves to the tree that IS mounted. The converse holds for a
            clinician and the patient screens.

            `DoctorStackNavigator` then re-checks `isClinician` itself, so the
            guarantee does not depend on this file staying correct.
          */}
          {isAuthenticated ? (
            sessionKind === 'staff' ? (
              isClinician ? (
                <Stack.Screen name="Doctor" component={LazyDoctorStack} />
              ) : (
                // Signed-in staff, non-clinical role: an honest dead end rather
                // than a broken tree. Not the patient tree — they are not a
                // patient and none of those endpoints would answer them.
                <Stack.Screen name="Doctor" component={WrongAppScreen} />
              )
            ) : (
              <Stack.Screen name="Main" component={LazyMainStack} />
            )
          ) : (
            <>
              {/*
                CORE-003 is the front door, so it lives on the UNAUTHENTICATED
                side: its own buttons are "Get Started" and "I already have an
                account". It is registered unconditionally (the flag chooses
                the initial route, not the route's existence) so that
                /app/welcome stays a working link for anyone who is sent one.
              */}
              <Stack.Screen name="OnboardingWelcome" component={OnboardingWelcomeScreen} />
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Signup" component={SignupScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      </View>
    </UnreadProvider>
  );
}
