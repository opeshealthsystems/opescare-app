/**
 * Shared pieces for the doctor's read-only patient chart.
 *
 * Composition only. Every colour, radius, type size and icon comes from
 * `theme/theme` and `components/*`; the loading/stale machinery is the app's
 * own `useAsync` + `AsyncBoundary` from `care/shared`; the reference bands are
 * `utils/vitalBands`, which sources its thresholds from
 * `VitalSignsController::BANDS`. Nothing new is invented here — a doctor's
 * screen and a patient's screen are the same product.
 *
 * What IS different from the patient side is the vocabulary. A doctor may read
 * "SpO₂", "Respiratory rate" and "ICD-10"; a patient reads "Oxygen level" and
 * "Breathing rate". That is a wording change, not a design one — and it still
 * stops short of raw enum values: `life_threatening` becomes "Life-threatening"
 * and an unrecognised value is title-cased rather than shown as a database
 * token or dropped on the floor.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Icon, IconName, StatusBadge } from '../../components';
import {
  toNumber,
  type ChartAllergy,
  type ChartVitals,
  type ScanResult,
} from '../../api/doctorChart';
import { getLocale, translator, useTranslation } from '../../i18n';
import { formatDate, formatDateTime } from '../../utils/format';
import { colors, radii, spacing, statusMap, StatusTone, typography, Tint } from '../../theme/theme';
import {
  bandLabel,
  bandOf,
  toneForBand,
  usualRange,
  worstBand,
  type BandedVital,
  type VitalBand,
} from '../../utils/vitalBands';
import { AsyncBoundary, type AsyncState } from '../care/shared';

// ── Boundary ──────────────────────────────────────────────────────────────

/**
 * `AsyncBoundary` with the patient-portal "link your Health ID" branch tied
 * off. Staff endpoints authenticate a clinician against `users`, never a
 * PatientAccount, so `NotLinkedError` (the portal's 409) cannot arise here and
 * there is no Health ID for a doctor to link.
 */
export function ChartBoundary<T>(props: Omit<React.ComponentProps<typeof AsyncBoundary<T>>, 'onLink'>) {
  return <AsyncBoundary<T> {...props} onLink={noop} />;
}

function noop() {}

// ── Vocabulary ────────────────────────────────────────────────────────────

/** `some_raw_value` → "Some raw value". The floor under every lookup below. */
export function titleCase(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * A `t` for the module-level label helpers below.
 *
 * These are pure functions called from render, not hooks, so they read the
 * locale the way `utils/format.ts` does — the component calling them has
 * already re-rendered off the context, so the locale here is the current one.
 */
const tr = () => translator(getLocale());

/**
 * Look a label up in `doctor.vocab.*`, falling back to readable text instead of
 * a raw token. The engine returns the key itself on a miss, which is how an
 * enum value the catalogue does not carry still reaches `titleCase` rather than
 * printing `follow_up` at a clinician.
 */
function label(group: string, value: string | null | undefined, fallbackKey: string): string {
  const t = tr();
  if (!value) return fallbackKey ? t(fallbackKey) : '';
  const key = `doctor.vocab.${group}.${value}`;
  const hit = t(key);
  return hit === key ? titleCase(value) : hit;
}

export const encounterTypeLabel = (v?: string | null) =>
  label('encounterType', v, 'doctor.vocab.encounterTypeFallback');
export const allergyTypeLabel = (v?: string | null) =>
  label('allergyType', v, 'doctor.vocab.allergyTypeFallback');
export const allergySeverityLabel = (v?: string | null) =>
  label('severity', v, 'doctor.vocab.severityFallback');
export const problemStatusLabel = (v?: string | null) =>
  label('problemStatus', v, 'doctor.vocab.notRecorded');
export const prescriptionStatusLabel = (v?: string | null) =>
  label('prescriptionStatus', v, 'doctor.vocab.notRecorded');
/** Empty rather than "Not recorded": this one is joined into a meta line. */
export const routeLabel = (v?: string | null) => label('route', v, '');
export const orderTypeLabel = (v?: string | null) =>
  label('orderType', v, 'doctor.vocab.orderTypeFallback');
export const orderStatusLabel = (v?: string | null) =>
  label('orderStatus', v, 'doctor.vocab.notRecorded');
export const priorityLabel = (v?: string | null) => label('priority', v, '');
export const encounterStatusLabel = (v?: string | null) =>
  label('encounterStatus', v, 'doctor.vocab.notRecorded');
export const sexLabel = (v?: string | null) => label('sex', v, 'doctor.vocab.sexFallback');

/**
 * Severity → design tone. `severe` and `life_threatening` are the two that must
 * read as red; a `moderate` reaction is amber; `mild` stays neutral rather than
 * green, because no allergy is a "good" status.
 */
export function allergyTone(severity: string): StatusTone {
  switch (severity) {
    case 'life_threatening':
    case 'severe':
      return 'critical';
    case 'moderate':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** The most concerning severity in a list, for the banner's overall tone. */
export function worstAllergyTone(allergies: ChartAllergy[]): StatusTone {
  if (allergies.some((a) => allergyTone(a.severity) === 'critical')) return 'critical';
  if (allergies.some((a) => allergyTone(a.severity) === 'warning')) return 'warning';
  return 'neutral';
}

export function orderTypeIcon(type: string): IconName {
  switch (type) {
    case 'lab':
      return 'flask';
    case 'imaging':
      return 'image';
    case 'medication':
      return 'pill';
    case 'procedure':
      return 'first-aid';
    default:
      return 'clipboard';
  }
}

export function encounterTint(type: string): Tint {
  return type === 'emergency' ? 'red' : type === 'telehealth' ? 'purple' : 'blue';
}

// ── Dates ─────────────────────────────────────────────────────────────────

/**
 * "14 Aug 2026" / "14 août 2026" from either a date string or a full timestamp.
 *
 * The server is not consistent here — `EncounterResource.encounter_date` is a
 * `Y-m-d` string while `ProblemListResource.onset_date` is a raw Eloquent
 * timestamp — so this accepts both and returns null rather than
 * "Invalid Date" for anything it cannot parse. The month name itself comes from
 * `utils/format`, which is locale-aware and matches the desktop.
 */
export function fmtChartDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const bare = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  const d = bare ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return formatDate(d) || null;
}

/** "14 Aug 2026, 09:12" — for a recording whose clock time matters. */
export function fmtChartDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return formatDateTime(d) || null;
}

/**
 * "today" / "3 days ago" / "4 months ago" — how current a reading is.
 *
 * Plural forms come from the catalogue, so French gets its own rule (0 and 1
 * are both singular) rather than an English `s` bolted on.
 */
export function fmtAgo(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = tr();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const days = Math.floor((Date.now() - parsed) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return t('doctor.when.today');
  if (days === 1) return t('doctor.when.yesterday');
  if (days < 31) return t('doctor.when.days', { count: days });
  const months = Math.round(days / 30);
  if (months < 24) return t('doctor.when.months', { count: months });
  return t('doctor.when.years', { count: Math.round(days / 365) });
}

// ── Allergies: the section that must never fail quietly ───────────────────

/**
 * The allergy block.
 *
 * Three states, and the difference between the second and the third is the
 * whole point of this component:
 *
 *   • allergies present   → red/amber card, allergens first, largest type on
 *                           the screen after the patient's name.
 *   • loaded, none found  → a plain "No known allergies recorded" statement,
 *                           which is a CLAIM and is only ever made after a
 *                           successful response.
 *   • failed to load      → a loud red "Allergies could not be loaded" card
 *                           with a retry. Never an empty list, never silence.
 *
 * A network error rendering as an empty section reads as "no allergies" to
 * someone glancing at a phone before prescribing. That is the failure mode
 * this component exists to make impossible.
 */
export function AllergyBlock({
  state,
  onViewAll,
  limit,
}: {
  state: AsyncState<ChartAllergy[]>;
  onViewAll?: () => void;
  /** Show at most this many, with a "+N more" line. Omit to show all. */
  limit?: number;
}) {
  const { t } = useTranslation();

  // ---- Failure. Loud, red, and explicitly NOT a statement about allergies.
  if (state.error && state.data === null) {
    return (
      <View style={[styles.alertCard, { backgroundColor: statusMap.critical.bg, borderColor: colors.statusCritical }]}>
        <View style={styles.alertHead}>
          <Icon name="alert-triangle" size={24} color={colors.statusCritical} strokeWidth={2.2} />
          <Text style={[styles.alertTitle, { color: colors.statusCritical }]}>
            {t('doctor.chart.allergy.failedTitle')}
          </Text>
        </View>
        <Text style={styles.alertBody} accessibilityRole="alert">
          {t('doctor.chart.allergy.failedBody', { error: state.error })}
        </Text>
        <RetryLine onPress={state.reload} busy={state.loading} tone="critical" />
      </View>
    );
  }

  if (state.loading && state.data === null) {
    return (
      <View style={[styles.alertCard, styles.alertLoading]}>
        <View style={styles.alertHead}>
          <Icon name="alert-triangle" size={24} color={colors.textMuted} strokeWidth={2.2} />
          <Text style={[styles.alertTitle, { color: colors.textSecondary }]}>
            {t('doctor.chart.allergy.loadingTitle')}
          </Text>
        </View>
        <Text style={styles.alertBody}>{t('doctor.chart.allergy.loadingBody')}</Text>
      </View>
    );
  }

  const allergies = state.data ?? [];

  // ---- Loaded and genuinely empty.
  if (allergies.length === 0) {
    return (
      <View style={[styles.alertCard, styles.alertNone]}>
        <View style={styles.alertHead}>
          <Icon name="shield-check" size={24} color={colors.statusNormal} strokeWidth={2.2} />
          <Text style={[styles.alertTitle, { color: colors.textPrimary }]}>
            {t('doctor.chart.allergy.noneTitle')}
          </Text>
        </View>
        <Text style={styles.alertBody}>{t('doctor.chart.allergy.noneBody')}</Text>
        {state.stale ? <StaleLine loadedAt={state.loadedAt} onRetry={state.reload} busy={state.loading} /> : null}
      </View>
    );
  }

  // ---- Loaded, with allergies.
  const tone = statusMap[worstAllergyTone(allergies)];
  const shown = limit ? allergies.slice(0, limit) : allergies;
  const hidden = allergies.length - shown.length;

  return (
    <View
      style={[styles.alertCard, { backgroundColor: tone.bg, borderColor: tone.fg }]}
      accessibilityRole="alert"
      accessibilityLabel={t('doctor.chart.allergy.accessibility', {
        list: allergies.map((a) => a.allergen).join(', '),
      })}
    >
      <View style={styles.alertHead}>
        <Icon name="alert-triangle" size={24} color={tone.fg} strokeWidth={2.2} />
        <Text style={[styles.alertTitle, { color: tone.fg }]}>
          {allergies.length === 1
            ? t('doctor.chart.allergy.one')
            : t('doctor.chart.allergy.many', { count: allergies.length })}
        </Text>
      </View>

      {shown.map((a) => (
        <View key={a.id} style={styles.allergyRow}>
          <Text style={styles.allergen}>{a.allergen}</Text>
          <View style={styles.allergyMetaRow}>
            <StatusBadge
              status={allergySeverityLabel(a.severity)}
              tone={allergyTone(a.severity)}
              size="sm"
            />
            <Text style={styles.allergyMeta}>{allergyTypeLabel(a.allergy_type)}</Text>
          </View>
          {!!a.reaction && <Text style={styles.allergyReaction}>{a.reaction}</Text>}
        </View>
      ))}

      {hidden > 0 && (
        <Text style={[styles.allergyMore, { color: tone.fg }]} onPress={onViewAll}>
          {t('doctor.chart.allergy.more', { count: hidden })}
        </Text>
      )}

      {state.stale ? <StaleLine loadedAt={state.loadedAt} onRetry={state.reload} busy={state.loading} /> : null}
    </View>
  );
}

function RetryLine({ onPress, busy, tone }: { onPress: () => void; busy?: boolean; tone: StatusTone }) {
  const { t } = useTranslation();
  return (
    <Text
      style={[styles.retry, { color: statusMap[tone].fg }]}
      onPress={busy ? undefined : onPress}
      accessibilityRole="button"
    >
      {busy ? t('doctor.chart.allergy.retrying') : t('doctor.chart.allergy.retry')}
    </Text>
  );
}

/** Inline twin of `StaleNotice` for a block that lives inside a coloured card. */
function StaleLine({
  loadedAt,
  onRetry,
  busy,
}: {
  loadedAt: Date | null;
  onRetry: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const when = loadedAt ? fmtChartDateTime(loadedAt.toISOString()) : null;
  return (
    <Text style={styles.staleLine} onPress={busy ? undefined : onRetry} accessibilityRole="button">
      {when
        ? t('doctor.chart.allergy.staleWithTime', { when })
        : t('doctor.chart.allergy.stale')}
    </Text>
  );
}

// ── Incompleteness ────────────────────────────────────────────────────────

/**
 * Says out loud that a fanned-out list is a subset.
 *
 * There is no patient-level prescriptions or orders endpoint, so these lists
 * are built by opening the most recent encounters one at a time. If one of
 * those reads fails, or the patient has more encounters than we opened, the
 * list on screen is shorter than the record — and a short medication list is
 * as dangerous as a stale one. This is how the screen admits it.
 */
export function IncompleteNotice({
  scan,
  noun,
  scanLimit,
}: {
  scan: ScanResult<unknown>;
  /** A `doctor.chart.noun*` key — "medications", "results". */
  noun: string;
  scanLimit: number;
}) {
  const { t } = useTranslation();
  const word = t(noun);
  const parts: string[] = [];
  if (scan.failed > 0) {
    parts.push(
      t('doctor.chart.incompleteFailed', {
        failed: scan.failed,
        total: scan.failed + scan.scanned,
        noun: word,
      })
    );
  }
  if (scan.truncated) {
    parts.push(t('doctor.chart.incompleteTruncated', { scan: scanLimit, noun: word }));
  }
  if (parts.length === 0) return null;

  const tone = scan.failed > 0 ? statusMap.warning : statusMap.pending;
  return (
    <View style={[styles.incomplete, { backgroundColor: tone.bg }]} accessibilityRole="alert">
      <Icon name={scan.failed > 0 ? 'alert-circle' : 'info'} size={16} color={tone.fg} />
      <Text style={styles.incompleteText}>
        {`${t('doctor.chart.incompleteLead')} ${parts.join(' ')}`}
      </Text>
    </View>
  );
}

// ── Vitals ────────────────────────────────────────────────────────────────

type MetricSpec = {
  label: string;
  value: string;
  unit: string;
  band: VitalBand | null;
  /** null = OPES has no reference band for this measurement. */
  range: string | null;
};

const rangeFor = (field: BandedVital, unit: string) => `${usualRange(field)} ${unit}`.trim();

/**
 * Build the metric list for one vitals recording.
 *
 * Only the six measurements in `VITAL_BANDS` get a range. Weight, height, BMI,
 * blood glucose and head circumference have no server-side band, so they are
 * shown with "No usual range available" — never with a threshold invented here.
 */
export function vitalMetrics(v: ChartVitals): MetricSpec[] {
  const t = tr();
  const sys = toNumber(v.bp_systolic);
  const dia = toNumber(v.bp_diastolic);
  const pulse = toNumber(v.pulse);
  const temp = toNumber(v.temperature);
  const rr = toNumber(v.respiratory_rate);
  const spo2 = toNumber(v.spo2);

  const out: MetricSpec[] = [];

  if (sys !== null && dia !== null) {
    out.push({
      label: t('doctor.chart.vitals.bloodPressure'),
      value: `${sys}/${dia}`,
      unit: 'mmHg',
      band: worstBand(bandOf('bp_systolic', sys), bandOf('bp_diastolic', dia)),
      range: t('doctor.chart.vitals.bpRange', {
        systolic: usualRange('bp_systolic'),
        diastolic: usualRange('bp_diastolic'),
      }),
    });
  }
  if (pulse !== null) {
    out.push({ label: t('doctor.chart.vitals.pulse'), value: String(pulse), unit: 'bpm', band: bandOf('pulse', pulse), range: rangeFor('pulse', 'bpm') });
  }
  if (temp !== null) {
    out.push({ label: t('doctor.chart.vitals.temperature'), value: String(temp), unit: '°C', band: bandOf('temperature', temp), range: rangeFor('temperature', '°C') });
  }
  if (rr !== null) {
    out.push({
      label: t('doctor.chart.vitals.respiratoryRate'),
      value: String(rr),
      unit: '/min',
      band: bandOf('respiratory_rate', rr),
      range: rangeFor('respiratory_rate', '/min'),
    });
  }
  if (spo2 !== null) {
    out.push({ label: t('doctor.chart.vitals.spo2'), value: String(spo2), unit: '%', band: bandOf('spo2', spo2), range: rangeFor('spo2', '%') });
  }

  // No band exists for these — say so rather than guess.
  const unbanded: [string, number | null, string][] = [
    [t('doctor.chart.vitals.weight'), toNumber(v.weight), 'kg'],
    [t('doctor.chart.vitals.height'), toNumber(v.height), 'cm'],
    [t('doctor.chart.vitals.bmi'), toNumber(v.bmi), ''],
    [t('doctor.chart.vitals.bloodGlucose'), toNumber(v.blood_glucose), 'mg/dL'],
    [t('doctor.chart.vitals.headCircumference'), toNumber(v.head_circumference), 'cm'],
  ];
  for (const [lbl, val, unit] of unbanded) {
    if (val !== null) out.push({ label: lbl, value: String(val), unit, band: null, range: null });
  }

  return out;
}

/** True when any banded reading in this set is outside its usual range. */
export function vitalsOffRange(v: ChartVitals): boolean {
  return vitalMetrics(v).some((m) => m.band === 'outside' || m.band === 'critical');
}

export function VitalMetric({ metric }: { metric: MetricSpec }) {
  const { t } = useTranslation();
  const tone = statusMap[toneForBand(metric.band)];
  const off = metric.band === 'outside' || metric.band === 'critical';
  const badge = metric.band && metric.band !== 'normal' ? bandLabel(metric.band) : null;

  return (
    <View style={[styles.metric, off && styles.metricOff, off && { borderColor: tone.fg, backgroundColor: tone.bg }]}>
      <Text style={styles.metricLabel}>{metric.label}</Text>
      <Text style={[styles.metricValue, off && { color: tone.fg }]}>
        {metric.value}
        {metric.unit ? <Text style={[styles.metricUnit, off && { color: tone.fg }]}> {metric.unit}</Text> : null}
      </Text>
      {badge ? (
        <Text
          style={[styles.metricBadge, { color: tone.fg }]}
          accessibilityLabel={t('doctor.chart.vitals.isBand', { label: metric.label, band: badge })}
        >
          {badge}
        </Text>
      ) : null}
      <Text style={styles.metricRange}>
        {metric.range
          ? t('doctor.chart.vitals.usual', { range: metric.range })
          : t('doctor.chart.vitals.noRange')}
      </Text>
    </View>
  );
}

/** One vitals recording, with its clinical timestamp and how old it is. */
export function VitalsCard({ vitals, showAge = true }: { vitals: ChartVitals; showAge?: boolean }) {
  const { t } = useTranslation();
  const metrics = vitalMetrics(vitals);
  const when = fmtChartDateTime(vitals.recorded_at ?? vitals.created_at);
  const ago = fmtAgo(vitals.recorded_at ?? vitals.created_at);

  return (
    <Card>
      <View style={styles.vitalsHead}>
        <Text style={styles.vitalsWhen}>{when ?? t('doctor.chart.vitals.timeUnknown')}</Text>
        {showAge && !!ago && (
          <Text style={styles.vitalsAgo}>{t('doctor.chart.vitals.recordedAgo', { ago })}</Text>
        )}
      </View>

      {metrics.length === 0 ? (
        <Text style={styles.muted}>{t('doctor.chart.vitals.noMeasurements')}</Text>
      ) : (
        <View style={styles.grid}>
          {metrics.map((m) => (
            <VitalMetric key={m.label} metric={m} />
          ))}
        </View>
      )}

      <Text style={styles.footnote}>{t('doctor.chart.vitals.footnote')}</Text>
    </Card>
  );
}

// ── Read-only footer ──────────────────────────────────────────────────────

/**
 * The standing statement that this is a viewer.
 *
 * Deliberate product boundary: writing a clinical record on a phone — a
 * prescription, an order, a note — skips the desktop's decision support and
 * signing flow. So the chart says plainly where that work belongs rather than
 * offering a half-version of it.
 */
export function ReadOnlyFooter() {
  const { t } = useTranslation();
  return (
    <View style={styles.readOnly}>
      <Icon name="eye" size={16} color={colors.textMuted} />
      <Text style={styles.readOnlyText}>{t('doctor.chart.readOnly')}</Text>
    </View>
  );
}

// ── Small shared bits ─────────────────────────────────────────────────────

/** Left label / right value line inside a chart card. */
export function ChartLine({ label: lbl, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{lbl}</Text>
      <Text style={styles.lineValue} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

/** Joins the parts of a metadata line, dropping the empty ones. */
export const metaLine = (...parts: (string | null | undefined | false)[]) =>
  parts.filter(Boolean).join('  •  ');

export const styles = StyleSheet.create({
  // Allergy / alert card
  alertCard: {
    borderRadius: radii.md,
    borderWidth: 1.5,
    padding: spacing.md - 2,
    gap: spacing.sm,
  },
  alertLoading: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  alertNone: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  alertTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
  },
  alertBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  retry: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    paddingVertical: spacing.xs,
  },
  staleLine: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.statusWarning,
    paddingTop: spacing.xs,
  },

  allergyRow: { gap: 3 },
  allergen: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  allergyMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  allergyMeta: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  allergyReaction: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  allergyMore: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    paddingTop: spacing.xs,
  },

  // Incompleteness
  incomplete: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
  },
  incompleteText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  // Vitals
  vitalsHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  vitalsWhen: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },
  vitalsAgo: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { minWidth: 104, flexGrow: 1, flexBasis: '30%', paddingVertical: 2 },
  metricOff: { borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 6 },
  metricLabel: { fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.textMuted },
  metricValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  metricUnit: { fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.textMuted },
  metricBadge: { fontFamily: typography.fontFamily.semiBold, fontSize: 10, marginTop: 1 },
  metricRange: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.textMuted, marginTop: 1 },
  footnote: {
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
  },

  // Read-only footer
  readOnly: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  readOnlyText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  // Lines
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 6,
  },
  lineLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  lineValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },

  muted: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
});
