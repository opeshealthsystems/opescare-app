/**
 * Appointment reschedule — data layer.
 *
 * Kept out of `lib/api/queries.ts` per the file-ownership rules, and out of
 * `lib/api/endpoints.ts` for the same reason: the two paths this feature needs
 * are declared here beside the hooks that call them.
 *
 * Backend: routes/mobile_appointments_reschedule.php →
 * MobileAppointmentRescheduleController.
 *
 *  - GET  /mobile/appointments/{id}/reschedule-options
 *  - POST /mobile/appointments/{id}/reschedule   { appointment_slot_id, reason? }
 *
 * Three facts about that API shape the code below:
 *
 *  1. **The options endpoint exists because the appointment payload has no
 *     facility id.** `GET /mobile/appointments/{id}` returns `facility_name`
 *     and nothing else identifying the facility, so the client cannot ask
 *     `/mobile/facilities/{id}/slots` for the right one. The server resolves it
 *     from the appointment — which is also why a reschedule can never walk an
 *     appointment to a different hospital: the client never names a facility.
 *
 *  2. **The reschedule is an atomic swap, so a failure is genuinely harmless.**
 *     Every non-2xx answer carries the appointment as it still stands
 *     (`appointment` on the error body). `rescheduleFailure()` reads it, so the
 *     screen can tell the patient the exact time they still hold rather than
 *     asserting "nothing changed" and hoping.
 *
 *  3. **Server messages are English.** `SetLocale` is registered on the `web`
 *     middleware group only (bootstrap/app.php), so `__()` inside an API
 *     controller renders in the app's default locale no matter what the patient
 *     chose. Every message the patient sees therefore comes from the app's own
 *     i18n, keyed off the machine-readable `error_code`; the server string is
 *     the last-resort fallback only.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from './client';
import type { AppointmentDetail } from './queries';

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const rescheduleEndpoints = {
  options: (id: string) => `/mobile/appointments/${id}/reschedule-options`,
  reschedule: (id: string) => `/mobile/appointments/${id}/reschedule`,
};

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/**
 * One offerable time.
 *
 * Structurally a superset of `AppointmentSlotOption` from `queries.ts`, which
 * is deliberate: it makes every slot-window helper in `bookingQueries.ts`
 * (`slotsOnDay`, `groupSlotsByPeriod`, `daysCoveredBySlots`, `localDateKey`,
 * `slotDurationMinutes`) usable here unchanged, so the reschedule picker groups
 * and labels times exactly the way the booking wizard does.
 */
export interface RescheduleSlotOption {
  id: string;
  starts_at: string;
  ends_at: string;
  available_count: number;
  provider_id: string | null;
  /** The slot this appointment is on today. Shown, never selectable. */
  is_current: boolean;
}

/** Why the server will refuse — the same code + message the POST would answer. */
export interface RescheduleBlockedReason {
  error_code: string;
  message: string;
}

export interface RescheduleOptions {
  appointment_id: string;
  can_reschedule: boolean;
  /** null when the appointment may be moved. */
  blocked_reason: RescheduleBlockedReason | null;
  current: {
    appointment_slot_id: string | null;
    scheduled_at: string | null;
    facility_name: string | null;
    provider_name: string | null;
    appointment_type: string | null;
    status: string;
  };
  slots: RescheduleSlotOption[];
}

/** The moved appointment, plus where it came from so the UI can name both times. */
export interface RescheduledAppointment extends AppointmentDetail {
  previous_scheduled_at: string | null;
  previous_appointment_slot_id: string | null;
}

export interface ReschedulePayload {
  id: string;
  appointment_slot_id: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * The picker's data. `enabled` keeps it off the wire until the patient actually
 * opens the reschedule panel — the appointment screen is opened far more often
 * to check a time than to change one.
 */
export function useRescheduleOptions(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['appointments', 'reschedule-options', id],
    queryFn: async () =>
      (await apiClient.get<{ data: RescheduleOptions }>(rescheduleEndpoints.options(id as string))).data.data,
    enabled: !!id && enabled,
    // Capacity is the whole point of this list and it moves under the patient
    // while they choose. Never serve it from cache without a refresh.
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Perform the swap.
 *
 * On success the moved appointment is written straight into the detail screen's
 * cache entry — the same key `useAppointmentDetail` reads — so the screen shows
 * the new time before the refetch lands. Everything under `['appointments']` is
 * then invalidated, which refreshes the upcoming/past board for free (both list
 * hooks share those keys).
 */
export function useRescheduleAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, appointment_slot_id, reason }: ReschedulePayload) =>
      (
        await apiClient.post<{ message: string; data: RescheduledAppointment }>(
          rescheduleEndpoints.reschedule(id),
          // Only these two fields. The patient comes from the bearer token and
          // the facility from the appointment; sending either would be ignored.
          { appointment_slot_id, reason },
        )
      ).data,
    onSuccess: (result) => {
      queryClient.setQueryData(['appointments', 'detail', result.data.id], result.data);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      // The window the patient just took a slot from is now stale for everyone.
      queryClient.invalidateQueries({ queryKey: ['facilities'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Failure → what to tell the patient
// ---------------------------------------------------------------------------

/**
 * What the server still holds for this patient after a refused reschedule.
 *
 * The controller answers every refusal with the appointment untouched, so this
 * is the authoritative "you still have X" — not an assumption made client-side.
 */
export interface RescheduleFailure {
  /** i18n key suffix under `appointments.reschedule.`. */
  key: string;
  /** The appointment as it still stands, when the server sent it. */
  appointment: AppointmentDetail | null;
  /** The server's own English message — a diagnostic, not display copy. */
  serverMessage: string | null;
}

const CODE_KEYS: Record<string, string> = {
  APPOINTMENT_NOT_FOUND: 'errNotFound',
  APPOINTMENT_CANCELLED: 'errCancelled',
  APPOINTMENT_COMPLETED: 'errCompleted',
  APPOINTMENT_NO_SHOW: 'errNoShow',
  APPOINTMENT_CHECKED_IN: 'errCheckedIn',
  APPOINTMENT_ALREADY_RESCHEDULED: 'errAlreadyMoved',
  APPOINTMENT_NOT_RESCHEDULABLE: 'errNotAllowed',
  APPOINTMENT_IN_PAST: 'errInPast',
  SLOT_NOT_FOUND: 'errSlotGone',
  SAME_SLOT: 'errSameSlot',
  FACILITY_SLOT_MISMATCH: 'errWrongFacility',
  SLOT_NOT_BOOKABLE: 'errSlotUnavailable',
  FACILITY_NOT_BOOKABLE: 'errFacilityClosed',
  SLOT_FULL: 'errSlotTaken',
};

/**
 * The i18n key suffix for one server `error_code`.
 *
 * Used on its own by the options call, which reports a refusal as data
 * (`blocked_reason`) rather than as a thrown request — same codes, same copy,
 * so the picker explains itself before the patient picks anything.
 */
export function rescheduleCodeKey(code: string | null | undefined): string {
  return (code && CODE_KEYS[code]) || 'errNotAllowed';
}

/**
 * Map a failed reschedule onto one translated message.
 *
 * Keyed on `error_code` first — the codes are a stable contract and every one
 * of them means something specific the patient can act on. HTTP status is only
 * the fallback for the shapes that carry no code: Laravel validation (422 with
 * `errors`), auth, server faults, and no-response-at-all.
 */
export function rescheduleFailure(error: unknown): RescheduleFailure {
  if (!axios.isAxiosError(error)) {
    return { key: 'errUnknown', appointment: null, serverMessage: null };
  }

  if (!error.response) {
    // No response means the request may or may not have been applied. The copy
    // for this key says exactly that and tells the patient to refresh.
    return { key: 'errNetwork', appointment: null, serverMessage: null };
  }

  const status = error.response.status;
  const body = error.response.data as
    | { error_code?: string; message?: string; appointment?: AppointmentDetail }
    | undefined;

  const appointment = body?.appointment ?? null;
  const serverMessage = body?.message ?? null;
  const code = body?.error_code;

  if (code && CODE_KEYS[code]) {
    return { key: CODE_KEYS[code], appointment, serverMessage };
  }

  if (status === 401 || status === 403) return { key: 'errAuth', appointment, serverMessage };
  if (status === 422) return { key: 'errRejected', appointment, serverMessage };
  if (status >= 500) return { key: 'errServer', appointment, serverMessage };

  return { key: 'errUnknown', appointment, serverMessage };
}

/**
 * True while the appointment is in a state the server will accept a move for.
 *
 * A client-side pre-check only — it decides whether to offer the button, never
 * whether the move happens. The server re-decides on both the options call and
 * the POST, and under a row lock at the moment of the write.
 */
export function canRescheduleStatus(status: string | null | undefined): boolean {
  const normalised = (status ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalised === 'booked' || normalised === 'confirmed' || normalised === 'scheduled';
}
