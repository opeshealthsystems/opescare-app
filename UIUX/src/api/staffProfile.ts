import { apiClient } from './client';

/**
 * The clinician's own PROVIDER PROFILE — the professional identity a doctor
 * presents (photo, title, specialty, qualifications) as distinct from the bare
 * `users` account row that `staffAuth.me()` returns.
 *
 * Why this lives in its own client rather than being folded into `staffAuth`:
 *
 *  • `/auth/me` now carries a `provider_profile` object, but `staffAuth.ts`
 *    belongs to the authentication cluster and its `StaffUser` type is the
 *    account row, not the profile. The profile has its own read/write surface —
 *    `GET/PUT /staff/profile` and `POST /staff/profile/photo` — so the type and
 *    the calls that mutate it belong together here, next to the one screen that
 *    edits them.
 *
 *  • Reading the profile from its own endpoint (rather than from the
 *    `provider_profile` field on `/auth/me`) keeps the screen honest about
 *    freshness: an edit saved through `PUT /staff/profile` is reflected by the
 *    next `getProfile()`, without depending on when the session's cached
 *    `/auth/me` was last refreshed.
 *
 * The envelope is the app-wide `{ data: T }` shape every clinical endpoint uses.
 */

type Envelope<T> = { data: T };

/**
 * Registration standing, shown as a read-only badge. The clinician cannot edit
 * it — it is asserted by the hospital's credentialing, never self-declared —
 * so it is deliberately NOT part of {@link ProviderProfileEdit}.
 */
export type ProviderLicenseStatus =
  | 'active'
  | 'expired'
  | 'pending'
  | 'suspended'
  | (string & {});

/**
 * The provider profile as the server sends it. Every self-authored field is
 * nullable because a freshly-seeded clinician has none of them set yet; the two
 * list fields always arrive as arrays (possibly empty), never null.
 */
export type ProviderProfile = {
  display_name: string | null;
  title: string | null;
  specialty: string | null;
  subspecialty: string | null;
  bio: string | null;
  photo_url: string | null;
  years_experience: number | null;
  languages: string[];
  qualifications: string[];
  room: string | null;
  /** Read-only. Set by the hospital's credentialing, never editable here. */
  consultation_fee: number | null;
  /** Read-only. */
  currency: string | null;
  /** Read-only. */
  license_status: ProviderLicenseStatus | null;
};

/**
 * The subset a clinician may change about themselves. `PUT /staff/profile`
 * accepts exactly these keys; `consultation_fee`, `currency`, `license_status`
 * and the photo are governed elsewhere and are rejected if sent here.
 */
export type ProviderProfileEdit = {
  title: string | null;
  specialty: string | null;
  subspecialty: string | null;
  bio: string | null;
  years_experience: number | null;
  languages: string[];
  qualifications: string[];
  room: string | null;
};

/**
 * The clinician's own profile, or `null` when none has been created yet.
 *
 * A null body is a real, expected state — a clinician who has never had a
 * profile set up — and is distinct from a failure to load, which throws. The
 * screen renders the two differently: a null profile invites the clinician to
 * add their details; a thrown error is surfaced as "could not load".
 */
export async function getProfile(): Promise<ProviderProfile | null> {
  const res = await apiClient.get<Envelope<ProviderProfile | null>>('/staff/profile');
  return res.data.data ?? null;
}

/**
 * Save the self-editable subset. Returns the profile as the server recorded it,
 * which the screen shows in place of what was typed — so what the clinician
 * sees after saving is the stored truth, not their unsent draft.
 */
export async function updateProfile(patch: ProviderProfileEdit): Promise<ProviderProfile> {
  const res = await apiClient.put<Envelope<ProviderProfile>>('/staff/profile', patch);
  return res.data.data;
}

/**
 * Replace the clinician's photo. Multipart, field name `photo`, exactly as the
 * endpoint expects. The browser (and react-native-web) sets the multipart
 * boundary itself once a `FormData` with a file is handed to axios, so no
 * Content-Type is set by hand — doing so would omit the boundary and the upload
 * would be unparseable server-side.
 *
 * `filename` is passed through so the server sees a real name and extension.
 */
export async function uploadPhoto(photo: Blob, filename: string): Promise<{ photo_url: string }> {
  const form = new FormData();
  form.append('photo', photo, filename);
  const res = await apiClient.post<Envelope<{ photo_url: string }>>('/staff/profile/photo', form);
  return res.data.data;
}
