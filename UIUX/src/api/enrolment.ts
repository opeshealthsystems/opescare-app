/**
 * P8.2 / P8.3 — open-access enrolment.
 *
 * The three endpoints that turn "you have an account but no clinical record"
 * from a dead end into a path: verify the phone we already hold, then create a
 * NEW record for a person the hospital has never seen.
 *
 * The 409 on self-registration is the delicate one. The server has found a
 * plausible existing record and deliberately tells us NOTHING about it — no
 * name, no medical id, no partial match. That silence is a safety property, so
 * this module carries no field for those details and the UI has nothing to
 * speculate with even if it wanted to.
 */
import { apiClient } from './client';

/** The account's phone has not been verified yet (403 on self-registration). */
export class PhoneNotVerifiedError extends Error {
  constructor() {
    super('Phone number is not verified yet.');
    this.name = 'PhoneNotVerifiedError';
  }
}

/**
 * Self-registration was refused because the record must be created — or found —
 * by a person at the reception desk (409).
 *
 * Deliberately carries no payload: the server sends none.
 */
export class ReceptionRequiredError extends Error {
  constructor() {
    super('This registration must be completed at reception.');
    this.name = 'ReceptionRequiredError';
  }
}

/** The code was wrong or has expired (422). */
export class VerificationCodeRejectedError extends Error {
  constructor(
    /** How many tries are left, when the server says. Never guessed. */
    public readonly attemptsRemaining: number | null
  ) {
    super('Verification code rejected.');
    this.name = 'VerificationCodeRejectedError';
  }
}

/** Too many requests or too many attempts (429). */
export class VerificationRateLimitedError extends Error {
  constructor(
    /** Seconds until another code may be requested, when the server says. */
    public readonly resendAfterSeconds: number | null
  ) {
    super('Too many verification attempts.');
    this.name = 'VerificationRateLimitedError';
  }
}

export type PhoneCodeRequested = {
  /** How long this code stays valid, in seconds. Null when not stated. */
  expiresInSeconds: number | null;
  /** How long before a new code may be asked for. Null when not stated. */
  resendAfterSeconds: number | null;
};

export type SelfRegisteredPatient = {
  medical_id: string;
  full_name?: string | null;
  sex?: string | null;
  date_of_birth?: string | null;
};

export type SelfRegisterInput = {
  full_name: string;
  sex: 'male' | 'female' | 'other';
  /** ISO `YYYY-MM-DD`. Optional in the contract. */
  date_of_birth?: string;
};

/**
 * Read a numeric hint out of whichever envelope slot the server used.
 *
 * `resend_after_seconds` rides in `data` on a 202 and in the problem body on a
 * 429, so the lookup is shallow-recursive over the places it can legitimately
 * appear. A value that is absent stays absent — it is never defaulted, because
 * a countdown the server did not give us is a countdown we invented.
 */
function pluckSeconds(body: unknown, key: string): number | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const direct = record[key];
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  for (const slot of ['data', 'errors', 'meta'] as const) {
    const nested = record[slot];
    if (nested && typeof nested === 'object') {
      const value = (nested as Record<string, unknown>)[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
  }
  return null;
}

/** POST /patient/verification/phone/request — 202, or 429 when rate limited. */
export async function requestPhoneCode(): Promise<PhoneCodeRequested> {
  try {
    const res = await apiClient.post('/patient/verification/phone/request', {});
    return {
      expiresInSeconds: pluckSeconds(res.data, 'expires_in_seconds'),
      resendAfterSeconds: pluckSeconds(res.data, 'resend_after_seconds'),
    };
  } catch (e: any) {
    if (e?.response?.status === 429) {
      throw new VerificationRateLimitedError(pluckSeconds(e.response?.data, 'resend_after_seconds'));
    }
    throw e;
  }
}

/** POST /patient/verification/phone/verify — 200 on success. */
export async function verifyPhoneCode(code: string): Promise<void> {
  try {
    await apiClient.post('/patient/verification/phone/verify', { code });
  } catch (e: any) {
    const status = e?.response?.status;
    if (status === 422) {
      throw new VerificationCodeRejectedError(pluckSeconds(e.response?.data, 'attempts_remaining'));
    }
    if (status === 429) {
      throw new VerificationRateLimitedError(pluckSeconds(e.response?.data, 'resend_after_seconds'));
    }
    throw e;
  }
}

/**
 * POST /patient/self-register — 201 and the account is linked to the record it
 * just created.
 *
 * 409 becomes `ReceptionRequiredError`, which is an ordinary next step, not a
 * failure: see `ReceptionRequiredScreen`.
 */
export async function selfRegister(input: SelfRegisterInput): Promise<SelfRegisteredPatient> {
  try {
    const res = await apiClient.post<{ data: { patient: SelfRegisteredPatient } }>(
      '/patient/self-register',
      input
    );
    return res.data.data.patient;
  } catch (e: any) {
    const status = e?.response?.status;
    if (status === 409) throw new ReceptionRequiredError();
    if (status === 403) throw new PhoneNotVerifiedError();
    throw e;
  }
}
