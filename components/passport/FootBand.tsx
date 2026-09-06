/**
 * The illustrated band that closes every page of the approved passport.
 *
 * On the printed sheets this is a pale horizon of baobabs under a script line —
 * "Healthier People, Stronger Africa" — with the document's own name set in a
 * navy rule beneath it. It is the one piece of the page that is purely voice
 * rather than record, and it is what makes the sheet read as a national
 * document rather than a printout.
 *
 * The trees are drawn rather than photographed. The asset package ships no
 * baobab, and a stock photograph would sit oddly against artwork that is
 * otherwise all line and wash — so the horizon is vector, at the weight the
 * sheet uses, and it costs nothing to ship.
 *
 * Everything here is decorative and says nothing about the record, so it is
 * hidden from screen readers: a person listening to their passport should hear
 * their allergies, not a description of a tree.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { passportColors as c } from './tokens';

/** One baobab: a heavy trunk, splayed roots-in-the-air crown, at a given scale. */
function Baobab({ x, s, fill }: { x: number; s: number; fill: string }) {
  return (
    <>
      {/* trunk */}
      <Path
        d={`M ${x - 3 * s} 40 C ${x - 3.4 * s} ${40 - 10 * s}, ${x - 2 * s} ${40 - 16 * s}, ${x - 1.6 * s} ${40 - 20 * s}
            L ${x + 1.6 * s} ${40 - 20 * s} C ${x + 2 * s} ${40 - 16 * s}, ${x + 3.4 * s} ${40 - 10 * s}, ${x + 3 * s} 40 Z`}
        fill={fill}
      />
      {/* crown */}
      <Ellipse cx={x} cy={40 - 22 * s} rx={9 * s} ry={3.4 * s} fill={fill} />
      <Ellipse cx={x - 6 * s} cy={40 - 24.5 * s} rx={4.2 * s} ry={2.2 * s} fill={fill} />
      <Ellipse cx={x + 6 * s} cy={40 - 24.5 * s} rx={4.2 * s} ry={2.2 * s} fill={fill} />
      {/* the splayed upper branches the tree is known for */}
      <Path d={`M ${x} ${40 - 24 * s} l ${-5 * s} ${-4 * s} M ${x} ${40 - 24 * s} l ${5 * s} ${-4 * s} M ${x} ${40 - 24 * s} l 0 ${-5 * s}`}
        stroke={fill} strokeWidth={0.9 * s} strokeLinecap="round" />
    </>
  );
}

function Horizon() {
  const ink = '#BBD8EC';
  const far = '#D8EAF6';
  return (
    <Svg width="100%" height={46} viewBox="0 0 320 46" preserveAspectRatio="none">
      <Rect x={0} y={0} width={320} height={46} fill="#F2F8FC" />
      {/* far bank */}
      <Path d="M 0 40 C 60 33, 110 37, 170 34 C 230 31, 280 36, 320 33 L 320 46 L 0 46 Z" fill={far} />
      <Baobab x={38} s={0.9} fill={far} />
      <Baobab x={286} s={0.8} fill={far} />
      {/* near bank */}
      <Path d="M 0 41 C 70 38, 130 42, 200 39 C 250 37, 290 41, 320 39 L 320 46 L 0 46 Z" fill={ink} />
      <Baobab x={92} s={1.15} fill={ink} />
      <Baobab x={160} s={0.75} fill={ink} />
      <Baobab x={232} s={1} fill={ink} />
      {/* the sun the sheets set behind the trees */}
      <Circle cx={196} cy={16} r={7} fill="#E3F1FA" />
    </Svg>
  );
}

/**
 * The full closing band: illustrated horizon, the script line, and the navy
 * rule that names the document.
 */
export function IllustratedFootBand() {
  const { t } = useTranslation();

  return (
    <View style={styles.wrap}>
      <View
        style={styles.scene}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={StyleSheet.absoluteFill}>
          <Horizon />
        </View>

        <View style={styles.sceneText}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.script} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t('passport.blocks.healthier_people')}
            </Text>
            <Text style={[styles.script, styles.scriptTwo]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t('passport.blocks.stronger_africa')}
            </Text>
          </View>

          <Text style={styles.united} numberOfLines={2}>
            {t('passport.blocks.people_united')}
          </Text>
        </View>
      </View>

      <View style={styles.rule}>
        <Text style={styles.ruleText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
          {t('passport.documentLabel')}
          {'   ·   '}
          {t('passport.blocks.safer_healthier')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The band bleeds to the page edge, undoing the canvas's asymmetric padding
  // (the left side clears the bound edge).
  wrap: { marginLeft: -24, marginRight: -16, marginBottom: -16, marginTop: 18 },

  scene: { height: 46, overflow: 'hidden', justifyContent: 'center' },
  sceneText: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
  },
  script: { fontSize: 11, fontWeight: '700', fontStyle: 'italic', color: c.primary, letterSpacing: 0.2 },
  scriptTwo: { marginLeft: 12, marginTop: -1 },
  united: {
    maxWidth: 108,
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.9,
    color: c.primary,
    textAlign: 'right',
    opacity: 0.75,
  },

  rule: { backgroundColor: c.primaryDark, paddingVertical: 6, paddingHorizontal: 14 },
  ruleText: {
    fontSize: 6.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
});
