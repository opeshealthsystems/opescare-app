/**
 * The OpesCare Secure seal, centred, with a quiet eyebrow caption under it —
 * the emblem on the pre-auth screens (welcome, sign in, create Health ID).
 *
 * Presentation only. It reuses the credential's own seal system
 * (`components/health-id/Layers`), so the front door shows exactly the artwork
 * the Health ID carries, and it never claims to be proof of anything.
 *
 * Fixed footprint: the aura layer overhangs the seal by 1.6×, so the box is
 * sized to the aura, not the seal — nothing under it shifts while the bitmaps
 * load or when reduced motion swaps the live look for the resting one. The
 * ring and light sweep already stop under reduced motion (`motion.ts`); here
 * that setting also drops the `active` treatment, so the seal rests instead
 * of holding a frozen frame of the sweep.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing, typography, useTheme, type Palette } from '@/components/opes-ui';
import { SealSystem } from '@/components/health-id/Layers';
import { useReducedMotion } from '@/components/health-id/motion';

/** How far the aura reaches past the seal (matches `SealSystem`). */
const AURA_SCALE = 1.6;

export function AnimatedSeal({
  size = 72,
  caption,
  style,
}: {
  /** Seal diameter; the block itself is 1.6× this plus the caption line. */
  size?: number;
  /** Overrides the default "OpesCare Secure Health ID" eyebrow. */
  caption?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reduced = useReducedMotion();
  const extent = Math.round(size * AURA_SCALE);

  return (
    <View style={[styles.wrap, style]}>
      <View style={{ width: extent, height: extent, alignItems: 'center', justifyContent: 'center' }}>
        <SealSystem size={size} active={!reduced} />
      </View>
      <Text style={styles.caption} numberOfLines={1}>
        {caption ?? t('auth.sealCaption')}
      </Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: {
      alignItems: 'center',
      gap: spacing.xs,
      paddingBottom: spacing.xs,
    },
    caption: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
