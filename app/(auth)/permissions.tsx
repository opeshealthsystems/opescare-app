import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Check,
  ChevronRight,
  CircleAlert,
  Globe,
  MapPin,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { Logo } from '../../components/ui/Logo';
import { useAuthStore } from '../../lib/store/auth';
import { useRegisterPushToken } from '../../lib/api/queries';
import { colors } from '../../theme/tokens';

/**
 * One-time priming screen shown right after signup / first successful login
 * (see lib/store/auth.ts's `permissions_pending` status) — explains why
 * OpesCare wants notification + location access before asking the OS for
 * them, then hands off to /(tabs)/home.
 *
 * NOTHING HERE MAY BLOCK THE APP. Both permissions are optional, "Skip for
 * now" stays enabled even while a request is in flight, and every exit path
 * funnels through `finish()`, which settles the auth status and replaces to
 * /(tabs)/home regardless of what the OS answered.
 *
 * Layout follows `Mobile app screens/a_clean_mobile_app_permission_screen_mockup_iphon.png`
 * (step badge, icon-badged rows with a status pill and chevron, privacy note,
 * continue + skip). Only the two permissions the app actually requests are
 * listed — the reference's camera/files/health-data rows would be decoration.
 */

type PermissionState = 'checking' | 'undetermined' | 'granted' | 'denied';

/** Mirrors app/settings.tsx's device-registration keys exactly, so a push
 * token registered here is recognized by the Settings toggle later instead
 * of being registered twice under a different identity. */
const DEVICE_FINGERPRINT_KEY = 'opescare_device_fingerprint';
const PUSH_TOKEN_ID_KEY = 'opescare_push_token_id';

/** `Linking.openSettings()` is a native-only API: on web it is not merely a
 * no-op, it throws synchronously before any `.catch()` can attach. So web
 * never gets an "open settings" control — it gets a written instruction
 * instead, and the row stops being pressable. */
const CAN_OPEN_OS_SETTINGS = Platform.OS !== 'web';

const deviceStore =
  Platform.OS === 'web'
    ? {
        get: async (key: string) =>
          typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null,
        set: async (key: string, value: string) => localStorage.setItem(key, value),
      }
    : {
        get: (key: string) => SecureStore.getItemAsync(key),
        set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      };

function generateFingerprint(): string {
  const random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `${Platform.OS}-${Date.now().toString(36)}-${random}`.slice(0, 128);
}

function resolvePlatform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

function toState(status: string | undefined): PermissionState {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export default function PermissionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const completePermissionsPriming = useAuthStore((s) => s.completePermissionsPriming);
  const registerPushToken = useRegisterPushToken();

  const [notifState, setNotifState] = useState<PermissionState>('checking');
  const [locState, setLocState] = useState<PermissionState>('checking');
  const [busy, setBusy] = useState(false);
  const [pushRegisterFailed, setPushRegisterFailed] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Notifications.getPermissionsAsync()
      .then((r) => !cancelled && setNotifState(toState(r.status)))
      .catch(() => !cancelled && setNotifState('undetermined'));
    Location.getForegroundPermissionsAsync()
      .then((r) => !cancelled && setLocState(toState(r.status)))
      .catch(() => !cancelled && setLocState('undetermined'));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Best-effort: registers this device for push once notifications are
   * granted, reusing the same fingerprint convention as Settings so the two
   * screens agree on device state. Never blocks or fails the onboarding
   * flow — a failure here surfaces as a note and the user registers later
   * from Settings instead. */
  const registerDeviceForPush = useCallback(async () => {
    try {
      const existing = await deviceStore.get(PUSH_TOKEN_ID_KEY);
      if (existing) return;
      let fingerprint = await deviceStore.get(DEVICE_FINGERPRINT_KEY);
      if (!fingerprint) {
        fingerprint = generateFingerprint();
        await deviceStore.set(DEVICE_FINGERPRINT_KEY, fingerprint);
      }
      const result = await registerPushToken.mutateAsync({
        device_fingerprint: fingerprint,
        platform: resolvePlatform(),
        push_token: fingerprint,
      });
      await deviceStore.set(PUSH_TOKEN_ID_KEY, result.token_id);
      setPushRegisterFailed(false);
    } catch {
      // Surfaced as a note, never as a blocker — Settings offers a retry.
      setPushRegisterFailed(true);
    }
  }, [registerPushToken]);

  const requestNotifications = useCallback(async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      const next = toState(status);
      setNotifState(next);
      if (next === 'granted') await registerDeviceForPush();
    } catch {
      setNotifState((prev) => (prev === 'checking' ? 'undetermined' : prev));
    }
  }, [registerDeviceForPush]);

  const requestLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocState(toState(status));
    } catch {
      setLocState((prev) => (prev === 'checking' ? 'undetermined' : prev));
    }
  }, []);

  const handleRowPress = useCallback(
    (state: PermissionState, request: () => Promise<void>) => {
      if (state === 'undetermined') {
        request();
      } else if (state === 'denied' && CAN_OPEN_OS_SETTINGS) {
        Linking.openSettings().catch(() => {});
      }
    },
    [],
  );

  /** The single exit. Guarded so a double-tap cannot fire two navigations,
   * and wrapped so a device-storage hiccup writing the "primer seen" flag can
   * never strand the patient on this screen. */
  const finish = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      await completePermissionsPriming();
    } catch {
      // Worst case the primer shows again next launch — still leave.
    }
    router.replace('/(tabs)/home');
  }, [completePermissionsPriming, router]);

  const handleContinue = useCallback(async () => {
    setBusy(true);
    try {
      if (notifState === 'undetermined') await requestNotifications();
      if (locState === 'undetermined') await requestLocation();
    } finally {
      setBusy(false);
      finish();
    }
  }, [notifState, locState, requestNotifications, requestLocation, finish]);

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
      >
        <View className="items-center pb-1 pt-4">
          <Logo size={64} markOnly />
        </View>

        <View className="mt-4 items-center">
          <View className="rounded-full bg-brand-50 px-4 py-1.5">
            <Text className="text-xs font-bold text-brand-600">{t('permissions.stepBadge')}</Text>
          </View>
        </View>

        <Text className="mt-4 text-center text-2xl font-extrabold text-navy-text">
          {t('permissions.title')}
        </Text>
        <Text className="mt-2 text-center text-sm leading-5 text-navy-secondary">
          {t('permissions.subtitle')}
        </Text>

        <View className="mt-7">
          <PermissionRow
            icon={Bell}
            title={t('permissions.notificationsTitle')}
            body={t('permissions.notificationsBody')}
            actionLabel={t('permissions.notificationsAction')}
            state={notifState}
            t={t}
            onPress={() => handleRowPress(notifState, requestNotifications)}
          />
          <PermissionRow
            icon={MapPin}
            title={t('permissions.locationTitle')}
            body={t('permissions.locationBody')}
            actionLabel={t('permissions.locationAction')}
            state={locState}
            t={t}
            onPress={() => handleRowPress(locState, requestLocation)}
          />
        </View>

        {pushRegisterFailed ? (
          <View
            className="mt-1 flex-row items-start rounded-2xl p-4"
            style={{ backgroundColor: colors.semantic.warningSurface }}
          >
            <CircleAlert size={16} color={colors.semantic.warning} />
            <Text className="ml-3 flex-1 text-xs leading-4 text-navy-secondary">
              {t('permissions.pushRegisterError')}
            </Text>
          </View>
        ) : null}

        <Text className="mt-4 text-center text-xs leading-4 text-navy-muted">
          {t('permissions.optionalNote')}
        </Text>

        <View className="mt-5 flex-row items-start rounded-2xl bg-brand-50 p-4">
          <ShieldCheck size={16} color={colors.brand[600]} />
          <Text className="ml-3 flex-1 text-xs leading-4 text-navy-secondary">
            {t('permissions.privacyNote')}
          </Text>
        </View>

        <View className="mt-7">
          <Button label={t('permissions.continue')} onPress={handleContinue} loading={busy} />
        </View>

        {/* Deliberately never disabled: this is the escape hatch, and a
            pending OS prompt must not be able to trap the patient here. */}
        <Pressable
          onPress={finish}
          accessibilityRole="button"
          hitSlop={8}
          className="mt-4 items-center py-3"
        >
          <Text className="text-sm font-semibold text-brand-500">{t('permissions.skip')}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function PermissionRow({
  icon: Icon,
  title,
  body,
  actionLabel,
  state,
  t,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel: string;
  state: PermissionState;
  t: (key: string) => string;
  onPress: () => void;
}) {
  // A denied permission is only actionable where OS settings can be opened;
  // on web the row becomes a read-only explanation instead of a dead control.
  const deniedOnWeb = state === 'denied' && !CAN_OPEN_OS_SETTINGS;
  const actionable = state === 'undetermined' || (state === 'denied' && CAN_OPEN_OS_SETTINGS);

  const badge =
    state === 'granted'
      ? {
          label: t('permissions.statusAllowed'),
          bg: colors.semantic.successSurface,
          fg: colors.semantic.success,
        }
      : state === 'denied'
        ? {
            label: CAN_OPEN_OS_SETTINGS
              ? t('permissions.openSettings')
              : t('permissions.statusDenied'),
            bg: colors.semantic.dangerSurface,
            fg: colors.semantic.danger,
          }
        : state === 'checking'
          ? {
              label: t('permissions.statusChecking'),
              bg: colors.cream[200],
              fg: colors.navy.muted,
            }
          : { label: t('permissions.enable'), bg: colors.brand[50], fg: colors.brand[600] };

  return (
    <Pressable
      onPress={onPress}
      disabled={!actionable}
      accessibilityRole={actionable ? 'button' : undefined}
      accessibilityLabel={actionable ? actionLabel : `${title}. ${badge.label}`}
      className="mb-3 flex-row items-center rounded-2xl border border-cream-300 bg-white px-4 py-4"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-50">
        <Icon size={20} color={colors.brand[600]} />
      </View>

      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-bold text-navy-text">{title}</Text>
        <Text className="mt-1 text-xs leading-4 text-navy-secondary">{body}</Text>
        {deniedOnWeb ? (
          <View className="mt-2 flex-row items-start">
            <Globe size={12} color={colors.navy.muted} style={{ marginTop: 1 }} />
            <Text className="ml-1.5 flex-1 text-xs leading-4 text-navy-muted">
              {t('permissions.deniedWebHint')}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="ml-2 items-end">
        <View
          className="flex-row items-center rounded-full px-3 py-1.5"
          style={{ backgroundColor: badge.bg }}
        >
          {state === 'granted' ? (
            <Check size={12} color={badge.fg} style={{ marginRight: 4 }} />
          ) : null}
          <Text className="text-xs font-semibold" style={{ color: badge.fg }}>
            {badge.label}
          </Text>
        </View>
      </View>

      {actionable ? (
        <ChevronRight size={18} color={colors.navy.muted} style={{ marginLeft: 4 }} />
      ) : (
        // Keeps every row's content on the same horizontal rhythm whether or
        // not it carries a chevron.
        <View style={{ width: 22 }} />
      )}
    </Pressable>
  );
}
