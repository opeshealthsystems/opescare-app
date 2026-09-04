/**
 * Foreground notification listeners — the "app is OPEN when it arrives" path.
 *
 * WEB: the service worker handles every push (foreground or background). When
 * the app is open it also postMessages the payload to its clients (see
 * `scripts/sw-template.js`), and the listener here turns that into a mapped
 * chime. The SW payload carries `category` + `severity` directly.
 *
 * NATIVE: `expo-notifications` fires a received-listener for a notification that
 * lands while the app is foregrounded. The Expo push payload is content-free and
 * carries only `{ event, id, route }`, so `event` is mapped to the (category,
 * severity) the sound layer keys on. (The audible chime on native is produced by
 * expo-notifications' own handler today; this listener is the correct home for
 * the mapped sound once a native audio module is added — see `sound.ts`.)
 *
 * Both paths respect the patient's muted categories, and neither ever throws.
 * `installForegroundNotificationHandlers()` returns a cleanup function.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { isCategoryMuted } from './preferences';
import { playNotificationSound } from './sound';

/** The message type the service worker posts to its clients. */
const SW_PUSH_MESSAGE = 'opes-push';

/**
 * Native Expo push events → the (category, severity) the sound map keys on.
 * The event set is fixed server-side (`PushMessage::EVENTS`).
 */
const EVENT_TO_SOUND: Record<string, { category: string; severity: string }> = {
  critical_result: { category: 'critical_result', severity: 'critical' },
  staff_message: { category: 'message', severity: 'normal' },
  patient_message: { category: 'message', severity: 'normal' },
  appointment_reminder: { category: 'appointment_reminder', severity: 'normal' },
};

function maybePlay(category: string, severity: string): void {
  if (isCategoryMuted(category)) return;
  playNotificationSound(category, severity);
}

export function installForegroundNotificationHandlers(): () => void {
  const cleanups: Array<() => void> = [];

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const onMessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data || data.type !== SW_PUSH_MESSAGE || !data.payload) return;
        const payload = data.payload as { category?: unknown; severity?: unknown };
        const category = typeof payload.category === 'string' ? payload.category : 'system';
        const severity = typeof payload.severity === 'string' ? payload.severity : 'normal';
        maybePlay(category, severity);
      };
      navigator.serviceWorker.addEventListener('message', onMessage);
      cleanups.push(() => navigator.serviceWorker.removeEventListener('message', onMessage));
    }
  } else {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = (notification.request?.content?.data ?? {}) as Record<string, unknown>;
      const event = typeof data.event === 'string' ? data.event : '';
      const mapped = EVENT_TO_SOUND[event] ?? { category: 'system', severity: 'normal' };
      maybePlay(mapped.category, mapped.severity);
    });
    cleanups.push(() => subscription.remove());
  }

  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        // A failed teardown must not crash an unmount.
      }
    }
  };
}
