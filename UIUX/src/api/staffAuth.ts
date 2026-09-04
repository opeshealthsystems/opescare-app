import { apiClient } from './client';
import { setCacheScope } from '../lib/offlineCache';

/**
 * Staff authentication — the `api/v1/auth/*` surface, which is a different
 * guard from the patient portal's `api/v1/patient/auth/*`.
 *
 * Two things about this endpoint shape the code below:
 *
 *  1. `POST /auth/token` returns ONLY `{ token, expires_at }`. Unlike the
 *     patient endpoint it does not return the user, so the role — the thing the
 *     whole app routes on — has to be fetched with a second call to
 *     `GET /auth/me`.
 *
 *  2. Abilities are REQUIRED in the request and are validated against the
 *     user's role server-side (`AuthController::forbiddenAbilitiesForRole`).
 *     Ask for one ability the role is not allowed and the whole login fails 422.
 *     So we cannot request a fixed generous set: we ask for the clinical set
 *     first and fall back to the narrowest set, which is how a receptionist or
 *     pharmacist still gets far enough in to be told, by name, that this app is
 *     not for them. Roles the server allows nothing at all for (cashier,
 *     lab_tech, radiologist) cannot mint a token by design — that 422 is
 *     surfaced on the sign-in screen.
 */

type Envelope<T> = { data: T };

/** `users.role` — the full set seeded by DemoSeeder. */
export type StaffRole =
  | 'admin'
  | 'doctor'
  | 'nurse'
  | 'radiologist'
  | 'lab_tech'
  | 'pharmacist'
  | 'receptionist'
  | 'cashier'
  | (string & {});

export type StaffUser = {
  id: number;
  name: string;
  email: string;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
};

export type StaffTokenPayload = { token: string; expires_at: string };

/**
 * Roles that get the clinician app. Everyone else is staff, but not a user of
 * this product.
 *
 * `admin` is included because the seeded administrator is a clinician
 * (Dr. Jude Nshome) and the server grants admins every ability; excluding them
 * would lock the account that most needs to check the build.
 */
export const CLINICAL_ROLES: readonly StaffRole[] = ['doctor', 'nurse', 'admin'];

export function isClinicalRole(role: StaffRole | null | undefined): boolean {
  return !!role && CLINICAL_ROLES.includes(role);
}

/**
 * Ability ladder, widest first. The first rung a role is allowed wins.
 * Rung 1 is exactly the doctor/nurse read+write clinical set.
 */
const ABILITY_LADDER: string[][] = [
  ['patients:read', 'patients:write', 'encounters:read', 'encounters:write'],
  ['patients:read', 'encounters:read'],
  ['patients:read'],
];

export async function login(email: string, password: string, deviceName: string): Promise<StaffTokenPayload> {
  let lastError: unknown;
  for (const abilities of ABILITY_LADDER) {
    try {
      const res = await apiClient.post<Envelope<StaffTokenPayload>>('/auth/token', {
        email,
        password,
        device_name: deviceName,
        abilities,
      });
      return res.data.data;
    } catch (e) {
      lastError = e;
      // Only an abilities rejection is worth retrying with a narrower set. A
      // bad password (or a locked account) fails on `email` and must not be
      // retried — that would burn three of the five attempts before lockout.
      if (!isAbilityRejection(e)) throw e;
    }
  }
  throw lastError;
}

/**
 * True when the 422 was specifically "these abilities are not permitted for
 * your role" — i.e. the password was CORRECT and the role is the problem.
 */
export function isAbilityRejection(error: unknown): boolean {
  const violations = (error as any)?.response?.data?.errors?.violations;
  if (!Array.isArray(violations)) return false;
  return violations.some((v: { field?: string }) => v?.field === 'abilities');
}

export async function me(): Promise<StaffUser> {
  const res = await apiClient.get<Envelope<StaffUser>>('/auth/me');
  // Bind the offline cache to this clinician. `staff:` and `patient:` ids are
  // namespaced apart so a doctor signing in on a ward phone a patient used
  // cannot read that patient's cached record, and vice versa.
  await setCacheScope(`staff:${res.data.data.id}`);
  return res.data.data;
}

export async function logout(): Promise<void> {
  await apiClient.delete('/auth/token');
}
