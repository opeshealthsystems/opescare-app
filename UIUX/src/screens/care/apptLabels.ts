/**
 * Translated appointment vocabulary for the APPOINTMENTS/BOOKING/REFERRAL
 * screens.
 *
 * Why this file exists rather than a change to `./shared`:
 *
 *  - `shared.tsx` hard-codes `APPOINTMENT_TYPE_LABEL`, `STATUS_LABEL`,
 *    `VISIT_MODE_LABEL` and its `fmtDate`/`fmtTime`/`fmtDateLong` helpers in
 *    English, and it is imported by four different screen clusters. Editing it
 *    is a cross-cluster change; these helpers give the appointment screens the
 *    translated forms without touching anyone else's render.
 *  - `utils/format.formatLabel` deliberately refuses to translate API enums and
 *    says a screen "should carry an explicit `t()` map in its own namespace
 *    instead of guessing here". `care.type.*` / `care.apptStatus.*` /
 *    `care.visitMode.*` are that map.
 *
 * Dates and times come from `utils/format`, which reads the same locale and
 * matches the desktop's `App\Support\Format` (FR is 24-hour, French months).
 */
import type { AppointmentStatus, AppointmentType, VisitMode } from '../../api';
import type { TFunction } from '../../i18n';
import { formatDate } from '../../utils/format';

/** `consultation` → "Consultation" / "Consultation"; unknown → "Appointment". */
export function typeLabelOf(t: TFunction, type: AppointmentType): string {
  const label = t(`care.type.${type}`);
  return label === `care.type.${type}` ? t('care.type.fallback') : label;
}

export function statusLabelOf(t: TFunction, status: AppointmentStatus): string {
  return t(`care.apptStatus.${status}`);
}

export function visitModeLabelOf(t: TFunction, mode: VisitMode): string {
  return t(`care.visitMode.${mode}`);
}

function toDate(iso: string): Date {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function dayDiff(a: Date, b: Date): number {
  const x = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const y = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((x - y) / 86_400_000);
}

/**
 * "Today" / "Tomorrow" / "Yesterday", else a short date.
 *
 * The fallback delegates to `formatDate`, so FR reads "01 sept. 2026" — the
 * same string the patient sees on the web portal — rather than an English
 * weekday abbreviation.
 */
export function relativeDay(t: TFunction, iso: string): string {
  const diff = dayDiff(toDate(iso), new Date());
  if (diff === 0) return t('care.appt.today');
  if (diff === 1) return t('care.appt.tomorrow');
  if (diff === -1) return t('care.appt.yesterday');
  return formatDate(iso);
}
