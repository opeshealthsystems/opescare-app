/**
 * OPES UI Kit — the portable presentation layer of the OPES apps.
 *
 * Design tokens + a themed React Native component library, extracted so a
 * sibling app can share the same look and building blocks. Zero product/domain
 * coupling: everything here depends only on React Native, react-native-svg,
 * expo-linear-gradient, and the kit's own `theme` and `i18n` modules.
 *
 * Re-skin by editing `theme.ts` (one token file). Localise by editing or
 * replacing `i18n.ts`. See README.md.
 */

// Design system
export * from './theme';

// Runtime theming (ThemeProvider + useTheme)
export * from './ThemeProvider';

// i18n shim (swap for your own app's i18n if you have one)
export * from './i18n';

// Formatting helpers (labels, dates, numbers — locale-aware via the shim)
export * from './format';

// Components — pure presentation, theme-driven
export * from './components/a11y';
export * from './components/Icon';
export * from './components/Card';
export * from './components/Chip';
export * from './components/EmptyState';
export * from './components/GradientButton';
export * from './components/ListRow';
export * from './components/PulseLogo';
export * from './components/StepProgress';
export * from './components/StatusBadge';
export * from './components/Watermark';
export * from './components/Wordmark';
export * from './components/Dialog';
export * from './components/PillInput';
export * from './components/ScreenHeader';
export * from './components/SectionHeader';
export * from './components/StaleNotice';
