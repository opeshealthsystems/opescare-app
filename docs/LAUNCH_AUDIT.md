# Launch audit — Google Play, 2026-10-18

**App:** OpesCare · `com.opescare.patientid` · 1.4.0 · Expo SDK 57 / RN 0.86 · target SDK 36
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
| Hygiene | No quality scripts | `npm run typecheck`, `audit:nav`, `doctor`, `verify` |

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
| O1 | **Feature graphic 1024×500** and **≥ 2 phone screenshots** | Play will not publish the listing without them. `playstore/graphics/README.md` has the specs |
| O2 | **Production API decision** | A production build refuses to start until `EXPO_PUBLIC_API_BASE_URL` is set, or `OPESCARE_ALLOW_DEMO_BACKEND=1` says shipping against finder.opescare.cloud (demo mode) is intended |
| O3 | **Health apps declaration** (App content → Health apps) | Tick medical records / clinician features; privacy policy already covers health data |
| O4 | **Data Safety "ephemeral" tick for location** | Only if nginx access logs on the API are not kept with query strings (coordinates are in the GET URL) |
| O5 | **Reviewer access** | Give Play `demo.reviewer@` credentials in App access — the in-app demo buttons are off in production |
| O6 | **First upload is manual**; then `eas.json` `submit.production` can get a service-account key | |
| O7 | After the listing is live, point the backend `store_url` at `details?id=com.opescare.patientid` | The update gate currently opens the sideload page |

## 5. Known follow-ups (not launch blockers)

- npm audit reports advisories mostly in build-time tooling (metro, expo CLI); the
  runtime ones clear with the next SDK 57 patch release. Re-run `npm audit --omit=dev` after each `expo install --fix`.
- Web build keeps the token in `localStorage` (native uses SecureStore).
- `lib/i18n/pending/*` bundles should be merged into the main locale files.
- No screenshot protection on Health ID / records screens (optional `expo-screen-capture`).
- No unit-test suite yet; typecheck + nav audit + expo-doctor are the gate.
