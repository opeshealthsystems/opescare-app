import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import { useAuthStore } from '../store/auth';
import type {
  AllergiesResponse,
  Appointment,
  ClinicalResponse,
  EmergencyContact,
  HealthIdCard,
  ImmunizationsResponse,
  OfficialDocumentDetail,
  PaginatedAppointments,
  PaginatedDocuments,
  Patient,
  RegisterPatientPayload,
  RegisterPatientResponse,
  TemporaryQrCode,
  TimelineResponse,
} from './types';

export function useHealthIdCard() {
  return useQuery({
    queryKey: ['health-id-card'],
    queryFn: async () => (await apiClient.get<HealthIdCard>(endpoints.healthIdCard)).data,
  });
}

/** PATCH /mobile/me — edits the signed-in patient's own demographic fields and
 * emergency contact. Writes straight into the auth store's `patient` (the
 * response already carries the full updated shape) instead of triggering a
 * second round-trip fetch. */
export interface UpdateProfileInput {
  first_name?: string;
  last_name?: string;
  blood_group?: string | null;
  sex?: 'male' | 'female' | null;
  address?: string | null;
  emergency_contact?: EmergencyContact;
}

export function useUpdateProfile() {
  return useMutation({
    mutationFn: async (input: UpdateProfileInput) =>
      (await apiClient.patch<Patient>(endpoints.me, input)).data,
    onSuccess: (patient) => {
      useAuthStore.setState({ patient });
    },
  });
}

/** POST /mobile/qr/temporary — issues a fresh 15-minute temporary-access QR on each call. */
export function useGenerateTemporaryQr() {
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post<TemporaryQrCode>(endpoints.generateTemporaryQr)).data,
  });
}

export function useUpcomingAppointments() {
  return useQuery({
    queryKey: ['appointments', 'upcoming'],
    queryFn: async () =>
      (
        await apiClient.get<PaginatedAppointments>(endpoints.appointments, {
          params: { scope: 'upcoming', limit: 3 },
        })
      ).data,
  });
}

// ---------------------------------------------------------------------------
// Appointments: list / detail / cancel / book (facility directory + slots)
// Added for the appointments screen (app/appointments/*). Kept below the
// original hooks above to stay additive-only per FILE OWNERSHIP.
// ---------------------------------------------------------------------------

export type AppointmentScope = 'upcoming' | 'past';

export interface AppointmentDetail extends Appointment {
  cancellation_reason: string | null;
  cancelled_at: string | null;
  no_show_at: string | null;
  visit_id: string | null;
}

export interface CareFacilitySummary {
  id: string;
  facility_name: string;
  facility_type: string;
  ownership_type: string | null;
  city: string | null;
  region: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  website: string | null;
  integration_status: string | null;
  listing_status: string;
}

export interface PaginatedFacilities {
  data: CareFacilitySummary[];
  pagination: { total: number; per_page: number; current_page: number; last_page: number };
}

export interface AppointmentSlotOption {
  id: string;
  starts_at: string;
  ends_at: string;
  available_count: number;
  provider_id: string | null;
}

export interface FacilitySlotsResponse {
  facility_id: string | null;
  data: AppointmentSlotOption[];
}

export interface BookAppointmentPayload {
  facility_id: string;
  appointment_slot_id: string;
  appointment_type: string;
  reason?: string;
}

/** List the patient's appointments (upcoming or past). */
export function useAppointmentsList(scope: AppointmentScope, limit = 20) {
  return useQuery({
    queryKey: ['appointments', 'list', scope, limit],
    queryFn: async () =>
      (
        await apiClient.get<PaginatedAppointments>(endpoints.appointments, {
          params: { scope, limit },
        })
      ).data,
  });
}

/** Fetch one appointment's full detail. */
export function useAppointmentDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['appointments', 'detail', id],
    queryFn: async () =>
      (await apiClient.get<{ data: AppointmentDetail }>(endpoints.appointment(id as string))).data.data,
    enabled: !!id,
  });
}

/** Cancel one of the patient's own appointments. */
export function useCancelAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) =>
      (
        await apiClient.post<{ data: AppointmentDetail }>(endpoints.cancelAppointment(id), {
          reason,
        })
      ).data.data,
    onSuccess: (data) => {
      queryClient.setQueryData(['appointments', 'detail', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

/** Browse the facility directory — used by the booking flow's facility-picker step. */
export function useFacilities(params: { q?: string; type?: string; city?: string; page?: number }) {
  return useQuery({
    queryKey: ['facilities', 'list', params],
    queryFn: async () =>
      (await apiClient.get<PaginatedFacilities>(endpoints.facilities, { params })).data,
  });
}

/** List a facility's open upcoming appointment slots — booking flow's slot-picker step. */
export function useFacilitySlots(facilityId: string | undefined, date?: string) {
  return useQuery({
    queryKey: ['facilities', facilityId, 'slots', date ?? null],
    queryFn: async () =>
      (
        await apiClient.get<FacilitySlotsResponse>(endpoints.facilitySlots(facilityId as string), {
          params: date ? { date } : undefined,
        })
      ).data,
    enabled: !!facilityId,
  });
}

/** Book a slot into a new appointment — booking flow's confirm step. */
export function useBookAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BookAppointmentPayload) =>
      (await apiClient.post<{ data: AppointmentDetail }>(endpoints.appointments, payload)).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Settings + push token registration (app/settings.tsx)
// ---------------------------------------------------------------------------
/** Shape of GET/PATCH /mobile/settings — see MobileSettingsController::formatSettings(). */
export interface MobileSettings {
  push_appointments: boolean;
  push_lab_results: boolean;
  push_prescriptions: boolean;
  push_billing: boolean;
  push_consent_requests: boolean;
  preferred_language: string;
  preferred_theme: 'light' | 'dark' | 'system';
  biometric_login_enabled: boolean;
}

export function useMobileSettings() {
  return useQuery({
    queryKey: ['mobile-settings'],
    queryFn: async () =>
      (await apiClient.get<{ data: MobileSettings }>(endpoints.settings)).data.data,
  });
}

export function useUpdateMobileSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<MobileSettings>) =>
      (await apiClient.patch<{ data: MobileSettings }>(endpoints.settings, patch)).data.data,
    onSuccess: (data) => {
      queryClient.setQueryData(['mobile-settings'], data);
    },
  });
}

interface RegisterPushTokenPayload {
  device_fingerprint: string;
  platform: 'ios' | 'android' | 'web';
  push_token: string;
}

export function useRegisterPushToken() {
  return useMutation({
    mutationFn: async (payload: RegisterPushTokenPayload) =>
      (
        await apiClient.post<{ status: string; token_id: string; platform: string }>(
          endpoints.pushTokens,
          payload,
        )
      ).data,
  });
}

export function useRevokePushToken() {
  return useMutation({
    mutationFn: async (tokenId: string) =>
      (await apiClient.delete<{ status: string }>(endpoints.pushToken(tokenId))).data,
  });
}

// ---------------------------------------------------------------------------
// Documents (app/documents.tsx)
// ---------------------------------------------------------------------------

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async () => (await apiClient.get<PaginatedDocuments>(endpoints.documents)).data,
  });
}

/** Fetches a document's detail on demand — used to mint a fresh `verify_url`
 * right before opening it, since the backend only issues a token per-view. */
export function useDocumentViewer() {
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.get<{ data: OfficialDocumentDetail }>(endpoints.document(id))).data.data,
  });
}

// ---------------------------------------------------------------------------
// Referrals (app/referrals.tsx)
// ---------------------------------------------------------------------------

/** GET /mobile/referrals — the authenticated patient's referral cases, newest
 * first. Read-only from the mobile app; consumed by app/referrals.tsx. */
export type ReferralStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'expired';

export type ReferralUrgency = 'routine' | 'urgent' | 'emergency';

export interface Referral {
  id: string;
  status: ReferralStatus;
  reason: string;
  notes: string | null;
  urgency: ReferralUrgency;
  referring_facility: string;
  receiving_facility: string;
  referred_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
}

export interface ReferralsResponse {
  data: Referral[];
}

export function useReferrals() {
  return useQuery({
    queryKey: ['referrals'],
    queryFn: async () => (await apiClient.get<ReferralsResponse>(endpoints.referrals)).data,
  });
}

// ---------------------------------------------------------------------------
// Records / Timeline (app/(tabs)/records.tsx)
// ---------------------------------------------------------------------------

/** Records/Timeline screen — chronological feed of visits, resulted labs, prescriptions. */
export function useTimeline(limit = 50) {
  return useQuery({
    queryKey: ['timeline', limit],
    queryFn: async () =>
      (await apiClient.get<TimelineResponse>(endpoints.timeline, { params: { limit } })).data,
  });
}

export function useAllergies() {
  return useQuery({
    queryKey: ['allergies'],
    queryFn: async () => (await apiClient.get<AllergiesResponse>(endpoints.allergies)).data,
  });
}

export function useClinical() {
  return useQuery({
    queryKey: ['clinical'],
    queryFn: async () => (await apiClient.get<ClinicalResponse>(endpoints.clinical)).data,
  });
}

export function useImmunizations() {
  return useQuery({
    queryKey: ['immunizations'],
    queryFn: async () =>
      (await apiClient.get<ImmunizationsResponse>(endpoints.immunizations)).data,
  });
}

// -- Prescriptions ----------------------------------------------------------
// Read-only view of medications a care team has prescribed. Distinct from
// pharmacy/medicine search (a separate, not-yet-built catalog feature).

export interface PrescriptionSummary {
  id: string;
  facility_name: string | null;
  status: string;
  status_color: 'success' | 'info' | 'warning' | 'default';
  item_count: number;
  prescribed_at: string | null;
  dispensed_at: string | null;
  expires_at: string | null;
}

export interface PrescriptionItemDetail {
  id: string;
  drug_name: string;
  drug_code: string | null;
  dose: string | null;
  frequency: string | null;
  route: string | null;
  duration_days: number | null;
  quantity: number | null;
  status: string;
  is_dispensed: boolean;
  dispensed_at: string | null;
  dispense_notes: string | null;
}

export interface PrescriptionDetail extends PrescriptionSummary {
  notes: string | null;
  items: PrescriptionItemDetail[];
}

export interface PaginatedPrescriptions {
  data: PrescriptionSummary[];
  pagination: { total: number; per_page: number; current_page: number; last_page: number };
}

/** List of the patient's prescriptions, optionally filtered by status
 * ('active' | 'dispensed' | 'partially_dispensed' | 'expired' | 'cancelled'). */
export function usePrescriptions(status?: string) {
  return useQuery({
    queryKey: ['prescriptions', status ?? 'all'],
    queryFn: async () =>
      (
        await apiClient.get<PaginatedPrescriptions>(endpoints.prescriptions, {
          params: status ? { status } : undefined,
        })
      ).data,
  });
}

/** Single prescription with its full medication list. */
export function usePrescriptionDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['prescriptions', id],
    queryFn: async () =>
      (await apiClient.get<{ data: PrescriptionDetail }>(endpoints.prescription(id as string))).data.data,
    enabled: !!id,
  });
}
// ---------------------------------------------------------------------------
// Insurance — policies + marketplace (screens: app/insurance/*)
// ---------------------------------------------------------------------------

export type InsurancePolicyStatus = 'pending' | 'active' | 'inactive' | 'expired' | 'cancelled';

export interface InsurancePolicy {
  id: string;
  policy_number: string;
  member_id: string | null;
  group_number: string | null;
  status: InsurancePolicyStatus;
  relationship_to_primary: string;
  effective_date: string | null;
  expiry_date: string | null;
  is_active: boolean;
  is_expired: boolean;
  plan: {
    id: string;
    name: string;
    provider_name: string | null;
    plan_type: string | null;
  } | null;
}

export interface InsurancePlanSummary {
  id: string;
  name: string;
  plan_type: string | null;
  description: string | null;
  monthly_premium: string | null;
  annual_premium: string | null;
  deductible: string | null;
  copay_percentage: string | null;
  cashless_available: boolean;
  requires_preauthorization: boolean;
}

export interface InsurancePlanDetail extends InsurancePlanSummary {
  covered_services: string | null;
  provider: {
    id: string;
    name: string;
    contact_email: string | null;
    contact_phone: string | null;
  } | null;
}

export interface InsuranceMarketplaceProvider {
  id: string;
  name: string;
  code: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  plans: InsurancePlanSummary[];
}

export interface PurchaseInsurancePlanPayload {
  payment_method: 'mobile_money' | 'card' | 'bank_transfer';
  payment_reference?: string;
}

export interface PurchaseInsurancePlanResponse {
  message: string;
  policy_id: string;
  policy_number: string;
  status: string;
  effective_date: string;
  expiry_date: string;
}

export function useInsurancePolicies() {
  return useQuery({
    queryKey: ['insurance', 'policies'],
    queryFn: async () =>
      (await apiClient.get<{ data: InsurancePolicy[] }>(endpoints.insurance)).data,
  });
}



// ── Family: members + invitations ──────────────────────────────────────────
// Backend: App\Http\Controllers\Api\Mobile\MobileFamilyController.

export interface FamilyMemberPatient {
  id: string;
  health_id: string;
  full_name: string;
  date_of_birth: string | null;
  age: number | null;
}

export interface FamilyMember {
  id: string;
  relationship: string;
  access_level: 'view_only' | 'guardian' | 'full' | string;
  status: 'active' | 'pending_invite' | 'cancelled' | string;
  is_pending: boolean;
  patient: FamilyMemberPatient | null;
}

export interface FamilyInvitation {
  id: string;
  contact: string;
  relationship: string;
  method: string;
  sent_at: string | null;
  expires_at: string | null;
}

export function useFamilyMembers() {
  return useQuery({
    queryKey: ['family', 'members'],
    queryFn: async () =>
      (await apiClient.get<{ data: FamilyMember[] }>(endpoints.family)).data.data,
  });
}

export function useFamilyInvitations() {
  return useQuery({
    queryKey: ['family', 'invitations'],
    queryFn: async () =>
      (await apiClient.get<{ data: FamilyInvitation[] }>(endpoints.familyInvitations)).data.data,
  });
}

export interface SendFamilyInvitationInput {
  contact: string;
  relationship: string;
  method?: 'phone' | 'email' | 'qr';
  access_level?: 'view_only' | 'guardian' | 'full';
}

export function useSendFamilyInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendFamilyInvitationInput) =>
      (
        await apiClient.post<{ message: string; data: FamilyInvitation }>(
          endpoints.familyInvitations,
          input,
        )
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family'] });
    },
  });
}

export function useCancelFamilyInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await apiClient.delete<{ message: string }>(endpoints.familyInvitation(id))).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family'] });
    },
  });
}

/** Registers a brand-new dependent (e.g. a child) who has no OpesCare account
 * of their own — POST /mobile/family creates the Patient + FamilyLink in one
 * step, distinct from useSendFamilyInvitation which links an *existing*
 * patient by contact. Field names/validation mirror
 * MobileFamilyController::store() exactly. */
export interface RegisterDependentInput {
  full_name: string;
  date_of_birth: string;
  sex: 'male' | 'female';
  relationship: string;
  blood_group?: string;
  phone?: string;
}

export function useRegisterDependent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegisterDependentInput) =>
      (await apiClient.post<{ message: string; data: FamilyMember }>(endpoints.family, input)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family'] });
    },
  });
}
// --- Care Plans (owned by the Care Plans & Surveys screen agent — additive only) ---

export interface CarePlanGoal {
  id: string;
  care_plan_id: string;
  goal_text: string;
  target_date: string | null;
  status: 'pending' | 'in_progress' | 'achieved' | 'abandoned';
  achieved_at: string | null;
  notes: string | null;
}

export interface CarePlanIntervention {
  id: string;
  care_plan_id: string;
  intervention_type: 'medication' | 'exercise' | 'diet' | 'monitoring' | 'referral' | 'education' | 'other';
  description: string | null;
  frequency: string | null;
  responsible_party: string | null;
  status: 'active' | 'completed' | 'discontinued';
}

export interface CarePlan {
  id: string;
  patient_id: string;
  facility_id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: 'active' | 'completed' | 'on_hold' | 'cancelled';
  visit_id: string | null;
  goals: CarePlanGoal[];
  interventions: CarePlanIntervention[];
}

export interface CarePlanSummary {
  plan: CarePlan;
  goals: CarePlanGoal[];
  interventions: CarePlanIntervention[];
  progress_pct: number;
}

export function useCarePlans() {
  return useQuery({
    queryKey: ['care-plans'],
    queryFn: async () => (await apiClient.get<{ data: CarePlan[] }>(endpoints.carePlans)).data.data,
  });
}

export function useCarePlan(id: string | null) {
  return useQuery({
    queryKey: ['care-plans', id],
    queryFn: async () =>
      (await apiClient.get<{ data: CarePlanSummary }>(endpoints.carePlan(id as string))).data.data,
    enabled: !!id,
  });
}

// --- Surveys (owned by the Care Plans & Surveys screen agent — additive only) ---
export type SurveyQuestionType = 'rating_5' | 'rating_10' | 'yes_no' | 'text';

export interface SurveyQuestion {
  key: string;
  text: string;
  type: SurveyQuestionType;
}

export interface Survey {
  id: string;
  patient_id: string;
  facility_id: string;
  visit_id: string | null;
  template_key: string;
  status: 'pending' | 'sent' | 'completed' | 'expired';
  sent_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
}

export interface SurveyWithTemplate {
  survey: Survey;
  template: SurveyQuestion[];
}

export type SurveyResponseValue = number | boolean | string;

export function useSurveys() {
  return useQuery({
    queryKey: ['surveys'],
    queryFn: async () => (await apiClient.get<{ data: Survey[] }>(endpoints.surveys)).data.data,
  });
}

export function useSurvey(id: string | null) {
  return useQuery({
    queryKey: ['surveys', id],
    queryFn: async (): Promise<SurveyWithTemplate> => {
      const { data } = await apiClient.get<{ data: Survey; template: SurveyQuestion[] }>(
        endpoints.survey(id as string),
      );
      return { survey: data.data, template: data.template };
    },
    enabled: !!id,
  });
}

export function useSubmitSurvey(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (responses: Record<string, SurveyResponseValue>) =>
      (await apiClient.post<{ data: Survey }>(endpoints.submitSurvey(id), { responses })).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surveys'] });
      queryClient.invalidateQueries({ queryKey: ['surveys', id] });
    },
  });
}

// ── Privacy & Data (consent, access logs, exports, corrections) ────────────
// Backing screens: app/privacy/index.tsx, app/privacy/access-logs.tsx, app/privacy/export.tsx.

/** Pulls a readable message out of an axios error, falling back to a generic one. */
export function extractApiErrorMessage(err: unknown): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message ?? 'Something went wrong. Please try again.';
}

export interface ConsentRequestItem {
  id: string;
  patient_id: string;
  requesting_facility_id: string | null;
  requesting_facility_name: string | null;
  requesting_facility_type: string | null;
  requesting_user_id: string | null;
  purpose: string;
  requested_scope: string[];
  duration_minutes: number;
  /** pending_patient_approval | approved | denied | expired */
  status: string;
  /** The active ConsentGrant this request produced, once approved — the id `revoke` targets. */
  grant_id: string | null;
  grant_status: string | null;
  grant_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function useConsentRequests() {
  return useQuery({
    queryKey: ['consent-requests'],
    queryFn: async () =>
      (await apiClient.get<ConsentRequestItem[]>(endpoints.consentRequests)).data,
  });
}

export function useApproveConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) =>
      (await apiClient.post(endpoints.approveConsent(requestId))).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consent-requests'] }),
  });
}

export function useDenyConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) =>
      (await apiClient.post(endpoints.denyConsent(requestId))).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consent-requests'] }),
  });
}

export function useRevokeConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (grantId: string) =>
      (await apiClient.post(endpoints.revokeConsent(grantId))).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consent-requests'] }),
  });
}

export interface AccessLogFacility {
  id: string;
  name: string;
  type: string;
}

export interface AccessLogItem {
  id: string;
  patient_id: string | null;
  actor_id: string;
  actor_type: string;
  organization_id: string | null;
  facility_id: string | null;
  facility: AccessLogFacility | null;
  purpose: string;
  data_category: string;
  resource_type: string;
  resource_id: string | null;
  access_type: string;
  emergency_access: boolean;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface PaginatedAccessLogs {
  data: AccessLogItem[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export function useAccessLogs(page: number) {
  return useQuery({
    queryKey: ['access-logs', page],
    queryFn: async () =>
      (
        await apiClient.get<PaginatedAccessLogs>(endpoints.accessLogs, {
          params: { page },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
}

/** full_record | encounters | prescriptions | lab_results | imaging */
export type DataExportType = 'full_record' | 'encounters' | 'prescriptions' | 'lab_results' | 'imaging';

export interface DataExportRequestItem {
  id: string;
  patient_id: string;
  requested_by_user_id: string;
  export_type: DataExportType;
  scope_json: string[] | null;
  /** pending | approved | rejected | expired | downloaded */
  status: string;
  approved_by: string | null;
  file_path: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useDataExportRequests() {
  return useQuery({
    queryKey: ['data-export-requests'],
    queryFn: async () =>
      (await apiClient.get<DataExportRequestItem[]>(endpoints.dataExportRequests)).data,
  });
}

export function useCreateDataExportRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (exportType: DataExportType) =>
      (
        await apiClient.post<DataExportRequestItem>(endpoints.dataExportRequests, {
          export_type: exportType,
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['data-export-requests'] }),
  });
}

export interface DataExportDownload {
  id: string;
  export_type: DataExportType;
  status: string;
  generated_at: string;
  expires_at: string | null;
  content: {
    patient: {
      health_id: string | null;
      display_name: string;
      date_of_birth: string | null;
      sex: string | null;
    } | null;
    sections: Record<string, Record<string, unknown>[]>;
  };
}

export function useDownloadDataExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (
        await apiClient.get<{ status: string; export: DataExportDownload; message: string }>(
          endpoints.downloadDataExport(id),
        )
      ).data.export,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['data-export-requests'] }),
  });
}

export interface CorrectionRequestPayload {
  resource_type: string;
  resource_id: string;
  reason: string;
}

export interface CorrectionRequestItem {
  id: string;
  patient_id: string;
  requested_by_user_id: string;
  resource_type: string;
  resource_id: string;
  reason: string;
  supporting_document_id: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useCreateCorrectionRequest() {
  return useMutation({
    mutationFn: async (payload: CorrectionRequestPayload) =>
      (await apiClient.post<CorrectionRequestItem>(endpoints.correctionRequests, payload)).data,
  });
}
/** Notification Center — GET /mobile/notifications. Backed by the patient's +
 * their linked user's real notification records (see MobileNotificationController
 * on the API side); `category` is always one of appointments|health|messages|system. */
export interface NotificationItem {
  id: string;
  type: string;
  category: 'appointments' | 'health' | 'messages' | 'system';
  title: string;
  message: string;
  severity: 'high' | 'medium' | 'normal' | string;
  action_url: string | null;
  action_label: string | null;
  read: boolean;
  created_at: string | null;
}

export interface NotificationsResponse {
  data: NotificationItem[];
  unread_count: number;
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () =>
      (
        await apiClient.get<NotificationsResponse>(endpoints.notifications, {
          params: { limit: 50 },
        })
      ).data,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post(endpoints.markNotificationRead(id))).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiClient.post(endpoints.markAllNotificationsRead)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
/** Broader appointment list — used by the Messages "new conversation" picker
 * (any appointment can be the care-relationship proof for starting a thread
 * with its provider, not just the next 3 upcoming ones). */
export function useAppointmentsForMessaging() {
  return useQuery({
    queryKey: ['appointments', 'all', 'messaging'],
    queryFn: async () =>
      (
        await apiClient.get<PaginatedAppointments>(endpoints.appointments, {
          params: { scope: 'all', limit: 20 },
        })
      ).data,
  });
}

// ── Messaging ────────────────────────────────────────────────────────────
// Backend: routes/mobile_telehealth.php + MobileMessagingController — the
// real, additive patient-facing entry point onto the Messaging module.

export interface MessageThreadSummary {
  id: number;
  title: string;
  status: string;
  priority: string;
  thread_type: string;
  updated_at: string | null;
  unread: boolean;
  last_message: { body: string; is_mine: boolean; created_at: string | null } | null;
}

export interface ThreadMessage {
  id: number;
  is_mine: boolean;
  body: string;
  status: string;
  created_at: string | null;
}

export interface MessageThreadDetail {
  id: number;
  title: string;
  status: string;
  messages: ThreadMessage[];
}

export function useMessageThreads() {
  return useQuery({
    queryKey: ['message-threads'],
    queryFn: async () =>
      (await apiClient.get<{ data: MessageThreadSummary[] }>(endpoints.messageThreads)).data.data,
  });
}

export function useMessageThread(id: number | null) {
  return useQuery({
    queryKey: ['message-threads', id],
    queryFn: async () =>
      (await apiClient.get<{ data: MessageThreadDetail }>(endpoints.messageThread(id as number))).data
        .data,
    enabled: id !== null,
  });
}

export function useSendThreadMessage(threadId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) =>
      (
        await apiClient.post<{ data: ThreadMessage }>(
          endpoints.sendThreadMessage(threadId as number),
          { body },
        )
      ).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-threads'] });
    },
  });
}

export function useStartMessageThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { appointment_id: string; body: string }) =>
      (await apiClient.post<{ data: MessageThreadDetail }>(endpoints.messageThreads, payload)).data
        .data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-threads'] });
    },
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Pharmacy / Medicine Finder
 * Mirrors the payloads built by MobilePharmacyController. Category and stock
 * values are the backed values of App\Enums\MedicineCategory and
 * App\Enums\PharmacyStockStatus — keep them in step with those enums.
 * ──────────────────────────────────────────────────────────────────────────── */

export type MedicineCategoryValue =
  | 'pain_relief'
  | 'antibiotics'
  | 'diabetes'
  | 'cardio'
  | 'vitamins'
  | 'respiratory'
  | 'skin_care'
  | 'digestive'
  | 'antimalarial'
  | 'maternal_child'
  | 'other';

export type StockStatusValue = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';

export interface MedicineCategorySummary {
  value: MedicineCategoryValue;
  label: string;
  icon: string;
  medicine_count: number;
}

export interface MedicineAvailability {
  pharmacy_count: number;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  is_available: boolean;
}

export interface Medicine {
  id: string;
  name: string;
  generic_name: string;
  brand_name: string | null;
  strength: string | null;
  form: string | null;
  category: MedicineCategoryValue;
  category_label: string;
  category_icon: string;
  description: string | null;
  indications: string[];
  prescription_required: boolean;
  is_controlled: boolean;
  default_pack_size: string | null;
  pack_size_options: string[];
  price_min: number | null;
  price_max: number | null;
  currency: string;
  availability: MedicineAvailability;
}

export interface PharmacyStock {
  status: StockStatusValue;
  status_label: string;
  is_available: boolean;
  packs_available: number | null;
  pack_size: string | null;
  unit_price: number | null;
  currency: string;
  reservation_enabled: boolean;
  last_reported_at: string | null;
}

export interface NearbyPharmacy {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  verification_status: string | null;
  distance_km: number;
  is_open: boolean | null;
  opens_at: string | null;
  closes_at: string | null;
  is_24_hours: boolean;
  stock: PharmacyStock | null;
}

export interface MedicineReservation {
  id: string;
  reference: string;
  status: string;
  status_label: string;
  is_open: boolean;
  is_cancellable: boolean;
  quantity: number;
  pack_size: string | null;
  unit_price: number | null;
  total_price: number | null;
  currency: string;
  prescription_id: string | null;
  patient_note: string | null;
  pharmacy_note: string | null;
  expires_at: string | null;
  created_at: string | null;
  medicine: { id: string; name: string; generic_name: string } | null;
  pharmacy: { id: string; name: string; city: string | null; phone: string | null } | null;
}

export interface PharmacyPrescriptionOption {
  id: string;
  facility_name: string | null;
  status: string;
  item_count: number;
  prescribed_at: string | null;
  expires_at: string | null;
}

export function useMedicineCategories() {
  return useQuery({
    queryKey: ['pharmacy', 'categories'],
    queryFn: async () =>
      (
        await apiClient.get<{
          data: { total_medicines: number; categories: MedicineCategorySummary[] };
        }>(endpoints.pharmacyCategories)
      ).data.data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMedicineSearch(params: { q?: string; category?: MedicineCategoryValue | null }) {
  const q = params.q?.trim() ?? '';
  const category = params.category ?? null;

  return useQuery({
    queryKey: ['pharmacy', 'medicines', q, category],
    queryFn: async () =>
      (
        await apiClient.get<{ data: Medicine[] }>(endpoints.medicineSearch, {
          params: {
            ...(q ? { q } : {}),
            ...(category ? { category } : {}),
            per_page: 20,
          },
        })
      ).data.data,
  });
}

export function useMedicine(medicineId: string | undefined) {
  return useQuery({
    queryKey: ['pharmacy', 'medicine', medicineId],
    enabled: !!medicineId,
    queryFn: async () =>
      (await apiClient.get<{ data: Medicine }>(endpoints.medicine(medicineId as string))).data.data,
  });
}

export function useNearbyPharmacies(args: {
  lat: number;
  lng: number;
  radiusKm: number;
  medicineId?: string | null;
  onlyStocking?: boolean;
  enabled?: boolean;
}) {
  const { lat, lng, radiusKm, medicineId = null, onlyStocking = false, enabled = true } = args;

  return useQuery({
    queryKey: ['pharmacy', 'nearby', lat, lng, radiusKm, medicineId, onlyStocking],
    enabled,
    queryFn: async () =>
      (
        await apiClient.get<{ data: NearbyPharmacy[] }>(endpoints.pharmacyNearby, {
          params: {
            lat,
            lng,
            radius_km: radiusKm,
            ...(medicineId ? { medicine_id: medicineId } : {}),
            ...(onlyStocking ? { only_stocking: 1 } : {}),
          },
        })
      ).data.data,
  });
}

export function useMedicineReservations(scope: 'all' | 'open' = 'all') {
  return useQuery({
    queryKey: ['pharmacy', 'reservations', scope],
    queryFn: async () =>
      (
        await apiClient.get<{ data: MedicineReservation[] }>(endpoints.medicineReservations, {
          params: { scope },
        })
      ).data.data,
  });
}

export interface ReserveMedicineInput {
  medicine_id: string;
  care_facility_id: string;
  quantity?: number;
  pack_size?: string | null;
  prescription_id?: string | null;
  note?: string | null;
}

export function useReserveMedicine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ReserveMedicineInput) =>
      (
        await apiClient.post<{ data: MedicineReservation }>(endpoints.medicineReservations, input)
      ).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'reservations'] });
    },
  });
}

export function useCancelMedicineReservation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { id: string; reason?: string }) =>
      (
        await apiClient.post<{ data: MedicineReservation }>(
          endpoints.cancelMedicineReservation(args.id),
          { reason: args.reason ?? null },
        )
      ).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy', 'reservations'] });
    },
  });
}

/** The patient's own prescriptions — attachable to a prescription-only reservation. */
export function usePrescriptionsForReservation(enabled = true) {
  return useQuery({
    queryKey: ['prescriptions', 'list'],
    enabled,
    queryFn: async () =>
      (
        await apiClient.get<{ data: PharmacyPrescriptionOption[] }>(endpoints.prescriptions, {
          params: { limit: 20 },
        })
      ).data.data,
  });
}

// ---------------------------------------------------------------------------
// Registration — POST /mobile/auth/register (app/(auth)/signup.tsx). Kept
// additive-only per FILE OWNERSHIP; the auth store itself isn't touched —
// the screen stores the returned token + flips auth status directly via
// useAuthStore.getState()/.setState(), same as tokenStorage is already used
// outside the store in lib/api/client.ts.
// ---------------------------------------------------------------------------

export function useRegisterPatient() {
  return useMutation({
    mutationFn: async (payload: RegisterPatientPayload) =>
      (await apiClient.post<RegisterPatientResponse>(endpoints.register, payload)).data,
  });
}

// ---------------------------------------------------------------------------
// Forgot / Reset Password — app/(auth)/forgot-password.tsx. Kept additive per
// FILE OWNERSHIP. Public, pre-auth endpoints (no bearer token attached).
// ---------------------------------------------------------------------------

interface ApiMessageResponse {
  message: string;
}

export interface ResetPasswordPayload {
  email: string;
  code: string;
  password: string;
  password_confirmation: string;
}

/** POST /mobile/auth/forgot-password — requests a 6-digit reset code by email. */
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (email: string) =>
      (await apiClient.post<ApiMessageResponse>(endpoints.forgotPassword, { email })).data,
  });
}

/** POST /mobile/auth/reset-password — submits the emailed code + new password. */
export function useResetPassword() {
  return useMutation({
    mutationFn: async (payload: ResetPasswordPayload) =>
      (await apiClient.post<ApiMessageResponse>(endpoints.resetPassword, payload)).data,
  });
}
// ---------------------------------------------------------------------------
// Labs — lab orders + full parameter results (screens: app/labs/*).
// Distinct from Records/Timeline, which only ever surfaces a resulted lab
// order as a single feed row with no reference ranges/flags. Backed by
// GET /mobile/labs and GET /mobile/labs/{id} (MobileLabController).
// ---------------------------------------------------------------------------

export type LabOrderStatus = 'pending' | 'collected' | 'processing' | 'resulted' | 'cancelled';
export type LabUrgency = 'routine' | 'urgent' | 'stat';

export interface LabOrderSummary {
  id: string;
  test_name: string;
  test_code: string | null;
  urgency: string;
  status: string;
  status_color: 'success' | 'info' | 'warning' | 'default';
  facility_name: string | null;
  ordered_at: string | null;
  resulted_at: string | null;
  result_count: number;
  has_abnormal: boolean;
}

export interface LabResultParameter {
  id: string;
  parameter_name: string;
  value: string;
  unit: string | null;
  reference_range: string | null;
  flag: string | null;
  flag_label: string;
  is_abnormal: boolean;
  notes: string | null;
  resulted_at: string | null;
}

export interface LabOrderDetail extends LabOrderSummary {
  clinical_indication: string | null;
  notes: string | null;
  collected_at: string | null;
  results: LabResultParameter[];
}

export interface PaginatedLabOrders {
  data: LabOrderSummary[];
  pagination: { total: number; per_page: number; current_page: number; last_page: number };
}

/** List of the patient's lab orders, optionally filtered by status
 * ('pending' | 'collected' | 'processing' | 'resulted' | 'cancelled'). */
export function useLabOrders(status?: string) {
  return useQuery({
    queryKey: ['labs', status ?? 'all'],
    queryFn: async () =>
      (
        await apiClient.get<PaginatedLabOrders>(endpoints.labs, {
          params: status ? { status } : undefined,
        })
      ).data,
  });
}

/** Single lab order with its full set of result parameters (value, unit,
 * reference range, abnormal flag). */
export function useLabOrderDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['labs', id],
    queryFn: async () =>
      (await apiClient.get<{ data: LabOrderDetail }>(endpoints.lab(id as string))).data.data,
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Medical record export — direct PDF/FHIR download (app/export-records.tsx).
// Distinct from the Privacy hub's data-export-requests approval workflow
// (useDataExportRequests et al. above): this is an immediate, unmoderated
// export of the patient's own full record, matching
// POST /mobile/medical-records/export/{pdf,fhir}.
// ---------------------------------------------------------------------------

/** POST /mobile/medical-records/export/pdf — the generated PDF is returned
 * inline as base64 (no server path the client could otherwise reach). */
export interface MedicalRecordPdfExport {
  message: string;
  filename: string;
  mime_type: string;
  file_base64: string;
}

export function useExportMedicalRecordsPdf() {
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post<MedicalRecordPdfExport>(endpoints.exportRecordsPdf, {})).data,
  });
}

/** POST /mobile/medical-records/export/fhir — the response body IS the FHIR
 * R4 Bundle (no wrapper), ready to be written to disk and shared as-is. */
export interface MedicalRecordFhirExport {
  resourceType: 'Bundle';
  id: string;
  type: string;
  timestamp: string;
  total: number;
  entry: Array<{ resource: Record<string, unknown> }>;
}

export function useExportMedicalRecordsFhir() {
  return useMutation({
    mutationFn: async () =>
      (await apiClient.post<MedicalRecordFhirExport>(endpoints.exportRecordsFhir, {})).data,
  });
}
// ── Help & Support ──────────────────────────────────────────────────────
// Backed by App\Http\Controllers\Api\Mobile\MobileSupportController, wrapping
// the platform's existing Support/helpdesk module (App\Modules\Support) for
// the first time on the patient-facing side. See routes/mobile_support.php.

export type SupportTicketCategory =
  | 'technical_issue'
  | 'appointment_issue'
  | 'billing_question'
  | 'account_access'
  | 'medical_records'
  | 'prescription_pharmacy'
  | 'other';

/** open | assigned | escalated | resolved */
export type SupportTicketStatus = string;

export interface SupportContactInfo {
  /** null when the platform has no support email configured — never fabricated. */
  email: string | null;
  /** null when the platform has no support phone configured — never fabricated. */
  phone: string | null;
  categories: SupportTicketCategory[];
}

export function useSupportContact() {
  return useQuery({
    queryKey: ['support', 'contact'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () =>
      (await apiClient.get<{ data: SupportContactInfo }>(endpoints.supportContact)).data.data,
  });
}

export interface SupportTicketSummary {
  id: string;
  category: SupportTicketCategory;
  priority: string;
  status: SupportTicketStatus;
  subject: string;
  description: string;
  sla_due_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketMessage {
  id: string;
  sender_type: string;
  is_mine: boolean;
  body: string;
  created_at: string;
}

export interface SupportTicketDetail extends SupportTicketSummary {
  messages: SupportTicketMessage[];
}

export function useSupportTickets() {
  return useQuery({
    queryKey: ['support', 'tickets'],
    queryFn: async () =>
      (await apiClient.get<{ data: SupportTicketSummary[] }>(endpoints.supportTickets)).data.data,
  });
}

export function useSupportTicket(id: string | null) {
  return useQuery({
    queryKey: ['support', 'tickets', id],
    enabled: !!id,
    queryFn: async () =>
      (await apiClient.get<{ data: SupportTicketDetail }>(endpoints.supportTicket(id as string))).data
        .data,
  });
}

export interface CreateSupportTicketInput {
  category: SupportTicketCategory;
  subject: string;
  description: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSupportTicketInput) =>
      (await apiClient.post<{ data: SupportTicketSummary }>(endpoints.supportTickets, input)).data
        .data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] }),
  });
}

export function useSendSupportTicketMessage(ticketId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) =>
      (
        await apiClient.post<{ data: SupportTicketMessage }>(
          endpoints.supportTicketMessages(ticketId as string),
          { body },
        )
      ).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support', 'tickets', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['support', 'tickets'] });
    },
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Blood Finder
 * Mirrors the payloads built by MobileBloodController (routes/mobile_blood.php).
 * Group / component / status values are the backed values of
 * App\Enums\BloodGroup, App\Enums\BloodComponentType, App\Enums\BloodRequestStatus
 * and App\Enums\BloodRequestUrgency — keep them in step with those enums.
 * ──────────────────────────────────────────────────────────────────────────── */

export type BloodGroupValue = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type BloodComponentValue = 'whole_blood' | 'red_cells' | 'platelets' | 'plasma';

export type BloodUrgencyValue = 'routine' | 'urgent' | 'emergency';

export interface BloodGroupOption {
  value: BloodGroupValue;
  label: string;
  can_receive_from: string[];
  facility_count: number;
}

export interface BloodComponentOption {
  value: BloodComponentValue;
  label: string;
  icon: string;
  facility_count: number;
}

export interface BloodFinderOptions {
  blood_groups: BloodGroupOption[];
  component_types: BloodComponentOption[];
  urgencies: { value: BloodUrgencyValue; label: string }[];
  max_units: number;
}

export interface BloodStockSnapshot {
  id: string;
  blood_group: BloodGroupValue;
  component_type: BloodComponentValue;
  component_label: string | null;
  units_range: string | null;
  /** Facility-reported availability ('available' is all the search returns). */
  status: string;
  /** How recently the facility updated the row: fresh | recent | stale. */
  freshness: string;
  last_updated_at: string | null;
}

export interface BloodBankResult {
  id: string;
  name: string;
  facility_type: string;
  city: string | null;
  region: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  emergency_contact: string | null;
  verification_status: string | null;
  /** Null when the search ran without an origin (nationwide). */
  distance_km: number | null;
  availability: BloodStockSnapshot | null;
}

export interface BloodRequest {
  id: string;
  reference: string;
  status: string;
  status_label: string;
  is_open: boolean;
  is_cancellable: boolean;
  blood_group: BloodGroupValue;
  component_type: BloodComponentValue;
  component_label: string;
  quantity: number;
  urgency: BloodUrgencyValue;
  contact_phone: string | null;
  patient_note: string | null;
  facility_note: string | null;
  needed_by: string | null;
  expires_at: string | null;
  created_at: string | null;
  facility: {
    id: string;
    name: string;
    city: string | null;
    address: string | null;
    phone: string | null;
  } | null;
}

export function useBloodOptions() {
  return useQuery({
    queryKey: ['blood', 'options'],
    queryFn: async () =>
      (await apiClient.get<{ data: BloodFinderOptions }>(endpoints.bloodOptions)).data.data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBloodSearch(args: {
  bloodGroup: BloodGroupValue | null;
  componentType: BloodComponentValue;
  lat: number;
  lng: number;
  radiusKm: number;
  enabled?: boolean;
}) {
  const { bloodGroup, componentType, lat, lng, radiusKm, enabled = true } = args;

  return useQuery({
    queryKey: ['blood', 'search', bloodGroup, componentType, lat, lng, radiusKm],
    enabled: enabled && !!bloodGroup,
    queryFn: async () =>
      (
        await apiClient.get<{ data: BloodBankResult[] }>(endpoints.bloodSearch, {
          params: {
            blood_group: bloodGroup,
            component_type: componentType,
            lat,
            lng,
            radius_km: radiusKm,
          },
        })
      ).data.data,
  });
}

export function useBloodRequests(scope: 'all' | 'open' = 'all') {
  return useQuery({
    queryKey: ['blood', 'requests', scope],
    queryFn: async () =>
      (
        await apiClient.get<{ data: BloodRequest[] }>(endpoints.bloodRequests, {
          params: { scope },
        })
      ).data.data,
  });
}

export interface CreateBloodRequestInput {
  care_facility_id: string;
  blood_group: BloodGroupValue;
  component_type?: BloodComponentValue;
  quantity?: number;
  urgency?: BloodUrgencyValue;
  contact_phone?: string | null;
  note?: string | null;
}

export function useCreateBloodRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBloodRequestInput) =>
      (await apiClient.post<{ data: BloodRequest }>(endpoints.bloodRequests, input)).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blood', 'requests'] });
    },
  });
}

export function useCancelBloodRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { id: string; reason?: string }) =>
      (
        await apiClient.post<{ data: BloodRequest }>(endpoints.cancelBloodRequest(args.id), {
          reason: args.reason ?? null,
        })
      ).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blood', 'requests'] });
    },
  });
}

// ── Facility detail + clinician / specialist directory ───────────────────
// Backend: routes/mobile_providers.php + MobileProviderController, plus the
// pre-existing (until now unused) GET /mobile/facilities/{id} detail endpoint.
// These close the "which doctor is this slot with?" gap: AppointmentSlotOption
// has always carried provider_id, but nothing ever resolved it to a person.

export interface CareFacilityService {
  service_name: string;
  service_category: string | null;
  specialty: string | null;
  appointment_required: boolean | null;
  walk_in_allowed: boolean | null;
  availability_status: string | null;
}

export interface CareFacilityHour {
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean | null;
  is_24_hours: boolean | null;
  service_context: string | null;
}

export interface CareFacilityInsurance {
  insurance_name: string;
  cashless_available: boolean | null;
  status: string | null;
}

/** Full GET /mobile/facilities/{id} payload — richer than CareFacilitySummary. */
export interface CareFacilityDetail extends Omit<CareFacilitySummary, 'listing_status'> {
  description: string | null;
  services: CareFacilityService[];
  hours: CareFacilityHour[];
  insurances: CareFacilityInsurance[];
}

export interface ProviderCredentialSummary {
  type: string;
  issuing_body: string | null;
}

export interface ProviderLicenseSummary {
  profession: string | null;
  issuing_body: string | null;
}

/**
 * One clinician in the directory. `id` is a users.id — deliberately the same
 * identifier as `AppointmentSlotOption.provider_id`, so a slot can be matched
 * to a person client-side without another round trip.
 */
export interface FacilityProviderSummary {
  id: string;
  staff_profile_id: string;
  name: string;
  job_title: string | null;
  department: string | null;
  profession: string | null;
  employment_type: string | null;
  facility_id: string;
  care_facility_id: string;
  facility_name: string;
  city: string | null;
  credentials: ProviderCredentialSummary[];
  licenses: ProviderLicenseSummary[];
}

export interface FacilityProvidersResponse {
  /** Internal `facilities` id — null when the directory entry has no linked facility. */
  facility_id: string | null;
  care_facility_id: string;
  facility_name: string;
  data: FacilityProviderSummary[];
}

export interface ProviderDetail extends FacilityProviderSummary {
  next_slots: AppointmentSlotOption[];
  /**
   * The caller's own most recent appointment with this clinician, or null.
   * Messaging requires an existing care relationship (enforced by
   * MobileMessagingController::start), so this is what makes the "Message"
   * action actually work — or tells the UI to route to booking first.
   */
  messaging_appointment_id: string | null;
}

/** Full facility profile — powers app/facility/[id].tsx. */
export function useFacilityDetail(careFacilityId: string | undefined) {
  return useQuery({
    queryKey: ['facilities', 'detail', careFacilityId],
    queryFn: async () =>
      (await apiClient.get<{ data: CareFacilityDetail }>(endpoints.facility(careFacilityId as string)))
        .data.data,
    enabled: !!careFacilityId,
  });
}

/** Clinicians practising at one directory facility. */
export function useFacilityProviders(careFacilityId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['facilities', careFacilityId, 'providers'],
    queryFn: async () =>
      (
        await apiClient.get<FacilityProvidersResponse>(
          endpoints.facilityProviders(careFacilityId as string),
        )
      ).data,
    enabled: !!careFacilityId && enabled,
  });
}

/** One clinician's profile + their next open slots — powers app/doctor/[id].tsx. */
export function useProviderDetail(providerId: string | undefined) {
  return useQuery({
    queryKey: ['providers', 'detail', providerId],
    queryFn: async () =>
      (await apiClient.get<{ data: ProviderDetail }>(endpoints.provider(providerId as string))).data
        .data,
    enabled: !!providerId,
  });
}
