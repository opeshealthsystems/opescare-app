/**
 * The clinician area's route vocabulary — ONE place that knows what a doctor
 * URL looks like.
 *
 * Port of `UIUX/src/screens/doctor/chartRoutes.ts`. The OPES original
 * re-exported `DoctorStackParamList` from `navigation/routes.ts` because
 * react-navigation types routes as a param-list union. expo-router has no such
 * object: a route IS a file path, so the param list is gone and `doctorRoutes`
 * below takes its place. `PatientChartSectionName` survives unchanged — it is
 * a domain vocabulary, not a navigator artefact — and is declared here rather
 * than imported, since this app has no `navigation/routes.ts`.
 *
 * WHY A MAP AND NOT STRING LITERALS AT THE CALL SITES: several agents are
 * building the doctor screens in parallel. A screen that hardcodes
 * `/clinician/patients/${id}` while the file lands at `patient/[id].tsx`
 * compiles perfectly and dead-ends at runtime, because expo-router resolves
 * paths at runtime and typed routes are OFF in this app (`app.json` sets no
 * `experiments.typedRoutes`). Routing through this map makes a rename one
 * edit instead of a hunt.
 *
 * ── THE ROUTE MAP (authoritative — build the files at these paths) ─────────
 *
 *   home           /clinician/home                       app/clinician/home.tsx
 *   schedule       /clinician/schedule                   app/clinician/schedule.tsx
 *   appointment    /clinician/appointments/[id]          app/clinician/appointments/[id].tsx
 *   patients       /clinician/patients                   app/clinician/patients.tsx
 *   patient        /clinician/patient/[id]               app/clinician/patient/[id].tsx
 *   chartSection   /clinician/patient/[id]/[section]     app/clinician/patient/[id]/[section].tsx
 *   requests       /clinician/requests                   app/clinician/requests.tsx      ✅ built
 *   results        /clinician/results                    app/clinician/results.tsx       ✅ built
 *   result         /clinician/results/[id]               app/clinician/results/[id].tsx  ✅ built
 *   messages       /clinician/messages                   app/clinician/messages.tsx
 *   thread         /clinician/messages/[id]              app/clinician/messages/[id].tsx
 *   profile        /clinician/profile                    app/clinician/profile.tsx
 *
 * `patients` (the search list) and `patient` (one chart) are deliberately
 * different segments: a single `patients/[id]` collides with the `patients`
 * index in the tab bar, which is exactly the kind of thing that only shows up
 * once a real chart is opened.
 *
 * The five tab slots are `home`, `schedule`, `patients`, `results`,
 * `messages` (see `app/clinician/_layout.tsx`); everything else pushes over
 * them.
 */
import i18next from 'i18next';

// ── Sections ──────────────────────────────────────────────────────────────

/**
 * The named sections of a patient chart — the same nine the OPES app carries.
 *
 * ALL NINE can arrive by deep link (`/clinician/patient/<id>/<section>`), even
 * though the chart overview only links to seven of them: `summary` is the
 * chart itself, and `documents` has no mobile implementation. A section screen
 * must therefore answer for all nine rather than render blank.
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
 * The sections the chart overview links to.
 *
 * `summary` is the chart itself and `documents` has no mobile implementation —
 * both are reachable only by deep link and are answered explicitly.
 */
export const LINKED_SECTIONS = [
  'allergies',
  'diagnoses',
  'medications',
  'vitals',
  'encounters',
  'labs',
  'imaging',
] as const satisfies readonly PatientChartSectionName[];

/**
 * Which `clinical_orders.order_type` each order-backed section shows.
 * `labs` and `imaging` are the same endpoint filtered differently.
 */
export const SECTION_ORDER_TYPE: Partial<Record<PatientChartSectionName, string>> = {
  labs: 'lab',
  imaging: 'imaging',
};

/** English fallbacks, used until `opesDoctor.section.title.*` lands in the locales. */
const SECTION_TITLE_EN: Record<PatientChartSectionName, string> = {
  summary: 'Chart',
  encounters: 'Visits',
  diagnoses: 'Diagnoses',
  medications: 'Medications',
  labs: 'Laboratory',
  imaging: 'Imaging',
  vitals: 'Vitals',
  allergies: 'Allergies',
  documents: 'Documents',
};

/**
 * Screen title per section, from `opesDoctor.section.title.*`.
 *
 * A function rather than a constant record: the title has to follow the app's
 * language, and this is called from render (where the caller has already
 * re-rendered off the i18n context) exactly like `components/care/shared`'s
 * non-hook label helpers.
 */
export function chartSectionTitle(section: PatientChartSectionName): string {
  return i18next.t(`opesDoctor.section.title.${section}`, {
    defaultValue: SECTION_TITLE_EN[section] ?? section,
  }) as string;
}

// ── Routes ────────────────────────────────────────────────────────────────

/** A path segment that survives a `/` or a space in an id. */
const seg = (value: string) => encodeURIComponent(value);

/**
 * Every clinician destination, as an expo-router path.
 *
 * Values are plain strings, which is what `router.push()` takes while typed
 * routes are off. Keep it that way: an object href (`{ pathname, params }`)
 * would compile here and then fail the day typed routes are switched on with
 * a partially built tree.
 */
export const doctorRoutes = {
  /** The clinician's day: what is next, what is waiting. */
  home: '/clinician/home',
  /** The diary for a date window. */
  schedule: '/clinician/schedule',
  /** One appointment record — the only place a visit is moved or cancelled. */
  appointment: (id: string) => `/clinician/appointments/${seg(id)}`,
  /** Health-ID patient lookup (exact match only — no enumeration search). */
  patients: '/clinician/patients',
  /** One patient's read-only chart overview. */
  patient: (id: string) => `/clinician/patient/${seg(id)}`,
  /** One section of that chart, full screen. */
  chartSection: (id: string, section: PatientChartSectionName) =>
    `/clinician/patient/${seg(id)}/${section}`,
  /** Bookings waiting on the clinician's decision. */
  requests: '/clinician/requests',
  /** Results and clinical notifications awaiting acknowledgement. */
  results: '/clinician/results',
  /** One result + the acknowledgement act. */
  result: (id: string) => `/clinician/results/${seg(id)}`,
  /** Message threads. */
  messages: '/clinician/messages',
  /** One thread. */
  thread: (id: string) => `/clinician/messages/${seg(id)}`,
  /** The clinician's own profile and credentials. */
  profile: '/clinician/profile',
  /**
   * Write a prescription. Not reachable from chartRoutes before, so the screen
   * was linked by a literal path.
   */
  prescribe: '/clinician/prescribe',
  /**
   * Ask a patient for access to their record — the lawful route out of a
   * NO_CLINICAL_RELATIONSHIP 403. Optionally pre-fills the lookup.
   */
  requestAccess: (healthId?: string) =>
    healthId
      ? `/clinician/request-access?health_id=${seg(healthId)}`
      : '/clinician/request-access',
  /**
   * Emergency override. Deliberately NOT offered as a fallback when a 403
   * appears — it opens the emergency profile only, is audited as an override,
   * and the patient is notified. It must be a decision, not a retry.
   */
  breakGlass: '/clinician/break-glass',
  /**
   * Scan the patient's Health ID QR with the camera — the identification
   * path that hands off to requestAccess() or the chart.
   */
  scan: '/clinician/scan',
} as const;

/** Where a non-clinician is sent back to — the patient app's home tab. */
export const PATIENT_HOME = '/(tabs)/home';
