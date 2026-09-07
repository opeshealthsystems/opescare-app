# playstore/

Everything needed to put **OpesCare** on Google Play, in one folder.

```
playstore/
├── README.md              you are here
├── SIGNING.md             the upload key, and why it must not be lost
├── artifacts/
│   ├── MANIFEST.md        what was exported, from which build, with checksums
│   └── *.apk / *.aab      the binaries (on disk; not in git — see below)
├── listing/
│   ├── store-listing-en.md    title, short + full description, English
│   ├── store-listing-fr.md    the same, French
│   ├── release-notes.md       "What's new", both languages, 500-char limit
│   ├── data-safety.md         every answer the Data Safety form asks for
│   └── permissions.md         why each manifest permission is there
└── graphics/
    └── README.md          the assets Play requires, at the exact sizes
```

## The binaries are here on disk but not in git

`playstore/.gitignore` excludes `*.apk`, `*.aab` and any keystore. That is
deliberate, not an oversight.

One APK is about 132 MB. Committing one per release grows this repository by
that much **permanently** — git history cannot be slimmed afterwards without
rewriting every commit that follows, which breaks every clone. The artefacts
are reproducible from a tagged commit with one `eas build`, and EAS keeps each
one at a stable URL for 30 days. `artifacts/MANIFEST.md` records the build id,
the URL and the SHA-256 of every artefact exported here, so any of them can be
identified and re-fetched.

What *is* committed is the material that cannot be regenerated: the listing
copy, the Data Safety answers, the permission justifications and the signing
facts.

## Exporting a build here

```bash
# 1. Build. Production makes the AAB Play wants; demo makes a sideloadable APK.
eas build --platform android --profile production

# 2. Download the artefact into artifacts/ and record it.
#    Then add a row to artifacts/MANIFEST.md: build id, version, versionCode,
#    package, SHA-256, and the EAS URL.
```

A production build **refuses to run** unless it has been told which API it
talks to — see `app.config.js`. That is intentional: the only backend that
exists today runs in demo mode, and a store release must not inherit it by
accident. Set `EXPO_PUBLIC_API_BASE_URL`, or set
`OPESCARE_ALLOW_DEMO_BACKEND=1` to say the demo backend is what you mean.

## Before the first upload

The package name **`com.opescare.patientid`** becomes permanent the moment
anything is uploaded to Play. It is free to change until then and impossible
afterwards. Nothing about it touches DNS — it is a uniqueness convention, not
an address.

The remaining steps are all in the Play Console and none of them can be done
from this repository. They are listed, in order, in `listing/data-safety.md`
and in the submission checklist that accompanies this folder.
