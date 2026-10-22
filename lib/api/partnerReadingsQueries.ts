import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from './client';

/**
 * Partner-reported readings — `GET /mobile/records/partner-readings`.
 *
 * These are observations, diagnostic reports and immunizations that a
 * partner system sent in over FHIR ingest. They are NOT readings taken at a
 * facility and must never be merged into the vitals/labs lists or charts:
 * this hook is the only reader, and only app/records/partner-readings.tsx
 * renders it. Labels arrive in the request language (Accept-Language is set
 * by the api client).
 */
export const PARTNER_READINGS_ENDPOINT = '/mobile/records/partner-readings';
export const PARTNER_READINGS_PER_PAGE = 20; // server rejects > 50 with 422

export type PartnerReadingType = 'observation' | 'diagnostic_report' | 'immunization';

export interface PartnerReadingComponent {
  code: string | null;
  display: string | null;
  value: number | string | null;
  unit: string | null;
  value_text: string | null;
}

export interface PartnerReading {
  id: number | string;
  type: PartnerReadingType;
  kind: string | null;
  display: string | null;
  code: string | null;
  code_system: string | null;
  value: number | string | null;
  unit: string | null;
  value_text: string | null;
  components: PartnerReadingComponent[] | null;
  reference_range: string | null;
  interpretation: string | null;
  conclusion: string | null;
  status: string | null;
  effective_at: string | null;
  received_at: string | null;
  sending_facility: { id: number | string | null; name: string | null } | null;
  sending_system: { name: string | null; client_id: string | null } | null;
  provenance: 'partner_reported';
  provenance_label: string | null;
}

export interface PartnerReadingsMeta {
  page: number;
  per_page: number;
  total: number;
  has_more: boolean;
  provenance: string;
  provenance_label: string | null;
  note: string | null;
}

export interface PartnerReadingsPage {
  data: PartnerReading[];
  meta: PartnerReadingsMeta;
}

export async function fetchPartnerReadingsPage(page: number): Promise<PartnerReadingsPage> {
  const res = await apiClient.get<PartnerReadingsPage>(PARTNER_READINGS_ENDPOINT, {
    params: { page, per_page: PARTNER_READINGS_PER_PAGE },
  });
  return res.data;
}

/** Next page number from a page's meta, or undefined when there is none. */
export function nextPartnerReadingsPage(last: PartnerReadingsPage): number | undefined {
  return last.meta?.has_more ? (last.meta.page ?? 1) + 1 : undefined;
}

/** Newest first by effective date (falling back to received date). */
export function sortPartnerReadings(rows: PartnerReading[]): PartnerReading[] {
  const ts = (r: PartnerReading) => Date.parse(r.effective_at ?? r.received_at ?? '') || 0;
  return [...rows].sort((a, b) => ts(b) - ts(a));
}

export function usePartnerReadings() {
  return useInfiniteQuery({
    queryKey: ['records', 'partner-readings'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchPartnerReadingsPage(pageParam),
    getNextPageParam: nextPartnerReadingsPage,
  });
}
