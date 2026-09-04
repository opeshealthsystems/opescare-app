/**
 * `records` — français hospitalier. Termes repris du catalogue de bureau :
 * « Dossier médical » (patients.tab_medical_records), « Soignant »
 * (patients.provider), « Tension artérielle », « Fréquence respiratoire »
 * (vitals), « Ordonnance », « Antécédents vaccinaux ».
 *
 * Rien de clinique n’est traduit ici : libellés CIM-10, noms de vaccins, noms
 * de médicaments et notes libres arrivent de l’API dans la langue du compte.
 *
 * Apostrophes U+2019 (’). Mêmes clés, même ordre que `en/records.ts`.
 */
export const records = {
  // ── Le sommaire du dossier ──────────────────────────────────────────────
  hub: {
    title: 'Dossier médical',
    subtitle: 'Tout votre parcours de soins, au même endroit.',
    visitsLabel: 'Historique des consultations',
    visitsHint: 'Consultations, notes cliniques et conclusions',
    diagnosesLabel: 'Diagnostics',
    diagnosesHint: 'Les pathologies inscrites à votre dossier médical',
    prescriptionsLabel: 'Ordonnances',
    prescriptionsHint: 'Les traitements qui vous ont été prescrits',
    vitalsLabel: 'Constantes',
    vitalsHint: 'Tension artérielle, pouls, poids et plus encore',
    immunizationsLabel: 'Vaccinations',
    immunizationsHint: 'Vos antécédents vaccinaux',
    allergiesLabel: 'Allergies',
    allergiesHint: 'Allergies et réactions inscrites à votre dossier',
    documentsLabel: 'Documents',
    documentsHint: 'Résultats de laboratoire, orientations et fichiers',
    timelineLabel: 'Chronologie',
    timelineHint: 'Votre parcours de soins, événement par événement',
  },

  // ── Titres d’en-tête de la pile (RecordsStackNavigator) ─────────────────
  header: {
    encounters: 'Historique des consultations',
    encounterDetail: 'Détails de la consultation',
    diagnoses: 'Diagnostics',
    vitals: 'Constantes',
    immunizations: 'Vaccinations',
    allergies: 'Allergies',
    documents: 'Documents',
    timeline: 'Chronologie',
  },

  // ── Historique des consultations ────────────────────────────────────────
  encounters: {
    title: 'Historique des consultations',
    empty: 'Aucune consultation enregistrée pour le moment.',
    seenBy: 'Vu par {name}',
  },

  // ── Une consultation ────────────────────────────────────────────────────
  encounter: {
    loadFailed: 'Impossible de charger cette consultation.',
    notFound: 'Consultation introuvable.',
    summary: 'Récapitulatif',
    chiefComplaint: 'Motif de consultation',
    assessment: 'Conclusion clinique',
    plan: 'Conduite à tenir',
    dischargeNote: 'Note de sortie',
    followUpDate: 'Date de contrôle',
    clinicalNotes: 'Notes cliniques',
    subjective: 'Subjectif',
    objective: 'Objectif',
    vitals: 'Constantes',
    height: 'Taille',
    diagnoses: 'Diagnostics',
    prescriptions: 'Ordonnances',
    ordersResults: 'Examens et résultats',
  },

  // ── Diagnostics ─────────────────────────────────────────────────────────
  diagnoses: {
    title: 'Diagnostics',
    empty: 'Aucun diagnostic au dossier.',
    codeOnly: 'Code diagnostic {code}',
    icdCode: 'Code CIM-10 : {code}',
  },

  // ── Allergies ───────────────────────────────────────────────────────────
  allergies: {
    title: 'Allergies',
    empty: 'Aucune allergie au dossier.',
    reaction: 'Réaction : {reaction}',
    onset: 'Enregistrée le {date}',
  },

  // ── Documents ───────────────────────────────────────────────────────────
  documents: {
    title: 'Documents',
    empty: 'Aucun document au dossier.',
  },

  // ── Chronologie ─────────────────────────────────────────────────────────
  timeline: {
    title: 'Chronologie',
    empty: 'Aucun événement dans votre chronologie pour le moment.',
    abnormal: 'Résultat signalé',
  },

  // ── Vaccinations ────────────────────────────────────────────────────────
  immunizations: {
    title: 'Vaccinations',
    empty: 'Aucune vaccination au dossier.',
    dose: 'Dose {number}',
    given: 'Administré le {date}',
    nextDue: 'Prochaine dose le {date}',
  },

  // ── Constantes ──────────────────────────────────────────────────────────
  vitals: {
    title: 'Constantes',
    empty: 'Aucune constante n’a encore été enregistrée.',
    notice:
      'Certaines mesures de cette consultation sont en dehors des valeurs habituelles. Votre équipe soignante dispose déjà de ces résultats — contactez-la si vous avez des questions ou si vous ne vous sentez pas bien.',
    footnote:
      'Les valeurs habituelles sont des repères généraux chez l’adulte. Vos propres objectifs peuvent être différents — c’est votre équipe soignante qui décide de ce que ces chiffres signifient pour vous.',
    bloodPressure: 'Tension artérielle',
    pulse: 'Pouls',
    temperature: 'Température',
    breathingRate: 'Fréquence respiratoire',
    oxygenLevel: 'Saturation en oxygène',
    weight: 'Poids',
    bmi: 'IMC',
    unitBpm: 'bpm',
    unitBreaths: 'resp./min',
    bpRange: '{systolic} sur {diastolic}',
    usualRange: 'Habituel : {range}',
    noRange: 'Aucune valeur habituelle disponible',
    bandInRange: 'Dans les normes',
    bandOutside: 'Hors des valeurs habituelles',
    bandWellOutside: 'Très éloigné des valeurs habituelles',
    bandA11y: '{label} : {band}',
  },
} as const;
