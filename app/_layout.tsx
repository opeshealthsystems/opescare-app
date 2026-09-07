import '../global.css';
import '../lib/i18n';
import { useEffect, useState } from 'react';
import { Stack, router, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, AppBackground, setDefaultBackHandler, type PaletteName } from '../components/opes-ui';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../lib/store/auth';
import { AppUpdateGate } from '../components/AppUpdateGate';
import { initOfflineMode } from '../lib/offline';
import { OfflineBanner } from '../components/offline/OfflineBanner';
import { PushListeners } from '../lib/push/PushListeners';
import { ConsentPromptWatcher } from '../components/consent/ConsentPromptWatcher';
import { enableScreens } from 'react-native-screens';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Make a blurred tab screen actually leave the page on the web build.
 *
 * A tab navigator keeps every screen you have visited MOUNTED — that is the
 * point of tabs, and on native it is invisible, because react-native-screens
 * detaches the blurred ones. On web it was not invisible at all:
 *
 *   react-native-screens/core.js:  let ENABLE_SCREENS = isNativePlatformSupported
 *
 * which is `Platform.OS === 'ios' | 'android' | 'windows'` — false here. So
 * `screensEnabled()` returned false, and the `MaybeScreen` wrapper inside the
 * bottom-tab navigator (expo-router/build/react-navigation/bottom-tabs/views/
 * ScreenFallback.js) fell back to a plain `<View>` that applies NOTHING but
 * `position: absolute; z-index: -1`. The blurred screen therefore stayed in the
 * DOM at full size, laid out, hit-testable and keyboard-focusable — merely
 * painted behind the focused one. Two clinician screens really were rendering
 * at once: Today on top, and whichever screen you had come from underneath it,
 * its inputs and buttons still reachable at their real coordinates.
 *
 * `enableScreens()` flips that flag. On web it does nothing else — it returns
 * before touching UIManager on any non-native platform — and `screensEnabled()`
 * is consulted in exactly two files in the whole navigation stack, both of them
 * this same tab/drawer fallback. With it true, the wrapper is
 * react-native-screens' own web `Screen`, which sets `hidden` and
 * `display: none` on a screen whose activityState is inactive. One flag, and a
 * blurred tab is gone rather than merely behind.
 *
 * Native is unaffected: `enableScreens(true)` is already the default there.
 */
if (Platform.OS === 'web') {
  enableScreens(true);
}

// The OPES ScreenHeader is navigation-agnostic; give it one app-wide back
// action so headers without an explicit onBack still show a working chevron.
//
// The fallback — used when there is nothing to go back TO, which is every
// cold start on a deep link — has to know which half of the app the session
// belongs to. `/(tabs)/home` is not merely the wrong screen for a clinician:
// the patient tabs mount and fire every `/mobile/*` patient query with a
// PROVIDER token, each 401s, the retry calls `/mobile/auth/refresh` (a
// patient-only endpoint, so it 401s too), and `lib/api/client.ts` then clears
// the token and signs the clinician out of a session the server still calls
// valid. Confirmed against the live build: loading `/home`, `/records` or
// `/settings` with a provider token ends on the welcome screen with the token
// erased. So a provider session falls back to its own home instead.
setDefaultBackHandler(() => {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(useAuthStore.getState().provider ? '/clinician/home' : '/(tabs)/home');
});

const queryClient = new QueryClient();

/**
 * The user's chosen palette ('opescare' default | 'opes'). Persisted here — in
 * ONE place — so the Settings toggle only has to call togglePalette().
 * SecureStore is unavailable on the web build, so fall back to localStorage.
 */
export const PALETTE_STORAGE_KEY = 'opescare.palette';
const isPalette = (v: unknown): v is PaletteName => v === 'opescare' || v === 'opes';
async function readPalette(): Promise<PaletteName> {
  try {
    const raw = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(PALETTE_STORAGE_KEY)
      : await SecureStore.getItemAsync(PALETTE_STORAGE_KEY);
    return isPalette(raw) ? raw : 'opescare';
  } catch {
    return 'opescare';
  }
}
function writePalette(p: PaletteName): void {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(PALETTE_STORAGE_KEY, p);
    else void SecureStore.setItemAsync(PALETTE_STORAGE_KEY, p);
  } catch {
    /* persistence is best-effort */
  }
}

export default function RootLayout() {
  const status = useAuthStore((s) => s.status);
  // The guard below has to know WHICH kind of session is authenticated.
  // A clinician sent to the patient tabs fires every /mobile/* patient query
  // with a provider bearer token, gets a wall of 401s, and the session-expired
  // handler signs them out of a perfectly valid session.
  const provider = useAuthStore((s) => s.provider);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const segments = useSegments();
  const router = useRouter();

  // Offline mode: connectivity monitoring, cache hydration and passive
  // capture. Declared before bootstrap so the query cache is being restored
  // and the network is being watched by the time the session is checked.
  // Entirely inert until the patient opts in on /offline-access.
  useEffect(() => initOfflineMode(queryClient), []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // OPES UI kit typography (ui-kit/theme.ts) addresses the four Poppins
  // weights by their @expo-google-fonts names. They must be registered before
  // the first styled screen paints, otherwise every kit component silently
  // falls back to the system font.
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  // "Settled" — loaded OR failed. A font failure must never hold the splash
  // screen up: we fall through and the app renders with the system font.
  const fontsSettled = fontsLoaded || fontError !== null;
  const [palette, setPalette] = useState<PaletteName | null>(null);
  useEffect(() => {
    readPalette().then(setPalette);
  }, []);

  // The splash stays up until BOTH the session is resolved AND the fonts
  // have settled. Routing (below) is intentionally not gated on fonts, so
  // the redirect still happens as soon as auth resolves — it just lands
  // behind the splash until the fonts are in.
  useEffect(() => {
    if (status === 'booting' || !fontsSettled || palette === null) return;
    if (fontError && __DEV__) {
      console.warn('[fonts] Poppins failed to load; using system font.', fontError);
    }
    SplashScreen.hideAsync().catch(() => {});
  }, [status, fontsSettled, fontError, palette]);

  useEffect(() => {
    if (status === 'booting') return;

    const inAuthGroup = segments[0] === '(auth)';
    // `/` is app/index.tsx — a bare spinner that exists only to be redirected
    // away from. Without treating it like the auth group, an authenticated
    // launch that lands there sits on that spinner forever; offline launches
    // hit it every time, because they resolve to 'authenticated' from the
    // local cache rather than being bounced out to welcome.
    // Cast: expo-router types `segments` as a fixed-length tuple, so a plain
    // `.length === 0` is rejected as an impossible comparison at compile time
    // even though it is exactly what the root route yields at runtime.
    const atRootIndex = (segments as readonly string[]).length === 0;
    // `app/clinician/…` — the clinician half of the app. A URL that already
    // names a screen in here is an ANSWER to "where does this session belong",
    // not a question, so nothing below may overrule it.
    const inClinicianArea = segments[0] === 'clinician';

    if (status !== 'authenticated' && !inAuthGroup) {
      // Signed out. Every route is sign-in, clinician URLs included.
      router.replace('/(auth)/welcome');
      return;
    }

    if (status !== 'authenticated') return;

    // ── Where an authenticated session belongs ───────────────────────────
    // A property of the SESSION, not of how fast a navigation settles. This is
    // now the only code that decides it; `lib/store/auth.ts` used to redirect
    // as well, and its copy of the decision ran on every cold start and threw
    // away whatever route the user had actually opened.
    if (provider) {
      // A clinician bearer token is refused by every patient endpoint, so a
      // clinician left on a patient screen collects 401s until the
      // session-expired handler ends a perfectly good session. Move them,
      // wherever they are — but only if they are not already in their own half
      // of the app, because inside it the URL is the user's own choice:
      // /clinician/schedule stays /clinician/schedule, on a deep link, a
      // bookmark, a refresh, or a restored history entry.
      if (!inClinicianArea) router.replace('/clinician/home');
      return;
    }

    // A patient session. `/` and `(auth)` are the two places it must not
    // linger; anywhere else — including `/clinician/…`, where the gate in
    // app/clinician/_layout.tsx renders WrongAppScreen instead of any
    // clinician screen — is a route it asked for and is allowed to keep.
    if (inAuthGroup || atRootIndex) router.replace('/(tabs)/home');
  }, [status, segments, router, provider]);

  return (
    <SafeAreaProvider>
      <ThemeProvider initialPalette={palette ?? 'opescare'} onPaletteChange={writePalette}>
      {/* The kit's app-wide ground: opaque page colour + the faint brand seal, wrapped
          once around every screen — kit screens have a transparent root by design. */}
      <AppBackground>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
        {/* Both render after the Stack so they paint over every route,
            pre-auth included. */}
        <OfflineBanner />
        {/* Startup version gate (GET /mobile/app-config). Fails open —
            see lib/api/appConfigQueries.ts. */}
        <AppUpdateGate />
        {/* Push listeners (native) and the consent prompt (every platform)
            exist only for a signed-in session; the watcher further limits
            itself to a PATIENT persona — a clinician is never asked to
            approve anything here. Rendered after the Stack so the sheet
            paints over whatever screen the patient is on. */}
        {status === 'authenticated' ? (
          <>
            <PushListeners />
            <ConsentPromptWatcher />
          </>
        ) : null}
      </QueryClientProvider>
      </AppBackground>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
