/**
 * OpesCare design tokens — blue/cream brand.
 * Plain CommonJS so tailwind.config.js (loaded directly by Node, no TS loader)
 * and the app's TypeScript code can both import the same source of truth.
 *
 * Cream values sampled programmatically from the reference screens in
 * `Mobile app screens/` via tools/screens-triage/extract_accents.py (HSV hue
 * clustering across onboarding, login, and dashboard references). Text/semantic
 * values are visual-read approximations, refined per-screen by the pixel-diff
 * tool as each screen is built — see docs/superpowers/specs/2026-08-31-mobile-expo-app-design.md.
 *
 * ------------------------------------------------------------------------
 * ADDITIVE-ONLY CONTRACT
 * ------------------------------------------------------------------------
 * Screens reference these tokens by name and `tailwind.config.js` turns several
 * of them into utility classes. **Never rename or remove a key.** New keys are
 * fine; changing the value of an existing key silently re-skins every screen.
 *
 * In particular `radii` is spread into Tailwind's `borderRadius`, so its keys
 * shadow Tailwind's own scale. `2xl` / `3xl` are deliberately NOT defined here
 * so `rounded-2xl` (16) and `rounded-3xl` (24) keep their stock Tailwind values;
 * the brand-specific radii are exposed under non-colliding names (`card`,
 * `pill`, `xs`).
 */

const colors = {
  cream: {
    50: '#FFFDF9',
    100: '#FDF8F0', // primary app background — sampled, ~30-70% of every reference screen
    200: '#F7F0E3', // card / elevated surface on cream
    300: '#EADFC8', // borders, dividers
    // --- added (derived from the reference card/divider ramp) ---
    400: '#DCCDAE', // stronger divider / disabled control fill
    500: '#C4B18B', // muted icon on cream, chart gridlines
  },
  brand: {
    50: '#EAF1F8',
    100: '#CDDEEE',
    200: '#A3C2DF',
    300: '#6E9CC8',
    400: '#3D77AC', // gradient mid-stop / hover
    500: '#0F4C81', // primary brand — CLAUDE.md
    600: '#0C3F6C', // gradient-dark / pressed state
    700: '#0A3357',
    800: '#082944',
    900: '#061E33',
  },
  navy: {
    text: '#1A2338', // headline / primary text
    secondary: '#5B6472', // body / secondary text
    muted: '#93989F', // placeholder / disabled text
    // --- added: the deep navy used for the Health ID / inverse cards in the
    // references ("OpesCare Health ID" dark card, "Go to Dashboard" CTA) ---
    deep: '#0E1729',
    soft: '#28324A',
  },
  white: '#FFFFFF',
  black: '#000000',
  semantic: {
    success: '#1E8E5A',
    successSurface: '#E4F5EC',
    danger: '#D64545',
    dangerSurface: '#FCE8E8',
    warning: '#B8860B',
    warningSurface: '#FBF3DF',
    info: '#2F6FED',
    infoSurface: '#E9F0FE',
    // --- added: grey "Closed" / "Cancelled" / "Draft" chip treatment seen on
    // the appointment-list and pharmacy references ---
    neutral: '#5B6472',
    neutralSurface: '#F1EEE7',
  },

  /**
   * Semantic surfaces — say what a surface *is*, not what colour it happens to
   * be. Prefer these over raw `cream.*` when painting a background.
   */
  surface: {
    app: '#FDF8F0', // page background (= cream.100)
    appTint: '#FFFDF9', // top of the page wash (= cream.50)
    card: '#FFFFFF', // default card
    cardMuted: '#FDFBF6', // card on white, or a second-level card
    sunken: '#F7F0E3', // inset wells, search fields, table headers (= cream.200)
    brand: '#0F4C81', // filled brand surface (= brand.500)
    brandSoft: '#EAF1F8', // tinted surface for icon tiles (= brand.50)
    inverse: '#0E1729', // dark Health-ID card (= navy.deep)
    overlay: 'rgba(14, 23, 41, 0.45)', // modal scrim
    scrim: 'rgba(14, 23, 41, 0.08)', // pressed-state wash over a light surface
  },

  /** Hairlines. The references use a 1px warm line, never a grey one. */
  line: {
    subtle: '#F2EADB',
    default: '#EADFC8', // (= cream.300)
    strong: '#DCCDAE', // (= cream.400)
    brand: '#6E9CC8', // (= brand.300) — focus rings, selected chips
    inverse: 'rgba(255, 255, 255, 0.16)',
  },
};

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  // --- added: hero / empty-state vertical rhythm ---
  '5xl': 48,
  '6xl': 64,
};

/**
 * Spread into Tailwind's `borderRadius`. Only names that do NOT exist in
 * Tailwind's stock scale, or that we intentionally re-map, belong here.
 */
const radii = {
  xs: 6, // new — tiny chips, count pills
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  card: 20, // new — the canonical card radius across every reference
  tile: 14, // new — square icon tile behind a list-row / stat icon
  pill: 999, // new — chips, badges, avatars
  full: 999,
};

/**
 * React Native shadow objects. `shadowColor` is a warm brown-black rather than
 * pure black — on cream, a neutral shadow reads dirty; the references cast a
 * warm one. Spread these into a `style` prop:
 *   <View style={[{ backgroundColor: colors.surface.card }, elevation.md]} />
 */
const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  /** Hairline lift — chips, inline pills, sticky headers. */
  sm: {
    shadowColor: colors.brand[900],
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  /** The default card shadow. Soft, wide, barely there. */
  md: {
    shadowColor: colors.brand[900],
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  /** Floating surfaces — bottom tab bar, sheets, the Health ID card. */
  lg: {
    shadowColor: colors.brand[900],
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  /** Coloured glow under a brand CTA. */
  brand: {
    shadowColor: colors.brand[600],
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  /** Coloured glow under a navy/inverse CTA or card. */
  navy: {
    shadowColor: colors.navy.deep,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

/** Canonical gradient stops. Pass straight to `LinearGradient.colors`. */
const gradients = {
  brand: [colors.brand[600], colors.brand[500], colors.brand[300]],
  brandSoft: [colors.brand[100], colors.brand[50]],
  navy: [colors.navy.deep, colors.navy.soft],
  /** The warm page wash — light at the top, settling into the app cream. */
  page: [colors.cream[50], colors.cream[100]],
  /** Skeleton shimmer sweep. */
  shimmer: [colors.cream[200], colors.cream[100], colors.cream[200]],
};

const typography = {
  fontFamily: { heading: 'System', body: 'System' },
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    '2xl': 28,
    '3xl': 34,
    // --- added ---
    '4xl': 40,
  },
  /**
   * Line heights paired with `size`. RN does not derive these, and unset
   * line-height is the single biggest source of cramped-looking screens.
   */
  lineHeight: {
    xs: 16,
    sm: 20,
    md: 22,
    lg: 24,
    xl: 28,
    '2xl': 34,
    '3xl': 40,
    '4xl': 46,
  },
  /** RN `fontWeight` values, named so screens stop guessing. */
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  /** RN `letterSpacing` is in px, not em. */
  tracking: {
    tight: -0.4, // large display headings
    normal: 0,
    wide: 0.3,
    overline: 1.1, // uppercase section labels
  },
};

/** Fixed control heights — keeps buttons, inputs and chips on one rhythm. */
const sizing = {
  control: { sm: 36, md: 44, lg: 56 },
  icon: { xs: 14, sm: 16, md: 18, lg: 20, xl: 24 },
  /** Rounded-square tile behind a list-row or stat icon. */
  tile: { sm: 36, md: 44, lg: 52 },
  avatar: { sm: 32, md: 44, lg: 64, xl: 96 },
  hairline: 1,
};

module.exports = {
  colors,
  spacing,
  radii,
  typography,
  elevation,
  gradients,
  sizing,
};
