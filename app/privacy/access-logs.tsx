import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Download,
  Eye,
  FilePlus,
  History,
  Pencil,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Smartphone,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import {
  CARD_SHADOW,
  Chip,
  ChoiceChip,
  EmptyState,
  InlineNotice,
  RightsHeader,
  humanizeSlug,
  toneColors,
  type Tone,
} from '../../components/privacy/DataRightsUi';
import { colors } from '../../theme/tokens';
import type { AccessLogItem } from '../../lib/api/queries';
import { useAccessLogHistory } from '../../lib/api/privacyQueries';

/**
 * Access Logs — the privacy centrepiece.
 *
 * Reference: `Mobile app screens/a_bright_clean_mobile_app_screenshot_of_a_health_r.png`
 * ("Access History" — reassurance pill, filter row, event rows carrying who /
 * when / which organisation / what data, an access summary, and a closing note
 * that all access is logged). That reference is drawn in the app's earlier
 * green palette and shows fabricated clinician names the API does not return,
 * so the layout is carried over and re-rendered in the gold/cream brand
 * against the fields GET /mobile/access-logs actually provides.
 *
 * Every entry answers the four questions a patient asks of an audit log:
 *   WHO   — the facility that opened the record, or the patient themselves,
 *           or the platform for automated processes (`facility` + `purpose`).
 *   WHEN  — relative time plus the exact timestamp (`created_at`).
 *   WHERE — the facility name and type (`facility.name` / `facility.type`).
 *   WHY   — the recorded purpose, with the data category and the kind of
 *           access (`purpose`, `data_category`, `access_type`).
 *
 * The API returns no clinician name (only `actor_id`/`actor_type`), so no
 * person is ever named here — inventing one would be a fabrication in an
 * audit trail. Counts come from a real total, and the summary is only shown
 * once the whole history is loaded, so a number can never describe one page
 * while appearing to describe everything.
 */

type FilterValue = 'all' | 'facility' | 'self' | 'emergency';

const FILTERS: FilterValue[] = ['all', 'facility', 'self', 'emergency'];

/** Icon + tone per recorded access type; anything unrecognised falls back. */
const ACCESS_TYPE_META: Record<string, { icon: LucideIcon; tone: Tone }> = {
  view: { icon: Eye, tone: 'info' },
  create: { icon: FilePlus, tone: 'brand' },
  update: { icon: Pencil, tone: 'warning' },
  approve: { icon: CheckCircle2, tone: 'success' },
  reject: { icon: XCircle, tone: 'danger' },
  download: { icon: Download, tone: 'brand' },
  override: { icon: ShieldAlert, tone: 'danger' },
};

/** `patient_request` is written only by the patient's own governance actions
 * (see DataExportService / CorrectionRequestService), so an entry with that
 * purpose and no facility is the patient acting in this app. */
function actorKind(item: AccessLogItem): 'facility' | 'self' | 'platform' {
  if (item.facility) return 'facility';
  if (item.purpose === 'patient_request') return 'self';
  return 'platform';
}

export default function AccessLogsScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const [filter, setFilter] = useState<FilterValue>('all');

  const history = useAccessLogHistory();
  const entries = history.data?.entries ?? [];
  const total = history.data?.total ?? 0;
  const complete = history.data?.complete ?? false;

  const counts = useMemo(() => {
    let facility = 0;
    let self = 0;
    let emergency = 0;
    const facilities = new Set<string>();
    for (const entry of entries) {
      if (entry.emergency_access) emergency += 1;
      const kind = actorKind(entry);
      if (kind === 'facility') {
        facility += 1;
        if (entry.facility) facilities.add(entry.facility.id);
      } else if (kind === 'self') {
        self += 1;
      }
    }
    return { all: entries.length, facility, self, emergency, facilities: facilities.size };
  }, [entries]);

  const visible = useMemo(() => {
    if (filter === 'all') return entries;
    if (filter === 'emergency') return entries.filter((e) => e.emergency_access);
    return entries.filter((e) => actorKind(e) === filter);
  }, [entries, filter]);

  const header = (
    <View>
      <RightsHeader
        title={t('privacy.accessLogsTitle')}
        subtitle={t('privacy.accessLogsSubtitle')}
        icon={History}
      />

      <View className="mt-5">
        <InlineNotice
          tone="brand"
          icon={ShieldCheck}
          title={t('privacy.accessLogsAssuranceTitle')}
          body={t('privacy.accessLogsAssuranceBody')}
        />
      </View>

      {entries.length > 0 ? (
        <>
          {complete ? (
            <View className="mt-4 flex-row rounded-2xl bg-white p-4" style={CARD_SHADOW}>
              <SummaryStat value={total} label={t('privacy.summaryTotal')} tone="brand" />
              <View className="w-px bg-cream-300" />
              <SummaryStat
                value={counts.facilities}
                label={t('privacy.summaryFacilities')}
                tone="info"
              />
              <View className="w-px bg-cream-300" />
              <SummaryStat
                value={counts.emergency}
                label={t('privacy.summaryEmergency')}
                tone={counts.emergency > 0 ? 'warning' : 'success'}
              />
            </View>
          ) : (
            <View className="mt-4 flex-row items-center rounded-2xl bg-white p-4" style={CARD_SHADOW}>
              <History size={16} color={colors.navy.muted} />
              <Text className="ml-2.5 flex-1 text-[12px] text-navy-secondary">
                {t('privacy.loadedOf', { loaded: entries.length, total })}
              </Text>
            </View>
          )}

          <View className="mt-4 flex-row flex-wrap" style={{ gap: 8 }}>
            {FILTERS.map((value) => (
              <ChoiceChip
                key={value}
                selected={value === filter}
                label={`${t(`privacy.logFilter.${value}`)} · ${counts[value]}`}
                onPress={() => setFilter(value)}
              />
            ))}
          </View>

          {!complete ? (
            <Text className="mt-3 text-[11px] text-navy-muted">
              {t('privacy.filterScopeNote')}
            </Text>
          ) : null}

          <View className="mt-5" />
        </>
      ) : null}
    </View>
  );

  return (
    <Screen className="px-0">
      {history.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand[500]} size="large" />
          <Text className="mt-3 text-[13px] text-navy-muted">{t('privacy.accessLogsLoading')}</Text>
        </View>
      ) : history.isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <CircleAlert size={28} color={colors.semantic.danger} />
          <Text className="mt-3 text-center text-[15px] font-bold text-navy-text">
            {t('privacy.accessLogsErrorTitle')}
          </Text>
          <Text className="mt-1.5 text-center text-[13px] leading-5 text-navy-secondary">
            {t('privacy.accessLogsErrorBody')}
          </Text>
          <Pressable
            onPress={() => history.refetch()}
            accessibilityRole="button"
            className="mt-5 flex-row items-center rounded-full border border-brand-500 px-5 py-2.5"
          >
            <RefreshCw size={14} color={colors.brand[600]} />
            <Text className="ml-2 text-[13px] font-bold text-brand-600">{t('privacy.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={history.isRefetching && !history.isFetchingNextPage}
              onRefresh={() => history.refetch()}
              tintColor={colors.brand[500]}
            />
          }
          ListHeaderComponent={header}
          ItemSeparatorComponent={() => <View className="h-3" />}
          ListEmptyComponent={
            entries.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                tone="success"
                title={t('privacy.accessLogsEmptyTitle')}
                body={t('privacy.accessLogsEmptyBody')}
              />
            ) : (
              <EmptyState
                icon={History}
                tone="muted"
                title={t('privacy.filterEmptyTitle')}
                body={t('privacy.filterEmptyBody')}
                actionLabel={t('privacy.logFilter.all')}
                onAction={() => setFilter('all')}
              />
            )
          }
          renderItem={({ item }) => <AccessLogCard item={item} locale={locale} />}
          ListFooterComponent={
            <View>
              {history.hasNextPage ? (
                <Pressable
                  onPress={() => history.fetchNextPage()}
                  disabled={history.isFetchingNextPage}
                  accessibilityRole="button"
                  className="mt-4 flex-row items-center justify-center rounded-2xl bg-white py-3.5"
                  style={CARD_SHADOW}
                >
                  {history.isFetchingNextPage ? (
                    <ActivityIndicator size="small" color={colors.brand[600]} />
                  ) : (
                    <>
                      <Text className="text-[13px] font-bold text-brand-600">
                        {t('privacy.loadMore')}
                      </Text>
                      <ChevronDown size={15} color={colors.brand[600]} style={{ marginLeft: 4 }} />
                    </>
                  )}
                </Pressable>
              ) : null}

              {entries.length > 0 ? (
                <View className="mt-5">
                  <InlineNotice
                    tone="muted"
                    icon={Siren}
                    body={t('privacy.emergencyAlertNote')}
                  />
                </View>
              ) : null}
            </View>
          }
        />
      )}
    </Screen>
  );
}

function SummaryStat({ value, label, tone }: { value: number; label: string; tone: Tone }) {
  const { ink } = toneColors(tone);
  return (
    <View className="flex-1 items-center px-1">
      <Text className="text-[22px] font-extrabold" style={{ color: ink }}>
        {value}
      </Text>
      <Text className="mt-0.5 text-center text-[11px] leading-[15px] text-navy-secondary">
        {label}
      </Text>
    </View>
  );
}

function AccessLogCard({ item, locale }: { item: AccessLogItem; locale: string }) {
  const { t } = useTranslation();

  const meta = ACCESS_TYPE_META[item.access_type] ?? { icon: Activity, tone: 'muted' as Tone };
  const emergency = item.emergency_access;
  const iconTone: Tone = emergency ? 'danger' : meta.tone;
  const { surface, ink } = toneColors(iconTone);
  const Icon = emergency ? ShieldAlert : meta.icon;

  const kind = actorKind(item);
  const who =
    kind === 'facility'
      ? (item.facility?.name ?? t('privacy.unknownFacility'))
      : kind === 'self'
        ? t('privacy.actorYou')
        : t('privacy.viaPlatform');

  const WhoIcon = kind === 'facility' ? Building2 : kind === 'self' ? Smartphone : Activity;
  const whoDetail =
    kind === 'facility'
      ? item.facility?.type
        ? t(`privacy.facilityType.${item.facility.type}`, {
            defaultValue: humanizeSlug(item.facility.type),
          })
        : t('privacy.facilityGeneric')
      : kind === 'self'
        ? t('privacy.actorYouDetail')
        : t('privacy.actorPlatformDetail');

  const when = new Date(item.created_at);
  const validWhen = !Number.isNaN(when.getTime());

  return (
    <View className="rounded-2xl bg-white p-4" style={CARD_SHADOW}>
      <View className="flex-row items-start">
        <View
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: surface }}
        >
          <Icon size={19} color={ink} />
        </View>

        <View className="ml-3 flex-1 pr-2">
          <Text className="text-[14px] font-extrabold leading-5 text-navy-text" numberOfLines={2}>
            {who}
          </Text>
          <View className="mt-1 flex-row items-center">
            <WhoIcon size={11} color={colors.navy.muted} />
            <Text className="ml-1.5 flex-1 text-[11px] text-navy-muted" numberOfLines={1}>
              {whoDetail}
            </Text>
          </View>
        </View>

        <View className="items-end">
          <Text className="text-[11px] font-bold text-navy-secondary">
            {validWhen ? relativeTime(when, t) : '—'}
          </Text>
          {validWhen ? (
            <Text className="mt-0.5 text-[10px] text-navy-muted">
              {when.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          ) : null}
          {validWhen ? (
            <Text className="text-[10px] text-navy-muted">
              {when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="mt-3 flex-row flex-wrap" style={{ gap: 6 }}>
        <Chip
          tone={meta.tone}
          icon={meta.icon}
          label={t(`privacy.accessType.${item.access_type}`, {
            defaultValue: humanizeSlug(item.access_type),
          })}
        />
        <Chip
          tone="muted"
          label={t(`privacy.dataCategory.${item.data_category}`, {
            defaultValue: humanizeSlug(item.data_category),
          })}
        />
        {emergency ? <Chip tone="danger" icon={Siren} label={t('privacy.emergencyAccess')} /> : null}
      </View>

      <View className="mt-3 border-t border-cream-200 pt-3">
        <Text className="text-[11px] font-bold uppercase tracking-wide text-navy-muted">
          {t('privacy.reasonGiven')}
        </Text>
        <Text className="mt-1 text-[13px] leading-[18px] text-navy-text">
          {t(`privacy.purpose.${item.purpose}`, { defaultValue: humanizeSlug(item.purpose) })}
        </Text>
      </View>
    </View>
  );
}

/** Coarse "how long ago", matching the wording used by the offline banner. */
function relativeTime(date: Date, t: (key: string, opts?: Record<string, unknown>) => string) {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return t('privacy.time.justNow');
  if (minutes < 60) return t('privacy.time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('privacy.time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('privacy.time.daysAgo', { count: days });
  return t('privacy.time.monthsAgo', { count: Math.floor(days / 30) });
}
