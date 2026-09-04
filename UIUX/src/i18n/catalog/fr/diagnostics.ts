/**
 * `diagnostics` — français hospitalier. Vocabulaire repris du bureau
 * (`lang/fr/lab.php`, `lang/fr/clinical.php`) : « Analyse », « Prélèvement »,
 * « Valeurs de référence », « Interprétation », « Prescripteur », « Soignant »,
 * indicateurs « Normal / Bas / Élevé / Anormal / Critique ».
 *
 * Apostrophes U+2019 (’). Ne jamais en supprimer une.
 * Mêmes clés, même ordre que le jumeau anglais.
 */
export const diagnostics = {
  // ── shared.tsx — états de chargement de ce module (et de l’imagerie) ─────
  async: {
    loading: 'Chargement…',
    linkTitle: 'Reliez votre identifiant santé',
    linkBody:
      'Ce compte n’est pas encore relié à un dossier médical. Reliez votre identifiant santé OPES pour voir vos résultats de laboratoire et d’imagerie.',
    linkCta: 'Relier mon identifiant santé',
    errorTitle: 'Chargement impossible',
    errorCta: 'Réessayer',
  },

  // ── Indicateurs par rapport aux valeurs de référence (énumération serveur) ─
  flag: {
    normal: 'Normal',
    low: 'Bas',
    high: 'Élevé',
    abnormal: 'Anormal',
    critical: 'Critique',
    pending: 'En attente de résultats',
  },

  // ── Énoncé pour lecteur d’écran ─────────────────────────────────────────
  // Un patient voyant lit l’indicateur dans une couleur et une pastille. La
  // couleur n’est pas un signal accessible : chaque ligne énoncée dit donc en
  // toutes lettres où se situe la valeur par rapport aux valeurs du
  // laboratoire — sans jamais inventer de seuil lorsqu’il n’en a envoyé aucun.
  a11y: {
    resultRow: '{analyte}, {value}. {range}. {status}',
    historyRow: '{date}, {value}. {range}. {status}',
    latestResult:
      '{analyte}, dernier résultat {value} le {date}. {range}. {status}',
    rangeUsual: 'Valeurs usuelles {range}',
    rangeNone: 'Valeurs usuelles : {noRange}',

    statusNormal: 'Normal, dans les valeurs usuelles',
    statusLow: 'Bas — sous les valeurs usuelles',
    statusHigh: 'Élevé — au-dessus des valeurs usuelles',
    statusAbnormal: 'Anormal — hors des valeurs usuelles',
    statusCritical:
      'Critique — hors de la plage de sécurité. Contactez votre équipe soignante.',
    statusUnflagged: 'Aucune comparaison avec des valeurs usuelles n’a été transmise',

    openTrend: 'Affiche l’évolution de cette analyse dans le temps',
    loading: 'Chargement',
    loaded: 'Chargé',
  },

  // ── En-têtes de tableau, partagés par DIA-002 / DIA-003 / DIA-004 ───────
  table: {
    test: 'Analyse',
    date: 'Date',
    result: 'Résultat',
    unit: 'Unité',
    referenceRange: 'Valeurs de référence',
    usualRange: 'Valeurs usuelles',
    status: 'Statut',
  },

  // ── DIA-001 Tableau de bord laboratoire et imagerie ─────────────────────
  dashboard: {
    title: 'Labo et imagerie',
    heroTitle: 'Laboratoire et imagerie',
    heroSubtitle:
      'Consultez vos résultats de laboratoire, vos examens d’imagerie et leur évolution.',
    loading: 'Chargement de vos examens…',

    // Énonce le fait, ne pose aucun diagnostic, oriente vers l’équipe soignante.
    criticalTitle_one: '{count} résultat critique demande votre attention',
    criticalTitle_other: '{count} résultats critiques demandent votre attention',
    criticalBody:
      '{analyte} est hors de la plage de sécurité, à {value}. Contactez votre équipe soignante.',
    criticalBodyGeneric:
      'L’un de vos résultats est hors de la plage de sécurité. Contactez votre équipe soignante.',
    reviewCritical: 'Voir le résultat critique',

    overview: 'Aperçu',
    statOrders: 'Demandes',
    statPending: 'En attente',
    statAbnormal: 'Anormaux',
    statCritical: 'Critiques',

    tabLabs: 'Résultats de laboratoire',
    tabImaging: 'Imagerie',

    recentLabs: 'Résultats de laboratoire récents',
    labsEmptyTitle: 'Aucun résultat de laboratoire',
    labsEmptyBody: 'Les résultats apparaissent ici dès que le laboratoire les valide.',
    labsEmptyCta: 'Demander une analyse',
    resultCount_one: '{count} résultat',
    resultCount_other: '{count} résultats',

    recentImaging: 'Examens d’imagerie récents',
    imagingEmptyTitle: 'Aucun examen d’imagerie',
    imagingEmptyBody:
      'Les radiographies, scanners et échographies demandés pour vous seront listés ici.',
    imagingEmptyCta: 'Réserver un examen d’imagerie',
    reportReady: 'Compte rendu prêt',
    awaitingReport: 'Compte rendu en attente',

    trackTrend: 'Suivre une évolution',
    trendHint: 'Voyez comment un paramètre a évolué au fil de vos derniers résultats.',

    quickActions: 'Actions rapides',
    actionRequest1: 'Demander',
    actionRequest2: 'une analyse',
    actionCollection1: 'Prélèvement',
    actionCollection2: 'du sang',
    actionImaging1: 'Historique',
    actionImaging2: 'd’imagerie',
    actionBook1: 'Réserver',
    actionBook2: 'une imagerie',

    latestPanel: 'Dernier bilan',
    latestMeta: '{date} · {count} résultats',
    openResultDetail: 'Ouvrir le détail du résultat',
  },

  // ── DIA-002 Détail du résultat de laboratoire ───────────────────────────
  result: {
    title: 'Résultat de laboratoire',
    heroTitle: 'Détail du résultat',
    heroSubtitle:
      'Consultez votre résultat d’analyse et l’interprétation de votre médecin.',
    loading: 'Chargement de votre résultat…',

    finalResult: 'Résultat définitif',
    orderId: 'N° de demande',
    sampleDate: 'Date de prélèvement',
    resultDate: 'Date du résultat',
    status: 'Statut',

    criticalTitle_one: '{count} résultat critique dans ce bilan',
    criticalTitle_other: '{count} résultats critiques dans ce bilan',
    criticalBody:
      '{values} — hors de la plage de sécurité. Contactez votre équipe soignante dès que possible.',

    orderingProvider: 'Prescripteur',
    careTeam: 'Équipe soignante',
    orderingClinician: 'Soignant prescripteur',
    contact: 'Contacter',

    summary: 'Synthèse des résultats',
    statNormal: 'Normaux',
    statLow: 'Bas',
    statHigh: 'Élevés',
    statCritical: 'Critiques',
    // « Total analyses » déborde la tuile quart-de-largeur en 375 pt ; la
    // grille ne compte que des analyses, le mot seul reste exact.
    statTotal: 'Analyses',

    testResults: 'Résultats des analyses',
    interpretation: 'Interprétation',
    signedBy: 'Signé électroniquement par : {name}',

    actionDownload1: 'Télécharger',
    actionDownload2: 'le PDF',
    actionShare1: 'Partager',
    actionShare2: 'le résultat',
    actionTrends1: 'Voir',
    actionTrends2: 'l’évolution',
    actionMessage1: 'Envoyer au',
    actionMessage2: 'médecin',
  },

  // ── DIA-003 Évolution du résultat ───────────────────────────────────────
  trend: {
    title: 'Évolution du résultat',
    heroTitle: 'Évolution du résultat',
    heroSubtitle: 'Consultez et suivez vos résultats d’analyse au fil du temps.',
    loading: 'Chargement de votre évolution…',

    noneAvailable: 'Aucun résultat représentable en graphique n’est encore disponible.',
    emptyTitle: 'Aucun résultat représentable',
    emptyBody:
      'Cette analyse n’a pas encore de résultat chiffré, il n’y a donc rien à représenter.',

    resultsFound_one: '{count} résultat trouvé',
    resultsFound_other: '{count} résultats trouvés',
    changeTest: 'Changer d’analyse',
    dateRange: 'Période',
    viewBy: 'Affichage par',
    viewByDate: 'Date',

    // Énonce le fait, sans diagnostic ni conseil, et oriente vers l’équipe.
    criticalTitle: 'Résultat critique — agissez maintenant',
    criticalBody:
      'Votre dernier {analyte} est à {value}, très loin des valeurs de référence de {range}. Contactez immédiatement votre équipe soignante.',
    messageDoctor: 'Écrire à mon médecin',

    normalRange: 'Valeurs de référence : {range}',
    latestResult: 'Dernier résultat ({date})',
    trendLabel: 'Évolution',
    dirRising: 'En hausse',
    dirFalling: 'En baisse',
    dirStable: 'Stable',
    vsFirst: 'par rapport au 1er résultat',

    history: 'Historique des résultats',

    chartUpperLimit: 'Limite supérieure : {value}',
    chartLowerLimit: 'Limite inférieure : {value}',

    actionDetail1: 'Voir le détail',
    actionDetail2: 'du résultat',
    actionDownload1: 'Télécharger',
    actionDownload2: 'le compte rendu',
    actionShare1: 'Partager',
    actionShare2: 'le compte rendu',
    actionMessage1: 'Envoyer au',
    actionMessage2: 'médecin',
  },

  // ── DIA-004 Compte rendu de laboratoire (complet) ───────────────────────
  report: {
    title: 'Compte rendu',
    heroTitle: 'Compte rendu de laboratoire',
    heroSubtitle:
      'Votre compte rendu de laboratoire complet, avec tous les résultats et l’interprétation du médecin.',
    loading: 'Chargement de votre compte rendu…',

    reportHeading: 'Compte rendu de laboratoire',
    patientName: 'Nom du patient',
    healthId: 'Identifiant santé',
    sexAge: 'Sexe / Âge',
    years: '{count} ans',
    orderedBy: 'Prescrit par',
    yourCareTeam: 'Votre équipe soignante',
    sampleDate: 'Date de prélèvement',
    reportDate: 'Date du compte rendu',
    notReportedYet: 'Pas encore rendu',
    status: 'Statut',
    priority: 'Priorité',

    criticalTitle_one: '{count} résultat hors de la plage de sécurité',
    criticalTitle_other: '{count} résultats hors de la plage de sécurité',
    criticalBody: '{values}. Contactez votre équipe soignante dès que possible.',

    flaggedTitle_one: '{count} résultat hors des valeurs usuelles',
    flaggedTitle_other: '{count} résultats hors des valeurs usuelles',
    flaggedBody:
      'Une valeur hors des valeurs usuelles ne constitue pas à elle seule un diagnostic. Votre équipe soignante lit ce compte rendu avec le reste de votre dossier — demandez-lui ce que cela signifie pour vous.',

    testResults: 'Résultats des analyses',
    pendingTitle: 'Les résultats ne sont pas encore rendus',
    pendingBody:
      'Le laboratoire n’a pas encore validé de résultat pour cette demande. Il apparaîtra ici dès qu’il sera signé.',

    // Le laboratoire n’a envoyé aucune borne pour ce paramètre. Une absence ne
    // doit jamais se lire comme un résultat normal, et l’application n’invente
    // jamais de seuil.
    noRange: 'Non communiquées',
    rangeNote:
      'Les valeurs usuelles sont celles du laboratoire, transmises avec chaque résultat. Lorsque le laboratoire n’en a envoyé aucune, ce compte rendu indique « {noRange} » plutôt que d’afficher des valeurs qui ne sont pas les siennes.',

    interpretation: 'Interprétation',
    signedBy: 'Signé électroniquement par {name}',
    yourCareTeamLower: 'votre équipe soignante',

    reportFile: 'Fichier du compte rendu',
    fileFallback: 'Compte rendu de laboratoire',
    noPdfTitle: 'Aucun PDF signé au dossier',
    noPdfBody:
      'Tout ce qui précède est votre compte rendu tel que le laboratoire l’a enregistré. Aucun PDF téléchargeable n’a été déposé pour cette demande — votre équipe soignante peut en émettre un, et vous pouvez lui écrire ci-dessous.',

    technicalCaption:
      'Numéros de référence utilisés par votre clinique et le laboratoire pour suivre cette demande. Ils ne vous servent que si on vous les demande.',
    factTestCode: 'Code de l’analyse',
    factOrderRef: 'Référence de la demande',
    factVisitRef: 'Référence de la visite',
    factDocumentRef: 'Référence du document',

    opening: 'Ouverture…',
    preparing: 'Préparation…',
    actionDownload1: 'Télécharger',
    actionDownload2: 'le PDF',
    actionShare1: 'Partager',
    actionShare2: 'le compte rendu',
    actionMessage1: 'Envoyer au',
    actionMessage2: 'médecin',
    actionPrint1: 'Imprimer',
    actionPrint2: 'le compte rendu',

    shareName: '{name} — compte rendu de laboratoire',

    noDownloadTitle: 'Aucun PDF à télécharger',
    noDownloadBody:
      'Aucun PDF signé n’a encore été déposé pour cette demande. Demandez à votre équipe soignante d’en émettre un.',
    noShareTitle: 'Rien à partager pour l’instant',
    noShareBody:
      'Le partage envoie le PDF signé, et aucun n’a encore été déposé pour cette demande.',
    noPrintTitle: 'Aucun PDF à imprimer',
    noPrintBody:
      'L’impression ouvre le PDF signé, et aucun n’a encore été déposé pour cette demande.',

    failDownloadTitle: 'Nous n’avons pas pu télécharger le compte rendu',
    failShareTitle: 'Nous n’avons pas pu partager le compte rendu',
    failOpenTitle: 'Nous n’avons pas pu ouvrir le compte rendu',
    failHint: 'Ouvrez le compte rendu depuis Documents pour vérifier s’il est bien arrivé.',
    failFallback: 'Le compte rendu n’a pas pu être préparé pour le moment.',
  },

  // ── DIA-006 Demander une analyse ────────────────────────────────────────
  request: {
    title: 'Demander une analyse',
    heroTitle: 'Demander une analyse',
    heroSubtitle:
      'Demandez une analyse de laboratoire à votre médecin. Il examine chaque demande avant qu’elle ne parvienne au laboratoire.',
    loading: 'Chargement du catalogue des analyses…',

    noThreadTitle: 'Ouvrez d’abord une conversation',
    noThreadBody:
      'Une demande d’analyse s’envoie à un médecin au sein d’une conversation, et vous n’en avez aucune d’ouverte. Écrivez à votre équipe soignante, puis revenez ici.',
    noThreadCta: 'Écrire à mon équipe soignante',

    // Un patient ne peut pas prescrire une analyse, seulement la demander.
    noticeTitle: 'Votre médecin approuve chaque demande',
    noticeBody:
      'Ceci envoie une demande, pas une prescription. Rien n’est enregistré au laboratoire tant qu’un médecin ne l’a pas examinée et approuvée.',

    step1: '1. Destinataire',
    yourCareTeam: 'Votre équipe soignante',

    step2: '2. Choisir une analyse',
    searchPlaceholder: 'Rechercher dans le catalogue des analyses',
    searchA11y: 'Rechercher dans le catalogue des analyses de laboratoire',
    clearSearch: 'Effacer la recherche',
    clearTest: 'Retirer l’analyse choisie',
    noMatch:
      'Aucune analyse du catalogue ne correspond à « {query} ». Essayez une recherche plus courte, ou décrivez ce dont vous avez besoin dans le champ ci-dessous.',

    step3: '3. Dans quel délai',
    urgencyHint:
      'Votre médecin fixe l’urgence définitive — ceci lui indique dans quel délai vous pensez en avoir besoin.',

    step4: '4. {label}',
    notesLabelFallback: 'Pourquoi vous demandez cette analyse',
    notesPlaceholder:
      'Décrivez les symptômes ou la raison pour laquelle vous demandez cette analyse…',

    sending: 'Envoi…',
    submit: 'Envoyer la demande',
    readyHint: 'Choisissez une conversation et une analyse pour envoyer votre demande.',

    sentTitle: 'Demande envoyée',
    sentBody:
      'Votre médecin a reçu la demande et l’approuvera ou la refusera. Vous pouvez la suivre dans la conversation — rien n’est enregistré tant qu’il ne l’a pas approuvée.',
    sentClose: 'Fermer',
    openConversation: 'Ouvrir la conversation',

    failTitle: 'Nous n’avons pas pu envoyer la demande',
    failHint:
      'Ouvrez la conversation pour vérifier si la demande est bien passée avant de la renvoyer.',
    failFallback: 'La demande n’a pas pu être envoyée pour le moment.',
  },

  // ── DIA-005 Rendez-vous de prélèvement ──────────────────────────────────
  collection: {
    title: 'Prélèvement',
    heroTitle: 'Rendez-vous au laboratoire',
    heroSubtitle:
      'Où et quand donner votre prélèvement, et les analyses que le laboratoire attend.',
    loading: 'Chargement de votre rendez-vous de prélèvement…',

    upcoming: 'À venir',
    statDuration: 'Durée',
    statStatus: 'Statut',
    statVisit: 'Visite',
    visitInPerson: 'Sur place',
    visitVideo: 'Vidéo',
    statBookedOn: 'Réservé le',

    patientInformation: 'Informations patient',
    years: '{count} ans',
    profile: 'Profil',

    orderDetails: 'Détail de la demande',
    yourCareTeam: 'Votre équipe soignante',
    laboratory: 'Laboratoire',
    view: 'Voir',
    reasonLabel: 'Motif de cette visite',

    location: 'Lieu de prélèvement',
    locationFallback: 'Votre clinique vous confirmera la salle',
    directions: 'Itinéraire',

    // Aucun conseil de préparation n’est inventé ici : il vient de l’équipe
    // qui a prescrit les analyses.
    beforeTitle: 'Avant de venir',
    beforeBody:
      'Apportez une pièce d’identité valide et votre identifiant santé. Toute préparation à ces analyses — le jeûne, par exemple — est indiquée par l’équipe qui les a prescrites ; en cas de doute, adressez-vous à elle.',

    noAppointmentTitle: 'Aucun rendez-vous de prélèvement',
    noAppointmentBody:
      'Vous n’avez aucune visite de prélèvement au dossier. Si une analyse a été prescrite pour vous, votre équipe soignante peut programmer le prélèvement, ou vous pouvez le lui demander ici.',
    noAppointmentCta: 'Demander une analyse',

    awaitingSample: 'Analyses en attente de prélèvement',
    awaitingEmpty: 'Aucune analyse n’attend actuellement un prélèvement de votre part.',
    orderedOn: '{priority}  •  Prescrite le {date}',

    otherVisits: 'Autres visites au laboratoire',
    otherVisitMeta: '{time}  •  {status}',

    technicalCaption:
      'Numéros de référence utilisés par votre clinique pour suivre cette visite. Ils ne vous servent que si on vous les demande.',
    factAppointmentRef: 'Référence du rendez-vous',
    factBookedThrough: 'Réservé via',

    reschedule: 'Reprogrammer',
    cancelVisit: 'Annuler la visite',
    checkIn: 'Commencer l’enregistrement',
  },
} as const;
