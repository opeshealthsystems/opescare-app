/**
 * Health ID tab — the OPESCARE Secure™ credential on top of the app's existing
 * identity + temporary-access data layer.
 *
 * Presentation only. The credential itself is untouched:
 *   - `useHealthIdCard`          → GET  /mobile/health-id-card (permanent QR payload)
 *   - `useGenerateTemporaryQr`   → POST /mobile/qr/temporary (15-minute token)
 *   - `useCachedEmergencyProfile`→ the on-device copy, read with the radio off
 * Nothing here changes what a QR encodes, how a token is requested, or when a
 * token is discarded (it is dropped the second the countdown reaches zero).
 *
 * What changed against the previous layout, and why:
 *   - The card is the layered secure credential from the design library
 *     (`components/health-id/SecureCredentialCard`), on this app's palette.
 *   - "Present" is now Presentation Mode: it mints the SAME 15-minute token the
 *     temporary-access panel mints and shows it live with a countdown. The
 *     permanent payload is base64 JSON no phone camera can open and nothing on
 *     the server decodes; the temporary token is a real `verify.qr` URL. A
 *     desk therefore always gets a code it can actually check. The permanent
 *     QR stays on the card face exactly as before.
 *   - One token, two views: the panel and the sheet share `tempQr`, so minting
 *     in either place is visible in both, and both drop it at zero.
 *
 * Layout (top → bottom): kit ScreenHeader (trust pill + about) · secure
 * credential · action rail (Present · Share · Copy) · privacy band ·
 * blood-group nudge · temporary-access panel · quick-action tiles ·
 * Presentation Mode sheet.
 */
import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '@/components/ui/Screen';
import { ActionTile } from '@/components/core/shared';
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
import type { TemporaryQrCode } from '@/lib/api/types';
import { HEALTH_ID_ART } from '@/components/health-id/assets';
import { Art, DECORATIVE, FILL, QrPanel } from '@/components/health-id/Layers';
import { SecureCredentialCard, type CopyState } from '@/components/health-id/SecureCredentialCard';
import { EXPIRY_WARNING_SECONDS, PresentationMode } from '@/components/health-id/PresentationMode';
import {
  VERIFIED_STATUSES,
  formatCountdown,
  modelFromCache,
  modelFromLive,
  titleCase,
  toDate,
  toneFor,
  type CredentialModel,
} from '@/components/health-id/model';

/** Edge of the temporary code inside its panel. */
const PANEL_QR_SIZE = 168;

export default function HealthIdScreen() {
  usePrivateScreen();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, statusMap, tintMap } = useTheme();
  // Below 400dp the trust-chip text squeezed the title into "Heal / th ID"; keep the shield only.
  const compactHeader = useWindowDimensions().width < 400;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const healthId = useHealthIdCard();
  const temporaryQr = useGenerateTemporaryQr();
  const cachedProfile = useCachedEmergencyProfile();

  const [tempQr, setTempQr] = useState<TemporaryQrCode | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const handleGenerate = useCallback(async () => {
    try {
      const data = await temporaryQr.mutateAsync();
      setTempQr(data);
    } catch {
      // temporaryQr.isError drives the inline error message below.
    }
  }, [temporaryQr]);

  /** Presentation Mode always opens on a live code: reuse the current token or mint one. */
  const openPresentation = useCallback(() => {
    setPresenting(true);
    if (!tempQr && !temporaryQr.isPending) void handleGenerate();
  }, [tempQr, temporaryQr.isPending, handleGenerate]);

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
  const model: CredentialModel | null = card ? modelFromLive(card) : cached ? modelFromCache(cached) : null;
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

  // Writes the REAL id via expo-clipboard and reports the outcome for two
  // seconds on the button itself, then rests.
  const handleCopyId = useCallback(async () => {
    if (!model?.healthId) return;
    let next: CopyState = 'copied';
    try {
      await Clipboard.setStringAsync(model.healthId);
    } catch {
      next = 'failed';
    }
    setCopyState(next);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState('idle'), 2000);
  }, [model?.healthId]);

  const statusKey = model?.statusKey ?? '';
  const tone = toneFor(statusKey);
  const verified = VERIFIED_STATUSES.has(statusKey);
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
        right={
          <View style={styles.headerRight}>
            <View style={styles.trustPill} accessibilityRole="text">
              <Icon name="shield-check" size={13} color={colors.blue} strokeWidth={2} />
              {compactHeader ? null : (
                <Text style={styles.trustPillText} numberOfLines={1}>
                  {t('healthId.secure.trustChip')}
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => router.push('/privacy')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('opesCore.healthId.about')}
              style={styles.headerIcon}
            >
              <Icon name="info" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        }
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

            <SecureCredentialCard
              model={model}
              statusTone={tone}
              statusLabel={statusLabel}
              verified={verified}
              onPressQr={card ? openPresentation : undefined}
              onCopyId={handleCopyId}
              copyState={copyState}
            />

            {/* ── Action rail ──────────────────────────────────────────────── */}
            <View style={styles.rail}>
              <RailAction icon="maximize" label={t('healthId.present')} onPress={openPresentation} disabled={!card} />
              <View style={styles.railDivider} />
              <RailAction icon="share" label={t('healthId.share')} onPress={handleShareIdentity} disabled={!model.healthId} />
              <View style={styles.railDivider} />
              <RailAction
                icon={copyState === 'copied' ? 'check' : copyState === 'failed' ? 'alert-circle' : 'copy'}
                label={
                  copyState === 'copied'
                    ? t('healthId.secure.copied')
                    : copyState === 'failed'
                      ? t('healthId.secure.copyFailed')
                      : t('healthId.secure.copyId')
                }
                onPress={handleCopyId}
                disabled={!model.healthId}
              />
            </View>

            {/* ── What this ID does, and does not, grant ───────────────────── */}
            <Card variant="flush">
              <ListRow
                icon="shield-check"
                tint="blue"
                title={t('healthId.privacyTitle')}
                subtitle={t('opesCore.healthId.cardFootCopy')}
                subtitleLines={4}
                onPress={() => router.push('/privacy')}
              />
            </Card>

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

            {/* ── Temporary 15-minute access code (POST /mobile/qr/temporary) ── */}
            <SectionHeader title={t('healthId.temporaryQrTitle')} variant="overline" />
            <Card style={styles.tempCard}>
              <View pointerEvents="none" style={StyleSheet.absoluteFill} {...DECORATIVE}>
                <Art source={HEALTH_ID_ART.documentTexture} style={FILL} resizeMode="cover" opacity={0.55} />
              </View>

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
                  <QrPanel
                    value={tempQr.qr_payload}
                    size={PANEL_QR_SIZE}
                    onPress={openPresentation}
                    accessibilityLabel={t('healthId.presentFullScreen')}
                    background={colors.surface}
                    foreground={colors.navy}
                  />

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
                      label={t('healthId.presentFullScreen')}
                      onPress={openPresentation}
                      icon="none"
                      style={styles.actionGrow}
                      accessibilityHint={t('healthId.presentBody')}
                    />
                  </View>
                  <OutlineButton icon="share" label={t('healthId.share')} onPress={handleShareTemporary} />

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

            {/* ── Quick actions ────────────────────────────────────────────── */}
            <SectionHeader title={t('healthId.secure.quickActions')} variant="overline" />
            {/* The card proves who you are; the passport is the record behind it. */}
            <View style={styles.tiles}>
              <ActionTile
                icon="book"
                label={t('passport.title')}
                caption={t('passport.openHint')}
                onPress={() => router.push('/health-passport')}
              />
              <ActionTile
                icon="folder"
                label={t('healthId.secure.tileRecords')}
                caption={t('healthId.secure.tileRecordsCaption')}
                onPress={() => router.push('/(tabs)/records')}
              />
              <ActionTile
                icon="history"
                label={t('healthId.secure.tileAccessLog')}
                caption={t('healthId.secure.tileAccessLogCaption')}
                onPress={() => router.push('/privacy/access-logs')}
              />
            </View>
            <View style={styles.tiles}>
              <ActionTile
                icon="heart-pulse"
                label={t('healthId.secure.tileEmergency')}
                caption={
                  cached
                    ? t('offline.lastSaved', { when: formatDate(cached.captured_at, '—') })
                    : t('healthId.secure.tileEmergencyCaption')
                }
                onPress={() => router.push('/offline-access')}
              />
              <ActionTile
                icon="lock"
                label={t('healthId.secure.tilePrivacy')}
                caption={t('healthId.secure.tilePrivacyCaption')}
                onPress={() => router.push('/privacy')}
              />
            </View>
          </>
        )}
      </ScrollView>

      {model ? (
        <PresentationMode
          visible={presenting && !!card}
          model={model}
          statusTone={tone}
          statusLabel={statusLabel}
          verified={verified}
          token={tempQr}
          secondsLeft={secondsLeft}
          minting={temporaryQr.isPending}
          mintFailed={temporaryQr.isError}
          onMint={handleGenerate}
          onShare={handleShareTemporary}
          onClose={() => setPresenting(false)}
        />
      ) : null}
    </Screen>
  );
}

/** One of the three white-on-navy actions in the rail under the credential. */
function RailAction({
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
      style={({ pressed }) => [
        styles.railAction,
        pressed && styles.railActionPressed,
        disabled && styles.railActionDim,
      ]}
    >
      {/* Plain glyph above a single-line label: stacking keeps all three
          columns the same width in French and at 320dp, where an inline
          icon + label clipped "Copier l'ID". */}
      <Icon name={icon} size={22} color={colors.textOnBrand} />
      <Text
        style={styles.railActionLabel}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        allowFontScaling={false}
      >
        {label}
      </Text>
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

    headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1, minWidth: 0 },
    trustPill: {
      flexShrink: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radii.pill,
      backgroundColor: colors.primarySoft,
    },
    trustPillText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 10.5,
      color: colors.blue,
    },
    headerIcon: { padding: 4 },

    // Action rail under the credential
    rail: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: radii.lg,
      backgroundColor: colors.navyLight,
      overflow: 'hidden',
    },
    railAction: {
      flex: 1,
      flexBasis: 0,
      minWidth: 0,
      minHeight: 60,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 10,
      paddingHorizontal: 6,
    },
    railActionPressed: { backgroundColor: 'rgba(255,255,255,0.10)' },
    railActionDim: { opacity: 0.5 },
    railActionLabel: {
      alignSelf: 'stretch',
      textAlign: 'center',
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 12.5,
      lineHeight: 16,
      color: colors.textOnBrand,
    },
    railDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      marginVertical: 12,
      backgroundColor: 'rgba(255,255,255,0.22)',
    },

    // Temporary-access panel
    tempCard: { overflow: 'hidden' },
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
    tempPanel: { marginTop: spacing.sm, alignItems: 'center', gap: spacing.sm },
    tempPanelIdle: { marginTop: spacing.md, gap: spacing.sm },
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
      alignSelf: 'stretch',
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

    // Quick actions
    tiles: { flexDirection: 'row', gap: spacing.sm + 4, marginTop: -4 },

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
