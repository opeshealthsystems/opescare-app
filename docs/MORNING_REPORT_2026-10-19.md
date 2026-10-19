# Overnight report — 19 October 2026

Everything below is live: backend deployed to **opescare.com**, app shipped
over the air to **1.5.0** installs on both channels (production + demo).

## Shipped overnight

### Sign-in, sign-out, Medical ID
- **Redesigned sign-in** — calm, clinical layout on the OpesCare paper; every
  existing path kept (email/Health ID, OTP, forgot password, sign-up, clinician).
- **Sign-out** — a confirmation sheet saying exactly what is wiped, then a
  "You are signed out" page.
- **Medical ID on the sign-in and lock screens (opt-in)** — Settings → This
  device → *Show emergency info on the sign-in screen*. Shows blood group, age,
  allergies with severity, emergency contact with tap-to-call, Health ID.
  Survives sign-out (that is the point); cleared when switched off, on account
  deletion, or when a different patient signs in. Age is computed, never stored.

### Audits and fixes
| Area | Result |
| --- | --- |
| **Backend security** | 6 holes closed with tests: certification admin open to facility admins; removed staff keeping facility access via an old session; partner prescription API unscoped; blood stock re-homable by form field; no `/api` rate limit; radiology acts attributable to anyone. Patient API confirmed scoped per patient. |
| **Backend performance** | No N+1 on 18 hot endpoints (now a regression test); hot-path indexes added; `docs/SCALE_READINESS.md` for national scale. |
| **Web portal** | 1,428 page loads × 6 roles: 0 server errors, 0 broken links, 0 CSP violations. 6 defects fixed (French header pushing login off-screen, untranslated demo panel, broken QR image…). `docs/WEB_AUDIT.md`. |
| **App ↔ API contract** | Every endpoint matched to a real route; 26 live response shapes match the app's types. 3 silent failures fixed (donor status, blood-request cancel, passport QR). `docs/FUNCTIONAL_AUDIT.md`. |
| **App visual QA** | ~100 screens at 360 and 320 px, English and French, patient + all clinician roles. 18 defects fixed (mid-word breaks, cut-off forms, raw codes, French overflow, Health ID card and lab table on small phones). `docs/VISUAL_QA.md` with before/after images. |
| **French from the server** | The app now tells the API its language, so consent requests, statuses and errors arrive in French for French users. |
| **Consent wording** | Legacy scope codes (`conditions`, `vitals`, `lab_results`) now read as plain language instead of raw codes. |

### Quality gates (all green)
- App: typecheck clean · lint 0 errors · **85/85 tests** · 93 routes, 0 orphans.
- Backend: committed code passes the full suite; today's new tests pass;
  i18n audit passes.

## Needs you
1. **Push to GitHub** — your sign-in expired overnight, so commits are saved
   locally only: **10 in the app, 3 in the backend**. Run in each folder:
   `git push origin master` (a sign-in window may open once).
2. **Play reviewer account** — demo logins no longer work on production. Sign
   up once with an email you control and put it under Play Console → App access.
3. **Upload AAB 14** (1.5.0) if not done — every fix since then has gone out
   over the air and reaches it on next launch.
4. **Still blocked on owner actions**: the null MX record at Hostinger (all
   email, incl. password recovery), S3 keys for off-site backups, MTN MoMo /
   Orange Money API credentials (payments show "unavailable" until then).

## Honest limits
- Clinician screens were checked for layout and API paths; live clinician
  response shapes were only partly exercised (login throttling + a database
  outage on this machine during the night).
- Local Postgres crashed once under memory pressure from parallel agents; it
  was recovered, 17 stale OpesCare test databases dropped. Production was
  never affected.
- "Ready for 100,000 facilities" is an architecture claim, not a load-tested
  one: `docs/SCALE_READINESS.md` lists what is done and what still needs real
  infrastructure (read replicas, Redis, multi-host, DR drills).
