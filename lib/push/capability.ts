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
 * ## What decides it — four gates, checked in this order
 *
 * 1. **Platform.** A web page has no APNs/FCM registration, and
 *    `expo export --platform web` is what serves finder.opescare.cloud.
 *
 * 2. **The native module.** `expo-notifications` mints a device token through
 *    the `ExpoPushTokenManager` native module. A binary built without it (a
 *    bare project that dropped the pod/gradle entry, or a runtime that is not
 *    really native) has the JS API and nothing behind it, and
 *    `getDevicePushTokenAsync` throws `UnavailabilityError` on the first
 *    call. Checked with `requireOptionalNativeModule`, which returns null
 *    rather than throwing, so a screen can branch on it during render.
 *
 * 3. **Expo Go on Android.** Remote push was removed from the Android Expo Go
 *    client in SDK 53 (`expo-notifications/build/warnOfExpoGoPushUsage.js`
 *    says so at runtime). The native module IS present there — the token
 *    request simply fails against Expo's server — so this is its own gate.
 *    Only a development build (`eas build --profile development`) can test
 *    push on Android. iOS Expo Go still delivers through Expo's own APNs
 *    certificate and is not gated.
 *
 * 4. **The EAS project id.** An Expo push token is minted by Expo's servers
 *    against an EAS project id, read from `extra.eas.projectId`. This fork
 *    ships without one — `app.config.js` fills it in from the `EAS_PROJECT_ID`
 *    environment variable, which the owner sets after `eas init` (see
 *    `docs/push-delivery-runbook.md`). Until then the value is absent, the
 *    `"//"` comment in app.json says why, and this module reports it. That is
 *    not a bug to code around — it is the honest state of the build.
 *
 * What is NOT checked here, deliberately: whether FCM/APNs credentials have
 * been uploaded to EAS. The app cannot know that; a build with a project id
 * and no credentials gets a token request that Expo's server rejects, which
 * `lib/push/token.ts` reports as `failed` (retryable from Settings), and
 * which the runbook's troubleshooting table explains.
 *
 * ## How it is used
 *
 * Nothing in this app may promise push delivery without consulting this
 * function first. `deliverable: false` means: do not ask the OS for the
 * notification permission, do not register a token, and say so in the copy.
 * The moment the owner sets `EAS_PROJECT_ID` and uploads FCM/APNs
 * credentials, the same code flips to the real path with no further edit —
 * including the wording, which is keyed off this result (see
 * `lib/push/strings.ts`).
 */
import Constants from 'expo-constants';
import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** Why this build cannot receive a push. Each maps to copy the patient sees. */
export type PushUnavailableReason =
  /** Web build: no APNs/FCM registration exists for a browser tab. */
  | 'web'
  /** The `expo-notifications` native module is not linked into this binary. */
  | 'no_native_module'
  /** Expo Go on Android, where remote push has not worked since SDK 53. */
  | 'expo_go'
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
 * The name `expo-notifications` registers its token module under
 * (`build/PushTokenManager.native.js`: `requireNativeModule('ExpoPushTokenManager')`).
 * If that package ever renames it this check starts reporting
 * `no_native_module` on every build — loudly, in `__DEV__`, see below — which
 * is the safe direction to fail in.
 */
const PUSH_TOKEN_NATIVE_MODULE = 'ExpoPushTokenManager';

/**
 * Whether the native half of `expo-notifications` is present in this binary.
 * Synchronous and cached: the answer cannot change while the process runs.
 */
let nativeModulePresent: boolean | null = null;

export function hasPushNativeModule(): boolean {
  if (Platform.OS === 'web') return false;
  if (nativeModulePresent === null) {
    try {
      nativeModulePresent = requireOptionalNativeModule(PUSH_TOKEN_NATIVE_MODULE) != null;
    } catch {
      nativeModulePresent = false;
    }
  }
  return nativeModulePresent;
}

/** Expo Go, as opposed to a development, preview or store build. Never throws. */
function inExpoGo(): boolean {
  try {
    return isRunningInExpoGo();
  } catch {
    return false;
  }
}

/**
 * The EAS project id this build belongs to, or null.
 *
 * Two places carry it and they disagree by build type: `expoConfig.extra.eas`
 * is what `app.json`/`app.config.js` produce, `easConfig` is what an EAS build
 * injects. Neither is typed as guaranteed, and on this fork `extra.eas` exists
 * but holds only a `"//"` comment until `EAS_PROJECT_ID` is set — so a present
 * `eas` object proves nothing and the *value* has to be checked, not the
 * container.
 */
export function resolveProjectId(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)
    ?.eas?.projectId;
  const fromEas = (Constants as unknown as { easConfig?: { projectId?: unknown } }).easConfig
    ?.projectId;

  const candidate = fromExtra ?? fromEas;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

let reasonReported: PushUnavailableReason | null = null;

/**
 * Say once, in development only, why this build cannot receive a push. The
 * patient-facing copy is deliberately the same for every non-web reason
 * ("this app build cannot deliver alerts yet"); the developer needs the
 * specific one, and the console is where they are looking.
 */
function reportOnce(reason: PushUnavailableReason): void {
  if (!__DEV__ || reasonReported === reason) return;
  reasonReported = reason;
  const detail: Record<PushUnavailableReason, string> = {
    web: 'web build — browsers have no APNs/FCM registration.',
    no_native_module: `the ${PUSH_TOKEN_NATIVE_MODULE} native module is not in this binary — rebuild with expo-notifications linked.`,
    expo_go:
      'Expo Go on Android cannot receive remote push (removed in SDK 53) — use `eas build --profile development`.',
    no_project_id:
      'no EAS project id — set EAS_PROJECT_ID (see docs/push-delivery-runbook.md) and rebuild.',
  };
  console.info(`[push] not deliverable in this build: ${detail[reason]}`);
}

/**
 * Synchronous and side-effect free (bar a one-time dev log), so a screen can
 * branch on it during render without a loading state that would flash a
 * promise it then withdraws.
 */
export function getPushCapability(): PushCapability {
  const unavailable = (reason: PushUnavailableReason): PushCapability => {
    reportOnce(reason);
    return { deliverable: false, reason };
  };

  if (Platform.OS === 'web') return unavailable('web');
  if (!hasPushNativeModule()) return unavailable('no_native_module');
  if (Platform.OS === 'android' && inExpoGo()) return unavailable('expo_go');

  const projectId = resolveProjectId();
  if (!projectId) return unavailable('no_project_id');

  return { deliverable: true, projectId };
}

/** Convenience for the common branch. */
export function isPushDeliverable(): boolean {
  return getPushCapability().deliverable;
}
