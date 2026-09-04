# @opes/ui-kit

The portable presentation layer of the OPES apps — design tokens plus a themed
React Native component library — extracted so a **second, similar app** can
share the same look and building blocks without pulling in any of the EMR
domain (no clinical models, no navigation, no API endpoints).

Everything here is pure presentation and depends only on React Native,
`react-native-svg`, `expo-linear-gradient`, and the kit's own `theme` and
`i18n` modules. It works on iOS, Android and web (via `react-native-web`),
exactly as it does in the OPES app.

## What's inside

**Design system** — [`theme.ts`](./theme.ts) (colors, spacing, radii,
typography, shadows, status tints, icon strokes) and
[`DESIGN_SPEC.md`](./DESIGN_SPEC.md). This one token file **is** the look;
re-skin the whole kit by editing it.

**Components** (`components/`):

| Component | What it is |
| --- | --- |
| `Icon` | The SVG icon set (single source of glyphs) |
| `Card`, `ListRow`, `SectionHeader`, `ScreenHeader` | Layout / structure |
| `GradientButton` | Primary CTA with gradient + spinner states |
| `PillInput` | Text / password field with show-hide |
| `Chip`, `StatusBadge`, `StepProgress` | Small status + progress primitives |
| `EmptyState` | Empty / not-found / gated placeholder |
| `Dialog` | Bottom-sheet confirm/alert (`useDialog()` hook) |
| `StaleNotice` | "Showing what we last loaded" freshness strip |
| `Watermark` | The faded brand seal + `AppBackground` page layer |
| `PulseLogo`, `Wordmark` | Brand marks |

**Support** — [`i18n.ts`](./i18n.ts) (a tiny translation shim, en + fr, with a
`setMessages` override) and [`format.ts`](./format.ts) (locale-aware label /
date / number helpers).

> Not included (deliberately): `DataListScreen`, `ErrorBoundary`, the offline
> cache and API client. Those are app-infrastructure, not UI — they couple to a
> data/error model a new app will define itself. They can be lifted separately
> on request.

## Install into another app

1. Copy this `ui-kit/` folder into the new project (e.g. `src/ui/`), or publish
   it as a private package and depend on it.
2. Ensure the peer deps are installed:
   ```bash
   npx expo install react-native-svg expo-linear-gradient
   ```
3. The `Watermark` needs its asset — `assets/opes-watermark.png` ships with the
   kit; replace it with your own brand seal.

## Use

```tsx
import { GradientButton, Card, ScreenHeader, useDialog, colors } from './ui';

function Example() {
  const dialog = useDialog();
  return (
    <>
      <ScreenHeader title="Welcome" />
      <Card>
        <GradientButton
          label="Continue"
          onPress={() => dialog.confirm({
            title: 'End this visit?',
            confirmLabel: 'End',
            onConfirm: async () => { /* ... */ },
          })}
        />
      </Card>
      {dialog.element}
    </>
  );
}
```

## Re-skin

Edit [`theme.ts`](./theme.ts) — change `colors`, `typography`, `radii`,
`spacing`. Every component reads from it, so a new brand palette + font
re-skins the entire kit in one place. `DESIGN_SPEC.md` documents the intent
behind each token.

## Localise

Two ways:

- **Override strings** — `setMessages('en', { components: { staleTitle: '…' } })`.
- **Use your own i18n** — replace `i18n.ts` with a file that re-exports your
  app's `useTranslation`, `getLocale`, `toBcp47` under the same names. Nothing
  else in the kit touches i18n.

## Provenance

Extracted from the OPES EMR mobile app (`mobile/src/{theme,components,utils,i18n}`).
Kept as a **copy** — the source app is unchanged — so the two can diverge or be
re-synced deliberately rather than by accident.
