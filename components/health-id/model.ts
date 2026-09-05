/**
 * What the credential renders, whichever store it came from, plus the small
 * pure helpers the card and the presentation sheet share.
 *
 * The live card (GET /mobile/health-id-card) carries the QR payload and the
 * identity status; the on-device emergency copy carries neither (it has no
 * `qr_payload`, and we never synthesise one), so the QR column shows a
 * "reconnect" placeholder instead of a code.
 */
import type { StatusTone } from '@/components/opes-ui';
import type { HealthIdCard } from '@/lib/api/types';
import type { OfflineEmergencyProfile } from '@/lib/offline';

export type CredentialModel = {
  healthId: string | null;
  name: string | null;
  dob: string | null;
  sex: string | null;
  bloodType: string | null;
  qrPayload: string | null;
  statusKey: string | null;
  /** Signed link to the holder's own photo; null → initials avatar. */
  photoUrl: string | null;
  /** Set only for the on-device copy: when it was captured. */
  capturedAt: string | null;
};

/** Backend `Patient::identity_status` groupings (see app/Enums/IdentityStatus.php) —
 * mirrored here only for badge tone, never compared with `===` on the backend side. */
export const ACTIVE_STATUSES = new Set(['active', 'verified', 'verified_by_facility']);
export const VERIFIED_STATUSES = new Set(['verified', 'verified_by_facility']);
export const BLOCKED_STATUSES = new Set(['suspended', 'deceased', 'entered_in_error', 'merged', 'erasure_pending']);

export function toneFor(statusKey: string): StatusTone {
  if (ACTIVE_STATUSES.has(statusKey)) return 'normal';
  if (BLOCKED_STATUSES.has(statusKey)) return 'critical';
  return 'warning';
}

export function titleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/** Whole years between `dob` and today — shown beside the date of birth the way a
 * clinician reads an ID card ("14 Apr 1992 · 34 yrs"). */
export function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const monthDelta = now.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) years -= 1;
  return years >= 0 && years < 150 ? years : null;
}

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(clamped % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** Treats an empty/whitespace API string as "not recorded" — the demo patient has
 * no blood group, and a blank slot on a credential reads as broken, not empty. */
export function presentOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function modelFromLive(card: HealthIdCard): CredentialModel {
  return {
    healthId: card.health_id,
    name: card.display_name,
    dob: card.dob,
    sex: card.sex,
    bloodType: presentOrNull(card.blood_type),
    qrPayload: card.qr_payload,
    statusKey: (card.status ?? '').toLowerCase() || null,
    photoUrl: card.photo_url ?? null,
    capturedAt: null,
  };
}

export function modelFromCache(profile: OfflineEmergencyProfile): CredentialModel {
  return {
    healthId: profile.health_id,
    name: profile.display_name,
    dob: profile.dob,
    sex: profile.sex,
    bloodType: presentOrNull(profile.blood_group),
    qrPayload: null,
    statusKey: null,
    // The on-device copy never stores the photo link: it expires, and the
    // copy exists for the radio-off case where it could not be fetched anyway.
    photoUrl: null,
    capturedAt: profile.captured_at,
  };
}
