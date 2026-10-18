# Exported artefacts

The binaries themselves are on disk here but not in git — see `../README.md`
for why. This file is the record that identifies them, so any row can be
re-fetched or verified.

Every figure below was read from the artefact's own binary
`AndroidManifest.xml` and signing block, not from `app.json`.

---

## OpesCare-1.2.0-build2.apk

| | |
| --- | --- |
| **Built** | 7 September 2026 |
| **EAS build id** | `789c4c11-256d-497f-a599-5e5c55d52341` |
| **Profile** | `demo` — sideloadable APK, points at `finder.opescare.cloud` |
| **Package** | `com.opescare.patientid` |
| **versionName** | `1.2.0` |
| **versionCode** | `2` |
| **minSdk / targetSdk** | 24 / 36 |
| **allowBackup** | `false` |
| **Cleartext traffic** | not permitted — attribute absent, targetSdk 36 |
| **Signature scheme** | v2 |
| **Signing key SHA-256** | `D2:06:FA:AD:F2:16:66:32:26:CC:E0:F4:E3:E2:2C:61:09:26:31:DD:BC:8F:98:58:65:30:69:AD:30:10:48:D8` |
| **Size** | 138,418,343 bytes (132 MB) |
| **SHA-256 of the file** | `e325557b6d5954398a088dfe4f5f3d76a3ade7470a4531d66ba6a94c8e130d32` |
| **EAS URL** | `https://expo.dev/artifacts/eas/_Op9vq5QGSIq3ou43mkru6z0L43g0H2XNobPT8rKVKk.apk` |

**This is a tester build, not the Play upload.** It is an APK from the `demo`
profile, and it talks to the demo backend. Play wants an **AAB** from the
`production` profile, which will not build until it has been told which API it
targets:

```bash
EXPO_PUBLIC_API_BASE_URL=https://…/api eas build --platform android --profile production
# or, to ship against the demo backend on purpose:
OPESCARE_ALLOW_DEMO_BACKEND=1 eas build --platform android --profile production
```

This APK *was* what `https://finder.opescare.cloud/downloads/opescare-finder.apk`
served. As of 8 September 2026 that download is build 5 (1.4.0) — see below.

---

## OpesCare-1.3.0-build3.apk

| | |
| --- | --- |
| **Built** | 7 September 2026, 15:43 UTC |
| **EAS build id** | `40193a65-cfde-4473-b93f-8bff2751abad` (status FINISHED) |
| **Profile** | `demo` |
| **Package** | `com.opescare.patientid` |
| **versionName / versionCode** | `1.3.0` / `3` |
| **Size** | 138,534,735 bytes |
| **SHA-256 of the file** | `0bcbb36bbafa5d69d68d6fee6a85d8ce6c5aebeb743e33c9012cecd601a36a0f` |
| **EAS URL** | `https://expo.dev/artifacts/eas/mvGWOlpV_kMLh3sNRvhuepAx29jIdUQlGykQ1KI-Lmk.apk` |

---

## OpesCare-1.3.1-build4.apk

| | |
| --- | --- |
| **Built** | 7 September 2026, 16:35 UTC |
| **EAS build id** | `a4ad087a-b0ea-45d0-a02c-ecdc496f0380` (status FINISHED) |
| **Profile** | `demo` |
| **Package** | `com.opescare.patientid` |
| **versionName / versionCode** | `1.3.1` / `4` |
| **Size** | 138,543,515 bytes |
| **SHA-256 of the file** | `eb4f60c044607350fda0275599d7956287aefc932e1ae333211d7ccbb58fc8cb` |
| **EAS URL** | `https://expo.dev/artifacts/eas/0NFY1tK0hNHESXFvxQepipIqqcNjNSYwAkrmaK4rwpk.apk` |

This is the file kept on the server as
`downloads/opescare-finder.apk.prev` — the one-move rollback for build 5.

---

## OpesCare-1.4.0-build5.apk  — CURRENT LIVE DOWNLOAD

Verified 8 September 2026. Every value below was read from this binary, not
from `app.json` and not from `expo config --type introspect`.

| | |
| --- | --- |
| **Built** | 7 September 2026, 18:08:53 UTC (`completedAt`) |
| **EAS build id** | `6746b892-3db7-4137-be70-8d5eed348c1f` — status **FINISHED** |
| **Profile** | `demo` — sideloadable APK |
| **Package** | `com.opescare.patientid` |
| **versionName** | `1.4.0` |
| **versionCode** | `5` |
| **minSdk / targetSdk** | 24 / 36 |
| **allowBackup** | `false` |
| **usesCleartextTraffic** | attribute ABSENT (no networkSecurityConfig either) — cleartext denied by the targetSdk-36 default |
| **Signature scheme** | v2 only (APK Signing Block id `0x7109871a`; no v1 `META-INF/*.RSA`, no v3) |
| **API base URL baked into the JS bundle** | `https://finder.opescare.cloud/api` |
| **Size** | 138,656,519 bytes (132 MB) |
| **SHA-256 of the file** | `501b67ba34bafa882dd0c54c9834efe7305b373f812774d2e5d613fa23ebd6ae` |
| **EAS URL** | `https://expo.dev/artifacts/eas/S-_30XdxnXh50vxL-e2udRzH4ouoNh-wynC10eE3OMA.apk` |

The same SHA-256 was computed three times independently — on the EAS artefact
re-downloaded fresh from the URL above, on the copy that had been parked in
`/tmp` on the server, and on this local file — so the byte identity of the
published download to build 5 is proven, not assumed.

**Permissions shipped** (from the binary manifest): `ACCESS_COARSE_LOCATION`,
`ACCESS_FINE_LOCATION`, `CAMERA`, `INTERNET`, `POST_NOTIFICATIONS`, `VIBRATE`,
`ACCESS_NETWORK_STATE`, `USE_BIOMETRIC`, `USE_FINGERPRINT`, `WAKE_LOCK`,
`com.google.android.c2dm.permission.RECEIVE`, the app's own
`DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, the Play install-referrer bind, and
the launcher badge-count permissions the notifee/badge library adds (Samsung,
HTC, Sony, Huawei, Oppo, Apex, Everything).

Commands that produced these figures:

```bash
sha256sum playstore/artifacts/OpesCare-1.4.0-build5.apk
python <scratchpad>/axml.py playstore/artifacts/OpesCare-1.4.0-build5.apk
unzip -p <apk> assets/index.android.bundle | grep -ao 'https://[a-z.]*opescare[a-z./]*' | sort -u
```

---

## Adding a row

After each `eas build`, download the artefact into this directory and record:
build id, profile, package, versionName, versionCode, the signing fingerprint,
the file's SHA-256 and the EAS URL. The URL expires after 30 days; the
fingerprint and checksum do not, and they are what let you prove later which
binary a given row describes.

```bash
sha256sum playstore/artifacts/<file>
```

---

## OpesCare-1.4.0-build6.aab — first Play upload

| | |
| --- | --- |
| **Built** | 18 October 2026 |
| **EAS build id** | `91abad67-0d06-4cc3-bff9-f2289b498bab` |
| **Profile** | `production` — AAB, API `https://finder.opescare.cloud/api` (demo backend, on purpose), no push (Firebase in the next update) |
| **Package / versionName / versionCode** | `com.opescare.patientid` / `1.4.0` / `6` |
| **Commit** | `817c139` |
| **EAS URL** | `https://expo.dev/artifacts/eas/OHaOR1w59py6l8C8IOUxNEpdVULU0qgAWxzVOBKeuc8.aab` |
