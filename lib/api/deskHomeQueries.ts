/**
 * The desk "home" counts — the pharmacy counter, the laboratory bench and
 * the front desk — as the clinician Today screen draws them for a role that
 * is not a clinician.
 *
 * Three tiny read-only queries, deliberately kept OUT of the desks' own query
 * files: those files are being written by other agents in parallel and may
 * not exist when this one is compiled. Nothing here is imported by a desk,
 * and nothing here imports a desk. The wire shapes come from the programme
 * plan's contracts (`role-dashboards-plan.md`):
 *
 *   GET /mobile/pharmacy-desk/home   capability:dispense
 *   GET /mobile/lab/home        capability:lab_results
 *   GET /mobile/desk/home       capability:front_desk
 *
 * Every figure is COUNTED BY THE SERVER for the token's facility; nothing is
 * derived on the phone. Each hook is `enabled` only for a role that holds the
 * capability the route is gated on — a role without it would only collect a
 * 403 `role_forbidden` — and `doctorRetry` never retries a final answer, so a
 * server that does not serve the desk yet (a bodyless 404) is asked exactly
 * once and the screen degrades to a plain "Open the desk" row.
 */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { doctorRetry, isDoctorFeatureUnserved, type Envelope } from './doctorQueries';

// ── Endpoints ─────────────────────────────────────────────────────────────

export const deskHomeEndpoints = {
  pharmacy: '/mobile/pharmacy-desk/home',
  lab: '/mobile/lab/home',
  desk: '/mobile/desk/home',
} as const;

// ── Wire shapes ───────────────────────────────────────────────────────────

/** The facility the token is posted at, as each desk names it. */
export interface DeskFacility {
  id: string;
  name: string;
}

export interface PharmacyHome {
  facility: DeskFacility | null;
  counts: {
    /** Prescriptions routed to this pharmacy and not yet accepted. */
    incoming: number;
    /** Accepted, being prepared. */
    preparing: number;
    /** Prepared, waiting for the patient. */
    ready: number;
    /** Medicine reservations awaiting acceptance. */
    reservations_pending: number;
    /** Deliveries accepted and not yet delivered. */
    deliveries_open: number;
    /** Stock lines at or under their reorder level. */
    low_stock: number;
  };
}

export interface LabHome {
  facility: DeskFacility | null;
  counts: {
    awaiting_collection: number;
    awaiting_results: number;
    in_progress: number;
    resulted_today: number;
    urgent: number;
    /** Patient test requests submitted to this laboratory, awaiting a decision. */
    requests_pending: number;
  };
}

export interface DeskHome {
  facility: DeskFacility | null;
  counts: {
    today_total: number;
    awaiting_confirmation: number;
    checked_in: number;
    no_show: number;
    cancelled: number;
  };
}

// ── Keys ──────────────────────────────────────────────────────────────────

export const deskHomeKeys = {
  all: ['desk-home'] as const,
  pharmacy: ['desk-home', 'pharmacy'] as const,
  lab: ['desk-home', 'lab'] as const,
  desk: ['desk-home', 'desk'] as const,
};

type QueryOpts = { enabled?: boolean };

async function getData<T>(path: string): Promise<T> {
  const res = await apiClient.get<Envelope<T>>(path);
  return res.data.data;
}

// ── Hooks ─────────────────────────────────────────────────────────────────

/** `GET /mobile/pharmacy-desk/home` — only for a role holding `dispense`. */
export function usePharmacyHome(opts: QueryOpts = {}) {
  return useQuery({
    queryKey: deskHomeKeys.pharmacy,
    queryFn: () => getData<PharmacyHome>(deskHomeEndpoints.pharmacy),
    retry: doctorRetry,
    staleTime: 30 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/** `GET /mobile/lab/home` — only for a role holding `lab_results`. */
export function useLabHome(opts: QueryOpts = {}) {
  return useQuery({
    queryKey: deskHomeKeys.lab,
    queryFn: () => getData<LabHome>(deskHomeEndpoints.lab),
    retry: doctorRetry,
    staleTime: 30 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/** `GET /mobile/desk/home` — only for a role holding `front_desk`. */
export function useDeskHome(opts: QueryOpts = {}) {
  return useQuery({
    queryKey: deskHomeKeys.desk,
    queryFn: () => getData<DeskHome>(deskHomeEndpoints.desk),
    retry: doctorRetry,
    staleTime: 30 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/**
 * True when the desk's home route is not served by this host (a bodyless 404
 * or a 501) — the one case where the Today screen shows the desk as a plain
 * link with no figures, rather than a failure. The same predicate the doctor
 * screens use, so "not served" means the same thing on every tile.
 */
export function isDeskHomeUnserved(error: unknown): boolean {
  return isDoctorFeatureUnserved(error);
}
