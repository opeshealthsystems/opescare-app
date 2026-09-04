import React, { useMemo } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { type Palette } from '../theme';
import { useTheme } from '../ThemeProvider';

/**
 * The faded OPES brand seal — the mobile/PWA counterpart of the desktop app's
 * `opes-watermark` (a low-opacity `public/images/opes-watermark.png` behind the
 * page body).
 *
 * It is a single APP-WIDE layer, not a per-screen decoration: `AppBackground`
 * paints the opaque page colour, drops this seal on top of it, and then renders
 * the (transparent-filled) screen over both. So the seal sits BETWEEN the page
 * colour and the screen content on every screen at once, and any opaque
 * surface a screen paints — a white card, a navy hero, the black image
 * canvas — covers it, exactly like the desktop seal disappears under cards.
 *
 * Design (mirrors the desktop seal):
 *   - Very low opacity (~5%): a watermark, never a splash. It must not compete
 *     with content or hurt legibility.
 *   - Responsive: sized relative to the viewport (`useWindowDimensions`), so it
 *     reads the same at 320 / 375 / tablet / wide PWA. Width-relative, capped,
 *     centred, `resizeMode="contain"`.
 *   - Decorative: `pointerEvents="none"` so it never intercepts a tap, and
 *     hidden from assistive tech.
 *
 * There is no dark theme in this app (a single `colors` object, `StatusBar`
 * fixed to `dark`), so there is only the one light page to handle; on the dark
 * canvases that DO exist per-screen (imaging viewer, Health-ID card) the
 * screen's own opaque fill sits above this layer and hides it.
 */
export function Watermark() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width, height } = useWindowDimensions();

  // Width-relative and capped, so the seal is generous on a phone yet never
  // balloons on a tablet or a wide desktop PWA. Also capped against height so a
  // short/landscape viewport can't clip it.
  const size = Math.min(width * 0.72, height * 0.6, 460);

  return (
    <View
      style={styles.layer}
      // Decorative: a screen reader must skip straight past it to the content.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={require('../assets/opes-watermark.png')}
        style={{ width: size, height: size, opacity: 0.05 }}
        resizeMode="contain"
        accessible={false}
        // Purely decorative; empty alt keeps it out of the web a11y tree too.
        accessibilityRole="none"
        alt=""
      />
    </View>
  );
}

/**
 * The app-wide background: opaque page colour, the faded seal, then the screen.
 *
 * Used as the `screenLayout` of the app's navigators (and around the
 * pre-navigation auth/splash flow) so it wraps EVERY screen exactly once. It
 * paints an opaque `page` fill, which is what keeps stack push/pop transitions
 * clean: each card is opaque, so screens never bleed through one another even
 * though their own root fill is transparent.
 */
export function AppBackground({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.base}>
      <Watermark />
      {children}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  base: {
    flex: 1,
    backgroundColor: colors.page,
  },
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Decorative overlay — never intercept a tap meant for the content below.
    pointerEvents: 'none',
  },
});
