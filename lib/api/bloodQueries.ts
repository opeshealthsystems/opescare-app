import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import type {
  BloodBankResult,
  BloodComponentValue,
  BloodGroupValue,
} from './queries';

/**
 * Blood Finder — the widen-the-net query.
 *
 * `useBloodSearch` in queries.ts always sends a lat/lng origin, so it can only
 * ever answer "what is near this point". GET /mobile/blood/search treats
 * lat/lng as `nullable` (the validator only requires them together), and
 * BloodAvailabilitySearchService skips distance filtering entirely when the
 * origin is null — so omitting both is a real, supported nationwide search,
 * not a hack.
 *
 * That matters because the radius search legitimately returns nothing: blood
 * stock is self-reported by each facility, so "nothing within 25 km" is the
 * common case rather than the exception. Being able to say "nothing near you,
 * but two facilities elsewhere in the country report it" — or, honestly,
 * "nobody anywhere is reporting it" — is the difference between a dead end and
 * an answer the patient can act on.
 *
 * Rows come back distance-less (`distance_km: null`), which the cards already
 * render as "Distance unavailable".
 */
export function useNationwideBloodSearch(args: {
  bloodGroup: BloodGroupValue | null;
  componentType: BloodComponentValue;
  enabled?: boolean;
}) {
  const { bloodGroup, componentType, enabled = true } = args;

  return useQuery({
    queryKey: ['blood', 'search', 'nationwide', bloodGroup, componentType],
    enabled: enabled && !!bloodGroup,
    queryFn: async () =>
      (
        await apiClient.get<{ data: BloodBankResult[] }>(endpoints.bloodSearch, {
          params: {
            blood_group: bloodGroup,
            component_type: componentType,
            // No lat/lng and no radius_km on purpose — see the note above.
            limit: 50,
          },
        })
      ).data.data,
  });
}
