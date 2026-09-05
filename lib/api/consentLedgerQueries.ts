import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18next from 'i18next';
import { apiClient } from './client';

/*
 * ---------------------------------------------------------------------------
 * The consent ledger — "who can see my record right now?"
 *
 * The app already had `POST /mobile/consents/{id}/revoke` and no way to
 * discover the id it takes. The privacy screen worked around that by reading
 * `GET /mobile/consent-requests` and following `grant_id` off each request —
 * so a grant with no originating request (which is most of them) was
 * invisible, and the screen reported "nobody has access" while facilities held
 * live grants.
 *
 * `GET /mobile/consents` is the missing half. It returns three lists:
 *
 *   active              live grants, each with the id revoke consumes.
 *   history             revoked / expired grants. Never shown as live.
 *   care_relationships  access that exists WITHOUT a grant — an appointment,
 *                       a care team, past treatment, an open episode of care.
 *                       Not consent, not revocable, and deliberately NOT
 *                       merged into `active`: a patient who withdraws every
 *                       grant and still sees their doctor open the chart has
 *                       been misled.
 * ---------------------------------------------------------------------------
 */

/*
 * ---------------------------------------------------------------------------
 * i18n bundle
 *
 * Same arrangement as lib/api/patientWriteQueries.ts: the EN/FR chrome for
 * these screens waits in `lib/i18n/pending/` until someone merges it into
 * `lib/i18n/locales/{en,fr}.json`, and registering it here — the one module
 * both consent screens import — keeps both languages working meanwhile
 * without editing the shared i18n bootstrap.
 *
 * `deep = true, overwrite = false`: once the same keys exist in the locale
 * files THOSE win, so merging is safe at any time and this block can then be
 * deleted.
 *
 * Note what is NOT in those files: every sentence describing a grant's state,
 * the authority it rests on, and what a care relationship means is translated
 * by the SERVER (lang/{en,fr}/consent_ledger.php) and arrives on the wire
 * already in the patient's language — see `lang` below. Those sentences are
 * the ones that have to be right, and they are right in both languages today
 * whether or not the pending files have been merged.
 * ---------------------------------------------------------------------------
 */
import consentLedgerEn from '../i18n/pending/consent_ledger.en.json';
import consentLedgerFr from '../i18n/pending/consent_ledger.fr.json';

let bundlesRegistered = false;

function registerPendingBundles(): void {
  if (bundlesRegistered) return;
  bundlesRegistered = true;
  try {
    i18next.addResourceBundle('en', 'translation', consentLedgerEn, true, false);
    i18next.addResourceBundle('fr', 'translation', consentLedgerFr, true, false);
  } catch {
    // i18next not initialised yet in some test/tooling contexts. The screens
    // still render: every lookup in them carries a defaultValue.
  }
}

registerPendingBundles();

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                   */
/* -------------------------------------------------------------------------- */

/** Spelled out here rather than in `endpoints.ts`, which is owned elsewhere. */
export const CONSENT_LEDGER_ENDPOINTS = {
  ledger: '/mobile/consents',
  /** Pre-existing (routes/api.php). The ledger hands back the id it takes. */
  revoke: (grantId: string) => `/mobile/consents/${grantId}/revoke`,
} as const;

/** Shared cache key, so a revoke refetches the ledger and the hub together. */
export const CONSENT_LEDGER_QUERY_KEY = ['consent-ledger'] as const;

/* -------------------------------------------------------------------------- */
/* Types — mirror MobileConsentLedgerController exactly                        */
/* -------------------------------------------------------------------------- */

/**
 * Derived on the server from BOTH `consent_grants.status` AND the expiry,
 * because nothing sweeps that column: a grant whose clock ran out months ago
 * still reads `status = 'active'` in the table. Only `active` is live.
 *
 *   active   status says active AND the expiry is still ahead
 *   expired  the expiry has passed, whatever the column claims
 *   revoked  withdrawn
 *   ended    any other status — filed as history, never assumed live
 */
export type ConsentGrantState = 'active' | 'expired' | 'revoked' | 'ended';

export interface LedgerFacility {
  id: string;
  name: string | null;
  type: string | null;
}

export interface LedgerClinician {
  id: string;
  /** Null means "not recorded". It is never a placeholder name. */
  name: string | null;
}

export interface ConsentGrantBasis {
  /** patient | guardian | facility_policy | (anything else) */
  authorizing_actor: string | null;
  /** Server-translated. */
  label: string;
  /** Server-translated sentence. `facility_policy` says "you did not approve this". */
  detail: string;
  source: 'consent_request' | 'direct';
  source_label: string;
  consent_request_id: string | null;
}

export interface ConsentGrantRevocation {
  at: string | null;
  /** Whether the patient ended it themselves, or somebody else did. */
  by_you: boolean;
  reason: string | null;
}

/**
 * Whether revoke will actually work on this row. `available: false` with
 * `reason: 'no_linked_user'` is a real case — the revoke endpoint needs a
 * linked `users` row and answers 401 without one — so the screen shows the
 * explanation instead of a button that always fails.
 */
export interface ConsentGrantRevokeState {
  available: boolean;
  reason: 'not_active' | 'no_linked_user' | null;
  message: string;
}

export interface ConsentGrantItem {
  /** The id `POST /mobile/consents/{id}/revoke` takes. */
  id: string;
  consent_grant_id: string;
  is_consent_grant: true;

  state: ConsentGrantState;
  state_label: string;
  state_detail: string;
  is_active: boolean;
  /** The raw column, kept so an `expired` state over `active` stays visible. */
  raw_status: string | null;

  facility: LedgerFacility | null;
  /** Only when the originating request named a person. Null is not "unknown staff". */
  clinician: LedgerClinician | null;

  scope: string[];
  purpose: string | null;
  basis: ConsentGrantBasis;

  granted_at: string | null;
  expires_at: string | null;
  days_left: number | null;
  expiring_soon: boolean;
  /** When access actually stopped. Null while live. */
  ended_at: string | null;
  revocation: ConsentGrantRevocation | null;
  revoke: ConsentGrantRevokeState;
}

/** Basis 1-4 of MobileDoctorChartController::relationshipBasis(). */
export type CareRelationshipBasis =
  | 'appointment'
  | 'care_team'
  | 'treating_clinician'
  | 'facility_episode';

/**
 * Access that is NOT consent. There is deliberately no `id` on this shape:
 * nothing here can be handed to revoke, because nothing here is a grant.
 */
export interface CareRelationshipItem {
  is_consent_grant: false;
  revocable: false;
  basis: CareRelationshipBasis;
  basis_label: string;
  basis_detail: string;
  clinician: LedgerClinician | null;
  facility: LedgerFacility | null;
  since: string | null;
}

export interface ConsentLedgerMeta {
  active_count: number;
  history_count: number;
  care_relationship_count: number;
  expiring_soon_count: number;
  expiring_soon_days: number;
  /** True when a scan hit its ceiling — the counts describe the page, not everything. */
  truncated: boolean;
  generated_at: string;
  /** Server-translated: revoking consent does not end a care relationship. */
  care_relationship_note: string;
  revoke_endpoint_template: string;
}

export interface ConsentLedgerResponse {
  data: {
    active: ConsentGrantItem[];
    history: ConsentGrantItem[];
    care_relationships: CareRelationshipItem[];
  };
  meta: ConsentLedgerMeta;
}

export interface ConsentLedger {
  active: ConsentGrantItem[];
  history: ConsentGrantItem[];
  careRelationships: CareRelationshipItem[];
  meta: ConsentLedgerMeta;
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                       */
/* -------------------------------------------------------------------------- */

/** 'en' | 'fr' for the server, from the language the app is actually running. */
function currentLang(): string {
  return String(i18next.language ?? 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/**
 * The patient's own consent ledger.
 *
 * There is no patient parameter and there is nowhere to put one: the server
 * reads `patient_id` from the bearer token's request attributes and from
 * nowhere else, so a patient id in a query string or body is not overridden —
 * it is never read. This hook could not fetch somebody else's grants if it
 * tried.
 *
 * `lang` is sent so every server-rendered sentence (state, basis, the
 * care-relationship explanations) arrives in the running language rather than
 * the server default. The query key carries it, so switching language refetches
 * instead of showing the previous language from cache.
 */
export function useConsentLedger() {
  const lang = currentLang();

  return useQuery({
    queryKey: [...CONSENT_LEDGER_QUERY_KEY, lang],
    queryFn: async (): Promise<ConsentLedger> => {
      const { data } = await apiClient.get<ConsentLedgerResponse>(
        CONSENT_LEDGER_ENDPOINTS.ledger,
        { params: { lang } },
      );

      return {
        active: data.data?.active ?? [],
        history: data.data?.history ?? [],
        careRelationships: data.data?.care_relationships ?? [],
        meta: data.meta,
      };
    },
    // Who can read a medical record is not something to serve from a stale
    // cache for long. A patient opening this screen wants the answer as of now.
    staleTime: 15_000,
  });
}

/**
 * Withdraw one grant, by the id the ledger listed.
 *
 * Deliberately its own mutation rather than a reuse of `useRevokeConsent()` in
 * queries.ts: that one invalidates `['consent-requests']` only, so a revoke
 * fired from a ledger row would leave the ledger showing the grant as still
 * live. This invalidates both, so the row moves to History immediately and the
 * hub's counts follow.
 */
export function useRevokeConsentGrant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (grantId: string) =>
      (await apiClient.post(CONSENT_LEDGER_ENDPOINTS.revoke(grantId))).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONSENT_LEDGER_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['consent-requests'] });
      // The withdrawal is itself an event on the record.
      void queryClient.invalidateQueries({ queryKey: ['access-logs'] });
    },
  });
}
