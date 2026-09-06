/**
 * Android notification channels — one per kind of thing OpesCare sends, each
 * with its own sound.
 *
 * On Android 8+ the sound, importance and vibration of a notification are
 * properties of its CHANNEL, fixed when the channel is created; the push
 * payload only names the channel (`channelId`). So the five sounds in
 * `assets/sounds/` (registered with the expo-notifications config plugin in
 * app.json, which copies them into `res/raw/`) only ever play if a channel
 * carrying them exists before the first push lands. This module creates them,
 * once per launch, from wherever push is initialised.
 *
 * Channel ids and sound basenames are the server's vocabulary too
 * (`ExpoPushService` sends `channelId: 'consent', sound: 'opescare_consent.wav'`);
 * renaming either side alone silently downgrades every push to the default
 * sound.
 *
 * `consent` and `emergency` are MAX importance: a clinician standing in front
 * of a patient is waiting on the first, and the second is someone opening the
 * record without asking. `lockscreenVisibility: PRIVATE` on all but the
 * general channel: a lock screen is a public surface and no OpesCare push may
 * put a facility name or a result on one (the payloads carry none either — two
 * locks). Badges stay off; the in-app bell is the one unread count.
 *
 * Channel NAMES are what the person reads in system settings, so they come
 * from the catalogue in the current language. Android lets a name be updated
 * on a later `setNotificationChannelAsync`, so a language switch is reflected
 * on the next launch; importance and sound cannot be changed after creation.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import i18n from '../i18n';

export const PUSH_CHANNEL_IDS = [
  'consent',
  'messages',
  'results',
  'appointments',
  'emergency',
  'default',
] as const;

export type PushChannelId = (typeof PUSH_CHANNEL_IDS)[number];

/**
 * Sound file per channel, by basename — the same string the server puts in
 * the push `sound` field and the same file app.json registers. `null` means
 * the system default.
 */
export const CHANNEL_SOUND_FILES: Record<PushChannelId, string | null> = {
  consent: 'opescare_consent.wav',
  messages: 'opescare_message.wav',
  results: 'opescare_result.wav',
  appointments: 'opescare_appointment.wav',
  emergency: 'opescare_alert.wav',
  default: null,
};

export function isPushChannelId(value: unknown): value is PushChannelId {
  return typeof value === 'string' && (PUSH_CHANNEL_IDS as readonly string[]).includes(value);
}

/** Vibration patterns in ms: [delay, on, off, on, …]. Distinct so a pocketed phone tells them apart. */
const VIBRATION: Record<PushChannelId, number[] | null> = {
  consent: [0, 300, 150, 300],
  messages: [0, 150],
  results: [0, 200],
  appointments: [0, 150, 100, 150],
  emergency: [0, 400, 200, 400, 200, 400],
  default: null,
};

/** A channel created by an earlier version of this app. Removed so it cannot shadow the new ones. */
const RETIRED_CHANNEL_IDS = ['clinical'];

function importanceFor(id: PushChannelId): Notifications.AndroidImportance {
  switch (id) {
    case 'consent':
    case 'emergency':
      return Notifications.AndroidImportance.MAX;
    case 'default':
      return Notifications.AndroidImportance.DEFAULT;
    default:
      return Notifications.AndroidImportance.HIGH;
  }
}

let ensured: Promise<void> | null = null;

/**
 * Create (or refresh the names of) every channel. Idempotent per launch; a
 * failure lets the next caller try again. Resolves immediately off Android.
 */
export function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (ensured) return ensured;

  ensured = (async () => {
    for (const id of PUSH_CHANNEL_IDS) {
      await Notifications.setNotificationChannelAsync(id, {
        name: i18n.t(`push.channels.${id}.name`),
        description: i18n.t(`push.channels.${id}.description`),
        importance: importanceFor(id),
        sound: CHANNEL_SOUND_FILES[id] ?? undefined,
        vibrationPattern: VIBRATION[id] ?? undefined,
        enableVibrate: VIBRATION[id] !== null,
        lockscreenVisibility:
          id === 'default'
            ? Notifications.AndroidNotificationVisibility.PUBLIC
            : Notifications.AndroidNotificationVisibility.PRIVATE,
        showBadge: false,
        bypassDnd: false,
      });
    }
    for (const id of RETIRED_CHANNEL_IDS) {
      try {
        await Notifications.deleteNotificationChannelAsync(id);
      } catch {
        // Never existed on this install, or the OS refused — neither matters.
      }
    }
  })().catch(() => {
    // A missing channel degrades a push to the default sound; it must not
    // take a screen down. Allow a retry from the next caller.
    ensured = null;
  });

  return ensured;
}
