/**
 * `doctor` strings, English. One cluster per file so translators do not collide.
 * Contract: src/i18n/index.ts. Keys and order must match the fr twin exactly.
 *
 * This is the CLINICIAN surface — schedule, patient chart, results inbox,
 * appointment decisions, staff messages. The register is a colleague's, not a
 * patient's: "SpO₂", "ICD-10", "analyte", "no-show" are all correct here.
 *
 * Two groups of keys carry weight beyond wording and must not be softened when
 * translated (see the fr twin's header):
 *   • `chart.allergy.*` — an empty list is not a negative allergy history, and
 *     a failed load is not a statement about allergies at all.
 *   • `result.*` — acknowledgement is a clinical act, confirmed by naming the
 *     patient and the result, and never claimed on a response we did not see.
 */
export const doctor = {
  // ── Enum vocabulary shared across the chart screens ─────────────────────
  // Keys are the API's raw values. An unknown value is title-cased by
  // `chartShared.titleCase`, never shown as a database token.
  vocab: {
    notRecorded: 'Not recorded',

    encounterTypeFallback: 'Encounter',
    encounterType: {
      opd: 'Outpatient',
      emergency: 'Emergency',
      follow_up: 'Follow-up',
      telehealth: 'Telehealth',
    },

    allergyTypeFallback: 'Allergy',
    allergyType: {
      drug: 'Drug',
      food: 'Food',
      environmental: 'Environmental',
      other: 'Other',
    },

    severityFallback: 'Severity not recorded',
    severity: {
      mild: 'Mild',
      moderate: 'Moderate',
      severe: 'Severe',
      life_threatening: 'Life-threatening',
    },

    problemStatus: {
      active: 'Active',
      inactive: 'Inactive',
      resolved: 'Resolved',
    },

    prescriptionStatus: {
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

    orderTypeFallback: 'Order',
    orderType: {
      lab: 'Laboratory',
      imaging: 'Imaging',
      procedure: 'Procedure',
      medication: 'Medication',
    },

    orderStatus: {
      ordered: 'Ordered',
      in_progress: 'In progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
    },

    priority: {
      routine: 'Routine',
      urgent: 'Urgent',
      stat: 'STAT',
    },

    encounterStatus: {
      open: 'Open',
      in_progress: 'In progress',
      closed: 'Closed',
    },

    sexFallback: 'Sex not recorded',
    sex: {
      male: 'Male',
      female: 'Female',
      other: 'Other',
    },

    appointmentTypeFallback: 'Appointment',
    patientFallback: 'Patient record',
    telemedicine: 'Telemedicine',
  },

  // Short weekday names for the schedule strips. Indexed by `Date.getDay()`.
  weekday: {
    '0': 'Sun',
    '1': 'Mon',
    '2': 'Tue',
    '3': 'Wed',
    '4': 'Thu',
    '5': 'Fri',
    '6': 'Sat',
  },

  // ── Relative time, clinician side ───────────────────────────────────────
  when: {
    today: 'today',
    yesterday: 'yesterday',
    days_one: '{count} day ago',
    days_other: '{count} days ago',
    months_one: '{count} month ago',
    months_other: '{count} months ago',
    years_one: '{count} year ago',
    years_other: '{count} years ago',

    reportedTodayAt: 'Today at {time}',
    reportedYesterdayAt: 'Yesterday at {time}',
    reportedOnAt: '{date} at {time}',
    reportedUnknown: 'Reporting time not recorded',
  },

  // ── DoctorHomeScreen ────────────────────────────────────────────────────
  home: {
    title: 'Today',
    loading: 'Loading your day…',
    inboxAction: 'Results inbox',

    criticalBanner_one: '1 critical result is not acknowledged',
    criticalBanner_other: '{count} critical results are not acknowledged',
    criticalBannerBody:
      'A critical result stays unacknowledged until you open it and confirm. Open the inbox to review.',

    waitingOnYou: 'Waiting on you',
    tileResults: 'Results to acknowledge',
    tileMessages: 'Unread patient messages',
    tileAppointments: 'Appointments today',
    tileNothing: 'Nothing waiting',
    tileWaiting: '{count} waiting',

    urgentResults: 'Most urgent results',
    viewAll: 'View all',

    nextToday: 'Next today',
    fullSchedule: 'Full schedule',
    nothingTodayTitle: 'Nothing booked today',
    nothingTodayBody: 'You have no appointments scheduled for today.',
    timeNotRecorded: 'Time not recorded',
    patientNotOnRecord: 'Patient not on record',

    countedLive: 'These figures are counted live on the hospital record each time this screen loads.',
  },

  // ── DoctorScheduleScreen ────────────────────────────────────────────────
  schedule: {
    title: 'My Schedule',
    requestsAction: 'Appointment requests',
    day: 'Day',
    week: 'Week',
    today: 'Today',
    loading: 'Loading your schedule…',
    emptyDay: 'Nothing booked this day',
    emptyWeek: 'Nothing booked this week',
    emptyBody: 'Appointments assigned to you will appear here as soon as they are booked.',

    countToSee: 'To see',
    countCompleted: 'Completed',
    countAwaiting: 'Awaiting you',

    awaitingLink_one: '1 appointment in this range is still awaiting your decision',
    awaitingLink_other: '{count} appointments in this range are still awaiting your decision',

    minutes: '{count} min',
  },

  // ── AppointmentRequestsScreen ───────────────────────────────────────────
  requests: {
    title: 'Appointment Requests',
    subtitle: 'Bookings waiting on your decision',
    loading: 'Loading requests…',
    emptyTitle: 'Nothing waiting on you',
    emptyBody: 'No appointment in the next {days} days is still awaiting your decision.',

    banner_one: '1 request',
    banner_other: '{count} requests',
    bannerBody:
      'Accepting confirms the appointment for the patient. Declining cancels it. Rescheduling opens the record and moves the appointment outright — the API has no way to propose a time and wait for the patient to agree.',

    reasonGiven: 'Reason given',
    accept: 'Accept',
    reschedule: 'Reschedule',
    decline: 'Decline',

    declineTitle: 'Decline this appointment?',
    declineMessage:
      '{patient} — {type} on {date} at {time}. Declining cancels the appointment for the patient. This cannot be undone from here.',
    declineConfirm: 'Decline & Cancel',

    checkBeforeAccept: "Check this appointment's status on your schedule before accepting it again.",
    checkBeforeDecline: "Check this appointment's status on your schedule before declining it again.",
    declinedByClinician: 'Declined by the clinician',
  },

  // ── DoctorAppointmentDetailScreen ───────────────────────────────────────
  appointment: {
    title: 'Appointment',
    subtitle: 'Patient visit record',
    loading: 'Loading appointment…',

    openChart: 'Open Patient Chart',
    date: 'Date',
    time: 'Time',
    visitMode: 'Visit mode',
    where: 'Where',
    locationNotRecorded: 'Location not recorded',

    visit: 'Visit',
    type: 'Type',
    reason: 'Reason',
    provider: 'Provider',
    unassigned: 'Unassigned',
    priority: 'Priority',
    checkedIn: 'Checked in',
    cancelReason: 'Cancellation reason',

    telemedicineTitle: 'Telemedicine visit',
    telemedicineBody:
      'This visit is booked as telemedicine. The video session can only be started from the desktop EMR — the mobile API has no clinician telemedicine endpoint yet.',

    closedTitle: 'This appointment is closed',
    closedCompleted: 'The visit is marked completed. Nothing further can be changed here.',
    closedOther:
      'The appointment is cancelled or recorded as a no-show and can no longer be changed from the app.',

    actions: 'Actions',
    checkIn: 'Check In Patient',
    start: 'Start Consultation',
    complete: 'Mark Completed',
    closeReschedule: 'Close Reschedule',
    reschedule: 'Reschedule',
    noShow: 'Mark No-Show',
    cancel: 'Cancel Appointment',

    writeFailedTitle: "We couldn't complete that",
    checkHint: 'Reopen this appointment to see its current status before trying again.',

    noShowTitle: 'Mark as no-show?',
    noShowMessage:
      '{patient} — {type} on {date} at {time}. This closes the appointment and records that the patient did not attend.',
    noShowConfirm: 'Mark No-Show',

    cancelTitle: 'Cancel this appointment?',
    cancelMessage:
      '{patient} — {type} on {date} at {time}. The appointment is cancelled for the patient and cannot be reinstated from here.',
    cancelConfirm: 'Cancel Appointment',
    cancelKeep: 'Keep It',
    cancelledByClinician: 'Cancelled by the clinician',

    moveTitle: 'Move this appointment?',
    moveMessage:
      '{patient} moves to {date} at {time}. The change takes effect immediately — the patient is not asked to approve it.',
    moveConfirm: 'Move Appointment',

    moveTo: 'Move to',
    moveHint:
      'Times already booked in your own diary for the chosen day are marked. The API publishes no clinic-wide availability, so nothing else is claimed to be free.',
    diaryFailed: 'Your diary for this day could not be loaded, so booked times are not marked.',
    slotBooked: 'Booked',
  },

  // ── PatientSearchScreen ─────────────────────────────────────────────────
  search: {
    title: 'Find a Patient',
    placeholder: 'Name or medical record number',
    searching: 'Searching…',

    promptTitle: 'Search for a patient',
    promptShort: 'Type at least {min} characters.',
    promptBody:
      'Enter a name or a medical record number. This app does not list every patient — you look up the one you need.',

    noMatchTitle: 'No patient matches that',
    noMatchBody:
      'Nothing matched “{query}”. Try a different spelling, a partial surname, or the medical record number.',

    showingSome: 'Showing {shown} of {total} matches — narrow the search to see the rest',
    matches_one: '{count} match',
    matches_other: '{count} matches',

    years: '{count} yrs',
    allergiesBadge: 'Allergies',
  },

  // ── PatientChartScreen ──────────────────────────────────────────────────
  chart: {
    title: 'Patient Chart',
    loadingPatient: 'Loading patient…',
    loadingChart: 'Loading chart…',
    viewAll: 'View All',

    age: 'Age',
    sex: 'Sex',
    bloodGroup: 'Blood group',
    dateOfBirth: 'Date of birth',
    phone: 'Phone',
    location: 'Location',
    nextOfKin: 'Next of kin',

    activeProblems: 'Active Problems',
    problemsEmptyOthers:
      'No active problems. There are inactive or resolved entries on the problem list.',
    problemsEmpty: 'The problem list is empty.',
    onset: 'Onset {date}',

    currentMedications: 'Current Medications',
    medsEmpty:
      'No active prescriptions in the {scan} most recent encounters. Older or non-active prescriptions may exist — open the full list.',

    latestVitals: 'Latest Vitals',
    vitalsFailed:
      'Vitals could not be read for any recent encounter. This is a failure to load, not a record with no vitals — pull down to retry.',
    vitalsEmpty: 'No vitals recorded in the {scan} most recent encounters.',

    recentEncounters: 'Recent Encounters',
    encountersEmpty: 'No encounters on record.',

    recentOrders: 'Recent Orders & Results',
    ordersEmpty: 'No orders in the {scan} most recent encounters.',

    // ---- Allergy block. SAFETY-CRITICAL — do not soften. ----------------
    allergy: {
      failedTitle: 'Allergies could not be loaded',
      // `{error}` is the loader's own message; the rest is the part that must
      // survive translation intact — this is NOT a statement about allergies.
      failedBody:
        '{error} This is NOT a statement that the patient has no allergies — the list could not be read at all. Check the allergy record another way before prescribing.',

      loadingTitle: 'Checking allergies…',
      loadingBody:
        'The allergy list has not loaded yet. Do not read the absence of a warning as an all-clear.',

      noneTitle: 'No known allergies recorded',
      noneBody:
        'Nothing is on this patient’s allergy list. An empty list is not the same as a negative allergy history — confirm with the patient.',

      one: 'Allergy',
      many: 'Allergies ({count})',
      accessibility: 'Allergies: {list}',
      more: '+ {count} more — tap to see all',

      retry: 'Try again',
      retrying: 'Trying…',
      staleWithTime: 'Refresh failed — showing what was loaded at {when}. Tap to retry.',
      stale: 'Refresh failed — showing what was loaded. Tap to retry.',
    },

    // ---- Incompleteness ------------------------------------------------
    incompleteLead: 'This list is incomplete.',
    incompleteFailed:
      '{failed} of the {total} recent visits could not be read, so {noun} from those visits are missing.',
    incompleteTruncated:
      'Only the {scan} most recent visits were searched — older {noun} are not shown.',
    nounMedications: 'medications',
    nounResults: 'results',
    nounDiagnoses: 'diagnoses',
    nounRecordings: 'recordings',

    // ---- Vitals card ---------------------------------------------------
    vitals: {
      bloodPressure: 'Blood pressure',
      pulse: 'Pulse',
      temperature: 'Temperature',
      respiratoryRate: 'Respiratory rate',
      spo2: 'SpO₂',
      weight: 'Weight',
      height: 'Height',
      bmi: 'BMI',
      bloodGlucose: 'Blood glucose',
      headCircumference: 'Head circumference',

      bpRange: '{systolic} over {diastolic} mmHg',
      usual: 'Usual: {range}',
      noRange: 'No usual range available',
      isBand: '{label} is {band}',

      timeUnknown: 'Recording time not stated',
      recordedAgo: 'Recorded {ago}',
      noMeasurements: 'This recording has no measurements on it.',
      footnote:
        'Usual ranges are the general adult bands OPES uses across the record. They are a screening aid, not a target for this patient.',
    },

    readOnly:
      'Read-only view. Prescribing, ordering and clinical documentation are done in the OPES EMR desktop system, where the safety checks and signing run.',
  },

  // ── PatientChartSectionScreen ───────────────────────────────────────────
  section: {
    loading: 'Loading…',

    title: {
      summary: 'Chart Summary',
      encounters: 'Encounters',
      diagnoses: 'Problems & Diagnoses',
      medications: 'Medications',
      labs: 'Laboratory',
      imaging: 'Imaging',
      vitals: 'Vitals',
      allergies: 'Allergies',
      documents: 'Documents',
    },

    summaryTitle: 'The chart is the summary',
    summaryBody: 'There is no separate summary section — the patient chart itself is the overview.',
    notHereTitle: '{section} are not in the mobile chart',
    notHereBody:
      'This section is part of the OPES EMR desktop record. The mobile chart carries allergies, problems, medications, vitals, encounters and results.',
    openChart: 'Open the chart',

    problemList: 'Problem List',
    problemListEmpty: 'Nothing has been added to this patient’s problem list.',
    groupActive: 'Active',
    groupInactive: 'Inactive',
    groupResolved: 'Resolved',
    groupOther: 'Other',
    groupCount: '{label} ({count})',

    codedDiagnoses: 'Diagnoses Coded at Recent Visits',
    loadingDiagnoses: 'Loading diagnoses…',
    diagnosesEmpty: 'No diagnoses were coded in the {scan} most recent encounters.',

    scanWarning_one:
      '{count} encounter could not be read, so some {noun} are missing from this list.',
    scanWarning_other:
      '{count} encounters could not be read, so some {noun} are missing from this list.',

    medsEmptyTitle: 'No prescriptions found',
    medsEmptyBody: 'Nothing was prescribed in the {scan} most recent encounters.',
    medsActive: 'Active',
    medsNotActive: 'Not active',
    dose: 'Dose',
    frequency: 'Frequency',
    route: 'Route',
    duration: 'Duration',
    instructions: 'Instructions',
    prescribed: 'Prescribed',

    loadingVitals: 'Loading vitals…',
    vitalsEmptyTitle: 'No vitals recorded',
    vitalsEmptyBody: 'No vital signs were recorded in the {scan} most recent encounters.',

    encountersEmptyTitle: 'No encounters',
    encountersEmptyBody: 'This patient has no recorded encounters.',
    showingRecent: 'Showing the {shown} most recent of {total} encounters.',
    chiefComplaint: 'Chief complaint',
    subjective: 'Subjective',
    objective: 'Objective',
    assessment: 'Assessment',
    plan: 'Plan',
    dischargeNote: 'Discharge note',
    followUp: 'Follow-up',

    noOrdersImaging: 'No imaging orders',
    noOrdersLab: 'No laboratory orders',
    noOrdersOthers_one:
      'Nothing of this kind was ordered in the {scan} most recent encounters, though {count} other order was placed.',
    noOrdersOthers_other:
      'Nothing of this kind was ordered in the {scan} most recent encounters, though {count} other orders were placed.',
    noOrdersAtAll: 'Nothing was ordered in the {scan} most recent encounters.',

    ordered: 'Ordered',
    clinicalNotes: 'Clinical notes',
    reportedResult: 'Reported result',
    itemisedFailed: 'Itemised results could not be loaded. {error}',
    loadingItemised: 'Loading itemised results…',
    noItemisedWithSummary:
      'No itemised analyte values were entered for this order — the reported result above is what the laboratory released.',
    noItemised: 'No values have been entered for this order yet.',
    labReference: 'Lab reference: {range}',
    noLabReference: 'No reference range supplied by the laboratory',
  },

  // ── ResultsInboxScreen ──────────────────────────────────────────────────
  inbox: {
    title: 'Results Inbox',
    subtitle: 'Awaiting your acknowledgement',
    loading: 'Loading your inbox…',

    tabToReview: 'To Review',
    tabCritical: 'Critical',
    tabDone: 'Done',
    tabAll: 'All',
    tabWithCount: '{label} ({count})',

    emptyUnackTitle: 'Nothing awaiting review',
    emptyUnackBody: 'Every result sent to you has been acknowledged.',
    emptyCriticalTitle: 'No critical results',
    emptyCriticalBody:
      'No result sent to you has been flagged critical by the laboratory or radiologist.',
    emptyAckedTitle: 'Nothing acknowledged yet',
    emptyAckedBody: 'Results you acknowledge — here or on a workstation — will be listed here.',
    emptyAllTitle: 'No results yet',
    emptyAllBody:
      'Results from orders you placed will arrive here once the laboratory releases them.',

    // SAFETY-CRITICAL — the pinned banner over an unacknowledged critical.
    criticalBanner_one: '1 critical result is not acknowledged',
    criticalBanner_other: '{count} critical results are not acknowledged',
    criticalBannerBody:
      'Critical results are pinned to the top of this list and must each be acknowledged individually.',

    // The red rail on a critical row. Shouted on purpose, in both languages.
    rail: 'CRITICAL — ACKNOWLEDGE NOW',
    patientNotOnRecord: 'Patient not on record',
    badgeAcknowledged: 'Acknowledged',
    badgeCritical: 'Critical',

    categoryFallback: 'Result',
    category: {
      lab_review: 'Critical Lab',
      lab_result: 'Lab Result',
      laboratory: 'Lab Result',
      radiology: 'Radiology Report',
    },
  },

  // ── ResultDetailScreen. SAFETY-CRITICAL throughout. ─────────────────────
  result: {
    title: 'Result',
    loading: 'Loading this result…',

    criticalTitle: 'CRITICAL RESULT — NOT ACKNOWLEDGED',
    criticalBody:
      'This result was flagged critical when it was released. It stays unacknowledged until you confirm below.',

    badgeAcknowledged: 'Acknowledged',
    badgeCritical: 'Critical',
    badgeAwaiting: 'Awaiting review',

    patient: 'Patient',
    patientNotOnRecord: 'Not on record',
    medicalId: 'Medical ID',
    test: 'Test',
    reported: 'Reported',

    values: 'Values',
    noValues: 'The laboratory has not released individual values for this order.',
    valuesCaption:
      'Values, flags and reference intervals are shown exactly as the laboratory released them. Where no interval was recorded, none is shown.',
    noFlag: 'No flag recorded',
    reference: 'Reference {range}',
    noReference: 'No reference interval recorded by the laboratory',

    report: 'Report',
    reportNumber: 'Report',
    reportStatus: 'Status',
    radiologist: 'Radiologist',
    technique: 'Technique',
    findings: 'Findings',
    impression: 'Impression',
    recommendation: 'Recommendation',

    noDetailTitle: 'Detail not available on this device',
    noDetailBody:
      'The underlying record could not be loaded for this notification. What is shown above is the notification as it was raised — open the patient’s chart on a workstation for the full report.',

    ackedBy: 'Acknowledged by {name} — {when}.',
    ackedByUnknown: 'a clinician',
    ackedCaption: 'This is the same acknowledgement the desktop results inbox shows.',

    ackCritical: 'Acknowledge Critical Result',
    ack: 'Acknowledge Result',
    ackCaption:
      'Acknowledging records your name and the time against this result on the hospital record. You will be asked to confirm.',

    // The confirmation names the patient and the result on purpose: an
    // accidental tap must not be able to become an acknowledgement.
    confirmCriticalTitle: 'Acknowledge this CRITICAL result?',
    confirmTitle: 'Acknowledge this result?',
    confirmMessage:
      '{patient}{number} — {title}.\n\nYour name and the time will be recorded against this result on the hospital record, and it will show as acknowledged on the desktop inbox too. This cannot be undone from the app.',
    confirmThisPatient: 'this patient',
    confirmCta: 'Acknowledge',
    confirmCancel: 'Not yet',

    // The server answered, but not with an acknowledgement. Never painted as done.
    notAckedTitle: 'Not acknowledged',
    notAckedBody:
      'The hospital record did not come back with an acknowledgement. Please try again, or acknowledge it on a workstation.',

    doneTitle: 'Acknowledged',
    doneBody: 'Recorded against {patient} at {when} in the name of {name}.',
    doneNameYou: 'you',

    failedTitle: 'Could not acknowledge',
    failedHint:
      'Open this result again — if it shows as acknowledged, it was recorded. If it does not, acknowledge it again or use a workstation.',
  },

  // ── DoctorMessagesScreen ────────────────────────────────────────────────
  messages: {
    title: 'Messages',
    loading: 'Loading your conversations…',

    folderWaiting: 'Waiting on You',
    folderAll: 'All',
    folderArchived: 'Archived',

    nobodyWaiting: 'Nobody is waiting on a reply.',
    waiting_one: '{count} conversation waiting on your reply',
    waiting_other: '{count} conversations waiting on your reply',
    defaultSubtitle: 'Your patient and colleague conversations',

    metaPatient: 'Patient',
    metaColleague: 'Colleague',
    conversation: 'Conversation',

    emptyWaitingTitle: 'Nothing waiting on you',
    emptyWaitingBody: 'Every conversation addressed to you has been answered.',
    emptyArchivedTitle: 'No archived conversations',
    emptyArchivedBody: 'Conversations you archive are kept here.',
    emptyAllTitle: 'No conversations yet',
    emptyAllBody: 'When a patient or a colleague writes to you, the conversation appears here.',
  },

  // ── DoctorMessageThreadScreen ───────────────────────────────────────────
  thread: {
    loading: 'Loading conversation…',
    fallbackName: 'Conversation',

    emptyTitle: 'No messages yet',
    emptyBody: 'Nothing has been written in this conversation.',

    placeholder: 'Reply to your patient…',
    closedNote: 'This conversation is closed and cannot receive replies.',

    optionsTitle: 'Conversation options',
    markUnread: 'Mark as unread',
    reopen: 'Reopen',
    archive: 'Archive',
    cancel: 'Cancel',

    // Never asserts "not sent" when the outcome is unknown.
    sendFailedHint:
      'Pull down to refresh this conversation to see whether your reply reached the patient.',
    sendFailedFallback: "Your reply couldn't be sent. Check your connection and try again.",
    stateFailedHint: 'Open Messages again to see the conversation’s current state.',
    stateFailedFallback: "That change couldn't be saved.",
  },

  // ── DoctorProfileScreen ─────────────────────────────────────────────────
  // The clinician's own account, and the only way to end a session on a
  // shared or lost device. Nothing here is patient-facing copy.
  profile: {
    title: 'Profile',
    subtitle: 'Your account on this device',
    loading: 'Loading your account…',

    // Shown when GET /auth/me could not be reached. The account below is then
    // the one this device is signed in as, which is still the truth about the
    // session — so sign-out stays available and is never blocked by it.
    refreshFailed:
      'Your account could not be refreshed from the hospital record just now. What is shown below is the account this device is signed in as.',

    // Keys are `users.role`. An unknown role is shown as "Staff" rather than
    // as a database token.
    roleFallback: 'Staff',
    role: {
      admin: 'Administrator',
      doctor: 'Doctor',
      nurse: 'Nurse',
      radiologist: 'Radiologist',
      lab_tech: 'Laboratory technician',
      pharmacist: 'Pharmacist',
      receptionist: 'Receptionist',
      cashier: 'Cashier',
    },

    sectionAccount: 'Account',
    rowName: 'Name',
    rowRole: 'Role',
    rowEmail: 'Email',
    rowStatus: 'Account status',
    statusActive: 'Active',
    statusInactive: 'Inactive',

    // ── Professional profile ────────────────────────────────────────────────
    // What colleagues and patients see: title, specialty, experience, bio,
    // languages, qualifications and consulting room. Editable by the clinician,
    // except the three the hospital governs (fee, currency, licence).
    sectionProfile: 'Professional profile',
    profileLoading: 'Loading your profile…',
    // A refresh of the profile failed while the account above is still shown.
    profileRefreshFailed:
      'Your professional profile could not be loaded just now. Pull down to try again.',

    noProfileTitle: 'No professional profile yet',
    noProfileBody:
      'Your professional details have not been set up on the hospital record. Add your title, specialty and more so colleagues and patients can see who you are.',
    addDetails: 'Add my details',

    edit: 'Edit',
    editProfile: 'Edit profile',
    editHint: 'Update the details colleagues and patients see. The consultation fee and licence are set by the hospital.',
    save: 'Save changes',
    cancel: 'Cancel',

    // Display rows
    rowTitle: 'Title',
    rowSpecialty: 'Specialty',
    rowSubspecialty: 'Subspecialty',
    rowExperience: 'Experience',
    rowLanguages: 'Languages',
    rowQualifications: 'Qualifications',
    rowRoom: 'Consulting room',
    rowFee: 'Consultation fee',
    rowLicense: 'Licence',
    aboutTitle: 'About',
    bioEmpty: 'No biography added yet.',
    notSet: 'Not set',
    experienceYears_one: '{count} year',
    experienceYears_other: '{count} years',

    // Edit fields
    fieldTitle: 'Title',
    fieldTitlePlaceholder: 'e.g. Consultant',
    fieldSpecialty: 'Specialty',
    fieldSpecialtyPlaceholder: 'e.g. Cardiology',
    fieldSubspecialty: 'Subspecialty',
    fieldSubspecialtyPlaceholder: 'e.g. Electrophysiology',
    fieldExperience: 'Years of experience',
    fieldExperiencePlaceholder: 'e.g. 11',
    fieldRoom: 'Consulting room',
    fieldRoomPlaceholder: 'e.g. 4',
    fieldBio: 'About you',
    fieldBioPlaceholder: 'A short professional biography.',
    fieldLanguages: 'Languages',
    fieldLanguagesHint: 'Separate each language with a comma.',
    fieldQualifications: 'Qualifications',
    fieldQualificationsHint: 'Separate each qualification with a comma.',
    feeReadOnly: 'Set by the hospital — not editable here.',

    // Licence badge. Keys are the API's `license_status`; an unknown value is
    // shown as "Licence" rather than a database token.
    licenseFallback: 'On record',
    license: {
      active: 'Licence active',
      expired: 'Licence expired',
      pending: 'Licence pending',
      suspended: 'Licence suspended',
    },

    // Language codes → names. An unlisted code is shown as typed.
    langName: {
      en: 'English',
      fr: 'French',
    },

    // Photo
    photo: 'Photo',
    changePhoto: 'Change photo',
    addPhoto: 'Add photo',
    // Shown on native, where there is no in-app picker (no image-picker
    // dependency is bundled): the clinician uploads from the desktop instead.
    photoDesktopOnly: 'Add or change your photo from the OPES EMR desktop system.',
    photoInvalid: 'Choose an image file smaller than 5 MB.',
    photoFailedTitle: 'Photo not changed',
    photoCheckHint: 'Open your profile again to see whether the new photo was saved.',

    // Save failures — never claimed to have succeeded when the outcome is unknown.
    saveFailedTitle: 'Profile not saved',
    saveCheckHint: 'Open your profile again to see whether your changes were saved.',

    sectionSession: 'This device',
    signOut: 'Sign Out',
    signOutHint:
      'Sign out before you hand this phone to anyone else. Everything cached on this device — patient names, results, conversations — is removed when you do.',

    confirmTitle: 'Sign out of OPES EMR?',
    confirmMessage:
      'You are signed in as {name}. Signing out ends this session on this device and removes everything cached here. You will need your password to sign in again.',
    confirmCta: 'Sign Out',
    confirmCancel: 'Stay signed in',

    // Never claims the session ended when it did not.
    failedTitle: 'Could not sign out',
    failedBody:
      'This session is still open on this device. Check your connection and try again — if it will not end, change your password on a workstation.',
  },

  // ── WrongAppScreen ──────────────────────────────────────────────────────
  wrongApp: {
    header: 'OPES EMR',
    title: 'This app is for patients and clinicians',
    signedInAs: 'You’re signed in as {name}. ',
    body:
      'This account does not have a clinical role, so there is nothing here for it yet. Use the OPES EMR desktop system for your work, and sign in here with a patient account if you have one.',
    signOut: 'Sign Out',
  },
} as const;
