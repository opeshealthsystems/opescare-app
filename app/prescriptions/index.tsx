import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Hourglass,
  Pill,
  RotateCcw,
  ScrollText,
  Search,
  Stethoscope,
  Store,
  Tablets,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { colors } from '../../theme/tokens';
import { usePrescriptions, type PrescriptionSummary } from '../../lib/api/queries';
import { useActivePrescriptionSummary } from '../../lib/api/prescriptionQueries';
import {
  EXPIRY_WARNING_WINDOW_DAYS,
  StatusPill,
  daysUntil,
  formatDate,
  referenceCode,
  statusLabelKey,
} from '../../components/prescriptions/status';

/**
 * Prescriptions — the medications a care team has issued to this patient.
 *
 * Read-only by design: the mobile API exposes only GET index + GET show
 * (routes/api.php:269-270), so this screen surfaces no refill or renewal
 * action. The one refill route in the codebase is a session-authenticated web
 * portal route (`POST /portals/patient/prescriptions/{id}/refill`) and is not
 * reachable from a bearer-token client.
 *
 * Structure follows the reference set: the page-title / filter-row / grouped-row
 * rhythm of the Access History reference, and the Rx + dosage vocabulary of the
 * e-prescription reference. Both references are green-branded; per the design
 * spec that palette is superseded by gold/cream, so the layout is matched and
 * every colour comes from theme/tokens.
 *
 * The demo patient has no prescriptions, so the empty state is the state most
 * users meet first: it explains how a prescription reaches this screen rather
 * than reading as a failure, and both of its actions lead somewhere real.
 */

const STATUS_FILTERS = [
  'all',
  'active',
  'dispensed',
  'partially_dispensed',
  'expired',
  'cancelled',
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function PrescriptionsListScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = i18n.language;
  const [filter, setFilter] = useState<StatusFilter>('all');

  const { data, isLoading, isError, isFetching, refetch } = usePrescriptions(
    filter === 'all' ? undefined : filter,
  );
  const summary = useActivePrescriptionSummary();

  const prescriptions = data?.data ?? [];
  const total = data?.pagination?.total ?? prescriptions.length;
  const hasAnyActive = (summary.data?.prescriptionCount ?? 0) > 0;

  return (
    <Screen className="px-0">
      <FlatList
        data={prescriptions}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => {
              refetch();
              summary.refetch();
            }}
            tintColor={colors.brand[500]}
          />
        }
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <View>
            {/* Top bar — back chip, wordmark, Medicine Finder shortcut. */}
            <View className="flex-row items-center justify-between px-6 pt-2">
              <Pressable
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('prescriptions.back')}
                className="h-10 w-10 items-center justify-center rounded-xl border border-cream-300 bg-white"
              >
                <ChevronLeft size={20} color={colors.navy.text} />
              </Pressable>

              <View className="flex-row items-center">
                <Text className="text-lg font-extrabold text-navy-text">Opes</Text>
                <Text className="text-lg font-extrabold text-brand-500">Care</Text>
              </View>

              <Pressable
                onPress={() => router.push('/pharmacy')}
                accessibilityRole="button"
                accessibilityLabel={t('prescriptions.findMedicine')}
                className="h-10 flex-row items-center rounded-xl border border-cream-300 bg-white px-3"
              >
                <Search size={15} color={colors.brand[600]} />
                <Text className="ml-1.5 text-xs font-semibold text-navy-text">
                  {t('prescriptions.findMedicine')}
                </Text>
              </Pressable>
            </View>

            {/* Title */}
            <View className="px-6">
              <Text className="mt-6 text-3xl font-extrabold text-navy-text">
                {t('prescriptions.title')}
              </Text>
              <Text className="mt-1 text-sm text-navy-secondary">
                {t('prescriptions.subtitle')}
              </Text>
            </View>

            {/* Active-medication summary. Rendered only once there is something
                to count — an all-zero strip would be noise above an empty list. */}
            {hasAnyActive ? (
              <View className="mt-5 px-6">
                <LinearGradient
                  colors={[colors.brand[600], colors.brand[500], colors.brand[300]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  // NativeWind's className→style transform is not registered for
                  // expo-linear-gradient, so styling here has to stay inline.
                  style={{
                    borderRadius: 20,
                    paddingVertical: 18,
                    paddingHorizontal: 20,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <SummaryStat
                    value={summary.data?.prescriptionCount ?? 0}
                    label={t('prescriptions.summaryActive')}
                  />
                  <View className="mx-4 h-10 w-px bg-white/30" />
                  <SummaryStat
                    value={summary.data?.medicationCount ?? 0}
                    label={t('prescriptions.summaryMedications')}
                  />
                  <View className="h-11 w-11 items-center justify-center rounded-full bg-white/20">
                    <Tablets size={20} color={colors.white} />
                  </View>
                </LinearGradient>
              </View>
            ) : null}

            {/* Status filters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-5"
              contentContainerStyle={{ gap: 8, paddingHorizontal: 24 }}
            >
              {STATUS_FILTERS.map((option) => {
                const active = option === filter;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setFilter(option)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`h-10 items-center justify-center rounded-xl border px-4 ${
                      active ? 'border-brand-500 bg-brand-500' : 'border-cream-300 bg-white'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        active ? 'text-white' : 'text-navy-secondary'
                      }`}
                    >
                      {option === 'all' ? t('prescriptions.filterAll') : t(statusLabelKey(option))}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {!isLoading && !isError && prescriptions.length > 0 ? (
              <Text className="mb-3 mt-5 px-6 text-xs font-semibold uppercase tracking-wide text-navy-muted">
                {t('prescriptions.resultCount', { count: total })}
              </Text>
            ) : (
              <View className="h-5" />
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-24">
              <ActivityIndicator color={colors.brand[500]} />
            </View>
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : filter === 'all' ? (
            <FirstRunEmptyState />
          ) : (
            <FilteredEmptyState
              statusLabel={t(statusLabelKey(filter))}
              onShowAll={() => setFilter('all')}
            />
          )
        }
        renderItem={({ item }) => (
          <View className="px-6">
            <PrescriptionCard
              prescription={item}
              locale={locale}
              onPress={() => router.push(`/prescriptions/${item.id}`)}
            />
          </View>
        )}
      />
    </Screen>
  );
}

/* -- Pieces ---------------------------------------------------------------- */

function SummaryStat({ value, label }: { value: number; label: string }) {
  return (
    <View className="flex-1">
      <Text className="text-3xl font-extrabold text-white">{value}</Text>
      <Text className="mt-0.5 text-[11px] font-semibold text-white/90">{label}</Text>
    </View>
  );
}

function PrescriptionCard({
  prescription,
  locale,
  onPress,
}: {
  prescription: PrescriptionSummary;
  locale: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const prescribedOn = formatDate(prescription.prescribed_at, locale);
  const remaining = daysUntil(prescription.expires_at);
  const isOpen = prescription.status === 'active' || prescription.status === 'partially_dispensed';

  // An expiry is only worth a callout while the prescription can still be
  // filled, and only inside the window where the date changes what you'd do.
  const expiryDays =
    isOpen && remaining !== null && remaining >= 0 && remaining <= EXPIRY_WARNING_WINDOW_DAYS
      ? remaining
      : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="rounded-2xl border border-cream-300 bg-white p-4"
    >
      <View className="flex-row items-start">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
          <Pill size={20} color={colors.brand[600]} />
        </View>

        <View className="ml-3 flex-1">
          <Text className="text-base font-bold text-navy-text" numberOfLines={2}>
            {prescription.facility_name ?? t('prescriptions.unknownFacility')}
          </Text>
          <Text className="mt-0.5 text-[11px] text-navy-muted">
            {t('prescriptions.reference', { code: referenceCode(prescription.id) })}
          </Text>
        </View>

        <View className="ml-2">
          <StatusPill status={prescription.status} statusColor={prescription.status_color} />
        </View>
      </View>

      {/* The list endpoint returns a count but never the drug names, so the
          count is what carries the weight here. Names live on the detail screen. */}
      <View className="mt-3 flex-row items-center rounded-xl bg-cream-100 px-3 py-2.5">
        <Tablets size={16} color={colors.brand[600]} />
        <Text className="ml-2 flex-1 text-sm font-bold text-navy-text">
          {t('prescriptions.medicationCount', { count: prescription.item_count })}
        </Text>
        <ChevronRight size={16} color={colors.navy.muted} />
      </View>

      <View className="mt-3 flex-row items-center justify-between border-t border-cream-200 pt-3">
        <Text className="flex-1 pr-2 text-[11px] text-navy-secondary" numberOfLines={1}>
          {prescribedOn
            ? t('prescriptions.prescribedOn', { date: prescribedOn })
            : t('prescriptions.dateUnknown')}
        </Text>

        {expiryDays !== null ? (
          <View
            className="flex-row items-center rounded-lg px-2 py-1"
            style={{ backgroundColor: colors.semantic.warningSurface }}
          >
            <Hourglass size={11} color={colors.semantic.warning} />
            <Text className="ml-1 text-[10px] font-bold" style={{ color: colors.semantic.warning }}>
              {expiryDays === 0
                ? t('prescriptions.expiresToday')
                : t('prescriptions.expiresInDays', { count: expiryDays })}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * The state the demo patient — and anyone not yet prescribed anything — sees.
 * It explains the mechanism instead of apologising, and both actions are real
 * routes: `app/appointments/book.tsx` and `app/pharmacy.tsx`.
 */
function FirstRunEmptyState() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View className="px-6 pt-4">
      <View className="items-center rounded-2xl border border-cream-300 bg-white px-6 py-8">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <Pill size={30} color={colors.brand[600]} />
        </View>
        <Text className="mt-5 text-center text-lg font-extrabold text-navy-text">
          {t('prescriptions.emptyTitle')}
        </Text>
        <Text className="mt-2 text-center text-sm leading-5 text-navy-secondary">
          {t('prescriptions.emptyBody')}
        </Text>
      </View>

      <Text className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-navy-muted">
        {t('prescriptions.emptyHowTitle')}
      </Text>

      <View className="overflow-hidden rounded-2xl border border-cream-300 bg-white">
        <EmptyStep
          index={1}
          icon={Stethoscope}
          title={t('prescriptions.emptyStep1Title')}
          body={t('prescriptions.emptyStep1Body')}
        />
        <EmptyStep
          index={2}
          icon={ScrollText}
          title={t('prescriptions.emptyStep2Title')}
          body={t('prescriptions.emptyStep2Body')}
        />
        <EmptyStep
          index={3}
          icon={Store}
          title={t('prescriptions.emptyStep3Title')}
          body={t('prescriptions.emptyStep3Body')}
          last
        />
      </View>

      <Pressable
        onPress={() => router.push('/appointments/book')}
        accessibilityRole="button"
        className="mt-5 flex-row items-center justify-center rounded-2xl bg-brand-500 px-4 py-4"
      >
        <Stethoscope size={17} color={colors.white} />
        <Text className="ml-2 text-sm font-bold text-white">
          {t('prescriptions.emptyBookAppointment')}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push('/pharmacy')}
        accessibilityRole="button"
        className="mt-3 flex-row items-center justify-center rounded-2xl border border-brand-500 px-4 py-4"
      >
        <Search size={17} color={colors.brand[600]} />
        <Text className="ml-2 text-sm font-bold text-brand-600">
          {t('prescriptions.emptyFindMedicine')}
        </Text>
      </Pressable>
    </View>
  );
}

function EmptyStep({
  index,
  icon: Icon,
  title,
  body,
  last,
}: {
  index: number;
  icon: LucideIcon;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <View className={`flex-row items-start px-4 py-4 ${last ? '' : 'border-b border-cream-200'}`}>
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-cream-200">
        <Icon size={17} color={colors.brand[600]} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-sm font-bold text-navy-text">
          {index}. {title}
        </Text>
        <Text className="mt-1 text-xs leading-4 text-navy-secondary">{body}</Text>
      </View>
    </View>
  );
}

/** A filter that matched nothing — a far lighter message than a first run. */
function FilteredEmptyState({
  statusLabel,
  onShowAll,
}: {
  statusLabel: string;
  onShowAll: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="px-6 pt-2">
      <View className="items-center rounded-2xl border border-cream-300 bg-white px-6 py-10">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-cream-200">
          <Pill size={22} color={colors.navy.muted} />
        </View>
        <Text className="mt-4 text-center text-base font-bold text-navy-text">
          {t('prescriptions.emptyFilterTitle', { status: statusLabel })}
        </Text>
        <Text className="mt-1.5 text-center text-sm text-navy-secondary">
          {t('prescriptions.emptyFilterBody')}
        </Text>
        <Pressable
          onPress={onShowAll}
          accessibilityRole="button"
          className="mt-4 rounded-xl border border-brand-500 px-4 py-2"
        >
          <Text className="text-xs font-bold text-brand-600">{t('prescriptions.showAll')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <View className="px-6 pt-2">
      <View className="items-center rounded-2xl border border-cream-300 bg-white px-6 py-10">
        <View
          className="h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.semantic.dangerSurface }}
        >
          <CircleAlert size={22} color={colors.semantic.danger} />
        </View>
        <Text className="mt-4 text-center text-sm text-navy-secondary">
          {t('prescriptions.loadError')}
        </Text>
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          className="mt-4 flex-row items-center rounded-xl border border-brand-500 px-4 py-2"
        >
          <RotateCcw size={13} color={colors.brand[600]} />
          <Text className="ml-2 text-xs font-bold text-brand-600">{t('prescriptions.retry')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
