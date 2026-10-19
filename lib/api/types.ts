export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface Patient {
  health_id: string;
  display_name: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  dob: string | null;
  sex: string | null;
  blood_group: string | null;
  address: string | null;
  emergency_contact: EmergencyContact | null;
  /** Short-lived signed link to the patient's own photo, or null when none is set. */
  photo_url: string | null;
  status: string;
  allergies_count: number;
  conditions_count: number;
}

export interface AuthTokenResponse {
  status: 'authenticated' | 'refreshed';
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  patient_id: string;
}

export interface ApiErrorBody {
  message: string;
}

/** Body for POST /mobile/auth/register — see app/(auth)/signup.tsx. */
export interface RegisterPatientPayload {
  first_name: string;
  last_name: string;
  dob: string; // YYYY-MM-DD
  sex: 'male' | 'female';
  phone: string;
  email?: string;
  emergency_name: string;
  emergency_relationship: string;
  emergency_phone: string;
  password: string;
  password_confirmation: string;
}

/** Response from POST /mobile/auth/register — same token shape as login, plus the
 * freshly generated Health ID. */
export interface RegisterPatientResponse extends AuthTokenResponse {
  health_id: string;
}

/** Shape of a 422 validation failure from the Laravel API — see
 * bootstrap/app.php's global JSON exception handler. */
export interface ApiValidationErrorBody {
  message: string;
  errors?: Record<string, string[]>;
}

export interface Appointment {
  id: string;
  appointment_type: string;
  status: string;
  facility_name: string | null;
  /** Signed, absolute logo of the facility's directory listing; null when none. */
  facility_logo_url?: string | null;
  provider_name: string | null;
  scheduled_at: string | null;
  checked_in_at: string | null;
  reason: string | null;
}

export interface PaginatedAppointments {
  data: Appointment[];
  pagination: { total: number; per_page: number; current_page: number; last_page: number };
}

export interface HealthIdCard {
  health_id: string;
  display_name: string;
  sex: string | null;
  dob: string | null;
  blood_type: string | null;
  /** Short-lived signed link to the patient's own photo, or null when none is set. */
  photo_url?: string | null;
  qr_payload: string;
  status: string;
}

/** Response from POST /mobile/qr/temporary — a short-lived (15-minute) QR for record access. */
export interface TemporaryQrCode {
  qr_payload: string;
  verify_url: string;
  raw_token: string;
  expires_at: string;
  expires_in: number;
}

export interface OfficialDocument {
  id: string;
  document_type: string;
  title: string;
  facility_name: string | null;
  issued_at: string | null;
  document_number: string | null;
  verification_code: string | null;
  /**
   * Present on documents the server renders on request rather than storing.
   * A short-lived signed link: opening it builds the sheet from the record as
   * it stands now. These rows have no stored file and no detail endpoint, so
   * the verify and share actions do not apply to them.
   */
  download_url?: string | null;
}

export interface OfficialDocumentDetail extends OfficialDocument {
  expires_at: string | null;
  sensitivity_level: string | null;
  has_file: boolean;
  verify_url: string | null;
}

export interface PaginatedDocuments {
  data: OfficialDocument[];
  pagination: { total: number; per_page: number; current_page: number; last_page: number };
}

/** One row of GET /mobile/timeline — a visit, resulted lab, or issued prescription. */
export interface TimelineEvent {
  event_type: 'visit' | 'lab_result' | 'prescription';
  id: string;
  facility_name: string | null;
  occurred_at: string;
  /**
   * The endpoint's English string — "Prescription — 3 item(s)". Unchanged
   * because clients parse it. Do NOT render it: use `summary_label`.
   */
  summary: string;
  /** The same line in the patient's language, with a real plural. */
  summary_label?: string | null;
  /** Just its tail, for a row whose title already names the kind of entry. */
  detail_label?: string | null;
}

export interface TimelineResponse {
  timeline: TimelineEvent[];
}

export interface Allergy {
  id: string;
  substance: string;
  severity: string | null;
  status: string;
  recorded: string | null;
}

export interface AllergiesResponse {
  blood_group: string | null;
  allergies: Allergy[];
}

export interface ClinicalCondition {
  id: string;
  display_name: string;
  code: string | null;
  code_system: string | null;
  status: string;
  recorded: string | null;
}

export interface ClinicalResponse {
  conditions: ClinicalCondition[];
}

export interface Immunization {
  id: string;
  vaccine_name: string;
  lot_number: string | null;
  dose_number: number | null;
  administered_at: string | null;
  status: string;
}

export interface ImmunizationsResponse {
  immunizations: Immunization[];
}

// ── Family / dependents ──────────────────────────────────────────────────────
// Backend: App\Http\Controllers\Api\Mobile\MobileFamilyController + the
// X-OpesCare-Dependent act-as context. Additive: nothing above is renamed.

/** Canonical access levels. Legacy links may still carry `view_only` /
 * `guardian` from the older mobile vocabulary; treat anything but `full` as
 * read-only in the UI. */
export type FamilyAccessLevel = 'full' | 'read_only' | (string & {});

export type FamilyLinkStatus =
  | 'active'
  | 'pending_invite'
  | 'revoked'
  | 'expired'
  | 'cancelled'
  | 'declined'
  | (string & {});

/** Guardian's role toward the dependent ("I am their parent"). */
export type FamilyRelationship =
  | 'parent'
  | 'grandparent'
  | 'spouse'
  | 'sibling'
  | 'caregiver'
  | 'legal_guardian'
  | 'child'
  | 'other'
  | (string & {});

/**
 * The patient block on a family link. Carries the SAME field names as
 * `HealthIdCard` (health_id, display_name, sex, dob, blood_type, photo_url,
 * status, qr_payload) so `modelFromLive()` can render the dependent's
 * credential — plus the older list-shape names (`full_name`,
 * `date_of_birth`, `age`) a not-yet-upgraded server still sends. Read through
 * `dependentIdentity()` in familyQueries.ts, never field by field.
 */
export interface FamilyDependentPatient {
  id: string;
  health_id: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  /** YYYY-MM-DD */
  dob?: string | null;
  sex?: string | null;
  blood_type?: string | null;
  photo_url?: string | null;
  /** Identity status, as /mobile/health-id-card (`verified`, `provisional`, …). */
  status?: string | null;
  /** Null on a read-only link — the dependent's QR is not handed out. */
  qr_payload?: string | null;
  // Older list shape (pre-contract), kept so the list never goes blank.
  full_name?: string | null;
  date_of_birth?: string | null;
  age?: number | null;
}

/** One row of GET /mobile/family. */
export interface FamilyMemberLink {
  id: string;
  relationship: FamilyRelationship;
  access_level: FamilyAccessLevel;
  status: FamilyLinkStatus;
  is_pending?: boolean;
  created_at?: string | null;
  /** Set once the dependent turns 18: the link lapses at this instant unless they keep it. */
  age_transition_expires_at?: string | null;
  patient: FamilyDependentPatient | null;
  // A server that flattens the dependent's card fields onto the row.
  sex?: string | null;
  dob?: string | null;
  photo_url?: string | null;
}

export interface FamilyLinkDetail {
  id: string;
  relationship: FamilyRelationship;
  access_level: FamilyAccessLevel;
  status: FamilyLinkStatus;
  created_at: string | null;
  age_transition_expires_at: string | null;
}

export interface FamilyImmunization {
  id: string;
  vaccine_name: string;
  vaccine_code: string | null;
  dose_number: number | null;
  administered_at: string | null;
  status: string;
}

export interface FamilyUpcomingAppointment {
  id: string;
  starts_at: string | null;
  facility_name: string | null;
  provider_name: string | null;
  status: string;
  appointment_type: string | null;
}

export interface FamilyRecordsSummary {
  allergies: number;
  diagnoses: number;
  active_prescriptions: number;
  lab_results: number;
  immunizations: number;
  last_visit_at: string | null;
}

/** GET /mobile/family/members/{linkId} → `data`. */
export interface FamilyMemberDetail {
  link: FamilyLinkDetail;
  patient: FamilyDependentPatient;
  immunizations: FamilyImmunization[];
  upcoming_appointments: FamilyUpcomingAppointment[];
  records_summary: FamilyRecordsSummary | null;
}

/** GET /mobile/family/invitations — invitations THIS user sent. */
export interface FamilyOutgoingInvitation {
  id: string;
  contact: string;
  relationship: FamilyRelationship;
  method?: string;
  sent_at: string | null;
  expires_at: string | null;
}

/** GET /mobile/family/invitations/incoming — invitations addressed TO this user. */
export interface FamilyIncomingInvitation {
  id: string;
  guardian_name: string | null;
  relationship: FamilyRelationship;
  access_level: FamilyAccessLevel;
  created_at: string | null;
  expires_at: string | null;
}

/** POST /mobile/family — register a child (under 18). */
export interface RegisterChildPayload {
  first_name: string;
  last_name: string;
  /** YYYY-MM-DD */
  date_of_birth: string;
  sex: 'male' | 'female' | 'other';
  blood_group?: string;
  relationship: FamilyRelationship;
  access_level?: 'full' | 'read_only';
}

/** POST /mobile/family/invitations — invite an existing patient (an adult).
 * Exactly one of health_id / email / phone. */
export interface InviteAdultPayload {
  health_id?: string;
  email?: string;
  phone?: string;
  relationship: FamilyRelationship;
  access_level: 'full' | 'read_only';
}
