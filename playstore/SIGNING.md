# Signing

## The current upload key

EAS generated this keystore on 7 September 2026, the first time it built
`com.opescare.patientid`. Read from the signing block of
`artifacts/OpesCare-1.2.0-build2.apk`.

| | |
| --- | --- |
| **Package** | `com.opescare.patientid` |
| **SHA-256** | `D2:06:FA:AD:F2:16:66:32:26:CC:E0:F4:E3:E2:2C:61:09:26:31:DD:BC:8F:98:58:65:30:69:AD:30:10:48:D8` |
| **SHA-1** | `70:22:40:46:1D:1E:B2:F2:89:35:BF:2B:27:9E:FF:97:89:89:0E:BC` |
| **Signature scheme** | APK Signature Scheme v2 |
| **Certificate DN** | empty — no CN, O or OU |
| **Held by** | EAS (Expo), account `opesware` |

The certificate carries an **empty distinguished name**, which is what EAS
generates by default. There is therefore no keystore "name" to quote anywhere:
its identity is the fingerprint above. If a form asks for the key's alias or
organisation, the honest answer is that it has none.

## Superseded

The previous key belonged to `cloud.opescare.finder` and is **retired**.

| | |
| --- | --- |
| SHA-256 | `16:13:DD:B3:6B:89:C6:92:11:79:00:6F:D8:E7:FF:81:82:C4:4E:1E:81:F0:15:E2:AB:45:98:C0:35:02:60:8F` |

EAS keys credentials on the applicationId, so renaming the package produced a
new keystore automatically. Nothing was published under the old one, so nothing
was lost — but note the consequence: **a build signed with the new key will not
install over one signed with the old key.** Any device still holding a
`cloud.opescare.finder` build must uninstall it; the new package installs
alongside it rather than upgrading it, because to Android they are two
different apps.

## Play App Signing

When you enable Play App Signing, Google generates and holds the **app signing
key** — the one end users' devices verify — and the key above becomes your
**upload key**, which only proves to Play that an upload came from you.

Check the upload certificate fingerprint the Console displays against the
SHA-256 above before you accept it.

## Do not lose this

Download and store the keystore outside Expo:

```bash
eas credentials --platform android
# → select the build profile → Keystore → Download
```

Keep it somewhere that survives losing access to the Expo account. Without an
upload key you cannot publish an update to an existing listing; you would have
to ask Google to reset it, which is a support process with a delay, or publish
a new app under a new package and migrate every user by hand.

Store the downloaded keystore **outside this repository** — `playstore/.gitignore`
excludes `*.keystore` and `*.jks` precisely so an accidental `git add -A`
cannot commit one, but a file that never enters the working tree is safer than
one an ignore rule is protecting.
