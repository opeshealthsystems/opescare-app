/**
 * `meds` — français hospitalier. Vocabulaire repris du bureau (`lang/fr/pharmacy.php`) :
 * « Ordonnance », « Prescripteur », « Dispensation », « Dispensé », « Voie »,
 * « Observance », « Prise » / « Manquée », « Renouvellement », « Soignant ».
 *
 * Apostrophes U+2019 (’). Ne jamais en supprimer une.
 * Mêmes clés, même ordre que le jumeau anglais.
 */
export const meds = {
  // ── Vocabulaire des prises (shared.tsx, MED-001, programme) ─────────────
  dose: {
    statusUpcoming: 'À venir',
    statusTaken: 'Prise',
    statusMissed: 'Manquée',
    statusSkipped: 'Ignorée',

    // Compte à rebours sous une prise programmée.
    spanHours: '{h} h {m} min',
    spanMinutes: '{m} min',
    countdownIn: 'Dans {span}',
    countdownAgo: 'Il y a {span}',

    // « Aujourd’hui, 14:00 » / « 23 avr. 2026, 08:00 »
    whenToday: 'Aujourd’hui, {time}',
    whenTomorrow: 'Demain, {time}',
    whenYesterday: 'Hier, {time}',
    whenDate: '{date}, {time}',

    // Pastille de renouvellement.
    overdue: 'En retard',
    dueToday: 'À faire aujourd’hui',
    daysLeft_one: '{count} jour restant',
    daysLeft_other: '{count} jours restants',

    // Observance sur MED-005.
    adherenceNoData: 'Aucune donnée',
    adherenceGood: 'Bonne',
    adherenceFair: 'Moyenne',
    adherencePoor: 'Insuffisante',

    // La feuille de prise.
    sheetFallback: 'Dose',
    sheetMessage: '{dose} — prévue à {time}.',
    notNow: 'Pas maintenant',
    markTaken: 'Marquer comme prise',
    skipDose: 'Ignorer cette prise',
    viewMedication: 'Voir le médicament',

    // Échec de l’écriture. Jamais adouci en rassurance : l’application ne sait
    // pas si la prise a été enregistrée, et elle le dit.
    failTitle: 'Nous n’avons pas pu confirmer l’enregistrement de cette prise',
    failOk: 'OK',
    failHintList:
      'Vérifiez cette prise dans votre programme ci-dessous — si elle est toujours indiquée comme à prendre, touchez-la de nouveau.',
    failHintTimeline:
      'Vérifiez cette prise sur la chronologie ci-dessous — si elle est toujours indiquée comme à venir, touchez-la de nouveau.',
  },

  // ── MED-001 Traitements et ordonnances ──────────────────────────────────
  list: {
    title: 'Traitements et ordonnances',
    subtitle: 'Vos ordonnances, vos médicaments et vos plans de traitement.',
    addPrescription: 'Ajouter une ordonnance',
    loading: 'Chargement de vos traitements…',

    filterActive: 'En cours',
    filterRecent: 'Récents',
    filterAll: 'Tous',

    heroActive: 'Médicaments actifs',
    heroOngoing: 'Traitements en cours',
    heroNextDose: 'Prochaine prise',
    heroNoDose: 'Aucune prise programmée',
    heroCaughtUp: 'Vous êtes à jour',
    heroViewSchedule: 'Voir le programme',
    adherenceA11y: 'Observance {percent} pour cent',

    prescriptionsTitle: 'Mes ordonnances',
    emptyTitle: 'Aucune ordonnance ici',
    emptyBody: 'Les ordonnances rédigées lors de vos visites apparaîtront dans cette liste.',
    viewAllPrescriptions: 'Voir toutes les ordonnances',
    startedOn: 'Débuté le : {date}',

    scheduleTitle: 'Programme des prises',
    scheduleToday: 'Aujourd’hui, {date}',
    scheduleEmptyTitle: 'Rien de programmé aujourd’hui',
    scheduleEmptyBody:
      'Aucune prise n’est prévue aujourd’hui. Votre programme se remplira à mesure que des ordonnances seront rédigées.',

    refillTitle: 'Rappels de renouvellement',
    refillViewAll: 'Voir tout',
    refillNone: 'Aucun renouvellement n’est à faire pour le moment.',
    refillOn: 'Renouvellement le {date}',

    pharmacyTitle: 'Pharmacie et livraison',
    pharmacyBody: 'Faites livrer vos médicaments à votre porte.',
    pharmacyCta: 'Commander en pharmacie',

    privacyTitle: 'Vos données d’ordonnance sont chiffrées et protégées.',
    privacyNote: 'Partagées uniquement avec les soignants et les pharmacies autorisés.',
    manageAccess: 'Gérer les accès',
  },

  // ── Programme des prises ────────────────────────────────────────────────
  schedule: {
    title: 'Programme des prises',
    subtitle: 'Chaque prise qui vous attend, jour après jour.',
    loading: 'Chargement de votre programme…',
    jumpToToday: 'Aller à aujourd’hui',
    previousWeek: 'Semaine précédente',
    nextWeek: 'Semaine suivante',

    weekdaySun: 'Dim',
    weekdayMon: 'Lun',
    weekdayTue: 'Mar',
    weekdayWed: 'Mer',
    weekdayThu: 'Jeu',
    weekdayFri: 'Ven',
    weekdaySat: 'Sam',

    dayToday: 'Aujourd’hui',
    dayTomorrow: 'Demain',
    dayYesterday: 'Hier',

    noDoses: 'Aucune prise',
    takenOfTotal: '{taken} sur {total} prises',
    chipA11y: '{weekday} {date}, {count} prises',

    emptyTitle: 'Rien de programmé',
    emptyBody:
      'Aucune prise n’est prévue ce jour-là. Votre programme se remplit à mesure que des ordonnances sont rédigées.',
    viewMedications: 'Voir mes traitements',
  },

  // ── MED-005 Détail du médicament ────────────────────────────────────────
  detail: {
    title: 'Détail du médicament',
    subtitle: 'Consultez toutes les informations sur votre médicament',
    loading: 'Chargement de ce médicament…',
    notifications: 'Notifications',

    rxId: 'N° d’ordonnance',
    prescribedOn: 'Prescrit le',
    prescribedBy: 'Prescrit par',
    facility: 'Établissement',
    prescription: 'Ordonnance',
    status: 'Statut',

    dosageOverline: 'Posologie et instructions',
    dose: 'Dose',
    frequency: 'Fréquence',
    route: 'Voie',
    duration: 'Durée',
    startDate: 'Date de début',
    endDate: 'Date de fin',
    instructions: 'Instructions',
    instructionsFallback: 'Suivez les indications données par votre prescripteur.',

    relatedOverline: 'Informations associées',
    reasonDiagnosis: 'Motif / Diagnostic',
    conditionTreated: 'Affection traitée',
    prescriberNotes: 'Notes du prescripteur',
    noNotes: 'Aucune note supplémentaire.',

    refillsOverline: 'Renouvellements et observance',
    refillsRemaining: 'Renouvellements restants',
    adherence: 'Observance',
    lastTaken: 'Dernière prise',
    nextDose: 'Prochaine prise',

    sourceOverline: 'Origine de l’ordonnance',
    pharmacy: 'Pharmacie',
    pharmacyUnassigned: 'Non attribuée',
    fulfilmentStatus: 'Statut de dispensation',
    fulfilled: 'Dispensé',
    notFulfilled: 'Non dispensé',
    prescriptionType: 'Type d’ordonnance',

    verifiedTitle: 'Ordonnance vérifiée',
    verifiedMessage: 'Il s’agit d’une ordonnance électronique juridiquement valable.',
    verifiedOn: 'Vérifiée le {when}',
    verifyQr: 'Vérifier le QR',

    actionAdd: 'Ajouter à mes traitements',
    actionReminder: 'Créer un rappel',
    actionRefill: 'Demander un renouvellement',
    actionFindPharmacy: 'Trouver une pharmacie',
    actionHistory: 'Voir l’historique',
    actionShare: 'Partager le médicament',
    findPharmacyQuery: 'Pharmacie',

    allDosesRecorded: 'Toutes les prises prévues pour ce traitement ont été enregistrées.',
    shareRxId: 'N° d’ordonnance : {reference}',
  },

  // ── MED-003 Détail de l’ordonnance ──────────────────────────────────────
  prescription: {
    title: 'Détail de l’ordonnance',
    subtitle: 'Consultez votre ordonnance et les instructions de prise',
    loading: 'Chargement de cette ordonnance…',
    downloadA11y: 'Télécharger l’ordonnance',

    noPdfTitle: 'Pas encore de copie PDF',
    noPdfBody:
      'La clinique ne publie pas de fichier téléchargeable pour cette ordonnance. Utilisez Partager pour en envoyer les détails, ou demandez à la pharmacie de la retrouver avec votre identifiant santé.',

    prescriberMissing: 'Prescripteur non renseigné',
    prescribedOn: 'Prescrite le',
    prescriptionId: 'N° d’ordonnance',
    status: 'Statut',

    patient: 'Patient',
    patientId: 'N° patient : {reference}',
    diagnosisLabel: 'Diagnostic / Motif',

    medicationsCount: 'Médicaments ({count})',
    viewAsList: 'Voir en liste',
    instructions: 'Instructions',
    instructionsFallback:
      'Prenez tous les médicaments exactement comme prescrit et allez au bout du traitement.',
    refills: 'Renouvellements',
    refillsUsed: '{used} sur {allowed} utilisés',
    followUp: 'Suivi',

    dose: 'Dose',
    frequency: 'Fréquence',
    route: 'Voie',
    duration: 'Durée',

    pharmacy: 'Pharmacie',
    pharmacyUnassigned: 'Non attribuée',
    fulfilment: 'Dispensation',
    fulfilled: 'Dispensé',
    notFulfilled: 'Non dispensé',

    verifiedTitle: 'Ordonnance vérifiée',
    verifiedMessage: 'Cette ordonnance est signée et vérifiée électroniquement.',
    verifiedBadge: 'Vérifiée',

    actionAdd: 'Ajouter à mes traitements',
    actionReminder: 'Créer un rappel',
    actionFulfil: 'Faire dispenser en pharmacie',
    actionDownload: 'Télécharger le PDF',
    actionShare: 'Partager l’ordonnance',

    shareHeading: 'Ordonnance {reference}',
    sharePrescribedBy: 'Prescrite par {name}',
  },

  // ── Demander un renouvellement ──────────────────────────────────────────
  refill: {
    // « Demander un renouvellement » est tronqué par le titre sur une seule
    // ligne de ScreenHeader en 375 pt ; le sous-titre porte le verbe.
    title: 'Renouvellement',
    subtitle: 'Demandez un renouvellement à votre prescripteur.',
    loading: 'Chargement de vos traitements…',

    emptyTitle: 'Aucun traitement en cours',
    emptyBody:
      'Vous n’avez aucune ordonnance en cours à renouveler. Les ordonnances rédigées lors de vos visites apparaissent ici.',
    emptyCta: 'Voir mes traitements',

    // Aucun point d’accès de renouvellement n’existe. « Envoyée » ne doit
    // jamais se lire « approuvée ».
    notice:
      'Votre demande est envoyée sous forme de message sécurisé au médecin qui a prescrit le médicament. C’est lui qui décide de délivrer ou non un renouvellement — envoyer une demande ne vaut pas approbation.',

    whichMedication: 'Quel médicament ?',
    refillsLeft_one: '{count} renouvellement restant',
    refillsLeft_other: '{count} renouvellements restants',
    noRefillsLeft: 'Aucun renouvellement restant',
    refillDue: 'Renouvellement prévu le {date} · {left}',

    noteOverline: 'Quelque chose à ajouter ?',
    notePlaceholder:
      'Facultatif — par exemple ce qu’il vous reste, ou un effet indésirable remarqué',
    noteA11y: 'Note complémentaire pour votre prescripteur',

    previewOverline: 'Ce qui sera envoyé',
    previewTo: 'À {name}',
    previewToWithSpecialty: 'À {name} · {specialty}',
    yourPrescriber: 'votre prescripteur',

    noPrescriber:
      'Cette ordonnance n’a pas de prescripteur que nous puissions contacter. Adressez plutôt votre demande à un médecin de votre clinique, ou appelez la pharmacie indiquée sur l’ordonnance.',

    sending: 'Envoi…',
    send: 'Envoyer la demande de renouvellement',
    messageAnother: 'Écrire à un autre médecin',

    sentTitle: 'Demande envoyée',
    sentBody:
      'Votre demande concernant {drug} a été envoyée à {name}. La réponse vous parviendra dans vos messages. Un renouvellement n’est délivré qu’une fois approuvé.',
    sentDone: 'Terminé',
    openConversation: 'Ouvrir la conversation',

    failTitle: 'Nous n’avons pas pu envoyer votre demande',
    failOk: 'OK',
    failHint:
      'Ouvrez Messages pour vérifier si votre demande est parvenue à votre prescripteur avant de la renvoyer.',

    // Le corps du message composé pour le prescripteur.
    subject: 'Demande de renouvellement d’ordonnance',
    bodyAsk: 'Je souhaite demander le renouvellement de l’ordonnance pour {what}.',
    bodyQuantity: 'Dernière quantité dispensée : {quantity}.',
    bodyRefills_one: 'Mon ordonnance indique {count} renouvellement restant.',
    bodyRefills_other: 'Mon ordonnance indique {count} renouvellements restants.',
    bodyNoRefills: 'Mon ordonnance n’indique aucun renouvellement restant.',
    bodyPharmacy: 'Pharmacie souhaitée : {pharmacy}.',
  },

  // ── Commander en pharmacie ──────────────────────────────────────────────
  pharmacy: {
    title: 'Commander en pharmacie',
    subtitle: 'Où sont vos médicaments, et comment les obtenir.',
    loading: 'Chargement de vos ordonnances…',

    emptyTitle: 'Rien à retirer',
    emptyBody: 'Vous n’avez aucune ordonnance en cours en attente dans une pharmacie.',
    emptyCta: 'Voir mes traitements',

    // Aucun point d’accès de dispensation ni de livraison n’existe. Le dire
    // clairement.
    notice:
      'Les médicaments ne peuvent pas encore être payés ni livrés dans l’application. Vous pouvez appeler la pharmacie qui détient votre ordonnance, ou demander à votre prescripteur de la faire préparer pour retrait.',

    unassigned: 'Pharmacie pas encore attribuée',
    noPhone: 'Aucun numéro de téléphone enregistré',
    dispensed: 'Dispensé',
    awaitingCollection: 'En attente de retrait',
    itemA11y: 'Demander la préparation de {drug} à {pharmacy}',
    hint: 'Touchez un médicament pour demander à votre prescripteur de le faire préparer ici.',
    callPharmacy: 'Appeler la pharmacie',
    messageDoctor: 'Écrire à un médecin',

    callFailTitle: 'Nous n’avons pas pu ouvrir votre application téléphone',
    callFailBody: 'Appelez {pharmacy} au {phone} pour organiser la remise de vos médicaments.',

    noPrescriberTitle: 'Aucun prescripteur à contacter',
    noPrescriberBody:
      'Cette ordonnance n’a pas de prescripteur que nous puissions contacter. Appelez directement {pharmacy}, ou écrivez à un médecin de votre clinique.',

    confirmBody:
      'Nous allons envoyer à {name} un message demandant que ce médicament soit préparé à {pharmacy}. C’est une demande, pas une commande confirmée — la réponse vous parviendra dans vos messages.',
    confirmNotNow: 'Pas maintenant',
    confirmSend: 'Envoyer la demande',
    yourPrescriber: 'votre prescripteur',

    sentTitle: 'Demande envoyée',
    sentBody:
      'Votre message concernant {drug} a été envoyé à {name}. Attendez leur réponse avant de vous déplacer pour le retirer.',
    sentDone: 'Terminé',
    openConversation: 'Ouvrir la conversation',

    failTitle: 'Nous n’avons pas pu envoyer votre demande',
    failOk: 'OK',
    failHint:
      'Ouvrez Messages pour vérifier si votre demande est parvenue à votre prescripteur avant de la renvoyer.',

    subject: 'Demande de dispensation de médicaments',
    bodyAsk: 'Pourriez-vous faire préparer mes médicaments pour retrait à {pharmacy} ?',
    bodyQuantity: 'Quantité indiquée sur l’ordonnance : {quantity}.',
  },

  // ── Vocabulaire d’énumération — libellés d’AFFICHAGE des valeurs brutes ──
  // Les clés sont les valeurs brutes de l’API. Une valeur inconnue est mise en
  // capitale initiale par l’assistant de `meds/shared.tsx`, jamais affichée
  // comme un jeton de base de données. Les valeurs stockées ne changent pas.
  vocab: {
    status: {
      draft: 'Brouillon',
      active: 'Actif',
      completed: 'Terminé',
      stopped: 'Arrêté',
    },
    route: {
      oral: 'Voie orale',
      iv: 'Voie intraveineuse',
      im: 'Voie intramusculaire',
      sc: 'Voie sous-cutanée',
      topical: 'Voie topique',
      inhaled: 'Voie inhalée',
      rectal: 'Voie rectale',
      other: 'Autre voie',
    },
    prescriptionType: {
      outpatient: 'Ambulatoire',
      inpatient: 'Hospitalisation',
      discharge: 'Sortie',
      emergency: 'Urgence',
    },
  },
} as const;
