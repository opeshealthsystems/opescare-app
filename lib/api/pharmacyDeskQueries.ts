/**
 * Pharmacy DESK data layer — the PHARMACIST'S half of `/mobile/pharmacy-desk`.
 *
 * Coded against the "Pharmacy desk" contract in the role-dashboards plan
 * (2026-09-06), which a backend agent is implementing at the same time:
 *
 *   prefix /api/mobile/pharmacy-desk · `auth.provider` + `capability:dispense`
 *   (the two stock routes: `capability:pharmacy_stock`)
 *
 *   GET  /home                                   → { data: { facility, counts } }
 *   GET  /prescriptions?status=incoming|preparing|ready|dispensed
 *   GET  /prescriptions/lookup?health_id=        (EXACT Health ID, never a prefix)
 *   POST /prescriptions/{id}/accept | /ready | /dispense { items:[{id, quantity_dispensed?}], notes? }
 *   GET  /reservations?status=pending|accepted|ready|collected|dispatched|delivered|cancelled
 *   POST /reservations/{id}/accept | /ready | /collected | /dispatch | /delivered | /cancel { reason }
 *   GET  /stock?q=&low=1
 *   POST /stock/{id}/adjust { delta, reason }
 *
 * Paths live in `endpoints.pharmacyDesk` (lib/api/endpoints.ts). This file adds
 * the wire types, the query keys, the hooks and the failure predicates the
 * four desk screens share.
 *
 * ── THERE IS NO SINGLE-ITEM GET ───────────────────────────────────────────
 * The contract has none, so a detail screen is derived from the QUEUE (or the
 * lookup) that listed the row: `usePrescriptionFromCache` /
 * `useReservationFromCache` read the list the screen was opened from — same
 * key, same cache — and fall back to scanning every cached desk list. After a
 * write, the server's returned row is written back into every cached list
 * that holds it, so what is on screen is the server's answer, never a guess.
 *
 * ── FAILURE CODES ON THIS SURFACE ─────────────────────────────────────────
 *   401  provider token missing/expired → sign in again (describeFailure says so)
 *   403  `role_forbidden` → the ACCOUNT'S ROLE lacks the desk (isRoleForbidden)
 *   404 / 405 / 501 → the desk is not served on this host yet, OR (404 only)
 *        a row is gone. Indistinguishable on Laravel from the status alone —
 *        a missing route answers `{"message":"Not Found"}` too — so
 *        `isPharmacyDeskNotServed` is deliberately status-only and the copy
 *        that uses it says "not available here YET or no longer here".
 *   409  `invalid_transition` — the row moved on since it was listed. Re-read.
 *   422  refused on its merits (bad quantity, empty items). Show the message.
 *
 * Nothing here ever fabricates a row: a failed read is an error state, never
 * an empty list; a 200 without the expected shape is a failure too.
 */
import axios from 'axios';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { endpoints } from './endpoints';
import { isRoleForbidden } from './roleErrors';
// Import ONLY — the Health-ID hygiene rules are the doctor layer's and are
// reused verbatim so the desk never sends a prefix or a name.
import { isPlausibleHealthId, normaliseHealthId } from './doctorQueries';

export { isRoleForbidden } from './roleErrors';
export { isPlausibleHealthId, normaliseHealthId, HEALTH_ID_MIN_LENGTH } from './doctorQueries';

const desk = endpoints.pharmacyDesk;

// ═══════════════════════════════════════════════════════════════════════════
// Wire shapes — one interface per contract shape
// ═══════════════════════════════════════════════════════════════════════════

/** Laravel `decimal:` casts arrive as strings; quantities may too. Never trust `number`. */
export type Numberish = number | string | null | undefined;

/** Wire value → finite number, or null. Never NaN. */
export function toNum(value: Numberish): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** `GET /home`. Every figure is counted by the server for THIS facility. */
export interface PharmacyHome {
  facility: { id: string; name: string | null };
  counts: {
    incoming: number;
    preparing: number;
    ready: number;
    reservations_pending: number;
    deliveries_open: number;
    low_stock: number;
  };
}

/** The four queues of the prescription desk, in flow order. */
export const PRESCRIPTION_QUEUES = ['incoming', 'preparing', 'ready', 'dispensed'] as const;
export type PrescriptionQueueStatus = (typeof PRESCRIPTION_QUEUES)[number];

export interface DeskPatient {
  id?: string;
  health_id: string;
  /** Short display name (the server shortens it — never the full record name). */
  display_name: string | null;
}

export interface DeskPrescriptionItem {
  id: string;
  drug_name: string;
  dose: string | null;
  frequency: string | null;
  duration_days: Numberish;
  quantity: Numberish;
  status: string | null;
}

export interface DeskPrescription {
  id: string;
  reference: string | null;
  /** The prescription's own status (`active`, `dispensed`, …). */
  status: string | null;
  /** Where it sits at THIS pharmacy: the queue vocabulary, or the routing table's own word. */
  pharmacy_routing_status: string | null;
  prescribed_at: string | null;
  expires_at: string | null;
  prescriber_name: string | null;
  patient: DeskPatient;
  items: DeskPrescriptionItem[];
}

/** `POST /prescriptions/{id}/dispense` body. Items omitted are NOT dispensed. */
export interface DispenseBody {
  items: { id: string; quantity_dispensed?: number }[];
  notes?: string;
}

export const RESERVATION_STATUSES = [
  'pending',
  'accepted',
  'ready',
  'collected',
  'dispatched',
  'delivered',
  'cancelled',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export type FulfilmentMode = 'pickup' | 'delivery';

export interface DeskMedicine {
  id: string;
  name: string;
  strength: string | null;
  form: string | null;
}

export interface DeskReservation {
  id: string;
  reference: string | null;
  status: ReservationStatus | (string & {});
  fulfilment_mode: FulfilmentMode | (string & {}) | null;
  delivery_address: string | null;
  delivery_phone: string | null;
  delivery_status: string | null;
  quantity: Numberish;
  total_price: Numberish;
  currency: string | null;
  expires_at: string | null;
  created_at: string | null;
  medicine: DeskMedicine;
  patient: DeskPatient;
}

/** The six reservation transitions the contract names, as URL segments. */
export const RESERVATION_ACTIONS = ['accept', 'ready', 'collected', 'dispatch', 'delivered', 'cancel'] as const;
export type ReservationAction = (typeof RESERVATION_ACTIONS)[number];

export interface StockItem {
  id: string;
  medicine_id: string;
  name: string;
  strength: string | null;
  form: string | null;
  quantity: Numberish;
  reorder_level: Numberish;
  unit_price: Numberish;
  currency: string | null;
  updated_at: string | null;
}

export interface AdjustStockBody {
  delta: number;
  reason: string;
}

/** The `{ data }` envelope every desk route answers with. */
interface Envelope<T> {
  data: T;
}

// ═══════════════════════════════════════════════════════════════════════════
// Failure classification
// ═══════════════════════════════════════════════════════════════════════════

/**
 * True when the desk route did not land: 404, 405 or 501. Status-only on
 * purpose — see the module note. The copy that uses this says "not available
 * here yet, or no longer here", never one of the two alone.
 */
export function isPharmacyDeskNotServed(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 404 || status === 405 || status === 501;
}

/** The wire spelling of the state-conflict code. */
export const INVALID_TRANSITION_CODE = 'invalid_transition';

/**
 * True when the server refused a write because the row has already moved on
 * (409). The body's `error_code` is honoured when present, but a bare 409 on
 * a transition route means the same thing and is treated the same way.
 */
export function isInvalidTransition(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return error.response?.status === 409;
}

/** A 422: the write was refused on its merits. The first field message is written for people. */
export function isValidationRefusal(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 422;
}

/** The server's own sentence when it sent one — never a stack, never a library string. */
export function deskServerMessage(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const body = error.response?.data as
    | { message?: unknown; errors?: Record<string, unknown> }
    | undefined;
  if (body?.errors && typeof body.errors === 'object') {
    const first = Object.values(body.errors)[0];
    if (Array.isArray(first) && typeof first[0] === 'string' && first[0]) return first[0];
  }
  return typeof body?.message === 'string' && body.message.trim() !== '' ? body.message : null;
}

/** True when a retry cannot change the answer. */
export function isDeskRequestFinal(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 405 ||
    status === 409 ||
    status === 422 ||
    status === 501
  );
}

/** One retry, none once the answer is final. */
export const deskRetry = (failureCount: number, error: unknown): boolean =>
  !isDeskRequestFinal(error) && failureCount < 1;

/**
 * True when a WRITE's outcome is genuinely unknown — no answer at all, or a
 * 5xx after the request left the phone. The screen must then say "check
 * before doing it again", never "failed".
 */
export function isOutcomeUnknown(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return true;
  const status = error.response?.status;
  return status === undefined || status >= 500;
}

// ═══════════════════════════════════════════════════════════════════════════
// Transport
// ═══════════════════════════════════════════════════════════════════════════

function assertArray<T>(value: unknown, where: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${where}: the server did not answer with a list.`);
  }
  return value as T[];
}

function assertObject<T>(value: unknown, where: string): T {
  if (!value || typeof value !== 'object') {
    throw new Error(`${where}: the server did not answer with a record.`);
  }
  return value as T;
}

async function getList<T>(path: string, params?: Record<string, unknown>): Promise<T[]> {
  const res = await apiClient.get<Envelope<unknown>>(path, { params });
  return assertArray<T>(res.data?.data, path);
}

async function getOne<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await apiClient.get<Envelope<unknown>>(path, { params });
  return assertObject<T>(res.data?.data, path);
}

async function postOne<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiClient.post<Envelope<unknown>>(path, body ?? {});
  return assertObject<T>(res.data?.data, path);
}

// ═══════════════════════════════════════════════════════════════════════════
// Keys
// ═══════════════════════════════════════════════════════════════════════════

export const pharmacyDeskKeys = {
  all: ['pharmacyDesk'] as const,
  home: ['pharmacyDesk', 'home'] as const,
  prescriptionsAll: ['pharmacyDesk', 'prescriptions'] as const,
  prescriptions: (status: PrescriptionQueueStatus) => ['pharmacyDesk', 'prescriptions', status] as const,
  lookupAll: ['pharmacyDesk', 'prescription-lookup'] as const,
  lookup: (healthId: string) => ['pharmacyDesk', 'prescription-lookup', healthId] as const,
  reservationsAll: ['pharmacyDesk', 'reservations'] as const,
  reservations: (status: ReservationStatus) => ['pharmacyDesk', 'reservations', status] as const,
  stockAll: ['pharmacyDesk', 'stock'] as const,
  stock: (q: string, low: boolean) => ['pharmacyDesk', 'stock', q, low] as const,
};

type QueryOpts = { enabled?: boolean };

// ═══════════════════════════════════════════════════════════════════════════
// Home
// ═══════════════════════════════════════════════════════════════════════════

export function usePharmacyHome(opts: QueryOpts = {}) {
  return useQuery({
    queryKey: pharmacyDeskKeys.home,
    queryFn: () => getOne<PharmacyHome>(desk.home),
    retry: deskRetry,
    staleTime: 30 * 1000,
    enabled: opts.enabled ?? true,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Prescriptions
// ═══════════════════════════════════════════════════════════════════════════

/** `GET /prescriptions?status=` — routed to THIS facility. */
export function usePrescriptionQueue(status: PrescriptionQueueStatus, opts: QueryOpts = {}) {
  return useQuery({
    queryKey: pharmacyDeskKeys.prescriptions(status),
    queryFn: () => getList<DeskPrescription>(desk.prescriptions, { status }),
    retry: deskRetry,
    staleTime: 15 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/**
 * `GET /prescriptions/lookup?health_id=` — ONE patient's active prescriptions
 * dispensable here, by EXACT Health ID. Nothing is sent until the ID is a
 * plausible full one; the server is never asked a prefix or a name.
 */
export function usePrescriptionLookup(healthId: string | null | undefined, opts: QueryOpts = {}) {
  const key = healthId ? normaliseHealthId(healthId) : '';
  return useQuery({
    queryKey: pharmacyDeskKeys.lookup(key),
    queryFn: () => {
      if (!isPlausibleHealthId(key)) {
        throw new Error('A full Health ID is required to look prescriptions up.');
      }
      return getList<DeskPrescription>(desk.prescriptionLookup, { health_id: key });
    },
    retry: false,
    staleTime: 15 * 1000,
    enabled: (opts.enabled ?? true) && isPlausibleHealthId(key),
  });
}

/**
 * Where a prescription sits at this pharmacy, in the queue vocabulary.
 *
 * `pharmacy_routing_status` wins when it already speaks the queue's words;
 * the routing table's own vocabulary (`routed`, `received`…) is folded onto
 * them; then the prescription's own `status`. `null` when neither says —
 * a prescription found by Health ID that has not been routed here yet, say.
 * The detail screen offers the actions for the stage it can see and lets the
 * server's 409 be the last word on anything it cannot.
 */
export function prescriptionStage(p: Pick<DeskPrescription, 'status' | 'pharmacy_routing_status'>): PrescriptionQueueStatus | null {
  const fold = (raw: string | null | undefined): PrescriptionQueueStatus | null => {
    const s = (raw ?? '').toLowerCase().replace(/[\s-]/g, '_');
    if (!s) return null;
    if ((PRESCRIPTION_QUEUES as readonly string[]).includes(s)) return s as PrescriptionQueueStatus;
    switch (s) {
      case 'routed':
      case 'sent':
      case 'pending':
      case 'new':
        return 'incoming';
      case 'received':
      case 'accepted':
      case 'confirmed':
      case 'in_preparation':
      case 'in_progress':
        return 'preparing';
      case 'ready_for_pickup':
      case 'prepared':
        return 'ready';
      case 'completed':
      case 'partially_dispensed':
        return 'dispensed';
      default:
        return null;
    }
  };
  return fold(p.pharmacy_routing_status) ?? fold(p.status);
}

/** Write the server's row into every cached desk list that holds it. Lists are refetched on the next read. */
function replacePrescriptionInCache(
  qc: ReturnType<typeof useQueryClient>,
  updated: DeskPrescription,
): void {
  const patch = (rows: DeskPrescription[] | undefined) =>
    rows?.map((row) => (row.id === updated.id ? { ...row, ...updated } : row));
  qc.setQueriesData<DeskPrescription[]>({ queryKey: pharmacyDeskKeys.prescriptionsAll }, patch);
  qc.setQueriesData<DeskPrescription[]>({ queryKey: pharmacyDeskKeys.lookupAll }, patch);
}

function usePrescriptionWriteSettled() {
  const qc = useQueryClient();
  return {
    onSuccess: (updated: DeskPrescription) => {
      replacePrescriptionInCache(qc, updated);
      void qc.invalidateQueries({ queryKey: pharmacyDeskKeys.prescriptionsAll });
      void qc.invalidateQueries({ queryKey: pharmacyDeskKeys.lookupAll });
      void qc.invalidateQueries({ queryKey: pharmacyDeskKeys.home });
    },
    onError: () => {
      // The row may have moved on under us (409) — re-read rather than guess.
      void qc.invalidateQueries({ queryKey: pharmacyDeskKeys.prescriptionsAll });
      void qc.invalidateQueries({ queryKey: pharmacyDeskKeys.lookupAll });
    },
  };
}

/** `POST /prescriptions/{id}/accept` — incoming → preparing (PharmacyRoutingService::confirmReceipt). */
export function useAcceptPrescription() {
  const settled = usePrescriptionWriteSettled();
  return useMutation({
    mutationFn: (id: string) => postOne<DeskPrescription>(desk.acceptPrescription(id)),
    ...settled,
  });
}

/** `POST /prescriptions/{id}/ready` — preparing → ready. */
export function useMarkPrescriptionReady() {
  const settled = usePrescriptionWriteSettled();
  return useMutation({
    mutationFn: (id: string) => postOne<DeskPrescription>(desk.readyPrescription(id)),
    ...settled,
  });
}

/**
 * `POST /prescriptions/{id}/dispense` — recorded under the signed-in
 * pharmacist's name; cannot be undone from the app. Only items listed in
 * `body.items` are dispensed.
 */
export function useDispensePrescription() {
  const settled = usePrescriptionWriteSettled();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: DispenseBody }) =>
      postOne<DeskPrescription>(desk.dispensePrescription(id), body),
    ...settled,
  });
}

/**
 * The prescription a detail screen was opened for, from the list that listed
 * it. `hint.status` subscribes to that queue; `hint.healthId` to that lookup;
 * both absent falls back to whatever cached desk list holds the id. The
 * returned `query` is the live one, for pull-to-refresh and failure copy.
 */
export function usePrescriptionFromCache(
  id: string,
  hint: { status?: PrescriptionQueueStatus | null; healthId?: string | null },
) {
  const qc = useQueryClient();
  const status = hint.status ?? null;
  const healthId = hint.healthId ?? null;
  const queue = usePrescriptionQueue(status ?? 'incoming', { enabled: status !== null });
  const lookup = usePrescriptionLookup(healthId, { enabled: healthId !== null });

  const fromHint = useMemo(
    () => [...(queue.data ?? []), ...(lookup.data ?? [])].find((p) => p.id === id) ?? null,
    [queue.data, lookup.data, id],
  );

  const fromAnyCache = useMemo(() => {
    if (fromHint) return null;
    const scan = (key: readonly string[]) => {
      for (const [, rows] of qc.getQueriesData<DeskPrescription[]>({ queryKey: key })) {
        const hit = rows?.find((p) => p.id === id);
        if (hit) return hit;
      }
      return null;
    };
    return scan(pharmacyDeskKeys.prescriptionsAll) ?? scan(pharmacyDeskKeys.lookupAll);
    // `queue.dataUpdatedAt` / `lookup.dataUpdatedAt` re-run the scan after a write lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromHint, id, qc, queue.dataUpdatedAt, lookup.dataUpdatedAt]);

  const query = status !== null ? queue : lookup;
  return {
    prescription: fromHint ?? fromAnyCache,
    /** The live list query behind the hint (disabled when there is no hint). */
    query,
    /** True while nothing has been read yet and the row is not in any cache. */
    settling: !fromHint && !fromAnyCache && (queue.isPending || lookup.isPending) && (status !== null || healthId !== null),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Reservations
// ═══════════════════════════════════════════════════════════════════════════

/** `GET /reservations?status=`. */
export function useReservations(status: ReservationStatus, opts: QueryOpts = {}) {
  return useQuery({
    queryKey: pharmacyDeskKeys.reservations(status),
    queryFn: () => getList<DeskReservation>(desk.reservations, { status }),
    retry: deskRetry,
    staleTime: 15 * 1000,
    enabled: opts.enabled ?? true,
  });
}

function replaceReservationInCache(
  qc: ReturnType<typeof useQueryClient>,
  updated: DeskReservation,
): void {
  qc.setQueriesData<DeskReservation[]>({ queryKey: pharmacyDeskKeys.reservationsAll }, (rows) =>
    rows?.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)),
  );
}

/**
 * `POST /reservations/{id}/<action>` — one mutation for the six transitions.
 * `reason` is sent only with `cancel`. A 409 means the reservation moved on
 * since it was listed (`isInvalidTransition`).
 */
export function useReservationAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: ReservationAction; reason?: string }) =>
      postOne<DeskReservation>(
        desk.reservationAction(id, action),
        action === 'cancel' ? { reason: reason ?? '' } : {},
      ),
    onSuccess: (updated) => {
      replaceReservationInCache(qc, updated);
      void qc.invalidateQueries({ queryKey: pharmacyDeskKeys.reservationsAll });
      void qc.invalidateQueries({ queryKey: pharmacyDeskKeys.home });
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: pharmacyDeskKeys.reservationsAll });
    },
  });
}

/** Which transitions the desk offers for a reservation in `status`, in the order they are drawn. */
export function reservationActionsFor(r: Pick<DeskReservation, 'status' | 'fulfilment_mode'>): ReservationAction[] {
  const delivery = (r.fulfilment_mode ?? 'pickup') === 'delivery';
  switch ((r.status ?? '').toLowerCase()) {
    case 'pending':
      return ['accept', 'cancel'];
    case 'accepted':
      return ['ready', 'cancel'];
    case 'ready':
      return [delivery ? 'dispatch' : 'collected', 'cancel'];
    case 'dispatched':
      return ['delivered'];
    default:
      return [];
  }
}

/** Same derivation as the prescription one — the reservation the screen was opened from. */
export function useReservationFromCache(id: string, hint: { status?: ReservationStatus | null }) {
  const qc = useQueryClient();
  const status = hint.status ?? null;
  const list = useReservations(status ?? 'pending', { enabled: status !== null });

  const fromHint = useMemo(() => list.data?.find((r) => r.id === id) ?? null, [list.data, id]);

  const fromAnyCache = useMemo(() => {
    if (fromHint) return null;
    for (const [, rows] of qc.getQueriesData<DeskReservation[]>({ queryKey: pharmacyDeskKeys.reservationsAll })) {
      const hit = rows?.find((r) => r.id === id);
      if (hit) return hit;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromHint, id, qc, list.dataUpdatedAt]);

  return {
    reservation: fromHint ?? fromAnyCache,
    query: list,
    settling: !fromHint && !fromAnyCache && status !== null && list.isPending,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Stock
// ═══════════════════════════════════════════════════════════════════════════

/** `GET /stock?q=&low=1`. `low` is sent only when true — sending `0` is not the same as omitting it. */
export function useStock(q: string, low: boolean, opts: QueryOpts = {}) {
  const term = q.trim();
  return useQuery({
    queryKey: pharmacyDeskKeys.stock(term, low),
    queryFn: () =>
      getList<StockItem>(desk.stock, {
        ...(term ? { q: term } : {}),
        ...(low ? { low: 1 } : {}),
      }),
    retry: deskRetry,
    staleTime: 15 * 1000,
    enabled: opts.enabled ?? true,
  });
}

/** True when the shelf is at or under its reorder level. Null when either figure is missing. */
export function isLowStock(item: Pick<StockItem, 'quantity' | 'reorder_level'>): boolean | null {
  const qty = toNum(item.quantity);
  const level = toNum(item.reorder_level);
  if (qty === null || level === null) return null;
  return qty <= level;
}

/** `POST /stock/{id}/adjust { delta, reason }` — writes a StockMovement; the returned row is the truth. */
export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AdjustStockBody }) =>
      postOne<StockItem>(desk.adjustStock(id), body),
    onSuccess: (updated) => {
      qc.setQueriesData<StockItem[]>({ queryKey: pharmacyDeskKeys.stockAll }, (rows) =>
        rows?.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)),
      );
      void qc.invalidateQueries({ queryKey: pharmacyDeskKeys.stockAll });
      void qc.invalidateQueries({ queryKey: pharmacyDeskKeys.home });
    },
  });
}
