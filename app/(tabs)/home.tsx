import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import {
  BadgeCheck,
  Bell,
  Cake,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  Copy,
  Droplet,
  Droplets,
  FlaskConical,
  FolderHeart,
  Gauge,
  Hand,
  HeartPulse,
  Hourglass,
  MapPin,
  Pill,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Target,
  Thermometer,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Skeleton } from '../../components/ui/Skeleton';
import { UnreadBadge } from '../../components/ui/UnreadBadge';
import { useAuthStore } from '../../lib/store/auth';
import { useHealthIdCard, useUpcomingAppointments } from '../../lib/api/queries';
import { useUnreadNotificationCount } from '../../lib/api/appConfigQueries';
import {
  isOutOfRange,
  readingAge,
  useLatestVitals,
  type VitalKey,
  type VitalMeasure,
  type VitalStatus,
} from '../../lib/api/vitalsQueries';
import { colors } from '../../theme/tokens';

/**
 * Home — the daily landing surface.
 *
 * Structure follows `Mobile app screens/a_clean_mobile_app_home_dashboard_ui_screenshot.png`:
 * greeting block, gold Health ID hero with a real scannable QR and three
 * inline detail columns, ONE quick-action card holding five actions separated
 * by hairlines, then Upcoming Appointment and Health Vitals side by side, and
 * the care-plan promo.
 *
 * Everything on screen is real data: `useHealthIdCard` (health id, blood type,
 * dob, status, qr_payload), the auth store's `patient` (allergy count),
 * `useUpcomingAppointments` and `useLatestVitals`
 * (GET /mobile/vitals/latest — see lib/api/vitalsQueries.ts). Nothing is
 * placeholder; the demo patient's genuinely empty sections render deliberate
 * empty states.
 *
 * Deliberate departures from the reference, and why:
 *   - No hamburger at top-left. There is no drawer, and no menu route exists
 *     under `app/`; a control that opens nothing is worse than no control.
 *   - The Health ID avatar is a monogram, not a photo. There is no
 *     photo-upload endpoint, so a stock face would be a fabrication.
 *   - The reference's "Health Check" quick action has no screen. Its slot is
 *     Lab Results (`/labs`), which exists.
 *   - Inside the narrow Vitals column each reading is label-over-value rather
 *     than the reference's single line. French labels ("Fréq. respiratoire")
 *     do not fit beside a value in ~150pt, and truncating a clinical label is
 *     not an acceptable trade.
 *
 * NativeWind note: `className` is inert on `LinearGradient` (no cssInterop is
 * registered), so every gradient here is styled with inline `style`.
 */

/** Soft elevation shared by every white card, so the surfaces read as one set. */
const CARD_SHADOW: ViewStyle = {
  shadowColor: colors.navy.text,
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
};

/** Warmer, deeper lift for the Health ID hero — it should sit above the rest. */
const HERO_SHADOW: ViewStyle = {
  shadowColor: colors.brand[900],
  shadowOpacity: 0.3,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
};

interface QuickActionSpec {
  key: string;
  icon: LucideIcon;
  labelKey: string;
  route: string;
}

/**
 * Five real destinations in one row, matching the reference's single
 * quick-action card. Every route is a file under `app/`:
 * appointments/book.tsx, (tabs)/records.tsx, labs/index.tsx,
 * prescriptions/index.tsx, blood-finder.tsx.
 *
 * The reference's third slot, "Health Check", has no screen anywhere in the
 * app — Lab Results takes it. The fifth, "View All Services", is Find Blood
 * here: `/blood-finder` has NO other entry point in the whole app, whereas
 * "all services" (`/care-map`) is still reachable from this section's header
 * action and from the Records tab.
 */
const QUICK_ACTIONS: QuickActionSpec[] = [
  { key: 'book', icon: CalendarPlus, labelKey: 'home.quickActions.bookAppointment', route: '/appointments/book' },
  { key: 'records', icon: FolderHeart, labelKey: 'home.quickActions.healthRecords', route: '/(tabs)/records' },
  { key: 'labs', icon: FlaskConical, labelKey: 'home.quickActions.labResults', route: '/labs' },
  { key: 'prescriptions', icon: Pill, labelKey: 'home.quickActions.prescriptions', route: '/prescriptions' },
  { key: 'blood', icon: Droplets, labelKey: 'home.quickActions.findBlood', route: '/blood-finder' },
];

/** Icon + label for each measure the vitals endpoint can return. */
const VITAL_META: Record<VitalKey, { icon: LucideIcon; labelKey: string }> = {
  heart_rate: { icon: HeartPulse, labelKey: 'home.vitals.heartRate' },
  blood_pressure: { icon: Gauge, labelKey: 'home.vitals.bloodPressure' },
  blood_sugar: { icon: Droplet, labelKey: 'home.vitals.bloodSugar' },
  oxygen_saturation: { icon: Wind, labelKey: 'home.vitals.oxygenSaturation' },
  temperature: { icon: Thermometer, labelKey: 'home.vitals.temperature' },
  respiratory_rate: { icon: Wind, labelKey: 'home.vitals.respiratoryRate' },
};

/** How many readings the card shows before "See all" expands it in place. */
const VITALS_COLLAPSED_COUNT = 4;

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const patient = useAuthStore((s) => s.patient);
  const router = useRouter();
  const healthId = useHealthIdCard();
  const appointments = useUpcomingAppointments();
  const vitals = useLatestVitals();
  const nextAppointment = appointments.data?.data?.[0];
  // Lightweight count endpoint, not the heavy list. Resolves to 0 (no badge)
  // while loading or on error; the existing mark-read mutations invalidate the
  // ['notifications'] key prefix, which refreshes this immediately. Gated on
  // auth so it can never fire a pre-auth 401 into the refresh interceptor.
  const authStatus = useAuthStore((s) => s.status);
  const unreadCount = useUnreadNotificationCount(authStatus === 'authenticated');

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([healthId.refetch(), appointments.refetch(), vitals.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [healthId, appointments, vitals]);

  const initial = patient?.first_name?.[0]?.toUpperCase() ?? '?';
  const statusValue = (healthId.data?.status ?? patient?.status ?? '').toLowerCase();
  const isVerified = statusValue === 'verified' || statusValue === 'active';
  const qrPayload = healthId.data?.qr_payload;
  const displayName = healthId.data?.display_name ?? patient?.display_name ?? '';
  const healthIdValue = healthId.data?.health_id ?? patient?.health_id ?? null;

  // ── Copy the Health ID ──────────────────────────────────────────────────
  // The reference puts a copy control beside the number. It writes the REAL
  // id via expo-clipboard and reports the outcome for two seconds; there is no
  // silent success, and a failure says so rather than pretending it worked.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const onCopyHealthId = useCallback(async () => {
    if (!healthIdValue) return;
    let next: 'copied' | 'failed' = 'copied';
    try {
      await Clipboard.setStringAsync(healthIdValue);
    } catch {
      next = 'failed';
    }
    setCopyState(next);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState('idle'), 2000);
  }, [healthIdValue]);

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[500]} />
        }
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View className="mt-2 flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center pr-3">
            <LinearGradient
              colors={[colors.brand[300], colors.brand[500], colors.brand[700]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <HeartPulse color={colors.cream[50]} size={17} />
            </LinearGradient>
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="text-[17px] font-extrabold text-navy-text">Opes</Text>
                <Text className="text-[17px] font-extrabold text-brand-500">Care</Text>
              </View>
              <Text className="text-[8px] font-medium text-navy-secondary" numberOfLines={1}>
                {t('auth.tagline')}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-4">
            <Pressable
              onPress={() => router.push('/notifications')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.title')}
            >
              <View
                className="h-10 w-10 items-center justify-center rounded-full bg-white"
                style={{ borderWidth: 1, borderColor: colors.cream[300] }}
              >
                <Bell size={19} color={colors.navy.text} />
                {/* Count renders as its own accessible text node; the button
                    above carries the "Notification Center" label. No new
                    notifications.* i18n key needed. */}
                <UnreadBadge count={unreadCount} />
              </View>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(tabs)/profile')}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={t('profile.title')}
            >
              <View
                className="h-10 w-10 items-center justify-center rounded-full bg-brand-100"
                style={{ borderWidth: 1.5, borderColor: colors.brand[300] }}
              >
                <Text className="text-[15px] font-extrabold text-brand-600">{initial}</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* ── Greeting ───────────────────────────────────────────────────── */}
        <View className="mt-7 flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-[22px] font-extrabold leading-7 text-navy-text">
              {t(greetingKey())}
            </Text>
            <View className="flex-row items-center">
              <Text className="text-[22px] font-extrabold leading-8 text-brand-500" numberOfLines={1}>
                {patient?.first_name ?? '—'}
              </Text>
              <Hand size={21} color={colors.brand[300]} style={{ marginLeft: 8 }} />
            </View>
            <Text className="mt-1.5 text-[13px] leading-5 text-navy-secondary">{t('home.subtitle')}</Text>
          </View>

          {/* Brand medallion — the shield motif from the reference header. */}
          <View
            className="h-[72px] w-[72px] items-center justify-center rounded-full"
            style={{ backgroundColor: colors.brand[50] }}
          >
            <View
              className="h-[70px] w-[70px] items-center justify-center rounded-full"
              style={{ borderWidth: 1, borderColor: colors.brand[100] }}
            >
              <LinearGradient
                colors={[colors.brand[300], colors.brand[500], colors.brand[700]]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheck color={colors.white} size={28} />
              </LinearGradient>
            </View>
          </View>
        </View>

        {/* ── Health ID hero ─────────────────────────────────────────────── */}
        <LinearGradient
          colors={[colors.brand[600], colors.brand[500], colors.brand[300]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 24,
            marginTop: 24,
            padding: 18,
            overflow: 'hidden',
            ...HERO_SHADOW,
          }}
        >
          {/* Decorative watermarks — non-interactive, clipped by the card. */}
          <View
            style={{
              position: 'absolute',
              right: -46,
              top: -56,
              width: 168,
              height: 168,
              borderRadius: 84,
              backgroundColor: 'rgba(255,255,255,0.10)',
              pointerEvents: 'none',
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: -60,
              bottom: -70,
              width: 150,
              height: 150,
              borderRadius: 75,
              backgroundColor: 'rgba(255,255,255,0.07)',
              pointerEvents: 'none',
            }}
          />

          {/* The reference puts a patient photo here. The API exposes none, and
              a stock face would fabricate identity data — so the slot held a
              monogram instead. At 375pt that monogram cost 52pt and clipped the
              Health ID itself to "OC-DEMO-…", while duplicating an initial the
              patient's own name already carries two lines below. Dropping it
              gives the credential number the width it needs. */}
          <View className="flex-row items-start justify-between">
            <View className="flex-1">
              {/* letterSpacing 1 across 18 uppercase characters was ~18px of
                  overflow on its own; 0.6 keeps the eyebrow's spaced-caps feel
                  and lets the full label render at 375px. */}
              <Text
                className="text-[10px] font-bold uppercase text-white/80"
                style={{ letterSpacing: 0.6 }}
                numberOfLines={1}
              >
                {t('home.healthId.title')}
              </Text>

              {healthId.isLoading ? (
                <ActivityIndicator color={colors.white} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
              ) : (
                <View className="mt-1 flex-row items-center">
                  <Text
                    className="flex-1 text-[15px] font-extrabold text-white"
                    numberOfLines={1}
                  >
                    {healthIdValue ?? '—'}
                  </Text>
                  {healthIdValue ? (
                    <Pressable
                      onPress={onCopyHealthId}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t('home.healthId.copy')}
                      className="ml-1.5 items-center justify-center rounded-lg"
                      style={({ pressed }) => ({
                        width: 24,
                        height: 24,
                        backgroundColor: 'rgba(255,255,255,0.22)',
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      {copyState === 'copied' ? (
                        <Check size={13} color={colors.white} />
                      ) : (
                        <Copy size={13} color={colors.white} />
                      )}
                    </Pressable>
                  ) : null}
                </View>
              )}

              {displayName ? (
                <Text className="mt-0.5 text-[11px] font-medium text-white/85" numberOfLines={1}>
                  {displayName}
                </Text>
              ) : null}

              <View className="mt-2 flex-row items-center">
                <View
                  className="flex-row items-center self-start rounded-full px-2 py-0.5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.24)' }}
                >
                  {isVerified ? (
                    <BadgeCheck size={12} color={colors.white} />
                  ) : (
                    <Hourglass size={11} color={colors.white} />
                  )}
                  <Text className="ml-1 text-[10px] font-bold text-white" numberOfLines={1}>
                    {t(isVerified ? 'home.healthId.verified' : 'home.healthId.pending')}
                  </Text>
                </View>

                {copyState !== 'idle' ? (
                  <Text className="ml-2 flex-1 text-[10px] font-semibold text-white/90" numberOfLines={1}>
                    {t(copyState === 'copied' ? 'home.healthId.copied' : 'home.healthId.copyFailed')}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Real, scannable QR straight off the card payload. */}
            <Pressable
              onPress={() => router.push('/(tabs)/health-id')}
              accessibilityRole="button"
              accessibilityLabel={t('home.healthId.showQr')}
              className="ml-2"
            >
              <View className="items-center rounded-2xl bg-white p-1.5" style={{ width: 66 }}>
                <View className="items-center justify-center" style={{ height: 54, width: 54 }}>
                  {qrPayload ? (
                    <QRCode
                      value={qrPayload}
                      size={54}
                      color={colors.navy.text}
                      backgroundColor={colors.white}
                    />
                  ) : (
                    <QrCode size={28} color={colors.navy.muted} />
                  )}
                </View>
              </View>
            </Pressable>
          </View>

          <View className="my-3.5 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.28)' }} />

          {healthId.isError ? (
            <View className="flex-row items-center justify-between">
              <View className="flex-1 flex-row items-center pr-3">
                <CircleAlert size={15} color={colors.white} />
                <Text className="ml-2 flex-1 text-[12px] text-white/95">
                  {t('home.healthId.loadError')}
                </Text>
              </View>
              <Pressable
                onPress={() => healthId.refetch()}
                hitSlop={8}
                accessibilityRole="button"
                className="flex-row items-center rounded-full px-3 py-1.5"
                style={{ backgroundColor: 'rgba(255,255,255,0.24)' }}
              >
                <RefreshCw size={12} color={colors.white} />
                <Text className="ml-1.5 text-[11px] font-bold text-white">{t('home.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            /* Three inline detail columns, as the reference lays them out —
               but the reference also keeps "View ID Card" on this same line.
               That mockup is 852px wide; at 375pt a fourth item leaves each
               column ~44pt and clips the date to "Apr 1…". The link moves to
               its own line so the three stats get the full width. */
            <View className="flex-col">
              <View className="flex-row">
                <HeroDetail
                  icon={Droplets}
                  label={t('home.healthId.bloodGroup')}
                  value={healthId.data?.blood_type ?? patient?.blood_group ?? '—'}
                />
                <HeroDetail
                  icon={TriangleAlert}
                  label={t('home.healthId.allergies')}
                  value={formatCount(patient?.allergies_count, t)}
                />
                <HeroDetail
                  icon={Cake}
                  label={t('home.healthId.dateOfBirth')}
                  value={formatDate(healthId.data?.dob ?? patient?.dob, i18n.language)}
                />
              </View>

              <Pressable
                onPress={() => router.push('/(tabs)/health-id')}
                hitSlop={8}
                accessibilityRole="button"
                className="mt-2 flex-row items-center self-end"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text className="text-[12px] font-bold text-white" numberOfLines={1}>
                  {t('home.healthId.viewCard')}
                </Text>
                <ChevronRight size={14} color={colors.white} style={{ marginLeft: 1 }} />
              </Pressable>
            </View>
          )}
        </LinearGradient>

        {/* ── Quick actions ──────────────────────────────────────────────── */}
        <SectionHeader
          title={t('home.quickActions.title')}
          actionLabel={t('home.quickActions.viewAllServices')}
          onAction={() => router.push('/care-map')}
        />

        {/* ONE card, five actions, hairline dividers — as in the reference. */}
        <View
          className="flex-row overflow-hidden rounded-3xl bg-white py-3.5"
          style={{ borderWidth: 1, borderColor: colors.cream[300], ...CARD_SHADOW }}
        >
          {QUICK_ACTIONS.map((action, index) => (
            <View key={action.key} className="flex-1 flex-row">
              {index > 0 ? (
                <View className="my-0.5 w-px" style={{ backgroundColor: colors.line.subtle }} />
              ) : null}
              <ActionCell
                icon={action.icon}
                label={t(action.labelKey)}
                onPress={() => router.push(action.route)}
              />
            </View>
          ))}
        </View>

        {/* ── Appointment + Vitals, side by side (reference arrangement) ─── */}
        {/* The reference places these side by side, but that mockup is 852px
            wide. At a real 375px viewport two columns leave each card ~170pt,
            which clipped the appointment title, every vital's unit ("mm…"),
            and the card headings themselves. Measured, not assumed. Stacking
            keeps the reference's content and order while letting a blood
            pressure render as "120/80 mmHg" instead of "120/…". */}
        <View className="mt-7" style={{ gap: 12 }}>
          <View>
            <AppointmentCard
              query={appointments}
              appointment={nextAppointment}
              language={i18n.language}
              t={t}
              onOpen={(id) => router.push(`/appointments/${id}`)}
              onBook={() => router.push('/appointments/book')}
            />
          </View>
          <View>
            <VitalsCard query={vitals} language={i18n.language} t={t} />
          </View>
        </View>

        {/* ── Care-plan promo ────────────────────────────────────────────── */}
        <Pressable
          onPress={() => router.push('/care-plans')}
          accessibilityRole="button"
          className="mb-2 mt-7 overflow-hidden rounded-3xl p-5"
          style={{
            backgroundColor: colors.cream[200],
            borderWidth: 1,
            borderColor: colors.cream[300],
          }}
        >
          <View
            style={{
              position: 'absolute',
              right: -34,
              top: -34,
              width: 128,
              height: 128,
              borderRadius: 64,
              backgroundColor: colors.cream[50],
              opacity: 0.7,
              pointerEvents: 'none',
            }}
          />
          <View className="flex-row items-center">
            <View
              className="h-10 w-10 items-center justify-center rounded-2xl"
              style={{ backgroundColor: colors.brand[100] }}
            >
              <Target size={19} color={colors.brand[600]} />
            </View>
            <Text className="ml-3 flex-1 text-[16px] font-extrabold leading-5 text-navy-text">
              {t('home.insights.title')}
            </Text>
          </View>
          <Text className="mt-3 text-[13px] leading-5 text-navy-secondary">
            {t('home.insights.body')}
          </Text>
          <View
            className="mt-4 flex-row items-center self-start rounded-2xl px-4 py-2.5"
            style={{ backgroundColor: colors.brand[500] }}
          >
            <Text className="text-[13px] font-bold text-white">{t('home.insights.cta')}</Text>
            <ChevronRight size={15} color={colors.white} style={{ marginLeft: 3 }} />
          </View>
        </Pressable>

        <View className="h-10" />
      </ScrollView>
    </Screen>
  );
}

/* ── Cards ───────────────────────────────────────────────────────────────── */

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Upcoming appointment, laid out for the narrow left column: the calendar
 * chip sits above the details rather than beside them, so a provider name has
 * the card's full width instead of ~70pt.
 */
function AppointmentCard({
  query,
  appointment,
  language,
  t,
  onOpen,
  onBook,
}: {
  query: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  appointment:
    | {
        id: string;
        scheduled_at?: string | null;
        provider_name?: string | null;
        appointment_type?: string | null;
        facility_name?: string | null;
      }
    | undefined;
  language: string;
  t: Translate;
  onOpen: (id: string) => void;
  onBook: () => void;
}) {
  return (
    <ColumnCard>
      <CardHeading icon={CalendarDays} title={t('home.appointment.title')} />

      {query.isLoading ? (
        <View className="py-6">
          <Skeleton height={44} radius={12} />
          <Skeleton height={12} radius={6} style={{ marginTop: 12 }} />
          <Skeleton height={12} radius={6} width="70%" style={{ marginTop: 6 }} />
        </View>
      ) : query.isError ? (
        <CardError message={t('home.appointment.loadError')} retryLabel={t('home.retry')} onRetry={query.refetch} />
      ) : appointment ? (
        <>
          {appointment.scheduled_at ? (
            <View className="mt-3 flex-row">
              <DateChip value={appointment.scheduled_at} language={language} />
            </View>
          ) : null}

          <Text className="mt-2.5 text-[14px] font-extrabold leading-[18px] text-navy-text" numberOfLines={2}>
            {appointment.provider_name ?? appointment.appointment_type ?? '—'}
          </Text>
          {appointment.provider_name && appointment.appointment_type ? (
            <Text className="mt-0.5 text-[11px] text-navy-muted" numberOfLines={1}>
              {appointment.appointment_type}
            </Text>
          ) : null}

          {appointment.scheduled_at ? (
            <View className="mt-2 flex-row items-center">
              <Clock size={12} color={colors.brand[600]} />
              <Text className="ml-1.5 flex-1 text-[12px] font-semibold text-brand-600" numberOfLines={1}>
                {formatTime(appointment.scheduled_at, language)}
              </Text>
            </View>
          ) : null}

          {appointment.facility_name ? (
            <View className="mt-1 flex-row items-center">
              <MapPin size={12} color={colors.navy.muted} />
              <Text className="ml-1.5 flex-1 text-[12px] text-navy-secondary" numberOfLines={2}>
                {appointment.facility_name}
              </Text>
            </View>
          ) : null}

          <View className="flex-1" />

          <Pressable
            onPress={() => onOpen(appointment.id)}
            accessibilityRole="button"
            className="mt-3 flex-row items-center justify-between rounded-2xl px-3 py-2.5"
            style={({ pressed }) => ({
              backgroundColor: colors.cream[100],
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text className="flex-1 pr-1 text-[11px] font-bold text-navy-text" numberOfLines={2}>
              {t('home.appointment.viewDetails')}
            </Text>
            <ChevronRight size={15} color={colors.brand[600]} />
          </Pressable>
        </>
      ) : (
        /* Deliberate empty state — this is what the demo patient sees. */
        <View className="flex-1 items-center justify-center py-2">
          <View
            className="h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.brand[50] }}
          >
            <CalendarDays size={22} color={colors.brand[500]} />
          </View>
          <Text className="mt-2.5 text-center text-[13px] font-extrabold text-navy-text">
            {t('home.appointment.empty')}
          </Text>
          <Text className="mt-1 text-center text-[11px] leading-4 text-navy-secondary" numberOfLines={3}>
            {t('home.appointment.emptyBody')}
          </Text>
          <Pressable
            onPress={onBook}
            accessibilityRole="button"
            className="mt-3 w-full flex-row items-center justify-center rounded-2xl px-2 py-2.5"
            style={({ pressed }) => ({ backgroundColor: colors.brand[500], opacity: pressed ? 0.8 : 1 })}
          >
            <CalendarPlus size={13} color={colors.white} />
            <Text className="ml-1.5 flex-shrink text-[11px] font-bold text-white" numberOfLines={2}>
              {t('home.appointment.emptyCta')}
            </Text>
          </Pressable>
        </View>
      )}
    </ColumnCard>
  );
}

/**
 * Health Vitals.
 *
 * Three things this card refuses to do, because a vital shown wrongly is a
 * clinical hazard rather than a cosmetic bug:
 *   - It never renders a measure the API did not return. No zeros, no dashes
 *     standing in for a reading that was never taken.
 *   - It always states the reading's age. A month-old blood pressure is
 *     labelled as such and carries an explicit warning.
 *   - Out-of-range values are coloured from `colors.semantic.*` and carry the
 *     status in words as well, so the signal survives a colour-blind reader.
 */
function VitalsCard({
  query,
  language,
  t,
}: {
  query: {
    data: { measures: VitalMeasure[]; recorded_at: string | null } | undefined;
    isLoading: boolean;
    isError: boolean;
    refetch: () => unknown;
  };
  language: string;
  t: Translate;
}) {
  const [expanded, setExpanded] = useState(false);

  const measures = query.data?.measures ?? [];
  const visible = expanded ? measures : measures.slice(0, VITALS_COLLAPSED_COUNT);
  const canExpand = measures.length > VITALS_COLLAPSED_COUNT;
  const age = readingAge(query.data?.recorded_at);

  return (
    <ColumnCard>
      <CardHeading
        icon={HeartPulse}
        title={t('home.vitals.title')}
        /* "See all" expands in place: there is no vitals screen to send the
           patient to, and a link that goes nowhere useful is worse than none. */
        actionLabel={canExpand ? t(expanded ? 'home.vitals.showLess' : 'home.vitals.seeAll') : undefined}
        onAction={canExpand ? () => setExpanded((v) => !v) : undefined}
      />

      {query.isLoading ? (
        <View className="mt-3">
          {[0, 1, 2, 3].map((row) => (
            <View key={row} className="mb-3">
              <Skeleton height={9} radius={5} width="62%" />
              <Skeleton height={12} radius={6} width="44%" style={{ marginTop: 5 }} />
            </View>
          ))}
        </View>
      ) : query.isError ? (
        <CardError message={t('home.vitals.loadError')} retryLabel={t('home.retry')} onRetry={query.refetch} />
      ) : measures.length === 0 ? (
        <View className="flex-1 items-center justify-center py-2">
          <View
            className="h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.brand[50] }}
          >
            <HeartPulse size={22} color={colors.brand[500]} />
          </View>
          <Text className="mt-2.5 text-center text-[13px] font-extrabold text-navy-text">
            {t('home.vitals.empty')}
          </Text>
          <Text className="mt-1 text-center text-[11px] leading-4 text-navy-secondary" numberOfLines={3}>
            {t('home.vitals.emptyBody')}
          </Text>
        </View>
      ) : (
        <>
          <View className="mt-2.5">
            {visible.map((measure) => (
              <VitalRow key={measure.key} measure={measure} t={t} />
            ))}
          </View>

          <View className="flex-1" />

          <View className="mt-2 h-px" style={{ backgroundColor: colors.line.subtle }} />
          <Text className="mt-2 text-[10px] leading-[13px] text-navy-muted" numberOfLines={2}>
            {formatUpdated(query.data?.recorded_at ?? null, language, t)}
          </Text>
          {age.freshness === 'stale' ? (
            <Text
              className="mt-1 text-[10px] font-semibold leading-[13px]"
              style={{ color: colors.semantic.warning }}
              numberOfLines={2}
            >
              {t('home.vitals.staleNote')}
            </Text>
          ) : null}
        </>
      )}
    </ColumnCard>
  );
}

/** One reading: label above value, so a long French label keeps full width. */
function VitalRow({ measure, t }: { measure: VitalMeasure; t: Translate }) {
  const meta = VITAL_META[measure.key];
  const Icon = meta?.icon ?? HeartPulse;
  const tone = statusTone(measure.status);
  const flagged = isOutOfRange(measure.status);

  return (
    <View className="mb-2.5 flex-row items-start">
      <View
        className="mt-0.5 h-[18px] w-[18px] items-center justify-center rounded-md"
        style={{ backgroundColor: tone.surface }}
      >
        <Icon size={11} color={tone.color} />
      </View>
      <View className="ml-1.5 flex-1">
        <Text className="text-[10px] leading-[13px] text-navy-secondary" numberOfLines={1}>
          {meta ? t(meta.labelKey) : measure.key}
        </Text>
        <View className="mt-0.5 flex-row items-baseline">
          <Text
            className="text-[13px] font-extrabold leading-4"
            style={{ color: tone.color }}
            numberOfLines={1}
          >
            {measure.value}
          </Text>
          {measure.unit ? (
            <Text className="ml-1 text-[9px] font-semibold text-navy-muted" numberOfLines={1}>
              {measure.unit}
            </Text>
          ) : null}
        </View>
        {/* The status in words as well as in colour — never colour alone. */}
        {flagged || measure.status === 'unknown' ? (
          <Text
            className="mt-0.5 text-[9px] font-bold uppercase leading-[11px]"
            style={{ color: tone.color, letterSpacing: 0.3 }}
            numberOfLines={1}
          >
            {t(`home.vitals.status.${measure.status}`)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

/** The white card shell shared by the two side-by-side columns. */
function ColumnCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="flex-1 rounded-3xl bg-white p-3.5"
      style={{ borderWidth: 1, borderColor: colors.cream[300], ...CARD_SHADOW }}
    >
      {children}
    </View>
  );
}

/** Icon tile + title (+ optional right-hand action) inside a column card. */
function CardHeading({
  icon: Icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="flex-row items-center">
      <View
        className="h-6 w-6 items-center justify-center rounded-lg"
        style={{ backgroundColor: colors.brand[50] }}
      >
        <Icon size={13} color={colors.brand[600]} />
      </View>
      <Text className="ml-1.5 flex-1 text-[12px] font-extrabold text-navy-text" numberOfLines={1}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Text className="text-[10px] font-bold text-brand-600" numberOfLines={1}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Shared failure state for both column cards. */
function CardError({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => unknown;
}) {
  return (
    <View className="flex-1 items-center justify-center py-3">
      <CircleAlert size={20} color={colors.semantic.danger} />
      <Text className="mt-2 text-center text-[11px] leading-4 text-navy-secondary">{message}</Text>
      <Pressable
        onPress={() => onRetry()}
        accessibilityRole="button"
        className="mt-2.5 flex-row items-center rounded-xl px-3 py-1.5"
        style={({ pressed }) => ({ backgroundColor: colors.cream[200], opacity: pressed ? 0.75 : 1 })}
      >
        <RefreshCw size={11} color={colors.brand[600]} />
        <Text className="ml-1.5 text-[11px] font-bold text-brand-600">{retryLabel}</Text>
      </Pressable>
    </View>
  );
}

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="mb-3.5 mt-7 flex-row items-center justify-between">
      <Text className="text-[17px] font-extrabold text-navy-text">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <View className="flex-row items-center">
            <Text className="text-[13px] font-bold text-brand-600">{actionLabel}</Text>
            <ChevronRight size={14} color={colors.brand[600]} style={{ marginLeft: 1 }} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

/** One of the five cells in the single quick-action card. */
function ActionCell({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Five cells across 375pt leave ~65pt each. "Appointment" and
      // "Prescriptions" are ~62pt at this size, so the 2pt of horizontal
      // padding was the difference between one clean line and a mid-word
      // break ("Prescriptio / ns"). The hairline dividers already separate the
      // cells, so the padding was buying nothing.
      className="flex-1 items-center py-1"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-xl"
        style={{ backgroundColor: colors.brand[50] }}
      >
        <Icon size={17} color={colors.brand[600]} />
      </View>
      <Text
        className="mt-1.5 text-center text-[9.5px] font-bold text-navy-text"
        style={{ lineHeight: 12 }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** One of the Health ID hero's three inline detail columns. */
function HeroDetail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <View className="flex-1 pr-1.5">
      <View className="flex-row items-center">
        <Icon size={10} color="rgba(255,255,255,0.8)" />
        <Text className="ml-1 flex-1 text-[9px] font-medium text-white/75" numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text className="mt-0.5 text-[12px] font-extrabold text-white" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** MAY / 22 / THU calendar chip, as in the appointment references. */
function DateChip({ value, language }: { value: string; language: string }) {
  return (
    <View
      className="overflow-hidden rounded-2xl"
      style={{ width: 54, borderWidth: 1, borderColor: colors.cream[300] }}
    >
      <View className="items-center py-0.5" style={{ backgroundColor: colors.brand[500] }}>
        <Text className="text-[9px] font-extrabold uppercase text-white" style={{ letterSpacing: 0.6 }}>
          {formatMonth(value, language)}
        </Text>
      </View>
      <View className="items-center py-1" style={{ backgroundColor: colors.cream[50] }}>
        <Text className="text-[18px] font-extrabold leading-[22px] text-navy-text">
          {formatDayNumber(value, language)}
        </Text>
        <Text className="text-[9px] font-semibold uppercase text-navy-muted">
          {formatWeekday(value, language)}
        </Text>
      </View>
    </View>
  );
}

/* ── Clinical presentation ───────────────────────────────────────────────── */

/**
 * Colour for an advisory status, from `colors.semantic.*` only.
 * `critical` is danger, anything else out of range is warning, `unknown` is
 * deliberately neutral — the API declined to classify, so neither does the UI.
 */
function statusTone(status: VitalStatus): { color: string; surface: string } {
  switch (status) {
    case 'normal':
      return { color: colors.semantic.success, surface: colors.semantic.successSurface };
    case 'critical':
      return { color: colors.semantic.danger, surface: colors.semantic.dangerSurface };
    case 'low':
    case 'high':
    case 'abnormal':
      return { color: colors.semantic.warning, surface: colors.semantic.warningSurface };
    default:
      return { color: colors.semantic.neutral, surface: colors.semantic.neutralSurface };
  }
}

/* ── Formatting ──────────────────────────────────────────────────────────── */

/** Time-of-day greeting, from the device clock — matches the references. */
function greetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'home.greetingMorning';
  if (hour < 18) return 'home.greetingAfternoon';
  return 'home.greetingEvening';
}

/** `0` is a real, reassuring answer ("None") — not a missing value. */
function formatCount(count: number | null | undefined, t: Translate): string {
  if (count == null) return '—';
  if (count === 0) return t('home.healthId.none');
  return String(count);
}

/**
 * "Last updated: Today, 7:30 AM" only while that is true; otherwise the label
 * degrades to yesterday, an explicit day count, or a full date.
 */
function formatUpdated(recordedAt: string | null, language: string, t: Translate): string {
  const age = readingAge(recordedAt);
  if (!recordedAt || age.freshness === 'unknown' || age.days === null) {
    return t('home.vitals.updatedOn', { date: '—' });
  }

  if (age.freshness === 'today') {
    return t('home.vitals.updatedToday', { time: formatTime(recordedAt, language) });
  }
  if (age.days === 1) {
    return t('home.vitals.updatedYesterday', { time: formatTime(recordedAt, language) });
  }
  if (age.freshness === 'recent') {
    return t('home.vitals.updatedDaysAgo', { days: age.days });
  }
  return t('home.vitals.updatedOn', { date: formatDate(recordedAt, language) });
}

function localeTag(language: string): string {
  return language?.startsWith('fr') ? 'fr-FR' : 'en-US';
}

function formatDate(value: string | null | undefined, language: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeTag(language), { day: 'numeric', month: 'short', year: 'numeric' }).format(
    date,
  );
}

function formatMonth(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(localeTag(language), { month: 'short' }).format(date);
}

function formatDayNumber(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(localeTag(language), { day: 'numeric' }).format(date);
}

function formatWeekday(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(localeTag(language), { weekday: 'short' }).format(date);
}

function formatTime(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(localeTag(language), { hour: 'numeric', minute: '2-digit' }).format(date);
}
