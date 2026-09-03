import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import type { PaginatedLabOrders } from './queries';

/**
 * Labs data layer — additive companion to `lib/api/queries.ts`.
 *
 * `queries.ts` already exposes `useLabOrders` (first page only) and
 * `useLabOrderDetail`. What was missing is (a) paging: GET /mobile/labs is
 * server-paginated and the list screen previously showed only the first 20
 * orders with no way to reach the rest, and (b) a way to read a lab's
 * reference range as numbers so an out-of-range value can be *shown* rather
 * than merely labelled.
 *
 * Both endpoints are verified live (200) but return an empty collection for
 * the demo patient — results are published by a laboratory, not by the app —
 * so paging and range parsing below are exercised only by their unit-shaped
 * logic, never against real result payloads yet.
 */

const PAGE_SIZE = 20;

/** Paginated lab-order feed. `status` maps 1:1 to the endpoint's filter
 * ('pending' | 'collected' | 'processing' | 'resulted' | 'cancelled'); omit
 * it for every order. Kept on a distinct query key from `useLabOrders` so the
 * two never fight over the same cache entry. */
export function useInfiniteLabOrders(status?: string) {
  return useInfiniteQuery({
    queryKey: ['labs', 'infinite', status ?? 'all'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await apiClient.get<PaginatedLabOrders>(endpoints.labs, {
          params: { page: pageParam, limit: PAGE_SIZE, ...(status ? { status } : {}) },
        })
      ).data,
    getNextPageParam: (lastPage) => {
      const { current_page: current, last_page: last } = lastPage.pagination;
      return current < last ? current + 1 : undefined;
    },
  });
}

// ---------------------------------------------------------------------------
// Reference-range interpretation
//
// The API returns `reference_range` as free text exactly as the performing
// laboratory entered it, so it is parsed defensively: anything that is not
// confidently numeric returns null and the UI falls back to plain text.
// ---------------------------------------------------------------------------

/** A parsed reference interval. A null bound means "unbounded on that side"
 * (e.g. "< 200" → { low: null, high: 200 }). */
export interface ReferenceBand {
  low: number | null;
  high: number | null;
}

const DECIMAL = String.raw`-?\d+(?:[.,]\d+)?`;

function toNumber(raw: string): number | null {
  const parsed = Number.parseFloat(raw.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Parse a laboratory reference range into numeric bounds.
 *
 * Understands the forms labs actually write: "4.0 - 11.0", "4,0–11,0",
 * "70 to 110", "< 200", "≤ 200", "> 40", "≥ 40". Returns null for anything
 * qualitative ("Negative", "Non-reactive") or unparseable — callers must
 * treat null as "render the raw text, draw no scale".
 */
export function parseReferenceRange(range: string | null | undefined): ReferenceBand | null {
  if (!range) return null;
  const cleaned = range.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return null;

  const upperOnly = cleaned.match(new RegExp(String.raw`^[<≤]=?\s*(${DECIMAL})$`));
  if (upperOnly) {
    const high = toNumber(upperOnly[1]);
    return high === null ? null : { low: null, high };
  }

  const lowerOnly = cleaned.match(new RegExp(String.raw`^[>≥]=?\s*(${DECIMAL})$`));
  if (lowerOnly) {
    const low = toNumber(lowerOnly[1]);
    return low === null ? null : { low, high: null };
  }

  const interval = cleaned.match(
    new RegExp(String.raw`^(${DECIMAL})\s*(?:-|–|—|to|à)\s*(${DECIMAL})$`, 'i'),
  );
  if (interval) {
    const low = toNumber(interval[1]);
    const high = toNumber(interval[2]);
    if (low === null || high === null || high <= low) return null;
    return { low, high };
  }

  return null;
}

/** Parse a result value that is purely numeric. Values carrying an operator
 * ("<0.5"), a word ("Negative") or a range are deliberately rejected — they
 * cannot be placed on a scale. */
export function parseNumericValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.trim();
  if (!new RegExp(String.raw`^${DECIMAL}$`).test(cleaned)) return null;
  return toNumber(cleaned);
}

/**
 * Where a value sits on a plotted reference scale, as a 0–1 ratio, together
 * with the normal band's own start/end on the same scale. Returns null unless
 * both the value and a two-sided band are numeric.
 *
 * The plotted domain is the reference band padded by 60% of its width on each
 * side, then widened further if the value falls outside that — so an extreme
 * result still lands inside the track instead of being clamped onto the edge.
 */
export function referenceScalePositions(
  value: number,
  band: ReferenceBand,
): { value: number; bandStart: number; bandEnd: number } | null {
  const { low, high } = band;
  if (low === null || high === null || high <= low) return null;

  const pad = (high - low) * 0.6;
  const domainMin = Math.min(low - pad, value - pad * 0.25);
  const domainMax = Math.max(high + pad, value + pad * 0.25);
  const span = domainMax - domainMin;
  if (!Number.isFinite(span) || span <= 0) return null;

  const ratio = (n: number) => Math.min(1, Math.max(0, (n - domainMin) / span));
  return { value: ratio(value), bandStart: ratio(low), bandEnd: ratio(high) };
}
