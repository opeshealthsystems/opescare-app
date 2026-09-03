/**
 * My Appointments — the patient's care schedule.
 *
 * Matches `Mobile app screens/a_clean_mobile_app_screenshot_ui_smartphone_portr.png`
 * ("My Appointments"): title + subtitle block, navy booking banner, an
 * icon-bearing segmented control with a solid navy active pill, and one white
 * card holding hairline-divided rows — each row a tear-off date tile, a round
 * category glyph, a name/provider/reason stack, a time • venue meta line and a
 * status pill.
 *
 * Data is real: GET /mobile/appointments?scope=upcoming|past via
 * `useAppointmentBoard`, which fetches both scopes so the segment counts are
 * live and switching tabs never flashes a spinner.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  CalendarPlus,
  CalendarSearch,
  ChevronRight,
  Clock,
  History,
  MapPin,
  RefreshCw,
  ShieldPlus,
  TriangleAlert,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import {
  AppointmentStatusPill,
  appointmentTypeIcon,
  appointmentTypeLabel,
  calendarTile,
  formatTime,
  relativeDayLabel,
  statusLabel,
} from '../../components/appointments/presentation';
import {
  useAppointmentBoard,
  type AppointmentBoardScope,
} from '../../lib/api/appointmentsQueries';
import type { Appointment } from '../../lib/api/types';
import { colors } from '../../theme/tokens';

const SEGMENTS: { scope: AppointmentBoardScope; icon: typeof Clock }[] = [
  { scope: 'upcoming', icon: CalendarPlus },
  { scope: 'past', icon: History },
];

// ---------------------------------------------------------------------------
// Booking banner — the reference's navy CTA panel
// ---------------------------------------------------------------------------

function BookingBanner({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <View
      className="mt-5 flex-row items-center rounded-3xl p-4"
      style={{ backgroundColor: colors.navy.text }}
    >
      <View
        className="h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.white }}
      >
        <CalendarPlus size={22} color={colors.brand[500]} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-[15px] font-bold" style={{ color: colors.white }}>
          {t('appointments.ctaTitle')}
        </Text>
        <Text className="mt-0.5 text-xs leading-4" style={{ color: colors.cream[300] }}>
          {t('appointments.ctaBody')}
        </Text>
      </View>
      <Pressable onPress={onPress} accessibilityRole="button" className="ml-2">
        {/* LinearGradient has no cssInterop registered — className is a no-op on
            it, so every style here has to be inline. */}
        <LinearGradient
          colors={[colors.brand[500], colors.brand[300]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: colors.white, fontSize: 13, fontWeight: '700' }}>
            {t('appointments.bookNew')}
          </Text>
          <ChevronRight size={15} color={colors.white} />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Segmented control — solid navy active pill, leading icon, live count badge
// ---------------------------------------------------------------------------

function SegmentedControl({
  scope,
  counts,
  onChange,
}: {
  scope: AppointmentBoardScope;
  counts: Record<AppointmentBoardScope, number>;
  onChange: (next: AppointmentBoardScope) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      className="mt-5 flex-row rounded-2xl p-1"
      style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cream[300] }}
    >
      {SEGMENTS.map(({ scope: value, icon: Icon }) => {
        const active = scope === value;
        const fg = active ? colors.white : colors.navy.secondary;
        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className="flex-1 flex-row items-center justify-center rounded-xl py-2.5"
            style={{ backgroundColor: active ? colors.navy.text : 'transparent', gap: 6 }}
          >
            <Icon size={15} color={fg} />
            <Text className="text-sm font-semibold" style={{ color: fg }}>
              {t(`appointments.${value}`)}
            </Text>
            {counts[value] > 0 ? (
              <View
                className="rounded-full px-1.5"
                style={{ backgroundColor: active ? colors.brand[500] : colors.cream[200] }}
              >
                <Text
                  className="text-[10px] font-bold"
                  style={{ color: active ? colors.white : colors.navy.secondary }}
                >
                  {counts[value]}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function DateTile({ iso, locale }: { iso: string | null; locale: string }) {
  const tile = calendarTile(iso, locale);

  if (!tile) {
    // scheduled_at is nullable in the API — never render an "Invalid Date" tile.
    return (
      <View
        className="w-[52px] items-center justify-center overflow-hidden rounded-xl py-3"
        style={{ backgroundColor: colors.cream[200], borderWidth: 1, borderColor: colors.cream[300] }}
      >
        <CalendarSearch size={18} color={colors.navy.muted} />
      </View>
    );
  }

  return (
    <View
      className="w-[52px] overflow-hidden rounded-xl"
      style={{ borderWidth: 1, borderColor: colors.cream[300] }}
    >
      <View className="items-center py-1" style={{ backgroundColor: colors.brand[500] }}>
        <Text className="text-[10px] font-bold tracking-wide" style={{ color: colors.white }}>
          {tile.month}
        </Text>
      </View>
      <View className="items-center pb-1.5 pt-1" style={{ backgroundColor: colors.white }}>
        <Text className="text-[19px] font-extrabold" style={{ color: colors.navy.text }}>
          {tile.day}
        </Text>
        <Text className="text-[9px] font-semibold" style={{ color: colors.navy.muted }}>
          {tile.weekday}
        </Text>
      </View>
    </View>
  );
}

function AppointmentRow({
  item,
  locale,
  onPress,
}: {
  item: Appointment;
  locale: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const TypeIcon = appointmentTypeIcon(item.appointment_type);
  const time = formatTime(item.scheduled_at, locale);
  const relative = relativeDayLabel(item.scheduled_at, t);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center px-4 py-4"
      style={({ pressed }) => ({ backgroundColor: pressed ? colors.cream[50] : colors.white })}
    >
      <DateTile iso={item.scheduled_at} locale={locale} />

      <View
        className="ml-3 h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.brand[50] }}
      >
        <TypeIcon size={19} color={colors.brand[600]} />
      </View>

      <View className="ml-3 flex-1">
        <View className="flex-row items-start">
          <View className="flex-1 pr-2">
            <Text
              className="text-[15px] font-bold"
              style={{ color: colors.navy.text }}
              numberOfLines={1}
            >
              {appointmentTypeLabel(item.appointment_type, t)}
            </Text>
            {item.provider_name ? (
              <Text
                className="mt-0.5 text-[13px]"
                style={{ color: colors.navy.secondary }}
                numberOfLines={1}
              >
                {item.provider_name}
              </Text>
            ) : null}
            {item.reason ? (
              <Text
                className="mt-0.5 text-xs font-semibold"
                style={{ color: colors.brand[600] }}
                numberOfLines={1}
              >
                {item.reason}
              </Text>
            ) : null}
          </View>
          <AppointmentStatusPill status={item.status} label={statusLabel(item.status, t)} />
        </View>

        <View className="mt-2 flex-row items-center">
          {time ? (
            <>
              <Clock size={12} color={colors.navy.muted} />
              <Text className="ml-1 text-xs" style={{ color: colors.navy.secondary }}>
                {time}
              </Text>
            </>
          ) : (
            <Text className="text-xs" style={{ color: colors.navy.muted }}>
              {t('appointments.noDate')}
            </Text>
          )}
          {item.facility_name ? (
            <>
              <View
                className="mx-2 h-3 w-px"
                style={{ backgroundColor: colors.cream[300] }}
              />
              <MapPin size={12} color={colors.navy.muted} />
              <Text
                className="ml-1 flex-1 text-xs"
                style={{ color: colors.navy.secondary }}
                numberOfLines={1}
              >
                {item.facility_name}
              </Text>
            </>
          ) : null}
        </View>

        {relative ? (
          <Text className="mt-1 text-[11px] font-semibold" style={{ color: colors.brand[600] }}>
            {relative}
          </Text>
        ) : null}
      </View>

      <ChevronRight size={18} color={colors.navy.muted} style={{ marginLeft: 4 }} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Empty / error states
// ---------------------------------------------------------------------------

/**
 * The demo patient legitimately has no history (the past scope used to leak
 * other patients' rows through a SQL grouping bug; now correctly scoped, it is
 * simply empty), so both empty states are first-class, not afterthoughts.
 */
function EmptyState({ scope, onBook }: { scope: AppointmentBoardScope; onBook: () => void }) {
  const { t } = useTranslation();
  const upcoming = scope === 'upcoming';
  const Icon = upcoming ? CalendarSearch : History;

  return (
    <View className="items-center px-8 py-14">
      <View
        className="h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.brand[50] }}
      >
        <Icon size={30} color={colors.brand[500]} />
      </View>
      <Text
        className="mt-5 text-center text-base font-bold"
        style={{ color: colors.navy.text }}
      >
        {upcoming ? t('appointments.emptyUpcoming') : t('appointments.emptyPast')}
      </Text>
      <Text
        className="mt-2 text-center text-sm leading-5"
        style={{ color: colors.navy.secondary }}
      >
        {upcoming ? t('appointments.emptyUpcomingBody') : t('appointments.emptyPastBody')}
      </Text>
      {upcoming ? (
        <Pressable onPress={onBook} accessibilityRole="button" className="mt-5">
          <LinearGradient
            colors={[colors.brand[600], colors.brand[500], colors.brand[300]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderRadius: 999,
              paddingHorizontal: 20,
              paddingVertical: 12,
            }}
          >
            <CalendarPlus size={16} color={colors.white} />
            <Text style={{ color: colors.white, fontSize: 14, fontWeight: '700' }}>
              {t('appointments.bookNew')}
            </Text>
          </LinearGradient>
        </Pressable>
      ) : null}
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="items-center px-8 py-14">
      <View
        className="h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.semantic.dangerSurface }}
      >
        <TriangleAlert size={30} color={colors.semantic.danger} />
      </View>
      <Text className="mt-5 text-center text-base font-bold" style={{ color: colors.navy.text }}>
        {t('appointments.loadError')}
      </Text>
      <Text className="mt-2 text-center text-sm leading-5" style={{ color: colors.navy.secondary }}>
        {t('appointments.loadErrorBody')}
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        className="mt-5 flex-row items-center rounded-full px-5 py-3"
        style={{ borderWidth: 1, borderColor: colors.brand[500], gap: 8 }}
      >
        <RefreshCw size={15} color={colors.brand[600]} />
        <Text className="text-sm font-semibold" style={{ color: colors.brand[600] }}>
          {t('appointments.retry')}
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------

export default function AppointmentsListScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [scope, setScope] = useState<AppointmentBoardScope>('upcoming');
  const board = useAppointmentBoard(50);

  const segment = board[scope];
  const counts = useMemo(
    () => ({ upcoming: board.upcoming.total, past: board.past.total }),
    [board.upcoming.total, board.past.total],
  );

  const goBook = () => router.push('/appointments/book');

  return (
    <Screen className="px-0">
      <View className="flex-row items-center px-6 pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ borderWidth: 1, borderColor: colors.brand[300] }}
        >
          <ArrowLeft size={18} color={colors.brand[600]} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={board.isFetching}
            onRefresh={board.refetch}
            tintColor={colors.brand[500]}
          />
        }
      >
        <Text className="mt-3 text-[30px] font-extrabold" style={{ color: colors.navy.text }}>
          {t('appointments.title')}
        </Text>
        <Text className="mt-1.5 text-[15px] leading-5" style={{ color: colors.navy.secondary }}>
          {t('appointments.subtitle')}
        </Text>

        <BookingBanner onPress={goBook} />

        <SegmentedControl scope={scope} counts={counts} onChange={setScope} />

        <View
          className="mt-4 overflow-hidden rounded-3xl"
          style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.cream[300] }}
        >
          {board.isLoading ? (
            <View className="items-center py-16">
              <ActivityIndicator color={colors.brand[500]} />
            </View>
          ) : segment.isError ? (
            <ErrorState onRetry={board.refetch} />
          ) : segment.items.length === 0 ? (
            <EmptyState scope={scope} onBook={goBook} />
          ) : (
            segment.items.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? (
                  <View className="h-px" style={{ backgroundColor: colors.cream[300] }} />
                ) : null}
                <AppointmentRow
                  item={item}
                  locale={i18n.language}
                  onPress={() => router.push(`/appointments/${item.id}`)}
                />
              </View>
            ))
          )}
        </View>

        <View
          className="mt-4 flex-row items-center rounded-3xl p-4"
          style={{ backgroundColor: colors.brand[50] }}
        >
          <View
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.white }}
          >
            <ShieldPlus size={20} color={colors.brand[600]} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold" style={{ color: colors.navy.text }}>
              {t('appointments.tipTitle')}
            </Text>
            <Text className="mt-0.5 text-xs leading-4" style={{ color: colors.navy.secondary }}>
              {t('appointments.tipBody')}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
