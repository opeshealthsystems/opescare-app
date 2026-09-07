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
 *   1. Pick a facility (paged directory search by name / city).
 *   2. Inside the facility: search by name / title / department, narrow by
 *      department chips (derived from the loaded list, not a lookup), and tap
 *      a row to open `/doctor/[id]`.
 *
 * Aggregating "all doctors across the first N nearby facilities" was
 * deliberately NOT done: there is no server-side sort or search across it.
 *
 * ── The two facility registers, and why step 1 used to feel broken ────────
 * The app browses `care_facilities`, the PUBLIC DIRECTORY — 2 728 active
 * listings. Care happens in `facilities`, the OPERATIONAL TENANT — 482 rows.
 * A listing is joined to a tenant by `care_facilities.facility_id`, and only
 * 468 listings carry one. So 2 260 places can be found, phoned and visited,
 * but can never publish a clinician or take an online booking.
 *
 * The directory endpoint used to return those 2 728 rows in NO order at all,
 * and the only way to learn whether a row was usable was to ask the providers
 * endpoint about it — one request per visible row. Page after page came back
 * "Not connected", and a real user concluded the feature was broken.
 *
 * `GET /mobile/facilities` now answers that question in the payload itself:
 * every row carries `connected`, `provider_count` and `open_slot_count`, the
 * response carries the register-wide `registry` totals, connected listings
 * sort first, and `?connected=1` filters to them. So the per-row probe is
 * gone — the badge below is read, not guessed — and this screen opens on the
 * 468 listings that can actually do something, with one tap out to all 2 728.
 * Nothing is hidden, and no listing is ever described as connected when it is
 * not.
 *
 * ── What the OPES screen shows that this one omits (no backing data) ──────
 * `FacilityProviderSummary` carries no rating, review count, years of
 * experience, room, or "accepts new patients" flag (see the note in
 * app/doctor/[id].tsx — verified against the schema). So there is no
 * `RatingLine`, no "Sort by rating / experience", and no "Available / Not
 * accepting" pill here. The specialty tile strip fed by
 * `GET /patient/providers/specialties` becomes department tiles computed
 * from the facility's own clinician list.
 *
 * ── The shared finder chrome, and what it is NOT given here ───────────────
 * The layout is components/finder/FinderChrome (top bar, oversized heading,
 * search + Filters, counted category rail, results header, cards, help panel)
 * so this screen and Find Facility cannot drift. Four slots the reference
 * design fills are left empty here, each for a verified reason:
 *
 *   ★ rating / review count — nothing in the schema holds either. No stars.
 *   photograph — `staff_profiles` has no photo column (stated outright in
 *       MobileProviderController's own column reality check), so the card's
 *       leading mark is a 56pt tinted initials disc via `initialsFrom`.
 *   "Available / In 30 mins" pill — `open_slot_count` is reported for the
 *       FACILITY, never per clinician; the roster payload carries no slot
 *       data at all. Labelling every clinician "Available" would be a claim
 *       the server never made, so no pill is drawn.
 *   distance — no provider and no directory row carries a distance
 *       (`distance_km` exists only on the pharmacy and blood-bank payloads,
 *       which are searched from an origin). The location line therefore shows
 *       the clinician's facility CITY, which is a fact, not a fabricated "0.6
 *       km away".
 *
 * The verified tick is drawn only where `credentials` or `licenses` is
 * non-empty — both are filtered to ACTIVE records server-side.
 *
 * Sorting is by name or by department: the reference's "Sort by: Distance"
 * has no data behind it here for the same reason the distance line does not.
 *
 * Deep link: `/doctors?facilityId=<care_facilities id>` lands straight on that
 * facility's clinicians (the facility page and booking flow can send patients
 * here without making them pick again).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  ListRow,
  SectionHeader,
  initialsFrom,
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
  NoticeBanner,
  SearchField,
} from '@/components/care/shared';
import {
  CardMetaRow,
  CategoryTile,
  FiltersButton,
  FinderHeading,
  FinderTopBar,
  HelpPanel,
  ResultCard,
  ResultsHeader,
  type FinderAction,
} from '@/components/finder/FinderChrome';
import { useUnreadNotificationCount } from '@/lib/api/appConfigQueries';
import { apiClient } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
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

// ── The register, as the directory endpoint now reports it ─────────────────

/**
 * A directory row plus the four facts that say what it can actually do.
 *
 * `CareFacilitySummary` in lib/api/queries.ts predates these fields, and that
 * module is shared with the booking wizard, so the extra shape is declared
 * here rather than widened there. Every field is optional-safe at the read
 * site: an older API build simply reports nothing, and the row then renders
 * with no badge instead of a wrong one.
 */
type RegistryFacility = CareFacilitySummary & {
  /** Internal `facilities` id, or null when this listing has no tenant. */
  facility_id: string | null;
  /** `facility_id !== null`. The single fact this whole screen turns on. */
  connected: boolean;
  /** Clinicians this facility publishes. Counted server-side, not probed. */
  provider_count: number;
  /** Open, future, not-yet-full appointment slots. */
  open_slot_count: number;
};

/** Register-wide totals — the honest denominator behind "Not connected". */
type RegistryTotals = {
  directory_total: number;
  connected_total: number;
  bookable_total: number;
  with_providers_total: number;
};

type DirectoryPage = {
  data: RegistryFacility[];
  pagination: { total: number; per_page: number; current_page: number; last_page: number };
  registry: RegistryTotals;
};

/**
 * Why a facility's clinician list is empty — the three cases the app has to
 * tell apart, because the honest next step differs in each.
 */
type RosterStatus = 'not_connected' | 'none_published' | 'published';

/** `GET /mobile/facilities/{id}/providers`, with the reason for an empty list. */
type FacilityRoster = FacilityProvidersResponse & {
  connected?: boolean;
  roster_status?: RosterStatus;
  provider_count?: number;
  open_slot_count?: number;
  message?: string;
};

/**
 * How wide a slice of the register the picker is showing.
 *
 * This screen is called "Find a doctor", so it opens on the only slice that
 * can answer that question. It used to open on `connected` — every listing
 * with a tenant behind it — and that is a materially different question. On
 * the live register every single connected listing is a pharmacy, so page one
 * of the doctor finder was twenty pharmacies, each labelled "None listed", and
 * a patient reasonably concluded the feature was broken. It was not broken; it
 * was answering "who has signed up?" when they had asked "who has a doctor?".
 *
 *   clinicians  — `?with_providers=1`. Facilities publishing at least one
 *                 clinician a patient can be seen by. THE DEFAULT.
 *   connected   — `?connected=1`. On OpesCare, but may publish no clinician.
 *   all         — the whole public directory: findable and callable, no more.
 *
 * All three are one tap apart and every count below is the server's own, so
 * narrowing the default hides nothing. If no facility publishes a clinician,
 * the screen says exactly that, with the number — it does not quietly widen to
 * a list that does not answer the question.
 */
type DirectoryScope = 'clinicians' | 'connected' | 'all';

const SCOPE_PARAMS: Record<DirectoryScope, Record<string, number>> = {
  clinicians: { with_providers: 1 },
  connected: { connected: 1 },
  all: {},
};

/**
 * The directory, filtered to what the patient asked for.
 *
 * Replaces `useInfiniteFacilities` + a per-row providers probe: the counts the
 * badges need now ride on the rows themselves, so a page of 20 costs one
 * request rather than 21. The query key is deliberately distinct from the
 * booking wizard's (`['facilities', 'infinite', …]`) because the parameters
 * differ — sharing it would serve the wizard a clinicians-only list.
 */
function useRegistryDirectory(params: { q?: string; scope: DirectoryScope }) {
  return useInfiniteQuery({
    queryKey: ['facility-registry', 'directory', params.q ?? '', params.scope] as const,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await apiClient.get<DirectoryPage>(endpoints.facilities, {
          params: {
            ...(params.q ? { q: params.q } : {}),
            ...SCOPE_PARAMS[params.scope],
            page: pageParam,
          },
        })
      ).data,
    getNextPageParam: (last) =>
      last.pagination.current_page < last.pagination.last_page
        ? last.pagination.current_page + 1
        : undefined,
  });
}

// ── Constants ──────────────────────────────────────────────────────────────

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

/**
 * A glyph for a department tile.
 *
 * `staff_profiles.department` is free text typed by each facility, so this
 * matches on the word rather than on a code list, and anything unrecognised
 * gets the neutral stethoscope — never a wrong specialty picture.
 */
const DEPARTMENT_GLYPHS: { match: RegExp; icon: IconName }[] = [
  { match: /cardio|heart|coeur|cœur/i, icon: 'heart-pulse' },
  { match: /p(a)?ediatr|enfant|neonat|néonat/i, icon: 'baby' },
  { match: /gyn|obstet|obstét|matern|midwif|sage/i, icon: 'person' },
  { match: /lab|analys/i, icon: 'flask' },
  { match: /pharm/i, icon: 'pill' },
  { match: /radio|imag|scan/i, icon: 'microscope' },
  { match: /emerg|urgence|trauma/i, icon: 'first-aid' },
  { match: /dent/i, icon: 'smile' },
];

function departmentGlyph(name: string): IconName {
  return DEPARTMENT_GLYPHS.find((d) => d.match.test(name))?.icon ?? 'stethoscope';
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

  // Opens on the listings that actually publish a clinician — the question
  // this screen exists to answer. A filter, not a fiction: the other two chips
  // are one tap away and every row stays labelled with what it can do.
  const [scope, setScope] = useState<DirectoryScope>('clinicians');

  // Step 2 — clinicians inside the chosen facility
  const [providerInput, setProviderInput] = useState(params.q ?? '');
  const [department, setDepartment] = useState<string | null>(null);

  // The Filters panel beside the search field, and the results sort. Sort has
  // exactly two honest orders — see the header note on why not distance.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<'name' | 'department'>('name');

  const unreadCount = useUnreadNotificationCount();

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
  const facilitiesQuery = useRegistryDirectory({
    q: facilitySearch || undefined,
    scope,
  });
  const facilities = useMemo<RegistryFacility[]>(
    () => (facilitiesQuery.data?.pages ?? []).flatMap((page) => page.data),
    [facilitiesQuery.data],
  );
  const totalFacilities = facilitiesQuery.data?.pages[0]?.pagination.total ?? 0;
  /** Register-wide totals, straight from the response. Never computed here. */
  const registry = facilitiesQuery.data?.pages[0]?.registry;

  // ── Clinicians ───────────────────────────────────────────────────────────
  const providersQuery = useFacilityProviders(facility?.id);
  const roster = providersQuery.data as FacilityRoster | undefined;
  const providers = useMemo(() => roster?.data ?? [], [roster]);
  /**
   * Why the roster is empty. `roster_status` is authoritative when the API
   * sends it; `facility_id === null` is the same fact and keeps an older
   * build honest rather than silently optimistic.
   */
  const rosterStatus: RosterStatus | undefined = roster
    ? (roster.roster_status ??
       (roster.facility_id === null
         ? 'not_connected'
         : roster.data.length > 0
           ? 'published'
           : 'none_published'))
    : undefined;
  const facilityUnlinked = rosterStatus === 'not_connected';
  const facilityOpenSlots = roster?.open_slot_count ?? 0;

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
  const results = useMemo(() => {
    const matched = providers.filter((p) => {
      if (department && p.department !== department) return false;
      if (!needle) return true;
      return [p.name, p.job_title, p.department, roleLabel(p)].some(
        (v) => !!v && normalizeText(v).includes(needle),
      );
    });
    // A copy: the query's own array is cache state and must not be sorted in
    // place. Department-less clinicians sort last rather than under "".
    return [...matched].sort((a, b) =>
      sort === 'department'
        ? (a.department ?? '￿').localeCompare(b.department ?? '￿') ||
          a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name),
    );
  }, [providers, department, needle, roleLabel, sort]);
  const hasFilters = !!needle || !!department;

  // ── Actions ──────────────────────────────────────────────────────────────
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const chooseFacility = (f: RegistryFacility) => {
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

  const goToBooking = (careFacilityId: string) =>
    router.push({ pathname: '/appointments/book', params: { facilityId: careFacilityId } });

  // ── Render helpers ───────────────────────────────────────────────────────

  /**
   * Right-hand text on a directory row.
   *
   * Read straight off the row the server sent — no probe, no inference. The
   * ladder is deliberately pessimistic: a facility is only called bookable
   * when it has open slots, and only shows a clinician count when it has
   * published clinicians.
   */
  const rowValue = (f: RegistryFacility): { text?: string; color?: string } => {
    if (!f.connected) {
      return {
        text: t('opesCare.findProvider.notConnectedShort', { defaultValue: 'Not connected' }),
        color: colors.textMuted,
      };
    }
    if (f.provider_count > 0) {
      return {
        text: t('opesCare.findFacility.doctors', { count: f.provider_count }),
        color: colors.statusNormal,
      };
    }
    if (f.open_slot_count > 0) {
      return {
        text: t('facilityRegistry.bookableShort', { defaultValue: 'Bookable' }),
        color: colors.statusNormal,
      };
    }
    return {
      text: t('opesCare.findProvider.noneListed', { defaultValue: 'None listed' }),
      color: colors.textMuted,
    };
  };

  /**
   * The state of the register, in the patient's own terms. Shown above the
   * list so "Not connected" reads as a fact about the country's facilities
   * rather than as a failure of their search.
   */
  const renderRegistryFilter = () => (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        <Chip
          icon="stethoscope"
          label={t('discovery.scope.clinicians', { defaultValue: 'With doctors' })}
          count={registry?.with_providers_total}
          selected={scope === 'clinicians'}
          onPress={() => setScope('clinicians')}
          accessibilityHint={t('discovery.scope.cliniciansHint', {
            defaultValue: 'Show only facilities that publish at least one clinician',
          })}
        />
        <Chip
          icon="shield-check"
          label={t('facilityRegistry.connectedOnly', { defaultValue: 'Connected' })}
          count={registry?.connected_total}
          selected={scope === 'connected'}
          onPress={() => setScope('connected')}
          accessibilityHint={t('facilityRegistry.connectedOnlyHint', {
            defaultValue: 'Show only facilities that can publish clinicians and take bookings',
          })}
        />
        <Chip
          icon="grid"
          label={t('facilityRegistry.allListings', { defaultValue: 'All listings' })}
          count={registry?.directory_total}
          selected={scope === 'all'}
          onPress={() => setScope('all')}
          accessibilityHint={t('facilityRegistry.allListingsHint', {
            defaultValue: 'Show every facility in the public directory, connected or not',
          })}
        />
      </ScrollView>
    </View>
  );

  /**
   * The state of the register in one sentence, chosen by the slice on screen.
   * Every number in it is the server's `registry` block — nothing here counts
   * anything itself, and nothing is shown at all when that block is absent
   * (an older API), because a made-up denominator is worse than none.
   */
  const registryExplainer = (r: RegistryTotals): string => {
    if (scope === 'clinicians') {
      return r.with_providers_total > 0
        ? t('discovery.explainer.clinicians', {
            clinicians: r.with_providers_total,
            connected: r.connected_total,
            total: r.directory_total,
            defaultValue:
              '{{clinicians}} of {{total}} listed facilities publish a clinician you can look up by name. {{connected}} more are connected to OpesCare but have not published their staff — you can still book those, or call any listing.',
          })
        : t('discovery.explainer.noClinicians', {
            connected: r.connected_total,
            total: r.directory_total,
            defaultValue:
              'No facility has published a clinician profile yet, so there is no doctor to look up by name. {{connected}} of {{total}} listings are connected to OpesCare and may still take a booking; the rest can be found and called.',
          });
    }
    if (scope === 'connected') {
      return t('facilityRegistry.connectedExplainer', {
        connected: r.connected_total,
        total: r.directory_total,
        defaultValue:
          '{{connected}} of {{total}} listed facilities are connected to OpesCare. Only these can publish clinicians or take an online booking — the rest can still be found and called.',
      });
    }
    return t('facilityRegistry.allExplainer', {
      connected: r.connected_total,
      total: r.directory_total,
      defaultValue:
        'Showing all {{total}} listed facilities. Only {{connected}} are connected to OpesCare; the others can be found and called, but publish no clinicians.',
    });
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

      {/* Which slice of the register is on screen is a filter, so it lives in
          the Filters panel beside the search field. */}
      {filtersOpen && renderRegistryFilter()}

      {/* The denominator, stated once. Only when the totals are actually in
          hand — an absent `registry` block means an older API, and a made-up
          number here would be worse than none. */}
      {!!registry && (
        <NoticeBanner
          // Amber whenever the slice on screen cannot fully answer "who is my
          // doctor?" — no published clinician anywhere, or a wider slice whose
          // rows are not all usable.
          tone={
            scope === 'clinicians' && registry.with_providers_total > 0 ? 'normal' : 'pending'
          }
          icon="info"
          message={registryExplainer(registry)}
        />
      )}

      {facilitiesQuery.isPending ? (
        <LoadingBlock label={t('careMap.loading')} />
      ) : facilitiesQuery.isError ? (
        <ErrorBlock
          message={t('appointments.book.loadFacilitiesErrorBody')}
          onRetry={() => facilitiesQuery.refetch()}
        />
      ) : facilities.length === 0 ? (
        <Card>
          {/* An empty list is an ANSWER, and which answer depends entirely on
              the slice that was asked for. Saying "no results" and quietly
              widening to a list of pharmacies is how this screen came to lie
              in the first place — so each case states its own fact and offers
              the next slice explicitly, as something the patient chooses. */}
          <EmptyState
            icon={scope === 'clinicians' ? 'person-search' : 'building'}
            tint="amber"
            title={
              scope === 'clinicians'
                ? t('discovery.empty.cliniciansTitle', {
                    defaultValue: 'No clinician profiles published yet',
                  })
                : t('appointments.book.searchEmptyTitle')
            }
            message={
              scope === 'clinicians'
                ? facilitySearch
                  ? t('discovery.empty.cliniciansSearchBody', {
                      defaultValue:
                        'No facility matching that search publishes a clinician you can look up by name. Widen to the connected facilities — those can still take a booking — or to every listing, which you can find and call.',
                    })
                  : t('discovery.empty.cliniciansBody', {
                      connected: registry?.connected_total ?? 0,
                      defaultValue:
                        'Not one facility on OpesCare has published its clinicians, so there is no doctor to search for by name. {{connected}} facilities are connected and may still take a booking; every listing in the directory can be found and called.',
                    })
                : scope === 'connected'
                  ? t('facilityRegistry.noConnectedMatch', {
                      defaultValue:
                        'No connected facility matches that search. The place you are looking for may still be in the public directory — show all listings to find and call it.',
                    })
                  : t('appointments.book.searchEmptyBody')
            }
            // The way out of an empty narrow slice is the next wider one, not a
            // cleared search — the search usually was not the problem.
            actionLabel={
              scope === 'clinicians'
                ? t('facilityRegistry.connectedOnly', { defaultValue: 'Connected' })
                : scope === 'connected'
                  ? t('facilityRegistry.allListings', { defaultValue: 'All listings' })
                  : facilitySearch
                    ? t('appointments.book.clearSearch')
                    : undefined
            }
            onAction={
              scope === 'clinicians'
                ? () => setScope('connected')
                : scope === 'connected'
                  ? () => setScope('all')
                  : facilitySearch
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
              const badge = rowValue(f);
              return (
                <ListRow
                  key={f.id}
                  icon={glyph.icon}
                  tint={glyph.tint}
                  title={f.facility_name}
                  meta={[facilityTypeLabel(f.facility_type), joinLocationParts(f.city, f.region)]}
                  value={badge.text}
                  valueColor={badge.color}
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
        <View style={styles.stack}>
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
          {/* A dead end needs a way out, not just an explanation. */}
          <CareButton
            label={t('facilityRegistry.showConnected', {
              defaultValue: 'Show connected facilities',
            })}
            variant="secondary"
            icon="shield-check"
            onPress={() => {
              setScope('connected');
              changeFacility();
            }}
          />
        </View>
      );
    }
    if (providers.length === 0) {
      // Connected, but nobody published. If the calendar is open the patient
      // can still book — a slot belongs to a facility, not to a named
      // clinician — so offer that instead of a dead end.
      if (facilityOpenSlots > 0 && facility) {
        return (
          <View style={styles.stack}>
            <Card>
              <EmptyState
                icon="stethoscope"
                tint="blue"
                title={t('facilityRegistry.noRosterTitle', {
                  defaultValue: 'No clinician profiles published yet',
                })}
                message={t('facilityRegistry.noRosterBookableBody', {
                  count: facilityOpenSlots,
                  defaultValue:
                    'This facility is connected to OpesCare but has not published its clinicians. Its appointment calendar is open, so you can book here without choosing a doctor first.',
                })}
              />
            </Card>
            <CareButton
              label={t('facility.bookHere')}
              icon="calendar"
              onPress={() => goToBooking(facility.id)}
            />
          </View>
        );
      }
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
      <View style={styles.cardStack}>
        {results.map((p) => {
          // Only honest when the registry holds an ACTIVE licence or credential.
          const verified = p.credentials.length > 0 || p.licenses.length > 0;
          const open = () => router.push(`/doctor/${p.id}`);
          return (
            <ResultCard
              key={p.id}
              mark={
                // No photo column exists on staff_profiles, so this is an
                // initials disc — `initialsFrom` so every screen agrees.
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initialsFrom(p.name, '')}</Text>
                </View>
              }
              trailing={
                <TouchableOpacity
                  onPress={open}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('opesCare.findProvider.viewProfile')}
                  style={styles.profileButton}
                >
                  <Text style={styles.profileButtonText} numberOfLines={1}>
                    {t('opesCare.findProvider.viewProfile')}
                  </Text>
                </TouchableOpacity>
              }
              onPress={open}
              accessibilityLabel={p.name}
              accessibilityHint={t('appointments.book.viewDoctorProfile')}
            >
              <View style={styles.nameRow}>
                <Text style={styles.providerName} numberOfLines={2}>
                  {p.name}
                </Text>
                {verified && (
                  <Icon
                    name="shield-check"
                    size={16}
                    color={colors.blue}
                    accessibilityLabel={t('opesCare.findProvider.verified', {
                      defaultValue: 'Verified credentials',
                    })}
                  />
                )}
              </View>
              <Text style={styles.providerRole} numberOfLines={1}>
                {roleLabel(p)}
              </Text>
              {/* The department, on its own line rather than dot-joined to the
                  role: the two together needed 291pt in a 142pt column, so
                  neither was readable. */}
              {!!p.department && <CardMetaRow icon="grid" text={p.department} />}
              {/* Every provider on this screen belongs to the facility you just
                  picked, so repeating its name on all four cards was noise that
                  cost the column its width. The city is the one place fact that
                  varies nothing here either — but it is short, and it answers
                  "where would I be going". No distance exists per provider, so
                  none is drawn. */}
              {!!p.city && <CardMetaRow icon="location" text={p.city} />}
            </ResultCard>
          );
        })}
      </View>
    );
  };

  const renderFacilityProviders = (f: FacilityPick) => {
    const glyph = facilityGlyph(f.facility_type);
    return (
      <>
        {/* The Filters panel: the two refinements this screen really has —
            which facility is being looked inside, and which department. */}
        {filtersOpen && (
          <Card variant="flush">
            <ListRow
              icon={glyph.icon}
              tint={glyph.tint}
              title={f.facility_name}
              meta={[facilityTypeLabel(f.facility_type), joinLocationParts(f.city, f.region)]}
              value={t('appointments.book.changeFacility')}
              onPress={changeFacility}
              accessibilityHint={t('appointments.book.changeFacility')}
              divider
            />
            <ListRow
              icon="building"
              tint="blue"
              title={t('appointments.book.viewFacility')}
              value={department ?? t('opesCare.findProvider.allDepartments')}
              onPress={() => router.push(`/facility/${f.id}`)}
            />
          </Card>
        )}

        {departments.length > 0 && (
          <View style={styles.railBlock}>
            <SectionHeader title={t('opesCare.findProvider.topCategories')} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tileRow}
              keyboardShouldPersistTaps="handled"
            >
              <CategoryTile
                icon="grid"
                label={t('opesCare.findProvider.all')}
                count={providers.length}
                selected={department === null}
                onPress={() => setDepartment(null)}
              />
              {departments.map((d) => (
                <CategoryTile
                  key={d.name}
                  icon={departmentGlyph(d.name)}
                  label={d.name}
                  count={d.count}
                  selected={department === d.name}
                  onPress={() => setDepartment(department === d.name ? null : d.name)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.resultsBlock}>
          {providersQuery.isSuccess && !facilityUnlinked && providers.length > 0 && (
            <>
              <ResultsHeader
                title={t('opesCare.findProvider.providersFound', { count: results.length })}
                sortLabel={
                  sort === 'department'
                    ? t('opesCare.findProvider.sortDepartment', {
                        defaultValue: 'Sort by: Department',
                      })
                    : t('opesCare.findProvider.sortName', { defaultValue: 'Sort by: Name' })
                }
                sortOpen={false}
                onSortPress={() => setSort(sort === 'name' ? 'department' : 'name')}
                sortAccessibilityLabel={t('opesCare.findProvider.sortA11y', {
                  defaultValue: 'Change how providers are sorted',
                })}
              />
              {hasFilters && (
                <TouchableOpacity
                  onPress={clearProviderFilters}
                  hitSlop={6}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('opesCare.findProvider.clearFilters')}
                >
                  <Text style={styles.clearLink}>{t('opesCare.findProvider.clearFilters')}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          {renderProviderResults()}
        </View>

        <HelpPanel
          title={t('opesCare.findProvider.assistTitle')}
          body={t('opesCare.findProvider.assistText')}
          actionLabel={t('opesCare.findProvider.requestAssistance')}
          actionIcon="headset"
          onAction={() => router.push('/help')}
        />
      </>
    );
  };

  // A deep link still resolving: show the header and a spinner, not the picker
  // flashing underneath it for a moment.
  const resolvingLink = !linkConsumed && !facility;

  // The bell is the only top-bar action, and its badge is the real unread
  // count (0 while loading or on error → no badge, never a made-up number).
  const topActions: FinderAction[] = [
    {
      icon: 'bell',
      onPress: () => router.push('/notifications'),
      accessibilityLabel: t('notifications.title'),
      badge: unreadCount,
    },
  ];

  // Which stage the search row is driving. Stage one searches the register by
  // facility name on submit; stage two filters the loaded roster as you type.
  const activeFilterCount = facility
    ? (department ? 1 : 0)
    : scope === 'clinicians'
      ? 0
      : 1;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <FinderTopBar onBack={goBack} backLabel={t('common.back')} actions={topActions} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <FinderHeading
          title={t('opesCare.findProvider.title')}
          subtitle={t('opesCare.findProvider.headingSubtitle', {
            defaultValue: 'Search and find healthcare providers',
          })}
        />

        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            {facility ? (
              <SearchField
                value={providerInput}
                onChangeText={setProviderInput}
                placeholder={t('opesCare.findProvider.searchPlaceholder')}
                accessibilityLabel={t('opesCare.findProvider.title')}
              />
            ) : (
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
            )}
          </View>
          <FiltersButton
            label={t('opesCare.findProvider.filters')}
            count={activeFilterCount}
            open={filtersOpen}
            onPress={() => setFiltersOpen((v) => !v)}
            accessibilityHint={t('opesCare.findProvider.applyFilters')}
          />
        </View>

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
    tileRow: { gap: spacing.sm + 2, paddingRight: spacing.md, paddingVertical: 2 },
    stack: { gap: spacing.sm + 2 },
    loadMore: { marginTop: spacing.md },

    // `stretch` is what makes the field match the 52pt Filters button.
    searchRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
    searchField: { flex: 1, minWidth: 0, justifyContent: 'center' },
    railBlock: { gap: spacing.sm },
    resultsBlock: { gap: spacing.sm + 2 },
    cardStack: { gap: spacing.sm + 2 },
    clearLink: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.link,
    },

    // 64pt initials disc — there is no provider photo anywhere in the schema.
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    avatarText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 22,
      color: colors.blue,
    },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    providerName: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: 18,
      lineHeight: 24,
      color: colors.textPrimary,
    },
    providerRole: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
    },
    profileButton: {
      minHeight: 40,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.blue,
    },
    profileButtonText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      color: colors.textOnBrand,
    },

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
