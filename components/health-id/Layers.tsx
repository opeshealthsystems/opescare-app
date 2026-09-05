/**
 * The independently controllable visual primitives of the secure credential:
 * static art, breathing art, spinning art, the corner brackets, the seal system
 * and the framed QR panel. Pure presentation — nothing here knows what a QR
 * encodes or where a token came from.
 *
 * Every bitmap is decorative: never focusable, never announced, never a tap
 * target. The one interactive element (the QR panel) carries its own label.
 */
import React from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { HEALTH_ID_ART } from './assets';
import { breathe, spin, useLoop } from './motion';

/** Hide a purely decorative element from every assistive technology. */
export const DECORATIVE = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
};

/**
 * Fill the parent. NOT `StyleSheet.absoluteFill`: on web, an <Image> with no
 * explicit width/height falls back to the bitmap's intrinsic size, so a
 * 900px texture rendered 900px wide inside a 343px card (clipped, but wrong,
 * and `cover` never engaged). Explicit percentages make every platform agree.
 */
export const FILL: ImageStyle = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' };

type ResizeMode = 'cover' | 'contain' | 'stretch';

type ArtProps = {
  source: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  opacity?: number;
  resizeMode?: ResizeMode;
};

/** A static decorative bitmap layer. */
export function Art({ source, style, opacity = 1, resizeMode = 'contain' }: ArtProps) {
  return (
    <Image
      source={source}
      resizeMode={resizeMode}
      style={[style, { opacity }]}
      alt=""
      {...DECORATIVE}
    />
  );
}

/** A layer whose opacity breathes between `low` and `high`; rests at `low`. */
export function PulseArt({
  source,
  style,
  low,
  high,
  duration = 2600,
  active = true,
  resizeMode = 'contain',
}: Omit<ArtProps, 'opacity'> & { low: number; high: number; duration?: number; active?: boolean }) {
  const progress = useLoop(duration, active);
  return (
    <Animated.Image
      source={source}
      resizeMode={resizeMode}
      style={[style, { opacity: breathe(progress, low, high) }]}
      alt=""
      {...DECORATIVE}
    />
  );
}

/** A layer that turns once every `duration` ms; still when motion is reduced. */
export function SpinArt({
  source,
  style,
  duration,
  active = true,
  opacity = 1,
  resizeMode = 'contain',
}: ArtProps & { duration: number; active?: boolean }) {
  const progress = useLoop(duration, active);
  return (
    <Animated.Image
      source={source}
      resizeMode={resizeMode}
      style={[style, { opacity, transform: [{ rotate: spin(progress) }] }]}
      alt=""
      {...DECORATIVE}
    />
  );
}

/**
 * Four L-shaped corner markers. Quiet on the card; in Presentation Mode they
 * pulse, which is the verifier's cue that the code on screen is live.
 */
export function CornerBrackets({
  color,
  size = 22,
  inset = 10,
  radius = 8,
  thickness = 2,
  active = false,
}: {
  color: string;
  size?: number;
  inset?: number;
  radius?: number;
  thickness?: number;
  active?: boolean;
}) {
  const progress = useLoop(1400, active);
  const opacity = active ? breathe(progress, 0.5, 1) : 0.5;
  const base: ViewStyle = { position: 'absolute', width: size, height: size, borderColor: color };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} {...DECORATIVE}>
      <Animated.View
        style={[base, { top: inset, left: inset, borderTopWidth: thickness, borderLeftWidth: thickness, borderTopLeftRadius: radius, opacity }]}
      />
      <Animated.View
        style={[base, { top: inset, right: inset, borderTopWidth: thickness, borderRightWidth: thickness, borderTopRightRadius: radius, opacity }]}
      />
      <Animated.View
        style={[base, { bottom: inset, left: inset, borderBottomWidth: thickness, borderLeftWidth: thickness, borderBottomLeftRadius: radius, opacity }]}
      />
      <Animated.View
        style={[base, { bottom: inset, right: inset, borderBottomWidth: thickness, borderRightWidth: thickness, borderBottomRightRadius: radius, opacity }]}
      />
    </View>
  );
}

/**
 * The OPESCARE Secure seal: aura, holographic ring, seal artwork and — when
 * presenting — the light sweep. The ring always turns (slowly), which is the
 * "holographic response" of the design; presenting speeds it up.
 */
export function SealSystem({ size = 64, active = false }: { size?: number; active?: boolean }) {
  const aura = size * 1.6;
  const ring = size * 1.24;
  return (
    <View
      pointerEvents="none"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      {...DECORATIVE}
    >
      <Art
        source={HEALTH_ID_ART.sealAura}
        style={{ position: 'absolute', width: aura, height: aura }}
        opacity={active ? 0.95 : 0.6}
      />
      <SpinArt
        source={HEALTH_ID_ART.holoRing}
        style={{ position: 'absolute', width: ring, height: ring }}
        duration={active ? 9000 : 24000}
        opacity={active ? 0.9 : 0.5}
      />
      <Art source={HEALTH_ID_ART.seal} style={{ width: size, height: size }} />
      {active ? (
        <SpinArt
          source={HEALTH_ID_ART.sealSweep}
          style={{ position: 'absolute', width: size * 1.35, height: size * 1.35 }}
          duration={3200}
          opacity={0.9}
        />
      ) : null}
    </View>
  );
}

/** Layout footprint of a QrPanel of QR edge `size` (the frame overhangs the white box). */
export function qrPanelExtent(size: number): number {
  const pad = Math.round(size * 0.1);
  return Math.round((size + pad * 2) * 1.24);
}

/**
 * A QR code on a white field, inside the OPESCARE Secure frame. `active` adds
 * the scan glow used in Presentation Mode. Tapping (when `onPress` is given)
 * opens the code full screen — the panel is the button, the frame is not.
 */
export function QrPanel({
  value,
  size,
  active = false,
  onPress,
  accessibilityLabel,
  background,
  foreground,
}: {
  value: string;
  size: number;
  active?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  background: string;
  foreground: string;
}) {
  const pad = Math.round(size * 0.1);
  const box = size + pad * 2;
  const extent = qrPanelExtent(size);
  const glow = extent * 1.18;

  const field = (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: Math.round(box * 0.11),
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <QRCode value={value} size={size} color={foreground} backgroundColor={background} />
    </View>
  );

  return (
    <View style={{ width: extent, height: extent, alignItems: 'center', justifyContent: 'center' }}>
      {active ? (
        <PulseArt
          source={HEALTH_ID_ART.qrGlow}
          style={{ position: 'absolute', width: glow, height: glow }}
          low={0.45}
          high={0.95}
          duration={1800}
        />
      ) : null}
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={({ pressed }) => [pressed && { opacity: 0.88 }]}
        >
          {field}
        </Pressable>
      ) : (
        field
      )}
      <Art
        source={HEALTH_ID_ART.qrFrame}
        style={{ position: 'absolute', width: extent, height: extent }}
        opacity={active ? 1 : 0.9}
      />
    </View>
  );
}
