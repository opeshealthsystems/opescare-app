import { apiClient } from './client';

/**
 * The device register (server: P4.8).
 *
 * Both endpoints take the owner from the Sanctum session, never from the
 * body — there is deliberately no way for this client to claim a device
 * belongs to somebody else.
 */

export type PushPlatform = 'ios' | 'android' | 'web';

export type RegisterDeviceInput = {
  token: string;
  platform: PushPlatform;
  deviceName?: string | null;
  appVersion?: string | null;
};

export async function registerPushDevice(input: RegisterDeviceInput): Promise<void> {
  await apiClient.post('/push/devices', {
    token: input.token,
    platform: input.platform,
    device_name: input.deviceName ?? null,
    app_version: input.appVersion ?? null,
  });
}

/**
 * Retire this device. Called on sign-out, while the token is still valid —
 * after `clearStoredToken()` there is no session left to authenticate with.
 * Omitting `token` retires every device this principal has, which is the
 * right behaviour only when the local token could not be read.
 */
export async function unregisterPushDevice(token?: string | null): Promise<void> {
  await apiClient.delete('/push/devices', {
    data: token ? { token } : {},
  });
}

/**
 * Web Push (VAPID) browser subscriptions — the patient half of the same engine.
 *
 * These three endpoints are NOT the enveloped portal shape: the controller
 * (`PushSubscriptionController`) answers with a bare JSON body, so they are read
 * off `res.data` directly rather than through the `{ data }` unwrappers in
 * portal.ts. The owner is always the Sanctum session's linked patient, never
 * anything in the body.
 */

/** `GET /patient/push/vapid-public-key` — the applicationServerKey the browser needs. */
export type VapidKeyInfo = {
  /** URL-safe base64 VAPID public key. Empty when the server has no key set. */
  public_key: string;
  /** False when the channel is disabled or no key is configured — do not subscribe. */
  enabled: boolean;
};

export async function fetchVapidPublicKey(): Promise<VapidKeyInfo> {
  const res = await apiClient.get<VapidKeyInfo>('/patient/push/vapid-public-key');
  return res.data;
}

/** The subscription body the server stores, shaped as `PushSubscription.toJSON()` gives it. */
export type WebPushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  user_agent?: string | null;
};

/** `POST /patient/push/subscriptions` — register (or refresh) this browser. */
export async function registerWebPushSubscription(input: WebPushSubscriptionInput): Promise<void> {
  await apiClient.post('/patient/push/subscriptions', {
    endpoint: input.endpoint,
    keys: input.keys,
    user_agent: input.user_agent ?? null,
  });
}

/** `DELETE /patient/push/subscriptions` — retire one endpoint owned by the caller. */
export async function deleteWebPushSubscription(endpoint: string): Promise<void> {
  await apiClient.delete('/patient/push/subscriptions', { data: { endpoint } });
}
