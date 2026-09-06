/**
 * The security substrate — the printed passport's anti-counterfeit language.
 *
 * These are the CANONICAL runtime assets from the OpesCare Secure visual
 * library (`assets/health-id/*`), the same files the Health ID card composes,
 * so a clinician holding the card and the passport side by side sees one
 * document family rather than two lookalikes. The library's own layer list is
 * followed: guilloche, DNA motif, Africa watermark, ECG accent, perimeter
 * markers, seal, fingerprint block and microtext.
 *
 * ── WHY THE OPACITIES ARE NOT THE CARD'S ─────────────────────────────────
 *
 * The card is a deep-blue credential and carries these layers at 0.45–0.9. A
 * passport page is a WHITE document page: the same values there turn the paper
 * muddy and, worse, compete with the clinical text a person is trying to read.
 * Everything here therefore sits between 0.09 and 0.22 under a paper scrim:
 * PRESENT — a reader can see the guilloche, the helix, the seal and the ECG —
 * while the clinical text still wins every contrast contest. A first pass at
 * 0.03–0.14 was so faint the security language read as nothing at all, which
 * defeats the point of having it.
 *
 * ── IT IS ARTWORK, NOT PROOF ─────────────────────────────────────────────
 *
 * Anti-copy and brand language only. What makes a credential real is the
 * server's answer about its status and the short-lived code on page 24 — never
 * the fact that a page looks ornate. Purely decorative, so the whole layer is
 * hidden from assistive technology, and nothing here animates.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Text as SvgText } from 'react-native-svg';
import { Art } from '@/components/health-id/Layers';
import { PASSPORT_SUBSTRATE } from './assets';
import { HEALTH_ID_ART } from '@/components/health-id/assets';
import { passportColors as c } from './tokens';

const FILL = StyleSheet.absoluteFill;

export function SecuritySubstrate() {
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* 1. The paper itself — the passport package's own guilloche wave,
          drawn for a white page rather than for the card's navy, so it is
          the base layer and everything borrowed sits on top of it. */}
      <Art source={PASSPORT_SUBSTRATE} style={FILL} resizeMode="cover" opacity={0.9} />
      <Art source={HEALTH_ID_ART.documentTexture} style={FILL} resizeMode="cover" opacity={0.1} />

      {/* 2. Guilloche — the oldest anti-copy mark there is. */}
      <Art source={HEALTH_ID_ART.guillocheTexture} style={FILL} resizeMode="cover" opacity={0.13} />
      <Art source={HEALTH_ID_ART.guillocheLines} style={FILL} resizeMode="cover" opacity={0.09} />
      <Art source={HEALTH_ID_ART.guillocheMesh} style={FILL} resizeMode="cover" opacity={0.11} />

      {/* 3. The continent, as a watermark rather than a picture. */}
      <Art source={HEALTH_ID_ART.africa} style={styles.africa} resizeMode="contain" opacity={0.1} />

      {/* 4. The DNA motif down the outer margin, as on the printed document. */}
      <Art source={HEALTH_ID_ART.dnaMicrodata} style={styles.dnaMargin} resizeMode="cover" opacity={0.16} />
      <Art source={HEALTH_ID_ART.dnaHelix} style={styles.dnaHelix} resizeMode="contain" opacity={0.1} />

      {/* 5. The seal, struck faintly into the page. */}
      <Art source={HEALTH_ID_ART.seal} style={styles.seal} resizeMode="contain" opacity={0.1} />

      {/* 6. Perimeter registration markers. */}
      <Art source={HEALTH_ID_ART.cornerMarkers} style={FILL} resizeMode="stretch" opacity={0.2} />

      {/* 7. The clinical signature of the document, along the foot. */}
      <Art source={HEALTH_ID_ART.ecgLine} style={styles.ecg} resizeMode="stretch" opacity={0.22} />

      {/* 8. The fingerprint block — the printed passport's security corner. */}
      <Art source={HEALTH_ID_ART.fingerprint} style={styles.fingerprint} resizeMode="contain" opacity={0.14} />

      {/* The paper scrim. The layers above were drawn for the card's deep navy;
          on a white page they tint the paper, so a sheet of paper goes back
          over them. Security artwork must never fight the clinical text. */}
      <View style={styles.scrim} />

      {/* 9. Microtext: legible only up close, as on the printed document. */}
      <Svg style={FILL} width="100%" height="100%" viewBox="0 0 340 640" preserveAspectRatio="xMidYMid slice">
        <G opacity={0.3}>
          <SvgText x={170} y={9} fontSize={4} fill={c.primary} textAnchor="middle" letterSpacing={1.3}>
            OPESCARE SECURE • PEOPLE • DATA • TRUST • BETTER HEALTH • AFRICA
          </SvgText>
          <SvgText x={170} y={636} fontSize={4} fill={c.primaryDark} textAnchor="middle" letterSpacing={1.3}>
            AUTHENTIC • VERIFIABLE • CONSENT-AWARE • AUDITED
          </SvgText>
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.42)' },
  africa: { position: 'absolute', right: -30, top: 150, width: 260, height: 260 },
  dnaMargin: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 26 },
  dnaHelix: { position: 'absolute', right: -14, bottom: 90, width: 120, height: 260 },
  seal: { position: 'absolute', alignSelf: 'center', top: '38%', width: 190, height: 190 },
  ecg: { position: 'absolute', left: 0, right: 0, bottom: 34, height: 46 },
  fingerprint: { position: 'absolute', right: 14, bottom: 16, width: 46, height: 46 },
});
