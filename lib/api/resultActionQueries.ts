/**
 * Result acknowledgement WITH a clinical act — the data layer for the
 * "Acknowledge and act" sheet on `/clinician/results/[id]` (programme task T7b).
 *
 * `lib/api/doctorQueries.ts` owns the plain `useAcknowledgeResult()` (no body)
 * and is edited by another agent, so the additions live here and import from
 * it read-only. Nothing in `endpoints.ts` is touched either.
 *
 * ── THE CONTRACT THIS FILE SPEAKS (being built server-side, 2026-09-06) ────
 *
 *   POST /mobile/doctor/results-inbox/{id}/acknowledge
 *        body  { comment?, patient_note?, share_with_patient?, next_action? }
 *        200   { data: <the detail row> + interpretation + next_action_links }
 *        The ledger is immutable: a second call answers 200 with the ORIGINAL
 *        row, so a retry after a dropped response cannot make a landed
 *        acknowledgement look failed — and cannot write a second note.
 *
 *   POST /mobile/doctor/messages/threads
 *        body  { patient_id, subject, body }
 *        201   { data: thread }            (id / uuid — either is the route id)
 *
 *   POST /mobile/doctor/patients/{id}/lab-orders
 *        body  { test_name, test_code?, urgency, clinical_indication }
 *        201   { data: order }
 *
 * The two new POSTs may not be deployed yet. A 404 / 405 / 501 from them is
 * reported by `isResultStepUnserved()` and the screen prints "not available
 * on this server yet" — NEVER a success it did not see. A 422 carries the
 * server's validation sentence; `resultStepFailureMessage()` surfaces it.
 *
 * `next_action_links` is what the server thinks the chosen next step needs.
 * `nextActionLinks()` reads it and, ONLY where the block is missing, fills in
 * from what the detail row itself already carries (its `patient_id`, its
 * `patient_health_id`, its test) — the same facts, not invented ones.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from './client';
import {
  DOCTOR_API_PREFIX,
  doctorKeys,
  isDoctorFeatureUnserved,
  type DoctorThread,
  type Envelope,
  type InboxResultDetail,
} from './doctorQueries';

// ═══════════════════════════════════════════════════════════════════════════
// Endpoints
// ═══════════════════════════════════════════════════════════════════════════

const seg = (value: string) => encodeURIComponent(value);

export const resultActionEndpoints = {
  /** POST — acknowledge, optionally with a note, a comment and a next step. */
  acknowledge: (id: string) => `${DOCTOR_API_PREFIX}/results-inbox/${seg(id)}/acknowledge`,
  /** POST — open a conversation with a patient. */
  startThread: `${DOCTOR_API_PREFIX}/messages/threads`,
  /** POST — place a laboratory order for a patient (ordered_by = me). */
  labOrders: (patientId: string) => `${DOCTOR_API_PREFIX}/patients/${seg(patientId)}/lab-orders`,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Wire types
// ═══════════════════════════════════════════════════════════════════════════

export const RESULT_NEXT_ACTIONS = ['none', 'prescribe', 'follow_up', 'message', 'repeat_test'] as const;
export type ResultNextAction = (typeof RESULT_NEXT_ACTIONS)[number];

/** Server-side limit on both free-text fields. */
export const RESULT_NOTE_MAX = 1000;

export interface AcknowledgeResultBody {
  /** Clinician-private. ≤ 1000. */
  comment?: string;
  /** Plain-language, shown to the patient when shared. ≤ 1000. */
  patient_note?: string;
  /** Defaults server-side to true when `patient_note` is given. */
  share_with_patient?: boolean;
  next_action?: ResultNextAction;
}

/** The append-only interpretation row, as both acknowledge() and show() return it. */
export interface ResultInterpretation {
  patient_note: string | null;
  clinician_comment: string | null;
  next_action: ResultNextAction | null;
  /** True when the patient can read `patient_note` in their app. */
  shared: boolean;
}

export interface NextActionLinks {
  /** `'/clinician/prescribe?health_id=…'` — a path, not a URL. */
  prescribe?: string | null;
  follow_up?: { patient_id: string } | null;
  message?: { patient_id: string; thread_id: string | null } | null;
  repeat_test?: { patient_id: string; test_code: string | null; test_name: string | null } | null;
}

/** `show()` carries the interpretation once one exists; `acknowledge()` adds the links. */
export interface InterpretedResultDetail extends InboxResultDetail {
  interpretation?: ResultInterpretation | null;
}

export interface AcknowledgedResultDetail extends InterpretedResultDetail {
  next_action_links?: NextActionLinks | null;
}

export interface StartThreadInput {
  patient_id: string;
  subject: string;
  body: string;
}

/** The created thread. `uuid` is honoured when a deployment routes by it. */
export type StartedThread = DoctorThread & { uuid?: string | null };

export type LabOrderUrgency = 'routine' | 'urgent' | 'stat';
export const LAB_ORDER_URGENCIES: readonly LabOrderUrgency[] = ['routine', 'urgent', 'stat'];

export interface OrderLabTestInput {
  patient_id: string;
  test_name: string;
  test_code?: string;
  urgency: LabOrderUrgency;
  clinical_indication: string;
}

/** The order the server created — the fields the confirmation line can name. */
export interface OrderedLabTest {
  id: string;
  code?: string | null;
  test_name?: string | null;
  name?: string | null;
  status?: string | null;
  urgency?: string | null;
  priority?: string | null;
  ordered_at?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Transport (private — `doctorQueries.postData` is not exported)
// ═══════════════════════════════════════════════════════════════════════════

async function postData<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiClient.post<Envelope<T>>(path, body ?? {});
  return res.data.data;
}

/** Drop empty strings and undefineds so the server's "optional" really is. */
function compactBody(body: AcknowledgeResultBody): AcknowledgeResultBody {
  const out: AcknowledgeResultBody = {};
  const note = body.patient_note?.trim();
  const comment = body.comment?.trim();
  if (note) out.patient_note = note;
  if (comment) out.comment = comment;
  if (note && body.share_with_patient !== undefined) out.share_with_patient = body.share_with_patient;
  if (body.next_action && body.next_action !== 'none') out.next_action = body.next_action;
  else if (body.next_action === 'none' && (note || comment)) out.next_action = 'none';
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Failure classification for the two NEW endpoints
// ═══════════════════════════════════════════════════════════════════════════

/**
 * True when the step could not have happened because nothing served it:
 * a bodyless 404, a 405 (route exists for another verb only) or a 501.
 * A 404 WITH an app-authored sentence is the app refusing ("patient not
 * found") and is reported through `resultStepFailureMessage` instead.
 */
export function isResultStepUnserved(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === 405) return true;
  if (status === 404) {
    // Laravel's own "route could not be found" sentence is a missing route
    // wearing a body; treat it as unserved rather than as an app refusal.
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    if (typeof message === 'string' && /could not be found|not found\.?$/i.test(message) && /route|GET|POST/i.test(message)) {
      return true;
    }
  }
  return isDoctorFeatureUnserved(error);
}

/** True for a 422 — the server named what was wrong with the form. */
export function isResultStepInvalid(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 422;
}

/**
 * The server's most specific sentence: the first validation error, else the
 * top-level `message`. Null when the server said nothing usable.
 */
export function resultStepFailureMessage(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const body = error.response?.data as
    | { message?: string; errors?: Record<string, string[] | string> }
    | undefined;
  if (body?.errors && typeof body.errors === 'object') {
    for (const value of Object.values(body.errors)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === 'string' && first.trim() !== '') return first;
    }
  }
  return typeof body?.message === 'string' && body.message.trim() !== '' ? body.message : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Mutations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /mobile/doctor/results-inbox/{id}/acknowledge with a body.
 *
 * `onSuccess` mirrors `useAcknowledgeResult`: the returned row REPLACES the
 * cached detail (so the screen shows the server's row, not its guess), and
 * the inbox + home counters are invalidated. Never retried — a write whose
 * outcome is unknown must not be silently repeated.
 */
export function useAcknowledgeResultWithAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AcknowledgeResultBody }) =>
      postData<AcknowledgedResultDetail>(resultActionEndpoints.acknowledge(id), compactBody(body)),
    retry: false,
    onSuccess: async (detail) => {
      qc.setQueryData(doctorKeys.result(detail.id), detail);
      await Promise.all([
        qc.invalidateQueries({ queryKey: doctorKeys.inboxAll }),
        qc.invalidateQueries({ queryKey: doctorKeys.home }),
      ]);
    },
  });
}

/** POST /mobile/doctor/messages/threads — open a conversation with a patient. */
export function useStartPatientThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartThreadInput) =>
      postData<StartedThread>(resultActionEndpoints.startThread, {
        patient_id: input.patient_id,
        subject: input.subject.trim(),
        body: input.body.trim(),
      }),
    retry: false,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: doctorKeys.threadsAll });
    },
  });
}

/** POST /mobile/doctor/patients/{id}/lab-orders — order a (repeat) test. */
export function useOrderLabTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ patient_id, ...body }: OrderLabTestInput) =>
      postData<OrderedLabTest>(resultActionEndpoints.labOrders(patient_id), {
        test_name: body.test_name.trim(),
        ...(body.test_code?.trim() ? { test_code: body.test_code.trim() } : {}),
        urgency: body.urgency,
        clinical_indication: body.clinical_indication.trim(),
      }),
    retry: false,
    onSuccess: async (_order, input) => {
      // The chart's orders/labs sections and summary all key under the patient.
      await qc.invalidateQueries({ queryKey: doctorKeys.patient(input.patient_id) });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** The route id of a created thread — `id`, else `uuid`; null when neither came back. */
export function startedThreadId(thread: StartedThread | null | undefined): string | null {
  if (!thread) return null;
  if (thread.id !== undefined && thread.id !== null && String(thread.id) !== '') return String(thread.id);
  if (thread.uuid) return String(thread.uuid);
  return null;
}

/** `health_id` out of a `/clinician/prescribe?health_id=…` link, else null. */
export function healthIdFromPrescribeLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const q = link.indexOf('?');
  if (q < 0) return null;
  for (const pair of link.slice(q + 1).split('&')) {
    const [k, v = ''] = pair.split('=');
    if (k === 'health_id' && v !== '') {
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
  }
  return null;
}

/**
 * The links the chosen next step needs, resolved.
 *
 * Prefers the server's `next_action_links`; where a block is absent (an older
 * server, or the detail re-read through `show()` which carries none) it falls
 * back to what the row itself carries — nothing that is not already on it.
 * A step whose facts are missing stays `undefined`/`null`, and the screen says
 * so instead of guessing.
 */
export function nextActionLinks(detail: AcknowledgedResultDetail | InterpretedResultDetail): NextActionLinks {
  const served = ('next_action_links' in detail ? detail.next_action_links : null) ?? {};
  const patientId = detail.patient_id ?? null;
  const testName = detail.result?.test_name ?? null;

  const prescribe =
    served.prescribe ??
    (detail.patient_health_id
      ? `/clinician/prescribe?health_id=${encodeURIComponent(detail.patient_health_id)}`
      : null);

  const follow_up = served.follow_up ?? (patientId ? { patient_id: patientId } : null);

  const message = served.message ?? (patientId ? { patient_id: patientId, thread_id: null } : null);

  const repeat_test =
    served.repeat_test ??
    (patientId ? { patient_id: patientId, test_code: null, test_name: testName } : null);

  return { prescribe, follow_up, message, repeat_test };
}
