# OpesCare — patient and clinician mobile app

OpesCare is a bilingual (English / French) health app for Cameroon, built with
Expo and React Native. A patient finds medicines and blood near them, books
appointments, carries a portable **Health ID** and medical record, and decides
who may read it. Clinicians and other facility staff use the same app, in a
separate clinician area, to work their desks.

| | |
|---|---|
| Package / bundle id | `com.opescare.patientid` |
| Version | 1.5.0 (`app.json`; build numbers are remote on EAS) |
| Backend | OpesCare Finder (Laravel), sibling repo `C:\laragon\www\opescare-finder` |
| API | `https://opescare.com/api` (default in `lib/api/endpoints.ts`, overridable with `EXPO_PUBLIC_API_BASE_URL`) |
| EAS project | `opesware/opescare-finder` |
| OTA | `expo-updates`, channels `production` / `demo`, runtime version = app version |
| Web build | served at `opescare.com/finder` |

> The backend at opescare.com still runs in **demo mode** (seeded demo
> records). The production profile ships against it on purpose, flagged with
> `OPESCARE_ALLOW_DEMO_BACKEND=1`. See `docs/LAUNCH_AUDIT.md`.

## Features

**Finding care**
- **Drug finder** — search live pharmacy stock near you (`app/pharmacy*`).
- **Blood finder** — blood availability by product and group, and blood requests (`app/blood-finder*`).
- **Appointment booking** — doctors, facilities, slots, reschedule (`app/doctors.tsx`, `app/doctor/`, `app/appointments/`).
- **Facility directory and care map** — the national register on an in-app Leaflet map (`app/facility/`, `app/care-map.tsx`).

**Your health**
- **Health ID** — secure credential card with a verification-link QR, Presentation Mode, and the *living anatomy* figure (`app/(tabs)/health-id.tsx`, `components/health-id/`).
- **Records** — encounters, labs with trends and reports, prescriptions, vitals, referrals, care plans, documents, the 30-page Health Passport (`app/(tabs)/records.tsx`, `app/labs/`, `app/prescriptions/`, `app/vitals/`, `app/health-passport.tsx`).
- **Consent and privacy** — approve or refuse access requests, see who read your record (access logs), privacy switches (`app/privacy/`, `components/consent/`).
- **Family** — guardians act for dependents through an act-as header (`app/family/`, `lib/api/familyQueries.ts`).
- **Messages and notifications** (`app/(tabs)/messages.tsx`, `app/messages/`, `app/notifications.tsx`).
- **Payments** — pay a care invoice with MTN Mobile Money or Orange Money, amounts in XAF/FCFA (`app/payments/`). Care is never gated on payment.
- **Import and export** — export the record as PDF or a FHIR R4 Bundle (`app/export-records.tsx`); import a FHIR R4 bundle or a PDF/photo, stored as patient-provided and unverified (`app/import-records.tsx`).
- **Offline access** — opt-in, encrypted on-device copy of chosen record scopes (`app/offline-access.tsx`).
- **Account** — profile, settings, language, app lock, account deletion (`app/settings.tsx`, `app/account/delete.tsx`).

**Clinician area** (`app/clinician/`)
- Schedule, appointment requests, patient search and charts, results inbox, messages.
- Prescribing, request access / break-glass, Health ID QR scanner.
- Role desks: pharmacy, lab and front desk. What each role sees is gated by
  `lib/staffCapabilities.ts`, a mirror of the backend's `config/staff_capabilities.php`.

## Tech stack

- **Expo SDK 57**, React Native 0.86, React 19, TypeScript, **expo-router** (file-based routes in `app/`).
- **NativeWind / Tailwind** (`tailwind.config.js`, `theme/tokens.js`) plus the in-repo **opes-ui** kit (`components/opes-ui`).
- **TanStack Query** for server state, **zustand** for client state, **axios** for HTTP.
- **i18next / react-i18next** with `expo-localization`.
- Native modules: secure-store, local-authentication, screen-capture, camera, location, notifications, image/document picker, file-system, sharing, updates.
- **Lucide** icons (`lucide-react-native`) and the kit's own `Icon` set.

## Architecture in one paragraph

`app/_layout.tsx` boots i18n, the theme, the single `QueryClient`
(`lib/session/wipe.ts`), offline mode, push listeners, the consent prompt
watcher, the update gate and the app-lock gate, then routes by auth status
from `lib/store/auth.ts`: unauthenticated users land in `app/(auth)`, patients
in `app/(tabs)`, and provider sessions in `app/clinician`. Every request goes
through `lib/api/client.ts` (bearer token, single-flight refresh on 401, forced
logout when refresh fails). Detail: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Getting started

```bash
npm install
cp .env.example .env        # then edit; every value is optional for local work
npx expo start              # press a / i / w, or scan with a dev client
```

- With no `.env`, the app talks to `https://opescare.com/api`. To use a local
  backend from a phone, set `EXPO_PUBLIC_API_BASE_URL` to the dev machine's
  LAN address (see the `local-api` profile).
- `EXPO_PUBLIC_DEMO_LOGINS=1` shows the one-tap demo sign-in menu (seeded demo
  patient and staff accounts on the demo backend).
- `EXPO_PUBLIC_*` values are inlined into the bundle at build time — never put
  a secret in one. Metro caches them: after changing one, restart with
  `npx expo start --clear`.
- Remote push does not work in Expo Go on Android; use a development build
  (`development` profile).

## Scripts

| Script | What it does |
|---|---|
| `npm start` / `android` / `ios` / `web` | `expo start` (optionally on a platform) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run audit:nav` | `scripts/nav-audit.mjs` — every route reachable from navigation, no orphans |
| `npm run doctor` | `npx expo-doctor` |
| `npm run verify` | typecheck + nav audit + expo-doctor |

Check `package.json` for any test or lint scripts added since this was written.

## Build profiles (`eas.json`)

| Profile | Output | API | Notes |
|---|---|---|---|
| `development` | dev-client APK | opescare.com | demo logins on, channel `development` |
| `local-api` | APK | LAN `http://` address | the only profile with cleartext; no push |
| `preview` | internal APK / ad-hoc IPA | opescare.com | demo logins on, channel `preview` |
| `demo` | tester APK | opescare.com | demo logins on, no push, channel `demo` |
| `production` | Play AAB | opescare.com | demo logins and doctor persona pinned off, `OPESCARE_ALLOW_DEMO_BACKEND=1`, no push yet, channel `production` |

`appVersionSource` is remote and the release profiles auto-increment. The
reasoning behind each profile is in [docs/eas-build-profiles.md](docs/eas-build-profiles.md).

## OTA release flow

JavaScript-only changes ship over the air with `expo-updates`
(`checkAutomatically: ON_LOAD`). The runtime version follows the app version,
so an update reaches only binaries built from the same `version` (1.5.0 today);
builds before the updater was added receive nothing.

```bash
npm run verify
eas update --channel production --environment production --message "..."
eas update --channel demo --environment demo --message "..."     # tester builds
```

Anything that changes native code, permissions, plugins or `app.json` native
fields needs a new binary: bump `version` and run `eas build --profile production`.
Releases are recorded in `playstore/artifacts/MANIFEST.md`.

## Security model

- **Tokens** live in `expo-secure-store` (Keychain / Android Keystore). On web
  the token is kept in memory with a tab-scoped `sessionStorage` mirror; legacy
  `localStorage` copies are purged (`lib/api/tokenStorage.ts`).
- **Session wipe** on logout and on session expiry clears the query cache, the
  offline record copy and its policy (revoked server-side first, best effort),
  the outbox and exported PDFs (`lib/session/wipe.ts`).
- **App lock** — opt-in biometric / device-PIN lock on cold start and after 60 s
  in the background (`lib/security/appLock.ts`, `components/security/AppLockGate`).
- **Screenshot protection** — `usePrivateScreen()` blocks screenshots, screen
  recording and the app-switcher thumbnail on health-data screens (native only).
- **TLS pinning (Android)** — `plugins/withNetworkSecurityConfig.js` pins
  `opescare.com` and subdomains to the SPKI hashes of the Let's Encrypt roots
  ISRG X1, X2 and Root YE (never the leaf). The pin-set **expires 2027-10-18**
  and then fails open: refresh it in a release before that date. iOS is not pinned.
- **Demo credentials** are isolated in `lib/auth/demoAccounts.ts` and only
  `require`d behind the build-time demo gate, so release bundles do not contain them.
- **Offline data** is encrypted at rest through SecureStore and disabled
  entirely on web (`lib/offline/storage.ts`).
- **External links** are restricted to https / tel / mailto (`lib/openExternal.ts`);
  the map WebView is pinned to the app's own origin.
- `android.allowBackup` is false; cleartext traffic is derived and on only for
  an `http://` API (the `local-api` profile).
- Content-Security-Policy does not apply to the native app (there is no
  browser document); it matters only for the web export, whose headers are set
  by the server that hosts it, not by this repo.

## Testing and CI

The gate today is `npm run verify` (TypeScript, nav audit, expo-doctor). A unit
test suite, lint config and CI workflow are being added separately — see
`package.json` scripts and `.github/` once they land. There is no git remote,
so nothing runs automatically on push.

## Documentation

| Doc | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | folders, data flow, auth/session, offline, i18n, theming |
| [docs/LAUNCH_AUDIT.md](docs/LAUNCH_AUDIT.md) | Google Play readiness, what was fixed, owner actions |
| [docs/STORE_SUBMISSION.md](docs/STORE_SUBMISSION.md) | App Store / Play submission audit (September, with updates) |
| [docs/eas-build-profiles.md](docs/eas-build-profiles.md) | why each EAS profile is shaped as it is |
| [docs/push-delivery-runbook.md](docs/push-delivery-runbook.md) | owner steps to turn on push (Firebase, APNs) |
| [docs/demo-tester-guide.md](docs/demo-tester-guide.md) | guide for demo testers |
| [docs/DESIGN_REFERENCE.md](docs/DESIGN_REFERENCE.md) | the archived UI/UX prototype and its design spec |
| [components/opes-ui/README.md](components/opes-ui/README.md) | the UI kit |
| `playstore/` | listing copy, data safety, graphics, build manifest |

## License

See [LICENSE](LICENSE).
