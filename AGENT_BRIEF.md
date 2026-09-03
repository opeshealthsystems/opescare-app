# Screen Parity Brief — read this before touching anything

You are upgrading ONE slice of the OpesCare Expo patient app so it matches its
design references and is genuinely wired up. Another 19 agents are working on
other screens **in parallel**, so the file-ownership rules below are hard
requirements, not style advice.

## The references
`C:\laragon\www\opescare\Mobile app screens\` — 173 PNGs plus `MANIFEST.csv`.
Filenames are descriptive (e.g. `a_bright_clean_white_mobile_app_settings_screen.png`).
Find the image(s) matching YOUR screens, **open them with the Read tool** (it
renders images), and compare against what is actually built. If no reference
matches your screen, say so and use the established visual language instead.

## Environment
- App: `C:\laragon\www\opescare\apps\mobile-expo` — Expo SDK 57, expo-router,
  NativeWind v4, TanStack Query, Zustand.
- **Read https://docs.expo.dev/versions/v57.0.0/ before writing code** — the API changed.
- Typecheck (must be clean): `npx tsc --noEmit --ignoreDeprecations 6.0`
- Local API `http://opescare.test/api`; login `POST /api/mobile/auth/login-email`
  `{"email":"demo.patient@opescare.test","password":"DemoPass!2026"}` → `access_token`.
- PHP is not on PATH: `export PATH="/c/laragon/bin/php/php-8.3.30-Win32-vs16-x64:$PATH"`

## DO NOT EDIT (another agent owns these — you WILL cause a merge conflict)
`components/ui/*`, `theme/tokens.js`, `lib/api/queries.ts`, `lib/api/types.ts`,
`lib/api/endpoints.ts`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`,
`apps/api-laravel/**`, `.env`, any file outside your assigned screens.

- Need a **new API hook**? Create `lib/api/<yourArea>Queries.ts`. Never edit `queries.ts`.
- Need a **shared component change**? Don't. Build it locally in your screen, or
  create a NEW file under `components/<yourArea>/`. Report what you'd want changed.
- Need **new i18n keys**? Only inside your screen's OWN existing top-level
  namespace in `lib/i18n/locales/{en,fr}.json`. Keep EN/FR exactly 1:1.
  Two agents editing the same namespace = conflict, so stay in your lane.

## Icons
`lucide-react-native@1.37` is installed — **check it has the icon first**
(`node -e "console.log(Object.keys(require('lucide-react-native')).filter(k=>/Heart/i.test(k)))"`).
Only if it genuinely lacks one: create `components/icons/<Name>.tsx` as a NEW
file (never edit someone else's icon file) using `react-native-svg`, matching
Lucide's conventions exactly — 24×24 viewBox, `stroke="currentColor"`,
`strokeWidth={2}`, `strokeLinecap="round"`, `strokeLinejoin="round"`, no fill,
and a `size`/`color` prop API identical to a Lucide icon so it is a drop-in.
**Never use emoji.**

## Visual standard
Brand is warm cream/gold/navy — take colours from `theme/tokens.js` only
(`colors.gold[*]`, `colors.cream[*]`, `colors.navy.*`, `colors.semantic.*`).
Never hardcode a hex. Currency is XAF/FCFA. The bar is a premium, rich,
polished product: real spacing rhythm, proper empty/loading/error states,
consistent card treatment, no cramped or default-looking layouts.

**NativeWind gotcha:** `className` does NOT apply to third-party components
(e.g. `expo-linear-gradient`'s `LinearGradient`) — no `cssInterop` is
registered. Use inline `style` for those, or it silently does nothing.

## Wiring (this is half the task)
- Every pressable must do something real: navigate to a route that **actually
  exists** under `apps/mobile-expo/app/`, or fire a real mutation. Verify each
  target file exists — no dead ends, no `console.log` handlers, no TODO.
- All data comes from the real API via existing hooks. **No mock/placeholder
  data.** If a needed endpoint doesn't exist, say so in your report rather than
  faking it.
- Handle loading, empty, and error states explicitly — the demo patient has no
  labs/prescriptions/documents, so empty states WILL be seen and must look
  deliberate, not broken.

## Verification before you report
1. `npx tsc --noEmit --ignoreDeprecations 6.0` — clean.
2. EN/FR key parity for your namespace.
3. Every `router.push(...)` target resolves to a real file.
4. **Do NOT start Expo or a browser** — 20 agents share one machine. Static
   verification only; visual checking is done centrally after merge.

## Report back (under 400 words)
Which reference image(s) you matched · what actually differed · what you
changed · icons created · navigation you wired or found broken · anything you
could not verify. Be blunt about gaps; do not claim more than you checked.
