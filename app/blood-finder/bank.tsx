import { useMemo } from 'react';
import {
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  formatDateTime,
  formatLabel,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import {
  useBloodSearch,
  type BloodBankResult,
  type BloodComponentValue,
  type BloodGroupValue,
} from '@/lib/api/queries';
import { useBloodBankComponents } from '@/lib/api/bloodBankQueries';
import { useNationwideBloodSearch } from '@/lib/api/bloodQueries';

/**
 * Blood Bank Details (PM-BLOOD-02) — one facility, everything it reports.
 *
 * Sits between the finder and the request, which is where the reference puts
 * it and where it earns its place: the finder answers "who has any", this
 * answers "how much of what, how old is that figure, and can I reach them",
 * and only then does the request screen ask the patient to commit.
 *
 * ── The facility is re-resolved, never passed through ─────────────────────
 * Only the ids travel in the params. The facility and its stock are looked up
 * again from the same search the list ran, exactly as
 * `app/blood-finder/request.tsx` does, so what is shown here is live rather
 * than a snapshot that may have gone stale between the tap and the render.
 *
 * ── The controls, block by block (PM-BLOOD-02) ────────────────────────────
 * Each block uses the control type the reference draws, not one generic chip
 * for everything:
 *   1. Identity card   — round facility mark, name + verified badge, tinted
 *      outline PILL for the listing status, and a STACKED ACTION COLUMN on the
 *      right (outlined "Call" over filled "Get Directions").
 *   2. Availability    — two columns split by a rule: tinted round status mark
 *      + headline figure on the left, the standing advisory on the right.
 *   3. Components      — a TABLE: tinted header row, one row per component,
 *      hairline separators, figure right-aligned.
 *   4. Facility info   — TWO-COLUMN fact rows (label | value) beside a map
 *      thumbnail carrying an overlaid pill button.
 *   5. Commit          — full-width filled button, then a row of outlined tone
 *      buttons.
 *
 * ── What the reference draws that this screen cannot ──────────────────────
 * OMITTED, because `GET blood/search` does not return it and drawing it would
 * be inventing facility facts:
 *   • The "Open 24/7" pill and the "Operating Hours" row — `BloodBankResult`
 *     carries no opening hours at all. A blood bank that publishes none must
 *     not be shown as always open.
 *   • The "Services" row ("Blood Collection, Testing, Storage, Distribution")
 *     — no services list is returned. The facility TYPE is returned, and is
 *     shown instead, because it is the same kind of fact and it is real.
 *   • "Verified & Screened — 100% Safe & Screened". Nothing in this platform
 *     asserts that units are screened. `verification_status` describes the
 *     DIRECTORY LISTING, so it is labelled "Listing" and nothing more.
 *   • The heart / "Save" button (header and footer). There is no favourites
 *     endpoint in `lib/api`, so the control would do nothing.
 *   • "View All Components" — a disclosure with nothing behind it: the table
 *     already shows every component this platform tracks (see below).
 *   • The facility's own logo in the identity mark — no logo URL is returned,
 *     so the mark is the component glyph on its tint.
 *
 * ── The component table is four real answers, not the reference's five ────
 * `GET blood/search` reports one component per call, so the table is four
 * calls, read through `useBloodBankComponents`.
 *
 * FOUR, because that is what exists. The reference image lists five rows and
 * ends on Cryoprecipitate; `BloodComponentType` has whole_blood, red_cells,
 * platelets and plasma, and nothing in this platform tracks cryoprecipitate.
 * Drawing a fifth row to match the picture would have put a component on
 * screen that no facility can report and no request can name.
 *
 * A component this facility has not published shows
 * as UNKNOWN, never as zero — the search only returns rows a facility has
 * actually reported, so absence means "not said", and printing "0 units"
 * would be inventing the one fact that stops somebody travelling.
 *
 * ── 375pt compromises (the reference is drawn at ~430pt) ──────────────────
 *   • Identity card: the round mark is 44pt (61pt in the reference) and the
 *     action column 96pt, so the name keeps ~150pt and wraps to two lines
 *     rather than the arrangement being abandoned.
 *   • Facility info: the fact LABELS are shortened ("Facility type" → "Type")
 *     so the label column fits beside the map thumbnail, and the pill over the
 *     map reads "Map" rather than "View on map" — the full sentence is the
 *     button's accessibility label, so nothing is lost to a screen reader.
 *   • Footer actions: three columns, not the reference's four (the fourth is
 *     "Save", which does not exist), at 12pt labels so "Directions" /
 *     « Itinéraire » stays on one line.
 *
 * ── What the screen refuses to claim ──────────────────────────────────────
 * "Verified" describes the facility's listing status in the directory, not the
 * units. Availability carries its own freshness stamp and the standing line
 * that it is reported by the facility and may change. Nothing here is a
 * cross-match, a reservation or a clinical approval.
 */

/**
 * The components the table asks about, in the order the reference lists them.
 * Whole blood leads because it is the finder's default and the commonest ask.
 */
const TABLE_COMPONENTS: readonly BloodComponentValue[] = [
  'whole_blood',
  'red_cells',
  'platelets',
  'plasma',
] as const;

/**
 * The reference colour-codes each table row's glyph. Same idea here, from the
 * palette. `red_cells` reuses the droplet: the reference draws a blood BAG for
 * PRBC and the kit has no bag glyph, so the two share a mark and are told
 * apart by the row's colour and its name, never by the icon alone.
 */
const COMPONENT_MARK: Record<string, { icon: IconName; tint: keyof Palette }> = {
  whole_blood: { icon: 'droplet', tint: 'statusCritical' },
  red_cells: { icon: 'droplet', tint: 'tintRed' },
  platelets: { icon: 'activity', tint: 'tintAmber' },
  plasma: { icon: 'flask', tint: 'tintBlue' },
};

function dial(number: string | null | undefined): void {
  if (!number) return;
  void Linking.openURL(`tel:${number.replace(/\s+/g, '')}`);
}

/* ── Local controls ───────────────────────────────────────────────────────
 * Written here rather than reached for from the kit because the reference
 * uses a DIFFERENT control per block, and a generic chip for all of them is
 * exactly the mistake this screen is correcting. Nothing under
 * `components/opes-ui`, `components/care` or `components/meds` is touched.
 */

/** Tinted outline pill — a listing status, not a tappable thing. */
function StatusPill({ icon, label, tone }: { icon: IconName; label: string; tone: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.pill, { borderColor: tone }]}>
      <Icon name={icon} size={13} color={tone} />
      <Text style={[styles.pillLabel, { color: tone }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * The flat action button the reference uses twice: outlined (white ground,
 * blue hairline, blue icon + label) in the footer row and over the map, and
 * `filled` (solid brand) as the second half of the identity card's stacked
 * action column.
 *
 * 12pt labels, not the kit button's 14/16pt: at 375pt the identity column is
 * 104pt wide and "Directions" is one unbreakable word, so a bigger label
 * overflows rather than wrapping. `lines={2}` lets "Get Directions" break the
 * way it does in the reference.
 */
function ToneButton({
  icon,
  label,
  onPress,
  disabled,
  a11yLabel,
  filled,
  lines = 1,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** The full sentence, for labels shortened to fit 375pt. */
  a11yLabel?: string;
  filled?: boolean;
  lines?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fg = filled ? colors.textOnBrand : colors.link;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.tone,
        filled && { backgroundColor: colors.link, borderColor: colors.link },
        disabled && styles.toneOff,
        style,
      ]}
    >
      <Icon name={icon} size={16} color={fg} />
      <Text style={[styles.toneLabel, { color: fg }]} numberOfLines={lines}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Two-column fact row: small icon + label column, value column. */
function FactRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: IconName;
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    // Label and value are one fact. Grouped, a screen reader says
    // "Phone, +237 233 42 12 34" in one swipe instead of two orphan strings.
    <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={15} color={colors.link} />
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, !!valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

/**
 * "Hôpital Central de Yaoundé" -> "HC". The first letter of the first two
 * words that carry meaning — a facility's own name, never more than two
 * letters, so the disc holds it at any size.
 */
const SKIP_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'of', 'the', 'and', 'et', "d'"]);

function initials(name: string): string {
  const words = name
    .split(/[\s\-']+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !SKIP_WORDS.has(w.toLowerCase()));

  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export default function BloodBankDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const params = useLocalSearchParams<{
    facilityId?: string;
    bloodGroup?: string;
    componentType?: string;
    lat?: string;
    lng?: string;
    radiusKm?: string;
  }>();

  const facilityId = params.facilityId ?? null;
  const bloodGroup = (params.bloodGroup as BloodGroupValue | undefined) ?? null;
  const componentType = (params.componentType as BloodComponentValue | undefined) ?? 'whole_blood';
  const lat = Number(params.lat ?? 0);
  const lng = Number(params.lng ?? 0);
  const radiusKm = Number(params.radiusKm ?? 25);

  const localSearch = useBloodSearch({
    bloodGroup,
    componentType,
    lat,
    lng,
    radiusKm,
    enabled: !!facilityId,
  });

  // Outside the radius is not the same as gone. Fall back to the national
  // register before the screen is allowed to say the listing was withdrawn.
  const localMissed =
    localSearch.isSuccess &&
    !(localSearch.data ?? []).some((row) => row.id === facilityId);

  const nationwideSearch = useNationwideBloodSearch({
    bloodGroup,
    componentType,
    enabled: !!facilityId && !!bloodGroup && localMissed,
  });

  const search = localMissed ? nationwideSearch : localSearch;

  const facility: BloodBankResult | null =
    (localSearch.data ?? []).find((row) => row.id === facilityId) ??
    (nationwideSearch.data ?? []).find((row) => row.id === facilityId) ??
    null;

  const components = useBloodBankComponents({
    facilityId,
    bloodGroup,
    components: TABLE_COMPONENTS,
    lat,
    lng,
    radiusKm,
    nationwide: localMissed,
    enabled: !!facility,
  });

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  const goToRequest = () => {
    if (!facility || !bloodGroup) return;
    router.push({
      pathname: '/blood-finder/request',
      params: {
        facilityId: facility.id,
        bloodGroup,
        componentType,
        lat: String(lat),
        lng: String(lng),
        radiusKm: String(radiusKm),
        nationwide: facility.distance_km === null ? '1' : '0',
      },
    });
  };

  /* ── States before the facility resolves ──────────────────────────────── */

  if (!facilityId || !bloodGroup) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodBank.title')} onBack={goBack} />
        <View style={styles.centred}>
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('bloodBank.missingTitle')}
              message={t('bloodBank.missingBody')}
              actionLabel={t('bloodBank.backToFinder')}
              onAction={() => router.replace('/blood-finder')}
            />
          </Card>
        </View>
      </Screen>
    );
  }

  if (search.isPending) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodBank.title')} onBack={goBack} />
        <View style={styles.centred}>
          <LoadingBlock label={t('bloodBank.loading')} />
        </View>
      </Screen>
    );
  }

  if (!facility) {
    // Either the search failed, or this facility no longer reports the group.
    // Those are different messages and must not be collapsed into one.
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodBank.title')} onBack={goBack} />
        <View style={styles.centred}>
          <Card variant="flush">
            <EmptyState
              icon={search.isError ? 'alert-circle' : 'droplet'}
              tint="red"
              title={search.isError ? t('bloodBank.loadFailed') : t('bloodBank.goneTitle')}
              message={search.isError ? t('bloodBank.loadFailedBody') : t('bloodBank.goneBody')}
              actionLabel={search.isError ? t('bloodBank.retry') : t('bloodBank.backToFinder')}
              onAction={
                search.isError ? () => search.refetch() : () => router.replace('/blood-finder')
              }
            />
          </Card>
        </View>
      </Screen>
    );
  }

  /* ── The facility ─────────────────────────────────────────────────────── */

  const availability = facility.availability;
  const place = [facility.city, facility.region].filter(Boolean).join(', ') || null;
  const distance =
    facility.distance_km === null
      ? t('bloodBank.distanceUnknown')
      : t('bloodFinder.distanceKm', { km: facility.distance_km });
  const updated = availability?.last_updated_at
    ? formatDateTime(availability.last_updated_at)
    : null;
  const verified = (facility.verification_status ?? '').toLowerCase() === 'verified';
  const phone = facility.phone ?? facility.emergency_contact ?? null;
  const mappable = facility.latitude != null && facility.longitude != null;

  // The in-app map. Same destination the finder uses; nothing hands off to a
  // native maps app, and no coordinates are put in a third-party URL.
  const openMap = () => router.push('/care-map');

  const shareFacility = () => {
    // Only facts this facility actually published. A missing phone or address
    // is left out rather than shared as a placeholder somebody would dial.
    const line = [facility.name, facility.address ?? place, phone].filter(Boolean).join(' · ');
    Share.share({ message: line }).catch(() => {});
  };

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('bloodBank.title')}
        onBack={goBack}
        // The reference's second header action is a heart (Save). Omitted:
        // there is no favourites endpoint, so it would be a dead control.
        actions={[
          { icon: 'share', onPress: shareFacility, accessibilityLabel: t('bloodBank.shareA11y') },
        ]}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── 1. Identity: mark + name block + stacked action column ───────── */}
        <Card>
          <View style={styles.identity}>
            <View style={styles.identityMark}>
              <Icon name="droplet" size={17} color={colors.statusCritical} />
              <Text style={styles.identityInitials} numberOfLines={1}>
                {initials(facility.name)}
              </Text>
            </View>

            <View style={styles.identityBody}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={2}>
                  {facility.name}
                </Text>
                {verified ? <Icon name="shield-check" size={16} color={colors.link} /> : null}
              </View>

              {place ? (
                <View style={styles.metaRow}>
                  <Icon name="location" size={14} color={colors.textSecondary} />
                  <Text style={styles.place} numberOfLines={1}>
                    {place}
                  </Text>
                </View>
              ) : null}

              <View style={styles.metaRow}>
                <Icon name="send" size={14} color={colors.link} />
                <Text style={styles.distance} numberOfLines={1}>
                  {distance}
                </Text>
              </View>

              {/* The reference pairs this with an "Open 24/7" pill. Omitted —
                  no opening hours are returned for a blood bank. */}
              {verified ? (
                <View style={styles.pillRow}>
                  <StatusPill
                    icon="shield-check"
                    label={t('bloodBank.verifiedPill')}
                    tone={colors.link}
                  />
                </View>
              ) : null}
            </View>

            {/* Stacked action column — outlined over filled, as drawn. */}
            <View style={styles.identityActions}>
              <ToneButton
                icon="phone"
                label={t('bloodBank.call')}
                a11yLabel={t('bloodFinder.call')}
                onPress={() => dial(phone)}
                disabled={!phone}
              />
              <ToneButton
                icon="send"
                label={t('bloodFinder.getDirections')}
                a11yLabel={t('bloodBank.directionsA11y')}
                onPress={openMap}
                filled
                lines={2}
                style={styles.identityActionTall}
              />
            </View>
          </View>

          {!phone ? <Text style={styles.noPhone}>{t('bloodBank.noPhone')}</Text> : null}
        </Card>

        {/* ── 2. Availability for the searched component ───────────────────── */}
        <Card>
          <View style={styles.availabilityRow}>
            <View style={styles.availabilityMain}>
              <View style={styles.availabilityHead}>
                <View style={[styles.statusMark, { backgroundColor: colors.tintGreenBg }]}>
                  <Icon name="check" size={20} color={colors.statusNormal} />
                </View>
                <View style={styles.availabilityText}>
                  <Text style={[styles.availabilityWord, { color: colors.statusNormal }]}>
                    {t('bloodBank.reported')}
                  </Text>

                  {availability?.units_range ? (
                    <View style={styles.unitsHeadline}>
                      <Text style={[styles.unitsBig, { color: colors.link }]}>
                        {availability.units_range}
                      </Text>
                      <Text style={styles.unitsWord}>{t('bloodBank.unitsAvailable')}</Text>
                    </View>
                  ) : (
                    /* Nothing published. Never a figure, never a zero. */
                    <Text style={styles.unitsUnknownBig}>{t('bloodFinder.unitsUnknown')}</Text>
                  )}

                  <Text style={styles.unitsCaption}>
                    {t('bloodBank.unitsFor', {
                      group: bloodGroup,
                      component: t(`bloodFinder.components.${componentType}`),
                    })}
                  </Text>

                  {updated ? (
                    <View style={styles.updatedRow}>
                      <Icon name="clock" size={13} color={colors.textMuted} />
                      <Text style={styles.updated}>{t('bloodBank.updated', { when: updated })}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={[styles.availabilityAside, { borderLeftColor: colors.border }]}>
              <View style={styles.asideHead}>
                <Text style={[styles.asideTitle, { color: colors.link }]}>
                  {t('bloodBank.statusTitle')}
                </Text>
                <Icon name="info" size={14} color={colors.link} />
              </View>
              <Text style={styles.asideBody}>{t('bloodBank.statusBody')}</Text>
            </View>
          </View>
        </Card>

        {/* ── 3. Component availability: a real table ──────────────────────── */}
        <View style={styles.stack}>
          <Card variant="flush">
            <Text style={styles.cardTitle}>{t('bloodBank.componentsTitle')}</Text>

            <View
              style={[
                styles.tableHead,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
              ]}
            >
              <Text style={styles.tableHeadCell}>{t('bloodBank.componentColumn')}</Text>
              <Text style={[styles.tableHeadCell, styles.unitsHeadCell]}>
                {t('bloodBank.unitsColumn')}
              </Text>
            </View>

            {components.isPending ? (
              <View style={styles.tablePending}>
                <LoadingBlock label={t('bloodBank.loading')} />
              </View>
            ) : (
              components.rows.map((row, index) => {
                const mark = COMPONENT_MARK[row.component] ?? {
                  icon: 'droplet' as IconName,
                  tint: 'statusCritical' as keyof Palette,
                };
                return (
                  <View
                    key={row.component}
                    style={[
                      styles.tableRow,
                      index < components.rows.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.componentCell}>
                      <Icon name={mark.icon} size={17} color={colors[mark.tint]} />
                      <Text style={styles.componentName} numberOfLines={2}>
                        {t(`bloodFinder.components.${row.component}`, {
                          defaultValue: formatLabel(row.component),
                        })}
                      </Text>
                    </View>

                    <View style={styles.unitsCol}>
                      {row.isPending ? (
                        <Text style={styles.unitsUnknown}>{t('bloodBank.checking')}</Text>
                      ) : row.snapshot?.units_range ? (
                        <Text numberOfLines={1}>
                          <Text style={[styles.unitsValue, { color: colors.link }]}>
                            {row.snapshot.units_range}
                          </Text>
                          <Text style={styles.unitsSuffix}>
                            {` ${t('bloodBank.unitsSuffix')}`}
                          </Text>
                        </Text>
                      ) : (
                        /* Not reported. Deliberately NOT "0". */
                        <Text style={styles.unitsUnknown}>{t('bloodBank.notReported')}</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}

            {/* The reference closes the table with a "View All Components"
                disclosure. Omitted: every component this platform tracks is
                already in the table, so it would open onto nothing. */}
          </Card>

          <NoticeBanner icon="info" tone="pending" message={t('bloodBank.notReportedExplained')} />
        </View>

        {/* ── 4. Facility information: fact column + map thumbnail ─────────── */}
        <Card>
          <Text style={styles.cardTitleInset}>{t('bloodBank.facilityTitle')}</Text>

          <View style={styles.factsRow}>
            <View style={styles.facts}>
              {/* "Operating Hours" and "Services" are in the reference and not
                  in the payload — see the omissions note at the top. */}
              <FactRow
                icon="phone"
                label={t('bloodBank.phoneLabel')}
                value={phone ?? t('bloodBank.notRecorded')}
                valueColor={phone ? colors.link : undefined}
              />
              <FactRow
                icon="location"
                label={t('bloodBank.addressLabel')}
                value={facility.address ?? place ?? t('bloodBank.notRecorded')}
              />
              <FactRow
                icon="building"
                label={t('bloodBank.typeShort')}
                value={t(`bloodFinder.facilityTypes.${facility.facility_type}`, {
                  defaultValue: formatLabel(facility.facility_type),
                })}
              />
              <FactRow
                icon="shield-check"
                label={t('bloodBank.listingLabel')}
                value={
                  facility.verification_status
                    ? t(`bloodFinder.verification.${facility.verification_status.toLowerCase()}`, {
                        defaultValue: formatLabel(facility.verification_status),
                      })
                    : t('bloodBank.notRecorded')
                }
                valueColor={verified ? colors.statusNormal : undefined}
              />
            </View>

            {mappable ? (
              <View style={styles.mapCol}>
                <FacilityMap facilities={[facility]} height={168} variant="thumbnail" />
                {/* The pill the reference floats over the thumbnail. Label
                    shortened to "Map" so it fits a 40% column at 375pt; the
                    full sentence is the accessibility label. */}
                <ToneButton
                  icon="location"
                  label={t('bloodBank.mapShort')}
                  a11yLabel={t('bloodBank.mapA11y')}
                  onPress={openMap}
                  style={styles.mapPill}
                />
              </View>
            ) : null}
          </View>

          {!mappable ? (
            // Full width rather than squeezed into the 40% map column: the
            // sentence explains an absence and has to be readable.
            <View style={styles.noMap}>
              <NoticeBanner icon="location" tone="pending" message={t('bloodBank.noMap')} />
            </View>
          ) : null}
        </Card>

        {/* ── 5. Commit ────────────────────────────────────────────────────── */}
        <CareButton
          label={t('bloodBank.request')}
          icon="droplet"
          variant="primary"
          onPress={goToRequest}
        />

        {/* Three outlined tone buttons, not the reference's four: the fourth
            is "Save", and there is no favourites endpoint behind it. */}
        <View style={styles.footerActions}>
          <ToneButton
            icon="phone"
            label={t('bloodBank.call')}
            a11yLabel={t('bloodFinder.call')}
            onPress={() => dial(phone)}
            disabled={!phone}
            style={styles.footerAction}
          />
          <ToneButton
            icon="send"
            label={t('bloodBank.directionsShort')}
            a11yLabel={t('bloodBank.directionsA11y')}
            onPress={openMap}
            style={styles.footerAction}
          />
          <ToneButton
            icon="share"
            label={t('bloodBank.share')}
            a11yLabel={t('bloodBank.shareA11y')}
            onPress={shareFacility}
            style={styles.footerAction}
          />
        </View>

        {/* The standing line, last, so it is the note the screen ends on. */}
        <View style={styles.notice} accessibilityRole="summary">
          <Icon name="shield-check" size={20} color={colors.link} />
          <View style={styles.noticeBody}>
            <Text style={styles.noticeTitle}>{t('bloodFinder.safetyTitle')}</Text>
            <Text style={styles.noticeText}>{t('bloodFinder.safetyBody')}</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.sm },
    centred: { padding: spacing.md },

    /* 1. Identity ------------------------------------------------------- */
    identity: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'flex-start' },
    // The reference's mark is a 72pt logo disc on a white face. We have no
    // logo, so the disc carries the facility's initials — its own name, not a
    // graphic we would have to invent — at the weight the layout expects.
    identityMark: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
    },
    identityInitials: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 15,
      letterSpacing: .5,
      color: c.primaryDeep,
    },
    identityBody: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    name: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: c.textPrimary,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    place: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    distance: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.link,
    },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
    // A 104pt column: the widest the reference's stacked actions can be here
    // without pushing the facility name past two lines, and the narrowest that
    // still fits "Directions" / « Itinéraire » on one line at 12pt.
    identityActions: { width: 104, gap: spacing.sm - 2 },
    // The reference's directions button is the taller of the two (its label
    // sits on two lines). Vertical padding rather than a fixed height, so a
    // one-line French/English label does not leave a hole.
    identityActionTall: { paddingVertical: spacing.sm - 2 },
    noPhone: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
      marginTop: spacing.sm,
    },

    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radii.pill,
      borderWidth: 1,
      backgroundColor: c.surface,
    },
    pillLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
    },

    /* 2. Availability --------------------------------------------------- */
    availabilityRow: { flexDirection: 'row', gap: spacing.sm + 4 },
    // 1.4 : 1 — the reference's own split (≈59/41), kept at 375pt so the
    // headline figure and its freshness stamp do not wrap.
    availabilityMain: { flex: 1.4 },
    availabilityHead: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    statusMark: {
      width: 38,
      height: 38,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    availabilityText: { flex: 1, minWidth: 0 },
    availabilityWord: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    unitsHeadline: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'baseline',
      gap: 5,
      marginTop: 2,
    },
    unitsBig: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
    },
    unitsWord: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    unitsUnknownBig: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textMuted,
      marginTop: 4,
    },
    unitsCaption: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
      marginTop: 2,
    },
    updatedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.xs },
    updated: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    availabilityAside: {
      flex: 1,
      borderLeftWidth: StyleSheet.hairlineWidth,
      paddingLeft: spacing.sm + 4,
    },
    asideHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    asideTitle: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
    },
    asideBody: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
      marginTop: 4,
    },

    /* 3. Component table ------------------------------------------------ */
    cardTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm + 2,
    },
    cardTitleInset: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
      marginBottom: spacing.sm + 2,
    },
    tableHead: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    tableHeadCell: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    tablePending: { padding: spacing.md },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    componentCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    componentName: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    unitsHeadCell: { textAlign: 'right' },
    unitsCol: { flex: 1, alignItems: 'flex-end' },
    unitsValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
    },
    unitsSuffix: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textPrimary,
    },
    unitsUnknown: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    /* 4. Facility information ------------------------------------------- */
    factsRow: { flexDirection: 'row', gap: spacing.sm + 4 },
    // 1.5 : 1 — the reference's ≈61/39 split, rounded to keep the value
    // column readable once the labels are shortened.
    facts: { flex: 1.5, gap: spacing.sm + 2 },
    fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
    factLabel: {
      width: 58,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    factValue: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textPrimary,
    },
    mapCol: { flex: 1, position: 'relative' },
    mapPill: {
      position: 'absolute',
      left: spacing.sm,
      right: spacing.sm,
      bottom: spacing.sm,
      borderRadius: radii.pill,
      minHeight: 32,
      paddingHorizontal: spacing.sm,
    },
    noMap: { marginTop: spacing.sm + 2 },

    /* 5. Commit --------------------------------------------------------- */
    tone: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      minHeight: 42,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    toneOff: { opacity: 0.5 },
    toneLabel: {
      flexShrink: 1,
      textAlign: 'center',
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.link,
    },
    footerActions: { flexDirection: 'row', gap: spacing.sm },
    footerAction: { flex: 1 },

    notice: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      paddingHorizontal: spacing.xs,
    },
    noticeBody: { flex: 1 },
    noticeTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    noticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
      marginTop: 2,
    },
  });
