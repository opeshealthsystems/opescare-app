import { useMemo, useState, type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  EmptyState,
  Icon,
  ResultList,
  ScreenHeader,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock } from '@/components/care/shared';
import { CARD_COMPONENTS, useBloodGroupMatrix } from '@/lib/api/bloodBankQueries';
import type { BloodBankResult, BloodComponentValue, BloodGroupValue } from '@/lib/api/queries';

/**
 * Blood Availability Map (SB-05).
 *
 * ── The grid is the point ─────────────────────────────────────────────────
 * The reference's value is not the map — the finder already has one — it is
 * the little per-GROUP grid on each blood bank: how much of O+, A+, B+ and AB+
 * each one reports, side by side, so somebody can see at a glance where to go
 * for a group that is scarce.
 *
 * That is one search per group for the whole page (useBloodGroupMatrix), keyed
 * exactly as the finder's own searches so anything already fetched is free.
 *
 * ── The legend has two states, not the reference's four ───────────────────
 * The reference's legend reads Good (3+) / Limited (1-2) / Low (0) / Unknown.
 * This platform's stock rows carry a RANGE STRING ("20+", "6-20"), never a
 * count, so those bands could only be built by inventing thresholds nobody
 * published — and the reference's own "Low (0)" is the exact fabrication that
 * would stop somebody travelling. A facility that has published nothing for a
 * group has NOT reported zero; the search only ever returns rows a facility
 * actually published. So the legend is honest and two-state — reported, and
 * not reported — and an unreported group renders "—", never 0.
 *
 * ── Where the layout departs from the image, and why ──────────────────────
 *   - The map's two round controls (locate-me, layers) are not drawn. The map
 *     is the finder's own embed with its own controls; a pair of round buttons
 *     that did nothing would be decoration pretending to be a control.
 *   - The reference's outlined "Filter" button is not drawn either: every
 *     filter here applies the moment it is chosen, so the button would have
 *     nothing to apply. The note under the row says so.
 *   - The reference's three filters are Blood Group / Radius / Show. The grid
 *     already answers "which group", so the three real axes of this page are
 *     area, radius and component — the third is what the whole matrix is
 *     searched for.
 *   - At 375pt three dropdowns plus a button cannot share one row, so the row
 *     is 2 + 1 rather than 3 + 1.
 *   - The reference's green "Open 24/7" line is opening hours. Nothing in
 *     `care_facilities` or the availability snapshot carries opening hours, so
 *     that line reports what IS known: how fresh the facility's own stock
 *     report is.
 *   - The reference's status dot bands stock. Here it is two-state for the
 *     same reason the legend is: green when this bank has reported any of the
 *     four groups, grey when it has reported none of them.
 */

const GROUPS: readonly BloodGroupValue[] = [
  'O+',
  'O-',
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
] as const;

/** The four the reference puts in its grid, in its order. */
const GRID_GROUPS: readonly BloodGroupValue[] = ['O+', 'A+', 'B+', 'AB+'] as const;

const CITIES = [
  { key: 'douala', name: 'Douala', lat: 4.0511, lng: 9.7679 },
  { key: 'yaounde', name: 'Yaounde', lat: 3.848, lng: 11.5021 },
] as const;

const RADII = [25, 50, 100] as const;

type SortKey = 'nearest' | 'name';

/** `blood_availability.freshness_status`, coloured by how old the report is. */
const FRESHNESS_TONE: Record<string, keyof Palette> = {
  fresh: 'statusNormal',
  recent: 'statusPending',
  stale: 'statusWarning',
};

function dial(number: string | null | undefined): void {
  if (!number) return;
  void Linking.openURL(`tel:${number.replace(/\s+/g, '')}`);
}

/* ── Local presentation pieces ───────────────────────────────────────────────
 * Declared at MODULE scope: a component defined in a render body is a new
 * component type on every render, which remounts its whole subtree.
 * ───────────────────────────────────────────────────────────────────────── */

type Styles = ReturnType<typeof makeStyles>;

/**
 * A boxed dropdown. The kit has no select, and `Card` sets
 * `overflow: 'hidden'` so a floating menu would be clipped — the options
 * expand inline underneath the box instead.
 */
function SelectField({
  styles,
  colors,
  icon,
  label,
  value,
  open,
  onToggle,
  compact,
  children,
}: {
  styles: Styles;
  colors: Palette;
  icon?: IconName;
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.selectWrap}>
      {!compact && <Text style={styles.fieldLabel}>{label}</Text>}
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        accessibilityState={{ expanded: open }}
        style={[styles.selectBox, open && { borderColor: colors.blue }]}
      >
        {!!icon && <Icon name={icon} size={15} color={colors.statusCritical} />}
        {compact && <Text style={styles.selectPrefix}>{label}:</Text>}
        <Text style={styles.selectValue} numberOfLines={1}>
          {value}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} />
      </TouchableOpacity>
      {open && <View style={styles.selectList}>{children}</View>}
    </View>
  );
}

function SelectOption({
  styles,
  colors,
  label,
  selected,
  onPress,
}: {
  styles: Styles;
  colors: Palette;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={styles.selectOption}
    >
      <Text style={[styles.selectOptionText, selected && { color: colors.blue }]} numberOfLines={1}>
        {label}
      </Text>
      {selected && <Icon name="check" size={14} color={colors.blue} />}
    </TouchableOpacity>
  );
}

export default function BloodMapScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [city, setCity] = useState<(typeof CITIES)[number]>(CITIES[0]);
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [component, setComponent] = useState<BloodComponentValue>('whole_blood');
  const [sort, setSort] = useState<SortKey>('nearest');
  const [openField, setOpenField] = useState<'area' | 'radius' | 'component' | 'sort' | null>(null);

  const matrix = useBloodGroupMatrix({
    groups: GROUPS,
    componentType: component,
    lat: city.lat,
    lng: city.lng,
    radiusKm,
  });

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  const facilities = matrix.facilities;
  const mappable = facilities.filter((row) => row.latitude != null && row.longitude != null);

  // `matrix.facilities` already arrives nearest-first; sorting by name is the
  // only other order this page can offer without a field it does not have.
  const ordered = useMemo(() => {
    if (sort === 'nearest') return facilities;
    return [...facilities].sort((a, b) => a.name.localeCompare(b.name));
  }, [facilities, sort]);

  const toggle = (field: 'area' | 'radius' | 'component' | 'sort') =>
    setOpenField((f) => (f === field ? null : field));

  const sortLabel = sort === 'nearest' ? t('bloodMap.sortNearest') : t('bloodMap.sortName');

  const bankAddress = (facility: BloodBankResult): string | null =>
    facility.address ?? ([facility.city, facility.region].filter(Boolean).join(', ') || null);

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('bloodMap.title')}
        subtitle={t('bloodMap.subtitle')}
        onBack={goBack}
        actions={[
          {
            icon: 'help-circle',
            onPress: () => router.push('/blood-finder/education'),
            accessibilityLabel: t('bloodMap.learn'),
          },
        ]}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── The reference's blue "how availability works" strip ───────────── */}
        <View
          style={styles.info}
          accessible
          accessibilityLabel={`${t('bloodMap.realtimeTitle')}. ${t('bloodMap.realtimeBody')}`}
        >
          <View style={styles.infoRow}>
            <View style={styles.infoMark}>
              <Icon name="info" size={18} color={colors.statusPending} />
            </View>
            <View style={styles.infoBody}>
              <Text style={styles.infoTitle}>{t('bloodMap.realtimeTitle')}</Text>
              <Text style={styles.infoText}>{t('bloodMap.realtimeBody')}</Text>
            </View>
          </View>
          {/* Reference puts this button beside the text; at 375pt that leaves
              the body ~140pt, so it sits under the text instead. */}
          <CareButton
            label={t('bloodMap.howItWorks')}
            icon="book"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/blood-finder/education')}
            style={styles.infoAction}
          />
        </View>

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <Card>
          <View style={styles.filterRow}>
            <View style={styles.filterCol}>
              <SelectField
                styles={styles}
                colors={colors}
                icon="location"
                label={t('bloodMap.placeLabel')}
                value={city.name}
                open={openField === 'area'}
                onToggle={() => toggle('area')}
              >
                {CITIES.map((option) => (
                  <SelectOption
                    key={option.key}
                    styles={styles}
                    colors={colors}
                    label={option.name}
                    selected={option.key === city.key}
                    onPress={() => {
                      setCity(option);
                      setOpenField(null);
                    }}
                  />
                ))}
              </SelectField>
            </View>
            <View style={styles.filterCol}>
              <SelectField
                styles={styles}
                colors={colors}
                icon="target"
                label={t('bloodMap.radiusLabel')}
                value={t('bloodFinder.radius', { km: radiusKm })}
                open={openField === 'radius'}
                onToggle={() => toggle('radius')}
              >
                {RADII.map((option) => (
                  <SelectOption
                    key={option}
                    styles={styles}
                    colors={colors}
                    label={t('bloodFinder.radius', { km: option })}
                    selected={option === radiusKm}
                    onPress={() => {
                      setRadiusKm(option);
                      setOpenField(null);
                    }}
                  />
                ))}
              </SelectField>
            </View>
          </View>

          <View style={styles.filterRowSingle}>
            <SelectField
              styles={styles}
              colors={colors}
              icon="droplet"
              label={t('bloodMap.componentLabel')}
              value={t(`bloodFinder.components.${component}`)}
              open={openField === 'component'}
              onToggle={() => toggle('component')}
            >
              {CARD_COMPONENTS.map((option) => (
                <SelectOption
                  key={option}
                  styles={styles}
                  colors={colors}
                  label={t(`bloodFinder.components.${option}`)}
                  selected={option === component}
                  onPress={() => {
                    setComponent(option);
                    setOpenField(null);
                  }}
                />
              ))}
            </SelectField>
          </View>

          {/* Why there is no "Filter" button here. */}
          <Text style={styles.hint}>{t('bloodMap.filterNote')}</Text>
        </Card>

        {/* ── The map, its floating radius chip, and the legend strip ───────── */}
        <Card variant="flush">
          {matrix.isPending ? (
            <LoadingBlock label={t('bloodFinder.searching')} />
          ) : mappable.length > 0 ? (
            <View style={styles.mapWrap}>
              <FacilityMap
                facilities={mappable}
                height={260}
                // The circle IS the filter above it, drawn. Named pins,
                // as the reference draws them.
                center={{ lat: city.lat, lng: city.lng }}
                radiusKm={radiusKm}
                labels
              />
              <View style={styles.mapChip} pointerEvents="none">
                <Icon name="target" size={13} color={colors.blue} />
                <Text style={styles.mapChipText} numberOfLines={1}>
                  {t('bloodMap.aroundChip', { km: radiusKm, place: city.name })}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.legend}>
            {(
              [
                ['reported', colors.statusNormal],
                ['unknown', colors.textMuted],
              ] as const
            ).map(([key, tone]) => (
              <View key={key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: tone }]} />
                <Text style={styles.legendText}>{t(`bloodMap.legend.${key}`)}</Text>
              </View>
            ))}
          </View>
          {/*
            The reference's legend has Good / Limited / Low bands. This
            platform's stock rows carry a RANGE ("20+", "5-10"), not a number,
            so banding them would mean inventing thresholds nobody published.
            Two honest states: reported, and not reported.
          */}
          <Text style={styles.legendNote}>{t('bloodMap.legendNote')}</Text>
        </Card>

        {/* ── The banks, with their grids ──────────────────────────────────── */}
        <View style={styles.stack}>
          <View style={styles.foundRow}>
            <Text style={styles.foundTitle} numberOfLines={2} accessibilityRole="header">
              {matrix.isPending
                ? t('bloodFinder.searching')
                : t('bloodMap.found', { count: facilities.length })}
            </Text>
            {!matrix.isPending && facilities.length > 0 && (
              <SelectField
                styles={styles}
                colors={colors}
                label={t('bloodMap.sortLabel')}
                value={sortLabel}
                compact
                open={openField === 'sort'}
                onToggle={() => toggle('sort')}
              >
                <SelectOption
                  styles={styles}
                  colors={colors}
                  label={t('bloodMap.sortNearest')}
                  selected={sort === 'nearest'}
                  onPress={() => {
                    setSort('nearest');
                    setOpenField(null);
                  }}
                />
                <SelectOption
                  styles={styles}
                  colors={colors}
                  label={t('bloodMap.sortName')}
                  selected={sort === 'name'}
                  onPress={() => {
                    setSort('name');
                    setOpenField(null);
                  }}
                />
              </SelectField>
            )}
          </View>

          {matrix.isPending ? null : facilities.length === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="droplet"
                tint="red"
                title={t('bloodMap.emptyTitle')}
                message={t('bloodMap.emptyBody')}
                actionLabel={t('bloodMap.widen')}
                onAction={() => setRadiusKm((r) => (r === 25 ? 50 : 100))}
              />
            </Card>
          ) : (
            /* Results, not a fact table: each bank is its own card and the gap
               between them is what says they are separate things to compare. */
            <ResultList>
              {ordered.map((facility) => {
                const grid = matrix
                  .forFacility(facility.id)
                  .filter((cell) => GRID_GROUPS.includes(cell.group));
                const anyReported = grid.some((cell) => !!cell.units);
                const number = facility.phone ?? facility.emergency_contact;
                const freshness = facility.availability?.freshness;
                const freshnessColor = freshness
                  ? (colors[FRESHNESS_TONE[freshness] ?? 'statusPending'] as string)
                  : colors.textMuted;
                const address = bankAddress(facility);

                return (
                  <Card key={facility.id} variant="flush">
                    <View style={styles.bankRow}>
                      <TouchableOpacity
                        onPress={() =>
                          router.push({
                            pathname: '/blood-finder/bank',
                            params: {
                              facilityId: facility.id,
                              bloodGroup: 'O+',
                              componentType: component,
                              lat: String(city.lat),
                              lng: String(city.lng),
                              radiusKm: String(radiusKm),
                            },
                          })
                        }
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={facility.name}
                        style={styles.bankHead}
                      >
                        <View style={[styles.bankMark, { backgroundColor: colors.statusCriticalBg }]}>
                          <Icon name="droplet" size={19} color={colors.statusCritical} />
                          {/* Two-state, like the legend: reported / not reported. */}
                          <View
                            style={[
                              styles.bankDot,
                              {
                                backgroundColor: anyReported ? colors.statusNormal : colors.textMuted,
                                borderColor: colors.surface,
                              },
                            ]}
                          />
                        </View>
  
                        <View style={styles.bankBody}>
                          <View style={styles.bankTitleRow}>
                            <Text style={styles.bankName} numberOfLines={2}>
                              {facility.name}
                            </Text>
                            {facility.distance_km !== null && (
                              <View style={styles.distancePill}>
                                <Text style={styles.distanceText}>
                                  {t('bloodMap.distancePill', { km: facility.distance_km })}
                                </Text>
                              </View>
                            )}
                          </View>
  
                          {!!address && (
                            <View style={styles.bankMetaRow}>
                              <Icon name="location" size={12} color={colors.textSecondary} />
                              <Text style={styles.bankMeta} numberOfLines={1}>
                                {address}
                              </Text>
                            </View>
                          )}
  
                          {/* Not opening hours — this platform has none. How
                              fresh the facility's own stock report is. */}
                          <Text
                            style={[styles.bankFreshness, { color: freshnessColor }]}
                            numberOfLines={1}
                          >
                            {freshness
                              ? t(`bloodFinder.freshness.${freshness}`)
                              : t('bloodMap.nothingReported')}
                          </Text>
                        </View>
                      </TouchableOpacity>
  
                      <View style={styles.bankFoot}>
                        {/* The grid the reference is built around. */}
                        <View style={styles.grid}>
                          {grid.map((cell) => (
                            <View key={cell.group} style={styles.gridCell}>
                              <Text style={styles.gridGroup}>{cell.group}</Text>
                              <View
                                style={[
                                  styles.gridValueBox,
                                  {
                                    backgroundColor: cell.units
                                      ? colors.statusNormalBg
                                      : colors.surfaceMuted,
                                    borderColor: cell.units ? colors.statusNormal : colors.border,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.gridValue,
                                    { color: cell.units ? colors.statusNormal : colors.textMuted },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {/* Not reported is a dash, never a zero. */}
                                  {cell.units ?? '—'}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
  
                        <TouchableOpacity
                          onPress={() => dial(number)}
                          disabled={!number}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={t('bloodMap.callA11y', { name: facility.name })}
                          accessibilityState={{ disabled: !number }}
                          style={[
                            styles.bankCall,
                            {
                              borderColor: number ? colors.statusCritical : colors.border,
                              backgroundColor: number ? colors.statusCriticalBg : colors.surfaceMuted,
                            },
                          ]}
                        >
                          <Icon
                            name="phone"
                            size={16}
                            color={number ? colors.statusCritical : colors.textMuted}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Card>
                );
              })}
            </ResultList>
          )}
        </View>

        {/* ── The reference's red "Can't find what you need?" panel ─────────── */}
        <View style={styles.cta}>
          <View style={styles.ctaRow}>
            <View style={styles.ctaMark}>
              <Icon name="bell" size={18} color={colors.statusCritical} />
            </View>
            <View style={styles.ctaBody}>
              <Text style={styles.ctaTitle}>{t('bloodMap.ctaTitle')}</Text>
              <Text style={styles.ctaText}>{t('bloodMap.ctaBody')}</Text>
            </View>
          </View>
          {/* Reference sets this button beside the text; at 375pt the text
              would drop to ~120pt, so it sits under it. */}
          <CareButton
            label={t('bloodMap.ctaAction')}
            icon="droplet"
            variant="danger"
            size="sm"
            onPress={() => router.push('/blood-finder')}
            style={styles.ctaAction}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.sm },

    /* Blue info strip */
    info: {
      backgroundColor: c.statusPendingBg,
      borderWidth: 1,
      borderColor: c.statusPending,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    infoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    infoMark: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoBody: { flex: 1, minWidth: 0 },
    infoTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.statusPending,
    },
    infoText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
      marginTop: 2,
    },
    infoAction: { marginTop: spacing.sm, alignSelf: 'flex-end' },

    /* Filters */
    filterRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    filterRowSingle: { marginTop: spacing.sm },
    filterCol: { flex: 1, minWidth: 0 },
    selectWrap: { minWidth: 0 },
    fieldLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textPrimary,
      marginBottom: spacing.xs,
    },
    selectBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 9,
      backgroundColor: c.surface,
      minWidth: 0,
    },
    selectPrefix: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    selectValue: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    selectList: {
      marginTop: 4,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.sm,
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    selectOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    selectOptionText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      marginTop: spacing.sm,
    },

    /* Map + floating chip + legend strip */
    mapWrap: { position: 'relative' },
    mapChip: {
      position: 'absolute',
      top: spacing.sm,
      left: spacing.sm,
      // Leave the top-right corner to the map's own zoom / locate buttons.
      // Stretched to `right: spacing.xl` the chip sat underneath them.
      maxWidth: '62%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    mapChipText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: c.textPrimary,
    },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.divider,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    legendNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      padding: spacing.md,
      paddingTop: spacing.xs,
    },

    /* "N blood banks found" + sort */
    foundRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    foundTitle: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
      paddingTop: 6,
    },

    /* Bank rows */
    bankRow: { padding: spacing.md, gap: spacing.sm },
    bankHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    bankMark: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bankDot: {
      position: 'absolute',
      right: -1,
      bottom: -1,
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 2,
    },
    bankBody: { flex: 1, minWidth: 0, gap: 3 },
    bankTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    bankName: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    distancePill: {
      backgroundColor: c.statusNormalBg,
      borderRadius: radii.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    distanceText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      color: c.statusNormal,
    },
    bankMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    bankMeta: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    bankFreshness: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
    },

    bankFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    bankCall: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },

    /* Per-group grid: label over a coloured value box, as the reference draws it. */
    grid: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 6 },
    gridCell: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
    gridGroup: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      color: c.textSecondary,
    },
    gridValueBox: {
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderRadius: 6,
      paddingVertical: 5,
      paddingHorizontal: 2,
    },
    gridValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xs,
    },

    /* Red "can't find what you need" panel */
    cta: {
      backgroundColor: c.statusCriticalBg,
      borderWidth: 1,
      borderColor: c.statusCritical,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    ctaRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    ctaMark: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaBody: { flex: 1, minWidth: 0 },
    ctaTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.statusCritical,
    },
    ctaText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
      marginTop: 2,
    },
    ctaAction: { marginTop: spacing.sm, alignSelf: 'flex-end', borderColor: c.statusCritical },
  });
