# Architecture

How the OpesCare mobile app is put together. Written from the code on
2026-10-18; if this disagrees with the code, trust the code and fix this file.

## Folders

| Folder | What lives there |
|---|---|
| `app/` | **expo-router routes** — one file per screen. Groups: `(auth)` (welcome, login, otp, signup, forgot-password, permissions), `(tabs)` (home, health-id, records, messages, profile), `clinician/` (the staff half: schedule, patients, charts, results, requests, prescribe, break-glass, scan, `desk/`, `lab/`, `pharmacy/`), plus feature stacks (`pharmacy*`, `blood-finder*`, `appointments/`, `doctor/`, `facility/`, `labs/`, `prescriptions/`, `vitals/`, `referrals*`, `family/`, `payments/`, `privacy/`, `legal/`, `account/`) and single screens (`settings`, `offline-access`, `import-records`, `export-records`, `health-passport`, `care-map`, ...). `app/index.tsx` is a spinner that exists only to be redirected away from. |
| `components/opes-ui/` | The **OPES UI kit**: `theme.ts` (tokens and the two palettes), `ThemeProvider`, `Icon`, `Card`, `ListRow`, `SectionHeader`, `ScreenHeader`, `GradientButton`, `PillInput`, `Chip`, `StatusBadge`, `EmptyState`, `Dialog`, `AppBackground`, and its own `DESIGN_SPEC.md` / `README.md`. Pure presentation, no API or navigation. |
| `components/ui/` | Older OpesCare primitives (`Card`, `Screen`, `Logo`, `PaperWave`, `tone`) on NativeWind + `theme/tokens.js`. See its README. |
| `components/<feature>/` | Feature components shared by several routes: `health-id/` (credential card, Presentation Mode, LivingAnatomy), `consent/`, `family/`, `payments/`, `offline/`, `security/` (AppLockGate), `doctor/`, `desk/`, `lab/`, `pharmacy/`, `care/`, `chat/`, `diagnostics/`, `meds/`, `quick-add/` (the tab bar FAB and sheet), `map/`, and so on. |
| `lib/api/` | `client.ts` (the axios instance), `endpoints.ts` (base URL + paths), `tokenStorage.ts`, `types.ts`, and one `*Queries.ts` module per domain exposing TanStack Query hooks and mutations. |
| `lib/store/` | `auth.ts` — the zustand auth store (status, patient, provider, persona, login/logout/bootstrap). |
| `lib/session/` | `wipe.ts` — owns the app's single `QueryClient` and `wipeSessionData()`. |
| `lib/offline/` | Opt-in offline mode: encrypted storage, policy, scopes, sync, query persistence, outbox, connectivity. |
| `lib/security/` | `appLock.ts` (biometric/PIN lock store) and `usePrivateScreen.ts` (screen-capture block). |
| `lib/push/` | Push capability gates, token registration, channels and sounds, listeners, consent alerts. |
| `lib/i18n/` | i18next setup, `locales/{en,fr}.json`, and `pending/` staging bundles. |
| `lib/auth/` | `demoAccounts.ts`, required only behind the build-time demo gate. |
| `lib/` (root) | `staffCapabilities.ts` (role to capability mirror), `openExternal.ts`, `fileDelivery.ts`, `phone.ts`, `embedMapUrl.ts`, `careMap/`. |
| `theme/` | `tokens.js` — NativeWind/Tailwind tokens (additive only). |
| `plugins/` | `withNetworkSecurityConfig.js` — Android TLS pinning config plugin. |
| `scripts/` | `nav-audit.mjs`. |
| `playstore/` | Listing copy, data-safety, graphics and the build/OTA manifest. |

## Data flow

```
screen (app/...)
  -> hook from lib/api/<domain>Queries.ts   (TanStack Query, the single QueryClient)
    -> apiClient (lib/api/client.ts)        (Bearer token from tokenStorage)
      -> https://opescare.com/api/mobile/... (Laravel backend)
```

- **Server state** is TanStack Query only. There is one `QueryClient`, created
  in `lib/session/wipe.ts` so that sign-out can clear it.
- **Client state** is small zustand stores: auth (`lib/store/auth.ts`), app lock
  (`lib/security/appLock.ts`).
- **Errors:** a 401 triggers one shared (single-flight) call to
  `/mobile/auth/refresh`; a new token is stored and the request retried. If the
  refresh fails, `setSessionExpiredHandler` tells the auth store to log out —
  the client never imports the store, avoiding a cycle.
- **Roles:** the backend enforces capabilities with its `capability:`
  middleware (403 `role_forbidden`); `lib/staffCapabilities.ts` mirrors that map
  so the clinician UI only offers what the role can do.
- **Family:** a guardian reads a dependent's data through the same endpoints
  with an act-as header (`lib/api/familyQueries.ts`).

## Auth and session lifecycle

1. **Boot.** `app/_layout.tsx` calls `bootstrap()`. With no token the status
   becomes `unauthenticated`. With a token, the stored session kind decides
   which `/me` to ask: patient `/me` or provider `/mobile/auth/provider/me`.
   A dropped connection keeps the token (a patient can boot on cached
   demographics; a clinician is held at sign-in and retried in the background).
   A refused token is cleared.
2. **Status.** `booting -> unauthenticated | otp_pending | permissions_pending | authenticated`.
   The splash stays up until the session is resolved and fonts/palette settle.
3. **Routing** is decided in one place, the root layout effect: signed out
   goes to `/(auth)/welcome`; a provider session goes to `/clinician/home`
   unless it is already inside `/clinician`; a patient session leaves `(auth)`
   and `/` for `/(tabs)/home`. A patient who opens a clinician URL sees
   `clinician/wrong-app.tsx` via the clinician layout gate.
4. **Sign-in paths:** email + password, phone + PIN, OTP verification, signup,
   provider login (`loginAsProvider`). Demo builds add one-tap demo accounts.
5. **Sign-out / expiry:** `wipeSessionData()` runs **before** the token is
   dropped, so the server-side offline policy revoke is still authenticated.
   It clears the query cache, the offline cache, its policy and the outbox,
   and exported PDFs; push tokens on this device are revoked too.
6. **App lock** (`AppLockGate`, active only when authenticated) prompts for
   biometrics / device credential on cold start and after 60 s in background.

Token storage: SecureStore on native; on web an in-memory value mirrored to
`sessionStorage` (tab-scoped), with legacy `localStorage` copies deleted
(`lib/api/tokenStorage.ts`).

## Offline mode

Entirely inert until the patient opts in on `app/offline-access.tsx`.
`initOfflineMode(queryClient)` is installed once from the root layout and adds:

- **Policy** (`policy.ts`) — the server's record of this device's local cache:
  24 h normal, 6 h emergency (emergency profile only). Revoked server-side on
  purge and session wipe, best effort.
- **Scopes and sync** (`scopes.ts`, `sync.ts`) — pull every granted scope and
  write it to the local cache (fetch-then-store, not "whatever was viewed").
- **Storage** (`storage.ts`) — SecureStore (Android Keystore AES-256-GCM / iOS
  Keychain), chunked to stay under SecureStore value limits. **Disabled on web**:
  browser storage is plaintext, so the web store holds nothing and the opt-in
  is hidden.
- **Query persistence** (`queryPersistence.ts`) — hydrates the query cache from
  the local copy when offline.
- **Outbox** (`outbox.ts`) — mutating `/mobile/*` requests that fail with no
  response are captured for later reconciliation by the backend's sync
  service. Auth requests are never captured.
- **Connectivity** (`connectivity.ts`) drives `components/offline/OfflineBanner`.

## i18n

- i18next + react-i18next, English and French only (`AppLocale = 'en' | 'fr'`).
- `lib/i18n/index.ts` loads `locales/en.json` and `locales/fr.json`. The boot
  language is the patient's stored choice (`opescare_language`, read
  synchronously from `localStorage` on web, SecureStore on native), falling
  back to the device locale. The server's `preferred_language` is the
  cross-device source of truth. `applyLanguage()` is the only writer —
  never call `i18next.changeLanguage` directly.
- **Pending bundles:** `lib/i18n/pending/*.{en,fr}.json` (46 files) are a
  staging area that `index.ts` does not load. Each feature that uses one
  registers it at module load with
  `addResourceBundle(lng, 'translation', bundle, true, false)` (deep merge,
  never overwrite) — for example `lib/i18n/consentCopyStrings.ts`,
  `lib/i18n/messagingRecipientStrings.ts`, `lib/api/accountDeletionQueries.ts`.
  Merging them into `locales/` is an open follow-up; because the merge never
  overwrites, folding a key in later is safe.

## Theming

- **opes-ui kit** (`components/opes-ui/theme.ts`): colours, spacing, radii,
  Poppins typography, shadows, status tints and icon strokes. Two
  runtime-switchable palettes, `opescare` (default) and `opes`;
  `ThemeProvider` in the root layout holds the active one and persists the
  choice. `AppBackground` gives every screen the same paper background.
- **NativeWind / Tailwind** (`tailwind.config.js` fed from `theme/tokens.js`)
  for utility classes. The tokens file is additive-only; `fontSize` and
  `spacing` are deliberately not extended.
- The four Poppins weights are loaded in the root layout before the splash
  hides; a font failure falls back to the system font rather than blocking.
- Icons: Lucide and the kit's `Icon`, never emoji. Currency is XAF/FCFA.
- Design history: screens were ported from an archived prototype, see
  `docs/DESIGN_REFERENCE.md`.

## Build-time configuration

`app.json` holds static config; `app.config.js` derives the values that must
not be written down: cleartext only for an `http://` API, the `/_sitemap`
route only with `EXPO_PUBLIC_ENABLE_SITEMAP=1`, the EAS project id and
`google-services.json` from the environment (refusing broken push config on EAS
workers), and a refusal to build `production` against the demo host unless
`OPESCARE_ALLOW_DEMO_BACKEND=1`. Profiles are described in
`docs/eas-build-profiles.md`; OTA uses `expo-updates` with
`runtimeVersion.policy = appVersion`.
