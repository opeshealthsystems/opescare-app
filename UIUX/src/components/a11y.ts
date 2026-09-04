/**
 * Screen-reader helpers shared by every foundation component.
 *
 * Audit 28 measured `accessibilityHint`, `accessibilityLiveRegion`,
 * `autoComplete` and `textContentType` at literally zero occurrences across the
 * app. These two helpers are the pieces that would otherwise be copied into
 * forty files and drift.
 *
 * WHY THE PLATFORM SPLIT. `accessibilityElementsHidden` (iOS) and
 * `importantForAccessibility` (Android) are the React Native names, and they
 * are what the native accessibility bridge reads. On web, react-native-svg
 * spreads unrecognised props straight onto the DOM `<svg>` element, so those
 * two names would land as invalid attributes and be ignored — `aria-hidden` is
 * the attribute a browser's screen reader actually honours. Emitting the right
 * pair per platform is the difference between an ornament being silenced and
 * an ornament being read out as "image".
 */
import { Platform } from 'react-native';

/**
 * Spread onto a purely decorative element — an icon that repeats the label next
 * to it, a tint circle, a chevron. A screen reader then walks straight past it
 * instead of announcing ornament.
 */
export const decorative = Platform.OS === 'web'
  ? ({ 'aria-hidden': true } as const)
  : ({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    } as const);

/**
 * Join the parts of a composite control into one spoken sentence.
 *
 * A row that renders "Blood test / 20 Apr 2024 / Normal" as three `Text` nodes
 * is three stops in the screen-reader's rotor; as one label it is one stop that
 * says the whole thing. Empty and nullish parts drop out so a row with no
 * subtitle does not gain a dangling separator.
 */
export function a11yJoin(...parts: (string | number | null | undefined | false)[]): string {
  return parts
    .filter((p): p is string | number => p !== null && p !== undefined && p !== false && p !== '')
    .map((p) => String(p).trim())
    .filter(Boolean)
    .join(', ');
}
