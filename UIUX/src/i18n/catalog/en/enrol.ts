/**
 * `enrol` strings, English — P8.2 phone verification and P8.3 self-registration.
 * Contract: src/i18n/index.ts. Keys and order must match the fr twin exactly.
 */
export const enrol = {
  // ── The fork: link an existing record, or open a new one ────────────────
  setup: {
    title: 'Connect your record',
    subtitle: 'Your account is ready. It just needs a medical record behind it.',
    haveIdTitle: 'I already have an OPES Health ID',
    haveIdSubtitle: 'Link the record this hospital has already opened for you.',

    newTitle: 'I am new to this hospital',
    newSubtitle: 'Verify your phone number and open a record from here.',

    privacyNote:
      'Your record stays yours. Only the clinicians treating you, and you, can open it.',
  },

  // ── Linking an existing record (the path that already worked) ───────────
  link: {
    title: 'Link your Health ID',
    subtitle: 'Enter the ID printed on your OPES card, exactly as it appears.',
    idLabel: 'OPES Health ID',
    idHint: 'The ID printed on your OPES card or hospital paperwork',
    idPlaceholder: 'OPES-00-0000-0000',
    nameLabel: 'Full name on the card',
    namePlaceholder: 'Your full name',
    submit: 'Link my record',
    helper:
      'Reception issues this ID at your first visit. If you have never been here, go back and open a new record instead.',
    failed: 'We could not link this record. Check the ID and the name, then try again.',
    checkHint: 'Open your profile to see whether it was linked.',
  },

  // ── P8.2 phone verification ─────────────────────────────────────────────
  phone: {
    title: 'Verify your phone number',
    subtitle: 'We send a short code by SMS to {phone}. It proves the number is yours.',
    subtitleNoPhone: 'We send a short code by SMS to the number on your account.',

    send: 'Send me a code',
    sending: 'Sending…',
    sent: 'Code sent to {phone}.',
    sentNoPhone: 'Code sent.',

    codeLabel: 'Enter the code',
    codeHint: 'Six digits from the SMS. Your phone may offer to fill it in for you.',
    codePlaceholder: '000000',
    sendHint: 'Sends a code by SMS to the number on your account',
    verify: 'Verify my number',
    verifying: 'Checking…',

    validForMinutes_one: 'The code is valid for {count} minute.',
    validForMinutes_other: 'The code is valid for {count} minutes.',
    validForSeconds_one: 'The code is valid for {count} second.',
    validForSeconds_other: 'The code is valid for {count} seconds.',

    resend: 'Send a new code',
    resendIn: 'You can ask for a new code in {clock}.',

    wrongCode: 'That code does not match. Check the SMS and enter it again.',
    attemptsRemaining_one: '{count} attempt left before you need a new code.',
    attemptsRemaining_other: '{count} attempts left before you need a new code.',
    rateLimited: 'Too many attempts just now. Please wait a little and ask for a new code.',
    rateLimitedWait: 'Too many attempts just now. You can try again in {clock}.',

    smsNote: 'Standard SMS charges from your operator may apply.',
    checkHint: 'Ask for a new code if this one no longer works.',

    doneTitle: 'Number verified',
    doneBody: 'Thank you. You can now open your medical record.',
    doneCta: 'Continue',
  },

  // ── P8.3 self-registration ──────────────────────────────────────────────
  register: {
    title: 'Open your medical record',
    subtitle: 'These details go on your record, so use the ones on your identity document.',

    nameLabel: 'Full name',
    namePlaceholder: 'As written on your ID document',
    sexLabel: 'Sex',
    sexFemale: 'Female',
    sexMale: 'Male',
    sexOther: 'Other',
    dobLabel: 'Date of birth',
    dobPlaceholder: 'YYYY-MM-DD',
    dobHelper: 'Optional, and it helps the hospital find your record again.',

    submit: 'Open my record',
    submitting: 'Opening your record…',
    failed: 'We could not open your record. Please try again.',
    checkHint: 'Open your profile to see whether your record was created.',

    provisionalNote:
      'A record opened from the app has nothing clinical in it yet. Reception confirms your identity at your first visit.',

    doneTitle: 'Your record is open',
    doneBody: 'This is your OPES Health ID. You will be asked for it at every desk, so keep it.',
    doneIdLabel: 'YOUR OPES HEALTH ID',
    doneCard: 'View my Health ID card',
    doneHome: 'Go to my home screen',
  },

  // ── The 409: finish this at the reception desk ──────────────────────────
  reception: {
    title: 'One step at the reception desk',
    intro:
      'We cannot open your record from the app this time. A member of staff at the reception desk will complete it with you — it usually takes a few minutes.',

    bringTitle: 'What to bring',
    bringId: 'An identity document — national ID card, passport or driving licence.',
    bringPhone: 'This phone, with the number you just verified.',
    bringCover: 'Your insurance or company cover card, if you have one.',

    nextTitle: 'What happens next',
    nextStep1: 'Reception goes through your details with you at the desk.',
    nextStep2: 'They complete your registration and give you your OPES Health ID.',
    nextStep3: 'You sign in here again and everything is connected — no second account to create.',

    reassure:
      'Nothing you entered was wrong, and nothing has been lost. Some records simply have to be opened in person.',
    hoursNote: 'Reception takes you during hospital opening hours. No appointment is needed for this.',

    findUs: 'Find the hospital',
    done: 'Got it',
  },

  // ── The unlinked-account block every screen shares ──────────────────────
  gate: {
    title: 'Connect your medical record',
    message:
      'This account is not connected to a medical record yet. Link your OPES Health ID, or open a new record if you have never been here.',
    messageWith:
      'This account is not connected to a medical record yet, so your {what} cannot be shown. Link your OPES Health ID, or open a new record if you have never been here.',
    action: 'Get started',
  },
} as const;
