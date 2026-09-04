/**
 * Telemedicine session lifecycle (CARE-016 / 017 / 018).
 *
 * These endpoints model the *visit*: joining, the waiting queue, when it
 * actually started, how long it ran, and the clinical record it leaves behind.
 *
 * They do NOT carry audio or video. `media_available` is the server saying so
 * plainly — the app renders a labelled placeholder surface for the stream.
 */
import { getOne, post } from './portal';
import type { PortalAppointment } from './scheduling';

export type TelemedicineStatus = 'waiting' | 'active' | 'completed' | 'cancelled';
export type ConnectionQuality = 'good' | 'fair' | 'poor' | 'unknown';

export type TelemedicineSession = {
  id: string;
  appointment: PortalAppointment;
  /** Short human-quotable room handle, e.g. "OPES-4821". */
  room_code: string;
  status: TelemedicineStatus;

  patient_joined_at: string | null;
  provider_joined_at: string | null;
  provider_present: boolean;
  started_at: string | null;
  ended_at: string | null;

  /** Live for an active session, frozen once completed. */
  elapsed_seconds: number;
  duration_seconds: number;

  connection_quality: ConnectionQuality;
  connection_tested_at: string | null;

  queue_position: number;
  queue_total: number;
  estimated_wait_min_minutes: number;
  estimated_wait_max_minutes: number;

  summary: string | null;
  diagnosis: string | null;
  diagnosis_code: string | null;
  recommendations: string[];
  follow_up_weeks: number | null;
  prescription_count: number;
  document_count: number;

  patient_rating: number | null;
  patient_feedback: string | null;

  /** Always false today — there is no media transport behind this API. */
  media_available: boolean;
};

const base = (appointmentId: string) => `/patient/appointments/${appointmentId}/telemedicine`;

/** Idempotent — creates the session on first call, then records the join. */
export const joinTelemedicine = (appointmentId: string) =>
  post<TelemedicineSession>(`${base(appointmentId)}/join`, {});

export const fetchTelemedicineSession = (appointmentId: string) =>
  getOne<TelemedicineSession>(base(appointmentId));

export const testTelemedicineConnection = (appointmentId: string, quality: 'good' | 'fair' | 'poor') =>
  post<TelemedicineSession>(`${base(appointmentId)}/test-connection`, { quality });

export const leaveTelemedicine = (appointmentId: string) =>
  post<TelemedicineSession>(`${base(appointmentId)}/leave`, {});

export const endTelemedicine = (appointmentId: string) =>
  post<TelemedicineSession>(`${base(appointmentId)}/end`, {});

export const rateTelemedicine = (appointmentId: string, rating: number, feedback?: string) =>
  post<TelemedicineSession>(`${base(appointmentId)}/rate`, { rating, feedback });
