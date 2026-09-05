/**
 * Who a patient may write to — the data layer for the compose sheet and for
 * the "Message" action on a clinician's profile.
 *
 * A sibling of `lib/api/messagingQueries.ts` rather than an addition to
 * `lib/api/queries.ts`, for the same reason that file exists: this is one
 * feature's surface, and keeping it in its own module means it can be read,
 * reviewed and removed on its own.
 *
 * Backend: `MobileMessagingController::recipients()` and `::start()`.
 *
 * ── The two recipient kinds are not interchangeable ───────────────────────
 * `facilities` are front desks. Every entry the server returns has at least one
 * active staff account behind it, so a facility that appears here can actually
 * answer. This is the default, and the reason the compose button always works
 * even for a patient with no appointment on file.
 *
 * `clinicians` are people already looking after this patient — the server
 * builds the list out of the patient's own record (appointments, care team,
 * encounters, prescriptions, orders, consent) and refuses anyone else with
 * 403 NO_CLINICAL_RELATIONSHIP. There is no search parameter for this half and
 * no way to widen it: it is deliberately not a directory.
 *
 * `deliverable` is a SECOND question, asked after "may they?": whether an inbox
 * exists that would list the result. A clinician can be legitimately on the
 * list and still not be writable today, and the UI has to say so rather than
 * offer a send button that 422s.
 *
 * `basis_label` arrives already translated, from the same server-side rule that
 * enforces the relationship. It is rendered verbatim — the phone does not keep
 * its own copy of a rule it does not own.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import type { MessageThreadDetail } from './queries';

/** `GET /mobile/messages/recipients` — one facility the patient may write to. */
export interface FacilityRecipient {
  /** Internal `facilities` id. This is what `start` wants back. */
  id: string;
  /** The register id the finder and the facility page browse, when linked. */
  care_facility_id: string | null;
  name: string;
  city: string | null;
  /** `appointment` | `facility_episode` | `consent_grant`, or null for a search hit. */
  basis: string | null;
  /** Server-translated sentence for `basis`. Null when there is no basis. */
  basis_label: string | null;
  /** True when the patient has a care history here, false for a search hit. */
  is_care_facility: boolean;
}

/** `GET /mobile/messages/recipients` — one clinician the patient may write to. */
export interface ClinicianRecipient {
  /** `users.id` — the same value `ProviderDetail.id` carries. */
  id: string;
  name: string;
  facility_id: string | null;
  facility_name: string | null;
  /** appointment | care_team | treating_clinician | facility_episode | consent_grant */
  basis: string;
  basis_label: string;
  /** Authorised is not the same as reachable — see the module note. */
  deliverable: boolean;
  appointment_id: string | null;
}

export interface MessageRecipients {
  /** "Not an emergency channel", server-translated. */
  notice: string;
  facilities: FacilityRecipient[];
  clinicians: ClinicianRecipient[];
}

/**
 * Exactly one recipient per request, which is what the server enforces: two is
 * a 422 (MESSAGE_RECIPIENT_AMBIGUOUS) and none is a 422. Modelled as a union so
 * a caller cannot send both by accident.
 */
export type StartThreadPayload =
  | { facility_id: string; body: string }
  | { clinician_id: string; body: string }
  | { appointment_id: string; body: string };

const RECIPIENTS_URL = '/mobile/messages/recipients';
const THREADS_URL = '/mobile/messages/threads';

/**
 * The recipient lists. `search` only ever widens the FACILITY half — the
 * clinician half is fixed by the patient's record and ignores it.
 *
 * A search shorter than the server's two-character floor is sent as no search
 * at all, so a half-typed word does not blank the list the patient was reading.
 */
export function useMessageRecipients(search: string, enabled = true) {
  const q = search.trim().length >= 2 ? search.trim() : '';

  return useQuery({
    queryKey: ['message-recipients', q],
    queryFn: async () =>
      (
        await apiClient.get<{ data: MessageRecipients }>(RECIPIENTS_URL, {
          params: q ? { q } : undefined,
        })
      ).data.data,
    enabled,
    // The list changes when care does, not between keystrokes.
    staleTime: 60_000,
  });
}

/**
 * Open a thread. Invalidates the inbox so the new conversation is there when
 * the caller navigates to it, and the recipient lists because a brand-new
 * thread can change what "already talking to" means on the next open.
 */
export function useStartThread() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: StartThreadPayload) =>
      (await apiClient.post<{ data: MessageThreadDetail }>(THREADS_URL, payload)).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-threads'] });
      queryClient.invalidateQueries({ queryKey: ['message-recipients'] });
    },
  });
}
