/**
 * Lab desk data layer — the LAB TECHNICIAN'S half of `/mobile/lab`, modelled on
 * `lib/api/doctorQueries.ts`: typed wire shapes, `apiClient`, react-query
 * hooks, and the failure predicates the two lab screens need.
 *
 * Coded against the "Lab desk" contract in the role-dashboards plan
 * (2026-09-06). Every shape below is the contract's, field for field; where
 * the server later disagrees, the SERVER wins and this file is corrected.
 *
 * ── WHAT THE SURFACE IS ────────────────────────────────────────────────────
 * One job: work THIS facility's lab orders — see what awaits collection and
 * results, mark a sample collected, enter results parameter by parameter,
 * release them (which notifies the patient and the ordering clinician), and
 * answer patient test requests. The token's facility scopes every list on the
 * server; nothing here names a facility or a patient population.
 *
 * ── ROLE ───────────────────────────────────────────────────────────────────
 * Every route sits behind `capability:lab_results`; `/collect` additionally
 * admits `sample_collection`. The server answers a role it refuses with
 * `403 { error_code: "role_forbidden" }` — see `isRoleForbidden`
 * (`lib/api/roleErrors.ts`), re-exported here so a lab screen needs one import.
 *
 * ── FAILURE CODES ──────────────────────────────────────────────────────────
 *   401  provider token missing or expired — sign in again.
 *   403  `role_forbidden` — the ACCOUNT'S ROLE lacks the desk. Final.
 *   404  the order / request is not this facility's, OR the route is not
 *        served yet. `isNotServed` splits the two on the body.
 *   405  the path exists for another verb only — treated as "not served".
 *   409  `already_released` — a second release of the same order. Final; the
 *        order is re-read so the screen shows the server's state.
 *   422  the write was refused on its merits (empty results, bad flag).
 *
 * Hooks never fabricate a row: a failed endpoint is an error state, never an
 * empty list. Final answers (401/403/404/405/409) are never retried.
 */
import { isAxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';

export { isRoleForbidden, roleForbiddenRequired } from './roleErrors';

const paths = endpoints.labDesk;

// ═══════════════════════════════════════════════════════════════════════════
// Wire shapes — the contract, verbatim
// ═══════════════════════════════════════════════════════════════════════════

/** The `{ data }` envelope every desk endpoint answers with. */
export interface LabEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** The four working states of a lab order on this desk. */
export type LabOrderStatus = 'ordered' | 'collected' | 'in_progress' | 'resulted';

/** Read side is open: a cancelled or voided order can still be returned by `GET /orders/{id}`. */
export type LabOrderStatusLike = LabOrderStatus | (string & {});

/** The order's urgency as the ordering clinician set it. */
export type LabUrgency = 'routine' | 'urgent' | 'stat' | (string & {});

/** The laboratory's own flag on one analyte. */
export type LabFlag = 'H' | 'L' | 'N' | 'C';

export const LAB_FLAGS: readonly LabFlag[] = ['H', 'L', 'N', 'C'];

export const LAB_ORDER_STATUSES: readonly LabOrderStatus[] = [
  'ordered',
  'collected',
  'in_progress',
  'resulted',
];

/** The patient block on every order row: identity, never clinical history. */
export interface LabOrderPatient {
  id: string;
  health_id: string;
  /** Short display name as the server renders it. */
  display_name: string | null;
  /** `YYYY-MM-DD`, or null when the record has none. */
  dob: string | null;
  sex: string | null;
}

/** `GET /mobile/lab/orders` — one row. */
export interface LabOrderSummary {
  id: string;
  test_name: string;
  test_code: string | null;
  urgency: LabUrgency;
  status: LabOrderStatusLike;
  ordered_at: string | null;
  collected_at: string | null;
  resulted_at: string | null;
  clinical_indication: string | null;
  ordered_by_name: string | null;
  results_count: number;
  patient: LabOrderPatient;
}

/** One analyte row the laboratory has entered. */
export interface LabResultRow {
  id: string;
  parameter_name: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  flag: LabFlag | (string & {}) | null;
  notes: string | null;
  resulted_at: string | null;
}

/** A reference interval the laboratory keeps for this test, offered as a suggestion. */
export interface LabReferenceRange {
  parameter_name: string;
  low: string | number | null;
  high: string | number | null;
  unit: string | null;
}

/** `GET /mobile/lab/orders/{id}` — the order with its results and reference ranges. */
export interface LabOrderDetail extends LabOrderSummary {
  results: LabResultRow[];
  reference_ranges: LabReferenceRange[];
}

/** `GET /mobile/lab/home` → `data`. */
export interface LabHome {
  facility: { id: string; name: string | null } | null;
  counts: LabHomeCounts;
}

export interface LabHomeCounts {
  awaiting_collection: number;
  awaiting_results: number;
  in_progress: number;
  resulted_today: number;
  urgent: number;
  requests_pending: number;
}

/** One row of `POST /orders/{id}/results`. */
export interface LabResultInput {
  parameter_name: string;
  value: string;
  unit?: string;
  reference_range?: string;
  flag?: LabFlag;
  loinc_code?: string;
  notes?: string;
}

/** A patient's test request submitted to this facility (`GET /mobile/lab/requests`). */
export interface LabTestRequest {
  id: string;
  test_name: string;
  test_code: string | null;
  priority: LabUrgency | null;
  status: string;
  submitted_at: string | null;
  clinical_notes: string | null;
  patient: Pick<LabOrderPatient, 'id' | 'health_id' | 'display_name'>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Failure classification
// ═══════════════════════════════════════════════════════════════════════════

/**
 * "This server does not serve the lab desk yet" — as opposed to any other
 * failure.
 *
 * Laravel's unknown-API-route handler answers `{"error_code":"ENDPOINT_NOT_FOUND"}`
 * (or a bodyless 404 from a proxy); a 405 means the path exists for another
 * verb only, which for a freshly registered route group is the same news. A
 * 404 that CARRIES a server-authored `message` is the app saying "that order
 * is not here" and is deliberately NOT in this set.
 */
export function isNotServed(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === 405 || status === 501) return true;
  if (status !== 404) return false;
  const body = error.response?.data as { error_code?: string; message?: string } | undefined;
  return body?.error_code === 'ENDPOINT_NOT_FOUND' || !body?.message;
}

/** The wire spelling of the release conflict. */
export const ALREADY_RELEASED_CODE = 'already_released';

/**
 * True when a release was refused because the order is ALREADY released.
 *
 * A 409 on `/release` means exactly one thing on this desk, so the status is
 * enough; the code is honoured when present so a future, differently-named
 * conflict is not mistaken for this one.
 */
export function isAlreadyReleased(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  if (error.response?.status !== 409) return false;
  const body = error.response?.data as { error_code?: string } | undefined;
  return !body?.error_code || body.error_code === ALREADY_RELEASED_CODE;
}

/** A 404 the app itself answered — "no such order at this facility". */
export function isLabRecordNotFound(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  if (error.response?.status !== 404) return false;
  return !isNotServed(error);
}

/** True when the answer is FINAL — retrying it cannot change it. */
export function isLabRequestFinal(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  return (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 405 ||
    status === 409 ||
    status === 422 ||
    status === 501
  );
}

/** React-query `retry` for every desk hook: one retry, none once the answer is final. */
export const labRetry = (failureCount: number, error: unknown): boolean =>
  !isLabRequestFinal(error) && failureCount < 1;

/** The server's own sentence from an error body, or null. Never a stack trace. */
export function labServerMessage(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const body = error.response?.data as { message?: string } | undefined;
  return typeof body?.message === 'string' && body.message !== '' ? body.message : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Transport
// ═══════════════════════════════════════════════════════════════════════════

async function getData<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await apiClient.get<LabEnvelope<T>>(path, { params });
  return res.data.data;
}

async function postData<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiClient.post<LabEnvelope<T>>(path, body ?? {});
  return res.data.data;
}

// ═══════════════════════════════════════════════════════════════════════════
// Keys
// ═══════════════════════════════════════════════════════════════════════════

export interface LabOrdersQuery {
  status: LabOrderStatus;
  /** When true the server is asked for `urgency=urgent` only. */
  urgent?: boolean;
}

export const labKeys = {
  all: ['lab'] as const,
  home: ['lab', 'home'] as const,
  ordersAll: ['lab', 'orders'] as const,
  orders: (query: LabOrdersQuery) =>
    ['lab', 'orders', query.status, query.urgent ? 'urgent' : 'all'] as const,
  order: (id: string) => ['lab', 'order', id] as const,
  requests: ['lab', 'requests'] as const,
};

type QueryOpts = { enabled?: boolean };

// ═══════════════════════════════════════════════════════════════════════════
// Reads
// ═══════════════════════════════════════════════════════════════════════════

/** `GET /mobile/lab/home` — the six tiles, counted server-side. */
export function useLabHome(opts: QueryOpts = {}) {
  return useQuery({
    queryKey: labKeys.home,
    queryFn: () => getData<LabHome>(paths.home),
    retry: labRetry,
    staleTime: 30 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/**
 * `GET /mobile/lab/orders?status=&urgency=` — this facility's queue for one
 * status. `urgent` maps onto the contract's single-valued `urgency=urgent`.
 */
export function useLabOrders(status: LabOrderStatus, urgent = false, opts: QueryOpts = {}) {
  return useQuery({
    queryKey: labKeys.orders({ status, urgent }),
    queryFn: () =>
      getData<LabOrderSummary[]>(paths.orders, {
        status,
        ...(urgent ? { urgency: 'urgent' } : {}),
      }),
    retry: labRetry,
    staleTime: 20 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/** `GET /mobile/lab/orders/{id}`. */
export function useLabOrder(id: string | undefined) {
  return useQuery({
    queryKey: labKeys.order(id ?? ''),
    queryFn: () => getData<LabOrderDetail>(paths.order(id as string)),
    retry: labRetry,
    enabled: !!id,
  });
}

/** `GET /mobile/lab/requests` — patient test requests submitted to this facility. */
export function useLabRequests(opts: QueryOpts = {}) {
  return useQuery({
    queryKey: labKeys.requests,
    queryFn: () => getData<LabTestRequest[]>(paths.requests),
    retry: labRetry,
    staleTime: 20 * 1000,
    enabled: opts.enabled ?? true,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Writes
// ═══════════════════════════════════════════════════════════════════════════

/** After any order write: the order, every queue and the tiles are re-read. */
function useInvalidateOrder() {
  const qc = useQueryClient();
  return async (id: string) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: labKeys.order(id) }),
      qc.invalidateQueries({ queryKey: labKeys.ordersAll }),
      qc.invalidateQueries({ queryKey: labKeys.home }),
    ]);
  };
}

/** `POST /mobile/lab/orders/{id}/collect` → the order, now `collected`. */
export function useCollectSample() {
  const invalidate = useInvalidateOrder();
  return useMutation({
    mutationFn: (id: string) => postData<LabOrderDetail>(paths.collectOrder(id)),
    onSuccess: (_data, id) => invalidate(id),
  });
}

/** `POST /mobile/lab/orders/{id}/results { results }` → the order, now `in_progress`. */
export function useAddLabResults() {
  const invalidate = useInvalidateOrder();
  return useMutation({
    mutationFn: ({ id, results }: { id: string; results: LabResultInput[] }) =>
      postData<LabOrderDetail>(paths.orderResults(id), { results }),
    onSuccess: (_data, { id }) => invalidate(id),
  });
}

/**
 * `POST /mobile/lab/orders/{id}/release` → the order, now `resulted`.
 *
 * Releasing notifies the patient (bell + push) and the ordering clinician
 * (bell) and cannot be undone — the screen confirms before calling this. A
 * 409 (`isAlreadyReleased`) is also followed by an invalidation, so the screen
 * ends on the server's state rather than the button it pressed.
 */
export function useReleaseResults() {
  const invalidate = useInvalidateOrder();
  return useMutation({
    mutationFn: (id: string) => postData<LabOrderDetail>(paths.releaseOrder(id)),
    onSuccess: (_data, id) => invalidate(id),
    onError: (error, id) => {
      if (isAlreadyReleased(error)) void invalidate(id);
    },
  });
}

/** After a request decision: the requests, the queues (a new order) and the tiles. */
function useInvalidateRequests() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: labKeys.requests }),
      qc.invalidateQueries({ queryKey: labKeys.ordersAll }),
      qc.invalidateQueries({ queryKey: labKeys.home }),
    ]);
  };
}

/** `POST /mobile/lab/requests/{id}/approve` — creates the LabOrder. */
export function useApproveLabRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: (id: string) => postData<LabTestRequest | LabOrderSummary>(paths.approveRequest(id)),
    onSuccess: invalidate,
  });
}

/** `POST /mobile/lab/requests/{id}/decline { reason }`. */
export function useDeclineLabRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      postData<LabTestRequest>(paths.declineRequest(id), { reason }),
    onSuccess: invalidate,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Small pure helpers the screens share
// ═══════════════════════════════════════════════════════════════════════════

/** Where a status sits on the ordered → collected → in progress → resulted line; -1 when off it. */
export function labStatusIndex(status: LabOrderStatusLike): number {
  return LAB_ORDER_STATUSES.indexOf(status as LabOrderStatus);
}

/** A request the desk may still decide on. Anything already decided is read-only. */
export function isLabRequestOpen(status: string): boolean {
  const s = status.toLowerCase();
  return !['approved', 'declined', 'cancelled', 'canceled', 'rejected', 'converted'].includes(s);
}

/** `low`–`high` `unit` as one printable interval, or null when the range has neither bound. */
export function formatReferenceRange(range: LabReferenceRange): string | null {
  const low = range.low === null || range.low === undefined || range.low === '' ? null : String(range.low);
  const high = range.high === null || range.high === undefined || range.high === '' ? null : String(range.high);
  if (low === null && high === null) return null;
  const core = low !== null && high !== null ? `${low}–${high}` : low !== null ? `≥ ${low}` : `≤ ${high}`;
  return range.unit ? `${core} ${range.unit}` : core;
}

/** Health IDs are compared upper-cased and trimmed — the way they are printed on the card. */
export function normaliseLabHealthId(input: string | null | undefined): string {
  return (input ?? '').trim().toUpperCase();
}
