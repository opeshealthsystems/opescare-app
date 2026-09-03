import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors, gradients } from '../../theme/tokens';

export type ScreenBackground = 'cream' | 'flat' | 'white' | 'inverse';

interface ScreenProps extends ViewProps {
  className?: string;
  /**
   * Added, optional.
   * `cream` (default) — the warm page wash: cream-50 at the top settling into
   *   cream-100. Every reference screen has this vertical warmth; a single flat
   *   fill is what made the app read as a wireframe.
   * `flat`    — solid cream-100, no gradient (use behind a full-bleed image).
   * `white`   — plain white, for document/receipt-style screens.
   * `inverse` — deep navy, for the Health ID / QR presentation screens.
   */
  background?: ScreenBackground;
  /** Added, optional. Safe-area edges. Drop `bottom` when the screen ends in a
   *  sticky action bar that should sit flush with the home indicator. */
  edges?: readonly Edge[];
}

/**
 * Matches any utility that sets horizontal padding: `p-*`, `px-*`, `pl-*`,
 * `pr-*`, `ps-*`, `pe-*`, including arbitrary values (`px-[18px]`) and
 * variants (`sm:px-8`). Deliberately does NOT match `py-*` or `pt/pb-*`.
 */
const HORIZONTAL_PADDING_UTILITY = /(?:^|\s)(?:[a-z-]+:)*(?:p|px|pl|pr|ps|pe)-(?:\d|\[|px\b)/;

/**
 * Does the caller's className already set horizontal padding? Exported for the
 * unit check in `components/ui/__tests__` and for anyone auditing call sites.
 */
export function overridesHorizontalPadding(className?: string): boolean {
  return !!className && HORIZONTAL_PADDING_UTILITY.test(className);
}

/** Base screen wrapper: cream background + safe-area padding, used by every screen.
 *
 * Horizontal padding is `px-6` (24) by default. Pass any horizontal padding
 * utility — `px-0`, `px-8`, `p-4` — and it REPLACES the default rather than
 * fighting it.
 *
 * Why this is not just string concatenation: NativeWind v4 resolves conflicting
 * utilities by stylesheet order, not by their order in the class string, and
 * Tailwind emits `px-0` before `px-6`. So `` `px-6 ${className}` `` with
 * `className="px-0"` produced 24px, not 0 — every `<Screen className="px-0">`
 * screen was double-padded (24 from Screen + 24 from its own ScrollView),
 * measured at 48px of a 375px viewport and truncating the Health ID string.
 * The default is therefore *omitted* when the caller supplies its own, so the
 * two utilities never coexist and there is nothing to resolve.
 *
 * @example Screen pads itself
 * <Screen>
 *   <ScrollView className="flex-1">…</ScrollView>   {/* 24px, from Screen *\/}
 * </Screen>
 *
 * @example ScrollView pads itself (full-bleed scroll)
 * <Screen className="px-0">
 *   <ScrollView contentContainerStyle={{ paddingHorizontal: 24 }}>…</ScrollView>
 * </Screen>
 */
export function Screen({
  children,
  className,
  background = 'cream',
  edges = ['top', 'bottom'],
  ...props
}: ScreenProps) {
  const solid =
    background === 'white'
      ? colors.white
      : background === 'inverse'
        ? colors.surface.inverse
        : colors.surface.app;

  const defaultPadding = overridesHorizontalPadding(className) ? '' : 'px-6';
  const innerClassName = ['flex-1', defaultPadding, className ?? ''].filter(Boolean).join(' ');

  const inner = (
    <View className={innerClassName} {...props}>
      {children}
    </View>
  );

  return (
    // The wash sits BEHIND the safe-area padding, not inside it — otherwise the
    // status-bar strip keeps the solid fill and leaves a visible seam.
    <View style={{ flex: 1, backgroundColor: solid }}>
      {background === 'cream' ? (
        // `className` is a no-op on LinearGradient (no cssInterop registered) —
        // inline style only.
        <LinearGradient
          colors={gradients.page}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <SafeAreaView className="flex-1" edges={edges}>
        {inner}
      </SafeAreaView>
    </View>
  );
}
