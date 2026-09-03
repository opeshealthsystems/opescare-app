import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { embedMapUrl, type MapFacility } from '../../lib/embedMapUrl';

type Props = {
  facilities: MapFacility[] | MapFacility;
  height?: number;
  directions?: boolean;
  style?: ViewStyle;
};

/**
 * Native build: load the finder's /embed/map in a WebView so the real map +
 * in-app directions render inside the app (no external maps app). geolocation is
 * enabled for the "locate me"/directions control. (Web uses an iframe — see
 * FacilityMap.web.tsx.)
 */
export function FacilityMap({ facilities, height = 220, directions, style }: Props) {
  const url = embedMapUrl(facilities, { directions });
  if (!url) return null;

  return (
    <View style={[{ height, borderRadius: 14, overflow: 'hidden' }, style]}>
      <WebView
        source={{ uri: url }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        originWhitelist={['*']}
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
