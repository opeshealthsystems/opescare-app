/**
 * `docs` strings, French. One cluster per file so translators do not collide.
 * Contract: src/i18n/index.ts. Keys and order must match the en twin exactly.
 *
 * Termes repris du bureau (`lang/fr/`) : « Télécharger le PDF », « Imprimer le
 * document », « Partager le document », « Pivoter », « Vérifié », « Aperçu »
 * (docviewer.php) ; « Certificat médical », « Délivré le » (certificates.php) ;
 * « Dossier médical » (core).
 *
 * Apostrophes : U+2019 (’). Aucune n’est supprimée.
 */
export const docs = {
  // ── DOC-002 Aperçu du document ───────────────────────────────────────────
  preview: {
    title: 'Aperçu du document',
    healthRecordA11y: 'Dossier médical',
    contactA11y: 'Contacter l’établissement',
    loading: 'Chargement du document…',
    documentFallback: 'Document',
    generatedOn: 'Généré le {date}',
    generatedOnAt: 'Généré le {date} • {time}',
    verified: 'Vérifié',
    pending: 'En attente',

    bannerTitle: 'Document prêt',
    bannerSaved:
      'Votre document est disponible au téléchargement et il est enregistré dans votre dossier médical.',
    bannerAvailable: 'Votre document est disponible au téléchargement.',
    dismissA11y: 'Fermer',

    certificateDesc: 'Certificat médical officiel délivré par {facility}.',
    facilityFallback: 'l’établissement',
    documentDesc: 'Document officiel conservé dans votre dossier médical.',
    verifiedDocument: 'Document vérifié',
    awaitingVerification: 'En attente de vérification',

    saveTitle: 'Enregistrer au dossier médical',
    saveSub: 'Ajoutez ce document à votre dossier médical sécurisé pour y accéder plus tard.',
    savedTitle: 'Enregistré au dossier médical',
    savedSub: 'Vous pouvez le consulter à tout moment dans vos documents médicaux.',

    downloadTitle: 'Télécharger le PDF',
    downloadSub: 'Enregistrer le document sur votre appareil',
    shareTitle: 'Partager le document',
    shareSub: 'Envoyer par WhatsApp, e-mail ou une autre application',
    filesTitle: 'Enregistrer dans mes fichiers',
    filesSub: 'Conserver dans le gestionnaire de fichiers de votre appareil',
    printTitle: 'Imprimer',
    printSub: 'Imprimer le document directement',

    secureTitle: 'Sécurisé et conforme',
    secureText:
      'Vos documents sont chiffrés et conservés conformément aux normes HIPAA et à la réglementation sanitaire locale.',

    backToDocument: 'Retour au document',
    viewInRecord: 'Voir dans le dossier',

    ok: 'OK',
    actionFailedTitle: 'L’opération a échoué',
    actionFailedMessage: 'Cette action n’a pas pu être effectuée. Veuillez réessayer.',
    alreadySavedTitle: 'Déjà dans votre dossier médical',
    alreadySavedMessage:
      'Ce document est déjà classé dans votre dossier médical. Il n’y a rien de plus à faire.',
    settingFailedTitle: 'Ce paramètre n’a pas été enregistré',
    settingFailedRefresh:
      'Tirez vers le bas pour actualiser cette page et vérifier si l’interrupteur est resté activé.',
    settingFailedMessage: 'Le paramètre n’a pas pu être enregistré.',
  },

  // ── DOC-001 Certificat médical ───────────────────────────────────────────
  certificate: {
    title: 'Certificat médical',
    shareA11y: 'Partager le document',
    actionsA11y: 'Actions sur le document',
    loading: 'Chargement du certificat…',
    labelFallback: 'Certificat médical',
    facilityFallback: 'Hôpital St. Mary',
    openFailedTitle: 'Le document ne s’est pas ouvert',
    openFailedMessage: 'Le document n’a pas pu être ouvert. Veuillez réessayer.',

    verified: 'Vérifié',
    requested: 'Demandé',
    unverified: 'Non vérifié',

    brandSub: 'DOSSIER MÉDICAL ÉLECTRONIQUE',
    heading: 'CERTIFICAT MÉDICAL',
    certificateNo: 'N° du certificat :',
    dateIssued: 'Délivré le :',
    lead: 'Je soussigné certifie que :',
    name: 'Nom :',
    patientId: 'N° Dossier :',
    ageGender: 'Âge / Sexe :',

    // Tournure impersonnelle : évite l’accord de « examiné(e) ».
    examined: 'Examen réalisé à {facility} le {date}.',
    unfit:
      'À mon avis professionnel, {subject} est inapte au travail / à l’école / aux activités physiques du {from} au {to}{rest}{cause}.',
    restDays: ' ({count} jours)',
    cause: ' en raison de {diagnosis}',
    purpose: 'Ce certificat est {purpose}',

    registrationNo: 'N° d’inscription à l’Ordre : {value}',
    authorised: 'Autorisé',
    electronicTitle: 'Ce certificat a été délivré par voie électronique.',
    electronicText: 'Ce document est valable sans signature manuscrite.',
    scanQr: 'Scannez le QR code pour vérifier son authenticité.',

    addToLine1: 'Ajouter au',
    addToLine2: 'dossier médical',

    toolRotate: 'Pivoter',
    toolRotateMessage:
      'La rotation s’applique dans la visionneuse plein écran. Ouvrez-y le document pour tourner la page.',
    toolSearch: 'Chercher',
    toolSearchMessage:
      'La recherche de texte se fait avec le PDF dans votre propre visionneuse. Téléchargez d’abord le document.',
    toolMarkup: 'Annoter',
    toolMarkupMessage:
      'Vous pouvez annoter le PDF après l’avoir téléchargé, avec votre propre visionneuse.',
    toolMore: 'Plus',

    previewFullScreen: 'Aperçu plein écran',
    downloadPdf: 'Télécharger le PDF',
  },

  // ── Utilitaires partagés ─────────────────────────────────────────────────
  shared: {
    cannotOpen: 'Aucune application de cet appareil ne peut ouvrir le document.',
    // Sujet de la troisième personne dans le corps du certificat.
    pronounShe: 'elle',
    pronounHe: 'il',
    pronounPatient: 'le patient',
  },
} as const;
