import axios from 'axios';
import { API_BASE_URL } from './config';
import { translator } from '../i18n/engine';
import { getLocale } from '../i18n/LocaleProvider';
import type { SessionKind } from './client';

/**
 * Token rotation — the transport half of silent session refresh.
 *
 * Server-side, staff tokens were cut from one year to TWELVE HOURS (a real
 * security fix, not up for debate). Twelve hours is shorter than a ward round
 * plus a handover, so without this a doctor gets thrown back to the sign-in
 * screen mid-shift, holding a patient's chart, and has to retype a password.
 *
 * `POST /auth/refresh` rotates a token that is STILL VALID: it deletes the
 * current one and mints a fresh one with the same abilities and device name.
 * It cannot resurrect an expired token — so this is a race against the clock,
 * not a recovery mechanism. That is why `client.ts` also refreshes proactively
 * off the server's own `X-Token-Expires-At` header rather than only reacting
 * to a 401.
 *
 * ── Why its own axios instance ────────────────────────────────────────────
 *
 * `refreshTransport` is deliberately NOT `apiClient`. The refresh call is the
 * one request that must never be intercepted by the 401 handler, because that
 * handler's whole job is to call refresh. Using a separate instance makes the
 * "refresh 401s and triggers another refresh" loop structurally impossible
 * rather than merely guarded against — there is no interceptor to reach.
 */
const REFRESH_PATH = '/auth/refresh';

/**
 * Shorter than the 45 s app-wide budget. A refresh is a blocking step in front
 * of a request the clinician is already waiting on, so doubling their wait to
 * 90 s is worse than telling them to sign in again. 20 s still clears an EDGE
 * round trip with retransmits for a request with no payload.
 */
const REFRESH_TIMEOUT_MS = 20_000;

const refreshTransport = axios.create({
  baseURL: API_BASE_URL,
  timeout: REFRESH_TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

/**
 * Which sessions may be rotated silently: staff only.
 *
 * `/auth/refresh` sits behind `auth:sanctum`, which resolves a PatientAccount
 * token as happily as a User one — so a patient token WOULD refresh. It must
 * not. `AuthController::tokenExpiry()` reads the global `sanctum.expiration`
 * (12 h); patient tokens are issued for SEVEN DAYS by the patient guard. Putting
 * a patient through this endpoint would silently cut their week down to twelve
 * hours — a regression dressed as a fix, on the surface that has no expiry
 * problem in the first place. Patients keep the old behaviour: a 401 is
 * terminal, which for a 7-day token means it genuinely is.
 *
 * If a patient-side `POST /patient/auth/refresh` is ever added, add 'patient'
 * here and point `REFRESH_PATH` at it per kind.
 */
const REFRESHABLE: readonly SessionKind[] = ['staff'];

export function isRefreshable(kind: SessionKind): boolean {
  return REFRESHABLE.includes(kind);
}

/** True for the refresh endpoint itself, on any base path shape. */
export function isRefreshUrl(url: string | undefined): boolean {
  return /(^|\/)auth\/refresh$/.test(url ?? '');
}

export type RefreshedToken = { token: string; expiresAt: string | null };

/**
 * Rotate `token`. Throws on any failure — including a 401, which means the
 * token died before we got here and the session is genuinely over.
 */
export async function rotateToken(token: string): Promise<RefreshedToken> {
  const res = await refreshTransport.post(REFRESH_PATH, null, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // The API answers `{ data: { token, expires_at } }`; tolerate a bare body.
  const body = (res.data?.data ?? res.data) as { token?: unknown; expires_at?: unknown } | undefined;
  const next = body?.token;
  if (typeof next !== 'string' || next.length === 0) {
    throw new Error('auth/refresh returned no token');
  }
  return {
    token: next,
    expiresAt: typeof body?.expires_at === 'string' ? body.expires_at : null,
  };
}

/**
 * Thrown when a WRITE hit an expired token, the session was successfully
 * renewed, and the write was deliberately NOT replayed.
 *
 * It exists so the failure does not surface as a 401: `lib/errors.ts` maps any
 * 401 to "You have been signed out for your security", which would be a flat
 * lie here — the clinician is still signed in, and one more tap will work.
 * Being a plain Error rather than an AxiosError also keeps `isSessionRejected`
 * false, so nothing tears the session down behind the user's back.
 */
export class SessionRenewedError extends Error {
  readonly name = 'SessionRenewedError';

  constructor() {
    // Locale read at throw time, never at import time — same rule as
    // `lib/errors.ts`: a module-level translator freezes whatever language the
    // app booted in.
    super(translator(getLocale())('errors.sessionRenewedRetry'));
  }
}
