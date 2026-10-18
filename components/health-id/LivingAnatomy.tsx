/**
 * The anatomical hologram, alive: the figure's own heart beats and current
 * runs along the figure's own vessels. Nothing is drawn on top of the art —
 * the original render is split into three parts (scripts: see
 * assets/health-id/living/meta.json for the geometry):
 *
 *   base     the figure with its heart lifted out and the gap filled with the
 *            body's own blurred tissue, so a contracting heart reveals tissue
 *   current  24 frames of light travelling outward from the heart along the
 *            image's own vessel lines (distance measured ALONG the vessels,
 *            so the light branches where they branch), one cycle per beat
 *   heart    the cut-out heart, which beats lub-dub at 72 bpm
 *
 * Plain images and Animated transforms only — no native module — so it ships
 * over the air. Still when the OS asks for reduced motion (useLoop).
 */
import React, { useState } from 'react';
import { Animated, Image, View, type ImageSourcePropType, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { DECORATIVE } from './Layers';
import { USE_NATIVE_DRIVER, useLoop } from './motion';
import type { AnatomicalProfile } from './model';
import META from '../../assets/health-id/living/meta.json';

type Figure = 'adult-male' | 'adult-female' | 'child-boy' | 'child-girl';

const PARTS: Record<Figure, { base: ImageSourcePropType; heart: ImageSourcePropType; current: ImageSourcePropType }> = {
  'adult-male': {
    base: require('../../assets/health-id/living/adult-male-base.png'),
    heart: require('../../assets/health-id/living/adult-male-heart.png'),
    current: require('../../assets/health-id/living/adult-male-current.webp'),
  },
  'adult-female': {
    base: require('../../assets/health-id/living/adult-female-base.png'),
    heart: require('../../assets/health-id/living/adult-female-heart.png'),
    current: require('../../assets/health-id/living/adult-female-current.webp'),
  },
  'child-boy': {
    base: require('../../assets/health-id/living/child-boy-base.png'),
    heart: require('../../assets/health-id/living/child-boy-heart.png'),
    current: require('../../assets/health-id/living/child-boy-current.webp'),
  },
  'child-girl': {
    base: require('../../assets/health-id/living/child-girl-base.png'),
    heart: require('../../assets/health-id/living/child-girl-heart.png'),
    current: require('../../assets/health-id/living/child-girl-current.webp'),
  },
};

const FIGURE_FOR: Record<AnatomicalProfile, Figure> = {
  adult_male: 'adult-male',
  adult_female: 'adult-female',
  child_male: 'child-boy',
  child_female: 'child-girl',
  generic: 'adult-male',
};

/** One heartbeat at 72 bpm. The current and the ECG strip keep the same time. */
export const BEAT_MS = 833;

type Props = {
  profile: AnatomicalProfile;
  /** The box the figure is fitted into (contain). Needs a width and height. */
  style?: StyleProp<ViewStyle>;
  opacity?: number;
  active?: boolean;
};

export function LivingAnatomy({ profile, style, opacity = 1, active = true }: Props) {
  const figure = FIGURE_FOR[profile] ?? 'adult-male';
  const parts = PARTS[figure];
  const meta = (META as Record<Figure, typeof META['adult-male']>)[figure];
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const progress = useLoop(BEAT_MS, active);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setBox({ w: width, h: height });
  };

  // Fit the figure (contain) inside the box.
  let fig: { w: number; h: number; x: number; y: number } | null = null;
  if (box) {
    const ratio = meta.w / meta.h;
    const w = Math.min(box.w, box.h * ratio);
    const h = w / ratio;
    fig = { w, h, x: (box.w - w) / 2, y: (box.h - h) / 2 };
  }

  return (
    <View style={[style, { opacity }]} onLayout={onLayout} pointerEvents="none" {...DECORATIVE}>
      {fig ? (
        <View style={{ position: 'absolute', left: fig.x, top: fig.y, width: fig.w, height: fig.h }}>
          <Image source={parts.base} style={{ position: 'absolute', width: fig.w, height: fig.h }} alt="" />
          <Current source={parts.current} fig={fig} meta={meta} progress={progress} />
          <Animated.Image
            source={parts.heart}
            alt=""
            style={{
              position: 'absolute',
              left: meta.heart.x * fig.w,
              top: meta.heart.y * fig.h,
              width: meta.heart.w * fig.w,
              height: meta.heart.h * fig.h,
              transform: [
                {
                  // lub-dub: contract, rebound, second smaller contraction, rest.
                  scale: progress.interpolate({
                    inputRange: [0, 0.1, 0.18, 0.3, 0.45, 1],
                    outputRange: [1, 0.9, 1.03, 0.94, 1, 1],
                  }),
                },
              ],
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/** The 24-frame current sheet, stepped through once per beat. */
function Current({
  source,
  fig,
  meta,
  progress,
}: {
  source: ImageSourcePropType;
  fig: { w: number; h: number };
  meta: { frames: number; cols: number; rows: number };
  progress: Animated.Value;
}) {
  const { frames, cols, rows } = meta;
  const input: number[] = [];
  const outX: number[] = [];
  const outY: number[] = [];
  for (let k = 0; k < frames; k += 1) {
    const start = k / frames;
    const end = (k + 1) / frames - 0.0001;
    const x = -(k % cols) * fig.w;
    const y = -Math.floor(k / cols) * fig.h;
    input.push(start, end);
    outX.push(x, x);
    outY.push(y, y);
  }
  return (
    <View style={{ position: 'absolute', width: fig.w, height: fig.h, overflow: 'hidden' }}>
      <Animated.Image
        source={source}
        alt=""
        style={{
          width: fig.w * cols,
          height: fig.h * rows,
          transform: [
            { translateX: progress.interpolate({ inputRange: input, outputRange: outX }) },
            { translateY: progress.interpolate({ inputRange: input, outputRange: outY }) },
          ],
        }}
      />
    </View>
  );
}

/** The ECG trace under the blood group, running at the same 72 bpm. */
export function LiveEcg({
  source,
  style,
  opacity = 1,
  active = true,
}: {
  source: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
  opacity?: number;
  active?: boolean;
}) {
  const [w, setW] = useState(0);
  const progress = useLoop(BEAT_MS, active);
  return (
    <View
      style={[style, { overflow: 'hidden', opacity }]}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      pointerEvents="none"
      {...DECORATIVE}
    >
      {w > 0 ? (
        <Animated.View
          style={{
            flexDirection: 'row',
            width: w * 2,
            height: '100%',
            transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -w] }) }],
          }}
        >
          <Image source={source} resizeMode="stretch" style={{ width: w, height: '100%' }} alt="" />
          <Image source={source} resizeMode="stretch" style={{ width: w, height: '100%' }} alt="" />
        </Animated.View>
      ) : null}
    </View>
  );
}

export { USE_NATIVE_DRIVER };
