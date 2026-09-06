/**
 * The Health Passport's own artwork, from the v2.2 asset package.
 *
 * Two things here that the app did not already have:
 *
 *   ICONS      one mark per page, drawn for these thirty pages specifically.
 *              They replace a mapping onto the app's general icon set, where
 *              several pages had to share a glyph (three pages were all a
 *              document, two were a first-aid cross). A passport page's mark is
 *              part of how a reader finds their way around it.
 *   SUBSTRATE  a guilloche wave drawn FOR WHITE PAPER. The card's own textures
 *              are authored to sit on deep navy and tint a white page blue, so
 *              this is the correct base layer for the interior pages.
 *
 * What is deliberately NOT taken from that package: its seal, DNA, ECG, Africa
 * motif, guilloche, holographic ring and QR frame. The app already carries
 * higher-fidelity versions of all of them in `assets/health-id` — its seal is
 * the full OpesCare mark, where the package ships a plain gradient ring — and
 * the package's own ASSET_USAGE says the production assets already in the app
 * remain authoritative. Swapping them in would have cost detail and split the
 * passport's look from the credential card's.
 *
 * Metro resolves `require` statically, so every path is written out; a computed
 * path would bundle nothing.
 */
import type { ImageSourcePropType } from 'react-native';

export const PASSPORT_SUBSTRATE: ImageSourcePropType = require('../../assets/passport/substrate.png');

/** Page id → its own mark. Keys match HealthPassportBuilder::PAGES exactly. */
export const PASSPORT_ICONS: Record<string, ImageSourcePropType> = {
  cover: require('../../assets/passport/icons/cover.png'),
  'patient-identity': require('../../assets/passport/icons/patient-identity.png'),
  'emergency-profile': require('../../assets/passport/icons/emergency-profile.png'),
  'medical-summary': require('../../assets/passport/icons/medical-summary.png'),
  'allergies-alerts': require('../../assets/passport/icons/allergies-alerts.png'),
  'current-medications': require('../../assets/passport/icons/current-medications.png'),
  conditions: require('../../assets/passport/icons/conditions.png'),
  encounters: require('../../assets/passport/icons/encounters.png'),
  'hospital-admissions': require('../../assets/passport/icons/hospital-admissions.png'),
  procedures: require('../../assets/passport/icons/procedures.png'),
  laboratory: require('../../assets/passport/icons/laboratory.png'),
  radiology: require('../../assets/passport/icons/radiology.png'),
  cardiology: require('../../assets/passport/icons/cardiology.png'),
  immunization: require('../../assets/passport/icons/immunization.png'),
  prescriptions: require('../../assets/passport/icons/prescriptions.png'),
  dispensing: require('../../assets/passport/icons/dispensing.png'),
  referrals: require('../../assets/passport/icons/referrals.png'),
  'medical-certificates': require('../../assets/passport/icons/medical-certificates.png'),
  'discharge-summary': require('../../assets/passport/icons/discharge-summary.png'),
  'maternal-child': require('../../assets/passport/icons/maternal-child.png'),
  'care-providers': require('../../assets/passport/icons/care-providers.png'),
  insurance: require('../../assets/passport/icons/insurance.png'),
  'consent-sharing': require('../../assets/passport/icons/consent-sharing.png'),
  verification: require('../../assets/passport/icons/verification.png'),
  vitals: require('../../assets/passport/icons/vitals.png'),
  'family-genetic': require('../../assets/passport/icons/family-genetic.png'),
  'preventive-screening': require('../../assets/passport/icons/preventive-screening.png'),
  'devices-transfusion': require('../../assets/passport/icons/devices-transfusion.png'),
  'care-plans': require('../../assets/passport/icons/care-plans.png'),
  'back-cover': require('../../assets/passport/icons/back-cover.png'),
};

/** The page's own mark, or undefined for an id this build does not know. */
export function passportIcon(pageId: string | undefined): ImageSourcePropType | undefined {
  return pageId ? PASSPORT_ICONS[pageId] : undefined;
}
