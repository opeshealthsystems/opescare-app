/** Medications, prescriptions and the dose timeline (MED-001/003/005). */
import { getOne, getPage, post, Page, PageQuery } from './portal';

export type PrescriptionStatus = 'active' | 'completed' | 'stopped';

export type DoseStatus = 'upcoming' | 'taken' | 'missed' | 'skipped';

export type TimeOfDay = 'morning' | 'midday' | 'evening' | 'night' | 'as_needed';

export type PortalPrescription = {
  id: string;
  drug_name: string;
  dosage: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  status: PrescriptionStatus;
  encounter_id: string;
  prescribed_by: number | null;
  prescriber_name: string | null;
  started_at: string;
  next_dose_at: string | null;
  next_dose_label: string | null;

  // Patient-facing detail (MED-003 / MED-005).
  /** Human prescription reference, e.g. "RX-CCR-2026-08765". */
  reference: string | null;
  /** Dosage form: Tablet, Capsule, Inhaler… */
  form: string | null;
  /** What it is for — shown under the drug name ("Pain relief / Fever"). */
  purpose: string | null;
  condition_treated: string | null;
  prescriber_notes: string | null;
  /** Quantity dispensed per fill ("20 capsules"). */
  quantity_label: string | null;
  prescriber_specialty: string | null;
  facility_name: string | null;
  starts_on: string | null;
  ends_on: string | null;
  follow_up_on: string | null;
  refill_due_on: string | null;
  refills_allowed: number;
  refills_used: number;
  refills_remaining: number;
  pharmacy_name: string | null;
  pharmacy_phone: string | null;
  prescription_type: string;
  is_dispensed: boolean;
  verified_at: string | null;
};

export type PrescriptionDetail = PortalPrescription & {
  doses: MedicationDose[];
  doses_taken: number;
  doses_missed: number;
  doses_remaining: number;
  last_taken_at: string | null;
  /**
   * MED-003 renders one prescription slip that may carry several drugs.
   * Clinically each drug is its own prescription row, so `items` is every
   * prescription written in the same encounter — this one first.
   */
  items: PortalPrescription[];
  patient_name: string | null;
  patient_reference: string | null;
  diagnosis: string | null;
};

export type MedicationDose = {
  id: string;
  prescription_id: string;
  drug_name: string;
  dose_label: string | null;
  /** e.g. "After breakfast" — shown under the drug name on the timeline. */
  instruction: string | null;
  time_of_day: TimeOfDay;
  scheduled_at: string;
  status: DoseStatus;
  taken_at: string | null;
  note: string | null;
};

export type MedicationsOverview = {
  active_count: number;
  ongoing_treatments: number;
  next_dose: MedicationDose | null;
  adherence_percent: number | null;
  medications: PortalPrescription[];
};

export type ScheduleDay = {
  date: string;
  taken: number;
  total: number;
  doses: MedicationDose[];
};

export type MedicationSchedule = {
  from: string;
  to: string;
  total: number;
  days: ScheduleDay[];
};

export type ScheduleQuery = {
  /** Defaults to today. */
  date?: string;
  /** How many days from `date` to return (1–31). */
  days?: number;
};

export type PrescriptionQuery = PageQuery & {
  status?: PrescriptionStatus | 'all';
};

export type RecordDoseInput = {
  note?: string;
  /** Defaults to now; must not be in the future. */
  taken_at?: string;
};

export const fetchMedications = () => getOne<MedicationsOverview>('/patient/medications');

export const fetchMedicationSchedule = (query: ScheduleQuery = {}) =>
  getOne<MedicationSchedule>('/patient/medications/schedule', query);

/** Throws PortalConflictError if the dose is already recorded or is for a later day. */
export const markDoseTaken = (doseId: string, input: RecordDoseInput = {}) =>
  post<MedicationDose>(`/patient/medications/doses/${doseId}/taken`, input);

export const markDoseSkipped = (doseId: string, input: RecordDoseInput = {}) =>
  post<MedicationDose>(`/patient/medications/doses/${doseId}/skip`, input);

export const fetchPrescriptions = (query: PrescriptionQuery = {}) =>
  getPage<PortalPrescription>('/patient/prescriptions', query);

export const fetchPrescription = (id: string) =>
  getOne<PrescriptionDetail>(`/patient/prescriptions/${id}`);

export type { Page, PageQuery };
