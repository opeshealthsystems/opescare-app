/**
 * Minting — and validating — a *real* push token.
 *
 * This is the half of push notifications that did not exist. Nothing in the
 * app called `getExpoPushTokenAsync`; `push_token` was the device fingerprint
 * from `lib/push/device.ts`, a string this app generates for itself. This
 * module is the only place allowed to produce a value for that field, and
 * `isExpoPushToken` is the gate that stops anything else being sent as one.
 *
 * ## Why the Expo push service and not FCM directly
 *
 * This is a managed Expo app (`expo-notifications`, EAS builds, no native
 * project checked in). `getDevicePushTokenAsync` would hand back a raw FCM /
 * APNs token, which the server could send through the existing
 * `App\Modules\Notifications\Services\PushNotificationService` — but that
 * needs `google-services.json` committed here, an FCM service-account JSON on
 * the API host, and separate APNs handling for iOS. `getExpoPushTokenAsync`
 * needs one EAS project id here and *no secret at all* on the server, and it
 * covers both platforms. So the server half is
 * `app/Services/ExpoPushService.php` in the API repo, and this mints the
 * `ExponentPushToken[…]` it sends to.
 *
 * ## What the outcomes mean
 *
 * - `ready` — a genuine Expo push token. Safe to register.
 * - `unavailable` — this build structurally cannot receive push (see
 *   `capability.ts`). No permission is requested, nothing is registered, and
 *   the UI must say so. **This is the state of the app today.**
 * - `permission_denied` — the patient said no. A normal answer, not an error.
 * - `failed` — Expo's servers were unreachable, or the mint was rejected. A
 *   simulator and a build whose EAS project has no FCM/APNs credentials
 *   uploaded both land here: `getExpoPushTokenAsync` throws in each case and
 *   does not distinguish them in a way worth branching on. Retrying later
 *   (from Settings) is the right response to all three.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  getPushCapability,
  resolvePushPlatform,
  type PushPlatform,
  type PushUnavailableReason,
} from './capability';

/**
 * Expo has minted both `ExponentPushToken[…]` (long-standing) and
 * `ExpoPushToken[…]` (newer) prefixes; the push API accepts either. Anything
 * else — a device fingerprint, an empty string, a raw FCM token — is not
 * deliverable through this path and must never be registered as if it were.
 */
const EXPO_PUSH_TOKEN_PATTERN = /^Expo(?:nent)?PushToken\[[^\s[\]]+\]$/;

/** The one gate. Server-side `ExpoPushService::isExpoPushToken()` mirrors it. */
export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && EXPO_PUSH_TOKEN_PATTERN.test(value);
}

export type PushPermissionState = 'granted' | 'denied' | 'undetermined';

export type PushTokenOutcome =
  | { status: 'ready'; token: string; platform: PushPlatform }
  | { status: 'unavailable'; reason: PushUnavailableReason }
  | { status: 'permission_denied'; canAskAgain: boolean }
  | { status: 'failed' };

function toPermissionState(status: string | undefined): PushPermissionState {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

/**
 * Read the OS notification permission without prompting. Returns
 * `undetermined` rather than throwing on a platform where the query itself
 * fails, so a caller never has to guard it.
 */
export async function readNotificationPermission(): Promise<PushPermissionState> {
  try {
    const current = await Notifications.getPermissionsAsync();
    return toPermissionState(current.status);
  } catch {
    return 'undetermined';
  }
}

let foregroundConfigured = false;

/**
 * How a push is presented while the app is open. Idempotent.
 *
 * Badges are deliberately off: this app's unread count is the notification
 * centre's own (`GET /mobile/notifications`), and a second, separately-drifting
 * number on the launcher icon is worse than none.
 *
 * NOTE FOR THE OWNER: this is called on the token-acquisition path, which
 * covers the session in which a device registers. A cold start does not call
 * it, so once push is genuinely enabled `app/_layout.tsx` should call
 * `configurePushForegroundPresentation()` once at boot. That file is not
 * touched here.
 */
export function configurePushForegroundPresentation(): void {
  if (foregroundConfigured) return;
  foregroundConfigured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Presentation preferences are not worth failing a registration over.
    foregroundConfigured = false;
  }
}

/**
 * Android delivers nothing on an idle or locked handset unless the message
 * arrives on a channel with sufficient importance, and a channel's settings
 * are fixed at creation — so they are created before the first send, not
 * after.
 *
 * `lockscreenVisibility: PRIVATE` on the clinical channel is not decoration:
 * a lock screen is a public surface, and an OpesCare push must never put a
 * diagnosis or a result value on one. The server payload carries no clinical
 * content either (`ExpoPushService`), so this is the second of two locks.
 */
export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync('clinical', {
      name: 'Results and consent requests',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  } catch {
    // A missing channel degrades delivery; it does not justify refusing to
    // register a token that is otherwise valid.
  }
}

/**
 * Acquire a real Expo push token for this device.
 *
 * `requestPermission` is explicit and defaults to false because the mistake
 * being fixed here is precisely a permission prompt shown for a capability the
 * app did not have: a caller must say out loud that it intends to prompt, and
 * it can only reach that line at all when the build is `deliverable`.
 */
export async function acquireExpoPushToken(
  options: { requestPermission?: boolean } = {},
): Promise<PushTokenOutcome> {
  const capability = getPushCapability();
  if (!capability.deliverable) {
    return { status: 'unavailable', reason: capability.reason };
  }

  try {
    await ensureAndroidChannels();

    const current = await Notifications.getPermissionsAsync();
    let status = toPermissionState(current.status);
    const canAskAgain = current.canAskAgain !== false;

    if (status !== 'granted') {
      // Re-asking a patient who already declined does nothing on iOS and is
      // nagging on Android, so the OS's own "may I ask" flag is honoured.
      if (!options.requestPermission || !canAskAgain) {
        return { status: 'permission_denied', canAskAgain };
      }
      const asked = await Notifications.requestPermissionsAsync();
      status = toPermissionState(asked.status);
      if (status !== 'granted') {
        return { status: 'permission_denied', canAskAgain: asked.canAskAgain !== false };
      }
    }

    const { data } = await Notifications.getExpoPushTokenAsync({
      projectId: capability.projectId,
    });

    // Belt and braces. If Expo ever hands back something this app cannot
    // recognise, registering it would put an undeliverable value in the
    // `push_token` column — which is the exact bug this module exists to end.
    if (!isExpoPushToken(data)) return { status: 'failed' };

    configurePushForegroundPresentation();

    return { status: 'ready', token: data, platform: resolvePushPlatform() };
  } catch {
    return { status: 'failed' };
  }
}
