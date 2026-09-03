/**
 * Appointments board — both list scopes in one hook.
 *
 * Lives outside `lib/api/queries.ts` per the file-ownership rules. The screen
 * (`app/appointments/index.tsx`) renders an Upcoming/Past segmented control and
 * needs BOTH counts visible at once, plus an instant switch between segments.
 * Fetching each scope lazily made the count badges impossible and put a spinner
 * on every tab press, so both are fetched together here.
 *
 * The query keys are deliberately IDENTICAL to `useAppointmentsList(scope, limit)`
 * in `queries.ts` (`['appointments', 'list', scope, limit]`) so the two hooks
 * share one cache entry and the existing `invalidateQueries({ queryKey:
 * ['appointments'] })` in `useCancelAppointment` / `useBookAppointment` refreshes
 * this board for free.
 *
 * Backend: GET /mobile/appointments?scope=upcoming|past|all&limit=N
 * (MobileAppointmentController::index). `pagination.total` is the authoritative
 * count — `data.length` is only the current page.
 */
import { useQueries } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import type { Appointment, PaginatedAppointments } from './types';

/** The two segments the list screen exposes. Mirrors the API's `scope` param. */
export type AppointmentBoardScope = 'upcoming' | 'past';

export const APPOINTMENT_BOARD_SCOPES: readonly AppointmentBoardScope[] = ['upcoming', 'past'];

export interface AppointmentBoardSegment {
  items: Appointment[];
  /** Server-side total for this scope — drives the segment count badge. */
  total: number;
  isLoading: boolean;
  isError: boolean;
}

export interface AppointmentBoard {
  upcoming: AppointmentBoardSegment;
  past: AppointmentBoardSegment;
  /** True only on the very first load, when neither scope has any data yet. */
  isLoading: boolean;
  /** True when BOTH scopes failed — a partial failure still renders the good half. */
  isError: boolean;
  /** True during a background refetch (pull-to-refresh), not the initial load. */
  isFetching: boolean;
  refetch: () => void;
}

async function fetchScope(scope: AppointmentBoardScope, limit: number) {
  const response = await apiClient.get<PaginatedAppointments>(endpoints.appointments, {
    params: { scope, limit },
  });
  return response.data;
}

/**
 * Fetch the patient's upcoming and past appointments together.
 *
 * @param limit page size per scope (server caps at 100).
 */
export function useAppointmentBoard(limit = 50): AppointmentBoard {
  const results = useQueries({
    queries: APPOINTMENT_BOARD_SCOPES.map((scope) => ({
      queryKey: ['appointments', 'list', scope, limit] as const,
      queryFn: () => fetchScope(scope, limit),
    })),
  });

  const [upcomingResult, pastResult] = results;

  const toSegment = (result: (typeof results)[number]): AppointmentBoardSegment => ({
    items: result.data?.data ?? [],
    total: result.data?.pagination?.total ?? result.data?.data?.length ?? 0,
    isLoading: result.isLoading,
    isError: result.isError,
  });

  return {
    upcoming: toSegment(upcomingResult),
    past: toSegment(pastResult),
    isLoading: results.every((r) => r.isLoading),
    isError: results.every((r) => r.isError),
    isFetching: results.some((r) => r.isFetching) && !results.every((r) => r.isLoading),
    refetch: () => {
      results.forEach((r) => {
        void r.refetch();
      });
    },
  };
}
