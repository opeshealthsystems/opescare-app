/**
 * Documents (with download + share), care plans, referrals, allergies,
 * problems and the unified timeline (DOC-001/002, CARE-019/020).
 */
import { API_BASE_URL } from './config';
import { getBlob, getOne, getPage, post, Page, PageQuery } from './portal';

export type DocumentType =
  | 'lab_result'
  | 'radiology'
  | 'referral'
  | 'old_record'
  | 'certificate'
  | 'care_plan'
  | 'invoice'
  | 'discharge_summary'
  | 'other';

export type PortalDocument = {
  id: string;
  document_type: DocumentType;
  label: string | null;
  file_type: string | null;
  file_size: number | null;
  encounter_id: string | null;
  created_at: string;
};

export type PortalDocumentDetail = PortalDocument & {
  is_available: boolean;
  /** Authenticated URL — needs the bearer token, so fetch it via downloadDocument(). */
  download_url: string;
};

export type DocumentShare = {
  document: PortalDocument;
  /**
   * Signed, time-limited and self-authorising — safe to hand to someone who
   * has no OPES account (share sheet, WhatsApp, email).
   */
  share_url: string;
  expires_at: string;
  expires_in_minutes: number;
};

export type PortalCarePlan = {
  id: string;
  problem: string;
  priority: 'low' | 'medium' | 'high';
  goal: string;
  /** Already split into individual steps for the checklist UI. */
  interventions: string[];
  evaluation: string | null;
  target_date: string | null;
  status: 'active' | 'met' | 'discontinued';
  created_at: string;
};

export type PortalReferral = {
  id: string;
  referred_to: string | null;
  facility: string | null;
  specialty: string | null;
  reason: string | null;
  urgency: 'routine' | 'urgent' | 'emergency';
  status: 'pending' | 'sent' | 'acknowledged' | 'completed' | 'cancelled';
  notes: string | null;
  referred_at: string | null;
};

export type PortalAllergy = {
  id: string;
  allergy_type: 'drug' | 'food' | 'environmental' | 'other';
  allergen: string;
  severity: 'mild' | 'moderate' | 'severe' | 'anaphylaxis';
  reaction: string | null;
  onset_date: string | null;
  notes: string | null;
};

export type PortalProblem = {
  id: string;
  icd10_code: string | null;
  icd10_description: string | null;
  onset_date: string | null;
  status: 'active' | 'resolved' | 'inactive';
  notes: string | null;
};

export type TimelineEventType =
  | 'encounter'
  | 'lab_result'
  | 'imaging'
  | 'prescription'
  | 'immunization';

export type TimelineEvent = {
  type: TimelineEventType;
  id: string;
  title: string;
  description: string | null;
  occurred_at: string | null;
  icon: string;
  is_abnormal?: boolean;
};

export type DocumentQuery = PageQuery & {
  /** Comma-separated document types. */
  document_type?: string;
};

export type TimelineQuery = PageQuery & {
  /** Comma-separated event types, e.g. "lab_result,imaging". */
  types?: string;
};

export const fetchDocuments = (query: DocumentQuery = {}) =>
  getPage<PortalDocument>('/patient/documents', query);

export const fetchDocument = (id: string) => getOne<PortalDocumentDetail>(`/patient/documents/${id}`);

/** Fetches the PDF bytes with the bearer token attached. */
export const downloadDocument = (id: string) => getBlob(`/patient/documents/${id}/download`);

/** Mints a signed link that expires on its own — nothing to revoke afterwards. */
export const shareDocument = (id: string) => post<DocumentShare>(`/patient/documents/${id}/share`);

/** Absolute URL for a share link, for the native share sheet. */
export const absoluteShareUrl = (shareUrl: string): string =>
  shareUrl.startsWith('http') ? shareUrl : `${API_BASE_URL}${shareUrl}`;

export const fetchCarePlans = (query: PageQuery = {}) =>
  getPage<PortalCarePlan>('/patient/care-plans', query);

export const fetchReferrals = (query: PageQuery = {}) =>
  getPage<PortalReferral>('/patient/referrals', query);

export const fetchAllergies = () => getOne<PortalAllergy[]>('/patient/allergies');

export const fetchProblems = (status?: PortalProblem['status']) =>
  getOne<PortalProblem[]>('/patient/problems', status ? { status } : undefined);

export const fetchTimeline = (query: TimelineQuery = {}) =>
  getPage<TimelineEvent>('/patient/timeline', query);

export type { Page, PageQuery };
