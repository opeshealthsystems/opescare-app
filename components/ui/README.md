# `components/ui` — the OpesCare design system

Every primitive here was derived from the reference screens in
`Mobile app screens/`. If you are building a screen, **compose these** rather
than hand-rolling views: the whole point is that eight screens should not end up
with eight different card radii.

Colours, radii, spacing and shadows come from `theme/tokens.js` only. Never
hardcode a hex. Icons are **Lucide only** — never emoji.

---

## Quick pick

| I need to… | Use |
|---|---|
| Wrap a whole screen | [`Screen`](#screen) |
| Group content into a white block | [`Card`](#card) |
| Label that block | [`SectionHeader`](#sectionheader) |
| Lay out one item in a list | [`ListRow`](#listrow) |
| Show a status word next to something | [`Chip`](#chip) |
| Show a measurement or a count | [`StatTile`](#stattile) |
| Say "there is nothing here" | [`EmptyState`](#emptystate) |
| Fill the screen while data loads | [`Skeleton`](#skeleton) |
| The action the screen exists for | [`Button`](#button) |
| Take text input | [`TextField`](#textfield) |
| The brand lockup | [`Logo`](#logo) |
| A count over a bell/tab icon | [`UnreadBadge`](#unreadbadge) |

---

## The visual language, in numbers

These are the values the primitives encode. Match them if you build something
bespoke.

| Thing | Value |
|---|---|
| Page background | `cream.50` → `cream.100` vertical wash |
| Card | `surface.card` (#FFF), radius **20**, 1px `line.subtle`, `elevation.md` |
| Card padding | **16** (`md`), **20** for hero cards |
| Gap between cards | **16** |
| Screen horizontal padding | **24** |
| Icon tile (list row) | **52**, radius **14**, tone surface fill, 24px icon |
| Icon tile (section header) | **44**, radius **14**, 20px icon |
| Chip | radius `pill`, **24**h (`sm`) / **34**h (`md`), 1px border |
| Hairline | 1px `line.subtle` inside cards, `line.default` between blocks |
| Control height | **56** (buttons, inputs) |
| Screen title | 28 / 34, extrabold, tracking −0.4 |
| Section title | 18 / 24, bold |
| Overline | 12, bold, uppercase, tracking 1.1, `gold.600` |
| Row title | 16 / 22, semibold |
| Body & subtitle | 14–16, `navy.secondary` |
| Caption / meta | 12, `navy.muted` |

**Tones.** Every primitive takes a `tone` from `./tone`: `gold` (brand),
`neutral`, `success`, `warning`, `danger`, `info`. Pick by *meaning* — "verified"
is `success` because it is good news, not because it is green.

---

## Screen

**Use this when:** you are writing the outermost element of a route. Always.

```tsx
<Screen className="px-0">
  <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>…</ScrollView>
</Screen>
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `className` | `string` | — | Layout classes. A padding utility **replaces** the built-in `px-6`. |
| `background` | `'cream' \| 'flat' \| 'white' \| 'inverse'` | `'cream'` | `cream` paints the warm page wash. |
| `edges` | `Edge[]` | `['top','bottom']` | Drop `bottom` for a sticky action bar. |
| …plus all `ViewProps` | | | |

**The padding rule.** `Screen` applies `px-6` (24px) *only when the caller does
not supply their own horizontal padding*. Both shapes are correct and both end
at 24px effective:

- `<Screen>` + unpadded ScrollView → 24px, from `Screen`.
- `<Screen className="px-0">` + ScrollView padded 24 → 24px, from the ScrollView.

Do **not** go back to concatenating `px-6` with the caller's class. NativeWind v4
resolves conflicting utilities by *stylesheet* order, not string order, and
Tailwind emits `px-0` before `px-6` — so `px-6` won and every `px-0` screen was
silently double-padded to 48px of a 375px viewport.

## Card

**Use this when:** you are about to write `<View className="rounded-2xl bg-white p-4">`.

```tsx
<Card className="mb-4">…</Card>
<Card variant="gold" padding="lg">…Health ID…</Card>
```

| Prop | Type | Default |
|---|---|---|
| `variant` | `'elevated' \| 'flat' \| 'outlined' \| 'sunken' \| 'gold' \| 'inverse'` | `'elevated'` |
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` |
| `onPress` | `() => void` | — makes the card tappable |
| `disabled`, `className`, `style`, `accessibilityLabel`, `testID` | | |

At most **one** `gold` or `inverse` card per screen — they are hero treatments.
Use `padding="none"` when the card contains `ListRow`s that pad themselves.

## SectionHeader

**Use this when:** a bold `<Text>` is about to sit directly above a list or grid.

```tsx
<SectionHeader title={t('home.vitals')} icon={HeartPulse}
               actionLabel={t('common.seeAll')} onAction={() => router.push('/vitals')} />

<SectionHeader variant="overline" title={t('home.needsAttention')} count={2} />
```

| Prop | Type | Default |
|---|---|---|
| `title` | `string` | required |
| `subtitle` | `string` | — |
| `icon` | `LucideIcon` | — rendered in a tinted tile |
| `tone` | `Tone` | `'gold'` |
| `count` | `number` | — pill after the title |
| `actionLabel` + `onAction` | `string`, `() => void` | — right-hand "See all ›" |
| `variant` | `'title' \| 'overline'` | `'title'` |

`title` heads content **inside** a card. `overline` heads a group **of** cards,
sitting on the page background.

## ListRow

**Use this when:** you are laying out a row inside a `Card`. This is the most
repeated shape in the references — notifications, settings, vitals, payment
lines are all the same anatomy.

```tsx
<Card padding="none" className="mb-4">
  {items.map((it, i) => (
    <ListRow key={it.id} icon={FileText} tone="gold"
             title={it.name} subtitle={it.facility} meta={it.date}
             onPress={() => router.push(`/documents/${it.id}`)}
             divider={i < items.length - 1} className="px-4" />
  ))}
</Card>
```

| Prop | Type | Default |
|---|---|---|
| `title` | `string` | required |
| `subtitle` | `string` | — 2 lines max |
| `value` / `meta` | `string` | — right-aligned, `value` emphasised |
| `icon` + `tone` | `LucideIcon`, `Tone` | tone `'gold'` |
| `leading` | `ReactNode` | — replaces the icon tile (avatar, date block) |
| `trailing` | `ReactNode` | — replaces value/meta (a `Chip`, a Switch) |
| `onPress`, `showChevron`, `divider`, `destructive`, `unread`, `disabled` | | chevron defaults to "pressable?" |

Put `divider` on every row **except the last** so the group reads as one block.

## Chip

**Use this when:** you need a status word next to something ("Verified", "In
stock", "Cancelled"), or the horizontal filter row under a screen title.
Not a button — that is `Button`.

```tsx
<Chip label={t('status.verified')} tone="success" icon={BadgeCheck} />
<Chip label={t('filters.upcoming')} count={5} size="md" variant="outline"
      selected={filter === 'upcoming'} onPress={() => setFilter('upcoming')} />
```

| Prop | Type | Default |
|---|---|---|
| `label` | `string` | required |
| `tone` | `Tone` | `'neutral'` |
| `variant` | `'soft' \| 'solid' \| 'outline'` | `'soft'` |
| `size` | `'sm' \| 'md'` | `'sm'` |
| `icon`, `dot`, `count`, `selected`, `onPress`, `disabled` | | |

## StatTile

**Use this when:** you are surfacing a measurement or a count. If there is no
number, you want a `ListRow`.

```tsx
<Card>
  <StatTileGroup>
    <StatTile icon={HeartPulse} label={t('vitals.heartRate')} value="72" unit="bpm" status={t('vitals.normal')} />
    <StatTile icon={Droplet} label={t('vitals.bp')} value="120/80" unit="mmHg" status={t('vitals.normal')} />
  </StatTileGroup>
</Card>
```

| Prop | Type | Default |
|---|---|---|
| `label`, `value` | `string` | required |
| `unit` | `string` | — smaller, lighter, on the baseline |
| `icon` + `tone` | `LucideIcon`, `Tone` | tone `'gold'` |
| `status` + `statusTone` | `string`, `Tone` | statusTone `'success'` — dot + label |
| `align` | `'center' \| 'left'` | `'center'` |
| `onPress` | `() => void` | — |

`StatTileGroup` lays 2–4 tiles in a row with the hairline separators from the
references. More than 4 gets cramped — split into two groups.

## EmptyState

**Use this when:** a list came back empty, a search found nothing, or a request
failed. The demo patient has no labs, prescriptions or documents, so these
**will** be on screen — an unstyled "No results" line is the clearest tell that
a screen was not finished.

```tsx
<EmptyState icon={FlaskConical} title={t('labs.emptyTitle')} description={t('labs.emptyBody')}
            actionLabel={t('labs.bookTest')} onAction={() => router.push('/appointments/book')} />

<EmptyState tone="danger" icon={CircleAlert} title={t('common.errorTitle')}
            description={t('common.errorBody')}
            actionLabel={t('common.retry')} onAction={() => query.refetch()} />
```

| Prop | Type | Default |
|---|---|---|
| `title` | `string` | required |
| `description` | `string` | — |
| `icon` | `LucideIcon` | `Inbox` |
| `tone` | `Tone` | `'gold'` (`'danger'` for errors) |
| `actionLabel` + `onAction` | | primary `Button` |
| `secondaryActionLabel` + `onSecondaryAction` | | outline `Button` |
| `compact` | `boolean` | `false` — use inside a Card rather than a page |

## Skeleton

**Use this when:** a screen is loading and you know roughly what shape the
content will be. Skeletons that mirror the layout read as "loading"; a lone
centred spinner reads as "stuck".

```tsx
if (query.isLoading) return <SkeletonList count={4} className="px-6" />;
```

| Export | Use for |
|---|---|
| `SkeletonList({ count, gap })` | the default list-screen loading state |
| `SkeletonCard({ rows, showHeader })` | one card-shaped placeholder |
| `SkeletonRow({ showIcon })` | one `ListRow`-shaped placeholder |
| `SkeletonText({ lines, lineHeight, lastLineWidth })` | a paragraph |
| `Skeleton({ width, height, radius, circle })` | one bespoke block |

All of them share one opacity pulse, so a screenful breathes in sync.

## Button

**Use this when:** it is the action the screen exists for. One `primary` per
view; everything else is `outline`, a `Chip`, or a `SectionHeader` action.

| Prop | Type | Default |
|---|---|---|
| `label` | `string` | required |
| `onPress` | `() => void` | required |
| `variant` | `'primary' \| 'outline'` | `'primary'` |
| `loading`, `disabled` | `boolean` | `false` |
| `leftIcon` | `LucideIcon` | `ArrowRight` |
| `showChevron` | `boolean` | `true` |
| `showLeftIcon` | `boolean` | `true` — `false` drops the left badge for a plain centred label |

Disabled swaps to a flat cream fill rather than a faded gradient, so a blocked
CTA reads as blocked instead of half-rendered.

## TextField

**Use this when:** you need single-line text entry. Focus lifts the border to
brand gold with a soft ring and tints the leading icon.

| Prop | Type | Default |
|---|---|---|
| `label`, `error`, `hint` | `string` | — `hint` hides while `error` is set |
| `icon` | `LucideIcon` | — leading |
| `secureToggle` | `boolean` | — adds the eye toggle |
| `required` | `boolean` | — gold asterisk on the label |
| `rightAdornment` | `ReactNode` | — unit, "Verify" link, country code |
| `containerClassName` | `string` | `'mb-4'` |
| …plus all `TextInputProps` | | |

## Logo

`<Logo />` full lockup · `<Logo size={80} markOnly />` mark only. Everything
scales from `size`, so it holds from a 48px inline mark to a 128px splash lockup.

## UnreadBadge

Renders **nothing at 0**, so pass a count straight through without a guard.

```tsx
<View>
  <Bell color={colors.navy.text} size={22} />
  <UnreadBadge count={unreadCount} label={t('a11y.unread', { count: unreadCount })} />
</View>
```

| Prop | Type | Default |
|---|---|---|
| `count` | `number` | required |
| `max` | `number` | `99` — above this renders `99+` |
| `label` | `string` | — accessibility label |
| `tone` | `Tone` | `'danger'` |
| `standalone` | `boolean` | `false` — `true` drops absolute positioning for inline use |

---

## Gotchas

1. **`className` does not work on `LinearGradient`** (or any third-party
   component — no `cssInterop` is registered). It silently no-ops. Use inline
   `style`. This has already caused one round of broken buttons.
2. **Never extend `fontSize` or `spacing` in `tailwind.config.js`.** Tailwind
   already defines those scales and ours disagrees (`typography.size.xl` is 22,
   Tailwind's `text-xl` is 20). Extending would resize every screen.
3. **`radii` shadows Tailwind's `borderRadius` keys.** It deliberately omits
   `2xl`/`3xl` so `rounded-2xl` stays 16 and `rounded-3xl` stays 24.
4. **Do not add a `neutral` colour** to the Tailwind config — it would replace
   Tailwind's stock `neutral-50…950` grey palette. The brand's neutral text is
   `navy-secondary`.
5. **Tokens are additive-only.** Screens reference them by name; renaming or
   removing one breaks screens silently, at runtime, with no type error.
