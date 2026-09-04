/**
 * `billing` strings, English. One cluster per file so translators do not collide.
 * Contract: src/i18n/index.ts. Keys and order must match the fr twin exactly.
 *
 * Nothing here formats money or a date: every amount and every date is produced
 * by `src/utils/format.ts` and interpolated in as `{amount}` / `{date}`.
 *
 * Line-item descriptions, payment-method labels and facility names come from
 * the API and are never translated here.
 */
export const billing = {
  // ── The invoice list behind the Billing entry ───────────────────────────
  list: {
    title: 'Billing',
    subtitle: 'Your invoices, payments and receipts',
    loading: 'Loading your invoices…',
    outstandingLabel: 'Outstanding balance',
    outstandingMeta_one: '{count} unpaid invoice · {paid} paid to date',
    outstandingMeta_other: '{count} unpaid invoices · {paid} paid to date',
    emptyTitle: 'No invoices yet',
    emptyBody: 'Invoices from your visits will appear here.',
    sectionToPay: 'To Pay',
    sectionHistory: 'History',
    rowDue: 'Due {date}',
    rowSettled: 'Settled',
  },

  // ── Words the three financial documents share ───────────────────────────
  terms: {
    dateIssued: 'Date Issued',
    dueDate: 'Due Date',
    paymentDate: 'Payment Date',
    paymentReference: 'Payment Reference',
    paymentMethod: 'Payment Method',
    totalInvoiceAmount: 'Total Invoice Amount',
    amountPaid: 'Amount Paid',
    balanceRemaining: 'Balance Remaining',
    amountColumn: 'AMOUNT ({currency})',
    viewInvoice: 'View Invoice',
    viewReceipt: 'View Receipt',
    allInvoices: 'All Invoices',
    paymentHistory: 'Payment History',
    needHelp: 'Need Help?',
    secureNote: 'All transactions are secure and encrypted.',
  },

  // ── Invoice status badges (raw InvoiceStatus → patient-facing label) ─────
  statuses: {
    draft: 'Draft',
    issued: 'Issued',
    partially_paid: 'Partially Paid',
    paid: 'Paid',
    cancelled: 'Cancelled',
  },

  // ── BILL-001 Payment Request / Invoice ──────────────────────────────────
  invoice: {
    headerFallback: 'Invoice',
    loading: 'Loading your invoice…',
    bubble: 'Please find your invoice for the services provided.',
    banner: 'INVOICE',
    colDescription: 'DESCRIPTION',
    colQty: 'QTY',
    colUnit: 'UNIT ({currency})',
    colTotal: 'TOTAL ({currency})',
    noItems: 'No line items on this invoice.',
    totalPayable: 'TOTAL PAYABLE',
    alreadyPaid: 'Already paid',
    balanceRemaining: 'Balance remaining',
    paymentMethods: 'PAYMENT METHODS',
    payNow: 'Pay Now – {amount}',
    viewAllInvoices: 'View All Invoices',
    settledInFull: 'This invoice has been settled in full.',
    notPayable: 'This invoice is not payable from the app.',
  },

  // ── BILL-002 Payment Processing Status ──────────────────────────────────
  //
  // The failure copy below is deliberate. A payment that times out MAY have
  // gone through, so nothing here says the money is safe or that nothing
  // happened: it says the outcome could not be confirmed and tells the patient
  // where to check before paying again. Do not soften this into reassurance.
  status: {
    headerFallback: 'Payment',
    headerSubtitle: 'Processing your payment',
    missingInvoice: 'This payment is missing its invoice. Open it again from your invoice list.',
    unconfirmed:
      'We could not confirm whether this payment was recorded. Open Billing and check this invoice before paying again, so you are not charged twice.',
    fallback:
      'We couldn’t complete this payment. Open Billing and check the invoice before trying again.',
    bubbleProcessing: 'We are confirming your payment with the provider. Please keep this screen open.',
    bubbleFailed: 'We could not confirm your payment.',
    bubbleCompleted: 'Here is the status of your recent payment.',
    banner: 'PAYMENT STATUS',
    refProcessing: 'Processing',
    refNotCompleted: 'Not completed',
    refUnconfirmed: 'Unconfirmed',
    processingTitle: 'Processing your payment…',
    processingBody:
      'Confirming the transaction with the provider. This usually takes a few seconds — do not close the app.',
    failedTitle: 'PAYMENT NOT COMPLETED',
    unconfirmedTitle: 'PAYMENT NOT CONFIRMED',
    backToInvoice: 'Back to Invoice',
    successTitle: 'PAYMENT SUCCESSFUL',
    successBody: 'Your payment has been received successfully.',
    completed: 'Completed',
    paymentStatus: 'Payment Status',
    paidInFull: 'Paid in Full',
    partiallyPaid: 'Partially paid',
    transactionDetails: 'TRANSACTION DETAILS',
    transactionId: 'Transaction ID',
    paymentDateTime: 'Payment Date & Time',
    paymentChannel: 'Payment Channel',
    receiptNumber: 'Receipt Number',
    invoiceLabel: 'Invoice',
    statusLabel: 'Status',
    helpTitle: 'Need help?',
    helpBody: 'If you have any questions, please contact {facility}.',
    helpFacilityFallback: 'the facility',
  },

  // ── BILL-003 Payment Receipt ────────────────────────────────────────────
  receipt: {
    headerFallback: 'Receipt',
    headerSubtitle: 'Payment receipt',
    loading: 'Loading your receipt…',
    bubble: 'Please find your payment receipt.',
    banner: 'RECEIPT',
    paymentFor: 'PAYMENT FOR',
    description: 'DESCRIPTION',
    amountPaidBand: 'AMOUNT PAID',
    reference: 'Reference',
    thanksTitle: 'Thank you!',
    thanksLine1: 'Your payment has been received.',
    thanksLine2: 'We appreciate your trust in our care.',
    validTitle: 'This is a valid receipt.',
    validBody: 'Keep it for your records.',
  },
} as const;
