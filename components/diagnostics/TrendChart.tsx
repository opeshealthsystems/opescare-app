/**
 * The DIA-003 trend chart — the expo-router port of
 * `UIUX/src/screens/diagnostics/TrendChart.tsx`.
 *
 * A real plot of the analyte's series: dashed reference limits, an area under
 * the line, a labelled point per result, and out-of-range points painted in
 * their flag colour (a critical point gets the large red ring so it cannot be
 * missed). It plots ONLY what `LabTrend.points` contains — nothing is
 * interpolated, smoothed or invented.
 *
 * This is the one place a raw `<Svg>` is legitimate — it is a chart, not an
 * icon. Every colour still comes from the OPES UI kit's token object
 * (`@/components/opes-ui`), never a literal. `react-native-svg` renders on
 * iOS, Android and web.
 *
 * Changes from the OPES source: `../../i18n` → `react-i18next` under the
 * `opesDiagnostics` prefix; `../../api` → `@/lib/api/labsQueries` (types only).
 */
import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { ResultFlag } from '@/lib/api/labsQueries';
import { colors, typography } from '@/components/opes-ui';
import { colorForFlag, fmtAxisDate, trimNum } from './shared';

export type TrendChartPoint = { recorded_at: string | null; value: number; flag: ResultFlag };

const H = 250;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 30;
const PAD_B = 44;

export function TrendChart({
  points,
  refLow,
  refHigh,
  unit,
}: {
  points: TrendChartPoint[];
  refLow: number | null;
  refHigh: number | null;
  unit: string | null;
}) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (points.length === 0) return <View style={styles.wrap} onLayout={onLayout} />;
  if (width < 40) return <View style={[styles.wrap, { height: H }]} onLayout={onLayout} />;

  const values = points.map((p) => p.value);
  const bounds = [...values, ...(refLow != null ? [refLow] : []), ...(refHigh != null ? [refHigh] : [])];
  const rawMin = Math.min(...bounds);
  const rawMax = Math.max(...bounds);
  const span = rawMax - rawMin || Math.max(Math.abs(rawMax), 1);
  const min = rawMin - span * 0.22;
  const max = rawMax + span * 0.22;

  const plotW = width - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const x = (i: number) => PAD_L + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1));
  const y = (v: number) => PAD_T + plotH - ((v - min) / (max - min)) * plotH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${PAD_T + plotH} L${x(0)},${PAD_T + plotH} Z`;

  const ticks = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <Svg width={width} height={H}>
        {/* y grid + labels */}
        {ticks.map((tick, i) => (
          <React.Fragment key={`t${i}`}>
            <Line
              x1={PAD_L}
              x2={width - PAD_R}
              y1={y(tick)}
              y2={y(tick)}
              stroke={colors.divider}
              strokeWidth={1}
            />
            <SvgText
              x={PAD_L - 8}
              y={y(tick) + 4}
              fontSize={10}
              fontFamily={typography.fontFamily.regular}
              fill={colors.textMuted}
              textAnchor="end"
            >
              {trimNum(Number(tick.toFixed(1)))}
            </SvgText>
          </React.Fragment>
        ))}

        {/* unit caption */}
        {!!unit && (
          <SvgText
            x={PAD_L - 34}
            y={PAD_T - 14}
            fontSize={10}
            fontFamily={typography.fontFamily.medium}
            fill={colors.textSecondary}
          >
            {unit}
          </SvgText>
        )}

        {/* axes */}
        <Line x1={PAD_L} x2={PAD_L} y1={PAD_T - 6} y2={PAD_T + plotH} stroke={colors.border} strokeWidth={1} />
        <Line
          x1={PAD_L}
          x2={width - PAD_R}
          y1={PAD_T + plotH}
          y2={PAD_T + plotH}
          stroke={colors.border}
          strokeWidth={1}
        />

        {/* reference limits */}
        {refHigh != null && (
          <>
            <Line
              x1={PAD_L}
              x2={width - PAD_R}
              y1={y(refHigh)}
              y2={y(refHigh)}
              stroke={colors.statusNormal}
              strokeWidth={1}
              strokeDasharray="5 4"
            />
            <SvgText
              x={width - PAD_R}
              y={y(refHigh) - 6}
              fontSize={10}
              fontFamily={typography.fontFamily.medium}
              fill={colors.statusNormal}
              textAnchor="end"
            >
              {t('opesDiagnostics.trend.chartUpperLimit', {
                value: `${trimNum(refHigh)}${unit ? ` ${unit}` : ''}`,
              })}
            </SvgText>
          </>
        )}
        {refLow != null && (
          <>
            <Line
              x1={PAD_L}
              x2={width - PAD_R}
              y1={y(refLow)}
              y2={y(refLow)}
              stroke={colors.statusCritical}
              strokeWidth={1}
              strokeDasharray="5 4"
            />
            <SvgText
              x={width - PAD_R}
              y={y(refLow) + 14}
              fontSize={10}
              fontFamily={typography.fontFamily.medium}
              fill={colors.statusCritical}
              textAnchor="end"
            >
              {t('opesDiagnostics.trend.chartLowerLimit', {
                value: `${trimNum(refLow)}${unit ? ` ${unit}` : ''}`,
              })}
            </SvgText>
          </>
        )}

        {/* series */}
        <Path d={area} fill={colors.tintBlueBg} fillOpacity={0.75} />
        <Path d={line} stroke={colors.blue} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => {
          const last = i === points.length - 1;
          const tone = colorForFlag(p.flag);
          const isCritical = p.flag === 'critical';
          const dot = p.flag === 'normal' ? colors.blue : tone;
          return (
            <React.Fragment key={`p${i}`}>
              {isCritical && <Circle cx={x(i)} cy={y(p.value)} r={12} fill={colors.statusCriticalBg} />}
              <Circle
                cx={x(i)}
                cy={y(p.value)}
                r={last || isCritical ? 7 : 5}
                fill={last || isCritical ? colors.surface : dot}
                stroke={dot}
                strokeWidth={last || isCritical ? 3 : 2}
              />
              <SvgText
                x={x(i)}
                y={y(p.value) - (isCritical ? 20 : 16)}
                fontSize={11}
                fontFamily={typography.fontFamily.semiBold}
                fill={p.flag === 'normal' ? colors.textPrimary : tone}
                textAnchor="middle"
              >
                {trimNum(p.value)}
              </SvgText>

              {/* x labels */}
              <SvgText
                x={x(i)}
                y={PAD_T + plotH + 16}
                fontSize={10}
                fontFamily={typography.fontFamily.regular}
                fill={last ? colors.link : colors.textSecondary}
                textAnchor="middle"
              >
                {fmtAxisDate(p.recorded_at)[0]}
              </SvgText>
              <SvgText
                x={x(i)}
                y={PAD_T + plotH + 29}
                fontSize={10}
                fontFamily={typography.fontFamily.regular}
                fill={last ? colors.link : colors.textSecondary}
                textAnchor="middle"
              >
                {fmtAxisDate(p.recorded_at)[1]}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
});
