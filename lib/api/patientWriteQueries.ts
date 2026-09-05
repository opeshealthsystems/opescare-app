/**
 * Patient WRITE paths — the two things a patient may add to their own record:
 * a vital sign they measured at home, and a request to be referred.
 *
 * Backend: `routes/mobile_patient_writes.php` in the Laravel app, served by
 * `PatientRecordedVitalsController` and `PatientReferralRequestController`.
 * Companion to `lib/api/vitalsQueries.ts` (read-only over the CLINICAL tables)
 * and to the referrals block of `lib/api/queries.ts` (read-only over the
 * referrals a clinician issued). Neither of those is touched here.
 *
 * ── The rule this module exists to keep in front of the UI ──────────────────
 *
 * A patient-recorded vital is NOT a clinical measurement. The API returns a
 * `provenance` object on EVERY reading and this module never makes it
 * optional: `SelfReportedVital.provenance` is a required field, and
 * `provenanceOfClinicalSource()` maps the clinical endpoint's `source`
 * (`vitals` | `lab`) onto the same vocabulary, so a screen showing both lists
 * has one shape to render and no way to draw a self-reported reading and a
 * facility-measured one identically.
 *
 * ── Refusals are content, not failures ──────────────────────────────────────
 *
 * The server refuses a physiologically impossible value rather than clamping
 * it, and says which field, what was submitted and what the bounds are.
 * `rejectionsOf()` pulls that out of the axios error so the form can show the
 * patient exactly what was rejected instead of a generic "something went
 * wrong".
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import i18next from 'i18next';
import { apiClient } from './client';

/*
 * ---------------------------------------------------------------------------
 * i18n bundles
 *
 * The EN/FR strings for these screens live in `lib/i18n/pending/` until they
 * are merged into `lib/i18n/locales/{en,fr}.json`. Registering them here — the
 * one module every patient-write screen imports — keeps both languages working
 * in the meantime without editing the shared i18n bootstrap.
 *
 * `deep = true, overwrite = false`: once the same keys exist in the locale
 * files, THOSE win and this becomes a no-op. Merging the pending files is
 * therefore safe at any time, and this block can be deleted afterwards.
 * ---------------------------------------------------------------------------
 */
import patientWritesEn from '../i18n/pending/patient_writes.en.json';
import patientWritesFr from '../i18n/pending/patient_writes.fr.json';

let bundlesRegistered = false;

function registerPendingBundles(): void {
  if (bundlesRegistered) return;
  bundlesRegistered = true;
  try {
    i18next.addResourceBundle('en', 'translation', patientWritesEn, true, false);
    i18next.addResourceBundle('fr', 'translation', patientWritesFr, true, false);
  } catch {
    // i18next not initialised yet in some test/tooling contexts. The screens
    // still render: every lookup in them carries a defaultValue.
  }
}

registerPendingBundles();

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                   */
/* -------------------------------------------------------------------------- */

/** Spelled out here rather than in `endpoints.ts`, which is owned elsewhere. */
export const PATIENT_WRITE_ENDPOINTS = {
  vitalOptions: '/mobile/patient-vitals/options',
  vitals: '/mobile/patient-vitals',
  voidVital: (id: string) => `/mobile/patient-vitals/${id}/void`,

  referralRequestOptions: '/mobile/referral-requests/options',
  referralRequests: '/mobile/referral-requests',
  withdrawReferralRequest: (id: string) => `/mobile/referral-requests/${id}/withdraw`,
} as const;

export const patientWriteKeys = {
  all: ['patient-writes'] as const,
  vitalOptions: () => ['patient-writes', 'vital-options'] as const,
  vitals: () => ['patient-writes', 'vitals'] as const,
  referralOptions: () => ['patient-writes', 'referral-request-options'] as const,
  referralRequests: () => ['patient-writes', 'referral-requests'] as const,
};

/**
 * The API answers in the patient's language. It reads `?lang=` first, so it is
 * sent explicitly rather than relying on whatever `Accept-Language` the
 * platform's HTTP stack happens to attach.
 */
function langParam(): { lang: string } {
  return { lang: i18next.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en' };
}

interface Envelope<T> {
  data: T;
}

interface ListEnvelope<T, M> {
  data: T[];
  meta: M;
}

/* -------------------------------------------------------------------------- */
/* Provenance — the field that must never be dropped                          */
/* -------------------------------------------------------------------------- */

export type ProvenanceValue = 'self_reported' | 'facility_measured' | 'laboratory_result';

export interface Provenance {
  value: ProvenanceValue;
  /** Short badge text, already translated by the API. */
  label: string;
  /** One sentence explaining what the badge means. */
  description: string;
  /** False for anything the patient measured themselves. */
  clinically_verified: boolean;
}

/**
 * `lib/api/vitalsQueries.ts` returns `source: 'vitals' | 'lab'` on clinical
 * readings — the same distinction under a different name. This maps it onto the
 * provenance vocabulary so one component renders both lists and cannot present
 * them identically by omission.
 *
 * The labels are passed in from the caller's `t()` because that endpoint (which
 * is not ours to change) returns no translated provenance of its own.
 */
export function provenanceOfClinicalSource(
  source: 'vitals' | 'lab',
  label: string,
  description: string,
): Provenance {
  return {
    value: source === 'lab' ? 'laboratory_result' : 'facility_measured',
    label,
    description,
    clinically_verified: true,
  };
}

/* -------------------------------------------------------------------------- */
/* Self-reported vitals                                                        */
/* -------------------------------------------------------------------------- */

export type SelfReportedMeasure = 'blood_pressure' | 'weight' | 'temperature' | 'blood_sugar';

export interface MeasureBounds {
  min: number;
  max: number;
}

export interface MeasureUnitOption {
  unit: string;
  is_default: boolean;
  decimals: number;
  primary_bounds: MeasureBounds;
  /** Diastolic bounds — non-null for blood pressure only. */
  secondary_bounds: MeasureBounds | null;
}

export interface MeasureOption {
  measure: SelfReportedMeasure;
  label: string;
  has_two_values: boolean;
  primary_label: string;
  secondary_label: string | null;
  units: MeasureUnitOption[];
  contexts: { value: string; label: string }[];
}

export interface VitalLogOptions {
  measures: MeasureOption[];
  provenance: Provenance;
}

/**
 * The API's own advice on a reading. Deliberately one-directional: either it is
 * absent, or it says "contact a health worker". It is never a grading, and
 * `is_clinical_interpretation` is there so no component can render it as one.
 */
export interface VitalAdvisory {
  action: 'seek_care';
  message: string;
  is_clinical_interpretation: false;
}

export interface SelfReportedVital {
  id: string;
  measure: SelfReportedMeasure;
  label: string;
  /** Pre-formatted: "128/82", "61.5". */
  value: string;
  primary: number;
  secondary: number | null;
  unit: string;
  context: string | null;
  context_label: string | null;
  device_label: string | null;
  note: string | null;
  /** When the patient took it — not when it was typed in. */
  measured_at: string | null;
  recorded_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  /** Never optional. Always `self_reported` on this endpoint. */
  provenance: Provenance;
  advisory: VitalAdvisory | null;
}

export interface SelfReportedVitalsMeta {
  count: number;
  voided_count: number;
  provenance: Provenance;
}

export interface LogVitalInput {
  measure: SelfReportedMeasure;
  /** Single-number measures. */
  value?: number;
  /** Blood pressure only. */
  systolic?: number;
  diastolic?: number;
  unit?: string;
  measurement_context?: string;
  device_label?: string;
  note?: string;
  measured_at?: string;
}

/** What may be logged, in what units, within what bounds. */
export function useVitalLogOptions() {
  return useQuery({
    queryKey: patientWriteKeys.vitalOptions(),
    queryFn: async () =>
      (
        await apiClient.get<Envelope<VitalLogOptions>>(PATIENT_WRITE_ENDPOINTS.vitalOptions, {
          params: langParam(),
        })
      ).data.data,
    staleTime: 10 * 60 * 1000,
  });
}

/** The patient's own log. Self-reported readings only, by design. */
export function useSelfReportedVitals(measure?: SelfReportedMeasure) {
  return useQuery({
    queryKey: [...patientWriteKeys.vitals(), measure ?? 'all'] as const,
    queryFn: async () =>
      (
        await apiClient.get<ListEnvelope<SelfReportedVital, SelfReportedVitalsMeta>>(
          PATIENT_WRITE_ENDPOINTS.vitals,
          { params: { ...langParam(), ...(measure ? { measure } : {}) } },
        )
      ).data,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Log one reading.
 *
 * Never retried: a write whose outcome is unknown must not be silently
 * repeated into a patient's record. A 422 here is not a transport failure — it
 * is the server telling the patient what it refused and why, and the form
 * renders it with `rejectionsOf()`.
 */
export function useLogVital() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LogVitalInput) =>
      (
        await apiClient.post<Envelope<SelfReportedVital>>(PATIENT_WRITE_ENDPOINTS.vitals, input, {
          params: langParam(),
        })
      ).data.data,
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: patientWriteKeys.vitals() });
    },
  });
}

/** Retract a reading. There is no edit path, by design — see the controller. */
export function useVoidVital() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) =>
      (
        await apiClient.post<Envelope<SelfReportedVital>>(
          PATIENT_WRITE_ENDPOINTS.voidVital(id),
          reason ? { reason } : {},
          { params: langParam() },
        )
      ).data.data,
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: patientWriteKeys.vitals() });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Referral requests — requests, not referrals                                 */
/* -------------------------------------------------------------------------- */

export type ReferralRequestStatus =
  | 'submitted'
  | 'under_review'
  | 'accepted'
  | 'declined'
  | 'withdrawn';

/** The PATIENT's sense of urgency. Deliberately not the clinical triage union. */
export type ReportedUrgency = 'routine' | 'soon' | 'urgent';

export interface ReferralRequestOptions {
  specialties: { value: string; label: string }[];
  durations: { value: string; label: string }[];
  reported_urgencies: { value: ReportedUrgency; label: string; description: string }[];
  limits: { reason_min: number; reason_max: number; max_open_requests: number };
  /** The sentence the form must show before the patient fills anything in. */
  disclaimer: string;
}

export interface ReferralRequest {
  /** Literally `"referral_request"`. Not a referral, and it says so. */
  object: 'referral_request';
  id: string;
  reference: string;

  status: ReferralRequestStatus;
  status_label: string;
  status_detail: string;
  is_open: boolean;
  is_withdrawable: boolean;

  /** The ONLY field that may make a screen say "you have been referred". */
  is_referral: boolean;
  referral_case_id: string | null;

  requested_specialty: string | null;
  requested_specialty_label: string | null;
  preferred_facility: { id: string; name: string; city: string | null; region: string | null } | null;

  reason: string;
  symptom_duration: string | null;
  symptom_duration_label: string | null;

  reported_urgency: ReportedUrgency;
  reported_urgency_label: string;
  reported_urgency_caveat: string;

  patient_note: string | null;
  contact_phone: string | null;

  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  decline_reason: string | null;
  withdrawn_at: string | null;

  next_step: string;
}

export interface ReferralRequestsMeta {
  count: number;
  open_count: number;
  max_open_requests: number;
  disclaimer: string;
}

export interface RequestReferralInput {
  requested_specialty?: string;
  preferred_care_facility_id?: string;
  reason: string;
  symptom_duration?: string;
  reported_urgency?: ReportedUrgency;
  patient_note?: string;
  contact_phone?: string;
}

export function useReferralRequestOptions() {
  return useQuery({
    queryKey: patientWriteKeys.referralOptions(),
    queryFn: async () =>
      (
        await apiClient.get<Envelope<ReferralRequestOptions>>(
          PATIENT_WRITE_ENDPOINTS.referralRequestOptions,
          { params: langParam() },
        )
      ).data.data,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * The patient's own requests. These are NOT in `useReferrals()`, which lists
 * issued referrals — keeping them in separate hooks is what stops a screen
 * concatenating the two into one list.
 */
export function useReferralRequests() {
  return useQuery({
    queryKey: patientWriteKeys.referralRequests(),
    queryFn: async () =>
      (
        await apiClient.get<ListEnvelope<ReferralRequest, ReferralRequestsMeta>>(
          PATIENT_WRITE_ENDPOINTS.referralRequests,
          { params: langParam() },
        )
      ).data,
    staleTime: 30 * 1000,
  });
}

export function useRequestReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RequestReferralInput) =>
      (
        await apiClient.post<Envelope<ReferralRequest>>(
          PATIENT_WRITE_ENDPOINTS.referralRequests,
          input,
          { params: langParam() },
        )
      ).data.data,
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: patientWriteKeys.referralRequests() });
    },
  });
}

export function useWithdrawReferralRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) =>
      (
        await apiClient.post<Envelope<ReferralRequest>>(
          PATIENT_WRITE_ENDPOINTS.withdrawReferralRequest(id),
          reason ? { reason } : {},
          { params: langParam() },
        )
      ).data.data,
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: patientWriteKeys.referralRequests() });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Refusals                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One refused field, as the API describes it: what was submitted, the bounds it
 * fell outside, and a sentence in the patient's language. `submitted` is a
 * string on purpose — it is the value the patient typed, echoed back, not a
 * number the client re-formats.
 */
export interface Rejection {
  field: string;
  submitted?: string | null;
  min?: number;
  max?: number;
  unit?: string;
  reason_code?: string;
  reason: string;
}

export interface RefusalBody {
  message: string;
  error_code: string;
  errors?: Record<string, string[]>;
  rejected?: Rejection[];
  /** Always false when present. Nothing was clamped and nothing was stored. */
  stored?: false;
}

function refusalBodyOf(error: unknown): RefusalBody | null {
  if (!axios.isAxiosError(error)) return null;
  const body = error.response?.data as RefusalBody | undefined;
  if (!body || typeof body !== 'object') return null;
  return body;
}

/**
 * The fields the server refused, so the form can point at them. Empty when the
 * failure was not a refusal (offline, 500, timeout) — those are transport
 * problems and get the generic error path, not a field-level one.
 */
export function rejectionsOf(error: unknown): Rejection[] {
  const body = refusalBodyOf(error);
  if (!body) return [];
  if (Array.isArray(body.rejected) && body.rejected.length > 0) return body.rejected;

  // Older/other endpoints answer with only the Laravel `errors` map.
  if (body.errors && typeof body.errors === 'object') {
    return Object.entries(body.errors).map(([field, messages]) => ({
      field,
      reason: Array.isArray(messages) ? String(messages[0] ?? '') : String(messages),
    }));
  }
  return [];
}

/** The server's own headline for a refusal, when it gave one. */
export function refusalMessageOf(error: unknown): string | null {
  const body = refusalBodyOf(error);
  const message = body?.message;
  return typeof message === 'string' && message.trim() !== '' ? message : null;
}

/** True when the server refused the content, rather than failing to receive it. */
export function isRefusal(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status ?? 0;
  return status === 409 || status === 422 || status === 404;
}
