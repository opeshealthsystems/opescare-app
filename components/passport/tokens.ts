/**
 * The passport's own palette, from the package's visual spec.
 *
 * These are the canonical document colours (primary #0F4C81 is the platform's
 * brand blue, so the passport sits inside the app's identity rather than
 * beside it). They are deliberately fixed rather than theme-derived: a secure
 * document looks the same to everyone who is handed it, and a clinician
 * comparing a phone against the printed passport must see the same blue.
 */
export const passportColors = {
  primary: '#0F4C81',
  primaryDark: '#0A355C',
  primaryLight: '#E8F2FA',
  teal: '#0F766E',
  tealLight: '#E6F7F5',
  background: '#F7FAFC',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#475569',
  border: '#E2E8F0',
  success: '#15803D',
  warning: '#B45309',
  danger: '#B91C1C',
  muted: '#94A3B8',
} as const;

export const passportSpace = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
export const passportRadius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
