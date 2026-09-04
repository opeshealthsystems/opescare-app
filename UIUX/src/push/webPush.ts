/**
 * Web Push subscription — the WEB half of P4.8.
 *
 * Native (Expo) push is handled entirely by `registration.ts` and must never
 * run this; everything here is guarded on `Platform.OS === 'web'` and on the
 * browser actually exposing Push. The flow:
 *
 *   1. after sign-in, fetch the VAPID public key from the engine;
 *   2. if the channel is enabled and a key exists, ask the SW's PushManager to
 *      subscribe (reusing an existing subscription if the browser already has
 *      one for this app);
 *   3. POST the subscription (endpoint + p256dh + auth) to the engine.
 *
 * On sign-out the subscription is deleted server-side and then unsubscribed in
 * the browser, so a shared machine does not keep pushing to the person who left.
 *
 * Every outcome resolves. A denied permission, an unsupported browser, a server
 * with no VAPID key, or a plain failure are all normal — the patient simply has
 * no web push, the in-app notification centre is unaffected, and nothing here
 * blocks or fails a sign-in.
 */
import { Platform } from 'react-native';
import {
  deleteWebPushSubscription,
  fetchVapidPublicKey,
  registerWebPushSubscription,
} from '../api/push';

export type WebPushOutcome =
  | 'subscribed'
  | 'unsupported'
  | 'permission-denied'
  | 'disabled'
  | 'failed';

/** VAPID keys travel as URL-safe base64; PushManager wants raw bytes
 *  (a BufferSource), so decode into an ArrayBuffer. */
function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return buffer;
}

/** `serviceWorker.ready` never resolves when no worker is registered (e.g. the
 *  `expo start` dev server, which ships no SW). Race it so we bail instead of
 *  leaving a promise hanging forever. */
function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5_000)),
  ]);
}

function pushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

export async function subscribeWebPush(): Promise<WebPushOutcome> {
  try {
    if (!pushSupported()) return 'unsupported';

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return 'permission-denied';

    const key = await fetchVapidPublicKey();
    if (!key.enabled || !key.public_key) return 'disabled';

    const registration = await readyRegistration();
    if (!registration) return 'unsupported';

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(key.public_key),
      }));

    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!json.endpoint || !p256dh || !auth) return 'failed';

    await registerWebPushSubscription({
      endpoint: json.endpoint,
      keys: { p256dh, auth },
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });

    return 'subscribed';
  } catch {
    return 'failed';
  }
}

export async function unsubscribeWebPush(): Promise<void> {
  try {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    const registration = await readyRegistration();
    if (!registration) return;

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    // Retire it server-side FIRST (while the session token is still valid), then
    // drop the browser subscription. A failure on either half is non-fatal.
    try {
      await deleteWebPushSubscription(subscription.endpoint);
    } catch {
      // Server may already have pruned it; the local unsubscribe below still runs.
    }
    await subscription.unsubscribe().catch(() => undefined);
  } catch {
    // Sign-out must complete regardless.
  }
}
