import { useInfiniteQuery } from '@tanstack/react-query';
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

/** Flattens the paged response into one list, in server order. */
export function flattenFacilityPages(
  pages: PaginatedFacilities[] | undefined,
): CareFacilitySummary[] {
  if (!pages) return [];
  return pages.flatMap((page) => page.data);
}
