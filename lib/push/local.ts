/**
 * A notification this app posts to ITSELF, on a named channel.
 *
 * Why it exists: the consent prompt is driven by polling as well as by push
 * (`components/consent/ConsentPromptWatcher.tsx`), and this build cannot yet
 * receive a push at all (`lib/push/capability.ts`). When the poll finds a new
 * request there is still a patient to alert — so the app raises the alert the
 * OS would have raised, on the `consent` channel, with the hospital chime.
 * That gives native the sound without an audio player, puts a tappable entry
 * in the tray, and honours the person's channel settings exactly as a real
 * push would.
 *
 * Nothing here runs on web (no channels, no tray); the web prompt plays the
 * sound itself, see `lib/push/sounds.ts`.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { CHANNEL_SOUND_FILES, ensureNotificationChannels, type PushChannelId } from './channels';
import type { PushData } from './types';

export interface LocalNotificationInput {
  channel: PushChannelId;
  title: string;
  body: string;
  /** Same shape as a push's `data`, so a tap routes through the same handler. */
  data?: PushData;
  /**
   * A stable id for this notification. Presenting the same identifier again
   * REPLACES the tray entry and alerts again, rather than stacking copies —
   * which is how a repeating alert sounds more than once without burying the
   * notification shade in duplicates of one request.
   */
  identifier?: string;
}

/**
 * Post the notification now. Resolves `true` when it was handed to the OS.
 * Silently `false` when the permission is not granted — asking for it is the
 * onboarding screen's job, never a side effect of a poll.
 */
export async function presentLocalNotification(input: LocalNotificationInput): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') return false;

    await ensureNotificationChannels();

    const sound = CHANNEL_SOUND_FILES[input.channel];
    await Notifications.scheduleNotificationAsync({
      ...(input.identifier ? { identifier: input.identifier } : {}),
      content: {
        title: input.title,
        body: input.body,
        data: (input.data ?? {}) as Record<string, unknown>,
        // Android 8+ takes the sound from the channel; iOS from this field.
        sound: sound ?? 'default',
      },
      // `{ channelId }` alone is expo-notifications' "now, on this channel".
      // iOS has no channels, so it gets the plain immediate trigger.
      trigger: Platform.OS === 'android' ? { channelId: input.channel } : null,
    });
    return true;
  } catch {
    return false;
  }
}
