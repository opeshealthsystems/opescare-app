# EAS build profiles — why each one is shaped the way it is

These notes used to live as `"//"` keys inside `eas.json`. EAS CLI 23 validates
that file against a strict schema and rejects any key it does not know, so the
whole file — and therefore every build — failed on an unknown `"//"`. The
reasoning is too valuable to delete, so it lives here instead.

## `cli`

appVersionSource is REMOTE because this project has a dynamic config (app.config.js). EAS cannot write an auto-incremented buildNumber/versionCode back through a dynamic config, so `local` + `autoIncrement` is not a usable combination here. Remote keeps the counters on EAS; `version` in app.json stays the marketing version you bump by hand.

## `build`

PUSH DELIVERY needs two values that are NOT in this file on purpose: EAS_PROJECT_ID (the UUID `eas init` prints) and GOOGLE_SERVICES_JSON (a FILE environment variable holding google-services.json). Both live as EAS project environment variables, one copy per environment (development / preview / production), created with `eas env:create` — see docs/push-delivery-runbook.md steps 2-3. app.config.js refuses an EAS build that lacks them, so a forgotten variable fails in seconds instead of producing an APK that can never receive a push. A build that deliberately does not need push may set OPESCARE_BUILD_WITHOUT_PUSH=1 in its env block.

## `build.development`

DEV CLIENT for real-device testing, push included: Expo Go cannot receive remote push on Android since SDK 53, so this is the only way to see a push land during development. `developmentClient: true` requires the expo-dev-client package (`npx expo install expo-dev-client`) — runbook step 5. Points at the demo host so the seeded demo patients sign in; the demo sign-in menu is on.

## `build.local-api`

APK for testing on a real phone against the DEV machine, not production. opescare.test is a hosts-file entry that only resolves on that PC, so the phone must use its LAN address; the Apache vhost carries a matching ServerAlias, without which the phone's Host header falls through to the default vhost and gets a 403. The phone must be on the same Wi-Fi, and this IP is DHCP-assigned — re-check it before rebuilding. A LAN build is for API work, not push, so it opts out of the google-services.json requirement.

## `build.preview`

INTERNAL TESTING build: an installable APK on Android, an ad-hoc IPA on iOS (every test iPhone must be registered first with `eas device:create`, then the profile is regenerated — runbook step 6). Same demo host as development, demo sign-in menu ON so a tester can pick a seeded patient. This is the profile the push runbook proves delivery with.

## `build.demo`

DEMO TESTER APK. Same as `preview` but it does not require push credentials, so a tester build can be produced before the Firebase/APNs work is done — hence OPESCARE_BUILD_WITHOUT_PUSH. A build from this profile CANNOT receive remote push; use `preview` once GOOGLE_SERVICES_JSON exists (docs/push-delivery-runbook.md steps 2-3). Points at the demo host with the demo sign-in menu on, so a tester can pick a seeded patient, doctor, pharmacist or lab tech without being given credentials.

## `build.production`

STORE BUILD. The demo flags below are pinned OFF on purpose: Expo inlines every EXPO_PUBLIC_* value at bundle time, and although `.env` is now gitignored, a developer's local `.env` is still loaded by the CLI on their machine, so without an explicit '0' here a leftover EXPO_PUBLIC_DEMO_LOGINS=1 would ship the demo sign-in menu and the clinician-preview override to the App Store. An explicit '0' in this block always wins. Points at `https://opescare.com/api` (formerly finder.opescare.cloud), which is still a DEMO-mode host, so the profile sets OPESCARE_ALLOW_DEMO_BACKEND=1 to say so out loud (app.config.js refuses a production build aimed at the demo host without it). It also sets OPESCARE_BUILD_WITHOUT_PUSH=1 until Firebase is configured. Channel `production`; OTA updates go out with `eas update --channel production --environment production` and reach only builds of the same runtime (runtimeVersion policy appVersion, so 1.5.0 builds).

## `submit`

Left empty deliberately. Filling this in requires the owner's Apple Developer and Google Play accounts (ascAppId, appleTeamId, the Play service-account JSON) — credentials no agent should hold. See docs/STORE_SUBMISSION.md, runbook steps 1-4.
