/**
 * French catalogue — français hospitalier, pas de traduction automatique.
 *
 * Terms are taken from the desktop catalogue in `lang/fr/` so the two halves of
 * the product say the same thing: « Agenda » (appointments.schedule),
 * « Identifiant santé » (patients.health_id), « Dossier médical »,
 * « Ordonnance », « Renouvellement » (pharmacy.refill_eligible),
 * « Résultats de laboratoire » (clinical.lab_results), « soignant » for a
 * clinician. Grep `lang/fr/` before inventing a word.
 *
 * Apostrophes are U+2019 (’) — correct French typography, and no escaping to
 * get wrong. Never delete one.
 *
 * Same keys, same order as `en.ts`. `npm run i18n:check` enforces it.
 */
import type { Catalog } from '../../engine';

export const core = {
  // ── Vocabulaire partagé ─────────────────────────────────────────────────
  common: {
    save: 'Enregistrer',
    saveChanges: 'Enregistrer les modifications',
    saving: 'Enregistrement…',
    cancel: 'Annuler',
    close: 'Fermer',
    retry: 'Réessayer',
    loading: 'Chargement…',
    view: 'Voir',
    viewAll: 'Voir tout',
    learnMore: 'En savoir plus',
    edit: 'Modifier',
    yes: 'Oui',
    no: 'Non',
    none: '—',
    notRecorded: 'Non renseigné',
    unknown: 'Inconnu',
    continue: 'Continuer',
    signIn: 'Connexion',
    signOut: 'Déconnexion',
    complete: 'Complet',
    incomplete: 'Incomplet',
    verified: 'Vérifié',
    unverified: 'Non vérifié',
    moreOptions: 'Autres actions',
    notifications: 'Notifications',
    today: 'Aujourd’hui',
    yesterday: 'Hier',
  },

  // ── Coque de l’application ──────────────────────────────────────────────
  tabs: {
    home: 'Accueil',
    // Onglet court : « Dossier médical » ne tient pas en 11 pt sur la barre.
    records: 'Dossier',
    recordsFull: 'Dossier médical',
    quickAdd: 'Ajout rapide',
    messages: 'Messages',
    profile: 'Profil',
    schedule: 'Agenda',
    patients: 'Patients',
    results: 'Résultats',
  },

  quickAdd: {
    title: 'Ajout rapide',
    bookAppointment: 'Prendre rendez-vous',
    requestLabTest: 'Demander un examen de laboratoire',
    requestRefill: 'Demander un renouvellement',
    messageProvider: 'Écrire à un soignant',
    showHealthId: 'Afficher mon identifiant santé',
  },

  // ── Authentification ────────────────────────────────────────────────────
  auth: {
    login: {
      title: 'Accès sécurisé à votre santé',
      subtitle:
        'Connectez-vous à votre compte OPES EMR et gérez votre santé à tout moment, où que vous soyez.',
      welcomeBack: 'Bon retour',
      emailPlaceholder: 'E-mail ou numéro de téléphone',
      passwordPlaceholder: 'Mot de passe',
      submit: 'Se connecter',
      sessionExpired: 'Votre session a expiré. Veuillez vous reconnecter.',
      badCredentials: 'E-mail ou mot de passe incorrect.',
      forgotPassword: 'Mot de passe oublié ?',
      // Solution provisoire honnête : il n’existe pas encore d’endpoint de
      // réinitialisation en libre-service ; ceci ne doit donc rien prétendre
      // envoyer. On explique au patient comment retrouver l’accès via
      // l’établissement.
      forgotTitle: 'Retrouver l’accès à votre compte',
      forgotBody:
        'Le mot de passe ne peut pas encore être réinitialisé depuis l’application. Pour retrouver l’accès à votre compte, contactez votre établissement de soins sur place ou par téléphone et communiquez votre identifiant santé OPES. L’accueil pourra vérifier votre identité et vous aider à définir un nouveau mot de passe.',
      demoTitle: 'Essayez sans créer de compte',
      demoBody:
        'Compte de démonstration prérempli avec des rendez-vous, des visites et des ordonnances d’exemple.',
      demoCta: 'Continuer avec le compte démo',
      demoLoading: 'Connexion…',
      demoUnavailable: 'Le compte de démonstration n’est pas disponible pour le moment.',
      noAccount: 'Vous n’avez pas de compte ?',
      createAccount: 'Créer un compte',
      footerNote:
        'Vos données sont protégées par un chiffrement et des normes de sécurité de premier plan.',
    },
    signup: {
      title: 'Créer votre compte',
      subtitle: 'Rejoignez OPES EMR et gardez la maîtrise de vos informations de santé.',
      fullName: 'Nom complet',
      email: 'Adresse e-mail',
      phone: 'Numéro de téléphone',
      dateOfBirth: 'Date de naissance (AAAA-MM-JJ)',
      password: 'Mot de passe',
      confirmPassword: 'Confirmer le mot de passe',
      genderFemale: 'Féminin',
      genderMale: 'Masculin',
      genderOther: 'Autre',
      privacyTitle: 'Votre vie privée compte',
      privacyBody:
        'Vos informations sont chiffrées et ne seront jamais partagées sans votre consentement.',
      submit: 'Continuer',
      failed: 'Impossible de créer votre compte. Veuillez vérifier vos informations.',
      footerNote:
        'Sécurisé. Confidentiel. Interopérable.\nUn patient. Un dossier. Des soins sans limites.',
    },
  },

  // ── Profil et paramètres (CORE-008) ─────────────────────────────────────
  profile: {
    title: 'Profil et paramètres',
    subtitle: 'Gérez votre profil, vos préférences et les paramètres de l’application.',
    loading: 'Chargement de votre profil…',
    healthIdLabel: 'Identifiant santé OPES : {id}',
    // Indication vocale : la ligne ressemble à du texte et rien n’indique
    // qu’elle est activable ni qu’elle copie. Le glyphe de 16 px est le seul
    // indice visuel.
    copyHealthIdHint: 'Copie votre identifiant santé pour le coller ailleurs',
    patientSince: 'Patient depuis {year}',

    quickOverview: 'Aperçu rapide',
    tileHealthId: 'Identifiant santé',
    tileHealthRecord: 'Dossier médical',
    tileUpcomingAppointment: 'Rendez-vous à venir',
    tileActiveMedications: 'Traitements en cours',

    accountSettings: 'Paramètres du compte',
    personalInformation: 'Informations personnelles',
    personalInformationHint: 'Mettre à jour vos informations personnelles',
    contactEmergency: 'Contact et urgence',
    contactEmergencyHint: 'Gérer vos coordonnées et votre contact d’urgence',
    security: 'Sécurité',
    securityHint: 'Mot de passe, biométrie et sécurité du compte',
    privacyData: 'Confidentialité et données',
    privacyDataHint: 'Gérer vos données, vos autorisations et le partage',
    notificationPreferences: 'Préférences de notification',
    notificationPreferencesHint: 'Gérer vos paramètres de notification',
    language: 'Langue',
    languageHint: 'Choisissez votre langue préférée',

    preferences: 'Préférences',
    theme: 'Thème',
    themeLight: 'Clair',
    themeDark: 'Sombre',
    themeSystem: 'Selon le système',
    units: 'Unités',
    unitsMetric: 'Métrique (kg, cm)',
    unitsImperial: 'Impérial (lb, po)',
    dateFormat: 'Format de date',
    timeFormat: 'Format d’heure',
    time24h: '24 heures',
    time12h: '12 heures',

    accountSecurity: 'Sécurité du compte',
    accountSecure: 'Votre compte est sécurisé',
    accountNeedsAttention: 'Votre compte nécessite votre attention',
    lastLogin: 'Dernière connexion : {value}',
    device: 'Appareil : {value}',
    unknownDevice: 'Appareil inconnu',
    noRecentSignIn: 'Aucune connexion récente enregistrée',
    manageSecurity: 'Gérer la sécurité',

    // Déconnexion. Ce téléphone peut être partagé à l’accueil d’une clinique ;
    // le patient doit pouvoir mettre fin à sa propre session — la même que
    // celle de l’application du médecin.
    signOutSection: 'Session',
    signOutHint: 'Se déconnecter sur cet appareil. Votre dossier et tout ce qui est enregistré pour une consultation hors ligne sont effacés de ce téléphone.',
    signOutConfirmTitle: 'Se déconnecter ?',
    signOutConfirmMessage:
      'Vous serez déconnecté sur cet appareil, et votre dossier de santé ainsi que vos données hors ligne seront supprimés de ce téléphone. Vous pourrez vous reconnecter à tout moment.',
    signOutConfirmCta: 'Se déconnecter',
    signOutFailedTitle: 'Impossible de se déconnecter',
    signOutFailedBody: 'Une erreur est survenue lors de la déconnexion. Veuillez réessayer.',

    privacyBannerTitle: 'Vos données de santé sont confidentielles et protégées.',
    privacyBannerBody:
      'Nous utilisons un chiffrement conforme aux normes du secteur pour protéger vos informations.',

    // Feuilles
    personalSubtitle:
      'Le nom, la date de naissance et l’identifiant santé sont vérifiés à l’accueil et ne peuvent pas être modifiés ici.',
    contactSubtitle: 'Qui devons-nous appeler en cas d’urgence ?',
    fieldPhone: 'Numéro de téléphone',
    fieldEmail: 'Adresse e-mail',
    fieldAddress: 'Adresse',
    fieldAddressPlaceholder: 'Rue, quartier',
    fieldCity: 'Ville',
    fieldKinName: 'Nom du contact d’urgence',
    fieldKinNamePlaceholder: 'Nom complet',
    fieldKinPhone: 'Téléphone du contact d’urgence',
    fieldRelation: 'Lien de parenté',
    fieldRelationPlaceholder: 'Sœur, conjoint, …',
    saveFailed: 'Impossible d’enregistrer vos informations. Veuillez réessayer.',
    preferenceSaveFailed: 'Impossible d’enregistrer cette préférence.',
    settingSaveFailed: 'Impossible d’enregistrer ce paramètre.',

    securitySheetSubtitle:
      'Les changements de mot de passe se font à l’accueil pour le moment.',
    privacySheetSubtitle:
      'Vous décidez de l’usage fait de votre dossier au-delà de vos propres soins.',

    notifyAppointments: 'Rendez-vous',
    notifyAppointmentsHint: 'Rappels, confirmations et modifications',
    notifyMedications: 'Traitements',
    notifyMedicationsHint: 'Rappels de prise et alertes de renouvellement',
    notifyLabResults: 'Résultats de laboratoire et d’imagerie',
    notifyLabResultsHint: 'Me prévenir dès qu’un résultat est disponible',
    notifyMessages: 'Messages',
    notifyMessagesHint: 'Nouveaux messages de votre équipe soignante',
    notifyBilling: 'Facturation',
    notifyBillingHint: 'Factures et reçus de paiement',
    channelPush: 'Notifications push',
    channelPushHint: 'Sur cet appareil',
    channelEmail: 'E-mail',
    channelEmailHint: 'À votre adresse e-mail enregistrée',
    channelSms: 'SMS',
    channelSmsHint: 'À votre numéro de téléphone enregistré',
    biometric: 'Déverrouillage biométrique',
    biometricHint: 'Utiliser Face ID ou une empreinte digitale pour ouvrir l’application',
    twoFactor: 'Authentification à deux facteurs',
    twoFactorHint: 'Demander un code à usage unique à la connexion',
    shareResearch: 'Partager des données anonymisées pour la recherche',
    shareResearchHint: 'N’inclut jamais d’élément permettant de vous identifier',
  },

  // ── Langues proposées par le sélecteur ──────────────────────────────────
  languages: {
    'en-GB': 'English',
    'fr-FR': 'Français',
  },

  // ── CORE-006 Tableau de bord ────────────────────────────────────────────
  home: {
    loading: 'Chargement de votre synthèse santé…',
    // Le message d’accueil est de l’habillage, pas du contenu clinique : il est
    // généré sur l’appareil et localisé selon l’heure, jamais repris du serveur
    // (qui ne renvoie que l’anglais). matin < 12 h ≤ après-midi < 18 h ≤ soir.
    greetingMorning: 'Bonjour',
    greetingAfternoon: 'Bon après-midi',
    greetingEvening: 'Bonsoir',
    tagline: 'Votre santé. Connectée. Sécurisée. Partout.',
    idCardTitle: 'Identifiant santé OPES',
    idCardValue: 'N° : {id}',
    idCardLink: 'Voir l’identifiant santé',

    summaryTitle: 'Synthèse santé',
    viewAll: 'Voir tout',
    overallHealth: 'État général',
    // État honnête pour un dossier tout neuf, sans rien à évaluer — affiché à la
    // place d’un score « parfait » dénué de sens.
    noScoreYet: 'Données insuffisantes',
    // Le libellé de la tranche de score, dérivé du score — c’est de l’habillage,
    // pas du contenu clinique : localisé sur l’appareil plutôt que rendu en
    // anglais du serveur sous une interface française.
    scoreGood: 'Bon',
    scoreFair: 'Moyen',
    scoreNeedsAttention: 'À surveiller',
    scoreAtRisk: 'À risque',
    lastCheckup: 'Dernier bilan',
    noVisitRecorded: 'Aucune visite enregistrée',
    nextAppointment: 'Prochain rendez-vous',
    nothingBooked: 'Aucun rendez-vous',
    healthIdStatus: 'Statut de l’identifiant',
    statusVerified: 'Vérifié',
    statusPending: 'En attente',
    allSystemsConnected: 'Tout est connecté',
    verificationNeeded: 'Vérification requise',

    // « il y a n jours », sous la date du dernier bilan.
    agoDays_one: 'Il y a {count} jour',
    agoDays_other: 'Il y a {count} jours',
    agoMonths_one: 'Il y a {count} mois',
    agoMonths_other: 'Il y a {count} mois',
    agoYears_one: 'Il y a {count} an',
    agoYears_other: 'Il y a {count} ans',

    quickActions: 'Actions rapides',
    customize: 'Personnaliser',
    // Les tuiles coupent ces libellés sur deux lignes, telles quelles.
    actionBook: 'Prendre\nrendez-vous',
    actionLabs: 'Voir mes\nrésultats',
    actionPrescriptions: 'Mes\nordonnances',
    actionRecords: 'Dossier\nmédical',
    actionProvider: 'Trouver un\nsoignant',

    recentRecords: 'Éléments récents du dossier',
    noRecords: 'Aucun élément pour le moment',
    noRecordsHint: 'Vos résultats et comptes rendus de visite apparaîtront ici.',
    typeLabResult: 'Résultat de laboratoire',
    typeImaging: 'Imagerie',
    typeEncounter: 'Consultation générale',
    resultAbnormal: 'Anormal',
    resultNormal: 'Normal',
    actionViewResult: 'Voir le résultat',
    actionViewReport: 'Voir le compte rendu',
    actionViewSummary: 'Voir le récapitulatif',

    currentMedications: 'Traitements en cours',
    noMedications: 'Aucun traitement en cours pour le moment.',
    nextDose: 'Prochaine prise : {day}, {time}',
    noDoseScheduled: 'Aucune prise programmée',

    healthTip: 'Conseil santé',
    noTips: 'Aucun conseil disponible pour le moment.',
  },

  // ── CORE-007 Mon identifiant santé ──────────────────────────────────────
  healthId: {
    title: 'Mon identifiant santé',
    subtitle: 'Votre identité unique dans tout l’écosystème de soins OPES.',
    about: 'À propos',
    loading: 'Chargement de votre identifiant santé…',

    shareSubject: 'Mon identifiant santé OPES',
    shareQrSubject: 'QR code de l’identifiant santé OPES',
    shareCardSubject: 'Carte d’identifiant santé OPES',
    shareBody: '{name} — Identifiant santé OPES {id}\nDélivré par {issuer}\n{payload}',

    tileShare: 'Partager',
    tileShareCaption: 'En toute sécurité',
    tileDepartments: 'Établissements',
    tileDepartmentsCaption: '{count} connectés',
    tileActivity: 'Activité',
    tileActivityCaption: 'Accès récents',
    tileDownload: 'Télécharger',
    tileDownloadCaption: 'Enregistrer le QR',
    tilePrint: 'Imprimer',
    tilePrintCaption: 'Version imprimable',

    cardBrandSub: 'IDENTIFIANT SANTÉ',
    cardStatusLabel: 'STATUT',
    statusVerified: 'Vérifié',
    statusPending: 'En attente',
    statusSuspended: 'Suspendu',
    fieldHealthId: 'Identifiant santé',
    fieldFullName: 'Nom complet',
    fieldDateOfBirth: 'Date de naissance',
    fieldGender: 'Sexe',
    fieldPhone: 'Téléphone',
    scanToVerify: 'Scanner pour vérifier',
    lastUpdated: 'Mise à jour : {date}',
    cardFootCopy:
      'Cet identifiant vous relie en toute sécurité aux hôpitaux, cliniques, laboratoires, pharmacies et autres soignants.',
    cardFootBrand: 'IDENTIFIANT SANTÉ OPES',
    cardFootBrandSub: 'PROPULSÉ PAR LA COUCHE D’INTEROPÉRABILITÉ OPES',

    ecosystemTitle: 'CONNECTÉ À L’ÉCOSYSTÈME DE SOINS',
    activeConnections_one: '{count} connexion active',
    activeConnections_other: '{count} connexions actives',
    groupHospitals: 'Hôpitaux',
    groupClinics: 'Cliniques',
    groupLaboratories: 'Laboratoires',
    groupPharmacies: 'Pharmacies',
    groupImaging: 'Centres d’imagerie',
    connected: '{count} connecté(s)',

    securityCopy:
      'Votre identifiant santé n’appartient qu’à vous et il est protégé par des normes de sécurité de premier plan.',
    securityLink: 'En savoir plus sur l’identifiant santé OPES',
  },

  // ── CORE-003 Écran de bienvenue ─────────────────────────────────────────
  onboarding: {
    welcomeTitle: 'Bienvenue sur OPES EMR',
    welcomeTagline: 'Votre santé. Votre dossier. Votre contrôle.',
    welcomeBody:
      'Un seul endroit pour toutes vos informations de santé — vos visites, vos résultats, vos médicaments et votre équipe soignante.',

    featuresTitle: 'Tout ce qu’il vous faut, au même endroit',
    featuresBody: 'Six choses que vous pouvez faire dès votre connexion.',
    featureRecords: 'Dossier médical',
    featureRecordsBody: 'Vos antécédents médicaux, dès que vous en avez besoin.',
    featureLabs: 'Laboratoire et imagerie',
    featureLabsBody: 'Vos résultats et comptes rendus dès qu’ils sont disponibles.',
    featureAppointments: 'Rendez-vous',
    featureAppointmentsBody: 'Prenez, reportez et enregistrez-vous depuis votre téléphone.',
    featureBilling: 'Facturation et assurance',
    featureBillingBody: 'Factures, paiements et prise en charge au même endroit.',
    featurePrescriptions: 'Ordonnances',
    featurePrescriptionsBody: 'Consultez vos traitements et demandez un renouvellement.',
    featureMessaging: 'Messagerie sécurisée',
    featureMessagingBody: 'Écrivez à votre équipe soignante sans quitter l’application.',

    valuesTitle: 'Construit autour de votre dossier',
    valuesBody: 'Trois principes qui restent vrais où que vous soyez soigné.',
    valueSecure: 'Sécurisé et confidentiel',
    valueSecureBody: 'Votre dossier est chiffré, et vous décidez avec qui vous le partagez.',
    valueConnected: 'Des soins connectés',
    valueConnectedBody:
      'Médecins, laboratoires, hôpitaux et pharmacies travaillent sur le même dossier.',
    valueAccessible: 'Toujours accessible',
    valueAccessibleBody:
      'Vos informations de santé vous suivent, sur tout appareil depuis lequel vous vous connectez.',
    safetyTitle: 'Vos données sont en sécurité',
    safetyBody:
      'Votre dossier est chiffré en transit et au repos, et chaque accès à celui-ci est journalisé.',

    pageOf: 'Page {current} sur {total}',
    next: 'Suivant',
    goToDashboard: 'Aller à mon tableau de bord',
    getStarted: 'Commencer',
    haveAccount: 'J’ai déjà un compte',
  },

  // ── Écran de démarrage ──────────────────────────────────────────────────
  splash: {
    tagline1: 'UN PATIENT. UN DOSSIER.',
    tagline2: 'DES SOINS SANS LIMITES.',
    markSecure: 'Sécurisé',
    markInteroperable: 'Interopérable',
    markCloudReady: 'Prêt pour le cloud',
    markDataDriven: 'Piloté par les données',
    loading: 'Chargement…',
  },

  // ── Un écran pas encore livré ───────────────────────────────────────────
  placeholder: {
    title: '{name} arrive bientôt',
    body: 'Nous construisons encore cette partie de l’application. En attendant, votre équipe soignante peut s’en charger pour vous — appelez la formation sanitaire ou passez à l’accueil.',
    goBack: 'Retour',
  },

  // ── src/components — chrome partagé par tous les écrans ─────────────────
  components: {
    viewAll: 'Voir tout',
    ok: 'OK',
    close: 'Fermer',
    goBack: 'Retour',
    openProfile: 'Ouvrir le profil',
    moreOptions: 'Autres actions',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',

    listLoadFailed: 'Impossible de charger ces informations. Tirez vers le bas pour réessayer.',

    slowHint: 'Chargement en cours — cela peut prendre un moment avec un réseau faible.',

    staleTitle: 'Informations non à jour',
    staleBody:
      '{message} Vous voyez ce qui a été chargé {when} ; ces informations ont pu changer depuis.',
    staleRetrying: 'Nouvel essai…',
    staleRetry: 'Réessayer',
    staleRetryHint: 'Recharge cet écran depuis l’hôpital',
    loadedAt: 'Chargé {when}',
    loadedA11y: 'Informations chargées {when}',
    whenNotYet: 'pas encore chargé',
    whenJustNow: 'à l’instant',
    whenMinutes_one: 'il y a {count} minute',
    whenMinutes_other: 'il y a {count} minutes',
    whenAt: 'à {clock}',
    whenYesterdayAt: 'hier à {clock}',
    whenOnAt: 'le {date} à {clock}',
  },

  // ── Textes d’erreur partagés (src/lib/errors.ts) ────────────────────────
  // `unknownOutcome` dit au patient que l’application NE SAIT PAS si son
  // enregistrement est arrivé. Ne jamais reformuler en « cela n’a pas été
  // enregistré » ni en « c’est enregistré », et ne jamais supprimer la
  // consigne d’aller vérifier soi-même.
  errors: {
    offlineTitle: 'Aucune connexion',
    offlineBody:
      'Votre téléphone n’a pas pu joindre l’hôpital. Vérifiez vos données mobiles ou votre Wi-Fi, puis réessayez.',

    timeoutTitle: 'La connexion est trop lente',
    timeoutBody:
      'L’hôpital n’a pas répondu à temps. Cela se règle généralement avec un meilleur signal — veuillez réessayer dans un instant.',

    serverTitle: 'Le système de l’hôpital ne répond pas',
    serverBody:
      'Le problème vient de notre côté, pas de votre téléphone. Veuillez réessayer dans quelques instants.',

    notFoundTitle: 'Ce contenu n’est plus disponible',
    notFoundBody:
      'Il a peut-être été supprimé ou modifié par l’hôpital. Revenez en arrière et ouvrez-le à nouveau depuis la liste.',

    permissionTitle: 'Vous ne pouvez pas ouvrir ceci',
    permissionBody:
      'Ce dossier n’est pas partagé avec votre compte. Adressez-vous à l’accueil de l’hôpital si vous pensez qu’il s’agit d’une erreur.',

    sessionTitle: 'Veuillez vous reconnecter',
    sessionBody:
      'Vous avez été déconnecté pour votre sécurité. Connectez-vous pour continuer.',

    busyTitle: 'Trop de demandes en ce moment',
    busyBody: 'Veuillez patienter un instant, puis réessayez.',

    notLinkedTitle: 'Reliez votre dossier médical',
    notLinkedBody:
      'Ce compte n’est pas encore relié à un dossier médical. Reliez votre identifiant santé OPES, ou ouvrez un nouveau dossier si vous n’êtes jamais venu ici.',

    validationTitle: 'Vérifiez les informations saisies',
    validationBody:
      'Certaines informations sont manquantes ou non valides. Veuillez vérifier le formulaire et réessayer.',

    conflictTitle: 'Cette action n’a pas pu aboutir',
    conflictBody:
      'L’hôpital n’a pas pu accepter cette demande. Veuillez réessayer ou contacter l’accueil.',

    unknownTitle: 'Une erreur est survenue',
    unknownBody: 'Veuillez réessayer. Si le problème persiste, contactez l’hôpital.',

    // « n’avons pas pu confirmer » : l’incertitude est le message. Ne pas l’atténuer.
    unknownOutcome:
      '{message} Nous n’avons pas pu confirmer si cela a bien été enregistré. {checkHint}',

    // La session est renouvelée, mais l’enregistrement n’est jamais renvoyé
    // automatiquement : un doublon dans un dossier patient coûte plus cher
    // qu’une seconde validation.
    sessionRenewedRetry:
      'Votre session a été renouvelée par sécurité. Cette modification n’a pas encore été enregistrée — appuyez à nouveau et elle sera prise en compte.',
  },
} satisfies Catalog;
