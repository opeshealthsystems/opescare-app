/**
 * URL routing for the web build served at https://emr.opesware.com/app/.
 *
 * Two things have to line up for a deep link to work:
 *
 *   1. The server must return the SPA shell for any /app/* path that is not a
 *      real file — see the `^/app/` rewrite in `public/.htaccess`.
 *   2. React Navigation must both *write* those URLs as the user navigates and
 *      *read* them back on a cold load. That is this file.
 *
 * React Navigation has no "base path" option, so the /app prefix is added in
 * `getPathFromState` and stripped in `getStateFromPath`. Doing it here rather
 * than through `prefixes` keeps it host-independent: the same bundle works at
 * emr.opesware.com/app/ and at localhost/app/ without a rebuild.
 */

import {
  getPathFromState as defaultGetPathFromState,
  getStateFromPath as defaultGetStateFromPath,
  type LinkingOptions,
} from '@react-navigation/native';
import { Platform } from 'react-native';
import type { RootStackParamList } from './routes';

/** Matches `experiments.baseUrl` in app.json and the rewrite in public/.htaccess. */
export const BASE_PATH = '/app';

function stripBasePath(path: string): string {
  if (path === BASE_PATH) return '/';
  if (path.startsWith(`${BASE_PATH}/`)) return path.slice(BASE_PATH.length) || '/';
  return path;
}

/**
 * Keep `/app` on every history entry React Navigation writes.
 *
 * `getPathFromState` below already prefixes the path, and that is what the app
 * *asks* for — but measured on the live build, React Navigation's own initial
 * history sync still lands the address bar on `/records/vitals` without the
 * prefix. A URL in that shape is not one the server can serve: the next refresh
 * or bookmark misses the `^/app/` rewrite entirely and hits Laravel's 404,
 * which is the exact bug this whole change exists to remove.
 *
 * So rather than depend on where inside React Navigation the prefix survives,
 * this enforces the invariant at the one place every URL change passes through.
 * It normalises only same-origin, prefix-less paths, and leaves anything
 * already correct — or absolute, or cross-origin — untouched. Installed once,
 * at module load, before any navigation happens.
 */
function installBasePathGuard(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const history = window.history as History & { __opesBasePathGuard?: boolean };
  if (history.__opesBasePathGuard) return;
  history.__opesBasePathGuard = true;

  const withBase = (url: string | URL | null | undefined): string | URL | null | undefined => {
    if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return url;
    if (url === BASE_PATH || url.startsWith(`${BASE_PATH}/`) || url.startsWith(`${BASE_PATH}?`)) {
      return url;
    }
    return `${BASE_PATH}${url}`;
  };

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method].bind(history);
    history[method] = (data: unknown, unused: string, url?: string | URL | null) =>
      original(data, unused, withBase(url));
  }
}

installBasePathGuard();

function webPrefixes(): string[] {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return [];
  return [`${window.location.origin}${BASE_PATH}`, `${window.location.origin}/`];
}

/**
 * Screen -> path map. Every path a patient can reach by tapping is nameable, so
 * refresh, Back and bookmarks all behave. Screens omitted here still work; they
 * simply do not get their own URL.
 */
const config: LinkingOptions<RootStackParamList>['config'] = {
  screens: {
    // CORE-003 sits beside Login/Signup because that is the tree it is
    // registered in — the unauthenticated one. Keeping the path at /app/welcome
    // means links printed or shared before this change still resolve.
    OnboardingWelcome: 'welcome',
    Login: 'login',
    Signup: 'signup',
    Main: {
      path: '',
      screens: {
        MainTabs: {
          path: '',
          screens: {
            HomeTab: '',
            HealthTab: {
              path: 'records',
              screens: {
                RecordsHub: '',
                Encounters: 'encounters',
                EncounterDetail: 'encounters/:id',
                Diagnoses: 'diagnoses',
                Prescriptions: 'prescriptions',
                Vitals: 'vitals',
                Immunizations: 'immunizations',
                Documents: 'documents',
              },
            },
            MessagesTab: 'messages',
            ProfileTab: 'profile',
          },
        },

        // -- Core / account ---------------------------------------------
        // `welcome` moved to the root stack above; `settings/providers` is
        // gone with the ConnectedProviders route — there is no backend behind
        // it, so the URL only ever led to a placeholder.
        MyHealthId: 'health-id',
        Notifications: 'notifications',

        // -- Medications -------------------------------------------------
        Medications: 'medications',
        MedicalTasks: 'tasks',
        PrescriptionDetail: 'prescriptions/:prescriptionId',
        MedicationDetail: 'medications/:medicationId',
        MedicationSchedule: 'medications/schedule',
        RequestRefill: 'medications/refill',
        OrderFromPharmacy: 'medications/order',

        // -- Diagnostics -------------------------------------------------
        DiagnosticsDashboard: 'diagnostics',
        LabResultDetail: 'lab-results/:resultId',
        LabResultTrend: 'lab-results/:resultId/trend',
        LabReportFull: 'lab-reports/:reportId',
        LabAppointmentCollection: 'lab-collection',
        RequestLabTest: 'lab-tests/request',
        ImagingHistory: 'imaging/history',

        // -- Imaging -----------------------------------------------------
        ImagingResults: 'imaging',
        ImagingResultDetail: 'imaging/:studyId',
        ImageThumbnails: 'imaging/:studyId/images',
        MedicalImageViewer: 'imaging/:studyId/viewer',
        RadiologyReport: 'imaging/:studyId/report',
        ViewFullReport: 'reports/:reportId',
        AddImagingToHealthRecord: 'imaging/:studyId/add-to-record',
        DownloadShareImaging: 'imaging/:studyId/share',
        ImagingOrderDetail: 'imaging-orders/:orderId',
        BookImagingStudy: 'imaging/book',
        ImagingPreparation: 'imaging/:studyId/preparation',
        ImagingComparison: 'imaging/:studyId/compare',

        // -- Appointments & care ------------------------------------------
        AppointmentsHome: 'appointments',
        AppointmentList: 'appointments/list',
        AppointmentDetail: 'appointments/:appointmentId',
        ProviderProfile: 'providers/:providerId',
        FacilityProfile: 'departments/:departmentId',
        FindProvider: 'providers',
        FindFacility: 'departments',
        AvailableTimeSlots: 'providers/:providerId/slots',
        BookAppointmentForm: 'appointments/book',
        AppointmentReview: 'appointments/review/:draftId',
        AppointmentConfirmed: 'appointments/:appointmentId/confirmed',
        RescheduleAppointment: 'appointments/:appointmentId/reschedule',
        CancellationConfirmation: 'appointments/:appointmentId/cancelled',
        AppointmentCheckIn: 'appointments/:appointmentId/check-in',
        WaitingRoom: 'appointments/:appointmentId/waiting-room',
        TelemedicineWaitingRoom: 'appointments/:appointmentId/telemedicine/waiting',
        TelemedicineConsultation: 'appointments/:appointmentId/telemedicine',
        ConsultationCompleted: 'appointments/:appointmentId/completed',
        CarePlanDetail: 'care-plans/:carePlanId',
        ReferralDetail: 'referrals/:referralId',
        CalendarDay: 'calendar/:date',

        // -- Messaging & documents ----------------------------------------
        MessageThread: 'messages/:threadId',
        NewMessage: 'messages/new',
        MedicalCertificate: 'certificates/:documentId',
        DocumentPreview: 'documents/:documentId',

        // -- Financial ------------------------------------------------------
        Billing: 'billing',
        PaymentRequestInvoice: 'billing/invoices/:invoiceId',
        PaymentProcessingStatus: 'billing/processing',
        PaymentReceipt: 'billing/receipts/:paymentId',
      },
    },

    /*
     * Clinician URLs, all under /app/dr/. The prefix is not decoration: it
     * keeps the two halves of the app from ever colliding on a path (both have
     * an "appointments/:id"), and it makes a pasted link self-describing — you
     * can tell from the URL alone which app it belongs to, which matters when
     * one of them shows other people's medical records.
     *
     * A patient session has no `Doctor` route registered, so these paths simply
     * do not resolve for them — see the boundary comment in RootNavigator.
     */
    Doctor: {
      path: 'dr',
      screens: {
        DoctorTabs: {
          path: '',
          screens: {
            ScheduleTab: '',
            PatientsTab: 'patients',
            ResultsTab: 'results',
            DoctorMessagesTab: 'messages',
            DoctorProfileTab: 'profile',
          },
        },

        // -- Schedule & appointments --------------------------------------
        DoctorHome: 'today',
        DoctorSchedule: 'schedule/:date?',
        AppointmentRequests: 'requests',
        AppointmentDetail: 'appointments/:appointmentId',

        // -- Patients ------------------------------------------------------
        // Search / inbox paths are kept OUT of the `:id` namespaces below so no
        // path is ambiguous — 'dr/search' can never be read as a patient id.
        PatientSearch: 'search',
        PatientChart: 'patients/:patientId',
        PatientChartSection: 'patients/:patientId/:section',

        // -- Messaging -----------------------------------------------------
        DoctorMessages: 'inbox/messages',
        DoctorMessageThread: 'messages/:threadId',

        // -- Results -------------------------------------------------------
        ResultsInbox: 'inbox/results',
        ResultDetail: 'results/:resultId',

        // -- Account -------------------------------------------------------
        DoctorProfile: 'account',
      },
    },
  },
};

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['opesemr://', 'https://emr.opesware.com/app', ...webPrefixes()],
  config,
  getStateFromPath: (path, options) => defaultGetStateFromPath(stripBasePath(path), options),
  getPathFromState: (state, options) => {
    const path = defaultGetPathFromState(state, options);
    return Platform.OS === 'web' ? `${BASE_PATH}${path === '/' ? '/' : path}` : path;
  },
};
