/**
 * Build identity, so support can tell which bundle a patient is running.
 *
 * `EXPO_PUBLIC_BUILD_SHA` and `EXPO_PUBLIC_BUILD_DATE` are injected by
 * `deploy/deploy-live.sh` at export time and inlined by Metro. A local dev
 * bundle has neither and says so rather than pretending to be a release.
 */

import Constants from 'expo-constants';

export const APP_VERSION = (Constants.expoConfig?.version as string | undefined) ?? '0.0.0';

export const BUILD_SHA = process.env.EXPO_PUBLIC_BUILD_SHA || 'dev';

export const BUILD_DATE = process.env.EXPO_PUBLIC_BUILD_DATE || '';

/** e.g. "v1.0.0 · 4c93923 · 2026-09-02" — short enough for a screen footer. */
export const BUILD_STAMP = [`v${APP_VERSION}`, BUILD_SHA, BUILD_DATE]
  .filter(Boolean)
  .join(' · ');
