import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import {
  ClipboardList,
  Cross,
  Dna,
  FlaskConical,
  HeartPulse,
  Microscope,
  Pill,
  ShieldPlus,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../components/ui/Screen';
import { Logo } from '../components/ui/Logo';
import { colors } from '../theme/tokens';

/**
 * Root route (`/`) — the very first frame of the app.
 *
 * PRESENTATION ONLY. All auth routing lives in app/_layout.tsx, which treats
 * this route like the auth group and redirects away from it once the session
 * resolves. Deliberately renders no navigation of its own: an authenticated
 * offline cold start resolves to 'authenticated' from the local cache and
 * lands here every launch, and _layout is what forwards it to /(tabs)/home.
 * Adding routing here would race that and regress the offline boot.
 *
 * It is on screen for the gap between the native splash hiding (status !==
 * 'booting') and that redirect committing, so it is a branded moment —
 * cream ground, the watermark iconography of the splash references, the
 * heartbeat mark with a slow gold pulse, and a three-dot rhythm — rather
 * than a bare spinner.
 *
 * Matches `Mobile app screens/a_clean_minimal_smartphone_splash_screen_design_v.png`
 * and `a_minimalist_mobile_app_splash_screen_ui_mockup.png`.
 *
 * Carries no strings of its own: the only text is the wordmark and tagline
 * the shared Logo renders, so it is bilingual without touching any namespace.
 */

/** react-native-web has no native animation driver — opting in there logs a
 * warning on every frame batch, so it is native-only. */
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

const MARK_SIZE = 96;

/** Faint medical iconography scattered behind the screen, matching the
 * splash references' watermark. Positions are fractions of the viewport so
 * the scatter holds its composition on any device, and the centre band
 * (y 0.36–0.64) is left clear for the mark. Purely decorative. */
const BACKGROUND_ICONS: Array<{
  Icon: LucideIcon;
  x: number;
  y: number;
  size: number;
  rotate?: string;
}> = [
  { Icon: ClipboardList, x: 0.42, y: 0.06, size: 30, rotate: '-8deg' },
  { Icon: Cross, x: 0.78, y: 0.07, size: 24 },
  { Icon: Dna, x: 0.13, y: 0.12, size: 30, rotate: '-6deg' },
  { Icon: Stethoscope, x: 0.71, y: 0.18, size: 34, rotate: '10deg' },
  { Icon: Syringe, x: 0.06, y: 0.24, size: 28, rotate: '18deg' },
  { Icon: FlaskConical, x: 0.83, y: 0.3, size: 26 },
  { Icon: Pill, x: 0.29, y: 0.33, size: 22, rotate: '24deg' },
  { Icon: Microscope, x: 0.05, y: 0.42, size: 28 },
  { Icon: ShieldPlus, x: 0.86, y: 0.45, size: 26 },
  { Icon: HeartPulse, x: 0.07, y: 0.6, size: 30 },
  { Icon: Dna, x: 0.85, y: 0.63, size: 26, rotate: '12deg' },
  { Icon: Pill, x: 0.16, y: 0.71, size: 22, rotate: '-14deg' },
  { Icon: ClipboardList, x: 0.73, y: 0.74, size: 28 },
  { Icon: FlaskConical, x: 0.43, y: 0.8, size: 26, rotate: '6deg' },
  { Icon: Stethoscope, x: 0.09, y: 0.85, size: 30, rotate: '-8deg' },
  { Icon: Cross, x: 0.8, y: 0.88, size: 22 },
  { Icon: Syringe, x: 0.32, y: 0.92, size: 26, rotate: '40deg' },
];

function BackgroundPattern() {
  // Measured from the layer itself rather than the window: this sits inside
  // the safe area, so window height would push the lower icons past the
  // bottom edge (and out of view on Android, which clips overflow).
  const [box, setBox] = useState({ width: 0, height: 0 });

  return (
    <View
      pointerEvents="none"
      onLayout={(e) =>
        setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
      }
      // Bleeds past Screen's px-6 so the scatter reaches both edges.
      style={{ position: 'absolute', top: 0, bottom: 0, left: -24, right: -24 }}
    >
      {box.height > 0
        ? BACKGROUND_ICONS.map(({ Icon, x, y, size, rotate }, index) => (
            <View
              key={index}
              style={{
                position: 'absolute',
                left: x * box.width,
                top: y * box.height,
                opacity: 0.26,
                transform: rotate ? [{ rotate }] : undefined,
              }}
            >
              <Icon size={size} color={colors.brand[300]} strokeWidth={1.25} />
            </View>
          ))
        : null}
    </View>
  );
}

/** A single gold ring that expands out of the mark and fades — two of them,
 * offset, read as a slow heartbeat rather than a spinner. */
function PulseRing({ delay }: { delay: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: 2200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        // Snap back invisibly so the next cycle starts from the mark again.
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, progress]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: MARK_SIZE,
        height: MARK_SIZE,
        borderRadius: MARK_SIZE / 2,
        borderWidth: 2,
        borderColor: colors.brand[300],
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
        transform: [
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) },
        ],
      }}
    />
  );
}

/** One of three dots that lift and brighten in sequence. */
function LoadingDot({ index }: { index: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(index * 170),
        Animated.timing(progress, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 380,
          easing: Easing.in(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.delay((2 - index) * 170),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [index, progress]);

  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        marginHorizontal: 5,
        backgroundColor: colors.brand[500],
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.28, 1] }),
        transform: [
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) },
        ],
      }}
    />
  );
}

export default function Index() {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [enter]);

  return (
    <Screen className="items-center justify-center">
      <BackgroundPattern />

      <Animated.View
        style={{
          alignItems: 'center',
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        }}
      >
        <View style={{ alignItems: 'center' }}>
          {/* Explicit left/right insets rather than relying on the parent's
              alignItems: absolute children are centred that way by Yoga on
              native but not by CSS on react-native-web. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: MARK_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PulseRing delay={0} />
            <PulseRing delay={1100} />
          </View>

          {/* Full lockup: mark + "OpesCare" + the translated tagline. */}
          <Logo size={MARK_SIZE} />
        </View>

        <View
          className="mt-10 flex-row items-center"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <LoadingDot index={0} />
          <LoadingDot index={1} />
          <LoadingDot index={2} />
        </View>
      </Animated.View>
    </Screen>
  );
}
