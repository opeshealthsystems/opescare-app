/**
 * The front desk's route vocabulary — ONE place that knows what a desk URL
 * looks like (the desk's `components/doctor/chartRoutes.ts`).
 *
 * ── THE ROUTE MAP (authoritative — the files live at these paths) ──────────
 *
 *   index            /clinician/desk                          app/clinician/desk/index.tsx
 *   appointment      /clinician/desk/appointment/[id]?date=   app/clinician/desk/appointment/[id].tsx
 *   newAppointment   /clinician/desk/new-appointment?health_id=&date=
 *                                                             app/clinician/desk/new-appointment.tsx
 *   registerPatient  /clinician/desk/register-patient         app/clinician/desk/register-patient.tsx
 *
 * `app/clinician/_layout.tsx` (owned elsewhere) registers each as a
 * `Tabs.Screen` — `desk/index`, `desk/appointment/[id]`,
 * `desk/new-appointment`, `desk/register-patient` — so none becomes a stray
 * tab button.
 *
 * Query parameters:
 *   `date`       YYYY-MM-DD. On `appointment`, the day list the row was opened
 *                from (the detail is DERIVED from that list — the contract has
 *                no single-item GET). On `newAppointment`, the day to pre-fill.
 *   `health_id`  On `newAppointment`, the EXACT Health ID to pre-fill — what
 *                the scanner and the register screen hand over.
 *
 * Values are plain strings (typed routes are off in this app). Template
 * literals here hold ONE `${}` and no nested backticks so `scripts/nav-audit.mjs`
 * can still read them as routes.
 */

/** A path segment that survives a `/` or a space in an id. */
const seg = (value: string) => encodeURIComponent(value);

/** `?a=1&b=2` from the defined entries, or `''`. */
function query(params: Record<string, string | undefined | null>): string {
  const parts = Object.entries(params)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
    .map(([k, v]) => `${seg(k)}=${seg(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const deskRoutes = {
  /** The facility's book for a day. */
  index: '/clinician/desk',
  /** One row of the book, derived from the day list it was opened from. */
  appointment: (id: string, date?: string | null) => `/clinician/desk/appointment/${seg(id)}` + query({ date }),
  /** Book by exact Health ID; both parameters pre-fill the form. */
  newAppointment: (params: { health_id?: string | null; date?: string | null } = {}) =>
    '/clinician/desk/new-appointment' + query(params),
  /** Register a walk-in patient (mints a Health ID). */
  registerPatient: '/clinician/desk/register-patient',
} as const;
