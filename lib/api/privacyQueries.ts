import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import type { AccessLogItem, PaginatedAccessLogs } from './queries';
import type { OfficialDocument, PaginatedDocuments } from './types';

/**
 * Privacy / data-rights hooks that don't belong in the shared queries.ts.
 *
 * GET /mobile/access-logs is a plain Laravel paginator (50 per page, no filter
 * parameters — see MobileGovernanceController::listAccessLogs). The old
 * page-at-a-time hook meant the screen could only ever reason about one page,
 * so any summary count or client-side filter would have silently described a
 * slice while looking like it described the history. Loading progressively
 * with an infinite query fixes that: the screen always knows how many entries
 * it actually holds versus `total`, and can say so.
 */

export interface AccessLogHistory {
  /** Every entry loaded so far, newest first. */
  entries: AccessLogItem[];
  /** All-time count the server reports — not just what's loaded. */
  total: number;
  /** True once `entries` covers the whole history, so counts are exact. */
  complete: boolean;
}

export function useAccessLogHistory() {
  return useInfiniteQuery({
    queryKey: ['access-logs', 'history'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await apiClient.get<PaginatedAccessLogs>(endpoints.accessLogs, {
          params: { page: pageParam },
        })
      ).data,
    getNextPageParam: (lastPage) =>
      lastPage.current_page < lastPage.last_page ? lastPage.current_page + 1 : undefined,
    select: (data): AccessLogHistory => {
      const entries = data.pages.flatMap((page) => page.data);
      const total = data.pages[0]?.total ?? entries.length;
      return { entries, total, complete: entries.length >= total };
    },
  });
}

export interface DocumentLibrary {
  documents: OfficialDocument[];
  total: number;
}

/**
 * GET /mobile/documents, paginated the same way. The shared `useDocuments()`
 * hook only ever fetches page 1 and drops `pagination.last_page` on the floor,
 * which silently hides every document past the first page from a patient who
 * has more than one page of them. This walks the pages on demand instead.
 */
export function useDocumentLibrary() {
  return useInfiniteQuery({
    queryKey: ['documents', 'library'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await apiClient.get<PaginatedDocuments>(endpoints.documents, {
          params: { page: pageParam },
        })
      ).data,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.current_page < lastPage.pagination.last_page
        ? lastPage.pagination.current_page + 1
        : undefined,
    select: (data): DocumentLibrary => ({
      documents: data.pages.flatMap((page) => page.data),
      total: data.pages[0]?.pagination.total ?? 0,
    }),
  });
}
