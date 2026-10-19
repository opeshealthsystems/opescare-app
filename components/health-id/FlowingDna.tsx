/**
 * The Health ID card's DNA strand — the owner's original artwork, gently alive.
 *
 * Nothing is redrawn: the original dna-helix image is stacked in a column,
 * every other copy mirrored top-to-bottom so each join lines up with itself
 * (the art was not drawn to tile), and the column drifts slowly upward and
 * wraps with no seam. A soft shimmer breathes its brightness. Pure Animated
 * transforms + opacity, so it ships over the air; still under reduced motion.
 */
import React, { useState } from 'react';
import { Animated, Image, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { HEALTH_ID_ART } from './assets';
import { DECORATIVE } from './Layers';
import { breathe, useLoop } from './motion';

/** Intrinsic size of assets/health-id/dna-helix.png. */
const ART_W = 206;
const ART_H = 720;
/** One mirrored pair drifts past in this long — slow, never busy. */
const DRIFT_MS = 24_000;
const SHIMMER_MS = 3_600;

type Props = {
  style?: StyleProp<ViewStyle>;
  opacity?: number;
  active?: boolean;
};

export function FlowingDna({ style, opacity = 1, active = true }: Props) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const drift = useLoop(DRIFT_MS, active);
  const shimmer = useLoop(SHIMMER_MS, active);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setBox({ w: width, h: height });
  };

  // Each tile keeps the art's own proportions at the box's width.
  const tileH = box ? (box.w * ART_H) / ART_W : 0;
  // Enough mirrored pairs to cover the box twice, so the wrap is never seen.
  const pairs = box ? Math.ceil(box.h / (2 * tileH)) + 2 : 0;

  return (
    <View style={[style, { overflow: 'hidden' }]} onLayout={onLayout} pointerEvents="none" {...DECORATIVE}>
      {box ? (
        <Animated.View
          style={{
            opacity: breathe(shimmer, opacity * 0.78, opacity),
            transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -2 * tileH] }) }],
          }}
        >
          {Array.from({ length: pairs * 2 }, (_, k) => (
            <Image
              key={k}
              source={HEALTH_ID_ART.dnaHelix}
              alt=""
              resizeMode="stretch"
              style={{ width: box.w, height: tileH, transform: k % 2 ? [{ scaleY: -1 }] : undefined }}
            />
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}
