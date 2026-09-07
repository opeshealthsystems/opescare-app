import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import type { BloodRequest, BloodUrgencyValue } from './queries';

/**
 * One blood request: reading it (PM-BLOOD-05) and amending it (PM-BLOOD-06).
 *
 * The list hook `useBloodRequests` already existed; these two are new because
 * the tracking and modify screens act on a SINGLE request and need to tell
 * "this one is gone" from "this one was never yours" — both of which the API
 * answers 404, deliberately.
 */

export function useBloodRequest(id: string | null) {
  return useQuery({
    queryKey: ['blood', 'requests', 'detail', id],
    enabled: !!id,
    queryFn: async () =>
      (await apiClient.get<{ data: BloodRequest }>(`${endpoints.bloodRequests}/${id}`)).data.data,
    /*
     * A reservation is time-boxed and its status is written by the blood bank,
     * not by this app, so the tracking screen must not sit on a stale answer.
     * A minute is often enough to matter and cheap enough to afford.
     */
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * The fields an amendment may carry.
 *
 * Deliberately absent: blood_group, component_type, care_facility_id. Those
 * three are what the facility checked against stock when it took the hold, so
 * changing them is a different request, not an edit — the API refuses them and
 * this type refuses to offer them.
 */
export interface AmendBloodRequestInput {
  id: string;
  quantity?: number;
  urgency?: BloodUrgencyValue;
  contact_phone?: string | null;
  note?: string | null;
  needed_by?: string | null;
}

export function useAmendBloodRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...body }: AmendBloodRequestInput) =>
      (await apiClient.patch<{ data: BloodRequest }>(`${endpoints.bloodRequests}/${id}`, body)).data
        .data,
    onSuccess: (updated) => {
      queryClient.setQueryData(['blood', 'requests', 'detail', updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['blood', 'requests'] });
    },
  });
}
