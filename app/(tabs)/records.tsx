import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  Building2,
  Calendar,
  ChevronRight,
  CircleAlert,
  Download,
  FileText,
  FlaskConical,
  Droplet,
  HeartPulse,
  Hospital,
  MapPin,
  NotebookPen,
  Pill,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { useAuthStore } from '../../lib/store/auth';
import { useAllergies, useClinical, useImmunizations, useTimeline } from '../../lib/api/queries';
import { colors } from '../../theme/tokens';

/**
 * Records / Timeline — the patient's longitudinal clinical record.
 *
 * Merges GET /mobile/timeline (visits, resulted labs, prescriptions) with
 * /mobile/allergies, /mobile/clinical (conditions) and /mobile/immunizations
 * into one chronological feed, newest first, grouped by month.
 *
 * Three states are deliberately distinct: a skeleton while the four queries
 * are in flight, a danger-tinted retry card when *every* query failed, and a
 * reassuring onboarding-style empty state when the record is genuinely empty
 * (the common case for a newly issued Health ID). A partial failure — some
 * queries up, some down — gets its own inline strip rather than being hidden,
 * so the screen never implies a section is empty when it merely failed.
 *
 * `entered-in-error` clinical rows are never surfaced to the patient, and no
 * value on this screen is synthesized: counts come from the responses
 * themselves, and a section that failed renders "—", never 0.
 */

type FeedType = 'visit' | 'lab_result' | 'prescription' | 'allergy' | 'condition' | 'immunization';
type FilterValue = 'all' | FeedType;

interface FeedItem {
  key: string;
  type: FeedType;
  title: string;
  /** Clinical payload line — test name, visit type, severity, dose. */
  descriptor: string | null;
  facility: string | null;
  dateLabel: string | null;
  sortValue: number;
  /** A route that actually exists under app/, or null when there is no detail screen. */
  href: string | null;
  actionLabel: string | null;
}

interface FeedGroup {
  key: string;
  label: string;
  items: FeedItem[];
}

const FEED_META: Record<FeedType, { icon: LucideIcon; color: string; surface: string }> = {
  visit: { icon: Stethoscope, color: colors.navy.secondary, surface: colors.cream[200] },
  lab_result: { icon: FlaskConical, color: colors.semantic.info, surface: colors.semantic.infoSurface },
  prescription: { icon: Pill, color: colors.brand[600], surface: colors.brand[50] },
  allergy: { icon: AlertTriangle, color: colors.semantic.danger, surface: colors.semantic.dangerSurface },
  condition: { icon: Activity, color: colors.semantic.warning, surface: colors.semantic.warningSurface },
  immunization: { icon: Syringe, color: colors.semantic.success, surface: colors.semantic.successSurface },
};

const FILTERS: FilterValue[] = [
  'all',
  'visit',
  'lab_result',
  'prescription',
  'condition',
  'allergy',
  'immunization',
];

/** Turns a raw enum-ish API token ("lab-only") into readable fallback text. */
function humanize(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/[-_]/g, ' ');
}

/**
 * The timeline endpoint returns an English summary shaped
 * "Lab result — Full Blood Count". The label before the dash is chrome we can
 * localise; the part after it is real clinical data and is shown verbatim.
 */
function summaryTail(summary: string): string | null {
  const idx = summary.indexOf('—');
  const tail = idx === -1 ? summary : summary.slice(idx + 1);
  const trimmed = tail.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function RecordsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const patient = useAuthStore((s) => s.patient);
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';

  const timeline = useTimeline();
  const allergies = useAllergies();
  const clinical = useClinical();
  const immunizations = useImmunizations();

  const [filter, setFilter] = useState<FilterValue>('all');

  const queries = [timeline, allergies, clinical, immunizations];
  const isLoading = queries.some((q) => q.isLoading);
  const isRefreshing = queries.some((q) => q.isRefetching);
  const failedCount = queries.filter((q) => q.isError).length;
  const isError = !isLoading && failedCount === queries.length;
  const isPartial = !isLoading && failedCount > 0 && failedCount < queries.length;

  const refetchAll = () => {
    timeline.refetch();
    allergies.refetch();
    clinical.refetch();
    immunizations.refetch();
  };

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const enumLabel = (group: string, value: string | null | undefined) => {
    if (!value) return null;
    return t(`records.${group}.${value}`, { defaultValue: humanize(value) });
  };

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    const ms = (iso: string | null | undefined) => {
      if (!iso) return 0;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    };

    for (const ev of timeline.data?.timeline ?? []) {
      const tail = summaryTail(ev.summary);
      let descriptor: string | null = tail;
      let href: string | null = null;
      let actionLabel: string | null = null;

      if (ev.event_type === 'lab_result') {
        // The tail is the test name — real clinical data, shown as-is.
        href = `/labs/${ev.id}`;
        actionLabel = t('records.action.viewLab');
      } else if (ev.event_type === 'prescription') {
        // "3 item(s)" — recover the real count so it can be pluralised properly.
        const n = tail ? Number.parseInt(tail, 10) : Number.NaN;
        descriptor = Number.isNaN(n) ? tail : t('records.item.prescriptionItems', { count: n });
        href = `/prescriptions/${ev.id}`;
        actionLabel = t('records.action.viewPrescription');
      } else {
        // Visit: the tail is a visit_type token (outpatient, lab-only, …).
        descriptor = tail ? enumLabel('visitType', tail) : null;
      }

      items.push({
        key: `${ev.event_type}-${ev.id}`,
        type: ev.event_type,
        title: t(`records.item.${ev.event_type === 'visit' ? 'visitTitle' : ev.event_type === 'lab_result' ? 'labTitle' : 'prescriptionTitle'}`),
        descriptor,
        facility: ev.facility_name,
        dateLabel: formatDate(ev.occurred_at),
        sortValue: ms(ev.occurred_at),
        href,
        actionLabel,
      });
    }

    for (const a of allergies.data?.allergies ?? []) {
      if (a.status === 'entered-in-error') continue;
      const date = formatDate(a.recorded);
      items.push({
        key: `allergy-${a.id}`,
        type: 'allergy',
        title: t('records.item.allergyTitle', { substance: a.substance }),
        descriptor: enumLabel('status', a.severity),
        facility: null,
        dateLabel: date ? t('records.item.recordedOn', { date }) : null,
        sortValue: ms(a.recorded),
        href: null,
        actionLabel: null,
      });
    }

    for (const c of clinical.data?.conditions ?? []) {
      if (c.status === 'entered-in-error') continue;
      const date = formatDate(c.recorded);
      items.push({
        key: `condition-${c.id}`,
        type: 'condition',
        title: c.display_name,
        descriptor: enumLabel('status', c.status),
        facility: null,
        dateLabel: date ? t('records.item.recordedOn', { date }) : null,
        sortValue: ms(c.recorded),
        href: null,
        actionLabel: null,
      });
    }

    for (const im of immunizations.data?.immunizations ?? []) {
      const date = formatDate(im.administered_at);
      items.push({
        key: `immunization-${im.id}`,
        type: 'immunization',
        title: im.vaccine_name,
        descriptor: im.dose_number
          ? t('records.item.immunizationDose', { n: im.dose_number })
          : enumLabel('status', im.status),
        facility: null,
        dateLabel: date ? t('records.item.administeredOn', { date }) : null,
        sortValue: ms(im.administered_at),
        href: null,
        actionLabel: null,
      });
    }

    return items.sort((x, y) => y.sortValue - x.sortValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.data, allergies.data, clinical.data, immunizations.data, locale]);

  const counts = useMemo(() => {
    const c: Record<FilterValue, number> = {
      all: feed.length,
      visit: 0,
      lab_result: 0,
      prescription: 0,
      allergy: 0,
      condition: 0,
      immunization: 0,
    };
    for (const item of feed) c[item.type] += 1;
    return c;
  }, [feed]);

  const visibleFeed = useMemo(
    () => (filter === 'all' ? feed : feed.filter((item) => item.type === filter)),
    [feed, filter],
  );

  /** Month buckets — the feed is already sorted newest-first, so a single pass groups it. */
  const groups = useMemo<FeedGroup[]>(() => {
    const out: FeedGroup[] = [];
    let current: FeedGroup | null = null;
    for (const item of visibleFeed) {
      const d = item.sortValue > 0 ? new Date(item.sortValue) : null;
      const key = d ? `${d.getFullYear()}-${d.getMonth()}` : 'undated';
      if (!current || current.key !== key) {
        current = {
          key,
          label: d
            ? d.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
            : t('records.group.undated'),
          items: [],
        };
        out.push(current);
      }
      current.items.push(item);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFeed, locale]);

  /** A count only means something when its query actually succeeded. */
  const statValue = (failed: boolean, value: number) => (failed ? null : value);
  const unavailable = t('records.summary.unavailable');
  const bloodGroup = allergies.data?.blood_group ?? patient?.blood_group ?? null;
  const activeFilters = FILTERS.filter((f) => f === 'all' || counts[f] > 0);

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refetchAll} tintColor={colors.brand[500]} />
        }
      >
        {/* Header — title block with the export affordance on the right, the
            way the reference screens pair a page title with its primary action. */}
        <View className="mt-2 flex-row items-start">
          <View className="flex-1 pr-3">
            <Text className="text-2xl font-extrabold text-navy-text">{t('records.title')}</Text>
            <Text className="mt-1 text-sm text-navy-secondary">{t('records.subtitle')}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/export-records')}
            accessibilityRole="button"
            accessibilityLabel={t('records.exportA11y')}
            hitSlop={6}
            className="flex-row items-center rounded-full border px-4 py-2.5"
            style={{ borderColor: colors.brand[300], backgroundColor: colors.brand[50] }}
          >
            <Download size={14} color={colors.brand[600]} />
            <Text className="ml-2 text-xs font-bold text-brand-600">{t('records.export')}</Text>
          </Pressable>
        </View>

        {bloodGroup ? (
          <View
            className="mt-3 flex-row items-center self-start rounded-full px-3 py-1.5"
            style={{ backgroundColor: colors.semantic.dangerSurface }}
          >
            <Droplet size={13} color={colors.semantic.danger} />
            <Text className="ml-1.5 text-xs font-bold text-danger">
              {t('records.bloodGroup', { group: bloodGroup })}
            </Text>
          </View>
        ) : null}

        {/* At a glance — four real counts, dividers between them, mirroring the
            reference's summary block. A failed section shows an em dash. */}
        {isError ? null : (
          <View className="mt-5 rounded-2xl bg-white p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-navy-muted">
              {t('records.summary.heading')}
            </Text>
            <View className="mt-3 flex-row">
              <Stat
                icon={AlertTriangle}
                color={colors.semantic.danger}
                label={t('records.summary.allergies')}
                value={isLoading ? undefined : statValue(allergies.isError, counts.allergy)}
                unavailableLabel={unavailable}
                first
              />
              <Stat
                icon={Activity}
                color={colors.semantic.warning}
                label={t('records.summary.conditions')}
                value={isLoading ? undefined : statValue(clinical.isError, counts.condition)}
                unavailableLabel={unavailable}
              />
              <Stat
                icon={Syringe}
                color={colors.semantic.success}
                label={t('records.summary.immunizations')}
                value={isLoading ? undefined : statValue(immunizations.isError, counts.immunization)}
                unavailableLabel={unavailable}
              />
              <Stat
                icon={NotebookPen}
                color={colors.brand[600]}
                label={t('records.summary.events')}
                value={
                  isLoading
                    ? undefined
                    : statValue(timeline.isError, counts.visit + counts.lab_result + counts.prescription)
                }
                unavailableLabel={unavailable}
              />
            </View>
          </View>
        )}

        {/* Browse by type — every tile is a route that exists under app/. */}
        <Text className="mb-3 mt-6 text-xs font-bold uppercase tracking-wide text-navy-muted">
          {t('records.browse.heading')}
        </Text>
        <View className="flex-row gap-3">
          <BrowseTile
            icon={FlaskConical}
            color={colors.semantic.info}
            surface={colors.semantic.infoSurface}
            label={t('records.browse.labs')}
            onPress={() => router.push('/labs')}
          />
          <BrowseTile
            icon={Pill}
            color={colors.brand[600]}
            surface={colors.brand[50]}
            label={t('records.browse.prescriptions')}
            onPress={() => router.push('/prescriptions')}
          />
          <BrowseTile
            icon={FileText}
            color={colors.navy.secondary}
            surface={colors.cream[200]}
            label={t('records.browse.documents')}
            onPress={() => router.push('/documents')}
          />
        </View>

        {isPartial ? (
          <View
            className="mt-5 flex-row items-start rounded-2xl p-4"
            style={{ backgroundColor: colors.semantic.warningSurface }}
          >
            <CircleAlert size={18} color={colors.semantic.warning} />
            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold text-navy-text">{t('records.partial.title')}</Text>
              <Text className="mt-1 text-xs text-navy-secondary">{t('records.partial.body')}</Text>
              <Pressable
                onPress={refetchAll}
                accessibilityRole="button"
                className="mt-3 flex-row items-center self-start"
              >
                <RotateCcw size={13} color={colors.brand[600]} />
                <Text className="ml-1.5 text-xs font-bold text-brand-600">{t('records.partial.retry')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Timeline heading + filters. Filters only make sense once there is
            something to filter, and a chip with a zero count is just noise. */}
        {!isLoading && !isError && feed.length > 0 ? (
          <>
            <View className="mb-3 mt-6 flex-row items-baseline">
              <Text className="text-base font-extrabold text-navy-text">{t('records.timeline.heading')}</Text>
              <Text className="ml-2 text-xs text-navy-muted">
                {t('records.timeline.count', { count: feed.length })}
              </Text>
            </View>
            {/* Negative margin + content padding so the row bleeds to both
                screen edges but the first and last chip still clear them. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="-mx-6"
              contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
            >
              {activeFilters.map((f) => (
                <FilterChip
                  key={f}
                  active={f === filter}
                  label={t(`records.filter.${f}`)}
                  count={counts[f]}
                  onPress={() => setFilter(f)}
                />
              ))}
            </ScrollView>
          </>
        ) : null}

        <View className="mb-3 mt-5">
          {isLoading ? (
            <LoadingState label={t('records.loading')} body={t('records.loadingBody')} />
          ) : isError ? (
            <ErrorState
              title={t('records.error.title')}
              body={t('records.error.body')}
              retry={t('records.error.retry')}
              onRetry={refetchAll}
            />
          ) : feed.length === 0 ? (
            <EmptyState t={t} onFindCare={() => router.push('/care-map')} onBook={() => router.push('/appointments/book')} />
          ) : visibleFeed.length === 0 ? (
            <FilteredEmptyState
              title={t('records.filtered.title')}
              body={t('records.filtered.body')}
              reset={t('records.filtered.reset')}
              onReset={() => setFilter('all')}
            />
          ) : (
            groups.map((group) => (
              <View key={group.key} className="mb-2">
                <View className="mb-3 mt-1 flex-row items-center">
                  <Calendar size={13} color={colors.navy.muted} />
                  <Text className="ml-2 text-xs font-bold uppercase tracking-wide text-navy-secondary">
                    {group.label}
                  </Text>
                  <View className="ml-3 h-px flex-1" style={{ backgroundColor: colors.cream[300] }} />
                </View>
                {group.items.map((item, index) => (
                  <FeedRow
                    key={item.key}
                    item={item}
                    isLast={index === group.items.length - 1}
                    categoryLabel={t(`records.category.${item.type}`)}
                    unknownFacility={t('records.item.unknownFacility')}
                    onPress={item.href ? () => router.push(item.href as string) : undefined}
                  />
                ))}
              </View>
            ))
          )}
        </View>

        {/* Trust footer — the reference screens close with a privacy assurance
            paired with a real action, not a dead reassurance. */}
        <Pressable
          onPress={() => router.push('/privacy')}
          accessibilityRole="button"
          accessibilityLabel={t('records.privacy.action')}
          className="mt-2 flex-row items-center rounded-2xl p-4"
          style={{ backgroundColor: colors.semantic.successSurface }}
        >
          <View
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.white }}
          >
            <ShieldCheck size={18} color={colors.semantic.success} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-navy-text">{t('records.privacy.title')}</Text>
            <Text className="mt-0.5 text-xs text-navy-secondary">{t('records.privacy.body')}</Text>
            <Text className="mt-1.5 text-xs font-bold text-success">{t('records.privacy.action')}</Text>
          </View>
          <ChevronRight size={18} color={colors.semantic.success} />
        </Pressable>

        <View className="h-10" />
      </ScrollView>
    </Screen>
  );
}

/* ------------------------------------------------------------------ pieces */

function Stat({
  icon: Icon,
  color,
  label,
  value,
  unavailableLabel,
  first,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  /** `undefined` while loading, `null` when that query failed. */
  value?: number | null;
  unavailableLabel: string;
  first?: boolean;
}) {
  return (
    <View
      className={`flex-1 items-center ${first ? '' : 'border-l'}`}
      style={first ? undefined : { borderLeftColor: colors.cream[300] }}
      accessibilityLabel={value === null ? `${label}: ${unavailableLabel}` : undefined}
    >
      <Icon size={16} color={color} />
      {value === undefined ? (
        <View className="mt-2 h-6 w-6 rounded" style={{ backgroundColor: colors.cream[200] }} />
      ) : (
        <Text className="mt-1 text-xl font-extrabold text-navy-text">{value === null ? '—' : value}</Text>
      )}
      <Text className="mt-0.5 text-center text-[10px] text-navy-secondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function BrowseTile({
  icon: Icon,
  color,
  surface,
  label,
  onPress,
}: {
  icon: LucideIcon;
  color: string;
  surface: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 items-center rounded-2xl bg-white px-2 py-4"
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: surface }}
      >
        <Icon size={19} color={color} />
      </View>
      <Text className="mt-2 text-center text-[11px] font-semibold text-navy-text" numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function FilterChip({
  active,
  label,
  count,
  onPress,
}: {
  active: boolean;
  label: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="flex-row items-center rounded-full border px-4 py-2"
      style={{
        borderColor: active ? colors.brand[500] : colors.cream[300],
        backgroundColor: active ? colors.brand[500] : colors.white,
      }}
    >
      <Text className="text-xs font-semibold" style={{ color: active ? colors.white : colors.navy.secondary }}>
        {label}
      </Text>
      <View
        className="ml-2 rounded-full px-1.5 py-0.5"
        style={{ backgroundColor: active ? colors.brand[600] : colors.cream[200] }}
      >
        <Text
          className="text-[10px] font-bold"
          style={{ color: active ? colors.white : colors.navy.secondary }}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * One event on the rail. The icon sits on a vertical connector rather than
 * inside the card, so a month of care reads as a continuous thread — the
 * "recent health activity" anatomy from the reference, turned vertical.
 */
function FeedRow({
  item,
  isLast,
  categoryLabel,
  unknownFacility,
  onPress,
}: {
  item: FeedItem;
  isLast: boolean;
  categoryLabel: string;
  unknownFacility: string;
  onPress?: () => void;
}) {
  const meta = FEED_META[item.type];
  const Icon = meta.icon;

  const card = (
    <>
      <View className="flex-row items-start">
        <Text className="flex-1 pr-2 text-sm font-bold text-navy-text">{item.title}</Text>
        {onPress ? <ChevronRight size={16} color={colors.navy.muted} /> : null}
      </View>

      <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 8 }}>
        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: meta.surface }}>
          <Text className="text-[10px] font-bold" style={{ color: meta.color }}>
            {categoryLabel}
          </Text>
        </View>
        {item.descriptor ? (
          <Text className="text-xs font-semibold text-navy-secondary">{item.descriptor}</Text>
        ) : null}
      </View>

      {item.type === 'visit' || item.type === 'lab_result' || item.type === 'prescription' ? (
        <View className="mt-2.5 flex-row items-center">
          <Building2 size={12} color={colors.navy.muted} />
          <Text className="ml-1.5 flex-1 text-xs text-navy-muted" numberOfLines={1}>
            {item.facility ?? unknownFacility}
          </Text>
        </View>
      ) : null}

      {item.dateLabel ? (
        <View className="mt-1 flex-row items-center">
          <Calendar size={12} color={colors.navy.muted} />
          <Text className="ml-1.5 text-xs text-navy-muted">{item.dateLabel}</Text>
        </View>
      ) : null}

      {onPress && item.actionLabel ? (
        <View
          className="mt-3 flex-row items-center justify-end border-t pt-3"
          style={{ borderTopColor: colors.cream[200] }}
        >
          <Text className="text-xs font-bold text-brand-600">{item.actionLabel}</Text>
          <ChevronRight size={14} color={colors.brand[600]} />
        </View>
      ) : null}
    </>
  );

  return (
    <View className="flex-row">
      <View className="w-10 items-center">
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: meta.surface }}
        >
          <Icon size={18} color={meta.color} />
        </View>
        {isLast ? null : (
          <View className="my-1 w-px flex-1" style={{ backgroundColor: colors.cream[300] }} />
        )}
      </View>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}${item.actionLabel ? ` — ${item.actionLabel}` : ''}`}
          className="mb-3 ml-3 flex-1 rounded-2xl bg-white p-4"
        >
          {card}
        </Pressable>
      ) : (
        <View className="mb-3 ml-3 flex-1 rounded-2xl bg-white p-4">{card}</View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ states */

/** Slow, low-contrast breathing so the skeleton reads as "working", not "broken". */
function Pulse({ children }: { children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

function Bar({ w, h = 10 }: { w: number | `${number}%`; h?: number }) {
  return <View style={{ width: w, height: h, borderRadius: 5, backgroundColor: colors.cream[200] }} />;
}

/** Loading: the shape of the answer, not a spinner over a blank screen. */
function LoadingState({ label, body }: { label: string; body: string }) {
  return (
    <View>
      <Pulse>
        {[0, 1, 2].map((i) => (
          <View key={i} className="mb-3 flex-row">
            <View className="w-10 items-center">
              <View className="h-10 w-10 rounded-full" style={{ backgroundColor: colors.cream[200] }} />
              {i === 2 ? null : (
                <View className="my-1 w-px flex-1" style={{ backgroundColor: colors.cream[300] }} />
              )}
            </View>
            <View className="ml-3 flex-1 rounded-2xl bg-white p-4">
              <Bar w="70%" h={12} />
              <View className="mt-3 flex-row" style={{ gap: 8 }}>
                <Bar w={64} h={16} />
                <Bar w={48} h={16} />
              </View>
              <View className="mt-3">
                <Bar w="45%" />
              </View>
            </View>
          </View>
        ))}
      </Pulse>
      <View className="mt-1 items-center">
        <Text className="text-sm font-semibold text-navy-secondary">{label}</Text>
        <Text className="mt-1 text-center text-xs text-navy-muted">{body}</Text>
      </View>
    </View>
  );
}

/** Error: named, reassuring about data integrity, and recoverable in one tap. */
function ErrorState({
  title,
  body,
  retry,
  onRetry,
}: {
  title: string;
  body: string;
  retry: string;
  onRetry: () => void;
}) {
  return (
    <View
      className="items-center rounded-2xl px-6 py-10"
      style={{ backgroundColor: colors.semantic.dangerSurface }}
    >
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.white }}
      >
        <CircleAlert size={24} color={colors.semantic.danger} />
      </View>
      <Text className="mt-4 text-center text-base font-extrabold text-navy-text">{title}</Text>
      <Text className="mt-2 text-center text-sm text-navy-secondary">{body}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        className="mt-5 flex-row items-center rounded-full px-5 py-3"
        style={{ backgroundColor: colors.white }}
      >
        <RotateCcw size={15} color={colors.semantic.danger} />
        <Text className="ml-2 text-sm font-bold text-danger">{retry}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Empty: the state this screen is in for every newly issued Health ID. It has
 * to say "nothing is wrong and nothing is missing", explain how the record
 * actually fills up, and give the patient the two things they can genuinely do
 * next — both routes exist.
 */
function EmptyState({
  t,
  onFindCare,
  onBook,
}: {
  t: (key: string) => string;
  onFindCare: () => void;
  onBook: () => void;
}) {
  const steps: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: Hospital, title: t('records.empty.step1Title'), body: t('records.empty.step1Body') },
    { icon: Stethoscope, title: t('records.empty.step2Title'), body: t('records.empty.step2Body') },
    { icon: HeartPulse, title: t('records.empty.step3Title'), body: t('records.empty.step3Body') },
  ];

  return (
    <View>
      <View className="items-center rounded-2xl bg-white px-6 py-8">
        <View
          className="h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.brand[50] }}
        >
          <NotebookPen size={26} color={colors.brand[500]} />
        </View>
        <Text className="mt-4 text-center text-lg font-extrabold text-navy-text">
          {t('records.empty.title')}
        </Text>
        <Text className="mt-2 text-center text-sm leading-5 text-navy-secondary">
          {t('records.empty.body')}
        </Text>
      </View>

      <Text className="mb-3 mt-6 text-xs font-bold uppercase tracking-wide text-navy-muted">
        {t('records.empty.stepsHeading')}
      </Text>
      <View className="rounded-2xl bg-white p-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const last = index === steps.length - 1;
          return (
            <View key={step.title} className="flex-row">
              <View className="w-9 items-center">
                <View
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.brand[50] }}
                >
                  <Icon size={16} color={colors.brand[600]} />
                </View>
                {last ? null : (
                  <View className="my-1 w-px flex-1" style={{ backgroundColor: colors.cream[300] }} />
                )}
              </View>
              <View className={`ml-3 flex-1 ${last ? '' : 'pb-4'}`}>
                <Text className="text-sm font-bold text-navy-text">{step.title}</Text>
                <Text className="mt-1 text-xs leading-4 text-navy-secondary">{step.body}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View className="mt-4 flex-row gap-3">
        <Pressable
          onPress={onFindCare}
          accessibilityRole="button"
          className="flex-1 flex-row items-center justify-center rounded-full py-3.5"
          style={{ backgroundColor: colors.brand[500] }}
        >
          <MapPin size={15} color={colors.white} />
          <Text className="ml-2 text-xs font-bold text-white" numberOfLines={1}>
            {t('records.empty.findCare')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onBook}
          accessibilityRole="button"
          className="flex-1 flex-row items-center justify-center rounded-full border py-3.5"
          style={{ borderColor: colors.brand[300], backgroundColor: colors.white }}
        >
          <Calendar size={15} color={colors.brand[600]} />
          <Text className="ml-2 text-xs font-bold text-brand-600" numberOfLines={1}>
            {t('records.empty.bookVisit')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A filter matching nothing is not the same as an empty record — say so. */
function FilteredEmptyState({
  title,
  body,
  reset,
  onReset,
}: {
  title: string;
  body: string;
  reset: string;
  onReset: () => void;
}) {
  return (
    <View className="items-center rounded-2xl bg-white px-6 py-10">
      <View
        className="h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.cream[200] }}
      >
        <FileText size={20} color={colors.navy.muted} />
      </View>
      <Text className="mt-3 text-center text-base font-bold text-navy-text">{title}</Text>
      <Text className="mt-1 text-center text-sm text-navy-secondary">{body}</Text>
      <Pressable
        onPress={onReset}
        accessibilityRole="button"
        className="mt-4 rounded-full border px-5 py-2.5"
        style={{ borderColor: colors.brand[300] }}
      >
        <Text className="text-xs font-bold text-brand-600">{reset}</Text>
      </Pressable>
    </View>
  );
}
