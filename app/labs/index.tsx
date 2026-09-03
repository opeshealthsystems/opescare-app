import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  MapPin,
  RotateCcw,
  ShieldCheck,
  TestTube,
  WifiOff,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { colors } from '../../theme/tokens';
import type { LabOrderSummary } from '../../lib/api/queries';
import { useInfiniteLabOrders } from '../../lib/api/labsQueries';

const STATUS_FILTERS = ['all', 'pending', 'collected', 'processing', 'resulted', 'cancelled'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

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

/** Icon tile tint. An order carrying an out-of-range value reads danger before
 * anything else on the card; otherwise the tile follows the order's own status
 * colour so "resulted" is visibly finished and everything else is in flight. */
function tileTint(order: LabOrderSummary): { surface: string; icon: string } {
  if (order.has_abnormal) {
    return { surface: colors.semantic.dangerSurface, icon: colors.semantic.danger };
  }
  if (order.status === 'resulted') {
    return { surface: colors.semantic.successSurface, icon: colors.semantic.success };
  }
  if (order.status === 'cancelled') {
    return { surface: colors.cream[200], icon: colors.navy.muted };
  }
  return { surface: colors.semantic.infoSurface, icon: colors.semantic.info };
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Lab orders — every test a care team has requested for this patient, with
 * the published result set living one tap deeper in `labs/[id]`.
 *
 * The empty state is the screen most patients will actually see: results are
 * published by a laboratory, never entered here, so it explains the pipeline
 * and points at the real licensed-laboratory directory instead of showing a
 * blank list. Backed by GET /mobile/labs, which is verified live but returns
 * an empty collection for the demo patient.
 */
export default function LabsListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteLabOrders(filter === 'all' ? undefined : filter);

  const orders = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
  const total = data?.pages[0]?.pagination.total ?? 0;
  const flaggedCount = orders.filter((o) => o.has_abnormal).length;

  const openDirectory = () =>
    router.push({ pathname: '/care-map', params: { type: 'laboratory' } });

  return (
    <Screen className="px-0">
      {/* Title block — large heading + one-line purpose, with the directory
          action parked top-right, matching the list screens in the reference set. */}
      <View className="flex-row items-start px-6 pt-2">
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
          <Text className="text-2xl font-extrabold text-navy-text">{t('labs.title')}</Text>
          <Text className="mt-0.5 text-xs leading-4 text-navy-secondary">{t('labs.subtitle')}</Text>
        </View>
        <Pressable
          onPress={openDirectory}
          hitSlop={6}
          accessibilityRole="button"
          className="ml-2 h-11 flex-row items-center rounded-full border border-brand-300 px-3"
        >
          <MapPin size={14} color={colors.brand[600]} />
          <Text className="ml-1.5 text-xs font-bold text-brand-600">{t('labs.findLabShort')}</Text>
        </Pressable>
      </View>

      <FlatList
        data={STATUS_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 16, gap: 8 }}
        renderItem={({ item }) => {
          const active = item === filter;
          return (
            <Pressable
              onPress={() => setFilter(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className="flex-row items-center rounded-full px-4 py-2"
              style={{
                backgroundColor: active ? colors.brand[500] : colors.white,
                borderWidth: active ? 0 : 1,
                borderColor: colors.cream[300],
              }}
            >
              <Text
                className={
                  active ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-navy-secondary'
                }
              >
                {item === 'all' ? t('labs.filterAll') : t(statusLabelKey(item))}
              </Text>
              {/* Count comes from the server's own pagination total, so it is
                  only ever shown for the filter currently being counted. */}
              {active && !isLoading && !isError ? (
                <View
                  className="ml-2 min-w-[22px] items-center rounded-full px-1.5 py-0.5"
                  style={{ backgroundColor: colors.white }}
                >
                  <Text className="text-[11px] font-bold text-brand-600">{total}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState t={t} onRetry={() => refetch()} />
      ) : orders.length === 0 ? (
        <EmptyState t={t} onFindLab={openDirectory} onOpenRecords={() => router.push('/(tabs)/records')} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading && !isFetchingNextPage}
              onRefresh={refetch}
              tintColor={colors.brand[500]}
            />
          }
          ListHeaderComponent={
            flaggedCount > 0 ? (
              <View
                className="mb-1 flex-row items-start rounded-2xl p-3"
                style={{ backgroundColor: colors.semantic.dangerSurface }}
              >
                <AlertTriangle size={16} color={colors.semantic.danger} />
                <Text className="ml-2 flex-1 text-xs leading-4 font-medium text-danger">
                  {t('labs.flaggedBanner', { count: flaggedCount })}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            <View className="mt-2">
              {hasNextPage ? (
                <Pressable
                  onPress={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  accessibilityRole="button"
                  className="flex-row items-center justify-center rounded-2xl border border-brand-300 py-3"
                  style={{ opacity: isFetchingNextPage ? 0.6 : 1 }}
                >
                  <Text className="mr-1.5 text-sm font-bold text-brand-600">
                    {isFetchingNextPage ? t('labs.loadingMore') : t('labs.loadMore')}
                  </Text>
                  <ChevronDown size={16} color={colors.brand[600]} />
                </Pressable>
              ) : null}
              <View
                className="mt-4 flex-row items-start rounded-2xl p-3"
                style={{ backgroundColor: colors.semantic.successSurface }}
              >
                <ShieldCheck size={16} color={colors.semantic.success} />
                <Text className="ml-2 flex-1 text-[11px] leading-4 text-navy-secondary">
                  {t('labs.privacyNote')}
                </Text>
              </View>
            </View>
          }
          renderItem={({ item }) => <OrderCard order={item} t={t} onPress={() => router.push(`/labs/${item.id}`)} />}
        />
      )}
    </Screen>
  );
}

/** One lab order. Test name leads; the abnormal flag is the loudest element
 * on the card because it is the only thing that may need acting on. */
function OrderCard({ order, t, onPress }: { order: LabOrderSummary; t: TFunction; onPress: () => void }) {
  const status = statusStyles(order.status_color);
  const tile = tileTint(order);
  const orderedDate = formatDate(order.ordered_at);
  const resultedDate = formatDate(order.resulted_at);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="rounded-2xl border bg-white p-4"
      style={{ borderColor: order.has_abnormal ? colors.semantic.danger : colors.cream[300] }}
    >
      <View className="flex-row items-start">
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: tile.surface }}
        >
          <FlaskConical size={19} color={tile.icon} />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-base font-bold leading-5 text-navy-text" numberOfLines={2}>
            {order.test_name}
          </Text>
          {order.test_code ? (
            <View className="mt-1 self-start rounded-md px-1.5 py-0.5" style={{ backgroundColor: colors.cream[200] }}>
              <Text className="text-[10px] font-semibold tracking-wide text-navy-secondary">{order.test_code}</Text>
            </View>
          ) : null}
        </View>
        <ChevronRight size={18} color={colors.navy.muted} />
      </View>

      <View className="mt-3" style={{ gap: 4 }}>
        {order.facility_name ? (
          <MetaRow icon={Building2} text={order.facility_name} />
        ) : null}
        {resultedDate ? (
          <MetaRow icon={Calendar} text={t('labs.resultedOn', { date: resultedDate })} />
        ) : orderedDate ? (
          <MetaRow icon={Calendar} text={t('labs.orderedOn', { date: orderedDate })} />
        ) : null}
      </View>

      <View className="mt-3 flex-row flex-wrap items-center" style={{ gap: 8 }}>
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: status.surface }}>
          <Text className={`text-xs font-semibold ${status.text}`}>{t(statusLabelKey(order.status))}</Text>
        </View>
        {order.result_count > 0 ? (
          <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.cream[200] }}>
            <Text className="text-xs font-semibold text-navy-secondary">
              {t('labs.resultCount', { count: order.result_count })}
            </Text>
          </View>
        ) : null}
        {order.has_abnormal ? (
          <View
            className="flex-row items-center rounded-full px-2.5 py-1"
            style={{ backgroundColor: colors.semantic.dangerSurface }}
          >
            <AlertTriangle size={12} color={colors.semantic.danger} />
            <Text className="ml-1 text-xs font-semibold text-danger">{t('labs.abnormalBadge')}</Text>
          </View>
        ) : null}
      </View>

      <View className="mt-3 border-t border-cream-200 pt-3">
        <View className="flex-row items-center justify-end">
          <Text className="text-sm font-bold text-brand-600">
            {order.status === 'resulted' ? t('labs.viewFullReport') : t('labs.viewOrder')}
          </Text>
          <ChevronRight size={16} color={colors.brand[600]} />
        </View>
      </View>
    </Pressable>
  );
}

function MetaRow({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <View className="flex-row items-center">
      <Icon size={13} color={colors.navy.muted} />
      <Text className="ml-1.5 flex-1 text-xs text-navy-secondary" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Skeleton rather than a bare spinner — the card rhythm stays put while the
 * first page lands, so the screen does not visibly reflow. */
function LoadingState() {
  return (
    <View className="flex-1 px-6" style={{ gap: 12 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} className="rounded-2xl border border-cream-300 bg-white p-4">
          <View className="flex-row items-center">
            <View className="h-11 w-11 rounded-2xl bg-cream-200" />
            <View className="ml-3 flex-1">
              <View className="h-4 w-2/3 rounded-full bg-cream-200" />
              <View className="mt-2 h-3 w-1/3 rounded-full bg-cream-200" />
            </View>
          </View>
          <View className="mt-4 h-3 w-1/2 rounded-full bg-cream-200" />
          <View className="mt-2 h-3 w-2/5 rounded-full bg-cream-200" />
        </View>
      ))}
    </View>
  );
}

function ErrorState({ t, onRetry }: { t: TFunction; onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <View
        className="h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.semantic.dangerSurface }}
      >
        <WifiOff size={26} color={colors.semantic.danger} />
      </View>
      <Text className="mt-4 text-center text-base font-bold text-navy-text">{t('labs.loadError')}</Text>
      <Text className="mt-1 text-center text-sm leading-5 text-navy-secondary">{t('labs.loadErrorHint')}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        className="mt-5 flex-row items-center rounded-full border border-brand-300 px-5 py-2.5"
      >
        <RotateCcw size={14} color={colors.brand[600]} />
        <Text className="ml-2 text-sm font-semibold text-brand-600">{t('labs.retry')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The empty state carries the whole screen for a patient with no published
 * results, so it explains where results come from instead of apologising for
 * their absence, and offers the one action a patient can actually take:
 * finding a licensed laboratory in the real facility directory.
 */
function EmptyState({
  t,
  onFindLab,
  onOpenRecords,
}: {
  t: TFunction;
  onFindLab: () => void;
  onOpenRecords: () => void;
}) {
  const steps: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: ClipboardList, title: t('labs.step1Title'), body: t('labs.step1Body') },
    { icon: TestTube, title: t('labs.step2Title'), body: t('labs.step2Body') },
    { icon: ShieldCheck, title: t('labs.step3Title'), body: t('labs.step3Body') },
  ];

  return (
    <ScrollView
      className="flex-1 px-6"
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="items-center pt-4">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-100">
            <FlaskConical size={26} color={colors.brand[600]} />
          </View>
        </View>
        <Text className="mt-4 text-center text-lg font-extrabold text-navy-text">{t('labs.emptyTitle')}</Text>
        <Text className="mt-1.5 text-center text-sm leading-5 text-navy-secondary">{t('labs.emptyBody')}</Text>
      </View>

      <View className="mt-6 rounded-2xl border border-cream-300 bg-white p-4">
        <Text className="text-sm font-bold text-navy-text">{t('labs.howItWorksTitle')}</Text>
        <View className="mt-3" style={{ gap: 14 }}>
          {steps.map((step, index) => (
            <View key={step.title} className="flex-row items-start">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-50">
                <step.icon size={16} color={colors.brand[600]} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-sm font-semibold text-navy-text">
                  {index + 1}. {step.title}
                </Text>
                <Text className="mt-0.5 text-xs leading-4 text-navy-secondary">{step.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View className="mt-5">
        <Button label={t('labs.findLab')} leftIcon={MapPin} onPress={onFindLab} />
      </View>
      <Text className="mt-2 text-center text-[11px] leading-4 text-navy-muted">{t('labs.findLabHint')}</Text>

      <View className="mt-4">
        <Button
          label={t('labs.openRecords')}
          variant="outline"
          showChevron={false}
          onPress={onOpenRecords}
        />
      </View>

      <View
        className="mt-5 flex-row items-start rounded-2xl p-3"
        style={{ backgroundColor: colors.semantic.successSurface }}
      >
        <ShieldCheck size={16} color={colors.semantic.success} />
        <Text className="ml-2 flex-1 text-[11px] leading-4 text-navy-secondary">{t('labs.privacyNote')}</Text>
      </View>
    </ScrollView>
  );
}
