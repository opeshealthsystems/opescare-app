import { AppState, type AppStateStatus, Platform } from 'react-native';
import { create } from 'zustand';
import { apiClient } from '../api/client';
import { API_BASE_URL, endpoints } from '../api/endpoints';
import { isNetworkError } from './cache';

/**
 * Connectivity detection with **no new native dependency**.
 *
 * `@react-native-community/netinfo` is not a dependency of this app and
 * `expo-network` is not installed either; adding either would mean a new native
 * module and a fresh EAS build for every consumer, so this uses three signals
 * that need nothing beyond what already ships:
 *
 *  1. Real API traffic — an axios response means the network works; an axios
 *     failure with no HTTP response at all means it does not. This is the
 *     strongest signal because it reflects the requests the app actually makes.
 *  2. A reachability probe against `GET /mobile/app-config`, the public
 *     pre-auth version gate. Runs on start, on app foreground, and on a timer.
 *  3. The browser's own `online`/`offline` events on web.
 *
 * The trade-off vs. NetInfo, stated plainly: this reports *API reachability*,
 * not radio state. A device on a captive-portal Wi-Fi reads as offline (which
 * is the honest answer for our purposes), and a transition is noticed at the
 * next probe rather than instantly.
 */

const PROBE_TIMEOUT_MS = 6000;
const PROBE_INTERVAL_ONLINE_MS = 60_000;
const PROBE_INTERVAL_OFFLINE_MS = 15_000;

function initialOnlineGuess(): boolean {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return Boolean((navigator as unknown as { onLine: boolean }).onLine);
  }
  return true; // optimistic until the first probe or request answers
}

interface ConnectivityState {
  isOnline: boolean;
  /** When the state last flipped — drives "you went offline at ..." copy. */
  changedAt: number;
  lastCheckedAt: number | null;
  report: (online: boolean) => void;
}

export const useConnectivityStore = create<ConnectivityState>((set, get) => ({
  isOnline: initialOnlineGuess(),
  changedAt: Date.now(),
  lastCheckedAt: null,
  report: (online) => {
    const previous = get().isOnline;
    set({
      isOnline: online,
      lastCheckedAt: Date.now(),
      changedAt: previous === online ? get().changedAt : Date.now(),
    });
  },
}));

/** Subscribe to connectivity from a component. */
export function useIsOnline(): boolean {
  return useConnectivityStore((s) => s.isOnline);
}

/** Single reachability check. Resolves to the observed state. */
export async function probeConnectivity(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // A reachability probe must never be answered from cache — a cached
    // response (or, on web, a cached CORS *failure*) would report a stale
    // verdict forever. Observed for real: after the API's allowed origins were
    // widened, the browser kept replaying the earlier CORS rejection and the
    // app sat behind an "Offline" banner while the server was answering 200.
    // `cache: 'no-store'` plus a unique query string defeats both layers.
    const response = await fetch(
      `${API_BASE_URL}${endpoints.appConfig}?_probe=${Date.now()}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      },
    );
    // Any HTTP answer — even a 4xx/5xx — proves the network path works.
    const reachable = response.status > 0;
    useConnectivityStore.getState().report(reachable);
    return reachable;
  } catch {
    useConnectivityStore.getState().report(false);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let installed = false;

/** Wires the three signals. Idempotent; returns a teardown for tests. */
export function installConnectivityMonitor(): () => void {
  if (installed) return () => {};
  installed = true;

  const report = (online: boolean) => useConnectivityStore.getState().report(online);

  const interceptorId = apiClient.interceptors.response.use(
    (response) => {
      report(true);
      return response;
    },
    (error) => {
      if (isNetworkError(error)) report(false);
      else report(true);
      return Promise.reject(error);
    },
  );

  let timer: ReturnType<typeof setInterval> | null = null;
  const schedule = () => {
    if (timer) clearInterval(timer);
    const interval = useConnectivityStore.getState().isOnline
      ? PROBE_INTERVAL_ONLINE_MS
      : PROBE_INTERVAL_OFFLINE_MS;
    timer = setInterval(() => {
      probeConnectivity();
    }, interval);
  };

  // Re-arm the timer at the cadence that matches the current state: poll
  // faster while offline so recovery is noticed quickly, slower while online.
  const unsubscribe = useConnectivityStore.subscribe(schedule);
  schedule();

  const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') probeConnectivity();
  });

  let removeWebListeners: (() => void) | null = null;
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.addEventListener) {
    const onOnline = () => {
      report(true);
      probeConnectivity();
    };
    const onOffline = () => report(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    removeWebListeners = () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }

  probeConnectivity();

  return () => {
    installed = false;
    apiClient.interceptors.response.eject(interceptorId);
    if (timer) clearInterval(timer);
    unsubscribe();
    appStateSub.remove();
    removeWebListeners?.();
  };
}
