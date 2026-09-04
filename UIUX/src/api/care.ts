/**
 * Care delivery: the live clinic queue (CARE-015), care-plan detail with its
 * patient writes (CARE-019) and referral detail (CARE-020).
 *
 * Every endpoint here resolves the patient from the bearer token — no patient
 * id is ever sent from the app.
 */
import { getOne, patch, post } from './portal';
import type { PortalAppointment } from './scheduling';
import type { PortalDocument } from './records';

// ── Clinic queue ──────────────────────────────────────────────────────────

export type QueueStatus = 'waiting' | 'called' | 'in_room' | 'completed' | 'left';

export type QueueState = {
  entry_id: string;
  appointment_id: string;
  /** Stable per-provider, per-day ticket number. */
  queue_number: number;
  /** 1-based place in the line right now; 0 once the entry closes. */
  position: number;
  ahead_count: number;
  behind_count: number;
  total_in_queue: number;
  room: string | null;
  status: QueueStatus;
  checked_in_at: string | null;
  called_at: string | null;
  estimated_wait_min_minutes: number;
  estimated_wait_max_minutes: number;
};

export type QueueSnapshot = {
  appointment: PortalAppointment;
  queue: QueueState;
};

/** Throws PortalConflictError('Not Checked In') if the patient has no entry. */
export const fetchQueue = (appointmentId: string) =>
  getOne<QueueSnapshot>(`/patient/appointments/${appointmentId}/queue`);

export const leaveQueue = (appointmentId: string) =>
  post<QueueSnapshot>(`/patient/appointments/${appointmentId}/queue/leave`);

// ── Care plans ────────────────────────────────────────────────────────────

export type CarePlanGoalStatus = 'not_started' | 'in_progress' | 'met';
export type CarePlanTaskStatus = 'active' | 'scheduled' | 'completed';

export type CarePlanGoal = {
  id: string;
  title: string;
  description: string | null;
  status: CarePlanGoalStatus;
  completed_at: string | null;
};

export type CarePlanTask = {
  id: string;
  title: string;
  description: string | null;
  frequency: string | null;
  due_date: string | null;
  status: CarePlanTaskStatus;
  /** An Icon glyph name chosen clinician-side; validate before rendering. */
  icon: string;
};

export type PortalCarePlanDetail = {
  id: string;
  problem: string | null;
  priority: string | null;
  goal: string | null;
  interventions: string[];
  evaluation: string | null;
  patient_notes: string | null;
  target_date: string | null;
  duration_weeks: number | null;
  status: string;
  acknowledged_at: string | null;
  reminders_enabled: boolean;
  created_at: string | null;
  provider_name: string | null;
  provider_specialty: string | null;
  provider_photo_url: string | null;
  facility_name: string | null;
  goals: CarePlanGoal[];
  tasks: CarePlanTask[];
  goal_count: number;
  task_count: number;
};

export const fetchCarePlan = (planId: string) =>
  getOne<PortalCarePlanDetail>(`/patient/care-plans/${planId}`);

export const acknowledgeCarePlan = (planId: string) =>
  post<PortalCarePlanDetail>(`/patient/care-plans/${planId}/acknowledge`);

export const setCarePlanReminders = (planId: string, enabled: boolean) =>
  post<PortalCarePlanDetail>(`/patient/care-plans/${planId}/reminders`, { enabled });

export const updateCarePlanGoal = (goalId: string, status: CarePlanGoalStatus) =>
  patch<PortalCarePlanDetail>(`/patient/care-plan-goals/${goalId}`, { status });

export const updateCarePlanTask = (taskId: string, status: CarePlanTaskStatus) =>
  patch<PortalCarePlanDetail>(`/patient/care-plan-tasks/${taskId}`, { status });

// ── Referrals ─────────────────────────────────────────────────────────────

export type PortalReferralDetail = {
  id: string;
  referred_to: string | null;
  facility: string | null;
  specialty: string | null;
  reason: string | null;
  urgency: string | null;
  status: string;
  notes: string | null;
  clinical_summary: string | null;
  referral_type: string | null;
  referred_at: string | null;
  acknowledged_at: string | null;
  reminders_enabled: boolean;
  referrer_name: string | null;
  referrer_specialty: string | null;
  referrer_photo_url: string | null;
  letter_document_id: string | null;
  attachments: PortalDocument[];
};

export const fetchReferral = (referralId: string) =>
  getOne<PortalReferralDetail>(`/patient/referrals/${referralId}`);

/** Throws PortalConflictError('Referral Closed') on a completed/cancelled referral. */
export const acknowledgeReferral = (referralId: string) =>
  post<PortalReferralDetail>(`/patient/referrals/${referralId}/acknowledge`);

export const setReferralReminders = (referralId: string, enabled: boolean) =>
  post<PortalReferralDetail>(`/patient/referrals/${referralId}/reminders`, { enabled });
