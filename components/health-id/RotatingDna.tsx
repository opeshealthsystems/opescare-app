/**
 * The Health ID card's DNA strand, turning on its axis.
 *
 * A B-DNA double helix (10.5 base pairs per turn, 150° minor/major groove
 * offset) drawn in the card's own artwork style — glossy blue ribbons with a
 * cyan edge, pale rungs with bright beads, soft glow — and pre-rendered into
 * 12 frames (assets/health-id/dna-rotate.webp, 6×2 sheet of 120×840 frames).
 *
 * Why it loops seamlessly: turning a helix by one base-pair step while moving
 * it down by one rise lands every rung exactly where its neighbour was — so
 * the 12 frames cover one step of that screw motion and wrap with no seam.
 * A full turn takes about 10 seconds.
 *
 * Plain images + Animated transforms — no native module — so it ships over
 * the air. Holds still when the OS asks for reduced motion (useLoop).
 */
import React, { useState } from 'react';
import { Animated, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { DECORATIVE } from './Layers';
import { useLoop } from './motion';

const SHEET = require('../../assets/health-id/dna-rotate.webp');
const FRAME_W = 120;
const FRAME_H = 840;
const COLS = 6;
const ROWS = 2;
const FRAMES = 12;
/** One base-pair step of the screw motion; 10.5 steps ≈ one full turn ≈ 10 s. */
const STEP_MS = 950;

type Props = {
  /** The box the strand fills (cover). Needs a width and height. */
  style?: StyleProp<ViewStyle>;
  opacity?: number;
  active?: boolean;
};

export function RotatingDna({ style, opacity = 1, active = true }: Props) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const progress = useLoop(STEP_MS, active);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setBox({ w: width, h: height });
  };

  let frame: { w: number; h: number; x: number; y: number } | null = null;
  if (box) {
    // cover: fill the box, centred, cropping the overflow.
    const scale = Math.max(box.w / FRAME_W, box.h / FRAME_H);
    const w = FRAME_W * scale;
    const h = FRAME_H * scale;
    frame = { w, h, x: (box.w - w) / 2, y: (box.h - h) / 2 };
  }

  const input: number[] = [];
  const outX: number[] = [];
  const outY: number[] = [];
  if (frame) {
    for (let k = 0; k < FRAMES; k += 1) {
      const x = -(k % COLS) * frame.w;
      const y = -Math.floor(k / COLS) * frame.h;
      input.push(k / FRAMES, (k + 1) / FRAMES - 0.0001);
      outX.push(x, x);
      outY.push(y, y);
    }
  }

  return (
    <View style={[style, { opacity, overflow: 'hidden' }]} onLayout={onLayout} pointerEvents="none" {...DECORATIVE}>
      {frame ? (
        <View style={{ position: 'absolute', left: frame.x, top: frame.y, width: frame.w, height: frame.h, overflow: 'hidden' }}>
          <Animated.Image
            source={SHEET}
            alt=""
            style={{
              width: frame.w * COLS,
              height: frame.h * ROWS,
              transform: [
                { translateX: progress.interpolate({ inputRange: input, outputRange: outX }) },
                { translateY: progress.interpolate({ inputRange: input, outputRange: outY }) },
              ],
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
