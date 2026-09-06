/**
 * The security substrate — the printed passport's anti-counterfeit language,
 * adapted to a phone.
 *
 * Guilloche arcs, a faint Africa mark, a DNA thread, perimeter markers and
 * microtext, drawn once behind the page content. It is BRAND AND ANTI-COPY
 * LANGUAGE ONLY: none of it proves anything. What makes a credential real is
 * the server's answer about its status, and the short-lived QR minted for a
 * presentation — never the fact that a page looks ornate. The package's own
 * security note is explicit about this and so is this file, because the day
 * someone mistakes the artwork for the proof is the day the artwork becomes a
 * liability.
 *
 * Purely decorative, so it is hidden from assistive technology and stopped
 * entirely under reduced motion (it never animates, but the aura it sits under
 * does).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { passportColors as c } from './tokens';

export function SecuritySubstrate() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 340 640" preserveAspectRatio="xMidYMid slice">
        <Defs />

        {/* Guilloche: interfering arcs, the oldest anti-copy mark there is. */}
        <G opacity={0.06}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Circle key={`g${i}`} cx={170} cy={320} r={40 + i * 26} stroke={c.primary} strokeWidth={0.7} fill="none" />
          ))}
          {Array.from({ length: 7 }).map((_, i) => (
            <Circle key={`h${i}`} cx={80 + i * 30} cy={320} r={120} stroke={c.teal} strokeWidth={0.4} fill="none" />
          ))}
        </G>

        {/* The continent, as a watermark rather than a picture. */}
        <G opacity={0.045}>
          <Path
            d="M150 120c26 0 44 12 52 30 9 20 4 40-4 58-7 16-6 30 2 44 9 16 12 33 6 50-7 21-26 34-45 40-14 5-27 14-33 28-7 16-22 26-38 22-15-4-23-19-22-34 1-19 10-36 12-55 2-22-6-43-4-65 2-25 16-47 34-63 12-11 26-19 40-24 0 0 0 0 0 0z"
            fill={c.primary}
          />
        </G>

        {/* A DNA thread down the margin: the micro-data motif. */}
        <G opacity={0.07}>
          {Array.from({ length: 16 }).map((_, i) => {
            const y = 40 + i * 36;
            const phase = i % 2 === 0 ? 1 : -1;
            return (
              <G key={`d${i}`}>
                <Path d={`M18 ${y} q ${10 * phase} 18 0 36`} stroke={c.teal} strokeWidth={1} fill="none" />
                <Path d={`M30 ${y} q ${-10 * phase} 18 0 36`} stroke={c.primary} strokeWidth={1} fill="none" />
                <Line x1={18} y1={y + 18} x2={30} y2={y + 18} stroke={c.primary} strokeWidth={0.7} />
              </G>
            );
          })}
        </G>

        {/* A single ECG accent, the clinical signature of the document. */}
        <G opacity={0.09}>
          <Path
            d="M0 585 H70 l10-22 8 44 10-58 9 36 8-16 h30 l9-26 8 52 9-40 8 20 h40 l10-14 8 28 9-34 8 20 h60"
            stroke={c.teal}
            strokeWidth={1.2}
            fill="none"
          />
        </G>

        {/* Perimeter registration markers. */}
        <G opacity={0.16}>
          {[
            [14, 14, 1, 1],
            [326, 14, -1, 1],
            [14, 626, 1, -1],
            [326, 626, -1, -1],
          ].map(([x, y, dx, dy], i) => (
            <G key={`m${i}`}>
              <Line x1={x} y1={y} x2={x + 14 * dx} y2={y} stroke={c.primary} strokeWidth={1.1} />
              <Line x1={x} y1={y} x2={x} y2={y + 14 * dy} stroke={c.primary} strokeWidth={1.1} />
            </G>
          ))}
        </G>

        {/* Microtext: legible only up close, as on the printed document. */}
        <G opacity={0.13}>
          <SvgText x={170} y={634} fontSize={4} fill={c.primary} textAnchor="middle" letterSpacing={1.4}>
            OPESCARE SECURE • PEOPLE • DATA • TRUST • BETTER HEALTH • AFRICA • OPESCARE SECURE
          </SvgText>
        </G>
      </Svg>
    </View>
  );
}
