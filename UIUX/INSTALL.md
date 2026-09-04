# INSTALL — adopting the OPES UI/UX in opescare-finder-mobile

This guide is written for **your** stack: Expo SDK 57, expo-router, NativeWind,
i18next. Do the sections in order; each is independent, so you can stop after
the ones you need.

> Every native dependency the components need is **already installed** in your
> app (`react-native-svg`, `expo-linear-gradient`, `react-native-safe-area-context`,
> `expo-font`, `expo-secure-store`). You should not need `npm install` for §1–§2.

---

## §1 — Design tokens & COLOR POLICY

`UIUX/src/theme/theme.ts` (and `ui-kit/theme.ts`) is a plain object of every
token (colors, spacing, radii, typography, shadows, status tints).

> **INSTRUCTION — colors.** This app must use **its own current colours**
> (the OpesCare blue/cream brand in `theme/tokens.js`), **not** the template's
> palette. Adopt the OPES **layout, components, spacing, typography and icons**,
> but keep **your** colours. Do **not** re-skin the app to the template's colours.
> (Optionally, support **both** palettes with a user-facing switch — see below.)

You get the OPES look-and-feel while keeping your brand because **every
component reads its colours from the one `theme.ts` it imports.** Change that one
file and the whole kit re-skins — no component edits.

### Default: use YOUR colours — ALREADY DONE

Nothing to map by hand. The kit's **default palette is `opescare`**, already
built from your `theme/tokens.js` values (brand `#0F4C81`, page `#FDF8F0`, navy
text `#1A2338`, your semantic colours, tints, etc.). So out of the box every
component renders in **your** blue/cream brand — OPES layout + components +
icons, your colours.

If you want to tune a specific colour, edit the `opescarePalette` object in
`ui-kit/theme.ts` (keep the key **names**, change the **values**);
`UIUX/DESIGN_SPEC.md` explains each colour role. Spacing / radii / typography
are shared (not palette-specific) and already sensible; adjust in `theme.ts` if
you like.

### Optional: support BOTH, with a user switch — ALREADY BUILT

The kit ships **two palettes and a live runtime switch — no work needed on your
side beyond wiring the provider.** Every component reads its colours at render
through a `ThemeProvider`, so flipping the palette re-skins the whole kit
instantly, no reload.

- **`opescare`** — your blue/cream brand, mapped from `theme/tokens.js` onto
  every colour role (brand `#0F4C81`, page `#FDF8F0`, navy text `#1A2338`, your
  semantic success/danger/warning, etc.). **This is the default.**
- **`opes`** — the original template palette, intact.

Wire it in three steps:

1. **Wrap your app once** (defaults to `opescare`, so it already uses YOUR
   colours):
   ```tsx
   import { ThemeProvider } from '@/components/opes-ui';
   // in app/_layout.tsx, wrap your <Stack/> / <Slot/>:
   <ThemeProvider onPaletteChange={(p) => persist(p)}>{/* app */}</ThemeProvider>
   ```
2. **Add a toggle** anywhere (e.g. a Settings row):
   ```tsx
   import { useTheme } from '@/components/opes-ui';
   const { palette, togglePalette } = useTheme();   // palette: 'opescare' | 'opes'
   // <Switch value={palette === 'opes'} onValueChange={togglePalette} />
   ```
3. **Persist the choice** (optional) — `onPaletteChange` fires on every switch;
   save it with your `expo-secure-store` and pass it back as
   `<ThemeProvider initialPalette={saved}>` on next launch. The kit itself has
   **no storage dependency**, so it stays portable.

`useTheme()` returns `{ palette, colors, statusMap, tintMap, setPalette,
togglePalette }`. It also works **without** a provider (falls back to the
`opescare` palette), so components never crash if you drop one in before wiring
the provider.

> To make YOUR app's own NativeWind screens follow the same switch, read
> `useTheme().palette` where you choose a Tailwind theme, or mirror the two
> palettes into two Tailwind themes and toggle a root `className`. The kit
> components switch on their own regardless.

### Alternative: merge values into your Tailwind system

Your `theme/tokens.js` already drives `tailwind.config.js`. If you'd rather your
own NativeWind components stay the source of truth, copy the OPES **spacing /
radii / typography** values into `tokens.js` (respect your additive-only
contract — add keys, don't rename) and **leave your colours as they are**.

---

## §2 — Components (drop-in)

Use **`UIUX/ui-kit/`** — it is self-contained (only RN + svg + linear-gradient +
its own theme/i18n shim; no react-navigation, no API). 17 components incl. the
full icon set, `Dialog` (`useDialog()`), `GradientButton`, `Card`, `ListRow`,
`ScreenHeader`, `PillInput`, `StatusBadge`, `EmptyState`, `StaleNotice`,
`Watermark`, etc.

1. Copy the folder into your app, e.g. `cp -r UIUX/ui-kit components/opes-ui`
   (or keep it in `UIUX/` and import from there — but copying in is cleaner
   since `UIUX/` is excluded from your build).
2. Import and use:
   ```tsx
   import { GradientButton, Card, ScreenHeader, useDialog, colors } from '@/components/opes-ui';
   ```
3. They are `StyleSheet`-based and coexist with your NativeWind `className`
   components — mix freely. You can even wrap them and add `className` on the
   parent.
4. The `Watermark` needs its asset — it's at `UIUX/assets/opes-watermark.png`;
   copy it into your `assets/` and update the `require()` in `Watermark.tsx`, or
   swap in your own seal.

Localisation of the components: they use a tiny built-in i18n shim
(`ui-kit/i18n.ts`, en+fr). Either leave it (works standalone), call
`setMessages('en', {...})` to override strings, or replace `ui-kit/i18n.ts` with
a 10-line file that re-exports your **i18next** `t`/`useTranslation` under the
same names — then the components speak your app's i18n. Nothing else in the kit
touches i18n.

---

## §3 — Screens & flows (port into expo-router)

`UIUX/src/screens/` has 108 real screens grouped by area (`core`, `care`,
`doctor`, `diagnostics`, `imaging`, `meds`, `messaging`, `billing`, `docs`,
`enrol`). They are **react-navigation** screens, so they don't become routes
automatically in your **expo-router** app — use them as **layout + flow
reference** and port the JSX:

- **Navigation calls:** replace react-navigation with expo-router equivalents.
  - `useNavigation().navigate('X', params)` → `router.push({ pathname: '/x', params })` (`useRouter` from `expo-router`).
  - `route.params` → `useLocalSearchParams()`.
  - A stack `Screen` → a file in `app/…`. A tab navigator → an `app/(tabs)/_layout.tsx`.
- **Data:** the screens call `UIUX/src/api/*`. Swap those imports for your own
  data hooks; the API modules' TypeScript types show you the exact shapes each
  screen expects, which is a ready-made contract for your backend.
- **Styling:** the JSX + `StyleSheet` renders as-is (RN primitives). Convert to
  NativeWind `className` at your leisure — not required to run.

Map to what you already have: your `app/` already contains `facility/`,
`doctor/`, `appointments/`, `pharmacy/`, `blood-finder`, `care-map`,
`family/`, `documents`, etc. Pull the matching OPES screen (e.g.
`src/screens/care/FindFacilityScreen.tsx`, `src/screens/care/ProviderProfileScreen.tsx`,
`src/screens/core/MyHealthIdScreen.tsx`) as the design reference for each.

---

## §4 — Strings (i18next)

`UIUX/src/i18n/catalog/en` and `/fr` hold every string, namespaced. Move the
keys you reuse into your i18next resource bundles. The structure is flat
namespaces (`care`, `core`, `components`, …) that map cleanly onto i18next
namespaces. If you don't need French, take only `en`.

---

## §5 — Assets

`UIUX/assets/` — app icon, splash, adaptive icons, favicon, the watermark seal,
and notification sounds. Reuse or rebrand. Your `app.json`/`app.config.js`
already point at your own `assets/`; copy over only what you want.

---

## Fastest path to seeing it

1. §2 — copy `ui-kit` into `components/opes-ui`, drop a `<GradientButton>` and a
   `<ScreenHeader>` on any screen. Instant OPES look, no config.
2. §1 Option A — tweak `ui-kit`'s `theme.ts` to your palette if you want your
   brand.
3. §3 — port screens flow-by-flow as you build each area, using the OPES screen
   as the reference and your expo-router route as the shell.

## Notes
- `UIUX/` is excluded from your `tsconfig` build on purpose — the react-navigation
  and custom-i18n imports in `src/` would otherwise error in your app. Code you
  actually adopt gets copied OUT of `UIUX/` into your tree (`components/`, `app/`)
  where it compiles.
- Nothing in `UIUX/` is imported by your app, so Metro never bundles it; it adds
  zero bytes to your build until you pull from it.
