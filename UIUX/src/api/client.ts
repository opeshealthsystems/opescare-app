import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getItem, removeItem, setItem } from './storage';
import { API_BASE_URL } from './config';
import { SessionRenewedError, isRefreshUrl, isRefreshable, rotateToken } from './sessionRefresh';

/**
 * One app, two authentication surfaces.
 *
 *   patient  →  POST /patient/auth/token   (PatientAccount, Sanctum PAT)
 *   staff    →  POST /auth/token           (User + role, ability-scoped PAT)
 *
 * The two are different guards on the server and must never be confused, so
 * they are stored under different keys with an explicit marker saying which one
 * is live. Only one session exists at a time — signing in as a clinician clears
 * any patient token and vice versa.
 *
 * `TOKEN_KEY` keeps its original name and meaning so a patient who was already
 * signed in before this change stays signed in.
 */
const TOKEN_KEY = 'opes_emr_patient_token';
const STAFF_TOKEN_KEY = 'opes_emr_staff_token';
const SESSION_KIND_KEY = 'opes_emr_session_kind';

export type SessionKind = 'patient' | 'staff';

export type StoredSession = { kind: SessionKind; token: string };

/**
 * How long to wait before giving up.
 *
 * The old value was 15,000 ms, chosen against a fast connection. On a 2G EDGE
 * link (~3.75 KB/s) that budget buys about 56 KB — and `GET /patient/medications`
 * answered 66 KB uncompressed, so it timed out deterministically for exactly the
 * patients it was built for. Server compression has since cut that payload to
 * 5.4 KB, but 15 s was dishonest regardless: on EDGE a 500–1500 ms round trip
 * plus a few retransmits routinely passes 15 s with nothing wrong at all.
 *
 * 45 s is what a patient on a weak signal actually needs. It is a long wait, but
 * every screen shows a loading state throughout, and waiting beats being told a
 * lie about the connection being broken.
 */
const TIMEOUT_MS = 45_000;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: TIMEOUT_MS,
  headers: { Accept: 'application/json' },
});

/**
 * Bounded retry for reads.
 *
 * On 2G, a dropped packet is the normal case, not the exception, and the app
 * used to treat one as terminal: no retries, no backoff, an error block, and a
 * patient left tapping "Try Again" by hand.
 *
 * Deliberately narrow:
 *   * GET and HEAD only. A POST is never replayed — booking an appointment or
 *     recording a dose twice because the first answer was lost is a worse
 *     outcome than showing an error. (The API has an idempotency middleware, but
 *     this client does not send keys, so we must not assume it.)
 *   * Only failures that are plausibly transient: no response at all (timeout,
 *     dropped connection, no signal), or 429/502/503/504. A 4xx is an answer,
 *     not a hiccup, and repeating it just spends the patient's data.
 *   * Two extra attempts at most, with exponential backoff and jitter so a
 *     whole screen's parallel requests do not resynchronise onto the same
 *     retry instant.
 */
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 1_200;
const RETRY_STATUSES = [429, 502, 503, 504];

type RetryConfig = InternalAxiosRequestConfig & { __opesRetryCount?: number; __opesNoRetry?: boolean };

/**
 * Opt a single request out of the retry policy.
 *
 * Used by the launch account check: it has a cached fallback and the patient is
 * staring at a splash screen, so three attempts across two minutes would be a
 * worse answer than one quick "we could not reach the clinic, here is your
 * record as we last saw it".
 */
export const NO_RETRY = { __opesNoRetry: true } as const;

function isIdempotent(config: RetryConfig | undefined): boolean {
  const method = (config?.method ?? 'get').toLowerCase();
  return method === 'get' || method === 'head';
}

function isTransient(error: AxiosError): boolean {
  const status = error.response?.status;
  if (status === undefined) {
    // Nothing came back. A cancelled request is not a failure to retry.
    return error.code !== 'ERR_CANCELED';
  }
  return RETRY_STATUSES.includes(status);
}

/** Full jitter: a random point in [0, backoff], per AWS's backoff guidance. */
function backoffFor(attempt: number): number {
  const ceiling = BASE_BACKOFF_MS * 2 ** attempt;
  return Math.round(ceiling * (0.5 + Math.random() * 0.5));
}

/** Test seam: resolves after `ms`. */
export const retryDelay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * When this app last changed something on the server.
 *
 * Screens throttle their refetch-on-focus against a freshness window, which is
 * safe for a patient flicking between tabs and unsafe the moment they have just
 * booked, cancelled or recorded something: the payload on screen is a minute old
 * and now wrong. Any successful write bumps this, and a screen loaded before it
 * always refetches however recently it loaded.
 *
 * Deliberately coarse — one timestamp for the whole app, not per-resource.
 * Writes are rare and a spurious refetch after one is cheap; a missed one is
 * a patient looking at an appointment they just cancelled.
 */
let lastMutationTs = 0;

export function lastMutationAt(): number {
  return lastMutationTs;
}

apiClient.interceptors.response.use((response) => {
  const method = (response.config?.method ?? 'get').toLowerCase();
  if (method !== 'get' && method !== 'head' && response.status < 400) {
    lastMutationTs = Date.now();
  }
  return response;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);

    const config = error.config as RetryConfig | undefined;
    if (!config || config.__opesNoRetry || !isIdempotent(config) || !isTransient(error)) {
      return Promise.reject(error);
    }

    const attempt = config.__opesRetryCount ?? 0;
    if (attempt >= MAX_RETRIES) return Promise.reject(error);

    config.__opesRetryCount = attempt + 1;
    await retryDelay(backoffFor(attempt));
    return apiClient.request(config);
  }
);

apiClient.interceptors.request.use(async (config) => {
  const session = await getStoredSession();
  if (session) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  return config;
});

/**
 * Session-expiry plumbing.
 *
 * Before this, a token that expired or was revoked mid-session left the patient
 * apparently signed in on a screen that only ever said "Something went wrong" —
 * the worst possible prompt to show someone holding their medical record. So a
 * 401 from any endpoint dropped the stored token and handed control back to
 * AuthContext, which returns the app to sign-in with an explanation.
 *
 * That was right when a staff token lasted a year: a 401 then really did mean
 * revoked or tampered with, and asking for a password was proportionate. Staff
 * tokens now last TWELVE HOURS, so the same 401 is overwhelmingly just "your
 * shift is longer than your token" — and the old rule turns into a doctor being
 * ejected mid-ward-round. Hence the layer below: renew first, and only end the
 * session when renewal itself is refused.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/** The login endpoints answer 401 for a wrong password — a failed sign-in, not
 * an expired session. That path stays terminal and is left to the login screen
 * to report; it must never be "renewed" or replayed. */
function isAuthAttempt(url: string): boolean {
  return /\/patient\/(auth\/token|register)$/.test(url) || /(^|\/)auth\/token$/.test(url);
}

type AuthRetryConfig = RetryConfig & { __opesRefreshAttempted?: boolean };

/**
 * SINGLE FLIGHT.
 *
 * Opening a chart fires half a dozen requests at once. If each one refreshed on
 * its own 401 they would rotate the token five times over, and four of them
 * would be rotating a token that a sibling had already deleted — every one of
 * those returns 401, and the session dies precisely when it should have been
 * saved. So there is at most one refresh in the air: the first 401 starts it,
 * every other caller awaits the SAME promise and then replays with whatever it
 * produced.
 */
let refreshInFlight: Promise<string | null> | null = null;

/**
 * Renew the live session's token. Resolves to the new bearer token, or null if
 * the session cannot or must not be renewed. Never throws, never recurses.
 */
function refreshSession(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const flight = (async (): Promise<string | null> => {
    const session = await getStoredSession();
    if (!session || !isRefreshable(session.kind)) return null;

    let rotated: string;
    try {
      rotated = (await rotateToken(session.token)).token;
    } catch {
      // Includes a 401 from refresh itself: the token was already dead, and
      // there is nothing left to renew. Terminal — the caller signs out.
      return null;
    }

    // Sign-out (or a sign-in as the other surface) may have landed while the
    // rotation was in flight. Writing the new token then would resurrect a
    // session the user deliberately ended, so it is dropped instead. The old
    // token is already deleted server-side, which is the correct end state.
    const still = await getStoredSession();
    if (!still || still.kind !== session.kind || still.token !== session.token) return null;

    // Under the key that belongs to THIS session's surface — staff and patient
    // tokens are different guards and must never cross.
    await storeToken(rotated, session.kind);
    return rotated;
  })();

  refreshInFlight = flight;
  void flight.catch(() => undefined).then(() => {
    if (refreshInFlight === flight) refreshInFlight = null;
  });
  return flight;
}

async function endSession(): Promise<void> {
  await clearStoredToken().catch(() => undefined);
  onUnauthorized?.();
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const url = error.config?.url ?? '';
    const config = error.config as AuthRetryConfig | undefined;

    // Not our business: a failed sign-in, a refresh call that somehow reached
    // this instance, or an error with no config left to replay.
    if (!config || isAuthAttempt(url) || isRefreshUrl(url)) {
      return Promise.reject(error);
    }

    /**
     * NO LOOP, guaranteed by this flag.
     *
     * It is set on the request config before anything is awaited, and the
     * config object is the one handed back to `apiClient.request`, so a replay
     * that 401s a second time re-enters here with the flag already true and
     * falls straight through to `endSession`. One refresh per request, ever.
     */
    if (config.__opesRefreshAttempted) {
      await endSession();
      return Promise.reject(error);
    }
    config.__opesRefreshAttempted = true;

    const token = await refreshSession();
    if (!token) {
      await endSession();
      return Promise.reject(error);
    }

    /**
     * WRITES ARE RENEWED BUT NOT REPLAYED.
     *
     * A 401 on this API is raised by middleware — Laravel's
     * AuthenticationException render, or EnsureApiUserActive — both of which
     * run before any controller, so the write provably never executed and
     * replaying it would be safe TODAY. That is an argument about the current
     * shape of a 900-line route file, and it is not the kind of argument worth
     * betting a duplicate medication administration or a duplicate payment
     * posting on. One endpoint growing its own 401 after doing work, one
     * proxy or gateway answering 401 on a request it already forwarded, and
     * this client silently double-submits into a patient's chart.
     *
     * So the session is renewed — the clinician stays signed in, which is the
     * whole point — and the write is surfaced for them to confirm with one
     * tap. Deliberately NOT as a 401: `lib/errors.ts` renders any 401 as "you
     * have been signed out", which would now be false.
     */
    if (!isIdempotent(config)) {
      return Promise.reject(new SessionRenewedError());
    }

    config.headers.Authorization = `Bearer ${token}`;
    return apiClient.request(config);
  }
);

/**
 * Proactive renewal, so the 401 above is the exception rather than the routine.
 *
 * `TokenExpiryWarning` middleware stamps `X-Token-Expires-At` on every
 * authenticated clinical response whose token expires within 14 days — which,
 * for a 12-hour staff token, is every single one. Reading it costs nothing and
 * means the token is normally rotated during a request the clinician has
 * already stopped waiting on, instead of in front of one they are watching.
 *
 * No stored expiry, no clock of our own: the server's header is the only source
 * of truth, so a phone with a wrong clock cannot refresh in a hot loop — the
 * comparison is against `Date.now()` only for the remaining span, and a
 * malformed or absent header simply does nothing. Failures are ignored: this is
 * opportunistic, and the 401 path is still there to catch what it misses.
 */
const PROACTIVE_WINDOW_MS = 5 * 60_000;

apiClient.interceptors.response.use((response) => {
  const header = response.headers?.['x-token-expires-at'];
  if (typeof header === 'string') {
    const expiresAt = Date.parse(header);
    const remaining = expiresAt - Date.now();
    if (Number.isFinite(expiresAt) && remaining > 0 && remaining < PROACTIVE_WINDOW_MS) {
      // Fire and forget — single-flight, so a screenful of responses all
      // arriving inside the window still produces exactly one rotation.
      void refreshSession().catch(() => undefined);
    }
  }
  return response;
});

/**
 * Persist the session token. `kind` defaults to 'patient' so every pre-existing
 * caller keeps its exact previous behaviour.
 */
export async function storeToken(token: string, kind: SessionKind = 'patient'): Promise<void> {
  await clearStoredToken();
  await setItem(kind === 'staff' ? STAFF_TOKEN_KEY : TOKEN_KEY, token);
  await setItem(SESSION_KIND_KEY, kind);
}

/** The live session, or null. */
export async function getStoredSession(): Promise<StoredSession | null> {
  const kind = (await getItem(SESSION_KIND_KEY)) as SessionKind | null;
  if (kind === 'staff') {
    const token = await getItem(STAFF_TOKEN_KEY);
    return token ? { kind: 'staff', token } : null;
  }
  // No marker at all = a patient token written before role-awareness existed.
  const token = await getItem(TOKEN_KEY);
  return token ? { kind: 'patient', token } : null;
}

/** The live session's bearer token, whichever surface it belongs to. */
export async function getStoredToken(): Promise<string | null> {
  return (await getStoredSession())?.token ?? null;
}

export async function clearStoredToken(): Promise<void> {
  await removeItem(TOKEN_KEY);
  await removeItem(STAFF_TOKEN_KEY);
  await removeItem(SESSION_KIND_KEY);
}

/** The API's RFC 7807-ish error envelope: { errors: { title, detail, violations? } }. */
export type ApiErrorBody = {
  errors?: {
    type?: string;
    title?: string;
    status?: number;
    detail?: string;
    violations?: { field: string; message: string }[];
  };
};

export function extractErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    const firstViolation = body?.errors?.violations?.[0]?.message;
    return firstViolation || body?.errors?.detail || fallback;
  }
  return fallback;
}
