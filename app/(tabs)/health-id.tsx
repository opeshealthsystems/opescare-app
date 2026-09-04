/**
 * Health ID tab — the OPES CORE-007 "My Health ID" layout on top of the app's
 * existing identity + temporary-access data layer.
 *
 * Presentation only. The credential itself is untouched:
 *   - `useHealthIdCard`          → GET  /mobile/health-id (permanent QR payload)
 *   - `useGenerateTemporaryQr`   → POST /mobile/qr/temporary (15-minute token)
 *   - `useCachedEmergencyProfile`→ the on-device copy, read with the radio off
 * Nothing here changes what a QR encodes, how a token is requested, or when a
 * token is discarded (it is dropped the second the countdown reaches zero).
 *
 * Layout (top → bottom): kit ScreenHeader · navy ID card (white face with
 * Avatar + CardFields + the permanent QR, action rail, security foot) ·
 * blood-group nudge · temporary-access panel (GradientButton mints, QR +
 * countdown once minted) · "Privacy & data" ListRows (access log, emergency
 * profile, privacy) · full-screen Present modal.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import { Screen } from '@/components/ui/Screen';
import { Avatar, CardField } from '@/components/core/shared';
import {
  Card,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
  StatusBadge,
  formatDate,
  formatTime,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import { useHealthIdCard, useGenerateTemporaryQr } from '@/lib/api/queries';
import { useCachedEmergencyProfile } from '@/lib/api/offlineQueries';
import type { HealthIdCard, TemporaryQrCode } from '@/lib/api/types';
import type { OfflineEmergencyProfile } from '@/lib/offline';

/** Backend `Patient::identity_status` groupings (see app/Enums/IdentityStatus.php) —
 * mirrored here only for badge tone, never compared with `===` on the backend side. */
const ACTIVE_STATUSES = new Set(['active', 'verified', 'verified_by_facility']);
const BLOCKED_STATUSES = new Set(['suspended', 'deceased', 'entered_in_error', 'merged', 'erasure_pending']);

/** Below this many seconds left the temporary-QR countdown flips to a critical tone
 * so the patient re-mints before it dies mid-scan at the desk. */
const EXPIRY_WARNING_SECONDS = 60;

/** Edge of the permanent QR inside the card face, and of the temporary one in its panel. */
const CARD_QR_SIZE = 108;
const PANEL_QR_SIZE = 184;
const PRESENT_QR_SIZE = 252;

function toneFor(statusKey: string): StatusTone {
  if (ACTIVE_STATUSES.has(statusKey)) return 'normal';
  if (BLOCKED_STATUSES.has(statusKey)) return 'critical';
  return 'warning';
}

function titleCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
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

/** Treats an empty/whitespace API string as "not recorded" — the demo patient has
 * no blood group, and a blank slot on a credential reads as broken, not empty. */
function presentOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * What the card renders, whichever store it came from. The live card carries
 * the QR payload and identity status; the on-device emergency copy carries
 * neither (it has no `qr_payload`, and we never synthesise one), so the QR
 * column shows a "reconnect" placeholder instead of a code.
 */
type CardModel = {
  healthId: string | null;
  name: string | null;
  dob: string | null;
  sex: string | null;
  bloodType: string | null;
  qrPayload: string | null;
  statusKey: string | null;
  /** Set only for the on-device copy: when it was captured. */
  capturedAt: string | null;
};

function modelFromLive(card: HealthIdCard): CardModel {
  return {
    healthId: card.health_id,
    name: card.display_name,
    dob: card.dob,
    sex: card.sex,
    bloodType: presentOrNull(card.blood_type),
    qrPayload: card.qr_payload,
    statusKey: (card.status ?? '').toLowerCase() || null,
    capturedAt: null,
  };
}

function modelFromCache(profile: OfflineEmergencyProfile): CardModel {
  return {
    healthId: profile.health_id,
    name: profile.display_name,
    dob: profile.dob,
    sex: profile.sex,
    bloodType: presentOrNull(profile.blood_group),
    qrPayload: null,
    statusKey: null,
    capturedAt: profile.captured_at,
  };
}

export default function HealthIdScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, statusMap, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const healthId = useHealthIdCard();
  const temporaryQr = useGenerateTemporaryQr();
  const cachedProfile = useCachedEmergencyProfile();

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
  const cached = cachedProfile.data ?? null;

  // Live first; the on-device copy only when the live card has never loaded.
  const model: CardModel | null = card ? modelFromLive(card) : cached ? modelFromCache(cached) : null;
  const showingCache = !card && !!cached;

  const handleShareIdentity = async () => {
    if (!model?.healthId) return;
    try {
      await Share.share({
        message: t('healthId.shareIdMessage', { id: model.healthId, name: model.name ?? '' }),
      });
    } catch {
      // Share sheet dismissed/cancelled — nothing to surface.
    }
  };

  const statusKey = model?.statusKey ?? '';
  const tone = toneFor(statusKey);
  const statusLabel = statusKey
    ? t(`healthId.statusValues.${statusKey}`, { defaultValue: titleCase(statusKey) })
    : t('healthId.notAvailable');

  const bloodType = model?.bloodType ?? null;

  const expiryTone: StatusTone = secondsLeft <= EXPIRY_WARNING_SECONDS ? 'critical' : 'normal';
  const expiryProgress = useMemo(() => {
    if (!tempQr || !tempQr.expires_in) return 0;
    return Math.min(1, Math.max(0, secondsLeft / tempQr.expires_in));
  }, [tempQr, secondsLeft]);

  // When the last refresh failed we keep showing what we have, and say so.
  const staleSince: Date | null = healthId.isError
    ? card
      ? new Date(healthId.dataUpdatedAt)
      : toDate(cached?.captured_at)
    : null;

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('healthId.title')}
        subtitle={t('healthId.subtitle')}
        showBack={false}
        actions={[
          {
            icon: 'info',
            onPress: () => router.push('/privacy'),
            accessibilityLabel: t('opesCore.healthId.about'),
          },
        ]}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={healthId.isRefetching}
            onRefresh={() => healthId.refetch()}
            tintColor={colors.blue}
          />
        }
      >
        {healthId.isLoading && !model ? (
          <CardSkeleton label={t('healthId.loadingLabel')} />
        ) : !model ? (
          <Card>
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('healthId.errorTitle')}
              message={t('healthId.loadError')}
              actionLabel={t('healthId.retry')}
              onAction={() => healthId.refetch()}
            />
          </Card>
        ) : (
          <>
            {healthId.isError ? (
              <StaleNotice
                message={t('healthId.loadError')}
                loadedAt={staleSince}
                onRetry={() => healthId.refetch()}
                retrying={healthId.isFetching}
              />
            ) : null}

            <IdCard
              model={model}
              statusKey={statusKey}
              statusTone={tone}
              statusLabel={statusLabel}
              onPresent={() => setPresenting(true)}
              onShare={handleShareIdentity}
            />

            {/* Blood group is genuinely unset for this patient — offer the real
                route that fills it instead of rendering a hollow slot. */}
            {!bloodType && !showingCache ? (
              <Card variant="flush">
                <ListRow
                  icon="droplet"
                  tint="red"
                  title={t('healthId.bloodGroupMissingTitle')}
                  subtitle={t('healthId.bloodGroupMissingBody')}
                  onPress={() => router.push('/edit-profile')}
                />
              </Card>
            ) : null}

            {/* ── Temporary 15-minute access QR (POST /mobile/qr/temporary) ── */}
            <SectionHeader title={t('healthId.temporaryQrTitle')} variant="overline" />
            <Card>
              <View style={styles.panelIntro}>
                <View style={[styles.panelIcon, { backgroundColor: tintMap.blue.bg }]}>
                  <Icon name="clock" size={20} color={tintMap.blue.fg} />
                </View>
                <Text style={styles.panelBody}>{t('healthId.temporaryQrBody')}</Text>
                {tempQr ? (
                  <StatusBadge
                    status="active"
                    tone="normal"
                    label={t('healthId.temporaryActiveBadge')}
                    icon="check"
                    size="sm"
                  />
                ) : null}
              </View>

              {tempQr ? (
                <View style={styles.tempPanel}>
                  <View style={styles.qrPanel}>
                    <QRCode
                      value={tempQr.qr_payload}
                      size={PANEL_QR_SIZE}
                      color={colors.textPrimary}
                      backgroundColor={colors.surface}
                    />
                  </View>

                  <View style={[styles.countdown, { backgroundColor: statusMap[expiryTone].bg }]}>
                    <Icon name="clock" size={14} color={statusMap[expiryTone].fg} />
                    <Text style={[styles.countdownText, { color: statusMap[expiryTone].fg }]}>
                      {t('healthId.expiresIn', { time: formatCountdown(secondsLeft) })}
                    </Text>
                  </View>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.round(expiryProgress * 100)}%`,
                          backgroundColor: statusMap[expiryTone].fg,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.meta}>
                    {t('healthId.validUntil', { time: formatTime(tempQr.expires_at, '—') })}
                  </Text>
                  {secondsLeft <= EXPIRY_WARNING_SECONDS ? (
                    <Text style={[styles.metaStrong, { color: statusMap.critical.fg }]}>
                      {t('healthId.expiringSoon')}
                    </Text>
                  ) : null}

                  <View style={styles.actionRow}>
                    <OutlineButton
                      icon="refresh"
                      label={t('healthId.regenerate')}
                      onPress={handleGenerate}
                      loading={temporaryQr.isPending}
                    />
                    <GradientButton
                      label={t('healthId.share')}
                      onPress={handleShareTemporary}
                      icon="none"
                      style={styles.actionGrow}
                      accessibilityHint={t('healthId.temporaryQrBody')}
                    />
                  </View>

                  {temporaryQr.isError ? <InlineError message={t('healthId.generateError')} /> : null}
                </View>
              ) : (
                <View style={styles.tempPanelIdle}>
                  {temporaryQr.isError ? <InlineError message={t('healthId.generateError')} /> : null}
                  <GradientButton
                    label={temporaryQr.isPending ? t('healthId.generating') : t('healthId.generateButton')}
                    onPress={handleGenerate}
                    loading={temporaryQr.isPending}
                    icon="none"
                    accessibilityHint={t('healthId.temporaryQrBody')}
                  />
                </View>
              )}
            </Card>

            {/* ── Who can read this record ────────────────────────────────── */}
            <SectionHeader title={t('settings.group.privacy')} variant="overline" />
            <Card variant="flush">
              <ListRow
                icon="history"
                tint="blue"
                title={t('healthId.accessLogLink')}
                subtitle={t('settings.privacy.accessLogsBody')}
                onPress={() => router.push('/privacy/access-logs')}
                divider
              />
              <ListRow
                icon="heart-pulse"
                tint="red"
                title={t('offline.scopeEmergencyProfile')}
                subtitle={
                  cached
                    ? t('offline.lastSaved', { when: formatDate(cached.captured_at, '—') })
                    : t('offline.neverSaved')
                }
                onPress={() => router.push('/offline-access')}
                divider
              />
              <ListRow
                icon="shield-check"
                tint="green"
                title={t('healthId.privacyTitle')}
                subtitle={t('healthId.privacyBody')}
                onPress={() => router.push('/privacy')}
              />
            </Card>
          </>
        )}
      </ScrollView>

      {/* Present mode — the permanent QR at scanning size on a plain white
          field, which is what a facility desk actually needs when the phone is
          handed over. Live card only: the on-device copy has no QR. */}
      <Modal
        visible={presenting && !!card}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setPresenting(false)}
        statusBarTranslucent={false}
      >
        <View style={styles.present}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('healthId.close')}
            onPress={() => setPresenting(false)}
            hitSlop={12}
            style={styles.presentClose}
          >
            <Icon name="close" size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.presentTitle}>{t('healthId.presentTitle')}</Text>
          <Text style={styles.presentBody}>{t('healthId.presentBody')}</Text>

          {card ? (
            <>
              <View style={styles.presentQr}>
                <QRCode
                  value={card.qr_payload}
                  size={PRESENT_QR_SIZE}
                  color={colors.textPrimary}
                  backgroundColor={colors.surface}
                />
              </View>
              <Text style={styles.presentId}>{card.health_id}</Text>
              <Text style={styles.presentName}>{card.display_name}</Text>
              <StatusBadge
                status={statusKey || 'unknown'}
                tone={tone}
                label={statusLabel}
                icon="shield-check"
                style={styles.presentBadge}
              />
            </>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

// ── The card ──────────────────────────────────────────────────────────────

function IdCard({
  model,
  statusKey,
  statusTone,
  statusLabel,
  onPresent,
  onShare,
}: {
  model: CardModel;
  statusKey: string;
  statusTone: StatusTone;
  statusLabel: string;
  onPresent: () => void;
  onShare: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const name = presentOrNull(model.name) ?? t('healthId.notAvailable');
  const dobLabel = formatDate(model.dob, '') || null;
  const age = ageFrom(model.dob);
  const dobValue = dobLabel
    ? age !== null
      ? `${dobLabel} · ${t('healthId.ageSuffix', { years: age })}`
      : dobLabel
    : t('healthId.notSet');

  const sexKey = (model.sex ?? '').toLowerCase();
  const sexLabel = sexKey
    ? t(`healthId.sexValues.${sexKey}`, { defaultValue: titleCase(sexKey) })
    : t('healthId.notSet');

  // The on-device copy has no identity status; its badge says how old it is.
  const badge = model.capturedAt ? (
    <StatusBadge
      status="cached"
      tone="warning"
      label={t('offline.lastSaved', { when: formatDate(model.capturedAt, '—') })}
      icon="clock"
      size="sm"
    />
  ) : (
    <StatusBadge
      status={statusKey || 'unknown'}
      tone={statusTone}
      label={statusLabel}
      icon="shield-check"
      size="sm"
    />
  );

  return (
    <View style={styles.navyFrame}>
      <View style={styles.cardFace}>
        <View style={styles.cardTop}>
          <View style={styles.cardIdentity}>
            <Avatar name={name} size={44} />
            <View style={styles.cardIdentityText}>
              <Text style={styles.cardName} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.cardBrandSub} numberOfLines={1}>
                {t('healthId.cardLabel')}
              </Text>
            </View>
          </View>
          <View style={styles.cardStatus}>
            <Text style={styles.cardStatusLabel}>{t('opesCore.healthId.cardStatusLabel')}</Text>
            {badge}
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardFields}>
            <CardField
              label={t('opesCore.healthId.fieldHealthId')}
              value={presentOrNull(model.healthId) ?? t('healthId.notAvailable')}
            />
            <CardField label={t('healthId.dob')} value={dobValue} />
            <CardField label={t('healthId.sex')} value={sexLabel} />
            <CardField label={t('healthId.bloodType')} value={model.bloodType ?? t('healthId.notSet')} />
          </View>

          <View style={styles.cardQrCol}>
            {model.qrPayload ? (
              <>
                <TouchableOpacity
                  style={styles.qrBox}
                  onPress={onPresent}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('healthId.presentFullScreen')}
                >
                  <QRCode
                    value={model.qrPayload}
                    size={CARD_QR_SIZE}
                    color={colors.textPrimary}
                    backgroundColor={colors.surface}
                  />
                </TouchableOpacity>
                <Text style={styles.qrCaption}>{t('opesCore.healthId.scanToVerify')}</Text>
              </>
            ) : (
              <>
                <View style={[styles.qrBox, styles.qrPlaceholder]}>
                  <Icon name="qr" size={30} color={colors.textMuted} />
                </View>
                <Text style={styles.qrMeta}>{t('offline.syncOfflineHint')}</Text>
              </>
            )}
          </View>
        </View>
      </View>

      <View style={styles.cardActions}>
        <CardAction
          icon="maximize"
          label={t('healthId.present')}
          onPress={onPresent}
          disabled={!model.qrPayload}
        />
        <View style={styles.cardActionsDivider} />
        <CardAction icon="share" label={t('healthId.share')} onPress={onShare} disabled={!model.healthId} />
      </View>

      <View style={styles.cardFoot}>
        <Icon name="shield-check" size={18} color={colors.textOnBrand} />
        <Text style={styles.cardFootCopy}>{t('opesCore.healthId.cardFootCopy')}</Text>
        <View style={styles.cardFootBrand}>
          <Text style={styles.cardFootBrandTitle}>{t('healthId.cardLabel').toUpperCase()}</Text>
          <Text style={styles.cardFootBrandSub} numberOfLines={1}>
            {t('healthId.cardTagline')}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** One of the two white-on-navy actions in the rail under the card face. */
function CardAction({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.cardAction, (pressed || disabled) && styles.cardActionDim]}
    >
      <Icon name={icon} size={16} color={colors.textOnBrand} />
      <Text style={styles.cardActionLabel}>{label}</Text>
    </Pressable>
  );
}

/** Secondary bordered button beside a GradientButton (the kit has no outline variant). */
function OutlineButton({
  icon,
  label,
  onPress,
  loading = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: loading, busy: loading }}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
      style={[styles.outlineButton, loading && styles.outlineButtonOff]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.link} />
      ) : (
        <Icon name={icon} size={16} color={colors.link} />
      )}
      <Text style={styles.outlineButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Critical-toned inline notice for a failed mint. */
function InlineError({ message }: { message: string }) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = statusMap.critical;
  return (
    <View style={[styles.inlineError, { backgroundColor: skin.bg }]} accessibilityRole="alert">
      <Icon name="alert-triangle" size={16} color={skin.fg} />
      <Text style={[styles.inlineErrorText, { color: skin.fg }]}>{message}</Text>
    </View>
  );
}

/** Credential-shaped skeleton. A blank flash on the ID screen reads as a broken
 * card, so the loading state holds the card's silhouette. */
function CardSkeleton({ label }: { label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  return (
    <View style={styles.skeletonWrap}>
      <Animated.View style={{ opacity: pulse }}>
        <View style={styles.skeletonCard}>
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonPill} />
          </View>
          <View style={[styles.skeletonLine, { width: '40%' }]} />
          <View style={[styles.skeletonLine, { width: '75%', height: 22 }]} />
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonCell} />
            <View style={styles.skeletonCell} />
            <View style={styles.skeletonCell} />
          </View>
          <View style={styles.skeletonBar} />
        </View>
      </Animated.View>

      <Animated.View style={{ opacity: pulse }}>
        <View style={styles.skeletonQrCard}>
          <View style={styles.skeletonQr} />
        </View>
      </Animated.View>

      <View style={styles.skeletonLabelRow}>
        <ActivityIndicator size="small" color={colors.blue} />
        <Text style={styles.meta}>{label}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },

    // The credential: navy frame around a white face, then the action rail
    // and the security foot on the navy.
    navyFrame: {
      backgroundColor: colors.navy,
      borderRadius: radii.lg,
      padding: 10,
    },
    cardFace: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 14,
      gap: 12,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    cardIdentity: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    cardIdentityText: { flex: 1, minWidth: 0 },
    cardName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    cardBrandSub: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    cardStatus: { alignItems: 'flex-end', gap: 4 },
    cardStatusLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 9,
      letterSpacing: 0.6,
      color: colors.textMuted,
    },

    cardBody: { flexDirection: 'row', gap: spacing.md },
    cardFields: { flex: 1, minWidth: 0, gap: 10 },
    cardQrCol: { alignItems: 'center', gap: 4, maxWidth: CARD_QR_SIZE + 12 },
    qrBox: {
      padding: 6,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    qrPlaceholder: {
      width: CARD_QR_SIZE + 12,
      height: CARD_QR_SIZE + 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    qrCaption: {
      marginTop: 4,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textPrimary,
    },
    qrMeta: {
      marginTop: 4,
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 13,
      textAlign: 'center',
      color: colors.textMuted,
    },

    cardActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 10,
      borderRadius: radii.md,
      backgroundColor: colors.navyLight,
      overflow: 'hidden',
    },
    cardAction: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: 12,
    },
    cardActionDim: { opacity: 0.55 },
    cardActionLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textOnBrand,
    },
    cardActionsDivider: {
      width: 1,
      alignSelf: 'stretch',
      marginVertical: 8,
      backgroundColor: colors.navy,
    },

    cardFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: 6,
      paddingTop: 12,
      paddingBottom: 4,
    },
    cardFootCopy: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 14,
      color: colors.textOnBrand,
      opacity: 0.85,
    },
    cardFootBrand: { alignItems: 'flex-end', maxWidth: '40%' },
    cardFootBrandTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 10,
      letterSpacing: 0.4,
      color: colors.textOnBrand,
    },
    cardFootBrandSub: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 7,
      letterSpacing: 0.4,
      color: colors.textOnBrand,
      opacity: 0.75,
    },

    // Temporary-access panel
    panelIntro: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
    },
    panelIcon: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    panelBody: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    tempPanel: { marginTop: spacing.md, alignItems: 'center', gap: spacing.sm },
    tempPanelIdle: { marginTop: spacing.md, gap: spacing.sm },
    qrPanel: {
      padding: 14,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    countdown: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    countdownText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      fontVariant: ['tabular-nums'],
    },
    progressTrack: {
      alignSelf: 'stretch',
      height: 6,
      borderRadius: radii.pill,
      backgroundColor: colors.surfaceMuted,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: radii.pill },
    meta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    metaStrong: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      textAlign: 'center',
    },
    actionRow: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      marginTop: spacing.sm,
    },
    actionGrow: { flex: 1 },
    outlineButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    outlineButtonOff: { opacity: 0.6 },
    outlineButtonText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.link,
    },
    inlineError: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      borderRadius: radii.sm,
      padding: spacing.sm + 4,
    },
    inlineErrorText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
    },

    // Present modal
    present: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      backgroundColor: colors.surface,
    },
    presentClose: {
      position: 'absolute',
      top: 56,
      right: spacing.lg,
      width: 44,
      height: 44,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    presentTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
    },
    presentBody: {
      marginTop: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      textAlign: 'center',
      color: colors.textSecondary,
    },
    presentQr: {
      marginTop: spacing.xl,
      padding: 14,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    presentId: {
      marginTop: spacing.xl,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      letterSpacing: 1.5,
      color: colors.textPrimary,
    },
    presentName: {
      marginTop: spacing.xs,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    presentBadge: { marginTop: spacing.md },

    // Skeleton
    skeletonWrap: { gap: spacing.md },
    skeletonCard: {
      borderRadius: radii.lg,
      backgroundColor: colors.surfaceMuted,
      padding: spacing.md,
      gap: spacing.md,
    },
    skeletonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    skeletonAvatar: { width: 44, height: 44, borderRadius: radii.pill, backgroundColor: colors.border },
    skeletonPill: { width: 96, height: 24, borderRadius: radii.pill, backgroundColor: colors.border },
    skeletonLine: { height: 14, borderRadius: radii.pill, backgroundColor: colors.border },
    skeletonCell: { flex: 1, height: 32, borderRadius: radii.sm, backgroundColor: colors.border },
    skeletonBar: { height: 48, borderRadius: radii.md, backgroundColor: colors.border },
    skeletonQrCard: {
      alignItems: 'center',
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
    },
    skeletonQr: { width: 176, height: 176, borderRadius: radii.md, backgroundColor: colors.surfaceMuted },
    skeletonLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  });
