# OpesCare Finder — push delivery runbook

**Written:** 2026-09-06 · **App:** `cloud.opescare.finder`, Expo SDK 57 ·
**Server half:** `App\Services\ExpoPushService` in the API repo

This is the list of things only the **owner** can do to turn the app's push
notifications on, in order, with the exact commands. Everything the repository
could do without credentials is already done (see §A at the end for what that
is). Nothing in this document is a credential, and nothing here should ever be
committed — the table in §10 says where each value lives.

**How push works here, in one paragraph.** The app asks Expo's servers for an
`ExponentPushToken[…]` bound to *your* EAS project id, and sends that token to
`POST /api/mobile/push-tokens`. The API sends notifications to
`https://exp.host/--/api/v2/push/send`, naming the token. Expo then delivers
through Firebase Cloud Messaging (Android) or APNs (iOS) using the FCM service
account key and APNs key you upload to EAS **once**. The API host holds no
push secret at all. So the work is: an EAS project, a Firebase project, an
Apple push key, one build per platform, and one test.

---

## 0. Before you start — what you need to have

| You need | Why |
|---|---|
| An **Expo account** that owns the `opesware` organisation (or change `owner` in `app.json`) | The EAS project, the builds, and the uploaded push credentials all live under it. |
| A **Google account** for the Firebase console | Firebase Cloud Messaging is how Android push is delivered. Free. |
| An **Apple Developer Program** membership (team) | APNs keys can only be created by a paid team. Not needed for Android-only testing. |
| `eas-cli` on your machine: `npm install -g eas-cli` | Every command below. `eas --version` must be ≥ 13. |
| Node 20+, this repo cloned, `npm install` done | `npx expo config` must already work. |
| A real Android phone (and an iPhone for iOS) | Simulators cannot receive push. Expo Go on Android cannot either (removed in SDK 53). |

Nothing below is run by an agent. An agent may not create any of these
accounts, log in to `eas`, or paste any of these values anywhere.

---

## 1. Log in to EAS

```bash
cd C:\laragon\www\opescare-finder-mobile
eas login
eas whoami        # must print your username; `opesware` must be an org you belong to
```

---

## 2. Create the EAS project and set `EAS_PROJECT_ID`

`app.json` deliberately has **no** `extra.eas.projectId` — the fork must never
build against the source app's project. `app.config.js` reads the id from the
`EAS_PROJECT_ID` environment variable instead.

```bash
eas init
```

- It asks which account should own the project — pick `opesware` (must match
  `owner` in `app.json`).
- Because this project has a dynamic config (`app.config.js`) it will say it
  **cannot write the id into the config** and print it instead. That is
  expected. Copy the UUID (shape `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

Now put it in the two places it must be:

**a) Locally** — create `.env` (gitignored) from the template and fill the id:

```bash
copy .env.example .env
# then edit .env:  EAS_PROJECT_ID=<the UUID eas init printed>
```

**b) On EAS**, one copy per environment, because an EAS build worker does not
have your `.env`:

```bash
eas env:create --scope project --name EAS_PROJECT_ID --value <the UUID> --visibility plaintext --environment development
eas env:create --scope project --name EAS_PROJECT_ID --value <the UUID> --visibility plaintext --environment preview
eas env:create --scope project --name EAS_PROJECT_ID --value <the UUID> --visibility plaintext --environment production
eas env:list --environment preview       # confirm
```

**Check** — the id must now resolve, and the fork's "removed on fork" comment
must be gone:

```bash
npx expo config --type public | findstr /i projectId
```

If you see `[app.config.js] EAS_PROJECT_ID is "…", which is not an EAS project
id`, you pasted something that is not the UUID. The config refuses on purpose;
there is no placeholder that "works".

> If `eas build` later says *"EAS project not configured"* even though `.env`
> has the id, your `eas-cli` did not load `.env` — set it in the shell for that
> command: `set EAS_PROJECT_ID=<the UUID>` (cmd) or
> `$env:EAS_PROJECT_ID="<the UUID>"` (PowerShell), then rerun.

---

## 3. Firebase project, `google-services.json`, and the FCM V1 service account (Android)

### 3.1 Create the Firebase project and the Android app

1. <https://console.firebase.google.com> → **Add project** (e.g. "OpesCare
   Finder"). Analytics can stay off.
2. In the project: **Add app → Android**. Package name **exactly**
   `cloud.opescare.finder` (this must match `android.package` in `app.json`,
   or every push fails with `MismatchSenderId`). Nickname anything. SHA-1 is
   not needed for push.
3. **Download `google-services.json`.** Save it **outside the repo**, e.g.
   `C:\opescare-secrets\google-services.json`. (If you put it in the repo
   root, `.gitignore` already ignores that filename — but outside is safer.)

### 3.2 Point the build at it

**Locally** — in `.env`:

```
GOOGLE_SERVICES_JSON=C:/opescare-secrets/google-services.json
```

**On EAS** — as a *file* environment variable, so the worker gets the file and
`app.config.js` gets the path:

```bash
eas env:create --scope project --name GOOGLE_SERVICES_JSON --type file --value C:/opescare-secrets/google-services.json --visibility secret --environment development
eas env:create --scope project --name GOOGLE_SERVICES_JSON --type file --value C:/opescare-secrets/google-services.json --visibility secret --environment preview
eas env:create --scope project --name GOOGLE_SERVICES_JSON --type file --value C:/opescare-secrets/google-services.json --visibility secret --environment production
```

**Check:**

```bash
npx expo config --type public | findstr /i googleServicesFile
```

If the path is wrong the config refuses with `GOOGLE_SERVICES_JSON points to
"…" but no file exists there` — fix the path, do not create an empty file.

### 3.3 Create the FCM V1 service-account key and upload it to EAS

This is the secret that lets Expo send through your Firebase project. It is
**not** `google-services.json`.

1. Firebase console → ⚙ **Project settings → Cloud Messaging**: confirm
   **Firebase Cloud Messaging API (V1)** is *Enabled* (it is, on new projects;
   the legacy API is what must NOT be used).
2. **Project settings → Service accounts → Generate new private key →
   Generate key.** A JSON file downloads (name like
   `opescare-finder-firebase-adminsdk-….json`). Save it next to the other
   file, outside the repo. Treat it like a password.
3. Upload it to EAS:

```bash
eas credentials --platform android
```

   Choose the build profile (`preview` first; repeat for `production`), then
   **Google Service Account → Manage your Google Service Account Key for Push
   Notifications (FCM V1) → Set up a Google Service Account Key for Push
   Notifications (FCM V1)**, and give it the path to the JSON you just
   downloaded. EAS stores it; you can now delete the local copy or keep it in
   a password manager.

---

## 4. Apple push key (iOS)

Skip this section until you build for iOS.

```bash
eas credentials --platform ios
```

1. Sign in with the Apple ID of the developer **team** when asked.
2. Pick the profile (`preview`). Let EAS **create the distribution certificate
   and provisioning profile** if it offers to — push capability is added to
   the app id automatically.
3. **Push Notifications: Manage your Apple Push Notifications Key → Set up a
   new push key.** EAS creates an APNs `.p8` key on your team and keeps it.
   (If your team already has a push key you want to reuse, choose *upload*
   and give the `.p8`, its Key ID and the Team ID instead. A team may hold at
   most two push keys — if creation fails with a limit error, reuse one.)

For an ad-hoc `preview` build every test iPhone must be registered first:

```bash
eas device:create      # opens a URL/QR — open it ON the iPhone and install the profile
```

then regenerate the provisioning profile (`eas credentials --platform ios` →
the profile → *Build Credentials → Provisioning Profile → regenerate*), or
simply run the build — EAS offers to add the new device.

---

## 5. (Optional) development client

The `development` profile in `eas.json` builds a dev client so you can test
push against Metro. It needs one package that is not installed yet:

```bash
npx expo install expo-dev-client
```

Commit that change. If you only want to prove delivery, skip this and use
`preview` (§6) — it is a normal release-style APK/IPA and is what this runbook
verifies with.

---

## 6. Build

Android first — it needs no Apple account:

```bash
eas build --profile preview --platform android
```

If the build **fails within seconds** with a `[app.config.js] …` message, read
it: it is one of the checks from §2/§3 (missing `EAS_PROJECT_ID` or
`GOOGLE_SERVICES_JSON` on that environment). That is the config refusing to
produce an APK that could never receive a push. Fix the variable and rerun.

When it finishes, install the APK on the phone (QR code / link from the build
page). Do not use `eas build:run` here — it targets emulators, which cannot
receive push.

Then iOS:

```bash
eas build --profile preview --platform ios
```

Install from the build page link on the registered iPhone.

---

## 7. On the phone: sign in and allow notifications

1. Open the app and sign in. Preview builds have the demo sign-in menu on
   (`EXPO_PUBLIC_DEMO_LOGINS=1`); pick a seeded demo patient (accounts in
   project memory / `docs/STORE_SUBMISSION.md` §7.1).
2. The first-run **permissions** screen offers "Turn on notifications". On a
   correctly configured build the row is **pressable** and the badge does
   **not** say "In-app only". Tap it and **Allow**.
   - If the badge still says *In-app only* on a real device, the build has no
     project id (§2 — check the EAS variable for *that* environment) or it is
     Expo Go on Android. The app never asks for the OS permission on such a
     build; that is intentional.
3. Or later: **Settings → This device → Push notifications** switch. Turn it
   on. The switch must end **on**, with no red notice underneath.
   - A red *"could not register"* notice means Expo's server refused the token
     request — see §11.

---

## 8. Verify the token row on the server

On the API host (`finder.opescare.cloud`), find the patient's row. Replace the
Health ID with the one shown on the patient's Health ID card:

```sql
SELECT t.platform,
       LEFT(t.push_token, 24) || '…' AS push_token_prefix,
       t.is_active, t.revoked_at, t.registered_at, t.updated_at
FROM   push_device_tokens t
JOIN   patients p ON p.id = t.patient_id
WHERE  p.health_id = 'OPC-XXXX-XXXX'
ORDER  BY t.updated_at DESC;
```

**Pass:** `push_token_prefix` starts with `ExponentPushToken[` (or
`ExpoPushToken[`), `is_active = true`, `revoked_at IS NULL`.

**Fail:** the row's `push_token` is a string like `android-…-…` — that is the
old device-fingerprint registration from before this work. Turn the Settings
switch off and on again; the row is keyed on (patient, fingerprint, platform)
so the real token overwrites it in place.

---

## 9. Server side: enable, test, send

### 9.1 Configuration on the API host

The API needs **no secret** to send. Two `.env` keys exist (`config/push_channels.php`):

| Key | Default | Set it when |
|---|---|---|
| `EXPO_PUSH_ENABLED` | `true` | You want to silence every patient push (`false`). Leave unset. |
| `EXPO_ACCESS_TOKEN` | unset | **Only** if you turn on *Enhanced push security* for the project on expo.dev (project → *Settings* → *Push notifications*). Then create a token at expo.dev → account → *Access tokens* and put it here. Without enhanced security this must stay unset. |

After any `.env` change: `php artisan config:cache` (the app reads these
through `config()`, never `env()` at runtime).

### 9.2 Send a test from the API (the real path)

A test command is being added to the API by another change:

```bash
php artisan opescare:push-test OPC-XXXX-XXXX
```

It goes through `ExpoPushService::sendToPatient()` exactly as a real consent
request or lab result would, and prints Expo's ticket per device. Expect
`status: ok` and the phone to ring with the consent chime within a few
seconds. (Until that command lands, use 9.3.)

### 9.3 Send a test straight to Expo (bypasses the API)

Copy the full `push_token` from the SQL row (not the prefix), then either:

**a) Expo's push tool** — <https://expo.dev/notifications>: paste the token,
fill title/body, and under *Advanced* set `channelId` = `consent`, `sound` =
`opescare_consent.wav`, `priority` = `high`, and data
`{"type":"consent_request"}`. Send.

**b) curl** — the same payload the API sends:

```bash
curl -sS -X POST https://exp.host/--/api/v2/push/send ^
  -H "Content-Type: application/json" ^
  -d "{\"to\":\"ExponentPushToken[PASTE]\",\"title\":\"OpesCare\",\"body\":\"A clinic is asking to see your record.\",\"sound\":\"opescare_consent.wav\",\"channelId\":\"consent\",\"priority\":\"high\",\"data\":{\"type\":\"consent_request\"}}"
```

(Add `-H "Authorization: Bearer <EXPO_ACCESS_TOKEN>"` only if enhanced push
security is on.) The reply is a *ticket*: `{"data":[{"status":"ok","id":"…"}]}`.
A ticket only says Expo accepted it. To see whether FCM/APNs delivered, fetch
the *receipt* ~15 s later with the ticket id:

```bash
curl -sS -X POST https://exp.host/--/api/v2/push/getReceipts ^
  -H "Content-Type: application/json" ^
  -d "{\"ids\":[\"PASTE-TICKET-ID\"]}"
```

`{"data":{"<id>":{"status":"ok"}}}` is delivered. Anything else: §11.

> `npx expo push:send` no longer exists in the Expo CLI shipped with SDK 57 —
> older guides mention it; use the tool or curl above.

**What "working" looks like on the phone:** the notification appears with the
OpesCare icon, plays the hospital chime (not the default tone), and tapping it
opens Privacy & data with the pending request. In the foreground it shows as a
banner with the same sound.

---

## 10. Every secret: what it is for, where it lives, never commit it

| Value | What it is for | Secret? | Lives in | Never |
|---|---|---|---|---|
| `EAS_PROJECT_ID` | Tells Expo which project a token/build belongs to | No, but owner-specific | Local `.env`; EAS env var ×3 environments | Never the source app's id; never in `app.json` on this fork |
| `google-services.json` | Firebase config compiled into the APK; the FCM *client* half | Semi (it is inside every APK, but keep it out of git) | Outside the repo; EAS **file** env var `GOOGLE_SERVICES_JSON` ×3 | Never committed (gitignored by name) |
| FCM V1 service-account JSON | Lets Expo's servers send through your Firebase project | **Yes** | Uploaded once via `eas credentials --platform android`; original in a password manager | Never on the API host; never in the repo (gitignored `*-firebase-adminsdk-*.json`) |
| APNs key (`.p8`, Key ID, Team ID) | Lets Expo's servers send through Apple | **Yes** | Created/kept by EAS via `eas credentials --platform ios` | Never in the repo (gitignored `*.p8`) |
| Android keystore, iOS dist cert + profile | Sign the binaries | **Yes** | Managed by EAS; back up the keystore | Losing the keystore = can never update the app |
| `EXPO_ACCESS_TOKEN` | Authorises sends when enhanced push security is on | **Yes** | API host `.env` only, then `config:cache` | Never in the mobile repo; not needed otherwise |
| Demo account passwords | Testing only | Yes (weak) | Project memory / server seeder | Never in review notes for the stores |

`git diff` before every commit; the repo's `.gitignore` refuses `.env`,
`google-services.json`, `GoogleService-Info.plist`, `*-firebase-adminsdk-*.json`,
`*service-account*.json`, `*.p8`, `*.jks`, `*.p12`, `*.key`. Do not add
exceptions.

---

## 11. Troubleshooting

| Symptom | Meaning | Fix |
|---|---|---|
| App: badge says **In-app only** / switch cannot be turned on, on a real device | The build has no project id, or it is Expo Go on Android. The app refuses to ask for a permission it cannot act on. | Check `eas env:list --environment preview` shows `EAS_PROJECT_ID`; rebuild. On Android use a built APK, not Expo Go. In a dev build the console prints the exact reason as `[push] not deliverable in this build: …`. |
| App: red **"could not register"** after Allow (dev console: `[push] token request failed (ERR_NOTIFICATIONS_SERVER_ERROR)`) | Expo's server rejected the token request. Nearly always: the project id in the build is not a project you own, or the app id does not match the project. | Confirm `eas whoami` owns the project; confirm `npx expo config --type public` shows the same id that `eas project:info` shows; rebuild. |
| App: `… (ERR_NOTIFICATIONS_NETWORK_ERROR)` | Phone is offline or exp.host is blocked. | Retry from Settings on Wi-Fi. |
| App (Android): token request throws *"Default FirebaseApp is not initialized"* | The APK has no `google-services.json`. | `GOOGLE_SERVICES_JSON` was not set for that environment — `app.config.js` should have refused; if you set `OPESCARE_BUILD_WITHOUT_PUSH=1`, that is why. Rebuild with the file. |
| Ticket **ok**, receipt **`InvalidCredentials`** (Android) | Expo has no FCM V1 key for this project/profile, or the key is for a different Firebase project. | §3.3 again for the profile you built with (`preview` and `production` are separate). |
| Ticket **ok**, receipt **`InvalidCredentials`** (iOS) | No APNs key uploaded, key revoked, or the provisioning profile lacks push. | §4; regenerate the profile after adding the key. |
| Receipt **`MismatchSenderId`** | The `google-services.json` in the APK belongs to a different Firebase project than the service-account key uploaded to EAS. | Both must come from the same Firebase project. Re-download `google-services.json` from the project whose key you uploaded, update the file env var, rebuild. |
| Ticket/receipt **`DeviceNotRegistered`** | The token is dead: app uninstalled, or it was minted under a different project id than the one being sent for, or Expo already told us so once. | Delete/revoke the row (`UPDATE push_device_tokens SET is_active=false, revoked_at=now() WHERE id='…'`) and re-enable the switch in the app. The API marks these inactive automatically on receipt. |
| **`MessageTooBig`** | Payload > 4 KB. | `data` must carry ids only, never content. |
| **`MessageRateExceeded`** | Too many to one device. | Back off; the API chunks at 100 per request already. |
| Android: notification arrives with the **default tone**, not the chime | The channel was created on the phone **before** the sound file existed in the APK (Android freezes a channel's sound at creation), or `channelId`/`sound` names differ between server and app. | **Uninstall and reinstall** the app (channels are per-install; a reinstall recreates them with the sound). Names must match `lib/push/channels.ts` ↔ `config/push_channels.php` — they do today. |
| Android: **no notification at all** while the app is open | Foreground handler not set. The app sets it at session start (`startPushListeners`). | Make sure you are signed in; a push to a signed-out app is deliberately not shown. |
| iOS: arrives silently | `sound` in the payload must be the bundled filename, e.g. `opescare_consent.wav`; the mute switch also silences it. | Send with `sound` set; flip the ring switch. |
| iOS: tapping opens the app but not the screen | `data.type` missing or unknown. | The API always sets it; for a manual send include `{"type":"…"}`. |
| Row in `push_device_tokens` still shows a fingerprint | Pre-existing registration from the old app. | Toggle the switch off/on (§8). |
| `eas build` fails in seconds with `[app.config.js] …` | One of the fail-loud checks. | Read the message; it names the variable and the runbook step. |
| `eas build --profile development` fails: dev client not installed | §5 not done. | `npx expo install expo-dev-client`. |

---

## 12. Done when

- [ ] `npx expo config --type public` shows `extra.eas.projectId` = your UUID and `android.googleServicesFile` = a real path (locally).
- [ ] `eas env:list` shows both variables in `development`, `preview`, `production`.
- [ ] `eas credentials --platform android` shows an FCM V1 key for `preview` and `production`.
- [ ] `eas credentials --platform ios` shows a push key.
- [ ] `preview` APK installed; Settings switch turns **on** with no notice.
- [ ] §8 SQL shows an `ExponentPushToken[` row, active.
- [ ] `php artisan opescare:push-test <health_id>` (or the curl) → ticket `ok` → receipt `ok` → phone rang with the chime and the tap opened the right screen.
- [ ] Same on iPhone.
- [ ] `git status` clean of anything from §10.

---

## A. What the repository already does (no credentials needed)

Reference for whoever maintains this; nothing here needs the owner.

- **`app.config.js`** — `extra.eas.projectId` from `EAS_PROJECT_ID`
  (validated: must be a UUID, never the nil UUID; a literal in `app.json`
  is honoured but goes through the same validation, env wins);
  `android.googleServicesFile` from `GOOGLE_SERVICES_JSON` (file must exist).
  On an EAS build worker (`EAS_BUILD=true`) it **refuses** to build without
  the id, and refuses an Android build without the Google file unless
  `OPESCARE_BUILD_WITHOUT_PUSH=1` (the `local-api` profile sets that — it
  is a LAN API-testing build, not a push build).
- **`app.json`** — `ios.bundleIdentifier` / `android.package` =
  `cloud.opescare.finder` (unchanged; the Firebase Android app and the App
  Store record must use exactly this); `ios.infoPlist.UIBackgroundModes`
  includes `remote-notification`; `android.permissions` includes
  `POST_NOTIFICATIONS`; the `expo-notifications` plugin carries the icon,
  the brand colour and the five sounds. `npx expo prebuild --platform
  android` was run without any credential to prove it: the five WAVs land in
  `android/app/src/main/res/raw/` with the basenames `lib/push/channels.ts`
  uses, and the manifest carries the notification icon/colour meta-data.
  `android/` and `ios/` are gitignored and are never committed.
- **`eas.json`** — `development` (dev client, internal), `preview`
  (internal APK / ad-hoc IPA, demo logins on), `production` (store, demo
  logins pinned off), `local-api`. API base URL pinned to
  `https://finder.opescare.cloud/api` for preview/production. **That host is a
  demo server** — see `docs/STORE_SUBMISSION.md` B1 before any store build.
- **`lib/push/capability.ts`** — the four gates that decide whether this
  build can receive push (web → native module present → not Expo Go on
  Android → project id present). Below any gate the app never asks for the
  OS permission and the copy says "In-app only"; above all of them the same
  code registers a real token. No edit is needed when credentials arrive.
- **`lib/push/token.ts`** — `getExpoPushTokenAsync({ projectId })`, the
  `ExponentPushToken[…]` gate before anything is sent to the API, and a
  dev-console line with expo-notifications' error code when the mint fails.
- **`lib/push/channels.ts`** — six Android channels (`consent`, `messages`,
  `results`, `appointments`, `emergency`, `default`), one sound each, MAX
  importance for consent/emergency, private lock-screen visibility, created
  at session start. Mirrored by `config/push_channels.php` on the API.
- **Wire contract** (both sides agree today):
  `{to, title, body, sound: "<file>.wav", channelId, priority: "high", data: {type, <id>, action_url}}`.
  `title`/`body` never carry clinical content — a lock screen is public.
