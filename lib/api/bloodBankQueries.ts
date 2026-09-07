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
  enabled?: boolean;
}): { rows: ComponentAvailability[]; isPending: boolean; isError: boolean } {
  const {
    facilityId,
    bloodGroup,
    components,
    lat,
    lng,
    radiusKm,
    enabled = true,
  } = args;

  const active = enabled && !!bloodGroup && !!facilityId;

  const results = useQueries({
    queries: components.map((component) => ({
      // Deliberately the SAME key shape as useBloodSearch, so a component the
      // finder already searched is served from cache instead of refetched.
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
