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

This APK is also what `https://finder.opescare.cloud/downloads/opescare-finder.apk`
serves, so demo testers install exactly this file.

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
