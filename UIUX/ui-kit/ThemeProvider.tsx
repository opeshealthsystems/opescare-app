/**
 * Runtime theme provider for the OPES UI kit.
 *
 * Colours are the only tokens that switch per palette. Spacing, radii,
 * typography, shadow and iconStroke stay static (import them from `./theme`).
 *
 * Because `StyleSheet.create({...colors...})` freezes colours at module load,
 * components must build colour-dependent styles at render from `useTheme()`.
 */
import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import {
  palettes,
  makeStatusMap,
  makeTintMap,
  type Palette,
  type PaletteName,
  type StatusTone,
  type Tint,
} from './theme';

export interface ThemeContextValue {
  palette: PaletteName;
  colors: Palette;
  statusMap: Record<StatusTone, { bg: string; fg: string }>;
  tintMap: Record<Tint, { bg: string; fg: string }>;
  setPalette: (p: PaletteName) => void;
  togglePalette: () => void;
}

const DEFAULT_PALETTE: PaletteName = 'opescare';

/** Build the full context value for a palette name. */
function buildValue(
  palette: PaletteName,
  setPalette: (p: PaletteName) => void,
  togglePalette: () => void,
): ThemeContextValue {
  const colors = palettes[palette];
  return {
    palette,
    colors,
    statusMap: makeStatusMap(colors),
    tintMap: makeTintMap(colors),
    setPalette,
    togglePalette,
  };
}

// Default context value (opescare) so components used WITHOUT a provider still
// render — switching just won't do anything until wrapped in <ThemeProvider>.
const noop = () => {};
const ThemeContext = createContext<ThemeContextValue>(
  buildValue(DEFAULT_PALETTE, noop, noop),
);

export interface ThemeProviderProps {
  initialPalette?: PaletteName;
  /** Called whenever the palette changes, so the app can persist it. */
  onPaletteChange?: (p: PaletteName) => void;
  children?: React.ReactNode;
}

export function ThemeProvider({
  initialPalette = DEFAULT_PALETTE,
  onPaletteChange,
  children,
}: ThemeProviderProps) {
  const [palette, setPaletteState] = useState<PaletteName>(initialPalette);

  const setPalette = useCallback(
    (p: PaletteName) => {
      setPaletteState((prev) => {
        if (p !== prev) onPaletteChange?.(p);
        return p;
      });
    },
    [onPaletteChange],
  );

  const togglePalette = useCallback(() => {
    setPaletteState((prev) => {
      const next: PaletteName = prev === 'opescare' ? 'opes' : 'opescare';
      onPaletteChange?.(next);
      return next;
    });
  }, [onPaletteChange]);

  const value = useMemo(
    () => buildValue(palette, setPalette, togglePalette),
    [palette, setPalette, togglePalette],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the active theme. Falls back to the opescare palette outside a provider. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme() must be used within a <ThemeProvider>.');
  }
  return ctx;
}
