import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../ThemeProvider';

type Props = {
  size?: number;
};

/**
 * The OPES EMR mark: a ring of dots fading toward the center with a
 * heartbeat/pulse line through the middle, matching the login/splash designs.
 */
export function PulseLogo({ size = 120 }: Props) {
  const { colors } = useTheme();
  const center = size / 2;
  const dots = useMemo(() => {
    const rings = [
      { radius: size * 0.46, count: 28, dotSize: size * 0.02, opacity: 1 },
      { radius: size * 0.4, count: 24, dotSize: size * 0.018, opacity: 0.85 },
      { radius: size * 0.34, count: 20, dotSize: size * 0.016, opacity: 0.6 },
      { radius: size * 0.28, count: 16, dotSize: size * 0.014, opacity: 0.35 },
    ];

    return rings.flatMap((ring, ringIndex) =>
      Array.from({ length: ring.count }, (_, i) => {
        const angle = (i / ring.count) * Math.PI * 2 + ringIndex * 0.3;
        return {
          key: `${ringIndex}-${i}`,
          cx: center + Math.cos(angle) * ring.radius,
          cy: center + Math.sin(angle) * ring.radius,
          r: ring.dotSize,
          opacity: ring.opacity,
        };
      })
    );
  }, [size, center]);

  const pulseWidth = size * 0.42;
  const pulseY = center;
  const pulseX = center - pulseWidth / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {dots.map((dot) => (
          <Circle key={dot.key} cx={dot.cx} cy={dot.cy} r={dot.r} fill={colors.blue} opacity={dot.opacity} />
        ))}
        <Circle cx={center} cy={center} r={size * 0.24} fill={colors.surface} stroke={colors.blueLight} strokeWidth={size * 0.012} />
        <Path
          d={`M ${pulseX} ${pulseY}
              L ${pulseX + pulseWidth * 0.28} ${pulseY}
              L ${pulseX + pulseWidth * 0.38} ${pulseY - pulseWidth * 0.32}
              L ${pulseX + pulseWidth * 0.52} ${pulseY + pulseWidth * 0.32}
              L ${pulseX + pulseWidth * 0.64} ${pulseY}
              L ${pulseX + pulseWidth} ${pulseY}`}
          stroke={colors.blue}
          strokeWidth={size * 0.02}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}
