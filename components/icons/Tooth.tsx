import { forwardRef } from 'react';
import Svg, { Path } from 'react-native-svg';
import type { LucideProps } from 'lucide-react-native';

/**
 * Tooth — drop-in Lucide-compatible icon for the `dental` facility type.
 *
 * `lucide-react-native@1.37` ships 1791 icons but none of them is a tooth
 * (checked: nothing matching /tooth|dent|smile/), and the care map previously
 * rendered dental facilities with `Stethoscope` — the same glyph it uses for
 * clinics, so the two types were visually indistinguishable.
 *
 * Follows Lucide's drawing conventions exactly so it is interchangeable with a
 * real Lucide icon: 24x24 viewBox, `stroke="currentColor"` overridden by the
 * `color` prop, `strokeWidth={2}`, round caps and joins, `fill="none"`, and the
 * same `size` / `color` / `absoluteStrokeWidth` prop API.
 */
export const Tooth = forwardRef<Svg, LucideProps>(function Tooth(
  {
    size = 24,
    color = 'currentColor',
    strokeWidth = 2,
    absoluteStrokeWidth = false,
    ...rest
  },
  ref,
) {
  const numericSize = typeof size === 'string' ? Number.parseFloat(size) || 24 : size;
  const numericStroke =
    typeof strokeWidth === 'string' ? Number.parseFloat(strokeWidth) || 2 : strokeWidth;

  return (
    <Svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={absoluteStrokeWidth ? (numericStroke * 24) / numericSize : numericStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <Path d="M12 5.5C10.5 4 9 3.5 7.5 3.5 5 3.5 3.5 5.5 3.5 8c0 1.9.5 3.1 1.1 4.8.5 1.5.8 3.3 1 5 .1 1.3.7 2.2 1.6 2.2 1 0 1.4-1 1.7-2.5.3-1.4.5-2.8 3.1-2.8s2.8 1.4 3.1 2.8c.3 1.5.7 2.5 1.7 2.5.9 0 1.5-.9 1.6-2.2.2-1.7.5-3.5 1-5 .6-1.7 1.1-2.9 1.1-4.8 0-2.5-1.5-4.5-4-4.5-1.5 0-3 .5-4.5 2Z" />
    </Svg>
  );
});
