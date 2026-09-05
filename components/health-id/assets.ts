/**
 * The OPESCARE Secure™ visual layers, cut for runtime from the design library
 * in `Health ID retuned/` (see scratch `prep_health_id_assets.py` for the
 * crops). Every runtime and derived image in that package is represented here;
 * the reference boards, system sheets and archived history renders are design
 * documentation and are not shipped.
 *
 * Why crops and not the raw renders: several renders bake text into the
 * pixels — a demo fingerprint digest, "SCAN TO VERIFY", "CAMEROON" with
 * coordinates, a logo lockup with a URL. The app never shows a string it did
 * not translate or a value that is not the patient's own, so those regions are
 * cut away and the words come from `lang/*.json` instead.
 *
 * These are PRESENTATION primitives. They say "this is an OpesCare credential";
 * they are not, and must never be described as, cryptographic proof. What a QR
 * encodes, how a token is minted and when it dies is decided by the backend and
 * untouched here.
 */
export const HEALTH_ID_ART = {
  // 01 DNA — biomedical identity edge
  dnaHelix: require('../../assets/health-id/dna-helix.png'),
  dnaGlow: require('../../assets/health-id/dna-glow.png'),
  dnaMicrodata: require('../../assets/health-id/dna-microdata.png'),

  // 02 Guilloche — anti-counterfeit texture
  guillocheTexture: require('../../assets/health-id/guilloche-texture.png'),
  guillocheLines: require('../../assets/health-id/guilloche-lines.png'),
  guillocheMesh: require('../../assets/health-id/guilloche-mesh.png'),
  guillocheParticles: require('../../assets/health-id/guilloche-particles.png'),

  // 03 Security seal system
  seal: require('../../assets/health-id/seal.png'),
  sealAura: require('../../assets/health-id/seal-aura.png'),
  sealSweep: require('../../assets/health-id/seal-sweep.png'),
  holoRing: require('../../assets/health-id/holo-ring.png'),

  // 04 QR system
  qrFrame: require('../../assets/health-id/qr-frame.png'),
  qrGlow: require('../../assets/health-id/qr-glow.png'),

  // 05 Medical
  ecgLine: require('../../assets/health-id/ecg-line.png'),
  ecgComposite: require('../../assets/health-id/ecg-composite.png'),
  anatomyWatermark: require('../../assets/health-id/anatomy-watermark.png'),
  hologramAdultMale: require('../../assets/health-id/hologram-adult-male.png'),
  hologramAdultFemale: require('../../assets/health-id/hologram-adult-female.png'),
  hologramChildBoy: require('../../assets/health-id/hologram-child-boy.png'),
  hologramChildGirl: require('../../assets/health-id/hologram-child-girl.png'),

  // 06 Identity
  fingerprint: require('../../assets/health-id/fingerprint.png'),
  verificationShield: require('../../assets/health-id/verification-shield.png'),
  chip: require('../../assets/health-id/chip.png'),
  africa: require('../../assets/health-id/africa.png'),

  // 07 Framework
  holoWave: require('../../assets/health-id/holo-wave.png'),
  circuitField: require('../../assets/health-id/circuit-field.png'),
  cornerMarkers: require('../../assets/health-id/corner-markers.png'),

  // 08 Document
  documentTexture: require('../../assets/health-id/document-texture.png'),

  /** The app icon at 128px, for the centre of the large presentation QR (the mockup's mark). */
  qrLogo: require('../../assets/health-id/qr-logo.png'),
} as const;

/**
 * The QR verification-indicator sheet, one tile per state. The labels were
 * baked in English on the sheet; only the glyphs are cut, the words are ours.
 */
export const HEALTH_ID_INDICATORS = {
  scanning: require('../../assets/health-id/indicator-scanning.png'),
  verifying: require('../../assets/health-id/indicator-verifying.png'),
  verified: require('../../assets/health-id/indicator-verified.png'),
  authentic: require('../../assets/health-id/indicator-authentic.png'),
  expired: require('../../assets/health-id/indicator-expired.png'),
  revoked: require('../../assets/health-id/indicator-revoked.png'),
  invalid: require('../../assets/health-id/indicator-invalid.png'),
  unknown: require('../../assets/health-id/indicator-unknown.png'),
} as const;

export type IndicatorState = keyof typeof HEALTH_ID_INDICATORS;

/**
 * The anatomical hologram that matches the holder. Sex and age come from the
 * card itself; when either is unknown the neutral watermark is used, never a
 * guess.
 */
export function hologramFor(sex: string | null, age: number | null) {
  const s = (sex ?? '').toLowerCase();
  const child = age !== null && age < 18;
  if (s === 'female') return child ? HEALTH_ID_ART.hologramChildGirl : HEALTH_ID_ART.hologramAdultFemale;
  if (s === 'male') return child ? HEALTH_ID_ART.hologramChildBoy : HEALTH_ID_ART.hologramAdultMale;
  return HEALTH_ID_ART.anatomyWatermark;
}
