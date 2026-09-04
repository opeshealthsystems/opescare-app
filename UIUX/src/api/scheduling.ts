/**
 * Provider/facility directory, availability and the appointment lifecycle
 * (CARE-001 … CARE-014).
 */
import { getOne, getPage, patch, post, Page, PageQuery } from './portal';

export type VisitMode = 'in_person' | 'telemedicine';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type AppointmentType =
  | 'consultation'
  | 'follow_up'
  | 'vaccination'
  | 'procedure'
  | 'lab'
  | 'imaging'
  | 'telemedicine'
  | 'antenatal'
  | 'other';

export type PortalAppointment = {
  id: string;
  provider_id: number | null;
  provider_name: string | null;
  provider_specialty: string | null;
  provider_photo_url: string | null;
  facility_id: string | null;
  facility_name: string | null;
  department_id: string | null;
  department_name: string | null;
  location: string | null;
  scheduled_at: string;
  duration_minutes: number;
  appointment_type: AppointmentType;
  visit_mode: VisitMode;
  reason: string | null;
  status: AppointmentStatus;
  checked_in_at: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  rescheduled_from_id: string | null;
  booking_channel: string;
  is_upcoming: boolean;
  /** Drive the action buttons off these rather than re-deriving the rules. */
  can_cancel: boolean;
  can_reschedule: boolean;
  can_check_in: boolean;
  created_at: string;
};

export type AppointmentSummary = {
  upcoming: number;
  completed: number;
  cancelled: number;
  rescheduled: number;
  no_show: number;
  total: number;
};

export type PortalFacility = {
  id: string;
  code: string;
  name: string;
  facility_type: 'hospital' | 'clinic' | 'health_centre' | 'laboratory' | 'imaging_centre' | 'pharmacy';
  city: string | null;
  region: string | null;
  country: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number;
  review_count: number;
  is_24_7: boolean;
  accepts_insurance: boolean;
};

/**
 * A department of the single hospital. OPES is one hospital with departments,
 * so this — not a facility — is the unit of "find care" discovery and the
 * dimension appointments and messages route on.
 */
export type PortalDepartment = {
  id: string;
  code: string;
  name: string;
  name_fr: string | null;
  department_type: DepartmentType;
  location: string | null;
  phone: string | null;
  email: string | null;
  rating: number;
  review_count: number;
  is_24_7: boolean;
  accepts_insurance: boolean;
  provider_count: number;
  /** The one hospital every department belongs to. */
  hospital_id: string | null;
  hospital_name: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type DepartmentType = 'clinic' | 'laboratory' | 'pharmacy' | 'imaging' | 'emergency';

export type PortalDepartmentDetail = PortalDepartment & {
  about: string | null;
  services: string[];
  opening_hours: Record<string, string>;
  head: string | null;
  providers: PortalProvider[];
};

export type PortalProvider = {
  /** The staff user id — this is what you pass as `provider_id` when booking. */
  id: number;
  profile_id: string;
  name: string;
  title: string | null;
  specialty: string | null;
  subspecialty: string | null;
  photo_url: string | null;
  rating: number;
  review_count: number;
  years_experience: number;
  consultation_fee: number;
  currency: string;
  facility_id: string | null;
  facility_name: string | null;
  /** Single hospital: the department is what distinguishes one doctor's service line from another. */
  department_id: string | null;
  department_name: string | null;
  room: string | null;
  accepts_new_patients: boolean;
  offers_telemedicine: boolean;
  is_online: boolean;
};

export type PortalProviderDetail = PortalProvider & {
  bio: string | null;
  languages: string[];
  qualifications: string[];
  department_name: string | null;
  facility: PortalFacility | null;
};

export type PortalFacilityDetail = PortalFacility & {
  about: string | null;
  services: string[];
  opening_hours: Record<string, string>;
  providers: PortalProvider[];
};

export type AvailabilitySlot = {
  id: string;
  provider_id: number;
  facility_id: string | null;
  slot_start: string;
  slot_end: string;
  duration_minutes: number;
  visit_mode: VisitMode;
  status: 'available' | 'booked' | 'blocked';
  is_bookable: boolean;
};

export type AvailabilityDay = {
  date: string;
  available_count: number;
  slots: AvailabilitySlot[];
};

export type ProviderAvailability = {
  provider_id: number;
  from: string;
  to: string;
  total: number;
  days: AvailabilityDay[];
};

export type SpecialtyCount = { specialty: string; provider_count: number };

export type ProviderQuery = PageQuery & {
  q?: string;
  specialty?: string;
  facility_id?: string;
  /** Department id or code ("DEP-CAR") — the primary way to narrow providers. */
  department_id?: string;
  telemedicine?: boolean;
  accepting?: boolean;
  sort?: 'rating' | 'experience';
};

export type FacilityQuery = PageQuery & {
  q?: string;
  city?: string;
  facility_type?: PortalFacility['facility_type'];
};

export type DepartmentQuery = PageQuery & {
  q?: string;
  department_type?: DepartmentType;
  open_now?: boolean;
};

export type SlotQuery = {
  /** A single day. Mutually exclusive with from/to. */
  date?: string;
  from?: string;
  to?: string;
  visit_mode?: VisitMode;
  include_booked?: boolean;
};

export type AppointmentQuery = PageQuery & {
  scope?: 'upcoming' | 'past' | 'today' | 'all';
  /** Comma-separated statuses, e.g. "scheduled,confirmed". */
  status?: string;
  from?: string;
  to?: string;
};

/**
 * Book by slot (preferred — it takes a row lock, so the slot cannot be
 * double-booked) or by an explicit provider + time.
 */
export type BookAppointmentInput =
  | {
      slot_id: string;
      appointment_type?: AppointmentType;
      visit_mode?: VisitMode;
      reason?: string;
      facility_id?: string;
    }
  | {
      provider_id: number;
      scheduled_at: string;
      appointment_type?: AppointmentType;
      visit_mode?: VisitMode;
      reason?: string;
      facility_id?: string;
    };

export type RescheduleInput = { slot_id: string; reason?: string } | { scheduled_at: string; reason?: string };

export type RescheduleResult = {
  appointment: PortalAppointment;
  previous_appointment: PortalAppointment;
};

export type CheckInResult = {
  appointment: PortalAppointment;
  queue_position: number;
  estimated_wait_minutes: number;
};

// ── Directory ────────────────────────────────────────────────────────────

export const findProviders = (query: ProviderQuery = {}) =>
  getPage<PortalProvider>('/patient/providers', query);

export const fetchSpecialties = () => getOne<SpecialtyCount[]>('/patient/providers/specialties');

export const fetchProvider = (providerId: number) =>
  getOne<PortalProviderDetail>(`/patient/providers/${providerId}`);

export const fetchProviderSlots = (providerId: number, query: SlotQuery = {}) =>
  getOne<ProviderAvailability>(`/patient/providers/${providerId}/slots`, query);

export const findDepartments = (query: DepartmentQuery = {}) =>
  getPage<PortalDepartment>('/patient/departments', query);

export const fetchDepartment = (departmentId: string) =>
  getOne<PortalDepartmentDetail>(`/patient/departments/${departmentId}`);

export const findFacilities = (query: FacilityQuery = {}) =>
  getPage<PortalFacility>('/patient/facilities', query);

export const fetchFacility = (facilityId: string) =>
  getOne<PortalFacilityDetail>(`/patient/facilities/${facilityId}`);

// ── Appointments ─────────────────────────────────────────────────────────

export const fetchAppointments = (query: AppointmentQuery = {}) =>
  getPage<PortalAppointment>('/patient/appointments', query);

export const fetchAppointmentSummary = () =>
  getOne<AppointmentSummary>('/patient/appointments/summary');

export const fetchAppointment = (id: string) =>
  getOne<PortalAppointment>(`/patient/appointments/${id}`);

/** Throws PortalConflictError('Slot Unavailable') if the slot was taken first. */
export const bookAppointment = (input: BookAppointmentInput) =>
  post<PortalAppointment>('/patient/appointments', input as Record<string, unknown>);

export const rescheduleAppointment = (id: string, input: RescheduleInput) =>
  patch<RescheduleResult>(`/patient/appointments/${id}/reschedule`, input as Record<string, unknown>);

export const cancelAppointment = (id: string, reason?: string) =>
  post<PortalAppointment>(`/patient/appointments/${id}/cancel`, reason ? { reason } : {});

/** Only opens on the day of the appointment; otherwise throws PortalConflictError. */
export const checkInAppointment = (id: string) =>
  post<CheckInResult>(`/patient/appointments/${id}/check-in`);

export type { Page, PageQuery };
