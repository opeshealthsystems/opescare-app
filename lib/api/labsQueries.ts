/**
 * Labs / diagnostics data layer — additive companion to `lib/api/queries.ts`.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ BACKEND STATUS (checked 2026-09-05)                                     │
 * │                                                                         │
 * │ SERVED. The finder backend now answers every path below —               │
 * │ `MobileLabController` (list / summary / detail / report / trend) and    │
 * │ `MobileLabRequestController` (catalogue / request / collection), wired  │
 * │ through `routes/mobile_labs.php`. The unavailable state below is KEPT:  │
 * │ a deployment that has not loaded that route file still answers 404, and │
 * │ "this server does not serve labs" is a different message from "you      │
 * │ have no results yet".                                                   │
 * │                                                                         │
 * │ Nothing here or on the server fabricates a result: no fixtures, no      │
 * │ fallback payloads, no invented reference ranges, no synthesised series. │
 * │ Where the laboratory published no range and the platform holds none the │
 * │ server returns `ref_low` / `ref_high` / `reference` as null and the     │
 * │ flag `unflagged`, and the screens print "Not recorded" — never a        │
 * │ number, and never "Normal". The retry policy never re-tries a 4xx, so   │
 * │ the unavailable state appears on the first response.                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * The contract is the OPES `src/api/diagnostics.ts` module — the typed shapes
 * the ported DIA-* screens (dashboard, result detail, full report, trend,
 * request-a-test, sample collection) already expect — re-homed under the
 * finder's `/mobile/*` prefix and the finder's response envelope
 * (`{ data }` for one resource, `{ data, pagination }` for a list):
 *
 *   GET  /mobile/labs                      → LabPage<PortalLabOrder>   (useLabResults / useLabOrders)
 *   GET  /mobile/labs/summary              → DiagnosticsSummary        (useDiagnosticsSummary)
 *   GET  /mobile/labs/{id}                 → LabOrderDetail            (useLabResult / useLabOrder)
 *   GET  /mobile/labs/{id}/report          → LabReport
 *   GET  /mobile/labs/trends/{analyte}     → LabTrend
 *   GET  /mobile/labs/catalogue?q=         → LabTestCatalogueItem[]
 *   POST /mobile/labs/requests             → LabTestRequest
 *   GET  /mobile/labs/collection           → SampleCollection
 *
 * `/mobile/labs` and `/mobile/labs/{id}` are the two paths the app used before
 * the trim; the rest mirror the OPES contract (`/patient/lab-orders`,
 * `/patient/diagnostics/summary`, `/patient/lab-trends/{analyte}`). A trend is
 * keyed by ANALYTE, not by order id, because the series spans every order the
 * analyte appears in — that is why it is `/trends/{analyte}` and not
 * `/{id}/trend`.
 *
 * Paths are spelled out here rather than in `endpoints.ts`, which is owned
 * elsewhere (same convention as `vitalsQueries.ts`).
 */
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from './client';
import type { Appointment } from './types';

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const LABS_ENDPOINTS = {
  /** GET — the patient's lab orders, newest first, server-paginated. */
  list: '/mobile/labs',
  /** GET — counters for the diagnostics dashboard. */
  summary: '/mobile/labs/summary',
  /** GET — one order with its full result set. */
  detail: (id: string) => `/mobile/labs/${encodeURIComponent(id)}`,
  /** GET — the order plus the patient block and the stored PDF, if any. */
  report: (id: string) => `/mobile/labs/${encodeURIComponent(id)}/report`,
  /** GET — one analyte's series across every order it appears in. */
  trend: (analyte: string) => `/mobile/labs/trends/${encodeURIComponent(analyte)}`,
  /** GET — the orderable test catalogue, searchable with `?q=`. */
  catalogue: '/mobile/labs/catalogue',
  /** POST — ask the care team for a test (a request, never an order). */
  requests: '/mobile/labs/requests',
  /** GET — the lab visit and the orders still waiting on a sample. */
  collection: '/mobile/labs/collection',
} as const;

// ---------------------------------------------------------------------------
// Types — the OPES diagnostics contract (labs subset), exported for the screens
// ---------------------------------------------------------------------------

/**
 * Reference-range flag on a single analyte result.
 *
 * `unflagged` is the honest third state and it is NOT a synonym for normal:
 * the laboratory published no flag with the value AND no reference range
 * exists for that analyte, sex and age band anywhere, so nothing compared the
 * result to anything. It renders as "Not recorded". Treating it as normal
 * would have the app assert a clinical judgement nobody made.
 */
export type ResultFlag = 'normal' | 'low' | 'high' | 'abnormal' | 'critical' | 'unflagged';

/**
 * Roll-up of an order's results. Never `low`/`high` — those are per analyte.
 *
 * `pending` is an order with no released results at all; `unflagged` is an
 * order whose results were all released without anything to compare them to.
 * Both are distinct from `normal` for the same reason `unflagged` is above.
 */
export type OverallFlag = 'normal' | 'abnormal' | 'critical' | 'pending' | 'unflagged';

export type LabOrderStatus = 'ordered' | 'in_progress' | 'completed' | 'cancelled';

export type LabPriority = 'routine' | 'urgent' | 'stat';

/** One analyte on one order. */
export interface PortalLabResult {
  id: string;
  /** Human-readable analyte name ("Haemoglobin"). Leads everywhere; codes are demoted. */
  analyte: string;
  /** The value as the laboratory reported it — may be text ("Negative"). */
  value: string;
  /** Present when the value is chartable; null for free-text results. */
  numeric_value: number | null;
  unit: string | null;
  /** Free-text reference exactly as the lab entered it, when no numeric bounds exist. */
  reference: string | null;
  ref_low: number | null;
  ref_high: number | null;
  flag: ResultFlag;
  is_abnormal: boolean;
  entered_by: string | null;
  entered_at: string | null;
}

/** One order as the list endpoint returns it. */
export interface PortalLabOrder {
  id: string;
  /** Panel / test name ("Full Blood Count"). */
  name: string;
  /** LOINC or local code. Technical detail, never a heading. */
  code: string | null;
  order_type: string;
  priority: LabPriority;
  status: LabOrderStatus;
  result_summary: string | null;
  ordered_at: string | null;
  /** The visit the panel was ordered against. Null when it was raised outside one. */
  encounter_id: string | null;
  overall_flag: OverallFlag;
  result_count: number;
  results: PortalLabResult[];
}

/** The detail endpoint adds who ordered it and why. */
export interface LabOrderDetail extends PortalLabOrder {
  ordered_by_name: string | null;
  clinical_notes: string | null;
}

export interface TrendPoint {
  recorded_at: string | null;
  value: number;
  flag: ResultFlag;
}

/** One analyte plotted across time. `points` are oldest → newest. */
export interface LabTrend {
  analyte: string;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  /** Null when the patient has no result for this analyte at all — the server
   *  answers 200 with an empty series rather than a 404, which the app would
   *  read as "this server does not serve labs". */
  latest: PortalLabResult | null;
  direction: 'up' | 'down' | 'flat';
  change_percent: number | null;
  min: number;
  max: number;
  points: TrendPoint[];
}

/** Dashboard counters. Imaging counts are part of the OPES contract and stay
 * in the shape; a labs-only backend returns them as 0. */
export interface DiagnosticsSummary {
  lab_orders_total: number;
  lab_orders_pending: number;
  results_total: number;
  results_abnormal: number;
  results_critical: number;
  imaging_total: number;
  imaging_reported: number;
  latest_lab_order: PortalLabOrder | null;
  /** Analyte names you can pass to `useLabTrend()`. */
  trendable_analytes: string[];
}

/** The `pagination` block every finder list endpoint returns. */
export interface Pagination {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
}

/** Finder list envelope — `{ data, pagination }`, unlike OPES's `meta.pagination`. */
export interface LabPage<T> {
  data: T[];
  pagination: Pagination;
}

export interface LabOrderQuery {
  page?: number;
  per_page?: number;
  flag?: OverallFlag | 'all';
  /** Comma-separated statuses, e.g. `'ordered,in_progress'`. */
  status?: string;
}

/** The patient block a printed report carries. */
export interface LabReportPatient {
  name: string;
  health_id: string | null;
  sex: string | null;
  age: number | null;
  dob: string | null;
}

/** The stored PDF for an order, when the server actually holds one. */
export interface LabReportDocument {
  id: string;
  label: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string | null;
  /**
   * A SHORT-LIVED SIGNED URL (15 minutes), not a bearer-authenticated one:
   * the report screen hands it to the system browser, which carries no
   * Authorization header. It names one order for one patient and the server
   * re-checks the signature, the patient, the order and the file before
   * streaming. Treat it as a capability — never share or persist it.
   */
  download_url: string;
}

/**
 * The full report. `document` is null when no PDF exists; the report screen
 * offers Download / Share / Print ONLY in that case — the app never pretends
 * to hold a file the server does not have.
 */
export interface LabReport {
  order: LabOrderDetail;
  patient: LabReportPatient | null;
  document: LabReportDocument | null;
}

/** One orderable test from the catalogue. */
export interface LabTestCatalogueItem {
  code: string;
  name: string;
  category: string | null;
  specimen: string | null;
}

export interface LabTestRequestInput {
  test_code: string;
  priority?: LabPriority;
  /** "Why you want this test" — free text for the clinician. */
  clinical_notes?: string;
}

/** A patient can ASK for a test; a clinician must approve it before it is an order. */
export type LabTestRequestStatus = 'submitted' | 'approved' | 'declined' | 'cancelled';

export interface LabTestRequest {
  id: string;
  test_code: string;
  test_name: string;
  priority: LabPriority;
  status: LabTestRequestStatus;
  clinical_notes: string | null;
  submitted_at: string | null;
}

/** A lab visit — the finder's appointment presenter plus what a collection needs. */
export interface LabVisit extends Appointment {
  is_upcoming: boolean;
  facility_address: string | null;
  duration_minutes: number | null;
}

/**
 * Where and when to give a sample, and what the laboratory is waiting on.
 * Sample type, fasting hours and preparation instructions are deliberately
 * absent — no endpoint carries them and the app must not invent clinical
 * preparation advice.
 */
export interface SampleCollection {
  /** The lab visit being shown — null when the patient has none booked. */
  appointment: LabVisit | null;
  /** Other lab visits on file, so the patient can switch between them. */
  others: LabVisit[];
  /** Lab orders still waiting on a sample. */
  pending: PortalLabOrder[];
  patient: LabReportPatient | null;
}

// ---------------------------------------------------------------------------
// Envelopes (internal)
// ---------------------------------------------------------------------------

interface One<T> {
  data: T;
}

// ---------------------------------------------------------------------------
// Failure policy
// ---------------------------------------------------------------------------

/**
 * True when the server does not serve this resource at all — today, every
 * `/mobile/labs*` call. The UI uses it to show an "unavailable" state instead
 * of a generic error, and the retry policy uses it to stop immediately.
 */
export function isLabsUnavailable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 404 || status === 405 || status === 501;
}

/**
 * Retry only what a retry can fix: a dropped connection, a timeout, a 5xx.
 * A 4xx (including the 404 every lab route answers today) is final on the
 * first response, so the screen reaches its empty/unavailable state fast.
 */
function retryPolicy(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === undefined) return true; // network / timeout
  return status >= 500 && status !== 501;
}

// ---------------------------------------------------------------------------
// Query keys — one root so a write can invalidate everything lab-related
// ---------------------------------------------------------------------------

export const labsKeys = {
  all: ['labs'] as const,
  summary: () => ['labs', 'summary'] as const,
  list: (query: LabOrderQuery) => ['labs', 'list', query] as const,
  infinite: (status: string | undefined) => ['labs', 'infinite', status ?? 'all'] as const,
  detail: (id: string) => ['labs', 'detail', id] as const,
  report: (id: string) => ['labs', 'report', id] as const,
  trend: (analyte: string) => ['labs', 'trend', analyte] as const,
  catalogue: (search: string) => ['labs', 'catalogue', search] as const,
  collection: (appointmentId: string | undefined) =>
    ['labs', 'collection', appointmentId ?? 'auto'] as const,
};

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** GET /mobile/labs/summary — the dashboard counters and trendable analytes. */
export function useDiagnosticsSummary() {
  return useQuery({
    queryKey: labsKeys.summary(),
    queryFn: async () =>
      (await apiClient.get<One<DiagnosticsSummary>>(LABS_ENDPOINTS.summary)).data.data,
    staleTime: 60 * 1000,
    retry: retryPolicy,
  });
}

/**
 * GET /mobile/labs — one page of the patient's lab orders (results list).
 * `query.status` is comma-separated (`'ordered,in_progress'`); omit it for all.
 * The previous page stays on screen while a filter change loads.
 */
export function useLabResults(query: LabOrderQuery = {}) {
  return useQuery({
    queryKey: labsKeys.list(query),
    queryFn: async () =>
      (await apiClient.get<LabPage<PortalLabOrder>>(LABS_ENDPOINTS.list, { params: query })).data,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    retry: retryPolicy,
  });
}

/**
 * GET /mobile/labs, paged — for a full results list that can reach every
 * order, not just the first twenty. Distinct key from `useLabResults` so the
 * two never fight over one cache entry.
 */
export function useInfiniteLabResults(filters: Omit<LabOrderQuery, 'page' | 'per_page'> = {}) {
  return useInfiniteQuery({
    queryKey: labsKeys.infinite(filters.status),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await apiClient.get<LabPage<PortalLabOrder>>(LABS_ENDPOINTS.list, {
          params: { ...filters, page: pageParam, per_page: PAGE_SIZE },
        })
      ).data,
    getNextPageParam: (lastPage) => {
      const { current_page: current, last_page: last } = lastPage.pagination;
      return current < last ? current + 1 : undefined;
    },
    staleTime: 60 * 1000,
    retry: retryPolicy,
  });
}

/** GET /mobile/labs/{id} — one order with its full set of results. */
export function useLabResult(id: string | undefined) {
  return useQuery({
    queryKey: labsKeys.detail(id ?? ''),
    queryFn: async () =>
      (await apiClient.get<One<LabOrderDetail>>(LABS_ENDPOINTS.detail(id as string))).data.data,
    enabled: !!id,
    staleTime: 60 * 1000,
    retry: retryPolicy,
  });
}

/**
 * The names this app used before the trim (`queries.ts` exposed `useLabOrders`
 * / `useLabOrderDetail`). Kept as thin aliases so a screen can say "orders"
 * where the OPES contract says "results" — same query, same cache entry.
 */
export function useLabOrders(query: LabOrderQuery = {}) {
  return useLabResults(query);
}

export function useLabOrder(id: string | undefined) {
  return useLabResult(id);
}

/** GET /mobile/labs/{id}/report — the order, the patient block and the stored PDF (if any). */
export function useLabReport(id: string | undefined) {
  return useQuery({
    queryKey: labsKeys.report(id ?? ''),
    queryFn: async () =>
      (await apiClient.get<One<LabReport>>(LABS_ENDPOINTS.report(id as string))).data.data,
    enabled: !!id,
    staleTime: 60 * 1000,
    retry: retryPolicy,
  });
}

/**
 * GET /mobile/labs/trends/{analyte} — one analyte's series across every order.
 * Pass an analyte name or code from `DiagnosticsSummary.trendable_analytes`.
 * A series changes only when a new result is published, so it is held longer.
 */
export function useLabTrend(analyte: string | undefined) {
  return useQuery({
    queryKey: labsKeys.trend(analyte ?? ''),
    queryFn: async () =>
      (await apiClient.get<One<LabTrend>>(LABS_ENDPOINTS.trend(analyte as string))).data.data,
    enabled: !!analyte,
    staleTime: 5 * 60 * 1000,
    retry: retryPolicy,
  });
}

/** Below this many characters the catalogue's default page is shown, not a search. */
export const CATALOGUE_MIN_QUERY = 2;

/**
 * GET /mobile/labs/catalogue?q= — the orderable tests. The search is the
 * server's, not a local filter over a truncated list: at ≥2 characters the
 * term is sent, below that the default page is used. Debounce the input in
 * the screen; the previous list stays visible while the next one loads.
 */
export function useLabTestCatalogue(search = '') {
  const term = search.trim();
  const q = term.length >= CATALOGUE_MIN_QUERY ? term : '';
  return useQuery({
    queryKey: labsKeys.catalogue(q),
    queryFn: async () =>
      (
        await apiClient.get<One<LabTestCatalogueItem[]>>(LABS_ENDPOINTS.catalogue, {
          params: q ? { q } : undefined,
        })
      ).data.data,
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: retryPolicy,
  });
}

/**
 * POST /mobile/labs/requests — ask the care team for a test. This files a
 * REQUEST a clinician must approve; a patient cannot place a laboratory order,
 * and the screen says so. Never retried: a write whose outcome is unknown
 * must not be silently repeated. On success every lab query is invalidated
 * so the dashboard's pending counter catches up.
 */
export function useRequestLabTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LabTestRequestInput) =>
      (await apiClient.post<One<LabTestRequest>>(LABS_ENDPOINTS.requests, input)).data.data,
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: labsKeys.all });
    },
  });
}

/**
 * GET /mobile/labs/collection[?appointment_id=] — the lab visit to show
 * (the named one, else the soonest upcoming, else the most recent), the other
 * lab visits on file, the orders still waiting on a sample, and the patient
 * block. Rescheduling and cancelling hand off to the appointments screens,
 * which own those writes.
 */
export function useSampleCollection(appointmentId?: string) {
  return useQuery({
    queryKey: labsKeys.collection(appointmentId),
    queryFn: async () =>
      (
        await apiClient.get<One<SampleCollection>>(LABS_ENDPOINTS.collection, {
          params: appointmentId ? { appointment_id: appointmentId } : undefined,
        })
      ).data.data,
    staleTime: 60 * 1000,
    retry: retryPolicy,
  });
}
