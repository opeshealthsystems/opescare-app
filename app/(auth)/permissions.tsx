import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardStack,
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
import {
  acquireExpoPushToken,
  getOrCreateFingerprint,
  getPushCapability,
  readNotificationPermission,
  readPushRegistrationId,
  registerPushStrings,
  savePushRegistration,
  type PushTokenOutcome,
} from '@/lib/push';

// EN/FR for the `push.*` keys used below, plus the corrections this screen and
// app/settings.tsx need while push cannot be delivered. See lib/push/strings.ts.
registerPushStrings();

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
 *
 * ## The notification row does not always ask
 *
 * This screen used to request the OS notification permission unconditionally
 * and then register `push_token: fingerprint` — the device's own random id,
 * which no push service can deliver to. It promised a patient "appointment
 * reminders, health alerts, and important updates" that the app had no way to
 * send. That is a false promise about medical reminders, so it is gone.
 *
 * The row is now driven by `getPushCapability()` (see `lib/push/capability.ts`):
 *
 *  - **deliverable** — behaves as before, but registers a genuine
 *    `ExponentPushToken[…]` minted by Expo.
 *  - **not deliverable** — which is this build today, because `app.json` has
 *    no EAS `projectId` — the row is read-only, no OS prompt is shown, no
 *    token is registered, and the copy says where the patient's alerts
 *    actually are: the in-app notification centre, which is real
 *    (`GET /api/mobile/notifications`).
 *
 * Nothing about the location row changes; that permission has always been
 * acted on.
 */

/**
 * `'unavailable'` is the notification row's state when this build cannot
 * receive a push at all. It is not an OS answer — the OS was never asked.
 */
type PermissionState = 'checking' | 'undetermined' | 'granted' | 'denied' | 'unavailable';

/** `Linking.openSettings()` is a native-only API: on web it is not merely a
 * no-op, it throws synchronously before any `.catch()` can attach. So web
 * never gets an "open settings" control — it gets a written instruction
 * instead, and the row stops being pressable. */
const CAN_OPEN_OS_SETTINGS = Platform.OS !== 'web';

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

  /** Constant for the life of the process — read once, so the row never shows
   * an offer it then withdraws. */
  const [pushCapability] = useState(getPushCapability);
  const pushDeliverable = pushCapability.deliverable;

  const [notifState, setNotifState] = useState<PermissionState>(pushDeliverable ? 'checking' : 'unavailable');
  const [locState, setLocState] = useState<PermissionState>('checking');
  const [busy, setBusy] = useState(false);
  const [pushRegisterFailed, setPushRegisterFailed] = useState(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Only read the notification permission on a build that could act on it.
    // Reading is harmless, but branching here keeps one rule in one place:
    // when push is not deliverable this screen does not touch the OS at all.
    if (pushDeliverable) {
      readNotificationPermission()
        .then((status) => !cancelled && setNotifState(toState(status)))
        .catch(() => !cancelled && setNotifState('undetermined'));
    }
    Location.getForegroundPermissionsAsync()
      .then((r) => !cancelled && setLocState(toState(r.status)))
      .catch(() => !cancelled && setLocState('undetermined'));
    return () => {
      cancelled = true;
    };
  }, [pushDeliverable]);

  /** Best-effort: hands the freshly minted token to the API, under the same
   * device fingerprint Settings uses, so the two screens agree about this
   * handset. Never blocks or fails the onboarding flow — a failure surfaces as
   * a note and the patient can retry from Settings.
   *
   * Takes the token rather than fetching its own: minting is a network round
   * trip to Expo, and doing it twice in one tap would turn a flaky connection
   * into a spurious failure straight after a success. */
  const registerDeviceForPush = useCallback(
    async (minted: Extract<PushTokenOutcome, { status: 'ready' }>) => {
      try {
        const existing = await readPushRegistrationId();
        if (existing) return;

        const fingerprint = await getOrCreateFingerprint();
        const result = await registerPushToken.mutateAsync({
          device_fingerprint: fingerprint,
          platform: minted.platform,
          // A real `ExponentPushToken[…]`. This field used to carry the
          // fingerprint on the line above it — the same random string twice,
          // one of them pretending to be a push credential.
          push_token: minted.token,
        });
        await savePushRegistration(result.token_id);
        setPushRegisterFailed(false);
      } catch {
        // Surfaced as a note, never as a blocker — Settings offers a retry.
        setPushRegisterFailed(true);
      }
    },
    [registerPushToken],
  );

  const requestNotifications = useCallback(async () => {
    // Unreachable when push is not deliverable — the row is not pressable and
    // handleContinue skips it — but guarded anyway, because "never ask for a
    // permission this build cannot act on" is the point of the change.
    if (!pushDeliverable) return;

    const outcome = await acquireExpoPushToken({ requestPermission: true });

    if (outcome.status === 'ready') {
      setNotifState('granted');
      await registerDeviceForPush(outcome);
      return;
    }
    if (outcome.status === 'permission_denied') {
      setNotifState(outcome.canAskAgain ? 'undetermined' : 'denied');
      return;
    }
    // 'failed' (offline, simulator, credentials not uploaded) or 'unavailable'.
    // The permission itself may well have been granted, so do not claim denial.
    setNotifState(await readNotificationPermission());
    setPushRegisterFailed(outcome.status === 'failed');
  }, [pushDeliverable, registerDeviceForPush]);

  const requestLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocState(toState(status));
    } catch {
      setLocState((prev) => (prev === 'checking' ? 'undetermined' : prev));
    }
  }, []);

  const handleRowPress = useCallback((state: PermissionState, request: () => Promise<void>) => {
    if (state === 'undetermined') {
      request();
    } else if (state === 'denied' && CAN_OPEN_OS_SETTINGS) {
      Linking.openSettings().catch(() => {});
    }
  }, []);

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
      // `notifState` is 'unavailable' — never 'undetermined' — on a build that
      // cannot deliver a push, so Continue does not raise an OS prompt for it.
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
        <CardStack spacing="sm">
          <Card variant="flush">
            {/* Two different rows, not one row with a caveat. When push cannot
              be delivered the icon, the body and the badge all say the same
              thing, and there is nothing to press. */}
            <PermissionRow
              icon={pushDeliverable ? 'bell' : 'bell-off'}
              tint="blue"
              title={t('push.permissions.title', {
                defaultValue: 'Notifications',
              })}
              body={
                pushDeliverable
                  ? t('push.permissions.bodyDeliverable', {
                      defaultValue: 'Appointment reminders, new results and consent requests, sent to this phone.',
                    })
                  : t('push.permissions.bodyUnavailable', {
                      defaultValue: "Reminders, results and consent requests appear in the app's notification centre.",
                    })
              }
              actionLabel={t('push.permissions.action', {
                defaultValue: 'Turn on notifications',
              })}
              unavailableLabel={t('push.permissions.badgeUnavailable', {
                defaultValue: 'In-app only',
              })}
              state={notifState}
              onPress={() => handleRowPress(notifState, requestNotifications)}
            />
          </Card>
          <Card variant="flush">
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
        </CardStack>

        {/* A denied permission is only actionable where OS settings can be
            opened; on web the row is read-only and this says what to do. */}
        {notifDeniedOnWeb || locDeniedOnWeb ? (
          <View style={styles.webHint}>
            <Icon name="globe" size={12} color={colors.textMuted} />
            <Text style={styles.meta}>{t('permissions.deniedWebHint')}</Text>
          </View>
        ) : null}

        {/* Says plainly that push is not switched on for this build, and where
            the patient's reminders and results actually arrive instead. */}
        {!pushDeliverable ? (
          <Note
            icon="info"
            text={t('push.permissions.noteUnavailable', {
              defaultValue:
                "This app build cannot deliver alerts to your phone's lock screen yet, so OpesCare does not ask for the notification permission. Nothing is missed — open Notifications inside the app to see everything OpesCare has sent you.",
            })}
          />
        ) : null}

        {pushRegisterFailed ? <Note icon="alert-triangle" text={t('permissions.pushRegisterError')} /> : null}

        <Text style={[styles.meta, styles.metaCenter]}>{t('permissions.optionalNote')}</Text>

        <Note icon="shield-check" text={t('permissions.privacyNote')} />

        <GradientButton label={t('permissions.continue')} onPress={handleContinue} loading={busy} />

        {/* Deliberately never disabled: this is the escape hatch, and a
            pending OS prompt must not be able to trap the patient here. */}
        <TouchableOpacity onPress={finish} accessibilityRole="button" hitSlop={8} style={styles.skip}>
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
  unavailableLabel,
  state,
  onPress,
}: {
  icon: IconName;
  tint: Tint;
  title: string;
  body: string;
  actionLabel: string;
  /** Badge text for `state === 'unavailable'`. Required only for a row that
   * can reach that state, which today is notifications and only notifications. */
  unavailableLabel?: string;
  state: PermissionState;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  // A denied permission is only actionable where OS settings can be opened;
  // on web the row becomes a read-only explanation instead of a dead control.
  // 'unavailable' is never actionable: the OS is not the obstacle, the build
  // is, and opening device settings would not help.
  const actionable = state === 'undetermined' || (state === 'denied' && CAN_OPEN_OS_SETTINGS);

  const badge: { label: string; tone: StatusTone; icon?: IconName } =
    state === 'granted'
      ? { label: t('permissions.statusAllowed'), tone: 'normal', icon: 'check' }
      : state === 'denied'
        ? {
            label: CAN_OPEN_OS_SETTINGS ? t('permissions.openSettings') : t('permissions.statusDenied'),
            tone: 'critical',
          }
        : state === 'unavailable'
          ? {
              // Neutral, not critical: nothing has gone wrong and there is
              // nothing for the patient to fix.
              label:
                unavailableLabel ??
                t('push.permissions.badgeUnavailable', {
                  defaultValue: 'In-app only',
                }),
              tone: 'neutral',
              icon: 'info',
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
      accessibilityLabel={actionable ? actionLabel : `${title}. ${badge.label}`}
    />
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },

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
