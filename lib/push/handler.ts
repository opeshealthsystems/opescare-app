/**
 * What happens when a push arrives, and when one is tapped.
 *
 * Two listeners, both native-only (the web build has no push — see
 * `lib/push/capability.ts`), started once per authenticated session by
 * `<PushListeners/>` in `app/_layout.tsx`:
 *
 *  - RECEIVED (app in the foreground): the notification is shown with its
 *    sound (`configurePushForegroundPresentation`) and the queries the push is
 *    about are invalidated, so the screen the person is looking at updates
 *    without a pull. A `consent_request` additionally raises the consent
 *    signal, and the prompt opens at once.
 *
 *  - RESPONSE (a tap, from the tray or the lock screen): the same refresh,
 *    then the screen for that kind of push — see `routeForPush`. Every route
 *    named there is a real file under `app/`; `scripts/nav-audit.mjs` reads
 *    this file, so a dead destination would fail the audit.
 *
 * A tap that started the app cold is delivered by
 * `getLastNotificationResponseAsync`, sometimes ALSO by the response listener;
 * the identifier of every response handled is kept so it routes once.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import type { QueryClient } from '@tanstack/react-query';
import { ensureNotificationChannels } from './channels';
import { markConsentAnnounced, signalConsentRequest } from './consentSignal';
import { configurePushForegroundPresentation } from './token';
import { parsePushData, pushId, type PushData } from './types';

/** The prefix every consent query in `lib/api/queries.ts` is keyed under. */
export const CONSENT_QUERY_KEY = ['consent-requests'] as const;

/**
 * The in-app screen for a push, by `data.type`. Returns null for a type this
 * app has no screen for; callers fall back to the notification centre.
 */
/** `data.action_url` when it is an in-app path (never an external URL). */
function actionUrl(data: PushData): string | null {
  const raw = (data as { action_url?: unknown }).action_url;
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
}

export function routeForPush(data: PushData): string | null {
  switch (data.type) {
    case 'consent_request':
      // The Privacy & Data hub lists pending requests; the prompt itself
      // opens from the consent signal, not from navigation.
      return '/privacy';
    case 'family_invitation':
      return '/family';
    case 'lab_result': {
      const id = pushId(data.lab_order_id);
      return id ? `/labs/${encodeURIComponent(id)}` : '/labs';
    }
    case 'appointment': {
      const id = pushId(data.appointment_id);
      return id ? `/appointments/${encodeURIComponent(id)}` : '/appointments';
    }
    case 'message': {
      const id = pushId(data.thread_id);
      return id ? `/messages/${encodeURIComponent(id)}` : '/(tabs)/messages';
    }
    case 'emergency_access':
      return '/privacy/access-logs';
    case 'prescription':
      return actionUrl(data) ?? '/prescriptions';
    case 'reservation':
      return actionUrl(data) ?? '/pharmacy';
    case 'lab_request':
      return actionUrl(data) ?? '/labs';
    default:
      // A server-side screen hint is honoured for kinds this build does not
      // know by name, as long as it is an in-app path.
      return actionUrl(data);
  }
}

/** Invalidate every query whose first key segment contains one of `needles`. */
function invalidateByKeyword(queryClient: QueryClient, needles: string[]): void {
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const head = query.queryKey[0];
      if (typeof head !== 'string') return false;
      const lower = head.toLowerCase();
      return needles.some((needle) => lower.includes(needle));
    },
  });
}

/**
 * Refresh what a push is about. Safe to call for a tap as well as an arrival:
 * a push that landed while the app was closed has refreshed nothing yet.
 */
export function handleReceivedPush(data: PushData, queryClient: QueryClient): void {
  switch (data.type) {
    case 'consent_request': {
      const id = pushId(data.consent_request_id);
      // The OS has shown (and sounded) this one; the watcher must not repeat it.
      if (id) markConsentAnnounced(id);
      void queryClient.invalidateQueries({ queryKey: [...CONSENT_QUERY_KEY] });
      signalConsentRequest(id);
      break;
    }
    case 'family_invitation':
      invalidateByKeyword(queryClient, ['family']);
      break;
    case 'lab_result':
      invalidateByKeyword(queryClient, ['lab', 'timeline']);
      break;
    case 'appointment':
      invalidateByKeyword(queryClient, ['appointment']);
      break;
    case 'message':
      invalidateByKeyword(queryClient, ['message', 'thread']);
      break;
    case 'emergency_access':
      invalidateByKeyword(queryClient, ['access-log', 'access_log', 'consent']);
      break;
    default:
      break;
  }
  // Whatever it was, the bell has a new entry.
  invalidateByKeyword(queryClient, ['notification']);
}

/** Open the screen for a push; the notification centre when there is none. */
export function openPushDestination(data: PushData): void {
  const route = routeForPush(data) ?? '/notifications';
  try {
    router.push(route as never);
  } catch {
    // Navigation before the root layout has mounted — the guard in
    // app/_layout.tsx lands the session somewhere sensible regardless.
  }
}

const handledResponses = new Set<string>();

function responseKey(response: Notifications.NotificationResponse): string {
  return `${response.notification.request.identifier}:${response.notification.date}`;
}

function handleResponse(response: Notifications.NotificationResponse, queryClient: QueryClient): void {
  const key = responseKey(response);
  if (handledResponses.has(key)) return;
  handledResponses.add(key);

  const data = parsePushData(response.notification.request.content.data);
  handleReceivedPush(data, queryClient);
  openPushDestination(data);
}

/**
 * Start listening. Returns the stop function, for the effect that owns it.
 * A no-op on web, where none of these APIs exist.
 */
export function startPushListeners(queryClient: QueryClient): () => void {
  if (Platform.OS === 'web') return () => {};

  configurePushForegroundPresentation();
  void ensureNotificationChannels();

  const subscriptions: { remove: () => void }[] = [];
  try {
    subscriptions.push(
      Notifications.addNotificationReceivedListener((notification) => {
        handleReceivedPush(parsePushData(notification.request.content.data), queryClient);
      }),
    );
    subscriptions.push(
      Notifications.addNotificationResponseReceivedListener((response) => {
        handleResponse(response, queryClient);
      }),
    );
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response, queryClient);
      })
      .catch(() => {
        // No cold-start tap to replay.
      });
  } catch {
    // The native module is absent (a build without expo-notifications, or a
    // test renderer). Push simply does not exist in this process.
  }

  return () => {
    for (const subscription of subscriptions) {
      try {
        subscription.remove();
      } catch {
        // Already removed.
      }
    }
  };
}
