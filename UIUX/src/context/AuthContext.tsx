import * as Device from 'expo-device';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as authApi from '../api/auth';
import * as staffAuthApi from '../api/staffAuth';
import { NO_RETRY, clearStoredToken, getStoredSession, setUnauthorizedHandler, storeToken, type SessionKind } from '../api/client';
import { cacheKeys, clearCache, readCache, writeCache } from '../lib/offlineCache';
import { isSessionRejected } from '../lib/errors';
import { registerForPush, unregisterForPush } from '../push/registration';
import { unsubscribeWebPush } from '../push/webPush';
import { clearMutePreferences } from '../push/preferences';

export type { SessionKind };

/**
 * One session at a time, of one of two kinds.
 *
 *   patient → `account` is set, `staffUser` is null
 *   staff   → `staffUser` is set, `account` is null
 *
 * `account` deliberately keeps its old name, type and null-ness so every
 * patient screen that reads `useAuth().account` is untouched by role-awareness.
 */
type AuthState = {
  /** The signed-in PATIENT, or null. Null for a staff session. */
  account: authApi.PatientAccount | null;
  /** The signed-in STAFF user, or null. Null for a patient session. */
  staffUser: staffAuthApi.StaffUser | null;
  /** Which API surface the live session belongs to. Null when signed out. */
  sessionKind: SessionKind | null;
  /** `users.role` for a staff session (doctor / nurse / admin / ...), else null. */
  role: staffAuthApi.StaffRole | null;
  /** A staff session whose role is allowed to use the clinician app. */
  isClinician: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: authApi.RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  /** `fast`: one short attempt, no retries — for the launch check. */
  refreshAccount: (fast?: boolean) => Promise<void>;
  /** Set when the session ended on its own (expired or revoked token), so the
   *  login screen can say why rather than appearing for no reason. */
  sessionExpired: boolean;
  clearSessionExpired: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

function deviceName(): string {
  return Device.deviceName || `${Platform.OS}-device`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<authApi.PatientAccount | null>(null);
  const [staffUser, setStaffUser] = useState<staffAuthApi.StaffUser | null>(null);
  const [sessionKind, setSessionKind] = useState<SessionKind | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const clearSession = useCallback(() => {
    setAccount(null);
    setStaffUser(null);
    setSessionKind(null);
  }, []);

  // A 401 from any authenticated endpoint means the token is gone. The axios
  // interceptor has already cleared storage; dropping the session is what
  // actually returns the app to the sign-in screen.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAccount((current) => {
        if (current) setSessionExpired(true);
        return null;
      });
      setStaffUser((current) => {
        if (current) setSessionExpired(true);
        return null;
      });
      setSessionKind(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  /**
   * `fast` is used only by the launch check: one attempt, a short budget, no
   * retries. The patient is looking at a splash screen and there is a cached
   * account to fall back on, so waiting out three attempts would be a worse
   * answer than opening their record and saying it is not up to date.
   */
  const refreshAccount = useCallback(async (fast = false) => {
    const session = await getStoredSession();
    if (session?.kind === 'staff') {
      const user = await staffAuthApi.me();
      setStaffUser(user);
      setAccount(null);
      setSessionKind('staff');
      return;
    }
    const patient = await authApi.me(fast ? { ...NO_RETRY, timeout: 10_000 } : undefined);
    setAccount(patient);
    setStaffUser(null);
    setSessionKind('patient');
    // Keep a copy so a launch with no signal can restore the session instead of
    // demanding a password over the connection that just failed.
    void writeCache(cacheKeys.account, patient);
  }, []);

  useEffect(() => {
    (async () => {
      let session: Awaited<ReturnType<typeof getStoredSession>> = null;
      try {
        session = await getStoredSession();
      } catch (e) {
        console.warn('Failed to read stored token', e);
      }
      if (!session) {
        setIsLoading(false);
        return;
      }
      try {
        await refreshAccount(true);
      } catch (e) {
        /**
         * This catch used to be unconditional: any failure of `GET /patient/me`
         * cleared the token, so a 15-second timeout on a 2G connection threw the
         * patient back to the login screen and asked them to re-type their
         * password over the same connection that had just failed. It was the
         * single most likely way a real user lost access to their own record,
         * and it happened precisely when they were least able to recover.
         *
         * Only the server saying "this token is no longer valid" ends a session.
         * Not reaching the server says nothing about the token at all.
         */
        if (isSessionRejected(e)) {
          await clearStoredToken();
        } else if (session.kind === 'patient') {
          // The token is still good; we simply could not confirm the account.
          // Restore the last known patient so the app opens on their record,
          // where each screen's own cache renders with its "last loaded" stamp.
          const cached = await readCache<authApi.PatientAccount>(cacheKeys.account);
          if (cached) {
            setAccount(cached.data);
            setStaffUser(null);
            setSessionKind('patient');
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshAccount]);

  /**
   * Sign in against whichever surface owns this email.
   *
   * The patient endpoint is tried FIRST and unchanged, so the patient flow is
   * byte-for-byte what it was: same request, same success path, and — when both
   * attempts fail — the same error message it always raised. The staff attempt
   * only runs after the patient portal has said no, and only its
   * "your role may not use these abilities" failure is allowed to replace the
   * patient error, because that one is the honest explanation: the password was
   * right and the role is the problem.
   */
  const login = useCallback(async (email: string, password: string) => {
    const device = deviceName();
    try {
      const result = await authApi.login(email, password, device);
      await storeToken(result.token, 'patient');
      setSessionExpired(false);
      setStaffUser(null);
      setSessionKind('patient');
      setAccount(result.account);
      // Cache immediately, not on the next refresh: otherwise a patient who
      // signs in and then loses signal before any refresh has no account to
      // restore and is asked to sign in again.
      void writeCache(cacheKeys.account, result.account);
      // P4.8 — ask for notification permission HERE, not at first launch: the
      // user has just proved they have an account and a reason to say yes.
      // Fire-and-forget and never awaited — a denied prompt, an offline
      // register or a simulator must not delay or fail a successful sign-in.
      void registerForPush();
      return;
    } catch (patientError) {
      let staff: staffAuthApi.StaffTokenPayload;
      try {
        staff = await staffAuthApi.login(email, password, device);
      } catch (staffError) {
        throw staffAuthApi.isAbilityRejection(staffError) ? staffError : patientError;
      }
      await storeToken(staff.token, 'staff');
      const user = await staffAuthApi.me();
      setSessionExpired(false);
      setAccount(null);
      setSessionKind('staff');
      setStaffUser(user);
      // Same moment, the clinician half. A doctor with no push has no reason
      // to keep the app installed — this is the registration that makes a
      // critical result reach them away from the desktop.
      void registerForPush();
    }
  }, []);

  const register = useCallback(async (input: authApi.RegisterInput) => {
    const result = await authApi.register(input, deviceName());
    await storeToken(result.token, 'patient');
    setSessionExpired(false);
    setStaffUser(null);
    setSessionKind('patient');
    setAccount(result.account);
    void writeCache(cacheKeys.account, result.account);
    // Sign-up is a sign-in too — same moment, same reasoning as login().
    void registerForPush();
  }, []);

  const logout = useCallback(async () => {
    const kind = sessionKind;
    // P4.8 — retire this device BEFORE the auth token is cleared below: after
    // clearStoredToken() there is no session left to authenticate the call.
    // Awaited (it resolves even on failure) so it cannot race the clear.
    await unregisterForPush();
    // Web: drop this browser's Web Push subscription while the token is still
    // valid, then forget the muted-category cache for the next person.
    await unsubscribeWebPush();
    clearMutePreferences();
    try {
      if (kind === 'staff') {
        await staffAuthApi.logout();
      } else {
        await authApi.logout();
      }
    } finally {
      await clearStoredToken();
      // The phone may be shared. Nothing of this patient's record survives
      // sign-out for the next person to open the app.
      await clearCache();
      setSessionExpired(false);
      clearSession();
    }
  }, [sessionKind, clearSession]);

  const role = staffUser?.role ?? null;

  const value = useMemo<AuthState>(
    () => ({
      account,
      staffUser,
      sessionKind,
      role,
      isClinician: sessionKind === 'staff' && staffAuthApi.isClinicalRole(role),
      isLoading,
      isAuthenticated: !!account || !!staffUser,
      login,
      register,
      logout,
      refreshAccount,
      sessionExpired,
      clearSessionExpired,
    }),
    [
      account,
      staffUser,
      sessionKind,
      role,
      isLoading,
      login,
      register,
      logout,
      refreshAccount,
      sessionExpired,
      clearSessionExpired,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
