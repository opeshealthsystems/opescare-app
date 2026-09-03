import { useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import {
  Bandage,
  BriefcaseMedical,
  ClipboardPlus,
  Cross,
  Dna,
  Droplet,
  FlaskConical,
  HeartPulse,
  Microscope,
  Pill,
  ShieldPlus,
  Stethoscope,
  Syringe,
  TestTube,
  Thermometer,
  type LucideIcon,
} from 'lucide-react-native';
import { colors } from '../../theme/tokens';

/**
 * The faint gold medical-iconography wash that sits behind every pre-auth
 * screen in the reference set (welcome / login / sign-up): outlined
 * stethoscope, DNA, syringe, flask… glyphs plus a few hairline "constellation"
 * threads, all at very low opacity on the cream page.
 *
 * Positions are fractions of the window so the pattern spreads over the whole
 * screen on any device instead of bunching at the top. Purely decorative and
 * `pointerEvents="none"`, so it never intercepts a tap.
 */
type Glyph = { Icon: LucideIcon; x: number; y: number; size: number; rotate?: number };

const GLYPHS: Glyph[] = [
  { Icon: Stethoscope, x: 0.04, y: 0.05, size: 40, rotate: 8 },
  { Icon: HeartPulse, x: 0.3, y: 0.09, size: 30 },
  { Icon: BriefcaseMedical, x: 0.46, y: 0.02, size: 34, rotate: -6 },
  { Icon: Dna, x: 0.68, y: 0.05, size: 36, rotate: 12 },
  { Icon: ClipboardPlus, x: 0.87, y: 0.1, size: 32, rotate: -8 },
  { Icon: Microscope, x: 0.02, y: 0.19, size: 36 },
  { Icon: Pill, x: 0.6, y: 0.14, size: 26, rotate: 30 },
  { Icon: Syringe, x: 0.79, y: 0.21, size: 34, rotate: -20 },
  { Icon: TestTube, x: 0.09, y: 0.31, size: 30, rotate: 10 },
  { Icon: ShieldPlus, x: 0.89, y: 0.3, size: 30 },
  { Icon: FlaskConical, x: 0.03, y: 0.44, size: 32, rotate: -6 },
  { Icon: Cross, x: 0.92, y: 0.43, size: 24 },
  { Icon: Droplet, x: 0.06, y: 0.57, size: 26 },
  { Icon: Thermometer, x: 0.89, y: 0.55, size: 28, rotate: 14 },
  { Icon: Bandage, x: 0.11, y: 0.7, size: 28, rotate: -18 },
  { Icon: HeartPulse, x: 0.85, y: 0.68, size: 26 },
  { Icon: Dna, x: 0.19, y: 0.87, size: 28, rotate: 20 },
  { Icon: Pill, x: 0.77, y: 0.89, size: 24, rotate: -25 },
];

/** Hairline threads + nodes — the faint "connected network" motif behind the
 * glyphs in the references. Coordinates are window fractions. */
const THREADS: Array<Array<[number, number]>> = [
  [
    [0.0, 0.12],
    [0.14, 0.06],
    [0.29, 0.13],
  ],
  [
    [0.62, 0.03],
    [0.75, 0.11],
    [0.94, 0.06],
  ],
  [
    [0.05, 0.62],
    [0.16, 0.55],
    [0.24, 0.63],
  ],
];

const NODES: Array<[number, number, number]> = [
  [0.14, 0.06, 3],
  [0.29, 0.13, 2],
  [0.75, 0.11, 3],
  [0.94, 0.06, 2],
  [0.16, 0.55, 2.5],
  [0.9, 0.78, 3],
  [0.08, 0.4, 2],
];

export function MedicalWatermark({ opacity = 0.2 }: { opacity?: number }) {
  const { width, height } = useWindowDimensions();

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        top: -56,
        bottom: -56,
        left: -32,
        right: -32,
        opacity,
        overflow: 'hidden',
      }}
    >
      <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
        {THREADS.map((points, index) => (
          <Polyline
            key={`thread-${index}`}
            points={points.map(([px, py]) => `${px * width},${py * height}`).join(' ')}
            fill="none"
            stroke={colors.brand[300]}
            strokeWidth={1}
          />
        ))}
        {NODES.map(([cx, cy, r], index) => (
          <Circle
            key={`node-${index}`}
            cx={cx * width}
            cy={cy * height}
            r={r}
            fill={colors.brand[300]}
          />
        ))}
      </Svg>

      {GLYPHS.map(({ Icon, x, y, size, rotate }, index) => (
        <View
          key={`glyph-${index}`}
          style={{
            position: 'absolute',
            left: x * width,
            top: y * height,
            transform: rotate ? [{ rotate: `${rotate}deg` }] : undefined,
          }}
        >
          <Icon size={size} color={colors.brand[300]} strokeWidth={1.25} />
        </View>
      ))}
    </View>
  );
}
