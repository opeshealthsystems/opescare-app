/**
 * "Show this prescription to a pharmacy" — the data layer behind the code a
 * patient presents at the counter.
 *
 * Modelled on `lib/api/vitalsQueries.ts`: inline endpoint constants (rather
 * than `endpoints.ts`, which is owned elsewhere), `apiClient` for auth and
 * refresh, and a retry policy that lets a missing route settle immediately.
 *
 * Backend contract this is written against:
 *
 *   POST   /mobile/prescriptions/{id}/share  → { reference, verify_url, expires_at }
 *   DELETE /mobile/prescriptions/{id}/share  → 204 / 200, the token is revoked
 *
 * The token is minted server-side, is revocable, and expires. The public
 * `verify_url` it points at (`/verify/rx/{token}`) is what the QR encodes.
 *
 * Four rules this module exists to enforce on the UI:
 *
 *   1. **A code is never invented.** `parseGrant` returns null for anything
 *      that is not a real `reference` + `verify_url` pair, and the mint hook
 *      turns that into an error rather than handing the screen a QR whose
 *      value is `undefined`.
 *   2. **A missing endpoint settles, it does not spin.** These routes may land
 *      after the app does. Any 4xx — 404 included — stops the retry loop dead
 *      (`accessRetry`), and `isSharingUnavailable` tells the screen to say
 *      "not available yet" instead of showing a transient-error retry.
 *   3. **Access is only ever granted by a deliberate tap.** There is no hook
 *      here that mints on mount: `usePrescriptionAccess` is a cache-only read
 *      (`skipToken`) of a grant this session already asked for.
 *   4. **Withdrawal is never claimed unless it happened.** The local grant is
 *      cleared on a successful DELETE and on nothing else — a failed revoke
 *      surfaces as a failure, because telling a patient their prescription is
 *      no longer visible when it still is would be the worst bug here.
 */
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { apiClient } from './client';

/**
 * Both verbs hang off one path — POST mints, DELETE withdraws. Spelled out
 * here rather than in `endpoints.ts`, which this file does not own.
 */
export const prescriptionShareEndpoint = (id: string) => `/mobile/prescriptions/${id}/share`;

/** A live, revocable, expiring grant of read access to one prescription. */
export interface PrescriptionAccessGrant {
  /** The human handle a pharmacist can key in, e.g. `RX-4F2A-9C31`. */
  reference: string;
  /** Absolute public URL — `…/verify/rx/{token}`. This is what the QR encodes. */
  verify_url: string;
  /** ISO-8601, or null when the server issued a grant with no expiry. */
  expires_at: string | null;
}

/** The API wraps some payloads in `{ data: … }` and returns others bare. */
type ShareResponse = unknown;

/** Query key the session's grant is parked under, so it survives a re-render. */
export const prescriptionAccessKey = (id: string) =>
  ['prescriptions', id, 'access'] as const;

/**
 * Reads a grant out of a response body, or returns null.
 *
 * Deliberately strict: a QR is a promise that scanning it opens the
 * prescription, so a body missing `verify_url` is a failure, not a grant with a
 * blank field. Accepts both the bare object and the `{ data: … }` envelope
 * because the mobile API uses both shapes across its surface.
 */
export function parseGrant(body: ShareResponse): PrescriptionAccessGrant | null {
  const root = body as { data?: unknown } | null | undefined;
  const raw = (root && typeof root === 'object' && 'data' in root ? root.data : root) as
    | Partial<Record<'reference' | 'verify_url' | 'expires_at', unknown>>
    | null
    | undefined;
  if (!raw || typeof raw !== 'object') return null;

  const reference = typeof raw.reference === 'string' ? raw.reference.trim() : '';
  const verifyUrl = typeof raw.verify_url === 'string' ? raw.verify_url.trim() : '';
  if (reference.length === 0 || verifyUrl.length === 0) return null;

  return {
    reference,
    verify_url: verifyUrl,
    expires_at: typeof raw.expires_at === 'string' && raw.expires_at.length > 0
      ? raw.expires_at
      : null,
  };
}

/** HTTP status behind a failure, or null when it never reached the server. */
export function httpStatus(error: unknown): number | null {
  return isAxiosError(error) ? (error.response?.status ?? null) : null;
}

/**
 * True when the failure means "this server does not serve prescription sharing"
 * — the route is absent (404), the verb is not routed (405), or the platform
 * says so outright (501). The screen must render this as "not available yet",
 * never as a retryable error and never as a spinner.
 */
export function isSharingUnavailable(error: unknown): boolean {
  const status = httpStatus(error);
  return status === 404 || status === 405 || status === 501;
}

/**
 * `retry` for every hook here. No retry on any 4xx: a missing endpoint, a
 * refused token and a prescription that may not be shared are all answers, not
 * hiccups, and re-asking only holds the screen in a loading state.
 */
export const accessRetry = (failureCount: number, error: unknown): boolean => {
  const status = httpStatus(error);
  if (status !== null && status >= 400 && status < 500) return false;
  return failureCount < 1;
};

/**
 * The grant this session has already minted for a prescription, if any.
 *
 * Cache-only by design (`skipToken` — the query never fetches). Minting is a
 * side effect that hands a third party access, so it happens on an explicit tap
 * through `useSharePrescription` and nowhere else; this hook just lets the
 * screen re-read what that tap produced.
 */
export function usePrescriptionAccess(id: string | undefined) {
  return useQuery<PrescriptionAccessGrant | null>({
    queryKey: prescriptionAccessKey(id ?? ''),
    queryFn: skipToken,
    staleTime: Infinity,
  });
}

/**
 * Mints a fresh access token for a prescription: `POST …/share`.
 *
 * Each call issues a new grant and supersedes the one before it, so the screen
 * calls this once per deliberate "show" and reuses the cached result until the
 * patient withdraws it or it lapses.
 */
export function useSharePrescription(id: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<PrescriptionAccessGrant, unknown, void>({
    mutationKey: ['prescriptions', id ?? '', 'access', 'grant'],
    retry: accessRetry,
    mutationFn: async () => {
      if (!id) throw new Error('A prescription id is required to share it.');
      const { data } = await apiClient.post<ShareResponse>(prescriptionShareEndpoint(id), {});
      const grant = parseGrant(data);
      // A 2xx with no usable code is a failure, not a grant. Anything else here
      // would put a QR on screen that encodes nothing a pharmacy can open.
      if (!grant) throw new Error('The server returned no access code for this prescription.');
      return grant;
    },
    onSuccess: (grant) => {
      if (id) queryClient.setQueryData(prescriptionAccessKey(id), grant);
    },
  });
}

/**
 * Withdraws access: `DELETE …/share`.
 *
 * The local grant is cleared only after the server confirms. A failed revoke —
 * including a 404, which on this route is ambiguous between "already gone" and
 * "no such route" — leaves the grant on screen and surfaces the failure, so the
 * patient is never told their prescription is private again when it is not.
 */
export function useWithdrawPrescriptionAccess(id: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<void, unknown, void>({
    mutationKey: ['prescriptions', id ?? '', 'access', 'revoke'],
    retry: accessRetry,
    mutationFn: async () => {
      if (!id) throw new Error('A prescription id is required to withdraw access.');
      await apiClient.delete(prescriptionShareEndpoint(id));
    },
    onSuccess: () => {
      if (id) queryClient.setQueryData(prescriptionAccessKey(id), null);
    },
  });
}

// ---------------------------------------------------------------------------
// Expiry
//
// A grant is time-boxed, and a QR that has quietly lapsed is worse than no QR
// at all — the patient holds up a phone at the counter and nothing happens. The
// screen recomputes this against a ticking clock so the code stops being
// offered the moment it stops working.
// ---------------------------------------------------------------------------

export interface GrantExpiry {
  /** The grant declared an `expires_at` at all. */
  hasExpiry: boolean;
  /** Parsed expiry. Null when there is none, or when it could not be read. */
  at: Date | null;
  /** Past its expiry. False when there is no readable expiry to be past. */
  expired: boolean;
  /** Whole minutes left, floored. Null when unknown or already lapsed. */
  minutesLeft: number | null;
}

/** Bucket a grant's expiry against `now`. */
export function grantExpiry(
  grant: PrescriptionAccessGrant | null | undefined,
  now: number = Date.now(),
): GrantExpiry {
  if (!grant || !grant.expires_at) {
    return { hasExpiry: false, at: null, expired: false, minutesLeft: null };
  }

  const at = new Date(grant.expires_at);
  // An unreadable timestamp is a data problem. It is reported as "expiry
  // unknown" rather than silently becoming "never expires" — overstating how
  // long a pharmacy can see a prescription is the error that matters.
  if (Number.isNaN(at.getTime())) {
    return { hasExpiry: true, at: null, expired: false, minutesLeft: null };
  }

  const remaining = at.getTime() - now;
  if (remaining <= 0) return { hasExpiry: true, at, expired: true, minutesLeft: null };

  return { hasExpiry: true, at, expired: false, minutesLeft: Math.floor(remaining / 60_000) };
}

/** Under this many minutes left, the expiry reads as a countdown, not a date. */
export const EXPIRY_COUNTDOWN_MINUTES = 60;
