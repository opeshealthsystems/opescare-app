# Google Play readiness — `cloud.opescare.finder`

**Audited:** 2026-09-07 · **App version:** `1.0.0` · **Expo SDK 57** (`expo ~57.0.20`,
React Native 0.86.3) · **Package:** `cloud.opescare.finder`

**Scope:** Google Play only. Apple findings live in
[`docs/STORE_SUBMISSION.md`](STORE_SUBMISSION.md); this document supersedes that
file wherever the two disagree, and §11 lists exactly where they disagree and why.

**Method.** Every row below is grounded in one of: the merged Android manifest
produced by `npx expo config --type introspect` (run 2026-09-07 — this is the
manifest EAS will actually build, plugins applied), the Gradle version catalog
in `node_modules`, the app's own source, or a live HTTP request to
`finder.opescare.cloud`. Nothing here is inferred from documentation alone.
No `git` command was run and `app.json` / `app.config.js` / `eas.json` were not
edited — §10 lists the config changes as one-liners for whoever owns those files.

---

## 0. Verdict

**Not submittable today. Three blockers, all outside the packaging.**

| | |
|---|---|
| Packaging / build config | **Ready.** AAB, target API, signing path, icons all correct. |
| Would it pass Play review today? | **No** — B1, B2, B3 below. |
| Is it a policy risk once live? | **Yes** — B2 (privacy policy contradicts the app) is a removal risk, not just a rejection risk. |

### Blockers

| # | Blocker | Why it stops you |
|---|---|---|
| **B1** | The `production` build points at the **demo** API host | Patient-safety and data-integrity problem before it is a policy problem |
| **B2** | The **published privacy policy contradicts the app** | Play User Data policy: the policy must comprehensively disclose what the app collects. It currently denies collecting location, and never mentions photos, push, or payments. Mismatch with the Data Safety form is a documented cause of removal. |
| **B3** | Two **unjustified permissions** ship in the manifest: `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` | Neither is used anywhere in the app. Both are visible to users; `RECORD_AUDIO` (Microphone) on a medical-records app is exactly the kind of thing a reviewer stops on. Fix is a three-line config change. |

### Needs work (will not block submission, will cost you)

N1 Store assets (feature graphic, screenshots, 512 icon) · N2 `ACCESS_FINE_LOCATION`
is over-declared · N3 `allowBackup="true"` on a health app · N4 the API's
`app-config.store_url` points at the **wrong package** · N5 app label
("OpesCare") ≠ proposed listing title ("OpesCare Finder") · N6 dead
"Continue with Google / Apple" rows · N7 in-app legal screens unreachable when
signed out · N8 Play developer-account gating (closed testing) may apply.

---

## 1. Artefact — does `production` produce an `.aab`?

**READY.**

`eas.json` → `build.production.android.buildType` is now explicitly
`"app-bundle"`, so the production profile emits an Android App Bundle. The other
four profiles (`development`, `local-api`, `preview`, `demo`) explicitly set
`"apk"`, which is correct for internal distribution and irrelevant to Play.

Play has required App Bundles for **new** apps since August 2021, so this is the
only acceptable artefact — an APK upload would be refused by the Console.

**Action:** none.

---

## 2. Target SDK / compile SDK

**READY — with the deadline already passed, so verify it on the build.**

Resolved chain, verified in `node_modules`:

| Value | Where it comes from |
|---|---|
| `targetSdk = "36"` | `node_modules/react-native/gradle/libs.versions.toml` |
| `compileSdk = "36"` | same file |
| `minSdk = "24"` (Android 7.0) | same file |
| Consumed by | `expo-modules-autolinking/.../ExpoRootProjectPlugin.kt:55` reads the catalog; its hard-coded fallback is `35`, but the catalog is present, so **36 wins** |
| Module default | `expo-modules-core/android/ExpoModulesCorePlugin.gradle:65-69` — `compileSdk 36`, `minSdk 24`, `targetSdk 36` |

Google's requirement, in force **since 31 August 2026**: new apps and updates
must target **Android 16 / API 36** or higher. Expo SDK 57 targets exactly 36,
so this passes — and would *not* have passed on SDK 54/55.

Nothing in this repo overrides the SDK versions (no `expo-build-properties`
plugin, no `android/gradle.properties`), so the catalog value is what ships.

**Action:** after the first `eas build --profile production --platform android`,
confirm in the Play Console's App Bundle Explorer that target SDK reads 36.

---

## 3. Permissions

**BLOCKER (B3) — two unjustified permissions ship.**

This is the **merged manifest**, taken from `npx expo config --type introspect`
on 2026-09-07 — i.e. `android.permissions` from `app.json` *plus* everything the
config plugins and library manifests add. `android.permissions` is **additive,
not an allow-list** (`@expo/config-plugins/build/android/Permissions.js`
→ `setAndroidPermissions` only appends), which is why the shipped set is larger
than the four names in `app.json`.

| Permission | Ships? | Feature that needs it | Verdict |
|---|---|---|---|
| `INTERNET` | yes | Every API call (`lib/api/client.ts`) | **Justified** |
| `ACCESS_COARSE_LOCATION` | yes | Care Map + Blood Finder distance sort | **Justified** |
| `ACCESS_FINE_LOCATION` | yes | — | **Over-declared, see N2** |
| `POST_NOTIFICATIONS` | yes | Consent requests, results, appointments (`lib/push/*`) | **Justified** |
| `CAMERA` | yes | Health-ID photo (`app/edit-profile.tsx:267`) and clinician QR scan (`app/clinician/scan.tsx:43,259`) | **Justified** |
| `VIBRATE` | yes | Notification channels. Normal permission — never shown to the user | Justified enough |
| **`RECORD_AUDIO`** | **yes** | **nothing** | **UNJUSTIFIED — remove** |
| **`SYSTEM_ALERT_WINDOW`** | **yes** | **nothing** | **UNJUSTIFIED — remove** |
| `RECEIVE_BOOT_COMPLETED` | **no** — `tools:node="remove"` | n/a | Correctly blocked |
| `READ_EXTERNAL_STORAGE` | **no** — `tools:node="remove"` | n/a | Correctly blocked |
| `WRITE_EXTERNAL_STORAGE` | **no** — `tools:node="remove"` | n/a | Correctly blocked |

### `RECORD_AUDIO` — where it comes from, and proof nothing uses it

Two config plugins add it, independently, by default:

- `node_modules/expo-camera/plugin/build/withCamera.js` — the option
  `recordAudioAndroid` **defaults to `true`**, and the plugin then calls
  `withPermissions(config, ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'])`.
  `app.json` passes only `cameraPermission`, so the default applies.
- `node_modules/expo-image-picker/plugin/build/withImagePicker.js:59-60` —
  `if (microphonePermission !== false) { …withPermissions(config, ['android.permission.RECORD_AUDIO']) }`.
  `app.json` passes only `photosPermission` and `cameraPermission`, so
  `microphonePermission` is `undefined`, which is `!== false`.

Proof it is dead weight: a repo-wide search for microphone/audio-capture APIs
finds **zero** recording call sites. The only `Audio` references are
`lib/push/sounds.ts`, which *plays* a chime through the web `HTMLAudioElement`
and says in its own header comment that a native audio library was deliberately
avoided precisely because "it would add a native module, a microphone permission…".
The permission it was avoiding got added anyway, by the camera and picker plugins.

**Impact:** the Play listing will show "Microphone" under permissions for an app
that records nothing. On a medical-records app that is a review flag and a
legitimate user-trust problem.

### `SYSTEM_ALERT_WINDOW` — where it comes from

It is in Expo's own bare-workflow Android manifest template, verbatim, under a
comment reading *"OPTIONAL PERMISSIONS, REMOVE WHATEVER YOU DO NOT NEED"* —
see `@expo/config-plugins/build/plugins/withAndroidBaseMods.js:62` and the same
block in `node_modules/expo/template.tgz → android/app/src/main/AndroidManifest.xml`.
Nothing in prebuild removes it. The app draws no overlays.

**Impact:** "Display over other apps" is a special-access permission. Play does
not require a declaration form for it, but it is precisely the kind of
unexplained sensitive capability that draws a review question — and it grants a
real attack surface for nothing in return.

**Action (B3):** see §10 — three lines, all in `app.json`.

### N2 — `ACCESS_FINE_LOCATION` is over-declared

Every location read in the app asks for **`Location.Accuracy.Balanced`**
(~100 m), never `High`:

- `app/blood-finder.tsx:419-420` — then sends `lat`/`lng` to the blood search
- `app/care-map.tsx:572-573` — then `reverseGeocodeAsync` at `:588`, and only
  the resulting **city name** goes to the API (`lib/api/careMapQueries.ts:43-46`)
- `app/(auth)/permissions.tsx:193` — the onboarding grant

`Accuracy.Balanced` maps to `PRIORITY_BALANCED_POWER_ACCURACY`, which is served
by `ACCESS_COARSE_LOCATION` alone. Keeping `ACCESS_FINE_LOCATION` therefore buys
no accuracy the app asks for, but it does oblige you to complete Play's
**sensitive-permission / prominent-disclosure declaration** for precise location
and to declare Precise location in Data Safety.

There is no background-location permission anywhere — good, and worth saying in
the declaration.

**Decision for the owner:** drop `ACCESS_FINE_LOCATION` and lose nothing
measurable, or keep it and fill in the declaration. Dropping is simpler and is
the better privacy answer for a health app. Left as a product decision.

---

## 4. Data Safety form

**NEEDS WORK — the answers in `STORE_SUBMISSION.md` §4 are now wrong in two
places.** Since that audit the app gained **photo upload** and **mobile-money
payments**, both of which change the form. Every row below is grounded in code.

### Section-level answers

| Question | Answer | Evidence |
|---|---|---|
| Does the app collect or share user data? | **Yes** | |
| Is all collected data encrypted in transit? | **Yes** | HTTPS only; `usesCleartextTraffic` is *derived* in `app.config.js` and turns on only when the API base URL starts `http://` — true for the `local-api` LAN profile, false for production |
| Do you provide a way to request deletion? | **Yes — in-app *and* on the web** | `app/account/delete.tsx` + `lib/api/accountDeletionQueries.ts` (`GET/POST /mobile/account/deletion`); web page live at `https://finder.opescare.cloud/account-deletion` (HTTP 200, verified 2026-09-07) |
| Reviewed against Families policy? | **No** — adult health app | The app *does* hold minors' data via the guardian/dependant feature (`lib/api/familyQueries.ts`), but it is not child-directed |
| Any data shared with third parties? | **No** | One host only (`lib/api/endpoints.ts:7-8`); zero analytics/ads/attribution/crash SDKs in `package.json` |
| Any data collected for advertising? | **No** | |

### Data types — all **Collected**, **not shared**, purpose *App functionality* + *Account management*

| Play category | Type | Grounded in |
|---|---|---|
| Personal info | Name | `app/(auth)/signup.tsx:284` (`first_name`, `last_name`); dependants' `full_name` |
| Personal info | Email address | `endpoints.loginEmail`, `register`, `forgotPassword` |
| Personal info | Phone number | `endpoints.loginPhone`, OTP, emergency contact, blood request |
| Personal info | Address | `PATCH /mobile/me` (`lib/api/profileQueries.ts`) |
| Personal info | User IDs | Health ID, patient UUID |
| Personal info | Other info | Date of birth, sex (`app/(auth)/signup.tsx:287`) |
| Health and fitness | **Health info** | The whole record: allergies, diagnoses, immunisations, prescriptions, lab orders/results, vitals, care plans, referrals, appointments, documents, 30-page Health Passport, PDF/FHIR export |
| **Photos and videos** | **Photos** | **NEW — `POST /mobile/me/photo` multipart upload, `lib/api/profileQueries.ts` `useUploadMyPhoto`, picked at `app/edit-profile.tsx:267-268`. `STORE_SUBMISSION.md` says answer "No" here. That is now wrong.** |
| **Financial info** | **User payment info / Purchase history** | **NEW — `lib/api/paymentQueries.ts`: `POST /mobile/payments/invoices/{id}/charges` sends `msisdn` (the payer's MTN MoMo / Orange Money number) plus `amount_minor`; invoices are read back. `STORE_SUBMISSION.md` says answer "No" to all financial info. That is now wrong.** |
| Messages | Other in-app messages | Care-team threads; support tickets (`endpoints.supportTickets`, `supportTicketMessages`) |
| App activity | Other user-generated content | Free-text `reason`, `note`, patient notes, vitals logged by the patient |
| Device or other IDs | Device or other IDs | App-generated device fingerprint **and** the Expo push token (`lib/api/settingsQueries.ts:188-193`) — **not** an advertising ID |
| Location | Approximate location | Care Map sends only a reverse-geocoded city |
| Location | Precise location | Blood Finder sends raw `lat`/`lng` (`app/blood-finder.tsx:422` → `useBloodSearch`, `lib/api/queries.ts:1244-1251`) |

### Answer **No / not collected**

Credit score · Contacts · Calendar · Audio files (nothing records) · Web browsing
history · Installed apps · App interactions · Crash logs · Diagnostics ·
Other app performance data · Files and docs *(the app downloads exports, it never
uploads a document — Play asks about collection)*.

### Still unresolved — one server-side question

**In-app search history.** Medicine and facility search terms (`q`) are sent
with a bearer token. Whether that is *collection* depends on whether the API
retains them against the account. Cannot be determined from the client.
**Owner must check the API before answering.**

### Two things to disclose in the narrative

1. `app/care-map.tsx:588` calls `Location.reverseGeocodeAsync()`, which resolves
   through the **platform (Google) geocoder** on Android — precise coordinates
   leave the app to the OS vendor. An OS service, not an SDK you added, but a
   careful policy says so.
2. Guardians can hold and act on a **dependant's** record, including a minor's
   (`lib/api/familyQueries.ts`, `X-OpesCare-Dependent` header). The data
   collected is about a third party, not the account holder.

---

## 5. Privacy policy URL

**BLOCKER (B2) — a policy exists, but it contradicts the app.**

Live and reachable, verified by HTTP request on 2026-09-07:

| URL | Status | What it is |
|---|---|---|
| `https://finder.opescare.cloud/privacy` | **200** | "Privacy Policy & Patient Data Protection \| OpesCare". Last updated **7 June 2026**. Substantive: controller, DPO contact, consent, retention, emergency access, erasure rights. |
| `https://finder.opescare.cloud/legal` | 200 | legal index |
| `https://finder.opescare.cloud/terms` | 200 | terms |
| `https://finder.opescare.cloud/account-deletion` | **200** | Deletion-request page — headings include "How to delete your account", "Erased immediately, permanently", "Kept, because the law requires it", "If you cannot use the app". Gives a non-app email route. |
| `/privacy-policy`, `/data-deletion`, `/delete-account`, `/terms-of-service` | 404 | use the canonical paths above |

**Use `https://finder.opescare.cloud/privacy` in the Play Console privacy-policy
field and `https://finder.opescare.cloud/account-deletion` in the data-deletion
field.** Both work today.

### Why this is still a blocker

Play's User Data policy requires the privacy policy to **comprehensively
disclose** access, collection, use and sharing, and to be **consistent with the
Data Safety declaration**. The live policy is not:

| The policy says | The app actually does |
|---|---|
| *"we do not collect… location tracking data beyond what you explicitly provide as your address"* | Sends raw `lat`/`lng` to `GET /mobile/blood/search` and a reverse-geocoded city to the Care Map |
| explicitly excludes "financial payment card data"; no mention of mobile money | Sends the payer's MoMo/Orange `msisdn` and initiates charges |
| no mention of push notifications | Mints an Expo push token and stores it server-side against the patient |
| no mention of camera or photo upload | Uploads a patient photo to `POST /mobile/me/photo` |
| no mention of a mobile app by name | The policy is the app's store-listing policy |

A Data Safety form that (correctly) declares Precise location, Photos and
Financial info against a policy that denies them is a self-inflicted policy
violation. This is the kind of mismatch that gets an app **removed after
publication**, not merely rejected at review.

**Action (B2):** update the hosted policy on the OpesCare API side to name the
app, and to cover location (foreground only, both precision levels and what each
is used for), camera and photo upload, push notifications and the push token,
mobile-money payments, the dependant/guardian feature, and the on-device
encrypted offline cache. Source of truth for the app-side wording already exists
in `lib/i18n/pending/legal.en.json` / `legal.fr.json` and `app/legal/privacy.tsx`
— use it so the two cannot drift. *(That page lives in the OpesCare API repo,
which is out of scope for this repository.)*

The account-deletion page's only gap is cosmetic: it does not name the app
package or link the Play listing. Add both once the listing exists.

---

## 6. Health app policy

**READY, with two things to declare and one gap to close.**

Google applies extra scrutiny to apps in the Medical category. What matters is
whether the app makes clinical claims of its own. **It does not.**

| Question | Finding |
|---|---|
| Does it claim to **diagnose**? | **No.** The word "Diagnoses" appears only as a *label for clinician-authored record content* (`lib/i18n/locales/en.json:1413, 1716, 2176`) and "Diagnostics"/"Diagnostic centre" as a *facility type* (`:1647, 2049`). Nothing in the app derives a diagnosis. |
| Does it claim to be a **medical device**? | **No.** No such claim anywhere in the strings. |
| Does it **interpret** results? | **No — it relays.** `lib/api/labInterpretationTypes.ts` is explicit: the interpretation is a clinician's *shared note*, authored server-side, and only shared notes reach the client. The Critical/Abnormal flags (`en.json:4675-4713`) come from the lab's own result status; the app renders "Contact your care team", which is escalation advice attached to a lab's flag, not the app's own reading. |
| Does it give **treatment advice**? | **No.** "SEEK CARE IMMEDIATELY IF" (`en.json:4232`) is a *section heading* for follow-up instructions a clinician wrote, in the Health Passport / care-plan renderer. |
| Prescription medicines | **Server-enforced.** `lib/api/pharmacyQueries.ts:100-108` — the API returns `PRESCRIPTION_REQUIRED` / `PRESCRIPTION_NOT_FOUND` and the reservation is refused. The app cannot obtain a prescription-only medicine without a prescription. This is the answer to Play's restriction on facilitating the sale of prescription drugs. |
| In-app payments | MTN MoMo / Orange Money for **real-world goods and services** (medicines, consultations, lab work). Play Billing is **not** required for physical goods or real-world services, so this is permitted — but declare it plainly, and note the app never sells digital content. |

### The one gap

**There is no medical disclaimer in the app's own strings.** A search of
`lib/i18n/locales/en.json` finds no "not a substitute for professional medical
care", no "do not use in an emergency". The disclaimer exists only in the *store
description* drafted in `STORE_SUBMISSION.md` §6. For a Medical-category app that
surfaces critical lab values, an in-app disclaimer is cheap insurance and is what
reviewers expect to find.

**Action:** add a short disclaimer line to the app (Help, Settings→About, or the
first-run screen) and keep the one already drafted for the store description.

**Also required in the Console:**
- **Health apps declaration** — attest the app is a legitimate health service.
  Have the MINSANTE relationship evidence ready; Play may ask.
- **Sensitive permissions declaration** for `ACCESS_FINE_LOCATION`, unless you
  drop it (N2): foreground-only, used to rank nearby blood banks and facilities
  by distance, no background location in the manifest.

---

## 7. Assets

### In the repo — measured, not eyeballed (PNG IHDR decoded 2026-09-07)

| File | Size | Format | Verdict |
|---|---|---|---|
| `assets/icon.png` | 1024×1024 | 8-bit RGBA, **1051 KB** | **OK as the app icon.** See the note below about the *store* icon. |
| `assets/android-icon-foreground.png` | 1024×1024 | 8-bit RGBA, 268 KB | OK — adaptive foreground |
| `assets/android-icon-background.png` | 1024×1024 | 8-bit RGB, 4 KB | OK |
| `assets/android-icon-monochrome.png` | 1024×1024 | 8-bit RGBA, 124 KB | OK — Android 13 themed icons |
| `assets/notification-icon.png` | 96×96 | 8-bit RGBA | OK — white-on-transparent, which is what Android needs |
| `assets/splash-icon.png` | 1024×1024 | 8-bit RGBA, 380 KB | OK on the `#FDF8F0` splash ground |
| `assets/favicon.png` | 48×48 | RGBA | OK (web only) |
| `assets/sounds/*.wav` | 5 files, 48–128 KB | — | All five present and wired in the `expo-notifications` plugin block |

Adaptive icon is fully specified in `app.json` (foreground + background +
monochrome), so the launcher icon is correct under every mask and in themed mode.
**No icon or splash asset is missing.**

### Still to produce — none of this can come from the repo

| Asset | Exact spec | Note |
|---|---|---|
| **Play Store icon** | 512×512 px, 32-bit PNG, **≤ 1024 KB** | Downscale `assets/icon.png`. **Do not upload `icon.png` itself — at 1051 KB it is over the 1 MB limit.** A 512×512 re-encode lands far under. |
| **Feature graphic** | 1024×500 px, PNG or JPEG, **no alpha** | **Required.** Nothing in the repo can serve as this; it must be designed. |
| **Phone screenshots** | 2–8 images, each side 320–3840 px, max ratio 2:1; 1080×1920 recommended | **Required** |
| Tablet screenshots | 7" and 10" sets | Only if you want the "tablet optimised" badge. The app has no tablet layout — skip. |

Suggested six frames, in order: Home · Medicine Finder with a stock badge ·
Care Map · Health ID card · Records timeline · Privacy & consent. Include the
privacy frame deliberately — it is the app's best answer to the "why does a
health app need all this" question the reviewer is already asking.

---

## 8. Version and versionCode

**READY, but one piece of `app.json` is now inert and will mislead someone.**

| Setting | Current value | What actually happens |
|---|---|---|
| `expo.version` | `1.0.0` | Correct for a first release. This is the marketing version, bumped by hand. |
| `android.versionCode` | `1` | **EAS ignores this at build time.** `eas.json` has `cli.appVersionSource: "remote"`, so the counter lives on EAS servers; the local value only seeds it on first use. |
| `build.production.autoIncrement` | `true` | EAS increments the remote counter per production build. |

`appVersionSource: "remote"` is the correct choice here and is explained in
`docs/eas-build-profiles.md`: this project has a **dynamic config**
(`app.config.js`), and EAS cannot write an incremented `versionCode` back through
one, so `local` + `autoIncrement` is an unusable pair.

**For the first release:** `version` `1.0.0`, `versionCode` `1`. Nothing to
change. Just know that after the first build the authority is EAS, not
`app.json` — check with `eas build:version:get --platform android` rather than
reading the file, and never hand-edit `android.versionCode` expecting it to take
effect. Consider deleting it, or adding a comment, so nobody trusts it.

---

## 9. Anything else that would get the app rejected or pulled

### B1 — the production build points at the demo backend · **CRITICAL**

`eas.json` → `build.production.env.EXPO_PUBLIC_API_BASE_URL` is
`https://finder.opescare.cloud/api` — **the same host as `preview` and `demo`**,
which run `APP_ENV=demo` / `OPESCARE_DEMO_MODE=true` and apply an `IsDemoRecord`
scope that hides non-demo patients. `docs/eas-build-profiles.md` says so in the
`build.production` section, in as many words.

Shipping a medical-records app to Play against a demo database means real
patients silently fail to sign in and seeded demo records are what a stranger
sees. That is a patient-safety and data-integrity problem first, and a Play
"Health apps / misleading claims" problem second.

Worth stating precisely what is *already* right: `EXPO_PUBLIC_DEMO_LOGINS=0` and
`EXPO_PUBLIC_DOCTOR_PERSONA=0` are pinned in the production profile, and
`SHOW_DEMO_LOGINS` in `app/(auth)/login.tsx:130-133` is
`__DEV__ || EXPO_PUBLIC_DEMO_LOGINS === '1' || … === 'true'`. A release build has
`__DEV__ === false`, so **the demo sign-in menu cannot appear in a store build**
even if a developer has a stray `.env`. The pin is not cosmetic — it is what
makes that guarantee hold.

**Action:** stand up a production API host, repoint
`build.production.env.EXPO_PUBLIC_API_BASE_URL`, and confirm `APP_ENV=production`
with demo mode off before any upload.

### N3 — `allowBackup="true"` on a medical-records app

The introspected manifest carries `android:allowBackup="true"` on
`<application>`, alongside `android:fullBackupContent="@xml/secure_store_backup_rules"`
and `android:dataExtractionRules="@xml/secure_store_data_extraction_rules"` added
by the `expo-secure-store` plugin.

The SecureStore rules exclude SecureStore's own keys — which covers the auth
token and the encrypted offline cache (`lib/offline/storage.ts` and
`identity.ts` both go through `expo-secure-store`). So the sensitive material is
already excluded. But `allowBackup="true"` still lets Android Auto Backup ship
the rest of the app's private files to the user's Google Drive.

Not a policy violation and not a blocker. But for a health app it is worth a
deliberate decision rather than an inherited default. **Owner call:** set
`android.allowBackup: false` in `app.json` if you want the app's data to stay on
the device.

### N4 — the API tells the app to open the **wrong** Play listing

Live check, 2026-09-07:

```
GET https://finder.opescare.cloud/api/mobile/app-config
{"min_supported_build":1,"latest_version":"1.0.0",
 "store_url":"https://play.google.com/store/apps/details?id=com.opescare.patient"}
```

`com.opescare.patient` ≠ `cloud.opescare.finder`. `components/AppUpdateGate.tsx:29`
calls `Linking.openURL(gate.storeUrl)` with that value, so a patient hitting the
"update required" gate is sent to a listing for a different (or non-existent)
app — and `min_supported_build: 1` means a future bump could hard-block every
user behind a dead link.

The client side is defensive and fine (`lib/api/appConfigQueries.ts:101-102,144`
only ever opens http(s)); the bad value is server-side.

**Action:** fix `store_url` in the API's `/mobile/app-config` to
`https://play.google.com/store/apps/details?id=cloud.opescare.finder` before
launch. *(API repo — out of scope here, reported only.)*

### N5 — app label ≠ proposed store title

`app.json` → `expo.name` is now **`"OpesCare"`** (confirmed in the introspected
config as `name: 'OpesCare'`), so that is the label under the launcher icon.
`docs/STORE_SUBMISSION.md` §6 proposes the Play title **"OpesCare Finder"**.

Play does not require them to match, but an app that installs as one name and is
listed as another is a recognised source of user confusion and support load.
**Pick one and use it in both places.**

### N6 — two dead "Soon" rows on the sign-in screen

`app/(auth)/login.tsx:440-466` renders "Continue with Google" and "Continue with
Apple" as disabled rows, correctly labelled *Soon* for accessibility, over an
auth surface that has no such backend. They are honest and non-interactive,
which is the good version of this. Play's Spam & Minimum Functionality policy is
far more forgiving here than Apple's 2.1 — a **low** risk, not a blocker.
Cheapest safe fix is to remove both rows for v1.0.

### N7 — the in-app legal screens are unreachable when signed out

`app/settings.tsx` now links all three (`:88` privacy, `:89` terms, `:93` delete
account; rendered at `:291`, `:537-550`) so the "route + nav link" rule is
satisfied for a signed-in user. But `app/_layout.tsx:166-168` still redirects any
unauthenticated session outside the `(auth)` group to `/(auth)/welcome`, so a
signed-out user or a reviewer following a deep link to `/legal/privacy` is
bounced to the welcome screen.

Low severity **because the hosted URLs exist** and are what Play actually checks.
Fix by allowing `legal` alongside `(auth)` in that guard.

### N8 — Play developer-account gating

If the Play developer account is a **personal** account created after
13 November 2023, Google requires a closed test with **at least 12 testers opted
in continuously for 14 days** before you can apply for production access.
Organisation accounts registered to a legal business entity are exempt.

This is a **calendar** blocker, not a code one — if it applies and nobody has
started, production is at least two weeks away regardless of everything else.
Identity verification for a new account can also take days.

**Action:** determine the account type today. If personal, start the closed test
immediately (the `demo` build profile exists precisely to produce a tester APK
without push credentials).

### Not a blocker — push, and account deletion, are both fixed

`docs/STORE_SUBMISSION.md` lists these as blockers B4 and B2. **Both are closed
in the current code**, and the doc has not caught up:

- **Push (old B4).** `lib/push/token.ts:169` calls
  `Notifications.getExpoPushTokenAsync({ projectId })`, and
  `lib/api/settingsQueries.ts:188-193` registers `push_token: outcome.token` —
  a real `ExponentPushToken[…]`, no longer the device fingerprint. `app.json`
  now carries `extra.eas.projectId`. What remains is **credentials, not code**:
  `google-services.json` must reach the build as the `GOOGLE_SERVICES_JSON` EAS
  file variable, and `app.config.js` will **refuse** an EAS Android build without
  it rather than produce an APK that can never receive a push. See
  `docs/push-delivery-runbook.md` §3.
- **Account deletion (old B2).** `app/account/delete.tsx` +
  `lib/api/accountDeletionQueries.ts` implement it against
  `/mobile/account/deletion`, it is linked from Settings, and the public web
  page is live. Both halves of Play's requirement are met.

One stale justification worth correcting rather than acting on:
`STORE_SUBMISSION.md` blocks `RECEIVE_BOOT_COMPLETED` on the grounds that
"a repo-wide search found no `scheduleNotificationAsync` call anywhere".
That is no longer true — `lib/push/local.ts:43` calls it. But it uses an
**immediate** trigger (`{ channelId }` on Android, `null` on iOS) to raise the
consent chime found by polling, not a time-scheduled notification, so nothing
needs to survive a reboot and **the block is still correct**. Keep the block,
fix the reasoning.

---

## 10. Config changes for whoever owns `app.json` / `eas.json`

These files were deliberately **not edited** — another session owns them. Each
change below is a one-liner.

**`app.json` — B3, removes both unjustified permissions:**

1. `plugins` → `"expo-camera"` options: add `"recordAudioAndroid": false`
   *(stops `withCamera.js` adding `RECORD_AUDIO`)*
2. `plugins` → `"expo-image-picker"` options: add `"microphonePermission": false`
   *(stops `withImagePicker.js` adding `RECORD_AUDIO`, and makes the plugin
   block it as well)*
3. `android.blockedPermissions`: add `"android.permission.SYSTEM_ALERT_WINDOW"`
   *(the only way to strip it — it comes from Expo's manifest template, and the
   three names already in that array prove the mechanism works)*

**`app.json` — optional, owner decisions:**

4. `android.permissions`: remove `"android.permission.ACCESS_FINE_LOCATION"` (N2)
   — avoids the precise-location declaration; costs nothing, since only
   `Accuracy.Balanced` is ever requested
5. `android.allowBackup: false` (N3)
6. Reconcile `expo.name` with the intended Play title (N5)
7. `android.versionCode` is inert under `appVersionSource: "remote"` (§8) —
   delete it or comment it

**`eas.json` — B1:**

8. `build.production.env.EXPO_PUBLIC_API_BASE_URL` → the production API host,
   not `https://finder.opescare.cloud/api`

**Verify every one of the above with:**

```bash
npx expo config --type introspect        # the manifest EAS will build
```

and confirm the `uses-permission` list contains no `RECORD_AUDIO` and no
`SYSTEM_ALERT_WINDOW` without a `tools:node: 'remove'`.

---

## 11. Where this document disagrees with `docs/STORE_SUBMISSION.md`

That file was audited 2026-09-05 and is correct about most things. Four
corrections:

| `STORE_SUBMISSION.md` says | Current reality |
|---|---|
| B4: push notifications cannot work; no real token is ever obtained | **Fixed.** `lib/push/token.ts:169` mints a real Expo push token; `app.json` has the project id. Only the FCM credential remains, and it is credential work, not code. |
| B2: no in-app account deletion | **Fixed.** `app/account/delete.tsx` + web page, both live. |
| §4: answer **No** to Photos and videos, and **No** to all Financial info | **Both wrong now.** Photo upload (`POST /mobile/me/photo`) and MoMo payments (`msisdn` on `POST …/charges`) both ship. |
| §9: `RECEIVE_BOOT_COMPLETED` blocked because no `scheduleNotificationAsync` call exists | The call now exists (`lib/push/local.ts:43`) but is an immediate trigger. **Conclusion unchanged, evidence stale.** |
| B5: no reachable privacy-policy URL | A policy is live at `/privacy` — but it **contradicts the app**, which is the new B2 here. |

---

## 12. Checklist

| # | Item | Status |
|---|---|---|
| 1 | `production` profile emits an `.aab` | **Ready** |
| 2 | targetSdk 36 / compileSdk 36 / minSdk 24 — meets the Aug 2026 requirement | **Ready** |
| 3 | Permissions justified | **Blocker** — `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW` |
| 3b | `ACCESS_FINE_LOCATION` over-declared | Needs work |
| 4 | Data Safety answers grounded in code | **Ready to fill** — §4, with one server question |
| 5 | Privacy-policy URL reachable | Ready (`/privacy`) |
| 5b | Privacy policy consistent with the app | **Blocker** |
| 5c | Account-deletion URL reachable | **Ready** (`/account-deletion`) |
| 6 | No diagnostic / medical-device claims | **Ready** |
| 6b | In-app medical disclaimer | Needs work |
| 6c | Prescription-only medicines gated | **Ready** (server-enforced) |
| 7 | App icon, adaptive icon, splash, notification icon | **Ready** |
| 7b | 512 store icon, feature graphic, screenshots | Needs work |
| 8 | `version` 1.0.0 / `versionCode` 1 | **Ready** |
| 9 | Production points at a production API | **Blocker** |
| 9b | `allowBackup`, `store_url`, app name, "Soon" rows, signed-out legal routes | Needs work |
| 9c | Play account type / closed-testing gate | **Unknown — check today** |
| 9d | Push credentials (`google-services.json` as an EAS file variable) | Needs work — runbook §3 |
| 9e | EAS signing keystore created **and backed up** | Owner-only — runbook §0-2 |
