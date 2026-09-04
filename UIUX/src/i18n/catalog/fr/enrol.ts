/**
 * `enrol` strings, French — P8.2 vérification du téléphone, P8.3 auto-inscription.
 * Contract: src/i18n/index.ts. Keys and order must match the en twin exactly.
 */
export const enrol = {
  // ── Le choix : relier un dossier existant, ou en ouvrir un ──────────────
  setup: {
    title: 'Reliez votre dossier',
    subtitle: 'Votre compte est prêt. Il lui manque seulement un dossier médical.',
    haveIdTitle: 'J’ai déjà un identifiant santé OPES',
    haveIdSubtitle: 'Reliez le dossier que cet hôpital a déjà ouvert pour vous.',

    newTitle: 'Je viens ici pour la première fois',
    newSubtitle: 'Vérifiez votre numéro de téléphone et ouvrez un dossier depuis l’application.',

    privacyNote:
      'Votre dossier vous appartient. Seuls les soignants qui vous prennent en charge, et vous-même, peuvent l’ouvrir.',
  },

  // ── Relier un dossier existant (le chemin qui existait déjà) ────────────
  link: {
    title: 'Relier mon dossier',
    subtitle: 'Saisissez l’identifiant imprimé sur votre carte OPES, exactement tel qu’il apparaît.',
    idLabel: 'Identifiant santé OPES',
    idHint: 'L’identifiant imprimé sur votre carte OPES ou vos documents de l’hôpital',
    idPlaceholder: 'OPES-00-0000-0000',
    nameLabel: 'Nom complet figurant sur la carte',
    namePlaceholder: 'Votre nom complet',
    submit: 'Relier mon dossier',
    helper:
      'L’accueil délivre cet identifiant lors de votre première visite. Si vous n’êtes jamais venu ici, revenez en arrière et ouvrez plutôt un nouveau dossier.',
    failed:
      'Nous n’avons pas pu relier ce dossier. Vérifiez l’identifiant et le nom, puis réessayez.',
    checkHint: 'Ouvrez votre profil pour voir si le dossier a été relié.',
  },

  // ── P8.2 vérification du téléphone ──────────────────────────────────────
  phone: {
    title: 'Vérifiez votre numéro',
    subtitle:
      'Nous envoyons un code court par SMS au {phone}. Il prouve que ce numéro est bien le vôtre.',
    subtitleNoPhone:
      'Nous envoyons un code court par SMS au numéro enregistré sur votre compte.',

    send: 'Envoyez-moi un code',
    sending: 'Envoi…',
    sent: 'Code envoyé au {phone}.',
    sentNoPhone: 'Code envoyé.',

    codeLabel: 'Saisissez le code',
    codeHint: 'Six chiffres reçus par SMS. Votre téléphone peut vous proposer de le saisir automatiquement.',
    codePlaceholder: '000000',
    sendHint: 'Envoie un code par SMS au numéro de votre compte',
    verify: 'Vérifier mon numéro',
    verifying: 'Vérification…',

    validForMinutes_one: 'Le code est valable {count} minute.',
    validForMinutes_other: 'Le code est valable {count} minutes.',
    validForSeconds_one: 'Le code est valable {count} seconde.',
    validForSeconds_other: 'Le code est valable {count} secondes.',

    resend: 'Envoyer un nouveau code',
    resendIn: 'Vous pourrez demander un nouveau code dans {clock}.',

    wrongCode: 'Ce code ne correspond pas. Vérifiez le SMS et saisissez-le à nouveau.',
    attemptsRemaining_one: 'Il vous reste {count} essai avant de devoir demander un nouveau code.',
    attemptsRemaining_other:
      'Il vous reste {count} essais avant de devoir demander un nouveau code.',
    rateLimited:
      'Trop d’essais pour le moment. Patientez un instant, puis demandez un nouveau code.',
    rateLimitedWait: 'Trop d’essais pour le moment. Vous pourrez réessayer dans {clock}.',

    smsNote: 'Le tarif SMS habituel de votre opérateur peut s’appliquer.',
    checkHint: 'Demandez un nouveau code si celui-ci ne fonctionne plus.',

    doneTitle: 'Numéro vérifié',
    doneBody: 'Merci. Vous pouvez maintenant ouvrir votre dossier médical.',
    doneCta: 'Continuer',
  },

  // ── P8.3 auto-inscription ───────────────────────────────────────────────
  register: {
    title: 'Ouvrir mon dossier',
    subtitle:
      'Ces informations figureront sur votre dossier : utilisez celles de votre pièce d’identité.',

    nameLabel: 'Nom complet',
    namePlaceholder: 'Tel qu’il figure sur votre pièce d’identité',
    sexLabel: 'Sexe',
    sexFemale: 'Féminin',
    sexMale: 'Masculin',
    sexOther: 'Autre',
    dobLabel: 'Date de naissance',
    dobPlaceholder: 'AAAA-MM-JJ',
    dobHelper: 'Facultatif, mais cela aide l’hôpital à retrouver votre dossier.',

    submit: 'Ouvrir mon dossier',
    submitting: 'Ouverture de votre dossier…',
    failed: 'Nous n’avons pas pu ouvrir votre dossier. Veuillez réessayer.',
    checkHint: 'Ouvrez votre profil pour voir si votre dossier a été créé.',

    provisionalNote:
      'Un dossier ouvert depuis l’application ne contient encore aucune donnée clinique. L’accueil confirmera votre identité lors de votre première visite.',

    doneTitle: 'Votre dossier est ouvert',
    doneBody:
      'Voici votre identifiant santé OPES. Il vous sera demandé à chaque guichet : conservez-le.',
    doneIdLabel: 'VOTRE IDENTIFIANT SANTÉ OPES',
    doneCard: 'Voir ma carte santé',
    doneHome: 'Aller à mon accueil',
  },

  // ── Le 409 : à terminer au guichet de l’accueil ─────────────────────────
  reception: {
    title: 'Une étape à l’accueil',
    intro:
      'Nous ne pouvons pas ouvrir votre dossier depuis l’application cette fois-ci. Un agent de l’accueil le fera avec vous — cela prend en général quelques minutes.',

    bringTitle: 'Ce qu’il faut apporter',
    bringId: 'Une pièce d’identité : carte nationale d’identité, passeport ou permis de conduire.',
    bringPhone: 'Ce téléphone, avec le numéro que vous venez de vérifier.',
    bringCover: 'Votre carte d’assurance ou de prise en charge, si vous en avez une.',

    nextTitle: 'Ce qui se passe ensuite',
    nextStep1: 'L’accueil parcourt vos informations avec vous au guichet.',
    nextStep2: 'L’accueil finalise votre inscription et vous remet votre identifiant santé OPES.',
    nextStep3:
      'Vous vous reconnectez ici et tout est relié — aucun second compte à créer.',

    reassure:
      'Vous n’avez rien saisi d’incorrect et rien n’a été perdu. Certains dossiers doivent simplement être ouverts sur place.',
    hoursNote:
      'L’accueil vous reçoit pendant les heures d’ouverture de l’hôpital. Aucun rendez-vous n’est nécessaire pour cela.',

    findUs: 'Localiser l’hôpital',
    done: 'J’ai compris',
  },

  // ── Le bloc « compte non relié » partagé par tous les écrans ────────────
  gate: {
    title: 'Reliez votre dossier médical',
    message:
      'Ce compte n’est pas encore relié à un dossier médical. Reliez votre identifiant santé OPES, ou ouvrez un nouveau dossier si vous n’êtes jamais venu ici.',
    messageWith:
      'Ce compte n’est pas encore relié à un dossier médical : vos {what} ne peuvent donc pas s’afficher. Reliez votre identifiant santé OPES, ou ouvrez un nouveau dossier si vous n’êtes jamais venu ici.',
    action: 'Commencer',
  },
} as const;
