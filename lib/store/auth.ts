import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { apiClient, setSessionExpiredHandler } from '../api/client';
import { endpoints } from '../api/endpoints';
import { tokenStorage } from '../api/tokenStorage';
import { getCachedDemographics, isNetworkError } from '../offline/cache';
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
 * TODAY IT ALWAYS RESOLVES TO `patient`, and that is not a stub for missing
 * code — it is the truth about the backend. Every mobile auth route
 * (`/mobile/auth/login`, `/mobile/auth/verify-otp`, `/mobile/auth/register`)
 * mints a PATIENT token against a PatientAccount and answers `/mobile/auth/me`
 * with a `Patient`, which carries no field that could say "clinician". The
 * clinician API (`/mobile/doctor/*`) is likewise not served yet, so every
 * doctor hook 404s.
 *
 * When the server starts issuing provider tokens, `resolvePersona` below is
 * the ONE function to change: read the role off the session payload there and
 * the whole doctor area unlocks behind it.
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
 * The persona a session resolves to.
 *
 * The patient argument is taken and deliberately unused: it is where the role
 * will be read from the day `/mobile/auth/me` carries one, and taking it now
 * means that day changes this function's body, not its callers.
 */
/**
 * Runtime clinician preview. The build-time override above is the real switch;
 * this exists so the demo login can show the clinician UI on a DEPLOYED demo
 * build, where env vars are baked in at export time and cannot be flipped.
 * It changes only which screens render — it grants no data and mints no
 * clinician token, because the server has no provider API to mint one from.
 */
let CLINICIAN_PREVIEW = false;

export function resolvePersona(_patient: Patient | null): Persona {
  return DOCTOR_PERSONA_OVERRIDE || CLINICIAN_PREVIEW ? 'doctor' : 'patient';
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

interface AuthState {
  status: AuthStatus;
  patient: Patient | null;
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
  persona: resolvePersona(null),
  pendingPhone: null,
  error: null,

  bootstrap: async () => {
    const token = await tokenStorage.get();
    if (!token) {
      set({ status: 'unauthenticated' });
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
        void (async () => {
          for (const delayMs of [2_000, 5_000, 15_000, 30_000]) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            if (get().status !== 'authenticated' || get().patient) return;
            try {
              await get().fetchMe();
              return;
            } catch {
              // Still unreachable — fall through to the next, longer wait.
            }
          }
        })();

        return;
      }

      await tokenStorage.clear();
      set({ status: 'unauthenticated' });
    }
  },

  loginWithEmail: async (email, password) => {
    set({ error: null });
    try {
      const { data } = await apiClient.post<AuthTokenResponse>(endpoints.loginEmail, {
        email,
        password,
      });
      await tokenStorage.set(data.access_token);
      await get().fetchMe();
      const nextStatus = await resolvePostAuthStatus();
      set({ status: nextStatus });
      if (nextStatus === 'permissions_pending') router.replace('/(auth)/permissions');
    } catch (err) {
      set({ error: extractErrorMessage(err) });
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
    try {
      const { data } = await apiClient.post<AuthTokenResponse>(endpoints.verifyOtp, {
        phone_number: phone,
        otp,
      });
      await tokenStorage.set(data.access_token);
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
    const { data } = await apiClient.get<Patient>(endpoints.me);
    // The session profile is the only thing a persona could ever be read from,
    // so it is re-derived on every successful read of it.
    set({ patient: data, persona: resolvePersona(data) });
  },

  previewClinician: (on) => {
    CLINICIAN_PREVIEW = on;
    set({ persona: resolvePersona(get().patient) });
  },

  logout: async () => {
    await tokenStorage.clear();
    set({
      status: 'unauthenticated',
      patient: null,
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
  useAuthStore.setState({
    status: 'unauthenticated',
    patient: null,
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
