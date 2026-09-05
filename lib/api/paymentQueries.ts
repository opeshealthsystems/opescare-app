/**
 * Mobile money payments — the data layer for `app/payments/[invoiceId].tsx`.
 *
 * Backend: `routes/mobile_payments.php` on the Finder API
 * (MobilePaymentController), added alongside this file.
 *
 * ── AMOUNTS ARE INTEGERS. There is no float on this path. ──────────────────
 * Every amount crosses the wire as `amount_minor`, an integer of minor units.
 * XAF has ISO 4217 exponent 0, so **the minor unit is the franc**:
 * `amount_minor: 5000` means 5 000 FCFA, not 50.00.
 *
 * This module never divides, never multiplies, and never parses an amount into
 * a decimal. It does not even format one: the API sends `amount_display`
 * ("5 000 FCFA") pre-rendered, because a client that re-derives a currency is
 * a client that will eventually render "50.00 FCFA" for a 5 000 franc bill.
 * `formatMinor()` below exists only as a last-resort fallback and says so.
 *
 * ── IDEMPOTENCY IS A CLIENT RESPONSIBILITY TOO ─────────────────────────────
 * `POST .../charges` requires an `Idempotency-Key`. The key is generated ONCE
 * per payment attempt and held in state by `useIdempotencyKey()`, so a double
 * tap, a re-render, and a user-initiated retry after a network error all send
 * the SAME key and can only ever produce one charge. Generating the key inside
 * the mutation function — the obvious place — would defeat the entire
 * mechanism: every retry would carry a fresh key and would be a fresh charge.
 * The key changes only when `reset()` is called, which the screen does only for
 * a genuinely new attempt.
 */
import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from './client';

/**
 * Paths are spelled out here rather than in `endpoints.ts`, which is owned
 * elsewhere. They carry no `/api` prefix because `API_BASE_URL` already ends
 * in `/api`.
 */
export const paymentEndpoints = {
  methods: '/mobile/payments/methods',
  invoices: '/mobile/payments/invoices',
  invoice: (id: string) => `/mobile/payments/invoices/${id}`,
  charges: (invoiceId: string) => `/mobile/payments/invoices/${invoiceId}/charges`,
  charge: (id: string) => `/mobile/payments/charges/${id}`,
} as const;

// ---------------------------------------------------------------------------
// Types — mirror the API exactly. Nothing here is inferred or reshaped.
// ---------------------------------------------------------------------------

/** The five lifecycle states. Forward-only server-side; `paid` never reverts. */
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

/** The two Cameroonian mobile money rails. */
export type PaymentMethod = 'mtn_momo' | 'orange_money';

export interface Invoice {
  id: string;
  /** Human-quotable, e.g. "OC-2609-7KF3QW". Readable down a phone line. */
  reference: string;
  description: string;
  status: PaymentStatus;
  /** Already localised by the server. */
  status_label: string;
  /** INTEGER minor units. XAF exponent 0 → this is francs. */
  amount_minor: number;
  currency: string;
  /** "FCFA" — what a patient reads. `currency` ("XAF") is the ISO code. */
  currency_symbol: string;
  /** Pre-formatted by the server: "5 000 FCFA". Render this, do not compute it. */
  amount_display: string;
  facility_id: string | null;
  subject_type: string | null;
  subject_id: string | null;
  is_payable: boolean;
  /** True when the host is running the simulator. Drives the demo banner. */
  is_demo: boolean;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string | null;
}

export interface Charge {
  id: string;
  invoice_id: string;
  status: PaymentStatus;
  status_label: string;
  method: PaymentMethod;
  method_label: string;
  /** 'demo' on a demo host; 'mtn_momo' / 'orange_money' when live. */
  provider: string;
  /** True when no money moves. The app MUST surface this. */
  simulated: boolean;
  amount_minor: number;
  currency: string;
  currency_symbol: string;
  amount_display: string;
  /** '+23767*****02'. The full number is never sent to the client. */
  payer_masked: string;
  failure_code: string | null;
  /** Already localised by the server — never a telco's English string. */
  failure_reason: string | null;
  requested_at: string | null;
  settled_at: string | null;
  expires_at: string | null;
  /** The server saying whether to keep polling. Not a client guess. */
  poll: boolean;
}

export interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
}

export interface PaymentCapability {
  available: boolean;
  simulated: boolean;
  currency: string;
  currency_symbol: string;
  methods: PaymentMethodOption[];
}

export interface InvoiceWithCharges extends Invoice {
  charges: Charge[];
}

/** The API's error envelope for a refused payment. */
export interface PaymentApiError {
  error: string;
  message: string;
  data?: { charge?: Charge };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * What this host can take, and whether it is real money.
 *
 * Cached for the session: a host does not gain merchant credentials mid-visit,
 * and the demo banner must not flicker.
 */
export function usePaymentCapability() {
  return useQuery({
    queryKey: ['payments', 'capability'],
    queryFn: async () => (await apiClient.get<{ data: PaymentCapability }>(paymentEndpoints.methods)).data.data,
    staleTime: 10 * 60 * 1000,
  });
}

/** One invoice and its attempts. Scoped to the bearer token; 404 if not yours. */
export function useInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['payments', 'invoice', invoiceId],
    enabled: !!invoiceId,
    queryFn: async () =>
      (await apiClient.get<{ data: InvoiceWithCharges }>(paymentEndpoints.invoice(invoiceId!))).data.data,
    // Money must not be stale. Refetched on focus and never held long.
    staleTime: 0,
  });
}

/** The patient's own invoices, newest first. */
export function useInvoices(status?: PaymentStatus) {
  return useQuery({
    queryKey: ['payments', 'invoices', status ?? 'all'],
    queryFn: async () =>
      (
        await apiClient.get<{ data: Invoice[] }>(paymentEndpoints.invoices, {
          params: status ? { status } : undefined,
        })
      ).data.data,
    staleTime: 30 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Starting a payment
// ---------------------------------------------------------------------------

export interface StartPaymentInput {
  invoiceId: string;
  method: PaymentMethod;
  /** As typed by the patient. Normalised server-side; never stored raw. */
  msisdn: string;
  /**
   * The amount the screen DISPLAYED, echoed back. The server refuses the
   * payment if it does not match the invoice — a patient authorises an amount,
   * not an invoice id.
   */
  amountMinor: number;
  /** Generated ONCE per attempt by the caller. See the module docblock. */
  idempotencyKey: string;
}

/**
 * `POST /payments/invoices/{id}/charges`.
 *
 * `retry: false` is deliberate. React Query's automatic retry is exactly wrong
 * for a call that starts a payment: the idempotency key makes a retry *safe*,
 * but a silent retry also hides a genuinely stuck request from the patient
 * while a PIN prompt may already be on their handset. The screen offers an
 * explicit retry instead, reusing the same key.
 */
export function useStartPayment() {
  const queryClient = useQueryClient();

  return useMutation<Charge, AxiosError<PaymentApiError>, StartPaymentInput>({
    retry: false,
    mutationFn: async ({ invoiceId, method, msisdn, amountMinor, idempotencyKey }) => {
      const response = await apiClient.post<{ data: Charge }>(
        paymentEndpoints.charges(invoiceId),
        { method, msisdn, amount_minor: amountMinor },
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );

      return response.data.data;
    },
    onSuccess: (charge) => {
      void queryClient.invalidateQueries({ queryKey: ['payments', 'invoice', charge.invoice_id] });
    },
  });
}

/**
 * Poll one charge until it settles.
 *
 * The cadence and the stopping condition both come from the server
 * (`charge.poll`), not from a timer the client invented — so a change of
 * cadence, or a provider that needs longer, does not need an app release.
 * Polling stops the moment the status is terminal, so a settled payment does
 * not keep a request running in the background for the rest of the session.
 */
export function useChargeStatus(chargeId: string | undefined, options?: { intervalMs?: number }) {
  const interval = options?.intervalMs ?? 2000;

  return useQuery({
    queryKey: ['payments', 'charge', chargeId],
    enabled: !!chargeId,
    queryFn: async () =>
      (
        await apiClient.get<{ data: { charge: Charge; invoice: Invoice | null } }>(
          paymentEndpoints.charge(chargeId!),
        )
      ).data.data,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return interval;

      return data.charge.poll ? interval : false;
    },
    // A pending payment is the one thing worth re-checking the instant the
    // patient comes back from the MoMo PIN prompt.
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A fresh idempotency key, held stable for the life of one payment attempt.
 *
 * `reset()` is called only when the patient starts a *genuinely new* attempt
 * (after a failure, or after changing the number) — never on a retry of the
 * same attempt, which is the whole point of the key.
 */
export function useIdempotencyKey(): { key: string; reset: () => void } {
  const [key, setKey] = useState(() => newIdempotencyKey());
  const reset = useCallback(() => setKey(newIdempotencyKey()), []);

  return { key, reset };
}

function newIdempotencyKey(): string {
  // UUID v4 where available; a time+random fallback everywhere else. Both are
  // far beyond the collision budget of one patient's payments, and the server
  // scopes keys per patient anyway.
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (typeof uuid === 'function') return uuid.call(globalThis.crypto);

  return `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Terminal states — the screen stops waiting on these. */
export function isSettled(status: PaymentStatus): boolean {
  return status !== 'pending';
}

/**
 * FALLBACK ONLY. Prefer `amount_display` from the API, which is authoritative
 * and localised.
 *
 * Used when the screen has an amount but no server-rendered string yet (an
 * optimistic confirm sheet). Integer arithmetic only: XAF has exponent 0, so
 * this groups the digits and appends FCFA — it never divides by 100.
 */
export function formatMinor(amountMinor: number, symbol = 'FCFA'): string {
  const grouped = String(Math.trunc(Math.abs(amountMinor))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  return `${amountMinor < 0 ? '-' : ''}${grouped} ${symbol}`;
}

/**
 * Cameroonian mobile numbers: +237 and nine national digits starting with 6.
 * A client-side mirror of the server's rule so the patient is told before the
 * request goes out — the server remains the authority.
 */
export function normaliseMsisdn(raw: string): { national: string; valid: boolean } {
  let digits = raw.replace(/\D+/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('237') && digits.length === 12) digits = digits.slice(3);

  return { national: digits, valid: digits.length === 9 && digits.startsWith('6') };
}

/**
 * Operator prefix tables for Cameroon, used ONLY to warn — never to block.
 * Number portability means a prefix is a strong hint and never a proof, and a
 * patient who has ported their number must still be able to pay.
 */
const OPERATOR_PREFIXES: Record<PaymentMethod, string[]> = {
  mtn_momo: ['67', '650', '651', '652', '653', '654', '680', '681', '682', '683', '684', '685', '686', '687', '688', '689'],
  orange_money: ['69', '655', '656', '657', '658', '659', '640', '641', '642', '643', '644', '645', '646', '647', '648', '649'],
};

export function looksLikeOperator(method: PaymentMethod, nationalNumber: string): boolean {
  return OPERATOR_PREFIXES[method].some((p) => nationalNumber.startsWith(p));
}

/** Group a national number for display as the patient types: "670 00 00 02". */
export function formatNationalNumber(national: string): string {
  const d = national.slice(0, 9);
  const parts = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);

  return parts.join(' ');
}

/**
 * Seconds elapsed since a pending charge was requested, ticking once a second.
 *
 * The pending screen shows this because a mobile money prompt that has been
 * waiting 90 seconds and one that has been waiting 3 look identical otherwise,
 * and the difference is exactly what tells a patient whether to check their
 * handset again.
 */
export function useElapsedSeconds(since: string | null | undefined, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    // Re-sync immediately when the timer starts, so the first frame is not a
    // stale `now` captured when the component first mounted.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(id);
  }, [active]);

  // Derived during render, not stashed in a ref by an effect: a ref written in
  // `useEffect` still holds the PREVIOUS charge's timestamp on the first render
  // after `since` changes, which shows a stale count for one tick at exactly
  // the moment a new payment starts.
  const start = since ? new Date(since).getTime() : NaN;
  if (Number.isNaN(start)) return 0;

  return Math.max(0, Math.floor((now - start) / 1000));
}

/**
 * Pull the API's own message out of an axios failure.
 *
 * The server sends a localised sentence and a stable machine `error` code; both
 * are preferred over anything this client could invent, because the server
 * knows the patient's language and the actual reason.
 */
export function paymentError(e: unknown): { code: string | null; message: string | null; charge: Charge | null } {
  const err = e as AxiosError<PaymentApiError> | undefined;
  const body = err?.response?.data;

  return {
    code: body?.error ?? null,
    message: body?.message ?? null,
    charge: body?.data?.charge ?? null,
  };
}
