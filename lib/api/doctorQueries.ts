/**
 * Doctor-side data layer — the CLINICIAN half of the app, modelled on
 * `lib/api/vitalsQueries.ts`: typed wire shapes, `apiClient`, react-query hooks,
 * endpoint constants spelled out here (not in `endpoints.ts`, owned elsewhere).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE BACKEND NOW EXISTS — READ THIS BEFORE WIRING A SCREEN TO IT
 * ─────────────────────────────────────────────────────────────────────────
 * The clinician surface is DEPLOYED. `finder.opescare.cloud/api/mobile/doctor/*`
 * is served behind `auth.provider` (`AuthenticateMobileProvider`), which stamps
 * `provider_user_id` and `provider_facility_id` onto the request attributes
 * from the bearer token — never from a header, body, query string or session.
 * Verified against the finder source on 2026-09-05:
 *
 *   routes/mobile_doctor_chart.php      → MobileDoctorChartController      (chart, 8 routes)
 *   routes/mobile_doctor_schedule.php   → MobileDoctorScheduleController   (me/home/diary)
 *   routes/mobile_doctor_results.php    → MobileResultsInboxController     (inbox, order results)
 *   routes/mobile_doctor_messaging.php  → MobileDoctorMessagingController  (threads)
 *                                       + MobileDoctorProfileController    (own profile)
 *   routes/api.php:91                   → MobilePrescribingController::lookupPatient
 *
 * This file therefore stopped being a speculative contract and became a
 * description of a live wire format. Every shape below is checked against the
 * controller that serialises it; where the two disagreed, the SERVER won.
 *
 * ── WHAT THE FAILURE CODES MEAN NOW ───────────────────────────────────────
 * They no longer all mean "the route is missing". On the deployed surface:
 *
 *   401  the provider token is missing, expired, or is not a provider token.
 *        Sign in again. (AuthenticateMobileProvider is the only source.)
 *   403  ONLY from the chart: this clinician has no care relationship with
 *        THIS patient. A real, meaningful refusal — see `doctorAccessRefusal`.
 *   404  a record was not found (patient / appointment / thread / result), OR
 *        the route genuinely is not served. The two are NOT distinguishable
 *        from the status alone — see the note on `isDoctorApiUnavailable`.
 *   409  a state conflict (already cancelled, already no-show, closed row).
 *   422  the write was refused on its merits (bad transition, bad datetime).
 *   503  the chart could not write its access_logs row. No trail, no
 *        disclosure — this is the server refusing to leak without an audit.
 *
 * Failure handling the hooks still guarantee:
 *   • `retry: false` on 401 / 403 / 404 / 501 — a final answer is never
 *     hammered, and a refusal is never retried into a second denial audit row;
 *   • no hook ever fabricates a row — a failed endpoint is an error state,
 *     never an empty list.
 *
 * Two rules this module enforces on every screen that uses it:
 *   1. Patients are found by EXACT Health ID only. There is no name search, no
 *      `LIKE`, no listing. `lookupPatientByHealthId` refuses to send anything
 *      that is not a plausible Health ID.
 *   2. Reading is the whole job. The chart section is GET-only; the only
 *      writes are appointment decisions, result acknowledgement, messaging and
 *      the doctor's own profile. Prescribing/ordering stay off the phone.
 */
import { isAxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { isRoleForbidden } from './roleErrors';

// The ROLE refusal predicate lives in its own module so the care layer can use
// it without importing this one; re-exported so a doctor screen needs one import.
export { isRoleForbidden, roleForbiddenRequired } from './roleErrors';

// ═══════════════════════════════════════════════════════════════════════════
// Endpoints — every path in one place, all under the (unserved) doctor prefix
// ═══════════════════════════════════════════════════════════════════════════

/** Root of the provider-side mobile surface. Served, behind `auth.provider`. */
export const DOCTOR_API_PREFIX = '/mobile/doctor';

export const doctorEndpoints = {
  /** GET — the clinician's account row (a future provider token's `/me`). */
  me: `${DOCTOR_API_PREFIX}/me`,
  /** GET — landing counts + next appointments + urgent results. */
  home: `${DOCTOR_API_PREFIX}/home`,

  /** GET — the diary for a date window. */
  appointments: `${DOCTOR_API_PREFIX}/appointments`,
  /** GET / PUT (reschedule). */
  appointment: (id: string) => `${DOCTOR_API_PREFIX}/appointments/${id}`,
  /** PATCH `{ status }`. */
  appointmentStatus: (id: string) => `${DOCTOR_API_PREFIX}/appointments/${id}/status`,
  /** POST — `scheduled|confirmed` → `arrived`. */
  appointmentCheckIn: (id: string) => `${DOCTOR_API_PREFIX}/appointments/${id}/check-in`,
  /** POST. */
  appointmentNoShow: (id: string) => `${DOCTOR_API_PREFIX}/appointments/${id}/no-show`,
  /** POST `{ cancel_reason? }`. */
  appointmentCancel: (id: string) => `${DOCTOR_API_PREFIX}/appointments/${id}/cancel`,

  /** GET — bookings awaiting the clinician's decision. */
  appointmentRequests: `${DOCTOR_API_PREFIX}/appointment-requests`,
  /** POST. */
  acceptAppointmentRequest: (id: string) => `${DOCTOR_API_PREFIX}/appointment-requests/${id}/accept`,
  /** POST `{ reason? }`. */
  declineAppointmentRequest: (id: string) => `${DOCTOR_API_PREFIX}/appointment-requests/${id}/decline`,

  /**
   * GET `?health_id=` — EXACT match on the Health ID, one row or 404. Deliberately
   * not `/patients?q=`: this app never enumerates or fuzzy-searches patients.
   */
  patientLookup: `${DOCTOR_API_PREFIX}/patients/lookup`,
  /** GET — chart header. `patientId` is the Health ID. */
  patient: (patientId: string) => `${DOCTOR_API_PREFIX}/patients/${patientId}`,
  patientAllergies: (patientId: string) => `${DOCTOR_API_PREFIX}/patients/${patientId}/allergies`,
  patientProblems: (patientId: string) => `${DOCTOR_API_PREFIX}/patients/${patientId}/problems`,
  patientEncounters: (patientId: string) => `${DOCTOR_API_PREFIX}/patients/${patientId}/encounters`,
  patientVitals: (patientId: string) => `${DOCTOR_API_PREFIX}/patients/${patientId}/vitals`,
  patientPrescriptions: (patientId: string) => `${DOCTOR_API_PREFIX}/patients/${patientId}/prescriptions`,
  patientDiagnoses: (patientId: string) => `${DOCTOR_API_PREFIX}/patients/${patientId}/diagnoses`,
  patientOrders: (patientId: string) => `${DOCTOR_API_PREFIX}/patients/${patientId}/orders`,
  /**
   * GET — analyte rows for one lab order. Served
   * (`MobileResultsInboxController::orderResults`); takes either the bare
   * `lab_orders.id` a chart row carries or the inbox's `lab-<uuid>` form, and
   * 404s unless the order was placed BY this clinician AT their facility.
   */
  orderResults: (orderId: string) => `${DOCTOR_API_PREFIX}/orders/${orderId}/results`,

  /** GET `?filter=`. */
  resultsInbox: `${DOCTOR_API_PREFIX}/results-inbox`,
  /**
   * GET — the RESULTS half of the clinician's badge:
   * `{ unacknowledged_results, critical_unacknowledged, critical_total }`.
   *
   * This, not `unreadCounts`, is where the result figures live. The server also
   * registers the same handler at `messages/unread-count`, but
   * `routes/mobile_doctor_messaging.php` is loaded FIRST
   * (AppServiceProvider::boot, line 133 before 138) and Laravel keeps the first
   * matching route — so `messages/unread-count` is the MESSAGING payload and
   * this path is the only way to reach the result counts.
   */
  resultCounts: `${DOCTOR_API_PREFIX}/results-inbox/counts`,
  /** `{id}` is the inbox's composite id: `lab-<uuid>` | `rad-<uuid>`. */
  result: (id: string) => `${DOCTOR_API_PREFIX}/results-inbox/${id}`,
  /** POST — idempotent. */
  acknowledgeResult: (id: string) => `${DOCTOR_API_PREFIX}/results-inbox/${id}/acknowledge`,

  /** GET. */
  messageThreads: `${DOCTOR_API_PREFIX}/messages/threads`,
  messageThread: (id: string) => `${DOCTOR_API_PREFIX}/messages/threads/${id}`,
  /** POST `{ body }`. */
  sendMessage: (id: string) => `${DOCTOR_API_PREFIX}/messages/threads/${id}/messages`,
  /** PATCH `{ state }`. */
  threadState: (id: string) => `${DOCTOR_API_PREFIX}/messages/threads/${id}/state`,
  /**
   * GET — the MESSAGING badge only: `{ unread_threads, unread_messages }`.
   * Result figures are NOT here; they are at `resultCounts` above.
   */
  unreadCounts: `${DOCTOR_API_PREFIX}/messages/unread-count`,

  /**
   * POST `{ scheduled_at, reason? }` — books a `follow_up` appointment for
   * this patient with the signed-in clinician as provider, at the token's
   * facility (`capability:clinical_chart`, `routes/mobile_doctor_schedule.php`).
   * `patientId` is the Health ID or the record uuid, like every chart route.
   * 403 `role_forbidden` for a non-clinician; 422 for a time in the past.
   */
  patientFollowUp: (patientId: string) => `${DOCTOR_API_PREFIX}/patients/${patientId}/follow-up`,

  /** GET / PUT. */
  profile: `${DOCTOR_API_PREFIX}/profile`,
  /** POST multipart `photo`. */
  profilePhoto: `${DOCTOR_API_PREFIX}/profile/photo`,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Envelope, pagination and failure classification
// ═══════════════════════════════════════════════════════════════════════════

/** The `{ data, meta }` envelope the contract standardises on. */
export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface Pagination {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
  from: number | null;
  to: number | null;
}

export interface DoctorPage<T> {
  data: T[];
  meta: { pagination: Pagination };
}

export interface PageQuery {
  page?: number;
  per_page?: number;
}

/**
 * True when the failure plausibly means "this server does not serve this
 * endpoint" — a missing route (404) or an explicit not-implemented (501).
 *
 * ── 403 IS NO LONGER IN THIS SET, AND MUST NOT GO BACK IN ─────────────────
 * It used to be. That was correct while `/mobile/doctor/*` was unserved and a
 * provider route could only ever refuse a patient token. It is WRONG now.
 * `MobileDoctorChartController` answers 403 to mean something specific and
 * true: this clinician has NO CARE RELATIONSHIP with THIS patient — not on
 * their schedule, no clinical act of their own, no episode at their facility,
 * no consent grant. The body says so verbatim:
 *
 *     { message, error_code: "NO_CLINICAL_RELATIONSHIP",
 *       required_action: "request_consent" }
 *
 * Rendering that as "not available on this server yet" hides a REFUSAL behind
 * a CAPABILITY CLAIM. The clinician is told the feature does not exist when
 * the truth is that they may not open this particular record — so they stop
 * looking instead of requesting consent, and the one action that would get
 * them the chart is never offered. Use `doctorAccessRefusal` for that state.
 *
 * ── 401 STAYS, BUT MEANS "SIGN IN AGAIN" ──────────────────────────────────
 * `AuthenticateMobileProvider` is the only source of a 401 on this surface and
 * emits it for a missing / malformed / non-provider token. A screen that can
 * do better than "unavailable" should say "your session has expired".
 *
 * ── 404 STAYS, BUT IS AMBIGUOUS — KNOWN GAP ───────────────────────────────
 * On the deployed surface a 404 is usually a RECORD that was not found, not a
 * route that is missing: `doctor_chart.patient_not_found`,
 * `doctor_results.order_not_found`, `doctor_messaging.thread_not_found`
 * (that last one even carries `error_code: "NOT_FOUND"`), and the schedule's
 * `appointment_not_found` — which is deliberately a 404 rather than a 403 so
 * it cannot confirm that an appointment exists. None of those is "this server
 * does not serve the feature". They stay in THIS predicate, which is the broad
 * "the call did not land" question the react-query layer asks; the split is
 * done one level up by `isDoctorRecordNotFound` and `isDoctorFeatureUnserved`,
 * which is what a screen choosing an `EmptyState` should call.
 */
export function isDoctorApiUnavailable(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 404 || status === 501 || status === 401;
}

/**
 * True when a 404 is the APP answering "that record is not here" — as opposed
 * to nothing on the host answering at all.
 *
 * This is the split the note above calls a known gap. It is decidable, just not
 * from the status: every 404 the clinician controllers raise carries a JSON
 * body the server wrote in the reader's language —
 * `{"message": "…"}` from the chart and the results inbox,
 * `{"error_code": "NOT_FOUND", "message": "…"}` from messaging,
 * `refuse('appointment_not_found', 404)` from the schedule. A 404 produced by
 * something that never reached the app — a proxy, a stripped route, an HTML
 * error page — carries no such body, and that absence is the signal.
 *
 * `error_code: 'ENDPOINT_NOT_FOUND'` is honoured as an explicit override for a
 * server that wants to say "this route is gone" in words.
 */
export function isDoctorRecordNotFound(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  if (error.response?.status !== 404) return false;

  const body = error.response?.data as { error_code?: string; message?: string } | undefined;
  if (body?.error_code === 'ENDPOINT_NOT_FOUND') return false;

  return typeof body?.message === 'string' && body.message.length > 0;
}

/**
 * The ONE predicate a clinician screen uses to decide whether to render the
 * blue "not available on this server yet" `EmptyState`.
 *
 * Twelve screens each kept a private `isNotServed`, and they did not agree:
 * eight folded EVERY 404 into "unavailable", while results and messaging (four
 * screens) already discriminated on the response body. So the same server
 * answer read as a missing feature on one screen and as a named failure on the
 * next. This is that helper, once.
 *
 * It is `isDoctorApiUnavailable` minus the two statuses that mean something
 * better, and the screens can all say the better thing because they all fall
 * through to `describeFailure`:
 *
 *   401 → `describeFailure` already renders "your session has expired, sign in
 *         again", which is what the note on `isDoctorApiUnavailable` asks a
 *         screen to do when it can. Calling an expired session a missing
 *         feature is the same category error as calling a 403 one.
 *   404 with a server-authored body → the app answered; show what it said.
 *         Only a bodyless 404 is evidence that nothing served the route.
 *
 * 403 is not in `isDoctorApiUnavailable` and must not arrive here either — it
 * is a real refusal with a `required_action`; see `doctorAccessRefusal`.
 */
export function isDoctorFeatureUnserved(error: unknown): boolean {
  if (!isDoctorApiUnavailable(error)) return false;
  if (isAxiosError(error) && error.response?.status === 401) return false;

  return !isDoctorRecordNotFound(error);
}

/**
 * True when the answer is FINAL — retrying it cannot change it.
 *
 * Kept separate from `isDoctorApiUnavailable` so that narrowing the "feature
 * missing" message did not quietly turn 403 into a retryable failure. A
 * retried 403 buys nothing and costs a second `access_logs` denial row on the
 * server, so a refusal is asked exactly once.
 */
export function isDoctorRequestFinal(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403 || status === 404 || status === 501;
}

/** React-query `retry` for every doctor hook: one retry, none once the answer is final. */
export const doctorRetry = (failureCount: number, error: unknown): boolean =>
  !isDoctorRequestFinal(error) && failureCount < 1;

/**
 * The chart's refusal body. `error_code` and `required_action` are open unions
 * because the server may add reasons; the two spellings below are the ones
 * `MobileDoctorChartController` emits today.
 */
export interface DoctorAccessRefusal {
  /** Already localised by the server (`doctor_chart.no_clinical_relationship`, EN/FR). */
  message: string | null;
  /**
   * `NO_CLINICAL_RELATIONSHIP` — no basis to open this record at all.
   * `CONSENT_REQUIRED`         — a basis exists, but the patient keeps
   *   their full record behind their own consent, so the clinician sees
   *   identity, allergies and current medicines and must ask for the
   *   rest. Both answer to the same `required_action`.
   */
  error_code: 'NO_CLINICAL_RELATIONSHIP' | 'CONSENT_REQUIRED' | (string & {});
  /** What would actually get this clinician the chart. */
  required_action: 'request_consent' | (string & {});
}

/**
 * The refusal behind a 403, or null when the failure is anything else.
 *
 * A screen should use this to render "you do not have access to THIS record"
 * plus the `required_action` — never "not available on this server yet".
 *
 * Only the chart refuses this way; the status is required as well as the body
 * so a 403 from anywhere else (a proxy, a WAF interstitial) cannot be dressed
 * up as a clinical refusal.
 *
 * ── A ROLE REFUSAL IS NOT A RECORD REFUSAL ────────────────────────────────
 * `403 { error_code: "role_forbidden" }` (the `capability:` middleware) says
 * the ACCOUNT'S ROLE lacks the chart altogether. No consent request answers
 * that, so it must never come back here with the default
 * `required_action: request_consent` and steer a receptionist into an ask the
 * server would also refuse. It returns null; screens read it with
 * `isRoleForbidden` and say "not part of your role".
 */
export function doctorAccessRefusal(error: unknown): DoctorAccessRefusal | null {
  if (!isAxiosError(error)) return null;
  if (error.response?.status !== 403) return null;
  if (isRoleForbidden(error)) return null;

  const body = error.response?.data as Partial<DoctorAccessRefusal> | undefined;

  return {
    message: typeof body?.message === 'string' ? body.message : null,
    // A 403 with no code is still a refusal, and must still read as one.
    error_code: typeof body?.error_code === 'string' ? body.error_code : 'NO_CLINICAL_RELATIONSHIP',
    required_action:
      typeof body?.required_action === 'string' ? body.required_action : 'request_consent',
  };
}

/** True when the server refused THIS record (403), as opposed to not serving the feature. */
export function isDoctorAccessRefused(error: unknown): boolean {
  return doctorAccessRefusal(error) !== null;
}

/** Message from an API error body, else a neutral fallback. Never leaks a stack. */
export function doctorErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isAxiosError(error)) {
    const body = error.response?.data as { message?: string } | undefined;
    if (body?.message) return body.message;
  }
  return fallback;
}

async function getData<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await apiClient.get<Envelope<T>>(path, { params });
  return res.data.data;
}

async function getPage<T>(path: string, params?: Record<string, unknown>): Promise<DoctorPage<T>> {
  const res = await apiClient.get<DoctorPage<T>>(path, { params });
  return res.data;
}

async function postData<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiClient.post<Envelope<T>>(path, body ?? {});
  return res.data.data;
}

async function patchData<T>(path: string, body: unknown): Promise<T> {
  const res = await apiClient.patch<Envelope<T>>(path, body);
  return res.data.data;
}

async function putData<T>(path: string, body: unknown): Promise<T> {
  const res = await apiClient.put<Envelope<T>>(path, body);
  return res.data.data;
}

/** Query-key vocabulary, so mutations can invalidate precisely. */
export const doctorKeys = {
  all: ['doctor'] as const,
  me: ['doctor', 'me'] as const,
  home: ['doctor', 'home'] as const,
  schedule: (query: ScheduleQuery) => ['doctor', 'schedule', query] as const,
  appointments: ['doctor', 'appointments'] as const,
  appointment: (id: string) => ['doctor', 'appointments', id] as const,
  requests: (query: RequestsQuery) => ['doctor', 'appointment-requests', query] as const,
  patientLookup: (healthId: string) => ['doctor', 'patient-lookup', healthId] as const,
  patient: (id: string) => ['doctor', 'patients', id] as const,
  chartSection: (id: string, section: string, extra?: unknown) =>
    ['doctor', 'patients', id, section, extra ?? null] as const,
  chartSummary: (id: string, scan: number) => ['doctor', 'patients', id, 'summary', scan] as const,
  orderResults: (orderId: string) => ['doctor', 'orders', orderId, 'results'] as const,
  inbox: (filter: InboxFilter) => ['doctor', 'results-inbox', filter] as const,
  inboxAll: ['doctor', 'results-inbox'] as const,
  result: (id: string) => ['doctor', 'results-inbox', 'detail', id] as const,
  threads: (query: DoctorThreadQuery) => ['doctor', 'messages', 'threads', query] as const,
  threadsAll: ['doctor', 'messages'] as const,
  thread: (id: string) => ['doctor', 'messages', 'thread', id] as const,
  unread: ['doctor', 'messages', 'unread'] as const,
  profile: ['doctor', 'profile'] as const,
};

type QueryOpts = { enabled?: boolean };

// ═══════════════════════════════════════════════════════════════════════════
// Numbers on the wire
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Laravel `decimal:` casts serialise as STRINGS (`"temperature": "38.7"`).
 * Typing them as `number` compiles and then silently yields `NaN` in every
 * reference-range comparison. Use `toNumber()` at the point of use.
 */
export type Decimalish = string | number | null;

/** Wire value → finite number, or null. Never NaN. */
export function toNumber(value: Decimalish | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// The clinician
// ═══════════════════════════════════════════════════════════════════════════

/** Roles a provider token could carry. Only the clinical ones get this UI. */
export type ProviderRole = 'doctor' | 'nurse' | 'admin' | (string & {});

export const CLINICAL_ROLES: readonly ProviderRole[] = ['doctor', 'nurse', 'admin'];

export function isClinicalRole(role: ProviderRole | null | undefined): boolean {
  return !!role && CLINICAL_ROLES.includes(role);
}

/**
 * `GET /mobile/doctor/me` — `MobileDoctorScheduleController::me`.
 *
 * Every actor id on this surface is a `users.id`, and `users.id` is a UUID
 * column on this deployment (`2026_05_14_215752_alter_users_table_for_foundation`:
 * `$table->uuid('id')->primary()`), so it arrives as a string like
 * `"00000000-0000-0000-0000-200000000001"`.
 */
export interface DoctorUser {
  id: string;
  name: string;
  email: string | null;
  /** `$user->role?->name` — null when the account carries no role row. */
  role: ProviderRole | null;
  facility_id: string | null;
  facility_name: string | null;
  is_active: boolean;
}

export function useDoctorMe(opts: QueryOpts = {}) {
  return useQuery({
    queryKey: doctorKeys.me,
    queryFn: () => getData<DoctorUser>(doctorEndpoints.me),
    retry: doctorRetry,
    staleTime: 5 * 60 * 1000,
    enabled: opts.enabled ?? true,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Home
// ═══════════════════════════════════════════════════════════════════════════

/** One appointment as the home screen lists it — a slimmer row than `StaffAppointment`. */
export interface DoctorAppointment {
  id: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status: string;
  appointment_type: string | null;
  visit_mode: string | null;
  location: string | null;
  reason: string | null;
  patient_id: string | null;
  patient_name: string | null;
  /** The patient's Health ID — two patients with one name stay separable. */
  patient_health_id: string | null;
}

/**
 * `GET /mobile/doctor/home` — counted server-side, never guessed on the phone.
 *
 * `meta.counts_basis` on the response names the table each figure came from.
 * On this deployment the only acknowledgement ledger is
 * `critical_value_alerts`, so `unacknowledged_results` and
 * `critical_unacknowledged` count the SAME set and the server says so rather
 * than inventing them apart.
 */
export interface DoctorHome {
  /** `id` is a `users.id` UUID string; `role` is null when the account has no role row. */
  provider: { id: string; name: string; role: ProviderRole | null };
  counts: {
    appointments_today: number;
    unread_messages: number;
    unacknowledged_results: number;
    critical_unacknowledged: number;
  };
  next_appointments: DoctorAppointment[];
  urgent_results: InboxResult[];
}

export function useDoctorHome(opts: QueryOpts = {}) {
  return useQuery({
    queryKey: doctorKeys.home,
    queryFn: () => getData<DoctorHome>(doctorEndpoints.home),
    retry: doctorRetry,
    staleTime: 30 * 1000,
    enabled: opts.enabled ?? true,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Schedule & appointments (port of `doctorScheduling.ts`)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The WIRE vocabulary — deliberately narrower than the `appointments.status`
 * column, which this deployment writes in several spellings.
 * `MobileDoctorScheduleController::WIRE_STATUS` maps column → wire on the way
 * out and inverts the same map for the `status=` filter on the way in:
 *
 *     booked | scheduled | pending | requested  → scheduled
 *     confirmed                                 → confirmed
 *     checked_in | arrived                      → arrived
 *     in_progress                               → in_progress
 *     completed                                 → completed
 *     cancelled | canceled | rescheduled        → cancelled
 *     no_show                                   → no_show
 *
 * ── `rescheduled` IS NOT ADDED HERE, ON PURPOSE ───────────────────────────
 * It is a real COLUMN value, but it is never a WIRE value: the server folds it
 * into `cancelled` before serialising, so widening this union would add a
 * member no response can contain. Worse, the union is bidirectional — it also
 * types the `status` a client SENDS. `PATCH /appointments/{id}/status`
 * validates `in:scheduled,confirmed,arrived,in_progress,completed,cancelled,no_show`,
 * so a `rescheduled` write would 422, and a `status=rescheduled` filter would
 * match nothing (`columnStatusesFor` narrows an unknown status to no rows
 * rather than quietly returning everything).
 *
 * The mapping is also the honest one for a reader: a rescheduled row IS closed
 * and replaced, filtering by `cancelled` correctly includes it (the inverted
 * map expands `cancelled` → `cancelled | canceled | rescheduled`), and the
 * appointment the patient actually has is the NEW row, listed on its own.
 *
 * Decision: KEEP THE MAPPING, keep the union closed.
 *
 * One caveat: `wireStatus()` is `WIRE_STATUS[$status] ?? $status`, so a column
 * value nobody has mapped would pass through verbatim. Every value the schema
 * writes today is in the map; treat an unrecognised status as data, not as a
 * reason to widen this union.
 */
export type StaffAppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

/** Open union: a read can carry a type (`lab`, `telemedicine`, `antenatal`) the writer rejects. */
export type StaffAppointmentType =
  | 'consultation'
  | 'follow_up'
  | 'vaccination'
  | 'procedure'
  | 'other'
  | (string & {});

export interface StaffAppointment {
  id: string;
  patient_id: string;
  /** Only present when the endpoint loaded the patient (schedule/show/writes). */
  patient_name?: string | null;
  /** The OpesCare Health ID. */
  patient_health_id?: string | null;
  /** A facility MRN, when the facility keeps one. */
  patient_medical_id?: string | null;
  patient_sex?: string | null;
  patient_dob?: string | null;
  /** `appointments.provider_id` — a nullable `users.id` UUID string. */
  provider_id: string | null;
  provider_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  appointment_type: StaffAppointmentType | null;
  reason: string | null;
  status: StaffAppointmentStatus;
  visit_mode: string | null;
  location: string | null;
  room: string | null;
  priority: string | null;
  checked_in_at: string | null;
  encounter_id: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface ScheduleQuery extends PageQuery {
  /** `YYYY-MM-DD`. Defaults to today on the server. */
  from?: string;
  /** `YYYY-MM-DD`. Defaults to `from`. */
  to?: string;
  status?: StaffAppointmentStatus[];
}

/** `GET /mobile/doctor/appointments` — the clinician's own diary for a date window. */
export function useDoctorSchedule(query: ScheduleQuery = {}, opts: QueryOpts = {}) {
  return useQuery({
    queryKey: doctorKeys.schedule(query),
    queryFn: () => getPage<StaffAppointment>(doctorEndpoints.appointments, query as Record<string, unknown>),
    retry: doctorRetry,
    staleTime: 30 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/** `GET /mobile/doctor/appointments/{id}`. */
export function useDoctorAppointment(id: string | undefined) {
  return useQuery({
    queryKey: doctorKeys.appointment(id ?? ''),
    queryFn: () => getData<StaffAppointment>(doctorEndpoints.appointment(id as string)),
    retry: doctorRetry,
    enabled: !!id,
  });
}

function useInvalidateAppointments() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: doctorKeys.appointments }),
      qc.invalidateQueries({ queryKey: ['doctor', 'schedule'] }),
      qc.invalidateQueries({ queryKey: ['doctor', 'appointment-requests'] }),
      qc.invalidateQueries({ queryKey: doctorKeys.home }),
    ]);
  };
}

/** `PATCH /mobile/doctor/appointments/{id}/status`. Prefer the guarded endpoints below for check-in / no-show. */
export function useSetAppointmentStatus() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: StaffAppointmentStatus }) =>
      patchData<StaffAppointment>(doctorEndpoints.appointmentStatus(id), { status }),
    onSuccess: invalidate,
  });
}

/** `POST /mobile/doctor/appointments/{id}/check-in` — 422 unless `scheduled|confirmed`. */
export function useCheckInAppointment() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: (id: string) => postData<StaffAppointment>(doctorEndpoints.appointmentCheckIn(id)),
    onSuccess: invalidate,
  });
}

/** `POST /mobile/doctor/appointments/{id}/no-show` — 409 if already `no_show`. */
export function useMarkNoShow() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: (id: string) => postData<StaffAppointment>(doctorEndpoints.appointmentNoShow(id)),
    onSuccess: invalidate,
  });
}

/** `POST /mobile/doctor/appointments/{id}/cancel` — 422 if already cancelled. */
export function useCancelDoctorAppointment() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      postData<StaffAppointment>(doctorEndpoints.appointmentCancel(id), reason ? { cancel_reason: reason } : {}),
    onSuccess: invalidate,
  });
}

/**
 * The `scheduled_at` every writer sends (desk book/reschedule, doctor
 * reschedule, follow-up): the INSTANT the clinician picked, as ISO-8601 with
 * the zone, rounded to the minute.
 *
 * Why an instant and not wall-clock digits: the finder's `config/app.php` is
 * `'timezone' => 'UTC'`, so naive digits are stored as UTC, while every screen
 * in this app formats `scheduled_at` in device-local time (`format.ts`). From a
 * phone on Africa/Douala (UTC+1) the digits "14:30" used to come back as 15:30
 * on the book, the patient's app and the follow-up line, while the patient's
 * push said 14:30. Carrying the instant keeps all of them on the same minute;
 * the server formats notification text in `app.clinic_timezone`.
 */
export function toClinicWallClock(d: Date): string {
  // An absolute instant, not the phone's wall-clock digits: the server parses
  // `scheduled_at` in UTC and every screen renders it back in local time, so
  // sending "14:30" from a UTC+1 phone used to book 15:30. ISO-8601 with the
  // zone carries the same instant end to end (desk book/reschedule, doctor
  // reschedule, follow-up).
  return new Date(Math.floor(d.getTime() / 60000) * 60000).toISOString();
}

/** `PUT /mobile/doctor/appointments/{id}` — moves the appointment outright; 409 once closed. */
export function useRescheduleDoctorAppointment() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: ({ id, when, durationMinutes }: { id: string; when: Date; durationMinutes?: number }) =>
      putData<StaffAppointment>(doctorEndpoints.appointment(id), {
        scheduled_at: toClinicWallClock(when),
        ...(durationMinutes ? { duration_minutes: durationMinutes } : {}),
      }),
    onSuccess: invalidate,
  });
}

/** What the follow-up sheet sends. `reason` is optional and trimmed; blank is not sent. */
export interface FollowUpInput {
  /** The Health ID (or record uuid) — the same key the chart is opened with. */
  patientId: string;
  /** The wall-clock time the clinician picked; sent as `toClinicWallClock`. */
  when: Date;
  reason?: string;
}

/**
 * `POST /mobile/doctor/patients/{id}/follow-up` — books a `follow_up`
 * appointment for the patient with THIS clinician, at the token's facility.
 *
 * The time is sent exactly as the reschedule sends one (`toClinicWallClock`),
 * so the two writers on this surface agree about what a picked time means.
 * On success the diary, the home counts and the requests list are all
 * re-read; the new appointment is the mutation's result, so a screen can show
 * it (and open it) without guessing at what the server stored.
 */
export function useBookFollowUp() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: ({ patientId, when, reason }: FollowUpInput) => {
      const trimmed = reason?.trim();
      return postData<StaffAppointment>(doctorEndpoints.patientFollowUp(patientId), {
        scheduled_at: toClinicWallClock(when),
        ...(trimmed ? { reason: trimmed } : {}),
      });
    },
    onSuccess: invalidate,
  });
}

// ── Appointment requests ──────────────────────────────────────────────────

export type RequestDecision = 'pending' | 'accepted' | 'declined';

export interface RequestsQuery extends PageQuery {
  status?: RequestDecision;
  /** How many days ahead to look. Server default applies when omitted. */
  days?: number;
}

/** `GET /mobile/doctor/appointment-requests` — bookings waiting on the clinician. */
export function useAppointmentRequests(query: RequestsQuery = {}, opts: QueryOpts = {}) {
  return useQuery({
    queryKey: doctorKeys.requests(query),
    queryFn: () => getPage<StaffAppointment>(doctorEndpoints.appointmentRequests, query as Record<string, unknown>),
    retry: doctorRetry,
    staleTime: 30 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/** `POST /mobile/doctor/appointment-requests/{id}/accept` → the appointment, now `confirmed`. */
export function useAcceptAppointmentRequest() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: (id: string) => postData<StaffAppointment>(doctorEndpoints.acceptAppointmentRequest(id)),
    onSuccess: invalidate,
  });
}

/** `POST /mobile/doctor/appointment-requests/{id}/decline` → the appointment, now `cancelled`. */
export function useDeclineAppointmentRequest() {
  const invalidate = useInvalidateAppointments();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      postData<StaffAppointment>(doctorEndpoints.declineAppointmentRequest(id), reason ? { reason } : {}),
    onSuccess: invalidate,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Patients — exact Health ID lookup, then a read-only chart
// ═══════════════════════════════════════════════════════════════════════════

export type PatientSex = 'male' | 'female' | 'other' | (string & {});

/** The chart header / lookup row. Keyed on the Health ID, not a hospital MRN. */
export interface ChartPatient {
  /** The Health ID — also what every `patient(...)` endpoint takes. */
  id: string;
  health_id: string;
  /** A facility MRN when one exists; null on the Finder. */
  medical_id: string | null;
  name: string;
  date_of_birth: string | null;
  age: number | null;
  sex: PatientSex | null;
  blood_group: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  next_of_kin: { name: string | null; phone: string | null; relation: string | null };
  /** Server hint for the row — never a substitute for loading the allergy list. */
  has_allergies: boolean;
  /** Whether this clinician currently holds a consent grant for the record. */
  consent_granted: boolean;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Normalise what the clinician typed into an exact-match key: trimmed,
 * upper-cased, internal whitespace removed. No wildcards survive.
 */
export function normaliseHealthId(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** Minimum length before a lookup is sent — anything shorter is a typo, not an ID. */
export const HEALTH_ID_MIN_LENGTH = 6;

/** A plausible Health ID: letters, digits, dashes; no wildcard characters at all. */
export function isPlausibleHealthId(input: string): boolean {
  const id = normaliseHealthId(input);
  return id.length >= HEALTH_ID_MIN_LENGTH && /^[A-Z0-9-]+$/.test(id);
}

/**
 * `GET /mobile/doctor/patients/lookup?health_id=` — ONE patient by EXACT Health
 * ID, or 404. Refuses to send anything that is not a plausible ID so the server
 * is never asked a prefix or a name.
 *
 * ── ⚠ THE RETURN TYPE IS WRONG AND THE SERVER IS THE REASON ───────────────
 * This route is NOT served by `MobileDoctorChartController`. `routes/api.php:91`
 * points it at `MobilePrescribingController::lookupPatient`, whose
 * `formatPatient()` returns a much smaller row:
 *
 *     { id, health_id, first_name, last_name, full_name,
 *       date_of_birth, sex, blood_group }
 *
 * There is no `name`, no `age`, no `next_of_kin`, no `has_allergies` and no
 * `consent_granted` in it — the chart header's `formatPatient()`
 * (MobileDoctorChartController) is a different method on a different
 * controller. Typing this as `ChartPatient` makes five fields compile that
 * arrive `undefined` at runtime, which is why this is flagged here rather than
 * silently corrected: splitting the type breaks two screens this file does not
 * own, and the split is theirs to make. Consequences observed today:
 *
 *   • `has_allergies` is `undefined` → falsy → reads as "no known allergies";
 *   • `consent_granted` is `undefined` → falsy → always the "not granted" arm;
 *   • `age` is `undefined`, and `undefined !== null` is true, so an `age !== null`
 *     guard passes and renders the string "undefined";
 *   • `next_of_kin` is `undefined`, so `p.next_of_kin.name` would throw.
 *
 * `id` IS safe: the lookup returns `patients.id` (uuid) while the chart header
 * returns `health_id`, and `MobileDoctorChartController::resolvePatient`
 * accepts either form, so routing onward from a lookup result works.
 *
 * Do NOT "fix" this by loosening `ChartPatient` — that would weaken the chart
 * header, which genuinely does carry all of these. It needs its own type.
 */
/**
 * What `GET /mobile/doctor/patients/lookup` ACTUALLY returns.
 *
 * This is NOT a `ChartPatient`. The route is served by
 * `MobilePrescribingController::lookupPatient`, whose own docblock states the
 * intent: "The minimum a prescriber needs to be sure they have the right
 * person. No contact details, no address, no clinical history — this endpoint
 * identifies a patient, it does not disclose their record."
 *
 * It was typed as `ChartPatient` — a much richer object served by a different
 * method on a different controller. Five fields therefore arrived `undefined`
 * at runtime, and TypeScript could not see it:
 *
 *   - `name`            -> the patient's name rendered BLANK on the card whose
 *                          only job is confirming you have the right person
 *   - `age`             -> `undefined !== null` is true, so the guard passed and
 *                          the screen printed the literal string "undefined"
 *   - `consent_granted` -> always falsy, so "you already have access" never showed
 *   - `has_allergies`   -> always falsy, so an allergy tint could NEVER fire on a
 *                          row whose comment says it is there "so a clinician knows"
 *   - `next_of_kin`     -> a property read on `undefined` would have thrown
 *
 * The right shape is this one, not a looser `ChartPatient`: `has_allergies` is
 * clinical history and the endpoint deliberately withholds it. A screen must
 * therefore say nothing about allergies here rather than imply "none".
 */
export interface PatientLookupResult {
  id: string;
  health_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  sex: string | null;
  blood_group: string | null;
}

/** Age in whole years from a `YYYY-MM-DD`, or null when the date is absent. */
export function ageFromDateOfBirth(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDelta = now.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) age -= 1;

  return age >= 0 && age < 150 ? age : null;
}

export async function lookupPatientByHealthId(healthId: string): Promise<PatientLookupResult> {
  if (!isPlausibleHealthId(healthId)) {
    throw new Error('A full Health ID is required to look a patient up.');
  }
  return getData<PatientLookupResult>(doctorEndpoints.patientLookup, {
    health_id: normaliseHealthId(healthId),
  });
}

export function usePatientLookup(healthId: string | null | undefined) {
  const key = healthId ? normaliseHealthId(healthId) : '';
  return useQuery({
    queryKey: doctorKeys.patientLookup(key),
    queryFn: () => lookupPatientByHealthId(key),
    retry: false,
    enabled: isPlausibleHealthId(key),
  });
}

/** `GET /mobile/doctor/patients/{id}` — the chart header. */
export function useChartPatient(patientId: string | undefined) {
  return useQuery({
    queryKey: doctorKeys.patient(patientId ?? ''),
    queryFn: () => getData<ChartPatient>(doctorEndpoints.patient(patientId as string)),
    retry: doctorRetry,
    enabled: !!patientId,
  });
}

// ── Allergies ─────────────────────────────────────────────────────────────

export type AllergyType = 'drug' | 'food' | 'environmental' | 'other' | (string & {});
export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening' | (string & {});

export interface ChartAllergy {
  id: string;
  patient_id: string;
  /**
   * ALWAYS null on this deployment: `allergy_records` has no type column, so
   * `MobileDoctorChartController::allergies` hardcodes `null`. Null is "not
   * recorded" — the server refuses to guess `drug`, and neither may a screen.
   * `allergyTypeLabel` already takes `string | null | undefined`.
   */
  allergy_type: AllergyType | null;
  /** `allergy_records.substance`. */
  allergen: string;
  /** `allergy_records.severity` — a non-null column, defaulting to `moderate`. */
  severity: AllergySeverity;
  /** Not columns on this deployment; always null. */
  reaction: string | null;
  onset_date: string | null;
  notes: string | null;
  /**
   * `allergy_records.provider_id` — a `users.id` UUID string. The column is
   * NOT nullable, so a row always carries one; the `| null` is kept only so
   * this field matches every other actor id in the contract.
   */
  recorded_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * `GET /mobile/doctor/patients/{id}/allergies`.
 *
 * Its own query, never folded into the summary: a failure here must surface AS
 * a failure. An allergy list that fails inside an aggregate and renders empty
 * reads as "no known allergies" — the single most dangerous thing a chart can say.
 */
export function useChartAllergies(patientId: string | undefined) {
  return useQuery({
    queryKey: doctorKeys.chartSection(patientId ?? '', 'allergies'),
    queryFn: () => getData<ChartAllergy[]>(doctorEndpoints.patientAllergies(patientId as string)),
    retry: doctorRetry,
    enabled: !!patientId,
  });
}

// ── Problems ──────────────────────────────────────────────────────────────

export type ProblemStatus = 'active' | 'inactive' | 'resolved' | (string & {});

export interface ChartProblem {
  id: string;
  patient_id: string;
  icd10_code: string | null;
  icd10_description: string;
  /** May be a bare date OR a full timestamp — formatters must tolerate both. */
  onset_date: string | null;
  status: ProblemStatus;
  notes: string | null;
  /** `problem_lists.provider_id` — a `users.id` UUID string (`foreignUuid`). */
  added_by: string | null;
  created_at: string | null;
}

export function useChartProblems(patientId: string | undefined) {
  return useQuery({
    queryKey: doctorKeys.chartSection(patientId ?? '', 'problems'),
    queryFn: () => getData<ChartProblem[]>(doctorEndpoints.patientProblems(patientId as string)),
    retry: doctorRetry,
    enabled: !!patientId,
  });
}

// ── Encounters ────────────────────────────────────────────────────────────

export type EncounterType = 'opd' | 'emergency' | 'follow_up' | 'telehealth' | (string & {});

export interface ChartEncounter {
  id: string;
  patient_id: string;
  facility_id: string | null;
  facility_name: string | null;
  encounter_type: EncounterType;
  status: string;
  encounter_date: string | null;
  encounter_time: string | null;
  /** `visits.attending_provider_id` — a nullable `users.id` UUID string. */
  doctor_id: string | null;
  doctor_name: string | null;
  chief_complaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  discharge_note: string | null;
  follow_up_date: string | null;
  closed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** `GET /mobile/doctor/patients/{id}/encounters` — paginated, newest first. */
export function useChartEncounters(patientId: string | undefined, query: PageQuery = {}) {
  return useQuery({
    queryKey: doctorKeys.chartSection(patientId ?? '', 'encounters', query),
    queryFn: () =>
      getPage<ChartEncounter>(doctorEndpoints.patientEncounters(patientId as string), query as Record<string, unknown>),
    retry: doctorRetry,
    enabled: !!patientId,
  });
}

// ── Vitals ────────────────────────────────────────────────────────────────

/** Every measurement is `Decimalish` — see the note on `toNumber`. */
export interface ChartVitals {
  id: string;
  encounter_id: string | null;
  patient_id: string;
  bp_systolic: Decimalish;
  bp_diastolic: Decimalish;
  temperature: Decimalish;
  pulse: Decimalish;
  respiratory_rate: Decimalish;
  spo2: Decimalish;
  weight: Decimalish;
  height: Decimalish;
  bmi: Decimalish;
  blood_glucose: Decimalish;
  head_circumference: Decimalish;
  /**
   * `triage_vital_signs.recorded_by` — a `users.id` UUID string. Genuinely
   * null on the legacy `vital_signs` branch, which has no such column and is
   * serialised as `null` rather than being attributed to someone.
   */
  recorded_by: string | null;
  /** Null on the legacy `vital_signs` branch: that table records no reading time. */
  recorded_at: string | null;
  created_at: string | null;
}

/** `GET /mobile/doctor/patients/{id}/vitals?limit=` — newest first. */
export function useChartVitals(patientId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: doctorKeys.chartSection(patientId ?? '', 'vitals', limit),
    queryFn: () => getData<ChartVitals[]>(doctorEndpoints.patientVitals(patientId as string), { limit }),
    retry: doctorRetry,
    enabled: !!patientId,
  });
}

// ── Scan-bounded lists (prescriptions, diagnoses, orders) ─────────────────

/**
 * A list with an honest account of how complete it is.
 *
 * `failed > 0` or `truncated` ⇒ the list is a SUBSET of the record and the UI
 * must say so (`IncompleteNotice`). A quietly short medication list is the
 * same hazard as a quietly stale one.
 *
 * ── WHAT THESE FIELDS MEAN ON *THIS* SERVER ───────────────────────────────
 * The vocabulary comes from OPES, which built these lists by opening the
 * patient's recent encounters ONE AT A TIME — hence "scanned" and "failed".
 * The finder has patient-scoped tables and reads them directly
 * (`MobileDoctorChartController::scanResult`), so there is no fan-out to fail:
 *
 *   scanned    source rows read (prescriptions / diagnoses / orders), NOT
 *              encounters walked.
 *   failed     ALWAYS 0. Nothing can partially fail. Keep handling it anyway —
 *              a non-zero value from any deployment still means "incomplete".
 *   truncated  the read hit SCAN_HARD_CAP (500 source rows), not "older
 *              encounters exist". Still exactly "this list is a subset".
 */
export interface ScanResult<T> {
  items: T[];
  /** Source rows read. */
  scanned: number;
  /** Rows that errored and are therefore missing from `items`. Always 0 here. */
  failed: number;
  /** True when the server's hard cap cut the list short. */
  truncated: boolean;
}

/**
 * ⚠ THESE ARE INERT AGAINST THE DEPLOYED SERVER.
 *
 * They are still sent as `?scan=`, but `MobileDoctorChartController` never
 * reads the parameter — every scan-bounded section is bounded by its own
 * `SCAN_HARD_CAP` (500) instead. So "the section screen goes deeper" is no
 * longer true: both screens get the same rows.
 *
 * They are kept because they are also part of the react-query cache key, so a
 * section screen and the overview hold separate cache entries; dropping them
 * is a cache-invalidation change, not a type fix, and belongs with whoever
 * owns those screens. Do NOT rely on either constant to bound a list.
 */
export const OVERVIEW_ENCOUNTER_SCAN = 4;
export const SECTION_ENCOUNTER_SCAN = 12;

export type PrescriptionRoute =
  | 'oral' | 'iv' | 'im' | 'sc' | 'topical' | 'inhaled' | 'rectal' | 'other' | (string & {});
export type PrescriptionStatus = 'draft' | 'active' | 'completed' | 'stopped' | (string & {});

export interface ChartPrescription {
  id: string;
  encounter_id: string | null;
  patient_id: string;
  drug_name: string;
  dosage: string | null;
  route: PrescriptionRoute | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  status: PrescriptionStatus;
  /** `prescriptions.prescribed_by` — a nullable `users.id` UUID string. */
  prescribed_by: string | null;
  prescribed_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ChartDiagnosis {
  id: string;
  encounter_id: string | null;
  patient_id: string;
  icd10_code: string | null;
  icd10_description: string;
  diagnosis_type: string | null;
  diagnosis_nature: string | null;
  sensitivity_level: string | null;
  add_to_problem_list: boolean;
  notes: string | null;
  /** `diagnoses.provider_id` — a `users.id` UUID string. */
  diagnosed_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Open union — live data has carried `medication` alongside the three the validator allows. */
export type OrderType = 'lab' | 'imaging' | 'procedure' | 'medication' | (string & {});
export type OrderStatus = 'ordered' | 'in_progress' | 'completed' | 'cancelled' | (string & {});

export interface ChartOrder {
  id: string;
  encounter_id: string | null;
  patient_id: string;
  order_type: OrderType;
  code: string | null;
  name: string;
  priority: 'routine' | 'urgent' | 'stat' | (string & {}) | null;
  clinical_notes: string | null;
  status: OrderStatus;
  /**
   * The releasing bench's plain-language conclusion, when there is one.
   * Always null for `lab` (a laboratory releases values, not a narrative);
   * for `imaging` it is the radiologist's own `impression`, verbatim.
   */
  result_summary: string | null;
  /** `lab_orders.ordered_by` / `imaging_orders.ordered_by` — a `users.id` UUID string. */
  ordered_by: string | null;
  ordered_at: string | null;
  created_at: string | null;
}

/**
 * `reference` is the LABORATORY's own range and `flag`/`is_abnormal` its own
 * interpretation. Both render verbatim; this app never derives a lab range.
 */
export interface ChartLabResult {
  id: string;
  clinical_order_id: string;
  /** The LOINC code — this deployment keeps no local test catalogue id. */
  lab_test_id: string | null;
  analyte: string;
  value: string | null;
  unit: string | null;
  reference: string | null;
  flag: string | null;
  is_abnormal: boolean;
  /** `lab_results.verified_by` — a nullable `users.id` UUID string. */
  entered_by: string | null;
  entered_by_name: string | null;
  entered_at: string | null;
}

export function useChartPrescriptions(patientId: string | undefined, scan = SECTION_ENCOUNTER_SCAN) {
  return useQuery({
    queryKey: doctorKeys.chartSection(patientId ?? '', 'prescriptions', scan),
    queryFn: () =>
      getData<ScanResult<ChartPrescription>>(doctorEndpoints.patientPrescriptions(patientId as string), { scan }),
    retry: doctorRetry,
    enabled: !!patientId,
  });
}

export function useChartDiagnoses(patientId: string | undefined, scan = SECTION_ENCOUNTER_SCAN) {
  return useQuery({
    queryKey: doctorKeys.chartSection(patientId ?? '', 'diagnoses', scan),
    queryFn: () => getData<ScanResult<ChartDiagnosis>>(doctorEndpoints.patientDiagnoses(patientId as string), { scan }),
    retry: doctorRetry,
    enabled: !!patientId,
  });
}

/** `type` narrows to one `order_type` — `labs` and `imaging` are the same endpoint filtered differently. */
export function useChartOrders(patientId: string | undefined, scan = SECTION_ENCOUNTER_SCAN, type?: OrderType) {
  return useQuery({
    queryKey: doctorKeys.chartSection(patientId ?? '', 'orders', { scan, type: type ?? null }),
    queryFn: () =>
      getData<ScanResult<ChartOrder>>(doctorEndpoints.patientOrders(patientId as string), {
        scan,
        ...(type ? { type } : {}),
      }),
    retry: doctorRetry,
    enabled: !!patientId,
  });
}

/** `GET /mobile/doctor/orders/{id}/results` — analyte rows, when the bench has entered any. */
export function useOrderResults(orderId: string | undefined) {
  return useQuery({
    queryKey: doctorKeys.orderResults(orderId ?? ''),
    queryFn: () => getData<ChartLabResult[]>(doctorEndpoints.orderResults(orderId as string)),
    retry: doctorRetry,
    enabled: !!orderId,
  });
}

// ── Chart summary (everything but identity and allergies) ─────────────────

export interface ChartSummary {
  problems: ChartProblem[];
  encounters: ChartEncounter[];
  /** Total encounters on record, not just the ones fetched. */
  encounterTotal: number;
  prescriptions: ScanResult<ChartPrescription>;
  orders: ScanResult<ChartOrder>;
  /** The most recent vitals set, or null. */
  latestVitals: ChartVitals | null;
  /** True when the vitals read itself failed, as opposed to finding none. */
  vitalsFailed: boolean;
}

function failedScan<T>(): ScanResult<T> {
  return { items: [], scanned: 0, failed: 1, truncated: false };
}

/**
 * Load the non-allergy body of the chart in one go.
 *
 * Allergies are NOT part of this call, by design — see `useChartAllergies`.
 * `problems` and `encounters` are required (a failure throws); the scan-bounded
 * lists and vitals degrade honestly: a failed list comes back as an empty
 * `ScanResult` with `failed: 1` so `IncompleteNotice` reports it, and a failed
 * vitals read sets `vitalsFailed` rather than pretending the record has none.
 */
export async function loadChartSummary(
  patientId: string,
  encounterScan: number = OVERVIEW_ENCOUNTER_SCAN,
): Promise<ChartSummary> {
  const [problems, encounterPage] = await Promise.all([
    getData<ChartProblem[]>(doctorEndpoints.patientProblems(patientId)),
    getPage<ChartEncounter>(doctorEndpoints.patientEncounters(patientId), { per_page: Math.max(encounterScan, 20) }),
  ]);

  const [prescriptions, orders, vitals] = await Promise.allSettled([
    getData<ScanResult<ChartPrescription>>(doctorEndpoints.patientPrescriptions(patientId), { scan: encounterScan }),
    getData<ScanResult<ChartOrder>>(doctorEndpoints.patientOrders(patientId), { scan: encounterScan }),
    getData<ChartVitals[]>(doctorEndpoints.patientVitals(patientId), { limit: 1 }),
  ]);

  return {
    problems,
    encounters: encounterPage.data,
    encounterTotal: encounterPage.meta?.pagination?.total ?? encounterPage.data.length,
    prescriptions: prescriptions.status === 'fulfilled' ? prescriptions.value : failedScan<ChartPrescription>(),
    orders: orders.status === 'fulfilled' ? orders.value : failedScan<ChartOrder>(),
    latestVitals: vitals.status === 'fulfilled' ? (vitals.value[0] ?? null) : null,
    vitalsFailed: vitals.status === 'rejected',
  };
}

export function useChartSummary(patientId: string | undefined, encounterScan: number = OVERVIEW_ENCOUNTER_SCAN) {
  return useQuery({
    queryKey: doctorKeys.chartSummary(patientId ?? '', encounterScan),
    queryFn: () => loadChartSummary(patientId as string, encounterScan),
    retry: doctorRetry,
    enabled: !!patientId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Results inbox (port of `doctorInbox.ts`)
// ═══════════════════════════════════════════════════════════════════════════

export type ResultSeverity = 'critical' | 'warning' | 'success' | 'info' | (string & {});

/** One row of the inbox: a notification addressed to this clinician. */
export interface InboxResult {
  id: string;
  /** `lab_review` / `lab_result` / `laboratory` / `radiology`. */
  category: string;
  /** The server's own label; the app prefers its catalogue. */
  category_label: string;
  severity: ResultSeverity;
  priority: 'high' | 'medium' | 'low' | (string & {});
  /** Server-computed. The one flag that decides how loud the row is. */
  is_critical: boolean;
  title: string;
  body: string | null;
  patient_id: string | null;
  patient_name: string | null;
  /** The patient's Health ID. */
  patient_health_id: string | null;
  reported_at: string | null;
  read_at: string | null;
  acknowledged_at: string | null;
  /**
   * `critical_value_alerts.acknowledged_by` /
   * `critical_value_acknowledgements.acknowledged_by` — both `foreignUuid`
   * onto `users`, so a `users.id` UUID string, null until acknowledged.
   */
  acknowledged_by: string | null;
  acknowledged_by_name: string | null;
  action_route: string | null;
  action_id: string | null;
}

export interface InboxAnalyte {
  id: string;
  analyte: string;
  value: string | null;
  unit: string | null;
  reference: string | null;
  ref_low: string | null;
  ref_high: string | null;
  /** The lab's flag, never derived here. */
  flag: string | null;
  is_abnormal: boolean;
  verified_by_name: string | null;
  verified_at: string | null;
  reported_at: string | null;
}

export type InboxResultContext =
  | {
      kind: 'lab';
      order_id: string;
      test_name: string | null;
      ordered_at: string | null;
      status: string | null;
      analytes: InboxAnalyte[];
    }
  | {
      kind: 'radiology';
      result_id: string;
      test_name: string | null;
      /**
       * NOT a column on `radiology_reports`. The server reads it across the
       * join as `imaging_orders.accession_number` for the report's
       * `imaging_order_id`, and leaves it null when the report has no order.
       */
      report_number: string | null;
      report_status: string | null;
      /**
       * ALWAYS null: `radiology_reports` records no abnormality flag, so the
       * server sends null rather than inventing one. A screen must print "not
       * recorded" — never a reassurance.
       */
      flag: string | null;
      /** ALWAYS null: no `technique` column on `radiology_reports` either. */
      technique: string | null;
      findings: string | null;
      impression: string | null;
      recommendation: string | null;
      reported_by_name: string | null;
      reported_at: string | null;
      /** ALWAYS empty: a report is a narrative, not a panel. */
      analytes: InboxAnalyte[];
    };

export interface InboxResultDetail extends InboxResult {
  /** Null when the underlying record is no longer there. */
  result: InboxResultContext | null;
}

export type InboxFilter = 'all' | 'unacknowledged' | 'critical' | 'acknowledged';

/**
 * The five figures on `meta.counts`. They are counted over the SAME bounded
 * window the rows came from, so when `InboxPage.truncated` is true they
 * describe that window and not the clinician's whole record.
 */
export interface InboxCounts {
  all: number;
  unacknowledged: number;
  critical: number;
  acknowledged: number;
  /** Critical AND unacknowledged — the figure that must never be merged away. */
  critical_pending: number;
}

export interface InboxPage {
  rows: InboxResult[];
  counts: InboxCounts;
  /**
   * TRUE ⇒ THIS INBOX IS A SUBSET OF THE CLINICIAN'S RESULTS, and `counts`
   * describes the loaded WINDOW, not the record.
   *
   * `MobileResultsInboxController::index` assembles rows from a bounded window
   * of source records (250 lab orders + 250 radiology reports) and reports
   * `meta.truncated` when either side hit its bound. Same contract as
   * `ScanResult.truncated` on the chart, and the same obligation: the UI must
   * SAY SO. A quietly short results inbox is the same hazard as a quietly
   * stale one, and worse here than on a chart — the row that fell off the end
   * could be the unacknowledged critical.
   *
   * Copy is staged in `lib/i18n/pending/doctor_results.{en,fr}.json` as
   * `opesDoctor.inbox.truncatedTitle` / `truncatedBody` / `truncatedAction`.
   */
  truncated: boolean;
}

/** `GET /mobile/doctor/results-inbox?filter=` — hard-scoped server-side to the token owner. */
export async function fetchResultsInbox(filter: InboxFilter = 'unacknowledged'): Promise<InboxPage> {
  const res = await apiClient.get<{
    data: InboxResult[];
    meta: { counts: InboxCounts; filter?: string; truncated?: boolean };
  }>(doctorEndpoints.resultsInbox, { params: { filter: filter === 'all' ? undefined : filter } });

  return {
    rows: res.data.data,
    counts: res.data.meta.counts,
    // The deployed server always sends `meta.truncated`. Absence means an
    // older build, and `false` is the deliberate fallback: a completeness
    // warning shown on every single load would be trained away as noise, and
    // the notice would then be worthless on the day it is true.
    truncated: res.data.meta?.truncated === true,
  };
}

export function useResultsInbox(filter: InboxFilter = 'unacknowledged', opts: QueryOpts = {}) {
  return useQuery({
    queryKey: doctorKeys.inbox(filter),
    queryFn: () => fetchResultsInbox(filter),
    retry: doctorRetry,
    staleTime: 30 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/** `GET /mobile/doctor/results-inbox/{id}`. */
export function useResultDetail(id: string | undefined) {
  return useQuery({
    queryKey: doctorKeys.result(id ?? ''),
    queryFn: () => getData<InboxResultDetail>(doctorEndpoints.result(id as string)),
    retry: doctorRetry,
    enabled: !!id,
  });
}

/**
 * `POST /mobile/doctor/results-inbox/{id}/acknowledge` — idempotent on the
 * server: a second call answers 200 with the ORIGINAL signature, so a retry
 * after a dropped response cannot make a landed acknowledgement look failed.
 */
export function useAcknowledgeResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postData<InboxResultDetail>(doctorEndpoints.acknowledgeResult(id)),
    onSuccess: async (detail) => {
      qc.setQueryData(doctorKeys.result(detail.id), detail);
      await Promise.all([
        qc.invalidateQueries({ queryKey: doctorKeys.inboxAll }),
        qc.invalidateQueries({ queryKey: doctorKeys.home }),
      ]);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Messages (port of `staffMessaging.ts`)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Same five fields the patient side's `ThreadMessage` carries — the server
 * serialises both sides through one presenter, so bubbles stay identical.
 */
export interface DoctorThreadMessage {
  id: number | string;
  is_mine: boolean;
  body: string;
  status: string;
  created_at: string | null;
}

export interface DoctorThread {
  id: string;
  /** `patient` — correspondence with a patient. `internal` — a colleague. */
  kind: 'patient' | 'internal' | (string & {});
  subject: string | null;
  status: 'open' | 'archived' | 'closed' | (string & {});
  patient_id: string | null;
  patient_name: string | null;
  patient_health_id: string | null;
  /** Who this conversation is *with*, from the clinician's seat. */
  counterpart_name: string | null;
  /**
   * The clinician on the thread's linked appointment
   * (`appointments.provider_id`) — a nullable `users.id` UUID string.
   */
  provider_id: string | null;
  provider_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  /** Messages waiting on THIS clinician. Straight from the server; never derived. */
  unread_count: number;
}

export interface DoctorThreadDetail extends DoctorThread {
  messages: DoctorThreadMessage[];
}

export interface DoctorThreadQuery extends PageQuery {
  /** Only conversations with something waiting on me. */
  unread?: boolean;
  /** `archived` switches to the archive folder; omitted means the live inbox. */
  status?: 'archived';
  kind?: 'patient' | 'internal';
}

export type DoctorThreadState = 'unread' | 'archive' | 'reopen';

/**
 * `GET /mobile/doctor/messages/unread-count` — MESSAGING ONLY.
 *
 * ── WHY THERE ARE TWO COUNT TYPES AND NOT ONE ─────────────────────────────
 * Two controllers register a handler on this exact path.
 * `MobileDoctorMessagingController::unreadCount` returns the two fields below;
 * `MobileResultsInboxController::unreadCount` returns the three result fields
 * in `DoctorResultCounts`. Laravel keeps the FIRST matching route, and
 * `AppServiceProvider::boot` loads `routes/mobile_doctor_messaging.php` (line
 * 133) before `routes/mobile_doctor_results.php` (line 138) — so this path
 * serves the MESSAGING payload, and the results file's own comment
 * acknowledges the collision and points at `results-inbox/counts` instead.
 *
 * These are deliberately NOT merged into one badge number. Criticals are a
 * distinct clinical fact with a distinct obligation, and folding them into a
 * generic "unread" total is exactly the collapse the results screen exists to
 * prevent: a clinician who sees `7` cannot tell six routine results plus one
 * critical from seven routine ones. Whatever a screen does with these, the
 * critical figure stays separately visible.
 */
export interface DoctorUnreadCounts {
  unread_threads: number;
  unread_messages: number;
}

/**
 * `GET /mobile/doctor/results-inbox/counts` — the RESULTS half of the badge,
 * from `MobileResultsInboxController::unreadCount`.
 *
 * Counted over the same bounded window as the inbox itself, so on a truncated
 * inbox these describe the window rather than the whole record — see
 * `InboxPage.truncated`.
 */
export interface DoctorResultCounts {
  /** Results with no `acknowledged_at`, critical or not. */
  unacknowledged_results: number;
  /** The subset of those that are critical. NEVER fold this into a total. */
  critical_unacknowledged: number;
  /** Criticals in the window, acknowledged or not. */
  critical_total: number;
}

export function useDoctorThreads(query: DoctorThreadQuery = {}, opts: QueryOpts = {}) {
  return useQuery({
    queryKey: doctorKeys.threads(query),
    queryFn: () => getPage<DoctorThread>(doctorEndpoints.messageThreads, query as Record<string, unknown>),
    retry: doctorRetry,
    staleTime: 15 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/** Opening a thread marks its inbound messages read server-side; the body comes back as it was before. */
export function useDoctorThread(id: string | undefined) {
  return useQuery({
    queryKey: doctorKeys.thread(id ?? ''),
    queryFn: () => getData<DoctorThreadDetail>(doctorEndpoints.messageThread(id as string)),
    retry: doctorRetry,
    enabled: !!id,
  });
}

/** Returns the persisted row, so a reply that appears has genuinely landed. */
export function useSendDoctorMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, body }: { threadId: string; body: string }) =>
      postData<DoctorThreadMessage>(doctorEndpoints.sendMessage(threadId), { body }),
    onSuccess: async (_message, { threadId }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: doctorKeys.thread(threadId) }),
        qc.invalidateQueries({ queryKey: doctorKeys.threadsAll }),
      ]);
    },
  });
}

export function useSetDoctorThreadState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, state }: { threadId: string; state: DoctorThreadState }) =>
      patchData<DoctorThread>(doctorEndpoints.threadState(threadId), { state }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: doctorKeys.threadsAll });
    },
  });
}

/**
 * The MESSAGING badge. It does not carry result or critical figures — those
 * are `DoctorResultCounts` at `doctorEndpoints.resultCounts`, and no hook
 * fetches them yet (the home screen gets the same numbers inside
 * `DoctorHome.counts`, and the results screen gets them from `InboxCounts`).
 */
export function useDoctorUnreadCounts(opts: QueryOpts = {}) {
  return useQuery({
    queryKey: doctorKeys.unread,
    queryFn: () => getData<DoctorUnreadCounts>(doctorEndpoints.unreadCounts),
    retry: doctorRetry,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    enabled: opts.enabled ?? true,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Profile (port of `staffProfile.ts`)
// ═══════════════════════════════════════════════════════════════════════════

/** Read-only standing, asserted by credentialing — never self-declared. */
export type ProviderLicenseStatus = 'active' | 'expired' | 'pending' | 'suspended' | (string & {});

export interface ProviderProfile {
  display_name: string | null;
  title: string | null;
  specialty: string | null;
  subspecialty: string | null;
  bio: string | null;
  photo_url: string | null;
  years_experience: number | null;
  languages: string[];
  qualifications: string[];
  room: string | null;
  /**
   * Read-only, and ALWAYS null on this deployment: the finder records no
   * clinician consultation fee, so the server sends null rather than a
   * plausible figure. A screen must omit the fee, never print `0`.
   */
  consultation_fee: number | null;
  /** Read-only, and always null alongside `consultation_fee` above. */
  currency: string | null;
  /** Read-only — asserted by credentialing, never self-declared. */
  license_status: ProviderLicenseStatus | null;
}

/** Exactly the keys `PUT /mobile/doctor/profile` accepts. Fee, currency, licence and photo are governed elsewhere. */
export interface ProviderProfileEdit {
  title: string | null;
  specialty: string | null;
  subspecialty: string | null;
  bio: string | null;
  years_experience: number | null;
  languages: string[];
  qualifications: string[];
  room: string | null;
}

/**
 * `GET /mobile/doctor/profile` — `null` is a real state (no profile created
 * yet) and is distinct from a failure to load, which is an error.
 */
export function useDoctorProfile(opts: QueryOpts = {}) {
  return useQuery({
    queryKey: doctorKeys.profile,
    queryFn: async () => (await getData<ProviderProfile | null>(doctorEndpoints.profile)) ?? null,
    retry: doctorRetry,
    enabled: opts.enabled ?? true,
  });
}

/** Returns the profile as the server recorded it — the stored truth, not the unsent draft. */
export function useUpdateDoctorProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProviderProfileEdit) => putData<ProviderProfile>(doctorEndpoints.profile, patch),
    onSuccess: (profile) => {
      qc.setQueryData(doctorKeys.profile, profile);
    },
  });
}

/** Multipart `photo`; axios sets the boundary itself, so no Content-Type by hand. */
export function useUploadDoctorPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ photo, filename }: { photo: Blob; filename: string }) => {
      const form = new FormData();
      form.append('photo', photo, filename);
      return postData<{ photo_url: string }>(doctorEndpoints.profilePhoto, form);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: doctorKeys.profile });
    },
  });
}
