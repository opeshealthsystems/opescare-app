/**
 * Presentation Mode — the live credential a patient holds up at the desk.
 *
 * What the design asks for, and what this does with the app's EXISTING data
 * layer: the code on screen is the short-lived, server-issued temporary token
 * (POST /mobile/qr/temporary, 15 minutes, a real `verify.qr` URL any phone
 * camera can open), never the permanent payload. It is minted when the sheet
 * opens, counts down in view, and the QR is REMOVED the second it expires —
 * an expired code is never left scannable. Regenerating asks the server for a
 * new one; nothing here signs, extends or invents a token.
 *
 * Words are chosen carefully: the patient is shown a "live secure code", not
 * "verified". Verification happens on the provider's side when they scan.
 */
import React, { useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/core/shared';
import {
  GradientButton,
  Icon,
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
import type { TemporaryQrCode } from '@/lib/api/types';
import { HEALTH_ID_ART, HEALTH_ID_INDICATORS, anatomicalArt } from './assets';
import { Art, CornerBrackets, DECORATIVE, FILL, PulseArt, QrPanel, SealSystem, qrPanelExtent } from './Layers';
import { formatCountdown, presentOrNull, titleCase, type CredentialModel } from './model';

export const PRESENT_QR_SIZE = 192;

/** Below this many seconds left the countdown flips to a critical tone so the
 * patient re-mints before it dies mid-scan at the desk. */
export const EXPIRY_WARNING_SECONDS = 60;

type Props = {
  visible: boolean;
  model: CredentialModel;
  statusTone: StatusTone;
  statusLabel: string;
  verified: boolean;
  token: TemporaryQrCode | null;
  secondsLeft: number;
  minting: boolean;
  mintFailed: boolean;
  onMint: () => void;
  onShare: () => void;
  onClose: () => void;
};

export function PresentationMode({
  visible,
  model,
  statusTone,
  statusLabel,
  verified,
  token,
  secondsLeft,
  minting,
  mintFailed,
  onMint,
  onShare,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { colors, statusMap } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const live = !!token && secondsLeft > 0;
  const expiring = live && secondsLeft <= EXPIRY_WARNING_SECONDS;
  const expiryTone: StatusTone = expiring ? 'critical' : 'normal';
  const progress = token && token.expires_in ? Math.min(1, Math.max(0, secondsLeft / token.expires_in)) : 0;

  const name = presentOrNull(model.name) ?? t('healthId.notAvailable');
  const dobLabel = formatDate(model.dob, '') || t('healthId.notSet');
  const sexKey = (model.sex ?? '').toLowerCase();
  const sexLabel = sexKey ? t(`healthId.sexValues.${sexKey}`, { defaultValue: titleCase(sexKey) }) : t('healthId.notSet');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <View style={styles.root}>
        <LinearGradient
          colors={[colors.navy, colors.primaryDeep, colors.navy]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={StyleSheet.absoluteFill} {...DECORATIVE}>
          <Art source={HEALTH_ID_ART.circuitField} style={FILL} resizeMode="cover" opacity={0.36} />
          <Art source={HEALTH_ID_ART.dnaHelix} style={styles.bgHelix} resizeMode="cover" opacity={0.32} />
          <Art source={HEALTH_ID_ART.holoWave} style={styles.bgWave} resizeMode="cover" opacity={0.42} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('healthId.close')}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <Icon name="close" size={20} color={colors.textOnBrand} />
            </Pressable>
            <View style={styles.titleWrap}>
              <Text style={styles.eyebrow}>{t('healthId.secure.secureBrand')}</Text>
              <Text style={styles.title}>{t('healthId.presentTitle')}</Text>
              <Text style={styles.subtitle}>{t('healthId.secure.presentSubtitle')}</Text>
            </View>
          </View>

          {/* ── The holder's anatomical hologram ─────────────────────────
              Adult male / adult female / boy / girl, from the profile's own
              sex + date of birth (model.anatomicalProfile) — the health
              visual of a live credential. Here, and only here, it is a focal
              element; on the card it is a faint watermark. */}
          <View style={styles.figure} {...DECORATIVE}>
            <PulseArt source={HEALTH_ID_ART.holoRing} style={styles.figureAura} low={0.22} high={0.42} duration={3200} active={live} />
            <PulseArt source={anatomicalArt(model.anatomicalProfile)} style={styles.figureBody} low={0.72} high={0.98} duration={3200} active={live} />
          </View>

          {/* ── The live code ───────────────────────────────────────────── */}
          <View style={styles.stage}>
            <CornerBrackets color={colors.primarySoft} size={34} inset={0} radius={12} thickness={3} active={live} />
            {live ? (
              <QrPanel
                value={token.qr_payload}
                size={PRESENT_QR_SIZE}
                active
                background={colors.surface}
                foreground={colors.navy}
                logo={HEALTH_ID_ART.qrLogo}
              />
            ) : minting ? (
              <View style={styles.stageState}>
                <PulseArt source={HEALTH_ID_INDICATORS.verifying} style={styles.stateIcon} low={0.4} high={1} duration={1200} />
                <ActivityIndicator size="small" color={colors.primarySoft} />
                <Text style={styles.stateTitle}>{t('healthId.secure.preparing')}</Text>
              </View>
            ) : (
              <View style={styles.stageState}>
                <Art source={mintFailed ? HEALTH_ID_INDICATORS.invalid : HEALTH_ID_INDICATORS.expired} style={styles.stateIcon} />
                <Text style={styles.stateTitle}>
                  {mintFailed ? t('healthId.errorTitle') : t('healthId.secure.expiredTitle')}
                </Text>
                <Text style={styles.stateBody}>
                  {mintFailed ? t('healthId.generateError') : t('healthId.secure.expiredBody')}
                </Text>
              </View>
            )}
          </View>

          {/* ── Live status + countdown ─────────────────────────────────── */}
          <View style={[styles.livePill, live ? styles.livePillOn : styles.livePillOff]}>
            {live ? (
              <PulseArt
                source={verified ? HEALTH_ID_ART.verificationShield : HEALTH_ID_INDICATORS.scanning}
                style={styles.liveIcon}
                low={0.55}
                high={1}
                duration={1400}
              />
            ) : (
              <Art source={mintFailed ? HEALTH_ID_INDICATORS.invalid : HEALTH_ID_INDICATORS.expired} style={styles.liveIcon} />
            )}
            <View style={styles.liveCopy}>
              <Text style={styles.liveTitle}>
                {live ? t('healthId.secure.liveToken') : t('healthId.secure.expiredTitle')}
              </Text>
              <Text style={styles.liveSub} numberOfLines={2}>
                {live ? t('healthId.secure.liveTokenHint') : t('healthId.secure.expiredBody')}
              </Text>
            </View>
            <Text
              style={[styles.timer, expiring && { color: statusMap.critical.bg }]}
              accessibilityLabel={t('healthId.expiresIn', { time: formatCountdown(secondsLeft) })}
            >
              {live ? formatCountdown(secondsLeft) : '--:--'}
            </Text>
          </View>
          {live ? (
            <>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(progress * 100)}%`, backgroundColor: statusMap[expiryTone].bg },
                  ]}
                />
              </View>
              <Text style={styles.meta}>{t('healthId.validUntil', { time: formatTime(token.expires_at, '—') })}</Text>
              {expiring ? <Text style={[styles.meta, styles.metaWarn]}>{t('healthId.expiringSoon')}</Text> : null}
            </>
          ) : null}

          {/* ── Holder strip ────────────────────────────────────────────── */}
          <View style={styles.holder}>
            <Art source={HEALTH_ID_ART.cornerMarkers} style={FILL} resizeMode="stretch" opacity={0.55} />
            {/* Watermark behind the identity details (Presentation Mode: 6–12%). */}
            <Art source={anatomicalArt(model.anatomicalProfile)} style={styles.holderWatermark} resizeMode="contain" opacity={0.09} />
            <View style={styles.holderTop}>
              <View style={styles.avatarRing}>
                <Avatar name={name} size={40} uri={model.photoUrl} />
              </View>
              <View style={styles.holderText}>
                <View style={styles.holderNameRow}>
                  <Text style={styles.holderName} numberOfLines={1}>
                    {name}
                  </Text>
                  <StatusBadge
                    status={model.statusKey || 'unknown'}
                    tone={statusTone}
                    label={statusLabel}
                    icon={verified ? 'shield-check' : 'clock'}
                    size="sm"
                  />
                </View>
                <Text style={styles.holderId} numberOfLines={1}>
                  {presentOrNull(model.healthId) ?? t('healthId.notAvailable')}
                </Text>
              </View>
            </View>
            <View style={styles.holderCells}>
              <Cell styles={styles} label={t('healthId.dob')} value={dobLabel} wide />
              <View style={styles.cellDivider} />
              <Cell styles={styles} label={t('healthId.sex')} value={sexLabel} />
              <View style={styles.cellDivider} />
              <Cell styles={styles} label={t('healthId.bloodType')} value={model.bloodType ?? t('healthId.notSet')} />
            </View>
          </View>

          {/* ── Provider access ─────────────────────────────────────────── */}
          <View style={styles.provider}>
            <View style={styles.providerIcon}>
              <Icon name="lock" size={18} color={colors.textOnBrand} />
            </View>
            <View style={styles.providerCopy}>
              <Text style={styles.providerTitle}>{t('healthId.secure.providerAccessTitle')}</Text>
              <Text style={styles.providerBody}>{t('healthId.secure.providerAccessBody')}</Text>
            </View>
          </View>

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <GradientButton
            label={token ? t('healthId.regenerate') : t('healthId.generateButton')}
            onPress={onMint}
            loading={minting}
            icon="none"
            accessibilityHint={t('healthId.temporaryQrBody')}
          />
          <View style={styles.actionRow}>
            <GhostButton styles={styles} icon="share" label={t('healthId.share')} onPress={onShare} disabled={!live} colors={colors} />
            <GhostButton styles={styles} icon="close" label={t('healthId.close')} onPress={onClose} colors={colors} />
          </View>

          {/* ── OpesCare Secure signature ───────────────────────────────── */}
          <Art source={HEALTH_ID_ART.ecgComposite} style={styles.ecgBand} resizeMode="contain" opacity={0.55} />
          <View style={styles.signature}>
            <Art source={HEALTH_ID_ART.fingerprint} style={styles.fingerprint} />
            <SealSystem size={58} active={live} />
            <Art source={HEALTH_ID_ART.africa} style={styles.africa} />
          </View>
          <Text style={styles.signatureTitle}>{t('healthId.secure.secureBrand')}</Text>
          <Text style={styles.signatureSub}>{t('healthId.secure.trustChip')}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Cell({
  styles,
  label,
  value,
  wide = false,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <View style={[styles.cell, wide && styles.cellWide]}>
      <Text style={styles.cellLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.cellValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function GhostButton({
  styles,
  colors,
  icon,
  label,
  onPress,
  disabled = false,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.ghost, (pressed || disabled) && styles.pressed]}
    >
      <Icon name={icon} size={16} color={colors.textOnBrand} />
      <Text style={styles.ghostLabel}>{label}</Text>
    </Pressable>
  );
}

const STAGE = qrPanelExtent(PRESENT_QR_SIZE) + 24;

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.navy },
    bgHelix: { position: 'absolute', right: -14, top: 0, height: '100%', width: 70 },
    bgWave: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 },
    content: { paddingHorizontal: spacing.md, gap: spacing.md },
    pressed: { opacity: 0.6 },

    header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    close: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
    },
    titleWrap: { flex: 1, minWidth: 0, paddingTop: 2 },
    eyebrow: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 9.5,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: colors.primarySoft,
      opacity: 0.85,
    },
    title: {
      marginTop: 2,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textOnBrand,
    },
    subtitle: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textOnBrand,
      opacity: 0.75,
    },

    figure: {
      alignSelf: 'center',
      width: 190,
      height: 172,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: -10,
    },
    figureAura: { position: 'absolute', width: 190, height: 172 },
    // 305×720 source: keep the figure's aspect so it never stretches.
    figureBody: { width: 70, height: 165 },
    holderWatermark: { position: 'absolute', right: 10, top: -14, width: 64, height: 150 },

    stage: {
      alignSelf: 'center',
      width: STAGE,
      height: STAGE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stageState: {
      width: STAGE - 40,
      height: STAGE - 40,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: 'rgba(255,255,255,0.3)',
      backgroundColor: 'rgba(255,255,255,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.md,
    },
    stateIcon: { width: 64, height: 64 },
    stateTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      textAlign: 'center',
      color: colors.textOnBrand,
    },
    stateBody: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      textAlign: 'center',
      color: colors.textOnBrand,
      opacity: 0.75,
    },

    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      borderRadius: radii.md,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    livePillOn: { backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.28)' },
    livePillOff: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.18)' },
    liveIcon: { width: 30, height: 30 },
    liveCopy: { flex: 1, minWidth: 0 },
    liveTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textOnBrand,
    },
    liveSub: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      color: colors.textOnBrand,
      opacity: 0.75,
    },
    timer: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 24,
      letterSpacing: 1,
      fontVariant: ['tabular-nums'],
      color: colors.textOnBrand,
    },
    progressTrack: {
      height: 6,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(255,255,255,0.16)',
      overflow: 'hidden',
      marginTop: -6,
    },
    progressFill: { height: '100%', borderRadius: radii.pill },
    meta: {
      marginTop: -8,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      textAlign: 'center',
      color: colors.textOnBrand,
      opacity: 0.75,
    },
    metaWarn: { fontFamily: typography.fontFamily.semiBold, color: colors.statusCriticalBg, opacity: 1 },

    holder: {
      borderRadius: radii.md,
      backgroundColor: 'rgba(255,255,255,0.09)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
      padding: spacing.md,
      gap: spacing.sm + 4,
      overflow: 'hidden',
    },
    holderTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
    avatarRing: { padding: 2, borderRadius: radii.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
    holderText: { flex: 1, minWidth: 0, gap: 2 },
    holderNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    holderName: {
      flexShrink: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: colors.textOnBrand,
    },
    holderId: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.8,
      color: colors.primarySoft,
    },
    holderCells: { flexDirection: 'row', alignItems: 'stretch' },
    cell: { flex: 1, minWidth: 0, paddingHorizontal: 6 },
    cellWide: { flex: 1.45 },
    cellDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.18)' },
    cellLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 8.5,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.primarySoft,
      opacity: 0.85,
    },
    cellValue: {
      marginTop: 2,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 12.5,
      lineHeight: 16,
      color: colors.textOnBrand,
    },

    provider: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      borderRadius: radii.md,
      backgroundColor: 'rgba(255,255,255,0.07)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
      padding: spacing.md,
    },
    providerIcon: {
      width: 36,
      height: 36,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    providerCopy: { flex: 1, minWidth: 0 },
    providerTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textOnBrand,
    },
    providerBody: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textOnBrand,
      opacity: 0.78,
    },

    actionRow: { flexDirection: 'row', gap: spacing.sm + 4, marginTop: -4 },
    ghost: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: 14,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    ghostLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textOnBrand,
    },

    ecgBand: { alignSelf: 'center', width: '92%', height: 52, marginTop: spacing.sm },
    signature: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.lg,
      marginTop: -6,
    },
    fingerprint: { width: 40, height: 55 },
    africa: { width: 52, height: 55 },
    signatureTitle: {
      marginTop: -6,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      textAlign: 'center',
      color: colors.textOnBrand,
    },
    signatureSub: {
      marginTop: -12,
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      letterSpacing: 0.8,
      textAlign: 'center',
      color: colors.primarySoft,
      opacity: 0.85,
    },
  });
