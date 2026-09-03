import '../global.css';
import '../lib/i18n';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../lib/store/auth';
import { AppUpdateGate } from '../components/AppUpdateGate';
import { initOfflineMode } from '../lib/offline';
import { OfflineBanner } from '../components/offline/OfflineBanner';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

export default function RootLayout() {
  const status = useAuthStore((s) => s.status);
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

  useEffect(() => {
    if (status === 'booting') return;
    SplashScreen.hideAsync().catch(() => {});

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
      router.replace('/(tabs)/home');
    }
  }, [status, segments, router]);

  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}
