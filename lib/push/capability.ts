/**
 * Can this build actually receive a push notification? — the single source of
 * truth, and the reason every other file in `lib/push/` exists.
 *
 * ## What was wrong
 *
 * The app used to ask the patient for the OS notification permission, then
 * register a "push token" that was the device's own random fingerprint — a
 * string this app invented, which no push service has ever heard of.
 * `getExpoPushTokenAsync` and `getDevicePushTokenAsync` appeared nowhere in
 * the tree. So the app requested a permission it could not act on and told a
 * patient they would get appointment reminders and health alerts that could
 * never arrive.
 *
 * ## What decides it
 *
 * An Expo push token is minted by Expo's servers against an **EAS project id**.
 * `app.json` on this fork carries, verbatim:
 *
 *     "eas": { "//": "projectId removed on fork — a fork must NOT push to the
 *              source app's EAS project. Run `eas init` …" }
 *
 * so there is no project id, and `Notifications.getExpoPushTokenAsync()` cannot
 * mint anything. That is not a bug to code around — it is the honest state of
 * this build, and it is what this module reports.
 *
 * The web build is the other case: a web page has no APNs/FCM registration,
 * and `expo export --platform web` is what serves finder.opescare.cloud.
 *
 * ## How it is used
 *
 * Nothing in this app may promise push delivery without consulting this
 * function first. `deliverable: false` means: do not ask the OS for the
 * notification permission, do not register a token, and say so in the copy.
 * The moment the owner runs `eas init` and uploads FCM/APNs credentials, the
 * same code flips to the real path with no further edit — including the
 * wording, which is keyed off this result (see `lib/push/strings.ts`).
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Why this build cannot receive a push. Each maps to copy the patient sees. */
export type PushUnavailableReason =
  /** Web build: no APNs/FCM registration exists for a browser tab. */
  | 'web'
  /** No EAS project id in the app config, so no token can be minted. */
  | 'no_project_id';

export type PushCapability =
  | { deliverable: true; projectId: string }
  | { deliverable: false; reason: PushUnavailableReason };

/** The push platform the server should record for this handset. */
export type PushPlatform = 'ios' | 'android' | 'web';

export function resolvePushPlatform(): PushPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

/**
 * The EAS project id this build belongs to, or null.
 *
 * Two places carry it and they disagree by build type: `expoConfig.extra.eas`
 * is what `app.json`/`app.config.js` produce, `easConfig` is what an EAS build
 * injects. Neither is typed as guaranteed, and on this fork `extra.eas` exists
 * but holds only a `"//"` comment — so a present `eas` object proves nothing
 * and the *value* has to be checked, not the container.
 */
export function resolveProjectId(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)
    ?.eas?.projectId;
  const fromEas = (Constants as unknown as { easConfig?: { projectId?: unknown } }).easConfig
    ?.projectId;

  const candidate = fromExtra ?? fromEas;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

/**
 * Synchronous and side-effect free, so a screen can branch on it during render
 * without a loading state that would flash a promise it then withdraws.
 */
export function getPushCapability(): PushCapability {
  if (Platform.OS === 'web') return { deliverable: false, reason: 'web' };

  const projectId = resolveProjectId();
  if (!projectId) return { deliverable: false, reason: 'no_project_id' };

  return { deliverable: true, projectId };
}

/** Convenience for the common branch. */
export function isPushDeliverable(): boolean {
  return getPushCapability().deliverable;
}
