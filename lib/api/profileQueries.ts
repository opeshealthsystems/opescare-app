import { useMutation } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import { useAuthStore } from '../store/auth';
import type { EmergencyContact, Patient } from './types';

/**
 * Profile-screen API hooks (app/(tabs)/profile.tsx, app/edit-profile.tsx).
 *
 * Kept out of lib/api/queries.ts on purpose — that file is shared by every
 * screen agent and is off-limits to additive edits from here.
 */

/**
 * PATCH /mobile/me payload.
 *
 * Deliberately wider than `UpdateProfileInput` in lib/api/queries.ts on one
 * field: `emergency_contact` accepts `null`. MobilePatientController::updateMe
 * validates it as `sometimes|nullable|array` with `required_with` on the three
 * sub-keys, so an explicit `null` is the only way for a patient to *remove* a
 * stored emergency contact — omitting the key leaves the old one in place.
 * Without that, blanking the three inputs in the form looked like it deleted
 * the contact while the record silently kept it.
 *
 * `dob`, `phone` and `email` are intentionally absent: the endpoint does not
 * accept them (they are pinned to the Health ID), which is why edit-profile.tsx
 * renders them as locked, read-only rows.
 */
export interface UpdateMyProfileInput {
  first_name?: string;
  last_name?: string;
  blood_group?: string | null;
  sex?: 'male' | 'female' | null;
  address?: string | null;
  emergency_contact?: EmergencyContact | null;
}

/** PATCH /mobile/me. The response carries the full updated patient, so the
 * auth store is written straight from it rather than re-fetching /mobile/me. */
export function useUpdateMyProfile() {
  return useMutation({
    mutationFn: async (input: UpdateMyProfileInput) =>
      (await apiClient.patch<Patient>(endpoints.me, input)).data,
    onSuccess: (patient) => {
      useAuthStore.setState({ patient });
    },
  });
}
