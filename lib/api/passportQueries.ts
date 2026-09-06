/**
 * The Health Passport — the patient's own record, read as thirty pages.
 *
 *   GET /mobile/health-passport                 the index, status and covers
 *   GET /mobile/health-passport/pages/{pageId}  one page, built from records
 *
 * Both are patient-token routes behind `auth.mobile`, so a guardian acting for
 * a dependent reads the DEPENDENT'S passport automatically: the act-as header
 * the client already attaches is what the server keys on. Nothing here names a
 * patient, and nothing here can.
 *
 * THE PAGES ARE NOT INVENTED. A page with nothing recorded comes back with an
 * empty `sections` array, which the screen renders as "nothing has been
 * recorded on this page yet". That is a true statement about the record, and
 * it is the only thing an empty page is ever allowed to say.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from './client';

const PASSPORT_PREFIX = '/mobile/health-passport';

export const passportEndpoints = {
  summary: PASSPORT_PREFIX,
  page: (pageId: string) => `${PASSPORT_PREFIX}/pages/${encodeURIComponent(pageId)}`,
} as const;

export const passportKeys = {
  all: ['health-passport'] as const,
  summary: ['health-passport', 'summary'] as const,
  page: (pageId: string) => ['health-passport', 'page', pageId] as const,
};

/** A row inside a section: one recorded fact. */
export type PassportItem = {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'danger';
};

export type PassportSection = {
  title: string;
  items: PassportItem[];
};

export type PassportPage = {
  id: string;
  number: number;
  icon: string;
  title: string;
  subtitle: string;
  /** `cover` and `back-cover` are drawn by the app; `record` is data-driven. */
  kind: 'cover' | 'back-cover' | 'record';
  sections: PassportSection[];
};

export type PassportPageRef = {
  id: string;
  number: number;
  icon: string;
  title: string;
  subtitle: string;
};

export type PassportSummary = {
  passport_version: string;
  status: 'ACTIVE' | 'PROVISIONAL' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  health_id: string | null;
  display_name: string | null;
  date_of_birth?: string | null;
  sex?: string | null;
  last_updated_at: string | null;
  total_pages: number;
  /** True when this is a demonstration account, so the page can say so. */
  is_demo?: boolean;
  pages: PassportPageRef[];
};

/** A server that does not serve the passport yet, as opposed to a real failure. */
export function isPassportUnserved(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === 405 || status === 501) return true;
  if (status !== 404) return false;
  const message = (error.response?.data as { message?: string } | undefined)?.message;
  return typeof message !== 'string' || /route|could not be found/i.test(message);
}

async function getData<T>(path: string): Promise<T> {
  const res = await apiClient.get<{ data?: T }>(path);
  const data = res.data?.data;
  if (data == null) throw new Error(`The passport answered without data: ${path}`);
  return data;
}

/** The index: credential status and the thirty page headings. */
export function usePassportSummary(opts: { enabled?: boolean } = {}): UseQueryResult<PassportSummary> {
  return useQuery({
    queryKey: passportKeys.summary,
    queryFn: () => getData<PassportSummary>(passportEndpoints.summary),
    enabled: opts.enabled ?? true,
    staleTime: 60 * 1000,
    retry: false,
  });
}

/**
 * One page. Pages are fetched as they are turned and then kept, so leafing
 * back and forth does not re-ask the server for a record that has not moved.
 */
export function usePassportPage(pageId: string | null, opts: { enabled?: boolean } = {}): UseQueryResult<PassportPage> {
  return useQuery({
    queryKey: passportKeys.page(pageId ?? ''),
    queryFn: () => getData<PassportPage>(passportEndpoints.page(pageId as string)),
    enabled: (opts.enabled ?? true) && !!pageId,
    staleTime: 60 * 1000,
    retry: false,
  });
}

/** True when the page carries nothing — the honest empty state, not a failure. */
export function pageIsEmpty(page: PassportPage | undefined): boolean {
  return !!page && page.kind === 'record' && page.sections.length === 0;
}
