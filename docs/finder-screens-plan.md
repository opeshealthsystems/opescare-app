# Blood & Medicine finder screens — build plan

**Source:** `Health ID retuned/OPESCARE_FINDER_EXPO_15_SCREENS/` — 15 reference
images (11 blood, 4 medicine) plus a drop-in Expo package.
**Goal:** the 15 screens, screen-to-screen, at parity with the images.
**Written:** 2026-09-07, after reading every reference image, the bundle's
source, this app's UI kit and the live API routes.

---

## 1. What the bundle actually contains

The package ships **reference images** and a **sketch**, and its own README
says which is authoritative: *"The supplied reference files remain the
authoritative visual comparison source."* That is the right reading — the code
is nowhere near the images.

`src/screens/blood/CoreScreens.tsx` is six screens in six single lines of JSX.
`PM-BLOOD-01` in the image has a five-step filter card, a four-up trust strip,
blood-bank cards with per-component chips and unit counts, a four-up action
grid and a footer notice. The sketch renders three generic `Pill` rows and a
list. It is a wireframe of the image, not an implementation of it.

Three things in the sketch actively conflict with this app and are **not**
imported:

| In the bundle | Why it cannot come in |
| --- | --- |
| `BottomNav` renders `⌂ ▣ ✚ ⌖ ☰` | Emoji as icons. This project is Lucide-only, never emoji — it is in the root `CLAUDE.md`. The app also already has a real tab bar; a second one drawn inside a screen would render below the real one. |
| Its own `theme.ts` (`COLORS`, `RADIUS`) | The app has `components/opes-ui/theme.ts` with a `ThemeProvider`, light/dark palettes and a written `DESIGN_SPEC.md`. A second palette that does not follow the theme would be the only thing on the phone that ignores dark mode. |
| Green `ActionButton` as the primary | The blood images use OpesCare blue for primary actions and red only for emergency. The sketch makes every primary button green, which is the medicine accent. |

**So: the images are the spec, the app's own kit is the material.** What the
bundle usefully contributes is the screen inventory, the flow order and the
demo copy — all of which this plan carries over.

---

## 2. Three decisions I cannot make from the images

These change what gets built, so they are raised before the work rather than
after it.

### 2.1 The references are three different apps

The 15 images do not share a design system. Read the bottom bar:

| Set | Accent | Bottom navigation |
| --- | --- | --- |
| `PM-BLOOD-01…06` | OpesCare blue `#165DFF` | Home · Appointments · **Health ID** · Care Access · More |
| `SB-01…05` | Blood red `#DC2626` | Home · Requests · **Blood Finder** · Donors · Profile |
| `MED-01…04` | Pharmacy green `#0A8F5B` | Home · Records · **Health ID** · Messages · More |

Literal parity means the tab bar changes its labels, its icons and its colour
depending on which screen you are on. No shipped app can do that — the tab bar
is one component, mounted once, above every screen.

**Recommendation:** keep the app's real tab bar everywhere, and carry parity in
the *screen body* — where all the actual design is. Accent per area is
preserved: blue for blood requests, red for emergency, green for medicine.
That is already how the kit's `Tint` works.

### 2.2 SB-02 "Find Donors" cannot be built against real data

The image lists **36 donors** with full name, photo, age, sex, blood group,
last-donation date, distance to 0.1 km, and a direct **Call** button.

Every one of those is patient data, and blood group and donation history are
health data. This project's standing rule is explicit — *no patient
`LIKE`/enumeration search, no patient lists, exact Health ID only, and a
refusal must not reveal whether a record exists.* A browsable donor directory
is precisely the thing that rule forbids, and the bundle's own README concedes
it: *"Before release, wire the … donor privacy rules."*

There is also no donor table, no donor consent, and no donor endpoint anywhere
in the backend, so nothing could populate it today regardless.

**Three honest options:**

1. **Build the screen, no directory.** Post a request to a blood bank, which
   contacts its own registered donors. The patient never sees a donor list.
   Keeps the screen, drops the enumeration. *Recommended.*
2. **Opt-in registry with brokered contact.** Donors consent to be listed;
   the app shows first name, blood group and an approximate area only, and
   contact goes through the platform rather than exposing a phone number.
   Needs a donor model, consent capture and a new API.
3. **Build it exactly as drawn.** I will say plainly that I think this is the
   wrong call for a health platform, and it needs the owner's explicit
   decision on the record before I write it.

### 2.3 Four screens have no backend

Confirmed against `routes/mobile_blood.php` and `routes/api.php`:

| Screen | Needs | Exists? |
| --- | --- | --- |
| PM-BLOOD-05 status | `GET blood/requests/{id}` | **No** — only the list |
| PM-BLOOD-06 modify | `PATCH blood/requests/{id}` | **No** — only `cancel` |
| SB-02 / SB-03 donors | any donor endpoint | **No** — nothing |
| MED-02/03/04 upload | prescription upload | **No** |

Note the bundle's suggested paths are wrong for this app: it proposes
`/api/v1/care-map/blood/availability` and `/api/v1/mobile/blood/requests`.
The real ones are under `api/mobile/…`, and `/api/v1/care-map/*` is a group
that 500s anyway — it uses `auth:sanctum` and Sanctum has never been installed
here.

---

## 3. The real API surface these screens bind to

```
Blood       GET  api/mobile/blood/options
            GET  api/mobile/blood/search
            GET  api/mobile/blood/requests
            POST api/mobile/blood/requests
            POST api/mobile/blood/requests/{id}/cancel

Medicine    GET  api/mobile/pharmacy/categories
            GET  api/mobile/pharmacy/medicines
            GET  api/mobile/pharmacy/medicines/{id}
            GET  api/mobile/pharmacy/nearby
            GET  api/mobile/pharmacy/reservations
            POST api/mobile/pharmacy/reservations
            POST api/mobile/pharmacy/reservations/{id}/cancel
```

All behind `auth.mobile`. The app already has typed hooks for every one of
them in `lib/api/queries.ts` and `lib/api/bloodQueries.ts`.

**The never-invent rule applies to every screen here.** The images are full of
demo values — `8 units`, `250 FCFA`, `Updated 5 min ago`, `36 donors found`.
Those are layout, not data. Where the API returns nothing, the screen says so;
it does not render the number from the picture. Availability keeps the
platform's existing wording: reported by the facility, timestamped, never a
guarantee.

---

## 4. What exists already

Not a green field. Three substantial screens are built on the app's kit and
wired to the live endpoints:

| File | Lines | Covers |
| --- | --- | --- |
| `app/blood-finder.tsx` | 1693 | PM-BLOOD-01, part of 02, request list |
| `app/blood-finder/request.tsx` | — | part of PM-BLOOD-03 |
| `app/pharmacy.tsx` | 1592 | MED-01 |
| `app/pharmacy/[medicineId].tsx` | — | MED-02 |
| `app/care-map.tsx` | 1206 | facility directory, feeds SB-05 |

These are **redesigned to the images, not replaced.** Their data wiring, error
states, offline handling and i18n keys already work and are worth more than the
layout they currently draw.

---

## 5. Build order

Sequenced so each stage is shippable on its own.

**Stage 1 — the blue core flow, on live data.**
`PM-BLOOD-01` → `02` → `03` → `04`. Redesign the finder and detail to the
images, complete the request form (the image's Step 1 of 2 has fields the
current form lacks: receiving facility, department, bed, need-by date and time,
contact preference, attachments), and build the confirmation screen.

**Stage 2 — medicine, on live data.**
`MED-01` and `MED-02`. `MED-03`/`MED-04` are the same screen with different
emphasis — built as one screen with variants rather than three components, and
the prescription-upload block is disabled with an honest reason until an
endpoint exists.

**Stage 3 — status and modification.** `PM-BLOOD-05`, `PM-BLOOD-06`. Needs the
two new backend routes first; that is a small, contained addition.

**Stage 4 — supporting.** `SB-01` emergency (maps onto the existing request
endpoint with urgency = emergency), `SB-04` education (static content, EN/FR),
`SB-05` map (the existing `FacilityMap` plus the per-group availability grid).

**Stage 5 — donors.** `SB-02`, `SB-03`, once 2.2 is decided.

Every stage: `npx tsc --noEmit`, `node scripts/nav-audit.mjs` for dangling
routes, and EN/FR strings added in the same commit — never hardcoded.

---

## 6. Parity method

For each screen: the reference image open beside the implementation, and a
written diff of section order, every label, spacing rhythm, chip and badge
tone, icon choice and action placement. Divergences get recorded here with a
reason — a design system that must bend has to bend visibly, not silently.
