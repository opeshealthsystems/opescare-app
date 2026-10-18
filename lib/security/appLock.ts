import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

/**
 * App lock: fingerprint / face / device PIN before the app shows a record.
 *
 * A phone handed to someone else, or left unlocked on a desk, must not open
 * straight onto a patient's Health ID and history. When the patient turns
 * this on (Settings → This device), the app locks on cold start and whenever
 * it comes back after LOCK_AFTER_MS in the background.
 *
 * The device's own credential does the work (`disableDeviceFallback: false`),
 * so a phone with only a PIN or pattern is still covered. Native only — the
 * web build has no such API and never shows the setting.
 */
const ENABLED_KEY = 'opescare_app_lock_enabled';
const LOCK_AFTER_MS = 60_000;

export const appLockSupported = Platform.OS !== 'web';

interface AppLockState {
  enabled: boolean;
  locked: boolean;
  ready: boolean;
  load: () => Promise<void>;
  setEnabled: (next: boolean, prompt: string) => Promise<boolean>;
  unlock: (prompt: string) => Promise<boolean>;
}

/** True when the device has a fingerprint, face or at least a screen lock. */
export async function deviceCanLock(): Promise<boolean> {
  if (!appLockSupported) return false;
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level !== LocalAuthentication.SecurityLevel.NONE;
}

async function authenticate(prompt: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    disableDeviceFallback: false,
  });
  return result.success;
}

export const useAppLock = create<AppLockState>((set, get) => ({
  enabled: false,
  locked: false,
  ready: !appLockSupported,

  load: async () => {
    if (!appLockSupported) return;
    const enabled = (await SecureStore.getItemAsync(ENABLED_KEY).catch(() => null)) === '1';
    set({ enabled, locked: enabled, ready: true });
  },

  setEnabled: async (next, prompt) => {
    if (!appLockSupported) return false;
    // Turning it on or off both need the owner: otherwise whoever holds an
    // unlocked phone could simply switch the lock off.
    if (!(await authenticate(prompt))) return false;
    if (next) await SecureStore.setItemAsync(ENABLED_KEY, '1');
    else await SecureStore.deleteItemAsync(ENABLED_KEY);
    set({ enabled: next, locked: false });
    return true;
  },

  unlock: async (prompt) => {
    const ok = await authenticate(prompt).catch(() => false);
    if (ok) set({ locked: false });
    return ok;
  },
}));

let backgroundedAt: number | null = null;

/** Lock again after the app has spent LOCK_AFTER_MS out of sight. */
export function installAppLockWatcher(): () => void {
  if (!appLockSupported) return () => undefined;
  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'background') {
      backgroundedAt = Date.now();
    } else if (state === 'active' && backgroundedAt !== null) {
      const away = Date.now() - backgroundedAt;
      backgroundedAt = null;
      if (useAppLock.getState().enabled && away >= LOCK_AFTER_MS) {
        useAppLock.setState({ locked: true });
      }
    }
  });
  return () => sub.remove();
}
