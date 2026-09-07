import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type { BloodGroupValue } from './queries';

/**
 * The volunteer blood donor register — SB-02 searches it, SB-03 joins it.
 *
 * ── What this is not ──────────────────────────────────────────────────────
 * It is not a patient search. Nobody is on this register by holding a Health
 * ID; a person is here only because they completed SB-03 and consented, and
 * the API refuses to answer at all without a blood group — there is no call
 * that lists everybody. See MobileBloodDonorController for the server side.
 *
 * ── What a result carries ─────────────────────────────────────────────────
 * A given name and a last initial, the group, the published AREA, and roughly
 * how long since the last donation. No photo, no age, no date of birth, no
 * distance in kilometres, no Health ID. `contact_phone` is null unless that
 * volunteer separately agreed to publish one, which is what `phone_shared`
 * says — screens must branch on it rather than assuming a number is there.
 */

export interface DonorResult {
  id: string;
  /** Given name + last initial, e.g. "Estelle K." */
  display_name: string;
  blood_group: string;
  /** Published area — a city, never a coordinate or a distance. */
  area: string | null;
  region: string | null;
  /** Whole months since their last recorded donation, or null. */
  months_since: number | null;
  /** Null unless `phone_shared`. */
  contact_phone: string | null;
  phone_shared: boolean;
}

export interface DonorRegistration {
  id: string;
  blood_group: string;
  city: string | null;
  region: string | null;
  status: 'active' | 'paused' | 'withdrawn';
  /** True only while listing consent stands. */
  listed: boolean;
  listing_consent_at: string | null;
  share_phone: boolean;
  contact_phone: string | null;
  last_donated_on: string | null;
  note: string | null;
}

export interface DonorSearchInput {
  bloodGroup: BloodGroupValue | null;
  city?: string | null;
  enabled?: boolean;
}

export function useDonorSearch({ bloodGroup, city, enabled = true }: DonorSearchInput) {
  return useQuery({
    queryKey: ['blood', 'donors', bloodGroup, city ?? null],
    // No group, no query. The endpoint would refuse anyway; not firing it keeps
    // the screen from showing a validation error as if it were a failure.
    enabled: enabled && !!bloodGroup,
    queryFn: async () =>
      (
        await apiClient.get<{ data: DonorResult[]; meta: { capped_at: number } }>(
          '/mobile/blood/donors',
          { params: { blood_group: bloodGroup, ...(city ? { city } : {}) } },
        )
      ).data,
  });
}

/** The caller's own entry, or null when they have not joined. */
export function useMyDonorRegistration() {
  return useQuery({
    queryKey: ['blood', 'donors', 'me'],
    queryFn: async () =>
      (await apiClient.get<{ data: DonorRegistration | null }>('/mobile/blood/donors/me')).data
        .data,
  });
}

export interface JoinDonorInput {
  blood_group: BloodGroupValue;
  city?: string | null;
  region?: string | null;
  /** Required to be listed at all. False saves the entry unlisted. */
  listing_consent: boolean;
  /** A SECOND consent: being listed and being rung are different decisions. */
  share_phone?: boolean;
  contact_phone?: string | null;
  last_donated_on?: string | null;
  note?: string | null;
}

export function useJoinDonorRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: JoinDonorInput) =>
      (await apiClient.post<{ data: DonorRegistration }>('/mobile/blood/donors', input)).data.data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['blood', 'donors'] });
    },
  });
}

export function useSetDonorStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (status: 'active' | 'paused' | 'withdrawn') =>
      (await apiClient.post<{ data: DonorRegistration }>('/mobile/blood/donors/status', { status }))
        .data.data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['blood', 'donors'] });
    },
  });
}
