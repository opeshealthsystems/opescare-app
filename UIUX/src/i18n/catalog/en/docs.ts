/**
 * `docs` strings, English. One cluster per file so translators do not collide.
 * Contract: src/i18n/index.ts. Keys and order must match the fr twin exactly.
 */
export const docs = {
  // ── DOC-002 Document Preview ─────────────────────────────────────────────
  preview: {
    title: 'Document Preview',
    healthRecordA11y: 'Health record',
    contactA11y: 'Contact the facility',
    loading: 'Loading document…',
    documentFallback: 'Document',
    generatedOn: 'Generated on {date}',
    generatedOnAt: 'Generated on {date} • {time}',
    verified: 'Verified',
    pending: 'Pending',

    bannerTitle: 'Document Ready',
    bannerSaved: 'Your document is available to download and is saved to your Health Record.',
    bannerAvailable: 'Your document is available to download.',
    dismissA11y: 'Dismiss',

    certificateDesc: 'Official medical certificate issued by {facility}.',
    facilityFallback: 'the facility',
    documentDesc: 'Official document held in your health record.',
    verifiedDocument: 'Verified Document',
    awaitingVerification: 'Awaiting verification',

    saveTitle: 'Save to Health Record',
    saveSub: 'Add this document to your secure health record for future access.',
    savedTitle: 'Saved to Health Record',
    savedSub: 'You can view it anytime in your Medical Documents.',

    downloadTitle: 'Download PDF',
    downloadSub: 'Save the document to your device',
    shareTitle: 'Share Document',
    shareSub: 'Send via WhatsApp, Email or other apps',
    filesTitle: 'Save to My Files',
    filesSub: "Store in your device's file manager",
    printTitle: 'Print',
    printSub: 'Print the document directly',

    secureTitle: 'Secure & Compliant',
    secureText:
      'Your documents are encrypted and stored in compliance with HIPAA standards and local health regulations.',

    backToDocument: 'Back to Document',
    viewInRecord: 'View in Health Record',

    ok: 'OK',
    actionFailedTitle: "That didn't work",
    actionFailedMessage: 'That action could not be completed. Please try again.',
    alreadySavedTitle: 'Already in your health record',
    alreadySavedMessage:
      'This document is already filed in your health record. There is nothing more to do.',
    settingFailedTitle: 'That setting was not saved',
    settingFailedRefresh: 'Pull down to refresh this page and check whether the switch stayed on.',
    settingFailedMessage: 'The setting could not be saved.',
  },

  // ── DOC-001 Medical Certificate ──────────────────────────────────────────
  certificate: {
    title: 'Medical Certificate',
    shareA11y: 'Share document',
    actionsA11y: 'Document actions',
    loading: 'Loading certificate…',
    labelFallback: 'Medical Certificate',
    facilityFallback: "St. Mary's Hospital",
    openFailedTitle: "The document didn't open",
    openFailedMessage: 'The document could not be opened. Please try again.',

    verified: 'Verified',
    requested: 'Requested',
    unverified: 'Unverified',

    brandSub: 'ELECTRONIC MEDICAL RECORD',
    heading: 'MEDICAL CERTIFICATE',
    certificateNo: 'Certificate No.:',
    dateIssued: 'Date Issued:',
    lead: 'This is to certify that:',
    name: 'Name:',
    patientId: 'Patient ID:',
    ageGender: 'Age/Gender:',

    examined: 'Was examined at {facility} on {date}.',
    unfit:
      'In my professional opinion, {subject} is unfit for work / school / physical activities from {from} to {to}{rest}{cause}.',
    restDays: ' ({count} days)',
    cause: ' due to {diagnosis}',
    purpose: 'This certificate is {purpose}',

    registrationNo: 'Registration No: {value}',
    authorised: 'Authorised',
    electronicTitle: 'This is an electronically issued certificate.',
    electronicText: 'This document is valid without a handwritten signature.',
    scanQr: 'Scan QR code to verify authenticity.',

    addToLine1: 'Add to',
    addToLine2: 'Health Record',

    toolRotate: 'Rotate',
    toolRotateMessage:
      'Rotation applies in the full-screen viewer. Open the document there to turn the page.',
    toolSearch: 'Search',
    toolSearchMessage:
      'Text search opens with the PDF in your own viewer app. Download the document first.',
    toolMarkup: 'Markup',
    toolMarkupMessage: 'You can annotate the PDF after downloading it, using your own viewer app.',
    toolMore: 'More',

    previewFullScreen: 'Preview Full Screen',
    downloadPdf: 'Download (PDF)',
  },

  // ── Shared document helpers ──────────────────────────────────────────────
  shared: {
    cannotOpen: 'No app on this device can open the document.',
    // Third-person subject used in the certificate prose.
    pronounShe: 'she',
    pronounHe: 'he',
    pronounPatient: 'the patient',
  },
} as const;
