/**
 * Prescribing data layer — the clinician WRITING a prescription from the phone.
 *
 * Modelled on `lib/api/vitalsQueries.ts`: typed wire shapes, `apiClient`,
 * react-query hooks, and the endpoint paths spelled out here rather than in
 * `endpoints.ts` (owned elsewhere).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE CONTRACT THIS CODES AGAINST
 * ─────────────────────────────────────────────────────────────────────────
 *   GET  /mobile/doctor/patients/lookup?health_id=CM-HID-XXXX-XXXX-XXXX
 *        → one patient, or 404. EXACT match only.
 *   POST /mobile/doctor/prescriptions
 *        → the created prescription, including its `reference` (RX-4F2A-9C31).
 *   GET  /mobile/doctor/prescriptions
 *        → what this clinician has written, newest first.
 * All three behind a provider bearer token.
 *
 * It mirrors the web prescriber's desk (`PrescriberController::store`), which is
 * the authority on the shape and the limits: `items[].drug_name` required,
 * `dose` / `frequency` / `route` / `duration_days` / `quantity` optional, blank
 * lines dropped, and at least one real line required. `LIMITS` below is that
 * validator restated so the phone refuses what the server would reject anyway —
 * a doctor should not lose a typed prescription to a 422.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────
 * 1. It never searches for a patient. `lookupPatient` sends an exact,
 *    normalised Health ID or it sends nothing — patient enumeration is
 *    forbidden platform-wide, so there is no `q=`, no prefix and no list.
 * 2. It never invents a row. A response it cannot read is an ERROR, never an
 *    empty list and never a partial patient — a lookup that came back without
 *    an `id` cannot be prescribed against, so it throws instead.
 * 3. It never reports a prescription as issued unless the server said so. See
 *    `issueOutcomeIsUncertain()`: a request that got NO answer (timeout,
 *    connection dropped) may still have landed, and the screen is required to
 *    say exactly that rather than either "issued" or "failed".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BACKEND STATUS
 * ─────────────────────────────────────────────────────────────────────────
 * These three routes are being added alongside this file. Until they land the
 * finder answers 404 for all of them (its `/mobile/*` surface is patient-token
 * only — see the header of `lib/api/doctorQueries.ts`). Nothing here retries a
 * 404 and nothing here fakes a result: `isPrescribingUnavailable()` lets the
 * screen say "this server cannot issue prescriptions yet" out loud.
 */
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { HEALTH_ID_MIN_LENGTH, isPlausibleHealthId, normaliseHealthId } from './doctorQueries';
import { isRoleForbidden } from './roleErrors';

// The Health ID rules are the platform's, not this module's — they are defined
// once in `doctorQueries` and re-exported so a screen needs one import.
export { HEALTH_ID_MIN_LENGTH, isPlausibleHealthId, normaliseHealthId };

// ═══════════════════════════════════════════════════════════════════════════
// Endpoints
// ═══════════════════════════════════════════════════════════════════════════

/** Root of the provider-side mobile surface. */
export const PRESCRIBING_API_PREFIX = '/mobile/doctor';

export const prescribingEndpoints = {
  /** GET `?health_id=` — one patient by EXACT Health ID, or 404. */
  patientLookup: `${PRESCRIBING_API_PREFIX}/patients/lookup`,
  /** GET — prescriptions this clinician wrote. POST — issue a new one. */
  prescriptions: `${PRESCRIBING_API_PREFIX}/prescriptions`,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Administration routes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The eight routes the prescriber's desk offers, in the desk's own spelling
 * (`PrescriberController::ROUTES`). The wire value is what the server stores,
 * so `IV` stays `IV` — it is not lower-cased on the way out.
 */
export const PRESCRIBING_ROUTES = [
  'oral',
  'IV',
  'IM',
  'subcutaneous',
  'topical',
  'inhaled',
  'rectal',
  'ophthalmic',
] as const;

export type PrescribingRoute = (typeof PRESCRIBING_ROUTES)[number];

/**
 * Wire value → the catalogue key that already carries its EN/FR wording.
 *
 * `opesDoctor.vocab.route.*` was written for the chart's medication list and
 * uses short keys (`iv`, `sc`), so the desk's values are mapped onto it rather
 * than a second, half-translated vocabulary being invented here. `ophthalmic`
 * is the one value the catalogue has no key for — the screen falls back to its
 * English `defaultValue` until `vocab.route.ophthalmic` lands.
 */
export const ROUTE_LABEL_KEY: Record<PrescribingRoute, string> = {
  oral: 'vocab.route.oral',
  IV: 'vocab.route.iv',
  IM: 'vocab.route.im',
  subcutaneous: 'vocab.route.sc',
  topical: 'vocab.route.topical',
  inhaled: 'vocab.route.inhaled',
  rectal: 'vocab.route.rectal',
  ophthalmic: 'vocab.route.ophthalmic',
};

/** English fallbacks for the keys above (identical wording to the catalogue). */
export const ROUTE_LABEL_EN: Record<PrescribingRoute, string> = {
  oral: 'Oral',
  IV: 'Intravenous',
  IM: 'Intramuscular',
  subcutaneous: 'Subcutaneous',
  topical: 'Topical',
  inhaled: 'Inhaled',
  rectal: 'Rectal',
  ophthalmic: 'Ophthalmic',
};

// ═══════════════════════════════════════════════════════════════════════════
// Limits — `PrescriberController::store()`'s validator, restated
// ═══════════════════════════════════════════════════════════════════════════

export const LIMITS = {
  drugName: 200,
  dose: 100,
  frequency: 100,
  notes: 1000,
  durationDaysMin: 1,
  durationDaysMax: 365,
  quantityMin: 1,
  quantityMax: 1000,
  validityDaysMin: 1,
  validityDaysMax: 365,
} as const;

/**
 * A client-side guard, NOT a server rule: past this many lines a phone form
 * stops being reviewable, and an accidental repeat-tap on "Add medicine" has
 * to stop somewhere. The server imposes no such cap.
 */
export const MAX_DRAFT_LINES = 20;

// ═══════════════════════════════════════════════════════════════════════════
// Wire shapes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The patient the lookup returns.
 *
 * Deliberately NOT `ChartPatient` from `doctorQueries`: that type is the chart
 * header (`name`, `age`, `next_of_kin`, `has_allergies`…) and this endpoint's
 * contract is the six identity fields below. Two differently-parsed shapes must
 * never share one react-query key, which is why `prescribingKeys.lookup` is its
 * own namespace rather than reusing `doctorKeys.patientLookup`.
 *
 * `name` is tolerated because the chart endpoint sends a single joined name and
 * a server may well answer both routes from one resource. It is read, never
 * required, and never fabricated from the ID.
 */
export interface PrescribingPatient {
  /** What `POST /prescriptions` takes as `patient_id`. Required. */
  id: string;
  health_id: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  sex: string | null;
  blood_group: string | null;
  /** Present only when the server sends a joined name instead of the halves. */
  name: string | null;
}

/** One line as the server echoes it back. */
export interface IssuedPrescriptionItem {
  id: string | null;
  drug_name: string | null;
  medicine_id: string | null;
  dose: string | null;
  frequency: string | null;
  route: string | null;
  duration_days: number | null;
  quantity: number | null;
  status: string | null;
}

/** The created prescription. `reference` is what the patient quotes at a pharmacy. */
export interface IssuedPrescription {
  id: string | null;
  /** RX-4F2A-9C31. Null when the server did not send one — never invented. */
  reference: string | null;
  status: string | null;
  notes: string | null;
  prescribed_at: string | null;
  expires_at: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_health_id: string | null;
  items: IssuedPrescriptionItem[];
  /**
   * The server's own count when it sends one, else the number of lines it
   * echoed. Null when neither is available — a list row then shows no figure
   * rather than a zero it cannot stand behind.
   */
  item_count: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Defensive parsing
// ═══════════════════════════════════════════════════════════════════════════

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `{ data: X }` → `X`. Anything else passes through untouched. */
function unwrap(body: unknown): unknown {
  return isRecord(body) && 'data' in body ? body.data : body;
}

/** Trimmed string, or null. Numbers are accepted (a reference could be numeric). */
function str(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Finite integer, or null. Laravel `integer` columns arrive as numbers but
 * `decimal:` casts arrive as STRINGS, so both are read. Never NaN.
 */
function int(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

/** Thrown when a 2xx body cannot be read as the thing it was supposed to be. */
export class UnreadableResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableResponseError';
  }
}

function parsePatient(raw: unknown): PrescribingPatient {
  if (!isRecord(raw)) {
    throw new UnreadableResponseError('The patient lookup did not return a patient record.');
  }
  const id = str(raw.id) ?? str(raw.patient_id);
  if (!id) {
    // A patient with no id cannot be prescribed against — POST /prescriptions
    // takes `patient_id`. Failing here is the only safe answer; the alternative
    // is a form that looks ready and 422s at the moment of issuing.
    throw new UnreadableResponseError('The patient lookup returned a record with no identifier.');
  }
  return {
    id,
    health_id: str(raw.health_id),
    first_name: str(raw.first_name),
    last_name: str(raw.last_name),
    date_of_birth: str(raw.date_of_birth) ?? str(raw.dob),
    sex: str(raw.sex) ?? str(raw.gender),
    blood_group: str(raw.blood_group),
    name: str(raw.name) ?? str(raw.full_name),
  };
}

function parseItem(raw: unknown): IssuedPrescriptionItem {
  const row = isRecord(raw) ? raw : {};
  return {
    id: str(row.id),
    drug_name: str(row.drug_name),
    medicine_id: str(row.medicine_id),
    dose: str(row.dose),
    frequency: str(row.frequency),
    route: str(row.route),
    duration_days: int(row.duration_days),
    quantity: int(row.quantity),
    status: str(row.status),
  };
}

function parsePrescription(raw: unknown): IssuedPrescription {
  if (!isRecord(raw)) {
    throw new UnreadableResponseError('The server did not return a prescription.');
  }
  const items = Array.isArray(raw.items) ? raw.items.map(parseItem) : [];
  const patient = isRecord(raw.patient) ? raw.patient : null;
  return {
    id: str(raw.id),
    reference: str(raw.reference),
    status: str(raw.status),
    notes: str(raw.notes),
    prescribed_at: str(raw.prescribed_at) ?? str(raw.created_at),
    expires_at: str(raw.expires_at),
    patient_id: str(raw.patient_id) ?? (patient ? str(patient.id) : null),
    patient_name: str(raw.patient_name) ?? (patient ? str(patient.name) : null),
    patient_health_id: str(raw.patient_health_id) ?? (patient ? str(patient.health_id) : null),
    items,
    item_count: int(raw.item_count) ?? (Array.isArray(raw.items) ? items.length : null),
  };
}

/**
 * A list body → rows. Handles `{data:[…]}`, a bare array, and the paginated
 * `{data:{data:[…]}}` envelope. Anything else THROWS rather than resolving to
 * `[]`: an unreadable list rendered as an empty one tells a clinician they have
 * written nothing, which is a different and much worse claim than "not loaded".
 */
function parseList(body: unknown): IssuedPrescription[] {
  let rows: unknown = unwrap(body);
  if (!Array.isArray(rows)) rows = unwrap(rows);
  if (!Array.isArray(rows)) {
    throw new UnreadableResponseError('The prescriptions list could not be read.');
  }
  return rows.map(parsePrescription);
}

// ═══════════════════════════════════════════════════════════════════════════
// Failure classification
// ═══════════════════════════════════════════════════════════════════════════

/**
 * True when the server does not serve this surface: a missing route (404), an
 * explicit not-implemented (501), or a token it will not accept on a provider
 * route (401 / 403). The screen must say so plainly — never spin, never crash,
 * and above all never pretend a prescription was written.
 *
 * NOT a role refusal. `403 { error_code: "role_forbidden" }` means the surface
 * IS served and this ACCOUNT may not use it — a nurse or a pharmacist on the
 * prescriber's desk. Folding that in here would dress a refusal up as "not
 * available on this server yet", the exact claim `doctorQueries` forbids.
 * Screens read it with `isRoleForbidden` first.
 */
export function isPrescribingUnavailable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (isRoleForbidden(error)) return false;
  const status = error.response?.status;
  return status === 404 || status === 501 || status === 401 || status === 403;
}

/**
 * THE MOST IMPORTANT PREDICATE IN THIS FILE.
 *
 * True when the issue request got NO answer at all — a timeout, a dropped
 * connection, the phone losing signal mid-POST. The prescription may or may not
 * have been written, and the honest thing is to say so: "failed" invites a
 * duplicate script, "issued" invites a patient walking into a pharmacy with a
 * reference that does not exist. Only a real HTTP status is evidence either way.
 */
export function issueOutcomeIsUncertain(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return error.response === undefined;
}

/** One retry, and none at all when the route is simply not there. */
const prescribingRetry = (failureCount: number, error: unknown): boolean =>
  !isPrescribingUnavailable(error) && failureCount < 1;

// ═══════════════════════════════════════════════════════════════════════════
// Query keys
// ═══════════════════════════════════════════════════════════════════════════

export const prescribingKeys = {
  all: ['doctor', 'prescribing'] as const,
  /** Its own namespace — see the note on `PrescribingPatient`. */
  lookup: (healthId: string) => ['doctor', 'prescribing', 'patient-lookup', healthId] as const,
  /** What this clinician has written. Invalidated by every successful issue. */
  written: ['doctor', 'prescribing', 'written'] as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// Requests
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `GET /mobile/doctor/patients/lookup?health_id=` — ONE patient by exact Health
 * ID, or 404. Refuses to send anything that is not a plausible ID, so the
 * server is never asked a prefix, a name or a wildcard.
 */
export async function lookupPatient(healthId: string): Promise<PrescribingPatient> {
  const id = normaliseHealthId(healthId);
  if (!isPlausibleHealthId(id)) {
    throw new Error('A full Health ID is required to look a patient up.');
  }
  const res = await apiClient.get<unknown>(prescribingEndpoints.patientLookup, {
    params: { health_id: id },
  });
  return parsePatient(unwrap(res.data));
}

export function usePrescribingPatientLookup(healthId: string | null | undefined) {
  const key = healthId ? normaliseHealthId(healthId) : '';
  return useQuery({
    queryKey: prescribingKeys.lookup(key),
    queryFn: () => lookupPatient(key),
    // A 404 here is "no such patient" OR "no such route" — indistinguishable
    // over the wire, and neither is worth retrying.
    retry: false,
    enabled: isPlausibleHealthId(key),
    // A patient's identity is what the whole prescription hangs on; it is not
    // held across a session.
    staleTime: 30 * 1000,
  });
}

// ── The draft, and turning it into a payload ──────────────────────────────

/** One medicine line as the form holds it: every field a string, `key` local. */
export interface DraftLine {
  /** Stable local id so React keys survive an insert or a removal. */
  key: string;
  drug_name: string;
  dose: string;
  frequency: string;
  route: PrescribingRoute | '';
  duration_days: string;
  quantity: string;
  /** Set only when the line was picked from the medicine catalogue. */
  medicine_id?: string;
}

export interface PrescriptionDraft {
  lines: DraftLine[];
  notes: string;
  validity_days: string;
}

let lineSeq = 0;

export function blankLine(): DraftLine {
  lineSeq += 1;
  return {
    key: `line-${lineSeq}`,
    drug_name: '',
    dose: '',
    frequency: '',
    route: '',
    duration_days: '',
    quantity: '',
  };
}

/** True when nothing at all has been typed on this line. */
export function isBlankLine(line: DraftLine): boolean {
  return (
    line.drug_name.trim() === '' &&
    line.dose.trim() === '' &&
    line.frequency.trim() === '' &&
    line.route === '' &&
    line.duration_days.trim() === '' &&
    line.quantity.trim() === ''
  );
}

/** The lines that would actually be sent: a drug name is what makes a line real. */
export function issuableLines(draft: PrescriptionDraft): DraftLine[] {
  return draft.lines.filter((line) => line.drug_name.trim() !== '');
}

export type DraftProblem =
  | { code: 'no_items' }
  | { code: 'missing_drug_name'; line: number }
  | { code: 'drug_name_too_long'; line: number }
  | { code: 'dose_too_long'; line: number }
  | { code: 'frequency_too_long'; line: number }
  | { code: 'bad_duration'; line: number }
  | { code: 'bad_quantity'; line: number }
  | { code: 'bad_validity' }
  | { code: 'notes_too_long' };

function badWholeNumber(raw: string, min: number, max: number): boolean {
  const text = raw.trim();
  if (text === '') return false; // optional — absent is not invalid
  if (!/^\d+$/.test(text)) return true;
  const value = Number(text);
  return !Number.isFinite(value) || value < min || value > max;
}

/**
 * Everything wrong with the draft, as codes the screen turns into its own
 * localised sentences. Ordered by line so the form can mark each field.
 *
 * A FULLY blank line is not a problem — it is dropped, exactly as the web desk
 * drops it. A line with a dose but no drug name IS a problem: silently
 * discarding a line a doctor typed into is how a medicine goes missing from a
 * script without anyone noticing.
 */
export function validateDraft(draft: PrescriptionDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];

  draft.lines.forEach((line, index) => {
    if (isBlankLine(line)) return;

    const drug = line.drug_name.trim();
    if (drug === '') {
      problems.push({ code: 'missing_drug_name', line: index });
    } else if (drug.length > LIMITS.drugName) {
      problems.push({ code: 'drug_name_too_long', line: index });
    }
    if (line.dose.trim().length > LIMITS.dose) problems.push({ code: 'dose_too_long', line: index });
    if (line.frequency.trim().length > LIMITS.frequency) {
      problems.push({ code: 'frequency_too_long', line: index });
    }
    if (badWholeNumber(line.duration_days, LIMITS.durationDaysMin, LIMITS.durationDaysMax)) {
      problems.push({ code: 'bad_duration', line: index });
    }
    if (badWholeNumber(line.quantity, LIMITS.quantityMin, LIMITS.quantityMax)) {
      problems.push({ code: 'bad_quantity', line: index });
    }
  });

  if (issuableLines(draft).length === 0) problems.push({ code: 'no_items' });
  if (badWholeNumber(draft.validity_days, LIMITS.validityDaysMin, LIMITS.validityDaysMax)) {
    problems.push({ code: 'bad_validity' });
  }
  if (draft.notes.trim().length > LIMITS.notes) problems.push({ code: 'notes_too_long' });

  return problems;
}

export interface IssuePayloadItem {
  drug_name: string;
  medicine_id?: string;
  dose?: string;
  frequency?: string;
  route?: string;
  duration_days?: number;
  quantity?: number;
}

export interface IssuePayload {
  patient_id: string;
  notes?: string;
  validity_days?: number;
  items: IssuePayloadItem[];
}

const optionalText = (raw: string): string | undefined => {
  const text = raw.trim();
  return text === '' ? undefined : text;
};

const optionalWhole = (raw: string): number | undefined => {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
};

/**
 * The draft as the API takes it. Blank lines are gone, every optional field is
 * OMITTED rather than sent as `""` (which a `nullable|string|max:` rule accepts
 * and then stores as an empty dose), and numbers are numbers.
 *
 * Call `validateDraft` first — this does not re-check, it just builds.
 */
export function buildIssuePayload(patientId: string, draft: PrescriptionDraft): IssuePayload {
  const payload: IssuePayload = {
    patient_id: patientId,
    items: issuableLines(draft).map((line) => {
      const item: IssuePayloadItem = { drug_name: line.drug_name.trim() };
      if (line.medicine_id) item.medicine_id = line.medicine_id;
      const dose = optionalText(line.dose);
      if (dose) item.dose = dose;
      const frequency = optionalText(line.frequency);
      if (frequency) item.frequency = frequency;
      if (line.route !== '') item.route = line.route;
      const duration = optionalWhole(line.duration_days);
      if (duration !== undefined) item.duration_days = duration;
      const quantity = optionalWhole(line.quantity);
      if (quantity !== undefined) item.quantity = quantity;
      return item;
    }),
  };

  const notes = optionalText(draft.notes);
  if (notes) payload.notes = notes;
  const validity = optionalWhole(draft.validity_days);
  if (validity !== undefined) payload.validity_days = validity;

  return payload;
}

/** `POST /mobile/doctor/prescriptions` — issue it. */
export async function issuePrescription(payload: IssuePayload): Promise<IssuedPrescription> {
  if (payload.items.length === 0) {
    // Belt and braces: a payload with no lines must never reach the wire.
    throw new Error('A prescription needs at least one medicine.');
  }
  const res = await apiClient.post<unknown>(prescribingEndpoints.prescriptions, payload);
  return parsePrescription(unwrap(res.data));
}

/**
 * Issue a prescription.
 *
 * `retry: false` is deliberate and non-negotiable. This endpoint carries no
 * `Idempotency-Key` in the contract, so an automatic retry of a request that
 * actually landed would write the script twice. A doctor re-pressing the button
 * after reading an explicit failure is a decision; a library doing it silently
 * is a duplicate prescription.
 *
 * On success the clinician's own list is invalidated, along with the patient
 * chart's medication sections — a drug just prescribed must not be missing from
 * the chart the doctor opens next.
 */
export function useIssuePrescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: issuePrescription,
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: prescribingKeys.written }),
        // `doctorKeys.patient(id)` / `chartSection(id, …)` both live under this
        // prefix (see `lib/api/doctorQueries.ts`); a literal is used so this
        // module owns no part of that vocabulary.
        qc.invalidateQueries({ queryKey: ['doctor', 'patients'] }),
      ]);
    },
  });
}

/**
 * `GET /mobile/doctor/prescriptions` — what this clinician has written, in the
 * server's own order (newest first). The order is NOT re-sorted here: the list
 * the server returns is the list shown.
 */
export function usePrescriptionsIWrote(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: prescribingKeys.written,
    queryFn: async () => {
      const res = await apiClient.get<unknown>(prescribingEndpoints.prescriptions);
      return parseList(res.data);
    },
    retry: prescribingRetry,
    enabled: options.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Presentation helpers (no fetching, no i18n — the screen owns its wording)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The patient's name from whichever halves the server sent, or null.
 *
 * NEVER falls back to the Health ID: an ID rendered where a name belongs reads
 * as a name, and the screen has to be able to say "name not on record" instead.
 */
export function patientDisplayName(patient: PrescribingPatient): string | null {
  const joined = [patient.first_name, patient.last_name].filter(Boolean).join(' ').trim();
  if (joined !== '') return joined;
  return patient.name ?? null;
}

/** Whole years from a date of birth, or null. Never negative, never NaN. */
export function ageFromDob(dob: string | null, now: Date = new Date()): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  let age = now.getFullYear() - born.getFullYear();
  const monthDelta = now.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}
