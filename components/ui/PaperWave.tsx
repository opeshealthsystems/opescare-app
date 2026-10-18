import React from 'react';
import { Image, StyleSheet } from 'react-native';
import { HEALTH_ID_ART } from '@/components/health-id/assets';

/**
 * The OpesCare Secure "paper": the guilloche wave field that sits under the
 * My Profile masthead, rendered under every screen header so the whole app
 * reads as one document.
 *
 * Drop it as the FIRST child of a header. It is absolutely positioned and
 * deliberately overhangs the header's own padding (negative left/right/top),
 * so it reaches the screen edges whatever padding the screen applies. Later
 * siblings — the header content and the cards below — paint over it.
 * Untappable and hidden from screen readers: it carries no information.
 */
export function PaperWave() {
  return (
    <Image
      source={HEALTH_ID_ART.guillocheMesh}
      style={styles.wave}
      resizeMode="cover"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      alt=""
    />
  );
}

const styles = StyleSheet.create({
  wave: {
    pointerEvents: 'none',
    position: 'absolute',
    top: -64,
    left: -48,
    right: -48,
    height: 300,
    opacity: 0.75,
  },
});
