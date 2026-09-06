/**
 * Front-desk data layer — the RECEPTIONIST'S half of the clinician app.
 *
 * Modelled on `lib/api/doctorQueries.ts`: typed wire shapes, `apiClient`,
 * react-query hooks, and the failure predicates a screen needs to say the
 * true thing. Paths live in `endpoints.ts` (`endpoints.desk`).
 *
 * ── THE CONTRACT THIS IS CODED AGAINST ────────────────────────────────────
 * "Front desk" in the role-dashboards plan (`capability:front_desk`, prefix
 * `/api/mobile/desk`). The backend is being implemented alongside this file,
 * so every shape below is the CONTRACT's shape, not an observed one. Where the
 * contract is silent (the `facility` object, the `status` vocabulary) the
 * types are open and the screens degrade rather than guess.
 *
 *   GET  /home                         → { data: { facility, counts } }
 *   GET  /appointments?date=&status=&provider_id=
 *                                      → { data: DeskAppointment[] }  (facility-wide)
 *   GET  /providers                    → { data: DeskProvider[] }     (posted here)
 *   POST /appointments                 { health_id, scheduled_at, appointment_type, provider_id?, reason? }
 *   PUT  /appointments/{id}            { scheduled_at }
 *   PATCH /appointments/{id}/route     { provider_id }
 *   POST /appointments/{id}/confirm · /check-in · /no-show · /cancel { reason }
 *   POST /patients                     { first_name, last_name, date_of_birth, sex, phone? } → 201
 *                                      409 error_code: duplicate_identity (never bypassed)
 *
 * ── NO SINGLE-ITEM GET ────────────────────────────────────────────────────
 * The contract has none. `useDeskAppointment` therefore DERIVES the record
 * from the day list it was opened from (plus the server's answer to any write
 * this session made), and never fabricates a row.
 *
 * ── WHAT THE FAILURE CODES MEAN ───────────────────────────────────────────
 *   401  provider token missing / expired — sign in again.
 *   403  `error_code: role_forbidden` — the ACCOUNT'S ROLE lacks `front_desk`.
 *        No retry, no consent request can change it (`isRoleForbidden`).
 *   404  `error_code: ENDPOINT_NOT_FOUND` (the finder's global handler for an
 *        unmatched route) — the server does not serve the desk yet.
 *        `error_code: NOT_FOUND` / any other body — a RECORD was not found
 *        (an unknown Health ID, an appointment that is not this facility's).
 *   405  the route exists for another verb only — also "not served".
 *   409  `duplicate_identity` on register; otherwise a STATE conflict (the row
 *        moved on since the book was read — re-read it).
 *   422  refused on its merits (bad datetime, bad transition, missing reason).
 *
 * Rules this module enforces on every screen that uses it:
 *   1. Patients are found by EXACT Health ID only. `useBookDeskAppointment`
 *      refuses to send anything `isPlausibleHealthId` rejects.
 *   2. No hook ever fabricates a row — a failed read is an error state, never
 *      an empty list. Counts come from `/home`, never from the phone.
 *   3. A write's answer is written back into the cache and the lists are
 *      re-read from the server — never an optimistic repaint.
 */
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import { isPlausibleHealthId, normaliseHealthId, toClinicWallClock } from './doctorQueries';
import { isRoleForbidden } from './roleErrors';

// One import for a desk screen: the role predicate and the Health-ID helpers
// travel with the desk hooks (they are only re-exported here, never re-implemented).
export { isRoleForbidden, roleForbiddenRequired } from './roleErrors';
export { isPlausibleHealthId, normaliseHealthId } from './doctorQueries';

const desk = endpoints.desk;

// ═══════════════════════════════════════════════════════════════════════════
// Wire shapes — the contract, verbatim
// ═══════════════════════════════════════════════════════════════════════════

/** The `{ data, meta? }` envelope every desk route answers with. */
export interface DeskEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

/** The token's facility. The contract names the object but not its fields; `{ id, name }` is what the sibling desks carry. */
export interface DeskFacility {
  id: string;
  name: string | null;
}

export interface DeskHomeCounts {
  today_total: number;
  awaiting_confirmation: number;
  checked_in: number;
  no_show: number;
  cancelled: number;
}

/** `GET /mobile/desk/home`. */
export interface DeskHome {
  facility: DeskFacility | null;
  counts: DeskHomeCounts;
}

/** The patient on a book row — a SHORT display name and the Health ID, nothing clinical. */
export interface DeskPatientRef {
  id: string;
  health_id: string | null;
  display_name: string | null;
}

/** A clinician posted at this facility (`GET /providers`), and the `provider` on a row. */
export interface DeskProvider {
  /** `users.id` — a UUID string on this deployment. */
  id: string;
  name: string;
  /** `roles.name`, e.g. `doctor`, `nurse`; null when the account carries none. */
  role: string | null;
}

/**
 * One row of the facility's book.
 *
 * `status` is an OPEN string: the contract does not pin the vocabulary, and
 * this deployment writes the column in several spellings (`booked` /
 * `scheduled`, `checked_in` / `arrived`). Read it through `deskStatusFamily`,
 * never with `===`.
 */
export interface DeskAppointment {
  id: string;
  scheduled_at: string;
  status: string;
  appointment_type: string | null;
  reason: string | null;
  checked_in_at: string | null;
  patient: DeskPatientRef;
  provider: DeskProvider | null;
}

export interface DeskAppointmentsQuery {
  /** `YYYY-MM-DD` — the facility day to read. Required: the book is read a day at a time. */
  date: string;
  /** Optional server-side status filter, in the wire vocabulary (`DESK_STATUS_WIRE`). */
  status?: string;
  /** Optional server-side clinician filter (`users.id`). */
  provider_id?: string;
}

/** `POST /mobile/desk/appointments`. */
export interface BookDeskAppointmentInput {
  /** EXACT Health ID — validated with `isPlausibleHealthId` before anything is sent. */
  health_id: string;
  /** Wall-clock `YYYY-MM-DD HH:MM:SS` (see `toClinicWallClock`). */
  scheduled_at: string;
  appointment_type: string;
  provider_id?: string;
  reason?: string;
}

export type DeskPatientSex = 'male' | 'female';

/** `POST /mobile/desk/patients`. */
export interface RegisterDeskPatientInput {
  first_name: string;
  last_name: string;
  /** `YYYY-MM-DD`. */
  date_of_birth: string;
  sex: DeskPatientSex;
  phone?: string;
}

/**
 * `App\Support\ProviderPatientSummary` — the one shape a professional's app
 * receives when it identifies a patient. Identity only: no contact details
 * beyond what was just entered, no clinical history.
 */
export interface ProviderPatientSummary {
  id: string;
  health_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  sex: string | null;
  blood_group: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Status vocabulary
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The seven states a receptionist reasons about, whatever spelling the column
 * carries. `unknown` is a value nobody has mapped — shown humanised, never
 * hidden, and no desk action is offered on it.
 */
export type DeskStatusFamily =
  | 'awaiting'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'unknown';

/** The families in lifecycle order — the filter chips and the vocabulary maps iterate this. */
export const DESK_STATUS_FAMILIES: readonly Exclude<DeskStatusFamily, 'unknown'>[] = [
  'awaiting',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'no_show',
  'cancelled',
];

function normStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Column or wire spelling → the family. Folds `booked|scheduled|pending|requested`, `checked_in|arrived`, `cancelled|canceled|rescheduled`. */
export function deskStatusFamily(status: string | null | undefined): DeskStatusFamily {
  switch (normStatus(status)) {
    case 'booked':
    case 'scheduled':
    case 'pending':
    case 'requested':
      return 'awaiting';
    case 'confirmed':
      return 'confirmed';
    case 'checked_in':
    case 'arrived':
      return 'checked_in';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'cancelled':
    case 'canceled':
    case 'rescheduled':
      return 'cancelled';
    case 'no_show':
      return 'no_show';
    default:
      return 'unknown';
  }
}

/**
 * The value to send as `status=` for a family — the deployed diary's wire
 * vocabulary (`MobileDoctorScheduleController::WIRE_STATUS`), which the desk
 * routes sit beside. Exported for a caller that wants the server to filter;
 * the book screen filters the day's rows on the phone instead (see
 * `filterDeskAppointments`), so a vocabulary mismatch can never empty the book.
 */
export const DESK_STATUS_WIRE: Record<Exclude<DeskStatusFamily, 'unknown'>, string> = {
  awaiting: 'scheduled',
  confirmed: 'confirmed',
  checked_in: 'arrived',
  in_progress: 'in_progress',
  completed: 'completed',
  cancelled: 'cancelled',
  no_show: 'no_show',
};

/** The provider filter on the book: everyone, the rows nobody is assigned to, or one clinician. */
export type DeskProviderFilter = 'all' | 'unassigned' | { id: string };

/** Pure, phone-side filter over one day's rows. */
export function filterDeskAppointments(
  rows: readonly DeskAppointment[],
  family: DeskStatusFamily | 'all',
  provider: DeskProviderFilter,
): DeskAppointment[] {
  return rows.filter((a) => {
    if (family !== 'all' && deskStatusFamily(a.status) !== family) return false;
    if (provider === 'unassigned') return a.provider === null;
    if (provider !== 'all') return a.provider?.id === provider.id;
    return true;
  });
}

/** Time-first, then by patient name — how a book reads. */
export function sortDeskAppointments(rows: readonly DeskAppointment[]): DeskAppointment[] {
  return [...rows].sort((a, b) => {
    const ta = new Date(a.scheduled_at).getTime();
    const tb = new Date(b.scheduled_at).getTime();
    if (ta !== tb) return (Number.isNaN(ta) ? Infinity : ta) - (Number.isNaN(tb) ? Infinity : tb);
    return (a.patient.display_name ?? '').localeCompare(b.patient.display_name ?? '');
  });
}

/**
 * What the desk may do with a row in its current state — the transitions the
 * writers accept. A button the server would refuse is not offered; a closed
 * row offers nothing and says why.
 */
export interface DeskAbilities {
  confirm: boolean;
  checkIn: boolean;
  noShow: boolean;
  cancel: boolean;
  reschedule: boolean;
  route: boolean;
  /** `completed`, `cancelled` or `no_show` — nothing further can happen here. */
  closed: boolean;
  /** `in_progress` — the clinician has the patient; the desk stays out. */
  withClinician: boolean;
}

export function deskAbilities(a: DeskAppointment): DeskAbilities {
  const f = deskStatusFamily(a.status);
  const open = f === 'awaiting' || f === 'confirmed';
  return {
    confirm: f === 'awaiting',
    checkIn: open,
    noShow: open,
    cancel: open,
    reschedule: open,
    route: open || f === 'checked_in',
    closed: f === 'completed' || f === 'cancelled' || f === 'no_show',
    withClinician: f === 'in_progress',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Failure classification
// ═══════════════════════════════════════════════════════════════════════════

/** The `error_code` the finder's JSON handler or a controller put on the body, else null. */
export function deskErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const body = error.response?.data as { error_code?: unknown } | undefined;
  return typeof body?.error_code === 'string' ? body.error_code : null;
}

/**
 * True when this server does not serve the desk (yet): an unmatched route
 * (`404 ENDPOINT_NOT_FOUND`, or a bodyless 404 from something in front of the
 * app), a verb the route does not take (405), or an explicit 501.
 *
 * A 404 that carries any OTHER server-authored body is a RECORD the app could
 * not find, and must not be dressed up as a missing feature — see
 * `isDeskRecordNotFound`.
 */
export function isNotServed(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === 405 || status === 501) return true;
  if (status !== 404) return false;
  const code = deskErrorCode(error);
  if (code === 'ENDPOINT_NOT_FOUND') return true;
  if (code) return false;
  const body = error.response?.data as { message?: unknown } | undefined;
  return !(typeof body?.message === 'string' && body.message.length > 0);
}

/** A 404 the APP answered: this Health ID / appointment is not here. */
export function isDeskRecordNotFound(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return error.response?.status === 404 && !isNotServed(error);
}

/** `409 duplicate_identity` from `POST /patients` — the person may already hold a Health ID. */
export function isDuplicateIdentity(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return error.response?.status === 409 && deskErrorCode(error) === 'duplicate_identity';
}

/** Any other 409 — the row changed since the book was read (already checked in, already cancelled…). */
export function isStateConflict(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return error.response?.status === 409 && !isDuplicateIdentity(error);
}

export function isValidationFailure(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 422;
}

/**
 * The first message per field from a Laravel 422, keyed by field name — for a
 * form that can put the sentence under the right input. Empty for anything else.
 */
export function deskFieldErrors(error: unknown): Record<string, string> {
  if (!isValidationFailure(error) || !axios.isAxiosError(error)) return {};
  const body = error.response?.data as { errors?: Record<string, unknown> } | undefined;
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(body?.errors ?? {})) {
    const first = Array.isArray(messages) ? messages[0] : messages;
    if (typeof first === 'string' && first) out[field] = first;
  }
  return out;
}

/** The server's own sentence for a failure, else `fallback`. Never a stack, never a raw library string. */
export function deskErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { message?: unknown } | undefined;
    if (typeof body?.message === 'string' && body.message) return body.message;
  }
  return fallback;
}

/** True when retrying cannot change the answer — a refusal is asked exactly once. */
export function isDeskRequestFinal(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403 || status === 404 || status === 405 || status === 501;
}

/** React-query `retry` for every desk read: one retry, none once the answer is final. */
export const deskRetry = (failureCount: number, error: unknown): boolean =>
  !isDeskRequestFinal(error) && failureCount < 1;

// ═══════════════════════════════════════════════════════════════════════════
// Dates
// ═══════════════════════════════════════════════════════════════════════════

const pad2 = (n: number) => String(n).padStart(2, '0');

/** `2026-09-06` from the LOCAL calendar day of `d` — what `?date=` takes. */
export function deskDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** The local calendar day of an ISO instant, or null for nothing / garbage. */
export function deskDayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : deskDay(d);
}

/** `YYYY-MM-DD` + `n` days, in local time. */
export function shiftDeskDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return deskDay();
  d.setDate(d.getDate() + n);
  return deskDay(d);
}

/** Strict `YYYY-MM-DD` that names a real calendar date. */
export function isValidDeskDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * The wall-clock string the writers take. Delegates to the diary's
 * `toClinicWallClock` so the desk and the doctor never disagree about what
 * `14:30` means on the wire (the server timezone is UTC; the digits the
 * receptionist picked are what the book shows back).
 */
export function toDeskWallClock(d: Date): string {
  return toClinicWallClock(d);
}

// ═══════════════════════════════════════════════════════════════════════════
// Transport
// ═══════════════════════════════════════════════════════════════════════════

async function getData<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await apiClient.get<DeskEnvelope<T>>(path, { params });
  return res.data.data;
}

async function postData<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiClient.post<DeskEnvelope<T>>(path, body ?? {});
  return res.data.data;
}

async function putData<T>(path: string, body: unknown): Promise<T> {
  const res = await apiClient.put<DeskEnvelope<T>>(path, body);
  return res.data.data;
}

async function patchData<T>(path: string, body: unknown): Promise<T> {
  const res = await apiClient.patch<DeskEnvelope<T>>(path, body);
  return res.data.data;
}

/** Query-key vocabulary, so writes can invalidate precisely. */
export const deskKeys = {
  all: ['desk'] as const,
  home: ['desk', 'home'] as const,
  providers: ['desk', 'providers'] as const,
  /** Prefix of every day list — invalidated as one. */
  appointmentsAll: ['desk', 'appointments'] as const,
  appointments: (q: DeskAppointmentsQuery) =>
    ['desk', 'appointments', q.date, q.status ?? null, q.provider_id ?? null] as const,
  /**
   * The server's answer to a WRITE this session made on one row. Cache-only:
   * nothing fetches it (there is no single-item GET); `writeBack` fills it.
   */
  appointment: (id: string) => ['desk', 'appointment', id] as const,
  /**
   * The clinician Today screen reads the SAME `/mobile/desk/home` under its own
   * key (`lib/api/deskHomeQueries.ts` → `deskHomeKeys.desk`, a file this one
   * never imports). Invalidated alongside `home` after every write so the
   * Today tile does not show yesterday's count after a check-in.
   */
  todayTile: ['desk-home', 'desk'] as const,
};

type QueryOpts = { enabled?: boolean };

// ═══════════════════════════════════════════════════════════════════════════
// Reads
// ═══════════════════════════════════════════════════════════════════════════

/** `GET /mobile/desk/home` — the day's counts, counted server-side, never on the phone. */
export function useDeskHome(opts: QueryOpts = {}) {
  return useQuery({
    queryKey: deskKeys.home,
    queryFn: () => getData<DeskHome>(desk.home),
    retry: deskRetry,
    staleTime: 30 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/**
 * `GET /mobile/desk/appointments?date=&status=&provider_id=` — one facility day.
 *
 * `status` and `provider_id` go to the server exactly as the contract spells
 * them when given. The book screen passes only `date` and filters on the
 * phone, so every filter shares ONE cached day and the detail screen can
 * derive its row from it.
 */
export function useDeskAppointments(query: DeskAppointmentsQuery, opts: QueryOpts = {}) {
  const params: Record<string, unknown> = { date: query.date };
  if (query.status) params.status = query.status;
  if (query.provider_id) params.provider_id = query.provider_id;
  return useQuery({
    queryKey: deskKeys.appointments(query),
    queryFn: async () => sortDeskAppointments(await getData<DeskAppointment[]>(desk.appointments, params)),
    retry: deskRetry,
    staleTime: 30 * 1000,
    enabled: (opts.enabled ?? true) && isValidDeskDay(query.date),
  });
}

/** `GET /mobile/desk/providers` — the clinicians a row can be routed to. */
export function useDeskProviders(opts: QueryOpts = {}) {
  return useQuery({
    queryKey: deskKeys.providers,
    queryFn: () => getData<DeskProvider[]>(desk.providers),
    retry: deskRetry,
    staleTime: 5 * 60 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/**
 * ONE appointment, derived — the contract has no single-item GET.
 *
 * Sources, in order:
 *   1. the day list for `date` (the day the row was opened from; today when
 *      the link carried none) — the freshest server read of the row;
 *   2. the server's answer to a write this session made (`deskKeys.appointment`),
 *      which is what keeps a row visible after it was MOVED to another day
 *      and left the list it came from.
 *
 * When the written copy names a different day than `date`, the list read
 * follows the row to its new day, so pull-to-refresh re-reads where it now is.
 */
export function useDeskAppointment(id: string | undefined, date?: string | null) {
  const written = useQuery<DeskAppointment | null>({
    queryKey: deskKeys.appointment(id ?? ''),
    // Never runs (`enabled: false`); the entry is only ever filled by `writeBack`.
    queryFn: () => Promise.resolve(null),
    enabled: false,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });

  const writtenDay = deskDayOf(written.data?.scheduled_at ?? null);
  const day = writtenDay ?? (date && isValidDeskDay(date) ? date : deskDay());
  const list = useDeskAppointments({ date: day }, { enabled: !!id });

  const fromList = id ? (list.data ?? []).find((a) => a.id === id) : undefined;
  const appointment: DeskAppointment | null = fromList ?? written.data ?? null;

  return {
    appointment,
    /** The day whose list this row is being read from. */
    day,
    list,
    refetch: list.refetch,
    isPending: list.isPending && appointment === null,
    isFetching: list.isFetching,
    /** The list read failed AND nothing is on screen for this row. */
    isError: list.isError && appointment === null,
    /** The list read failed while a copy of the row is still on screen. */
    isStale: list.isError && appointment !== null,
    error: list.error,
    /** The day loaded and this row is not in it (and no write this session knows it). */
    notInDay: list.isSuccess && appointment === null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Writes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * After a write: keep the server's answer, patch the row wherever a day list
 * already holds it (no flash of the old status), then re-read the lists and
 * the counts from the server. Nothing is guessed.
 */
function useWriteBack() {
  const qc = useQueryClient();
  return async (a: DeskAppointment) => {
    qc.setQueryData<DeskAppointment | null>(deskKeys.appointment(a.id), a);
    qc.setQueriesData<DeskAppointment[]>({ queryKey: deskKeys.appointmentsAll }, (rows) =>
      rows ? rows.map((r) => (r.id === a.id ? a : r)) : rows,
    );
    await Promise.all([
      qc.invalidateQueries({ queryKey: deskKeys.appointmentsAll }),
      qc.invalidateQueries({ queryKey: deskKeys.home }),
      qc.invalidateQueries({ queryKey: deskKeys.todayTile }),
    ]);
  };
}

/** `POST /mobile/desk/appointments/{id}/confirm`. */
export function useConfirmDeskAppointment() {
  const writeBack = useWriteBack();
  return useMutation({
    mutationFn: (id: string) => postData<DeskAppointment>(desk.confirmAppointment(id)),
    onSuccess: writeBack,
  });
}

/** `POST /mobile/desk/appointments/{id}/check-in` — opens the visit at this facility under the signed-in receptionist. */
export function useCheckInDeskAppointment() {
  const writeBack = useWriteBack();
  return useMutation({
    mutationFn: (id: string) => postData<DeskAppointment>(desk.checkInAppointment(id)),
    onSuccess: writeBack,
  });
}

/** `POST /mobile/desk/appointments/{id}/no-show`. */
export function useNoShowDeskAppointment() {
  const writeBack = useWriteBack();
  return useMutation({
    mutationFn: (id: string) => postData<DeskAppointment>(desk.noShowAppointment(id)),
    onSuccess: writeBack,
  });
}

/** `POST /mobile/desk/appointments/{id}/cancel { reason }` — the reason is required by the contract. */
export function useCancelDeskAppointment() {
  const writeBack = useWriteBack();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => {
      const trimmed = reason.trim();
      if (!trimmed) return Promise.reject(new Error('A cancellation reason is required.'));
      return postData<DeskAppointment>(desk.cancelAppointment(id), { reason: trimmed });
    },
    onSuccess: writeBack,
  });
}

/** `PUT /mobile/desk/appointments/{id} { scheduled_at }` — moves the appointment outright. */
export function useRescheduleDeskAppointment() {
  const writeBack = useWriteBack();
  return useMutation({
    mutationFn: ({ id, when }: { id: string; when: Date }) =>
      putData<DeskAppointment>(desk.appointment(id), { scheduled_at: toDeskWallClock(when) }),
    onSuccess: writeBack,
  });
}

/** `PATCH /mobile/desk/appointments/{id}/route { provider_id }` — assigns a clinician. */
export function useRouteDeskAppointment() {
  const writeBack = useWriteBack();
  return useMutation({
    mutationFn: ({ id, providerId }: { id: string; providerId: string }) =>
      patchData<DeskAppointment>(desk.routeAppointment(id), { provider_id: providerId }),
    onSuccess: writeBack,
  });
}

/**
 * `POST /mobile/desk/appointments` — book by EXACT Health ID.
 *
 * Refuses to send a partial ID: the server is never asked a prefix or a name.
 * The `health_id` is normalised (trimmed, upper-cased, inner spaces removed)
 * exactly as the lookup normalises it.
 */
export function useBookDeskAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BookDeskAppointmentInput) => {
      if (!isPlausibleHealthId(input.health_id)) {
        return Promise.reject(new Error('A full Health ID is required to book.'));
      }
      const body: BookDeskAppointmentInput = {
        health_id: normaliseHealthId(input.health_id),
        scheduled_at: input.scheduled_at,
        appointment_type: input.appointment_type,
      };
      if (input.provider_id) body.provider_id = input.provider_id;
      const reason = input.reason?.trim();
      if (reason) body.reason = reason;
      return postData<DeskAppointment>(desk.appointments, body);
    },
    onSuccess: async (a) => {
      qc.setQueryData<DeskAppointment | null>(deskKeys.appointment(a.id), a);
      await Promise.all([
        qc.invalidateQueries({ queryKey: deskKeys.appointmentsAll }),
        qc.invalidateQueries({ queryKey: deskKeys.home }),
        qc.invalidateQueries({ queryKey: deskKeys.todayTile }),
      ]);
    },
  });
}

/**
 * `POST /mobile/desk/patients` → 201 `ProviderPatientSummary`, through
 * `PatientIdentityService` on the server. A `409 duplicate_identity` is a
 * decision, not an obstacle: the person may already hold a Health ID, and the
 * screen offers the exact lookup instead. Nothing here retries or bypasses it.
 */
export function useRegisterDeskPatient() {
  return useMutation({
    mutationFn: (input: RegisterDeskPatientInput) => {
      const body: RegisterDeskPatientInput = {
        first_name: input.first_name.trim(),
        last_name: input.last_name.trim(),
        date_of_birth: input.date_of_birth,
        sex: input.sex,
      };
      const phone = input.phone?.trim();
      if (phone) body.phone = phone;
      return postData<ProviderPatientSummary>(desk.patients, body);
    },
  });
}
