/**
 * Imaging bytes, the rendered radiologist report and the download / share
 * flow — the four screens DIA-009, DIA-010, DIA-012 and DIA-014.
 *
 * `diagnostics.ts` already describes *which* studies a patient has; this module
 * covers what those screens additionally need: the individual stored image
 * instances (served from short-lived signed URLs, so a plain `<Image>` renders
 * them with no bearer header), the report laid out as a document, and a genuine
 * share link minted by the same signed-route mechanism as patient documents.
 *
 * Deliberately not re-exported from `src/api/index.ts` — import it directly:
 *
 *   import { fetchStudyImages } from '../../api/imaging';
 */
import { API_BASE_URL } from './config';
import { getOne, post } from './portal';

export type StudyImage = {
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
  sop_instance_uid: string | null;
  /** DICOM window width / centre — the viewer's W:/L: readout. */
  window_width: number | null;
  window_center: number | null;
  laterality: string | null;
  captured_at: string | null;
  /** Signed, time-limited URL for the full-resolution image. */
  url: string;
  /** Signed, time-limited URL for the 320px thumbnail. */
  thumbnail_url: string;
};

export type StudyImageIdentity = {
  id: string;
  study_name: string;
  view_label: string | null;
  modality: string;
  body_part: string;
  status: string;
  study_uid: string | null;
  accession_number: string | null;
  order_number: string | null;
  facility_name: string | null;
  department: string;
  studied_at: string | null;
  clinical_indication: string | null;
  has_report: boolean;
};

export type StudyImageSet = {
  study: StudyImageIdentity;
  images: StudyImage[];
  count: number;
};

export type ImagingReport = {
  id: string;
  study_id: string;
  report_number: string;
  report_status: string;
  study_name: string;
  modality: string;
  body_part: string;
  accession_number: string | null;
  study_uid: string | null;
  facility_name: string | null;
  department: string;
  studied_at: string | null;
  reported_at: string | null;

  patient_name: string | null;
  patient_number: string | null;
  patient_dob: string | null;
  patient_age: number | null;
  patient_gender: string | null;
  patient_phone: string | null;

  referring_doctor: string | null;
  radiologist: string | null;
  radiologist_title: string | null;
  radiologist_registration: string | null;

  clinical_indication: string | null;
  findings: string | null;
  finding_lines: string[];
  impression: string | null;
  impression_lines: string[];
  recommendation: string | null;
  digitally_signed: boolean;

  document_id: string | null;
  file_size: number | null;
  /** Bearer-authenticated path; open it with `absoluteApiUrl()`. */
  download_url: string | null;
};

export type ImagingShareFormat = 'original' | 'image' | 'report';

export type ImagingShareInput = {
  format?: ImagingShareFormat;
  include_images?: boolean;
  include_report?: boolean;
  include_technical?: boolean;
};

export type ImagingShare = {
  study_id: string;
  study_name: string;
  format: ImagingShareFormat;
  include_images: boolean;
  include_report: boolean;
  /** Signed URL a recipient with no OPES account can open. */
  share_url: string;
  expires_at: string;
  expires_in_minutes: number;
  image_count: number;
  has_report: boolean;
  image_urls: string[];
};

/** DIA-009 / DIA-010 — every stored instance for a study, in series order. */
export const fetchStudyImages = (studyId: string) =>
  getOne<StudyImageSet>(`/patient/imaging/${studyId}/images`);

/** DIA-012 — the radiologist report laid out for the document viewer. */
export const fetchImagingReport = (reportId: string) =>
  getOne<ImagingReport>(`/patient/imaging-reports/${reportId}`);

/** DIA-014 — mint a real, expiring share link for this study. */
export const shareImagingStudy = (studyId: string, input: ImagingShareInput = {}) =>
  post<ImagingShare>(`/patient/imaging/${studyId}/share`, input as Record<string, unknown>);

/** Turn a relative API path or an already-absolute link into something openable. */
export function absoluteApiUrl(url: string): string {
  if (url.startsWith('http')) return url;
  const root = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  return url.startsWith('/api') ? `${root}${url}` : `${API_BASE_URL}${url}`;
}

// ══ Write flows and preparation — DIA-013, DIA-016, DIA-017 ═════════════════
//
// The four screens above are read-only. These three change something: they file
// a study into the health record, record an attestation, and book a new study.
// `StudyImageIdentity` is reused as the study header — the server emits the
// same shape from every one of these endpoints.

// ── DIA-013 — Add Imaging to Health Record ──────────────────────────────────

/** One line of the "What will be saved" checklist. */
export type HealthRecordComponent = {
  key: 'study' | 'report' | 'images';
  title: string;
  subtitle: string;
  /** False when the study has no report issued yet, or no stored images. */
  included: boolean;
};

export type ImagingHealthRecordState = {
  study: StudyImageIdentity;
  scheduled_at: string | null;
  components: HealthRecordComponent[];
  destination: { key: string; title: string; subtitle: string };
  is_saved: boolean;
  saved_at: string | null;
  document_id: string | null;
  image_count: number;
};

export const fetchImagingHealthRecord = (studyId: string) =>
  getOne<ImagingHealthRecordState>(`/patient/imaging/${studyId}/health-record`);

/** Idempotent — a study already filed comes back unchanged, never duplicated. */
export const saveImagingToHealthRecord = (studyId: string) =>
  post<ImagingHealthRecordState>(`/patient/imaging/${studyId}/health-record`, {
    destination: 'health_record',
  });

// ── DIA-017 — Imaging Preparation ───────────────────────────────────────────

/**
 * `icon` is an `IconName` and `tint` a `Tint` from the design system: the
 * server stores the glyph choice alongside the clinical text so the two stay
 * together. Both are strings here and validated at the screen boundary.
 */
export type PreparationInstruction = {
  id: string;
  step_number: number;
  title: string;
  body: string;
  icon: string;
  tint: string;
  is_critical: boolean;
};

export type ImagingPreparation = {
  study: StudyImageIdentity;
  patient: {
    id: string | null;
    name: string | null;
    medical_id: string | null;
    sex: string | null;
    age: number | null;
    phone: string | null;
  };
  appointment: {
    id: string | null;
    scheduled_at: string | null;
    location: string;
    facility_name: string | null;
    order_number: string | null;
  };
  instructions: PreparationInstruction[];
  notes: string[];
  contact: { label: string; phone: string };
  acknowledged_at: string | null;
};

export const fetchImagingPreparation = (studyId: string) =>
  getOne<ImagingPreparation>(`/patient/imaging/${studyId}/preparation`);

export type PreparationAcknowledgement = {
  acknowledged_at: string;
  instruction_count: number;
};

/** "I Understand & Accept" — recorded once per patient per study. */
export const acknowledgeImagingPreparation = (studyId: string) =>
  post<PreparationAcknowledgement>(`/patient/imaging/${studyId}/preparation/acknowledge`);

// ── DIA-016 — Book Imaging Study ────────────────────────────────────────────

export type ImagingProcedureOption = {
  id: string;
  code: string;
  /** Already carries the view, e.g. "Chest X-Ray (PA View)". */
  name: string;
  modality: string;
  modality_label: string;
  body_part: string;
  view_label: string | null;
  description: string | null;
  duration_minutes: number;
  preparation_summary: string | null;
  price: number;
  currency: string;
};

export type ImagingFacilityOption = {
  id: string;
  /** "St. Mary's Hospital — Radiology". */
  name: string;
  facility_name: string;
  facility_type: string;
  city: string | null;
  phone: string | null;
};

export type ImagingBookingOptions = {
  procedures: ImagingProcedureOption[];
  /** Only facilities with a rostered radiologist and free future capacity. */
  facilities: ImagingFacilityOption[];
  patient: { id: string; name: string; medical_id: string | null; age: number | null };
};

export const fetchImagingBookingOptions = () =>
  getOne<ImagingBookingOptions>('/patient/imaging-booking/options');

export type ImagingBookingSlot = {
  id: string;
  provider_id: number;
  slot_start: string;
  slot_end: string;
  duration_minutes: number;
  is_available: boolean;
};

export type ImagingBookingSlots = {
  facility_id: string;
  date: string;
  slots: ImagingBookingSlot[];
};

export const fetchImagingBookingSlots = (facilityId: string, date: string) =>
  getOne<ImagingBookingSlots>('/patient/imaging-booking/slots', {
    facility_id: facilityId,
    date,
  });

export type ImagingBookingInput = {
  procedure_id: string;
  facility_id: string;
  slot_id: string;
  reason?: string;
};

export type ImagingBookingResult = {
  study_id: string;
  appointment_id: string;
  study_name: string;
  order_number: string | null;
  scheduled_at: string | null;
  facility_name: string | null;
  status: string;
};

/**
 * Claims the slot through the shared scheduling service (which row-locks it),
 * then files the radiology order against the appointment it created. A slot
 * taken in the meantime comes back as a 409 "Slot Unavailable".
 */
export const bookImagingStudy = (input: ImagingBookingInput) =>
  post<ImagingBookingResult>('/patient/imaging-booking', input as unknown as Record<string, unknown>);
