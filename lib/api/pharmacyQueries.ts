import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import type { Medicine, MedicineCategoryValue } from './queries';

/**
 * Medicine Finder — the catalog half of the pharmacy feature.
 *
 * `lib/api/queries.ts` already owns the pharmacy *types*, the nearby-pharmacy
 * query, and the reservation list/create/cancel hooks; this file is additive
 * only (queries.ts is owned by another agent and must not be edited). It adds
 * the two things the catalog screen needs and queries.ts does not expose:
 *
 *  1. the `prescription_required` filter that
 *     MobilePharmacyController::searchMedicines() validates but nothing sent,
 *  2. the `pagination` block that the same endpoint returns and the old hook
 *     threw away — the screen shows a real total, not `results.length`.
 *
 * Param naming is endpoint-specific and easy to get wrong:
 *   GET /mobile/pharmacy/medicines  → q, category, prescription_required, per_page
 *                                     (verified against the controller: it takes
 *                                     NO coordinates — it is a catalog search,
 *                                     availability is summarised nationally)
 *   GET /mobile/pharmacy/nearby     → lat, lng, radius_km, medicine_id, only_stocking
 */

export interface MedicineCatalogPage {
  items: Medicine[];
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
}

interface MedicineCatalogResponse {
  data: Medicine[];
  pagination?: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  };
}

export interface MedicineCatalogParams {
  /** Free-text term — matched against name, generic name and brand name. */
  q?: string;
  category?: MedicineCategoryValue | null;
  /**
   * `true`  → prescription-only medicines,
   * `false` → over-the-counter medicines,
   * `null`  → no filter (the param is omitted entirely).
   */
  prescriptionRequired?: boolean | null;
  perPage?: number;
}

export function useMedicineCatalog(params: MedicineCatalogParams) {
  const q = params.q?.trim() ?? '';
  const category = params.category ?? null;
  const prescriptionRequired = params.prescriptionRequired ?? null;
  const perPage = params.perPage ?? 25;

  return useQuery({
    queryKey: ['pharmacy', 'catalog', q, category, prescriptionRequired, perPage],
    queryFn: async (): Promise<MedicineCatalogPage> => {
      const response = await apiClient.get<MedicineCatalogResponse>(endpoints.medicineSearch, {
        params: {
          ...(q ? { q } : {}),
          ...(category ? { category } : {}),
          // Laravel's `nullable|boolean` accepts 1/0; sending nothing means
          // "both kinds", which is not the same as sending 0.
          ...(prescriptionRequired === null ? {} : { prescription_required: prescriptionRequired ? 1 : 0 }),
          per_page: perPage,
        },
      });

      const items = response.data.data ?? [];
      const pagination = response.data.pagination;

      return {
        items,
        total: pagination?.total ?? items.length,
        perPage: pagination?.per_page ?? perPage,
        currentPage: pagination?.current_page ?? 1,
        lastPage: pagination?.last_page ?? 1,
      };
    },
    // The catalog is reference data — 27 rows that change when a pharmacy syncs
    // stock, not per-request. Keep it warm so category taps feel instant.
    staleTime: 60 * 1000,
  });
}

/**
 * The `error_code` values MobilePharmacyController + MedicineReservationService
 * can return on reserve/cancel. Each one has a matching
 * `pharmacy.reserveError.<CODE>` string in en.json / fr.json.
 */
export const RESERVE_ERROR_CODES = [
  'PRESCRIPTION_REQUIRED',
  'PRESCRIPTION_NOT_FOUND',
  'STOCK_NOT_RESERVABLE',
  'RESERVATION_ALREADY_OPEN',
  'TOO_MANY_OPEN_RESERVATIONS',
  'RESERVATION_NOT_CANCELLABLE',
  'RESERVATION_NOT_FOUND',
  'MEDICINE_NOT_FOUND',
  'PHARMACY_NOT_FOUND',
] as const;

export type ReserveErrorCode = (typeof RESERVE_ERROR_CODES)[number];

/**
 * Pulls the backend's `error_code` out of an axios failure.
 *
 * `PRESCRIPTION_REQUIRED` (422) in particular is *correct business logic*, not
 * a fault: the screen must explain it, so the code has to survive the trip out
 * of the mutation instead of collapsing into a generic failure.
 */
export function reserveErrorCode(error: unknown): ReserveErrorCode | 'generic' {
  const code = (error as { response?: { data?: { error_code?: string } } })?.response?.data
    ?.error_code;

  return RESERVE_ERROR_CODES.includes(code as ReserveErrorCode)
    ? (code as ReserveErrorCode)
    : 'generic';
}

/** XAF is quoted in whole francs, grouped with thin spaces — "12 500 FCFA". */
export function formatXaf(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const grouped = String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} FCFA`;
}

/** Bare grouped number, for the left half of a "200 – 500 FCFA" range. */
export function formatXafBare(value: number | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
