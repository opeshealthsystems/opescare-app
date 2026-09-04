/**
 * The DOCTOR's read-only view of a patient chart — the staff clinical API.
 *
 * Every type below is a field-for-field transcription of a server Resource. No
 * field is invented and no endpoint is guessed; the sources are:
 *
 *   PatientResource            app/Domain/Patients/Http/Resources/PatientResource.php
 *   AllergyResource            app/Http/Resources/Api/V1/AllergyResource.php
 *   ProblemListResource        app/Http/Resources/Api/V1/ProblemListResource.php
 *   EncounterResource          app/Domain/Clinical/Http/Resources/EncounterResource.php
 *   VitalsResource             app/Domain/Clinical/Http/Resources/VitalsResource.php
 *   PrescriptionResource       app/Domain/Clinical/Http/Resources/PrescriptionResource.php
 *   DiagnosisResource          app/Domain/Clinical/Http/Resources/DiagnosisResource.php
 *   ClinicalOrderResource      app/Domain/Clinical/Http/Resources/ClinicalOrderResource.php
 *   LabResultResource          app/Domain/Clinical/Http/Resources/LabResultResource.php
 *
 * READ-ONLY BY CONSTRUCTION. This module exports GET calls and nothing else. A
 * phone is a good place to look something up and a bad place to write a
 * clinical record — prescribing, ordering and documentation stay on the
 * desktop, which has the decision-support and the signing flow. If you are
 * about to add a `post`/`patch` here, that is the conversation to have first.
 *
 * Two facts about the real API shape this file:
 *
 *  1. There is NO patient-level vitals, prescriptions or orders endpoint. They
 *     are all scoped to an encounter (`encounters/{id}/…`). So "current
 *     medications" and "latest vitals" have to be assembled by walking the
 *     patient's recent encounters. `loadChartSummary` does that under an
 *     explicit bound and reports how far it actually got — see below.
 *
 *  2. `GET patients/{id}/export` would return most of a chart in one call, and
 *     this module deliberately does NOT use it. That endpoint is the
 *     release-of-information path (P4.7) and is lossy besides — it flattens
 *     vitals to bp/temp/weight and prescriptions to drug/dosage. Reading a
 *     chart is not a disclosure event and must not be recorded as one.
 */
import { getOne, getPage, type Page, type PageQuery } from './portal';

// ── Numbers on the wire ───────────────────────────────────────────────────

/**
 * Laravel's `decimal:` casts serialise as STRINGS, and this is not theoretical:
 * the live API returns `"temperature": "38.7"`, `"spo2": "98.2"`,
 * `"weight": "76.0"`. Typing these as `number` would compile happily and then
 * silently produce `NaN` in every reference-range comparison — a vital sign
 * that quietly stops being banded is exactly the failure this app must not
 * have. Use `toNumber()` at the point of use.
 */
export type Decimalish = string | number | null;

/** Wire value → finite number, or null. Never NaN. */
export function toNumber(value: Decimalish | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// ── Patient identity ──────────────────────────────────────────────────────

export type PatientSex = 'male' | 'female' | 'other' | (string & {});

/** `PatientResource` — identical for the search row and the chart header. */
export type ChartPatient = {
  id: string;
  /** The hospital medical record number, e.g. "EMR-2026-00001". */
  medical_id: string;
  name: string;
  date_of_birth: string | null;
  age: number | null;
  sex: PatientSex | null;
  blood_group: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  next_of_kin: {
    name: string | null;
    phone: string | null;
    relation: string | null;
  };
  /**
   * The server's own allergy flag, present on every search row. It is a
   * *hint* for the search list, never a substitute for loading the allergy
   * list itself — it says whether there is something to read, not what it is.
   */
  has_allergies: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type PatientSearchQuery = PageQuery & {
  /** Server-side `LIKE` over name, medical_id and phone. */
  q?: string;
};

/**
 * `GET /patients` — bounded, indexed, server-side search.
 *
 * A doctor looks a patient up by name or medical record number; this app never
 * enumerates the patient population. `PatientSearchScreen` enforces a minimum
 * query length so an empty `q` (which the server would answer with "everyone,
 * newest first") is never sent.
 */
export const searchPatients = (query: PatientSearchQuery) =>
  getPage<ChartPatient>('/patients', query as Record<string, unknown>);

/** `GET /patients/{id}`. */
export const fetchPatient = (patientId: string) =>
  getOne<ChartPatient>(`/patients/${patientId}`);

// ── Allergies ─────────────────────────────────────────────────────────────

export type AllergyType = 'drug' | 'food' | 'environmental' | 'other' | (string & {});
export type AllergySeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening' | (string & {});

/** `AllergyResource`. */
export type ChartAllergy = {
  id: string;
  patient_id: string;
  allergy_type: AllergyType;
  allergen: string;
  severity: AllergySeverity;
  reaction: string | null;
  onset_date: string | null;
  notes: string | null;
  recorded_by: number | null;
  created_at: string | null;
  updated_at: string | null;
};

/**
 * `GET /patients/{id}/allergies`.
 *
 * Loaded on its own, never folded into a bigger request, so that a failure
 * here can be reported as a failure. An allergy list that fails inside an
 * aggregate and renders as an empty section reads as "no known allergies",
 * which is the single most dangerous thing this screen could say.
 */
export const fetchAllergies = (patientId: string) =>
  getOne<ChartAllergy[]>(`/patients/${patientId}/allergies`);

// ── Problem list ──────────────────────────────────────────────────────────

export type ProblemStatus = 'active' | 'inactive' | 'resolved' | (string & {});

/**
 * `ProblemListResource`. Note it extends plain `JsonResource`, not
 * `BaseResource`, so its dates are raw Eloquent casts — `onset_date` comes back
 * as a full timestamp (`"2025-01-28T23:00:00.000000Z"`), not a date string, and
 * `created_at` is unformatted. Formatting helpers must tolerate both.
 */
export type ChartProblem = {
  id: string;
  patient_id: string;
  icd10_code: string | null;
  icd10_description: string;
  onset_date: string | null;
  status: ProblemStatus;
  notes: string | null;
  added_by: number | null;
  created_at: string | null;
};

/** `GET /patients/{id}/problems`. */
export const fetchProblems = (patientId: string) =>
  getOne<ChartProblem[]>(`/patients/${patientId}/problems`);

// ── Encounters ────────────────────────────────────────────────────────────

export type EncounterType = 'opd' | 'emergency' | 'follow_up' | 'telehealth' | (string & {});

/** `EncounterResource`. */
export type ChartEncounter = {
  id: string;
  patient_id: string;
  encounter_type: EncounterType;
  status: string;
  encounter_date: string | null;
  encounter_time: string | null;
  doctor_id: number | null;
  doctor_name: string | null;
  chief_complaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  discharge_note: string | null;
  follow_up_date: string | null;
  closed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/** `GET /patients/{id}/encounters` — paginated, newest first. */
export const fetchEncounters = (patientId: string, query: PageQuery = {}) =>
  getPage<ChartEncounter>(`/patients/${patientId}/encounters`, query as Record<string, unknown>);

// ── Vitals ────────────────────────────────────────────────────────────────

/** `VitalsResource`. Every measurement is `Decimalish` — see the note above. */
export type ChartVitals = {
  id: string;
  encounter_id: string;
  patient_id: string;
  bp_systolic: Decimalish;
  bp_diastolic: Decimalish;
  temperature: Decimalish;
  pulse: Decimalish;
  respiratory_rate: Decimalish;
  spo2: Decimalish;
  weight: Decimalish;
  height: Decimalish;
  bmi: Decimalish;
  blood_glucose: Decimalish;
  head_circumference: Decimalish;
  recorded_by: number | null;
  recorded_at: string | null;
  created_at: string | null;
};

/** `GET /encounters/{id}/vitals`. */
export const fetchEncounterVitals = (encounterId: string) =>
  getOne<ChartVitals[]>(`/encounters/${encounterId}/vitals`);

// ── Prescriptions ─────────────────────────────────────────────────────────

export type PrescriptionRoute =
  | 'oral' | 'iv' | 'im' | 'sc' | 'topical' | 'inhaled' | 'rectal' | 'other' | (string & {});
export type PrescriptionStatus = 'draft' | 'active' | 'completed' | 'stopped' | (string & {});

/** `PrescriptionResource`. */
export type ChartPrescription = {
  id: string;
  encounter_id: string;
  patient_id: string;
  drug_name: string;
  dosage: string | null;
  route: PrescriptionRoute | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  status: PrescriptionStatus;
  prescribed_by: number | null;
  created_at: string | null;
  updated_at: string | null;
};

/** `GET /encounters/{id}/prescriptions`. */
export const fetchEncounterPrescriptions = (encounterId: string) =>
  getOne<ChartPrescription[]>(`/encounters/${encounterId}/prescriptions`);

// ── Diagnoses ─────────────────────────────────────────────────────────────

/** `DiagnosisResource`. */
export type ChartDiagnosis = {
  id: string;
  encounter_id: string;
  patient_id: string;
  icd10_code: string | null;
  icd10_description: string;
  diagnosis_type: string | null;
  diagnosis_nature: string | null;
  sensitivity_level: string | null;
  add_to_problem_list: boolean;
  notes: string | null;
  diagnosed_by: number | null;
  created_at: string | null;
  updated_at: string | null;
};

/** `GET /encounters/{id}/diagnoses`. */
export const fetchEncounterDiagnoses = (encounterId: string) =>
  getOne<ChartDiagnosis[]>(`/encounters/${encounterId}/diagnoses`);

// ── Orders & results ──────────────────────────────────────────────────────

/**
 * The write validator allows `lab|imaging|procedure`, but the LIVE data also
 * contains `medication` (verified against emr.opesware.com). So this is a open
 * union and every label lookup falls back to title-casing rather than to a
 * blank cell or a crash.
 */
export type OrderType = 'lab' | 'imaging' | 'procedure' | 'medication' | (string & {});
export type OrderStatus = 'ordered' | 'in_progress' | 'completed' | 'cancelled' | (string & {});

/** `ClinicalOrderResource`. */
export type ChartOrder = {
  id: string;
  encounter_id: string;
  patient_id: string;
  order_type: OrderType;
  code: string | null;
  name: string;
  priority: 'routine' | 'urgent' | 'stat' | (string & {}) | null;
  clinical_notes: string | null;
  status: OrderStatus;
  /** The releasing bench's plain-language conclusion, when there is one. */
  result_summary: string | null;
  ordered_by: number | null;
  ordered_at: string | null;
  created_at: string | null;
};

/**
 * `LabResultResource`. `reference` is the LABORATORY's own range for this
 * analyte and `flag`/`is_abnormal` are the laboratory's own interpretation.
 * Both are rendered verbatim; this app never derives a range for a lab analyte.
 */
export type ChartLabResult = {
  id: string;
  clinical_order_id: string;
  lab_test_id: string | null;
  analyte: string;
  value: string | null;
  unit: string | null;
  reference: string | null;
  flag: string | null;
  is_abnormal: boolean;
  entered_by: number | null;
  entered_by_name: string | null;
  entered_at: string | null;
};

/** `GET /encounters/{id}/orders`. */
export const fetchEncounterOrders = (encounterId: string) =>
  getOne<ChartOrder[]>(`/encounters/${encounterId}/orders`);

/** `GET /orders/{id}/results` — analyte rows, when the bench has entered any. */
export const fetchOrderResults = (orderId: string) =>
  getOne<ChartLabResult[]>(`/orders/${orderId}/results`);

// ── Assembling a chart ────────────────────────────────────────────────────

/**
 * How many recent encounters get walked for the encounter-scoped sections.
 *
 * This is a real trade-off, stated rather than hidden: there is no
 * patient-level endpoint, so "current medications" is only as complete as the
 * number of encounters we open. The overview stays cheap; a section screen
 * that exists to show one list in full goes deeper.
 */
export const OVERVIEW_ENCOUNTER_SCAN = 4;
export const SECTION_ENCOUNTER_SCAN = 12;

/**
 * A list gathered by fanning out over encounters, together with an honest
 * account of how complete it is.
 *
 * `failed > 0` means at least one encounter could not be read, so the list is a
 * SUBSET of what the record holds. The UI must say so — a medication list that
 * is quietly short is the same class of hazard as one that is quietly stale.
 */
export type ScanResult<T> = {
  items: T[];
  /** Encounters successfully read. */
  scanned: number;
  /** Encounters that errored and are therefore missing from `items`. */
  failed: number;
  /** True when the patient has more encounters than the scan bound covers. */
  truncated: boolean;
};

async function scanEncounters<T>(
  encounters: ChartEncounter[],
  total: number,
  limit: number,
  load: (encounterId: string) => Promise<T[]>
): Promise<ScanResult<T>> {
  const window = encounters.slice(0, limit);
  const settled = await Promise.all(
    window.map((e) =>
      load(e.id).then(
        (items) => ({ ok: true as const, items }),
        () => ({ ok: false as const, items: [] as T[] })
      )
    )
  );

  return {
    items: settled.flatMap((r) => r.items),
    scanned: settled.filter((r) => r.ok).length,
    failed: settled.filter((r) => !r.ok).length,
    truncated: total > window.length,
  };
}

/** Everything the chart shows apart from identity and allergies. */
export type ChartSummary = {
  problems: ChartProblem[];
  encounters: ChartEncounter[];
  /** Total encounters on record, not just the ones fetched. */
  encounterTotal: number;
  prescriptions: ScanResult<ChartPrescription>;
  orders: ScanResult<ChartOrder>;
  /** The most recent vitals set found in the scanned window, or null. */
  latestVitals: ChartVitals | null;
  /** True when the vitals lookup itself failed, as opposed to finding none. */
  vitalsFailed: boolean;
};

/**
 * Load the non-allergy body of the chart.
 *
 * Allergies are NOT part of this call, by design — see `fetchAllergies`.
 */
export async function loadChartSummary(
  patientId: string,
  encounterScan: number = OVERVIEW_ENCOUNTER_SCAN
): Promise<ChartSummary> {
  const [problems, encounterPage] = await Promise.all([
    fetchProblems(patientId),
    fetchEncounters(patientId, { per_page: Math.max(encounterScan, 20) }),
  ]);

  const encounters = encounterPage.data;
  const total = encounterPage.meta?.pagination?.total ?? encounters.length;

  const [prescriptions, orders, vitals] = await Promise.all([
    scanEncounters(encounters, total, encounterScan, fetchEncounterPrescriptions),
    scanEncounters(encounters, total, encounterScan, fetchEncounterOrders),
    scanEncounters(encounters, total, encounterScan, fetchEncounterVitals),
  ]);

  // Newest recording wins. `recorded_at` is the clinical time; fall back to
  // `created_at` only when the server left it null.
  const sortedVitals = [...vitals.items].sort(
    (a, b) => vitalsTime(b) - vitalsTime(a)
  );

  return {
    problems,
    encounters,
    encounterTotal: total,
    prescriptions,
    orders,
    latestVitals: sortedVitals[0] ?? null,
    // Every encounter we tried failed, and we did try at least one: that is a
    // failure to read vitals, not an absence of vitals.
    vitalsFailed: vitals.failed > 0 && vitals.scanned === 0,
  };
}

function vitalsTime(v: ChartVitals): number {
  const t = Date.parse(v.recorded_at ?? v.created_at ?? '');
  return Number.isFinite(t) ? t : 0;
}

/** Page type re-export so screens can annotate search state. */
export type { Page as ChartPage };
