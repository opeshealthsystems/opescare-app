import React from 'react';
import type { ViewStyle } from 'react-native';

import { embedMapUrl, type MapFacility, type MapVariant } from '../../lib/embedMapUrl';

type Props = {
  facilities: MapFacility[] | MapFacility;
  height?: number;
  directions?: boolean;
  /** `thumbnail` drops the map's own controls — see embedMapUrl. */
  variant?: MapVariant;
  style?: ViewStyle;
};

/**
 * Web build: the finder's /embed/map is same-origin, so a plain <iframe> shows a
 * real OpenStreetMap map (markers + in-app directions) without leaving the app.
 * (Native uses a WebView — see FacilityMap.tsx.)
 */
export function FacilityMap({ facilities, height = 220, directions, variant, style }: Props) {
  const url = embedMapUrl(facilities, { directions, variant });
  if (!url) return null;

  return React.createElement('iframe', {
    src: url,
    allow: 'geolocation',
    title: 'Facility map',
    loading: 'lazy',
    style: {
      width: '100%',
      height,
      border: 0,
      borderRadius: 14,
      display: 'block',
      ...(style as unknown as Record<string, unknown>),
    },
  });
}

export default FacilityMap;
