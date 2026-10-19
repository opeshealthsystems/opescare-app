# Icon audit: no glow, no chip (2026-10-19)

**Owner's rule:** every icon is a plain Lucide glyph in its own colour. No tinted circle or rounded square behind it, no ring, no shadow, no halo. The reference is the home quick-action tiles (`components/core/shared.tsx`).

**Result: CERTIFIED.** No icon backdrop remains anywhere under `app/**` or `components/**`. Every remaining hit is listed below with the reason it stays.

## Sizes now in use
| Place | Glyph size |
|---|---|
| List rows (`ListRow`, row marks) | 26 |
| Section and card headers | 24 |
| Home Health Summary cells (colours unchanged) | 28 |
| Empty states, hero and success art | 40 |
| Icons inline with text | 20 |
| Tab bar | 26 |

Touch targets are still at least 44 dp. They come from the pressable (its box or its hitSlop), not from a coloured chip.

## (a) Grep evidence

### 1. Structural detector
I wrote a TypeScript-AST scan that finds every JSX wrapper whose only child is an icon glyph (`<Icon>`, any `*Icon`, or a lucide import) and whose style sets `backgroundColor`, either inline or through a StyleSheet key. Results: **138 hits before, 12 after.** The 12 that remain:

| Hit | Why it stays |
|---|---|
| `app/(auth)/login.tsx` checkbox | Form-control state fill |
| `app/export-records.tsx`, `app/import-records.tsx`, `app/offline-access.tsx` radio | Form-control state fill |
| `app/blood-finder/modify.tsx` x2 | Radio circles |
| `components/desk/ProviderPicker.tsx` circle | Radio selection indicator; the fill is how the choice shows |
| `app/blood-finder/status.tsx` rail node | Stepper state: done, current or pending |
| `app/blood-finder/emergency.tsx` SectionCard | False positive: a card container, and its header mark is already plain |
| `components/health-id/SecureCredentialCard.tsx` qrPlaceholder | Health ID card security artwork |
| `components/quick-add/OpesTabBar.tsx` fab | The button's own fill |
| `components/ui/Logo.tsx` | Brand logo artwork |

### 2. Named-style scan
I searched every StyleSheet key matching `*Mark|*Badge|*Chip|*Circle|*Tile|*Icon|iconWrap|*Glyph|*Disc|*Art|*Shot|tint*|*Thumb` that still sets `backgroundColor`. Every remaining hit is one of the following:
- **Text pills and chips:** `identityChip`, `dayChip`, `filterChip`, `heroChip`, `requestChip`, `pageChip`
- **Count badges:** `bellBadge`, `topBarBadge`, `linkTileBadge`, `pageBadge`
- **Initials and step-number circles:** `donorMark`, `identityMark`, `stepMark` (privacy export), `wizardCircle`
- **Labelled button tiles:** `quickTile`, `actionTile`, `methodTile`, `statTile`, `gridTile`, `packTile`, `mapChip`
- **Image frame:** `titleIcon`, which frames the passport's page artwork image
- **Logo artwork:** `logoDisc`
- **Unused keys:** `assistIcon` in `doctors.tsx`, `mutedCircle` in `login.tsx`, `noticeMark` in `pharmacy/list/styles.ts`

The one real hit this scan found, `care-plans` `overviewMark`, is fixed.

### 3. White-glyph scan
I searched for `<Icon ... color={colors.textOnBrand}>`. Every remaining hit sits on one of these:
- a filled button or a text pill
- a brand-coloured panel (the home Health Summary band, the appointments and prescriptions heroes, Presentation Mode)
- a form control (checkbox or radio tick)
- the Health ID action bar, which another agent owns

None of them is a chip around a bare glyph.

## Changed centrally
- **`opes-ui` ListRow:** the 40 dp tint circle is gone; the glyph is now 26 in the tint ink.
- **`opes-ui` EmptyState:** the 64 dp circle is gone; the glyph is now 40.
- **`opes-ui` Dialog:** the tone mark lost its chip; the glyph is now 28.
- **`meds` `TintCircle`:** no fill.
- **`clinical/CareUi` `IconTile` and `StateHeading`:** plain glyphs.
- **`settings/SettingsUi` rows:** plain glyphs.
- **`care/shared`:** `infoCircle` and `dateCheck` lost their fills.
- **`pharmacy/list` and `pharmacy/medicine`:** the pill and facility fallbacks, `catMark`, and the rx/why/how/notice marks lost their fills.
- **`profile/*`:** marks and panels lost their fills.
- **`blood/*` and `appointments/book`:** marks lost their fills.
- **CatalogImage fallbacks:** plain glyphs.

I then swept about 75 screens and components under `app/**` and `components/**`.

Kept as they are, per the brief:
- avatar and initials circles
- the Health ID card artwork
- LivingAnatomy and LiveEcg
- AnimatedSplash
- text pills
- GradientButton and other button fills

## (b) Captures
Static web build at 360x640, with the demo reviewer and the clinician (demo doctor) accounts. Files are `docs/visual-qa/icons2-<route>-before.webp` and `icons2-<route>-after.webp` for these routes: home, records, profile, settings, pharmacy, pharmacy_1, care-map, doctors, facility_1, appointments, notifications, documents, family, clinician_home.

I checked every after capture by eye and found **zero icon backdrops**.

Two limits:
- **`pharmacy_1` and `facility_1`** show only their loading states, because those ids give the local data nothing to render. The components behind those detail screens are covered by the scans above.
- **Some captures are dimmed** behind the consent request sheet that the demo account opens. That sheet was dimmed in the before captures too.
