/**
 * Secure messaging with providers, including the structured in-chat cards
 * (MSG-002, MSG-012 prescription, MSG-024 care plan, MSG-025 follow-up,
 * MSG-026 referral, DIA-020 imaging result, BILL-001 invoice).
 */
import { getOne, getPage, post, Page, PageQuery } from './portal';

export type MessageSenderType = 'patient' | 'provider' | 'facility' | 'system';

export type MessageCardType =
  | 'none'
  | 'prescription'
  | 'care_plan'
  | 'referral'
  | 'follow_up_instructions'
  | 'imaging_result'
  | 'lab_result'
  | 'invoice'
  | 'appointment'
  | 'medication_list'
  | 'lab_order'
  | 'imaging_order'
  | 'document_request';

/** The MSG-001 "Your Medication List" table — the patient's active chart meds. */
export type MedicationListCard = {
  title: string;
  last_updated: string;
  medications: {
    drug_name: string;
    form: string;
    dosage: string;
    taken_for: string;
    start_date: string;
    status: string;
  }[];
  important: string;
};

/**
 * The WGT-001 appointment card. Its payload is re-derived from the live
 * appointment on every read, so `status` here is the scheduling module's
 * status — cancel at the front desk and this card says so.
 */
export type AppointmentCard = {
  appointment_id: string;
  provider_name: string;
  specialty: string | null;
  department: string | null;
  facility: string | null;
  scheduled_at: string;
  duration_minutes: number;
  visit_mode: 'in_person' | 'telemedicine';
  appointment_type: string;
  location: string | null;
  room: string | null;
  status: string;
  reason: string | null;
  booking_channel: string | null;
  cancel_reason: string | null;
  is_cancelled: boolean;
};

/** A laboratory order (staff) or a test request awaiting approval (patient). */
export type LabOrderCard = {
  kind: 'order' | 'request';
  title: string;
  code: string | null;
  order_type: string;
  priority: 'routine' | 'urgent' | 'stat';
  status: string;
  clinical_notes: string | null;
  result_summary: string | null;
  ordered_by: string;
  ordered_at: string;
  reference: string | null;
  needs_approval: boolean;
};

export type ImagingOrderCard = {
  study: string;
  modality: string;
  body_part: string | null;
  view_label: string | null;
  priority: 'routine' | 'urgent' | 'stat';
  status: string;
  order_number: string | null;
  clinical_indication: string | null;
  patient_note: string | null;
  ordered_by: string;
  ordered_at: string;
  scheduled_at: string | null;
};

export type DocumentRequestCard = {
  document_type: string;
  type_label: string;
  label: string;
  reference: string | null;
  status: string;
  note: string | null;
  requested_by: string;
  requested_at: string;
  needed_by: string | null;
  is_fulfilled: boolean;
  file_available: boolean;
};

export type PrescriptionCard = {
  drug_name: string;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  duration: string | null;
  purpose: string | null;
  instructions: string | null;
  prescribed_by: string;
  prescribed_at: string;
  refills_left: number;
};

export type CarePlanCard = {
  title: string;
  priority: 'low' | 'medium' | 'high';
  goal: string;
  target_date: string;
  status: string;
  created_by: string;
  interventions: string[];
};

export type FollowUpInstructionsCard = {
  title: string;
  due_by: string;
  steps: { label: string; detail: string }[];
  warning_signs: string[];
};

export type ReferralCard = {
  referred_to: string;
  specialty: string;
  facility: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  status: string;
  reason: string;
  referred_by: string;
  referred_at: string;
  appointment_at: string | null;
};

export type ImagingResultCard = {
  study: string;
  modality: string;
  body_part: string;
  performed_at: string;
  reported_by: string;
  status: string;
  result_summary: string;
  findings: string | null;
  impression: string | null;
  image_reference: string | null;
  is_abnormal: boolean;
};

export type InvoiceCard = {
  invoice_number: string;
  facility: string;
  facility_city: string;
  facility_phone: string;
  facility_email: string;
  issued_at: string;
  due_at: string;
  currency: string;
  total: number;
  balance: number;
  items: { description: string; quantity: number; unit_price: number; line_total: number }[];
  payment_methods: string[];
};

/**
 * Narrow on `card_type` to get the right payload shape:
 *
 *   if (m.card_type === 'invoice') { const card = m.card_payload as InvoiceCard; }
 */
export type MessageCardPayload =
  | AppointmentCard
  | LabOrderCard
  | ImagingOrderCard
  | DocumentRequestCard
  | MedicationListCard
  | PrescriptionCard
  | CarePlanCard
  | FollowUpInstructionsCard
  | ReferralCard
  | ImagingResultCard
  | InvoiceCard
  | Record<string, unknown>
  | null;

export type PortalMessage = {
  id: string;
  thread_id: string;
  sender_type: MessageSenderType;
  sender_name: string | null;
  /** True when the patient sent it — render right-aligned. */
  is_mine: boolean;
  body: string | null;
  card_type: MessageCardType;
  card_payload: MessageCardPayload;
  /** Id of the live record the card refers to, for deep-linking. */
  card_reference_id: string | null;
  /** Registry id of the workflow that produced the card, when one did. */
  card_widget_id?: string | null;
  /** Last synchronised status of that live record. */
  card_status?: string | null;
  attachment_path: string | null;
  attachment_type: string | null;
  read_at: string | null;
  sent_at: string;
};

export type PortalThread = {
  id: string;
  subject: string | null;
  status: 'open' | 'archived' | 'closed';
  provider_id: number | null;
  provider_name: string | null;
  provider_specialty: string | null;
  provider_photo_url: string | null;
  provider_is_online: boolean;
  facility_id: string | null;
  facility_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
};

export type PortalThreadDetail = PortalThread & { messages: PortalMessage[] };

export type ThreadQuery = PageQuery & {
  unread?: boolean;
  status?: PortalThread['status'];
};

export type StartThreadInput = {
  provider_id: number;
  subject?: string;
  body: string;
};

export type UnreadCounts = {
  unread_threads: number;
  unread_messages: number;
};

export const fetchThreads = (query: ThreadQuery = {}) =>
  getPage<PortalThread>('/patient/messages/threads', query);

/** Opening a thread marks its inbound messages read server-side. */
export const fetchThread = (threadId: string) =>
  getOne<PortalThreadDetail>(`/patient/messages/threads/${threadId}`);

export const sendMessage = (threadId: string, body: string) =>
  post<PortalMessage>(`/patient/messages/threads/${threadId}/messages`, { body });

export const startThread = (input: StartThreadInput) =>
  post<PortalThreadDetail>('/patient/messages/threads', input);

export const markThreadRead = (threadId: string) =>
  post<PortalThread & { marked_read: number }>(`/patient/messages/threads/${threadId}/read`);

export const fetchUnreadCounts = () => getOne<UnreadCounts>('/patient/messages/unread-count');

export type { Page, PageQuery };
