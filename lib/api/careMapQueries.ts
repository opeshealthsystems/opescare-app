import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import type { CareFacilitySummary, PaginatedFacilities } from './queries';

/**
 * Care Access map data access.
 *
 * `lib/api/queries.ts` already exposes `useFacilities`, a single-page query the
 * booking flow's facility picker uses. The map needs the same endpoint paged
 * continuously across 903 rows, so it gets its own infinite query here rather
 * than the hand-rolled `page` + `setItems([...prev, ...data])` accumulation the
 * screen used before (which duplicated rows whenever a refetch resolved while a
 * later page was already merged in).
 */

export interface FacilityDirectoryParams {
  /** Free-text search — the API matches facility_name / description / city. */
  q?: string;
  /** Exact `care_facilities.facility_type` value; empty means every type. */
  type?: string;
  /** Substring-matched against `care_facilities.city`. */
  city?: string;
}

/**
 * Pages `GET /mobile/facilities` (20 rows per page).
 *
 * The endpoint applies no ORDER BY and accepts no sort parameter, so ordering
 * is entirely a client concern — see `sortFacilities` in
 * `lib/careMap/facilityDisplay.ts`, and note that it can only order the pages
 * fetched so far.
 */
export function useFacilityDirectory(params: FacilityDirectoryParams) {
  const { q, type, city } = params;

  return useInfiniteQuery({
    queryKey: ['care-map', 'facilities', { q: q ?? '', type: type ?? '', city: city ?? '' }],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await apiClient.get<PaginatedFacilities>(endpoints.facilities, {
          params: {
            ...(q ? { q } : {}),
            ...(type ? { type } : {}),
            ...(city ? { city } : {}),
            page: pageParam,
          },
        })
      ).data,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.current_page < lastPage.pagination.last_page
        ? lastPage.pagination.current_page + 1
        : undefined,
  });
}

/* ── Registry summary — the counts on the category rail ──────────────────── */

/**
 * `GET /api/mobile/facility-registry/summary`
 * (`MobileFacilityController::registrySummary`).
 *
 * Aggregate counts over the public directory, per `facility_type`. Nothing
 * here is derived or estimated: `directory_total` is a `count(*)` over the
 * active listings and `connected_total` a `count(facility_id)` over the same
 * rows. A type the register holds none of has NO row at all, which is why the
 * tile for it must show no figure rather than a zero.
 */
export interface FacilityRegistryTypeCount {
  facility_type: string;
  directory_total: number;
  connected_total: number;
}

export interface FacilityRegistrySummary {
  totals: { directory_total?: number; connected_total?: number };
  by_type: FacilityRegistryTypeCount[];
}

export function useFacilityRegistrySummary(enabled = true) {
  return useQuery({
    queryKey: ['care-map', 'registry-summary'],
    queryFn: async () =>
      (await apiClient.get<{ data: FacilityRegistrySummary }>('/mobile/facility-registry/summary'))
        .data.data,
    enabled,
    // The counts are cached server-side and move only when the register is
    // reloaded, so a long stale time here is honest rather than lazy.
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/**
 * `facility_type` → directory count, plus the register total under the empty
 * key the "All" tile uses. A failed or absent summary yields an empty map, and
 * every tile then draws no count at all.
 */
export function facilityTypeCounts(
  summary: FacilityRegistrySummary | undefined,
): Record<string, number> {
  if (!summary) return {};
  const counts: Record<string, number> = {};
  for (const row of summary.by_type ?? []) {
    if (row?.facility_type && typeof row.directory_total === 'number') {
      counts[row.facility_type] = row.directory_total;
    }
  }
  const total = summary.totals?.directory_total;
  if (typeof total === 'number') counts[''] = total;
  return counts;
}

/* ── Row shape ───────────────────────────────────────────────────────────── */

/**
 * What `GET /mobile/facilities` actually returns per row: the selected
 * `care_facilities` columns plus the three figures the controller computes for
 * the whole page. The three are optional because an older API build omits
 * them — the screen must then say nothing rather than "0 doctors".
 */
export interface FacilityDirectoryRow extends CareFacilitySummary {
  connected?: boolean;
  provider_count?: number;
  open_slot_count?: number;
}

/** Flattens the paged response into one list, in server order. */
export function flattenFacilityPages(
  pages: PaginatedFacilities[] | undefined,
): FacilityDirectoryRow[] {
  if (!pages) return [];
  return pages.flatMap((page) => page.data);
}
