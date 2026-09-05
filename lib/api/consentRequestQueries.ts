/**
 * Consent requests — the clinician ASKING a patient for access to their record.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE GAP THIS CLOSES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The chart refuses a patient the clinician has no relationship with:
 *
 *     403 { error_code: 'NO_CLINICAL_RELATIONSHIP',
 *           required_action: 'request_consent',
 *           message: '… Ask the patient to grant your facility access …' }
 *
 * and until this module there was no way to ask. `consent_requests` rows could
 * only be created by a service no route reached; the patient's inbox
 * (`GET /mobile/consent-requests` — see `lib/api/privacyQueries.ts`) was
 * structurally always empty, and the chart's fifth access basis,
 * `consent_grant`, was unreachable. This is the request half.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE CONTRACT
 * ─────────────────────────────────────────────────────────────────────────
 *   GET  /mobile/doctor/consent-requests/options     the purposes, the scopes,
 *                                                    and the limits — so this
 *                                                    file does not hard code a
 *                                                    vocabulary that can drift.
 *   GET  /mobile/doctor/consent-requests?status=     this facility's outbox
 *   POST /mobile/doctor/consent-requests             ask (201)
 *   GET  /mobile/doctor/consent-requests/{id}        one ask
 *   POST /mobile/doctor/consent-requests/{id}/withdraw
 * All behind a provider bearer token.
 *
 * The paths are spelled out here rather than in `endpoints.ts`, which is owned
 * elsewhere — the same choice `lib/api/prescribingQueries.ts` made.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────
 * 1. It never searches for a patient. A request names its patient by EXACT
 *    Health ID, normalised and refused client-side unless it is plausible, so
 *    the server is never sent a prefix, a name or a wildcard. Patient
 *    enumeration is forbidden platform-wide.
 * 2. It never sends a facility. The facility on the request is the one on the
 *    clinician's token, resolved server-side from `$request->attributes`. There
 *    is no `facility_id` field in `CreateConsentRequestPayload` and there must
 *    never be one — a facility a caller can name is a facility a caller can
 *    grant themselves.
 * 3. It never reports an ask as sent unless the server said so. A POST that got
 *    NO answer may still have landed and created a request the patient will
 *    see; `askOutcomeIsUncertain()` lets the screen say exactly that rather
 *    than inviting a second ask that the one-open-request rule would refuse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BACKEND STATUS
 * ─────────────────────────────────────────────────────────────────────────
 * `routes/mobile_consent_requests.php` exists on the server but its one-line
 * registration in `AppServiceProvider::boot()` is owned by another agent and
 * is being reported rather than written. Until that line lands every path here
 * answers 404. Nothing retries it and nothing fakes a result:
 * `isConsentRequestSurfaceUnavailable()` lets the screen say so out loud.
 */
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { HEALTH_ID_MIN_LENGTH, isPlausibleHealthId, normaliseHealthId } from './doctorQueries';

// The Health ID rules are the platform's, not this module's — they are defined
// once in `doctorQueries` and re-exported so a screen needs one import.
export { HEALTH_ID_MIN_LENGTH, isPlausibleHealthId, normaliseHealthId };

// ═══════════════════════════════════════════════════════════════════════════
// Endpoints
// ═══════════════════════════════════════════════════════════════════════════

export const CONSENT_REQUEST_API_PREFIX = '/mobile/doctor/consent-requests';

export const consentRequestEndpoints = {
  /** GET — the accepted purposes, scopes and limits. */
  options: `${CONSENT_REQUEST_API_PREFIX}/options`,
  /** GET — this facility's outbox. POST — raise a new ask. */
  root: CONSENT_REQUEST_API_PREFIX,
  /** GET — one ask this facility raised. */
  one: (id: string) => `${CONSENT_REQUEST_API_PREFIX}/${encodeURIComponent(id)}`,
  /** POST — take an ask back. */
  withdraw: (id: string) => `${CONSENT_REQUEST_API_PREFIX}/${encodeURIComponent(id)}/withdraw`,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Limits — the server's validator, restated so a typed form never 422s
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fallbacks only. `useConsentRequestOptions()` returns the server's own
 * numbers and the screen should prefer those; these keep the form usable on
 * the first paint and on a server that does not serve `/options` yet.
 */
export const LIMITS = {
  justification: 1000,
  /** How long a GRANT may be asked for: an hour to thirty days. */
  grantHoursMin: 1,
  grantHoursMax: 720,
  /** How long the ASK itself stands unanswered: an hour to seven days. */
  askHoursMin: 1,
  askHoursMax: 168,
  askHoursDefault: 72,
} as const;

/**
 * The durations a phone offers, in hours. A free-number field for "how long
 * should a facility be able to read my record" is a worse question than a
 * short list of honest answers, and every value here is inside the server's
 * 1..720 range.
 */
export const GRANT_DURATION_CHOICES = [24, 72, 168, 720] as const;
export type GrantDurationChoice = (typeof GRANT_DURATION_CHOICES)[number];

/** i18n keys for those choices, so the screen owns no plural logic. */
export const GRANT_DURATION_KEY: Record<GrantDurationChoice, string> = {
  24: 'duration.h24',
  72: 'duration.d3',
  168: 'duration.d7',
  720: 'duration.d30',
};

/** English fallbacks for the keys above. */
export const GRANT_DURATION_EN: Record<GrantDurationChoice, string> = {
  24: '24 hours',
  72: '3 days',
  168: '7 days',
  720: '30 days',
};

// ═══════════════════════════════════════════════════════════════════════════
// Wire shapes
// ═══════════════════════════════════════════════════════════════════════════

/** One entry of the server's own vocabulary: the value it stores, already labelled. */
export interface ConsentVocabularyItem {
  value: string;
  label: string;
}

export interface ConsentRequestOptions {
  purposes: ConsentVocabularyItem[];
  scopes: ConsentVocabularyItem[];
  durationHours: { min: number; max: number };
  askHours: { min: number; max: number; default: number };
}

/**
 * The status a request is in. `pending_patient_approval` is the server's own
 * spelling of "open"; `pending` is accepted because the backend's
 * OPEN_STATUSES list covers both. Everything else is TERMINAL — nothing moves
 * a decided request back to open, so a screen may treat these as final.
 */
export type ConsentRequestStatus =
  | 'pending'
  | 'pending_patient_approval'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'withdrawn';

export interface FacilityConsentRequest {
  id: string;
  status: ConsentRequestStatus | (string & {});
  /** The server's own localised label for that status. Never re-derived here. */
  status_label: string | null;
  is_open: boolean;
  patient_id: string | null;
  patient_health_id: string | null;
  patient_name: string | null;
  purpose: string | null;
  purpose_label: string | null;
  justification: string | null;
  requested_scope: string[];
  /** Labels in the same order as `requested_scope`. */
  scope_labels: string[];
  duration_minutes: number | null;
  duration_hours: number | null;
  /** When the ASK lapses if the patient never answers. */
  expires_at: string | null;
  decided_at: string | null;
  facility_name: string | null;
  /** When the GRANT runs out — present only once approved. */
  grant_expires_at: string | null;
  created_at: string | null;
}

/**
 * What POST takes.
 *
 * There is deliberately no `facility_id` and no `requesting_user_id`: both come
 * from the bearer token server-side. Adding either would be adding a field a
 * caller could use to raise a request in another facility's name.
 */
export interface CreateConsentRequestPayload {
  health_id: string;
  purpose: string;
  scope: string[];
  duration_hours: number;
  expires_in_hours?: number;
  justification?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Defensive parsing
// ═══════════════════════════════════════════════════════════════════════════

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `{ data: X }` → `X`. Anything else passes through untouched. */
function unwrap(body: unknown): unknown {
  return isRecord(body) && 'data' in body ? body.data : body;
}

function str(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function int(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter((v): v is string => v !== null) : [];
}

/** Thrown when a 2xx body cannot be read as the thing it was supposed to be. */
export class UnreadableResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableResponseError';
  }
}

function parseVocabulary(raw: unknown): ConsentVocabularyItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!isRecord(row)) return null;
      const value = str(row.value);
      if (!value) return null;
      // A value with no label still renders — as its own value — rather than
      // vanishing from a list the clinician has to choose from.
      return { value, label: str(row.label) ?? value };
    })
    .filter((v): v is ConsentVocabularyItem => v !== null);
}

function parseOptions(raw: unknown): ConsentRequestOptions {
  const row = isRecord(raw) ? raw : {};
  const duration = isRecord(row.duration_hours) ? row.duration_hours : {};
  const ask = isRecord(row.expires_in_hours) ? row.expires_in_hours : {};

  return {
    purposes: parseVocabulary(row.purposes),
    scopes: parseVocabulary(row.scopes),
    durationHours: {
      min: int(duration.min) ?? LIMITS.grantHoursMin,
      max: int(duration.max) ?? LIMITS.grantHoursMax,
    },
    askHours: {
      min: int(ask.min) ?? LIMITS.askHoursMin,
      max: int(ask.max) ?? LIMITS.askHoursMax,
      default: int(ask.default) ?? LIMITS.askHoursDefault,
    },
  };
}

function parseRequest(raw: unknown): FacilityConsentRequest {
  if (!isRecord(raw)) {
    throw new UnreadableResponseError('The server did not return an access request.');
  }
  const id = str(raw.id);
  if (!id) {
    // A request with no id cannot be withdrawn or followed up, and a row the
    // screen cannot act on is worse than an error it can explain.
    throw new UnreadableResponseError('The server returned an access request with no identifier.');
  }
  const scope = strList(raw.requested_scope);
  const labels = strList(raw.scope_labels);

  return {
    id,
    status: str(raw.status) ?? 'pending_patient_approval',
    status_label: str(raw.status_label),
    // Trust the server's own flag; fall back to the two open spellings.
    is_open:
      typeof raw.is_open === 'boolean'
        ? raw.is_open
        : raw.status === 'pending' || raw.status === 'pending_patient_approval',
    patient_id: str(raw.patient_id),
    patient_health_id: str(raw.patient_health_id),
    patient_name: str(raw.patient_name),
    purpose: str(raw.purpose),
    purpose_label: str(raw.purpose_label),
    justification: str(raw.justification),
    requested_scope: scope,
    // Never leave a scope unlabelled: an unlabelled row would read as one
    // fewer thing being asked for than actually is.
    scope_labels: labels.length === scope.length ? labels : scope,
    duration_minutes: int(raw.duration_minutes),
    duration_hours: int(raw.duration_hours),
    expires_at: str(raw.expires_at),
    decided_at: str(raw.decided_at),
    facility_name: str(raw.facility_name),
    grant_expires_at: str(raw.grant_expires_at),
    created_at: str(raw.created_at),
  };
}

/**
 * A list body → rows. Anything unreadable THROWS rather than resolving to `[]`:
 * an unreadable outbox rendered as an empty one tells a clinician they have
 * asked nobody, which is a different and much worse claim than "not loaded".
 */
function parseList(body: unknown): FacilityConsentRequest[] {
  let rows: unknown = unwrap(body);
  if (!Array.isArray(rows)) rows = unwrap(rows);
  if (!Array.isArray(rows)) {
    throw new UnreadableResponseError('The access-request list could not be read.');
  }
  return rows.map(parseRequest);
}

// ═══════════════════════════════════════════════════════════════════════════
// Failure classification
// ═══════════════════════════════════════════════════════════════════════════

/**
 * True when the server does not serve this surface at all: a missing route
 * (404 with no `error` code of ours), an explicit not-implemented, or a token
 * it will not accept on a provider route.
 *
 * A 404 from POST is ambiguous over the wire — "no such route" and "no such
 * patient" share a status — so the body is read: our own 404 carries
 * `error: 'PATIENT_NOT_FOUND'`, and a bare 404 does not.
 */
export function isConsentRequestSurfaceUnavailable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === 501 || status === 401) return true;
  if (status === 404) return errorCode(error) === null;
  return false;
}

/** True when the Health ID matched no patient. */
export function isPatientNotFound(error: unknown): boolean {
  return errorCode(error) === 'PATIENT_NOT_FOUND';
}

export type ConsentRequestConflict =
  /** This facility already has an open ask with this patient. */
  | { code: 'REQUEST_ALREADY_PENDING'; message: string | null; request: FacilityConsentRequest | null }
  /** There is nothing to ask for — a live grant already covers this facility. */
  | { code: 'ALREADY_GRANTED'; message: string | null; grantExpiresAt: string | null }
  /** The request has already been decided; approve/deny/withdraw are one-way. */
  | { code: 'NOT_OPEN'; message: string | null };

/**
 * The three 409s this surface answers with, told apart.
 *
 * `NOT_OPEN` is raised by the service rather than the controller, so it
 * arrives through the app's global JSON error handler as
 * `{ error_code: 'HTTP_ERROR' }` — the status plus the absence of one of our
 * own codes is what identifies it.
 */
export function consentRequestConflict(error: unknown): ConsentRequestConflict | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null;

  const body = isRecord(error.response?.data) ? error.response.data : {};
  const message = str(body.message);

  switch (str(body.error)) {
    case 'REQUEST_ALREADY_PENDING': {
      let request: FacilityConsentRequest | null = null;
      try {
        request = body.data ? parseRequest(body.data) : null;
      } catch {
        request = null;
      }
      return { code: 'REQUEST_ALREADY_PENDING', message, request };
    }
    case 'ALREADY_GRANTED':
      return { code: 'ALREADY_GRANTED', message, grantExpiresAt: str(body.expires_at) };
    default:
      return { code: 'NOT_OPEN', message };
  }
}

/**
 * THE MOST IMPORTANT PREDICATE IN THIS FILE.
 *
 * True when the ask got NO answer at all — a timeout, a dropped connection.
 * The request may or may not have been created, and the honest thing is to say
 * so. "Failed" invites a second tap that the one-open-request rule will refuse
 * with a confusing 409; "sent" invites a clinician to wait on a request that
 * may not exist. Only a real HTTP status is evidence either way.
 */
export function askOutcomeIsUncertain(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return error.response === undefined;
}

/** The server's own message, when it sent one. Never a stack. */
export function consentRequestErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const body = isRecord(error.response?.data) ? error.response.data : undefined;
    const message = body ? str(body.message) : null;
    if (message) return message;
  }
  if (error instanceof UnreadableResponseError) return error.message;
  return fallback;
}

/** Our own `error` code from a response body, or null. */
function errorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const body = isRecord(error.response?.data) ? error.response.data : undefined;
  return body ? str(body.error) : null;
}

/** One retry, and none at all when the route is simply not there. */
const consentRetry = (failureCount: number, error: unknown): boolean =>
  !isConsentRequestSurfaceUnavailable(error) && failureCount < 1;

// ═══════════════════════════════════════════════════════════════════════════
// Query keys
// ═══════════════════════════════════════════════════════════════════════════

export const consentRequestKeys = {
  all: ['doctor', 'consent-requests'] as const,
  options: ['doctor', 'consent-requests', 'options'] as const,
  list: (status: string) => ['doctor', 'consent-requests', 'list', status] as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// Requests
// ═══════════════════════════════════════════════════════════════════════════

/** `GET /options` — the server's vocabulary and limits. */
export function useConsentRequestOptions(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: consentRequestKeys.options,
    queryFn: async () => {
      const res = await apiClient.get<unknown>(consentRequestEndpoints.options);
      return parseOptions(unwrap(res.data));
    },
    retry: consentRetry,
    enabled: options.enabled ?? true,
    // A closed vocabulary changes with a deploy, not with a shift.
    staleTime: 60 * 60 * 1000,
  });
}

/** `GET /` — this facility's outbox. `status` is 'open' | a terminal status | ''. */
export function useFacilityConsentRequests(status = '', options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: consentRequestKeys.list(status),
    queryFn: async () => {
      const res = await apiClient.get<unknown>(consentRequestEndpoints.root, {
        params: status ? { status } : undefined,
      });
      return parseList(res.data);
    },
    retry: consentRetry,
    enabled: options.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

/** `POST /` — ask the patient. */
export async function createConsentRequest(
  payload: CreateConsentRequestPayload,
): Promise<FacilityConsentRequest> {
  const healthId = normaliseHealthId(payload.health_id);
  if (!isPlausibleHealthId(healthId)) {
    // Belt and braces: a partial ID must never reach the wire, where it would
    // read as an enumeration attempt rather than a typo.
    throw new Error('A full Health ID is required to ask for access.');
  }
  if (payload.scope.length === 0) {
    throw new Error('At least one part of the record has to be asked for.');
  }
  const res = await apiClient.post<unknown>(consentRequestEndpoints.root, {
    ...payload,
    health_id: healthId,
  });
  return parseRequest(unwrap(res.data));
}

/**
 * Raise an access request.
 *
 * `retry: false` is deliberate and non-negotiable. The endpoint carries no
 * idempotency key, and a silent retry of a POST that actually landed would
 * either create a second ask or — because of the one-open-request rule — come
 * back as a 409 that looks like a failure for a request the patient can
 * already see. A clinician pressing the button again after reading an explicit
 * failure is a decision; a library doing it is a bug report.
 */
export function useCreateConsentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createConsentRequest,
    retry: false,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: consentRequestKeys.all });
      // A granted request changes what the chart will answer, so the chart's
      // own cache must not keep serving the refusal. A literal prefix is used
      // so this module owns no part of `doctorKeys`.
      await qc.invalidateQueries({ queryKey: ['doctor', 'patients'] });
    },
  });
}

/** `POST /{id}/withdraw` — take the ask back. */
export function useWithdrawConsentRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post<unknown>(consentRequestEndpoints.withdraw(id));
      return parseRequest(unwrap(res.data));
    },
    retry: false,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: consentRequestKeys.all });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Presentation helpers (no fetching, no i18n — the screen owns its wording)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Whole hours until an ISO instant, or null when there is no date or it has
 * already passed. Used for "this ask lapses in 47 hours", never for a claim
 * about a date the server did not send.
 */
export function hoursUntil(iso: string | null, now: Date = new Date()): number | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  const hours = Math.floor((when.getTime() - now.getTime()) / 3_600_000);
  return hours > 0 ? hours : null;
}

/** True when a status can still change by itself. Terminal states cannot. */
export function isOpenStatus(status: string): boolean {
  return status === 'pending' || status === 'pending_patient_approval';
}

/**
 * The tone a `StatusBadge` should carry. Kept here rather than in the screen so
 * the outbox and any future consent list agree without importing each other.
 */
export function statusTone(status: string): 'pending' | 'normal' | 'critical' | 'info' {
  if (isOpenStatus(status)) return 'pending';
  if (status === 'approved') return 'normal';
  if (status === 'denied') return 'critical';
  return 'info';
}
