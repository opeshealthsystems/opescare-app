/**
 * `messaging` strings, French. One cluster per file so translators do not collide.
 * Contract: src/i18n/index.ts. Keys and order must match the en twin exactly.
 *
 * Termes repris du bureau (`lang/fr/`) : « Ordonnance », « Plan de soins »,
 * « Orientation », « Compte rendu », « Marquer comme lue » (notifications.mark_read),
 * « Écrivez votre message… » (comms.composer), « Nouveau message » (comms.new_message),
 * « Sujet » (comms.subject_field), « Envoyer le message » (comms.start).
 *
 * Apostrophes : U+2019 (’). Aucune n’est supprimée.
 */
export const messaging = {
  // ── MSG-001 Onglet Messages ──────────────────────────────────────────────
  inbox: {
    title: 'Messages',
    notificationsA11y: 'Notifications',
    conversationsA11y: 'Toutes les conversations',
    closeA11y: 'Fermer',
    loading: 'Chargement de vos messages…',
    emptyTitle: 'Aucune conversation pour le moment',
    emptyMessage:
      'Dès que votre équipe soignante vous écrira, la conversation apparaîtra ici.',
    emptyCta: 'Écrire à un soignant',
    careTeamFallback: 'Votre équipe soignante',
    viewProfile: 'Voir le profil',
    encryption: 'Vos messages sont chiffrés de bout en bout et conformes à la norme HIPAA.',
    today: 'Aujourd’hui, {date}',
    yesterday: 'Hier, {date}',
    noMessagesTitle: 'Aucun message pour le moment',
    noMessagesMessage: 'Envoyez le premier message pour démarrer cette conversation.',
    composerPlaceholder: 'Écrivez votre message…',
    sendA11y: 'Envoyer le message',
    // Le patient doit savoir que le message n’est PAS parvenu au soignant.
    sendFailed: 'Message non envoyé. Veuillez réessayer.',
    sharedItemTitle: 'Document partagé',
    sharedItemNote: 'Cette pièce jointe ne peut pas encore être affichée dans l’application.',
  },

  // ── Cartes enrichies de l’onglet Messages ────────────────────────────────
  cards: {
    lastUpdated: 'Mise à jour : {date}, {time}',
    thMedication: 'MÉDICAMENT',
    thDose: 'DOSE ET FRÉQUENCE',
    thTakenFor: 'INDICATION',
    thStartDate: 'DÉBUT',
    thStatus: 'STATUT',
    important: 'Important',
    actionDownload: 'Télécharger',
    actionAdd: 'Ajouter',
    actionRefill: 'Renouveler',
    actionShare: 'Partager',

    prescribedBy: 'Prescrit par {name}',
    dose: 'Dose',
    route: 'Voie',
    duration: 'Durée',
    purpose: 'Indication',
    refillsLeft: 'Renouvellements',
    instructions: 'Instructions',
    viewPrescription: 'Voir l’ordonnance',

    invoiceFallback: 'Facture',
    invoiceMeta: '{facility} · échéance {date}',
    balanceDue: 'Solde à payer',
    payNow: 'Payer',

    carePlanBy: 'Par {name}',
    goal: 'Objectif',
    targetDate: 'Date cible',
    openCarePlan: 'Ouvrir le plan de soins',

    referralMeta: '{specialty} · {facility}',
    reason: 'Motif',
    referredBy: 'Orientée par',
    referredOn: 'Orientée le',
    appointment: 'Rendez-vous',
    viewReferral: 'Voir l’orientation',

    dueBy: 'À faire avant le {date}',
    warningTitle: 'Consultez immédiatement si vous constatez',

    imagingMeta: '{modality} · {bodyPart}',
    summary: 'Synthèse',
    impression: 'Conclusion',
    reportedBy: 'Interprété par',
    performed: 'Réalisé le',
    viewFullReport: 'Voir le compte rendu',
  },

  quick: {
    reminder: 'Rappel de traitement',
    pharmacy: 'Commander en pharmacie',
    ask: 'Poser une question',
    followUp: 'Programmer un suivi',
    video: 'Appel vidéo',
  },

  threads: {
    title: 'Conversations',
    subtitle_one: '{count} conversation avec votre équipe soignante',
    subtitle_other: '{count} conversations avec votre équipe soignante',
    careTeamFallback: 'Équipe soignante',
    newMessage: 'Écrire à un soignant',
  },

  // ── MSG-001 Notifications (feuille + écran complet) ──────────────────────
  notifications: {
    title: 'Notifications',
    markAllRead: 'Tout marquer comme lu',
    markAllFailed:
      'Impossible de marquer ces notifications comme lues. Vérifiez votre connexion et réessayez.',
    loading: 'Chargement des notifications…',
    emptyTitle: 'Rien de nouveau',
    sheetEmptyMessage: 'Vous êtes à jour.',
    emptyMessage:
      'Les rappels de rendez-vous, les résultats et les avis de facturation apparaîtront ici.',
    subtitleNone: 'Rappels et actualités de votre équipe soignante',
    subtitleUnread_one: '{count} non lue',
    subtitleUnread_other: '{count} non lues',
    categoryAppointment: 'Rendez-vous',
    categoryLabResult: 'Résultat de laboratoire',
    categoryImaging: 'Imagerie',
    categoryBilling: 'Facturation',
    categoryMedication: 'Traitement',
    categoryMessage: 'Message',
  },

  // ── MSG-002 Nouveau message ──────────────────────────────────────────────
  newMessage: {
    title: 'Nouveau message',
    subtitle: 'Écrire à un médecin de l’hôpital St. Mary',
    whoFor: 'À qui s’adresse ce message ?',
    change: 'Changer',
    changeA11y: 'Choisir un autre médecin',
    facilityFallback: 'Hôpital St. Mary',
    searchPlaceholder: 'Rechercher par nom ou spécialité',
    loadingDoctors: 'Chargement des médecins…',
    noMatch: 'Aucun médecin ne correspond à cette recherche. Essayez un autre nom ou une autre spécialité.',
    yourMessage: 'Votre message',
    subjectLabel: 'Sujet (facultatif)',
    subjectPlaceholder: 'De quoi s’agit-il ?',
    messageLabel: 'Message',
    messagePlaceholder: 'Décrivez ce que votre médecin doit savoir.',
    charsLeft: '{count} caractères restants',
    notice:
      'Les messages ne sont pas surveillés en permanence. En cas d’urgence, appelez votre établissement ou rendez-vous aux urgences.',
    // Dit explicitement que le message n’est pas parti, et que le brouillon est conservé.
    sendFailed:
      'Votre message n’a pas été envoyé. Vérifiez votre connexion et réessayez — rien n’a été perdu.',
    sending: 'Envoi…',
    send: 'Envoyer le message',
  },
} as const;
