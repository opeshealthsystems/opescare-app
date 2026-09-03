import Svg, { Path } from 'react-native-svg';

/**
 * Outlined Google "G" — lucide-react-native has no brand marks, so this is a
 * drop-in with the exact same prop API as a Lucide icon (`size`, `color`,
 * `strokeWidth`) and the same drawing conventions: 24x24 viewBox, no fill,
 * `stroke` in the passed colour, 2px round-capped strokes. Deliberately
 * monochrome rather than Google's brand colours — the control it labels is
 * currently disabled, and a full-colour brand lockup would over-promise.
 */
export interface GoogleMarkProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function GoogleMark({
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
}: GoogleMarkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* 320-degree ring centred on (12,12), open at the upper right. */}
      <Path d="M21 12a9 9 0 1 1-2.11-5.79" />
      {/* The G's crossbar, meeting the ring where it opens. */}
      <Path d="M21 12h-8" />
    </Svg>
  );
}

export default GoogleMark;
