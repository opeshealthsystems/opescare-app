/**
 * The passport's covers — its face, built to the Health ID card's standard.
 *
 * The imported package drew its cover as a flat circle, a wordmark and a
 * paragraph, and its "security substrate" as a handful of coloured rectangles
 * with the word AFRICA set in type. Held next to this app's credential card
 * that reads as a mock-up, not as a document from the same issuer. So the
 * cover is composed here the way SecureCredentialCard composes its face: the
 * same navy gradient, the same guilloche stack at CARD strength, the DNA
 * glow and helix, corner brackets, the Africa mark, and the seal with its
 * holographic ring.
 *
 * A cover is not a page of text — it is the document's face, so the artwork
 * carries at full strength here (0.16–0.85). The interior pages are white
 * paper and deliberately quieter: there, the same motifs sit under a scrim so
 * the clinical text always wins.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { PulseLogo, useTheme } from '@/components/opes-ui';
import { Art, CornerBrackets, PulseArt, SealSystem } from '@/components/health-id/Layers';
import { HEALTH_ID_ART } from '@/components/health-id/assets';
import { useReducedMotion } from '@/components/health-id/motion';

const FILL = StyleSheet.absoluteFill;
const DECORATIVE = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

export function PassportCover({
  holderName,
  healthId,
  subtitle,
  back = false,
}: {
  holderName?: string | null;
  healthId?: string | null;
  subtitle?: string;
  /** The back cover: the same face, carrying the pledge instead of the holder. */
  back?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  return (
    <LinearGradient
      colors={[colors.navy, colors.primaryDeep, colors.blue]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.face}
    >
      {/* The security substrate, at the strength the card uses. */}
      <View pointerEvents="none" style={FILL} {...DECORATIVE}>
        <Art source={HEALTH_ID_ART.guillocheTexture} style={FILL} resizeMode="cover" opacity={0.45} />
        <Art source={HEALTH_ID_ART.guillocheLines} style={FILL} resizeMode="cover" opacity={0.16} />
        <Art source={HEALTH_ID_ART.guillocheMesh} style={FILL} resizeMode="cover" opacity={0.55} />
        <PulseArt
          source={HEALTH_ID_ART.guillocheParticles}
          style={FILL}
          resizeMode="cover"
          low={0.35}
          high={0.9}
          duration={3200}
        />
        <PulseArt source={HEALTH_ID_ART.dnaGlow} style={styles.dnaGlow} resizeMode="cover" low={0.4} high={0.85} duration={3600} />
        <Art source={HEALTH_ID_ART.dnaHelix} style={styles.dnaHelix} resizeMode="cover" opacity={0.8} />
        <Art source={HEALTH_ID_ART.dnaMicrodata} style={styles.dnaMicro} resizeMode="cover" opacity={0.5} />
        <Art source={HEALTH_ID_ART.ecgLine} style={styles.ecg} resizeMode="stretch" opacity={0.5} />
      </View>
      <CornerBrackets color={colors.primarySoft} active={!reduced} size={22} inset={10} radius={12} />

      {/* Brand row, as on the card. */}
      <View style={styles.topRow}>
        <View style={styles.brand}>
          <View style={styles.logoDisc}>
            <PulseLogo size={20} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.brandWord} numberOfLines={1}>
              Opes<Text style={styles.brandAccent}>Care</Text>
            </Text>
            <Text style={styles.brandSub} numberOfLines={1}>
              {t('passport.coverTitle').toUpperCase()}
            </Text>
          </View>
        </View>
        <Art source={HEALTH_ID_ART.africa} style={styles.africa} />
      </View>

      {/* The emblem: the seal in its holographic ring. */}
      <View style={styles.emblem}>
        <SealSystem size={92} active={!reduced} />
      </View>

      {back ? (
        <View style={styles.block}>
          <Text style={styles.backTitle}>{t('passport.backTitle')}</Text>
          <Text style={styles.backBody}>{t('passport.backBody')}</Text>
        </View>
      ) : (
        <View style={styles.block}>
          <Text style={styles.docTitle}>{t('passport.coverTitle').toUpperCase()}</Text>
          {holderName ? (
            <Text style={styles.holder} numberOfLines={1}>
              {holderName}
            </Text>
          ) : null}
          {healthId ? (
            <Text style={styles.healthId} numberOfLines={1}>
              {healthId}
            </Text>
          ) : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      )}

      <Text style={styles.microtext} numberOfLines={1}>
        {t('passport.tagline')}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  face: {
    minHeight: 470,
    borderRadius: 20,
    overflow: 'hidden',
    padding: 18,
    justifyContent: 'space-between',
  },
  dnaGlow: { position: 'absolute', left: -30, top: 0, bottom: 0, width: 150 },
  dnaHelix: { position: 'absolute', left: -18, top: 0, bottom: 0, width: 96 },
  dnaMicro: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 30 },
  ecg: { position: 'absolute', left: 0, right: 0, bottom: 54, height: 40 },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  logoDisc: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  brandWord: { fontSize: 17, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.2 },
  brandAccent: { color: '#7FD8E8' },
  brandSub: { fontSize: 7.5, fontWeight: '800', letterSpacing: 1.6, color: 'rgba(255,255,255,0.72)', marginTop: 1 },
  africa: { width: 46, height: 46, opacity: 0.9 },

  emblem: { alignItems: 'center', marginVertical: 6 },

  block: { alignItems: 'center', paddingHorizontal: 6 },
  docTitle: { fontSize: 15, fontWeight: '900', letterSpacing: 4, color: '#FFFFFF', textAlign: 'center' },
  holder: { marginTop: 14, fontSize: 21, fontWeight: '900', color: '#FFFFFF', textAlign: 'center' },
  healthId: {
    marginTop: 5, fontSize: 13, fontWeight: '800', letterSpacing: 1.4,
    color: '#BFE3F5', textAlign: 'center',
  },
  subtitle: { marginTop: 10, fontSize: 11.5, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 17 },
  backTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', textAlign: 'center', lineHeight: 30 },
  backBody: { marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.82)', textAlign: 'center', lineHeight: 18 },

  microtext: {
    fontSize: 7, fontWeight: '800', letterSpacing: 1.1,
    color: 'rgba(255,255,255,0.6)', textAlign: 'center',
  },
});
