/**
 * `doctor` strings, French. One cluster per file so translators do not collide.
 * Contract: src/i18n/index.ts. Keys and order must match the en twin exactly.
 *
 * ── Le registre ───────────────────────────────────────────────────────────
 *
 * Ce sont les écrans du SOIGNANT, pas ceux du patient. L’abrégé clinique y est
 * correct : « SpO₂ », « CIM-10 », « analyte », « absent » pour un no-show. Le
 * vocabulaire vient du bureau (`lang/fr/`) et non d’une invention :
 *
 *   soignant (admin.provider) · consultation (encounters.title) · ordonnance ·
 *   orientation (referrals) · N° dossier (patients.medical_id) ·
 *   Boîte de résultats / accuser réception (inbox) · liste des problèmes ·
 *   posologie, voie, fréquence (clinical) · Prescrit / En cours / Terminé /
 *   Annulé (orders.status_*) · Planifié / Confirmé / Arrivé / Absent
 *   (appointments.status_*).
 *
 * `lang/fr/inbox.php` est un fichier aux accents cassés (« Accuser reception »).
 * On en reprend les TERMES, jamais les fautes : ici c’est « Accuser réception ».
 *
 * Apostrophes : U+2019 (’). Aucune n’est supprimée pour éviter un échappement —
 * il n’y a rien à échapper dans un littéral TypeScript entre apostrophes
 * simples ASCII.
 *
 * ── Les formulations à ne pas affaiblir ───────────────────────────────────
 *
 * `chart.allergy.*` : une liste vide n’est PAS un interrogatoire allergologique
 * négatif, et un échec de chargement n’est PAS une affirmation sur les
 * allergies. Les majuscules de « N’EST PAS » sont portées telles quelles.
 *
 * `result.*` : l’accusé de réception est un acte clinique. La confirmation
 * nomme le patient et l’examen ; rien n’est présenté comme fait tant que le
 * serveur n’a pas renvoyé l’accusé.
 */
export const doctor = {
  // ── Vocabulaire des énumérations, partagé par les écrans du dossier ─────
  // Les clés sont les valeurs brutes de l’API. Une valeur inconnue passe par
  // `chartShared.titleCase` — jamais un jeton de base de données à l’écran.
  vocab: {
    notRecorded: 'Non renseigné',

    encounterTypeFallback: 'Consultation',
    encounterType: {
      opd: 'Consultation externe',
      emergency: 'Urgence',
      follow_up: 'Suivi',
      telehealth: 'Télémédecine',
    },

    allergyTypeFallback: 'Allergie',
    allergyType: {
      drug: 'Médicamenteuse',
      food: 'Alimentaire',
      environmental: 'Environnementale',
      other: 'Autre',
    },

    severityFallback: 'Sévérité non renseignée',
    severity: {
      mild: 'Légère',
      moderate: 'Modérée',
      severe: 'Sévère',
      life_threatening: 'Pronostic vital engagé',
    },

    problemStatus: {
      active: 'Actif',
      inactive: 'Inactif',
      resolved: 'Résolu',
    },

    prescriptionStatus: {
      draft: 'Brouillon',
      active: 'En cours',
      completed: 'Terminé',
      stopped: 'Arrêté',
    },

    route: {
      oral: 'Orale',
      iv: 'Intraveineuse',
      im: 'Intramusculaire',
      sc: 'Sous-cutanée',
      topical: 'Locale',
      inhaled: 'Inhalée',
      rectal: 'Rectale',
      other: 'Autre voie',
    },

    orderTypeFallback: 'Prescription',
    orderType: {
      lab: 'Laboratoire',
      imaging: 'Imagerie',
      procedure: 'Acte',
      medication: 'Médicament',
    },

    orderStatus: {
      ordered: 'Prescrit',
      in_progress: 'En cours',
      completed: 'Terminé',
      cancelled: 'Annulé',
    },

    priority: {
      routine: 'Normal',
      urgent: 'Urgent',
      stat: 'STAT',
    },

    encounterStatus: {
      open: 'Ouverte',
      in_progress: 'En cours',
      closed: 'Clôturée',
    },

    sexFallback: 'Sexe non renseigné',
    sex: {
      male: 'Masculin',
      female: 'Féminin',
      other: 'Autre',
    },

    appointmentTypeFallback: 'Rendez-vous',
    patientFallback: 'Dossier patient',
    telemedicine: 'Téléconsultation',
  },

  // Jours abrégés pour les bandeaux d’agenda. Indexés par `Date.getDay()`.
  weekday: {
    '0': 'dim',
    '1': 'lun',
    '2': 'mar',
    '3': 'mer',
    '4': 'jeu',
    '5': 'ven',
    '6': 'sam',
  },

  // ── Temps relatif, côté soignant ────────────────────────────────────────
  when: {
    today: 'aujourd’hui',
    yesterday: 'hier',
    days_one: 'il y a {count} jour',
    days_other: 'il y a {count} jours',
    months_one: 'il y a {count} mois',
    months_other: 'il y a {count} mois',
    years_one: 'il y a {count} an',
    years_other: 'il y a {count} ans',

    reportedTodayAt: 'Aujourd’hui à {time}',
    reportedYesterdayAt: 'Hier à {time}',
    reportedOnAt: 'Le {date} à {time}',
    reportedUnknown: 'Heure de rendu non renseignée',
  },

  // ── DoctorHomeScreen ────────────────────────────────────────────────────
  home: {
    title: 'Aujourd’hui',
    loading: 'Chargement de votre journée…',
    inboxAction: 'Boîte de résultats',

    criticalBanner_one: '{count} résultat critique n’est pas accusé',
    criticalBanner_other: '{count} résultats critiques ne sont pas accusés',
    criticalBannerBody:
      'Un résultat critique reste non accusé tant que vous ne l’avez pas ouvert et confirmé. Ouvrez la boîte de résultats pour le revoir.',

    waitingOnYou: 'En attente de votre part',
    tileResults: 'Résultats à accuser',
    tileMessages: 'Messages de patients non lus',
    tileAppointments: 'Rendez-vous du jour',
    tileNothing: 'Rien en attente',
    tileWaiting: '{count} en attente',

    urgentResults: 'Résultats les plus urgents',
    viewAll: 'Tout voir',

    nextToday: 'À suivre aujourd’hui',
    fullSchedule: 'Agenda complet',
    nothingTodayTitle: 'Aucun rendez-vous aujourd’hui',
    nothingTodayBody: 'Vous n’avez aucun rendez-vous prévu aujourd’hui.',
    timeNotRecorded: 'Heure non renseignée',
    patientNotOnRecord: 'Patient non identifié au dossier',

    countedLive:
      'Ces chiffres sont comptés en direct sur le dossier hospitalier à chaque ouverture de cet écran.',
  },

  // ── DoctorScheduleScreen ────────────────────────────────────────────────
  schedule: {
    title: 'Mon agenda',
    requestsAction: 'Demandes de rendez-vous',
    day: 'Jour',
    week: 'Semaine',
    today: 'Aujourd’hui',
    loading: 'Chargement de votre agenda…',
    emptyDay: 'Aucun rendez-vous ce jour',
    emptyWeek: 'Aucun rendez-vous cette semaine',
    emptyBody:
      'Les rendez-vous qui vous sont affectés apparaîtront ici dès qu’ils seront pris.',

    countToSee: 'À voir',
    countCompleted: 'Terminés',
    countAwaiting: 'En attente',

    awaitingLink_one: '{count} rendez-vous de cette période attend encore votre décision',
    awaitingLink_other: '{count} rendez-vous de cette période attendent encore votre décision',

    minutes: '{count} min',
  },

  // ── AppointmentRequestsScreen ───────────────────────────────────────────
  requests: {
    title: 'Demandes de rendez-vous',
    subtitle: 'Prises de rendez-vous en attente de votre décision',
    loading: 'Chargement des demandes…',
    emptyTitle: 'Rien en attente de votre part',
    emptyBody:
      'Aucun rendez-vous des {days} prochains jours n’attend encore votre décision.',

    banner_one: '{count} demande',
    banner_other: '{count} demandes',
    bannerBody:
      'Accepter confirme le rendez-vous pour le patient. Refuser l’annule. Reprogrammer ouvre le dossier et déplace le rendez-vous d’office — l’API n’offre aucun moyen de proposer un horaire et d’attendre l’accord du patient.',

    reasonGiven: 'Motif indiqué',
    accept: 'Accepter',
    reschedule: 'Reprogrammer',
    decline: 'Refuser',

    declineTitle: 'Refuser ce rendez-vous ?',
    declineMessage:
      '{patient} — {type}, le {date} à {time}. Le refus annule le rendez-vous pour le patient. Cette action est irréversible depuis l’application.',
    declineConfirm: 'Refuser et annuler',

    checkBeforeAccept:
      'Vérifiez le statut de ce rendez-vous dans votre agenda avant de l’accepter à nouveau.',
    checkBeforeDecline:
      'Vérifiez le statut de ce rendez-vous dans votre agenda avant de le refuser à nouveau.',
    declinedByClinician: 'Refusé par le soignant',
  },

  // ── DoctorAppointmentDetailScreen ───────────────────────────────────────
  appointment: {
    title: 'Rendez-vous',
    subtitle: 'Fiche de visite du patient',
    loading: 'Chargement du rendez-vous…',

    openChart: 'Ouvrir le dossier patient',
    date: 'Date',
    time: 'Heure',
    visitMode: 'Mode de visite',
    where: 'Lieu',
    locationNotRecorded: 'Lieu non renseigné',

    visit: 'Visite',
    type: 'Type',
    reason: 'Motif',
    provider: 'Soignant',
    unassigned: 'Non attribué',
    priority: 'Priorité',
    checkedIn: 'Enregistré à l’accueil',
    cancelReason: 'Motif d’annulation',

    telemedicineTitle: 'Téléconsultation',
    telemedicineBody:
      'Cette visite est prévue en téléconsultation. La session vidéo ne peut être lancée que depuis l’EMR de bureau — l’API mobile n’expose pas encore de point d’entrée téléconsultation pour les soignants.',

    closedTitle: 'Ce rendez-vous est clôturé',
    closedCompleted:
      'La visite est marquée comme terminée. Plus rien ne peut être modifié ici.',
    closedOther:
      'Le rendez-vous est annulé ou enregistré comme absence ; il ne peut plus être modifié depuis l’application.',

    actions: 'Actions',
    checkIn: 'Enregistrer le patient',
    start: 'Démarrer la consultation',
    complete: 'Marquer comme terminé',
    closeReschedule: 'Fermer la reprogrammation',
    reschedule: 'Reprogrammer',
    noShow: 'Marquer comme absent',
    cancel: 'Annuler le rendez-vous',

    writeFailedTitle: 'Nous n’avons pas pu effectuer cette action',
    checkHint:
      'Rouvrez ce rendez-vous pour voir son statut actuel avant de réessayer.',

    noShowTitle: 'Marquer comme absent ?',
    noShowMessage:
      '{patient} — {type}, le {date} à {time}. Cela clôture le rendez-vous et consigne que le patient ne s’est pas présenté.',
    noShowConfirm: 'Marquer absent',

    cancelTitle: 'Annuler ce rendez-vous ?',
    cancelMessage:
      '{patient} — {type}, le {date} à {time}. Le rendez-vous est annulé pour le patient et ne peut pas être rétabli depuis ici.',
    cancelConfirm: 'Annuler le rendez-vous',
    cancelKeep: 'Le conserver',
    cancelledByClinician: 'Annulé par le soignant',

    moveTitle: 'Déplacer ce rendez-vous ?',
    moveMessage:
      '{patient} est déplacé au {date} à {time}. Le changement prend effet immédiatement — l’accord du patient n’est pas demandé.',
    moveConfirm: 'Déplacer le rendez-vous',

    moveTo: 'Déplacer au',
    moveHint:
      'Les horaires déjà pris dans votre propre agenda pour le jour choisi sont signalés. L’API ne publie aucune disponibilité à l’échelle de l’hôpital : rien d’autre n’est présenté comme libre.',
    diaryFailed:
      'Votre agenda de ce jour n’a pas pu être chargé ; les horaires déjà pris ne sont donc pas signalés.',
    slotBooked: 'Pris',
  },

  // ── PatientSearchScreen ─────────────────────────────────────────────────
  search: {
    title: 'Rechercher un patient',
    placeholder: 'Nom ou n° dossier',
    searching: 'Recherche…',

    promptTitle: 'Rechercher un patient',
    promptShort: 'Saisissez au moins {min} caractères.',
    promptBody:
      'Saisissez un nom ou un numéro de dossier. Cette application ne liste pas tous les patients — vous recherchez celui dont vous avez besoin.',

    noMatchTitle: 'Aucun patient ne correspond',
    noMatchBody:
      'Rien ne correspond à « {query} ». Essayez une autre orthographe, une partie du nom de famille, ou le numéro de dossier.',

    showingSome:
      'Affichage de {shown} résultats sur {total} — affinez la recherche pour voir les autres',
    matches_one: '{count} résultat',
    matches_other: '{count} résultats',

    years: '{count} ans',
    allergiesBadge: 'Allergies',
  },

  // ── PatientChartScreen ──────────────────────────────────────────────────
  chart: {
    title: 'Dossier patient',
    loadingPatient: 'Chargement du patient…',
    loadingChart: 'Chargement du dossier…',
    viewAll: 'Tout voir',

    age: 'Âge',
    sex: 'Sexe',
    bloodGroup: 'Groupe sanguin',
    dateOfBirth: 'Date de naissance',
    phone: 'Téléphone',
    location: 'Domicile',
    nextOfKin: 'Personne à contacter',

    activeProblems: 'Problèmes actifs',
    problemsEmptyOthers:
      'Aucun problème actif. La liste des problèmes contient des entrées inactives ou résolues.',
    problemsEmpty: 'La liste des problèmes est vide.',
    onset: 'Début {date}',

    currentMedications: 'Traitements en cours',
    medsEmpty:
      'Aucune ordonnance en cours dans les {scan} dernières consultations. Des ordonnances plus anciennes ou non actives peuvent exister — ouvrez la liste complète.',

    latestVitals: 'Derniers signes vitaux',
    vitalsFailed:
      'Les signes vitaux n’ont pu être lus pour aucune consultation récente. Il s’agit d’un échec de chargement, et non d’un dossier sans signes vitaux — tirez vers le bas pour réessayer.',
    vitalsEmpty:
      'Aucun signe vital enregistré dans les {scan} dernières consultations.',

    recentEncounters: 'Consultations récentes',
    encountersEmpty: 'Aucune consultation au dossier.',

    recentOrders: 'Prescriptions et résultats récents',
    ordersEmpty: 'Aucune prescription dans les {scan} dernières consultations.',

    // ---- Bloc allergies. CRITIQUE POUR LA SÉCURITÉ — ne pas affaiblir. ---
    allergy: {
      failedTitle: 'Les allergies n’ont pas pu être chargées',
      // `{error}` est le message du chargeur ; le reste est la partie qui doit
      // survivre intacte à la traduction — ce n’est PAS une affirmation sur
      // les allergies du patient.
      failedBody:
        '{error} Ceci N’EST PAS une affirmation selon laquelle le patient n’a aucune allergie — la liste n’a pas pu être lue du tout. Vérifiez les allergies par un autre moyen avant de prescrire.',

      loadingTitle: 'Vérification des allergies…',
      loadingBody:
        'La liste des allergies n’est pas encore chargée. Ne prenez pas l’absence d’alerte pour un feu vert.',

      noneTitle: 'Aucune allergie connue enregistrée',
      noneBody:
        'La liste des allergies de ce patient est vide. Une liste vide n’équivaut pas à un interrogatoire allergologique négatif — confirmez auprès du patient.',

      one: 'Allergie',
      many: 'Allergies ({count})',
      accessibility: 'Allergies : {list}',
      more: '+ {count} de plus — appuyez pour tout voir',

      retry: 'Réessayer',
      retrying: 'Nouvel essai…',
      staleWithTime:
        'Échec de l’actualisation — affichage des données chargées à {when}. Appuyez pour réessayer.',
      stale:
        'Échec de l’actualisation — affichage des données déjà chargées. Appuyez pour réessayer.',
    },

    // ---- Incomplétude ---------------------------------------------------
    incompleteLead: 'Cette liste est incomplète.',
    incompleteFailed:
      '{failed} des {total} visites récentes n’ont pas pu être lues ; les {noun} de ces visites manquent donc.',
    incompleteTruncated:
      'Seules les {scan} visites les plus récentes ont été parcourues — les {noun} plus anciens ne sont pas affichés.',
    nounMedications: 'traitements',
    nounResults: 'résultats',
    nounDiagnoses: 'diagnostics',
    nounRecordings: 'relevés',

    // ---- Carte des signes vitaux ----------------------------------------
    vitals: {
      bloodPressure: 'Tension artérielle',
      pulse: 'Pouls',
      temperature: 'Température',
      respiratoryRate: 'Fréquence respiratoire',
      spo2: 'SpO₂',
      weight: 'Poids',
      height: 'Taille',
      bmi: 'IMC',
      bloodGlucose: 'Glycémie',
      headCircumference: 'Périmètre crânien',

      bpRange: '{systolic} sur {diastolic} mmHg',
      usual: 'Habituel : {range}',
      noRange: 'Aucune plage habituelle disponible',
      isBand: '{label} : {band}',

      timeUnknown: 'Heure du relevé non précisée',
      recordedAgo: 'Relevé {ago}',
      noMeasurements: 'Ce relevé ne comporte aucune mesure.',
      footnote:
        'Les plages habituelles sont les intervalles adultes généraux utilisés par OPES dans tout le dossier. Elles servent au dépistage et ne constituent pas un objectif pour ce patient.',
    },

    readOnly:
      'Vue en lecture seule. La prescription, les demandes d’examens et la rédaction clinique se font dans l’EMR de bureau OPES, où s’exécutent les contrôles de sécurité et la signature.',
  },

  // ── PatientChartSectionScreen ───────────────────────────────────────────
  section: {
    loading: 'Chargement…',

    title: {
      summary: 'Synthèse du dossier',
      encounters: 'Consultations',
      diagnoses: 'Problèmes et diagnostics',
      medications: 'Traitements',
      labs: 'Laboratoire',
      imaging: 'Imagerie',
      vitals: 'Signes vitaux',
      allergies: 'Allergies',
      documents: 'Documents',
    },

    summaryTitle: 'Le dossier EST la synthèse',
    summaryBody:
      'Il n’y a pas de section synthèse distincte — le dossier patient constitue lui-même la vue d’ensemble.',
    notHereTitle: '{section} : section absente du dossier mobile',
    notHereBody:
      'Cette section fait partie du dossier de bureau OPES EMR. Le dossier mobile porte les allergies, les problèmes, les traitements, les signes vitaux, les consultations et les résultats.',
    openChart: 'Ouvrir le dossier',

    problemList: 'Liste des problèmes',
    problemListEmpty: 'Rien n’a été ajouté à la liste des problèmes de ce patient.',
    groupActive: 'Actifs',
    groupInactive: 'Inactifs',
    groupResolved: 'Résolus',
    groupOther: 'Autres',
    groupCount: '{label} ({count})',

    codedDiagnoses: 'Diagnostics codés lors des visites récentes',
    loadingDiagnoses: 'Chargement des diagnostics…',
    diagnosesEmpty:
      'Aucun diagnostic n’a été codé dans les {scan} dernières consultations.',

    scanWarning_one:
      '{count} consultation n’a pas pu être lue ; certains {noun} manquent donc dans cette liste.',
    scanWarning_other:
      '{count} consultations n’ont pas pu être lues ; certains {noun} manquent donc dans cette liste.',

    medsEmptyTitle: 'Aucune ordonnance trouvée',
    medsEmptyBody: 'Rien n’a été prescrit dans les {scan} dernières consultations.',
    medsActive: 'En cours',
    medsNotActive: 'Non actifs',
    dose: 'Dose',
    frequency: 'Fréquence',
    route: 'Voie',
    duration: 'Durée',
    instructions: 'Instructions',
    prescribed: 'Prescrit le',

    loadingVitals: 'Chargement des signes vitaux…',
    vitalsEmptyTitle: 'Aucun signe vital enregistré',
    vitalsEmptyBody:
      'Aucun signe vital n’a été relevé dans les {scan} dernières consultations.',

    encountersEmptyTitle: 'Aucune consultation',
    encountersEmptyBody: 'Ce patient n’a aucune consultation enregistrée.',
    showingRecent:
      'Affichage des {shown} consultations les plus récentes sur {total}.',
    chiefComplaint: 'Motif de consultation',
    subjective: 'Subjectif',
    objective: 'Objectif',
    assessment: 'Évaluation',
    plan: 'Plan',
    dischargeNote: 'Note de sortie',
    followUp: 'Suivi',

    noOrdersImaging: 'Aucune demande d’imagerie',
    noOrdersLab: 'Aucune demande de laboratoire',
    noOrdersOthers_one:
      'Rien de ce type n’a été prescrit dans les {scan} dernières consultations, bien que {count} autre prescription ait été faite.',
    noOrdersOthers_other:
      'Rien de ce type n’a été prescrit dans les {scan} dernières consultations, bien que {count} autres prescriptions aient été faites.',
    noOrdersAtAll: 'Rien n’a été prescrit dans les {scan} dernières consultations.',

    ordered: 'Prescrit le',
    clinicalNotes: 'Notes cliniques',
    reportedResult: 'Résultat rendu',
    itemisedFailed: 'Les résultats détaillés n’ont pas pu être chargés. {error}',
    loadingItemised: 'Chargement des résultats détaillés…',
    noItemisedWithSummary:
      'Aucune valeur d’analyte détaillée n’a été saisie pour cette demande — le résultat rendu ci-dessus est ce que le laboratoire a validé.',
    noItemised: 'Aucune valeur n’a encore été saisie pour cette demande.',
    labReference: 'Référence du laboratoire : {range}',
    noLabReference: 'Aucun intervalle de référence fourni par le laboratoire',
  },

  // ── ResultsInboxScreen ──────────────────────────────────────────────────
  inbox: {
    title: 'Boîte de résultats',
    subtitle: 'En attente de votre accusé de réception',
    loading: 'Chargement de votre boîte…',

    tabToReview: 'À revoir',
    tabCritical: 'Critiques',
    tabDone: 'Accusés',
    tabAll: 'Tous',
    tabWithCount: '{label} ({count})',

    emptyUnackTitle: 'Rien en attente de revue',
    emptyUnackBody: 'Tous les résultats qui vous ont été adressés ont été accusés.',
    emptyCriticalTitle: 'Aucun résultat critique',
    emptyCriticalBody:
      'Aucun résultat qui vous a été adressé n’a été signalé comme critique par le laboratoire ou le radiologue.',
    emptyAckedTitle: 'Aucun accusé pour l’instant',
    emptyAckedBody:
      'Les résultats que vous accusez — ici ou sur un poste de travail — seront listés ici.',
    emptyAllTitle: 'Aucun résultat pour l’instant',
    emptyAllBody:
      'Les résultats de vos demandes arriveront ici dès que le laboratoire les aura validés.',

    // CRITIQUE POUR LA SÉCURITÉ — le bandeau épinglé au-dessus d’un critique
    // non accusé.
    criticalBanner_one: '{count} résultat critique n’est pas accusé',
    criticalBanner_other: '{count} résultats critiques ne sont pas accusés',
    criticalBannerBody:
      'Les résultats critiques sont épinglés en haut de cette liste et doivent être accusés un par un.',

    // Le bandeau rouge d’une ligne critique. Crié à dessein, dans les deux
    // langues.
    rail: 'CRITIQUE — ACCUSER RÉCEPTION MAINTENANT',
    patientNotOnRecord: 'Patient non identifié au dossier',
    badgeAcknowledged: 'Accusé',
    badgeCritical: 'Critique',

    categoryFallback: 'Résultat',
    category: {
      lab_review: 'Labo critique',
      lab_result: 'Résultat de labo',
      laboratory: 'Résultat de labo',
      radiology: 'Compte rendu de radiologie',
    },
  },

  // ── ResultDetailScreen. CRITIQUE POUR LA SÉCURITÉ de bout en bout. ──────
  result: {
    title: 'Résultat',
    loading: 'Chargement de ce résultat…',

    criticalTitle: 'RÉSULTAT CRITIQUE — NON ACCUSÉ',
    criticalBody:
      'Ce résultat a été signalé comme critique lors de sa validation. Il reste non accusé tant que vous ne l’avez pas confirmé ci-dessous.',

    badgeAcknowledged: 'Accusé',
    badgeCritical: 'Critique',
    badgeAwaiting: 'En attente de revue',

    patient: 'Patient',
    patientNotOnRecord: 'Non identifié au dossier',
    medicalId: 'N° dossier',
    test: 'Examen',
    reported: 'Rendu',

    values: 'Valeurs',
    noValues:
      'Le laboratoire n’a pas validé de valeurs individuelles pour cette demande.',
    valuesCaption:
      'Les valeurs, les indicateurs et les intervalles de référence sont affichés exactement tels que le laboratoire les a validés. Lorsqu’aucun intervalle n’a été enregistré, aucun n’est affiché.',
    noFlag: 'Aucun indicateur enregistré',
    reference: 'Référence {range}',
    noReference: 'Aucun intervalle de référence enregistré par le laboratoire',

    report: 'Compte rendu',
    reportNumber: 'Compte rendu',
    reportStatus: 'Statut',
    radiologist: 'Radiologue',
    technique: 'Technique',
    findings: 'Constatations',
    impression: 'Impression',
    recommendation: 'Recommandation',

    noDetailTitle: 'Détail indisponible sur cet appareil',
    noDetailBody:
      'Le dossier sous-jacent n’a pas pu être chargé pour cette notification. Ce qui est affiché ci-dessus est la notification telle qu’elle a été émise — ouvrez le dossier du patient sur un poste de travail pour le compte rendu complet.',

    ackedBy: 'Accusé par {name} — {when}.',
    ackedByUnknown: 'un soignant',
    ackedCaption:
      'C’est le même accusé de réception que celui affiché par la boîte de résultats de bureau.',

    ackCritical: 'Accuser réception du résultat critique',
    ack: 'Accuser réception du résultat',
    ackCaption:
      'L’accusé de réception consigne votre nom et l’heure en regard de ce résultat sur le dossier hospitalier. Une confirmation vous sera demandée.',

    // La confirmation nomme le patient et l’examen à dessein : un appui
    // accidentel ne doit pas pouvoir devenir un accusé de réception.
    confirmCriticalTitle: 'Accuser réception de ce résultat CRITIQUE ?',
    confirmTitle: 'Accuser réception de ce résultat ?',
    confirmMessage:
      '{patient}{number} — {title}.\n\nVotre nom et l’heure seront consignés en regard de ce résultat sur le dossier hospitalier, et il apparaîtra également comme accusé dans la boîte de résultats de bureau. Cette action est irréversible depuis l’application.',
    confirmThisPatient: 'ce patient',
    confirmCta: 'Accuser réception',
    confirmCancel: 'Pas encore',

    // Le serveur a répondu, mais pas par un accusé. Jamais présenté comme fait.
    notAckedTitle: 'Non accusé',
    notAckedBody:
      'Le dossier hospitalier n’a pas renvoyé d’accusé de réception. Veuillez réessayer, ou accuser réception sur un poste de travail.',

    doneTitle: 'Accusé de réception enregistré',
    doneBody: 'Consigné pour {patient} à {when} au nom de {name}.',
    doneNameYou: 'vous',

    failedTitle: 'Impossible d’accuser réception',
    failedHint:
      'Rouvrez ce résultat — s’il apparaît comme accusé, l’accusé a bien été enregistré. Sinon, accusez-le à nouveau ou utilisez un poste de travail.',
  },

  // ── DoctorMessagesScreen ────────────────────────────────────────────────
  messages: {
    title: 'Messages',
    loading: 'Chargement de vos conversations…',

    folderWaiting: 'En attente de vous',
    folderAll: 'Toutes',
    folderArchived: 'Archivées',

    nobodyWaiting: 'Personne n’attend de réponse.',
    waiting_one: '{count} conversation attend votre réponse',
    waiting_other: '{count} conversations attendent votre réponse',
    defaultSubtitle: 'Vos conversations avec les patients et les confrères',

    metaPatient: 'Patient',
    metaColleague: 'Confrère',
    conversation: 'Conversation',

    emptyWaitingTitle: 'Rien en attente de votre part',
    emptyWaitingBody: 'Toutes les conversations qui vous sont adressées ont reçu une réponse.',
    emptyArchivedTitle: 'Aucune conversation archivée',
    emptyArchivedBody: 'Les conversations que vous archivez sont conservées ici.',
    emptyAllTitle: 'Aucune conversation pour l’instant',
    emptyAllBody:
      'Lorsqu’un patient ou un confrère vous écrit, la conversation apparaît ici.',
  },

  // ── DoctorMessageThreadScreen ───────────────────────────────────────────
  thread: {
    loading: 'Chargement de la conversation…',
    fallbackName: 'Conversation',

    emptyTitle: 'Aucun message',
    emptyBody: 'Rien n’a encore été écrit dans cette conversation.',

    placeholder: 'Répondre à votre patient…',
    closedNote: 'Cette conversation est close et ne peut plus recevoir de réponse.',

    optionsTitle: 'Options de la conversation',
    markUnread: 'Marquer comme non lue',
    reopen: 'Rouvrir',
    archive: 'Archiver',
    cancel: 'Annuler',

    // N’affirme jamais « non envoyé » lorsque l’issue est inconnue.
    sendFailedHint:
      'Tirez vers le bas pour actualiser cette conversation et voir si votre réponse est bien parvenue au patient.',
    sendFailedFallback:
      'Votre réponse n’a pas pu être envoyée. Vérifiez votre connexion et réessayez.',
    stateFailedHint:
      'Rouvrez Messages pour voir l’état actuel de la conversation.',
    stateFailedFallback: 'Cette modification n’a pas pu être enregistrée.',
  },

  // ── DoctorProfileScreen ─────────────────────────────────────────────────
  // Le compte du soignant lui-même, et le seul moyen de mettre fin à une
  // session sur un appareil partagé ou perdu. Rien ici ne s’adresse au patient.
  profile: {
    title: 'Profil',
    subtitle: 'Votre compte sur cet appareil',
    loading: 'Chargement de votre compte…',

    // Affiché lorsque GET /auth/me n’a pas pu être joint. Le compte ci-dessous
    // reste celui sous lequel l’appareil est connecté : la déconnexion demeure
    // donc toujours possible.
    refreshFailed:
      'Votre compte n’a pas pu être actualisé depuis le dossier hospitalier à l’instant. Ce qui est affiché ci-dessous est le compte sous lequel cet appareil est connecté.',

    // Les clés sont `users.role`. Un rôle inconnu est affiché « Personnel »
    // plutôt que sous forme de code de base de données.
    roleFallback: 'Personnel',
    role: {
      admin: 'Administrateur',
      doctor: 'Médecin',
      nurse: 'Infirmier(ère)',
      radiologist: 'Radiologue',
      lab_tech: 'Technicien de laboratoire',
      pharmacist: 'Pharmacien(ne)',
      receptionist: 'Réceptionniste',
      cashier: 'Caissier',
    },

    sectionAccount: 'Compte',
    rowName: 'Nom',
    rowRole: 'Rôle',
    rowEmail: 'E-mail',
    rowStatus: 'Statut du compte',
    statusActive: 'Actif',
    statusInactive: 'Inactif',

    // ── Profil professionnel ────────────────────────────────────────────────
    // Ce que voient les confrères et les patients : titre, spécialité,
    // expérience, biographie, langues, qualifications et salle de consultation.
    // Modifiable par le soignant, sauf les trois champs gérés par l’hôpital
    // (honoraires, devise, licence).
    sectionProfile: 'Profil professionnel',
    profileLoading: 'Chargement de votre profil…',
    // Une actualisation du profil a échoué alors que le compte ci-dessus reste affiché.
    profileRefreshFailed:
      'Votre profil professionnel n’a pas pu être chargé pour l’instant. Tirez vers le bas pour réessayer.',

    noProfileTitle: 'Aucun profil professionnel pour l’instant',
    noProfileBody:
      'Vos informations professionnelles n’ont pas encore été renseignées dans le dossier hospitalier. Ajoutez votre titre, votre spécialité et plus encore pour que confrères et patients sachent qui vous êtes.',
    addDetails: 'Ajouter mes informations',

    edit: 'Modifier',
    editProfile: 'Modifier le profil',
    editHint: 'Mettez à jour les informations visibles par les confrères et les patients. Les honoraires et la licence sont fixés par l’hôpital.',
    save: 'Enregistrer',
    cancel: 'Annuler',

    // Lignes d’affichage
    rowTitle: 'Titre',
    rowSpecialty: 'Spécialité',
    rowSubspecialty: 'Surspécialité',
    rowExperience: 'Expérience',
    rowLanguages: 'Langues',
    rowQualifications: 'Qualifications',
    rowRoom: 'Salle de consultation',
    rowFee: 'Honoraires de consultation',
    rowLicense: 'Licence',
    aboutTitle: 'À propos',
    bioEmpty: 'Aucune biographie ajoutée pour l’instant.',
    notSet: 'Non renseigné',
    experienceYears_one: '{count} an',
    experienceYears_other: '{count} ans',

    // Champs de saisie
    fieldTitle: 'Titre',
    fieldTitlePlaceholder: 'ex. Consultant',
    fieldSpecialty: 'Spécialité',
    fieldSpecialtyPlaceholder: 'ex. Cardiologie',
    fieldSubspecialty: 'Surspécialité',
    fieldSubspecialtyPlaceholder: 'ex. Électrophysiologie',
    fieldExperience: 'Années d’expérience',
    fieldExperiencePlaceholder: 'ex. 11',
    fieldRoom: 'Salle de consultation',
    fieldRoomPlaceholder: 'ex. 4',
    fieldBio: 'À propos de vous',
    fieldBioPlaceholder: 'Une courte biographie professionnelle.',
    fieldLanguages: 'Langues',
    fieldLanguagesHint: 'Séparez chaque langue par une virgule.',
    fieldQualifications: 'Qualifications',
    fieldQualificationsHint: 'Séparez chaque qualification par une virgule.',
    feeReadOnly: 'Fixés par l’hôpital — non modifiables ici.',

    // Badge de licence. Les clés sont le `license_status` de l’API ; une valeur
    // inconnue est affichée « Au dossier » plutôt que sous forme de code.
    licenseFallback: 'Au dossier',
    license: {
      active: 'Licence active',
      expired: 'Licence expirée',
      pending: 'Licence en attente',
      suspended: 'Licence suspendue',
    },

    // Codes de langue → noms. Un code non listé est affiché tel quel.
    langName: {
      en: 'Anglais',
      fr: 'Français',
    },

    // Photo
    photo: 'Photo',
    changePhoto: 'Changer la photo',
    addPhoto: 'Ajouter une photo',
    // Affiché sur mobile, où il n’y a pas de sélecteur intégré (aucune
    // dépendance de sélection d’image n’est incluse) : le soignant téléverse
    // depuis le poste de travail.
    photoDesktopOnly: 'Ajoutez ou changez votre photo depuis le système EMR de bureau OPES.',
    photoInvalid: 'Choisissez un fichier image de moins de 5 Mo.',
    photoFailedTitle: 'Photo non modifiée',
    photoCheckHint: 'Rouvrez votre profil pour voir si la nouvelle photo a bien été enregistrée.',

    // Échecs d’enregistrement — jamais présentés comme réussis lorsque l’issue est inconnue.
    saveFailedTitle: 'Profil non enregistré',
    saveCheckHint: 'Rouvrez votre profil pour voir si vos modifications ont été enregistrées.',

    sectionSession: 'Cet appareil',
    signOut: 'Déconnexion',
    signOutHint:
      'Déconnectez-vous avant de confier ce téléphone à quiconque. Tout ce qui est conservé sur cet appareil — noms de patients, résultats, conversations — est alors effacé.',

    confirmTitle: 'Se déconnecter de l’EMR OPES ?',
    confirmMessage:
      'Vous êtes connecté en tant que {name}. La déconnexion met fin à cette session sur cet appareil et efface tout ce qui y est conservé. Votre mot de passe sera de nouveau requis pour vous connecter.',
    confirmCta: 'Déconnexion',
    confirmCancel: 'Rester connecté',

    // N’affirme jamais que la session est close si elle ne l’est pas.
    failedTitle: 'Déconnexion impossible',
    failedBody:
      'Cette session est toujours ouverte sur cet appareil. Vérifiez votre connexion et réessayez — si elle ne se ferme pas, changez votre mot de passe sur un poste de travail.',
  },

  // ── WrongAppScreen ──────────────────────────────────────────────────────
  wrongApp: {
    header: 'OPES EMR',
    title: 'Cette application est destinée aux patients et aux soignants',
    signedInAs: 'Vous êtes connecté en tant que {name}. ',
    body:
      'Ce compte n’a pas de rôle clinique ; il n’y a donc encore rien ici pour lui. Utilisez l’EMR de bureau OPES pour votre travail, et connectez-vous ici avec un compte patient si vous en avez un.',
    signOut: 'Déconnexion',
  },
} as const;
