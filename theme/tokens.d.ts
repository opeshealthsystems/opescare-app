/**
 * Types for `theme/tokens.js`. Additive-only, like the tokens themselves —
 * every key here is referenced by screens, so never rename or remove one.
 */

/** A React Native shadow style, portable across iOS (shadow*) and Android (elevation). */
export interface ElevationStyle {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

export const colors: {
  cream: { 50: string; 100: string; 200: string; 300: string; 400: string; 500: string };
  brand: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
  navy: { text: string; secondary: string; muted: string; deep: string; soft: string };
  white: string;
  black: string;
  semantic: {
    success: string;
    successSurface: string;
    danger: string;
    dangerSurface: string;
    warning: string;
    warningSurface: string;
    info: string;
    infoSurface: string;
    neutral: string;
    neutralSurface: string;
  };
  surface: {
    app: string;
    appTint: string;
    card: string;
    cardMuted: string;
    sunken: string;
    brand: string;
    brandSoft: string;
    inverse: string;
    overlay: string;
    scrim: string;
  };
  line: { subtle: string; default: string; strong: string; brand: string; inverse: string };
};

export const spacing: Record<
  'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl',
  number
>;

export const radii: Record<
  'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'card' | 'tile' | 'pill' | 'full',
  number
>;

export const typography: {
  fontFamily: { heading: string; body: string };
  size: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl', number>;
  lineHeight: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl', number>;
  weight: {
    regular: '400';
    medium: '500';
    semibold: '600';
    bold: '700';
    extrabold: '800';
  };
  tracking: Record<'tight' | 'normal' | 'wide' | 'overline', number>;
};

export const elevation: Record<'none' | 'sm' | 'md' | 'lg' | 'brand' | 'navy', ElevationStyle>;

export const gradients: {
  brand: readonly [string, string, string];
  brandSoft: readonly [string, string];
  navy: readonly [string, string];
  page: readonly [string, string];
  shimmer: readonly [string, string, string];
};

export const sizing: {
  control: Record<'sm' | 'md' | 'lg', number>;
  icon: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number>;
  tile: Record<'sm' | 'md' | 'lg', number>;
  avatar: Record<'sm' | 'md' | 'lg' | 'xl', number>;
  hairline: number;
};
