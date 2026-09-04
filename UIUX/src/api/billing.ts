/** Invoices, payment and receipts in XAF (BILL-001 / BILL-002 / BILL-003). */
import { getOne, getPage, getPageWithMeta, post, Page, PageQuery } from './portal';

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled';

/** Accounting channel the ledger records. */
export type PaymentChannel = 'mobile_money' | 'card' | 'bank_transfer';

/**
 * The rail the patient actually chooses. These are `payment_methods.code`
 * values served by the API - never hardcode the list, read
 * `PortalInvoiceDetail.payment_methods`.
 */
export type PaymentMethodCode = string;

export type PortalInvoice = {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  currency: string;
  total_amount: number;
  discount_amount: number;
  amount_paid: number;
  balance: number;
  issued_at: string | null;
  due_at: string | null;
  /** Drive the "Pay Now" button off this. */
  is_payable: boolean;
};

export type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type InvoicePayment = {
  id: string;
  receipt_number: string;
  amount: number;
  method: string;
  reference: string | null;
  paid_at: string | null;
};

export type PaymentMethodOption = {
  /** e.g. "mtn_momo", "orange_money", "card", "bank_transfer". */
  code: PaymentMethodCode;
  label: string;
  hint: string | null;
  /** Brand shown on the receipt ("MTN", "Orange"). */
  provider: string | null;
  channel: PaymentChannel;
  /** Icon glyph name suggested by the backend. */
  icon: string | null;
};

export type PortalInvoiceDetail = PortalInvoice & {
  notes: string | null;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  facility: { name: string; address: string; phone: string | null; email: string | null };
  payment_methods: PaymentMethodOption[];
};

export type InvoiceTotals = {
  currency: string;
  outstanding_count: number;
  outstanding_total: number;
  paid_total: number;
};

/** Rail fields every receipt-shaped payload carries. */
export type ReceiptRail = {
  /** Accounting channel. */
  method: PaymentChannel | string;
  /** Rail code, null for payments taken before rails were modelled. */
  method_code: PaymentMethodCode | null;
  /** Display label - "MTN MoMo", "Orange Money", "Card". */
  method_label: string;
  method_provider: string | null;
};

export type PortalReceipt = ReceiptRail & {
  id: string;
  receipt_number: string;
  invoice_id: string;
  amount: number;
  currency: string;
  reference: string | null;
  paid_at: string | null;
};

/** `GET /patient/receipts/{id}` - the receipt plus the invoice it settled. */
export type PortalReceiptDetail = PortalReceipt & {
  invoice_number: string | null;
  facility_name: string;
  facility: { name: string; address: string; phone: string | null; email: string | null };
  invoice: PortalInvoiceDetail | null;
};

export type PaymentReceipt = ReceiptRail & {
  id: string;
  receipt_number: string;
  amount: number;
  currency: string;
  reference: string | null;
  paid_at: string | null;
  invoice_id: string;
  invoice_number: string;
  facility_name: string;
};

export type PaymentResult = {
  receipt: PaymentReceipt;
  invoice: PortalInvoiceDetail;
};

export type InvoiceQuery = {
  scope?: 'outstanding' | 'paid' | 'all';
  /** Comma-separated statuses. */
  status?: string;
};

export type PayInvoiceInput = {
  method: PaymentMethodCode;
  /** Omit to settle the full outstanding balance. */
  amount?: number;
  reference?: string;
};

/**
 * Header the server dedupes payments by. One constant so pointing it at the
 * backend's final header name (once the sibling publishes the exact semantics)
 * is a one-line edit here.
 */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/** Returns the list plus `meta.totals` for the outstanding-balance banner. */
export const fetchInvoices = (query: InvoiceQuery = {}) =>
  getPageWithMeta<PortalInvoice, { totals: InvoiceTotals }>('/patient/invoices', query);

export const fetchInvoice = (id: string) => getOne<PortalInvoiceDetail>(`/patient/invoices/${id}`);

/**
 * Records a real payment against the invoice and returns the receipt.
 * Throws PortalConflictError if the invoice is already settled or cancelled,
 * and ValidationError if the amount exceeds the outstanding balance.
 *
 * `idempotencyKey` MUST be generated once per payment attempt and reused on
 * every retry: the server dedupes on it, so a Retry after a lost response
 * settles the invoice at most once instead of charging the patient twice. The
 * caller owns the key's lifetime — this function only forwards it as a header.
 */
export const payInvoice = (id: string, input: PayInvoiceInput, idempotencyKey?: string) =>
  post<PaymentResult>(
    `/patient/invoices/${id}/pay`,
    input,
    idempotencyKey ? { headers: { [IDEMPOTENCY_HEADER]: idempotencyKey } } : undefined
  );

export const fetchReceipts = (query: PageQuery = {}) =>
  getPage<PortalReceipt>('/patient/receipts', query);

/** BILL-003 loads the receipt back from the server, so a reload still works. */
export const fetchReceipt = (id: string) => getOne<PortalReceiptDetail>(`/patient/receipts/${id}`);

export type { Page, PageQuery };
