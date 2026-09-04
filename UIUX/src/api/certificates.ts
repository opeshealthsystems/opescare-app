/**
 * Medical certificates (DOC-001 / DOC-002).
 *
 * The rendered PDF is still a `PortalDocument` — these endpoints add the
 * structure the certificate screens render: number, issue date, the unfit
 * period, the signing clinician, and the public verification code the QR
 * block encodes.
 */
import { getOne, getPage, post, Page, PageQuery } from './portal';

export type CertificateStatus = 'requested' | 'issued' | 'revoked';

export type CertificatePatient = {
  name: string | null;
  medical_id: string | null;
  age: number | null;
  sex: string | null;
};

export type MedicalCertificate = {
  id: string;
  document_id: string | null;
  certificate_number: string;
  verification_code: string;
  status: CertificateStatus;
  is_verified: boolean;
  requested_at: string | null;
  issued_at: string | null;
  examined_at: string | null;
  verified_at: string | null;

  facility_name: string | null;
  provider_name: string | null;
  provider_role: string | null;
  provider_registration_no: string | null;

  /** ISO dates (no time) — the period the patient is certified unfit. */
  unfit_from: string | null;
  unfit_to: string | null;
  rest_days: number | null;
  diagnosis: string | null;
  advice: string | null;
  purpose: string | null;

  saved_to_record: boolean;

  patient: CertificatePatient;
  document: {
    id: string;
    document_type: string;
    label: string | null;
    file_type: string | null;
    file_size: number | null;
    encounter_id: string | null;
    created_at: string;
  } | null;
};

export type CertificateRequestInput = {
  purpose: string;
  unfit_from?: string;
  unfit_to?: string;
  note?: string;
};

export const fetchCertificates = (query: PageQuery = {}) =>
  getPage<MedicalCertificate>('/patient/certificates', query);

export const fetchCertificate = (id: string) =>
  getOne<MedicalCertificate>(`/patient/certificates/${id}`);

/** DOC-001 arrives holding a document id, not a certificate id. */
export const fetchCertificateForDocument = (documentId: string) =>
  getOne<MedicalCertificate>(`/patient/documents/${documentId}/certificate`);

export const requestCertificate = (input: CertificateRequestInput) =>
  post<MedicalCertificate>('/patient/certificates', input);

/** DOC-002's "Save to Health Record" switch. */
export const setCertificateSaved = (id: string, saved: boolean) =>
  post<MedicalCertificate>(`/patient/certificates/${id}/save`, { saved });

export type { Page, PageQuery };
