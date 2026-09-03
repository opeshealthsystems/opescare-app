/**
 * Dynamic Expo config layered over app.json.
 *
 * Exists for one reason: the `local-api` build profile points the app at this
 * machine's LAN address over plain HTTP, and Android 9+ blocks cleartext
 * traffic by default — the APK would install fine and then fail every request.
 *
 * Enabling `usesCleartextTraffic` in app.json would fix that build and quietly
 * carry the same permission into the production APK, which is exactly the kind
 * of thing nobody notices until it is shipped. So it is derived instead: it
 * turns on only when the configured API base URL is actually `http://`, which
 * is true for the LAN dev profile and false for anything pointing at
 * https://opescare.cloud.
 *
 * Everything else comes from app.json unchanged.
 */
module.exports = ({ config }) => {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
  const needsCleartext = apiBaseUrl.startsWith('http://');

  return {
    ...config,
    android: {
      ...config.android,
      ...(needsCleartext ? { usesCleartextTraffic: true } : {}),
    },
  };
};
