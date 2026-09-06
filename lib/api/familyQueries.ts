/**
 * Family / dependents data layer — a guardian's view of a child's or an older
 * relative's record, and the dependent's side of an invitation.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ BACKEND CONTRACT (being implemented alongside this file, 2026-09-06)    │
 * │                                                                         │
 * │  GET  /mobile/family                          → { data: FamilyMemberLink[] }     │
 * │  GET  /mobile/family/members/{linkId}         → { data: FamilyMemberDetail }     │
 * │  GET  /mobile/family/invitations              → { data: FamilyOutgoingInvitation[] } │
 * │  GET  /mobile/family/invitations/incoming     → { data: FamilyIncomingInvitation[] } │
 * │  POST /mobile/family                          register a child (<18)           │
 * │       422 error_code 'dependent_is_adult'     → the invite path instead        │
 * │  POST /mobile/family/invitations              invite an adult by exact         │
 * │       health_id | email | phone + relationship + access_level                  │
 * │  DELETE /mobile/family/invitations/{id}       cancel an invitation I sent       │
 * │  POST /mobile/family/invitations/{id}/accept  accept one addressed to me        │
 * │  POST /mobile/family/invitations/{id}/decline decline it                        │
 * │                                                                         │
 * │  ACT-AS: any authenticated GET called with header                        │
 * │  `X-OpesCare-Dependent: <dependent patient id>` is served as that       │
 * │  dependent (read_only or full). Non-GET needs `full`. A refusal is       │
 * │  403 { error_code: 'dependent_forbidden' }. The header is set PER        │
 * │  REQUEST here — never on the shared axios instance, or every query in   │
 * │  the app would silently start reading someone else's record.           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A deployment that predates this contract answers 404 for the new paths.
 * That is surfaced as "not served yet" (isFamilyNotServed) and the screens
 * print exactly that — nothing here fabricates a member, a card or a count.
 */
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import { LABS_ENDPOINTS, type LabPage, type PortalLabOrder } from './labsQueries';
import type { PaginatedPrescriptions } from './queries';
import type { TemporaryQrCode } from './types';
import type {
  FamilyAccessLevel,
  FamilyDependentPatient,
  FamilyIncomingInvitation,
  FamilyMemberDetail,
  FamilyMemberLink,
  FamilyOutgoingInvitation,
  HealthIdCard,
  InviteAdultPayload,
  PaginatedAppointments,
  RegisterChildPayload,
  TimelineResponse,
} from './types';

// ---------------------------------------------------------------------------
// Act-as header
// ---------------------------------------------------------------------------

export const DEPENDENT_HEADER = 'X-OpesCare-Dependent';

/**
 * Axios config that reads the next request AS the given dependent. Spread it
 * into ONE call: `apiClient.get(url, { ...dependentHeaders(id), params })`.
 */
export function dependentHeaders(dependentPatientId: string): {
  headers: Record<string, string>;
} {
  return { headers: { [DEPENDENT_HEADER]: dependentPatientId } };
}

/**
 * POST /mobile/qr/temporary AS the dependent — the live 15-minute code the
 * guardian presents at a facility on the child's or elder's behalf. Only a
 * `full` link may mint it (the server refuses a read-only link with 403
 * dependent_forbidden); the mint is written to the dependent's access log
 * under the guardian's name. Same response shape as the holder's own mint.
 */
export function useMintDependentTemporaryQr() {
  return useMutation({
    mutationFn: async (dependentPatientId: string) =>
      (await apiClient.post<TemporaryQrCode>(endpoints.generateTemporaryQr, {}, dependentHeaders(dependentPatientId))).data,
  });
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export function httpStatusOf(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

/** The backend's machine-readable `error_code`, when the body carries one. */
export function apiErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const body = error.response?.data as { error_code?: unknown } | undefined;
  return typeof body?.error_code === 'string' ? body.error_code : null;
}

/** The backend's human message, else the caller's fallback. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) return fallback;
  const body = error.response?.data as { message?: unknown } | undefined;
  return typeof body?.message === 'string' && body.message.trim() ? body.message : fallback;
}

/** 403 dependent_forbidden — the link is gone, revoked, lapsed at 18, or read-only for a write. */
export function isDependentForbidden(error: unknown): boolean {
  return httpStatusOf(error) === 403 && apiErrorCode(error) === 'dependent_forbidden';
}

/** 422 dependent_is_adult — the person registered as a child is 18 or older. */
export function isDependentAdult(error: unknown): boolean {
  return httpStatusOf(error) === 422 && apiErrorCode(error) === 'dependent_is_adult';
}

/**
 * The route does not exist on this server yet (404/405/501 with no
 * `error_code`). A 404 WITH an error_code is the server saying "no such
 * link" — a different situation, see isFamilyLinkGone.
 */
export function isFamilyNotServed(error: unknown): boolean {
  const status = httpStatusOf(error);
  if (status === 405 || status === 501) return true;
  return status === 404 && apiErrorCode(error) === null;
}

/** 404 — the link (or invitation) no longer exists for this user. */
export function isFamilyLinkGone(error: unknown): boolean {
  return httpStatusOf(error) === 404;
}

/** Retry only what a retry can fix; every 4xx is final on the first response. */
function retryPolicy(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === undefined) return true; // network / timeout
  return status >= 500 && status !== 501;
}

// ---------------------------------------------------------------------------
// Pure helpers over the shapes
// ---------------------------------------------------------------------------

/** Anything but `full` is read-only — including the legacy `view_only` / `guardian`. */
export function isReadOnlyAccess(level: FamilyAccessLevel | null | undefined): boolean {
  return (level ?? '').toLowerCase() !== 'full';
}

/** Canonical label key for a stored access level, legacy values folded in. */
export function accessLevelKey(level: FamilyAccessLevel | null | undefined): 'full' | 'read_only' {
  return isReadOnlyAccess(level) ? 'read_only' : 'full';
}

/** Whole years between a YYYY-MM-DD and today, or null when unknown/absurd. */
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const monthDelta = now.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) years -= 1;
  return years >= 0 && years < 150 ? years : null;
}

export interface DependentIdentity {
  patientId: string | null;
  healthId: string | null;
  name: string;
  dob: string | null;
  sex: string | null;
  photoUrl: string | null;
  /** Identity status key (`verified`, `provisional`, …) or null when the server omits it. */
  statusKey: string | null;
  bloodType: string | null;
  age: number | null;
}

/**
 * One reading of a member row, whichever of the two shapes the server sent:
 * the contract's card-named fields on `patient`, the older `full_name` /
 * `date_of_birth` / `age`, or card fields flattened onto the row itself.
 */
export function dependentIdentity(link: FamilyMemberLink): DependentIdentity {
  const p = link.patient;
  const first = (p?.first_name ?? '').trim();
  const last = (p?.last_name ?? '').trim();
  const name =
    (p?.display_name ?? '').trim() ||
    (p?.full_name ?? '').trim() ||
    [first, last].filter(Boolean).join(' ') ||
    '';
  const dob = p?.dob ?? p?.date_of_birth ?? link.dob ?? null;
  const statusRaw = p?.status ?? null;
  return {
    patientId: p?.id ?? null,
    healthId: p?.health_id ?? null,
    name,
    dob,
    sex: p?.sex ?? link.sex ?? null,
    photoUrl: p?.photo_url ?? link.photo_url ?? null,
    statusKey: statusRaw ? statusRaw.toLowerCase() : null,
    bloodType: p?.blood_type ?? null,
    age: p?.age ?? ageFromDob(dob),
  };
}

/**
 * The dependent's patient block as a `HealthIdCard`, for
 * `components/health-id/model.ts` `modelFromLive()`. Same field names, so
 * this is a narrowing, not a translation — the anatomical hologram follows
 * the dependent's own sex + date of birth. `qr_payload` stays empty when the
 * server withheld it (read-only link).
 */
export function dependentCard(patient: FamilyDependentPatient): HealthIdCard {
  const first = (patient.first_name ?? '').trim();
  const last = (patient.last_name ?? '').trim();
  return {
    health_id: patient.health_id ?? '',
    display_name:
      (patient.display_name ?? '').trim() ||
      (patient.full_name ?? '').trim() ||
      [first, last].filter(Boolean).join(' '),
    sex: patient.sex ?? null,
    dob: patient.dob ?? patient.date_of_birth ?? null,
    blood_type: patient.blood_type ?? null,
    photo_url: patient.photo_url ?? null,
    qr_payload: patient.qr_payload ?? '',
    status: patient.status ?? '',
  };
}

// ---------------------------------------------------------------------------
// Query keys — `['family']` is the root every write invalidates. The members
// key is IDENTICAL to lib/api/queries.ts useFamilyMembers so the Profile tab's
// "Dependents" tile and this screen share one cache entry.
// ---------------------------------------------------------------------------

export const familyKeys = {
  all: ['family'] as const,
  members: () => ['family', 'members'] as const,
  member: (linkId: string) => ['family', 'member', linkId] as const,
  outgoing: () => ['family', 'invitations'] as const,
  incoming: () => ['family', 'incoming'] as const,
  dependent: (patientId: string, resource: string) =>
    ['family', 'dependent', patientId, resource] as const,
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** GET /mobile/family — active + pending links this user holds as guardian. */
export function useFamilyMembers() {
  return useQuery({
    queryKey: familyKeys.members(),
    queryFn: async () =>
      (await apiClient.get<{ data: FamilyMemberLink[] }>(endpoints.family)).data.data,
    retry: retryPolicy,
  });
}

/** GET /mobile/family/members/{linkId} — one link with the dependent's card,
 * immunisations, upcoming appointments and record counts. */
export function useFamilyMember(linkId: string | undefined) {
  return useQuery({
    queryKey: familyKeys.member(linkId ?? ''),
    queryFn: async () =>
      (await apiClient.get<{ data: FamilyMemberDetail }>(endpoints.familyMember(linkId as string)))
        .data.data,
    enabled: !!linkId,
    retry: retryPolicy,
  });
}

/** GET /mobile/family/invitations — invitations I sent that are still pending. */
export function useOutgoingInvitations() {
  return useQuery({
    queryKey: familyKeys.outgoing(),
    queryFn: async () =>
      (await apiClient.get<{ data: FamilyOutgoingInvitation[] }>(endpoints.familyInvitations)).data
        .data,
    retry: retryPolicy,
  });
}

/** GET /mobile/family/invitations/incoming — invitations addressed to ME (the
 * elder's side). On a server without the route this errors with
 * isFamilyNotServed(); the screen then renders no section at all. */
export function useIncomingInvitations() {
  return useQuery({
    queryKey: familyKeys.incoming(),
    queryFn: async () =>
      (
        await apiClient.get<{ data: FamilyIncomingInvitation[] }>(
          endpoints.familyIncomingInvitations,
        )
      ).data.data,
    retry: retryPolicy,
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** POST /mobile/family — mints a real Patient + Health ID for a child and an
 * active link. 422 dependent_is_adult when the DOB says 18+ (use the invite). */
export function useRegisterChild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterChildPayload) =>
      (await apiClient.post<{ message?: string; data: FamilyMemberLink }>(endpoints.family, input))
        .data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.all });
    },
  });
}

/** How the guardian typed the person they are inviting. */
export type InviteContactKind = 'health_id' | 'email' | 'phone';

/** Exact Health IDs look like `CM-HID-XXXX-XXXX-XXXX` (any country prefix). */
const HEALTH_ID_RE = /^[A-Z]{2}-HID-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2}$/i;

export function classifyInviteContact(raw: string): InviteContactKind | null {
  const value = raw.trim();
  if (!value) return null;
  if (HEALTH_ID_RE.test(value) || /HID/i.test(value)) return 'health_id';
  if (value.includes('@')) return 'email';
  if (/^\+?[\d\s().-]{6,}$/.test(value)) return 'phone';
  return null;
}

export interface InviteAdultInput {
  contact: string;
  relationship: InviteAdultPayload['relationship'];
  access_level: InviteAdultPayload['access_level'];
}

/** POST /mobile/family/invitations — exactly one of health_id / email / phone.
 * The dependent must accept from their own OpesCare account. */
export function useInviteAdult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteAdultInput) => {
      const kind = classifyInviteContact(input.contact);
      const contact = input.contact.trim();
      const payload: InviteAdultPayload & { contact: string } = {
        // `contact` is the field the pre-contract server validates; the new
        // server ignores it and reads the typed key. Both are satisfied.
        contact,
        relationship: input.relationship,
        access_level: input.access_level,
      };
      if (kind === 'health_id') payload.health_id = contact.toUpperCase();
      else if (kind === 'email') payload.email = contact.toLowerCase();
      else payload.phone = contact.replace(/[\s().-]/g, '');
      return (
        await apiClient.post<{ message?: string; data: FamilyOutgoingInvitation }>(
          endpoints.familyInvitations,
          payload,
        )
      ).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.all });
    },
  });
}

/** DELETE /mobile/family/invitations/{id} — withdraw an invitation I sent. */
export function useCancelInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.delete<{ message?: string }>(endpoints.familyInvitation(id))).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.all });
    },
  });
}

/** POST /mobile/family/invitations/{id}/accept — I become their dependent. */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.post<{ message?: string }>(endpoints.acceptFamilyInvitation(id))).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.all });
    },
  });
}

/** POST /mobile/family/invitations/{id}/decline */
export function useDeclineInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.post<{ message?: string }>(endpoints.declineFamilyInvitation(id))).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// The dependent's records, read through the act-as header. Same endpoints and
// response types as the patient's own screens (lib/api/queries.ts,
// lib/api/labsQueries.ts); only the header — and the cache key — differ.
// ---------------------------------------------------------------------------

/** GET /mobile/timeline as the dependent. */
export function useDependentTimeline(dependentPatientId: string | null | undefined, limit = 30) {
  return useQuery({
    queryKey: [...familyKeys.dependent(dependentPatientId ?? '', 'timeline'), limit],
    queryFn: async () =>
      (
        await apiClient.get<TimelineResponse>(endpoints.timeline, {
          ...dependentHeaders(dependentPatientId as string),
          params: { limit },
        })
      ).data,
    enabled: !!dependentPatientId,
    retry: retryPolicy,
  });
}

/** GET /mobile/prescriptions as the dependent. */
export function useDependentPrescriptions(dependentPatientId: string | null | undefined) {
  return useQuery({
    queryKey: familyKeys.dependent(dependentPatientId ?? '', 'prescriptions'),
    queryFn: async () =>
      (
        await apiClient.get<PaginatedPrescriptions>(endpoints.prescriptions, {
          ...dependentHeaders(dependentPatientId as string),
        })
      ).data,
    enabled: !!dependentPatientId,
    retry: retryPolicy,
  });
}

/** GET /mobile/labs as the dependent (first page). */
export function useDependentLabResults(dependentPatientId: string | null | undefined) {
  return useQuery({
    queryKey: familyKeys.dependent(dependentPatientId ?? '', 'labs'),
    queryFn: async () =>
      (
        await apiClient.get<LabPage<PortalLabOrder>>(LABS_ENDPOINTS.list, {
          ...dependentHeaders(dependentPatientId as string),
          params: { per_page: 20 },
        })
      ).data,
    enabled: !!dependentPatientId,
    retry: retryPolicy,
  });
}

/** GET /mobile/appointments?scope=upcoming as the dependent — the live list,
 * used when the detail payload did not include `upcoming_appointments`. */
export function useDependentUpcomingAppointments(
  dependentPatientId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: familyKeys.dependent(dependentPatientId ?? '', 'appointments-upcoming'),
    queryFn: async () =>
      (
        await apiClient.get<PaginatedAppointments>(endpoints.appointments, {
          ...dependentHeaders(dependentPatientId as string),
          params: { scope: 'upcoming', limit: 10 },
        })
      ).data,
    enabled: enabled && !!dependentPatientId,
    retry: retryPolicy,
  });
}
