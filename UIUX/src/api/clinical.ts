import { apiClient } from './client';

type Paginated<T> = {
  data: T[];
  meta: { pagination: { current_page: number; last_page: number; total: number } };
};

export type Appointment = {
  id: number;
  provider_name: string | null;
  scheduled_at: string;
  duration_minutes: number;
  appointment_type: string;
  reason: string | null;
  status: string;
};

export type EncounterSummary = {
  id: string;
  encounter_type: string;
  status: string;
  encounter_date: string;
  doctor_name: string | null;
  chief_complaint: string | null;
};

export type EncounterDetail = EncounterSummary & {
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  discharge_note: string | null;
  follow_up_date: string | null;
  diagnoses: { id: number; icd10_code: string; icd10_description: string | null; diagnosis_type: string; notes: string | null }[];
  prescriptions: { id: number; drug_name: string; dosage: string | null; route: string | null; frequency: string | null; duration: string | null; instructions: string | null; status: string }[];
  vitals: {
    id: number;
    bp_systolic: number | null;
    bp_diastolic: number | null;
    temperature: number | null;
    pulse: number | null;
    respiratory_rate: number | null;
    spo2: number | null;
    weight: number | null;
    height: number | null;
    bmi: number | null;
    recorded_at: string;
  } | null;
  clinical_orders: { id: number; order_type: string; name: string; status: string; result_summary: string | null; ordered_at: string }[];
};

export type Prescription = {
  id: number;
  drug_name: string;
  dosage: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  status: string;
  encounter_id: string;
  created_at: string;
};

export type Vitals = {
  id: number;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  temperature: number | null;
  pulse: number | null;
  respiratory_rate: number | null;
  spo2: number | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  blood_glucose: number | null;
  recorded_at: string;
};

export type Diagnosis = {
  id: number;
  icd10_code: string;
  icd10_description: string | null;
  diagnosis_type: string;
  add_to_problem_list: boolean;
  notes: string | null;
  encounter_id: string;
  created_at: string;
};

export type Immunization = {
  id: number;
  vaccine_name: string;
  dose_number: number | null;
  given_date: string;
  next_due_date: string | null;
  site: string | null;
  notes: string | null;
};

export type Allergy = {
  id: number;
  allergy_type: string;
  allergen: string;
  severity: string;
  reaction: string | null;
  onset_date: string | null;
  notes: string | null;
};

export type TimelineEvent = {
  type: string;
  id: string;
  title: string;
  description: string | null;
  occurred_at: string | null;
  icon: string;
  is_abnormal?: boolean;
};

export type Invoice = {
  id: number;
  invoice_number: string;
  total_amount: string;
  discount_amount: string;
  amount_paid: string;
  balance: string;
  status: string;
  issued_at: string | null;
};

export type PatientDocument = {
  id: number;
  document_type: string;
  label: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
};

/** Thrown when the account isn't linked to a clinical record yet (API returns 409). */
export class NotLinkedError extends Error {
  constructor() {
    super('Account is not linked to a clinical record.');
    this.name = 'NotLinkedError';
  }
}

async function get<T>(path: string): Promise<Paginated<T>> {
  try {
    const res = await apiClient.get<Paginated<T>>(path);
    return res.data;
  } catch (e: any) {
    if (e?.response?.status === 409) {
      throw new NotLinkedError();
    }
    throw e;
  }
}

export const fetchAppointments = () => get<Appointment>('/patient/appointments');
export const fetchEncounters = () => get<EncounterSummary>('/patient/encounters');
export const fetchPrescriptions = () => get<Prescription>('/patient/prescriptions');
export const fetchVitals = () => get<Vitals>('/patient/vitals');
export const fetchDiagnoses = () => get<Diagnosis>('/patient/diagnoses');
export const fetchImmunizations = () => get<Immunization>('/patient/immunizations');
export const fetchInvoices = () => get<Invoice>('/patient/invoices');
export const fetchDocuments = () => get<PatientDocument>('/patient/documents');
export const fetchAllergies = () => get<Allergy>('/patient/allergies');
export const fetchTimeline = () => get<TimelineEvent>('/patient/timeline');

export async function fetchEncounterDetail(id: string): Promise<EncounterDetail> {
  try {
    const res = await apiClient.get<{ data: EncounterDetail }>(`/patient/encounters/${id}`);
    return res.data.data;
  } catch (e: any) {
    if (e?.response?.status === 409) {
      throw new NotLinkedError();
    }
    throw e;
  }
}
