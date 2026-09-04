/**
 * Provider (clinician) authentication — the ONE place the app talks to the
 * provider half of the mobile auth surface.
 *
 * Modelled on `lib/api/vitalsQueries.ts`: wire shapes typed here, paths spelled
 * out here (not in `endpoints.ts`, which is owned elsewhere), `apiClient` for
 * the base URL / timeout / bearer interceptor, and no retry on a 4xx.
 *
 * ── THE CONTRACT ──────────────────────────────────────────────────────────
 *   POST /mobile/auth/provider/login   { email, password, device_name? }
 *        → 200 { access_token, token_type, expires_in, provider }
 *        → 401 bad credentials AND non-clinician account (deliberately
 *              indistinguishable — do not try to tell them apart in the UI)
 *        → 409 the clinician has no facility
 *   POST /mobile/auth/provider/logout  (Bearer)
 *   GET  /mobile/auth/provider/me      (Bearer)
 *
 * ── IF THE SERVER DOES NOT SERVE IT ───────────────────────────────────────
 * The routes may not exist on a given deployment (the Finder demo host had no
 * provider session at all until now). That case must be VISIBLE, never a
 * spinner and never a pretend session: `isProviderAuthUnavailable(error)` is
 * true exactly for "this server has no provider auth" (a missing route, or no
 * response at all), and the caller says so in words. Anything else — 401, 409,
 * 422 — is a real answer from a real endpoint and is surfaced as itself.
 *
 * ── WHAT THIS MODULE DOES NOT DO ──────────────────────────────────────────
 * It does not store the token, and it does not decide which persona the app
 * shows. `lib/store/auth.ts` owns both, because the token slot is shared with
 * the patient session and exactly one of the two may ever be live.
 */
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';

/** Paths, spelled out (see the module note). */
export const providerAuthEndpoints = {
  login: '/mobile/auth/provider/login',
  logout: '/mobile/auth/provider/logout',
  me: '/mobile/auth/provider/me',
} as const;

/**
 * The clinician behind a provider token.
 *
 * `id` is left wide because the platform keys staff on a UUID while the demo
 * fixtures use an integer; nothing here does arithmetic on it. `facility_id`
 * is typed nullable even though the API answers 409 rather than issuing a
 * facility-less token — a client that trusts an invariant it cannot enforce is
 * a crash waiting for the day the server changes its mind.
 */
export interface ProviderAccount {
  id: string | number;
  name: string;
  /** `doctor` | `nurse` | … — whatever the server calls the role. Never parsed for authorisation. */
  role: string;
  facility_id: string | number | null;
  facility_name: string | null;
}

/** 200 body of `POST /mobile/auth/provider/login`. */
export interface ProviderLoginResponse {
  access_token: string;
  token_type: string;
  /** Seconds. Advisory — the 401 handling in `client.ts` is what actually ends a session. */
  expires_in: number;
  provider: ProviderAccount;
}

// ═══════════════════════════════════════════════════════════════════════════
// Failure classification
//
// Every caller needs to tell three answers apart, so each gets its own
// predicate rather than a status-code comparison scattered across screens.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * True when this server has no provider auth to offer — the route is missing
 * (404/405/501), the host is broken (5xx), or nothing came back at all
 * (offline, DNS, timeout).
 *
 * This is the ONLY condition under which a caller may fall back to the
 * clinician UI preview. A 401 means the endpoint IS there and said no.
 */
export function isProviderAuthUnavailable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  // No response at all: the request never got an answer to disbelieve.
  if (status === undefined) return true;
  return status === 404 || status === 405 || status === 501 || status >= 502;
}

/**
 * True only when the request never got an answer — offline, DNS, timeout.
 *
 * Narrower than `lib/offline/cache.ts`'s `isNetworkError`, which counts any
 * error object carrying a `message` and so also swallows a payload this module
 * refused to parse. Session restore needs the distinction: a dropped line must
 * not cost a clinician their token, but a response nobody could read is not a
 * dropped line and must not be retried as one.
 */
export function isProviderConnectionFailure(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response === undefined;
}

/** 401 — bad credentials, or an account that is not a clinician. The API does not distinguish. */
export function isProviderCredentialsRejected(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

/** 409 — a real clinician with no facility. Nothing the app can fix; the server must attach one. */
export function isProviderWithoutFacility(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 409;
}

/**
 * The patient login (`POST /mobile/auth/login-email`) answers **404 "No patient
 * record found for this account"** when the email and password are correct but
 * no `patients` row belongs to that account.
 *
 * On this platform that is exactly what a CLINICIAN looks like to the patient
 * endpoint — staff have a `users` row and no chart of their own. So a caller
 * seeing this should try the provider login before telling anybody anything.
 *
 * Matched on the status alone, deliberately: the message is server-worded and
 * translatable, and a 404 from that route has no other meaning.
 */
export function looksLikeProviderAccount(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

/** The server's own words where it gave some, else a neutral fallback. Never leaks a stack. */
export function providerAuthErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { message?: string } | undefined;
    if (typeof body?.message === 'string' && body.message.trim()) return body.message;
  }
  return fallback;
}

/** React-query `retry` for provider hooks: never retry an answer, one retry for a dropped line. */
export const providerRetry = (failureCount: number, error: unknown): boolean => {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 1;
};

// ═══════════════════════════════════════════════════════════════════════════
// Calls
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pull the provider object out of a `/me` (or login) payload.
 *
 * Accepts `{ provider: … }`, the `{ data: … }` envelope the rest of the mobile
 * API uses, and a bare object, because the contract pins the login body but not
 * the shape `/me` wraps it in. What it will NOT do is invent one: an
 * unrecognisable payload throws, so a clinician never lands in the UI behind a
 * response nobody understood.
 */
function unwrapProvider(payload: unknown): ProviderAccount {
  const candidates: unknown[] = [
    (payload as { provider?: unknown } | null)?.provider,
    (payload as { data?: unknown } | null)?.data,
    payload,
  ];

  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      'id' in candidate &&
      'name' in candidate &&
      (candidate as { id: unknown }).id !== null &&
      (candidate as { id: unknown }).id !== undefined
    ) {
      const value = candidate as Record<string, unknown>;
      return {
        id: value.id as string | number,
        name: String(value.name ?? ''),
        role: typeof value.role === 'string' ? value.role : '',
        facility_id: (value.facility_id ?? null) as string | number | null,
        facility_name: typeof value.facility_name === 'string' ? value.facility_name : null,
      };
    }
  }

  throw new Error('The provider sign-in response did not contain a clinician account.');
}

/**
 * Sign a clinician in.
 *
 * `device_name` is what the server labels the issued token with; it is a
 * convenience for revoking one phone, never an identity claim.
 *
 * The caller is expected to have cleared any stored token first — see
 * `lib/store/auth.ts`. That matters: `apiClient` attaches whatever token is in
 * storage to every request, and a login carrying somebody else's bearer header
 * is exactly the confusion this whole feature exists to avoid.
 */
export async function providerLogin(
  email: string,
  password: string,
  deviceName?: string,
): Promise<ProviderLoginResponse> {
  const { data } = await apiClient.post<ProviderLoginResponse>(providerAuthEndpoints.login, {
    email,
    password,
    ...(deviceName ? { device_name: deviceName } : {}),
  });

  if (!data?.access_token) {
    throw new Error('The provider sign-in response did not contain a token.');
  }

  return { ...data, provider: unwrapProvider(data) };
}

/** The clinician behind the CURRENT bearer token. Throws if the token is not a provider one. */
export async function fetchProviderMe(): Promise<ProviderAccount> {
  const { data } = await apiClient.get<unknown>(providerAuthEndpoints.me);
  return unwrapProvider(data);
}

/**
 * Revoke the current provider token server-side.
 *
 * Best-effort by contract: the caller clears local state whether or not this
 * lands, because a logout that a flaky network can veto is not a logout.
 */
export async function providerLogout(): Promise<void> {
  await apiClient.post(providerAuthEndpoints.logout, {});
}

/**
 * `GET /mobile/auth/provider/me` as a query — for clinician screens that want
 * the signed-in account without reaching into the auth store. Disabled unless
 * asked for, and never retried against an answer.
 */
export function useProviderMe(enabled = true) {
  return useQuery({
    queryKey: ['provider', 'me'],
    queryFn: fetchProviderMe,
    enabled,
    retry: providerRetry,
    staleTime: 5 * 60 * 1000,
  });
}
