/**
 * OPES EMR mobile design tokens.
 *
 * Every colour below was sampled directly from the reference renders in
 * `mobile app screens/` (modal pixel value over a solid region, background
 * pixels excluded for text/stroke colours). Source screen is noted per token.
 *
 * Do not add a colour here that you cannot point at in a reference PNG.
 */

/**
 * The `opes` palette — the original OPES EMR colours sampled from the
 * reference renders. This is one of two runtime-switchable palettes.
 */
export const opesPalette = {
  // ---------------------------------------------------------------------
  // Brand / primary
  // ---------------------------------------------------------------------
  /** Health Summary band, centre FAB, "Pay Now" CTA. CORE-006 #055BFD / BILL-001 #0153FD */
  blue: '#055BFD',
  /** Alias of `blue` for new code. */
  primary: '#055BFD',
  /** Deeper brand blue: CARE-001 hero panel + "Book New" button. #0441D0 */
  primaryDeep: '#0441D0',
  /** Light blue used for hover/secondary marks. CORE-006 quick-stat icon #3477FE */
  blueLight: '#3477FE',
  /** Soft blue fill: "Confirmed" pill, info banners, soft chips. CARE-001 #EAF0FE */
  primarySoft: '#EAF0FE',

  /** Dark navy hero card background (Profile & MED hero panels). #001665 */
  navy: '#001665',
  /** Slightly lifted navy for chips on navy. CORE-008 "Patient Since" chip #0F206B */
  navyLight: '#0F206B',

  /** Brand gradient (splash / login CTA) — retained from the auth screens. */
  gradientStart: '#001665',
  gradientEnd: '#055BFD',

  // ---------------------------------------------------------------------
  // Surfaces
  // ---------------------------------------------------------------------
  /**
   * The opaque page colour. Painted once, by the app-wide background layer
   * behind every screen (see `src/components/Watermark.tsx` +
   * `RootNavigator`), so the faded OPES seal can sit between it and the
   * screen content. References render an almost-white body (#FEFEFE).
   */
  page: '#FCFDFE',
  /**
   * Page background used by the screen root fills. TRANSPARENT on purpose:
   * every screen paints this as its `flex: 1` fill, and a transparent fill
   * lets the single app-wide background layer (opaque `page` colour + faded
   * watermark) show through, uniformly, without editing 87 screens. Cards,
   * sheets and dark canvases use their own opaque `surface`/`navy` fills, so
   * they still cover the seal — exactly as on the desktop app.
   */
  background: 'transparent',
  /** Card / sheet surface. */
  surface: '#FFFFFF',
  /** Muted fill: inactive segmented tab, info strip, input background. */
  surfaceMuted: '#EAF0FE',

  // ---------------------------------------------------------------------
  // Lines
  // ---------------------------------------------------------------------
  /** Card hairline border. CORE-006 card edge #EAEFF6 */
  border: '#E9EEF6',
  /** In-card row divider (lighter than the card border). #F2F5FA */
  divider: '#F2F5FA',
  /** Focused input border. */
  borderFocus: '#055BFD',

  // ---------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------
  /** Headings & row titles. CORE-006 "Jean Nshome" #00145A */
  textPrimary: '#0B1A5C',
  /** Body / row subtitle. CORE-006 "Lab Result" #6A7596 */
  textSecondary: '#6A7596',
  /** Metadata, inactive tab label. CORE-006 #939AB7 */
  textMuted: '#939AB7',
  /** Text on brand blue / navy surfaces. */
  textOnBrand: '#FFFFFF',
  /** Inline "View All" / "View Report" link. CORE-006 #0A50FB */
  link: '#0A50FB',

  // ---------------------------------------------------------------------
  // Semantic status
  // ---------------------------------------------------------------------
  /** "Normal", "Verified", "Completed", "Active", health-score ring. #0F9D48 */
  statusNormal: '#0F9D48',
  statusNormalBg: '#E5F5EC',

  /** Overdue due-date, critical result, notification badge. BILL-001 #FD0000 */
  statusCritical: '#E0242B',
  statusCriticalBg: '#FDE8E8',

  /** "Cancelled", refill warning, amber ring. CARE-001 #F98A00 */
  statusWarning: '#F98A00',
  statusWarningBg: '#FEEED0',

  /** "Upcoming", "Pending", informational. */
  statusPending: '#055BFD',
  statusPendingBg: '#EAF0FE',

  /** "Rescheduled", secondary/purple accent. CARE-001 #8942B4 */
  statusInfo: '#7B2FB0',
  statusInfoBg: '#EFDFF9',

  /** Red notification dot on the Messages tab. CARE-001 #F03336 */
  badge: '#F03336',

  // Back-compat aliases used by the existing auth/data screens.
  success: '#0F9D48',
  danger: '#E0242B',
  warning: '#F98A00',

  // ---------------------------------------------------------------------
  // Tint circles (the pastel icon chips on every list row)
  // Fill = `tintXBg`, icon stroke = `tintX`.
  // ---------------------------------------------------------------------
  /** Lab / medication / positive. CORE-006 chip #E7F5EB, stroke #00863A */
  tintGreen: '#0F9D48',
  tintGreenBg: '#E7F5EB',
  /** Imaging / appointments / documents. CORE-006 chip #ECF3FE, stroke #004FFC */
  tintBlue: '#055BFD',
  tintBlueBg: '#ECF3FE',
  /** Consultations / referrals / rescheduled. CORE-006 chip #F2ECFE, stroke #8942B4 */
  tintPurple: '#7B2FB0',
  tintPurpleBg: '#F2ECFE',
  /** Reminders / warnings / cancelled. CARE-001 chip #FEEED0, stroke #F98A00 */
  tintAmber: '#F98A00',
  tintAmberBg: '#FEEED0',
  /** Alerts / critical. */
  tintRed: '#E0242B',
  tintRedBg: '#FDE8E8',
} as const;

/** A palette is any object with exactly the `opes` palette's keys (string values). */
export type Palette = { [K in keyof typeof opesPalette]: string };

/**
 * The `opescare` palette — the warm OPESCARE brand. Same keys as `opes`,
 * different values. This is the DEFAULT brand.
 */
export const opescarePalette: Palette = {
  blue: '#0F4C81',
  primary: '#0F4C81',
  primaryDeep: '#0C3F6C',
  blueLight: '#3D77AC',
  primarySoft: '#EAF1F8',
  navy: '#0E1729',
  navyLight: '#28324A',
  gradientStart: '#0C3F6C',
  gradientEnd: '#3D77AC',
  page: '#FDF8F0',
  background: 'transparent',
  surface: '#FFFFFF',
  surfaceMuted: '#F7F0E3',
  border: '#EADFC8',
  divider: '#F2EADB',
  borderFocus: '#0F4C81',
  textPrimary: '#1A2338',
  textSecondary: '#5B6472',
  textMuted: '#93989F',
  textOnBrand: '#FFFFFF',
  link: '#0F4C81',
  statusNormal: '#1E8E5A',
  statusNormalBg: '#E4F5EC',
  statusCritical: '#D64545',
  statusCriticalBg: '#FCE8E8',
  statusWarning: '#B8860B',
  statusWarningBg: '#FBF3DF',
  statusPending: '#2F6FED',
  statusPendingBg: '#E9F0FE',
  statusInfo: '#5B6472',
  statusInfoBg: '#F1EEE7',
  badge: '#D64545',
  success: '#1E8E5A',
  danger: '#D64545',
  warning: '#B8860B',
  tintGreen: '#1E8E5A',
  tintGreenBg: '#E4F5EC',
  tintBlue: '#0F4C81',
  tintBlueBg: '#EAF1F8',
  tintPurple: '#2F6FED',
  tintPurpleBg: '#E9F0FE',
  tintAmber: '#B8860B',
  tintAmberBg: '#FBF3DF',
  tintRed: '#D64545',
  tintRedBg: '#FCE8E8',
};

/** The two runtime-switchable palettes. Default brand = `opescare`. */
export const palettes = { opescare: opescarePalette, opes: opesPalette } as const;
export type PaletteName = keyof typeof palettes;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  /** Tint circles use `pill`; this is for small inline marks. */
  sm: 8,
  /** Standard card / button radius seen across the references. */
  md: 14,
  /** Hero panels. */
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  fontFamily: {
    regular: 'Poppins_400Regular',
    medium: 'Poppins_500Medium',
    semiBold: 'Poppins_600SemiBold',
    bold: 'Poppins_700Bold',
  },
  size: {
    /** Badge / tab label / metadata. */
    xs: 12,
    /** Row subtitle, body. */
    sm: 14,
    /** Row title, section header. */
    md: 16,
    /** Card heading. */
    lg: 20,
    /** Screen title. */
    xl: 24,
    /** Hero numerals. */
    xxl: 30,
  },
  lineHeight: {
    xs: 16,
    sm: 20,
    md: 22,
    lg: 26,
    xl: 30,
    xxl: 36,
  },
} as const;

export const shadow = {
  /** References use hairline borders, not heavy shadows. Keep this subtle. */
  card: {
    shadowColor: '#0B1A5C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  button: {
    shadowColor: '#055BFD',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  /** Raised circular centre FAB in the tab bar. */
  fab: {
    shadowColor: '#055BFD',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 6,
  },
} as const;

/** Icon stroke weight measured off the reference renders. */
export const iconStroke = {
  /** Inline / small icons (16–18px). */
  thin: 1.6,
  /** Default for 20–24px icons. */
  regular: 1.8,
  /** Tab bar + hero icons. */
  bold: 2,
} as const;

export type StatusTone = 'normal' | 'critical' | 'warning' | 'pending' | 'info' | 'neutral';
export type Tint = 'green' | 'blue' | 'purple' | 'amber' | 'red';

/** Build the tint map from a given palette. */
export const makeTintMap = (c: Palette): Record<Tint, { bg: string; fg: string }> => ({
  green: { bg: c.tintGreenBg, fg: c.tintGreen },
  blue: { bg: c.tintBlueBg, fg: c.tintBlue },
  purple: { bg: c.tintPurpleBg, fg: c.tintPurple },
  amber: { bg: c.tintAmberBg, fg: c.tintAmber },
  red: { bg: c.tintRedBg, fg: c.tintRed },
});

/** Build the status map from a given palette. */
export const makeStatusMap = (c: Palette): Record<StatusTone, { bg: string; fg: string }> => ({
  normal: { bg: c.statusNormalBg, fg: c.statusNormal },
  critical: { bg: c.statusCriticalBg, fg: c.statusCritical },
  warning: { bg: c.statusWarningBg, fg: c.statusWarning },
  pending: { bg: c.statusPendingBg, fg: c.statusPending },
  info: { bg: c.statusInfoBg, fg: c.statusInfo },
  neutral: { bg: c.divider, fg: c.textSecondary },
});

// ---------------------------------------------------------------------
// Static back-compat exports. Default brand = opescare. Any non-hook code
// still resolves against these; runtime switching happens via useTheme().
// ---------------------------------------------------------------------
export const colors = palettes.opescare;
export const tintMap = makeTintMap(colors);
export const statusMap = makeStatusMap(colors);
