/**
 * `messaging` strings, English. One cluster per file so translators do not collide.
 * Contract: src/i18n/index.ts. Keys and order must match the fr twin exactly.
 */
export const messaging = {
  // ── MSG-001 Messages tab ─────────────────────────────────────────────────
  inbox: {
    title: 'Messages',
    notificationsA11y: 'Notifications',
    conversationsA11y: 'All conversations',
    closeA11y: 'Close',
    loading: 'Loading your messages…',
    emptyTitle: 'No conversations yet',
    emptyMessage: 'When your care team messages you, the conversation will appear here.',
    emptyCta: 'Message a Provider',
    careTeamFallback: 'Your care team',
    viewProfile: 'View Profile',
    encryption: 'Your messages are end-to-end encrypted and HIPAA compliant.',
    today: 'Today, {date}',
    yesterday: 'Yesterday, {date}',
    noMessagesTitle: 'No messages yet',
    noMessagesMessage: 'Send the first message to start this conversation.',
    composerPlaceholder: 'Type a message...',
    sendA11y: 'Send message',
    // The patient must know the message did NOT reach the doctor.
    sendFailed: 'Message not sent. Please try again.',
    sharedItemTitle: 'Shared item',
    sharedItemNote: 'This attachment cannot be shown in the app yet.',
  },

  // ── In-chat cards on the Messages tab ────────────────────────────────────
  cards: {
    lastUpdated: 'Last updated: {date}, {time}',
    thMedication: 'MEDICATION',
    thDose: 'DOSE & FREQUENCY',
    thTakenFor: 'TAKEN FOR',
    thStartDate: 'START DATE',
    thStatus: 'STATUS',
    important: 'Important',
    actionDownload: 'Download (PDF)',
    actionAdd: 'Add Medication',
    actionRefill: 'Request Refill',
    actionShare: 'Share List',

    prescribedBy: 'Prescribed by {name}',
    dose: 'Dose',
    route: 'Route',
    duration: 'Duration',
    purpose: 'Purpose',
    refillsLeft: 'Refills left',
    instructions: 'Instructions',
    viewPrescription: 'View Prescription',

    invoiceFallback: 'Invoice',
    invoiceMeta: '{facility} · Due {date}',
    balanceDue: 'Balance due',
    payNow: 'Pay Now',

    carePlanBy: 'By {name}',
    goal: 'Goal',
    targetDate: 'Target date',
    openCarePlan: 'Open Care Plan',

    referralMeta: '{specialty} · {facility}',
    reason: 'Reason',
    referredBy: 'Referred by',
    referredOn: 'Referred on',
    appointment: 'Appointment',
    viewReferral: 'View Referral',

    dueBy: 'Due by {date}',
    warningTitle: 'Seek help immediately if you notice',

    imagingMeta: '{modality} · {bodyPart}',
    summary: 'Summary',
    impression: 'Impression',
    reportedBy: 'Reported by',
    performed: 'Performed',
    viewFullReport: 'View Full Report',
  },

  quick: {
    reminder: 'Set Medication Reminder',
    pharmacy: 'Order from Pharmacy',
    ask: 'Ask Question',
    followUp: 'Schedule Follow-up',
    video: 'Video Call',
  },

  threads: {
    title: 'Conversations',
    subtitle_one: '{count} thread with your care team',
    subtitle_other: '{count} threads with your care team',
    careTeamFallback: 'Care team',
    newMessage: 'Message a Provider',
  },

  // ── MSG-001 Notifications (sheet + full screen) ──────────────────────────
  notifications: {
    title: 'Notifications',
    markAllRead: 'Mark all read',
    markAllFailed: "Couldn't mark these as read. Check your connection and try again.",
    loading: 'Loading notifications…',
    emptyTitle: 'Nothing new',
    sheetEmptyMessage: "You're all caught up.",
    emptyMessage: 'Appointment reminders, results and billing updates will appear here.',
    subtitleNone: 'Reminders and updates from your care team',
    subtitleUnread_one: "{count} you haven't read yet",
    subtitleUnread_other: "{count} you haven't read yet",
    categoryAppointment: 'Appointment',
    categoryLabResult: 'Lab result',
    categoryImaging: 'Imaging',
    categoryBilling: 'Billing',
    categoryMedication: 'Medication',
    categoryMessage: 'Message',
  },

  // ── MSG-002 New Message ──────────────────────────────────────────────────
  newMessage: {
    title: 'New Message',
    subtitle: "Write to a doctor at St. Mary's",
    whoFor: 'Who is this for?',
    change: 'Change',
    changeA11y: 'Choose a different doctor',
    facilityFallback: 'St. Mary’s Hospital',
    searchPlaceholder: 'Search by name or specialty',
    loadingDoctors: 'Loading doctors…',
    noMatch: 'No doctor matched that search. Try another name or specialty.',
    yourMessage: 'Your message',
    subjectLabel: 'Subject (optional)',
    subjectPlaceholder: 'What is this about?',
    messageLabel: 'Message',
    messagePlaceholder: "Describe what you'd like your doctor to know.",
    charsLeft: '{count} characters left',
    notice:
      'Messages are not monitored around the clock. If this is an emergency, call your facility or go to the emergency department.',
    // Says explicitly that it did not send, and that the draft survived.
    sendFailed: "Your message wasn't sent. Check your connection and try again — nothing was lost.",
    sending: 'Sending…',
    send: 'Send Message',
  },
} as const;
