/**
 * The DOCTOR side of secure messaging — `GET/POST /staff/messages/*`.
 *
 * Deliberately a thin sibling of `messaging.ts` rather than a fork of it: the
 * message shape a doctor reads is the same `PortalMessage` the patient reads
 * (the server serialises both through PortalPresenter::message, so the in-chat
 * cards stay identical), and only the *thread* differs — a clinician's
 * counterpart is a patient, and `unread_count` is the provider's unread, not
 * the patient's.
 *
 * These endpoints are staff-token only. A patient portal token is rejected at
 * the middleware (EnsureStaffToken), and a thread this clinician is not a
 * party to answers 404 — never another patient's correspondence.
 */
import { getOne, getPage, patch, post, Page, PageQuery } from './portal';
import type { PortalMessage } from './messaging';

/** A conversation as the clinician sees it. */
export type StaffThread = {
  id: string;
  /** `patient` — correspondence with a patient. `internal` — a colleague. */
  kind: 'patient' | 'internal' | string;
  subject: string | null;
  status: 'open' | 'archived' | 'closed' | string;
  patient_id: string | null;
  patient_name: string | null;
  /** The hospital medical id, so two patients with the same name are separable. */
  patient_number: string | null;
  /** Who this conversation is *with*, from this clinician's seat. */
  counterpart_name: string | null;
  provider_id: number | null;
  provider_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  /** Messages waiting on THIS clinician. Straight from the server; never derived. */
  unread_count: number;
};

export type StaffThreadDetail = StaffThread & { messages: PortalMessage[] };

export type StaffThreadQuery = PageQuery & {
  /** Only conversations with something waiting on me. */
  unread?: boolean;
  /** `archived` switches to the archive folder; omitted means the live inbox. */
  status?: 'archived';
  kind?: 'patient' | 'internal';
  q?: string;
};

/** Mirrors the desktop "Options" block: mark unread, archive, reopen. */
export type StaffThreadState = 'unread' | 'archive' | 'reopen';

export type StaffUnreadCounts = {
  unread_threads: number;
  unread_messages: number;
};

export const fetchStaffThreads = (query: StaffThreadQuery = {}) =>
  getPage<StaffThread>('/staff/messages/threads', query);

/**
 * Opening a thread marks its inbound messages read server-side — the same
 * write the desktop screen performs. The messages come back as they were
 * *before* that write, so the doctor still sees what was waiting.
 */
export const fetchStaffThread = (threadId: string) =>
  getOne<StaffThreadDetail>(`/staff/messages/threads/${threadId}`);

/** Returns the persisted row, so a reply that appears has genuinely landed. */
export const sendStaffMessage = (threadId: string, body: string) =>
  post<PortalMessage>(`/staff/messages/threads/${threadId}/messages`, { body });

export const setStaffThreadState = (threadId: string, state: StaffThreadState) =>
  patch<StaffThread>(`/staff/messages/threads/${threadId}/state`, { state });

export const fetchStaffUnreadCounts = () => getOne<StaffUnreadCounts>('/staff/messages/unread-count');

export type { Page, PageQuery, PortalMessage };
