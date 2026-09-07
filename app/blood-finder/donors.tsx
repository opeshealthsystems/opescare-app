import { useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import { useAuthStore } from '@/lib/store/auth';
import { useBloodOptions, type BloodGroupValue } from '@/lib/api/queries';
import { useDonorSearch, type DonorResult } from '@/lib/api/donorQueries';

/**
 * Find Donors (SB-02) — the volunteer register, searched.
 *
 * ── This is the reference's layout over a different data source ───────────
 * The image is a browsable list of named people with photographs, ages, blood
 * groups, last-donation dates, distances to a tenth of a kilometre and direct
 * Call buttons. Read off `patients`, that is enumeration of patients and of
 * health data, which this platform forbids outright — no patient lists, no
 * `LIKE` search, exact Health ID only.
 *
 * So the arrangement is the reference's — lead panel, a Search & Filter card
 * of dropdowns, a safety strip, a results header with a sort control, donor
 * rows, a closing "can't find one?" panel — and what fills them is the CONSENT
 * REGISTER: people who completed SB-03 and said yes. Four things in the image
 * are deliberately not here, and the screen says why rather than leaving a gap:
 *
 *   - No photograph. Nobody consented to have their face listed by blood group.
 *   - No age or date of birth.
 *   - No distance. The register stores a published AREA and nothing finer; a
 *     live distance to a named person is a location. This is also why the
 *     reference's "Search Radius" dropdown and its "Sort by: Nearest" are not
 *     here — there is no kilometre to sort or filter on, in the API or on the
 *     screen.
 *   - No phone number unless that volunteer separately agreed to publish one.
 *     Where they did not, the screen offers the route that always works — ask
 *     a blood bank, which holds its own donor list and can call on your behalf.
 *
 * ── The search refuses to run without a group ─────────────────────────────
 * There is no "show me everyone" state, on the screen or in the API. A
 * register you can page through from the top is the directory this design
 * exists not to be. Both controls in the results header narrow or reorder what
 * ONE group search already returned; neither of them can list the register.
 *
 * ── Fields the reference draws that this screen does not ──────────────────
 *   - "Search Radius": no distance exists (above).
 *   - "Availability" / the green "Available Now" pill / "Usually available
 *     8:00 AM – 8:00 PM": `DonorResult` carries no availability and no hours,
 *     and inventing "available now" about a person is the worst kind of guess.
 *   - "Chat": there is no messaging channel to a volunteer. A button that
 *     opens nothing is worse than no button.
 *   - "Create Donor Alert": there is no alert endpoint. The panel keeps the
 *     route that does exist and does the same job — a blood bank.
 *
 * ── 375pt compromises (the reference frame is ~430pt) ─────────────────────
 *   - The lead panel's "How it works" button sits UNDER the copy rather than
 *     beside it: beside it the two-line body was left about 110pt of width.
 *   - The reference's second filter row is three dropdowns; two of the three
 *     have no data behind them (above), so the row is Last-donated + the
 *     Search action, which is what the row is for.
 */

/** Client-side narrowing of one group search — see `LAST_DONATED` below. */
type LastDonatedFilter = 'any' | 'm3' | 'm6';
/** Reordering of the same result set. There is no "nearest" — no distance. */
type DonorSort = 'since' | 'area';

const LAST_DONATED: { value: LastDonatedFilter; months: number }[] = [
  { value: 'any', months: 0 },
  { value: 'm3', months: 3 },
  { value: 'm6', months: 6 },
];

function dial(number: string | null): void {
  if (!number) return;
  void Linking.openURL(`tel:${number.replace(/\s+/g, '')}`);
}

export default function FindDonorsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const patient = useAuthStore((s) => s.patient);
  const options = useBloodOptions();

  const [bloodGroup, setBloodGroup] = useState<BloodGroupValue | null>(
    (patient?.blood_group as BloodGroupValue | undefined) ?? null,
  );
  const [city, setCity] = useState('');
  const [appliedCity, setAppliedCity] = useState('');
  const [lastDonated, setLastDonated] = useState<LastDonatedFilter>('any');
  const [sort, setSort] = useState<DonorSort>('since');
  // The results header's filter button collapses the secondary filter row —
  // the reference draws the icon but has nowhere to say what it does.
  const [filtersOpen, setFiltersOpen] = useState(true);

  const search = useDonorSearch({ bloodGroup, city: appliedCity || null });

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  const groupOptions = options.data?.blood_groups ?? [];
  const donors = search.data?.data ?? [];
  const cappedAt = search.data?.meta?.capped_at ?? 20;

  /**
   * Both of these act on the rows the ONE group search returned — they cannot
   * widen it, and with no group there is nothing to act on.
   *
   * "Last donated" reads `months_since`, which is the only donation fact the
   * register publishes. A volunteer with no recorded donation is KEPT by every
   * option: the register does not know of a recent donation, and dropping
   * people for a gap in its own records would hide willing donors.
   */
  const shown = useMemo(() => {
    const minMonths = LAST_DONATED.find((o) => o.value === lastDonated)?.months ?? 0;
    const filtered =
      minMonths === 0
        ? donors
        : donors.filter((d) => d.months_since === null || d.months_since >= minMonths);

    return [...filtered].sort((a, b) => {
      if (sort === 'area') return (a.area ?? '').localeCompare(b.area ?? '');
      // Longest since donating first; unknown last, because it is unknown.
      const av = a.months_since ?? -1;
      const bv = b.months_since ?? -1;
      return bv - av;
    });
  }, [donors, lastDonated, sort]);

  const groupSelectOptions = groupOptions.map((g) => ({ value: g.value, label: g.label }));
  const lastDonatedOptions = LAST_DONATED.map((o) => ({
    value: o.value,
    label: t(`donorSearch.lastDonated.${o.value}`),
  }));
  const sortOptions: { value: DonorSort; label: string }[] = [
    { value: 'since', label: t('donorSearch.sort.since') },
    { value: 'area', label: t('donorSearch.sort.area') },
  ];

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('donorSearch.title')}
        subtitle={t('donorSearch.subtitle')}
        onBack={goBack}
        right={
          <TouchableOpacity
            onPress={() => router.push('/help')}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('donorSearch.help')}
            style={styles.helpAction}
          >
            <Icon name="help-circle" size={20} color={colors.statusCritical} />
            <Text style={styles.helpLabel}>{t('donorSearch.help')}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Lead panel — tinted red with a round mark, as drawn. */}
        <View style={styles.leadPanel}>
          <View style={styles.leadRow}>
            <View style={styles.leadMark}>
              <Icon name="droplet" size={22} color={colors.statusCritical} />
            </View>
            <View style={styles.leadBody}>
              <Text style={styles.leadTitle}>{t('donorSearch.leadTitle')}</Text>
              <Text style={styles.leadText}>{t('donorSearch.leadBody')}</Text>
            </View>
          </View>
          {/* 375pt: under the copy, not beside it — see the docblock. */}
          <CareButton
            label={t('donorSearch.howItWorks')}
            icon="book"
            variant="danger"
            size="sm"
            onPress={() => router.push('/blood-finder/education')}
            style={styles.leadAction}
          />
        </View>

        {/* ── Search & filter ──────────────────────────────────────────────── */}
        <Card>
          <View style={styles.cardHead}>
            <Icon name="filter" size={18} color={colors.statusCritical} />
            <Text style={styles.cardHeadTitle}>{t('donorSearch.filterTitle')}</Text>
          </View>

          {/* Row 1, as drawn: Blood group | Area. */}
          <View style={styles.fieldRow}>
            <SelectField
              style={styles.fieldCell}
              label={t('donorSearch.groupLabel')}
              placeholder={t('donorSearch.groupPlaceholder')}
              icon="droplet"
              iconColor={colors.statusCritical}
              value={bloodGroup}
              options={groupSelectOptions}
              onSelect={setBloodGroup}
              sheetTitle={t('donorSearch.groupLabel')}
            />
            {/*
              A free-text area, not a dropdown: the API returns no list of
              towns to populate one with, and a hardcoded list would be
              invented data.
            */}
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel} numberOfLines={1}>
                {t('donorSearch.areaLabel')}
              </Text>
              <View style={styles.fieldBox}>
                <Icon name="location" size={16} color={colors.textMuted} />
                <TextInput
                  style={styles.fieldInput}
                  value={city}
                  onChangeText={setCity}
                  onSubmitEditing={() => setAppliedCity(city.trim())}
                  placeholder={t('donorSearch.areaPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="search"
                  accessibilityLabel={t('donorSearch.areaLabel')}
                />
              </View>
            </View>
          </View>

          {/* Row 2. The reference's "Search Radius" and "Availability" have no
              data behind them, so the row carries the one real filter and the
              action that runs the search. */}
          <View style={styles.fieldRow}>
            {/* Collapsing the filters must never take the action that runs the
                search with them, so only the dropdown is conditional. */}
            {filtersOpen ? (
              <SelectField
                style={styles.fieldCell}
                label={t('donorSearch.lastDonatedLabel')}
                placeholder={t('donorSearch.lastDonated.any')}
                icon="clock"
                value={lastDonated}
                options={lastDonatedOptions}
                onSelect={setLastDonated}
                sheetTitle={t('donorSearch.lastDonatedLabel')}
              />
            ) : null}
            {/* The action sits in the second cell rather than under its own
                label, so the row reads as the reference's row of controls.
                `justifyContent` bottom-aligns it with the dropdown beside
                it — an empty label node would be read out by a screen
                reader. */}
            <View style={[styles.fieldCell, styles.fieldCellAction]}>
              <CareButton
                label={t('donorSearch.apply')}
                icon="search"
                variant="primary"
                size="sm"
                onPress={() => setAppliedCity(city.trim())}
              />
            </View>
          </View>

          {/* The blue safety strip with its "Stay safe" pill, inside the card
              as drawn. The pill is a badge, not a control: there is no safety
              screen behind it to open. */}
          <View style={styles.safetyStrip}>
            <Icon name="info" size={18} color={colors.statusPending} />
            <View style={styles.safetyBody}>
              <Text style={styles.safetyTitle}>{t('donorSearch.safetyTitle')}</Text>
              <Text style={styles.safetyText}>{t('donorSearch.safetyBody')}</Text>
            </View>
            <View style={styles.safetyPill} accessible accessibilityLabel={t('donorSearch.safetyPill')}>
              <Icon name="shield-check" size={13} color={colors.statusPending} />
              <Text style={styles.safetyPillText}>{t('donorSearch.safetyPill')}</Text>
            </View>
          </View>
        </Card>

        {/* ── Results ──────────────────────────────────────────────────────── */}
        {!bloodGroup ? (
          <Card variant="flush">
            <EmptyState
              icon="droplet"
              tint="red"
              title={t('donorSearch.pickGroupTitle')}
              message={t('donorSearch.pickGroupBody')}
            />
          </Card>
        ) : search.isPending ? (
          <LoadingBlock label={t('donorSearch.searching')} />
        ) : search.isError ? (
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('donorSearch.failedTitle')}
              message={t('donorSearch.failedBody')}
              actionLabel={t('donorSearch.retry')}
              onAction={() => search.refetch()}
            />
          </Card>
        ) : donors.length === 0 ? (
          <Card variant="flush">
            <EmptyState
              icon="users"
              tint="blue"
              title={t('donorSearch.emptyTitle')}
              message={t('donorSearch.emptyBody')}
            />
          </Card>
        ) : (
          <View style={styles.stack}>
            {/* Results header: count | sort | filter toggle, as drawn. */}
            <View style={styles.resultsHead}>
              <Text style={styles.resultsCount} numberOfLines={1}>
                {t('donorSearch.found', { count: shown.length })}
              </Text>
              <SelectField
                compact
                style={styles.sortSelect}
                label={t('donorSearch.sortLabel')}
                placeholder={t('donorSearch.sort.since')}
                value={sort}
                options={sortOptions}
                onSelect={setSort}
                sheetTitle={t('donorSearch.sortSheetTitle')}
                accessibilityLabel={t('donorSearch.sortLabel')}
              />
              <TouchableOpacity
                onPress={() => setFiltersOpen((open) => !open)}
                activeOpacity={0.75}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel={
                  filtersOpen ? t('donorSearch.filtersHide') : t('donorSearch.filtersShow')
                }
                accessibilityState={{ expanded: filtersOpen }}
              >
                <Icon name="filter" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {shown.length === 0 ? (
              <Card variant="flush">
                <EmptyState
                  icon="clock"
                  tint="blue"
                  title={t('donorSearch.filterEmptyTitle')}
                  message={t('donorSearch.filterEmptyBody')}
                  actionLabel={t('donorSearch.filterClear')}
                  onAction={() => setLastDonated('any')}
                />
              </Card>
            ) : (
              shown.map((donor) => <DonorCard key={donor.id} donor={donor} />)
            )}

            {donors.length >= cappedAt ? (
              <NoticeBanner
                icon="info"
                tone="pending"
                message={t('donorSearch.capped', { count: cappedAt })}
              />
            ) : null}
          </View>
        )}

        {/* The reference's "Can't find the right donor?" panel, tinted red as
            drawn. Its button is NOT "Create Donor Alert" — no alert endpoint
            exists — but the route that always works, and that does not depend
            on any volunteer having published a number. */}
        <View style={styles.leadPanel}>
          <View style={styles.leadRow}>
            <View style={styles.leadMark}>
              <Icon name="heart-pulse" size={22} color={colors.statusCritical} />
            </View>
            <View style={styles.leadBody}>
              <Text style={styles.leadTitle}>{t('donorSearch.noLuckTitle')}</Text>
              <Text style={styles.leadText}>{t('donorSearch.noLuckBody')}</Text>
            </View>
          </View>
          <View style={styles.noLuckActions}>
            <CareButton
              label={t('donorSearch.askBloodBank')}
              icon="droplet"
              variant="danger"
              size="sm"
              onPress={() => router.push('/blood-finder')}
              style={[styles.noLuckAction, styles.noLuckPrimary]}
            />
            <CareButton
              label={t('donorSearch.becomeDonor')}
              icon="heart-pulse"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/blood-finder/become-donor')}
              style={styles.noLuckAction}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

/**
 * One volunteer.
 *
 * Everything drawn here came back from the register. There is no photograph,
 * no age, no gender, no distance and no availability pill because the API
 * holds none of them — see the screen docblock.
 */
function DonorCard({ donor }: { donor: DonorResult }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const since =
    donor.months_since === null
      ? t('donorSearch.neverRecorded')
      : donor.months_since === 0
        ? t('donorSearch.donatedThisMonth')
        : t('donorSearch.donatedMonthsAgo', { count: donor.months_since });

  return (
    <Card variant="flush">
      <View style={styles.donorRow}>
        {/* An initial, not a face. Nobody consented to have their photograph
            listed beside their blood group. */}
        <View style={styles.donorMark}>
          <Text style={styles.donorInitial}>{donor.display_name.slice(0, 1).toUpperCase()}</Text>
        </View>

        <View style={styles.donorBody}>
          <Text style={styles.donorName} numberOfLines={1}>
            {donor.display_name}
          </Text>
          <View style={styles.donorMeta}>
            <Icon name="droplet" size={13} color={colors.statusCritical} />
            <Text style={styles.donorGroup}>{donor.blood_group}</Text>
            {donor.area ? (
              <>
                <Icon name="location" size={13} color={colors.textMuted} />
                <Text style={styles.donorArea} numberOfLines={1}>
                  {donor.area}
                </Text>
              </>
            ) : null}
          </View>
          <View style={styles.donorMeta}>
            <Icon name="clock" size={13} color={colors.textMuted} />
            <Text style={styles.donorSince}>{since}</Text>
          </View>
        </View>

        <View style={styles.donorAside}>
          {donor.phone_shared ? (
            <CareButton
              label={t('donorSearch.call')}
              icon="phone"
              variant="dangerSolid"
              size="sm"
              onPress={() => dial(donor.contact_phone)}
            />
          ) : (
            /* They agreed to be listed, not to be rung. Saying so — and
               pointing at the blood bank that can call for you — is better
               than a dead button or a fabricated number. */
            <>
              <View style={styles.withheld}>
                <Icon name="shield-check" size={14} color={colors.textMuted} />
                <Text style={styles.withheldText}>{t('donorSearch.phoneWithheld')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/blood-finder')}
                activeOpacity={0.7}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('donorSearch.viaBloodBank')}
                accessibilityHint={t('donorSearch.viaBloodBankHint')}
              >
                <Text style={styles.withheldLink}>{t('donorSearch.viaBloodBank')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}

/**
 * The reference's dropdown control.
 *
 * Deliberately local to this screen rather than added to the shared kit: the
 * kit is owned elsewhere, and SB-03 carries its own copy for the same reason.
 */
function SelectField<T extends string>({
  label,
  value,
  options,
  onSelect,
  placeholder,
  icon,
  iconColor,
  sheetTitle,
  compact,
  style,
  accessibilityLabel,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onSelect: (value: T) => void;
  placeholder: string;
  icon?: IconName;
  iconColor?: string;
  sheetTitle?: string;
  /** Header-sized: no label, smaller type. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <View style={style}>
      {compact ? null : (
        <Text style={styles.fieldLabel} numberOfLines={1}>
          {label}
        </Text>
      )}
      <TouchableOpacity
        style={[styles.fieldBox, compact && styles.fieldBoxCompact]}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        // A placeholder is not a name, and the label above is a separate node.
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityState={{ expanded: open }}
      >
        {icon ? <Icon name={icon} size={16} color={iconColor ?? colors.textMuted} /> : null}
        <Text
          style={[
            styles.fieldValue,
            compact && styles.fieldValueCompact,
            !selected && styles.fieldPlaceholder,
          ]}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={compact ? 14 : 16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('donorSearch.closeSheet')}
        >
          {/* Swallows the press so tapping the sheet does not dismiss it. */}
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {sheetTitle ?? label}
            </Text>
            <ScrollView bounces={false}>
              {options.map((option) => {
                const on = option.value === value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.sheetOption}
                    activeOpacity={0.75}
                    onPress={() => {
                      onSelect(option.value);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.sheetOptionText, on && styles.sheetOptionTextOn]}>
                      {option.label}
                    </Text>
                    {on ? (
                      <Icon name="check" size={18} color={colors.statusCritical} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.sm },

    helpAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    helpLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.statusCritical,
    },

    leadPanel: {
      backgroundColor: c.statusCriticalBg,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.tintRedBg,
      padding: spacing.md,
    },
    leadRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    leadMark: {
      width: 44,
      height: 44,
      borderRadius: radii.pill,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leadBody: { flex: 1 },
    leadTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.statusCritical,
    },
    leadText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
      marginTop: 4,
    },
    // `danger` is a white button with a very pale red border; the reference's
    // outlined buttons carry the full red, so the border is lifted here.
    leadAction: { marginTop: spacing.sm, borderColor: c.statusCritical },

    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    cardHeadTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },

    fieldRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    fieldCell: { flex: 1, minWidth: 0 },
    fieldCellAction: { justifyContent: 'flex-end' },
    fieldLabel: {
      fontFamily: typography.fontFamily.medium,
      // 11px, not `size.xs`: two labels have to sit side by side in half a
      // 375pt card without truncating.
      fontSize: 11,
      lineHeight: 15,
      color: c.textSecondary,
      marginBottom: 5,
    },
    fieldBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minWidth: 0,
      minHeight: 44,
      paddingHorizontal: spacing.sm + 2,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    fieldBoxCompact: { minHeight: 34, paddingHorizontal: spacing.sm, gap: 4 },
    fieldValue: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    fieldValueCompact: { fontSize: typography.size.xs },
    fieldPlaceholder: {
      fontFamily: typography.fontFamily.regular,
      color: c.textMuted,
    },
    fieldInput: {
      flex: 1,
      // See PillInput's note: on web an <input> keeps a content-based minimum
      // width and will not shrink inside a half-width cell without this.
      minWidth: 0,
      paddingVertical: 10,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    safetyStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radii.sm,
      backgroundColor: c.statusPendingBg,
    },
    safetyBody: { flex: 1, minWidth: 0 },
    safetyTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.statusPending,
    },
    safetyText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textSecondary,
      marginTop: 2,
    },
    safetyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radii.pill,
      backgroundColor: c.surface,
    },
    safetyPillText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      color: c.statusPending,
    },

    resultsHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: 2,
    },
    resultsCount: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    sortSelect: { width: 148 },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },

    donorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
    },
    donorMark: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: c.statusCriticalBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    donorInitial: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: c.statusCritical,
    },
    donorBody: { flex: 1, minWidth: 0, gap: 2 },
    donorName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    donorMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    donorGroup: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      color: c.statusCritical,
      marginRight: 4,
    },
    donorArea: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    donorSince: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    donorAside: { width: 110, alignItems: 'flex-end', gap: 4 },
    withheld: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
    withheldText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      color: c.textMuted,
    },
    withheldLink: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      lineHeight: 15,
      color: c.link,
      textAlign: 'right',
    },

    noLuckActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    noLuckAction: { flex: 1 },
    noLuckPrimary: { borderColor: c.statusCritical },

    sheetBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '70%',
      backgroundColor: c.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    sheetTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
      marginBottom: spacing.sm,
    },
    sheetOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingVertical: spacing.sm + 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    sheetOptionText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    sheetOptionTextOn: {
      fontFamily: typography.fontFamily.semiBold,
      color: c.statusCritical,
    },
  });
