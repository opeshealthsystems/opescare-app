/**
 * Hooks for the account-and-support cluster (settings, help, notifications,
 * offline access) that do not belong in `lib/api/queries.ts`.
 *
 * Everything here composes the existing hooks in `queries.ts` rather than
 * duplicating them — the endpoints already exist and are already typed. What
 * is added is the *device-local* half that the API deliberately does not
 * model: which push-token id this handset registered under, whether the OS has
 * actually granted the notification permission, and keeping the running i18n
 * locale in step with the patient's stored `preferred_language`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyLanguage } from '../i18n';
import {
  acquireExpoPushToken,
  clearPushRegistration,
  deviceStore,
  getOrCreateFingerprint,
  getPushCapability,
  readPushRegistrationId,
  registerPushStrings,
  savePushRegistration,
  DEVICE_FINGERPRINT_KEY as PUSH_DEVICE_FINGERPRINT_KEY,
  PUSH_TOKEN_ID_KEY as PUSH_REGISTRATION_ID_KEY,
  type PushUnavailableReason,
} from '../push';
import {
  useMobileSettings,
  useRegisterPushToken,
  useRevokePushToken,
  useUpdateMobileSettings,
  type MobileSettings,
} from './queries';

// The copy for the new `'unavailable'` error member — and the correction to
// `settings.device.pushBody`, which promises real-time alerts this build
// cannot deliver — live in `lib/i18n/pending/push.{en,fr}.json`. Registering
// here rather than in the screen keeps `app/settings.tsx` untouched.
registerPushStrings();

// ---------------------------------------------------------------------------
// Device-local storage
// ---------------------------------------------------------------------------

/**
 * These two keys are shared verbatim with `app/(auth)/permissions.tsx`, which
 * registers this device for push during onboarding. Both screens must agree on
 * the device's identity or a handset ends up registered twice under two
 * fingerprints, and Settings shows push as off while the server thinks it is on.
 *
 * They used to be *declared* twice — here and in that screen — each with its
 * own copy of the storage shim and the fingerprint generator, kept in step by
 * a comment. There is now one implementation, in `lib/push/device.ts`, and
 * these are re-exports so nothing that imported them from here has to change.
 */
export const DEVICE_FINGERPRINT_KEY = PUSH_DEVICE_FINGERPRINT_KEY;
export const PUSH_TOKEN_ID_KEY = PUSH_REGISTRATION_ID_KEY;

// ---------------------------------------------------------------------------
// Push registration for THIS device
// ---------------------------------------------------------------------------

/**
 * `'unavailable'` is new: this build cannot receive a push at all, so the
 * switch cannot be turned on and the reason is not the patient's fault.
 *
 * `app/settings.tsx` renders the error as ``t(`settings.device.${push.error}`)``,
 * so the member name is the translation key. `settings.device.unavailable` is
 * supplied by `lib/i18n/pending/push.{en,fr}.json` via `registerPushStrings()`
 * above, which is why that screen needs no edit.
 */
export type PushRegistrationError =
  | 'os_denied'
  | 'register_failed'
  | 'revoke_failed'
  | 'unavailable';

export interface PushRegistration {
  /** True when this device holds a token id from POST /mobile/push-tokens. */
  enabled: boolean;
  /** Still reading the stored token id — the switch must not claim "off" yet. */
  loading: boolean;
  busy: boolean;
  error: PushRegistrationError | null;
  /**
   * False when this build structurally cannot receive a push — no EAS project
   * id to mint a token against, or the web build. The switch should be
   * disabled and its subtitle should say so; `setEnabled(true)` refuses with
   * `error: 'unavailable'` either way, so a caller that ignores this cannot
   * accidentally register a device that will never be reachable.
   */
  available: boolean;
  /** Why not, when `available` is false. */
  unavailableReason: PushUnavailableReason | null;
  setEnabled: (next: boolean) => Promise<void>;
  clearError: () => void;
}

/**
 * Push registration for THIS handset.
 *
 * **What this used to do, and why it was wrong.** It requested the OS
 * notification permission and then registered `push_token: fingerprint` — the
 * device's own randomly generated id, a string no push service has ever heard
 * of. The switch read "on", the server stored a row, and not one notification
 * could ever be delivered to it. The comment in this file said as much
 * ("The app has no FCM/APNs credential yet, so the fingerprint stands in as
 * the token"), which made it a documented false promise rather than an
 * oversight.
 *
 * It now registers only a token that came out of `acquireExpoPushToken` — a
 * real `ExponentPushToken[…]` minted by Expo — and when it cannot get one it
 * registers nothing and says why. The OS permission is requested only on the
 * path that can act on it.
 *
 * The token id lives on the device (SecureStore natively, localStorage on web)
 * because the backend keys `PushDeviceToken` on patient + fingerprint +
 * platform: which token id *this* handset registered under is inherently local
 * state, not part of the cross-device GET /mobile/settings payload.
 */
export function usePushRegistration(): PushRegistration {
  const registerPushToken = useRegisterPushToken();
  const revokePushToken = useRevokePushToken();

  const [enabled, setEnabledState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PushRegistrationError | null>(null);

  // Synchronous and constant for the life of the process — see
  // `lib/push/capability.ts`. Read once so the switch never flashes an
  // "available" state it then withdraws.
  const [capability] = useState(getPushCapability);

  useEffect(() => {
    let cancelled = false;

    // A build that cannot receive a push must never show the switch as on,
    // whatever this device happens to have stored from an earlier version.
    if (!capability.deliverable) {
      setEnabledState(false);
      setLoading(false);
      return;
    }

    readPushRegistrationId()
      .then((id) => {
        if (cancelled) return;
        setEnabledState(!!id);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [capability.deliverable]);

  const setEnabled = useCallback(
    async (next: boolean) => {
      setError(null);
      setBusy(true);
      try {
        if (next) {
          // The whole sequence — permission prompt included — lives behind a
          // build that can actually mint a token. `acquireExpoPushToken`
          // returns `unavailable` without touching the OS when it cannot, so
          // no patient is asked to allow notifications this app could not send.
          const outcome = await acquireExpoPushToken({ requestPermission: true });

          if (outcome.status === 'unavailable') {
            setError('unavailable');
            return;
          }
          if (outcome.status === 'permission_denied') {
            setError('os_denied');
            return;
          }
          if (outcome.status !== 'ready') {
            setError('register_failed');
            return;
          }

          const fingerprint = await getOrCreateFingerprint();
          const result = await registerPushToken.mutateAsync({
            device_fingerprint: fingerprint,
            platform: outcome.platform,
            // A genuine `ExponentPushToken[…]`. Nothing else may be sent here:
            // this field used to carry the device fingerprint, which made the
            // row unreachable while the switch read "on".
            push_token: outcome.token,
          });
          await savePushRegistration(result.token_id);
          setEnabledState(true);
        } else {
          const tokenId = await deviceStore.get(PUSH_TOKEN_ID_KEY);
          if (tokenId) await revokePushToken.mutateAsync(tokenId);
          await clearPushRegistration();
          setEnabledState(false);
        }
      } catch {
        setError(next ? 'register_failed' : 'revoke_failed');
      } finally {
        setBusy(false);
      }
    },
    [registerPushToken, revokePushToken],
  );

  return {
    enabled,
    loading,
    busy,
    error,
    available: capability.deliverable,
    unavailableReason: capability.deliverable ? null : capability.reason,
    setEnabled,
    clearError: useCallback(() => setError(null), []),
  };
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

export type AppLanguage = 'en' | 'fr';

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/**
 * Language preferences: the server carries the choice between devices,
 * `lib/i18n` applies and remembers it on this one.
 *
 * Two things this used to get wrong, both of which showed up as "the language
 * switch only translates Settings":
 *
 *  1. Nothing applied the stored language at startup. i18next booted from the
 *     device locale and this hook — mounted by `app/settings.tsx` and nowhere
 *     else — was the only code that ever corrected it. Every relaunch, and on
 *     the web build every page reload, came back in the device locale until
 *     the patient re-opened Settings. `applyLanguage` now persists the choice
 *     locally and `lib/i18n/index.ts` reads it back before the first paint.
 *
 *  2. The "adopt the stored value" effect listed the i18n object in its
 *     dependencies. That object gets a fresh identity on every
 *     `languageChanged`, so the effect re-ran the instant the patient's own
 *     switch took effect and re-applied `stored` — which is still the OLD
 *     value until PATCH /mobile/settings round-trips. The tap was reverted and
 *     only stuck once the network answered; on a slow link that is seconds of
 *     the app sitting in the previous language, and if the PATCH failed it
 *     never took at all. The effect now depends on `stored` alone and applies
 *     each server value once, and `setLanguage` records the patient's choice as
 *     reconciled up front, so an in-flight write can no longer undo it.
 */
export function useLanguagePreference() {
  const { i18n } = useTranslation();
  const settingsQuery = useMobileSettings();
  const updateSettings = useUpdateMobileSettings();

  const stored = settingsQuery.data?.preferred_language;
  const active = normalizeLanguage(i18n.language);

  /** The server value this session has already acted on — see (2) above. */
  const reconciled = useRef<AppLanguage | null>(null);

  useEffect(() => {
    if (!stored) return;
    const target = normalizeLanguage(stored);
    if (reconciled.current === target) return;
    reconciled.current = target;
    void applyLanguage(target);
  }, [stored]);

  const setLanguage = useCallback(
    (next: AppLanguage) => {
      reconciled.current = next;
      // Applied and remembered locally first: the switch must not wait on — or
      // be undone by — the network.
      void applyLanguage(next);
      if (!stored || normalizeLanguage(stored) !== next) {
        updateSettings.mutate({ preferred_language: next });
      }
    },
    [stored, updateSettings],
  );

  return {
    language: active,
    setLanguage,
    isSaving: updateSettings.isPending,
    isError: updateSettings.isError,
  };
}

// ---------------------------------------------------------------------------
// Notification preference toggles
// ---------------------------------------------------------------------------

/** The five push preferences GET/PATCH /mobile/settings actually carries. */
export type NotificationPreferenceKey =
  | 'push_appointments'
  | 'push_lab_results'
  | 'push_prescriptions'
  | 'push_billing'
  | 'push_consent_requests'
  | 'push_messages';

export const NOTIFICATION_PREFERENCE_KEYS: NotificationPreferenceKey[] = [
  'push_appointments',
  'push_lab_results',
  'push_prescriptions',
  'push_billing',
  'push_consent_requests',
  'push_messages',
];

/**
 * Reads a preference as `boolean | null`, where `null` means "the server did
 * not give us a value".
 *
 * This screen has already shipped the failure this guards against: a first
 * read returned every field as null and the UI rendered five confident OFF
 * switches over five stored ONs. The API-side cause is fixed, but the UI now
 * refuses to render a value it was not given rather than defaulting to false.
 */
export function readPreference(
  settings: MobileSettings | undefined,
  key: NotificationPreferenceKey,
): boolean | null {
  const value = settings?.[key];
  return typeof value === 'boolean' ? value : null;
}

/**
 * Which single preference is currently being written, so only that row shows a
 * spinner. TanStack's mutation state is per-hook, not per-variable, so the key
 * is tracked alongside it.
 */
export function useNotificationPreferences() {
  const settingsQuery = useMobileSettings();
  const updateSettings = useUpdateMobileSettings();
  const [pendingKey, setPendingKey] = useState<NotificationPreferenceKey | null>(null);

  const toggle = useCallback(
    (key: NotificationPreferenceKey, value: boolean) => {
      setPendingKey(key);
      updateSettings.mutate(
        { [key]: value } as Partial<MobileSettings>,
        { onSettled: () => setPendingKey(null) },
      );
    },
    [updateSettings],
  );

  return {
    settings: settingsQuery.data,
    query: settingsQuery,
    toggle,
    pendingKey,
    isError: updateSettings.isError,
  };
}
