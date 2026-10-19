# Joined cards audit (2026-10-19)

The owner's rule is that **nothing in the app is joined**. No two rows or items share one card behind hairline dividers or borders. That covers results, settings, key/value facts, logs, notifications and clinician counts alike. Each item is its own card, and sibling cards sit in `<CardStack spacing="sm">` (12pt gap) or `<ResultList>` (10pt gap).

This replaces commit 3a7799f's exception, which kept information lists (allergies, conditions, vitals, settings, fact tables) as one flush card with hairlines.

## The guard: `__tests__/noJointedCards.test.ts`

The guard is a static TypeScript-AST scan of `app/**` and `components/**`. It fails the suite on any of the following:

1. **Adjacent `<Card>`s with no spacing.** Two adjacent `<Card>` siblings, or a `.map` returning `<Card>`, with no `CardStack`, `ResultList`, `gap`/`rowGap` or card margin between them. This rule is unchanged.
2. **Two or more rows in one card.** A `<Card>` that contains two or more row components, tappable or not, fails. Row components are any `*Row` (ListRow, ToggleRow, InfoRow, FactRow, SummaryRow, StepRow and so on) plus `CountTile`. A `.map(...)` that produces rows inside one card counts as a list on its own. Nested cards are scanned separately.
3. **A `divider` prop on a row.** Any `*Row` rendered with a truthy `divider` prop fails, anywhere in the app. Only `divider={false}` passes.
4. **A separator that draws a line.** An `ItemSeparatorComponent` fails if it draws a line: `hairline`, `borderBottomWidth`/`borderTopWidth`, a `Divider`, or a view of height 1 or `StyleSheet.*`. A plain spacer passes.

The self-tests cover each rule, both a failing case and a passing case.

**Limits.** The guard cannot see these, so they were checked by hand:
- Wrapper components that render `{children}` into one card:
  - the `Section` helper in records
  - `SettingsUi` `GroupCard`
  - `ProfilePanel`'s FactGrid
  - `OptionCard` in pharmacy and blood
  - `SectionCard` in emergency
- Row components that draw their own bottom border.

These are all fixed.

## What may still sit inside one card

These are one block, not a list of separate items:

- The stats strip of one care plan (StatTiles).
- The family "care circle" counts.
- The profile trust strip.
- The hero action strip on the facility and doctor pages.
- The pharmacy-desk prescription and reservation header. Its `Fact` lines describe one object and have no separators between them.
- The passport's multi-column tables, which are one table each.
- Vertical column rules inside one item.
- Section borders inside one item's own card, such as a card footer.

## Screens and components changed

Each listed file now renders one card per item and has its row hairlines removed. Ignored `divider` props are kept only as deprecated no-ops so that types stay stable.

- `app/(auth)/permissions.tsx`
- `app/(tabs)/home.tsx`
- `app/(tabs)/messages.tsx`
- `app/(tabs)/records.tsx`
- `app/about.tsx`
- `app/appointments/[id].tsx`
- `app/blood-finder/bank.tsx`
- `app/blood-finder/emergency.tsx`
- `app/care-map.tsx`
- `app/care-plans.tsx`
- `app/clinician/appointments/[id].tsx`
- `app/clinician/desk/appointment/[id].tsx`
- `app/clinician/home.tsx`
- `app/clinician/lab/order/[id].tsx`
- `app/clinician/messages.tsx`
- `app/clinician/patient/[id].tsx`
- `app/clinician/patient/[id]/[section].tsx`
- `app/clinician/pharmacy/index.tsx`
- `app/clinician/pharmacy/prescription/[id].tsx`
- `app/clinician/pharmacy/reservation/[id].tsx`
- `app/clinician/prescribe.tsx`
- `app/clinician/profile.tsx`
- `app/clinician/results/[id].tsx`
- `app/doctor/[id].tsx`
- `app/documents.tsx`
- `app/edit-profile.tsx`
- `app/export-records.tsx`
- `app/facility/[id].tsx`
- `app/family/[id].tsx`
- `app/health-passport.tsx`
- `app/help.tsx`
- `app/import-records.tsx`
- `app/labs/[id].tsx`
- `app/labs/[id]/report.tsx`
- `app/labs/[id]/trend.tsx`
- `app/labs/request.tsx`
- `app/labs/sample.tsx`
- `app/notifications.tsx`
- `app/offline-access.tsx`
- `app/prescriptions/[id].tsx`
- `app/prescriptions/index.tsx`
- `app/privacy/access-logs.tsx`
- `app/privacy/access.tsx`
- `app/privacy/export.tsx`
- `app/privacy/index.tsx`
- `app/referrals.tsx`
- `app/settings.tsx`
- `app/vitals/log.tsx`
- `components/appointments/book/sections.tsx`
- `components/appointments/book/styles.ts`
- `components/blood/finder/parts.tsx`
- `components/blood/finder/sections.tsx`
- `components/blood/request/sections.tsx`
- `components/care/shared.tsx`
- `components/chat/cards.tsx`
- `components/chat/shared.tsx`
- `components/desk/ProviderPicker.tsx`
- `components/desk/shared.tsx`
- `components/diagnostics/shared.tsx`
- `components/lab/shared.tsx`
- `components/meds/shared.tsx`
- `components/opes-ui/components/CardStack.tsx`
- `components/opes-ui/components/ResultList.tsx`
- `components/passport/blocks.tsx`
- `components/pharmacy/detail/PharmacyStockSection.tsx`
- `components/pharmacy/list/parts.tsx`
- `components/pharmacy/list/sections.tsx`
- `components/pharmacy/list/styles.ts`
- `components/pharmacy/medicine/parts.tsx`
- `components/pharmacy/medicine/sections.tsx`
- `components/pharmacy/medicine/styles.ts`
- `components/pharmacy/shared.tsx`
- `components/profile/ProfilePanel.tsx`
- `components/profile/styles.ts`
- `components/quick-add/QuickAddSheet.tsx`
- `components/settings/SettingsUi.tsx`

`components/opes-ui/components/ResultList.tsx` keeps its existing behaviour (separate cards). Its docblock now states the owner's rule in place of the old "keep settings and facts flush" note.

## Visual check

The static web build was checked at 412px wide against the local API, logged in as demo.reviewer and demo.doctor. Before and after pairs are in `docs/visual-qa/cards2-<screen>-{before,after}.webp` for:
- records, profile, settings, notifications, documents, labs, prescriptions, appointments
- payments, family, privacy-access-logs, health-passport, pharmacy, care-map
- clinician-home, clinician-desk

Every after-shot was inspected, and no two items share a card. The clinician "Waiting on you" counts were the last joined card the shots revealed. They were fixed, and `CountTile` was added to the guard.

Two shots do not show a list:
- `clinician-desk` shows the doctor role gate, because the desk belongs to other roles.
- `health-passport` opens on the cover page.
