/**
 * Notification engine — patient preference + unread-count clients.
 *
 * These sit alongside the list / mark-read / mark-all-read endpoints in
 * dashboard.ts (which predate the unified engine and live on
 * PatientDashboardController). The two endpoints here are served by
 * `PatientNotificationController` and speak the enveloped portal shape, so they
 * go through the same `{ data }` unwrappers as the rest of the portal.
 *
 *   GET  /patient/notifications/unread-count   → { unread }
 *   GET  /patient/notifications/preferences    → { categories, muted }
 *   PUT  /patient/notifications/preferences    → { categories, muted }
 *
 * `muted` is a map of category token → boolean. The category tokens are exactly
 * the ones `soundFor(category, severity)` keys on, so a muted category is both
 * "do not push" (enforced server-side by PushDispatcher) and "do not sound"
 * (enforced client-side by the foreground player).
 */
import { getOne, put } from './portal';

export type NotificationPreferences = {
  /** Every category the engine can notify on. */
  categories: string[];
  /** category token → muted. Absent/false means the patient wants it. */
  muted: Record<string, boolean>;
};

export type UnreadCount = { unread: number };

export const fetchUnreadNotificationCount = () =>
  getOne<UnreadCount>('/patient/notifications/unread-count');

export const fetchNotificationPreferences = () =>
  getOne<NotificationPreferences>('/patient/notifications/preferences');

export const updateNotificationPreferences = (muted: Record<string, boolean>) =>
  put<NotificationPreferences>('/patient/notifications/preferences', { muted });
