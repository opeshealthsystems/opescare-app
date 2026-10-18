import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'opescare_patient_token';

/**
 * Native builds keep the bearer token in expo-secure-store (Keychain / Android
 * Keystore). That path is unchanged.
 *
 * Web (served at opescare.com/finder) has no secure store, and the token used
 * to sit in plaintext localStorage — readable by any script on the origin and
 * left on disk indefinitely. On web the token now lives:
 *
 *  1. in memory (a module variable) — the source of truth; it survives
 *     client-side navigation and is gone when the tab closes;
 *  2. mirrored to sessionStorage, ONLY so a page reload in the same tab keeps
 *     the user signed in. sessionStorage is tab-scoped and cleared when the
 *     tab closes; it is never shared with other tabs or written to the
 *     long-lived localStorage area.
 *
 * Why sessionStorage and not an httpOnly refresh cookie: the backend's
 * /mobile/auth/refresh re-issues a JWT from the *current bearer token* — there
 * is no separate refresh credential to put in a cookie. Cookie-based refresh
 * would mean every login path (patient, provider, signup, recovery) issuing a
 * new cookie credential plus a new cookie-authenticated refresh route, which is
 * a backend auth change, not a storage fix. This is the documented fallback;
 * revisit if a dedicated refresh-token scheme is added server-side.
 *
 * Legacy plaintext copies in localStorage are deleted on module load.
 */

let memoryToken: string | null = null;

function session(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

/** One-time migration: remove the token older builds left in localStorage. */
export function purgeLegacyWebToken(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked — nothing to purge.
  }
}

if (Platform.OS === 'web') {
  purgeLegacyWebToken();
  memoryToken = session()?.getItem(TOKEN_KEY) ?? null;
}

const webTokenStorage = {
  get: async (): Promise<string | null> => memoryToken,
  set: async (token: string): Promise<void> => {
    memoryToken = token;
    try {
      session()?.setItem(TOKEN_KEY, token);
    } catch {
      // Quota/blocked: memory still holds it for this page's lifetime.
    }
  },
  clear: async (): Promise<void> => {
    memoryToken = null;
    try {
      session()?.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    purgeLegacyWebToken();
  },
};

export const tokenStorage =
  Platform.OS === 'web'
    ? webTokenStorage
    : {
        get: () => SecureStore.getItemAsync(TOKEN_KEY),
        set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
        clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
      };
