import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { toQR } from 'toqr';
import { colors } from '../theme/theme';

export type QrCodeProps = {
  /** The exact payload to encode (e.g. `HealthIdCard.qr_payload`). */
  value: string;
  /** Rendered box in px, including the quiet zone. Default 160. */
  size?: number;
  /** Module colour. Default `colors.textPrimary`. */
  color?: string;
  /** Backing colour. Default `colors.surface`. */
  background?: string;
  /** Quiet-zone width in modules. The spec asks for 4; 2 reads fine on screen. */
  quietZone?: number;
};

/**
 * A real, scannable QR code rendered as SVG rects.
 *
 * Not an icon — `Icon.tsx` is the glyph set; this is a data matrix, so it is
 * generated rather than drawn. `toqr` returns a flat row-major bitmap whose
 * length is a perfect square.
 */
export function QrCode({
  value,
  size = 160,
  color = colors.textPrimary,
  background = colors.surface,
  quietZone = 2,
}: QrCodeProps) {
  const matrix = useMemo(() => {
    if (!value) return null;
    try {
      const bits = toQR(value);
      const dim = Math.round(Math.sqrt(bits.length));
      if (dim * dim !== bits.length) return null;
      return { bits, dim };
    } catch {
      return null;
    }
  }, [value]);

  if (!matrix) {
    return <View style={{ width: size, height: size, backgroundColor: background }} />;
  }

  const total = matrix.dim + quietZone * 2;
  const rects: React.ReactElement[] = [];

  for (let y = 0; y < matrix.dim; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= matrix.dim; x += 1) {
      const on = x < matrix.dim && (matrix.bits[y * matrix.dim + x] & 1) === 1;
      if (on && runStart < 0) runStart = x;
      if (!on && runStart >= 0) {
        // Emit each horizontal run as one rect — far fewer nodes than one per module.
        rects.push(
          <Rect
            key={`${y}-${runStart}`}
            x={runStart + quietZone}
            y={y + quietZone}
            width={x - runStart}
            height={1}
            fill={color}
          />,
        );
        runStart = -1;
      }
    }
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${total} ${total}`}>
      <Rect x={0} y={0} width={total} height={total} fill={background} />
      {rects}
    </Svg>
  );
}
