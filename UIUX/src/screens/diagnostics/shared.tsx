/**
 * Shared plumbing for the DIA-* (diagnostics) slice.
 *
 * Composition only — every colour comes from `src/theme/theme`, every glyph
 * from `<Icon />`. Nothing here forks a foundation component.
 */
import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { type ResultFlag } from '../../api';
import { EmptyState, Icon, IconName, StaleNotice } from '../../components';
import { a11yJoin, decorative } from '../../components/a11y';
import { type TFunction, useTranslation } from '../../i18n';
import { patientErrorMessage } from '../../lib/errors';
import { formatDate, formatDateTime } from '../../utils/format';
import {
  colors,
  radii,
  spacing,
  statusMap,
  StatusTone,
  Tint,
  tintMap,
  typography,
} from '../../theme/theme';

// ── Async loading ─────────────────────────────────────────────────────────

/**
 * One implementation, not three. This file and `chat/shared.tsx` each carried a
 * byte-for-byte copy of the CARE hook; offline read and the focus-freshness
 * window had to live in all three or in none, so they live in one.
 */
import type { AsyncState } from '../care/shared';
export { useAsync, FOCUS_FRESH_MS } from '../care/shared';
export type { AsyncState, AsyncOptions } from '../care/shared';

/** Patient-readable failure text — never a raw library string. */
export function errorMessage(e: unknown, fallback?: string): string {
  return patientErrorMessage(e, fallback);
}

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.centre} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.blue} {...decorative} />
      <Text style={styles.centreText}>{label ?? t('diagnostics.async.loading')}</Text>
    </View>
  );
}

/** Loading / not-linked / error / empty, else the children. */
export function AsyncBoundary<T>({
  state,
  onLink,
  isEmpty,
  empty,
  loadingLabel,
  children,
}: {
  state: AsyncState<T>;
  onLink: () => void;
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  loadingLabel?: string;
  children: (data: T) => React.ReactNode;
}) {
  const { t } = useTranslation();
  if (state.loading && state.data === null) return <LoadingBlock label={loadingLabel} />;
  if (state.notLinked) {
    return (
      <EmptyState
        icon="id-card"
        tint="amber"
        title={t('diagnostics.async.linkTitle')}
        message={t('diagnostics.async.linkBody')}
        actionLabel={t('diagnostics.async.linkCta')}
        onAction={onLink}
      />
    );
  }
  if (state.error && state.data === null) {
    return (
      <EmptyState
        icon="alert-circle"
        tint="red"
        title={t('diagnostics.async.errorTitle')}
        message={state.error}
        actionLabel={t('diagnostics.async.errorCta')}
        onAction={state.reload}
      />
    );
  }
  if (state.data === null) return <LoadingBlock label={loadingLabel} />;
  const body = isEmpty?.(state.data) && empty ? empty : children(state.data);
  if (state.stale) {
    return (
      <>
        <StaleNotice
          message={state.error ?? ''}
          loadedAt={state.loadedAt}
          onRetry={state.reload}
          retrying={state.loading}
        />
        {body}
      </>
    );
  }
  return <>{body}</>;
}

// ── Formatting ────────────────────────────────────────────────────────────

/**
 * "07 Jun 2024" / "07 juin 2024". Dates are never catalogue strings (contract
 * rule 8) — `utils/format` is the one implementation and it reads the locale.
 */
export function fmtDate(iso?: string | null): string {
  return formatDate(iso, '—');
}

/** "07 Jun 2024, 11:45 AM" / « 07 juin 2024 11:45 » */
export function fmtDateTime(iso?: string | null): string {
  return formatDateTime(iso, '—');
}

/** Two-line axis label: `["07 Jun", "2024"]` / `["07 juin", "2024"]`. */
export function fmtAxisDate(iso?: string | null): [string, string] {
  const full = formatDate(iso, '');
  if (!full) return ['—', ''];
  const cut = full.lastIndexOf(' ');
  return cut === -1 ? [full, ''] : [full.slice(0, cut), full.slice(cut + 1)];
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Flags ─────────────────────────────────────────────────────────────────

/**
 * Reference-range flag → design-spec tone.
 * DIA-002 renders Normal green, Low amber, High red; critical is the deeper red.
 */
export function toneForFlag(flag: ResultFlag | 'abnormal' | string): StatusTone {
  switch (flag) {
    case 'normal':
      return 'normal';
    case 'low':
      return 'warning';
    case 'high':
    case 'abnormal':
    case 'critical':
      return 'critical';
    // An ordered-but-unresulted panel. Not a result at all, so never the
    // alarming critical tone — a calm, neutral "awaiting" grey.
    case 'pending':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function colorForFlag(flag: ResultFlag | string): string {
  return statusMap[toneForFlag(flag)].fg;
}

export function tintForFlag(flag: ResultFlag | string): Tint {
  switch (flag) {
    case 'normal':
      return 'green';
    case 'low':
      return 'amber';
    // "Awaiting results" is not an abnormal result — never the red default.
    // No neutral/grey chip exists in the palette, so the calm amber stands in.
    case 'pending':
      return 'amber';
    default:
      return 'red';
  }
}

export function iconForFlag(flag: ResultFlag | string): IconName {
  switch (flag) {
    case 'normal':
      return 'check-circle';
    case 'low':
      return 'alert-triangle';
    case 'critical':
      return 'alert-circle';
    default:
      return 'arrow-right';
  }
}

/** Literal keys, not a lookup table, so `npm run i18n:check` can see them. */
export function flagLabel(flag: ResultFlag | string, t: TFunction): string {
  switch (flag) {
    case 'normal':
      return t('diagnostics.flag.normal');
    case 'low':
      return t('diagnostics.flag.low');
    case 'high':
      return t('diagnostics.flag.high');
    case 'abnormal':
      return t('diagnostics.flag.abnormal');
    case 'critical':
      return t('diagnostics.flag.critical');
    case 'pending':
      return t('diagnostics.flag.pending');
    default:
      return titleCase(flag);
  }
}

/**
 * The flag as a screen reader must hear it.
 *
 * `flagLabel` returns the one-word chip ("Low"), which on its own says nothing
 * about which side of the range the value sits on — sighted patients get that
 * from colour and column position. This spells it out. `critical` keeps the
 * same instruction the visible banner gives.
 */
export function flagSpoken(flag: ResultFlag | string, t: TFunction): string {
  switch (flag) {
    case 'normal':
      return t('diagnostics.a11y.statusNormal');
    case 'low':
      return t('diagnostics.a11y.statusLow');
    case 'high':
      return t('diagnostics.a11y.statusHigh');
    case 'abnormal':
      return t('diagnostics.a11y.statusAbnormal');
    case 'critical':
      return t('diagnostics.a11y.statusCritical');
    default:
      return t('diagnostics.a11y.statusUnflagged');
  }
}

/**
 * The reference range as a screen reader must hear it. Where the laboratory
 * sent no bounds this speaks the same words the screen prints — "Not provided"
 * / « Non communiquées » — and never lets the absence pass as normal.
 */
export function rangeSpoken(
  low: number | null | undefined,
  high: number | null | undefined,
  fallback: string | null | undefined,
  t: TFunction
): string {
  const printed = referenceRange(low, high, fallback);
  const noRange = t('diagnostics.report.noRange');
  if (printed === '—' || printed === noRange) {
    return t('diagnostics.a11y.rangeNone', { noRange });
  }
  return t('diagnostics.a11y.rangeUsual', { range: printed });
}

/** One results-table row spoken as a single sentence: value, range, flag. */
export function resultRowSpoken(
  r: {
    analyte: string;
    value: string;
    unit?: string | null;
    flag: ResultFlag | string;
    ref_low?: number | null;
    ref_high?: number | null;
    reference?: string | null;
  },
  t: TFunction
): string {
  return t('diagnostics.a11y.resultRow', {
    analyte: r.analyte,
    value: r.unit ? `${r.value} ${r.unit}` : r.value,
    range: rangeSpoken(r.ref_low, r.ref_high, r.reference, t),
    status: flagSpoken(r.flag, t),
  });
}

/** "12.0 – 16.0" from the numeric bounds, falling back to the free-text reference. */
export function referenceRange(
  low: number | null | undefined,
  high: number | null | undefined,
  fallback?: string | null
): string {
  if (low != null && high != null) return `${trimNum(low)} – ${trimNum(high)}`;
  if (high != null) return `≤ ${trimNum(high)}`;
  if (low != null) return `≥ ${trimNum(low)}`;
  return fallback ?? '—';
}

export function trimNum(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

// ── Buttons ───────────────────────────────────────────────────────────────

export type DiagButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconName;
  iconRight?: IconName;
  size?: 'md' | 'sm';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Spoken name, where the visible label alone is ambiguous out of context. */
  a11yLabel?: string;
  /** Only where the outcome of pressing is not obvious from the label. */
  a11yHint?: string;
};

const buttonFill: Record<NonNullable<DiagButtonProps['variant']>, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.blue, fg: colors.textOnBrand, border: colors.blue },
  secondary: { bg: colors.surface, fg: colors.link, border: colors.border },
  ghost: { bg: colors.primarySoft, fg: colors.link, border: colors.primarySoft },
};

/** Flat, 1px-bordered button matching the DIA references. */
export function DiagButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  size = 'md',
  disabled,
  style,
  a11yLabel,
  a11yHint,
}: DiagButtonProps) {
  const skin = buttonFill[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityHint={a11yHint}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: skin.bg, borderColor: skin.border },
        disabled && styles.buttonOff,
        style,
      ]}
    >
      {!!icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} color={skin.fg} />}
      <Text style={[styles.buttonText, size === 'sm' && styles.buttonTextSm, { color: skin.fg }]}>{label}</Text>
      {!!iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} color={skin.fg} />}
    </TouchableOpacity>
  );
}

// ── Hero band ─────────────────────────────────────────────────────────────

/** The soft-blue title band at the top of every DIA screen. */
export function HeroBand({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroBody}>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSubtitle}>{subtitle}</Text>
      </View>
      {/* Decorative only — the title and subtitle already carry the meaning. */}
      <View style={styles.heroArt} {...decorative}>
        <Icon name={icon} size={44} color={colors.blue} strokeWidth={1.8} />
      </View>
    </View>
  );
}

// ── Overline ──────────────────────────────────────────────────────────────

/** The 13px uppercase blue label above each DIA card section. */
export function Overline({ label, style }: { label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text style={styles.overline}>{label}</Text>
    </View>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────

export type TableColumn = { key: string; label: string; flex: number; align?: 'left' | 'right' };

export function TableHead({ columns }: { columns: TableColumn[] }) {
  return (
    <View style={styles.tableHead}>
      {columns.map((c) => (
        <Text
          key={c.key}
          style={[styles.tableHeadCell, { flex: c.flex }, c.align === 'right' && styles.alignRight]}
          numberOfLines={1}
        >
          {c.label}
        </Text>
      ))}
    </View>
  );
}

export function TableRow({
  columns,
  cells,
  onPress,
  last,
  a11yLabel,
  a11yHint,
}: {
  columns: TableColumn[];
  cells: {
    text?: string;
    color?: string;
    bold?: boolean;
    node?: React.ReactNode;
    /**
     * Clinical numbers — a result value or a reference range — must never be
     * hidden behind an ellipsis. Cells that carry them set this so the text
     * wraps down the row instead of truncating mid-number.
     */
    wrap?: boolean;
  }[];
  onPress?: () => void;
  last?: boolean;
  /**
   * The whole row as one sentence. Cell-by-cell reading loses the column
   * headings, and on a results table that means losing which number is the
   * result and which is the range — so clinical tables always pass this.
   */
  a11yLabel?: string;
  a11yHint?: string;
}) {
  const body = (
    <View
      style={[styles.tableRow, !last && styles.tableRowDivider]}
      accessible={!!a11yLabel && !onPress}
      accessibilityLabel={onPress ? undefined : a11yLabel}
    >
      {columns.map((c, i) => {
        const cell = cells[i];
        return (
          <View key={c.key} style={[{ flex: c.flex }, c.align === 'right' && styles.cellRight]}>
            {cell?.node ?? (
              <Text
                style={[
                  styles.tableCell,
                  cell?.bold && styles.tableCellBold,
                  !!cell?.color && { color: cell.color },
                ]}
                numberOfLines={cell?.wrap ? undefined : 1}
              >
                {cell?.text ?? '—'}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={a11yHint}
      >
        {body}
      </TouchableOpacity>
    );
  }
  return body;
}

// ── Stat tiles ────────────────────────────────────────────────────────────

export type StatTile = {
  key: string;
  label: string;
  value: number | string;
  icon: IconName;
  tint: Tint;
  onPress?: () => void;
  /**
   * The critical counter. Merely-high is a red icon on a white tile; a critical
   * count is the whole tile filled and bordered in the deep critical red, so a
   * patient can never mistake one for the other.
   */
  critical?: boolean;
};

/**
 * The bordered counter grid (DIA-002 "Result Summary").
 *
 * Four tiles sit on one row; pass `wrap` when a fifth (the Critical counter)
 * is present so the row breaks tidily instead of squeezing every label.
 */
export function StatGrid({ tiles, wrap }: { tiles: StatTile[]; wrap?: boolean }) {
  return (
    <View style={[styles.statGrid, wrap && styles.statGridWrap]}>
      {tiles.map((t) => {
        const skin = tintMap[t.tint];
        const tileStyle = [
          styles.statTile,
          wrap && styles.statTileWrap,
          t.critical && styles.statTileCritical,
        ];
        const inner = (
          <>
            <View style={[styles.statCircle, { backgroundColor: skin.bg }]}>
              <Icon name={t.icon} size={20} color={skin.fg} />
            </View>
            <Text style={styles.statLabel} numberOfLines={1}>
              {t.label}
            </Text>
            <Text style={[styles.statValue, { color: skin.fg }]}>{t.value}</Text>
          </>
        );
        // "Abnormal, 3" — the count is meaningless without its label.
        const name = a11yJoin(t.label, t.value);
        return t.onPress ? (
          <TouchableOpacity
            key={t.key}
            onPress={t.onPress}
            activeOpacity={0.8}
            style={tileStyle}
            accessibilityRole="button"
            accessibilityLabel={name}
          >
            {inner}
          </TouchableOpacity>
        ) : (
          <View key={t.key} style={tileStyle} accessible accessibilityLabel={name}>
            {inner}
          </View>
        );
      })}
    </View>
  );
}

// ── Action grid ───────────────────────────────────────────────────────────

export type QuickActionTile = {
  key: string;
  icon: IconName;
  lines: [string, string];
  onPress: () => void;
  /** Only where "Send to / Care Team" style wrapping reads oddly aloud. */
  a11yLabel?: string;
  a11yHint?: string;
};

/** The four bordered action tiles at the foot of DIA-002 / DIA-003. */
export function ActionGrid({ actions }: { actions: QuickActionTile[] }) {
  return (
    <View style={styles.actionGrid}>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.key}
          onPress={a.onPress}
          activeOpacity={0.8}
          style={styles.actionTile}
          accessibilityRole="button"
          // The label is split across two lines purely for layout; spoken, it
          // is one phrase.
          accessibilityLabel={a.a11yLabel ?? `${a.lines[0]} ${a.lines[1]}`.trim()}
          accessibilityHint={a.a11yHint}
        >
          <Icon name={a.icon} size={24} color={colors.blue} />
          <Text style={styles.actionLine}>{a.lines[0]}</Text>
          <Text style={styles.actionLine}>{a.lines[1]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Info strip ────────────────────────────────────────────────────────────

export function InfoStrip({
  icon = 'info',
  tone = 'pending',
  live,
  a11yLabel,
  children,
}: {
  icon?: IconName;
  tone?: StatusTone;
  /**
   * Result banners appear when the fetch resolves, without the patient doing
   * anything. `assertive` is reserved for the critical banner, which asks the
   * patient to contact their care team now.
   */
  live?: 'polite' | 'assertive';
  a11yLabel?: string;
  children: React.ReactNode;
}) {
  const skin = statusMap[tone];
  return (
    <View
      style={[styles.strip, { backgroundColor: skin.bg }]}
      accessibilityLiveRegion={live}
      accessible={!!a11yLabel}
      accessibilityLabel={a11yLabel}
    >
      <Icon name={icon} size={20} color={skin.fg} />
      <View style={styles.stripBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  centreText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
  },
  buttonSm: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: radii.sm + 2 },
  buttonOff: { opacity: 0.5 },
  buttonText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md },
  buttonTextSm: { fontSize: typography.size.sm },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  heroBody: { flex: 1, minWidth: 0 },
  heroTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    lineHeight: typography.lineHeight.xl,
    color: colors.textPrimary,
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },
  heroArt: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },

  overline: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.link,
  },

  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  tableHeadCell: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  tableRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  tableCell: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  tableCellBold: {
    fontFamily: typography.fontFamily.semiBold,
    color: colors.textPrimary,
  },
  alignRight: { textAlign: 'right' },
  cellRight: { alignItems: 'flex-end' },

  statGrid: { flexDirection: 'row', gap: spacing.sm },
  statGridWrap: { flexWrap: 'wrap' },
  statTile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  // A fifth tile fits only by wrapping; ~30% basis breaks the row 3-then-rest
  // instead of shrinking every label to an ellipsis.
  statTileWrap: { flexBasis: '30%' },
  // The critical counter, filled and bordered in the deep critical red so it
  // reads as its own category, never as a louder shade of "High".
  statTileCritical: {
    backgroundColor: colors.statusCriticalBg,
    borderColor: colors.statusCritical,
  },
  statCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  statValue: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.lg },

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionTile: {
    flexGrow: 1,
    flexBasis: '22%',
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionLine: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  strip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    borderRadius: radii.md,
    padding: spacing.md - 4,
  },
  stripBody: { flex: 1, minWidth: 0 },
});
