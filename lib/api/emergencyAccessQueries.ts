/**
 * Break-glass data layer — the one door that opens without the patient's
 * permission, and everything that makes that survivable.
 *
 * Modelled on `lib/api/prescribingQueries.ts`: typed wire shapes, `apiClient`,
 * react-query hooks, endpoint paths spelled out here rather than in
 * `endpoints.ts` (owned elsewhere).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE CONTRACT THIS CODES AGAINST
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   POST /mobile/doctor/emergency-access
 *        { patient, reason, acknowledged } → 201 { data:{grant,profile}, meta }
 *        409-ish refusals it can answer with, all deliberate:
 *          422 the reason is missing or too short, or nothing was acknowledged
 *          404 no record matches that Health ID
 *          423 the patient revoked an earlier override; locked, escalate
 *          429 the 24h cap was reached (3 per patient, 10 per clinician)
 *          503 the audit could not be written, so nothing was opened
 *   GET  /mobile/doctor/emergency-access            grants held right now
 *   GET  /mobile/doctor/emergency-access/{id}       one grant's standing
 *   GET  /mobile/doctor/emergency-access/{id}/profile
 *        the emergency profile while the grant is live; 403 once it is not
 *
 *   GET  /mobile/emergency-access                   (patient token) their log
 *   POST /mobile/emergency-access/{id}/revoke       (patient token) close it
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 1. **It never retries an override.** Every other mutation in this app can be
 *    retried on a network blip; this one cannot. A POST that got no answer may
 *    already have opened a grant, notified the patient and created a review
 *    case — retrying it silently doubles all three. `openOutcomeIsUncertain()`
 *    exists so the screen can say "we do not know whether it opened, check
 *    your held grants" instead of guessing.
 * 2. **It never treats a 403 as a reason to break glass.** Nothing here is
 *    called from an error handler. Break-glass is a deliberate act a clinician
 *    navigates to; a fallback that fires on a refusal would turn the refusal
 *    into a speed bump.
 * 3. **It never fabricates a profile.** An unreadable response is an error,
 *    never an empty allergy list — an allergy section that renders empty
 *    because of a parse failure reads, to someone about to induce, as "no
 *    known allergies".
 * 4. **It never searches.** The patient is named by an EXACT Health ID.
 */
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { isPlausibleHealthId, normaliseHealthId } from './doctorQueries';

export { isPlausibleHealthId, normaliseHealthId };

// ═══════════════════════════════════════════════════════════════════════════
// Endpoints
// ═══════════════════════════════════════════════════════════════════════════

export const emergencyAccessEndpoints = {
  /** POST — break the glass. GET — the grants this clinician holds. */
  breakGlass: '/mobile/doctor/emergency-access',
  /** GET — one grant's standing (metadata only, readable after expiry). */
  grant: (id: string) => `/mobile/doctor/emergency-access/${id}`,
  /** GET — the emergency profile, while the grant is live. */
  grantProfile: (id: string) => `/mobile/doctor/emergency-access/${id}/profile`,
  /** GET — the PATIENT's own view of every override on their record. */
  patientLog: '/mobile/emergency-access',
  /** POST — the patient closes a live override. */
  patientRevoke: (id: string) => `/mobile/emergency-access/${id}/revoke`,
} as const;

export const emergencyAccessKeys = {
  all: ['emergency-access'] as const,
  held: ['emergency-access', 'held'] as const,
  grant: (id: string) => ['emergency-access', 'grant', id] as const,
  profile: (id: string) => ['emergency-access', 'profile', id] as const,
  patientLog: ['emergency-access', 'patient-log'] as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// The rules, restated so the phone refuses what the server would reject
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `EmergencyAccessService::MIN_REASON_LENGTH`. Restated here so a clinician
 * never loses a typed account to a 422 — not so the phone can be the only
 * thing enforcing it. The server enforces it too.
 */
export const MIN_REASON_LENGTH = 20;
export const MAX_REASON_LENGTH = 2000;

/** `EmergencyAccessService::GRANT_TTL_HOURS` — for wording, not for logic. */
export const GRANT_TTL_HOURS = 4;

/** Is this enough of an account to send? Trimmed, so spaces are not a reason. */
export function isReasonSufficient(reason: string): boolean {
  return reason.trim().length >= MIN_REASON_LENGTH;
}

/** Characters still needed before the reason can be sent. */
export function reasonShortfall(reason: string): number {
  return Math.max(0, MIN_REASON_LENGTH - reason.trim().length);
}

// ═══════════════════════════════════════════════════════════════════════════
// Wire shapes
// ═══════════════════════════════════════════════════════════════════════════

export type EmergencyGrantState = 'active' | 'expired' | 'revoked';

/** The grant itself — metadata only. Never clinical content. */
export interface EmergencyGrant {
  id: string;
  patient_id: string | null;
  patient_health_id: string | null;
  patient_name: string | null;
  /** Echoed from the event, which took it from the token — never from us. */
  facility_id: string | null;
  reason: string;
  opened_at: string | null;
  expires_at: string | null;
  /** Server-computed at the moment of the response; see `secondsLeft()`. */
  expires_in_seconds: number;
  active: boolean;
  state: EmergencyGrantState;
  revoked_at: string | null;
  revoked_by: string | null;
  is_repeat: boolean;
  patient_notified_at: string | null;
  records_viewed: string[];
  ttl_hours: number;
}

export interface EmergencyAllergy {
  substance: string | null;
  severity: string | null;
  status: string | null;
}

export interface EmergencyCondition {
  code: string | null;
  code_system: string | null;
  display_name: string | null;
}

export interface EmergencyContact {
  name?: string | null;
  relationship?: string | null;
  phone?: string | null;
}

/**
 * What break-glass actually opens: the emergency profile and nothing else.
 * No notes, no encounters, no prescription history, no results, no billing —
 * that boundary is the guardrail, not an oversight.
 */
export interface EmergencyProfile {
  identity: {
    health_id: string | null;
    first_name: string | null;
    last_name: string | null;
    sex: string | null;
    date_of_birth: string | null;
    blood_group: string | null;
  };
  emergency_contact: EmergencyContact | null;
  allergies: EmergencyAllergy[];
  chronic_conditions: EmergencyCondition[];
}

export interface BreakGlassMeta {
  /** `granted` opened a new one; `reused` handed back one already held. */
  status: 'granted' | 'reused';
  /** This clinician had already broken glass on this patient within 24h. */
  repeat: boolean;
  /** False means the alert did not send — the screen must say so out loud. */
  patient_notified: boolean;
  prior_grants_24h: number;
}

export interface BreakGlassResult {
  grant: EmergencyGrant;
  profile: EmergencyProfile;
  meta: BreakGlassMeta;
}

export interface BreakGlassRequest {
  /** An EXACT Health ID (or patient uuid). Never a partial, never a name. */
  patient: string;
  /** Free text, the clinician's own words. Required, and kept verbatim. */
  reason: string;
  /** The friction. The server refuses the call without it. */
  acknowledged: true;
}

/** One override as the PATIENT sees it. */
export interface PatientEmergencyEvent {
  id: string;
  state: EmergencyGrantState;
  active: boolean;
  reason: string;
  clinician_id: string | null;
  clinician_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  opened_at: string | null;
  expires_at: string | null;
  expires_in_seconds: number;
  revoked_at: string | null;
  revoked_by: string | null;
  is_repeat: boolean;
  notified_at: string | null;
  records_viewed: string[];
  read_count: number;
  can_revoke: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Parsing — an unreadable answer is an error, never an empty profile
// ═══════════════════════════════════════════════════════════════════════════

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const bool = (v: unknown): boolean => v === true;

function parseGrant(raw: unknown): EmergencyGrant {
  const g = raw as Record<string, unknown> | null;
  const id = g ? str(g.id) : null;
  if (!id) throw new Error('emergency grant response had no id');

  const state = g?.state;
  return {
    id,
    patient_id: str(g?.patient_id),
    patient_health_id: str(g?.patient_health_id),
    patient_name: str(g?.patient_name),
    facility_id: str(g?.facility_id),
    reason: str(g?.reason) ?? '',
    opened_at: str(g?.opened_at),
    expires_at: str(g?.expires_at),
    expires_in_seconds: num(g?.expires_in_seconds),
    active: bool(g?.active),
    state: state === 'active' || state === 'expired' || state === 'revoked' ? state : 'expired',
    revoked_at: str(g?.revoked_at),
    revoked_by: str(g?.revoked_by),
    is_repeat: bool(g?.is_repeat),
    patient_notified_at: str(g?.patient_notified_at),
    records_viewed: Array.isArray(g?.records_viewed)
      ? (g.records_viewed as unknown[]).filter((v): v is string => typeof v === 'string')
      : [],
    ttl_hours: num(g?.ttl_hours) || GRANT_TTL_HOURS,
  };
}

function parseProfile(raw: unknown): EmergencyProfile {
  const p = raw as Record<string, unknown> | null;
  const identity = (p?.identity ?? null) as Record<string, unknown> | null;

  // Identity is the spine: without it there is nothing to show and nothing
  // safe to act on, so this throws rather than rendering a blank card.
  if (!identity) throw new Error('emergency profile response had no identity');

  const contact = (p?.emergency_contact ?? null) as Record<string, unknown> | null;

  return {
    identity: {
      health_id: str(identity.health_id),
      first_name: str(identity.first_name),
      last_name: str(identity.last_name),
      sex: str(identity.sex),
      date_of_birth: str(identity.date_of_birth),
      blood_group: str(identity.blood_group),
    },
    emergency_contact: contact
      ? {
          name: str(contact.name),
          relationship: str(contact.relationship),
          phone: str(contact.phone),
        }
      : null,
    allergies: Array.isArray(p?.allergies)
      ? (p.allergies as unknown[]).map((a) => {
          const r = a as Record<string, unknown>;
          return { substance: str(r?.substance), severity: str(r?.severity), status: str(r?.status) };
        })
      : [],
    chronic_conditions: Array.isArray(p?.chronic_conditions)
      ? (p.chronic_conditions as unknown[]).map((c) => {
          const r = c as Record<string, unknown>;
          return {
            code: str(r?.code),
            code_system: str(r?.code_system),
            display_name: str(r?.display_name),
          };
        })
      : [],
  };
}

function parseBreakGlass(raw: unknown): BreakGlassResult {
  const body = raw as Record<string, unknown> | null;
  const data = (body?.data ?? null) as Record<string, unknown> | null;
  const meta = (body?.meta ?? null) as Record<string, unknown> | null;

  return {
    grant: parseGrant(data?.grant),
    profile: parseProfile(data?.profile),
    meta: {
      status: meta?.status === 'reused' ? 'reused' : 'granted',
      repeat: bool(meta?.repeat),
      // Absent means we do not know; treat that as NOT notified rather than
      // telling a clinician the patient has been told when nobody has.
      patient_notified: bool(meta?.patient_notified),
      prior_grants_24h: num(meta?.prior_grants_24h),
    },
  };
}

function parsePatientEvents(raw: unknown): PatientEmergencyEvent[] {
  const body = raw as Record<string, unknown> | null;
  const rows = Array.isArray(body?.data) ? (body.data as unknown[]) : [];

  return rows.flatMap((row) => {
    const r = row as Record<string, unknown>;
    const id = str(r?.id);
    if (!id) return [];
    const state = r?.state;
    return [
      {
        id,
        state: state === 'active' || state === 'expired' || state === 'revoked' ? state : 'expired',
        active: bool(r?.active),
        reason: str(r?.reason) ?? '',
        clinician_id: str(r?.clinician_id),
        clinician_name: str(r?.clinician_name),
        facility_id: str(r?.facility_id),
        facility_name: str(r?.facility_name),
        opened_at: str(r?.opened_at),
        expires_at: str(r?.expires_at),
        expires_in_seconds: num(r?.expires_in_seconds),
        revoked_at: str(r?.revoked_at),
        revoked_by: str(r?.revoked_by),
        is_repeat: bool(r?.is_repeat),
        notified_at: str(r?.notified_at),
        records_viewed: Array.isArray(r?.records_viewed)
          ? (r.records_viewed as unknown[]).filter((v): v is string => typeof v === 'string')
          : [],
        read_count: num(r?.read_count),
        can_revoke: bool(r?.can_revoke),
      },
    ];
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Reading a failure
// ═══════════════════════════════════════════════════════════════════════════

/** The server's own `error_code`, when it sent one. */
export function breakGlassErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const body = error.response?.data as { error_code?: unknown } | undefined;
  return typeof body?.error_code === 'string' ? body.error_code : null;
}

/** The server's human message, when it sent one — already localised. */
export function breakGlassMessage(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const body = error.response?.data as { message?: unknown; errors?: Record<string, string[]> } | undefined;
  const firstField = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
  if (typeof firstField === 'string' && firstField) return firstField;
  return typeof body?.message === 'string' && body.message ? body.message : null;
}

/** Seconds the server said to wait, from a 423 or a 429. */
export function breakGlassRetryAfter(error: unknown): number | null {
  if (!axios.isAxiosError(error)) return null;
  const body = error.response?.data as { retry_after?: unknown } | undefined;
  if (typeof body?.retry_after === 'number') return body.retry_after;
  const header = error.response?.headers?.['retry-after'];
  const parsed = typeof header === 'string' ? Number.parseInt(header, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** The route is not served by this deployment (404 with no error_code). */
export function isBreakGlassUnavailable(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404 && !breakGlassErrorCode(error);
}

/** The patient's Health ID matched no record. */
export function isPatientNotFound(error: unknown): boolean {
  return breakGlassErrorCode(error) === 'PATIENT_NOT_FOUND';
}

/** The 24h cap, or the lock after a patient revoked an earlier override. */
export function isBreakGlassBlocked(error: unknown): boolean {
  const code = breakGlassErrorCode(error);
  return code === 'EMERGENCY_RATE_LIMITED' || code === 'EMERGENCY_REVOKED_BY_PATIENT';
}

/** The grant has run out or been closed — read again only after reopening. */
export function isGrantClosed(error: unknown): boolean {
  const code = breakGlassErrorCode(error);
  return code === 'EMERGENCY_GRANT_EXPIRED' || code === 'EMERGENCY_GRANT_REVOKED';
}

/**
 * The override may or may not have been opened.
 *
 * A request that got NO response — timeout, dropped connection — could have
 * landed: the grant, the patient's alert and the review case may all exist. A
 * screen must say exactly that, and send the clinician to their held grants,
 * rather than showing "failed" (inviting a second override on the same
 * patient) or "opened" (which it cannot know).
 */
export function openOutcomeIsUncertain(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (error.response) return false;
  return (
    error.code === 'ECONNABORTED' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ERR_NETWORK' ||
    /timeout|network/i.test(error.message ?? '')
  );
}

/**
 * Seconds left on a grant, counted from the wall clock rather than from the
 * server's snapshot, so a countdown keeps running while the screen is open.
 * Falls back to the server's number when there is no parseable expiry.
 */
export function secondsLeft(grant: Pick<EmergencyGrant, 'expires_at' | 'expires_in_seconds'>): number {
  if (!grant.expires_at) return Math.max(0, grant.expires_in_seconds);
  const ms = Date.parse(grant.expires_at);
  if (Number.isNaN(ms)) return Math.max(0, grant.expires_in_seconds);
  return Math.max(0, Math.floor((ms - Date.now()) / 1000));
}

/** `3h 58m` / `12m 04s` — a countdown a clinician can read at a glance. */
export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Requests
// ═══════════════════════════════════════════════════════════════════════════

async function openBreakGlass(request: BreakGlassRequest): Promise<BreakGlassResult> {
  const res = await apiClient.post<unknown>(emergencyAccessEndpoints.breakGlass, {
    patient: normaliseHealthId(request.patient),
    reason: request.reason.trim(),
    acknowledged: true,
  });
  return parseBreakGlass(res.data);
}

/**
 * Break the glass. `retry: false`, and deliberately so — see
 * `openOutcomeIsUncertain`. This is the one mutation in the app that must
 * never be sent twice on its own initiative.
 */
export function useOpenBreakGlass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: openBreakGlass,
    retry: false,
    onSuccess: async (result) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: emergencyAccessKeys.held }),
        qc.invalidateQueries({ queryKey: emergencyAccessKeys.grant(result.grant.id) }),
      ]);
    },
  });
}

/** The grants this clinician is holding right now, at this facility. */
export function useHeldEmergencyGrants(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: emergencyAccessKeys.held,
    queryFn: async () => {
      const res = await apiClient.get<unknown>(emergencyAccessEndpoints.breakGlass);
      const body = res.data as { data?: unknown };
      const rows = Array.isArray(body?.data) ? body.data : [];
      return rows.flatMap((row) => {
        try {
          return [parseGrant(row)];
        } catch {
          return [];
        }
      });
    },
    retry: false,
    enabled: options.enabled ?? true,
    // A held grant is a countdown, so it goes stale fast.
    staleTime: 15 * 1000,
  });
}

/**
 * Re-read the emergency profile under a grant already held. Separate from the
 * override itself so glancing at the allergy list twice does not create a
 * second override — each read is still audited server-side.
 */
export function useEmergencyProfile(grantId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: emergencyAccessKeys.profile(grantId ?? ''),
    queryFn: async () => {
      const res = await apiClient.get<unknown>(emergencyAccessEndpoints.grantProfile(grantId as string));
      const body = res.data as { data?: { grant?: unknown; profile?: unknown } };
      return {
        grant: parseGrant(body?.data?.grant),
        profile: parseProfile(body?.data?.profile),
      };
    },
    // A 403 here means the window closed. Retrying cannot reopen it.
    retry: false,
    enabled: Boolean(grantId) && (options.enabled ?? true),
    staleTime: 15 * 1000,
  });
}

// ── The patient's side ────────────────────────────────────────────────────

/**
 * Every override on the signed-in PATIENT's own record — active, expired and
 * revoked. Nothing is hidden once it has lapsed: the point of the log is that
 * the patient can see what happened, not only what is happening.
 */
export function usePatientEmergencyLog(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: emergencyAccessKeys.patientLog,
    queryFn: async () => {
      const res = await apiClient.get<unknown>(emergencyAccessEndpoints.patientLog);
      return parsePatientEvents(res.data);
    },
    retry: false,
    enabled: options.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

/** The patient closes a live override. */
export function useRevokeEmergencyAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grantId: string) => {
      const res = await apiClient.post<unknown>(emergencyAccessEndpoints.patientRevoke(grantId));
      return res.data;
    },
    retry: false,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: emergencyAccessKeys.patientLog });
    },
  });
}
