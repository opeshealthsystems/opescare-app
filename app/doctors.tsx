/**
 * Find a Doctor — `/doctors`.
 *
 * Port of the OPES CARE-006 "Find Provider" screen
 * (UIUX/src/screens/care/FindProviderScreen.tsx) onto this app's data.
 *
 * ── Why this screen is facility-first ─────────────────────────────────────
 * OPES is a single hospital with `GET /patient/providers` (search every doctor
 * by name / department / specialty). This app has no such endpoint: the only
 * clinician reads are `GET /mobile/facilities/{id}/providers` (one facility's
 * clinicians) and `GET /mobile/providers/{id}` (one profile). So the honest
 * flow is:
 *
 *   1. Pick a facility (paged directory search by name / city). Each visible
 *      row is probed with the providers endpoint — one request per row, same
 *      cache key as `useFacilityProviders` — so the row can say how many
 *      clinicians it publishes before the patient commits. Of 903 listings
 *      only the ones linked to an internal facility publish anyone
 *      (`facility_id: null` on the rest), so without that hint the picker is
 *      a guessing game.
 *   2. Inside the facility: search by name / title / department, narrow by
 *      department chips (derived from the loaded list, not a lookup), and tap
 *      a row to open `/doctor/[id]`.
 *
 * Aggregating "all doctors across the first N nearby facilities" was
 * deliberately NOT done: it is N requests for a list that is empty for
 * ~98 % of facilities, and there is no server-side sort or search across it.
 *
 * ── What the OPES screen shows that this one omits (no backing data) ──────
 * `FacilityProviderSummary` carries no rating, review count, years of
 * experience, room, or "accepts new patients" flag (see the note in
 * app/doctor/[id].tsx — verified against the schema). So there is no
 * `RatingLine`, no "Sort by rating / experience", and no "Available / Not
 * accepting" pill here. The specialty tile strip fed by
 * `GET /patient/providers/specialties` becomes department chips computed
 * from the facility's own clinician list.
 *
 * Deep link: `/doctors?facilityId=<care_facilities id>` lands straight on that
 * facility's clinicians (the facility page and booking flow can send patients
 * here without making them pick again).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueries } from '@tanstack/react-query';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type Tint,
} from '@/components/opes-ui';
import {
  CareButton,
  ErrorBlock,
  LoadingBlock,
  ProviderAvatar,
  SearchField,
} from '@/components/care/shared';
import { apiClient } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import { flattenFacilityPages, useInfiniteFacilities } from '@/lib/api/bookingQueries';
import {
  useFacilityDetail,
  useFacilityProviders,
  type CareFacilityDetail,
  type CareFacilitySummary,
  type FacilityProviderSummary,
  type FacilityProvidersResponse,
} from '@/lib/api/queries';
import {
  joinLocationParts,
  normalizeText,
  telUrl,
  usablePhone,
} from '@/lib/careMap/facilityDisplay';

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * How many directory rows get a clinician-count probe. One request each and
 * no batch endpoint, so this is capped — the same trade the booking wizard
 * makes for its bookability badges (app/appointments/book.tsx). 20 is one
 * directory page, so a fresh search is fully labelled.
 */
const PROBE_LIMIT = 20;
/** A facility's clinician list does not change minute to minute. */
const PROBE_STALE_MS = 5 * 60_000;

/** The slice of a facility the picker needs to remember after selection. */
type FacilityPick = {
  id: string;
  facility_name: string;
  facility_type: string;
  city: string | null;
  region: string | null;
  phone_primary: string | null;
};

function pickOf(f: CareFacilitySummary | CareFacilityDetail): FacilityPick {
  return {
    id: f.id,
    facility_name: f.facility_name,
    facility_type: f.facility_type,
    city: f.city,
    region: f.region,
    phone_primary: f.phone_primary,
  };
}

/** Kit glyph per `care_facilities.facility_type` (values from careMap.types). */
const FACILITY_ICON: Record<string, { icon: IconName; tint: Tint }> = {
  hospital: { icon: 'building', tint: 'blue' },
  clinic: { icon: 'stethoscope', tint: 'blue' },
  health_center: { icon: 'first-aid', tint: 'blue' },
  pharmacy: { icon: 'pill', tint: 'green' },
  laboratory: { icon: 'flask', tint: 'green' },
  dental: { icon: 'smile', tint: 'purple' },
  diagnostic_center: { icon: 'microscope', tint: 'purple' },
  imaging_center: { icon: 'image', tint: 'purple' },
  blood_bank: { icon: 'droplet', tint: 'red' },
};

function facilityGlyph(type: string): { icon: IconName; tint: Tint } {
  return FACILITY_ICON[type] ?? { icon: 'building', tint: 'blue' };
}

/** professional_licenses.profession — same map as app/doctor/[id].tsx. */
const PROFESSION_KEYS: Record<string, string> = {
  doctor: 'doctor.professionDoctor',
  nurse: 'doctor.professionNurse',
  pharmacist: 'doctor.professionPharmacist',
  lab_technician: 'doctor.professionLabTechnician',
  midwife: 'doctor.professionMidwife',
};

// ── Screen ─────────────────────────────────────────────────────────────────

export default function FindDoctorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ facilityId?: string; q?: string }>();

  // Step 1 — facility picker
  const [facility, setFacility] = useState<FacilityPick | null>(null);
  const [facilityInput, setFacilityInput] = useState('');
  const [facilitySearch, setFacilitySearch] = useState('');

  // Step 2 — clinicians inside the chosen facility
  const [providerInput, setProviderInput] = useState(params.q ?? '');
  const [department, setDepartment] = useState<string | null>(null);

  // A `facilityId` param is honoured exactly once, so "Change" afterwards
  // really does return to the picker instead of snapping back to the link.
  const [linkConsumed, setLinkConsumed] = useState(!params.facilityId);
  const linkedFacility = useFacilityDetail(linkConsumed ? undefined : params.facilityId);
  useEffect(() => {
    if (linkConsumed) return;
    if (linkedFacility.data) {
      setFacility(pickOf(linkedFacility.data));
      setLinkConsumed(true);
    } else if (linkedFacility.isError) {
      // A dead link is not a dead end: fall through to the picker.
      setLinkConsumed(true);
    }
  }, [linkConsumed, linkedFacility.data, linkedFacility.isError]);

  // ── Directory ────────────────────────────────────────────────────────────
  const facilitiesQuery = useInfiniteFacilities({ q: facilitySearch || undefined });
  const facilities = useMemo(
    () => flattenFacilityPages(facilitiesQuery.data?.pages),
    [facilitiesQuery.data],
  );
  const totalFacilities = facilitiesQuery.data?.pages[0]?.pagination.total ?? 0;

  // Clinician-count probe for the rows on screen. Key is byte-identical to
  // `useFacilityProviders` so picking a probed facility costs no second trip.
  const probeIds = useMemo(
    () => (facility ? [] : facilities.slice(0, PROBE_LIMIT).map((f) => f.id)),
    [facility, facilities],
  );
  const probes = useQueries({
    queries: probeIds.map((id) => ({
      queryKey: ['facilities', id, 'providers'] as const,
      queryFn: async () =>
        (await apiClient.get<FacilityProvidersResponse>(endpoints.facilityProviders(id))).data,
      staleTime: PROBE_STALE_MS,
    })),
  });

  // ── Clinicians ───────────────────────────────────────────────────────────
  const providersQuery = useFacilityProviders(facility?.id);
  const providers = useMemo(() => providersQuery.data?.data ?? [], [providersQuery.data]);
  const facilityUnlinked = providersQuery.data?.facility_id === null;

  const roleLabel = useCallback(
    (p: FacilityProviderSummary): string => {
      if (p.job_title) return p.job_title;
      const key = p.profession ? PROFESSION_KEYS[p.profession] : undefined;
      if (key) return t(key);
      return p.profession ?? t('opesCare.findProvider.providerFallback');
    },
    [t],
  );

  const departments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of providers) {
      if (p.department) counts.set(p.department, (counts.get(p.department) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [providers]);

  const needle = normalizeText(providerInput);
  const results = useMemo(
    () =>
      providers.filter((p) => {
        if (department && p.department !== department) return false;
        if (!needle) return true;
        return [p.name, p.job_title, p.department, roleLabel(p)].some(
          (v) => !!v && normalizeText(v).includes(needle),
        );
      }),
    [providers, department, needle, roleLabel],
  );
  const hasFilters = !!needle || !!department;

  // ── Actions ──────────────────────────────────────────────────────────────
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const chooseFacility = (f: CareFacilitySummary) => {
    setFacility(pickOf(f));
    setDepartment(null);
  };

  const changeFacility = () => {
    setFacility(null);
    setDepartment(null);
  };

  const clearProviderFilters = () => {
    setProviderInput('');
    setDepartment(null);
  };

  const callFacility = (phone: string) => {
    const url = telUrl(phone);
    if (url) Linking.openURL(url).catch(() => {});
  };

  const facilityTypeLabel = (type: string) =>
    t(`careMap.types.${type}`, { defaultValue: type });

  // ── Render helpers ───────────────────────────────────────────────────────

  /** Right-hand text on a directory row: what the probe found, or nothing yet. */
  const probeValue = (index: number): { text?: string; color?: string } => {
    const r = probes[index];
    if (!r) return {};
    if (r.isPending) return { text: t('opesCare.findProvider.checking', { defaultValue: 'Checking…' }), color: colors.textMuted };
    if (r.isError || !r.data) return {};
    if (r.data.facility_id === null) {
      return {
        text: t('opesCare.findProvider.notConnectedShort', { defaultValue: 'Not connected' }),
        color: colors.textMuted,
      };
    }
    const n = r.data.data.length;
    return n > 0
      ? { text: t('opesCare.findFacility.doctors', { count: n }), color: colors.statusNormal }
      : { text: t('opesCare.findProvider.noneListed', { defaultValue: 'None listed' }), color: colors.textMuted };
  };

  const renderFacilityPicker = () => (
    <>
      {!facilitySearch && (
        <Card>
          <EmptyState
            icon="person-search"
            tint="blue"
            title={t('opesCare.findProvider.chooseFacilityTitle', {
              defaultValue: 'Choose a facility to see its doctors',
            })}
            message={t('opesCare.findProvider.chooseFacilityMessage', {
              defaultValue:
                'Clinician profiles are published per facility. Search by facility name or city, then pick one below.',
            })}
          />
        </Card>
      )}

      <SearchField
        value={facilityInput}
        onChangeText={(v) => {
          setFacilityInput(v);
          if (!v) setFacilitySearch('');
        }}
        placeholder={t('appointments.book.searchPlaceholder')}
        onSubmit={() => setFacilitySearch(facilityInput.trim())}
        accessibilityLabel={t('appointments.book.stepFacility')}
      />

      {facilitiesQuery.isPending ? (
        <LoadingBlock label={t('careMap.loading')} />
      ) : facilitiesQuery.isError ? (
        <ErrorBlock
          message={t('appointments.book.loadFacilitiesErrorBody')}
          onRetry={() => facilitiesQuery.refetch()}
        />
      ) : facilities.length === 0 ? (
        <Card>
          <EmptyState
            icon="building"
            tint="amber"
            title={t('appointments.book.searchEmptyTitle')}
            message={t('appointments.book.searchEmptyBody')}
            actionLabel={facilitySearch ? t('appointments.book.clearSearch') : undefined}
            onAction={
              facilitySearch
                ? () => {
                    setFacilityInput('');
                    setFacilitySearch('');
                  }
                : undefined
            }
          />
        </Card>
      ) : (
        <View>
          <SectionHeader
            title={t('appointments.book.facilityCount', {
              shown: facilities.length,
              total: totalFacilities,
            })}
          />
          <Card variant="flush">
            {facilities.map((f, i) => {
              const glyph = facilityGlyph(f.facility_type);
              const probe = probeValue(i);
              return (
                <ListRow
                  key={f.id}
                  icon={glyph.icon}
                  tint={glyph.tint}
                  title={f.facility_name}
                  meta={[facilityTypeLabel(f.facility_type), joinLocationParts(f.city, f.region)]}
                  value={probe.text}
                  valueColor={probe.color}
                  onPress={() => chooseFacility(f)}
                  accessibilityHint={t('appointments.book.select')}
                  divider={i < facilities.length - 1}
                />
              );
            })}
          </Card>
          {facilitiesQuery.hasNextPage && (
            <View style={styles.loadMore}>
              <CareButton
                label={t('appointments.book.loadMore')}
                variant="ghost"
                loading={facilitiesQuery.isFetchingNextPage}
                onPress={() => facilitiesQuery.fetchNextPage()}
              />
            </View>
          )}
        </View>
      )}
    </>
  );

  const renderProviderResults = () => {
    if (providersQuery.isPending) return <LoadingBlock label={t('opesCare.findProvider.loading')} />;
    if (providersQuery.isError) {
      return (
        <ErrorBlock
          message={t('facility.loadDoctorsError')}
          onRetry={() => providersQuery.refetch()}
        />
      );
    }
    if (facilityUnlinked) {
      // "N/A" is what the register stores for a facility with no published
      // number, so a truthiness test offered a Call button that dialled nothing.
      const phone = usablePhone(facility?.phone_primary);
      return (
        <Card>
          <EmptyState
            icon="building"
            tint="amber"
            title={t('opesCare.findProvider.notConnectedTitle', {
              defaultValue: 'This facility has not published its clinicians',
            })}
            message={t('opesCare.findProvider.notConnectedMessage', {
              defaultValue:
                'It is not connected to OpesCare yet, so no clinician profiles are listed. You can still call the facility directly.',
            })}
            actionLabel={phone ? t('facility.callAction') : undefined}
            onAction={phone ? () => callFacility(phone) : undefined}
          />
        </Card>
      );
    }
    if (providers.length === 0) {
      return (
        <Card>
          <EmptyState
            icon="person-search"
            tint="blue"
            title={t('facility.noDoctors')}
            message={t('appointments.book.noDoctorsBody')}
            actionLabel={t('appointments.book.chooseAnother')}
            onAction={changeFacility}
          />
        </Card>
      );
    }
    if (results.length === 0) {
      return (
        <Card>
          <EmptyState
            icon="person-search"
            tint="blue"
            title={t('opesCare.findProvider.noMatchTitle')}
            message={t('opesCare.findProvider.noMatchMessage')}
            actionLabel={t('opesCare.findProvider.clearFilters')}
            onAction={clearProviderFilters}
          />
        </Card>
      );
    }
    return (
      <Card variant="flush">
        {results.map((p, i) => {
          // Only honest when the registry holds a licence or credential.
          const verified = p.credentials.length > 0 || p.licenses.length > 0;
          return (
            <ListRow
              key={p.id}
              leading={<ProviderAvatar name={p.name} size={40} />}
              title={p.name}
              meta={[roleLabel(p), p.department, p.facility_name]}
              trailing={
                verified ? (
                  <Icon
                    name="check-circle"
                    size={18}
                    color={colors.statusNormal}
                    accessibilityLabel={t('opesCare.findProvider.verified', {
                      defaultValue: 'Verified credentials',
                    })}
                  />
                ) : undefined
              }
              onPress={() => router.push(`/doctor/${p.id}`)}
              accessibilityHint={t('appointments.book.viewDoctorProfile')}
              divider={i < results.length - 1}
            />
          );
        })}
      </Card>
    );
  };

  const renderFacilityProviders = (f: FacilityPick) => {
    const glyph = facilityGlyph(f.facility_type);
    return (
      <>
        <View>
          <SectionHeader
            title={t('appointments.book.stepFacility')}
            actionLabel={t('appointments.book.changeFacility')}
            onAction={changeFacility}
          />
          <Card variant="flush">
            <ListRow
              icon={glyph.icon}
              tint={glyph.tint}
              title={f.facility_name}
              meta={[facilityTypeLabel(f.facility_type), joinLocationParts(f.city, f.region)]}
              value={t('appointments.book.viewFacility')}
              onPress={() => router.push(`/facility/${f.id}`)}
            />
          </Card>
        </View>

        <SearchField
          value={providerInput}
          onChangeText={setProviderInput}
          placeholder={t('opesCare.findProvider.searchPlaceholder')}
          accessibilityLabel={t('opesCare.findProvider.title')}
        />

        {departments.length > 0 && (
          <View>
            <SectionHeader
              title={t('opesCare.findProvider.departments')}
              actionLabel={department ? t('opesCare.findProvider.allDepartments') : undefined}
              onAction={department ? () => setDepartment(null) : undefined}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              keyboardShouldPersistTaps="handled"
            >
              <Chip
                icon="grid"
                label={t('opesCare.findProvider.all')}
                count={providers.length}
                selected={department === null}
                onPress={() => setDepartment(null)}
              />
              {departments.map((d) => (
                <Chip
                  key={d.name}
                  label={d.name}
                  count={d.count}
                  selected={department === d.name}
                  onPress={() => setDepartment(department === d.name ? null : d.name)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        <View>
          {providersQuery.isSuccess && !facilityUnlinked && providers.length > 0 && (
            <SectionHeader
              title={t('opesCare.findProvider.providersFound', { count: results.length })}
              actionLabel={hasFilters ? t('opesCare.findProvider.clearFilters') : undefined}
              onAction={hasFilters ? clearProviderFilters : undefined}
            />
          )}
          {renderProviderResults()}
        </View>

        <View style={styles.assist}>
          <View style={styles.assistTop}>
            <View style={styles.assistIcon}>
              <Icon name="info" size={20} color={colors.textOnBrand} />
            </View>
            <View style={styles.assistBody}>
              <Text style={styles.assistTitle}>{t('opesCare.findProvider.assistTitle')}</Text>
              <Text style={styles.assistText}>{t('opesCare.findProvider.assistText')}</Text>
            </View>
          </View>
          <CareButton
            label={t('opesCare.findProvider.requestAssistance')}
            variant="secondary"
            size="sm"
            icon="chat"
            onPress={() => router.push('/help')}
          />
        </View>
      </>
    );
  };

  // A deep link still resolving: show the header and a spinner, not the picker
  // flashing underneath it for a moment.
  const resolvingLink = !linkConsumed && !facility;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={t('opesCare.findProvider.title')}
        subtitle={t('opesCare.findProvider.directorySubtitle', {
          defaultValue: 'Search clinicians by facility, department and name',
        })}
        onBack={goBack}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {resolvingLink ? (
          <LoadingBlock label={t('appointments.book.openingFacility')} />
        ) : facility ? (
          renderFacilityProviders(facility)
        ) : (
          renderFacilityPicker()
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    chipRow: { gap: spacing.sm + 2, paddingRight: spacing.md },
    loadMore: { marginTop: spacing.md },

    assist: {
      gap: spacing.sm + 2,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.primarySoft,
    },
    assistTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
    assistIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    assistBody: { flex: 1, minWidth: 0 },
    assistTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    assistText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
      marginTop: 1,
    },
  });
