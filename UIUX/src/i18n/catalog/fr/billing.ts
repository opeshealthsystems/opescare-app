/**
 * `billing` — français hospitalier. Termes repris du catalogue de bureau
 * (`lang/fr/billing.php`) : « Facture », « Reçu », « Solde », « Montant payé »,
 * « Mode de paiement », « Date d’échéance », « Solde impayé ».
 *
 * La monnaie s’écrit FCFA partout dans le texte visible par le patient — jamais
 * XAF, qui est le code ISO réservé aux exports. Aucun montant ni aucune date
 * n’est mis en forme ici : ils arrivent déjà formatés par `utils/format.ts`.
 *
 * Apostrophes U+2019 (’). Mêmes clés, même ordre que `en/billing.ts`.
 */
export const billing = {
  // ── La liste des factures ───────────────────────────────────────────────
  list: {
    title: 'Facturation',
    subtitle: 'Vos factures, paiements et reçus',
    loading: 'Chargement de vos factures…',
    outstandingLabel: 'Solde impayé',
    outstandingMeta_one: '{count} facture impayée · {paid} réglés à ce jour',
    outstandingMeta_other: '{count} factures impayées · {paid} réglés à ce jour',
    emptyTitle: 'Aucune facture pour le moment',
    emptyBody: 'Les factures de vos consultations apparaîtront ici.',
    sectionToPay: 'À régler',
    sectionHistory: 'Historique',
    rowDue: 'Échéance {date}',
    rowSettled: 'Réglée',
  },

  // ── Vocabulaire commun aux trois documents financiers ───────────────────
  terms: {
    dateIssued: 'Date d’émission',
    dueDate: 'Date d’échéance',
    paymentDate: 'Date du paiement',
    paymentReference: 'Référence du paiement',
    paymentMethod: 'Mode de paiement',
    totalInvoiceAmount: 'Montant total de la facture',
    amountPaid: 'Montant payé',
    balanceRemaining: 'Solde restant dû',
    amountColumn: 'MONTANT ({currency})',
    viewInvoice: 'Voir la facture',
    viewReceipt: 'Voir le reçu',
    allInvoices: 'Toutes les factures',
    paymentHistory: 'Historique des paiements',
    needHelp: 'Besoin d’aide ?',
    secureNote: 'Toutes les transactions sont sécurisées et chiffrées.',
  },

  // ── Libellés de statut de facture (InvoiceStatus → texte patient) ────────
  statuses: {
    draft: 'Brouillon',
    issued: 'Émise',
    partially_paid: 'Partiellement payée',
    paid: 'Payée',
    cancelled: 'Annulée',
  },

  // ── BILL-001 Demande de paiement / Facture ──────────────────────────────
  invoice: {
    headerFallback: 'Facture',
    loading: 'Chargement de votre facture…',
    bubble: 'Veuillez trouver la facture des soins qui vous ont été dispensés.',
    banner: 'FACTURE',
    colDescription: 'DÉSIGNATION',
    colQty: 'QTÉ',
    colUnit: 'P.U. ({currency})',
    colTotal: 'TOTAL ({currency})',
    noItems: 'Aucune ligne sur cette facture.',
    totalPayable: 'TOTAL À PAYER',
    alreadyPaid: 'Déjà payé',
    balanceRemaining: 'Solde restant dû',
    paymentMethods: 'MOYENS DE PAIEMENT',
    payNow: 'Payer – {amount}',
    viewAllInvoices: 'Voir toutes les factures',
    settledInFull: 'Cette facture a été réglée intégralement.',
    notPayable: 'Cette facture ne peut pas être réglée depuis l’application.',
  },

  // ── BILL-002 Statut du paiement ─────────────────────────────────────────
  //
  // La formulation d’échec est délibérée. Un paiement qui expire A PEUT-ÊTRE
  // abouti : rien ici n’affirme que l’argent est intact ni qu’il ne s’est rien
  // passé. Le texte dit que l’issue n’a pas pu être confirmée et indique où
  // vérifier avant de payer de nouveau. Ne jamais l’adoucir en rassurance.
  status: {
    headerFallback: 'Paiement',
    headerSubtitle: 'Traitement de votre paiement',
    missingInvoice:
      'La facture de ce paiement est introuvable. Ouvrez-le de nouveau depuis la liste de vos factures.',
    unconfirmed:
      'Nous n’avons pas pu confirmer si ce paiement a été enregistré. Ouvrez Facturation et vérifiez cette facture avant de payer de nouveau, afin de ne pas être débité deux fois.',
    fallback:
      'Nous n’avons pas pu finaliser ce paiement. Ouvrez Facturation et vérifiez la facture avant de réessayer.',
    bubbleProcessing:
      'Nous confirmons votre paiement auprès de l’établissement. Veuillez laisser cet écran ouvert.',
    bubbleFailed: 'Nous n’avons pas pu confirmer votre paiement.',
    bubbleCompleted: 'Voici le statut de votre paiement récent.',
    banner: 'STATUT DU PAIEMENT',
    refProcessing: 'En cours',
    refNotCompleted: 'Non abouti',
    refUnconfirmed: 'Non confirmé',
    processingTitle: 'Paiement en cours…',
    processingBody:
      'Confirmation de la transaction auprès de l’établissement. Cela prend en général quelques secondes — ne fermez pas l’application.',
    failedTitle: 'PAIEMENT NON ABOUTI',
    unconfirmedTitle: 'PAIEMENT NON CONFIRMÉ',
    backToInvoice: 'Retour à la facture',
    successTitle: 'PAIEMENT ACCEPTÉ',
    successBody: 'Votre paiement a bien été reçu.',
    completed: 'Abouti',
    paymentStatus: 'Statut du paiement',
    paidInFull: 'Intégralement payée',
    partiallyPaid: 'Partiellement payée',
    transactionDetails: 'DÉTAIL DE LA TRANSACTION',
    transactionId: 'N° de transaction',
    paymentDateTime: 'Date et heure du paiement',
    paymentChannel: 'Canal de paiement',
    receiptNumber: 'N° de reçu',
    invoiceLabel: 'Facture',
    statusLabel: 'Statut',
    helpTitle: 'Besoin d’aide ?',
    helpBody: 'Pour toute question, contactez {facility}.',
    helpFacilityFallback: 'l’établissement',
  },

  // ── BILL-003 Reçu de paiement ───────────────────────────────────────────
  receipt: {
    headerFallback: 'Reçu',
    headerSubtitle: 'Reçu de paiement',
    loading: 'Chargement de votre reçu…',
    bubble: 'Veuillez trouver votre reçu de paiement.',
    banner: 'REÇU',
    paymentFor: 'OBJET DU PAIEMENT',
    description: 'DÉSIGNATION',
    amountPaidBand: 'MONTANT PAYÉ',
    reference: 'Référence',
    thanksTitle: 'Merci !',
    thanksLine1: 'Votre paiement a bien été reçu.',
    thanksLine2: 'Nous vous remercions de votre confiance.',
    validTitle: 'Ce reçu est valable.',
    validBody: 'Conservez-le pour vos archives.',
  },
} as const;
