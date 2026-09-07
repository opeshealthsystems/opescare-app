/**
 * The alert that says somebody is asking to open your health record.
 *
 * This one is louder than the rest on purpose. Every other notification in this
 * app can wait: a result is still there in an hour, an appointment reminder is
 * not urgent. A consent request is different — a clinician is standing at a
 * counter waiting, and a patient who misses the prompt is a patient whose care
 * stalls, or worse, whose record gets opened under break-glass instead because
 * nobody could reach them.
 *
 * So it sounds THREE TIMES, and then it does it again, until the patient
 * answers.
 *
 * ── It also has to stop ─────────────────────────────────────────────────────
 * An alert that repeats forever is an alarm people learn to ignore, and on a
 * phone in a pocket it is simply cruel. This one is bounded three ways:
 *
 *   - a burst is 3 soundings, not a siren;
 *   - bursts stop after MAX_BURSTS, about a minute and a half in total;
 *   - and ANY answer kills it immediately — approve, deny, "decide later",
 *     leaving the screen, or the request being decided on another device.
 *
 * `start()` returns the stop function, so a caller that forgets to stop it is a
 * compile-time shape they have to actively ignore rather than a leak.
 *
 * ── Why native and web differ ───────────────────────────────────────────────
 * On native the OS owns the sound: it comes from the notification channel, and
 * the only way to sound again is to present the notification again. Re-using
 * one identifier means the tray still shows a single entry — Android replaces
 * it and re-alerts, rather than stacking three copies of the same request.
 *
 * The web build has no channels and no push, so it plays the file itself. It
 * deliberately does NOT pull in an audio library for native: that would add a
 * native module and a microphone permission to argue with, for a sound the OS
 * already owns.
 */
import { Platform } from 'react-native';
import { presentLocalNotification, type LocalNotificationInput } from './local';
import { playSoundOnWeb } from './sounds';

/** How many times the sound plays in one burst. */
export const BURST_SOUNDS = 3;

/** Gap between soundings inside a burst — long enough for the chime to finish. */
const WITHIN_BURST_MS = 1300;

/** Quiet between bursts. Long enough to answer, short enough to still be an alert. */
const BETWEEN_BURSTS_MS = 20_000;

/**
 * How many bursts before it gives up. Three soundings, five times, is roughly
 * ninety seconds of asking — past that the patient is not by their phone, and
 * the request is still waiting for them in the Privacy hub.
 */
const MAX_BURSTS = 5;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type ConsentAlertInput = {
  /** The consent request id — also the notification identifier, so it replaces rather than stacks. */
  requestId: string;
  notification: Omit<LocalNotificationInput, 'channel'>;
};

/**
 * Start alerting. Returns the stop function; call it the moment the patient
 * answers, and on unmount.
 */
export function startConsentAlert(input: ConsentAlertInput): () => void {
  let stopped = false;

  const stop = () => {
    stopped = true;
  };

  void (async () => {
    for (let burst = 0; burst < MAX_BURSTS; burst++) {
      for (let n = 0; n < BURST_SOUNDS; n++) {
        if (stopped) return;

        if (Platform.OS === 'web') {
          await playSoundOnWeb('consent');
        } else {
          await presentLocalNotification({
            ...input.notification,
            channel: 'consent',
            // One identifier, so the tray shows one request no matter how many
            // times it has asked.
            identifier: input.requestId,
          });
        }

        if (stopped) return;
        // No trailing gap on the last sounding of a burst — the gap between
        // bursts covers it.
        if (n < BURST_SOUNDS - 1) await sleep(WITHIN_BURST_MS);
      }

      if (stopped || burst === MAX_BURSTS - 1) return;
      await sleep(BETWEEN_BURSTS_MS);
    }
  })();

  return stop;
}
