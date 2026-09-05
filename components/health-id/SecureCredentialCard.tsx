/**
 * The OPESCARE Secure™ Health ID credential — the layered card from the
 * design library, on this app's palette.
 *
 * Exact z-order (bottom → top), after the design's LAYER_MAP:
 *   substrate gradient (navy → deep brand blue → brand blue) · guilloche
 *   texture · guilloche lines · wave mesh · particle highlights (breathing) ·
 *   DNA glow (breathing) · DNA helix · DNA micro-data · anatomical hologram
 *   (sex/age of the holder, else the neutral watermark) · Africa motif ·
 *   corner markers · brand row + identity status · holder · fields + framed QR
 *   · ECG line · chip + security copy + seal system · microtext band.
 *
 * `presentation` turns the quiet card into the live credential the design
 * calls Presentation Mode: faster sweep, brighter particles, pulsing corners,
 * glowing QR, the seal's light sweep.
 *
 * The credential data is untouched: what the QR encodes is whatever the
 * backend handed us in `qrPayload`.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/core/shared';
import {
  Icon,
  PulseLogo,
  StatusBadge,
  formatDate,
  radii,
  spacing,
  typography,
  useTheme,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import { HEALTH_ID_ART, hologramFor } from './assets';
import { Art, CornerBrackets, DECORATIVE, FILL, PulseArt, QrPanel, SealSystem, qrPanelExtent } from './Layers';
import { ageFrom, presentOrNull, titleCase, type CredentialModel } from './model';

/** Edge of the permanent QR inside the card. */
export const CARD_QR_SIZE = 88;

export type CopyState = 'idle' | 'copied' | 'failed';

type Props = {
  model: CredentialModel;
  statusTone: StatusTone;
  statusLabel: string;
  /** Identity status is `verified` / `verified_by_facility`: the shield mark is shown. */
  verified: boolean;
  presentation?: boolean;
  onPressQr?: () => void;
  onCopyId?: () => void;
  copyState?: CopyState;
};

export function SecureCredentialCard({
  model,
  statusTone,
  statusLabel,
  verified,
  presentation = false,
  onPressQr,
  onCopyId,
  copyState = 'idle',
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const name = presentOrNull(model.name) ?? t('healthId.notAvailable');
  const healthId = presentOrNull(model.healthId);
  const dobLabel = formatDate(model.dob, '') || null;
  const age = ageFrom(model.dob);
  const dobValue = dobLabel
    ? age !== null
      ? `${dobLabel} · ${t('healthId.ageSuffix', { years: age })}`
      : dobLabel
    : t('healthId.notSet');
  const sexKey = (model.sex ?? '').toLowerCase();
  const sexLabel = sexKey ? t(`healthId.sexValues.${sexKey}`, { defaultValue: titleCase(sexKey) }) : t('healthId.notSet');
  const hologram = hologramFor(model.sex, age);
  const statusKey = model.statusKey ?? '';

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
      icon={verified ? 'shield-check' : 'clock'}
      size="sm"
    />
  );

  const copyIcon = copyState === 'copied' ? 'check' : copyState === 'failed' ? 'alert-circle' : 'copy';
  const copyLabel =
    copyState === 'copied'
      ? t('healthId.secure.copied')
      : copyState === 'failed'
        ? t('healthId.secure.copyFailed')
        : t('healthId.secure.copyId');

  return (
    <View style={styles.shell}>
      <LinearGradient
        colors={[colors.navy, colors.primaryDeep, colors.blue]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* ── Security substrate ─────────────────────────────────────── */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill} {...DECORATIVE}>
          <Art source={HEALTH_ID_ART.guillocheTexture} style={FILL} resizeMode="cover" opacity={0.42} />
          <Art source={HEALTH_ID_ART.guillocheLines} style={FILL} resizeMode="cover" opacity={0.16} />
          <Art source={HEALTH_ID_ART.guillocheMesh} style={FILL} resizeMode="cover" opacity={0.55} />
          <PulseArt
            source={HEALTH_ID_ART.guillocheParticles}
            style={FILL}
            resizeMode="cover"
            low={0.35}
            high={0.95}
            duration={presentation ? 1500 : 3200}
          />
          <PulseArt
            source={HEALTH_ID_ART.dnaGlow}
            style={styles.dnaGlow}
            resizeMode="cover"
            low={0.35}
            high={0.8}
            duration={presentation ? 1700 : 3600}
          />
          <Art source={HEALTH_ID_ART.dnaHelix} style={styles.dnaHelix} resizeMode="cover" opacity={0.8} />
          <Art source={HEALTH_ID_ART.dnaMicrodata} style={styles.dnaMicro} resizeMode="cover" opacity={0.55} />
          <Art source={hologram} style={styles.hologram} resizeMode="contain" opacity={presentation ? 0.17 : 0.13} />
          <Art source={HEALTH_ID_ART.africa} style={styles.africa} resizeMode="contain" opacity={0.42} />
        </View>
        <CornerBrackets color={colors.primarySoft} active={presentation} />

        {/* ── Brand + identity status ────────────────────────────────── */}
        <View style={styles.topRow}>
          <View style={styles.brand}>
            <View style={styles.logoDisc}>
              <PulseLogo size={22} />
            </View>
            <View style={styles.brandText}>
              <Text style={styles.brandWord} numberOfLines={1}>
                Opes<Text style={styles.brandWordAccent}>Care</Text>
              </Text>
              <Text style={styles.brandSub} numberOfLines={1}>
                {t('healthId.secure.brandSub')}
              </Text>
            </View>
          </View>
          <View style={styles.statusCol}>
            <Text style={styles.statusLabel}>{t('opesCore.healthId.cardStatusLabel')}</Text>
            {badge}
          </View>
        </View>

        {/* ── Holder ─────────────────────────────────────────────────── */}
        <View style={styles.holderRow}>
          <View style={styles.avatarRing}>
            <Avatar name={name} size={38} />
          </View>
          <View style={styles.holderText}>
            <Text style={styles.holderName} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.holderSub} numberOfLines={1}>
              {t('healthId.cardLabel')}
            </Text>
          </View>
          {verified ? (
            <Art source={HEALTH_ID_ART.verificationShield} style={styles.shield} />
          ) : null}
        </View>

        {/* ── Health ID, full width so the number never wraps ─────────── */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('opesCore.healthId.fieldHealthId')}</Text>
          <View style={styles.idRow}>
            <Text style={styles.idValue} numberOfLines={1}>
              {healthId ?? t('healthId.notAvailable')}
            </Text>
            {healthId && onCopyId ? (
              <Pressable
                onPress={onCopyId}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={copyLabel}
                style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
              >
                <Icon
                  name={copyIcon}
                  size={13}
                  color={copyState === 'copied' ? colors.statusNormalBg : colors.textOnBrand}
                  strokeWidth={2}
                />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* ── Fields + ECG | QR ───────────────────────────────────────── */}
        <View style={styles.body}>
          <View style={styles.fields}>
            <Field styles={styles} label={t('healthId.dob')} value={dobValue} />
            <View style={styles.fieldRow}>
              <Field styles={styles} label={t('healthId.sex')} value={sexLabel} half />
              <Field styles={styles} label={t('healthId.bloodType')} value={model.bloodType ?? t('healthId.notSet')} half />
            </View>
            <Art source={HEALTH_ID_ART.ecgLine} style={styles.ecg} resizeMode="stretch" opacity={0.85} />
          </View>

          <View style={styles.qrCol}>
            {model.qrPayload ? (
              <QrPanel
                value={model.qrPayload}
                size={CARD_QR_SIZE}
                active={presentation}
                onPress={onPressQr}
                accessibilityLabel={t('healthId.presentFullScreen')}
                background={colors.surface}
                foreground={colors.navy}
              />
            ) : (
              <View style={styles.qrPlaceholder}>
                <Icon name="qr" size={30} color={colors.primarySoft} />
              </View>
            )}
            <Text style={styles.qrCaption} numberOfLines={2}>
              {model.qrPayload ? t('opesCore.healthId.scanToVerify') : t('offline.syncOfflineHint')}
            </Text>
          </View>
        </View>

        {/* ── Chip · security copy · seal ─────────────────────────────── */}
        <View style={styles.foot}>
          <Art source={HEALTH_ID_ART.chip} style={styles.chip} />
          <View style={styles.footCopy}>
            <Text style={styles.footLine1} numberOfLines={1}>
              {t('healthId.secure.footLine1')}
            </Text>
            <Text style={styles.footLine2} numberOfLines={2}>
              {t('healthId.secure.footLine2')}
            </Text>
          </View>
          <SealSystem size={62} active={presentation} />
        </View>

        <Text style={styles.microtext} numberOfLines={1}>
          {t('healthId.secure.microtext')}
        </Text>
      </LinearGradient>
    </View>
  );
}

function Field({
  styles,
  label,
  value,
  half = false,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
  half?: boolean;
}) {
  return (
    <View style={[styles.field, half && styles.fieldHalf]}>
      <Text style={styles.fieldLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.fieldValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const QR_EXTENT = qrPanelExtent(CARD_QR_SIZE);
const GUTTER = 22;

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    shell: {
      borderRadius: radii.lg,
      shadowColor: colors.navy,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.28,
      shadowRadius: 18,
      elevation: 8,
    },
    card: {
      borderRadius: radii.lg,
      overflow: 'hidden',
      paddingTop: 14,
      paddingBottom: 10,
      paddingRight: 14,
      paddingLeft: GUTTER + 6,
      gap: 10,
      minHeight: 300,
    },

    // substrate geometry (explicit heights: see FILL in ./Layers)
    dnaGlow: { position: 'absolute', left: -20, top: 0, height: '100%', width: 70 },
    dnaHelix: { position: 'absolute', left: -6, top: 0, height: '100%', width: 34 },
    dnaMicro: { position: 'absolute', left: 0, top: 0, height: '100%', width: 150 },
    hologram: { position: 'absolute', left: '28%', top: '16%', height: '64%', width: 120 },
    africa: { position: 'absolute', right: 8, top: 54, width: 74, height: 80 },
    ecg: { width: '100%', height: 34, marginTop: 2 },

    // brand row
    topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
    brand: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
    logoDisc: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandText: { flex: 1, minWidth: 0 },
    brandWord: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 16,
      lineHeight: 19,
      letterSpacing: 0.4,
      color: colors.textOnBrand,
    },
    brandWordAccent: { color: colors.primarySoft },
    brandSub: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 8.5,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: colors.primarySoft,
      opacity: 0.85,
    },
    statusCol: { alignItems: 'flex-end', gap: 3 },
    statusLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 8.5,
      letterSpacing: 1,
      color: colors.primarySoft,
      opacity: 0.75,
    },

    // holder
    holderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatarRing: {
      padding: 2,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.45)',
    },
    holderText: { flex: 1, minWidth: 0 },
    holderName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: 20,
      color: colors.textOnBrand,
    },
    holderSub: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 9.5,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: colors.primarySoft,
      opacity: 0.85,
    },
    shield: { width: 40, height: 40 },

    // fields | QR
    body: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    fields: { flex: 1, minWidth: 0, gap: 8 },
    field: { minWidth: 0 },
    fieldHalf: { flex: 1 },
    fieldRow: { flexDirection: 'row', gap: 8 },
    fieldLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 8.5,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: colors.primarySoft,
      opacity: 0.8,
    },
    fieldValue: {
      marginTop: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      lineHeight: 17,
      color: colors.textOnBrand,
    },
    idRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    idValue: {
      flexShrink: 1,
      minWidth: 0,
      marginTop: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: 15,
      lineHeight: 20,
      letterSpacing: 1,
      color: colors.textOnBrand,
    },
    copyButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.28)',
    },
    pressed: { opacity: 0.7 },
    qrCol: { width: QR_EXTENT, alignItems: 'center', gap: 2 },
    qrPlaceholder: {
      width: QR_EXTENT - 16,
      height: QR_EXTENT - 16,
      margin: 8,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
      backgroundColor: 'rgba(255,255,255,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    qrCaption: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 10,
      lineHeight: 13,
      textAlign: 'center',
      color: colors.textOnBrand,
    },

    // foot
    foot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 6 },
    chip: { width: 44, height: 36 },
    footCopy: { flex: 1, minWidth: 0 },
    footLine1: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 9,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      color: colors.primarySoft,
    },
    footLine2: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 8.5,
      lineHeight: 12,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textOnBrand,
      opacity: 0.75,
    },
    microtext: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 6.5,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      textAlign: 'center',
      color: colors.textOnBrand,
      opacity: 0.42,
    },
  });
