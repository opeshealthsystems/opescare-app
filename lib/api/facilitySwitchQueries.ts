/**
 * Which facility the clinician is acting as — list, and change.
 *
 * Modelled on `lib/api/providerQueries.ts`: wire shapes typed here, paths
 * spelled out here (not in `endpoints.ts`, which is owned elsewhere),
 * `apiClient` for the base URL / timeout / bearer interceptor, and no retry
 * against an answer.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * A doctor posted at two hospitals used to be handed whichever facility the
 * server's query returned first, stamped onto a 30-day token, with no
 * indication and no way to change it. Every chart, prescription and diary this
 * app showed was scoped to a facility nobody chose. These two calls are the
 * choice.
 *
 * ── THE CONTRACT ──────────────────────────────────────────────────────────
 *   GET  /mobile/provider/facilities   (Bearer)
 *        → 200 { current_facility_id, facilities: [ … ] }
 *
 *   POST /mobile/provider/facility     (Bearer) { facility_id }
 *        → 200 { changed: true,  access_token, token_type, expires_in, provider }
 *        → 200 { changed: false, provider }   — already acting as it; the
 *              current token stays valid and NO new one is issued
 *        → 403 no active posting at that facility (error_code FACILITY_NOT_ASSIGNED)
 *        → 409 the facility is suspended        (error_code FACILITY_SUSPENDED)
 *        → 422 malformed facility_id
 *
 * ── SWITCHING REPLACES THE SESSION ────────────────────────────────────────
 * The server REVOKES the presented token and mints a new one for the
 * destination facility — the `provider_access_tokens` migration is explicit
 * that "a clinician who moves facility gets a new session rather than a token
 * that silently follows them". Two consequences this module has to honour:
 *
 *   1. The returned `access_token` MUST be stored before anything else is
 *      requested. `apiClient` reads the token slot on every request, so the
 *      first call made with the old bearer after a switch is a 401 that ends
 *      the session. `switchProviderFacility()` writes it first, always.
 *
 *   2. Everything already fetched belongs to the OLD facility. The react-query
 *      cache is cleared on a successful switch rather than invalidated,
 *      because invalidation leaves the stale rows on screen while the refetch
 *      is in flight — and "the previous hospital's patient list, labelled with
 *      the new hospital's name" is the exact failure this feature exists to
 *      prevent. A blank screen for a second is the honest state.
 *
 * The old token is dead the moment the server answers. A client that loses the
 * response has no session and must sign in again; it must never retry with the
 * bearer it was holding.
 *
 * ── WHAT THIS MODULE DOES NOT DO ──────────────────────────────────────────
 * It does not decide which persona the app shows and it does not own the token
 * slot's session-kind marker — `lib/store/auth.ts` does. A switch never changes
 * either: a provider session stays a provider session, at a different address.
 */
import { isAxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { tokenStorage } from './tokenStorage';
import { providerRetry, type ProviderAccount } from './providerQueries';
import { useAuthStore } from '../store/auth';

/** Paths, spelled out (see the module note). */
export const facilitySwitchEndpoints = {
  facilities: '/mobile/provider/facilities',
  switch: '/mobile/provider/facility',
} as const;

/**
 * One facility the clinician holds a posting at.
 *
 * `role` is the role held AT THAT FACILITY where the server records one — a
 * clinician can be a consultant at one hospital and a locum at another. It is
 * displayed and never parsed for authorisation; the server decides what a
 * session may do, on every request.
 */
export interface ProviderFacility {
  id: string;
  name: string;
  /** `hospital` | `clinic` | … — free-form on the server; shown as a label only. */
  type: string;
  status: 'active' | 'suspended';
  role: string | null;
  role_label: string | null;
  is_current: boolean;
}

export interface ProviderFacilitiesResponse {
  current_facility_id: string | null;
  facilities: ProviderFacility[];
}

/**
 * 200 body of `POST /mobile/provider/facility`.
 *
 * `access_token` is OPTIONAL on purpose: a no-op switch (`changed: false`)
 * returns none, because the session that is already correct must not be thrown
 * away. Read `changed` — or the presence of the token — never assume one is
 * there.
 */
export interface ProviderFacilitySwitchResponse {
  changed: boolean;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  /**
   * Nullable because a payload this client could not read is not a clinician
   * account. The switch itself has still happened server-side by then, so the
   * caller reads the facility back from the refreshed auth store rather than
   * trusting a shape nobody understood.
   */
  provider: ProviderAccount | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Failure classification — one predicate per answer the UI must tell apart
// ═══════════════════════════════════════════════════════════════════════════

/** True when this server has no facility switching — missing route, or no answer at all. */
export function isFacilitySwitchUnavailable(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === undefined) return true;
  return status === 404 || status === 405 || status === 501 || status >= 502;
}

/**
 * 403 — the clinician holds no active posting at that facility.
 *
 * Not a client bug to hide: a posting can be withdrawn between the list being
 * fetched and the switch being tapped, and the honest thing is to say so and
 * refresh the list.
 */
export function isFacilityNotAssigned(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 403;
}

/** 409 — the facility exists and is the clinician's, but it is suspended. */
export function isFacilitySuspended(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 409;
}

/** The server's own words where it gave some, else the caller's fallback. */
export function facilitySwitchErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const body = error.response?.data as { message?: string } | undefined;
    if (typeof body?.message === 'string' && body.message.trim()) return body.message;
  }
  return fallback;
}

/** `error_code` where the server sent one — lets the phone translate a /api/* refusal. */
export function facilitySwitchErrorCode(error: unknown): string | null {
  if (isAxiosError(error)) {
    const body = error.response?.data as { error_code?: string } | undefined;
    if (typeof body?.error_code === 'string' && body.error_code) return body.error_code;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Calls
// ═══════════════════════════════════════════════════════════════════════════

/** The facilities this clinician may act at. Their postings — never a directory. */
export async function fetchProviderFacilities(): Promise<ProviderFacilitiesResponse> {
  const { data } = await apiClient.get<ProviderFacilitiesResponse>(
    facilitySwitchEndpoints.facilities,
  );

  return {
    current_facility_id: data?.current_facility_id ?? null,
    facilities: Array.isArray(data?.facilities) ? data.facilities : [],
  };
}

/**
 * Act as another facility.
 *
 * Order is load-bearing and is the whole reason this is a function rather than
 * a bare `apiClient.post`:
 *
 *   1. POST, and let a refusal throw before anything local changes;
 *   2. store the NEW bearer, because the old one is already revoked server-side
 *      and every request after this line would otherwise 401 and sign the
 *      clinician out;
 *   3. tell the auth store who the session belongs to now, so the app chrome
 *      names the facility the clinician actually moved to.
 *
 * The session-kind marker is deliberately untouched: it already says
 * 'provider', and a switch does not change what kind of session this is.
 */
export async function switchProviderFacility(
  facilityId: string,
): Promise<ProviderFacilitySwitchResponse> {
  const { data } = await apiClient.post<ProviderFacilitySwitchResponse>(
    facilitySwitchEndpoints.switch,
    { facility_id: facilityId },
  );

  if (data?.changed && data.access_token) {
    await tokenStorage.set(data.access_token);
  }
  // `changed` with no token should not happen — but if it ever did, the held
  // bearer is already revoked and the next request 401s into the client's
  // session-expired path. The clinician signs in again and lands at the
  // facility the server did move them to. Nothing here pretends otherwise.

  // Keep the store's clinician in step with the token it now holds. Best
  // effort: the switch has already happened server-side and a failed refresh
  // is a stale name in the header, not a wrong session — the next `/me` fixes
  // it, and forcing a logout here would be a far worse answer.
  try {
    await useAuthStore.getState().fetchProviderMe();
  } catch {
    // Intentionally swallowed — see above.
  }

  return {
    changed: Boolean(data?.changed),
    access_token: data?.access_token,
    token_type: data?.token_type,
    expires_in: data?.expires_in,
    provider: data?.provider ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Hooks
// ═══════════════════════════════════════════════════════════════════════════

export const facilitySwitchKeys = {
  all: ['provider', 'facilities'] as const,
};

/**
 * The clinician's postings. Disabled unless asked for, so a screen that only
 * shows the switcher when there is more than one facility does not pay for the
 * request on every other session.
 */
export function useProviderFacilities(enabled = true) {
  return useQuery({
    queryKey: facilitySwitchKeys.all,
    queryFn: fetchProviderFacilities,
    enabled,
    retry: providerRetry,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Switch facility, then drop everything the app had fetched for the previous
 * one.
 *
 * `clear()` and not `invalidateQueries()`: invalidation keeps the stale rows
 * rendered while their refetch is in flight, which means the previous
 * hospital's patients, diary and results sit under the new hospital's name for
 * as long as the network takes. Clearing shows loading states instead — and
 * nothing on this surface is safe to show attributed to the wrong facility.
 */
export function useSwitchProviderFacility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (facilityId: string) => switchProviderFacility(facilityId),
    onSuccess: (result) => {
      if (!result.changed) return;
      queryClient.clear();
    },
  });
}
