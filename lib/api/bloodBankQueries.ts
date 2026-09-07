import { useQueries } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import type {
  BloodBankResult,
  BloodComponentValue,
  BloodGroupValue,
  BloodStockSnapshot,
} from './queries';

/**
 * Per-component availability for ONE blood bank (PM-BLOOD-02).
 *
 * ── Why this needs its own hook ───────────────────────────────────────────
 * `GET api/mobile/blood/search` answers for a single component: pass
 * `component_type=whole_blood` and every row's `availability` describes whole
 * blood and nothing else. The reference's "Component Availability" table wants
 * all five at once, so the only honest way to build it is to ask five times
 * and read this facility out of each answer.
 *
 * `useQueries` rather than five `useQuery` calls so the number of hooks stays
 * fixed if the component list ever changes — a conditional hook is a crash,
 * not a warning.
 *
 * ── Absent is not zero ────────────────────────────────────────────────────
 * A facility missing from a component's result set has NOT reported zero
 * units; it has reported nothing. The search only ever returns rows a facility
 * has actually published (`status` is always `available` on the way out), so
 * "not listed" means unknown. Every consumer gets `snapshot: null` for that
 * case and must render it as unknown — printing 0 would be inventing a fact,
 * and on this screen it would be inventing a dangerous one: somebody reading
 * "0 units" decides not to travel.
 */

export interface ComponentAvailability {
  component: BloodComponentValue;
  /** Null when this facility published nothing for this component. */
  snapshot: BloodStockSnapshot | null;
  isPending: boolean;
  isError: boolean;
}

export function useBloodBankComponents(args: {
  facilityId: string | null;
  bloodGroup: BloodGroupValue | null;
  components: readonly BloodComponentValue[];
  lat: number;
  lng: number;
  radiusKm: number;
  /**
   * Search the whole country instead of the radius. Set when the facility was
   * itself only found nationwide: asking within a radius it is not inside
   * returns nothing, and "nothing" on this table renders as "Not reported",
   * which is a statement about stock and would be false.
   */
  nationwide?: boolean;
  enabled?: boolean;
}): { rows: ComponentAvailability[]; isPending: boolean; isError: boolean } {
  const {
    facilityId,
    bloodGroup,
    components,
    lat,
    lng,
    radiusKm,
    nationwide = false,
    enabled = true,
  } = args;

  const active = enabled && !!bloodGroup && !!facilityId;

  const results = useQueries({
    queries: components.map((component) => ({
      // Deliberately the SAME key shape as useBloodSearch (or
      // useNationwideBloodSearch), so a component the finder already searched
      // is served from cache instead of refetched.
      queryKey: nationwide
        ? ['blood', 'search', 'nationwide', bloodGroup, component]
        : ['blood', 'search', bloodGroup, component, lat, lng, radiusKm],
      enabled: active,
      queryFn: async () =>
        (
          await apiClient.get<{ data: BloodBankResult[] }>(endpoints.bloodSearch, {
            params: nationwide
              ? { blood_group: bloodGroup, component_type: component, limit: 50 }
              : {
                  blood_group: bloodGroup,
                  component_type: component,
                  lat,
                  lng,
                  radius_km: radiusKm,
                },
          })
        ).data.data,
    })),
  });

  const rows: ComponentAvailability[] = components.map((component, index) => {
    const query = results[index];
    const match = query?.data?.find((row) => row.id === facilityId) ?? null;

    return {
      component,
      snapshot: match?.availability ?? null,
      isPending: query?.isPending ?? false,
      isError: query?.isError ?? false,
    };
  });

  return {
    rows,
    // Pending only while nothing has arrived: one slow component must not hold
    // the whole table behind a spinner.
    isPending: active && results.every((query) => query.isPending),
    isError: active && results.every((query) => query.isError),
  };
}

/**
 * The four components a Blood Finder card shows, in the reference's order.
 *
 * FOUR, not the image's five: `BloodComponentType` has whole_blood, red_cells,
 * platelets and plasma. Nothing in this platform tracks cryoprecipitate, so a
 * fifth chip would name a component no facility can report.
 */
export const CARD_COMPONENTS: readonly BloodComponentValue[] = [
  'whole_blood',
  'red_cells',
  'platelets',
  'plasma',
] as const;

/**
 * Per-component availability for EVERY facility in one search, at once.
 *
 * The finder's card row (PM-BLOOD-01) shows a chip per component with its unit
 * count. Asking per card would be four requests per bank; asking here is four
 * requests for the whole page, whatever its length — and under the same query
 * keys `useBloodSearch` uses, so the component already on screen is free.
 *
 * `forFacility` returns null for a component the facility has not published.
 * Absent is not zero: the search only returns rows a facility actually
 * reported, so a missing row means "not said", and a chip reading 0 would tell
 * somebody there is no blood when nobody has claimed that.
 */
export function useBloodComponentMatrix(args: {
  bloodGroup: BloodGroupValue | null;
  lat: number;
  lng: number;
  radiusKm: number;
  enabled?: boolean;
}): {
  isPending: boolean;
  forFacility: (facilityId: string) => { component: BloodComponentValue; units: string | null }[];
} {
  const { bloodGroup, lat, lng, radiusKm, enabled = true } = args;
  const active = enabled && !!bloodGroup;

  const results = useQueries({
    queries: CARD_COMPONENTS.map((component) => ({
      queryKey: ['blood', 'search', bloodGroup, component, lat, lng, radiusKm],
      enabled: active,
      queryFn: async () =>
        (
          await apiClient.get<{ data: BloodBankResult[] }>(endpoints.bloodSearch, {
            params: {
              blood_group: bloodGroup,
              component_type: component,
              lat,
              lng,
              radius_km: radiusKm,
            },
          })
        ).data.data,
    })),
  });

  return {
    isPending: active && results.every((query) => query.isPending),
    forFacility: (facilityId: string) =>
      CARD_COMPONENTS.map((component, index) => ({
        component,
        units:
          results[index]?.data?.find((row) => row.id === facilityId)?.availability?.units_range ??
          null,
      })),
  };
}

/**
 * Per-GROUP availability across every facility in one search (SB-05).
 *
 * The availability map draws a small grid on each blood bank — O+, A+, B+, AB+
 * and so on, each with its own figure. `GET blood/search` answers for one
 * group at a time, so the grid is one request per group for the whole page,
 * under the same query keys the finder uses.
 *
 * Same rule as everywhere else in this feature: a group a facility has not
 * published comes back null and must be drawn as UNKNOWN. On this screen that
 * matters twice over, because the reference colours its grid — and a red "0"
 * on a group nobody reported would be the app inventing the one fact that
 * stops somebody travelling.
 */
export function useBloodGroupMatrix(args: {
  groups: readonly BloodGroupValue[];
  componentType: BloodComponentValue;
  lat: number;
  lng: number;
  radiusKm: number;
  enabled?: boolean;
}): {
  isPending: boolean;
  facilities: BloodBankResult[];
  forFacility: (facilityId: string) => { group: BloodGroupValue; units: string | null }[];
} {
  const { groups, componentType, lat, lng, radiusKm, enabled = true } = args;

  const results = useQueries({
    queries: groups.map((group) => ({
      queryKey: ['blood', 'search', group, componentType, lat, lng, radiusKm],
      enabled,
      queryFn: async () =>
        (
          await apiClient.get<{ data: BloodBankResult[] }>(endpoints.bloodSearch, {
            params: {
              blood_group: group,
              component_type: componentType,
              lat,
              lng,
              radius_km: radiusKm,
            },
          })
        ).data.data,
    })),
  });

  // Every distinct facility that reported ANY group, nearest first. A bank is
  // on the map because it published something, not because it exists.
  const seen = new Map<string, BloodBankResult>();
  results.forEach((query) => {
    query.data?.forEach((row) => {
      if (!seen.has(row.id)) seen.set(row.id, row);
    });
  });

  const facilities = [...seen.values()].sort(
    (a, b) => (a.distance_km ?? Number.MAX_SAFE_INTEGER) - (b.distance_km ?? Number.MAX_SAFE_INTEGER),
  );

  return {
    isPending: enabled && results.every((query) => query.isPending),
    facilities,
    forFacility: (facilityId: string) =>
      groups.map((group, index) => ({
        group,
        units:
          results[index]?.data?.find((row) => row.id === facilityId)?.availability?.units_range ??
          null,
      })),
  };
}
