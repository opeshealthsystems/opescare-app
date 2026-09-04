import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushDevice, unregisterPushDevice } from '../api/push';

/**
 * Push registration — the client half of P4.8.
 *
 * Timing: this runs AFTER a successful sign-in, never on first launch. A
 * permission prompt shown to somebody who has not yet seen what the app does
 * is a prompt that gets denied once and, on iOS, can never be asked again.
 * By the time we ask, the user has an account and a reason to say yes.
 *
 * Denial is a normal outcome, not an error. Everything here resolves; the app
 * simply has no push, which changes nothing about correctness — results still
 * arrive in the inbox and are still acknowledged there. A push is a doorbell,
 * never the record.
 *
 * There are deliberately no preference screens here: this module registers and
 * deregisters, and that is all it does.
 */

/** Foreground behaviour. The payload is content-free, so showing it is safe. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let lastRegisteredToken: string | null = null;

/** The Expo project this build belongs to — required to mint a push token. */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? (Constants as any)?.easConfig?.projectId;
}

function platform(): 'ios' | 'android' | 'web' {
  return Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
}

/**
 * Android delivers nothing on a locked/idle device unless the notification
 * arrives on a channel with a high enough importance. A critical result is the
 * one thing in this app that has earned that; everything else uses `default`.
 */
async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.DEFAULT,
  });

  await Notifications.setNotificationChannelAsync('critical', {
    name: 'Critical results',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    // The payload carries no clinical content, but the lock screen is still a
    // public surface, so it shows the title only on an unlocked device.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

export type RegistrationOutcome =
  | 'registered'
  | 'permission-denied'
  | 'unsupported'
  | 'failed';

/**
 * Ask (once) and register. Safe to call on every sign-in: it re-registers the
 * same token, which also refreshes `last_seen_at` server-side and revives a
 * device retired at the previous sign-out.
 */
export async function registerForPush(): Promise<RegistrationOutcome> {
  try {
    // Simulators and the web build cannot receive a native push. Not a
    // failure — there is simply nothing to register.
    if (!Device.isDevice || Platform.OS === 'web') {
      return 'unsupported';
    }

    await ensureAndroidChannels();

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    // Only prompt when the OS still allows a prompt. Re-asking a user who has
    // already declined does nothing on iOS and is nagging on Android.
    if (status !== 'granted' && existing.canAskAgain) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }

    if (status !== 'granted') {
      return 'permission-denied';
    }

    const id = projectId();
    if (!id) {
      // A build without an EAS project id cannot mint a token. Degrade
      // quietly rather than crashing a session that is otherwise fine.
      return 'unsupported';
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });

    await registerPushDevice({
      token,
      platform: platform(),
      deviceName: Device.deviceName ?? null,
      appVersion: Constants.expoConfig?.version ?? null,
    });

    lastRegisteredToken = token;

    return 'registered';
  } catch {
    // Never surface this. A missing push is a degraded convenience; a crash on
    // the screen right after sign-in is a broken app.
    return 'failed';
  }
}

/**
 * Retire this device. MUST be called before the stored auth token is cleared,
 * which is why it lives in the sign-out path rather than in a screen.
 */
export async function unregisterForPush(): Promise<void> {
  try {
    const token =
      lastRegisteredToken ??
      (Device.isDevice && Platform.OS !== 'web' && projectId()
        ? (await Notifications.getExpoPushTokenAsync({ projectId: projectId()! })).data
        : null);

    if (!token) return;

    await unregisterPushDevice(token);
    lastRegisteredToken = null;
  } catch {
    // Sign-out must complete regardless. A token left registered here is
    // retired by the server the next time Expo reports it DeviceNotRegistered,
    // and it can only ever be re-pointed by a fresh authenticated register.
  }
}
