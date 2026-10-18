/**
 * The clinician scanner — `POST /mobile/doctor/patients/scan`.
 *
 * The patient presents their Health ID QR (the card, or Presentation Mode);
 * the camera decodes the public verifier URL it carries and this posts that
 * text to the server, which answers with the SAME patient shape the exact
 * Health ID lookup returns, plus whether this facility already holds an
 * active consent grant. Nothing is decided on the phone: an expired,
 * withdrawn or foreign code is refused by the server with a precise
 * `error_code`, and this module only translates that into a kind the screen
 * can explain.
 *
 * Kept out of `doctorQueries.ts` (a contended foundation file); it imports
 * the prefix and the patient type from there so the shapes cannot drift.
 */
import { isAxiosError } from 'axios';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from './client';
import { DOCTOR_API_PREFIX, type PatientLookupResult } from './doctorQueries';

export const SCAN_ENDPOINT = `${DOCTOR_API_PREFIX}/patients/scan`;

export interface ScanOutcome {
  data: PatientLookupResult;
  /** This facility already holds an active consent grant for the patient. */
  consent_granted: boolean;
  verification: {
    /** The reference the scan was recorded under (also in the patient's access log). */
    reference: string;
    token_type: string;
    expires_at: string | null;
  };
}

export type ScanFailureKind = 'not_a_code' | 'expired' | 'revoked' | 'invalid' | 'offline' | 'unknown';

/** What a Health ID QR carries: the verifier URL, or the bare token. */
export function looksLikeHealthIdCode(text: string): boolean {
  const t = text.trim();
  return /\/verify\/qr\/qrx_[A-Za-z0-9]+_[A-Za-z0-9]+/.test(t) || /^qrx_[A-Za-z0-9]+_[A-Za-z0-9]+$/.test(t);
}

export async function scanHealthIdCode(code: string): Promise<ScanOutcome> {
  const res = await apiClient.post<ScanOutcome>(SCAN_ENDPOINT, { code: code.trim() });
  return res.data;
}

export function useScanPatient() {
  return useMutation({ mutationFn: scanHealthIdCode });
}

export function scanFailureKind(err: unknown): ScanFailureKind {
  if (isAxiosError(err)) {
    if (!err.response) return 'offline';
    const code = (err.response.data as { error_code?: string } | undefined)?.error_code;
    switch (code) {
      case 'not_a_health_id_code':
        return 'not_a_code';
      case 'qr_expired':
        return 'expired';
      case 'qr_revoked':
        return 'revoked';
      case 'qr_invalid':
        return 'invalid';
      default:
        return 'unknown';
    }
  }
  return 'unknown';
}
