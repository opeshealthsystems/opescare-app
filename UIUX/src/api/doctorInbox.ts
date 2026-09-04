/**
 * The DOCTOR's clinical inbox — `GET/POST /doctor/*` (staff token).
 *
 * These endpoints are the token-auth twin of the desktop results inbox. Both
 * surfaces call the same `App\Domain\Worklist\Support\ResultAcknowledger`, so
 * an acknowledgement recorded from this app is literally the row the desktop
 * inbox renders: same `app_notifications` record, same `acknowledged_at` /
 * `acknowledged_by` / `acknowledged_by_name`, same RESULT_ACKNOWLEDGED audit
 * action. There is no second, mobile-only notion of "acknowledged".
 *
 * Every query is hard-scoped server-side to the token owner's own
 * notifications — a doctor can never read or acknowledge a colleague's result.
 */
import { getOne, getPageWithMeta, post } from './portal';

/** `app_notifications.severity`, straight from the server. */
export type ResultSeverity = 'critical' | 'warning' | 'success' | 'info' | string;

/** One row of the inbox: an `app_notifications` record addressed to me. */
export type InboxResult = {
  id: string;
  /** `lab_review` / `lab_result` / `laboratory` / `radiology`. */
  category: string;
  /** The server's localised label. The app prefers its own English map. */
  category_label: string;
  severity: ResultSeverity;
  priority: 'high' | 'medium' | 'low' | string;
  /** The one flag that decides how loud this row is. Server-computed. */
  is_critical: boolean;
  title: string;
  body: string | null;
  patient_id: string | null;
  patient_name: string | null;
  /** Hospital medical id, so two patients with one name stay separable. */
  patient_number: string | null;
  /** When the result was raised to me. */
  reported_at: string | null;
  read_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: number | null;
  acknowledged_by_name: string | null;
  action_route: string | null;
  action_id: string | null;
};

/** One analyte of a lab panel, with the LABORATORY's own interval and flag. */
export type InboxAnalyte = {
  id: string;
  analyte: string;
  value: string | null;
  unit: string | null;
  /** The printed interval, e.g. "13 – 17 g/dL". Null when the bench recorded none. */
  reference: string | null;
  ref_low: string | null;
  ref_high: string | null;
  /** `normal` / `low` / `high` / `critical` — the lab's flag, never derived here. */
  flag: string | null;
  is_abnormal: boolean;
  verified_by_name: string | null;
  verified_at: string | null;
  reported_at: string | null;
};

/** The record the notification was raised for. Null when it is no longer there. */
export type InboxResultContext =
  | {
      kind: 'lab';
      order_id: string;
      test_name: string | null;
      ordered_at: string | null;
      status: string | null;
      analytes: InboxAnalyte[];
    }
  | {
      kind: 'radiology';
      result_id: string;
      test_name: string | null;
      report_number: string | null;
      report_status: string | null;
      flag: string | null;
      technique: string | null;
      findings: string | null;
      impression: string | null;
      recommendation: string | null;
      reported_by_name: string | null;
      reported_at: string | null;
      analytes: InboxAnalyte[];
    };

export type InboxResultDetail = InboxResult & {
  result: InboxResultContext | null;
};

export type InboxFilter = 'all' | 'unacknowledged' | 'critical' | 'acknowledged';

export type InboxCounts = {
  all: number;
  unacknowledged: number;
  critical: number;
  acknowledged: number;
  critical_pending: number;
};

export type InboxPage = {
  rows: InboxResult[];
  counts: InboxCounts;
};

/** The doctor's landing screen, counted server-side rather than guessed. */
export type DoctorHome = {
  provider: { id: number; name: string; role: string };
  counts: {
    appointments_today: number;
    unread_messages: number;
    unacknowledged_results: number;
    critical_unacknowledged: number;
  };
  next_appointments: DoctorAppointment[];
  urgent_results: InboxResult[];
};

export type DoctorAppointment = {
  id: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status: string;
  appointment_type: string | null;
  visit_mode: string | null;
  location: string | null;
  reason: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_number: string | null;
};

export function fetchDoctorHome(): Promise<DoctorHome> {
  return getOne<DoctorHome>('/doctor/home');
}

export async function fetchResultsInbox(filter: InboxFilter = 'unacknowledged'): Promise<InboxPage> {
  const res = await getPageWithMeta<InboxResult, { counts: InboxCounts }>('/doctor/results-inbox', {
    filter: filter === 'all' ? undefined : filter,
  });
  return { rows: res.data, counts: res.meta.counts };
}

export function fetchResult(id: string): Promise<InboxResultDetail> {
  return getOne<InboxResultDetail>(`/doctor/results-inbox/${id}`);
}

/**
 * Record this doctor's acknowledgement.
 *
 * Idempotent on the server: acknowledging twice answers 200 with the ORIGINAL
 * signature rather than an error, so a retry after a dropped response cannot
 * make a landed acknowledgement look failed.
 */
export function acknowledgeResult(id: string): Promise<InboxResultDetail> {
  return post<InboxResultDetail>(`/doctor/results-inbox/${id}/acknowledge`);
}
