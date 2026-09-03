const { colors, radii } = require('./theme/tokens.js');

/**
 * ADDITIVE-ONLY. Every screen in `app/` is written against these utility names.
 *
 * Two rules that are easy to break by accident:
 *  1. Do not extend `fontSize` or `spacing` — Tailwind already defines those
 *     scales and our token scale disagrees with them (`typography.size.xl` is
 *     22, Tailwind's `text-xl` is 20). Extending would silently resize every
 *     screen. Use `typography.*` from tokens via inline `style` instead.
 *  2. `borderRadius` is fed from `radii`, whose keys shadow Tailwind's. It
 *     deliberately omits `2xl`/`3xl` so `rounded-2xl` (16) and `rounded-3xl`
 *     (24) keep their stock values.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        cream: colors.cream,
        gold: colors.brand,
        navy: colors.navy,
        success: colors.semantic.success,
        danger: colors.semantic.danger,
        warning: colors.semantic.warning,
        info: colors.semantic.info,
        // --- added. NOTE: deliberately no `neutral` key — that would replace
        // Tailwind's stock neutral-50…950 grey palette and break any screen
        // using `text-neutral-500`. The brand's neutral text is `navy-secondary`.
        'success-surface': colors.semantic.successSurface,
        'danger-surface': colors.semantic.dangerSurface,
        'warning-surface': colors.semantic.warningSurface,
        'info-surface': colors.semantic.infoSurface,
        'neutral-surface': colors.semantic.neutralSurface,
        /** `bg-surface-card`, `bg-surface-sunken`, `bg-surface-inverse`, … */
        surface: colors.surface,
        /** `border-line-default`, `border-line-brand`, … */
        line: colors.line,
      },
      borderRadius: radii,
    },
  },
  plugins: [],
};
