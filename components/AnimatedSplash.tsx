/**
 * The animated splash: the living anatomy (its own heart beating, current
 * running along its own vessels) over a live ECG, with the OpesCare wordmark.
 *
 * The native splash (expo-splash-screen, app.json) can only be a still image
 * and is baked into the binary, so it stays as the first frame and this
 * takes over the moment the JS is ready. Same cream background as the
 * native splash, so the hand-off is seamless. Pure JS — ships over the air.
 *
 * Plays:
 *   - on every cold start, until the app is ready AND at least two beats have
 *     shown (so it never flickers on a fast phone), then fades out;
 *   - when the app returns to the foreground after RESUME_AFTER_MS away.
 * Nothing can be drawn while the app is closing — Android removes the window
 * at once — so there is no "on close" splash.
 *
 * Decorative and non-interactive; screen readers skip it. With reduced motion
 * the figure holds still (useLoop) and the splash is shorter.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { Wordmark, spacing } from '@/components/opes-ui';
import { PaperWave } from '@/components/ui/PaperWave';
import { BEAT_MS, LiveEcg, LivingAnatomy } from '@/components/health-id/LivingAnatomy';
import { HEALTH_ID_ART } from '@/components/health-id/assets';
import { USE_NATIVE_DRIVER } from '@/components/health-id/motion';

/** Matches app.json → expo-splash-screen backgroundColor. */
const SPLASH_BG = '#FDF8F0';
const COLD_MIN_MS = BEAT_MS * 2;
const RESUME_MS = BEAT_MS * 2;
const REDUCED_MS = 600;
const FADE_MS = 320;
/** Only replay after a real absence, not a quick glance at a notification. */
export const RESUME_AFTER_MS = 30_000;

export function AnimatedSplash({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(true);
  const [mode, setMode] = useState<'cold' | 'resume'>('cold');
  const opacity = useRef(new Animated.Value(1)).current;
  const shownAt = useRef(Date.now());
  const reduced = useRef(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        reduced.current = !!v;
      })
      .catch(() => undefined);
  }, []);

  // Fade out once the app is ready and the minimum has elapsed.
  useEffect(() => {
    if (!visible || !ready) return;
    const min = reduced.current ? REDUCED_MS : mode === 'resume' ? RESUME_MS : COLD_MIN_MS;
    const wait = Math.max(0, min - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [visible, ready, mode, opacity]);

  // Replay when the app comes back after a real absence.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away >= RESUME_AFTER_MS) {
          shownAt.current = Date.now();
          opacity.setValue(1);
          setMode('resume');
          setVisible(true);
        }
      }
    });
    return () => sub.remove();
  }, [opacity]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[styles.cover, { opacity }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <PaperWave />
      <View style={styles.figureWrap}>
        <LivingAnatomy profile="generic" style={styles.figure} />
      </View>
      <LiveEcg source={HEALTH_ID_ART.ecgLine} style={styles.ecg} />
      <View style={styles.brand}>
        <Wordmark size="lg" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    elevation: 20,
    overflow: 'hidden',
  },
  figureWrap: { width: 200, height: 380, alignItems: 'center', justifyContent: 'center' },
  figure: { width: 170, height: 380 },
  ecg: { width: 260, height: 48, marginTop: spacing.md, opacity: 0.95 },
  brand: { marginTop: spacing.lg },
});
