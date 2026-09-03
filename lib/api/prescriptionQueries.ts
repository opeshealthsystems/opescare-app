import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import type { Medicine, PaginatedPrescriptions } from './queries';

/**
 * Prescription-screen hooks.
 *
 * Kept out of `queries.ts` (owned elsewhere) per the screen-parity brief. Both
 * hooks hit endpoints that already exist and are verified live — nothing here
 * invents an API.
 *
 * Note on what is deliberately absent: there is **no refill/renewal hook**.
 * `GET /mobile/prescriptions` and `GET /mobile/prescriptions/{id}` are the only
 * two prescription routes on the mobile API (routes/api.php:269-270) — both
 * read-only. A refill action does exist, but only as a session-authenticated
 * web-portal route (`POST /portals/patient/prescriptions/{id}/refill`), which a
 * bearer-token mobile client cannot call. So the screens surface no refill
 * button rather than one that goes nowhere.
 */

export interface ActivePrescriptionSummary {
  /** Open prescriptions — the paginator total, not just this page. */
  prescriptionCount: number;
  /** Medications those prescriptions cover, summed across the loaded page. */
  medicationCount: number;
}

/**
 * The two numbers worth showing above the list: how many prescriptions are
 * still active, and how many medications they add up to.
 *
 * Runs its own `status=active` request rather than counting the rows currently
 * on screen, so the figure stays correct while the user pages through the
 * Expired or Cancelled filters.
 */
export function useActivePrescriptionSummary() {
  return useQuery<ActivePrescriptionSummary>({
    queryKey: ['prescriptions', 'summary', 'active'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedPrescriptions>(endpoints.prescriptions, {
        params: { status: 'active', limit: 100 },
      });
      const rows = data.data ?? [];
      return {
        prescriptionCount: data.pagination?.total ?? rows.length,
        medicationCount: rows.reduce((total, row) => total + (row.item_count ?? 0), 0),
      };
    },
  });
}

/**
 * Trims a prescribed drug string down to something the medicine catalog can
 * match on.
 *
 * A prescription item carries only free text — "Amoxicillin 500mg Capsule" —
 * while `Medicine::scopeMatchingTerm` substring-matches name / generic_name /
 * brand_name. Feeding it the strength and form narrows the query to nothing, so
 * everything from the first digit or bracket onward is dropped, leaving the
 * ingredient. Falls back to the raw string when that leaves too little to search.
 */
export function catalogSearchTerm(drugName: string): string {
  const head = drugName.split(/[\d(,/]/)[0]?.trim() ?? '';
  const term = head.length >= 3 ? head : drugName.trim();
  return term.slice(0, 60);
}

/**
 * Resolves a prescribed drug name to a row in the medicine catalog so the
 * detail screen can deep-link into the Medicine Finder
 * (`/pharmacy/[medicineId]`, which needs a real catalog id) and show a genuine
 * price/availability hint.
 *
 * Returns `null` — not an error — when the catalog has no match; the screen
 * then falls back to the Medicine Finder's own search.
 */
export function useCatalogMedicineMatch(drugName: string | null | undefined) {
  const term = drugName ? catalogSearchTerm(drugName) : '';

  return useQuery<Medicine | null>({
    queryKey: ['pharmacy', 'medicines', 'match', term],
    enabled: term.length >= 3,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Medicine[] }>(endpoints.medicineSearch, {
        params: { q: term, per_page: 5 },
      });
      const rows = data.data ?? [];
      if (rows.length === 0) return null;

      // "Paracetamol" matches both the 500mg tablet and the children's syrup.
      // Prefer whichever catalog row the prescribed text actually names, then
      // whichever shares its strength, before settling for the first hit.
      const needle = (drugName ?? '').toLowerCase();
      const flattened = needle.replace(/\s+/g, '');

      const byName = rows.find((row) => needle.includes(row.name.toLowerCase()));
      if (byName) return byName;

      const byStrength = rows.find(
        (row) => row.strength && flattened.includes(row.strength.toLowerCase().replace(/\s+/g, '')),
      );

      return byStrength ?? rows[0];
    },
  });
}
