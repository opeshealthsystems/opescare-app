import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchVitals, Vitals } from '../api/clinical';
import { Card, DataListScreen } from '../components/DataListScreen';
import { cacheKeys } from '../lib/offlineCache';
import { useTranslation } from '../i18n';
import { colors, radii, spacing, statusMap, typography } from '../theme/theme';
import { formatDateTime } from '../utils/format';
import {
  BandedVital,
  bandOf,
  toneForBand,
  usualRange,
  VitalBand,
  worstBand,
} from '../utils/vitalBands';

/**
 * `vitalBands.bandLabel` is English-only and shared with screens outside this
 * cluster, so the badge wording is looked up here instead.
 */
function bandKey(band: VitalBand | null): string | null {
  switch (band) {
    case 'normal':
      return 'records.vitals.bandInRange';
    case 'outside':
      return 'records.vitals.bandOutside';
    case 'critical':
      return 'records.vitals.bandWellOutside';
    default:
      return null;
  }
}

/**
 * Vitals, banded against the same thresholds the rest of OPES uses
 * (`src/utils/vitalBands.ts`, mirroring `VitalSignsController::BANDS`).
 *
 * A reading outside the usual range is coloured, badged and given its range, so
 * it cannot be mistaken for a normal one. Nothing here is a diagnosis: the copy
 * says a value is outside a general range and points the patient at their care
 * team, and it never speculates about a cause. Measurements OPES has no banding
 * for — weight, BMI — say so instead of showing an invented range.
 */
export function VitalsScreen() {
  const { t } = useTranslation();
  return (
    <DataListScreen<Vitals>
      title={t('records.vitals.title')}
      emptyLabel={t('records.vitals.empty')}
      fetcher={fetchVitals}
      cacheKey={cacheKeys.vitals}
      keyExtractor={(v) => String(v.id)}
      renderItem={(v) => <VitalsCard vitals={v} />}
    />
  );
}

function VitalsCard({ vitals: v }: { vitals: Vitals }) {
  const { t } = useTranslation();
  const bpBand = worstBand(bandOf('bp_systolic', v.bp_systolic), bandOf('bp_diastolic', v.bp_diastolic));
  const pulseBand = bandOf('pulse', v.pulse);
  const tempBand = bandOf('temperature', v.temperature);
  const spo2Band = bandOf('spo2', v.spo2);
  const rrBand = bandOf('respiratory_rate', v.respiratory_rate);

  const bands = [bpBand, pulseBand, tempBand, spo2Band, rrBand];
  const anyOff = bands.some((b) => b === 'outside' || b === 'critical');

  return (
    <Card>
      <Text style={styles.date}>{formatDateTime(v.recorded_at)}</Text>

      {anyOff ? (
        <View style={[styles.notice, { backgroundColor: statusMap.warning.bg }]}>
          <Text style={[styles.noticeText, { color: statusMap.warning.fg }]}>
            {t('records.vitals.notice')}
          </Text>
        </View>
      ) : null}

      <View style={styles.grid}>
        {v.bp_systolic != null && v.bp_diastolic != null && (
          <Metric
            label={t('records.vitals.bloodPressure')}
            value={`${v.bp_systolic}/${v.bp_diastolic}`}
            unit="mmHg"
            band={bpBand}
            range={t('records.vitals.bpRange', {
              systolic: usualRange('bp_systolic'),
              diastolic: usualRange('bp_diastolic'),
            })}
          />
        )}
        {v.pulse != null && (
          <Metric
            label={t('records.vitals.pulse')}
            value={String(v.pulse)}
            unit={t('records.vitals.unitBpm')}
            band={pulseBand}
            range={rangeFor('pulse', t('records.vitals.unitBpm'))}
          />
        )}
        {v.temperature != null && (
          <Metric
            label={t('records.vitals.temperature')}
            value={String(v.temperature)}
            unit="°C"
            band={tempBand}
            range={rangeFor('temperature', '°C')}
          />
        )}
        {v.respiratory_rate != null && (
          <Metric
            label={t('records.vitals.breathingRate')}
            value={String(v.respiratory_rate)}
            unit={t('records.vitals.unitBreaths')}
            band={rrBand}
            range={rangeFor('respiratory_rate', t('records.vitals.unitBreaths'))}
          />
        )}
        {v.spo2 != null && (
          <Metric
            label={t('records.vitals.oxygenLevel')}
            value={String(v.spo2)}
            unit="%"
            band={spo2Band}
            range={rangeFor('spo2', '%')}
          />
        )}
        {v.weight != null && (
          <Metric
            label={t('records.vitals.weight')}
            value={String(v.weight)}
            unit="kg"
            band={null}
            range={null}
          />
        )}
        {v.bmi != null && (
          <Metric label={t('records.vitals.bmi')} value={String(v.bmi)} unit="" band={null} range={null} />
        )}
      </View>

      <Text style={styles.footnote}>{t('records.vitals.footnote')}</Text>
    </Card>
  );
}

function rangeFor(field: BandedVital, unit: string): string {
  return `${usualRange(field)} ${unit}`.trim();
}

function Metric({
  label,
  value,
  unit,
  band,
  range,
}: {
  label: string;
  value: string;
  unit: string;
  /** `null` when OPES has no reference band for this measurement. */
  band: VitalBand | null;
  /** `null` when there is no range to show. */
  range: string | null;
}) {
  const { t } = useTranslation();
  const tone = statusMap[toneForBand(band)];
  const off = band === 'outside' || band === 'critical';
  const badgeKey = band && band !== 'normal' ? bandKey(band) : null;
  const badge = badgeKey ? t(badgeKey) : null;

  return (
    <View style={[styles.metric, off && styles.metricOff, off && { borderColor: tone.fg, backgroundColor: tone.bg }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, off && { color: tone.fg }]}>
        {value}
        {unit ? <Text style={[styles.metricUnit, off && { color: tone.fg }]}> {unit}</Text> : null}
      </Text>
      {badge ? (
        <Text
          style={[styles.metricBadge, { color: tone.fg }]}
          accessibilityLabel={t('records.vitals.bandA11y', { label, band: badge })}
        >
          {badge}
        </Text>
      ) : null}
      <Text style={styles.metricRange}>
        {range ? t('records.vitals.usualRange', { range }) : t('records.vitals.noRange')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  date: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.blue, marginBottom: 8 },
  notice: { borderRadius: radii.sm, padding: spacing.sm, marginBottom: spacing.sm },
  noticeText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { minWidth: 104, flexGrow: 1, flexBasis: '30%', paddingVertical: 2 },
  metricOff: { borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 6 },
  metricLabel: { fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.textMuted },
  metricValue: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
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
});
