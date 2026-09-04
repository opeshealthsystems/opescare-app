/** Home dashboard, OPES Health ID, profile and notifications (CORE-006/007/008, MSG-001). */
import { getOne, getPage, post, put, Page, PageQuery } from './portal';
import type { PortalAppointment } from './scheduling';
import type { PortalPrescription, MedicationDose } from './medications';

export type HealthScore = {
  score: number;
  label: 'Good' | 'Fair' | 'Needs attention' | 'At risk';
  adherence_percent: number | null;
};

export type DashboardPatient = {
  id: string;
  name: string;
  health_id: string;
  date_of_birth: string | null;
  age: number | null;
  sex: string | null;
  blood_group: string | null;
};

export type LastCheckup = {
  encounter_id: string;
  date: string | null;
  doctor_name: string | null;
  summary: string | null;
};

export type RecentRecordType = 'lab_result' | 'imaging' | 'encounter';

export type RecentRecord = {
  type: RecentRecordType;
  id: string;
  title: string;
  subtitle: string;
  status: string;
  is_abnormal: boolean;
  occurred_at: string | null;
};

export type DashboardCounts = {
  unread_notifications: number;
  unread_messages: number;
  upcoming_appointments: number;
  unpaid_invoices: number;
  active_problems: number;
  allergies: number;
};

/** A page of the CORE-006 Health Tip carousel. Editorial content, not chart data. */
export type HealthTip = {
  id: string;
  category: string;
  title: string;
  body: string;
  /** Glyph name from `src/components/Icon.tsx`. */
  icon: string;
  /** Tint palette key from `src/theme/theme.ts`. */
  tint: string;
};

/** The alert banner at the foot of CORE-006. */
export type DashboardAlerts = {
  severity: 'normal' | 'critical';
  critical_count: number;
  warning_count: number;
  title: string;
  body: string;
};

export type PortalDashboard = {
  patient: DashboardPatient;
  greeting: string;
  health_score: HealthScore;
  health_id_status: string;
  last_checkup: LastCheckup | null;
  next_appointment: PortalAppointment | null;
  active_medications: number;
  next_dose: MedicationDose | null;
  current_medications: PortalPrescription[];
  recent_records: RecentRecord[];
  /** CORE-006 Health Tip carousel — editorial content, same for every patient. */
  health_tips: HealthTip[];
  /** CORE-006 foot-of-screen alert banner. */
  alerts: DashboardAlerts;
  counts: DashboardCounts;
  facility: { name: string; city: string | null; phone: string | null };
};

export type HealthIdAllergy = {
  allergen: string;
  severity: string;
  reaction: string | null;
};

export type HealthIdCard = {
  health_id: string;
  /** Encode this string into the QR code shown on CORE-007. */
  qr_payload: string;
  full_name: string;
  date_of_birth: string | null;
  sex: string | null;
  blood_group: string | null;
  phone: string | null;
  city: string | null;
  issued_by: string;
  status: 'verified' | 'pending' | 'suspended';
  email_verified: boolean;
  phone_verified: boolean;
  linked_at: string | null;
  emergency_contact: { name: string | null; phone: string | null; relation: string | null };
  allergies: HealthIdAllergy[];
};

export type PortalProfile = {
  account: {
    id: number;
    full_name: string;
    email: string;
    phone: string;
    gender: string | null;
    country: string | null;
    email_verified: boolean;
    phone_verified: boolean;
    last_login_at: string | null;
  };
  patient: {
    id: string;
    health_id: string;
    name: string;
    date_of_birth: string | null;
    age: number | null;
    sex: string | null;
    blood_group: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    next_of_kin_name: string | null;
    next_of_kin_phone: string | null;
    next_of_kin_relation: string | null;
  };
};

/** Only contact details are editable — name, DOB and health ID need front-desk verification. */
export type UpdateProfileInput = {
  phone?: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  next_of_kin_name?: string | null;
  next_of_kin_phone?: string | null;
  next_of_kin_relation?: string | null;
  country?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
};

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

export type PortalNotification = {
  id: string;
  category: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  action_route: string | null;
  action_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export type NotificationQuery = PageQuery & {
  unread?: boolean;
  category?: string;
};

export const fetchDashboard = () => getOne<PortalDashboard>('/patient/dashboard');

export const fetchHealthTips = () => getOne<HealthTip[]>('/patient/health-tips');

export const fetchHealthId = () => getOne<HealthIdCard>('/patient/health-id');

export const fetchProfile = () => getOne<PortalProfile>('/patient/profile');

export const updateProfile = (input: UpdateProfileInput) =>
  put<PortalProfile>('/patient/profile', input);

export const fetchNotifications = (query: NotificationQuery = {}) =>
  getPage<PortalNotification>('/patient/notifications', query);

export const markNotificationRead = (id: string) =>
  post<PortalNotification>(`/patient/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  post<{ marked_read: number }>('/patient/notifications/read-all');

export type { Page, PageQuery };

// ── CORE-008 app preferences (`/patient/settings`) ────────────────────────

export type ThemePreference = 'light' | 'dark' | 'system';
export type UnitsPreference = 'metric' | 'imperial';
export type DateFormatPreference = 'DD MMM YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type TimeFormatPreference = '12h' | '24h';

/** One persisted row per patient account — created with defaults on first read. */
export type PatientSettings = {
  language: string;
  theme: ThemePreference;
  units: UnitsPreference;
  date_format: DateFormatPreference;
  time_format: TimeFormatPreference;
  notify_appointments: boolean;
  notify_medications: boolean;
  notify_lab_results: boolean;
  notify_messages: boolean;
  notify_billing: boolean;
  channel_push: boolean;
  channel_email: boolean;
  channel_sms: boolean;
  biometric_enabled: boolean;
  two_factor_enabled: boolean;
  share_data_for_research: boolean;
};

/** The "Account Security" card on CORE-008. */
export type AccountSecurity = {
  last_login_at: string | null;
  last_login_ip: string | null;
  /** Sanctum token name — the device this session was issued to. */
  device: string | null;
  is_secure: boolean;
};

export type PortalSettings = {
  settings: PatientSettings;
  security: AccountSecurity;
};

export const fetchSettings = () => getOne<PortalSettings>('/patient/settings');

export const updateSettings = (input: Partial<PatientSettings>) =>
  put<PortalSettings>('/patient/settings', input);
