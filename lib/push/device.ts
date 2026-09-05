/**
 * The device's own identity and the id of the push registration it holds —
 * device-local state, deliberately not part of the cross-device
 * `GET /mobile/settings` payload.
 *
 * These two keys were previously declared twice, once in
 * `app/(auth)/permissions.tsx` and once in `lib/api/settingsQueries.ts`, each
 * with its own copy of the storage shim and the fingerprint generator, and
 * each carrying a comment warning the other not to drift. They now have one
 * implementation.
 *
 * **The fingerprint is a device id, not a push token.** The backend keys
 * `PushDeviceToken` on (patient, device_fingerprint, platform), so the
 * fingerprint is the row's identity — that use is correct and stays. What was
 * wrong was *also* sending it as `push_token`, which made a locally invented
 * random string masquerade as a credential from Apple or Google. Minting a
 * real token is `lib/push/token.ts`'s job, and nothing here may substitute for
 * it.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/** Stable random id for this handset. Not a hardware serial, not an ad id. */
export const DEVICE_FINGERPRINT_KEY = 'opescare_device_fingerprint';

/** The `token_id` returned by POST /mobile/push-tokens for this handset. */
export const PUSH_TOKEN_ID_KEY = 'opescare_push_token_id';

/**
 * What kind of token that registration actually carries.
 *
 * Handsets in the field already hold a `PUSH_TOKEN_ID_KEY` written by the old
 * code, which registered the device fingerprint as the push token. Without
 * this marker those installs would read as "push is on" forever: the Settings
 * switch would show enabled, `setEnabled(true)` would never run again, and a
 * real token would never be minted even after the owner supplies EAS
 * credentials — a silent, permanent failure for exactly the users who had
 * already opted in.
 *
 * So a registration only counts when it is stamped. An unstamped id is from
 * the fingerprint era and is discarded locally; the server row heals itself,
 * because `PushDeviceToken` is keyed on (patient, fingerprint, platform) and
 * the fingerprint does not change — the next real registration overwrites the
 * same row's `push_token`.
 */
export const PUSH_TOKEN_KIND_KEY = 'opescare_push_token_kind';

/** The only kind this app registers. See `lib/push/token.ts`. */
export const EXPO_PUSH_TOKEN_KIND = 'expo';

/**
 * SecureStore natively, localStorage on web. Both are best-effort: a browser
 * in private mode, or a device that refuses the keychain, must degrade to
 * "this device has no registration" rather than throw into a screen.
 */
export const deviceStore =
  Platform.OS === 'web'
    ? {
        get: async (key: string): Promise<string | null> => {
          try {
            return globalThis.localStorage?.getItem(key) ?? null;
          } catch {
            return null;
          }
        },
        set: async (key: string, value: string): Promise<void> => {
          try {
            globalThis.localStorage?.setItem(key, value);
          } catch {
            // Non-fatal: the registration simply is not remembered here.
          }
        },
        remove: async (key: string): Promise<void> => {
          try {
            globalThis.localStorage?.removeItem(key);
          } catch {
            // Non-fatal.
          }
        },
      }
    : {
        get: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
        set: async (key: string, value: string): Promise<void> => {
          await SecureStore.setItemAsync(key, value);
        },
        remove: async (key: string): Promise<void> => {
          await SecureStore.deleteItemAsync(key);
        },
      };

function generateFingerprint(): string {
  const random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `${Platform.OS}-${Date.now().toString(36)}-${random}`.slice(0, 128);
}

/** Read this handset's id, minting and storing one on first use. */
export async function getOrCreateFingerprint(): Promise<string> {
  const existing = await deviceStore.get(DEVICE_FINGERPRINT_KEY);
  if (existing) return existing;
  const created = generateFingerprint();
  await deviceStore.set(DEVICE_FINGERPRINT_KEY, created);
  return created;
}

/**
 * The id of a registration that carries a real push token, or null.
 *
 * Returns null — and clears the stored id — for an unstamped registration from
 * the fingerprint era, so callers never have to know that history existed.
 */
export async function readPushRegistrationId(): Promise<string | null> {
  const id = await deviceStore.get(PUSH_TOKEN_ID_KEY);
  if (!id) return null;

  const kind = await deviceStore.get(PUSH_TOKEN_KIND_KEY);
  if (kind === EXPO_PUSH_TOKEN_KIND) return id;

  await clearPushRegistration();
  return null;
}

/** Record a registration made with a real Expo push token. */
export async function savePushRegistration(tokenId: string): Promise<void> {
  await deviceStore.set(PUSH_TOKEN_ID_KEY, tokenId);
  await deviceStore.set(PUSH_TOKEN_KIND_KEY, EXPO_PUSH_TOKEN_KIND);
}

/** Forget this handset's registration. Does not call the server. */
export async function clearPushRegistration(): Promise<void> {
  await deviceStore.remove(PUSH_TOKEN_ID_KEY);
  await deviceStore.remove(PUSH_TOKEN_KIND_KEY);
}
