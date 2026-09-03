import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle } from 'react-native-svg';
import {
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Clock,
  Droplet,
  Maximize2,
  QrCode,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Timer,
  TriangleAlert,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { useHealthIdCard, useGenerateTemporaryQr } from '../../lib/api/queries';
import { colors } from '../../theme/tokens';
import type { TemporaryQrCode } from '../../lib/api/types';

/** Backend `Patient::identity_status` groupings (see app/Enums/IdentityStatus.php) —
 * mirrored here only for badge tone, never compared with `===` on the backend side. */
const ACTIVE_STATUSES = new Set(['active', 'verified', 'verified_by_facility']);
const BLOCKED_STATUSES = new Set(['suspended', 'deceased', 'entered_in_error', 'merged', 'erasure_pending']);

/** Below this many seconds left the temporary-QR countdown flips to a danger tone
 * so the patient re-mints before it dies mid-scan at the desk. */
const EXPIRY_WARNING_SECONDS = 60;

type Tone = 'success' | 'warning' | 'danger';

const TONE_STYLES: Record<Tone, { surface: string; text: string }> = {
  success: { surface: colors.semantic.successSurface, text: colors.semantic.success },
  warning: { surface: colors.semantic.warningSurface, text: colors.semantic.warning },
  danger: { surface: colors.semantic.dangerSurface, text: colors.semantic.danger },
};

function toneFor(statusKey: string): Tone {
  if (ACTIVE_STATUSES.has(statusKey)) return 'success';
  if (BLOCKED_STATUSES.has(statusKey)) return 'danger';
  return 'warning';
}

function titleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function localeFor(language: string): string {
  return language === 'fr' ? 'fr-FR' : 'en-US';
}

function formatDob(dob: string | null, language: string): string | null {
  if (!dob) return null;
  const date = new Date(dob);
  if (Number.isNaN(date.getTime())) return dob;
  return date.toLocaleDateString(localeFor(language), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Whole years between `dob` and today — shown beside the date of birth the way a
 * clinician reads an ID card ("14 Apr 1992 · 34 yrs"). */
function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const monthDelta = now.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) years -= 1;
  return years >= 0 && years < 150 ? years : null;
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(clamped % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatClockTime(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString(localeFor(language), { hour: '2-digit', minute: '2-digit' });
}

/** Treats an empty/whitespace API string as "not recorded" — the demo patient has
 * no blood group, and a blank slot on a credential reads as broken, not empty. */
function presentOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function HealthIdScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const healthId = useHealthIdCard();
  const temporaryQr = useGenerateTemporaryQr();

  const [tempQr, setTempQr] = useState<TemporaryQrCode | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [presenting, setPresenting] = useState(false);

  useEffect(() => {
    if (!tempQr) return;
    const expiresAtMs = new Date(tempQr.expires_at).getTime();

    const tick = () => {
      const remaining = Math.round((expiresAtMs - Date.now()) / 1000);
      if (remaining <= 0) {
        setSecondsLeft(0);
        setTempQr(null);
        return;
      }
      setSecondsLeft(remaining);
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [tempQr]);

  const handleGenerate = async () => {
    try {
      const data = await temporaryQr.mutateAsync();
      setTempQr(data);
    } catch {
      // temporaryQr.isError drives the inline error message below.
    }
  };

  const handleShareTemporary = async () => {
    if (!tempQr) return;
    try {
      await Share.share({
        message: t('healthId.shareMessage', {
          url: tempQr.verify_url,
          time: formatCountdown(secondsLeft),
        }),
      });
    } catch {
      // Share sheet dismissed/cancelled — nothing to surface.
    }
  };

  const card = healthId.data;

  const handleShareIdentity = async () => {
    if (!card) return;
    try {
      await Share.share({
        message: t('healthId.shareIdMessage', { id: card.health_id, name: card.display_name }),
      });
    } catch {
      // Share sheet dismissed/cancelled — nothing to surface.
    }
  };

  const statusKey = (card?.status ?? '').toLowerCase();
  const tone = toneFor(statusKey);
  const statusLabel = statusKey
    ? t(`healthId.statusValues.${statusKey}`, { defaultValue: titleCase(statusKey) })
    : t('healthId.notAvailable');

  const sexKey = (card?.sex ?? '').toLowerCase();
  const sexLabel = sexKey
    ? t(`healthId.sexValues.${sexKey}`, { defaultValue: titleCase(sexKey) })
    : t('healthId.notSet');

  const bloodType = presentOrNull(card?.blood_type);
  const dobLabel = formatDob(card?.dob ?? null, i18n.language);
  const age = ageFrom(card?.dob ?? null);
  const dobValue = dobLabel ?? t('healthId.notSet');

  const expiryTone: Tone = secondsLeft <= EXPIRY_WARNING_SECONDS ? 'danger' : 'success';
  const expiryProgress = useMemo(() => {
    if (!tempQr || !tempQr.expires_in) return 0;
    return Math.min(1, Math.max(0, secondsLeft / tempQr.expires_in));
  }, [tempQr, secondsLeft]);

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={healthId.isRefetching}
            onRefresh={() => healthId.refetch()}
            tintColor={colors.brand[500]}
          />
        }
      >
        <View className="mt-2">
          <Text className="text-2xl font-extrabold text-navy-text">{t('healthId.title')}</Text>
          <Text className="mt-1 text-sm text-navy-secondary">{t('healthId.subtitle')}</Text>
        </View>

        {healthId.isLoading ? (
          <CardSkeleton label={t('healthId.loadingLabel')} />
        ) : healthId.isError || !card ? (
          <View className="mt-6 items-center rounded-3xl bg-white p-7">
            <View
              className="h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.semantic.dangerSurface }}
            >
              <CircleAlert size={26} color={colors.semantic.danger} />
            </View>
            <Text className="mt-4 text-base font-bold text-navy-text">
              {t('healthId.errorTitle')}
            </Text>
            <Text className="mt-2 text-center text-sm text-navy-secondary">
              {t('healthId.loadError')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => healthId.refetch()}
              disabled={healthId.isFetching}
              className="mt-5 flex-row items-center rounded-full bg-brand-50 px-5 py-3"
              style={{ opacity: healthId.isFetching ? 0.6 : 1 }}
            >
              {healthId.isFetching ? (
                <ActivityIndicator size="small" color={colors.brand[600]} />
              ) : (
                <RefreshCw size={15} color={colors.brand[600]} />
              )}
              <Text className="ml-2 text-sm font-bold text-brand-600">{t('healthId.retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* ── The credential itself ─────────────────────────────────────
                Navy card stock, gold foil rule + rosette watermark, matching
                the Health ID card in the gold-brand dashboard references. */}
            {/* Shadow lives on the outer view: Android clips elevation when the
                same view sets `overflow: hidden`, so the clipping/rounding sits
                one level in. */}
            <View
              className="mt-6"
              style={{
                borderRadius: 24,
                shadowColor: colors.navy.text,
                shadowOpacity: 0.22,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
                elevation: 6,
              }}
            >
              <View
                className="overflow-hidden rounded-3xl"
                style={{ borderWidth: 1, borderColor: colors.brand[300] }}
              >
                {/* NativeWind's className→style transform does not reach
                    expo-linear-gradient (no cssInterop is registered for it), so
                    every value here has to be an inline style or it silently
                    no-ops — the same trap already documented in Button.tsx. */}
                <LinearGradient
                  colors={[colors.navy.text, colors.navy.secondary, colors.navy.text]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ padding: 20 }}
                >
                  <Rosette />

                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 flex-row items-center">
                      <View
                        className="h-11 w-11 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.10)',
                          borderWidth: 1,
                          borderColor: colors.brand[300],
                        }}
                      >
                        <ShieldCheck size={20} color={colors.brand[300]} />
                      </View>
                      <Text
                        className="ml-3 flex-1 text-[11px] font-bold uppercase tracking-widest"
                        style={{ color: colors.brand[300] }}
                      >
                        {t('healthId.cardLabel')}
                      </Text>
                    </View>
                    <View
                      className="ml-2 flex-row items-center rounded-full px-3 py-1.5"
                      style={{ backgroundColor: TONE_STYLES[tone].surface }}
                    >
                      <ShieldCheck size={12} color={TONE_STYLES[tone].text} />
                      <Text
                        className="ml-1 text-[11px] font-bold"
                        style={{ color: TONE_STYLES[tone].text }}
                      >
                        {statusLabel}
                      </Text>
                    </View>
                  </View>

                  <Text className="mt-7 text-lg font-bold text-white" numberOfLines={1}>
                    {card.display_name}
                  </Text>
                  <Text
                    className="mt-1.5 text-2xl font-extrabold text-white"
                    style={{ letterSpacing: 1.5 }}
                    numberOfLines={1}
                  >
                    {card.health_id}
                  </Text>
                  <Text className="mt-2 text-[11px] font-semibold" style={{ color: colors.brand[100] }}>
                    {t('healthId.cardTagline')}
                  </Text>

                  <View className="mt-5 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }} />

                  <View className="mt-4 flex-row">
                    <CardStat icon={UserRound} label={t('healthId.sex')} value={sexLabel} />
                    <CardStat
                      icon={CalendarDays}
                      label={t('healthId.dob')}
                      value={dobValue}
                      hint={
                        dobLabel && age !== null ? t('healthId.ageSuffix', { years: age }) : undefined
                      }
                    />
                    <CardStat
                      icon={Droplet}
                      label={t('healthId.bloodType')}
                      value={bloodType ?? t('healthId.notSet')}
                      muted={!bloodType}
                    />
                  </View>

                  <View
                    className="mt-5 flex-row overflow-hidden rounded-2xl"
                    style={{ backgroundColor: 'rgba(255,255,255,0.10)' }}
                  >
                    <CardAction
                      icon={Maximize2}
                      label={t('healthId.present')}
                      onPress={() => setPresenting(true)}
                    />
                    <View className="my-2.5 w-px" style={{ backgroundColor: 'rgba(255,255,255,0.20)' }} />
                    <CardAction
                      icon={Share2}
                      label={t('healthId.share')}
                      onPress={handleShareIdentity}
                    />
                  </View>
                </LinearGradient>
              </View>
            </View>

            {/* Blood group is genuinely unset for this patient — offer the real
                route that fills it instead of rendering a hollow slot. */}
            {!bloodType ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/edit-profile')}
                className="mt-4 flex-row items-center rounded-2xl bg-brand-50 p-4"
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-white">
                  <Droplet size={18} color={colors.brand[600]} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold text-navy-text">
                    {t('healthId.bloodGroupMissingTitle')}
                  </Text>
                  <Text className="mt-0.5 text-xs text-navy-secondary">
                    {t('healthId.bloodGroupMissingBody')}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.brand[600]} />
              </Pressable>
            ) : null}

            {/* ── Permanent verification QR ───────────────────────────────── */}
            <SectionCard
              icon={QrCode}
              title={t('healthId.qrSectionTitle')}
              body={t('healthId.qrSectionBody')}
            >
              <View className="mt-5 items-center">
                <QrFrame color={colors.cream[300]}>
                  <QRCode
                    value={card.qr_payload}
                    size={184}
                    color={colors.navy.text}
                    backgroundColor={colors.white}
                  />
                </QrFrame>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPresenting(true)}
                  className="mt-5 flex-row items-center rounded-full border border-cream-300 px-5 py-3"
                >
                  <Maximize2 size={15} color={colors.navy.text} />
                  <Text className="ml-2 text-sm font-bold text-navy-text">
                    {t('healthId.presentFullScreen')}
                  </Text>
                </Pressable>
              </View>
            </SectionCard>

            {/* ── Temporary 15-minute access QR (POST /mobile/qr/temporary) ── */}
            <SectionCard
              icon={Timer}
              title={t('healthId.temporaryQrTitle')}
              body={t('healthId.temporaryQrBody')}
              badge={
                tempQr ? (
                  <View
                    className="rounded-full px-2.5 py-1"
                    style={{ backgroundColor: colors.semantic.successSurface }}
                  >
                    <Text
                      className="text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: colors.semantic.success }}
                    >
                      {t('healthId.temporaryActiveBadge')}
                    </Text>
                  </View>
                ) : undefined
              }
            >
              {tempQr ? (
                <View className="mt-5 items-center">
                  <QrFrame color={colors.brand[300]}>
                    <QRCode
                      value={tempQr.qr_payload}
                      size={184}
                      color={colors.navy.text}
                      backgroundColor={colors.white}
                    />
                  </QrFrame>

                  <View
                    className="mt-5 flex-row items-center rounded-full px-4 py-2"
                    style={{ backgroundColor: TONE_STYLES[expiryTone].surface }}
                  >
                    <Clock size={14} color={TONE_STYLES[expiryTone].text} />
                    <Text
                      className="ml-2 text-sm font-bold"
                      style={{ color: TONE_STYLES[expiryTone].text, fontVariant: ['tabular-nums'] }}
                    >
                      {t('healthId.expiresIn', { time: formatCountdown(secondsLeft) })}
                    </Text>
                  </View>

                  <View className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-cream-200">
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(expiryProgress * 100)}%`,
                        backgroundColor: TONE_STYLES[expiryTone].text,
                      }}
                    />
                  </View>
                  <Text className="mt-2 text-xs text-navy-muted">
                    {t('healthId.validUntil', {
                      time: formatClockTime(tempQr.expires_at, i18n.language),
                    })}
                  </Text>
                  {secondsLeft <= EXPIRY_WARNING_SECONDS ? (
                    <Text
                      className="mt-1 text-xs font-semibold"
                      style={{ color: colors.semantic.danger }}
                    >
                      {t('healthId.expiringSoon')}
                    </Text>
                  ) : null}

                  <View className="mt-5 flex-row" style={{ gap: 12 }}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={handleShareTemporary}
                      className="flex-row items-center rounded-full border border-cream-300 px-4 py-3"
                    >
                      <Share2 size={14} color={colors.navy.text} />
                      <Text className="ml-2 text-xs font-bold text-navy-text">
                        {t('healthId.share')}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={handleGenerate}
                      disabled={temporaryQr.isPending}
                      className="flex-row items-center rounded-full border border-brand-300 bg-brand-50 px-4 py-3"
                      style={{ opacity: temporaryQr.isPending ? 0.6 : 1 }}
                    >
                      {temporaryQr.isPending ? (
                        <ActivityIndicator size="small" color={colors.brand[600]} />
                      ) : (
                        <RefreshCw size={14} color={colors.brand[600]} />
                      )}
                      <Text className="ml-2 text-xs font-bold text-brand-600">
                        {t('healthId.regenerate')}
                      </Text>
                    </Pressable>
                  </View>

                  {temporaryQr.isError ? (
                    <View className="mt-4 flex-row items-start self-stretch rounded-xl p-3" style={{ backgroundColor: colors.semantic.dangerSurface }}>
                      <TriangleAlert size={15} color={colors.semantic.danger} />
                      <Text
                        className="ml-2 flex-1 text-xs"
                        style={{ color: colors.semantic.danger }}
                      >
                        {t('healthId.generateError')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View className="mt-5">
                  {temporaryQr.isError ? (
                    <View
                      className="mb-4 flex-row items-start rounded-xl p-3"
                      style={{ backgroundColor: colors.semantic.dangerSurface }}
                    >
                      <TriangleAlert size={15} color={colors.semantic.danger} />
                      <Text
                        className="ml-2 flex-1 text-xs"
                        style={{ color: colors.semantic.danger }}
                      >
                        {t('healthId.generateError')}
                      </Text>
                    </View>
                  ) : null}
                  <Button
                    label={temporaryQr.isPending ? t('healthId.generating') : t('healthId.generateButton')}
                    onPress={handleGenerate}
                    loading={temporaryQr.isPending}
                    leftIcon={Sparkles}
                    showChevron={false}
                  />
                </View>
              )}
            </SectionCard>

            {/* ── Trust footer ────────────────────────────────────────────── */}
            <View className="mb-10 mt-4 rounded-2xl bg-brand-50 p-4">
              <View className="flex-row items-start">
                <ShieldCheck size={16} color={colors.brand[600]} />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold text-navy-text">
                    {t('healthId.privacyTitle')}
                  </Text>
                  <Text className="mt-1 text-xs text-navy-secondary">
                    {t('healthId.privacyBody')}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/privacy/access-logs')}
                className="mt-3 flex-row items-center border-t border-brand-100 pt-3"
              >
                <Text className="flex-1 text-sm font-bold text-brand-600">
                  {t('healthId.accessLogLink')}
                </Text>
                <ChevronRight size={17} color={colors.brand[600]} />
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      {/* Present mode — the QR at scanning size on a plain white field, which is
          what a facility desk actually needs when the phone is handed over. */}
      <Modal
        visible={presenting && !!card}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setPresenting(false)}
        statusBarTranslucent={false}
      >
        <View className="flex-1 items-center justify-center bg-white px-8">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('healthId.close')}
            onPress={() => setPresenting(false)}
            hitSlop={12}
            className="absolute right-6 top-14 h-11 w-11 items-center justify-center rounded-full bg-cream-100"
          >
            <X size={20} color={colors.navy.text} />
          </Pressable>

          <Text className="text-lg font-extrabold text-navy-text">
            {t('healthId.presentTitle')}
          </Text>
          <Text className="mt-2 text-center text-sm text-navy-secondary">
            {t('healthId.presentBody')}
          </Text>

          {card ? (
            <>
              <View className="mt-8">
                <QrFrame color={colors.brand[300]} size={40}>
                  <QRCode
                    value={card.qr_payload}
                    size={252}
                    color={colors.navy.text}
                    backgroundColor={colors.white}
                  />
                </QrFrame>
              </View>
              <Text
                className="mt-8 text-xl font-extrabold text-navy-text"
                style={{ letterSpacing: 1.5 }}
              >
                {card.health_id}
              </Text>
              <Text className="mt-1 text-sm text-navy-secondary">{card.display_name}</Text>
              <View
                className="mt-4 flex-row items-center rounded-full px-3 py-1.5"
                style={{ backgroundColor: TONE_STYLES[tone].surface }}
              >
                <ShieldCheck size={13} color={TONE_STYLES[tone].text} />
                <Text
                  className="ml-1.5 text-xs font-bold"
                  style={{ color: TONE_STYLES[tone].text }}
                >
                  {statusLabel}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

/** Guilloché-style rosette printed into the card stock — concentric hairlines in
 * gold, clipped by the card's rounded overflow. Security-print texture with no
 * bundled asset. */
function Rosette() {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', right: -56, top: -56, opacity: 0.18 }}
    >
      <Svg width={220} height={220} viewBox="0 0 220 220">
        {[104, 92, 80, 68, 56, 44, 32, 20].map((r) => (
          <Circle
            key={r}
            cx={110}
            cy={110}
            r={r}
            stroke={colors.brand[300]}
            strokeWidth={1}
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

function CardStat({
  icon: Icon,
  label,
  value,
  hint,
  muted = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <View className="flex-1 pr-2">
      <View className="flex-row items-center">
        <Icon size={12} color={colors.brand[300]} />
        <Text className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/60">
          {label}
        </Text>
      </View>
      <Text
        className="mt-1.5 text-sm font-bold"
        style={{ color: muted ? colors.brand[100] : colors.white }}
        numberOfLines={1}
      >
        {value}
      </Text>
      {hint ? <Text className="mt-0.5 text-[10px] text-white/55">{hint}</Text> : null}
    </View>
  );
}

function CardAction({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center py-3.5"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Icon size={15} color={colors.white} />
      <Text className="ml-2 text-sm font-bold text-white">{label}</Text>
    </Pressable>
  );
}

/** White section card with a gold icon chip header — the app's established
 * surface treatment (see the profile screen). */
function SectionCard({
  icon: Icon,
  title,
  body,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View className="mt-4 rounded-3xl bg-white p-5">
      <View className="flex-row items-start">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-50">
          <Icon size={18} color={colors.brand[600]} />
        </View>
        <View className="ml-3 flex-1">
          <View className="flex-row items-center">
            <Text className="flex-1 text-sm font-bold text-navy-text">{title}</Text>
            {badge ?? null}
          </View>
          <Text className="mt-1 text-xs leading-4 text-navy-secondary">{body}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

/** QR framed with corner brackets — the "scan me" treatment from the reference
 * cards, drawn around the code so the quiet zone stays untouched. */
function QrFrame({
  children,
  color,
  size = 30,
}: {
  children: ReactNode;
  color: string;
  size?: number;
}) {
  const corner = {
    position: 'absolute' as const,
    width: size,
    height: size,
    borderColor: color,
  };
  return (
    <View className="p-3">
      <View
        style={{
          padding: 14,
          borderRadius: 20,
          backgroundColor: colors.white,
        }}
      >
        {children}
      </View>
      <View style={{ ...corner, top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 }} />
      <View style={{ ...corner, top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 }} />
      <View style={{ ...corner, bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 14 }} />
      <View style={{ ...corner, bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 }} />
    </View>
  );
}

/** Credential-shaped skeleton. A blank flash on the ID screen reads as a broken
 * card, so the loading state holds the card's silhouette. */
function CardSkeleton({ label }: { label: string }) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // `className` is not wired up for Animated.View (NativeWind registers no
  // interop for it), so the animated wrappers carry plain inline styles and the
  // Tailwind classes live on the plain Views inside them.
  return (
    <View className="mt-6">
      <Animated.View style={{ opacity: pulse }}>
        <View className="overflow-hidden rounded-3xl bg-cream-200 p-5">
          <View className="flex-row items-center justify-between">
            <View className="h-11 w-11 rounded-full bg-cream-300" />
            <View className="h-6 w-24 rounded-full bg-cream-300" />
          </View>
          <View className="mt-7 h-4 w-2/5 rounded-full bg-cream-300" />
          <View className="mt-3 h-7 w-3/4 rounded-full bg-cream-300" />
          <View className="mt-5 h-px bg-cream-300" />
          <View className="mt-4 flex-row" style={{ gap: 12 }}>
            <View className="h-8 flex-1 rounded-lg bg-cream-300" />
            <View className="h-8 flex-1 rounded-lg bg-cream-300" />
            <View className="h-8 flex-1 rounded-lg bg-cream-300" />
          </View>
          <View className="mt-5 h-12 rounded-2xl bg-cream-300" />
        </View>
      </Animated.View>

      <Animated.View style={{ opacity: pulse }}>
        <View className="mt-4 items-center rounded-3xl bg-white p-5">
          <View className="h-44 w-44 rounded-2xl bg-cream-200" />
        </View>
      </Animated.View>

      <View className="mt-5 flex-row items-center justify-center">
        <ActivityIndicator size="small" color={colors.brand[500]} />
        <Text className="ml-2 text-xs text-navy-secondary">{label}</Text>
      </View>
    </View>
  );
}
