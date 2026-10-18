/**
 * The chrome the Find Facility and Find Provider screens share.
 *
 * Both reference designs are the same screen with a different subject: brand
 * bar, big title, search beside a boxed Filters button, a horizontally
 * scrolling row of counted category tiles, a results header with a sort
 * dropdown, a list of cards, and a closing help panel. Building that twice is
 * how the two screens drift apart, so it is built once here.
 *
 * ── What these pieces will not do ─────────────────────────────────────────
 * The reference cards carry a photograph, a star rating and a review count.
 * This platform has none of the three: `care_facilities` has no photo column,
 * and no rating or review exists anywhere in the schema. Rather than draw an
 * empty star row or a grey photo box on every card, the layout gives that
 * space to facts the register actually holds. A tile of stars that is always
 * the same would be worse than no stars — it would look like data.
 *
 * Colours come from the theme, so both brands and both themes resolve
 * themselves. Never a literal.
 */
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Icon,
  PulseLogo,
  Wordmark,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';

/* ── Top bar ──────────────────────────────────────────────────────────────
   Back chevron, centred brand lockup, action glyphs with an optional count
   badge. Lifted verbatim from the Blood Finder so the three finder screens
   share one bar rather than three that nearly agree. */

export type FinderAction = {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  /** Unread count. Omitted or 0 draws no badge — never a badge reading "0". */
  badge?: number;
};

export function FinderTopBar({
  onBack,
  backLabel,
  actions = [],
}: {
  onBack: () => void;
  backLabel: string;
  actions?: FinderAction[];
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.topBar}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={10}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        style={styles.topBarBack}
      >
        <Icon name="chevron-left" size={24} color={colors.textPrimary} />
      </TouchableOpacity>

      <View style={styles.topBarBrand}>
        <PulseLogo size={34} />
        <Wordmark size="md" showTagline />
      </View>

      <View style={styles.topBarActions}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.accessibilityLabel}
            onPress={action.onPress}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            style={styles.topBarAction}
          >
            <Icon name={action.icon} size={20} color={colors.textPrimary} />
            {action.badge ? (
              <View style={styles.topBarBadge}>
                <Text style={styles.topBarBadgeText}>
                  {action.badge > 9 ? '9+' : String(action.badge)}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/* ── Heading ───────────────────────────────────────────────────────────── */

/** The reference's oversized page title over a quiet one-line subtitle. */
export function FinderHeading({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.heading}>
      <Text style={styles.headingTitle}>{title}</Text>
      <Text style={styles.headingSub}>{subtitle}</Text>
    </View>
  );
}

/* ── Filters button ────────────────────────────────────────────────────── */

/**
 * The boxed button that sits to the RIGHT of the search field — a separate
 * control in both references, not a chip in the rail below.
 */
export function FiltersButton({
  label,
  count,
  open,
  onPress,
  accessibilityHint,
}: {
  label: string;
  /** Active filter count. 0 draws no pill. */
  count?: number;
  open: boolean;
  onPress: () => void;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      accessibilityHint={accessibilityHint}
      style={[styles.filterButton, open && styles.filterButtonOn]}
    >
      <Icon name="filter" size={18} color={colors.link} />
      <Text style={styles.filterText} numberOfLines={1}>
        {label}
      </Text>
      {count ? (
        <View style={styles.filterCount}>
          <Text style={styles.filterCountText}>{count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

/* ── Category tile ─────────────────────────────────────────────────────── */

/**
 * One tile of the category rail: a large outlined glyph, its label, and the
 * count beneath in brand blue.
 *
 * `count` is deliberately optional and deliberately NOT defaulted to 0. A
 * count is only drawn when the register actually reported one; a tile with no
 * reported figure shows no figure, because "0" would say there are none of
 * that kind, which is a different claim from "nobody has told us".
 */
export function CategoryTile({
  icon,
  label,
  count,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      style={[styles.tile, selected && styles.tileOn]}
    >
      <Icon name={icon} size={26} color={colors.blue} />
      <Text style={[styles.tileLabel, selected && styles.tileLabelOn]} numberOfLines={2}>
        {label}
      </Text>
      {count === undefined ? null : <Text style={styles.tileCount}>{formatCount(count)}</Text>}
    </TouchableOpacity>
  );
}

/** 2 728 rather than 2728 — the register's totals run to four digits. */
function formatCount(value: number): string {
  return value.toLocaleString();
}

/* ── Results header ────────────────────────────────────────────────────── */

/**
 * "156 Facilities Found" on the left, "Sort by: Distance ⌄" on the right.
 * The sort control is a real button; the caller owns the menu.
 */
export function ResultsHeader({
  title,
  sortLabel,
  onSortPress,
  sortOpen,
  sortAccessibilityLabel,
}: {
  title: string;
  sortLabel: string;
  onSortPress: () => void;
  sortOpen: boolean;
  sortAccessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.resultsHead}>
      <Text style={styles.resultsTitle} numberOfLines={2}>
        {title}
      </Text>
      <TouchableOpacity
        onPress={onSortPress}
        activeOpacity={0.7}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={sortAccessibilityLabel}
        accessibilityState={{ expanded: sortOpen }}
        style={styles.sortButton}
      >
        <Text style={styles.sortText} numberOfLines={1}>
          {sortLabel}
        </Text>
        <Icon name={sortOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

/* ── Result card shell ─────────────────────────────────────────────────── */

/**
 * The card both references draw: a leading mark, a flexible identity column,
 * and a trailing column. Separate cards with a gap between them — not a flush
 * divided list, which is what the app had and what made these screens read as
 * settings rather than results.
 */
export function ResultCard({
  mark,
  children,
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  mark: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={styles.card}
    >
      {mark}
      <View style={styles.cardBody}>{children}</View>
      {trailing ? <View style={styles.cardTrailing}>{trailing}</View> : null}
    </TouchableOpacity>
  );
}

/** A line of the identity column: small glyph, then text. */
export function CardMetaRow({
  icon,
  text,
  color,
}: {
  icon: IconName;
  text: string;
  color?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.metaRow}>
      <Icon name={icon} size={13} color={color ?? colors.textSecondary} />
      <Text style={[styles.metaText, !!color && { color }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** The small tinted status pill in the card's trailing column. */
export function CardPill({ label, tone }: { label: string; tone: 'normal' | 'muted' | 'warning' }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fg =
    tone === 'normal'
      ? colors.statusNormal
      : tone === 'warning'
        ? colors.statusWarning
        : colors.textSecondary;
  const bg =
    tone === 'normal'
      ? colors.statusNormalBg
      : tone === 'warning'
        ? colors.statusWarningBg
        : colors.surfaceMuted;

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ── Closing help panel ────────────────────────────────────────────────── */

/** The tinted "Can't find what you need?" panel that ends both references. */
export function HelpPanel({
  title,
  body,
  actionLabel,
  actionIcon = 'headset',
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  actionIcon?: IconName;
  onAction: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.help}>
      <View style={styles.helpMark}>
        <Icon name="info" size={20} color={colors.blue} />
      </View>
      <View style={styles.helpBody}>
        <Text style={styles.helpTitle}>{title}</Text>
        <Text style={styles.helpText}>{body}</Text>
      </View>
      <TouchableOpacity
        onPress={onAction}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        style={styles.helpButton}
      >
        <Icon name={actionIcon} size={16} color={colors.blue} />
        <Text style={styles.helpButtonText} numberOfLines={1}>
          {actionLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────── */

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    /* Top bar */
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    topBarBack: { width: 32, alignItems: 'flex-start' },
    topBarBrand: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    topBarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minWidth: 32 },
    topBarAction: { position: 'relative', padding: 2 },
    topBarBadge: {
      position: 'absolute',
      top: -4,
      right: -6,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.badge,
    },
    topBarBadgeText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      lineHeight: 14,
      color: c.textOnBrand,
    },

    /* Heading */
    heading: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: 2 },
    headingTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 30,
      lineHeight: 36,
      letterSpacing: -0.5,
      color: c.textPrimary,
    },
    headingSub: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
    },

    /* Filters button */
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 52,
      paddingHorizontal: spacing.sm + 2,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.primarySoft,
    },
    filterButtonOn: { borderColor: c.blue },
    filterText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.link,
    },
    filterCount: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.blue,
    },
    filterCountText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      lineHeight: 14,
      color: c.textOnBrand,
    },

    /* Category tile */
    tile: {
      width: 96,
      minHeight: 104,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 6,
      paddingVertical: spacing.sm,
    },
    tileOn: { borderColor: c.blue, backgroundColor: c.primarySoft },
    tileLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 12,
      lineHeight: 15,
      textAlign: 'center',
      color: c.textSecondary,
    },
    tileLabelOn: { color: c.textPrimary },
    tileCount: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      color: c.blue,
      fontVariant: ['tabular-nums'],
    },

    /* Results header */
    resultsHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    resultsTitle: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: c.textPrimary,
    },
    sortButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sortText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    /* Result card */
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.sm + 4,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    cardBody: { flex: 1, minWidth: 0, gap: 3 },
    // `stretch` + `space-between` puts the pill at the top of the column and
    // the primary action at the bottom, which is how both references stack
    // them. 104 is the widest this can be before "General Practitioner"
    // truncates in the identity column at 375pt.
    cardTrailing: {
      alignSelf: 'stretch',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 6,
      width: 96,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    metaText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    pill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radii.pill,
    },
    pillText: { fontFamily: typography.fontFamily.semiBold, fontSize: 11, lineHeight: 15 },

    /* Help panel */
    help: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: c.primarySoft,
    },
    helpMark: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    helpBody: { flex: 1, minWidth: 150, gap: 2 },
    helpTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
    },
    helpText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    helpButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.blue,
      backgroundColor: c.surface,
    },
    helpButtonText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.blue,
    },
  });
