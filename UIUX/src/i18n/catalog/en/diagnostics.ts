/**
 * `diagnostics` strings, English. One cluster per file so translators do not
 * collide. Contract: src/i18n/index.ts. Keys and order match the fr twin.
 */
export const diagnostics = {
  // ── shared.tsx — async states used by this cluster (and by imaging) ──────
  async: {
    loading: 'Loading…',
    linkTitle: 'Link your Health ID',
    linkBody:
      'This account isn’t linked to a clinical record yet. Link your OPES Health ID to see your laboratory and imaging results.',
    linkCta: 'Link My Health ID',
    errorTitle: 'Couldn’t load this',
    errorCta: 'Try Again',
  },

  // ── Reference-range flags. A fixed server enum rendered as UI chrome. ────
  flag: {
    normal: 'Normal',
    low: 'Low',
    high: 'High',
    abnormal: 'Abnormal',
    critical: 'Critical',
    pending: 'Awaiting results',
  },

  // ── Screen-reader wording ───────────────────────────────────────────────
  // A sighted patient reads the flag from a colour and a chip. Colour is not
  // an accessible signal, so every spoken row says in words where the value
  // sits against the laboratory's own range — and says so without inventing a
  // threshold when the laboratory sent none.
  a11y: {
    resultRow: '{analyte}, {value}. {range}. {status}',
    historyRow: '{date}, {value}. {range}. {status}',
    latestResult: '{analyte}, latest result {value} on {date}. {range}. {status}',
    rangeUsual: 'Usual range {range}',
    rangeNone: 'Usual range: {noRange}',

    statusNormal: 'Normal, within the usual range',
    statusLow: 'Low — below the usual range',
    statusHigh: 'High — above the usual range',
    statusAbnormal: 'Abnormal — outside the usual range',
    statusCritical: 'Critical — outside the safe range. Contact your care team.',
    statusUnflagged: 'No comparison with a usual range was given',

    openTrend: 'Shows how this test has changed over time',
    loading: 'Loading',
    loaded: 'Loaded',
  },

  // ── Table column headings, shared by DIA-002 / DIA-003 / DIA-004 ────────
  table: {
    test: 'Test',
    date: 'Date',
    result: 'Result',
    unit: 'Unit',
    referenceRange: 'Reference Range',
    usualRange: 'Usual Range',
    status: 'Status',
  },

  // ── DIA-001 Laboratory & Imaging dashboard ──────────────────────────────
  dashboard: {
    title: 'Lab & Imaging',
    heroTitle: 'Laboratory & Imaging',
    heroSubtitle: 'Review your lab results, imaging studies and trends over time.',
    loading: 'Loading your diagnostics…',

    // States the fact, names no diagnosis, points at the care team.
    criticalTitle_one: '{count} critical result needs attention',
    criticalTitle_other: '{count} critical results need attention',
    criticalBody: '{analyte} is outside the safe range at {value}. Contact your care team.',
    criticalBodyGeneric: 'One of your results is outside the safe range. Contact your care team.',
    reviewCritical: 'Review Critical Result',

    overview: 'Overview',
    statOrders: 'Lab Orders',
    statPending: 'Pending',
    statAbnormal: 'Abnormal',
    statCritical: 'Critical',

    tabLabs: 'Lab Results',
    tabImaging: 'Imaging',

    recentLabs: 'Recent Lab Results',
    labsEmptyTitle: 'No lab results yet',
    labsEmptyBody: 'Results appear here as soon as the laboratory releases them.',
    labsEmptyCta: 'Request a Lab Test',
    resultCount_one: '{count} result',
    resultCount_other: '{count} results',

    recentImaging: 'Recent Imaging Studies',
    imagingEmptyTitle: 'No imaging studies yet',
    imagingEmptyBody: 'X-rays, scans and ultrasounds ordered for you will be listed here.',
    imagingEmptyCta: 'Book an Imaging Study',
    reportReady: 'Report ready',
    awaitingReport: 'Awaiting report',

    trackTrend: 'Track a Trend',
    trendHint: 'See how a single analyte has moved across your last results.',

    quickActions: 'Quick Actions',
    actionRequest1: 'Request',
    actionRequest2: 'Lab Test',
    actionCollection1: 'Sample',
    actionCollection2: 'Collection',
    actionImaging1: 'Imaging',
    actionImaging2: 'History',
    actionBook1: 'Book',
    actionBook2: 'Imaging',

    latestPanel: 'Latest panel',
    latestMeta: '{date} · {count} results',
    openResultDetail: 'Open Result Detail',
  },

  // ── DIA-002 Lab Result Detail ───────────────────────────────────────────
  result: {
    title: 'Lab Result',
    heroTitle: 'Lab Result Detail',
    heroSubtitle: 'View your laboratory test result and doctor’s interpretation.',
    loading: 'Loading your result…',

    finalResult: 'Final Result',
    orderId: 'Order ID',
    sampleDate: 'Sample Date',
    resultDate: 'Result Date',
    status: 'Status',

    criticalTitle_one: '{count} critical result in this panel',
    criticalTitle_other: '{count} critical results in this panel',
    criticalBody: '{values} — outside the safe range. Contact your care team as soon as possible.',

    orderingProvider: 'Ordering Provider',
    careTeam: 'Care team',
    orderingClinician: 'Ordering clinician',
    contact: 'Contact',

    summary: 'Result Summary',
    statNormal: 'Normal',
    statLow: 'Low',
    statHigh: 'High',
    statCritical: 'Critical',
    statTotal: 'Total Tests',

    testResults: 'Test Results',
    interpretation: 'Interpretation',
    signedBy: 'Electronically signed by: {name}',

    actionDownload1: 'Download',
    actionDownload2: 'PDF',
    actionShare1: 'Share',
    actionShare2: 'Result',
    actionTrends1: 'View',
    actionTrends2: 'Trends',
    actionMessage1: 'Send to Doctor',
    actionMessage2: 'Message',
  },

  // ── DIA-003 Lab Result Trend ────────────────────────────────────────────
  trend: {
    title: 'Result Over Time',
    heroTitle: 'Lab Result Trend',
    heroSubtitle: 'View and track your lab test results over time.',
    loading: 'Loading your trend…',

    noneAvailable: 'No chartable results are available yet.',
    emptyTitle: 'No chartable results',
    emptyBody: 'This test has no numeric results yet, so there is nothing to plot.',

    resultsFound_one: '{count} Result Found',
    resultsFound_other: '{count} Results Found',
    changeTest: 'Change Test',
    dateRange: 'Date Range',
    viewBy: 'View By',
    viewByDate: 'Date',

    // States the fact, gives no diagnosis and no advice, points at the team.
    criticalTitle: 'Critical result — act now',
    criticalBody:
      'Your latest {analyte} is {value}, far outside the reference range of {range}. Contact your care team immediately.',
    messageDoctor: 'Message My Doctor',

    normalRange: 'Normal Range: {range}',
    latestResult: 'Latest Result ({date})',
    trendLabel: 'Trend',
    dirRising: 'Rising',
    dirFalling: 'Falling',
    dirStable: 'Stable',
    vsFirst: 'vs. first result',

    history: 'Results History',

    chartUpperLimit: 'Upper Limit: {value}',
    chartLowerLimit: 'Lower Limit: {value}',

    actionDetail1: 'View',
    actionDetail2: 'Result Detail',
    actionDownload1: 'Download',
    actionDownload2: 'Report',
    actionShare1: 'Share',
    actionShare2: 'Report',
    actionMessage1: 'Send to',
    actionMessage2: 'Doctor',
  },

  // ── DIA-004 Lab Report (full) ───────────────────────────────────────────
  report: {
    title: 'Lab Report',
    heroTitle: 'Lab Report',
    heroSubtitle:
      'Your complete laboratory report with all test results and the doctor’s interpretation.',
    loading: 'Loading your report…',

    reportHeading: 'Laboratory Report',
    patientName: 'Patient Name',
    healthId: 'Health ID',
    sexAge: 'Sex / Age',
    years: '{count} years',
    orderedBy: 'Ordered By',
    yourCareTeam: 'Your care team',
    sampleDate: 'Sample Date',
    reportDate: 'Report Date',
    notReportedYet: 'Not reported yet',
    status: 'Status',
    priority: 'Priority',

    criticalTitle_one: '{count} result outside the safe range',
    criticalTitle_other: '{count} results outside the safe range',
    criticalBody: '{values}. Contact your care team as soon as possible.',

    flaggedTitle_one: '{count} result outside the usual range',
    flaggedTitle_other: '{count} results outside the usual range',
    flaggedBody:
      'A value outside the usual range is not a diagnosis on its own. Your care team reads this report alongside the rest of your record — ask them what it means for you.',

    testResults: 'Test Results',
    pendingTitle: 'Results are not back yet',
    pendingBody:
      'The laboratory has not released a verified result for this order. It appears here as soon as it is signed off.',

    // The lab sent no bounds for this analyte. Never let an absence read as
    // a normal result, and never invent a threshold in the app.
    noRange: 'Not provided',
    rangeNote:
      'Usual ranges are the laboratory’s own, sent with each result. Where the laboratory sent none, this report says “{noRange}” rather than showing a range that is not theirs.',

    interpretation: 'Interpretation',
    signedBy: 'Electronically signed by {name}',
    yourCareTeamLower: 'your care team',

    reportFile: 'Report File',
    fileFallback: 'Laboratory report',
    noPdfTitle: 'No signed PDF on file',
    noPdfBody:
      'Everything above is your report as the laboratory recorded it. A downloadable PDF has not been filed for this order — your care team can issue one, and you can message them below.',

    technicalCaption:
      'Reference numbers your clinic and laboratory use to track this order. You only need these if someone asks for them.',
    factTestCode: 'Test code',
    factOrderRef: 'Order reference',
    factVisitRef: 'Visit reference',
    factDocumentRef: 'Document reference',

    opening: 'Opening…',
    preparing: 'Preparing…',
    actionDownload1: 'Download',
    actionDownload2: 'PDF',
    actionShare1: 'Share',
    actionShare2: 'Report',
    actionMessage1: 'Send to',
    actionMessage2: 'Doctor',
    actionPrint1: 'Print',
    actionPrint2: 'Report',

    shareName: '{name} — Lab Report',

    noDownloadTitle: 'No PDF to download',
    noDownloadBody:
      'A signed PDF has not been filed for this order yet. Ask your care team to issue one.',
    noShareTitle: 'Nothing to share yet',
    noShareBody:
      'Sharing sends the signed PDF, and one has not been filed for this order yet.',
    noPrintTitle: 'No PDF to print',
    noPrintBody: 'Printing opens the signed PDF, and one has not been filed for this order yet.',

    failDownloadTitle: 'Couldn’t download the report',
    failShareTitle: 'Couldn’t share the report',
    failOpenTitle: 'Couldn’t open the report',
    failHint: 'Open the report from Documents to check whether it came through.',
    failFallback: 'The report could not be prepared just now.',
  },

  // ── DIA-006 Request a Lab Test ──────────────────────────────────────────
  request: {
    title: 'Request Lab Test',
    heroTitle: 'Request a Lab Test',
    heroSubtitle:
      'Ask your doctor for a laboratory test. They review every request before it reaches the laboratory.',
    loading: 'Loading the test catalogue…',

    noThreadTitle: 'Start a conversation first',
    noThreadBody:
      'A test request is sent to a doctor inside a conversation, and you don’t have one open yet. Message your care team, then come back here.',
    noThreadCta: 'Message My Care Team',

    // A patient cannot place a laboratory order, only ask for one.
    noticeTitle: 'Your doctor approves every request',
    noticeBody:
      'This sends a request, not an order. Nothing is booked with the laboratory until a doctor reviews and approves it.',

    step1: '1. Send To',
    yourCareTeam: 'Your care team',

    step2: '2. Select a Test',
    searchPlaceholder: 'Search the test catalogue',
    searchA11y: 'Search the laboratory test catalogue',
    clearSearch: 'Clear the search',
    clearTest: 'Clear the chosen test',
    noMatch:
      'No test in the catalogue matches “{query}”. Try a shorter search, or describe what you need in the box below.',

    step3: '3. How Soon',
    urgencyHint:
      'Your doctor decides the final urgency — this tells them how soon you feel you need it.',

    step4: '4. {label}',
    notesLabelFallback: 'Why you want this test',
    notesPlaceholder: 'Describe the symptoms or the reason you are asking for this test…',

    sending: 'Sending…',
    submit: 'Send Request',
    readyHint: 'Choose a conversation and a test to send your request.',

    sentTitle: 'Request sent',
    sentBody:
      'Your doctor has the request and will approve or decline it. You can follow it in the conversation — nothing is booked until they approve.',
    sentClose: 'Close',
    openConversation: 'Open Conversation',

    failTitle: 'Couldn’t send the request',
    failHint:
      'Open the conversation to check whether the request went through before sending it again.',
    failFallback: 'The request could not be sent just now.',
  },

  // ── DIA-005 Lab Appointment / Sample Collection ─────────────────────────
  collection: {
    title: 'Sample Collection',
    heroTitle: 'Lab Appointment',
    heroSubtitle:
      'Where and when to give your sample, and the tests the laboratory is waiting on.',
    loading: 'Loading your collection appointment…',

    upcoming: 'Upcoming',
    statDuration: 'Duration',
    statStatus: 'Status',
    statVisit: 'Visit',
    visitInPerson: 'In person',
    visitVideo: 'Video',
    statBookedOn: 'Booked On',

    patientInformation: 'Patient Information',
    years: '{count} years',
    profile: 'Profile',

    orderDetails: 'Order Details',
    yourCareTeam: 'Your care team',
    laboratory: 'Laboratory',
    view: 'View',
    reasonLabel: 'Reason for this visit',

    location: 'Collection Location',
    locationFallback: 'Your clinic will confirm the room',
    directions: 'Directions',

    // No preparation advice is invented here: it comes from the ordering team.
    beforeTitle: 'Before you come in',
    beforeBody:
      'Bring a valid ID card and your Health ID. Any preparation for these tests — fasting, for example — comes from the team who ordered them, so check with them if you are unsure.',

    noAppointmentTitle: 'No lab appointment booked',
    noAppointmentBody:
      'You have no laboratory collection visit on file. If a test has been ordered for you, your care team can book the collection, or you can ask them here.',
    noAppointmentCta: 'Request a Lab Test',

    awaitingSample: 'Tests Awaiting a Sample',
    awaitingEmpty: 'No test is currently waiting on a sample from you.',
    orderedOn: '{priority}  •  Ordered {date}',

    otherVisits: 'Other Lab Visits',
    otherVisitMeta: '{time}  •  {status}',

    technicalCaption:
      'Reference numbers your clinic uses to track this visit. You only need these if someone asks for them.',
    factAppointmentRef: 'Appointment reference',
    factBookedThrough: 'Booked through',

    reschedule: 'Reschedule',
    cancelVisit: 'Cancel Visit',
    checkIn: 'Start Check-in',
  },
} as const;
