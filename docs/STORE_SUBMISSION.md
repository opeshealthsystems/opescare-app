# OpesCare Finder — App Store & Google Play submission readiness

**Audited:** 2026-09-05 · **Build audited:** `master`, app version `1.0.0` ·
**Bundle ID / package:** `com.opescare.patientid`

---

## 1. Verdict

**NOT submittable today.** The *packaging* is now in good shape — config, icons,
permissions, privacy declarations and listing copy are done or specified below.
What blocks submission is **product state**, not packaging:

| | |
|---|---|
| Would it pass Apple review today? | **No.** Four hard blockers (§2 B1–B4). |
| Would it pass Google Play review today? | **No.** Three hard blockers (B1, B2, B4). |
| Is the build machinery ready? | **Almost** — needs `eas init` and store credentials, which only the owner can do (§7). |
| Are the assets ready? | **Icons yes, screenshots no** (§5). |

The single most important sentence in this document: **the production build
points at `finder.opescare.cloud`, which is a demo server running
`APP_ENV=demo` / `OPESCARE_DEMO_MODE=true`.** Shipping a medical-records app
against a demo backend is not a store-policy problem first — it is a patient-
safety problem. Everything else in §2 is downstream of it.

---

## 2. Blockers, ranked

### B1 — Production build points at a demo backend · **CRITICAL**

`eas.json` → `build.production.env.EXPO_PUBLIC_API_BASE_URL` =
`https://finder.opescare.cloud/api`, the same host the `preview` profile uses.
Per project memory that host runs `APP_ENV=demo`, `OPESCARE_DEMO_MODE=true`,
and applies an `IsDemoRecord` scope that hides non-demo patients — which is why
a real patient signing in there fails with a misleading "no internet" error.

A public App Store build authenticating real patients into a demo database
would let strangers see seeded demo records, and would silently fail for real
ones.

**Fix:** stand up a production API host, point `build.production.env` at it,
and confirm `APP_ENV=production` with demo mode off. Do not ship against
`finder.opescare.cloud`.

> **Good news, and it is worth stating precisely:** the *app-side* demo
> scaffolding is already gated correctly. `SHOW_DEMO_LOGINS` in
> `app/(auth)/login.tsx` is `__DEV__ || EXPO_PUBLIC_DEMO_LOGINS === '1'`, and
> `EXPO_PUBLIC_*` values are inlined at build time. A release build has
> `__DEV__ === false` and, as of this pass, `eas.json` now pins
> `EXPO_PUBLIC_DEMO_LOGINS=0` and `EXPO_PUBLIC_DOCTOR_PERSONA=0` in the
> production profile. **The demo sign-in menu will not appear in a store
> build.** That pin is not cosmetic: a plain `.env` in the project root is
> *not* gitignored (`.gitignore` covers only `.env*.local`), so a developer's
> leftover `.env` would otherwise have shipped the demo menu to the App Store.

### B2 — No in-app account deletion · **CRITICAL, and purely a backend gap**

Both stores now *require* an in-app account-deletion path for any app that
offers account creation. This app offers it (`app/(auth)/signup.tsx` →
`POST /mobile/auth/register`) and has no deletion route at all.
`app/settings.tsx:63` states the reason plainly: *"There is no mobile
account-deletion endpoint."*

- **Apple** — Guideline 5.1.1(v). Rejection is close to automatic; reviewers
  check for it specifically on apps with sign-up.
- **Google Play** — the Data Safety form has a mandatory question about it, and
  Play additionally requires a **web-accessible deletion request URL** that
  works without installing the app.

**Fix:** add `DELETE /mobile/me` (or equivalent) on the API, a "Delete account"
row in Settings with a confirm step, and a public deletion-request web page.
None of that is in this agent's file scope; the row belongs in
`app/settings.tsx`, which is owned by another agent this session.

### B3 — Apple Guideline 2.1, App Completeness: the clinician area · **HIGH (Apple only)**

All six clinician surfaces are UI over an unimplemented API. Verified in the
code, not assumed — each screen has an `isNotServed(e)` helper treating 404/501
as "this server does not serve the clinician surface yet":

| Screen | Line | Renders |
|---|---|---|
| `app/clinician/home.tsx` | 60–63, 196 | `EmptyState` "Not available on this server yet" |
| `app/clinician/schedule.tsx` | 85–88, 168 | same |
| `app/clinician/results.tsx` | 99–102, 168 | same |
| `app/clinician/messages.tsx` | 105–108, 207 | same |
| `app/clinician/patients.tsx` | 88–91 | same (404 is ambiguous here — "no such patient" *or* "no such route") |
| `app/clinician/profile.tsx` | 95–98, 387 | same |

`app/clinician/_layout.tsx` says it outright: *"The finder serves no
`/mobile/doctor/*` routes yet, so EVERY doctor hook 404s."*

**How exposed is this to a reviewer?** Less than it looks, and the distinction
matters. `app/clinician/_layout.tsx` gates the whole group on `useIsDoctor()`,
which is `persona === 'doctor'`. `resolvePersona()` (`lib/store/auth.ts:95`)
returns `'doctor'` only when (a) a real provider account is attached, (b) the
build-time `EXPO_PUBLIC_DOCTOR_PERSONA` override is on — now pinned off, or
(c) the runtime demo preview is on — unreachable without the demo menu. So a
reviewer signing in with a **patient** account never sees any of it.

The risk is the path that survives: `handleSignIn` in `app/(auth)/login.tsx`
falls back to `POST /mobile/auth/provider/login` when the patient endpoint says
"no patient record". If provider auth exists on the production server, any
clinician who signs in lands in six dead tabs. If a reviewer is given clinician
credentials in the review notes, that is an immediate 2.1 rejection.

**Fix — pick one, and be honest about which:**
1. Implement `/mobile/doctor/*` on the production API. Best, slowest.
2. Ship v1.0 as **patient-only**: disable the provider-login fallback so the
   clinician group cannot be entered at all, and give reviewers patient
   credentials only. Fastest defensible route.
3. Do **not** submit clinician credentials in the review notes and hope the
   reviewer never obtains a provider account. Not a plan.

*Per the brief, this is reported rather than "fixed" by hiding it — option 2 is
a scope decision for the owner, not an edit an agent should make unilaterally.*

### B4 — Push notifications are declared but cannot work · **HIGH**

The app asks for notification permission (`app/(auth)/permissions.tsx:144`,
`Notifications.requestPermissionsAsync()`), ships a full notification-preference
UI in Settings, and registers a token — but **no real push token is ever
obtained**. `getExpoPushTokenAsync` / `getDevicePushTokenAsync` are never
called anywhere. Instead:

```ts
// app/(auth)/permissions.tsx:129-133 and lib/api/settingsQueries.ts:162-168
{ device_fingerprint: fingerprint, platform, push_token: fingerprint }
//                                            ^^^^^^^^^^^^^^^^^^^^^^^
// settingsQueries.ts comment: "The app has no FCM/APNs credential yet,
// so the fingerprint stands in as the token."
```

There is also **no `google-services.json`** in the repo and no
`android.googleServicesFile` in the config, so Android FCM could not deliver a
push even with a real token.

Asking for a permission the app cannot use is a genuine Guideline 2.1 finding
and a bad first-run experience: the user grants notifications and never
receives one.

**Fix:** either wire FCM/APNs properly (add `google-services.json`, upload the
APNs key to EAS, call `getExpoPushTokenAsync`) **or** remove the notification
permission request and the preference UI from v1.0. Do not ship the current
middle state.

### B5 — No publicly reachable privacy-policy URL · **HIGH**

Both stores require a policy at an `https://` URL a reviewer can open **in a
browser, without installing the app**. There was no privacy policy anywhere in
the app before this pass.

**Done in this pass:** `app/legal/privacy.tsx` and `app/legal/terms.tsx` now
exist, written against the actual data flows (see §3 for the evidence they were
derived from). **This does not close the blocker** — the store field needs a
hosted page. Use the text in `lib/i18n/pending/legal.{en,fr}.json` as the
source for it so the app and the web page cannot drift.

Two further gaps I could not close, both because the files are owned by other
agents this session:
- **Nothing links to the new screens.** `app/settings.tsx` and `app/help.tsx`
  are outside this task's file scope, so `/legal/privacy` and `/legal/terms`
  are currently reachable by route only. That violates this project's own
  "every feature needs a route **and** a nav link" rule. **Owner action:** add
  two `ListRow`s to the Settings "More" group.
- **They are unreachable when signed out.** The root guard in
  `app/_layout.tsx:125` redirects any unauthenticated session that is not in
  the `(auth)` group to `/(auth)/welcome`. A signed-out user tapping a link to
  `/legal/privacy` gets bounced to the welcome screen. `app/_layout.tsx` is
  contended and was not edited. **Owner action:** allow `legal` alongside
  `(auth)` in that guard, or move the screens under `app/(auth)/legal/`.

### B6 — iPad support is declared but not designed · **MEDIUM (Apple only)**

`ios.supportsTablet: true`, and there is no tablet layout anywhere in the app —
a repo-wide search for `isTablet`, breakpoint utilities or width-conditional
layout found nothing but two decorative watermarks using
`useWindowDimensions`. Consequences:

1. App Store Connect will **require 13-inch iPad screenshots** before you can
   submit at all.
2. Apple reviews on iPad and rejects phone-stretched layouts under 2.1 / 4.0.

**Fix (one line, but it is a product decision so it was deliberately left
alone):** set `"supportsTablet": false` in `app.json` to ship iPhone-only —
this removes the iPad screenshot requirement and the iPad review surface
entirely. Otherwise, budget for real iPad layouts.

### B7 — Two dead "Soon" rows on the sign-in screen · **LOW–MEDIUM (Apple only)**

`app/(auth)/login.tsx:421,433` render "Continue with Google" and "Continue with
Apple" as disabled rows badged *Soon*. They are honest and non-interactive,
which is the good version of this — but Apple has rejected apps under 2.1 for
advertising unimplemented functionality in shipped UI. Cheapest safe fix:
remove both rows for v1.0.

> Note: this is **not** a Guideline 4.8 (Sign in with Apple) problem. That rule
> only bites once you actually offer a third-party social login. Today the app
> offers none, so no Apple ID option is required.

### B8 — French is declared but the legal screens are English · **LOW**

`app.json` now declares `CFBundleLocalizations: ["en","fr"]`, and the app is
genuinely bilingual. The new legal screens use `t(key, { defaultValue })`, so
until someone merges `lib/i18n/pending/legal.fr.json` into
`lib/i18n/locales/fr.json` a French device shows English legal text. Merging is
one paste; it was kept out of `locales/*.json` because that file is contended
this session.

---

## 3. Apple — App Privacy questionnaire answers

Derived from a full read of `lib/api/**`, `lib/offline/**` and
`lib/store/auth.ts`. **All traffic goes to exactly one first-party host**
(`lib/api/endpoints.ts:7-8`).

### The three global answers

| Question | Answer | Evidence |
|---|---|---|
| Is any data used to **track** the user? | **No** | No analytics, ads, attribution or crash SDK in `package.json`. No IDFA, no `expo-tracking-transparency`. |
| Is any data **shared with third parties**? | **No** | One host. Zero third-party SDKs. |
| Is data **encrypted in transit**? | **Yes** | HTTPS only; cleartext is enabled only for the LAN dev profile, derived in `app.config.js`. |

### Per-type answers

Every row below is **Collected: Yes**, **Linked to identity: Yes** (sent with a
bearer token), **Used for tracking: No**, **Purpose: App Functionality** unless
noted.

| Apple data type | Collected | Linked | What it actually is |
|---|---|---|---|
| **Contact Info → Name** | Yes | Yes | `first_name`, `last_name`, `display_name`; dependant `full_name` |
| **Contact Info → Email Address** | Yes | Yes | Sign-in, registration, password reset. Reset/forgot are pre-auth, so **unlinked at send time** |
| **Contact Info → Phone Number** | Yes | Yes | Phone+PIN sign-in, OTP, emergency contact, blood-request contact |
| **Contact Info → Physical Address** | Yes | Yes | `Patient.address`, editable via `PATCH /mobile/me` |
| **Health & Fitness → Health** | Yes | Yes | The core of the app — see the table below |
| **Location → Precise Location** | Yes | Yes | **One flow only:** Blood Finder sends `lat`/`lng` to `GET /mobile/blood/search` |
| **Location → Coarse Location** | Yes | Yes | Care Map reverse-geocodes the fix to a **city name** and sends only that as the `city` param |
| **Identifiers → User ID** | Yes | Yes | `health_id`, `patient_id` (UUID) |
| **Identifiers → Device ID** | Yes | Yes | **App-generated random string**, not a hardware or advertising ID |
| **User Content → Customer Support** | Yes | Yes | Support tickets: `category`, `subject`, `description` |
| **User Content → Other User Content** | Yes | Yes | Care-team messages; free-text `reason`, `note`, `clinical_notes` |
| **Other Data** | Yes | Yes | Date of birth and sex (Apple has no dedicated bucket for these) |

**Health data specifically** — declare *Health* and be ready to justify it:
blood group, allergies, diagnoses/conditions, immunisations, prescriptions,
laboratory orders and results, vital signs (heart rate, BP, blood sugar, SpO₂,
temperature, respiratory rate), care plans, referrals, appointments, clinical
documents, and full-record PDF / FHIR R4 export.

### Answer **No** to all of these

Financial Info · Payment Info · Purchases · Credit Info · Contacts · Photos or
Videos · Audio Data · Browsing History · Usage Data · Diagnostics · Crash Data ·
Performance Data · Advertising Data · Sensitive Info *(Apple's "Sensitive Info"
means race, sexual orientation, religion, biometrics and similar — none of
which this app touches; ordinary medical data belongs under Health)*.

### Two answers the owner must verify server-side

1. **Search History.** Medicine and facility search terms (`q`) are sent to the
   server with a bearer token. Whether that constitutes *collection* depends on
   whether the API **retains** them. If the backend logs search queries against
   the account, declare **Search History → Collected, Linked**. I could not
   determine retention from the client.
2. **Diagnostics.** The client sends none. If the server-side stack (Sentry on
   the API host) attributes errors to a user, that is a server disclosure, not
   an app one — but confirm it is PHI-scrubbed before answering "No".

### One thing worth disclosing in the narrative, though it is not a data type

`app/care-map.tsx:588` calls `Location.reverseGeocodeAsync()`, which resolves
through the **platform geocoder** (Apple's on iOS, Google's on Android). Precise
coordinates therefore leave the app to the OS vendor. That is an OS service, not
an SDK you added, but a careful privacy policy mentions it.

---

## 4. Google Play — Data Safety form answers

### Section-level answers

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data be deleted? | **Yes — by email only today.** See **B2**: Play requires an in-app path *and* a web deletion URL. This answer is not truthfully "compliant" until B2 is fixed. |
| Is your app reviewed against Families policy? | **No** — adult health app |
| Is any data shared with third parties? | **No** |
| Is any data collected for advertising or marketing? | **No** |

### Data types — all **Collected**, **not shared**, **Required** (not optional), purpose **App functionality** and **Account management**

| Play category | Type | Notes |
|---|---|---|
| Personal info | Name | |
| Personal info | Email address | |
| Personal info | Phone number | |
| Personal info | Address | |
| Personal info | User IDs | Health ID, patient UUID |
| Personal info | Other info | Date of birth, sex |
| Health and fitness | Health info | The full clinical record — see §3 |
| Messages | Other in-app messages | Care-team threads, support tickets |
| App activity | Other user-generated content | Free-text reasons and notes |
| Device or other IDs | Device or other IDs | App-generated string, **not** an advertising ID |
| Location | Approximate location | Reverse-geocoded city sent by Care Map |
| Location | Precise location | Blood Finder only |

### Answer **No / not collected** for

Financial info (all) · Photos and videos · Audio files · **Files and docs**
*(the app downloads exports, it never uploads — Play asks about collection)* ·
Calendar · Contacts · App interactions · In-app search history *(pending the
same server-retention check as §3)* · Installed apps · Web browsing history ·
Crash logs · Diagnostics · Other app performance data.

### Also required in the Play Console

- **Sensitive permissions declaration** for `ACCESS_FINE_LOCATION`: state that
  precise location is used **in the foreground only**, to rank nearby blood
  banks and health facilities by distance, and that the app has no background
  location. There is no background location permission in the manifest.
- **Health apps declaration:** Play will ask you to attest the app is a
  legitimate health service and may ask for evidence of the MINSANTE
  relationship. Have that ready.
  *Optional simplification:* the app only ever requests
  `Location.Accuracy.Balanced` (~100 m). If you drop
  `ACCESS_FINE_LOCATION` you avoid the precise-location declaration entirely,
  at the cost of coarser distance sorting. Left in place as a deliberate call —
  distance-to-facility is a core feature.

---

## 5. Assets — what exists, what is missing

### Verified present and correct (measured, not eyeballed)

| Asset | Size | Format | Verdict |
|---|---|---|---|
| `assets/icon.png` | 1024×1024 | RGBA, **0 transparent pixels** | **OK.** The alpha channel exists but is fully opaque, and Expo's prebuild flattens iOS icons anyway (`withIosIcons.js:198`: `removeTransparency: true`, `backgroundColor: '#ffffff'`). **The "iOS 1024 must have no alpha" rule is satisfied** — this was checked by decoding the pixels, not assumed. |
| `assets/android-icon-foreground.png` | 1024×1024 | RGBA, 90.3% transparent | **OK.** Content bounding box is 225,230 → 793,782 — comfortably inside the 174–850 adaptive-icon safe zone, so nothing clips under round or squircle masks. |
| `assets/android-icon-background.png` | 1024×1024 | RGB | OK |
| `assets/android-icon-monochrome.png` | 1024×1024 | RGBA | OK (Android 13 themed icons) |
| `assets/notification-icon.png` | 96×96 | RGBA, **pure white on transparent** | **OK** — exactly what Android needs; a coloured icon would render as a flat blob. |
| `assets/splash-icon.png` | 1024×1024 | RGBA, 84.9% transparent | OK on the `#FDF8F0` splash ground |
| `assets/favicon.png` | 48×48 | RGBA | OK (web only) |

**No icon or splash asset is missing, and none was regenerated or modified in
this pass.** Nothing needed it.

### Missing — must be produced by the owner

| Asset | Spec | Store |
|---|---|---|
| **Play Store icon** | 512 × 512 px, 32-bit PNG with alpha, ≤ 1 MB | Google Play — **required**. Downscale `assets/icon.png`. |
| **Feature graphic** | 1024 × 500 px, 24-bit PNG or JPEG, **no alpha** | Google Play — **required**. Nothing in the repo can serve as this; it must be designed. |
| **iPhone screenshots** | 6.9″ display: **1290 × 2796** or **1320 × 2868** px portrait. 2–10 images. | Apple — **required** |
| **iPad screenshots** | 13″ display: **2064 × 2752** or **2048 × 2732** px portrait. | Apple — **required only while `supportsTablet: true`** (see B6) |
| **Android phone screenshots** | 2–8 images. Each side 320–3840 px, max ratio 2:1. 1080 × 1920 recommended. | Google Play — **required** |
| **Android tablet screenshots** | 7″ and 10″ sets | Only if you want a "tablet optimised" listing |

Suggested screenshot set (six frames, same order both stores): Home ·
Medicine Finder result with a stock badge · Care Map · Health ID card ·
Records timeline · Privacy & consent screen. The Privacy frame is worth
including deliberately — it is the app's strongest answer to the "why does a
health app need all this" question a reviewer is already asking.

---

## 6. Store listing copy

### Apple App Store — English

- **Name** (≤30): `OpesCare Finder`
- **Subtitle** (≤30): `Medicines, care & Health ID` *(27)*
- **Keywords** (≤100, comma-separated, no spaces):
  `pharmacy,medicine,blood,donor,clinic,hospital,appointment,health,record,doctor,cameroon,healthid`
- **Promotional text** (≤170):
  `Find medicines and blood in stock near you, book at verified facilities, and carry your health record wherever you get care.`
- **Description** (≤4000):

```
OpesCare Finder puts your health record in your pocket and shows you where care
is actually available right now.

FIND MEDICINE IN STOCK
Search by medicine or category and see which nearby pharmacies report it in
stock, with the price and the time the pharmacy last updated it. Reserve it and
collect it — you pay at the counter, never in the app.

FIND BLOOD
Search verified blood banks by group and component, sorted by real distance
from you, and send a request directly.

BOOK AT VERIFIED FACILITIES
Browse the national directory of hospitals, clinics, pharmacies and
laboratories. See which ones accept online booking, pick a real slot, and
manage your appointments in one place.

CARRY YOUR HEALTH ID
Your portable Health ID travels with you between facilities, so your care does
not restart from nothing at every door. Show a QR code at reception instead of
repeating your history.

YOUR RECORD, IN ONE PLACE
Prescriptions, laboratory results with trends over time, immunisations,
allergies, vital signs, care plans and appointments — the record your
clinicians write, shown to you in full. Export it as a PDF or a FHIR R4 bundle
whenever you want a copy.

YOU DECIDE WHO SEES IT
Every facility's access is granted by your consent, limited to what that
consent covers, and logged. Approve or refuse each request, see who opened your
record and why, and revoke access at any time.

WORKS WHEN THE NETWORK DOES NOT
Turn on offline access and keep an encrypted copy of your essentials — your
emergency profile, allergies, medications and upcoming appointments — on your
device. You choose what is stored, and you can erase it at any time.

English and French. No advertising. No tracking. We never sell your data.

OpesCare Finder is not a substitute for professional medical care and must not
be used in an emergency. Stock and availability are reported by facilities and
can change without notice.
```

### Apple App Store — Français

- **Nom** (≤30) : `OpesCare Finder`
- **Sous-titre** (≤30) : `Médicaments, soins & ID santé` *(29)*
- **Mots-clés** (≤100) :
  `pharmacie,medicament,sang,donneur,clinique,hopital,rendezvous,sante,dossier,medecin,cameroun`
- **Texte promotionnel** (≤170) :
  `Trouvez médicaments et sang disponibles près de vous, réservez dans des établissements vérifiés et gardez votre dossier de santé partout.`
- **Description** (≤4000) :

```
OpesCare Finder met votre dossier de santé dans votre poche et vous montre où
les soins sont réellement disponibles, maintenant.

TROUVER UN MÉDICAMENT DISPONIBLE
Recherchez par médicament ou par catégorie et voyez quelles pharmacies proches
le déclarent en stock, avec le prix et l'heure de la dernière mise à jour.
Réservez-le et venez le retirer — vous payez au comptoir, jamais dans
l'application.

TROUVER DU SANG
Recherchez des banques de sang vérifiées par groupe et par composant, classées
selon la distance réelle qui vous en sépare, et envoyez une demande
directement.

RÉSERVER DANS DES ÉTABLISSEMENTS VÉRIFIÉS
Parcourez l'annuaire national des hôpitaux, cliniques, pharmacies et
laboratoires. Voyez lesquels acceptent la réservation en ligne, choisissez un
créneau réel et gérez vos rendez-vous au même endroit.

VOTRE IDENTIFIANT SANTÉ, PARTOUT
Votre identifiant santé portable vous suit d'un établissement à l'autre, pour
que vos soins ne repartent pas de zéro à chaque porte. Présentez un QR code à
l'accueil au lieu de répéter votre historique.

VOTRE DOSSIER, AU MÊME ENDROIT
Ordonnances, résultats d'analyses et leurs tendances, vaccinations, allergies,
signes vitaux, plans de soins et rendez-vous — le dossier que vos soignants
rédigent, présenté intégralement. Exportez-le en PDF ou en bundle FHIR R4 dès
que vous voulez une copie.

VOUS DÉCIDEZ QUI Y ACCÈDE
L'accès de chaque établissement est accordé par votre consentement, limité à ce
qu'il couvre, et journalisé. Acceptez ou refusez chaque demande, voyez qui a
ouvert votre dossier et pourquoi, et révoquez l'accès à tout moment.

FONCTIONNE MÊME SANS RÉSEAU
Activez l'accès hors ligne et conservez sur votre appareil une copie chiffrée
de l'essentiel : profil d'urgence, allergies, traitements et prochains
rendez-vous. Vous choisissez ce qui est stocké et pouvez l'effacer à tout
moment.

Français et anglais. Aucune publicité. Aucun traçage. Nous ne vendons jamais
vos données.

OpesCare Finder ne remplace pas des soins médicaux professionnels et ne doit
pas être utilisé en cas d'urgence. Les stocks et la disponibilité sont
communiqués par les établissements et peuvent changer sans préavis.
```

### Google Play

- **Title** (≤30): `OpesCare Finder` · FR: `OpesCare Finder`
- **Short description** (≤80):
  - EN: `Find medicines and blood in stock, book care, and carry your health record.` *(73)*
  - FR: `Médicaments et sang disponibles, rendez-vous et dossier de santé.` *(64)*
- **Full description** (≤4000): reuse the App Store descriptions above verbatim;
  both fit.
- **App category:** Medical. **Content rating:** complete the IARC
  questionnaire — expect "Everyone", but declare that the app collects and
  shares personal/health information.

---

## 7. Review notes (paste into App Store Connect / Play Console)

> **Read §7.1 before pasting this — the credentials below are demo-server
> credentials and must be replaced.**

```
OpesCare Finder is a patient-facing digital health app for Cameroon. It lets a
patient find medicines and blood reported in stock at nearby facilities, book
appointments at facilities in the national directory, and view the medical
record held under their portable OpesCare Health ID.

SIGNING IN
A test account is provided below. Sign in with email and password from the
sign-in screen.

  Email:    <REVIEWER ACCOUNT EMAIL>
  Password: <REVIEWER ACCOUNT PASSWORD>

This account is pre-populated with appointments, prescriptions, laboratory
results and an emergency profile so every screen has content.

PERMISSIONS
- Location (while in use): used on the Care Map to sort nearby facilities by
  distance, and in Blood Finder to rank blood banks by distance. The app never
  requests background location. If you decline, both screens fall back to
  choosing a city from a list and everything else keeps working.
- Notifications: used for appointment and result alerts.

WHAT TO EXPECT
- Medicine and blood availability is reported by the facilities themselves. The
  app shows the time each figure was last updated, and some facilities in the
  directory have not connected their stock or booking systems — those show an
  explicit "not bookable through OpesCare" state by design, not an error.
- The app is bilingual (English / French) and follows the device language.
- The app takes no payment of any kind. Reservations are paid at the pharmacy.

PRIVACY
Privacy policy: <HOSTED PRIVACY POLICY URL>
Account deletion: <HOSTED ACCOUNT DELETION URL>
The app contains no analytics, advertising or tracking SDKs and shares no data
with third parties.
```

### 7.1 About the credentials

The demo credentials currently hard-coded in `app/(auth)/login.tsx` are:

| Role | Email | Password |
|---|---|---|
| Patient | `demo.patient@opescare.test` | `demo1234` |
| Clinician | `demo.doctor@opescare.test` | `demo1234` |

**Do not submit these as-is.** Three reasons:

1. They exist only on `finder.opescare.cloud`, the demo server. Once B1 is
   fixed and the build points at production, they will not resolve.
2. `@opescare.test` is not a routable domain; a reviewer who tries a password
   reset gets nowhere.
3. **Never give a reviewer the clinician account** until B3 is resolved — it
   lands them in six "Not available on this server yet" screens, which is
   precisely the Guideline 2.1 rejection you are trying to avoid.

**Owner action:** create one real patient account on the production API,
seeded with representative data, and put those credentials in the notes.

---

## 8. Runbook — what the owner must do

Steps 1–4 require accounts, legal attestations or signing material and **cannot
be done by an agent**.

1. **Enrol in both developer programmes** (if not already): Apple Developer
   Program ($99/yr, and for a health app under a company name you need a D-U-N-S
   number) and a Google Play Developer account ($25 one-time). Google requires
   identity verification, which can take days — start here.
2. **Create the EAS project.** `app.json` deliberately has no `projectId` (it
   was stripped on the fork so this app cannot push to the source app's EAS
   project). Run `eas init` in the repo root; it writes a new
   `extra.eas.projectId`. Confirm the `owner` field (`opesware`) is the right
   EAS account.
3. **Generate signing material.** `eas credentials` — let EAS manage the
   Android keystore and the iOS distribution certificate + provisioning
   profile. **Back up the Android keystore somewhere you will still have in
   five years; losing it means you can never update the app under this package
   name.**
4. **Register the app in both consoles.** App Store Connect: new app, bundle ID
   `com.opescare.patientid`. Play Console: new app, package
   `com.opescare.patientid`. Then fill `submit.production` in `eas.json` with
   `ascAppId` / `appleTeamId` and the Play service-account JSON path.

   *— everything above this line is owner-only; everything below is ordinary work —*

5. **Fix B1.** Stand up the production API and repoint
   `eas.json → build.production.env.EXPO_PUBLIC_API_BASE_URL`. Verify the host
   is not in demo mode.
6. **Fix B2.** Add the account-deletion endpoint, the Settings row, and the
   public deletion-request URL.
7. **Decide B3.** Implement `/mobile/doctor/*`, or ship patient-only by
   disabling the provider-login fallback in `app/(auth)/login.tsx`.
8. **Decide B4.** Wire FCM/APNs (add `google-services.json`, set
   `android.googleServicesFile`, upload the APNs key, call
   `getExpoPushTokenAsync`) — or remove the notification permission request and
   preference UI.
9. **Publish the legal pages** at stable https URLs from
   `lib/i18n/pending/legal.{en,fr}.json`, and put the privacy URL in both
   consoles.
10. **Merge the pending i18n** — paste `lib/i18n/pending/legal.en.json` and
    `legal.fr.json` into `lib/i18n/locales/{en,fr}.json`, then delete the
    pending files and confirm EN/FR stay 1:1.
11. **Link the legal screens** — add Settings rows to `/legal/privacy` and
    `/legal/terms`, and let unauthenticated users reach them by allowing
    `legal` in the `app/_layout.tsx` guard.
12. **Decide B6** — set `ios.supportsTablet: false`, or produce iPad layouts and
    13″ screenshots.
13. **Remove the two "Soon" rows** from the sign-in screen (B7).
14. **Produce the missing assets** (§5): 512×512 Play icon, 1024×500 feature
    graphic, and both screenshot sets.
15. **Build and test on real hardware.**
    `eas build --profile production --platform all`. Install the resulting
    build and confirm, on a real device: no demo sign-in menu on the login
    screen, the API base URL is the production host, and location and
    notification prompts show the right text.
16. **Fill the privacy questionnaires** using §3 and §4. In App Store Connect,
    reconcile the answers with `ios.privacyManifests` in `app.json` — if you add
    `NSPrivacyCollectedDataTypes` there, it must match the questionnaire
    exactly.
17. **Submit** — `eas submit --profile production --platform all`, or upload
    manually. Expect Apple to ask for the health-data justification; §3 is the
    answer.

---

## 9. What changed in this pass

Only files inside this task's ownership were touched. **Nothing was committed.**

### `app.json`

| Change | Why |
|---|---|
| `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` | The app uses only standard HTTPS, which is exempt. Without this, every single upload stops to ask an export-compliance question. **The owner still owns this legal attestation — confirm it before submitting.** |
| `ios.infoPlist.CFBundleLocalizations: ["en","fr"]` | Expo's documented requirement for `expo-localization` to detect French correctly on iOS, and it makes the App Store list the app as bilingual. |
| `ios.privacyManifests` | Apple has required a privacy manifest since 2024; missing required-reason API declarations produce ITMS-91053 warnings and eventually rejection. Declares `NSPrivacyTracking: false`, empty tracking domains, and the two required-reason APIs every RN/Expo app target uses (UserDefaults `CA92.1`, File Timestamp `C617.1`). `NSPrivacyCollectedDataTypes` was **deliberately left out** — it must match whatever the owner answers in App Store Connect, and a mismatch is worse than an omission. §3 has the content for it. |
| `android.permissions` += `INTERNET`, `POST_NOTIFICATIONS` | They were being merged in from library manifests but not declared. Now the declared list matches what actually ships. |
| `android.blockedPermissions` (new) | Three permissions were being merged into the final manifest from libraries, unjustified and unused. `RECEIVE_BOOT_COMPLETED` (from `expo-notifications`) is only needed to restore *scheduled local* notifications across a reboot — a repo-wide search found no `scheduleNotificationAsync` call anywhere, so it is dead. `READ_/WRITE_EXTERNAL_STORAGE` (from `expo-file-system`, `maxSdkVersion=32`) are unnecessary because `lib/fileDelivery.ts:119` writes only to `documentDirectory ?? cacheDirectory`, which is app-private on every API level. Unjustified permissions are a Play policy problem and an Apple-adjacent trust problem. **Re-add `RECEIVE_BOOT_COMPLETED` if local notification scheduling is ever added.** |
| `description`, `primaryColor` | Listing metadata; `description` was `undefined`. |

**Deliberately not changed:** `ios.supportsTablet` (B6) and
`ACCESS_FINE_LOCATION` (§4) — both are product decisions with user-visible
consequences, not packaging defects.

### `eas.json`

| Change | Why |
|---|---|
| `cli.appVersionSource`: `local` → `remote` | This project has a dynamic config (`app.config.js`). EAS cannot write an auto-incremented `buildNumber`/`versionCode` back through a dynamic config, so `local` + `autoIncrement: true` was an unusable pair. Remote keeps the counters on EAS; `version` in `app.json` stays the marketing version you bump by hand. |
| `build.production.env` += `EXPO_PUBLIC_DEMO_LOGINS=0`, `EXPO_PUBLIC_DOCTOR_PERSONA=0` | **The most important change in this pass.** A plain `.env` is not gitignored and Expo inlines `EXPO_PUBLIC_*` at bundle time, so a developer's stray `.env` could have shipped the demo sign-in menu and the clinician-preview override into a store build. An explicit `0` always wins. |
| `submit` comment | Records that it is empty on purpose, and why. |

### New files

- `app/legal/privacy.tsx`, `app/legal/terms.tsx` — the in-app policy and terms,
  written from the verified data flows in §3. Route-only until someone links
  them (B5).
- `lib/i18n/pending/legal.en.json`, `legal.fr.json` — 76 keys each, verified
  1:1, valid UTF-8, matching `{{placeholders}}`. Kept out of
  `lib/i18n/locales/*.json` because that file is contended this session.
- This document.

### Verification run

| Check | Result |
|---|---|
| `npx tsc --noEmit --ignoreDeprecations 6.0` | **0 errors** |
| `npx expo config --type public` | **Parses; all changes present** |
| EN/FR pending-key parity | **76 / 76, no placeholder or encoding faults** |

Per `AGENT_BRIEF.md`, Expo and the browser were **not** started — many agents
share this machine, so verification here is static only. Nothing in this pass
was visually confirmed on a device.
