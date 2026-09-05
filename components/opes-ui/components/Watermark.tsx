import React, { useMemo } from 'react';
import { Image, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
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
 * The widest a phone layout is allowed to get on a desktop browser, in px.
 *
 * Comfortably above the 375px these screens are designed for — nothing is
 * stretched to fill it — and narrow enough that the result still reads as the
 * phone app it is.
 */
const PHONE_MAX_WIDTH = 520;

/**
 * Below this window width the app fills the window exactly as it always has:
 * every phone, and a tablet held in portrait.
 */
const CONTAIN_WEB_FROM = 600;

/**
 * The app-wide background: opaque page colour, the faded seal, then the screen.
 *
 * Used as the `screenLayout` of the app's navigators (and around the
 * pre-navigation auth/splash flow) so it wraps EVERY screen exactly once. It
 * paints an opaque `page` fill, which is what keeps stack push/pop transitions
 * clean: each card is opaque, so screens never bleed through one another even
 * though their own root fill is transparent.
 *
 * ── AND, ON WEB, IT IS THE PHONE COLUMN ───────────────────────────────────
 *
 * This app is a phone app that is also served as a website, and a browser
 * window is not a phone. Given the whole window the layouts did not become a
 * desktop design, they just spread thin: at 1280px the bottom tab bar ran the
 * full 1280px, and the floating Quick Add button — anchored bottom-right of
 * whatever box contains it — sat on top of the "No upcoming visits" empty
 * state in the middle of the screen instead of beside the content.
 *
 * So on a wide WEB window the ground splits in two: a full-bleed outer view
 * that fills the window, and this capped, centred column that everything else
 * renders inside. It has to be here rather than in CSS on the HTML root
 * because this view is an ancestor of both navigators, and on web every React
 * Native view is a positioned box — so the tab bars and the FAB, which are
 * absolutely positioned inside it, are laid out against THIS column and move
 * with it. It also reaches the two navigator layouts without editing them.
 *
 * Native is untouched: `contained` is false off web, so the column is exactly
 * the full-bleed view it has always been, and the outer view is then an
 * ordinary `flex: 1` parent painting a colour that is never visible.
 */
export function AppBackground({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const contained = Platform.OS === 'web' && width >= CONTAIN_WEB_FROM;

  return (
    <View style={styles.outer}>
      <View style={[styles.base, contained && styles.phoneColumn]}>
        <Watermark />
        {children}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  /** The window itself. Only ever seen either side of the column, on web. */
  outer: {
    flex: 1,
    backgroundColor: colors.divider,
  },
  base: {
    flex: 1,
    backgroundColor: colors.page,
  },
  /** The phone column on a desktop-width browser window. */
  phoneColumn: {
    width: '100%',
    maxWidth: PHONE_MAX_WIDTH,
    alignSelf: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
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
