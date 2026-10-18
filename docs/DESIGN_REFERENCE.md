# Design reference (archived prototype)

The OPES EMR mobile UI/UX prototype that many screens in this app were ported
from used to live in this repo as `UIUX/` (268 files). It was never part of the
build (`tsconfig.json` excluded it, nothing imported it) and was moved out of
the repository on **2026-10-18**.

## Where it lives now

```
C:\Users\PC\Documents\OpesCare-archive\UIUX-prototype-2026-10-18\
```

The copy was verified file-for-file (268 files) before `git rm`. It is also
recoverable from git history: check out any commit before the one titled
"chore: move UIUX design prototype out of the repo".

Contents: `DESIGN_SPEC.md` (the token contract), `README.md` / `INSTALL.md`
(how the prototype maps onto this app), `ui-kit/` (17 themed components, 33
icons, tokens), `src/screens/` (108 reference screens: care, doctor,
diagnostics, chat, meds, core...), `src/navigation/`, `src/i18n/catalog/`,
`src/api/` and `assets/`.

When a code comment says "design reference (archived prototype, see
docs/DESIGN_REFERENCE.md)" followed by a path such as
`src/screens/doctor/DoctorHomeScreen.tsx`, that path is relative to the archive
folder above.

## How the prototype differs from this app

| | Prototype | This app |
|---|---|---|
| Styling | RN `StyleSheet` + `theme.ts` token object | NativeWind/Tailwind + `theme/` tokens, plus `components/opes-ui` |
| Navigation | `@react-navigation` stacks + tabs | expo-router (file-based `app/`) |
| i18n | custom engine | i18next / react-i18next (`lib/i18n`) |
| Data | axios + 30 typed modules | `lib/api` |

Screens were ported for **layout and flow**, not copied. This app keeps the
OpesCare brand colours; the prototype palette below is the reference intent.

## Design spec summary (from the prototype's DESIGN_SPEC.md)

**Rules:** never hardcode a colour (use tokens); never hand-roll an SVG path
(use the shared `Icon`); never rebuild a card, row, badge or header (use the
shared components); extend the foundation rather than forking it in a screen.

**Palette (prototype values).** Primary `#055BFD`, primary-deep `#0441D0`,
primary-soft `#EAF0FE`, navy hero `#001665`. Page background `#FCFDFE`,
surface `#FFFFFF`, card border `#E9EEF6`, in-card divider `#F2F5FA`. Text
primary `#0B1A5C`, secondary `#6A7596`, muted `#939AB7`, link `#0A50FB`.
Status tones (fg / bg): normal `#0F9D48`/`#E5F5EC`, critical
`#E0242B`/`#FDE8E8`, warning `#F98A00`/`#FEEED0`, pending `#055BFD`/`#EAF0FE`,
info `#7B2FB0`/`#EFDFF9`, neutral `#6A7596`/`#F2F5FA`. Count badge `#F03336`.
Tint circles (green, blue default, purple, amber, red) pair a pastel fill with
the matching stroke.

**Spacing:** xs 4, sm 8, md 16, lg 24, xl 32, xxl 48. Screen gutter, card gap
and card padding are all 16; list-row vertical padding 14.

**Radii:** sm 8, md 14 (cards, buttons), lg 20 (hero panels, sheets), pill 999
(badges, chips, tint circles, FAB).

**Cards:** white, radius 14, 1px border, very subtle shadow. It is a
*bordered* card system, not a shadowed one. `flush` variant for edge-to-edge
rows; optional 4px left accent bar.

**Typography:** Poppins. Screen title 24 bold; card heading 20 semibold;
section header and list-row title 16 semibold; subtitles/body 14 regular;
badges and tab labels 12 semibold; metadata 12 regular; overline 13 uppercase
with 0.6 letter-spacing.

**Icons:** one outline set on a 24px grid, round caps; stroke 1.6 (<=18px),
1.8 (20-24px), 2.0 (>=28px and tab bar). Sizes: 20 in a tint circle, 18
chevron, 22 header action, 24 tab bar, 30 empty state.

**Status badge:** pill, 12px semibold, tone colours; labels sentence-cased in
code (`formatLabel()`), never CSS `capitalize`, which is wrong for French.

**List row:** 40px tint circle + title/subtitle + value + chevron; padding
14/16, gap 12; `meta` renders a bullet-joined metadata line.

**Section header:** title left, link-coloured action right ("View All"),
optional chevron, `overline` variant.

**Screen header:** back chevron (24px, link colour), large left-aligned 24px
title or compact centred variant, right-side actions with optional badge.

**Bottom tab bar:** Home, Health, centre FAB, Messages, Profile. Height 62 +
safe-area inset, active tint primary, inactive muted, 11px labels. The centre
slot is a raised 52px circular FAB that opens the Quick Add sheet instead of
navigating (implemented here in `components/quick-add/`).
