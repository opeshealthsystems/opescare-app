/**
 * The complete typed route map for the OPES EMR mobile app.
 *
 * Every screen in `mobile app screens/00_Manifest/screen_manifest.csv` has a
 * route declared here. Screen agents do NOT need to edit this file — the route
 * already exists; just swap the placeholder for your component in
 * `AppStackNavigator.tsx`.
 *
 * Structure
 * ---------
 *   RootStack            auth boundary (Login / Signup / Main)
 *     └─ AppStack        every authenticated screen, flat native stack
 *          └─ MainTabs   the 5-slot bottom bar (Home, Health, FAB, Messages, Profile)
 *
 * Detail screens are pushed onto AppStack from any tab, which keeps the tab bar
 * visible-state logic simple and avoids deeply nested navigators.
 */

import type { NavigatorScreenParams } from '@react-navigation/native';

// ---------------------------------------------------------------------------
// Bottom tabs
// ---------------------------------------------------------------------------

export type MainTabParamList = {
  HomeTab: undefined;
  HealthTab: undefined;
  /** Centre FAB. Never actually focused — `tabPress` is intercepted. */
  QuickAddTab: undefined;
  MessagesTab: undefined;
  /**
   * `sheet` opens CORE-008 with one of its edit sheets already up. The
   * sub-settings screens the route map once declared are implemented as those
   * sheets, so screens that want "edit your personal details" or "manage your
   * sharing" deep-link here instead of at a screen that does not exist.
   */
  ProfileTab: { sheet?: ProfileSheet } | undefined;
};

/** The CORE-008 sheets another screen may ask for by name. */
export type ProfileSheet = 'personal' | 'contact' | 'security' | 'privacy' | 'notifications';

// ---------------------------------------------------------------------------
// Health-record sub-stack (pre-existing screens, kept intact)
// ---------------------------------------------------------------------------

export type RecordsStackParamList = {
  RecordsHub: undefined;
  Encounters: undefined;
  EncounterDetail: { id: string };
  Diagnoses: undefined;
  Prescriptions: undefined;
  Vitals: undefined;
  Immunizations: undefined;
  Allergies: undefined;
  Documents: undefined;
  Timeline: undefined;
};

// ---------------------------------------------------------------------------
// App stack — all authenticated detail screens
// ---------------------------------------------------------------------------

export type AppStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;

  // -- 01 Core Access ------------------------------------------------------
  /**
   * CORE-003 lives on the ROOT stack, not here — it is the front door, shown
   * once on first launch before sign-in. See `RootStackParamList` below.
   */
  /** CORE-007 */ MyHealthId: undefined;
  /**
   * CORE-008's sub-settings are bottom sheets inside `ProfileSettingsScreen`,
   * not screens — deep-link them with `MainTabs → ProfileTab { sheet }`.
   *
   * `ConnectedProviders` used to be declared here as the one exception. It has
   * been REMOVED: there is no providers table, route, model or endpoint behind
   * it anywhere in the platform, so the route could only ever resolve to a
   * placeholder — and Settings linked straight at it. A settings row that
   * lands on "not ready yet" is worse than no row. Re-declare it here, and
   * restore the card in `ProfileSettingsScreen`, on the day the API exists.
   */
  Notifications: undefined;

  /**
   * P8.2 / P8.3 — the way out of an unlinked account.
   *
   * `AccountSetup` is the fork: link a Health ID the hospital already issued
   * (the path that always existed), or — for someone who has never visited —
   * verify a phone number and open a record from here. `ReceptionRequired` is
   * the outcome when the server declines to create one remotely; it is a normal
   * next step, not a failure, and it carries no parameters because the server
   * deliberately tells the app nothing about why.
   */
  AccountSetup: undefined;
  LinkHealthId: undefined;
  /** `then: 'register'` continues straight into self-registration. */
  PhoneVerification: { then?: 'register' } | undefined;
  SelfRegistration: undefined;
  ReceptionRequired: undefined;

  // -- 02 Medications ------------------------------------------------------
  /** MED-001 */ Medications: undefined;
  /** MED-002 */ MedicalTasks: undefined;
  /** MED-003 */ PrescriptionDetail: { prescriptionId: string };
  /** MED-005 */ MedicationDetail: { medicationId: string };
  MedicationSchedule: { date?: string } | undefined;
  RequestRefill: { medicationId?: string } | undefined;
  OrderFromPharmacy: { medicationId?: string } | undefined;

  // -- 03 Diagnostics ------------------------------------------------------
  /** DIA-001 */ DiagnosticsDashboard: undefined;
  /** DIA-002 */ LabResultDetail: { resultId: string };
  /** DIA-003 */ LabResultTrend: { resultId: string; analyte?: string };
  /** DIA-004 */ LabReportFull: { reportId: string };
  /** DIA-005 */ LabAppointmentCollection: { appointmentId?: string } | undefined;
  /** DIA-006 */ RequestLabTest: undefined;
  /** DIA-019 */ ImagingHistory: undefined;

  // -- 04 Imaging ----------------------------------------------------------
  /** DIA-007 */ ImagingResults: undefined;
  /** DIA-008 */ ImagingResultDetail: { studyId: string };
  /** DIA-009 */ ImageThumbnails: { studyId: string };
  /** DIA-010 */ MedicalImageViewer: { studyId: string; imageIndex?: number };
  /** DIA-011 */ RadiologyReport: { studyId: string };
  /** DIA-012 */ ViewFullReport: { reportId: string };
  /** DIA-013 */ AddImagingToHealthRecord: { studyId: string };
  /** DIA-014 */ DownloadShareImaging: { studyId: string };
  /** DIA-015 */ ImagingOrderDetail: { orderId: string };
  /** DIA-016 */ BookImagingStudy: { orderId?: string } | undefined;
  /** DIA-017 */ ImagingPreparation: { studyId: string };
  /** DIA-018 */ ImagingComparison: { studyId: string; priorStudyId?: string };

  // -- 05 Appointments & Care ---------------------------------------------
  /** CARE-001 */ AppointmentsHome: undefined;
  /** CARE-002 */ AppointmentList: { filter?: 'upcoming' | 'past' | 'all' } | undefined;
  /** CARE-003 */ AppointmentDetail: { appointmentId: string };
  /** CARE-004 */ ProviderProfile: { providerId: string };
  /**
   * CARE-005 — the profile of a *department* of the one hospital. The route
   * name is unchanged so deep links and the reference screen map still line up.
   */
  FacilityProfile: { departmentId: string };
  /** CARE-006 */ FindProvider: { specialty?: string; departmentId?: string } | undefined;
  /** CARE-007 — department discovery. */ FindFacility: { query?: string } | undefined;
  /** CARE-008 */ AvailableTimeSlots: { providerId: string; date?: string };
  /** CARE-009 */ BookAppointmentForm: { providerId?: string; facilityId?: string; slot?: string } | undefined;
  /** CARE-010 */ AppointmentReview: { draftId: string };
  /** CARE-011 */ AppointmentConfirmed: { appointmentId: string };
  /** CARE-012 */ RescheduleAppointment: { appointmentId: string };
  /** CARE-013 */ CancellationConfirmation: { appointmentId: string };
  /** CARE-014 */ AppointmentCheckIn: { appointmentId: string };
  /** CARE-015 */ WaitingRoom: { appointmentId: string };
  /** CARE-016 */ TelemedicineWaitingRoom: { appointmentId: string };
  /** CARE-017 */ TelemedicineConsultation: { appointmentId: string };
  /** CARE-018 */ ConsultationCompleted: { appointmentId: string };
  /** CARE-019 */ CarePlanDetail: { carePlanId: string };
  /** CARE-020 */ ReferralDetail: { referralId: string };
  /** CARE-023 */ CalendarDay: { date: string };

  // -- 06 Messaging & Documents -------------------------------------------
  /** MSG-002 */ MessageThread: { threadId: string; title?: string };
  NewMessage: { providerId?: string } | undefined;
  /** DOC-001 */ MedicalCertificate: { documentId: string };
  /** DOC-002 */ DocumentPreview: { documentId: string };

  // -- 07 Financial --------------------------------------------------------
  Billing: undefined;
  /** BILL-001 */ PaymentRequestInvoice: { invoiceId: string };
  /**
   * BILL-002. The screen owns the `POST /patient/invoices/{id}/pay` call, so
   * the "processing" state is the real request being in flight rather than a
   * timed animation. `paymentId` opens an already-completed payment instead.
   */
  /** BILL-002 */ PaymentProcessingStatus:
    | { invoiceId: string; methodCode: string; amount?: number; paymentId?: undefined }
    | { paymentId: string; invoiceId?: undefined; methodCode?: undefined; amount?: undefined };
  /** BILL-003 */ PaymentReceipt: { paymentId: string };
};

// ---------------------------------------------------------------------------
// Clinician (doctor) app — bottom tabs
// ---------------------------------------------------------------------------

/**
 * The clinician bottom bar. Five slots, matching the patient bar's geometry,
 * but all five are real destinations — there is no centre FAB, because a
 * clinician's "create" actions (order, prescribe, note) belong inside a
 * patient's chart, never floating free of one.
 */
export type DoctorTabParamList = {
  ScheduleTab: undefined;
  PatientsTab: undefined;
  ResultsTab: undefined;
  DoctorMessagesTab: undefined;
  DoctorProfileTab: undefined;
};

/**
 * The named sections of a patient chart. `PatientChartSection` renders one of
 * these full-screen; the chart screen itself decides how they are summarised.
 */
export type PatientChartSectionName =
  | 'summary'
  | 'encounters'
  | 'diagnoses'
  | 'medications'
  | 'labs'
  | 'imaging'
  | 'vitals'
  | 'allergies'
  | 'documents';

/**
 * Every clinician detail screen, as a flat native stack above the doctor tabs —
 * the same shape as `AppStackParamList` so the two halves of the app behave
 * identically.
 */
export type DoctorStackParamList = {
  DoctorTabs: NavigatorScreenParams<DoctorTabParamList> | undefined;

  // -- Schedule & appointments --------------------------------------------
  /** The clinician's landing screen: today at a glance. */
  DoctorHome: undefined;
  /** Day/week clinic list. `date` is ISO yyyy-mm-dd; omitted means today. */
  DoctorSchedule: { date?: string } | undefined;
  /** Inbound appointment requests awaiting the clinician's accept/decline. */
  AppointmentRequests: { status?: 'pending' | 'accepted' | 'declined' } | undefined;
  /** One appointment from the clinician's side. */
  AppointmentDetail: { appointmentId: string };

  // -- Patients ------------------------------------------------------------
  PatientSearch: { query?: string } | undefined;
  /** `patientId` is the API's patient UUID. */
  PatientChart: { patientId: string; section?: PatientChartSectionName };
  PatientChartSection: { patientId: string; section: PatientChartSectionName };

  // -- Messaging -----------------------------------------------------------
  DoctorMessages: undefined;
  DoctorMessageThread: { threadId: string; title?: string };

  // -- Results -------------------------------------------------------------
  /** Lab and imaging results awaiting the clinician's acknowledgement. */
  ResultsInbox: { filter?: 'unread' | 'abnormal' | 'all' } | undefined;
  /** One result. `kind` says which API the id belongs to. */
  ResultDetail: { resultId: string; kind?: 'lab' | 'imaging' };

  // -- Account -------------------------------------------------------------
  DoctorProfile: undefined;
};

// ---------------------------------------------------------------------------
// Root stack (auth boundary)
// ---------------------------------------------------------------------------

export type RootStackParamList = {
  /**
   * CORE-003 — the welcome carousel. Registered on the unauthenticated side
   * only, and made the initial route on genuine first launch; see
   * `firstRun.ts` for why it is a device flag rather than an account one.
   */
  OnboardingWelcome: undefined;
  /** CORE-004 */ Login: undefined;
  /** CORE-005 */ Signup: undefined;
  /** The PATIENT tree. Only ever mounted for a patient session. */
  Main: NavigatorScreenParams<AppStackParamList> | undefined;
  /** The CLINICIAN tree. Only ever mounted for a clinical staff session. */
  Doctor: NavigatorScreenParams<DoctorStackParamList> | undefined;
};

// ---------------------------------------------------------------------------
// Quick Add action sheet
// ---------------------------------------------------------------------------

/** Actions offered by the centre FAB. */
/** `labelKey` is an i18n key, not a label — see `src/i18n/index.ts`. */
export const QUICK_ADD_ACTIONS = [
  { key: 'BookAppointmentForm', labelKey: 'quickAdd.bookAppointment', icon: 'calendar-plus', tint: 'blue' },
  { key: 'RequestLabTest', labelKey: 'quickAdd.requestLabTest', icon: 'flask', tint: 'green' },
  { key: 'RequestRefill', labelKey: 'quickAdd.requestRefill', icon: 'pill', tint: 'purple' },
  { key: 'NewMessage', labelKey: 'quickAdd.messageProvider', icon: 'chat', tint: 'blue' },
  { key: 'MyHealthId', labelKey: 'quickAdd.showHealthId', icon: 'qr', tint: 'amber' },
] as const;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // AppointmentDetail is declared in both stacks with the SAME param type, so
    // the interfaces merge cleanly. Keep it that way if you touch either.
    interface RootParamList extends RootStackParamList, AppStackParamList, DoctorStackParamList {}
  }
}
