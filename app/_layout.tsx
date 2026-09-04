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

SplashScreen.preventAutoHideAsync().catch(() => {});

// The OPES ScreenHeader is navigation-agnostic; give it one app-wide back
// action so headers without an explicit onBack still show a working chevron.
setDefaultBackHandler(() => {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/home');
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
    if (status !== 'authenticated' && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (status === 'authenticated' && (inAuthGroup || atRootIndex)) {
      // Where an authenticated session belongs is a property of the session, not
      // of how fast a navigation settles. `enterClinicianArea` used to flip to
      // 'authenticated' in the same tick as router.replace(), but replace() is
      // async: this effect still saw the (auth) group and replaced the clinician
      // route with /(tabs)/home. Reading `provider` here makes the destination
      // correct regardless of ordering.
      router.replace(provider ? '/clinician/home' : '/(tabs)/home');
    }
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
      </QueryClientProvider>
      </AppBackground>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
