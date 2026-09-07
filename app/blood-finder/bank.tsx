import { useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  SectionHeader,
  formatDateTime,
  formatLabel,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, InfoRow, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import {
  useBloodSearch,
  type BloodBankResult,
  type BloodComponentValue,
  type BloodGroupValue,
} from '@/lib/api/queries';
import { useBloodBankComponents } from '@/lib/api/bloodBankQueries';

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

const COMPONENT_ICON: Record<string, IconName> = {
  whole_blood: 'droplet',
  red_cells: 'droplet',
  platelets: 'activity',
  plasma: 'flask',
};

function dial(number: string | null | undefined): void {
  if (!number) return;
  void Linking.openURL(`tel:${number.replace(/\s+/g, '')}`);
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

  const search = useBloodSearch({
    bloodGroup,
    componentType,
    lat,
    lng,
    radiusKm,
    enabled: !!facilityId,
  });

  const facility: BloodBankResult | null =
    search.data?.find((row) => row.id === facilityId) ?? null;

  const components = useBloodBankComponents({
    facilityId,
    bloodGroup,
    components: TABLE_COMPONENTS,
    lat,
    lng,
    radiusKm,
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

  return (
    <Screen className="px-0">
      <ScreenHeader title={t('bloodBank.title')} onBack={goBack} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Identity ─────────────────────────────────────────────────────── */}
        <Card>
          <View style={styles.identity}>
            <View style={[styles.identityMark, { backgroundColor: colors.statusCriticalBg }]}>
              <Icon name="droplet" size={26} color={colors.statusCritical} />
            </View>
            <View style={styles.identityBody}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{facility.name}</Text>
                {verified ? (
                  <Icon name="shield-check" size={17} color={colors.blue} />
                ) : null}
              </View>
              {place ? <Text style={styles.place}>{place}</Text> : null}
              <Text style={styles.distance}>{distance}</Text>
            </View>
          </View>

          <View style={styles.identityActions}>
            <CareButton
              label={t('bloodBank.call')}
              icon="phone"
              variant="secondary"
              size="sm"
              onPress={() => dial(phone)}
              disabled={!phone}
              style={styles.identityAction}
            />
            <CareButton
              label={t('bloodBank.request')}
              icon="droplet"
              variant="primary"
              size="sm"
              onPress={goToRequest}
              style={styles.identityAction}
            />
          </View>
          {!phone ? (
            <Text style={styles.noPhone}>{t('bloodBank.noPhone')}</Text>
          ) : null}
        </Card>

        {/* ── Availability for the searched component ──────────────────────── */}
        <Card>
          <View style={styles.availabilityRow}>
            <View style={styles.availabilityMain}>
              <View style={styles.availabilityHead}>
                <Icon name="check-circle" size={20} color={colors.statusNormal} />
                <Text style={[styles.availabilityWord, { color: colors.statusNormal }]}>
                  {t('bloodBank.reported')}
                </Text>
              </View>
              <Text style={styles.units}>
                {availability?.units_range ?? t('bloodFinder.unitsUnknown')}
              </Text>
              <Text style={styles.unitsCaption}>
                {t('bloodBank.unitsFor', {
                  group: bloodGroup,
                  component: t(`bloodFinder.components.${componentType}`),
                })}
              </Text>
              {updated ? (
                <View style={styles.updatedRow}>
                  <Icon name="clock" size={14} color={colors.textMuted} />
                  <Text style={styles.updated}>
                    {t('bloodBank.updated', { when: updated })}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.availabilityAside, { borderLeftColor: colors.border }]}>
              <Text style={[styles.asideTitle, { color: colors.blue }]}>
                {t('bloodBank.statusTitle')}
              </Text>
              <Text style={styles.asideBody}>{t('bloodBank.statusBody')}</Text>
            </View>
          </View>
        </Card>

        {/* ── Component availability ───────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodBank.componentsTitle')} />
          <Card variant="flush">
            <View style={[styles.tableHead, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={styles.tableHeadCell}>{t('bloodBank.componentColumn')}</Text>
              <Text style={[styles.tableHeadCell, styles.unitsCol]}>
                {t('bloodBank.unitsColumn')}
              </Text>
            </View>

            {components.isPending ? (
              <View style={styles.tablePending}>
                <LoadingBlock label={t('bloodBank.loading')} />
              </View>
            ) : (
              components.rows.map((row, index) => (
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
                    <Icon
                      name={COMPONENT_ICON[row.component] ?? 'droplet'}
                      size={17}
                      color={colors.statusCritical}
                    />
                    <Text style={styles.componentName}>
                      {t(`bloodFinder.components.${row.component}`, {
                        defaultValue: formatLabel(row.component),
                      })}
                    </Text>
                  </View>
                  <View style={styles.unitsCol}>
                    {row.isPending ? (
                      <Text style={styles.unitsUnknown}>{t('bloodBank.checking')}</Text>
                    ) : row.snapshot?.units_range ? (
                      <Text style={[styles.unitsValue, { color: colors.statusNormal }]}>
                        {row.snapshot.units_range}
                      </Text>
                    ) : (
                      /* Not reported. Deliberately NOT "0". */
                      <Text style={styles.unitsUnknown}>{t('bloodBank.notReported')}</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </Card>

          <NoticeBanner
            icon="info"
            tone="pending"
            message={t('bloodBank.notReportedExplained')}
          />
        </View>

        {/* ── Facility information ─────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodBank.facilityTitle')} />
          <Card>
            <InfoRow
              icon="phone"
              label={t('bloodBank.phoneLabel')}
              value={phone ?? t('bloodBank.notRecorded')}
            />
            <InfoRow
              icon="location"
              label={t('bloodBank.addressLabel')}
              value={facility.address ?? place ?? t('bloodBank.notRecorded')}
            />
            <InfoRow
              icon="building"
              label={t('bloodBank.typeLabel')}
              value={t(`bloodFinder.facilityTypes.${facility.facility_type}`, {
                defaultValue: formatLabel(facility.facility_type),
              })}
            />
            <InfoRow
              icon="shield-check"
              label={t('bloodBank.listingLabel')}
              value={
                facility.verification_status
                  ? t(`bloodFinder.verification.${facility.verification_status.toLowerCase()}`, {
                      defaultValue: formatLabel(facility.verification_status),
                    })
                  : t('bloodBank.notRecorded')
              }
            />
          </Card>

          {mappable ? (
            <Card variant="flush">
              <FacilityMap facilities={[facility]} height={200} />
            </Card>
          ) : (
            <NoticeBanner icon="location" tone="pending" message={t('bloodBank.noMap')} />
          )}
        </View>

        {/* ── Commit ───────────────────────────────────────────────────────── */}
        <CareButton
          label={t('bloodBank.request')}
          icon="droplet"
          variant="primary"
          onPress={goToRequest}
        />

        <View style={styles.footerActions}>
          <CareButton
            label={t('bloodBank.call')}
            icon="phone"
            variant="secondary"
            size="sm"
            onPress={() => dial(phone)}
            disabled={!phone}
            style={styles.footerAction}
          />
          <CareButton
            label={t('bloodBank.viewOnMap')}
            icon="location"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/care-map')}
            style={styles.footerAction}
          />
        </View>

        {/* The standing line, last, so it is the note the screen ends on. */}
        <View style={styles.notice} accessibilityRole="summary">
          <Icon name="shield-check" size={20} color={colors.blue} />
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

    identity: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    identityMark: {
      width: 52,
      height: 52,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    identityBody: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: c.textPrimary,
    },
    place: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
      marginTop: 2,
    },
    distance: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: c.blue,
      marginTop: 2,
    },
    identityActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    identityAction: { flex: 1 },
    noPhone: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
      marginTop: spacing.xs,
    },

    availabilityRow: { flexDirection: 'row', gap: spacing.md },
    availabilityMain: { flex: 1 },
    availabilityHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    availabilityWord: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    units: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      color: c.textPrimary,
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
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    availabilityAside: {
      flex: 1,
      borderLeftWidth: StyleSheet.hairlineWidth,
      paddingLeft: spacing.md,
    },
    asideTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    asideBody: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
      marginTop: 4,
    },

    tableHead: {
      flexDirection: 'row',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    tableHeadCell: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    tablePending: { padding: spacing.md },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    componentCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    componentName: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    unitsCol: { flex: 1, alignItems: 'flex-end' },
    unitsValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
    },
    unitsUnknown: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
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
