import React from 'react';
import { Linking, View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { embedMapUrl, type MapFacility, type MapVariant } from '../../lib/embedMapUrl';

type Props = {
  facilities: MapFacility[] | MapFacility;
  height?: number;
  directions?: boolean;
  /** `thumbnail` drops the map's own controls — see embedMapUrl. */
  variant?: MapVariant;
  /** Draw the search area: both halves or neither. */
  center?: { lat: number; lng: number } | null;
  radiusKm?: number | null;
  /** Name every pin. */
  labels?: boolean;
  style?: ViewStyle;
};

/**
 * Native build: load the finder's /embed/map in a WebView so the real map +
 * in-app directions render inside the app (no external maps app). geolocation is
 * enabled for the "locate me"/directions control. (Web uses an iframe — see
 * FacilityMap.web.tsx.)
 */
export function FacilityMap({
  facilities,
  height = 220,
  directions,
  variant,
  center,
  radiusKm,
  labels,
  style,
}: Props) {
  const url = embedMapUrl(facilities, { directions, variant, center, radiusKm, labels });
  if (!url) return null;
  const origin = new URL(url).origin;

  return (
    <View style={[{ height, borderRadius: 14, overflow: 'hidden' }, style]}>
      <WebView
        source={{ uri: url }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        // The frame may only ever show the finder's own map. Any other
        // top-level navigation (an attribution link, say) leaves the app for
        // the browser instead of loading inside a geolocation-enabled view.
        originWhitelist={[origin]}
        onShouldStartLoadWithRequest={(req) => {
          if (req.url.startsWith(origin) || req.url === 'about:blank') return true;
          if (req.isTopFrame !== false && /^https:\/\//i.test(req.url)) {
            Linking.openURL(req.url).catch(() => undefined);
          }
          return req.isTopFrame === false;
        }}
        geolocationEnabled
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        startInLoadingState
      />
    </View>
  );
}

export default FacilityMap;
