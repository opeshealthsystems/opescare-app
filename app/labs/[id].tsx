import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  FlaskConical,
  Gauge,
  Minus,
  RotateCcw,
  ShieldCheck,
  StickyNote,
  TestTube,
  WifiOff,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { colors } from '../../theme/tokens';
import { useLabOrderDetail, type LabOrderSummary, type LabResultParameter } from '../../lib/api/queries';
import { parseNumericValue, parseReferenceRange, referenceScalePositions } from '../../lib/api/labsQueries';

function statusLabelKey(status: string): string {
  switch (status) {
    case 'pending':
      return 'labs.statusPending';
    case 'collected':
      return 'labs.statusCollected';
    case 'processing':
      return 'labs.statusProcessing';
    case 'resulted':
      return 'labs.statusResulted';
    case 'cancelled':
      return 'labs.statusCancelled';
    default:
      return 'labs.statusPending';
  }
}

function statusStyles(statusColor: LabOrderSummary['status_color']): { text: string; surface: string } {
  switch (statusColor) {
    case 'success':
      return { text: 'text-success', surface: colors.semantic.successSurface };
    case 'info':
      return { text: 'text-info', surface: colors.semantic.infoSurface };
    case 'warning':
      return { text: 'text-warning', surface: colors.semantic.warningSurface };
    default:
      return { text: 'text-navy-muted', surface: colors.cream[200] };
  }
}

function urgencyLabelKey(urgency: string): string {
  switch (urgency) {
    case 'urgent':
      return 'labs.urgencyUrgent';
    case 'stat':
      return 'labs.urgencyStat';
    default:
      return 'labs.urgencyRoutine';
  }
}

/**
 * Human label for a result's flag.
 *
 * Deliberately not a plain key lookup: an unrecognised flag code on a result
 * the server marked abnormal must never fall through to "Normal", which is
 * exactly what a `default: 'labs.flagNormal'` switch would do. Unknown codes
 * on an abnormal result read as "Abnormal" — still translated, never wrong.
 */
function flagLabel(result: LabResultParameter, t: TFunction): string {
  switch (result.flag) {
    case 'H':
      return t('labs.flagHigh');
    case 'HH':
      return t('labs.flagCriticalHigh');
    case 'L':
      return t('labs.flagLow');
    case 'LL':
      return t('labs.flagCriticalLow');
    case 'abnormal':
      return t('labs.flagAbnormal');
    default:
      return result.is_abnormal ? t('labs.flagAbnormal') : t('labs.flagNormal');
  }
}

type Severity = 'normal' | 'warning' | 'critical';

/**
 * How loudly one parameter should read.
 *
 * `is_abnormal` is the server's own verdict and is authoritative — a result
 * the lab flagged must never render as normal just because its letter code is
 * one this client does not recognise. The letter code only chooses *how* loud:
 * HH/LL (critical high/low) escalate to danger, a plain H/L sits at warning.
 */
function severityOf(result: LabResultParameter): Severity {
  if (result.flag === 'HH' || result.flag === 'LL') return 'critical';
  if (result.flag === 'H' || result.flag === 'L') return 'warning';
  if (result.is_abnormal || result.flag === 'abnormal') return 'critical';
  return 'normal';
}

function severityStyles(severity: Severity): {
  text: string;
  surface: string;
  accent: string;
  rail: string;
} {
  switch (severity) {
    case 'warning':
      return {
        text: 'text-warning',
        surface: colors.semantic.warningSurface,
        accent: colors.semantic.warning,
        rail: colors.semantic.warning,
      };
    case 'critical':
      return {
        text: 'text-danger',
        surface: colors.semantic.dangerSurface,
        accent: colors.semantic.danger,
        rail: colors.semantic.danger,
      };
    default:
      return {
        text: 'text-success',
        surface: colors.semantic.successSurface,
        accent: colors.semantic.success,
        rail: colors.cream[300],
      };
  }
}

/** Direction of travel out of the reference interval, when the lab told us. */
function directionIcon(flag: string | null): LucideIcon {
  if (flag === 'H' || flag === 'HH') return ArrowUp;
  if (flag === 'L' || flag === 'LL') return ArrowDown;
  return Minus;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** 0–1 ratio → a percentage React Native's style types accept. */
function pct(ratio: number): `${number}%` {
  return `${Math.round(ratio * 1000) / 10}%` as `${number}%`;
}

/**
 * One lab order in full: who ordered it, where, when it moved through the
 * pipeline, and every parameter the laboratory published with its value, unit,
 * reference range and abnormal flag.
 *
 * The single most important job of this screen is making an out-of-range value
 * unmissable, so a flagged parameter gets four reinforcing signals — a coloured
 * rail, a tinted surface, a directional arrow, and the value itself in the
 * semantic colour — plus a plotted scale whenever the reference range is
 * numerically parseable. NOTE: no lab result exists for the demo patient, so
 * everything below the "Results" heading is built but unexercised against real
 * data; only the empty-results branch has actually been seen.
 */
export default function LabOrderDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { t } = useTranslation();
  const router = useRouter();
  const { data: order, isLoading, isError, refetch } = useLabOrderDetail(id);

  const results = order?.results ?? [];
  const abnormalCount = results.filter((r) => r.is_abnormal).length;
  const awaitingResults =
    !!order && results.length === 0 && order.status !== 'cancelled' && order.status !== 'resulted';

  return (
    <Screen className="px-0">
      <View className="flex-row items-center px-6 pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('labs.back')}
          className="h-11 w-11 items-center justify-center rounded-full border border-brand-300"
        >
          <ArrowLeft size={18} color={colors.brand[600]} />
        </Pressable>
        <View className="ml-3 flex-1">
          <Text className="text-2xl font-extrabold text-navy-text">{t('labs.detailTitle')}</Text>
          <Text className="mt-0.5 text-xs text-navy-secondary">{t('labs.detailSubtitle')}</Text>
        </View>
      </View>

      {isLoading ? (
        <DetailSkeleton />
      ) : isError || !order ? (
        <View className="flex-1 items-center justify-center px-10">
          <View
            className="h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: isError ? colors.semantic.dangerSurface : colors.cream[200] }}
          >
            {isError ? (
              <WifiOff size={26} color={colors.semantic.danger} />
            ) : (
              <FlaskConical size={26} color={colors.navy.muted} />
            )}
          </View>
          <Text className="mt-4 text-center text-base font-bold text-navy-text">
            {isError ? t('labs.detailLoadError') : t('labs.notFound')}
          </Text>
          <Text className="mt-1 text-center text-sm leading-5 text-navy-secondary">
            {isError ? t('labs.loadErrorHint') : t('labs.notFoundHint')}
          </Text>
          {isError ? (
            <Pressable
              onPress={() => refetch()}
              accessibilityRole="button"
              className="mt-5 flex-row items-center rounded-full border border-brand-300 px-5 py-2.5"
            >
              <RotateCcw size={14} color={colors.brand[600]} />
              <Text className="ml-2 text-sm font-semibold text-brand-600">{t('labs.retry')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero — what was tested, by whom, and where it stands. */}
          <View className="mt-2 rounded-2xl border border-cream-300 bg-white p-4">
            <View className="flex-row items-start">
              <View
                className="h-12 w-12 items-center justify-center rounded-2xl"
                style={{
                  backgroundColor: order.has_abnormal
                    ? colors.semantic.dangerSurface
                    : colors.semantic.infoSurface,
                }}
              >
                <FlaskConical
                  size={22}
                  color={order.has_abnormal ? colors.semantic.danger : colors.semantic.info}
                />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-lg font-extrabold leading-6 text-navy-text">{order.test_name}</Text>
                {order.test_code ? (
                  <View
                    className="mt-1 self-start rounded-md px-1.5 py-0.5"
                    style={{ backgroundColor: colors.cream[200] }}
                  >
                    <Text className="text-[10px] font-semibold tracking-wide text-navy-secondary">
                      {order.test_code}
                    </Text>
                  </View>
                ) : null}
                {order.facility_name ? (
                  <View className="mt-1.5 flex-row items-center">
                    <Building2 size={13} color={colors.navy.muted} />
                    <Text className="ml-1.5 flex-1 text-xs text-navy-secondary" numberOfLines={2}>
                      {order.facility_name}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
              <View
                className="rounded-full px-3 py-1"
                style={{ backgroundColor: statusStyles(order.status_color).surface }}
              >
                <Text className={`text-xs font-semibold ${statusStyles(order.status_color).text}`}>
                  {t(statusLabelKey(order.status))}
                </Text>
              </View>
              {order.urgency && order.urgency !== 'routine' ? (
                <View
                  className="flex-row items-center rounded-full px-3 py-1"
                  style={{ backgroundColor: colors.semantic.warningSurface }}
                >
                  <Gauge size={12} color={colors.semantic.warning} />
                  <Text className="ml-1 text-xs font-semibold text-warning">{t(urgencyLabelKey(order.urgency))}</Text>
                </View>
              ) : null}
              {order.has_abnormal ? (
                <View
                  className="flex-row items-center rounded-full px-3 py-1"
                  style={{ backgroundColor: colors.semantic.dangerSurface }}
                >
                  <AlertTriangle size={12} color={colors.semantic.danger} />
                  <Text className="ml-1 text-xs font-semibold text-danger">{t('labs.abnormalBadge')}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Timeline strip — the four moments a lab order passes through,
              read left to right like the summary strips in the reference set. */}
          <View className="mt-4 flex-row rounded-2xl border border-cream-300 bg-white px-1 py-4">
            <TimelineCell
              icon={Gauge}
              label={t('labs.urgency')}
              value={t(urgencyLabelKey(order.urgency))}
              done
            />
            <TimelineDivider />
            <TimelineCell
              icon={Calendar}
              label={t('labs.orderedAt')}
              value={formatDate(order.ordered_at) ?? '—'}
              done={!!order.ordered_at}
            />
            <TimelineDivider />
            <TimelineCell
              icon={TestTube}
              label={t('labs.collectedAt')}
              value={formatDate(order.collected_at) ?? '—'}
              done={!!order.collected_at}
            />
            <TimelineDivider />
            <TimelineCell
              icon={CheckCircle2}
              label={t('labs.resultedAt')}
              value={formatDate(order.resulted_at) ?? '—'}
              done={!!order.resulted_at}
            />
          </View>

          {abnormalCount > 0 ? (
            <View
              className="mt-4 flex-row items-start rounded-2xl p-3.5"
              style={{ backgroundColor: colors.semantic.dangerSurface }}
            >
              <AlertTriangle size={18} color={colors.semantic.danger} />
              <View className="ml-2.5 flex-1">
                <Text className="text-sm font-bold text-danger">
                  {t('labs.abnormalSummaryTitle', { count: abnormalCount, total: results.length })}
                </Text>
                <Text className="mt-0.5 text-xs leading-4 text-navy-secondary">
                  {t('labs.abnormalSummaryBody')}
                </Text>
              </View>
            </View>
          ) : null}

          {order.clinical_indication ? (
            <NoteCard title={t('labs.clinicalIndication')} body={order.clinical_indication} />
          ) : null}
          {order.notes ? <NoteCard title={t('labs.notes')} body={order.notes} /> : null}

          <View className="mb-3 mt-6 flex-row items-end justify-between">
            <Text className="text-base font-extrabold text-navy-text">
              {t('labs.results')}
              {results.length > 0 ? ` (${results.length})` : ''}
            </Text>
            {results.length > 0 ? (
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <LegendDot color={colors.semantic.success} label={t('labs.legendNormal')} />
                <LegendDot color={colors.semantic.danger} label={t('labs.legendOutOfRange')} />
              </View>
            ) : null}
          </View>

          {results.length === 0 ? (
            <View className="items-center rounded-2xl border border-cream-300 bg-white px-5 py-8">
              <View
                className="h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.cream[200] }}
              >
                <TestTube size={24} color={colors.navy.muted} />
              </View>
              <Text className="mt-3 text-center text-sm font-bold text-navy-text">
                {order.status === 'cancelled' ? t('labs.cancelledTitle') : t('labs.noResultsYet')}
              </Text>
              <Text className="mt-1 text-center text-xs leading-4 text-navy-secondary">
                {order.status === 'cancelled' ? t('labs.cancelledBody') : t('labs.noResultsYetBody')}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {results.map((result) => (
                <ResultCard key={result.id} result={result} t={t} />
              ))}
            </View>
          )}

          {/* A patient waiting on a sample can still act: the directory lists
              the real licensed laboratories, so send them there rather than
              leaving the screen as a dead end. */}
          {awaitingResults ? (
            <Pressable
              onPress={() => router.push({ pathname: '/care-map', params: { type: 'laboratory' } })}
              accessibilityRole="button"
              className="mt-4 flex-row items-center rounded-2xl border border-brand-300 bg-white p-4"
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-50">
                <FlaskConical size={18} color={colors.brand[600]} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-sm font-bold text-navy-text">{t('labs.findLab')}</Text>
                <Text className="mt-0.5 text-xs text-navy-secondary">{t('labs.findLabHint')}</Text>
              </View>
              <ChevronRight size={18} color={colors.brand[600]} />
            </Pressable>
          ) : null}

          <View
            className="mt-4 flex-row items-start rounded-2xl p-3"
            style={{ backgroundColor: colors.semantic.successSurface }}
          >
            <ShieldCheck size={16} color={colors.semantic.success} />
            <Text className="ml-2 flex-1 text-[11px] leading-4 text-navy-secondary">{t('labs.resultDisclaimer')}</Text>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

function TimelineCell({
  icon: Icon,
  label,
  value,
  done,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  done: boolean;
}) {
  return (
    <View className="flex-1 items-center px-1">
      <Icon size={16} color={done ? colors.brand[600] : colors.navy.muted} />
      <Text className="mt-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-navy-muted">
        {label}
      </Text>
      <Text
        className={`mt-0.5 text-center text-[11px] font-bold ${done ? 'text-navy-text' : 'text-navy-muted'}`}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function TimelineDivider() {
  return <View className="my-1 w-px bg-cream-200" />;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center">
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <Text className="ml-1.5 text-[11px] text-navy-secondary">{label}</Text>
    </View>
  );
}

function NoteCard({ title, body }: { title: string; body: string }) {
  return (
    <View className="mt-4 rounded-2xl border border-cream-300 bg-white p-4">
      <View className="flex-row items-center">
        <StickyNote size={15} color={colors.brand[600]} />
        <Text className="ml-2 text-sm font-bold text-navy-text">{title}</Text>
      </View>
      <Text className="mt-2 text-sm leading-5 text-navy-secondary">{body}</Text>
    </View>
  );
}

/**
 * A single resulted parameter. Everything about the layout exists to answer
 * one question at a glance: is this value where it should be?
 */
function ResultCard({ result, t }: { result: LabResultParameter; t: TFunction }) {
  const severity = severityOf(result);
  const styles = severityStyles(severity);
  const DirectionIcon = directionIcon(result.flag);
  const abnormal = severity !== 'normal';

  const band = parseReferenceRange(result.reference_range);
  const numericValue = parseNumericValue(result.value);
  const scale = band && numericValue !== null ? referenceScalePositions(numericValue, band) : null;

  return (
    <View
      className="flex-row overflow-hidden rounded-2xl border bg-white"
      style={{ borderColor: abnormal ? styles.accent : colors.cream[300] }}
    >
      {/* Colour rail: the fastest possible read down a long result list. */}
      <View style={{ width: 4, backgroundColor: styles.rail }} />
      <View className="flex-1 p-4">
        <View className="flex-row items-start justify-between">
          <Text className="mr-2 flex-1 text-sm font-bold leading-5 text-navy-text">{result.parameter_name}</Text>
          <View
            className="flex-row items-center rounded-full px-2.5 py-1"
            style={{ backgroundColor: styles.surface }}
          >
            <DirectionIcon size={12} color={styles.accent} />
            <Text className={`ml-1 text-[11px] font-bold ${styles.text}`}>{flagLabel(result, t)}</Text>
          </View>
        </View>

        <View className="mt-2 flex-row items-end" style={{ gap: 5 }}>
          <Text
            className="text-3xl font-extrabold leading-9"
            style={{ color: abnormal ? styles.accent : colors.navy.text }}
          >
            {result.value}
          </Text>
          {result.unit ? <Text className="mb-1.5 text-sm text-navy-secondary">{result.unit}</Text> : null}
        </View>

        {result.reference_range ? (
          <Text className="mt-1 text-xs text-navy-muted">
            {t('labs.referenceRange')}: {result.reference_range}
            {result.unit ? ` ${result.unit}` : ''}
          </Text>
        ) : null}

        {/* Plotted scale — drawn only when both the value and a two-sided
            reference interval parse as numbers. Free-text ranges
            ("Negative", "< 200") simply fall back to the line above. */}
        {scale ? (
          <View className="mt-3">
            <View className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: colors.cream[200] }}>
              <View
                className="absolute h-2 rounded-full"
                style={{
                  top: 0,
                  left: pct(scale.bandStart),
                  width: pct(Math.max(0.02, scale.bandEnd - scale.bandStart)),
                  backgroundColor: colors.semantic.successSurface,
                }}
              />
            </View>
            <View
              className="absolute h-3.5 w-3.5 rounded-full border-2 border-white"
              style={{
                left: pct(scale.value),
                marginLeft: -7,
                top: -3,
                backgroundColor: styles.accent,
              }}
            />
            <View className="mt-2 flex-row justify-between">
              <Text className="text-[10px] text-navy-muted">{t('labs.scaleLow')}</Text>
              <Text className="text-[10px] font-semibold text-navy-secondary">{t('labs.scaleNormalBand')}</Text>
              <Text className="text-[10px] text-navy-muted">{t('labs.scaleHigh')}</Text>
            </View>
          </View>
        ) : null}

        {result.notes ? (
          <Text className="mt-2.5 text-xs leading-4 text-navy-secondary">{result.notes}</Text>
        ) : null}
      </View>
    </View>
  );
}

function DetailSkeleton() {
  return (
    <View className="flex-1 px-6 pt-2" style={{ gap: 16 }}>
      <View className="rounded-2xl border border-cream-300 bg-white p-4">
        <View className="flex-row items-center">
          <View className="h-12 w-12 rounded-2xl bg-cream-200" />
          <View className="ml-3 flex-1">
            <View className="h-4 w-3/4 rounded-full bg-cream-200" />
            <View className="mt-2 h-3 w-1/2 rounded-full bg-cream-200" />
          </View>
        </View>
        <View className="mt-4 h-6 w-1/3 rounded-full bg-cream-200" />
      </View>
      <View className="h-24 rounded-2xl border border-cream-300 bg-white" />
      <View className="h-32 rounded-2xl border border-cream-300 bg-white" />
    </View>
  );
}
