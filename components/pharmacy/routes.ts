/**
 * The pharmacy desk's route vocabulary — one place that knows what a desk URL
 * looks like. Same rationale as `components/doctor/chartRoutes.ts`: typed
 * routes are off in this app, so a mistyped literal compiles and dead-ends.
 *
 * ── THE ROUTE MAP (authoritative — the files live at these paths) ──────────
 *
 *   desk          /clinician/pharmacy                       app/clinician/pharmacy/index.tsx
 *                   ?health_id=   prefills and runs "Dispense by Health ID"
 *   prescription  /clinician/pharmacy/prescription/[id]     app/clinician/pharmacy/prescription/[id].tsx
 *                   ?status=      the queue the row was listed in (incoming|preparing|ready|dispensed)
 *                   ?health_id=   OR the lookup it came from
 *   reservation   /clinician/pharmacy/reservation/[id]      app/clinician/pharmacy/reservation/[id].tsx
 *                   ?status=      the reservation list the row was listed in
 *   stock         /clinician/pharmacy/stock                 app/clinician/pharmacy/stock.tsx
 *                   ?low=1        opens on the low-stock filter
 *
 * The `?status=` / `?health_id=` hints exist because the contract has NO
 * single-item GET: a detail screen re-reads the list it was opened from
 * (`usePrescriptionFromCache`) and picks its row out of it.
 *
 * The clinician layout (`app/clinician/_layout.tsx`, another agent's file)
 * registers these as `href: null` routes and hands `?health_id=` from the
 * scanner to `desk`.
 */
import type { PrescriptionQueueStatus, ReservationStatus } from '@/lib/api/pharmacyDeskQueries';

const seg = (value: string) => encodeURIComponent(value);

export const pharmacyRoutes = {
  /** The desk: tiles, the two queues, "Dispense by Health ID". */
  desk: (healthId?: string) =>
    healthId ? `/clinician/pharmacy?health_id=${seg(healthId)}` : '/clinician/pharmacy',
  /** One prescription, derived from the queue or lookup it was listed in. */
  prescription: (id: string, from: { status?: PrescriptionQueueStatus; healthId?: string }) => {
    const base = `/clinician/pharmacy/prescription/${seg(id)}`;
    if (from.status) return `${base}?status=${from.status}`;
    if (from.healthId) return `${base}?health_id=${seg(from.healthId)}`;
    return base;
  },
  /** One reservation, derived from the list it was listed in. */
  reservation: (id: string, from: { status?: ReservationStatus }) =>
    from.status
      ? `/clinician/pharmacy/reservation/${seg(id)}?status=${from.status}`
      : `/clinician/pharmacy/reservation/${seg(id)}`,
  /** The shelf. */
  stock: (low?: boolean) => (low ? '/clinician/pharmacy/stock?low=1' : '/clinician/pharmacy/stock'),
} as const;
