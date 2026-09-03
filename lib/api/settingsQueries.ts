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
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import {
  useMobileSettings,
  useRegisterPushToken,
  useRevokePushToken,
  useUpdateMobileSettings,
  type MobileSettings,
} from './queries';

// ---------------------------------------------------------------------------
// Device-local storage
// ---------------------------------------------------------------------------

/**
 * These two keys are shared verbatim with `app/(auth)/permissions.tsx`, which
 * registers this device for push during onboarding. Both screens must agree on
 * the device's identity or a handset ends up registered twice under two
 * fingerprints, and Settings shows push as off while the server thinks it is on.
 */
export const DEVICE_FINGERPRINT_KEY = 'opescare_device_fingerprint';
export const PUSH_TOKEN_ID_KEY = 'opescare_push_token_id';

const deviceStore =
  Platform.OS === 'web'
    ? {
        get: async (key: string) =>
          typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null,
        set: async (key: string, value: string) => {
          if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
        },
        remove: async (key: string) => {
          if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
        },
      }
    : {
        get: (key: string) => SecureStore.getItemAsync(key),
        set: async (key: string, value: string) => {
          await SecureStore.setItemAsync(key, value);
        },
        remove: async (key: string) => {
          await SecureStore.deleteItemAsync(key);
        },
      };

function generateFingerprint(): string {
  const random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `${Platform.OS}-${Date.now().toString(36)}-${random}`.slice(0, 128);
}

async function getOrCreateFingerprint(): Promise<string> {
  const existing = await deviceStore.get(DEVICE_FINGERPRINT_KEY);
  if (existing) return existing;
  const created = generateFingerprint();
  await deviceStore.set(DEVICE_FINGERPRINT_KEY, created);
  return created;
}

function resolvePlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

// ---------------------------------------------------------------------------
// Push registration for THIS device
// ---------------------------------------------------------------------------

export type PushRegistrationError = 'os_denied' | 'register_failed' | 'revoke_failed';

export interface PushRegistration {
  /** True when this device holds a token id from POST /mobile/push-tokens. */
  enabled: boolean;
  /** Still reading the stored token id — the switch must not claim "off" yet. */
  loading: boolean;
  busy: boolean;
  error: PushRegistrationError | null;
  setEnabled: (next: boolean) => Promise<void>;
  clearError: () => void;
}

/**
 * Registering a push token while the OS has denied notifications would leave
 * the switch reading "on" for a device that can never receive an alert, so the
 * OS permission is requested first and a denial is reported as a denial rather
 * than being registered anyway.
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

  useEffect(() => {
    let cancelled = false;
    deviceStore
      .get(PUSH_TOKEN_ID_KEY)
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
  }, []);

  const setEnabled = useCallback(
    async (next: boolean) => {
      setError(null);
      setBusy(true);
      try {
        if (next) {
          // Ask the OS first. A device whose notifications are blocked cannot
          // receive push, so registering one would make the switch lie.
          let granted = false;
          try {
            const current = await Notifications.getPermissionsAsync();
            granted = current.status === 'granted';
            if (!granted && current.canAskAgain !== false) {
              const asked = await Notifications.requestPermissionsAsync();
              granted = asked.status === 'granted';
            }
          } catch {
            // Web and Expo Go can throw here. Fall through and let the
            // registration attempt itself be the source of truth.
            granted = true;
          }

          if (!granted) {
            setError('os_denied');
            return;
          }

          const fingerprint = await getOrCreateFingerprint();
          const result = await registerPushToken.mutateAsync({
            device_fingerprint: fingerprint,
            platform: resolvePlatform(),
            // The app has no FCM/APNs credential yet, so the fingerprint stands
            // in as the token. Kept byte-identical to the onboarding screen's
            // registration so the two never disagree about this device.
            push_token: fingerprint,
          });
          await deviceStore.set(PUSH_TOKEN_ID_KEY, result.token_id);
          setEnabledState(true);
        } else {
          const tokenId = await deviceStore.get(PUSH_TOKEN_ID_KEY);
          if (tokenId) await revokePushToken.mutateAsync(tokenId);
          await deviceStore.remove(PUSH_TOKEN_ID_KEY);
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
 * Language preferences, with the server as the source of truth.
 *
 * `lib/i18n/index.ts` boots i18next from the *device* locale, so without this
 * the patient's stored `preferred_language` was written to the API and then
 * ignored. This applies the stored value to the running i18n instance as soon
 * as GET /mobile/settings resolves, and writes the new value back when they
 * change it — so the switch takes effect immediately and survives a restart
 * for every screen mounted after the settings query has resolved.
 */
export function useLanguagePreference() {
  const { i18n } = useTranslation();
  const settingsQuery = useMobileSettings();
  const updateSettings = useUpdateMobileSettings();

  const stored = settingsQuery.data?.preferred_language;
  const active = normalizeLanguage(i18n.language);

  useEffect(() => {
    if (!stored) return;
    const target = normalizeLanguage(stored);
    if (normalizeLanguage(i18n.language) !== target) {
      void i18n.changeLanguage(target);
    }
  }, [stored, i18n]);

  const setLanguage = useCallback(
    (next: AppLanguage) => {
      if (normalizeLanguage(i18n.language) === next && normalizeLanguage(stored) === next) return;
      void i18n.changeLanguage(next);
      updateSettings.mutate({ preferred_language: next });
    },
    [i18n, stored, updateSettings],
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
  | 'push_consent_requests';

export const NOTIFICATION_PREFERENCE_KEYS: NotificationPreferenceKey[] = [
  'push_appointments',
  'push_lab_results',
  'push_prescriptions',
  'push_billing',
  'push_consent_requests',
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
