# Permissions — what ships, and why

Read from the binary `AndroidManifest.xml` of the built artefact, not from
`app.json`. Those two disagree more often than people expect: `blockedPermissions`
only takes effect at prebuild, and a library can contribute a permission the
config never mentions.

## No Permissions Declaration Form is needed

The app requests **no restricted permission**. No SMS, no call log, no
`MANAGE_EXTERNAL_STORAGE`, no `ACCESS_BACKGROUND_LOCATION`, no
`AD_ID`, no accessibility service, no `QUERY_ALL_PACKAGES`. Nothing here
triggers Play's declaration flow or a sensitive-permission review.

## Requested, and why

| Permission | Why it is there |
| --- | --- |
| `ACCESS_FINE_LOCATION`<br>`ACCESS_COARSE_LOCATION` | Sorting the Care Map and the blood finder by distance. Foreground only, requested on tap; the coordinates go with a "near me" search and are not stored — see `data-safety.md`, note 2. |
| `CAMERA` | Taking the portrait for the Health ID card, and the clinician QR scanner that reads a patient's credential. |
| `POST_NOTIFICATIONS` | Consent requests, laboratory results, appointment reminders. |
| `USE_BIOMETRIC`<br>`USE_FINGERPRINT` | Unlocking the app and Presentation Mode without retyping a PIN in front of whoever is asking to see the card. |
| `INTERNET`<br>`ACCESS_NETWORK_STATE` | The API, and telling "you are offline" apart from "the server refused" — which the app is careful never to conflate. |
| `VIBRATE`<br>`WAKE_LOCK`<br>`com.google.android.c2dm.permission.RECEIVE` | Push delivery, and the consent alert, which sounds three times and repeats until it is answered. |
| `BIND_GET_INSTALL_REFERRER_SERVICE` | Contributed by the Expo/Play install-referrer library. Not used by this app's own code. |
| OEM launcher badge permissions<br>*(Samsung, HTC, Huawei, Oppo, Sony, Nova…)* | Contributed by `expo-notifications` so an unread count can appear on the launcher icon. Not requested by this app's own code, and harmless — each is a permission defined by that launcher, not by Android. |

## Deliberately removed

Blocked in `app.json` under `blockedPermissions`, and confirmed **absent** from
the shipped manifest:

| Permission | Why it is not there |
| --- | --- |
| `RECORD_AUDIO` | Pulled in transitively by an Expo module the app does not use for audio. A health application asking for the microphone is a question you do not want to be answering in review, and it would have been a lie. |
| `READ_EXTERNAL_STORAGE`<br>`WRITE_EXTERNAL_STORAGE` | Documents are written through the system share sheet and the scoped-storage APIs; broad storage access buys nothing and costs a permission prompt. |
| `SYSTEM_ALERT_WINDOW` | Draw-over-other-apps. Never used, and a serious-looking permission on a medical app. |
| `RECEIVE_BOOT_COMPLETED` | The app does no work at boot. |

## Data-handling attributes in the manifest

| Attribute | Value | Why |
| --- | --- | --- |
| `android:allowBackup` | `false` | Android Auto Backup would copy app data to the user's Google Drive. Everything persisted is `expo-secure-store` ciphertext whose Keystore key is device-bound and never backed up — so a restore would hand the app data it cannot read, and would put a health app's storage in a consumer cloud backup for no benefit. |
| `usesCleartextTraffic` | absent | HTTPS only. Set solely by the `local-api` development profile. |
| `targetSdkVersion` | `36` | Above Play's floor of 35. |
| `minSdkVersion` | `24` | Android 7.0 and up. |
