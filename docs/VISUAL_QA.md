# Visual QA — narrow phones, EN + FR (2026-10-19)

Static web export (`npx expo export --platform web`) served at
`http://127.0.0.1:8090/finder/*` against the local backend, captured headless at
**360×640 and 320×568** (deviceScaleFactor 1, full scroll height up to 3200px).

## Coverage

| Account | Routes captured |
|---|---|
| demo.reviewer (patient, EN) | 47 static routes + 6 detail routes (lab, lab report, prescription, message thread, family member, invoice) |
| demo.reviewer (patient, FR) | 23 routes (home, Health ID, booking, blood finder/donors/donor, labs + detail, prescription, notifications, family, doctors, pharmacy, settings, profile, records, privacy, payments, help, care plans, documents, messages) |
| demo.guardian | home, family |
| demo.doctor | 12 clinician routes (home, patients, schedule, requests, results, messages, prescribe, profile, break-glass, request-access, scan, appointments) |
| demo.pharmacist / labtech / receptionist / nurse | home + their desk (pharmacy, stock, lab, desk, new appointment, register patient) |

That is about 100 distinct screens and 200 captures per viewport pass, plus re-captures after each fix batch.

## Defects fixed

Before/after crops are in `docs/visual-qa/<name>-before.webp` / `-after.webp`.

| # | Screen | Defect | Fix | Shots |
|---|---|---|---|---|
| 1 | Every screen with a header action (Appointments, Notifications, Become a donor…) | At 320–379dp the 24px title broke mid-word: "Appointm / ents", "Notificatio / ns" | `ScreenHeader`: title steps down to the `lg` size below 380dp | `appointments-header` |
| 2 | Health ID | Trust chip squeezed the title into "Health / ID" (360) and "Heal / th ID" (320) | Below 400dp the chip shows only the shield icon | `health-id-header` |
| 3 | Notifications, doctors, labs, family, every `ListRow` with a trailing badge/value | The badge or date beside the title cut it to one or two words per line ("Appoint / ment …", "Demo / Grand…", "Lipid / Panel") | `ListRow`: below 380dp the trailing content moves under the text and only the chevron stays on the right | `notifications-rows`, `doctors-rows` |
| 4 | Find Provider, clinician profile | Raw facility-type codes shown as is: `eye_clinic`, `maternity`, `pharmacy`, `hospital` | Added `careMap.types.{eye_clinic,maternity,nursing_home,physiotherapy,dialysis}` in EN/FR; clinician profile now goes through `careMap.types` | `doctors-rows`, `clinician-profile-facility` |
| 5 | Blood Finder | Hero title "Blood Fin…"; side-by-side fields cut to "Compone…" / "Wh ole…"; urgency chips cut to "Emerge…"; four-up tiles broke to "Emerge / ncy request", "Blood educati / on" | Title can wrap to 2 lines; below 380dp the fields stack, chip icons are dropped and labels can wrap to 2 lines; tiles go 2×2 | `blood-finder-form`, `blood-finder-tiles`, `fr-blood-urgency` |
| 6 | Find donors, Become a donor, Emergency request, Blood request | Paired selects truncated: "Choos…", "Area you can donat…", "Town or dis", "Any ti…" | Field pairs wrap (basis 140), so below ~360dp they stack | `donors-fields` |
| 7 | Labs dashboard | Stat tile labels cut to "Lab Ord…", "Abnorm…"; "1 results" | Stat labels can use 2 centred lines; `dashboard.latestMeta` now has `_one`/`_other` plurals | `labs-stats` |
| 8 | Lab result detail | The 4 facts in one row overlapped ("05 Sep 202605 Sep 2026"); provider squeezed to "Dr. Am…" (FR: "Soignan / t / prescrip / teur"); status showed raw "Completed" in FR | Facts go 2×2 below 400dp; provider row wraps the Contact button under the name; status goes through `opesDoctor.vocab.orderStatus` | `lab-detail-facts`, `fr-lab-provider` |
| 9 | Prescription detail | The status badge beside the drug name cut it to "Met / fo…"; patient row read "Patien / t" because the Health ID sat beside it | Badge (and collected-on line) now sit under the drug name; Health ID sits under the patient name | `prescription-items` |
| 10 | Home | Four-up summary broke to "Prescripti / ons", "Appoint…"; quick action "Book Appointm…" | Summary goes 2×2 below 380dp; action tiles get less side padding | `home-summary` |
| 11 | Home header (FR) | Tagline "Des soins connectés." ran off the right edge | `Wordmark` shrinks, so the tagline wraps inside the header | `fr-home-tagline-tabs` |
| 12 | Patient tab bar (FR) | "Identifiant santé" ran under the Quick-Add label | Tab items have `minWidth: 0` and the label stretches, so it truncates instead of overlapping | — (bottom bar; see the FR home capture) |
| 13 | Booking stepper (FR) | "Établissemen / t" | `StepProgress` labels are 10pt | `fr-booking-steps` |
| 14 | Clinician Today | Section headings sat 8px under the card above and 18px over their own card, so each one read as a caption of the previous block | `sectionGap` (16px) above every heading | `clinician-home-sections` |
| 15 | Clinician tab bar (320) | "Messag…" | Tab labels drop to 10pt below 360dp | — |
| 16 | Access-request sheet | Requester role read "Specialist" in FR | Added `consentPrompt.roles.specialist` (EN/FR) | — |
| 17 | Health ID credential card (320, and 360) | Holder name, Health ID and blood-group label truncated | `SecureCredentialCard` measures itself (onLayout); under 330dp the QR panel moves below the fields, the name may wrap to two lines, the status badge sits under the name and the Health ID uses a 13pt monospace face. Wide layout unchanged | `health-id-card-320` |
| 18 | Lab result detail table (320) | Columns truncated ("Re…", "m…") | Below 360dp each analyte is a stacked row card: name + flag, value + unit, reference range (still taps through to the trend); the table stays at 360dp and up | `lab-result-table-320` |

## Checked, not a defect

- **Dimmed screenshots.** Many patient captures look dimmed. That is the real
  consent prompt (`ConsentPromptWatcher`) opening for a pending demo access
  request. The sheet sits below the fold in the captures that do not show it.
- **Loading spinners** (Profile, Records, Payments) in the first pass were slow
  first loads. With a 6s settle they render fully.
- **English record titles in FR** ("Lab result — DEMO DATA…", "[demo-story:rx_current]")
  are seeded data, not UI strings.

## Open (not fixed here)

- **Consent sheet content in FR:** purpose, scope items and duration
  ("Treating this patient", "Ongoing problems", "24 hours") arrive as English
  `*_label` fields from the server. `/api/*` ignores `Accept-Language`
  (`SetLocale` only runs on the web group). This is a backend fix.
- Small items: the receptionist desk's two action buttons wrap tightly, and the
  "Scan code" button wraps on the clinician Find a Patient screen.

## Verification

- `npm run verify` (typecheck, lint, jest 85/85, nav-audit 93 routes) passes.
- The static bundle was rebuilt and every fixed screen re-captured at 320/360,
  EN and FR.
