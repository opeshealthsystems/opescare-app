/**
 * Dynamic Expo config layered over app.json.
 *
 * Holds the settings that must be DERIVED rather than written down, because a
 * literal in app.json would silently follow the value into a production build.
 * Everything else comes from app.json unchanged.
 *
 * 1. `usesCleartextTraffic` — the `local-api` build profile points the app at
 *    this machine's LAN address over plain HTTP, and Android 9+ blocks
 *    cleartext by default, so that APK would install fine and then fail every
 *    request. Setting the flag in app.json would fix that build and quietly
 *    carry the same permission into the production APK. So it is derived: it
 *    turns on only when the configured API base URL really is `http://`, which
 *    is true for the LAN dev profile and false for finder.opescare.cloud.
 *
 * 2. `extra.router.sitemap` — see below.
 */

/**
 * expo-router auto-generates a `/_sitemap` route unless
 * `extra.router.sitemap === false` (expo-router/build/global-state/utils.js:
 * `shouldAppendSitemap`). Nothing about that gate is development-only, so the
 * route ships: on the production web export at finder.opescare.cloud the
 * client router really does render it, listing every source filename under
 * `app/` — the clinician area included — to anyone who asks, signed in or not.
 * It is a developer tool, and it is a free map of the app's attack surface.
 *
 * Gated on NODE_ENV === 'development', which is what `expo start` sets and
 * what `expo export` / an EAS build does not. Written to fail CLOSED: any
 * invocation that leaves NODE_ENV unset gets no sitemap, so the worst case is
 * a missing dev convenience rather than a shipped one.
 */
const isDevServer = process.env.NODE_ENV === 'development';

module.exports = ({ config }) => {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
  const needsCleartext = apiBaseUrl.startsWith('http://');

  return {
    ...config,
    android: {
      ...config.android,
      ...(needsCleartext ? { usesCleartextTraffic: true } : {}),
    },
    extra: {
      ...config.extra,
      // The expo-router config plugin merges its own props OVER this object
      // (plugin/build/withRouter.js), but app.json registers the plugin with
      // no props, so `sitemap` survives the merge.
      router: {
        ...config.extra?.router,
        sitemap: isDevServer,
      },
    },
  };
};
