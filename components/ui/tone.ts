import { colors } from '../../theme/tokens';

/**
 * The six semantic tones every UI primitive understands.
 *
 * Pick by *meaning*, never by colour:
 *  - `gold`    — brand / primary / the thing we want tapped
 *  - `neutral` — informational, no judgement (default)
 *  - `success` — completed, verified, active, in stock, paid
 *  - `warning` — needs attention, expiring, low stock, pending
 *  - `danger`  — failed, cancelled, overdue, destructive
 *  - `info`    — system notices, tips, "what to expect"
 */
export type Tone = 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'info';

export interface TonePalette {
  /** Icon / label colour on the soft surface. */
  fg: string;
  /** Tinted background for chips, icon tiles and callouts. */
  surface: string;
  /** Hairline border matching the surface. */
  border: string;
  /** Saturated fill for solid chips and status dots. */
  solid: string;
  /** Text colour that sits on `solid`. */
  onSolid: string;
}

const PALETTES: Record<Tone, TonePalette> = {
  neutral: {
    fg: colors.navy.secondary,
    surface: colors.semantic.neutralSurface,
    border: colors.line.default,
    solid: colors.navy.secondary,
    onSolid: colors.white,
  },
  gold: {
    fg: colors.brand[600],
    surface: colors.brand[50],
    border: colors.brand[100],
    solid: colors.brand[500],
    onSolid: colors.white,
  },
  success: {
    fg: colors.semantic.success,
    surface: colors.semantic.successSurface,
    border: '#BFE6D2',
    solid: colors.semantic.success,
    onSolid: colors.white,
  },
  warning: {
    fg: colors.semantic.warning,
    surface: colors.semantic.warningSurface,
    border: colors.brand[100],
    solid: colors.semantic.warning,
    onSolid: colors.white,
  },
  danger: {
    fg: colors.semantic.danger,
    surface: colors.semantic.dangerSurface,
    border: '#F5C9C9',
    solid: colors.semantic.danger,
    onSolid: colors.white,
  },
  info: {
    fg: colors.semantic.info,
    surface: colors.semantic.infoSurface,
    border: '#C8DAFB',
    solid: colors.semantic.info,
    onSolid: colors.white,
  },
};

/** Resolve a tone to its colour set. Unknown tones fall back to `neutral`. */
export function toneOf(tone: Tone = 'neutral'): TonePalette {
  return PALETTES[tone] ?? PALETTES.neutral;
}
