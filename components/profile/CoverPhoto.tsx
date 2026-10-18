import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

/**
 * A photo that fills its frame without distorting, computed rather than
 * declared.
 *
 * This exists because react-native-web 0.21 ignores `resizeMode` here — every
 * <Image> on the page computes to `object-fit: fill`, including ones asking
 * for `contain`. So instead of trusting a fit mode we measure the source with
 * `Image.getSize`, scale it so the SHORTER side matches the frame, and centre
 * the overflow. The parent clips it.
 *
 * While the size is unknown nothing is drawn: a photo shown at the wrong
 * aspect for even a moment is the bug this replaces. If the source cannot be
 * measured or cannot load, `onFail` hands the caller back its initials.
 */
export function CoverPhoto({
  uri,
  width,
  height,
  radius,
  onFail,
}: {
  uri: string;
  width: number;
  height: number;
  radius: number;
  onFail: () => void;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let alive = true;
    setNatural(null);
    Image.getSize(
      uri,
      (w, h) => {
        if (alive && w > 0 && h > 0) setNatural({ w, h });
      },
      () => {
        if (alive) onFail();
      },
    );
    return () => {
      alive = false;
    };
    // `onFail` is a stable setState updater at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  if (!natural) return null;

  // Scale so the image covers the frame, then centre what spills over.
  const scale = Math.max(width / natural.w, height / natural.h);
  const w = natural.w * scale;
  const h = natural.h * scale;

  return (
    <View style={{ width, height, borderRadius: radius, overflow: 'hidden' }}>
      <Image
        source={{ uri }}
        style={{
          position: 'absolute',
          width: w,
          height: h,
          left: (width - w) / 2,
          top: (height - h) / 2,
        }}
        onError={onFail}
        accessibilityIgnoresInvertColors
        alt=""
      />
    </View>
  );
}
