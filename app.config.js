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
 *
 * 3. `extra.eas.projectId` and `android.googleServicesFile` — the two values
 *    push delivery needs and which this repository must not contain. Both come
 *    from the environment; see "Push delivery" below and
 *    docs/push-delivery-runbook.md.
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
 * Gated on an EXPLICIT opt-in, not on an inferred environment.
 *
 * This was first written as `NODE_ENV === 'development'` on the assumption that
 * `expo export` does not set it. It does: with NODE_ENV unset in the shell,
 * `expo config --type public` resolves `extra.router.sitemap: true`, and the
 * sitemap duly shipped to production and was live on finder.opescare.cloud.
 * Simulating the config merge agreed with the assumption; running the real
 * command did not.
 *
 * So the gate is now a variable nothing sets by accident. It fails closed by
 * CONSTRUCTION rather than by a claim about someone else's tooling: to get the
 * sitemap you must ask for it with EXPO_PUBLIC_ENABLE_SITEMAP=1.
 */
const sitemapEnabled = process.env.EXPO_PUBLIC_ENABLE_SITEMAP === '1';

/*
 * ── Push delivery ──────────────────────────────────────────────────────────
 *
 * An Expo push token is minted against an EAS project id, and on Android the
 * device half of that token comes from Firebase Cloud Messaging, which needs
 * the project's `google-services.json` compiled into the APK. Neither value
 * is written into this repository:
 *
 *   EAS_PROJECT_ID        the UUID `eas init` prints. Not a secret, but it is
 *                         the OWNER's project — a fork must never build
 *                         against the source app's project, which is why
 *                         app.json carries a comment where the id would be.
 *                         Locally: `.env` (gitignored). On EAS: a project
 *                         environment variable in every environment.
 *
 *   GOOGLE_SERVICES_JSON  path to google-services.json. Locally: a path
 *                         outside the repo, or `./google-services.json`
 *                         (gitignored). On EAS: a FILE environment variable —
 *                         EAS writes the file to a temp path and puts that
 *                         path in the variable, so this config never sees the
 *                         content.
 *
 * FAIL LOUDLY, NEVER FAKE. There is no placeholder id and no stub JSON: a
 * fabricated value would produce a build that installs, asks the patient for
 * the notification permission, and then never receives anything — the exact
 * false promise lib/push/capability.ts exists to end. So:
 *
 *   - EAS_PROJECT_ID absent  → locally, the config has no projectId and the
 *                              app honestly reports "not deliverable";
 *                              on an EAS build worker (EAS_BUILD=true) the
 *                              config REFUSES, because eas-cli would have
 *                              refused anyway and this message is clearer.
 *   - EAS_PROJECT_ID malformed / the nil UUID → refuse, always.
 *   - GOOGLE_SERVICES_JSON set but the file is missing → refuse, always.
 *   - Android EAS build with no GOOGLE_SERVICES_JSON → refuse, unless
 *     OPESCARE_BUILD_WITHOUT_PUSH=1 says that build is not meant to push.
 *
 * `eas init` cannot write into a dynamic config, so it prints the id instead
 * of saving it; that is expected here. A literal `extra.eas.projectId` in
 * app.json is still honoured (the env var wins) so a hand-written value also
 * works — it just goes through the same validation.
 */
const fs = require('fs');
const path = require('path');

const RUNBOOK = 'docs/push-delivery-runbook.md';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const onEasBuildWorker = process.env.EAS_BUILD === 'true';
const easBuildPlatform = process.env.EAS_BUILD_PLATFORM ?? null; // 'android' | 'ios' on a worker
const easBuildProfile = process.env.EAS_BUILD_PROFILE ?? null;

function refuse(message) {
  throw new Error(`[app.config.js] ${message}\nSee ${RUNBOOK}.`);
}

/**
 * The only backend that exists today. It runs with APP_ENV=demo and
 * OPESCARE_DEMO_MODE=true, its patients are `is_demo` rows, and its login page
 * hands out demo accounts.
 */
const DEMO_API_HOST = 'finder.opescare.cloud';

/**
 * A store build must not point at the demo backend by accident.
 *
 * `eas.json`'s production profile used to hard-code the demo URL, and
 * `lib/api/endpoints.ts` falls back to the same host when the variable is
 * unset — a sane default for development, and the wrong one to inherit
 * silently in the binary that goes on Google Play. Shipping demo records to
 * real patients is not a mistake anybody would notice from the outside until
 * somebody signed in.
 *
 * So a `production` build has to NAME its API. Pointing one at the demo host
 * on purpose is still allowed — there is nowhere else to point it yet — but it
 * has to be said out loud with OPESCARE_ALLOW_DEMO_BACKEND=1.
 */
function checkProductionBackend(apiBaseUrl) {
  if (!onEasBuildWorker || easBuildProfile !== 'production') {
    return;
  }

  if (process.env.OPESCARE_ALLOW_DEMO_BACKEND === '1') {
    return;
  }

  if (!apiBaseUrl) {
    refuse(
      'This is a production EAS build and EXPO_PUBLIC_API_BASE_URL is not set, so the app would fall back ' +
        `to the demo backend (${DEMO_API_HOST}) baked into lib/api/endpoints.ts. Set ` +
        'EXPO_PUBLIC_API_BASE_URL in the production profile to the API this release should talk to — or, ' +
        'to ship against the demo backend deliberately, set OPESCARE_ALLOW_DEMO_BACKEND=1 in that profile.',
    );
  }

  if (apiBaseUrl.includes(DEMO_API_HOST)) {
    refuse(
      `This is a production EAS build pointed at the DEMO backend (${apiBaseUrl}). Its records are demo ` +
        'records and its login page hands out demo accounts, so a Play release built this way would show ' +
        'real patients a fictional history belonging to nobody. Point EXPO_PUBLIC_API_BASE_URL at a ' +
        'production API — or set OPESCARE_ALLOW_DEMO_BACKEND=1 if that really is the intention.',
    );
  }
}

function trimmed(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The EAS project id, validated — or null when none is configured. */
function resolveEasProjectId(config) {
  const fromEnv = trimmed(process.env.EAS_PROJECT_ID);
  const fromConfig = trimmed(config.extra?.eas?.projectId);
  const candidate = fromEnv ?? fromConfig;
  const source = fromEnv ? 'EAS_PROJECT_ID' : 'app.json extra.eas.projectId';

  if (candidate) {
    if (!UUID_PATTERN.test(candidate)) {
      refuse(
        `${source} is "${candidate}", which is not an EAS project id. ` +
          'It must be the UUID that `eas init` printed (8-4-4-4-12 hex).',
      );
    }
    if (candidate.toLowerCase() === NIL_UUID) {
      refuse(`${source} is the nil UUID — a placeholder, not a project. Run \`eas init\` and use the id it prints.`);
    }
    return candidate;
  }

  if (onEasBuildWorker) {
    refuse(
      `EAS_PROJECT_ID is not set on this EAS build (profile: ${easBuildProfile ?? 'unknown'}). ` +
        'Push tokens cannot be minted without it. Create it as an EAS environment variable for ' +
        'development, preview AND production (runbook step 2), then rebuild.',
    );
  }

  return null;
}

/** Path to google-services.json, validated — or null when none is configured. */
function resolveGoogleServicesFile() {
  const configured = trimmed(process.env.GOOGLE_SERVICES_JSON);

  if (configured) {
    const absolute = path.isAbsolute(configured) ? configured : path.resolve(__dirname, configured);
    if (!fs.existsSync(absolute)) {
      refuse(
        `GOOGLE_SERVICES_JSON points to "${configured}" but no file exists there. ` +
          'Locally, download google-services.json from the Firebase console (runbook step 3); ' +
          'on EAS, create GOOGLE_SERVICES_JSON as a FILE environment variable so EAS writes the file and sets the path.',
      );
    }
    // A relative path is what app.json expects; keep it relative when it was given so.
    return configured;
  }

  if (onEasBuildWorker && easBuildPlatform === 'android' && process.env.OPESCARE_BUILD_WITHOUT_PUSH !== '1') {
    refuse(
      `This is an EAS Android build (profile: ${easBuildProfile ?? 'unknown'}) and GOOGLE_SERVICES_JSON is not set, ` +
        'so the APK would have no Firebase configuration and could never receive a push. ' +
        'Create GOOGLE_SERVICES_JSON as an EAS FILE environment variable (runbook step 3) — or, for a build that ' +
        'deliberately does not need push, set OPESCARE_BUILD_WITHOUT_PUSH=1 in that profile.',
    );
  }

  return null;
}

module.exports = ({ config }) => {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
  const needsCleartext = apiBaseUrl.startsWith('http://');

  checkProductionBackend(apiBaseUrl);

  const easProjectId = resolveEasProjectId(config);
  const googleServicesFile = resolveGoogleServicesFile();

  // Keep the fork's explanatory "//" comment while there is no id; drop it the
  // moment there is one, so `expo config` shows exactly what the app will see.
  const easExtra = easProjectId
    ? { projectId: easProjectId }
    : { ...(config.extra?.eas ?? {}) };

  return {
    ...config,
    android: {
      ...config.android,
      ...(needsCleartext ? { usesCleartextTraffic: true } : {}),
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    extra: {
      ...config.extra,
      // The expo-router config plugin merges its own props OVER this object
      // (plugin/build/withRouter.js), but app.json registers the plugin with
      // no props, so `sitemap` survives the merge.
      router: {
        ...config.extra?.router,
        sitemap: sitemapEnabled,
      },
      eas: easExtra,
    },
  };
};
