/**
 * English catalogue. The contract lives in `src/i18n/index.ts` — read it.
 *
 * Keep this file and `fr.ts` in the SAME ORDER with the SAME KEYS.
 * `npm run i18n:check` fails the moment they diverge.
 */
import type { Catalog } from '../../engine';

export const core = {
  // ── Shared vocabulary ───────────────────────────────────────────────────
  common: {
    save: 'Save',
    saveChanges: 'Save Changes',
    saving: 'Saving…',
    cancel: 'Cancel',
    close: 'Close',
    retry: 'Try again',
    loading: 'Loading…',
    view: 'View',
    viewAll: 'View all',
    learnMore: 'Learn More',
    edit: 'Edit',
    yes: 'Yes',
    no: 'No',
    none: '—',
    notRecorded: 'Not recorded',
    unknown: 'Unknown',
    continue: 'Continue',
    signIn: 'Sign In',
    signOut: 'Sign Out',
    complete: 'Complete',
    incomplete: 'Incomplete',
    verified: 'Verified',
    unverified: 'Unverified',
    moreOptions: 'More options',
    notifications: 'Notifications',
    today: 'Today',
    yesterday: 'Yesterday',
  },

  // ── App shell ───────────────────────────────────────────────────────────
  tabs: {
    home: 'Home',
    // The destination is "Health Records" everywhere; the tab strip is the one
    // place the full name will not fit at 11pt, so the label abbreviates.
    records: 'Records',
    recordsFull: 'Health Records',
    quickAdd: 'Quick Add',
    messages: 'Messages',
    profile: 'Profile',
    schedule: 'Schedule',
    patients: 'Patients',
    results: 'Results',
  },

  quickAdd: {
    title: 'Quick Add',
    bookAppointment: 'Book Appointment',
    requestLabTest: 'Request Lab Test',
    requestRefill: 'Request Refill',
    messageProvider: 'Message a Provider',
    showHealthId: 'Show My Health ID',
  },

  // ── Auth ────────────────────────────────────────────────────────────────
  auth: {
    login: {
      title: 'Secure Access to Your Health',
      subtitle: 'Sign in to your OPES EMR account and manage your health anytime, anywhere.',
      welcomeBack: 'Welcome Back',
      emailPlaceholder: 'Email or Phone Number',
      passwordPlaceholder: 'Password',
      submit: 'Sign In',
      sessionExpired: 'Your session expired. Please sign in again.',
      badCredentials: 'Incorrect email or password.',
      forgotPassword: 'Forgot password?',
      // Honest interim: there is no self-service password reset endpoint yet, so
      // this must NOT pretend to send anything. It tells the patient exactly how
      // to regain access through the facility instead.
      forgotTitle: 'Regaining access to your account',
      forgotBody:
        'Passwords cannot be reset from the app yet. To get back into your account, contact your care facility in person or by phone and give them your OPES Health ID. Reception can verify your identity and help you set a new password.',
      demoTitle: 'Try it without an account',
      demoBody: 'Demo login pre-loaded with sample appointments, visits, and prescriptions.',
      demoCta: 'Continue with Demo Account',
      demoLoading: 'Signing in…',
      demoUnavailable: 'Demo account is unavailable right now.',
      noAccount: 'Don’t have an account?',
      createAccount: 'Create Account',
      footerNote: 'Your data is protected with enterprise-grade security and encryption.',
    },
    signup: {
      title: 'Create Your Account',
      subtitle: 'Join OPES EMR and take control of your health information.',
      fullName: 'Full Name',
      email: 'Email Address',
      phone: 'Phone Number',
      dateOfBirth: 'Date of Birth (YYYY-MM-DD)',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      genderFemale: 'Female',
      genderMale: 'Male',
      genderOther: 'Other',
      privacyTitle: 'Your Privacy Matters',
      privacyBody: 'Your information is encrypted and will never be shared without your consent.',
      submit: 'Continue',
      failed: 'Could not create your account. Please check your details.',
      footerNote: 'Secure. Private. Interoperable.\nOne Patient. One Record. Limitless Care.',
    },
  },

  // ── Profile & Settings (CORE-008) ───────────────────────────────────────
  profile: {
    title: 'Profile & Settings',
    subtitle: 'Manage your profile, preferences and app settings.',
    loading: 'Loading your profile…',
    healthIdLabel: 'OPES Health ID: {id}',
    // Spoken hint: the row looks like text, and nothing about it says it can be
    // pressed or that pressing copies. The 16px glyph is the only visual clue.
    copyHealthIdHint: 'Copies your health ID so you can paste it elsewhere',
    patientSince: 'Patient Since {year}',

    quickOverview: 'Quick Overview',
    tileHealthId: 'Health ID',
    tileHealthRecord: 'Health Record',
    tileUpcomingAppointment: 'Upcoming Appointment',
    tileActiveMedications: 'Active Medications',

    accountSettings: 'Account Settings',
    personalInformation: 'Personal Information',
    personalInformationHint: 'Update your personal details',
    contactEmergency: 'Contact & Emergency',
    contactEmergencyHint: 'Manage your contact and emergency information',
    security: 'Security',
    securityHint: 'Password, biometrics and account security',
    privacyData: 'Privacy & Data',
    privacyDataHint: 'Manage your data, permissions and sharing',
    notificationPreferences: 'Notification Preferences',
    notificationPreferencesHint: 'Manage your notification settings',
    language: 'Language',
    languageHint: 'Choose your preferred language',

    preferences: 'Preferences',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'Match system',
    units: 'Units',
    unitsMetric: 'Metric (kg, cm)',
    unitsImperial: 'Imperial (lb, in)',
    dateFormat: 'Date Format',
    timeFormat: 'Time Format',
    time24h: '24-Hour',
    time12h: '12-Hour',

    accountSecurity: 'Account Security',
    accountSecure: 'Your account is secure',
    accountNeedsAttention: 'Your account needs attention',
    lastLogin: 'Last login: {value}',
    device: 'Device: {value}',
    unknownDevice: 'Unknown device',
    noRecentSignIn: 'No recent sign-in recorded',
    manageSecurity: 'Manage Security',

    // Sign out. This phone may be shared at a clinic desk, so the patient needs
    // a way to end their own session — the same one the doctor app uses.
    signOutSection: 'Session',
    signOutHint: 'Sign out on this device. Your record and everything saved for offline use are cleared from this phone.',
    signOutConfirmTitle: 'Sign out?',
    signOutConfirmMessage:
      'You will be signed out on this device, and your health record and offline data will be removed from this phone. You can sign back in anytime.',
    signOutConfirmCta: 'Sign Out',
    signOutFailedTitle: 'Could not sign out',
    signOutFailedBody: 'Something went wrong signing you out. Please try again.',

    privacyBannerTitle: 'Your health data is private and protected.',
    privacyBannerBody: 'We use industry-standard encryption to keep your information safe.',

    // Sheets
    personalSubtitle:
      'Name, date of birth and Health ID are verified at the front desk and cannot be changed here.',
    contactSubtitle: 'Who should we call if something urgent happens?',
    fieldPhone: 'Phone number',
    fieldEmail: 'Email address',
    fieldAddress: 'Address',
    fieldAddressPlaceholder: 'Street, quarter',
    fieldCity: 'City',
    fieldKinName: 'Emergency contact name',
    fieldKinNamePlaceholder: 'Full name',
    fieldKinPhone: 'Emergency contact phone',
    fieldRelation: 'Relationship',
    fieldRelationPlaceholder: 'Sister, spouse, …',
    saveFailed: 'Could not save your details. Please try again.',
    preferenceSaveFailed: 'Could not save that preference.',
    settingSaveFailed: 'Could not save that setting.',

    securitySheetSubtitle: 'Password changes are handled at the front desk for now.',
    privacySheetSubtitle: 'You decide how your record is used beyond your own care.',

    notifyAppointments: 'Appointments',
    notifyAppointmentsHint: 'Reminders, confirmations and changes',
    notifyMedications: 'Medications',
    notifyMedicationsHint: 'Dose reminders and refill alerts',
    notifyLabResults: 'Lab & imaging results',
    notifyLabResultsHint: 'Tell me when a result is ready',
    notifyMessages: 'Messages',
    notifyMessagesHint: 'New messages from your care team',
    notifyBilling: 'Billing',
    notifyBillingHint: 'Invoices and payment receipts',
    channelPush: 'Push notifications',
    channelPushHint: 'On this device',
    channelEmail: 'Email',
    channelEmailHint: 'To your registered email address',
    channelSms: 'SMS',
    channelSmsHint: 'To your registered phone number',
    biometric: 'Biometric unlock',
    biometricHint: 'Use Face ID or a fingerprint to open the app',
    twoFactor: 'Two-factor authentication',
    twoFactorHint: 'Ask for a one-time code at sign-in',
    shareResearch: 'Share anonymised data for research',
    shareResearchHint: 'Never includes anything that identifies you',
  },

  // ── Languages offered by the picker ─────────────────────────────────────
  languages: {
    'en-GB': 'English',
    'fr-FR': 'Français',
  },

  // ── CORE-006 Home Dashboard ─────────────────────────────────────────────
  home: {
    loading: 'Loading your health summary…',
    // Greeting is chrome, not clinical content: generated on the device and
    // localized by the hour, never taken from the server (which only speaks
    // English). morning < 12:00 ≤ afternoon < 18:00 ≤ evening.
    greetingMorning: 'Good morning',
    greetingAfternoon: 'Good afternoon',
    greetingEvening: 'Good evening',
    tagline: 'Your health. Connected. Secure. Anywhere.',
    idCardTitle: 'OPES Health ID',
    idCardValue: 'ID: {id}',
    idCardLink: 'View Health ID',

    summaryTitle: 'Health Summary',
    viewAll: 'View All',
    overallHealth: 'Overall Health',
    // Honest empty state for a brand-new record with nothing to score from —
    // shown in place of a meaningless "perfect" number.
    noScoreYet: 'Not enough data',
    // The score BAND label. Derived from the score, so it is UI chrome, not
    // clinical content — localized on the device rather than shown in the
    // server's English under a French UI.
    scoreGood: 'Good',
    scoreFair: 'Fair',
    scoreNeedsAttention: 'Needs attention',
    scoreAtRisk: 'At risk',
    lastCheckup: 'Last Checkup',
    noVisitRecorded: 'No visit recorded',
    nextAppointment: 'Next Appointment',
    nothingBooked: 'Nothing booked',
    healthIdStatus: 'Health ID Status',
    statusVerified: 'Verified',
    statusPending: 'Pending',
    allSystemsConnected: 'All systems connected',
    verificationNeeded: 'Verification needed',

    // "n days ago" under the last-checkup date.
    agoDays_one: '{count} day ago',
    agoDays_other: '{count} days ago',
    agoMonths_one: '{count} month ago',
    agoMonths_other: '{count} months ago',
    agoYears_one: '{count} year ago',
    agoYears_other: '{count} years ago',

    quickActions: 'Quick Actions',
    customize: 'Customize',
    // The rails break these onto two lines exactly as written.
    actionBook: 'Book\nAppointment',
    actionLabs: 'View\nLab Results',
    actionPrescriptions: 'My\nPrescriptions',
    actionRecords: 'Health\nRecords',
    actionProvider: 'Find\nProvider',

    recentRecords: 'Recent Health Records',
    noRecords: 'No records yet',
    noRecordsHint: 'Results and visit summaries will appear here.',
    typeLabResult: 'Lab Result',
    typeImaging: 'Imaging',
    typeEncounter: 'General Visit',
    resultAbnormal: 'Abnormal',
    resultNormal: 'Normal',
    actionViewResult: 'View Result',
    actionViewReport: 'View Report',
    actionViewSummary: 'View Summary',

    currentMedications: 'Current Medications',
    noMedications: 'No active medications right now.',
    nextDose: 'Next dose: {day}, {time}',
    noDoseScheduled: 'No dose scheduled',

    healthTip: 'Health Tip',
    noTips: 'No tips available right now.',
  },

  // ── CORE-007 My Health ID ───────────────────────────────────────────────
  healthId: {
    title: 'My Health ID',
    subtitle: 'Your universal identity across the OPES healthcare ecosystem.',
    about: 'About Health ID',
    loading: 'Loading your Health ID…',

    shareSubject: 'My OPES Health ID',
    shareQrSubject: 'OPES Health ID QR code',
    shareCardSubject: 'OPES Health ID card',
    shareBody: '{name} — OPES Health ID {id}\nIssued by {issuer}\n{payload}',

    tileShare: 'Share ID',
    tileShareCaption: 'Securely share',
    tileDepartments: 'Departments',
    tileDepartmentsCaption: '{count} connected',
    tileActivity: 'ID Activity',
    tileActivityCaption: 'Recent access',
    tileDownload: 'Download',
    tileDownloadCaption: 'Save QR code',
    tilePrint: 'Print Card',
    tilePrintCaption: 'Printable view',

    cardBrandSub: 'HEALTH ID',
    cardStatusLabel: 'ID STATUS',
    statusVerified: 'Verified',
    statusPending: 'Pending',
    statusSuspended: 'Suspended',
    fieldHealthId: 'Health ID',
    fieldFullName: 'Full Name',
    fieldDateOfBirth: 'Date of Birth',
    fieldGender: 'Gender',
    fieldPhone: 'Phone',
    scanToVerify: 'Scan to verify',
    lastUpdated: 'Last updated: {date}',
    cardFootCopy:
      'This ID connects you securely to hospitals, clinics, labs, pharmacies and other health providers.',
    cardFootBrand: 'OPES HEALTH ID',
    cardFootBrandSub: 'POWERED BY OPES INTEROPERABILITY LAYER',

    ecosystemTitle: 'CONNECTED TO HEALTHCARE ECOSYSTEM',
    activeConnections_one: '{count} active connection',
    activeConnections_other: '{count} active connections',
    groupHospitals: 'Hospitals',
    groupClinics: 'Clinics',
    groupLaboratories: 'Laboratories',
    groupPharmacies: 'Pharmacies',
    groupImaging: 'Imaging Centers',
    connected: '{count} connected',

    securityCopy: 'Your Health ID is unique to you and protected with enterprise-grade security.',
    securityLink: 'Learn more about OPES Health ID',
  },

  // ── CORE-003 Onboarding Welcome ─────────────────────────────────────────
  onboarding: {
    welcomeTitle: 'Welcome to OPES EMR',
    welcomeTagline: 'Your Health. Your Record. Your Control.',
    welcomeBody:
      'One place for your complete health information — your visits, your results, your medicines and your care team.',

    featuresTitle: 'Everything you need, in one place',
    featuresBody: 'Six things you can do from the moment you sign in.',
    featureRecords: 'Health Records',
    featureRecordsBody: 'Your medical history, whenever you need it.',
    featureLabs: 'Lab & Imaging',
    featureLabsBody: 'Results and reports as soon as they are ready.',
    featureAppointments: 'Appointments',
    featureAppointmentsBody: 'Book, reschedule and check in from your phone.',
    featureBilling: 'Billing & Insurance',
    featureBillingBody: 'Invoices, payments and cover in one place.',
    featurePrescriptions: 'Prescriptions',
    featurePrescriptionsBody: 'See what you are taking and ask for refills.',
    featureMessaging: 'Secure Messaging',
    featureMessagingBody: 'Message your care team without leaving the app.',

    valuesTitle: 'Built around your record',
    valuesBody: 'Three things that stay true wherever you are seen.',
    valueSecure: 'Secure & Private',
    valueSecureBody: 'Your record is encrypted, and you decide who you share it with.',
    valueConnected: 'Connected Care',
    valueConnectedBody:
      'Doctors, laboratories, hospitals and pharmacies working from the same record.',
    valueAccessible: 'Always Accessible',
    valueAccessibleBody:
      'Your health information travels with you, on any device you sign in from.',
    safetyTitle: 'Your data is safe with us',
    safetyBody: 'Your record is encrypted in transit and at rest, and every access to it is logged.',

    pageOf: 'Page {current} of {total}',
    next: 'Next',
    goToDashboard: 'Go to My Dashboard',
    getStarted: 'Get Started',
    haveAccount: 'I already have an account',
  },

  // ── Splash ──────────────────────────────────────────────────────────────
  splash: {
    tagline1: 'ONE PATIENT. ONE RECORD.',
    tagline2: 'LIMITLESS CARE.',
    markSecure: 'Secure',
    markInteroperable: 'Interoperable',
    markCloudReady: 'Cloud Ready',
    markDataDriven: 'Data Driven',
    loading: 'Loading…',
  },

  // ── A route whose screen has not shipped yet ────────────────────────────
  placeholder: {
    title: '{name} is coming soon',
    body: 'We’re still building this part of the app. In the meantime, your care team can help you with this — call or visit the clinic and they can do it for you.',
    goBack: 'Go Back',
  },

  // ── src/components — chrome shared by every cluster ──────────────────────
  components: {
    viewAll: 'View All',
    ok: 'OK',
    close: 'Close',
    goBack: 'Go back',
    openProfile: 'Open profile',
    moreOptions: 'More options',
    showPassword: 'Show password',
    hidePassword: 'Hide password',

    listLoadFailed: 'Could not load this. Pull down to try again.',

    slowHint: 'Still loading — this can take a moment on a weak signal.',

    staleTitle: 'Not up to date',
    staleBody: '{message} You are seeing what was loaded {when}, so it may have changed since.',
    staleRetrying: 'Trying…',
    staleRetry: 'Try Again',
    staleRetryHint: 'Loads this screen again from the hospital',
    loadedAt: 'Loaded {when}',
    loadedA11y: 'Information loaded {when}',
    whenNotYet: 'not yet loaded',
    whenJustNow: 'just now',
    whenMinutes_one: '{count} minute ago',
    whenMinutes_other: '{count} minutes ago',
    whenAt: 'at {clock}',
    whenYesterdayAt: 'yesterday at {clock}',
    whenOnAt: 'on {date} at {clock}',
  },

  // ── Shared failure copy (src/lib/errors.ts) ─────────────────────────────
  // Rendered by every screen through `describeFailure`. `unknownOutcome` is
  // the honest sentence for a write whose fate the app does not know: it must
  // never be reworded into a claim that the write succeeded or failed, and the
  // instruction to go and check must never be dropped.
  errors: {
    offlineTitle: 'No connection',
    offlineBody:
      'Your phone could not reach the clinic. Check your mobile data or Wi-Fi, then try again.',

    timeoutTitle: 'The connection is too slow',
    timeoutBody:
      'The clinic did not answer in time. This usually clears up on a better signal — please try again in a moment.',

    serverTitle: 'The clinic system is not responding',
    serverBody: 'Something went wrong on our side, not on your phone. Please try again shortly.',

    notFoundTitle: 'This is no longer available',
    notFoundBody:
      'It may have been removed or changed by the clinic. Go back and open it again from the list.',

    permissionTitle: 'You cannot open this',
    permissionBody:
      'This record is not shared with your account. Ask the clinic reception if you think this is a mistake.',

    sessionTitle: 'Please sign in again',
    sessionBody: 'You have been signed out for your security. Sign in to continue.',

    busyTitle: 'Too many requests just now',
    busyBody: 'Please wait a moment and try again.',

    notLinkedTitle: 'Connect your medical record',
    notLinkedBody:
      'This account is not connected to a medical record yet. Link your OPES Health ID, or open a new record if you have never been here.',

    validationTitle: 'Check what you entered',
    validationBody: 'Some details are missing or not valid. Please review the form and try again.',

    conflictTitle: 'This could not be done',
    conflictBody: 'The clinic could not accept this request. Please try again or contact reception.',

    unknownTitle: 'Something went wrong',
    unknownBody: 'Please try again. If it keeps happening, contact the clinic.',

    unknownOutcome: '{message} We could not confirm whether this was saved. {checkHint}',

    // Shown when a session was renewed mid-action but the change was not sent
    // again automatically — the app never repeats a save on its own, because a
    // duplicate entry in a patient record is worse than one extra tap.
    sessionRenewedRetry:
      'Your session was renewed for security. This change was not saved yet — tap again and it will go through.',
  },
} satisfies Catalog;
