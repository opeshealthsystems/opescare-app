import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  GradientButton,
  Icon,
  ListRow,
  ScreenHeader,
  StatusBadge,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { Note } from '@/components/enrol/shared';
import { Screen } from '@/components/ui/Screen';
import { useAuthStore } from '@/lib/store/auth';
import { useRegisterPushToken } from '@/lib/api/queries';

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
 * Presentation is the OPES kit's list-card pattern: one `ListRow` per
 * permission with a `StatusBadge` for its state. Only the two permissions the
 * app actually requests are listed — camera/files/health-data rows would be
 * decoration.
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  const notifDeniedOnWeb = notifState === 'denied' && !CAN_OPEN_OS_SETTINGS;
  const locDeniedOnWeb = locState === 'denied' && !CAN_OPEN_OS_SETTINGS;

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('permissions.title')}
        subtitle={t('permissions.subtitle')}
        showBack={false}
        right={<StatusBadge status="pending" tone="pending" label={t('permissions.stepBadge')} size="sm" />}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Card variant="flush">
          <PermissionRow
            icon="bell"
            tint="blue"
            title={t('permissions.notificationsTitle')}
            body={t('permissions.notificationsBody')}
            actionLabel={t('permissions.notificationsAction')}
            state={notifState}
            onPress={() => handleRowPress(notifState, requestNotifications)}
            divider
          />
          <PermissionRow
            icon="location"
            tint="green"
            title={t('permissions.locationTitle')}
            body={t('permissions.locationBody')}
            actionLabel={t('permissions.locationAction')}
            state={locState}
            onPress={() => handleRowPress(locState, requestLocation)}
          />
        </Card>

        {/* A denied permission is only actionable where OS settings can be
            opened; on web the row is read-only and this says what to do. */}
        {notifDeniedOnWeb || locDeniedOnWeb ? (
          <View style={styles.webHint}>
            <Icon name="globe" size={12} color={colors.textMuted} />
            <Text style={styles.meta}>{t('permissions.deniedWebHint')}</Text>
          </View>
        ) : null}

        {pushRegisterFailed ? (
          <Note icon="alert-triangle" text={t('permissions.pushRegisterError')} />
        ) : null}

        <Text style={[styles.meta, styles.metaCenter]}>{t('permissions.optionalNote')}</Text>

        <Note icon="shield-check" text={t('permissions.privacyNote')} />

        <GradientButton label={t('permissions.continue')} onPress={handleContinue} loading={busy} />

        {/* Deliberately never disabled: this is the escape hatch, and a
            pending OS prompt must not be able to trap the patient here. */}
        <TouchableOpacity
          onPress={finish}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.skip}
        >
          <Text style={styles.skipText}>{t('permissions.skip')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

function PermissionRow({
  icon,
  tint,
  title,
  body,
  actionLabel,
  state,
  onPress,
  divider,
}: {
  icon: IconName;
  tint: Tint;
  title: string;
  body: string;
  actionLabel: string;
  state: PermissionState;
  onPress: () => void;
  divider?: boolean;
}) {
  const { t } = useTranslation();
  // A denied permission is only actionable where OS settings can be opened;
  // on web the row becomes a read-only explanation instead of a dead control.
  const actionable = state === 'undetermined' || (state === 'denied' && CAN_OPEN_OS_SETTINGS);

  const badge: { label: string; tone: StatusTone; icon?: IconName } =
    state === 'granted'
      ? { label: t('permissions.statusAllowed'), tone: 'normal', icon: 'check' }
      : state === 'denied'
        ? {
            label: CAN_OPEN_OS_SETTINGS
              ? t('permissions.openSettings')
              : t('permissions.statusDenied'),
            tone: 'critical',
          }
        : state === 'checking'
          ? { label: t('permissions.statusChecking'), tone: 'neutral' }
          : { label: t('permissions.enable'), tone: 'pending' };

  return (
    <ListRow
      icon={icon}
      tint={tint}
      title={title}
      subtitle={body}
      trailing={<StatusBadge status={state} tone={badge.tone} label={badge.label} icon={badge.icon} size="sm" />}
      onPress={actionable ? onPress : undefined}
      chevron={actionable}
      divider={divider}
      accessibilityLabel={actionable ? actionLabel : `${title}. ${badge.label}`}
    />
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },

    webHint: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginTop: -spacing.sm,
      marginHorizontal: spacing.sm,
    },
    meta: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    metaCenter: { flex: 0, textAlign: 'center' },

    skip: { alignSelf: 'center', paddingVertical: spacing.sm },
    skipText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.link,
    },
  });
