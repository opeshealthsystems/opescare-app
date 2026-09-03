/**
 * Startup version gate + lightweight notification unread badge.
 *
 * Kept in its own module (rather than lib/api/queries.ts) because both hooks
 * back cross-cutting chrome — the forced-update gate mounted in the root
 * layout, and the unread badge on the notifications entry point — instead of
 * one feature screen.
 *
 * Backend surface (both endpoints already existed and were previously unused
 * by this app):
 *   GET /mobile/app-config                 — public, pre-auth  (MobileAppConfigController::show)
 *   GET /mobile/notifications/unread-count — authed            (MobileNotificationController::unreadCount)
 */
import { useMemo } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';

// ---------------------------------------------------------------------------
// GET /mobile/app-config — the version gate
// ---------------------------------------------------------------------------

/** Exact shape returned by MobileAppConfigController::show. */
export interface AppConfig {
  /** Lowest build number still allowed to run. Anything below is hard-blocked. */
  min_supported_build: number;
  /** Newest published version, shown in the update prompt. */
  latest_version: string;
  /** Where the update CTA sends the user. */
  store_url: string;
}

/**
 * The endpoint is public, so this runs before login too. `retry: 1` and a long
 * `staleTime` keep it cheap; every failure mode is handled by failing OPEN in
 * `useUpdateGate` below, so nothing here can lock the user out.
 */
export function useAppConfig() {
  return useQuery({
    queryKey: ['app-config'],
    queryFn: async () => (await apiClient.get<AppConfig>(endpoints.appConfig)).data,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// Running-build introspection
// ---------------------------------------------------------------------------

/**
 * The build number of the binary we are running, read from the Expo config
 * embedded at build time (`android.versionCode` / `ios.buildNumber` in
 * app.json).
 *
 * Returns `null` whenever it cannot be determined — Expo Go, web, a dev client
 * with no versionCode set, or a malformed value. Callers MUST treat `null` as
 * "unknown, do not block".
 */
export function runningBuildNumber(): number | null {
  const config = Constants.expoConfig;
  if (!config) return null;

  const raw =
    Platform.OS === 'ios'
      ? config.ios?.buildNumber
      : Platform.OS === 'android'
        ? config.android?.versionCode
        : undefined;

  if (raw === undefined || raw === null) return null;

  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The marketing version of the running binary (app.json `version`), or null. */
export function runningVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

/**
 * Dotted-numeric version compare. Returns <0 when `a` is older than `b`.
 * Non-numeric segments count as 0, so a malformed value can never *raise* the
 * perceived running version and suppress a legitimate prompt.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const na = Number.parseInt(pa[i] ?? '0', 10) || 0;
    const nb = Number.parseInt(pb[i] ?? '0', 10) || 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

/**
 * The backend supplies `store_url`, so it is treated as untrusted input before
 * being handed to Linking.openURL: only http(s) is ever opened, never an
 * arbitrary deep link into another app.
 */
export function safeStoreUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

// ---------------------------------------------------------------------------
// The gate itself
// ---------------------------------------------------------------------------

export type UpdateGateState =
  | { kind: 'ok' }
  /** An update exists but this build still works — dismissible prompt. */
  | { kind: 'optional'; latestVersion: string; storeUrl: string | null }
  /** This build is below min_supported_build — hard block. */
  | { kind: 'blocked'; latestVersion: string; storeUrl: string | null };

/**
 * Resolves what the startup gate should show.
 *
 * FAIL-OPEN is the whole design constraint here: a patient must never lose
 * access to their own health record because a config request was slow, the
 * device is offline, or the backend returned something unexpected. Every
 * uncertain path below returns `{ kind: 'ok' }`:
 *
 *   - request still in flight            → ok (no flash of a blocking screen)
 *   - request failed / offline / timeout → ok (`data` is undefined)
 *   - backend 4xx/5xx                    → ok (`data` is undefined)
 *   - min_supported_build missing or NaN → ok (block check skipped)
 *   - running build number unknown       → ok (block check skipped)
 *
 * Only an affirmative, well-formed "your build is too old" answer blocks.
 */
export function useUpdateGate(): UpdateGateState {
  const { data } = useAppConfig();

  return useMemo<UpdateGateState>(() => {
    // Loading, offline, or errored — fail open.
    if (!data) return { kind: 'ok' };

    const storeUrl = safeStoreUrl(data.store_url);
    const latestVersion = typeof data.latest_version === 'string' ? data.latest_version : '';

    const minBuild = Number(data.min_supported_build);
    const build = runningBuildNumber();
    if (build !== null && Number.isFinite(minBuild) && build < minBuild) {
      return { kind: 'blocked', latestVersion, storeUrl };
    }

    const version = runningVersion();
    if (version && latestVersion && compareVersions(version, latestVersion) < 0) {
      return { kind: 'optional', latestVersion, storeUrl };
    }

    return { kind: 'ok' };
  }, [data]);
}

// ---------------------------------------------------------------------------
// GET /mobile/notifications/unread-count — the badge
// ---------------------------------------------------------------------------

export interface NotificationUnreadCount {
  unread_count: number;
}

/**
 * Lightweight count for the badge — deliberately NOT the heavy list endpoint.
 *
 * The query key is `['notifications', 'unread-count']`, a child of the
 * `['notifications']` key that `useNotifications` uses. TanStack Query
 * invalidates by key *prefix*, so the existing `useMarkNotificationRead` /
 * `useMarkAllNotificationsRead` mutations in lib/api/queries.ts — which both
 * call `invalidateQueries({ queryKey: ['notifications'] })` — already refresh
 * this badge the instant a notification is read. No change to queries.ts, and
 * no second invalidation path to keep in sync.
 */
export function useNotificationUnreadCount(enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () =>
      (await apiClient.get<NotificationUnreadCount>(endpoints.notificationUnreadCount)).data,
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: 1,
  });
}

/**
 * Badge-ready count. Resolves to 0 while loading or on any error, so a failed
 * count request simply renders no badge rather than a broken one.
 */
export function useUnreadNotificationCount(enabled = true): number {
  const { data } = useNotificationUnreadCount(enabled);
  const count = data?.unread_count;
  return typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0;
}
