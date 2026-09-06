# OpesCare Finder — demo tester guide

This is the **demo** build. It talks to `finder.opescare.cloud`, which is a
demonstration server holding demonstration records. Nothing you do in it
affects a real patient, and nothing in it is a real credential.

## Installing it

1. Open the build link on the phone and download the `.apk`.
2. Android will warn that the file came from outside the Play Store. Allow
   installing from that browser when it asks — this build is distributed
   directly, not through the store.
3. Install, open.

The build is signed with the project's own key. If you already have an older
OpesCare Finder installed and the signature differs, uninstall the old one
first.

## Signing in

Tap **Try the demo** on the sign-in screen. The build ships a demo menu, so you
pick a role rather than being handed credentials:

| Role | What it is for |
|---|---|
| Patient | The main account. Health ID, passport, documents, appointments. |
| Verified reviewer | A patient whose identity has been verified — the credential reads differently. |
| Guardian | Holds links to two children; can switch to a child's record. |
| Grandmother | Read-only: shows what a link that may look but not act can and cannot do. |
| Doctor | Clinician side: patient lookup, chart, prescribing, referrals. |
| Nurse, Pharmacist, Lab technician, Receptionist | Each sees only their own desk. |

If you would rather sign in by hand, every demo account is
`demo.<role>@opescare.test` with the password `demo1234`.

## What is worth trying

**The Health ID.** The card on the patient's home screen. Tap through to
presentation mode — the code it shows is short-lived and dies on a countdown,
which is deliberate.

**The Health Passport.** Thirty pages of the patient's own record. Twenty-two of
them carry records on the demo account; eight are empty. **The empty ones are
not broken.** Six of them are domains this deployment records nowhere, and they
keep their page numbers and say plainly that nothing is recorded. A passport
that filled its empty pages with plausible content would be dangerous.

**Downloading documents.** Patient → Documents. Lab reports, prescriptions,
immunisation records, discharge summaries and certificates all download as PDFs.
Each is generated at the moment you tap Download, from the record as it stands —
nothing is stored on a server waiting to go stale.

**Consent, from both sides.** Sign in as the doctor and open two different
demo patients. One has granted the hospital consent and their record opens in
full. The other has not: you see their identity, allergies and current medicines
— the things that stop a clinician harming them — and the chart offers to ask
for the rest. Then sign in as that patient and watch the request arrive.

**Switching to a dependent.** As the guardian, switch to a child. As the
grandmother, notice what is refused.

## What this build deliberately cannot do

- **No push notifications.** This profile is built without the Firebase
  credentials, so nothing arrives while the app is closed. In-app notifications
  and the notification centre work normally. A push-capable build needs the
  `preview` profile once those credentials exist.
- **No real payments.** Payment screens run against the demo server.
- **No store updates.** This APK does not auto-update; a new build means a new
  link.

## Reporting something

Say which role you were signed in as, which screen, and what you expected. A
screenshot is worth more than a description. If a screen says nothing is
recorded, that may well be correct — say what you expected to see there and we
will tell you which it is.
