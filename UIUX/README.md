# UIUX — OPES health app UI/UX, exported for opescare-finder-mobile

This folder is the **complete UI/UX of the OPES EMR mobile app**, dropped in as
a reference + drop-in asset library for this app. It is deliberately **excluded
from this project's TypeScript build** (`tsconfig.json` → `exclude: ["UIUX"]`)
and nothing imports it yet, so it does not affect your app until you pull pieces
out of it. Read **INSTALL.md** for how to adopt each layer.

## Two stacks — read this first

The OPES app and this app are both Expo/React Native, but they differ:

| | OPES source (this folder) | opescare-finder-mobile (your app) |
| --- | --- | --- |
| Styling | RN `StyleSheet` + a JS token object (`theme.ts`) | **NativeWind / Tailwind** + `theme/tokens.js` |
| Navigation | `@react-navigation` (stacks + tabs) | **expo-router** (file-based `app/`) |
| i18n | custom engine (`src/i18n`) | **i18next / react-i18next** |
| Data | `axios` client + 30 typed API modules | your own |

Good news: **NativeWind and RN StyleSheet coexist**, and your app already has
every native dependency the OPES components need (`react-native-svg`,
`expo-linear-gradient`, `react-native-safe-area-context`, `expo-font`,
`expo-secure-store`). So the **components drop in and work**; the **screens and
navigation are a design/flow reference** you port into expo-router routes.

## What's in here

| Path | What it is | How you use it |
| --- | --- | --- |
| `ui-kit/` | **Self-contained component library** — 17 themed components + the full 33-glyph icon set + design tokens + a tiny i18n shim. No navigation, no API, no coupling. | **Drop-in.** Copy into your app or import from here. See INSTALL §2. |
| `src/theme/` | The design system: `theme.ts` (all tokens) + `DESIGN_SPEC.md`. | **Keep YOUR colours (OpesCare blue/cream), not the template's** — adopt the layout/type/spacing, map your colours onto the same token keys. Optional user-switchable dual palette. INSTALL §1. |
| `src/components/` | The same components in their original app context (~20). | Prefer `ui-kit/` (cleaner). Here for reference. |
| `src/screens/` | **108 screens** — Health ID, doctors, directories/facilities, appointments, booking, telemedicine, messaging, labs, imaging, meds, billing, enrolment. | **Layout/flow reference.** Port JSX into your `app/` routes. INSTALL §3. |
| `src/navigation/` | The flows (tabs, stacks, deep-linking, watermark wiring). | Reference for how the flows connect; your equivalent is expo-router. |
| `src/i18n/catalog/` | Full en/fr strings. | Source strings to move into your i18next resources. INSTALL §4. |
| `src/api/` | 30 typed endpoint modules (the API contract). | Reference for data shapes; you keep your own client. |
| `src/lib/`, `src/utils/`, `src/context/`, `src/hooks/`, `src/notifications/` | Offline cache, formatting, auth/unread context, push clients. | Lift individually as needed. |
| `assets/` | App icons, splash, favicon, **`opes-watermark.png`** (the brand seal), notification sounds. | Rebrand / reuse. |
| `DESIGN_SPEC.md` | The intent behind every design token. | Read before re-skinning. |
