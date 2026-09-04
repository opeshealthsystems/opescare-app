/**
 * The staff (doctor) side of the appointment lifecycle.
 *
 * These are the `api/v1/appointments/*` STAFF endpoints — a different surface
 * from `src/api/scheduling.ts`, which speaks the patient-portal endpoints under
 * `api/v1/patient/*`. The two return different shapes: the portal enriches an
 * appointment with facility, provider photo and `can_*` permission flags, while
 * the staff resource is the raw clinical row plus the patient's identity.
 * Nothing here re-uses `PortalAppointment` for that reason.
 *
 * Contracts matched against `App\Http\Controllers\Api\V1\AppointmentController`
 * and `App\Http\Resources\Api\V1\AppointmentResource`.
 *
 * Deliberately NOT re-exported from `api/index.ts`: `fetchAppointment`,
 * `cancelAppointment` and `rescheduleAppointment` already exist there with the
 * portal's shapes, and `export *` would collide. Same precedent as
 * `clinical.ts` — import this module directly.
 */
import { getOne, getPage, patch, post, put, Page } from './portal';

/** Exactly the `Rule::in` list on `AppointmentController::updateStatus`. */
export type StaffAppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

/**
 * Exactly the `Rule::in` list the staff store/update endpoints validate. The
 * column itself is wider (the portal writes `lab`, `imaging`, `telemedicine`,
 * `antenatal`), so a read can legitimately return a value the staff writer
 * would reject — hence the trailing string branch rather than a closed union.
 */
export type StaffAppointmentType =
  | 'consultation'
  | 'follow_up'
  | 'vaccination'
  | 'procedure'
  | 'other'
  | (string & {});

export type StaffAppointment = {
  id: string;
  patient_id: string;
  /** Only present when the endpoint loaded the patient (schedule/show/writes). */
  patient_name?: string | null;
  patient_medical_id?: string | null;
  patient_sex?: string | null;
  patient_dob?: string | null;
  provider_id: number | null;
  provider_name: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  appointment_type: StaffAppointmentType | null;
  reason: string | null;
  status: StaffAppointmentStatus;
  visit_mode: string | null;
  location: string | null;
  room: string | null;
  priority: string | null;
  checked_in_at: string | null;
  encounter_id: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type ScheduleQuery = {
  /** Omitted = the authenticated clinician's own diary. */
  provider_id?: number;
  scope?: 'mine' | 'provider' | 'all';
  /** `YYYY-MM-DD`. Defaults to today on the server. */
  from?: string;
  /** `YYYY-MM-DD`. Defaults to `from`. */
  to?: string;
  status?: StaffAppointmentStatus[];
  per_page?: number;
  page?: number;
};

/** `GET api/v1/appointments` — a provider's diary for a date window. */
export function fetchSchedule(query: ScheduleQuery = {}): Promise<Page<StaffAppointment>> {
  return getPage<StaffAppointment>('/appointments', query as Record<string, unknown>);
}

/** `GET api/v1/appointments/{id}` */
export function fetchAppointment(id: string): Promise<StaffAppointment> {
  return getOne<StaffAppointment>(`/appointments/${id}`);
}

/**
 * `PATCH api/v1/appointments/{id}/status`. The server accepts any of the seven
 * statuses here — the guarded transitions live on the dedicated endpoints
 * below, so prefer those for check-in and no-show.
 */
export function setAppointmentStatus(
  id: string,
  status: StaffAppointmentStatus
): Promise<StaffAppointment> {
  return patch<StaffAppointment>(`/appointments/${id}/status`, { status });
}

/**
 * `POST api/v1/appointments/{id}/check-in` — 422 unless the appointment is
 * still `scheduled` or `confirmed`. Moves it to `arrived`.
 */
export function checkInAppointment(id: string): Promise<StaffAppointment> {
  return post<StaffAppointment>(`/appointments/${id}/check-in`);
}

/** `POST api/v1/appointments/{id}/no-show` — 409 if already `no_show`. */
export function markNoShow(id: string): Promise<StaffAppointment> {
  return post<StaffAppointment>(`/appointments/${id}/no-show`);
}

/** `POST api/v1/appointments/{id}/cancel` — 422 if already cancelled. */
export function cancelAppointment(id: string, reason?: string): Promise<StaffAppointment> {
  return post<StaffAppointment>(`/appointments/${id}/cancel`, reason ? { cancel_reason: reason } : {});
}

/**
 * `PUT api/v1/appointments/{id}` — the only reschedule path the staff API has.
 * It moves the appointment outright; 409 once the appointment is cancelled,
 * completed or a no-show.
 *
 * `when` is the wall-clock time the clinician picked. Verified against the live
 * API: the server parses an incoming datetime in the application timezone
 * (Africa/Douala) — sending `2027-12-30 14:30:00` stored `2027-12-30T13:30:00Z`
 * — and an explicit UTC `Z` offset is normalised the same way rather than
 * honoured, so sending `toISOString()` would shift the appointment by an hour.
 * The clinic's wall clock is therefore what goes on the wire.
 */
export function rescheduleAppointment(
  id: string,
  when: Date,
  durationMinutes?: number
): Promise<StaffAppointment> {
  return put<StaffAppointment>(`/appointments/${id}`, {
    scheduled_at: toClinicWallClock(when),
    ...(durationMinutes ? { duration_minutes: durationMinutes } : {}),
  });
}

/** `2027-12-30 14:30:00` from the local components of `d`. */
export function toClinicWallClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:00`
  );
}
