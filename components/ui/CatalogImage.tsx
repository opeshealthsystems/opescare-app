import React, { useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { radii } from '@/components/opes-ui/theme';

/**
 * The one way to show a facility logo or a medicine picture.
 *
 * The API hands out a signed, absolute, hour-stable link (`logo_url`,
 * `image_url`, `facility_logo_url`) or null. This component:
 *  - renders `fallback` (a plain icon glyph with no backdrop, or initials) when the
 *    link is absent, or when the image fails to load: never a broken box;
 *  - remembers failed links for the session, so a list does not retry a dead
 *    link on every re-render or scroll;
 *  - asks the platform image cache to keep the bytes (`force-cache`); the
 *    link is byte-identical within the hour, so a revisit is a cache hit;
 *  - fills a rounded box on the design-system radii (`cover`, or `contain`
 *    for logos that must stay whole).
 *
 * Plain react-native Image on purpose: expo-image is a native module and this
 * has to ship over the air. Never pass a placeholder or stock picture as
 * `uri`: no image means the fallback.
 */

const failed = new Set<string>();

export type CatalogImageProps = {
  /** Signed link from the API, or null/undefined when there is none. */
  uri?: string | null;
  /** Square edge in dp. */
  size?: number;
  /** Defaults to the design-system small radius. */
  radius?: number;
  /** What to show when there is no image: the screen's current icon/initials. */
  fallback: React.ReactNode;
  /** `cover` for photos (default); `contain` keeps a whole logo visible. */
  fit?: 'cover' | 'contain';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** True for an http(s) link that has not already failed this session. */
export function isUsableImageUri(uri?: string | null): uri is string {
  return typeof uri === 'string' && /^https?:\/\//i.test(uri) && !failed.has(uri);
}

/** Record a link as dead for the rest of the session. */
export function markImageFailed(uri: string): void {
  failed.add(uri);
}

export function CatalogImage({
  uri,
  size = 44,
  radius = radii.sm,
  fallback,
  fit = 'cover',
  style,
  accessibilityLabel,
}: CatalogImageProps) {
  const [broken, setBroken] = useState(false);

  if (broken || !isUsableImageUri(uri)) {
    return <>{fallback}</>;
  }

  const box: ViewStyle = { width: size, height: size, borderRadius: radius, overflow: 'hidden' };
  const img: ImageStyle = { width: '100%', height: '100%' };

  return (
    <View style={[box, style]}>
      <Image
        source={{ uri, cache: 'force-cache' }}
        style={img}
        resizeMode={fit}
        accessible={!!accessibilityLabel}
        accessibilityLabel={accessibilityLabel}
        accessibilityIgnoresInvertColors
        onError={() => {
          markImageFailed(uri);
          setBroken(true);
        }}
      />
    </View>
  );
}

/** Test hook: forget remembered failures. */
export function __resetCatalogImageFailures(): void {
  failed.clear();
}
