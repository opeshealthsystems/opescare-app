# OPES EMR Mobile — Design Spec

**This is the contract.** Every screen agent follows it. Every value below was
sampled from the reference renders in `mobile app screens/` (dominant pixel over
a solid region; background pixels excluded when reading text/stroke colours).

**Rules**
1. Never hardcode a colour. Import from `src/theme/theme.ts`.
2. Never hand-roll an SVG path. Use `<Icon name="..." />`.
3. Never rebuild a card, row, badge, or header. Use the shared components.
4. If a reference shows something the foundation doesn't cover, extend the
   foundation — don't fork it inside a screen.

---

## 1. Palette

### Brand / primary

| Token | Hex | Used for |
|---|---|---|
| `colors.blue` / `colors.primary` | `#055BFD` | Health Summary band (CORE-006), centre FAB, primary CTA ("Pay Now", "Start Check-in") |
| `colors.primaryDeep` | `#0441D0` | Hero panels (CARE-001 next-appointment), "Book New" button |
| `colors.blueLight` | `#3477FE` | Secondary marks, quick-stat icons |
| `colors.primarySoft` | `#EAF0FE` | "Confirmed" pill fill, info banners, soft chips |
| `colors.navy` | `#001665` | Dark hero cards (CORE-008 profile hero, MED-001 hero) |
| `colors.navyLight` | `#0F206B` | Chips sitting on a navy surface |

### Surfaces & lines

| Token | Hex | Used for |
|---|---|---|
| `colors.background` | `#FCFDFE` | Page background. The references use an almost-white body — cards are separated by **borders, not shadows**. |
| `colors.surface` | `#FFFFFF` | Cards, sheets, tab bar |
| `colors.surfaceMuted` | `#EAF0FE` | Inactive segmented tab, info strip, input fill |
| `colors.border` | `#E9EEF6` | Card hairline border (1px) |
| `colors.divider` | `#F2F5FA` | Row divider *inside* a card (lighter than the card border) |

### Text

| Token | Hex | Used for |
|---|---|---|
| `colors.textPrimary` | `#0B1A5C` | Screen titles, card headings, row titles |
| `colors.textSecondary` | `#6A7596` | Row subtitles, body copy |
| `colors.textMuted` | `#939AB7` | Metadata, inactive tab labels, chevrons |
| `colors.link` | `#0A50FB` | "View All", "View Report", inline links |
| `colors.textOnBrand` | `#FFFFFF` | Text on blue/navy |

### Semantic status

Each status has a **foreground** (text/icon) and a **`Bg`** (pill fill).

| Tone | fg | bg | Statuses |
|---|---|---|---|
| `normal` | `#0F9D48` | `#E5F5EC` | Normal, Verified, Completed, Active, Taken, Paid |
| `critical` | `#E0242B` | `#FDE8E8` | Cancelled, Overdue, Abnormal, Failed, Missed |
| `warning` | `#F98A00` | `#FEEED0` | Due, Refill, Low, Attention, Draft |
| `pending` | `#055BFD` | `#EAF0FE` | Upcoming, Scheduled, Pending, Processing |
| `info` | `#7B2FB0` | `#EFDFF9` | Rescheduled, Referred, Archived |
| `neutral` | `#6A7596` | `#F2F5FA` | anything unmapped |

`colors.badge` = `#F03336` — the red count bubble on the Messages tab and the header bell.

### Tint circles

The pastel icon chip on every list row. Fill = `tintXBg`, icon stroke = `tintX`.

| Tint | fg | bg | Convention |
|---|---|---|---|
| `green` | `#0F9D48` | `#E7F5EB` | Labs, medications, anything resolved/positive |
| `blue` | `#055BFD` | `#ECF3FE` | Imaging, appointments, documents (**the default**) |
| `purple` | `#7B2FB0` | `#F2ECFE` | Consultations, referrals, rescheduled |
| `amber` | `#F98A00` | `#FEEED0` | Reminders, warnings, cancelled |
| `red` | `#E0242B` | `#FDE8E8` | Critical alerts |

Access programmatically via `tintMap[tint]` and `statusMap[tone]`.

---

## 2. Spacing

`spacing`: `xs 4 · sm 8 · md 16 · lg 24 · xl 32 · xxl 48`

- Screen horizontal gutter: **`spacing.md` (16)**
- Gap between stacked cards: **`spacing.md` (16)**
- Gap between a `SectionHeader` and its content: **10** (built into the component)
- Inside-card padding: **`spacing.md` (16)**
- List-row vertical padding: **14**

## 3. Radii

`radii`: `sm 8 · md 14 · lg 20 · pill 999`

- Cards & buttons → `radii.md` (14)
- Hero panels & bottom sheets → `radii.lg` (20)
- Badges, chips, tint circles, FAB → `radii.pill`

---

## 4. Card recipe

```
backgroundColor: colors.surface      // #FFFFFF
borderRadius:    radii.md            // 14
borderWidth:     1
borderColor:     colors.border       // #E9EEF6
padding:         spacing.md          // 16   (variant="padded")
...shadow.card                       // very subtle — borders do the work
```

Use `<Card>`. `variant="flush"` removes padding for cards that contain
edge-to-edge `ListRow`s. `accentColor` adds the 4px left accent bar seen on
MED-001 prescription rows.

**Do not** add heavy shadows. The references are a bordered-card system.

---

## 5. Typography ramp

Font family is Poppins throughout (`typography.fontFamily.*`).

| Role | Size | Weight | Colour |
|---|---|---|---|
| Screen title | `xl` 24 | bold | `textPrimary` |
| Screen subtitle | `sm` 14 | regular | `textSecondary` |
| Hero numeral | `xxl` 30 | bold | `textOnBrand` / `textPrimary` |
| Card heading | `lg` 20 | semiBold | `textPrimary` |
| Section header | `md` 16 | semiBold | `textPrimary` |
| Section overline | 13, `letterSpacing 0.6`, uppercase | semiBold | `textPrimary` |
| List-row title | `md` 16 | semiBold | `textPrimary` |
| List-row subtitle | `sm` 14 | regular | `textSecondary` |
| Link / action | `sm` 14 | medium | `link` |
| Badge / tab label | `xs` 12 | semiBold | tone fg |
| Metadata | `xs` 12 | regular | `textMuted` |

`typography.lineHeight` mirrors the size keys — use it for any multi-line body copy.

---

## 6. Icons

- One set only: `<Icon name="..." size={24} color={...} />` from `src/components/Icon.tsx`.
- 24×24 grid, **outline** style, round caps and joins, no fills except
  deliberate dots.
- Stroke weight (`iconStroke`): **1.6** ≤18px · **1.8** 20–24px (default) ·
  **2.0** ≥28px and tab bar. `Icon` picks this automatically from `size`.
- Standard sizes: **20** in a tint circle · **18** for a row chevron ·
  **22** for header actions · **24** in the tab bar · **30** in an `EmptyState`.
- `iconNames` exports the full list. If a glyph is missing, **add it to
  `Icon.tsx`** — do not inline an `<Svg>` in a screen.

---

## 7. Status badge recipe

```
borderRadius:      radii.pill
paddingHorizontal: 10   (size="sm": 8)
paddingVertical:   5    (size="sm": 3)
backgroundColor:   statusMap[tone].bg
color:             statusMap[tone].fg
fontSize:          12 semiBold
```

The label is sentence-cased in code by `formatLabel()`, NOT by
`textTransform: 'capitalize'`. CSS `capitalize` upper-cases every word, which
is wrong for French sentence case — it rendered « Compte Rendu À Lire » for
« Compte rendu à lire ». `formatLabel()` upper-cases only the first character,
correct in both languages, and leaves an already-cased translated label alone.

`<StatusBadge status="confirmed" />` maps the raw string to a tone
automatically (`toneForStatus`). Pass `tone` to override, `icon` for the
"Taken ✓" / "Upcoming ⏱" variants seen on MED-001.

---

## 8. List row recipe

The single most reused pattern — "Recent Records" on CORE-006.

```
[ 40px tint circle, 20px icon ]  Title (16 semiBold)        value  ›
                                 Subtitle (14 regular)
```

```
paddingVertical: 14, paddingHorizontal: 16, gap: 12
circle: 40×40, borderRadius 20, backgroundColor tintMap[tint].bg
chevron: Icon "chevron-right" 18px colors.textMuted
```

Use `<ListRow>`. Key props:
- `icon` + `tint` → the tint circle; or `leading` for an avatar / date block.
- `meta={['Lab Result', '20 Apr 2024']}` renders the `•`-joined metadata line.
- `value` + `valueColor` for the right-hand text ("Normal" in
  `colors.statusNormal`, "View Report" in `colors.link`).
- `trailing` for a `StatusBadge` or a dose block instead of plain text.
- `divider` on all but the last row when stacking rows in one `<Card variant="flush">`.

---

## 9. Section header recipe

Title on the left, blue action link on the right.

```tsx
<SectionHeader title="Recent Records" onAction={() => nav.navigate('...')} />
// → "Recent Records"                                            "View All"
```

- `actionLabel` overrides the default "View All".
- `actionChevron` adds the `›` (CARE-001 "View Calendar ›").
- `variant="overline"` gives the 13px uppercase treatment (MED-001
  "MY PRESCRIPTIONS").

---

## 10. Screen header recipe

Back chevron + title (+ optional subtitle) + right actions.

```tsx
<ScreenHeader
  title="Medications & Prescriptions"
  subtitle="Your prescriptions, medications and treatment plans."
  actions={[{ icon: 'bell', badge: 3, onPress: openNotifications }]}
/>
```

- Back chevron is `chevron-left`, 24px, `colors.link`, stroke 2.2. Shown by
  default; it calls `navigation.goBack()` unless `onBack` is given.
- `align="left"` (default) = large 24px bold title. `align="center"` = compact
  nav-bar style.
- `right` accepts arbitrary content for cases like CARE-001's "Book New" button.
- Header actions carry an optional red count `badge`.

---

## 11. Bottom tab bar

Five slots, per CORE-006 / CORE-008:

```
  Home   |   Health   |   ( + )   |   Messages•   |   Profile
```

| | |
|---|---|
| Height | `62 + safeAreaInsets.bottom` |
| Background | `colors.surface`, 1px top border `colors.border` |
| Active tint | `colors.blue` |
| Inactive tint | `colors.textMuted` |
| Label | 11px medium |
| Icons | 24px, stroke 2.0 |
| Badge | `colors.badge` `#F03336`, white 10px semiBold |

**The centre slot is not a tab.** It's a raised circular FAB:
52×52, `radii.pill`, `colors.blue`, a 4px `colors.surface` ring,
`marginTop: -18` so it breaks the bar's top edge, `shadow.fab`, white `plus`
icon at 26px, label "Quick Add". Its `tabPress` is `preventDefault()`ed and it
opens `<QuickAddSheet />` instead of navigating.

Messages badge comes from `useUnread()` — call `setMessages(n)` when your data
loads.

---

## 12. Navigation

Route types live in `src/navigation/routes.ts`. Every screen in the manifest
already has a route.

```
RootStack  (auth boundary: Login / Signup / Main)
  └─ AppStack   every authenticated screen, flat native stack
       └─ MainTabs   Home · Health · FAB · Messages · Profile
```

Detail screens push onto **AppStack** from any tab.

**To ship a screen:** import your component in
`src/navigation/AppStackNavigator.tsx` and replace the `P(...)` placeholder on
your route's line. Nothing else. Params are already typed — read them with:

```tsx
const { params } = useRoute<RouteProp<AppStackParamList, 'LabResultDetail'>>();
```

---

## 13. Screen skeleton

```tsx
export function MyScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title="..." subtitle="..." />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <SectionHeader title="..." onAction={...} />
        <Card variant="flush">
          <ListRow icon="flask" tint="green" title="..." meta={[...]} value="Normal"
                   valueColor={colors.statusNormal} onPress={...} divider />
          <ListRow ... />
        </Card>
      </ScrollView>
    </View>
  );
}
```

Import components from `src/components` (barrel) and tokens from `src/theme/theme`.
