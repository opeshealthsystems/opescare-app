/**
 * Doctor-side data layer — the CLINICIAN half of the app, modelled on
 * `lib/api/vitalsQueries.ts`: typed wire shapes, `apiClient`, react-query hooks,
 * endpoint constants spelled out here (not in `endpoints.ts`, owned elsewhere).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BACKEND GAP — READ THIS BEFORE WIRING A SCREEN TO IT
 * ─────────────────────────────────────────────────────────────────────────
 * The Finder mobile API (`finder.opescare.cloud/api/mobile/*`) is PATIENT-TOKEN
 * ONLY. Every `/mobile/*` route group runs behind `auth.mobile`
 * (`AuthenticateMobilePatient`), the login endpoints mint patient tokens, and
 * there is no `/mobile/doctor/*`, no staff login and no provider guard on the
 * mobile surface (verified against the finder route files on 2026-09-04:
 * `routes/api.php`, `routes/mobile_*.php`).
 *
 * So this module is a real, typed CLIENT CONTRACT for a surface the server does
 * not serve yet. The contract is a port of the OPES clinician API
 * (`UIUX/src/api/doctorChart.ts`, `doctorInbox.ts`, `doctorScheduling.ts`,
 * `staffMessaging.ts`, `staffProfile.ts`), re-rooted under `/mobile/doctor/…`
 * and re-keyed on the OpesCare **Health ID** where OPES used a hospital MRN.
 *
 * Until the backend lands, every hook here answers 404 (route missing) and the
 * hooks are built to fail gracefully:
 *   • `retry: false` on 404 / 501 / 401 / 403 — nothing hammers a missing route;
 *   • `isDoctorApiUnavailable(error)` lets a screen say "not available on this
 *     server yet" instead of a generic failure;
 *   • no hook ever fabricates a row — an unavailable endpoint is an error
 *     state, never an empty list.
 *
 * What a real doctor login needs server-side:
 *   1. a provider login (`POST /mobile/doctor/auth/login`) issuing a
 *      provider-scoped token, plus `GET /mobile/doctor/me` — the persona in
 *      `lib/store/auth.ts` is already plumbed to consume it;
 *   2. an `auth.mobile.provider` middleware that sets `provider_id` /
 *      `facility_id` on the request from that token (never from headers/body);
 *   3. the routes below, each ConsentGrant-gated for the patient they read.
 *
 * Two rules this module enforces on every screen that uses it:
 *   1. Patients are found by EXACT Health ID only. There is no name search, no
 *      `LIKE`, no listing. `lookupPatientByHealthId` refuses to send anything
 *      that is not a plausible Health ID.
 *   2. Reading is the whole job. The chart section is GET-only; the only
 *      writes are appointment decisions, result acknowledgement, messaging and
 *      the doctor's own profile. Prescribing/ordering stay off the phone.
 */
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

// ═══════════════════════════════════════════════════════════════════════════
// Endpoints — every path in one place, all under the (unserved) doctor prefix
// ═══════════════════════════════════════════════════════════════════════════

/** Root of the provider-side mobile surface. Nothing under it exists server-side today. */
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
  /** GET — analyte rows for one order. */
  orderResults: (orderId: string) => `${DOCTOR_API_PREFIX}/orders/${orderId}/results`,

  /** GET `?filter=`. */
  resultsInbox: `${DOCTOR_API_PREFIX}/results-inbox`,
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
  /** GET. */
  unreadCounts: `${DOCTOR_API_PREFIX}/messages/unread-count`,

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
 * True when the failure means "this server does not serve the doctor surface"
 * — a missing route (404), an explicit not-implemented (501), or a patient
 * token being refused on a provider route (401/403). A screen should render
 * this as "not available on this server yet", not as a transient error.
 */
export function isDoctorApiUnavailable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 404 || status === 501 || status === 401 || status === 403;
}

/** React-query `retry` for every doctor hook: one retry, none when the route is missing. */
export const doctorRetry = (failureCount: number, error: unknown): boolean =>
  !isDoctorApiUnavailable(error) && failureCount < 1;

/** Message from an API error body, else a neutral fallback. Never leaks a stack. */
export function doctorErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(error)) {
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

/** `GET /mobile/doctor/me`. */
export interface DoctorUser {
  id: number;
  name: string;
  email: string | null;
  role: ProviderRole;
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

/** `GET /mobile/doctor/home` — counted server-side, never guessed on the phone. */
export interface DoctorHome {
  provider: { id: number; name: string; role: ProviderRole };
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
  provider_id: number | null;
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
 * `2027-12-30 14:30:00` from the local components of `d`.
 *
 * The server parses an incoming datetime in the application timezone
 * (Africa/Douala) and normalises an explicit `Z` the same way rather than
 * honouring it — `toISOString()` would shift the appointment by an hour. The
 * clinic's wall clock is what goes on the wire.
 */
export function toClinicWallClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:00`
  );
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
 */
export async function lookupPatientByHealthId(healthId: string): Promise<ChartPatient> {
  if (!isPlausibleHealthId(healthId)) {
    throw new Error('A full Health ID is required to look a patient up.');
  }
  return getData<ChartPatient>(doctorEndpoints.patientLookup, { health_id: normaliseHealthId(healthId) });
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
  allergy_type: AllergyType;
  allergen: string;
  severity: AllergySeverity;
  reaction: string | null;
  onset_date: string | null;
  notes: string | null;
  recorded_by: number | null;
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
  added_by: number | null;
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
  doctor_id: number | null;
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
  recorded_by: number | null;
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
 * A list gathered from the patient's recent encounters, with an honest account
 * of how complete it is. The server walks at most `scan` encounters; `failed`
 * encounters could not be read, `truncated` means older encounters exist.
 *
 * `failed > 0` or `truncated` ⇒ the list is a SUBSET of the record and the UI
 * must say so (`IncompleteNotice`). A quietly short medication list is the
 * same hazard as a quietly stale one.
 */
export interface ScanResult<T> {
  items: T[];
  /** Encounters successfully read. */
  scanned: number;
  /** Encounters that errored and are therefore missing from `items`. */
  failed: number;
  /** True when the patient has more encounters than the scan bound covers. */
  truncated: boolean;
}

/** How many recent encounters the overview asks the server to walk; a section screen goes deeper. */
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
  prescribed_by: number | null;
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
  diagnosed_by: number | null;
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
  /** The releasing bench's plain-language conclusion, when there is one. */
  result_summary: string | null;
  ordered_by: number | null;
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
  lab_test_id: string | null;
  analyte: string;
  value: string | null;
  unit: string | null;
  reference: string | null;
  flag: string | null;
  is_abnormal: boolean;
  entered_by: number | null;
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
  acknowledged_by: number | null;
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
      report_number: string | null;
      report_status: string | null;
      flag: string | null;
      technique: string | null;
      findings: string | null;
      impression: string | null;
      recommendation: string | null;
      reported_by_name: string | null;
      reported_at: string | null;
      analytes: InboxAnalyte[];
    };

export interface InboxResultDetail extends InboxResult {
  /** Null when the underlying record is no longer there. */
  result: InboxResultContext | null;
}

export type InboxFilter = 'all' | 'unacknowledged' | 'critical' | 'acknowledged';

export interface InboxCounts {
  all: number;
  unacknowledged: number;
  critical: number;
  acknowledged: number;
  critical_pending: number;
}

export interface InboxPage {
  rows: InboxResult[];
  counts: InboxCounts;
}

/** `GET /mobile/doctor/results-inbox?filter=` — hard-scoped server-side to the token owner. */
export async function fetchResultsInbox(filter: InboxFilter = 'unacknowledged'): Promise<InboxPage> {
  const res = await apiClient.get<{ data: InboxResult[]; meta: { counts: InboxCounts } }>(
    doctorEndpoints.resultsInbox,
    { params: { filter: filter === 'all' ? undefined : filter } },
  );
  return { rows: res.data.data, counts: res.data.meta.counts };
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
  provider_id: number | null;
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

export interface DoctorUnreadCounts {
  unread_threads: number;
  unread_messages: number;
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
  /** Read-only. */
  consultation_fee: number | null;
  /** Read-only; XAF/FCFA on this deployment. */
  currency: string | null;
  /** Read-only. */
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
