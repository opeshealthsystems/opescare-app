/**
 * A tiny in-memory cache of the patient's muted notification categories.
 *
 * The foreground sound player consults this synchronously when a notification
 * arrives — there is no time to make a network round trip at the moment a push
 * lands — so the map is loaded once after sign-in and refreshed on demand.
 *
 * This is belt-and-braces: the server already refuses to push a muted category
 * at all (PushDispatcher consults the same NotificationPreference rows before
 * dispatch). This second check means that even a notification that arrives by
 * some other path — a poll, an already-queued push — still respects the mute
 * before it makes a sound.
 */
import { fetchNotificationPreferences } from '../api/notifications';

let mutedByCategory: Record<string, boolean> = {};

/** Pull the latest mute map from the engine. Never throws — a failure leaves the
 *  previous map in place (or the empty default, which mutes nothing). */
export async function refreshMutePreferences(): Promise<void> {
  try {
    const prefs = await fetchNotificationPreferences();
    mutedByCategory = prefs.muted ?? {};
  } catch {
    // Keep whatever we had. Failing to read a preference must never make the
    // app noisier OR quieter than it already is in a way we can't explain.
  }
}

/** True when the patient has muted this category. Unknown categories are unmuted. */
export function isCategoryMuted(category: string): boolean {
  return mutedByCategory[category] === true;
}

/** Drop the cache on sign-out so the next patient on a shared phone starts clean. */
export function clearMutePreferences(): void {
  mutedByCategory = {};
}
