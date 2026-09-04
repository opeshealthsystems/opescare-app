/**
 * Chart-screen route vocabulary.
 *
 * The param types themselves live in `navigation/routes.ts`, which the
 * foundation agent owns — this file does not redeclare them, it re-exports
 * them so the chart screens and the navigator can never drift apart.
 *
 * `PatientChartSectionName` is a nine-member union and `linking.ts` maps
 * `patients/:patientId/:section` straight onto it, so ANY of the nine can
 * arrive by deep link even though the chart overview only links to six of
 * them. `PatientChartSectionScreen` therefore handles all nine — including a
 * plain, honest answer for the ones this app does not carry, rather than a
 * blank screen.
 */
import { getLocale, translator } from '../../i18n';
import type { PatientChartSectionName } from '../../navigation/routes';

export type { DoctorStackParamList, PatientChartSectionName } from '../../navigation/routes';

/**
 * Screen title per section, from `doctor.section.title.*`.
 *
 * A function rather than the constant record it used to be: the title has to
 * follow the app's language, and this is called from render (where the caller
 * has already re-rendered off the locale context) exactly like `utils/format`.
 */
export function chartSectionTitle(section: PatientChartSectionName): string {
  return translator(getLocale())(`doctor.section.title.${section}`);
}

/**
 * The sections the chart overview links to.
 *
 * `summary` is the chart itself, and `documents` has no mobile implementation —
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
