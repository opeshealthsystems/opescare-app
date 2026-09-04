/**
 * MED-002 — the patient's own action list.
 *
 * `care_plan_tasks` hangs off one care plan and `staff_tasks` is the clinician
 * queue; this is the list the PATIENT works through — a lab test to get done
 * before the next visit, a follow-up to book, a daily symptom check — and they
 * tick items off themselves. It is served by `patient_medical_tasks` and, like
 * every portal endpoint, resolves the patient from the bearer token: no patient
 * id is ever sent from the app.
 */
import { getPage, post, type Page, type PageQuery } from './portal';

/**
 * ══ THE ONE PLACE THE PATHS LIVE ══════════════════════════════════════════
 *
 * Both are confirmed against the shipped route table:
 *
 *   GET  patient/medical-tasks                 patient.medical-tasks.index
 *   POST patient/medical-tasks/{task}/complete patient.medical-tasks.complete
 *
 * They are constants rather than inline strings so that if the API ever moves
 * them, one edit here is the whole change.
 */
const LIST_PATH = '/patient/medical-tasks';
const completePath = (taskId: string) => `${LIST_PATH}/${taskId}/complete`;

/** The kinds the table's `task_type` enum can hold. */
export type MedicalTaskType =
  | 'medication'
  | 'lab_test'
  | 'appointment'
  | 'monitoring'
  | 'results'
  | 'lifestyle'
  | 'other';

/**
 * How the right-hand due text reads. This is the server's decision, not the
 * app's: `due_today` / `due_before` render `due_at`, `upcoming` renders the
 * scheduled appointment time (also delivered in `due_at`), `recurring` prints
 * `cadence_label` alone, and `none` prints nothing.
 */
export type MedicalTaskDueKind = 'due_today' | 'due_before' | 'upcoming' | 'recurring' | 'none';

export type MedicalTaskStatus = 'pending' | 'completed';

export type PortalMedicalTask = {
  id: string;
  task_type: MedicalTaskType;
  title: string;
  description: string | null;
  /** The pill under the title: "2 times daily", "Before next visit", "Daily". */
  cadence_label: string | null;
  due_kind: MedicalTaskDueKind;
  due_at: string | null;
  completed_at: string | null;
  care_plan_id: string | null;

  /*
   * On the table but NOT in the presenter the API ships today, so every one of
   * them is optional and the screen derives a fallback rather than waiting for
   * it: completion is read from `completed_at`, the glyph from `task_type`,
   * and ordering falls back to the order the server sent. If the presenter
   * grows these fields later, the screen starts honouring them with no change.
   */
  status?: MedicalTaskStatus;
  /** An Icon glyph name chosen server-side; validate before rendering. */
  icon?: string | null;
  sort_order?: number;
  related_type?: string | null;
  related_id?: string | null;
};

export type MedicalTaskQuery = PageQuery & {
  /** Omitted means "everything the server would show by default". */
  status?: MedicalTaskStatus;
};

export const fetchMedicalTasks = (params: MedicalTaskQuery = {}): Promise<Page<PortalMedicalTask>> =>
  getPage<PortalMedicalTask>(LIST_PATH, params);

/**
 * Tick one task off. Idempotent server-side, so a task that is already
 * completed answers with the same completed row rather than an error — which
 * is why the screen may call it without first checking.
 */
export const completeMedicalTask = (taskId: string) =>
  post<PortalMedicalTask>(completePath(taskId));
