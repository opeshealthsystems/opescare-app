/**
 * Shared plumbing for the meds slice — the prescriptions list / detail and the
 * pharmacy screens. Port of design reference `src/screens/meds/shared.tsx` (archived prototype, see docs/DESIGN_REFERENCE.md) onto the
 * installed kit (`@/components/opes-ui`), expo-router and the app's i18next
 * (`opesMeds.*` keys).
 *
 * Composition only: every colour comes from the active kit palette, every
 * glyph from the kit `<Icon />`. No API calls live here — the screens keep
 * their react-query hooks and hand the data down. Async / loading primitives
 * are reused from the CARE slice so the two slices behave identically.
 */
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  Icon,
  StatusBadge,
  a11yJoin,
  decorative,
  colors as defaultColors,
  formatDate,
  formatTime,
  radii,
  spacing,
  toneForStatus,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';

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

import { toDate } from '../care/shared';

// ── Contract types ──────────────────────────────────────────────────────────
// The kit's `src/api/medications.ts` shapes, kept here (there is no OPES api
// module in this app) so every meds screen reads the same vocabulary.

/** Any translate function shaped like i18next's `t` — `(key, params) => string`. */
export type TFunction = (key: string, params?: Record<string, unknown>) => string;

export type PrescriptionStatus = 'active' | 'completed' | 'stopped' | (string & {});

export type DoseStatus = 'upcoming' | 'taken' | 'missed' | 'skipped';

export type TimeOfDay = 'morning' | 'midday' | 'evening' | 'night' | 'as_needed';

/** One prescribed medication as the OPES portal presents it. */
export type PortalPrescription = {
  id: string;
  drug_name: string;
  dosage: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  status: PrescriptionStatus;
  encounter_id?: string;
  prescribed_by?: number | null;
  prescriber_name?: string | null;
  started_at: string;
  next_dose_at?: string | null;
  next_dose_label?: string | null;
  /** Human prescription reference, e.g. "RX-CCR-2026-08765". */
  reference?: string | null;
  /** Dosage form: Tablet, Capsule, Inhaler… */
  form?: string | null;
  /** What it is for — shown under the drug name ("Pain relief / Fever"). */
  purpose?: string | null;
  condition_treated?: string | null;
  prescriber_notes?: string | null;
  /** Quantity dispensed per fill ("20 capsules"). */
  quantity_label?: string | null;
  prescriber_specialty?: string | null;
  facility_name?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  refill_due_on?: string | null;
  refills_used?: number;
  refills_allowed?: number;
  pharmacy_name?: string | null;
  pharmacy_phone?: string | null;
  is_dispensed?: boolean;
  verified_at?: string | null;
};

/** One scheduled dose on the MED-001 timeline. */
export type MedicationDose = {
  id: string;
  prescription_id: string;
  drug_name: string;
  dose_label: string | null;
  /** e.g. "After breakfast" — shown under the drug name on the timeline. */
  instruction: string | null;
  time_of_day: TimeOfDay;
  scheduled_at: string;
  status: DoseStatus;
  taken_at: string | null;
  note: string | null;
};

// ── Enum vocabulary ─────────────────────────────────────────────────────────

/** `some_raw_value` → "Some raw value". The floor under every lookup below. */
export function titleCase(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Look a DISPLAY label up in `opesMeds.vocab.*`, falling back to readable text
 * rather than a raw token. An enum value the catalogue does not carry still
 * reaches `titleCase` instead of printing a database token ("Active", "Oral",
 * "Outpatient") in the wrong language.
 *
 * Pure functions called from render, not hooks — they read i18next directly,
 * so the value is always the current locale's.
 */
function vocabLabel(group: string, value: string | null | undefined): string {
  if (!value) return '';
  const key = `opesMeds.vocab.${group}.${value}`;
  return i18next.exists(key) ? String(i18next.t(key)) : titleCase(value);
}

/** Localized DISPLAY label for a prescription `status` (value unchanged). */
export const prescriptionStatusLabel = (v?: string | null) => vocabLabel('status', v);
/** Localized DISPLAY label for an administration `route` (value unchanged). */
export const routeLabel = (v?: string | null) => vocabLabel('route', v);
/** Localized DISPLAY label for a `prescription_type` (value unchanged). */
export const prescriptionTypeLabel = (v?: string | null) => vocabLabel('prescriptionType', v);

/**
 * Badge tone for this app's prescription statuses. The mobile API sends its
 * own `status_color`; it is honoured with one deliberate exception — it
 * returns `default` for both `expired` and `cancelled`, which would render a
 * revoked prescription identically to a merely lapsed one. On a medication
 * list that is a safety-legibility problem, so `cancelled` is promoted to
 * critical. Anything else falls through to the kit's keyword map.
 */
/** Retracted on the server — the record was taken back, never merely ended. */
const RETRACTED_STATUSES = ['voided', 'entered_in_error'];

export function prescriptionTone(
  status: string,
  statusColor?: 'success' | 'info' | 'warning' | 'danger' | 'default' | null,
): StatusTone {
  // Driven off the status, not the colour, so a retracted record still reads as
  // critical if the server ever changes what colour it sends. `toneForStatus`
  // does not know these words — it would answer 'neutral', which is the same
  // grey a lapsed prescription gets.
  if (status === 'cancelled' || RETRACTED_STATUSES.includes(status)) return 'critical';

  switch (statusColor) {
    case 'danger':
      return 'critical';
    case 'success':
      return 'normal';
    case 'info':
      return 'pending';
    case 'warning':
      return 'warning';
    case 'default':
      return 'neutral';
    default:
      return toneForStatus(status);
  }
}

// ── Formatting ────────────────────────────────────────────────────────────

/**
 * "07 Jun 2024" / "07 juin 2024" — the compact date used all over the MED
 * references. Dates are never catalogue strings: the one implementation in
 * the kit's `format` already reads the active locale.
 */
export function fmtShortDate(iso: string | null | undefined): string {
  return formatDate(iso, '—');
}

/** "Today, 02:00 PM" / « Aujourd’hui, 14:00 » / "23 Apr 2024, 08:00 AM". */
export function fmtWhen(iso: string | null | undefined, t: TFunction): string {
  if (!iso) return '—';
  const d = toDate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86400000,
  );
  const time = clock(d);
  if (days === 0) return t('opesMeds.dose.whenToday', { time });
  if (days === 1) return t('opesMeds.dose.whenTomorrow', { time });
  if (days === -1) return t('opesMeds.dose.whenYesterday', { time });
  return t('opesMeds.dose.whenDate', { date: fmtShortDate(iso), time });
}

/** `02:00 PM` in English, `14:00` in French — the desktop's own convention. */
export function clock(d: Date): string {
  return formatTime(d);
}

/** "In 2h 15m" / « Il y a 5 min » — the countdown under the schedule badges. */
export function fmtCountdown(iso: string, t: TFunction): string {
  const delta = toDate(iso).getTime() - Date.now();
  if (Number.isNaN(delta)) return '—';
  const mins = Math.round(Math.abs(delta) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const span = h > 0 ? t('opesMeds.dose.spanHours', { h, m }) : t('opesMeds.dose.spanMinutes', { m });
  return delta >= 0 ? t('opesMeds.dose.countdownIn', { span }) : t('opesMeds.dose.countdownAgo', { span });
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
  if (Number.isNaN(n)) return '—';
  if (n < 0) return t('opesMeds.dose.overdue');
  if (n === 0) return t('opesMeds.dose.dueToday');
  return t('opesMeds.dose.daysLeft', { count: n });
}

// ── Mapping ───────────────────────────────────────────────────────────────

/** The prescription rows on MED-001 cycle green → blue → purple accents. */
export const ROW_TINTS: Tint[] = ['green', 'blue', 'purple', 'amber'];

/** Pick a glyph from the dosage form — capsule, inhaler, syrup, tablet. */
export function formIcon(
  p: Partial<Pick<PortalPrescription, 'form' | 'dosage'>> & {
    drug_name: string;
  },
): IconName {
  const s = `${p.form ?? ''} ${p.dosage ?? ''} ${p.drug_name ?? ''}`.toLowerCase();
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

/** Literal keys, not a lookup table, so an i18n audit can see them. */
export function doseLabel(status: DoseStatus, t: TFunction): string {
  switch (status) {
    case 'taken':
      return t('opesMeds.dose.statusTaken');
    case 'missed':
      return t('opesMeds.dose.statusMissed');
    case 'skipped':
      return t('opesMeds.dose.statusSkipped');
    default:
      return t('opesMeds.dose.statusUpcoming');
  }
}

export const DOSE_ICON: Record<DoseStatus, IconName> = {
  upcoming: 'clock',
  taken: 'check-circle',
  missed: 'x-circle',
  skipped: 'minus',
};

/** Status colour for a dose, from the active palette (defaults to the brand). */
export function doseColor(status: DoseStatus, c: Palette = defaultColors): string {
  if (status === 'taken') return c.statusNormal;
  if (status === 'missed') return c.statusCritical;
  if (status === 'skipped') return c.statusWarning;
  return c.statusPending;
}

/** Adherence word used on MED-005: Good / Fair / Poor. */
export function adherenceLabel(
  percent: number | null,
  t: TFunction,
  c: Palette = defaultColors,
): { label: string; color: string } {
  if (percent === null) return { label: t('opesMeds.dose.adherenceNoData'), color: c.textMuted };
  if (percent >= 80) return { label: t('opesMeds.dose.adherenceGood'), color: c.statusNormal };
  if (percent >= 55) return { label: t('opesMeds.dose.adherenceFair'), color: c.statusWarning };
  return { label: t('opesMeds.dose.adherencePoor'), color: c.statusCritical };
}

/** "Every 8 hours" from the frequency column, falling back to the raw text. */
export function doseSummary(p: Pick<PortalPrescription, 'dosage' | 'frequency'>): string {
  return [p.dosage, p.frequency].filter(Boolean).join(' · ') || '—';
}

// ── Buttons ───────────────────────────────────────────────────────────────

export type MedButtonVariant = 'navy' | 'primary' | 'secondary' | 'ghost' | 'onNavy';

function buttonSkin(c: Palette): Record<MedButtonVariant, { bg: string; fg: string; border: string }> {
  return {
    navy: { bg: c.navy, fg: c.textOnBrand, border: c.navy },
    primary: { bg: c.blue, fg: c.textOnBrand, border: c.blue },
    secondary: { bg: c.surface, fg: c.link, border: c.border },
    ghost: { bg: c.primarySoft, fg: c.link, border: c.primarySoft },
    onNavy: { bg: 'transparent', fg: c.textOnBrand, border: c.blueLight },
  };
}

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
  const { colors } = useTheme();
  const styles = useMedStyles();
  const skin = buttonSkin(colors)[variant];
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
  const { colors } = useTheme();
  const styles = useMedStyles();
  const width: `${number}%` = `${100 / Math.max(1, columns)}%`;
  return (
    <View style={styles.grid}>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.label}
          onPress={a.onPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          style={[styles.gridItem, { width }]}
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
  valueColor,
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
  const { colors } = useTheme();
  const styles = useMedStyles();
  return (
    <View
      style={[styles.fact, divided && styles.factDivided, align === 'center' && styles.factCentre, style]}
      accessible
      accessibilityLabel={a11yJoin(label, value)}
    >
      <View style={[styles.factHead, align === 'center' && styles.factHeadCentre]}>
        <Icon name={icon} size={16} color={colors.blue} />
        <Text style={styles.factLabel} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text
        style={[
          styles.factValue,
          { color: valueColor ?? colors.textPrimary },
          align === 'center' && styles.factCentreText,
        ]}
      >
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
}: {
  icon: IconName;
  label: string;
  value: string;
  /** Ignored: each fact sits in its own card; none draws a hairline. */
  divider?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMedStyles();
  return (
    <View style={styles.stacked} accessible accessibilityLabel={a11yJoin(label, value)}>
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
  valueColor,
}: {
  icon: IconName;
  label: string;
  value: string;
  valueColor?: string;
  /** Ignored: each metric sits in its own card; none draws a hairline. */
  divider?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMedStyles();
  return (
    <View style={styles.metric} accessible accessibilityLabel={a11yJoin(label, value)}>
      <Icon name={icon} size={18} color={colors.blue} />
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.metricValue, { color: valueColor ?? colors.textPrimary }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/** The blue-on-soft-blue overline that heads every MED detail card. */
export function CardOverline({ title, right }: { title: string; right?: React.ReactNode }) {
  const styles = useMedStyles();
  return (
    <View style={styles.overlineRow}>
      <Text style={styles.overline} accessibilityRole="header">
        {title}
      </Text>
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
  icon = 'shield-check',
}: {
  title: string;
  message: string;
  footnote?: string;
  action?: React.ReactNode;
  icon?: IconName;
}) {
  const { colors } = useTheme();
  const styles = useMedStyles();
  return (
    <View style={styles.verified}>
      <Icon name={icon} size={26} color={colors.blue} />
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
  const { tintMap } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: square ? radii.md : size / 2,
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
  /** Ignored: each dose sits in its own card; none draws a hairline. */
  last?: boolean;
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
  const { t: translate } = useTranslation();
  const t: TFunction = (key, params) => String(translate(key, params as Record<string, unknown>));
  const { colors } = useTheme();
  const styles = useMedStyles();
  const at = toDate(dose.scheduled_at);
  const tone = doseColor(dose.status, colors);
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
    outcomeUnknown && `${t('opesMeds.dose.failTitle')}. ${t('opesMeds.dose.failHintTimeline')}`,
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
      style={[styles.doseRow, !!locked && styles.doseRowLocked]}
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
              <Icon name={TIME_OF_DAY_ICON[dose.time_of_day] ?? 'clock'} size={14} color={colors.textMuted} />
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
            <StatusBadge
              status={dose.status}
              label={doseLabel(dose.status, t)}
              icon={DOSE_ICON[dose.status] ?? 'clock'}
              size="sm"
            />
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

// ── Styles ────────────────────────────────────────────────────────────────
// Built per palette so the runtime theme switch re-skins these too. `styles`
// is the static default-brand sheet for non-hook callers; components use
// `useMedStyles()`.

export const makeMedStyles = (c: Palette) =>
  StyleSheet.create({
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
    buttonLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
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
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    gridLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textPrimary,
      textAlign: 'center',
    },

    fact: { flex: 1, minWidth: 0, gap: 4, paddingHorizontal: 10 },
    factCentre: { alignItems: 'center' },
    factCentreText: { textAlign: 'center' },
    factDivided: { borderLeftWidth: 1, borderLeftColor: c.divider },
    factHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    /*
     * Centred cells stack the icon ABOVE the label. Side by side, a three-up
     * strip gives each label about 70pt at 375pt wide, which is not enough for
     * "Pharmacies near you" — it overflowed and overlapped its neighbour.
     * Stacking gives the label the full cell width.
     */
    factHeadCentre: {
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 3,
    },
    factLabel: {
      flexShrink: 1,
      minWidth: 0,
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    factValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },

    stacked: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 10 },
    stackedBody: { flex: 1, minWidth: 0, gap: 2 },
    stackedValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
    },

    metric: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 11,
    },
    metricLabel: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },
    metricValue: {
      flexShrink: 1,
      textAlign: 'right',
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },

    overlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: 10,
    },
    overline: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.blue,
    },

    verified: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      padding: spacing.md - 2,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.primarySoft,
    },
    verifiedBody: { flex: 1, minWidth: 0, gap: 2 },
    verifiedTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    verifiedText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    verifiedFootnote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    // -- Dose timeline row ---------------------------------------------------
    doseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 12,
    },
    doseRowLocked: { opacity: 0.5 },
    doseTime: { width: 52 },
    doseHour: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    doseAmPm: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    doseRail: {
      width: 12,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
    },
    doseRailLine: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 1.5,
      backgroundColor: c.border,
    },
    doseRailLineTop: { top: '50%' },
    doseRailLineBottom: { bottom: '50%' },
    doseDot: { width: 10, height: 10, borderRadius: 5 },
    doseBody: { flex: 1, minWidth: 0, gap: 2 },
    doseDrug: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
    },
    doseMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    doseMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    doseRight: { alignItems: 'flex-end', gap: 4, minWidth: 84 },
    doseWhen: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
  });

/** The meds sheet for the active palette (memoised per palette). */
export function useMedStyles() {
  const { colors } = useTheme();
  return useMemo(() => makeMedStyles(colors), [colors]);
}

/** Static default-brand sheet, for the rare non-hook caller. */
export const styles = makeMedStyles(defaultColors);
