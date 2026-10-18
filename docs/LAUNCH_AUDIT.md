# Launch audit — Google Play, 2026-10-18

**App:** OpesCare · `com.opescare.patientid` · **1.5.0** (builds 14/15) · Expo SDK 57 / RN 0.86 · target SDK 36
**API:** `https://opescare.com/api` (the Finder backend, formerly finder.opescare.cloud; still demo mode) ·
**EAS:** `opesware/opescare-finder` · **OTA:** expo-updates, channels `production` / `demo`, runtime = appVersion
**Refreshed:** 2026-10-18, after the 1.5.0 release — see §2b.
**Supersedes:** `play-store-readiness.md` (September record, kept for history).

Three independent read-only audits ran in parallel (Play policy & config,
security, code quality), followed by fixes in this repo. Every row below was
verified against code or a command, not documentation.

## 1. Clean-up done

| What | Action |
| --- | --- |
| `Health ID retuned/` (424 MB design dump), `UIUX/mobile app screens/` (94 MB of PNGs) | Moved out of the repo to `C:\Users\PC\Documents\OpesCare-archive\mobile-cleanup-2026-10-18\` (both were gitignored, never shipped) |
| `playstore/artifacts/OpesCare-1.4.0-build5.apk` | Superseded by later commits; archived alongside. Its EAS URL stays in `artifacts/MANIFEST.md` |
| `AGENT_BRIEF.md` | One-off brief for a finished 20-agent parity pass; removed |
| Branches / stashes / worktrees | None existed — only `master`, no remote |
| Working tree (excl. node_modules) | ~680 MB → 26 MB |

## 2. Fixed in this pass

| Severity | Finding | Fix |
| --- | --- | --- |
| Critical | Logout and session expiry left the react-query cache, the offline record copy and the outbox on the device — the next person on a shared phone could see the last patient's records | `lib/session/wipe.ts` — `wipeSessionData()` clears all of them; called from `logout()` and the 401 expiry handler. The QueryClient moved there so it can be reached |
| High | 12 demo account passwords (incl. clinician roles) compiled into every release build | Moved to `lib/auth/demoAccounts.ts`, `require`d only behind the build-time demo gate, so release bundles do not contain them |
| High | Dependencies drifted from SDK 57 (expo-doctor: 18 out of date) | `npx expo install --fix`; expo-doctor now 21/21 |
| Policy | Data Safety said location "never leaves the device"; nearby-pharmacy and blood search send `lat`/`lng` | `playstore/listing/data-safety.md` + `permissions.md` corrected: declare location **collected, not shared** |
| Medium | Map WebView allowed any origin with JS + geolocation | Pinned to the finder's own origin; other links go to the browser |
| Medium | Server-supplied URLs handed straight to `Linking.openURL` | `lib/openExternal.ts` — https / tel / mailto only |
| Medium | Exported PDFs kept forever in the documents folder | Written to `cache/exports/`, swept on sign-out |
| Brand | Purple accent (`#7B2FB0`) on home, records, profile, booking | Remapped in the theme to teal `#0E7C86` — one place, every screen |
| Docs | Package name `cloud.opescare.finder` in the push runbook and store submission doc (the Firebase app must match the real package) | Corrected to `com.opescare.patientid` |
| High | No TLS pinning: a user-installed or rogue CA could intercept API traffic on Android | `plugins/withNetworkSecurityConfig.js` writes `network_security_config.xml`: `opescare.com` + subdomains pinned to the SPKI SHA-256 of Let's Encrypt roots ISRG X1, X2 and Root YE (never the leaf, so renewals are safe); pin-set expires 2027-10-18 and then fails open — refresh before then. Cleartext stays off except the `local-api` http profile |
| Hygiene | No quality scripts | `npm run typecheck`, `audit:nav`, `doctor`, `verify` |

## 2b. Fixed since the first pass (1.5.0, 2026-10-18)

| Finding | State |
| --- | --- |
| TLS pinning targeted the old host | **Fixed.** Pins apply to `opescare.com` + subdomains (`plugins/withNetworkSecurityConfig.js`, e5ced30); expiry 2027-10-18 |
| Web build kept the token in `localStorage` | **Fixed.** Memory + tab-scoped `sessionStorage`, legacy copies purged, offline cache disabled in browsers (`lib/api/tokenStorage.ts`, 4196985) |
| Offline cache policy outlived the session on the server | **Fixed.** Purge and session wipe revoke it server-side, best effort, before the token is dropped (7646604, 53cc4cf; backend `feat(offline): server-side revocation...`) |
| Patient FHIR R4 export failed the HL7 validator (62 errors) | **Fixed** in the backend: 0 errors (`fix(fhir): patient R4 export passes the HL7 validator`) |
| No way to bring outside records in | **Fixed.** `app/import-records.tsx`: FHIR R4 bundle or PDF/photo, stored as patient-provided and unverified (34ae3be) |
| No app lock | **Fixed.** Biometric / device-PIN lock on cold start and after 60 s in background, opt-in in Settings (`lib/security/appLock.ts`, f6449e5) |
| No screenshot protection on health screens | **Fixed.** `usePrivateScreen()` (expo-screen-capture) on Health ID, record, passport, documents (f6449e5) |
| No over-the-air update path | **Fixed.** expo-updates live; first OTA updates published on `production` and `demo` (runtime 1.5.0). Builds 1–13 have no updater or runtime 1.4.0 and receive no OTA |
| Clinician, provider and dependent profiles each looked different | **Fixed.** One shared profile design kit (bde7667) |
| Health ID card QR encoded base64 JSON of name and birth date | **Fixed** in the backend: the QR is now a verification link (`fix(health-id): card QR is a verification link`) |
| Google / Apple sign-in rows with no backend | **Removed** (dbfad85) |

## 3. Passing as-is

Permissions after merge: INTERNET, VIBRATE, COARSE + FINE location, POST_NOTIFICATIONS, CAMERA
(RECORD_AUDIO, SYSTEM_ALERT_WINDOW, storage and boot all removed) · `allowBackup=false` ·
cleartext only on the LAN profile · target SDK 36 · AAB on the production profile ·
demo logins and doctor persona off in production · privacy policy and account-deletion
URLs live (200) and in-app deletion exists · listing copy within limits in EN and FR ·
nav audit 91 routes / 0 orphans · 0 TODO, 0 console.log, 0 placeholder copy · XAF/FCFA only ·
Lucide icons only · EN/FR locale parity · tokens in SecureStore · single-flight token refresh.

## 4. Still open — owner actions before upload

| # | Item | Why / how |
| --- | --- | --- |
| O1 | **≥ 2 phone screenshots** | The feature graphic 1024×500 is done (1157a07); Play still needs phone screenshots. `playstore/graphics/README.md` has the specs |
| O2 | **Production API decision** | A production build refuses to start until `EXPO_PUBLIC_API_BASE_URL` is set, or `OPESCARE_ALLOW_DEMO_BACKEND=1` says shipping against opescare.com (demo mode) is intended. The production profile currently sets that flag, so 1.5.0 ships against the demo backend on purpose — a real production API is still the owner's decision |
| O3 | **Health apps declaration** (App content → Health apps) | Tick medical records / clinician features; privacy policy already covers health data |
| O4 | **Data Safety "ephemeral" tick for location** | Only if nginx access logs on the API are not kept with query strings (coordinates are in the GET URL) |
| O5 | **Reviewer access** | Give Play `demo.reviewer@` credentials in App access — the in-app demo buttons are off in production |
| O6 | **First upload is manual**; then `eas.json` `submit.production` can get a service-account key | |
| O7 | After the listing is live, point the backend `store_url` at `details?id=com.opescare.patientid` | The update gate currently opens the sideload page |
| O8 | **Push credentials** (Firebase `google-services.json`, APNs) | `production` and `demo` set `OPESCARE_BUILD_WITHOUT_PUSH=1`; no store build receives remote push until `docs/push-delivery-runbook.md` is done |
| O9 | **Refresh the TLS pin-set before 2027-10-18** | After that date pinning silently turns off (fails open); re-check the hashes and bump `PIN_EXPIRATION` in a release well before |

## 5. Known follow-ups (not launch blockers)

- npm audit reports advisories mostly in build-time tooling (metro, expo CLI); the
  runtime ones clear with the next SDK 57 patch release. Re-run `npm audit --omit=dev` after each `expo install --fix`.
- `lib/i18n/pending/*` bundles (46 files) are still registered piecemeal rather than merged into `lib/i18n/locales/`.
- Android only: there is no iOS certificate pinning; iOS has not been submitted.
- Tests / CI / lint configuration are being added separately; until they land, typecheck + nav audit + expo-doctor are the gate.
- Design prototype `UIUX/` moved out of the repo (see `docs/DESIGN_REFERENCE.md`).
