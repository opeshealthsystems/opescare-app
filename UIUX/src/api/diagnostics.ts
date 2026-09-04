/** Lab results, trends, imaging and vitals charts (the DIA-* screen family). */
import { getOne, getPage, Page, PageQuery } from './portal';

export type ResultFlag = 'normal' | 'low' | 'high' | 'abnormal' | 'critical';

export type PortalLabResult = {
  id: string;
  analyte: string;
  value: string;
  /** Present when the value is chartable; null for free-text results. */
  numeric_value: number | null;
  unit: string | null;
  reference: string | null;
  ref_low: number | null;
  ref_high: number | null;
  flag: ResultFlag;
  is_abnormal: boolean;
  entered_by: string | null;
  entered_at: string | null;
};

export type LabOrderStatus = 'ordered' | 'in_progress' | 'completed' | 'cancelled';

export type PortalLabOrder = {
  id: string;
  name: string;
  code: string | null;
  order_type: string;
  priority: 'routine' | 'urgent' | 'stat';
  status: LabOrderStatus;
  result_summary: string | null;
  ordered_at: string | null;
  encounter_id: string;
  overall_flag: 'normal' | 'abnormal' | 'critical';
  result_count: number;
  results: PortalLabResult[];
};

export type LabOrderDetail = PortalLabOrder & {
  ordered_by_name: string | null;
  clinical_notes: string | null;
};

export type TrendPoint = {
  recorded_at: string | null;
  value: number;
  flag: ResultFlag;
};

export type LabTrend = {
  analyte: string;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  latest: PortalLabResult;
  direction: 'up' | 'down' | 'flat';
  change_percent: number | null;
  min: number;
  max: number;
  points: TrendPoint[];
};

export type ImagingModality = 'xray' | 'ct' | 'mri' | 'ultrasound' | 'mammography' | 'fluoroscopy' | 'other';

export type ImagingResultFlag = 'normal' | 'abnormal' | 'critical';

export type ImagingStatus = 'ordered' | 'scheduled' | 'performed' | 'reported' | 'cancelled';

/** One stored image instance of a study (`imaging_study_images`). */
export type ImagingStudyImage = {
  id: string;
  series_number: number;
  instance_number: number;
  view_label: string;
  series_description: string | null;
  is_primary: boolean;
  mime_type: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
  laterality: string | null;
  captured_at: string | null;
  /** Bearer-authenticated URLs — pass the token as an Authorization header. */
  thumbnail_url: string;
  image_url: string;
};

export type PortalImagingStudy = {
  id: string;
  study_uid: string | null;
  accession_number: string | null;
  order_number: string | null;
  modality: ImagingModality;
  /** "X-Ray", "CT Scan", … — the label the references print. */
  modality_label: string;
  body_part: string;
  study_name: string;
  view_label: string | null;
  exposure: string | null;
  clinical_indication: string | null;
  priority: 'routine' | 'urgent' | 'stat';
  status: ImagingStatus;
  ordered_at: string | null;
  scheduled_at: string | null;
  facility_id: string | null;
  facility_name: string | null;
  /** "St. Mary's Hospital – Radiology". */
  location: string | null;
  has_report: boolean;
  impression: string | null;
  result_flag: ImagingResultFlag | null;
  report_status: 'draft' | 'final' | 'amended' | string | null;
  image_count: number;
  thumbnail_url: string | null;
};

export type ImagingStudyPatient = {
  id: string;
  name: string;
  medical_id: string | null;
  opescare_id: string | null;
  sex: string | null;
  age: number | null;
  phone: string | null;
};

export type ImagingStudyDocument = {
  id: string;
  label: string | null;
  document_type: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string | null;
  download_url: string;
};

export type ImagingStudyDetail = PortalImagingStudy & {
  findings: string | null;
  recommendation: string | null;
  report_number: string | null;
  image_reference: string | null;
  reported_at: string | null;
  radiologist_name: string | null;
  radiologist_title: string | null;
  radiologist_registration: string | null;
  report_document_id: string | null;
  encounter_id: string | null;
  order_source: string | null;
  order_type: string | null;
  radiologist_note: string | null;
  patient_note: string | null;
  appointment_id: string | null;
  saved_to_record_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  images: ImagingStudyImage[];
  ordered_by_name: string | null;
  ordered_by_specialty: string | null;
  ordered_by_facility: string | null;
  patient: ImagingStudyPatient;
  documents: ImagingStudyDocument[];
  prior_studies: PortalImagingStudy[];
};

export type DiagnosticsSummary = {
  lab_orders_total: number;
  lab_orders_pending: number;
  results_total: number;
  results_abnormal: number;
  results_critical: number;
  imaging_total: number;
  imaging_reported: number;
  latest_lab_order: PortalLabOrder | null;
  /** Analyte names you can pass to fetchLabTrend(). */
  trendable_analytes: string[];
};

export type VitalsMetric =
  | 'bp_systolic'
  | 'bp_diastolic'
  | 'pulse'
  | 'temperature'
  | 'spo2'
  | 'weight'
  | 'height'
  | 'bmi'
  | 'blood_glucose'
  | 'respiratory_rate';

export type VitalsSeries = {
  metric: VitalsMetric;
  unit: string;
  latest: number;
  points: { recorded_at: string | null; value: number }[];
};

export type VitalsTrends = {
  latest_recorded_at: string | null;
  series: VitalsSeries[];
};

export type LabOrderQuery = PageQuery & {
  flag?: 'normal' | 'abnormal' | 'critical' | 'all';
  /** Comma-separated statuses. */
  status?: string;
};

export type ImagingQuery = PageQuery & {
  modality?: ImagingModality;
  /** Comma-separated statuses. */
  status?: string;
};

export type VitalsTrendQuery = {
  metric?: VitalsMetric;
  /** Number of most-recent readings to include (2–200, default 24). */
  limit?: number;
};

export const fetchDiagnosticsSummary = () => getOne<DiagnosticsSummary>('/patient/diagnostics/summary');

export const fetchLabOrders = (query: LabOrderQuery = {}) =>
  getPage<PortalLabOrder>('/patient/lab-orders', query);

export const fetchLabOrder = (id: string) => getOne<LabOrderDetail>(`/patient/lab-orders/${id}`);

export const fetchLabTrend = (analyte: string) =>
  getOne<LabTrend>(`/patient/lab-trends/${encodeURIComponent(analyte)}`);

export const fetchImagingStudies = (query: ImagingQuery = {}) =>
  getPage<PortalImagingStudy>('/patient/imaging', query);

export const fetchImagingStudy = (id: string) => getOne<ImagingStudyDetail>(`/patient/imaging/${id}`);

export const fetchVitalsTrends = (query: VitalsTrendQuery = {}) =>
  getOne<VitalsTrends>('/patient/vitals-trends', query);

export type { Page, PageQuery };
