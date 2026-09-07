# Data Safety form — prepared answers

Every row below was read out of the code, not recalled: the registration
validation rules in `MobileAuthController::register()`, the query modules under
`lib/api/`, the storage layer in `lib/offline/storage.ts`, and the binary
manifest of the shipped build.

> **This is a legal declaration about a health application.** Confirm each row
> against how you actually operate before submitting. Two rows are flagged as
> judgement calls rather than facts.

## Collected vs accessed

Play separates data that **leaves the device** (collected) from data the app
**uses on the device** (accessed). The distinction does real work here — see
Location.

| Play category | Collected | Shared | Purpose | What, exactly |
| --- | --- | --- | --- | --- |
| **Personal info** — name, email, phone, other | Yes | No | Account management, app functionality | Registration requires first name, last name, date of birth, sex, phone, and an emergency contact (name, relationship, phone). Email is optional. Required, because the account *is* the Health ID. |
| **Health and fitness** — health info | Yes | No | App functionality | The purpose of the app: consultations, prescriptions, laboratory results, allergies, vital signs, immunisations, appointments. Released to a facility only under a consent grant. |
| **Photos** | Yes, optional | No | App functionality | One profile photo for the Health ID card, chosen by the patient. Stored privately, served through signed URLs. |
| **Financial info** — see note 1 | Yes | No | App functionality | Paying sends the mobile-money number (`msisdn`), the method and a whole-franc amount to the OpesCare API. |
| **Location** — approximate and precise | **No** | No | — | **Accessed, never collected.** See note 2. |
| **Messages** | Yes | No | App functionality | In-app messages between a patient and their care team. |
| **Device or other IDs** | Yes | Yes — see note 3 | App functionality | A device fingerprint and a push token, to deliver notifications. |
| **App activity, crash logs, diagnostics** | **No** | No | — | No analytics or crash SDK is bundled. No Firebase Analytics, no Sentry, no advertising ID. Verified in `package.json`. |

### Note 1 — the financial row is a judgement call

Paying an invoice sends the payer's **mobile-money number** to the OpesCare
API, which then talks to MTN MoMo or Orange Money server-side. No card number,
CVV or bank detail ever reaches the app.

Whether Play files an MSISDN under *Payment info* or under *Personal info →
phone number* is a question about your payment flow, not about the code.
Decide it explicitly; do not let it default.

### Note 2 — location is accessed, never collected

This is worth stating precisely because the permission list suggests otherwise.

The Care Map and the blood finder read the device's coordinates on tap, and the
coordinates **never leave the device**. The directory endpoint takes only `q`,
`type` and `city`; distance and "sort by nearest" are computed client-side
(`app/care-map.tsx`, `app/blood-finder.tsx`, `lib/api/careMapQueries.ts`).

Declare Location as **accessed but not collected**. It is accurate and it is
verifiable if anyone asks.

### Note 3 — push is a genuine third-party transfer

Notification titles and bodies necessarily pass through Google's Firebase Cloud
Messaging and Expo's push service in order to be delivered, and some of those
titles name a health event ("Lab result ready", "A doctor is asking to see your
record"). That is data sharing with a third party and should be declared as
such. It is the **only** third-party transfer the app makes.

## Security practices

| Question | Answer | Basis |
| --- | --- | --- |
| Is data encrypted in transit? | **Yes** | HTTPS only. Neither `usesCleartextTraffic` nor a `networkSecurityConfig` appears in the shipped manifest, and targetSdk 36 forbids cleartext by default. It is set only by the `local-api` development profile. |
| Can users request that data be deleted? | **Yes** | In-app (`/mobile/account/deletion`), and at the public page `https://finder.opescare.cloud/account-deletion`, whose heading reads "Delete your OpesCare account". That URL is the one Play wants. |
| Is data encrypted on the device? | **Yes** | Everything persisted goes through `expo-secure-store`: AES-256-GCM under a hardware-backed Android Keystore key. There is no `AsyncStorage` in the codebase and no query-cache persister. |
| Committed to the Play Families policy? | **No** | The app has guardian and family links, but it is not directed at children. Answer yes only if you deliberately target under-13s. |
| Independent security review? | Your call | Nothing here claims one. |

## Account and data deletion — what actually happens

The in-app request is a **scheduled** deletion, not an instant purge, and the
patient can cancel it (`POST /mobile/account/deletion/cancel`). If Play asks
you to describe the flow, describe that: a request, a window in which it can be
withdrawn, then execution by
`opescare:execute-account-deletions`, which runs daily.

Clinical events are immutable by design — they are amended, voided or marked
entered-in-error, never hard-deleted. Where a record must be retained for
medical-records law, say so in the privacy policy rather than implying total
erasure.
