/**
 * Patient-side shape additions for `GET /mobile/labs/{id}` (programme task
 * T7): the clinician's review of a result, as the patient may read it.
 *
 * `lib/api/labsQueries.ts` is owned by another agent, so `LabOrderDetail` is
 * extended HERE rather than there. The screen reads the detail through these
 * types; a server that does not send the fields yet leaves them undefined,
 * which the screen renders as "not yet reviewed".
 *
 * Only SHARED notes reach this payload — the server filters; the app never
 * receives, and so never has to hide, a clinician-private comment.
 */
import type { LabOrderDetail } from './labsQueries';

/** One shared note from a clinician who reviewed the result. */
export interface LabInterpretation {
  /** Plain-language note written for the patient. */
  patient_note: string | null;
  author_name: string | null;
  /** The author's role as the server labels it ("Doctor", "Médecin"). */
  author_role: string | null;
  /** When the note was written. */
  at: string | null;
}

export interface LabOrderDetailWithInterpretations extends LabOrderDetail {
  /** Shared clinician notes, oldest first. Absent on a server without T7. */
  interpretations?: LabInterpretation[] | null;
  /** When a clinician first acknowledged the result — set even without a note. */
  reviewed_at?: string | null;
}
