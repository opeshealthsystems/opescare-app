/**
 * `records` strings, English — the Health Records hub and the clinical list
 * screens behind it (visits, diagnoses, vitals, immunizations, documents).
 *
 * Contract: src/i18n/index.ts. Keys and order must match the fr twin exactly.
 *
 * Clinical CONTENT is never here: ICD-10 wording, vaccine names, drug names,
 * document labels and free-text notes arrive from the API already in the
 * account's language. Only the chrome around them is translated.
 */
export const records = {
  // ── The hub ─────────────────────────────────────────────────────────────
  hub: {
    title: 'Health Records',
    subtitle: 'Everything from your care history, in one place.',
    visitsLabel: 'Visit History',
    visitsHint: 'Encounters, clinical notes, and outcomes',
    diagnosesLabel: 'Diagnoses',
    diagnosesHint: 'Conditions on your medical record',
    prescriptionsLabel: 'Prescriptions',
    prescriptionsHint: 'Medications prescribed to you',
    vitalsLabel: 'Vitals',
    vitalsHint: 'Blood pressure, pulse, weight, and more',
    immunizationsLabel: 'Immunizations',
    immunizationsHint: 'Vaccination history',
    allergiesLabel: 'Allergies',
    allergiesHint: 'Allergies and reactions on your record',
    documentsLabel: 'Documents',
    documentsHint: 'Lab results, referrals, and files',
    timelineLabel: 'Timeline',
    timelineHint: 'Your care history, event by event',
  },

  // ── Stack header titles (RecordsStackNavigator) ─────────────────────────
  header: {
    encounters: 'Visit History',
    encounterDetail: 'Visit Details',
    diagnoses: 'Diagnoses',
    vitals: 'Vitals',
    immunizations: 'Immunizations',
    allergies: 'Allergies',
    documents: 'Documents',
    timeline: 'Timeline',
  },

  // ── Visit history ───────────────────────────────────────────────────────
  encounters: {
    title: 'Visit History',
    empty: 'You have no recorded visits yet.',
    seenBy: 'Seen by {name}',
  },

  // ── One visit ───────────────────────────────────────────────────────────
  encounter: {
    loadFailed: 'Could not load this visit.',
    notFound: 'Visit not found.',
    summary: 'Summary',
    chiefComplaint: 'Chief complaint',
    assessment: 'Assessment',
    plan: 'Plan',
    dischargeNote: 'Discharge note',
    followUpDate: 'Follow-up date',
    clinicalNotes: 'Clinical Notes',
    subjective: 'Subjective',
    objective: 'Objective',
    vitals: 'Vitals',
    height: 'Height',
    diagnoses: 'Diagnoses',
    prescriptions: 'Prescriptions',
    ordersResults: 'Orders & Results',
  },

  // ── Diagnoses ───────────────────────────────────────────────────────────
  diagnoses: {
    title: 'Diagnoses',
    empty: 'No diagnoses on file.',
    codeOnly: 'Diagnosis code {code}',
    icdCode: 'ICD-10 code: {code}',
  },

  // ── Allergies ───────────────────────────────────────────────────────────
  allergies: {
    title: 'Allergies',
    empty: 'No allergies on file.',
    reaction: 'Reaction: {reaction}',
    onset: 'Recorded {date}',
  },

  // ── Documents ───────────────────────────────────────────────────────────
  documents: {
    title: 'Documents',
    empty: 'No documents on file.',
  },

  // ── Timeline ────────────────────────────────────────────────────────────
  timeline: {
    title: 'Timeline',
    empty: 'No events on your timeline yet.',
    abnormal: 'Flagged result',
  },

  // ── Immunizations ───────────────────────────────────────────────────────
  immunizations: {
    title: 'Immunizations',
    empty: 'No immunizations on file.',
    dose: 'Dose {number}',
    given: 'Given {date}',
    nextDue: 'Next due {date}',
  },

  // ── Vitals ──────────────────────────────────────────────────────────────
  vitals: {
    title: 'Vitals',
    empty: 'No vitals have been recorded yet.',
    notice:
      'Some readings from this visit are outside the usual range. Your care team already has these results — contact them if you have questions or feel unwell.',
    footnote:
      'Usual ranges are general adult guides. Your own targets may be different — your care team decides what these numbers mean for you.',
    bloodPressure: 'Blood pressure',
    pulse: 'Pulse',
    temperature: 'Temperature',
    breathingRate: 'Breathing rate',
    oxygenLevel: 'Oxygen level',
    weight: 'Weight',
    bmi: 'BMI',
    unitBpm: 'bpm',
    unitBreaths: 'breaths/min',
    bpRange: '{systolic} over {diastolic}',
    usualRange: 'Usual: {range}',
    noRange: 'No usual range available',
    bandInRange: 'In range',
    bandOutside: 'Outside usual range',
    bandWellOutside: 'Well outside usual range',
    bandA11y: '{label} is {band}',
  },
} as const;
