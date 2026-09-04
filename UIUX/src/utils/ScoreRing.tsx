import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, typography } from '../theme/theme';

export type ScoreRingProps = {
  /** 0–100. Values outside the range are clamped. */
  value: number;
  /** Outer diameter in px. Default 76. */
  size?: number;
  /** Ring thickness. Default 6. */
  thickness?: number;
  /** Progress colour. Default `colors.statusNormal`. */
  color?: string;
  /** Unfilled track colour. Default `colors.divider`. */
  trackColor?: string;
};

/**
 * The circular health-score gauge on CORE-006.
 *
 * Not an icon — it is a data mark whose sweep is computed from the score, so it
 * lives here rather than in `Icon.tsx` (same reasoning as `QrCode`). Drawn with
 * stroked circles only; no hand-rolled path data.
 */
export function ScoreRing({
  value,
  size = 76,
  thickness = 6,
  color = colors.statusNormal,
  trackColor = colors.divider,
}: ScoreRingProps) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={thickness}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${(circumference * pct) / 100} ${circumference}`}
          fill="none"
          // Start the sweep at 12 o'clock rather than 3 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.centre]}>
        <Text style={[styles.value, { fontSize: size * 0.3 }]}>{Math.round(pct)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  value: {
    fontFamily: typography.fontFamily.bold,
    color: colors.textPrimary,
  },
});
