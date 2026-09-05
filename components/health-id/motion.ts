/**
 * Motion helpers for the secure credential.
 *
 * Two rules the whole module follows:
 *  - the JS driver on web (the native driver does not exist there), the native
 *    driver everywhere else — the same split `app/index.tsx` uses;
 *  - every loop is a no-op when the person has asked the OS for reduced
 *    motion. A credential that shimmers is a nice touch; one that cannot be
 *    switched off is an accessibility defect.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

export const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    try {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((value) => {
          if (alive) setReduced(!!value);
        })
        .catch(() => {
          /* unsupported platform: keep animating */
        });
    } catch {
      /* unsupported platform: keep animating */
    }
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) =>
      setReduced(!!value),
    );
    return () => {
      alive = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}

/**
 * A 0 → 1 progress value that loops for `duration` ms while `enabled`, and sits
 * at 0 (the layer's resting look) when disabled or when motion is reduced.
 */
export function useLoop(duration: number, enabled = true): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!enabled || reduced) {
      value.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [value, duration, enabled, reduced]);

  return value;
}

/** Full turn, for rings and light sweeps. */
export function spin(progress: Animated.Value) {
  return progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
}

/** Breathe between `low` and `high` and back. */
export function breathe(progress: Animated.Value, low: number, high: number) {
  return progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [low, high, low] });
}
