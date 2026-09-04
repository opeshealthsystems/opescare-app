/**
 * `meds` strings, English. One cluster per file so translators do not collide.
 * Contract: src/i18n/index.ts. Keys and order must match the fr twin exactly.
 */
export const meds = {
  // ── Shared dose vocabulary (shared.tsx, MED-001, schedule) ──────────────
  dose: {
    statusUpcoming: 'Upcoming',
    statusTaken: 'Taken',
    statusMissed: 'Missed',
    statusSkipped: 'Skipped',

    // Countdown under a scheduled dose.
    spanHours: '{h}h {m}m',
    spanMinutes: '{m}m',
    countdownIn: 'In {span}',
    countdownAgo: '{span} ago',

    // "Today, 02:00 PM" / "23 Apr 2026, 08:00 AM"
    whenToday: 'Today, {time}',
    whenTomorrow: 'Tomorrow, {time}',
    whenYesterday: 'Yesterday, {time}',
    whenDate: '{date}, {time}',

    // Refill countdown chip.
    overdue: 'Overdue',
    dueToday: 'Due today',
    daysLeft_one: '{count} day left',
    daysLeft_other: '{count} days left',

    // Adherence word on MED-005.
    adherenceNoData: 'No data',
    adherenceGood: 'Good',
    adherenceFair: 'Fair',
    adherencePoor: 'Poor',

    // The dose sheet.
    sheetFallback: 'Dose',
    sheetMessage: '{dose} — scheduled for {time}.',
    notNow: 'Not Now',
    markTaken: 'Mark as Taken',
    skipDose: 'Skip This Dose',
    viewMedication: 'View Medication',

    // Write failure. Never softened into a reassurance: the app does not know
    // whether the dose was recorded, and says so.
    failTitle: 'We couldn’t record this dose',
    failOk: 'OK',
    failHintList: 'Check the dose in your schedule below — if it still shows as due, tap it again.',
    failHintTimeline: 'Check the dose on the timeline below — if it still shows as upcoming, tap it again.',
  },

  // ── MED-001 Medications & Prescriptions ─────────────────────────────────
  list: {
    title: 'Medications & Prescriptions',
    subtitle: 'Your prescriptions, medications and treatment plans.',
    addPrescription: 'Add Prescription',
    loading: 'Loading your medications…',

    filterActive: 'Active',
    filterRecent: 'Recent',
    filterAll: 'All',

    heroActive: 'Active Medications',
    heroOngoing: 'Ongoing Treatments',
    heroNextDose: 'Next Dose',
    heroNoDose: 'No dose scheduled',
    heroCaughtUp: 'You are all caught up',
    heroViewSchedule: 'View Schedule',
    adherenceA11y: 'Adherence {percent} percent',

    prescriptionsTitle: 'My Prescriptions',
    emptyTitle: 'No prescriptions here',
    emptyBody: 'Prescriptions written at your visits will appear in this list.',
    viewAllPrescriptions: 'View All Prescriptions',
    startedOn: 'Started: {date}',

    scheduleTitle: 'Medication Schedule',
    scheduleToday: 'Today, {date}',
    scheduleEmptyTitle: 'Nothing scheduled today',
    scheduleEmptyBody:
      'No doses are due today. Your schedule will fill in as prescriptions are written.',

    refillTitle: 'Refill Reminders',
    refillViewAll: 'View All',
    refillNone: 'No refills are due right now.',
    refillOn: 'Refill on {date}',

    pharmacyTitle: 'Pharmacy & Delivery',
    pharmacyBody: 'Get your medications delivered to your door.',
    pharmacyCta: 'Order from Pharmacy',

    privacyTitle: 'Your prescription data is encrypted and protected.',
    privacyNote: 'Shared only with authorized healthcare providers and pharmacies.',
    manageAccess: 'Manage Access',
  },

  // ── Medication Schedule ─────────────────────────────────────────────────
  schedule: {
    title: 'Medication Schedule',
    subtitle: 'Every dose you are due, day by day.',
    loading: 'Loading your schedule…',
    jumpToToday: 'Jump to today',
    previousWeek: 'Previous week',
    nextWeek: 'Next week',

    weekdaySun: 'Sun',
    weekdayMon: 'Mon',
    weekdayTue: 'Tue',
    weekdayWed: 'Wed',
    weekdayThu: 'Thu',
    weekdayFri: 'Fri',
    weekdaySat: 'Sat',

    dayToday: 'Today',
    dayTomorrow: 'Tomorrow',
    dayYesterday: 'Yesterday',

    noDoses: 'No doses',
    takenOfTotal: '{taken} of {total} taken',
    chipA11y: '{weekday} {date}, {count} doses',

    emptyTitle: 'Nothing scheduled',
    emptyBody:
      'No doses are due on this day. Your schedule fills in as prescriptions are written.',
    viewMedications: 'View My Medications',
  },

  // ── MED-005 Medication Detail ───────────────────────────────────────────
  detail: {
    title: 'Medication Details',
    subtitle: 'View complete information about your medication',
    loading: 'Loading this medication…',
    notifications: 'Notifications',

    rxId: 'Rx ID',
    prescribedOn: 'Prescribed on',
    prescribedBy: 'Prescribed by',
    facility: 'Facility',
    prescription: 'Prescription',
    status: 'Status',

    dosageOverline: 'Dosage & Instructions',
    dose: 'Dose',
    frequency: 'Frequency',
    route: 'Route',
    duration: 'Duration',
    startDate: 'Start Date',
    endDate: 'End Date',
    instructions: 'Instructions',
    instructionsFallback: 'Follow the directions given by your prescriber.',

    relatedOverline: 'Related Information',
    reasonDiagnosis: 'Reason / Diagnosis',
    conditionTreated: 'Condition Treated',
    prescriberNotes: 'Prescriber Notes',
    noNotes: 'No additional notes.',

    refillsOverline: 'Refills & Adherence',
    refillsRemaining: 'Refills Remaining',
    adherence: 'Adherence',
    lastTaken: 'Last Taken',
    nextDose: 'Next Dose',

    sourceOverline: 'Prescription Source',
    pharmacy: 'Pharmacy',
    pharmacyUnassigned: 'Not assigned',
    fulfilmentStatus: 'Fulfillment Status',
    fulfilled: 'Fulfilled',
    notFulfilled: 'Not Fulfilled',
    prescriptionType: 'Prescription Type',

    verifiedTitle: 'Verified Prescription',
    verifiedMessage: 'This is a legally valid electronic prescription.',
    verifiedOn: 'Verified on {when}',
    verifyQr: 'Verify QR',

    actionAdd: 'Add to Medications',
    actionReminder: 'Set Reminder',
    actionRefill: 'Request Refill',
    actionFindPharmacy: 'Find Pharmacy',
    actionHistory: 'View History',
    actionShare: 'Share Medication',
    findPharmacyQuery: 'Pharmacy',

    allDosesRecorded: 'All scheduled doses for this course have been recorded.',
    shareRxId: 'Rx ID: {reference}',
  },

  // ── MED-003 Prescription Detail ─────────────────────────────────────────
  prescription: {
    title: 'Prescription Details',
    subtitle: 'View your prescription and medication instructions',
    loading: 'Loading this prescription…',
    downloadA11y: 'Download prescription',

    noPdfTitle: 'No PDF copy yet',
    noPdfBody:
      'The clinic does not publish a downloadable file for this prescription. Use Share to send the details, or ask the pharmacy to look it up with your Health ID.',

    prescriberMissing: 'Prescriber not recorded',
    prescribedOn: 'Prescribed on',
    prescriptionId: 'Prescription ID',
    status: 'Status',

    patient: 'Patient',
    patientId: 'PID: {reference}',
    diagnosisLabel: 'Diagnosis / Reason',

    medicationsCount: 'Medications ({count})',
    viewAsList: 'View as list',
    instructions: 'Instructions',
    instructionsFallback:
      'Take all medicines exactly as prescribed and complete the full course.',
    refills: 'Refills',
    refillsUsed: '{used} of {allowed} used',
    followUp: 'Follow up',

    dose: 'Dose',
    frequency: 'Frequency',
    route: 'Route',
    duration: 'Duration',

    pharmacy: 'Pharmacy',
    pharmacyUnassigned: 'Not assigned',
    fulfilment: 'Fulfilment',
    fulfilled: 'Fulfilled',
    notFulfilled: 'Not Fulfilled',

    verifiedTitle: 'Prescription Verified',
    verifiedMessage: 'This prescription is electronically signed and verified.',
    verifiedBadge: 'Verified',

    actionAdd: 'Add to Medications',
    actionReminder: 'Set Reminder',
    actionFulfil: 'Fulfil at Pharmacy',
    actionDownload: 'Download PDF',
    actionShare: 'Share Prescription',

    shareHeading: 'Prescription {reference}',
    sharePrescribedBy: 'Prescribed by {name}',
  },

  // ── Request a Refill ────────────────────────────────────────────────────
  refill: {
    title: 'Request a Refill',
    subtitle: 'Ask your prescriber for a repeat.',
    loading: 'Loading your medications…',

    emptyTitle: 'No active medications',
    emptyBody:
      'You have no active prescriptions to repeat. Prescriptions written at your visits appear here.',
    emptyCta: 'View My Medications',

    // There is no refill endpoint. "Sent" must never read as "approved".
    notice:
      'Your request goes to the doctor who prescribed the medication, as a secure message. They decide whether to issue a repeat — sending a request is not an approval.',

    whichMedication: 'Which Medication?',
    refillsLeft_one: '{count} refill left',
    refillsLeft_other: '{count} refills left',
    noRefillsLeft: 'No refills left',
    refillDue: 'Refill due {date} · {left}',

    noteOverline: 'Anything Else To Add?',
    notePlaceholder: 'Optional — e.g. how much you have left, or a side effect you noticed',
    noteA11y: 'Extra note for your prescriber',

    previewOverline: 'What Will Be Sent',
    previewTo: 'To {name}',
    previewToWithSpecialty: 'To {name} · {specialty}',
    yourPrescriber: 'your prescriber',

    noPrescriber:
      'This prescription has no prescriber we can message. Send your request to any doctor at your clinic instead, or call the pharmacy shown on the prescription.',

    sending: 'Sending…',
    send: 'Send Refill Request',
    messageAnother: 'Message Another Doctor',

    sentTitle: 'Request sent',
    sentBody:
      'Your request for {drug} has been sent to {name}. They will reply in your messages. A repeat is only issued once they approve it.',
    sentDone: 'Done',
    openConversation: 'Open Conversation',

    failTitle: 'We couldn’t send your request',
    failOk: 'OK',
    failHint:
      'Open Messages to see whether your request reached your prescriber before sending it again.',

    // The message body composed for the prescriber.
    subject: 'Repeat prescription request',
    bodyAsk: 'I would like to request a repeat prescription for {what}.',
    bodyQuantity: 'Last dispensed quantity: {quantity}.',
    bodyRefills_one: 'My prescription shows {count} refill remaining.',
    bodyRefills_other: 'My prescription shows {count} refills remaining.',
    bodyNoRefills: 'My prescription shows no refills remaining.',
    bodyPharmacy: 'Preferred pharmacy: {pharmacy}.',
  },

  // ── Order from Pharmacy ─────────────────────────────────────────────────
  pharmacy: {
    title: 'Order from Pharmacy',
    subtitle: 'Where your medicines are, and how to get them.',
    loading: 'Loading your prescriptions…',

    emptyTitle: 'Nothing to collect',
    emptyBody: 'You have no active prescriptions waiting at a pharmacy.',
    emptyCta: 'View My Medications',

    // No dispensing or delivery endpoint exists. Say so plainly.
    notice:
      'Medicines cannot be paid for or delivered through the app yet. You can call the pharmacy that holds your prescription, or ask your prescriber to have it prepared for collection.',

    unassigned: 'Pharmacy not yet assigned',
    noPhone: 'No phone number on file',
    dispensed: 'Dispensed',
    awaitingCollection: 'Awaiting collection',
    itemA11y: 'Ask for {drug} to be prepared at {pharmacy}',
    hint: 'Tap a medicine to ask your prescriber to have it prepared here.',
    callPharmacy: 'Call Pharmacy',
    messageDoctor: 'Message a Doctor',

    callFailTitle: 'We couldn’t open your phone app',
    callFailBody: 'Call {pharmacy} on {phone} to arrange your medication.',

    noPrescriberTitle: 'No prescriber to message',
    noPrescriberBody:
      'This prescription has no prescriber we can message. Call {pharmacy} directly, or message a doctor at your clinic.',

    confirmBody:
      'We will send {name} a message asking for this to be prepared at {pharmacy}. It is a request, not a confirmed order — they will reply in your messages.',
    confirmNotNow: 'Not Now',
    confirmSend: 'Send Request',
    yourPrescriber: 'your prescriber',

    sentTitle: 'Request sent',
    sentBody:
      'Your message about {drug} has been sent to {name}. Wait for their reply before travelling to collect it.',
    sentDone: 'Done',
    openConversation: 'Open Conversation',

    failTitle: 'We couldn’t send your request',
    failOk: 'OK',
    failHint:
      'Open Messages to see whether your request reached your prescriber before sending it again.',

    subject: 'Medication dispensing request',
    bodyAsk: 'Please could my medication be prepared for collection at {pharmacy}?',
    bodyQuantity: 'Quantity on the prescription: {quantity}.',
  },

  // ── Enum vocabulary — DISPLAY labels for raw API values ──────────────────
  // Keys are the API's raw values. An unknown value is title-cased by the
  // helper in `meds/shared.tsx`, never shown as a database token. Stored
  // values are never changed — this is presentation only.
  vocab: {
    status: {
      draft: 'Draft',
      active: 'Active',
      completed: 'Completed',
      stopped: 'Stopped',
    },
    route: {
      oral: 'Oral',
      iv: 'Intravenous',
      im: 'Intramuscular',
      sc: 'Subcutaneous',
      topical: 'Topical',
      inhaled: 'Inhaled',
      rectal: 'Rectal',
      other: 'Other route',
    },
    prescriptionType: {
      outpatient: 'Outpatient',
      inpatient: 'Inpatient',
      discharge: 'Discharge',
      emergency: 'Emergency',
    },
  },
} as const;
