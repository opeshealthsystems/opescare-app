/**
 * Shared plumbing for the MED slice (MED-001 / MED-003 / MED-005).
 *
 * Composition only — every colour comes from `src/theme/theme` and every glyph
 * from `<Icon />`. Async/loading primitives are reused from the CARE slice so
 * the two slices behave identically.
 */
import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Icon, IconName, StatusBadge } from '../../components';
import { a11yJoin, decorative } from '../../components/a11y';
import { colors, radii, spacing, typography, Tint, tintMap } from '../../theme/theme';
import type { DoseStatus, MedicationDose, PortalPrescription, TimeOfDay } from '../../api';
import { getLocale, translator, type TFunction, useTranslation } from '../../i18n';
import { formatDate, formatTime } from '../../utils/format';
import { toDate } from '../care/shared';

export {
  AsyncBoundary,
  ErrorBlock,
  LoadingBlock,
  NotLinkedBlock,
  errorMessage,
  fmtDate,
  fmtDateLong,
  fmtRelativeDay,
  fmtTime,
  toDate,
  useAsync,
} from '../care/shared';
export type { AsyncState } from '../care/shared';

// ── Enum vocabulary ─────────────────────────────────────────────────────────

/** `some_raw_value` → "Some raw value". The floor under every lookup below. */
export function titleCase(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Look a DISPLAY label up in `meds.vocab.*`, falling back to readable text
 * rather than a raw token. Mirrors the doctor cluster's `label()` in
 * `chartShared.tsx`: the engine returns the key on a miss, so an enum value the
 * catalogue does not carry still reaches `titleCase` instead of printing a
 * database token ("Active", "Oral", "Outpatient") in the wrong language.
 *
 * Pure functions called from render, not hooks — they read the active locale
 * the way `utils/format.ts` does, so the value is always the current one.
 */
function vocabLabel(group: string, value: string | null | undefined): string {
  if (!value) return '';
  const t = translator(getLocale());
  const key = `meds.vocab.${group}.${value}`;
  const hit = t(key);
  return hit === key ? titleCase(value) : hit;
}

/** Localized DISPLAY label for a prescription `status` (value unchanged). */
export const prescriptionStatusLabel = (v?: string | null) => vocabLabel('status', v);
/** Localized DISPLAY label for an administration `route` (value unchanged). */
export const routeLabel = (v?: string | null) => vocabLabel('route', v);
/** Localized DISPLAY label for a `prescription_type` (value unchanged). */
export const prescriptionTypeLabel = (v?: string | null) => vocabLabel('prescriptionType', v);

// ── Formatting ────────────────────────────────────────────────────────────

/**
 * "07 Jun 2024" / "07 juin 2024" — the compact date used all over the MED
 * references. Dates are never catalogue strings (contract rule 8): the one
 * implementation in `utils/format` already reads the active locale.
 */
export function fmtShortDate(iso: string | null | undefined): string {
  return formatDate(iso, '—');
}

/** "Today, 02:00 PM" / « Aujourd’hui, 14:00 » / "23 Apr 2024, 08:00 AM". */
export function fmtWhen(iso: string | null | undefined, t: TFunction): string {
  if (!iso) return '—';
  const d = toDate(iso);
  const today = new Date();
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86400000
  );
  const time = clock(d);
  if (days === 0) return t('meds.dose.whenToday', { time });
  if (days === 1) return t('meds.dose.whenTomorrow', { time });
  if (days === -1) return t('meds.dose.whenYesterday', { time });
  return t('meds.dose.whenDate', { date: fmtShortDate(iso), time });
}

/** `02:00 PM` in English, `14:00` in French — the desktop's own convention. */
export function clock(d: Date): string {
  return formatTime(d);
}

/** "In 2h 15m" / « Il y a 5 min » — the countdown under the schedule badges. */
export function fmtCountdown(iso: string, t: TFunction): string {
  const delta = toDate(iso).getTime() - Date.now();
  const mins = Math.round(Math.abs(delta) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const span =
    h > 0 ? t('meds.dose.spanHours', { h, m }) : t('meds.dose.spanMinutes', { m });
  return delta >= 0 ? t('meds.dose.countdownIn', { span }) : t('meds.dose.countdownAgo', { span });
}

/** Whole days between today and `iso` (positive = in the future). */
export function daysUntil(iso: string): number {
  const d = toDate(iso);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}

export function daysLeftLabel(iso: string, t: TFunction): string {
  const n = daysUntil(iso);
  if (n < 0) return t('meds.dose.overdue');
  if (n === 0) return t('meds.dose.dueToday');
  return t('meds.dose.daysLeft', { count: n });
}

// ── Mapping ───────────────────────────────────────────────────────────────

/** The prescription rows on MED-001 cycle green → blue → purple accents. */
export const ROW_TINTS: Tint[] = ['green', 'blue', 'purple', 'amber'];

/** Pick a glyph from the dosage form — capsule, inhaler, syrup, tablet. */
export function formIcon(p: Pick<PortalPrescription, 'form' | 'dosage' | 'drug_name'>): IconName {
  const s = `${p.form ?? ''} ${p.dosage ?? ''} ${p.drug_name}`.toLowerCase();
  if (s.includes('capsule')) return 'capsule';
  if (s.includes('inhaler') || s.includes('puff')) return 'lungs';
  if (s.includes('injection') || s.includes('syringe')) return 'syringe';
  if (s.includes('syrup') || s.includes('drop') || s.includes('ml')) return 'droplet';
  return 'pill';
}

export const TIME_OF_DAY_ICON: Record<TimeOfDay, IconName> = {
  morning: 'sun',
  midday: 'sun',
  evening: 'moon',
  night: 'moon',
  as_needed: 'clock',
};

/** Literal keys, not a lookup table, so `npm run i18n:check` can see them. */
export function doseLabel(status: DoseStatus, t: TFunction): string {
  switch (status) {
    case 'taken':
      return t('meds.dose.statusTaken');
    case 'missed':
      return t('meds.dose.statusMissed');
    case 'skipped':
      return t('meds.dose.statusSkipped');
    default:
      return t('meds.dose.statusUpcoming');
  }
}

export const DOSE_ICON: Record<DoseStatus, IconName> = {
  upcoming: 'clock',
  taken: 'check-circle',
  missed: 'x-circle',
  skipped: 'minus',
};

export function doseColor(status: DoseStatus): string {
  if (status === 'taken') return colors.statusNormal;
  if (status === 'missed') return colors.statusCritical;
  if (status === 'skipped') return colors.statusWarning;
  return colors.statusPending;
}

/** Adherence word used on MED-005: Good / Fair / Poor. */
export function adherenceLabel(
  percent: number | null,
  t: TFunction
): { label: string; color: string } {
  if (percent === null) return { label: t('meds.dose.adherenceNoData'), color: colors.textMuted };
  if (percent >= 80) return { label: t('meds.dose.adherenceGood'), color: colors.statusNormal };
  if (percent >= 55) return { label: t('meds.dose.adherenceFair'), color: colors.statusWarning };
  return { label: t('meds.dose.adherencePoor'), color: colors.statusCritical };
}

/** "Every 8 hours" from the frequency column, falling back to the raw text. */
export function doseSummary(p: PortalPrescription): string {
  return [p.dosage, p.frequency].filter(Boolean).join(' · ') || '—';
}

// ── Buttons ───────────────────────────────────────────────────────────────

export type MedButtonVariant = 'navy' | 'primary' | 'secondary' | 'ghost' | 'onNavy';

const BUTTON_SKIN: Record<MedButtonVariant, { bg: string; fg: string; border: string }> = {
  navy: { bg: colors.navy, fg: colors.textOnBrand, border: colors.navy },
  primary: { bg: colors.blue, fg: colors.textOnBrand, border: colors.blue },
  secondary: { bg: colors.surface, fg: colors.link, border: colors.border },
  ghost: { bg: colors.primarySoft, fg: colors.link, border: colors.primarySoft },
  onNavy: { bg: 'transparent', fg: colors.textOnBrand, border: colors.blueLight },
};

/** The flat, 1px-bordered button used across the MED references. */
export function MedButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  size = 'md',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: MedButtonVariant;
  icon?: IconName;
  iconRight?: IconName;
  size?: 'md' | 'sm';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const skin = BUTTON_SKIN[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
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
      <Text style={[styles.buttonLabel, size === 'sm' && styles.buttonLabelSm, { color: skin.fg }]}>{label}</Text>
      {!!iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} color={skin.fg} />}
    </TouchableOpacity>
  );
}

/** The 6-up / 5-up quick-action grid at the foot of MED-003 and MED-005. */
export function ActionGrid({
  actions,
  columns = 3,
}: {
  actions: { icon: IconName; label: string; onPress: () => void }[];
  columns?: number;
}) {
  return (
    <View style={styles.grid}>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.label}
          onPress={a.onPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          style={[styles.gridItem, { width: `${100 / columns}%` }]}
        >
          <View style={styles.gridTile}>
            <Icon name={a.icon} size={22} color={colors.blue} />
            <Text style={styles.gridLabel} numberOfLines={2}>
              {a.label}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Small display primitives ──────────────────────────────────────────────

/** Icon + caption + value, the unit that makes up every MED detail grid. */
export function FactCell({
  icon,
  label,
  value,
  valueColor = colors.textPrimary,
  align = 'left',
  divided,
  style,
}: {
  icon: IconName;
  label: string;
  value: string;
  valueColor?: string;
  align?: 'left' | 'center';
  divided?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.fact, divided && styles.factDivided, align === 'center' && styles.factCentre, style]}
      accessible
      accessibilityLabel={a11yJoin(label, value)}
    >
      <View style={[styles.factHead, align === 'center' && styles.factHeadCentre]}>
        <Icon name={icon} size={16} color={colors.blue} />
        <Text style={styles.factLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.factValue, { color: valueColor }, align === 'center' && styles.factCentreText]}>
        {value}
      </Text>
    </View>
  );
}

/** Label above, value below — used inside the RELATED INFORMATION card. */
export function StackedFact({
  icon,
  label,
  value,
  divider,
}: {
  icon: IconName;
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.stacked, divider && styles.stackedDivider]} accessible accessibilityLabel={a11yJoin(label, value)}>
      <Icon name={icon} size={18} color={colors.blue} />
      <View style={styles.stackedBody}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.stackedValue}>{value}</Text>
      </View>
    </View>
  );
}

/** Icon + label on the left, value on the right (REFILLS & ADHERENCE). */
export function MetricRow({
  icon,
  label,
  value,
  valueColor = colors.textPrimary,
  divider,
}: {
  icon: IconName;
  label: string;
  value: string;
  valueColor?: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.metric, divider && styles.stackedDivider]} accessible accessibilityLabel={a11yJoin(label, value)}>
      <Icon name={icon} size={18} color={colors.blue} />
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.metricValue, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** The blue-on-soft-blue overline that heads every MED detail card. */
export function CardOverline({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.overlineRow}>
      <Text style={styles.overline}>{title}</Text>
      {right}
    </View>
  );
}

/** The soft-blue "electronically signed and verified" banner. */
export function VerifiedBanner({
  title,
  message,
  footnote,
  action,
}: {
  title: string;
  message: string;
  footnote?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.verified}>
      <Icon name="shield-check" size={26} color={colors.blue} />
      <View style={styles.verifiedBody}>
        <Text style={styles.verifiedTitle}>{title}</Text>
        <Text style={styles.verifiedText}>{message}</Text>
        {!!footnote && <Text style={styles.verifiedFootnote}>{footnote}</Text>}
      </View>
      {action}
    </View>
  );
}

/** 40px pastel circle — the same recipe `ListRow` uses, reusable standalone. */
export function TintCircle({
  icon,
  tint = 'blue',
  size = 40,
  square,
}: {
  icon: IconName;
  tint?: Tint;
  size?: number;
  square?: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: square ? radii.md : size / 2,
        backgroundColor: tintMap[tint].bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      {...decorative}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={tintMap[tint].fg} />
    </View>
  );
}

/**
 * One line of the MED-001 dose timeline: time column, rail dot, drug + how to
 * take it, status pill and countdown. Shared by MED-001 and the full schedule
 * so both read identically.
 */
export function DoseRow({
  dose,
  first,
  last,
  busy,
  locked,
  outcomeUnknown,
  onPress,
}: {
  dose: MedicationDose;
  first: boolean;
  last: boolean;
  busy: boolean;
  /** Another dose is being written — hold this row until that settles. */
  locked?: boolean;
  /**
   * The last write against this dose failed, so the app does not know whether
   * it landed. A sighted patient learns that from the failure dialog; spoken,
   * the row itself has to keep the uncertainty, because "Taken" and "we don't
   * know" must never sound the same.
   */
  outcomeUnknown?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const at = toDate(dose.scheduled_at);
  const tone = doseColor(dose.status);
  // FR is a 24-hour clock, so there is no meridiem half to split off.
  const [hh, ap = ''] = clock(at).split(' ');

  const when =
    dose.status === 'taken' && dose.taken_at
      ? clock(toDate(dose.taken_at))
      : dose.status === 'upcoming'
        ? fmtCountdown(dose.scheduled_at, t)
        : clock(at);

  // Colour, dot position and pill tint carry the status for a sighted reader;
  // spoken, the status word has to be in the name itself.
  const spoken = a11yJoin(
    dose.drug_name,
    dose.dose_label,
    dose.instruction,
    doseLabel(dose.status, t),
    when,
    // Verbatim from the catalogue — the app must not soften this into a
    // reassurance it cannot make.
    outcomeUnknown && `${t('meds.dose.failTitle')}. ${t('meds.dose.failHintTimeline')}`
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={busy || !!locked}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled: busy || !!locked, busy }}
      accessibilityLiveRegion={outcomeUnknown ? 'assertive' : undefined}
      style={[styles.doseRow, !last && styles.doseDivider, !!locked && styles.doseRowLocked]}
    >
      <View style={styles.doseTime}>
        <Text style={[styles.doseHour, { color: tone }]}>{hh}</Text>
        {!!ap && <Text style={[styles.doseAmPm, { color: tone }]}>{ap}</Text>}
      </View>

      <View style={styles.doseRail}>
        <View style={[styles.doseRailLine, first && styles.doseRailLineTop, last && styles.doseRailLineBottom]} />
        <View style={[styles.doseDot, { backgroundColor: tone }]} />
      </View>

      <View style={styles.doseBody}>
        <Text style={styles.doseDrug} numberOfLines={2}>
          {dose.drug_name}
        </Text>
        <View style={styles.doseMetaRow}>
          {!!dose.dose_label && <Text style={styles.doseMeta}>{dose.dose_label}</Text>}
          {!!dose.dose_label && !!dose.instruction && <Text style={styles.doseMeta}>•</Text>}
          {!!dose.instruction && (
            <>
              <Icon name={TIME_OF_DAY_ICON[dose.time_of_day]} size={14} color={colors.textMuted} />
              <Text style={styles.doseMeta} numberOfLines={1}>
                {dose.instruction}
              </Text>
            </>
          )}
        </View>
      </View>

      <View style={styles.doseRight}>
        {busy ? (
          <ActivityIndicator color={colors.blue} />
        ) : (
          <>
            <StatusBadge status={doseLabel(dose.status, t)} icon={DOSE_ICON[dose.status]} size="sm" />
            <Text style={styles.doseWhen}>{when}</Text>
          </>
        )}
      </View>

      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

/** Doses grouped into the day timeline MED-001 renders. */
export function sortDoses(doses: MedicationDose[]): MedicationDose[] {
  return [...doses].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
}

export const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
  },
  buttonSm: { paddingVertical: 9, paddingHorizontal: 12, gap: 6 },
  buttonOff: { opacity: 0.5 },
  buttonLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
  buttonLabelSm: { fontSize: typography.size.xs },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  gridItem: { padding: 4 },
  gridTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 78,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  gridLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textPrimary,
    textAlign: 'center',
  },

  fact: { flex: 1, minWidth: 0, gap: 4, paddingHorizontal: 10 },
  factCentre: { alignItems: 'center' },
  factCentreText: { textAlign: 'center' },
  factDivided: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  factHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  factHeadCentre: { justifyContent: 'center' },
  factLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  factValue: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },

  stacked: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 10 },
  stackedDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  stackedBody: { flex: 1, minWidth: 0, gap: 2 },
  stackedValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  metric: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 11 },
  metricLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  metricValue: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },

  overlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 10,
  },
  overline: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.blue,
  },

  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
  },
  verifiedBody: { flex: 1, minWidth: 0, gap: 2 },
  verifiedTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  verifiedText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  verifiedFootnote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  // -- Dose timeline row ---------------------------------------------------
  doseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12 },
  doseDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  doseRowLocked: { opacity: 0.5 },
  doseTime: { width: 52 },
  doseHour: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
  doseAmPm: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
  doseRail: { width: 12, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  doseRailLine: { position: 'absolute', top: 0, bottom: 0, width: 1.5, backgroundColor: colors.border },
  doseRailLineTop: { top: '50%' },
  doseRailLineBottom: { bottom: '50%' },
  doseDot: { width: 10, height: 10, borderRadius: 5 },
  doseBody: { flex: 1, minWidth: 0, gap: 2 },
  doseDrug: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  doseMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doseMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },
  doseRight: { alignItems: 'flex-end', gap: 4, minWidth: 84 },
  doseWhen: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },
});
