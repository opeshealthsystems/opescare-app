/**
 * In-memory booking draft store.
 *
 * CARE-010's route is typed `{ draftId: string }`, so the form (CARE-009) parks
 * what the user chose here and the review screen picks it up by id. Nothing is
 * persisted — the draft only has to survive one push, and the *appointment*
 * itself is created by the API on CARE-010, never here.
 */
import type { AppointmentType, AvailabilitySlot, PortalProviderDetail, VisitMode } from '../../api';

export type BookingDraft = {
  id: string;
  provider: PortalProviderDetail;
  slot: AvailabilitySlot;
  appointmentType: AppointmentType;
  visitMode: VisitMode;
  reason: string;
};

const drafts = new Map<string, BookingDraft>();

let counter = 0;

export function putDraft(draft: Omit<BookingDraft, 'id'>): string {
  counter += 1;
  const id = `draft-${Date.now()}-${counter}`;
  drafts.set(id, { ...draft, id });
  // Keep the store from growing across a long demo session.
  if (drafts.size > 8) {
    const oldest = drafts.keys().next().value;
    if (oldest) drafts.delete(oldest);
  }
  return id;
}

export function getDraft(id: string): BookingDraft | undefined {
  return drafts.get(id);
}

export function dropDraft(id: string): void {
  drafts.delete(id);
}
