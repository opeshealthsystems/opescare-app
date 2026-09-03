import { useMemo } from 'react';
import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import type {
  AppointmentSlotOption,
  CareFacilitySummary,
  FacilitySlotsResponse,
  PaginatedFacilities,
} from './queries';

/**
 * Booking-flow data hooks — kept out of `lib/api/queries.ts` on purpose so the
 * appointment wizard owns its own surface.
 *
 * The two facts these hooks exist to deal with:
 *
 *  1. The directory (`care_facilities`) holds 903 listings, but only the rows
 *     that carry a linked internal `facilities` id can ever produce a slot —
 *     today that is 17 hospitals/clinics. `GET /mobile/facilities` does not
 *     select, expose, or filter on that link (see
 *     MobileFacilityController::index), so there is no server-side way to ask
 *     for "facilities I can actually book". The client has to find out by
 *     asking the slots endpoint, which answers honestly:
 *     `{facility_id: null, data: []}` for an unlinked listing.
 *  2. `GET /mobile/facilities` returns one page of 20 with no ordering hint,
 *     so the picker needs real pagination or it silently hides 883 listings
 *     behind a "no facilities found" style dead end.
 */

// ---------------------------------------------------------------------------
// Facility directory — paginated
// ---------------------------------------------------------------------------

export interface FacilityDirectoryParams {
  q?: string;
  type?: string;
  city?: string;
}

/**
 * The facility picker's list. Paginates through the whole directory instead of
 * stopping at the first 20 rows the endpoint returns.
 */
export function useInfiniteFacilities(params: FacilityDirectoryParams) {
  return useInfiniteQuery({
    queryKey: ['facilities', 'infinite', params],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await apiClient.get<PaginatedFacilities>(endpoints.facilities, {
          params: { ...params, page: pageParam },
        })
      ).data,
    getNextPageParam: (last) =>
      last.pagination.current_page < last.pagination.last_page
        ? last.pagination.current_page + 1
        : undefined,
  });
}

/** Flatten the paged responses into the list the picker renders. */
export function flattenFacilityPages(
  pages: PaginatedFacilities[] | undefined,
): CareFacilitySummary[] {
  if (!pages) return [];
  return pages.flatMap((page) => page.data);
}

// ---------------------------------------------------------------------------
// Bookability probe
// ---------------------------------------------------------------------------

export type BookabilityState =
  /** Never asked — the card has not been on screen yet. */
  | 'unknown'
  /** Request in flight. */
  | 'checking'
  /** Linked to an operational facility AND has open slots in the window. */
  | 'bookable'
  /** No linked internal facility — this listing cannot take an online booking. */
  | 'unlinked'
  /** Linked, but nothing open from today onward. */
  | 'no_slots'
  /** The probe itself failed; say nothing rather than something wrong. */
  | 'error';

export interface FacilityBookability {
  state: BookabilityState;
  /**
   * Internal `facilities` id — the value POST /mobile/appointments validates
   * against (`exists:facilities,id`). NEVER the care_facilities id the patient
   * browsed; sending that is a 422.
   */
  facilityId: string | null;
  /** Start of the earliest open slot in the returned window, if any. */
  nextSlotAt: string | null;
  /** Open slots in the returned window (the endpoint caps its page at 50). */
  openCount: number;
}

export const UNKNOWN_BOOKABILITY: FacilityBookability = {
  state: 'unknown',
  facilityId: null,
  nextSlotAt: null,
  openCount: 0,
};

/**
 * Ask the slots endpoint whether each of `ids` can actually be booked.
 *
 * The query key is deliberately byte-identical to `useFacilitySlots`'s
 * (`['facilities', id, 'slots', date]` in lib/api/queries.ts) so a probe warms
 * the cache the slot step then reads — picking a facility whose badge already
 * says "available" costs no second round trip.
 *
 * Callers must feed this only the ids currently on screen. It is O(n) requests
 * by construction; there is no batch endpoint.
 */
export function useFacilityBookability(
  ids: string[],
  date: string,
): Map<string, FacilityBookability> {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['facilities', id, 'slots', date] as const,
      queryFn: async () =>
        (
          await apiClient.get<FacilitySlotsResponse>(endpoints.facilitySlots(id), {
            params: { date },
          })
        ).data,
      // A facility's link to an operational record does not change minute to
      // minute; re-asking on every scroll back would be pure noise.
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  // The results array is a fresh object on every render, so the Map is
  // memoised on a signature instead — otherwise passing it as FlatList
  // `extraData` would re-render every visible row on every keystroke.
  const signature = ids
    .map((id, index) => {
      const result = results[index];
      if (!result) return `${id}:none`;
      return `${id}:${result.status}:${result.data?.facility_id ?? '-'}:${result.data?.data.length ?? 0}`;
    })
    .join('|');

  return useMemo(() => {
    const map = new Map<string, FacilityBookability>();
    ids.forEach((id, index) => {
      const result = results[index];
      if (!result) {
        map.set(id, UNKNOWN_BOOKABILITY);
        return;
      }
      if (result.isPending) {
        map.set(id, { ...UNKNOWN_BOOKABILITY, state: 'checking' });
        return;
      }
      if (result.isError || !result.data) {
        map.set(id, { ...UNKNOWN_BOOKABILITY, state: 'error' });
        return;
      }
      const { facility_id: facilityId, data } = result.data;
      if (!facilityId) {
        map.set(id, { state: 'unlinked', facilityId: null, nextSlotAt: null, openCount: 0 });
        return;
      }
      if (data.length === 0) {
        map.set(id, { state: 'no_slots', facilityId, nextSlotAt: null, openCount: 0 });
        return;
      }
      map.set(id, {
        state: 'bookable',
        facilityId,
        nextSlotAt: data[0].starts_at,
        openCount: data.reduce((sum, slot) => sum + Math.max(slot.available_count, 0), 0),
      });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}

// ---------------------------------------------------------------------------
// Slot-window helpers
// ---------------------------------------------------------------------------

/**
 * `YYYY-MM-DD` in the device's own timezone.
 *
 * `Date#toISOString().slice(0, 10)` is wrong here: it converts to UTC first, so
 * a Date parked at local midnight in Cameroon (UTC+1) reports the *previous*
 * calendar day. That silently shifted every date this screen sent to the API
 * and every date it grouped slots by.
 */
export function localDateKey(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The slots endpoint returns everything from `date` **onward**, capped at 50 —
 * not just that day. Rendering the raw list as "today's times" mixes tomorrow's
 * 08:00 in with today's, with no way for the patient to tell them apart.
 */
export function slotsOnDay(slots: AppointmentSlotOption[], dayKey: string): AppointmentSlotOption[] {
  return slots.filter((slot) => localDateKey(slot.starts_at) === dayKey);
}

/** Distinct days covered by the returned window — powers the date strip's dots. */
export function daysCoveredBySlots(slots: AppointmentSlotOption[]): Set<string> {
  return new Set(slots.map((slot) => localDateKey(slot.starts_at)));
}

/** The first slot after `dayKey`, so an empty day can offer a real way forward. */
export function firstSlotAfterDay(
  slots: AppointmentSlotOption[],
  dayKey: string,
): AppointmentSlotOption | null {
  return slots.find((slot) => localDateKey(slot.starts_at) > dayKey) ?? null;
}

/** Slot length in whole minutes, straight off the slot's own bounds. */
export function slotDurationMinutes(slot: AppointmentSlotOption): number | null {
  const start = new Date(slot.starts_at).getTime();
  const end = new Date(slot.ends_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 60000);
}

export type SlotPeriod = 'morning' | 'afternoon' | 'evening';

/** Group a day's slots the way a clinic diary reads. */
export function groupSlotsByPeriod(
  slots: AppointmentSlotOption[],
): { period: SlotPeriod; slots: AppointmentSlotOption[] }[] {
  const buckets: Record<SlotPeriod, AppointmentSlotOption[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  for (const slot of slots) {
    const hour = new Date(slot.starts_at).getHours();
    if (hour < 12) buckets.morning.push(slot);
    else if (hour < 17) buckets.afternoon.push(slot);
    else buckets.evening.push(slot);
  }
  return (['morning', 'afternoon', 'evening'] as SlotPeriod[])
    .map((period) => ({ period, slots: buckets[period] }))
    .filter((group) => group.slots.length > 0);
}

// ---------------------------------------------------------------------------
// Booking failure → message key
// ---------------------------------------------------------------------------

/**
 * Map a failed POST /mobile/appointments onto a key under
 * `appointments.book.*`. The backend answers with distinguishable shapes and
 * the patient deserves to be told which one happened — "slot just went" is a
 * different problem from "we could not reach the server".
 *
 * 409 `SLOT_FULL` (bootstrap/app.php renders SlotFullException),
 * 422 validation (a bad facility_id / slot id lands here),
 * 401/403 auth, anything else network/unknown.
 */
export function bookingErrorKey(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'bookErrorUnknown';
  if (!error.response) return 'bookErrorNetwork';
  const status = error.response.status;
  const code = (error.response.data as { error_code?: string } | undefined)?.error_code;
  if (status === 409 || code === 'SLOT_FULL') return 'bookErrorSlotTaken';
  if (status === 422) return 'bookErrorRejected';
  if (status === 401 || status === 403) return 'bookErrorAuth';
  if (status >= 500) return 'bookErrorServer';
  return 'bookErrorUnknown';
}
