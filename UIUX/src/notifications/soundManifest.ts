/**
 * soundManifest.ts
 *
 * Maps a notification's (category, severity) to one of the synthesized sound
 * assets produced by `scripts/gen-notification-sounds.mjs`.
 *
 * Rule of thumb (hospital context — calm, professional, never alarming):
 *   - severity === 'critical'  -> the "critical" sound, regardless of category.
 *   - otherwise                -> grouped by category (message / appointment /
 *                                 result / payment / system).
 *
 * Playback:
 *   Web/desktop (Blade + patient web):  new Audio(`/sounds/${soundFor(...)}.wav`)
 *   Expo (mobile):                      Audio.Sound with the require() map below.
 */

export type NotificationCategory =
  | 'message'
  | 'appointment_booked'
  | 'appointment_reminder'
  | 'appointment_changed'
  | 'appointment_cancelled'
  | 'lab_request_submitted'
  | 'lab_request_approved'
  | 'lab_result_ready'
  | 'imaging_ready'
  | 'critical_result'
  | 'prescription_ready'
  | 'payment_due'
  | 'payment_received'
  | 'system';

export type NotificationSeverity = 'info' | 'normal' | 'warning' | 'critical';

/** The distinct synthesized sound keys (each maps to `<key>.wav`). */
export type SoundKey =
  | 'message'
  | 'appointment'
  | 'result'
  | 'critical'
  | 'payment'
  | 'system';

/** Category -> sound group (used when severity is not 'critical'). */
const CATEGORY_SOUND: Record<NotificationCategory, SoundKey> = {
  message: 'message',

  appointment_booked: 'appointment',
  appointment_reminder: 'appointment',
  appointment_changed: 'appointment',
  appointment_cancelled: 'appointment',

  lab_request_submitted: 'system',
  lab_request_approved: 'result',
  lab_result_ready: 'result',
  imaging_ready: 'result',
  prescription_ready: 'result',

  critical_result: 'critical',

  payment_due: 'payment',
  payment_received: 'payment',

  system: 'system',
};

/**
 * Returns the sound key for a notification. `critical` severity always wins.
 * Accepts loose strings (payloads come off the wire) and falls back to
 * 'system' for anything unrecognized.
 */
export function soundFor(category: string, severity: string): SoundKey {
  if (severity === ('critical' satisfies NotificationSeverity)) return 'critical';
  return CATEGORY_SOUND[category as NotificationCategory] ?? 'system';
}

/** Web/desktop absolute URL for a sound key (served from public/sounds/). */
export function soundUrl(key: SoundKey): string {
  return `/sounds/${key}.wav`;
}

/**
 * Expo require() map. Metro needs static require() literals, so they are listed
 * here explicitly. Use with expo-av / expo-audio:
 *   const mod = SOUND_MODULES[soundFor(cat, sev)];
 */
export const SOUND_MODULES: Record<SoundKey, number> = {
  message: require('../../assets/sounds/message.wav'),
  appointment: require('../../assets/sounds/appointment.wav'),
  result: require('../../assets/sounds/result.wav'),
  critical: require('../../assets/sounds/critical.wav'),
  payment: require('../../assets/sounds/payment.wav'),
  system: require('../../assets/sounds/system.wav'),
};
