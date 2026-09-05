import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { apiClient, setSessionExpiredHandler } from '../api/client';
import { endpoints } from '../api/endpoints';
import { tokenStorage } from '../api/tokenStorage';
import { getCachedDemographics, isNetworkError } from '../offline/cache';
import {
  fetchProviderMe as fetchProviderAccount,
  isProviderConnectionFailure,
  providerAuthErrorMessage,
  providerLogin,
  providerLogout,
  type ProviderAccount,
} from '../api/providerQueries';
import type { AuthTokenResponse, Patient } from '../api/types';

// 'permissions_pending' is a deliberately non-'authenticated' status so the
// root layout's auth-gating effect (app/_layout.tsx — not modified here)
// leaves the user on /(auth)/permissions instead of bouncing them to
// /(tabs)/home: that effect only redirects when status is exactly
// 'unauthenticated'-ish (out of the auth group) or exactly 'authenticated'
// (out of it); anything else is a deliberate no-op zone it ignores.
type AuthStatus =
  | 'booting'
  | 'unauthenticated'
  | 'otp_pending'
  | 'permissions_pending'
  | 'authenticated';

/**
 * Which half of the app this session may see.
 *
 * `patient` is the app everyone gets — the tabs under `app/(tabs)`. `doctor`
 * is the clinician area under `app/clinician`: schedule, patient charts,
 * results inbox, appointment requests.
 *
 * `doctor` now resolves for a REAL session: `POST /mobile/auth/provider/login`
 * mints a provider token and `GET /mobile/auth/provider/me` restores it, and a
 * live provider account is what `resolvePersona` reads first. The build-time
 * override and the runtime preview below remain as fallbacks, for the demo
 * hosts and dev builds whose server does not serve provider auth yet — they
 * unlock a UI and nothing else.
 *
 * The patient routes (`/mobile/auth/login-email`, `/mobile/auth/otp/verify`,
 * `/mobile/auth/register`) still mint PATIENT tokens and answer `/mobile/me`
 * with a `Patient`, which carries no field that could say "clinician" — the
 * persona of a patient session is therefore never read off the profile.
 */
export type Persona = 'patient' | 'doctor';

/**
 * Dev-only override so the clinician UI is previewable before the backend can
 * mint a clinician session. Set `EXPO_PUBLIC_DOCTOR_PERSONA=1` in `.env` (or
 * in an EAS build profile) and the app resolves to the doctor persona.
 *
 * `EXPO_PUBLIC_*` values are INLINED AT BUILD TIME by Expo, so a production
 * build made without the flag cannot have it flipped on at runtime. It unlocks
 * a UI, never data: the server still authorises every request on the token it
 * was actually given, and today it refuses the doctor routes outright.
 */
const DOCTOR_PERSONA_OVERRIDE =
  process.env.EXPO_PUBLIC_DOCTOR_PERSONA === '1' ||
  process.env.EXPO_PUBLIC_DOCTOR_PERSONA === 'true';

/**
 * Runtime clinician preview. The build-time override above is the real switch;
 * this exists so the demo login can show the clinician UI on a DEPLOYED demo
 * build, where env vars are baked in at export time and cannot be flipped.
 * It changes only which screens render — it grants no data and mints no
 * clinician token, so it is now strictly the FALLBACK for a server that does
 * not serve `/mobile/auth/provider/*`.
 */
let CLINICIAN_PREVIEW = false;

/**
 * The persona a session resolves to.
 *
 * A verified provider account wins outright — that is a real clinician token,
 * not a preview. Only when there is none do the dev override and the demo
 * preview get a say.
 *
 * The patient argument is still taken and still unused: `/mobile/me` carries
 * no role, and a patient session is a patient session. It stays in the
 * signature so every existing call site keeps compiling and so the day the
 * patient payload does carry a role, this function's body changes and nothing
 * else does.
 */
export function resolvePersona(
  _patient: Patient | null,
  provider: ProviderAccount | null = null,
): Persona {
  if (provider) return 'doctor';
  return DOCTOR_PERSONA_OVERRIDE || CLINICIAN_PREVIEW ? 'doctor' : 'patient';
}

// ---------------------------------------------------------------------------
// Session kind — and why there can only ever be one
//
// `tokenStorage` is a SINGLE SLOT (one SecureStore key). Both session kinds go
// through it, so a provider token physically overwrites a patient token and
// vice versa: two live tokens cannot coexist, and the bearer header
// `lib/api/client.ts` attaches is never ambiguous. That is the guarantee, and
// it is structural rather than a rule somebody has to remember.
//
// What the slot cannot say is WHICH kind the token is, and bootstrap needs to
// know: a provider token asked `/mobile/me` gets a 401 and ends the session.
// So one extra flag rides alongside it. It is a marker, not a second token
// scheme — it holds no secret, and 'provider' is the only value ever written
// (absent means patient, so a token written by any other code path — signup,
// the refresh interceptor — is read back as what it is).
// ---------------------------------------------------------------------------

type SessionKind = 'patient' | 'provider';

const SESSION_KIND_KEY = 'opescare_session_kind';

/** Same platform split as the token and the permissions flag: SecureStore is a no-op on web. */
const sessionKindStorage =
  Platform.OS === 'web'
    ? {
        get: async () =>
          typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_KIND_KEY) : null,
        set: async () => {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(SESSION_KIND_KEY, 'provider');
          }
        },
        clear: async () => {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(SESSION_KIND_KEY);
          }
        },
      }
    : {
        get: () => SecureStore.getItemAsync(SESSION_KIND_KEY),
        set: () => SecureStore.setItemAsync(SESSION_KIND_KEY, 'provider'),
        clear: () => SecureStore.deleteItemAsync(SESSION_KIND_KEY),
      };

/** What kind of session the stored token belongs to. Unreadable storage reads as `patient`. */
async function readSessionKind(): Promise<SessionKind> {
  try {
    return (await sessionKindStorage.get()) === 'provider' ? 'provider' : 'patient';
  } catch {
    return 'patient';
  }
}

/**
 * The ONE writer of the token slot.
 *
 * The marker goes first on purpose. If the second write fails the pair is
 * still safe in both directions: a marker with no token boots as no session at
 * all, and a token whose marker never landed is asked `/mobile/me`, refused,
 * and ended. Neither order can produce a provider token being used as a
 * patient's, or the reverse.
 */
async function adoptSession(kind: SessionKind, token: string): Promise<void> {
  try {
    if (kind === 'provider') await sessionKindStorage.set();
    else await sessionKindStorage.clear();
  } catch {
    // Marker storage is unavailable on this device; the token write below still
    // decides the session, and an unmarked provider token fails closed.
  }
  await tokenStorage.set(token);
}

/** Wipe the slot and the marker together. Every end-of-session path goes through here. */
async function clearStoredSession(): Promise<void> {
  await tokenStorage.clear();
  try {
    await sessionKindStorage.clear();
  } catch {
    // Best effort — a stale marker with no token boots as no session.
  }
}

/**
 * Mutual exclusion, enforced BEFORE a sign-in attempt rather than after it.
 *
 * If the slot holds a session of the other kind, it is dropped now — so the
 * login request itself cannot carry the wrong bearer header (the request
 * interceptor attaches whatever is in storage), and a FAILED attempt cannot
 * leave the other kind's token behind to be picked up on the next launch.
 */
async function dropSessionOfOtherKind(next: SessionKind): Promise<void> {
  if ((await readSessionKind()) !== next) await clearStoredSession();
}

/**
 * Land the DEMO PREVIEW on the clinician area.
 *
 * `app/_layout.tsx` sends every authenticated session sitting in the `(auth)`
 * group or on `/` to `/(tabs)/home` — the patient app — and that effect is not
 * this feature's to change. So this runs on the next macrotask: React has
 * flushed the effect by then, and the later `replace` is the last word. From
 * `/clinician/...` the effect is a no-op (not the auth group, not the root
 * index), so nothing bounces back out.
 *
 * Only for the preview, whose session is an ordinary PATIENT token — the tabs
 * mounting for a frame on the way through costs nothing there, because a
 * patient token is exactly what those screens expect. A real provider session
 * needs no equivalent: the guard reads `provider` and routes it straight into
 * the clinician area (see `enterClinicianArea` below).
 *
 * Exported because the login screen mints the preview session itself, the same
 * way `resolvePostAuthStatus` is exported for signup.
 */
export function routeToClinicianArea(): void {
  setTimeout(() => {
    router.replace('/clinician/home');
  }, 0);
}

/**
 * Open a REAL provider session.
 *
 * IT DOES NOT NAVIGATE, AND THAT IS THE POINT.
 *
 * It used to call `router.replace('/clinician/home')` unconditionally. That was
 * right for the case it was written for — a clinician tapping Sign in on
 * `/(auth)/login` — and wrong for the other one. `bootstrap()` calls it too, on
 * EVERY cold start, and on the web build every route is a real, refreshable
 * URL: opening `/clinician/schedule` restored the session and then immediately
 * replaced the deep-linked route with `/clinician/home`. Bookmarks did not
 * work, a refresh lost your place, the address bar described a screen that was
 * not on it — and the schedule the router had already resolved stayed mounted
 * underneath the one that replaced it. The route the user asked for is not
 * this function's to discard.
 *
 * WHERE an authenticated session belongs is decided in exactly one place, the
 * guard in `app/_layout.tsx`. That guard reads `provider`, so it never sends a
 * clinician through the patient tabs — which is what this redirect was really
 * protecting against, and it matters: the patient tabs fire `/mobile/*` with
 * whatever bearer token is in storage, a provider token collects a wall of
 * 401s, and the session-expired handler at the bottom of this file would end
 * an entirely valid clinician session. The guard moves a clinician out of the
 * patient app from anywhere, and leaves them alone inside `/clinician/…` —
 * including on the route they deep-linked to.
 */
function enterClinicianArea(setState: (partial: Partial<AuthState>) => void): void {
  setState({ status: 'authenticated' });
}

/**
 * Device-local flag: has this device already been through the permissions
 * priming screen once? Permissions are OS+device scoped (not account
 * scoped), so this intentionally survives logout/login on the same device
 * and is keyed independently of the session token.
 */
const PERMISSIONS_PRIMER_SEEN_KEY = 'opescare_permissions_primer_seen';

const permissionsPrimerFlag =
  Platform.OS === 'web'
    ? {
        get: async () =>
          typeof localStorage !== 'undefined' ? localStorage.getItem(PERMISSIONS_PRIMER_SEEN_KEY) : '1',
        set: async () => {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(PERMISSIONS_PRIMER_SEEN_KEY, '1');
          }
        },
      }
    : {
        get: () => SecureStore.getItemAsync(PERMISSIONS_PRIMER_SEEN_KEY),
        set: () => SecureStore.setItemAsync(PERMISSIONS_PRIMER_SEEN_KEY, '1'),
      };

/** Resolves the status a just-completed login/signup should land on: the
 * permissions primer only shows once per device, right after the first
 * successful auth on it. */
/** Exported so screens that mint a session outside the store's own actions
 * (currently just signup.tsx, which issues its own token via a dedicated
 * registration mutation) can route through the same one-time permissions
 * primer as loginWithEmail/verifyOtp instead of duplicating the check. */
export async function resolvePostAuthStatus(): Promise<AuthStatus> {
  try {
    const seen = await permissionsPrimerFlag.get();
    return seen ? 'authenticated' : 'permissions_pending';
  } catch {
    return 'authenticated';
  }
}

/**
 * Where the session PROFILE is, separately from where the SESSION is. A token
 * can be valid while `/mobile/me` has not answered yet: `loading` while a fetch
 * is in flight or a retry is scheduled, `error` only when the last attempt
 * actually failed and nothing further is scheduled, `ready` once `patient` is
 * filled. Screens show a spinner for `loading` and the retry card for `error`.
 */
export type ProfileState = 'idle' | 'loading' | 'ready' | 'error';

interface AuthState {
  status: AuthStatus;
  patient: Patient | null;
  profileState: ProfileState;
  /**
   * The signed-in clinician, or null. NON-NULL EXACTLY WHEN `patient` IS NULL
   * AND THE STORED TOKEN IS A PROVIDER ONE — the two session kinds share one
   * token slot and are never both live. Set only from a verified
   * `/mobile/auth/provider/login` or `/mobile/auth/provider/me`; never guessed,
   * and never populated from a cache.
   */
  provider: ProviderAccount | null;
  /**
   * Which half of the app this session may see. Derived — never set by a
   * screen. Kept as state rather than computed at every read so a future
   * role-bearing payload has somewhere to land.
   */
  persona: Persona;
  pendingPhone: string | null;
  error: string | null;

  bootstrap: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  /**
   * Sign a clinician in against `POST /mobile/auth/provider/login`. Ends any
   * patient session first, wins or throws, and never falls back to anything.
   */
  loginAsProvider: (email: string, password: string) => Promise<void>;
  /** Refresh the signed-in clinician from `GET /mobile/auth/provider/me`. */
  fetchProviderMe: () => Promise<void>;
  loginWithPhone: (phoneNumber: string, pin: string, dateOfBirth?: string) => Promise<void>;
  verifyOtp: (otp: string) => Promise<void>;
  resendOtp: () => Promise<void>;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
  /** Show the clinician UI for this session (demo preview only — grants no data). */
  previewClinician: (on: boolean) => void;
  clearError: () => void;
  /** Called by the permissions priming screen when the user finishes or
   * skips it — records the device as primed and settles status to
   * 'authenticated', which the root layout then routes home from. */
  completePermissionsPriming: () => Promise<void>;
}

function extractErrorMessage(err: unknown): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message ?? 'Something went wrong. Please try again.';
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'booting',
  patient: null,
  profileState: 'idle',
  provider: null,
  persona: resolvePersona(null),
  pendingPhone: null,
  error: null,

  bootstrap: async () => {
    const token = await tokenStorage.get();
    if (!token) {
      set({ status: 'unauthenticated' });
      return;
    }

    // A provider token is restored the same way a patient one is — by asking
    // the server who it belongs to — just against the provider `/me`. Asking
    // the PATIENT `/me` with it would 401 and silently end a valid clinician
    // session, which is why the kind is recorded alongside the token.
    if ((await readSessionKind()) === 'provider') {
      try {
        await get().fetchProviderMe();
        enterClinicianArea(set);
      } catch (err) {
        if (isProviderConnectionFailure(err)) {
          // Same principle as the patient branch below: a dropped connection is
          // not a rejected session, so the token is KEPT. The difference is
          // where it leaves the clinician. A patient can boot on a cached
          // profile; a clinician has no offline cache and every clinician
          // screen is a live read, so entering the app on an unverified
          // provider token would put the doctor UI up over nothing — or worse,
          // resolve to the PATIENT app with a provider bearer header. So we
          // hold at the sign-in screen and pull them in the moment `/me`
          // answers, without making them type anything.
          set({ status: 'unauthenticated' });
          void (async () => {
            for (const delayMs of [2_000, 5_000, 15_000, 30_000]) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              // Someone signed in (either kind) in the meantime — stand down.
              if (get().status !== 'unauthenticated' || get().provider) return;
              if (!(await tokenStorage.get())) return;
              if ((await readSessionKind()) !== 'provider') return;
              try {
                await get().fetchProviderMe();
                enterClinicianArea(set);
                return;
              } catch (retryErr) {
                // Reachable again and refused: the token is dead, so stop
                // holding it. Still unreachable: wait longer and ask again.
                if (!isProviderConnectionFailure(retryErr)) {
                  await clearStoredSession();
                  return;
                }
              }
            }
          })();
          return;
        }

        // The server judged the token and said no. End it.
        await clearStoredSession();
        set({ status: 'unauthenticated', provider: null, persona: resolvePersona(null) });
      }
      return;
    }

    try {
      await get().fetchMe();
      set({ status: 'authenticated' });
    } catch (err) {
      // A dropped connection is not an expired session, so it must never cost
      // the patient their token. Only the server saying no does that.
      //
      // `isNetworkError` is true exactly when no response came back at all. In
      // that case the token has not been rejected — it has not been judged —
      // so we keep it and boot into the app: on the cached profile if offline
      // access is on, otherwise authenticated with no profile yet, which the
      // screens already handle (every read of `patient` is optional-chained)
      // and which resolves on the first successful fetch.
      //
      // This previously cleared the token whenever there was no cached copy,
      // which meant opening the app once with no signal silently logged the
      // patient out and forced a full re-login. On a Cameroonian mobile
      // network that is a routine event, not an edge case.
      //
      // If the token really is dead, the next request returns 401 and the
      // session-expired handler at the bottom of this file ends the session —
      // so this fails open on connectivity and closed on actual rejection.
      if (isNetworkError(err)) {
        const cached = await getCachedDemographics();
        set({
          patient: cached ?? null,
          persona: resolvePersona(cached ?? null),
          status: 'authenticated',
        });

        // Booting without a profile is a holding state, not a resting one:
        // with `patient` null the greeting reads "—" and the avatar "?" until
        // something fills it. Nothing else re-runs fetchMe, so retry on a
        // backoff until it lands or the session is ended by a 401 elsewhere.
        //
        // The backoff never gives up while the session is live: it used to
        // stop after four tries (~50 s), after which the Profile tab showed
        // "not loaded" for the rest of the session unless the person tapped
        // Retry themselves. The wait caps at a minute; a foreground or
        // reconnect event (see startProfileRecovery) retries immediately.
        set({ profileState: cached ? 'ready' : 'loading' });
        void (async () => {
          const delays = [2_000, 5_000, 15_000, 30_000, 60_000];
          for (let attempt = 0; ; attempt++) {
            const delayMs = delays[Math.min(attempt, delays.length - 1)];
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            if (get().status !== 'authenticated' || get().patient) return;
            try {
              await get().fetchMe();
              return;
            } catch {
              // Still unreachable — fall through to the next, longer wait,
              // but let the screen know a retry is pending, not abandoned.
              if (get().status === 'authenticated' && !get().patient) set({ profileState: 'loading' });
            }
          }
        })();

        return;
      }

      await clearStoredSession();
      set({ status: 'unauthenticated' });
    }
  },

  loginWithEmail: async (email, password) => {
    set({ error: null });
    // A clinician token in the slot would otherwise ride along on this request
    // and, if the login failed, still be sitting there afterwards.
    await dropSessionOfOtherKind('patient');
    set({ provider: null });
    try {
      const { data } = await apiClient.post<AuthTokenResponse>(endpoints.loginEmail, {
        email,
        password,
      });
      await adoptSession('patient', data.access_token);
      await get().fetchMe();
      const nextStatus = await resolvePostAuthStatus();
      set({ status: nextStatus });
      if (nextStatus === 'permissions_pending') router.replace('/(auth)/permissions');
    } catch (err) {
      set({ error: extractErrorMessage(err) });
      throw err;
    }
  },

  loginAsProvider: async (email, password) => {
    set({ error: null });

    // Mutual exclusion, before the request rather than after it: any patient
    // token is gone before the clinician's credentials are even sent, so the
    // login cannot carry a patient bearer header and a failure cannot leave one
    // behind. The in-memory patient goes with it — there is no session left for
    // it to describe.
    await dropSessionOfOtherKind('provider');
    set({ patient: null, provider: null, pendingPhone: null });

    try {
      const session = await providerLogin(
        email,
        password,
        `OpesCare Finder (${Platform.OS})`,
      );
      await adoptSession('provider', session.access_token);

      // A real clinician session supersedes any UI preview that was switched on
      // before it — the persona is now backed by a token, not by a flag.
      CLINICIAN_PREVIEW = false;

      set({
        provider: session.provider,
        patient: null,
        persona: resolvePersona(null, session.provider),
      });
      // Sets 'authenticated' itself, on the far side of the navigation.
      enterClinicianArea(set);
    } catch (err) {
      await clearStoredSession();
      set({
        provider: null,
        // The slot is empty either way now, so the status says so rather than
        // leaving a claim of a session that no longer has a token behind it.
        status: 'unauthenticated',
        persona: resolvePersona(get().patient),
        // 401 (bad credentials OR not a clinician — the API does not say which),
        // 409 (no facility) and 404 (this server has no provider auth) all come
        // back with the server's own wording where there is any; the screen
        // decides how to phrase the ones it can recognise.
        error: providerAuthErrorMessage(err, 'Something went wrong. Please try again.'),
      });
      throw err;
    }
  },

  loginWithPhone: async (phoneNumber, pin, dateOfBirth) => {
    set({ error: null });
    try {
      await apiClient.post(endpoints.loginPhone, {
        phone_number: phoneNumber,
        pin,
        ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
      });
      set({ status: 'otp_pending', pendingPhone: phoneNumber });
    } catch (err) {
      set({ error: extractErrorMessage(err) });
      throw err;
    }
  },

  verifyOtp: async (otp) => {
    const phone = get().pendingPhone;
    if (!phone) throw new Error('No pending phone login');
    set({ error: null });
    await dropSessionOfOtherKind('patient');
    set({ provider: null });
    try {
      const { data } = await apiClient.post<AuthTokenResponse>(endpoints.verifyOtp, {
        phone_number: phone,
        otp,
      });
      await adoptSession('patient', data.access_token);
      await get().fetchMe();
      const nextStatus = await resolvePostAuthStatus();
      set({ status: nextStatus, pendingPhone: null });
      if (nextStatus === 'permissions_pending') router.replace('/(auth)/permissions');
    } catch (err) {
      set({ error: extractErrorMessage(err) });
      throw err;
    }
  },

  resendOtp: async () => {
    const phone = get().pendingPhone;
    if (!phone) return;
    await apiClient.post(endpoints.resendOtp, { phone_number: phone });
  },

  fetchMe: async () => {
    set({ profileState: 'loading' });
    try {
      const { data } = await apiClient.get<Patient>(endpoints.me);
      // The session profile is the only thing a persona could ever be read from,
      // so it is re-derived on every successful read of it.
      set({ patient: data, profileState: 'ready', persona: resolvePersona(data, get().provider) });
    } catch (err) {
      // Keep whatever profile we already had (a cached copy is better than
      // none); only the FRESHNESS failed. `error` is what the screens key on.
      set({ profileState: 'error' });
      throw err;
    }
  },

  fetchProviderMe: async () => {
    const provider = await fetchProviderAccount();
    // A verified clinician and a patient profile cannot describe the same
    // session, so adopting one drops the other.
    set({ provider, patient: null, persona: resolvePersona(null, provider) });
  },

  previewClinician: (on) => {
    CLINICIAN_PREVIEW = on;
    set({ persona: resolvePersona(get().patient, get().provider) });
  },

  logout: async () => {
    // Revoke the clinician token server-side before dropping it locally, so a
    // signed-out phone cannot be replayed. Best effort by design: a logout a
    // flaky network can veto is not a logout, so the local wipe runs either way.
    if (get().provider || (await readSessionKind()) === 'provider') {
      try {
        await providerLogout();
      } catch {
        // Already expired, offline, or no such route — the local wipe stands.
      }
    }

    await clearStoredSession();

    // The preview is a demo affordance, not a property of the device: leaving
    // it on would hand the clinician UI to whoever signs in next.
    CLINICIAN_PREVIEW = false;

    set({
      status: 'unauthenticated',
      patient: null,
      provider: null,
      persona: resolvePersona(null),
      pendingPhone: null,
    });
  },

  clearError: () => set({ error: null }),

  completePermissionsPriming: async () => {
    try {
      await permissionsPrimerFlag.set();
    } catch {
      // Best-effort — worst case the primer shows again on this device next login.
    }
    set({ status: 'authenticated' });
  },
}));

// Wired once, outside the component tree: if any request's token refresh fails,
// force the store back to unauthenticated so the router redirects to login.
setSessionExpiredHandler(() => {
  // `client.ts` has already cleared the token; clear the kind marker with it so
  // the next launch cannot read a dead provider session out of a bare flag.
  void sessionKindStorage.clear().catch(() => {});
  useAuthStore.setState({
    status: 'unauthenticated',
    patient: null,
    provider: null,
    persona: resolvePersona(null),
  });
});

/**
 * True when this session may see the clinician area (`app/clinician`).
 *
 * The gate in `app/clinician/_layout.tsx` reads this: false renders the
 * "wrong app" screen instead of the clinician tabs, so no clinician screen can
 * be reached by typing a URL. It is a UI gate, not a security boundary — the
 * server authorises every request on its own.
 */
export function useIsDoctor(): boolean {
  return useAuthStore((s) => s.persona === 'doctor');
}
