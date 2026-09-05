import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18next from 'i18next';
import { apiClient } from './client';

/*
 * ---------------------------------------------------------------------------
 * Account deletion — the store blocker
 *
 * Apple 5.1.1(v) and Google Play both require an app that offers account
 * CREATION to offer account DELETION from inside the app. This app creates
 * accounts (POST /mobile/auth/register) and, until now, had no deletion
 * endpoint at all — `app/settings.tsx` carried a comment saying exactly that.
 *
 * ── The shape, and why it is not a delete button ──────────────────────────
 *
 * On a medical-records platform, closing an account is not deleting a record.
 * `patients.id` is the parent of 88 ON DELETE CASCADE foreign keys —
 * prescriptions, lab results, encounters, invoices, and the patient's own
 * access log among them — so a cascade would take a pharmacy's record of
 * medicine it handed over and the evidence of who read the file. The server
 * therefore erases the ACCOUNT (credentials, sessions, devices, phone, email,
 * address, national ID) and RETAINS the clinical record under Cameroon's
 * 10-year retention rule.
 *
 * That distinction is the entire point of the screen, so this module is built
 * to make it impossible to render a deletion UI without the text that explains
 * it: `GET /mobile/account/deletion` returns the itemised disclosure and the
 * current state in ONE response, and `AccountDeletionState` has no optional
 * `disclosure` field to forget.
 *
 * ── Nothing here says what the server does ────────────────────────────────
 *
 * Every sentence describing what is erased, de-identified, retained, or cannot
 * be deleted at all arrives from the server already translated
 * (lang/{en,fr}/account_deletion.php), together with live per-table counts
 * taken from this patient's own record. The client renders those strings
 * verbatim and authors none of them. A promise that lives in one place cannot
 * drift out of step with the code that keeps it.
 *
 * ── Identity ──────────────────────────────────────────────────────────────
 *
 * No request below carries a patient identifier. The account acted on is the
 * one the bearer token belongs to, resolved server-side from
 * `patient_access_tokens` — there is no field through which this client could
 * nominate somebody else's account even by accident.
 * ---------------------------------------------------------------------------
 */

/*
 * i18n bundle — same arrangement as lib/api/consentLedgerQueries.ts. The EN/FR
 * chrome waits in `lib/i18n/pending/` until someone merges it into
 * `lib/i18n/locales/{en,fr}.json`; registering it here, in the one module the
 * screen imports, keeps both languages working meanwhile without editing the
 * shared i18n bootstrap.
 *
 * `deep = true, overwrite = false`: once the same keys exist in the locale
 * files THOSE win, so merging is safe at any time and this block can then be
 * deleted.
 */
import accountDeletionEn from '../i18n/pending/account_deletion.en.json';
import accountDeletionFr from '../i18n/pending/account_deletion.fr.json';

let bundlesRegistered = false;

function registerPendingBundles(): void {
  if (bundlesRegistered) return;
  bundlesRegistered = true;
  try {
    i18next.addResourceBundle('en', 'translation', accountDeletionEn, true, false);
    i18next.addResourceBundle('fr', 'translation', accountDeletionFr, true, false);
  } catch {
    // i18next not initialised yet in some test/tooling contexts. The screen
    // still renders: every lookup in it carries a defaultValue.
  }
}

registerPendingBundles();

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                   */
/* -------------------------------------------------------------------------- */

/** Spelled out here rather than in `endpoints.ts`, which is owned elsewhere. */
export const ACCOUNT_DELETION_ENDPOINTS = {
  state: '/mobile/account/deletion',
  request: '/mobile/account/deletion',
  cancel: '/mobile/account/deletion/cancel',
} as const;

export const ACCOUNT_DELETION_QUERY_KEY = ['account-deletion'] as const;

/* -------------------------------------------------------------------------- */
/* Types — mirror MobileAccountDeletionController exactly                      */
/* -------------------------------------------------------------------------- */

/** A single already-translated line in one of the disclosure's four sections. */
export interface DisclosureItem {
  key: string;
  /** Server-translated. Render verbatim. */
  text: string;
}

/**
 * A live count from this patient's own record — "Prescriptions: 7".
 * Tables holding nothing for this patient are omitted server-side, so an empty
 * array means "nothing of this kind on file", never "we did not look".
 */
export interface RetainedCount {
  key: string;
  /** Server-translated table label. */
  label: string;
  count: number;
}

export interface DisclosureSection {
  title: string;
  note: string;
  items: DisclosureItem[];
}

export interface RetainedSection {
  title: string;
  note: string;
  /** Names the statute and the number of years. Server-translated. */
  legal_basis: string;
  /** "Kept until 2036-10-05. On that date the retained record is destroyed." */
  purge_note: string;
  retain_until: string;
  counts: RetainedCount[];
}

/**
 * The section most deletion screens leave out, and the reason this one is
 * trustworthy: what the platform CANNOT delete at all, whatever the patient
 * asks. Not optional in this type — a screen that cannot render it should not
 * compile.
 */
export interface CannotDeleteSection {
  title: string;
  items: DisclosureItem[];
}

/** Which secrets this particular patient actually has. */
export type ReauthMethod = 'password' | 'pin';

export interface DisclosureConfirmation {
  /** "DELETE" / "SUPPRIMER". The server accepts BOTH regardless of locale. */
  phrase: string;
  instruction: string;
  reauth_note: string;
  methods: ReauthMethod[];
}

export interface AccountDeletionDisclosure {
  disclosure_version: string;
  grace_period_days: number;
  retention_years: number;
  /** ISO — when erasure would run if confirmed right now. */
  would_execute_after: string;
  /** YYYY-MM-DD — when the retained record would be destroyed. */
  would_retain_until: string;

  headline: string;
  summary: string;

  erased: DisclosureSection;
  deidentified: DisclosureSection;
  retained: RetainedSection;
  cannot_delete: CannotDeleteSection;
  confirmation: DisclosureConfirmation;
}

export type ClosureStatus = 'pending' | 'cancelled' | 'completed' | 'purged' | string;

export interface AccountClosure {
  id: string;
  status: ClosureStatus;
  is_pending: boolean;
  requested_at: string | null;
  executes_after: string | null;
  /** Pre-formatted by the server, so the client never formats a legal date. */
  executes_after_date: string | null;
  days_remaining: number;
  grace_period_days: number | null;
  cancelled_at: string | null;
  executed_at: string | null;
  retention_until: string | null;
  disclosure_version: string | null;
  can_cancel: boolean;

  /** Server-translated banner copy. */
  headline: string;
  body: string;
  countdown: string | null;
}

export interface AccountDeletionState {
  /** Null when the patient has never asked. */
  closure: AccountClosure | null;
  disclosure: AccountDeletionDisclosure;
  reauth_methods: ReauthMethod[];
  grace_period_days: number;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The state AND the disclosure, in one request.
 *
 * `staleTime: 0` on purpose: the one number on this screen that must never be
 * stale is "days left before your account closes".
 */
export function useAccountDeletionState(enabled = true) {
  return useQuery<AccountDeletionState>({
    queryKey: ACCOUNT_DELETION_QUERY_KEY,
    enabled,
    staleTime: 0,
    queryFn: async () => {
      const { data } = await apiClient.get<AccountDeletionState>(ACCOUNT_DELETION_ENDPOINTS.state, {
        // The server translates the disclosure. Ask in the language the
        // patient is actually reading, not the device default.
        params: { lang: i18next.language?.startsWith('fr') ? 'fr' : 'en' },
      });
      return data;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export interface RequestDeletionInput {
  /** The typed word. Sent as typed; the server compares case-insensitively. */
  confirmation: string;
  /** The password or PIN. Never stored, never logged, never cached. */
  credential: string;
  reason?: string;
}

export interface RequestDeletionResponse {
  message: string;
  closure: AccountClosure;
}

/**
 * Open the grace period.
 *
 * Note what this does NOT do: it does not sign the patient out and it does not
 * erase anything. The session is deliberately kept alive, because cancelling
 * requires it — signing them out here would be handing them an irreversible
 * countdown with no way to stop it.
 */
export function useRequestAccountDeletion() {
  const queryClient = useQueryClient();

  return useMutation<RequestDeletionResponse, unknown, RequestDeletionInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post<RequestDeletionResponse>(
        ACCOUNT_DELETION_ENDPOINTS.request,
        {
          confirmation: input.confirmation,
          credential: input.credential,
          ...(input.reason ? { reason: input.reason } : {}),
        },
        { params: { lang: i18next.language?.startsWith('fr') ? 'fr' : 'en' } },
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_DELETION_QUERY_KEY });
    },
  });
}

export interface CancelDeletionResponse {
  message: string;
  closure: AccountClosure;
}

/**
 * Stop a pending closure.
 *
 * No credential required, and that is a decision rather than an oversight:
 * this is the SAFE direction — it preserves data — and a patient racing a
 * deadline to save their own record must not be stopped by a password they
 * cannot remember. Only a live token for this patient can reach the endpoint.
 */
export function useCancelAccountDeletion() {
  const queryClient = useQueryClient();

  return useMutation<CancelDeletionResponse, unknown, { reason?: string } | void>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post<CancelDeletionResponse>(
        ACCOUNT_DELETION_ENDPOINTS.cancel,
        input && 'reason' in input && input.reason ? { reason: input.reason } : {},
        { params: { lang: i18next.language?.startsWith('fr') ? 'fr' : 'en' } },
      );
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_DELETION_QUERY_KEY });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Error handling                                                              */
/* -------------------------------------------------------------------------- */

/** The `error` codes MobileAccountDeletionController returns alongside `message`. */
export type AccountDeletionErrorCode =
  | 'bad_confirmation'
  | 'bad_credential'
  | 'no_credential'
  | 'nothing_pending';

/**
 * Pull the server's own sentence out of a failure.
 *
 * Preferred over any client-side string, because the server's messages are the
 * ones that state what did and did not change ("Your account has not been
 * changed"), and a generic client fallback would lose exactly that assurance
 * at the moment the patient most needs it.
 */
export function extractDeletionError(error: unknown): { code: string | null; message: string | null } {
  const response = (error as { response?: { data?: { message?: unknown; error?: unknown } } })?.response;
  const data = response?.data;

  return {
    code: typeof data?.error === 'string' ? data.error : null,
    message: typeof data?.message === 'string' ? data.message : null,
  };
}
