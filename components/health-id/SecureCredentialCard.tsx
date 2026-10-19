/**
 * The OPESCARE Secure™ Health ID credential — the layered card from the
 * design library, on this app's palette.
 *
 * Its shape is the mockup's: a dark, layered FRAME (navy → deep brand blue →
 * brand blue) around a white FACE that carries the holder's details. The
 * frame holds the security language — guilloche texture, lines, mesh and
 * breathing particles, DNA glow + helix + micro-data down the left edge,
 * corner markers, the brand row, the Africa motif and tagline, the chip, the
 * security copy, the seal system and the microtext band. The face holds the
 * person — avatar, name, identity status, Health ID with copy, date of birth,
 * sex, blood type, and the framed QR — over a faint anatomical hologram
 * (matched to the holder's sex and age, else the neutral watermark), fine
 * guilloche lines and the ECG trace.
 *
 * `presentation` turns the quiet card into the live credential the design
 * calls Presentation Mode: faster sweep, brighter particles, pulsing corners,
 * glowing QR, the seal's light sweep.
 *
 * The credential data is untouched: what the QR encodes is whatever the
 * backend handed us in `qrPayload`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, Platform, type StyleProp, type TextStyle } from 'react-native';
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
import { HEALTH_ID_ART } from './assets';
import { LiveEcg, LivingAnatomy } from './LivingAnatomy';
import { FlowingDna } from './FlowingDna';
import { Art, CornerBrackets, DECORATIVE, FILL, PulseArt, QrPanel, SealSystem, qrPanelExtent } from './Layers';
import { ageFrom, presentOrNull, titleCase, type CredentialModel } from './model';

/** Edge of the permanent QR inside the card. */
export const CARD_QR_SIZE = 86;

/** Below this card width the face restacks: QR under the fields, name may wrap, smaller ID type. */
// Card width below which the QR moves under the fields. At a 360dp window the card is ~328dp wide and keeps the side-by-side layout; at 320dp (~288dp card) it stacks.
const NARROW_CARD = 310;

export type CopyState = 'idle' | 'copied' | 'failed';

type Props = {
  model: CredentialModel;
  statusTone: StatusTone;
  statusLabel: string;
  /** Identity status is `verified` / `verified_by_facility`: the shield mark is shown. */
  verified: boolean;
  presentation?: boolean;
  onPressQr?: () => void;
  /** Caption under an EMPTY QR slot when the reason is not being offline (e.g. a read-only guardian view). */
  qrPlaceholder?: string;
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
  qrPlaceholder,
  onCopyId,
  copyState = 'idle',
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [cardWidth, setCardWidth] = useState(0);
  const narrow = cardWidth > 0 && cardWidth < NARROW_CARD;
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== cardWidth) setCardWidth(w);
  };

  const name = presentOrNull(model.name) ?? t('healthId.notAvailable');
  const healthId = presentOrNull(model.healthId);
  const dobLabel = formatDate(model.dob, '') || null;
  const age = ageFrom(model.dob);
  // Non-breaking spaces keep "15 juin 1990" and "36 ans" whole; the only
  // permitted break is between the date and the age.
  const nb = (v: string) => v.replace(/ /g, ' ');
  const dobValue = dobLabel ? nb(dobLabel) : t('healthId.notSet');
  const ageValue = dobLabel && age !== null ? nb(t('healthId.ageSuffix', { years: age })) : null;
  const sexKey = (model.sex ?? '').toLowerCase();
  const sexLabel = sexKey ? t(`healthId.sexValues.${sexKey}`, { defaultValue: titleCase(sexKey) }) : t('healthId.notSet');
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
  const copyColor = copyState === 'copied' ? colors.statusNormal : copyState === 'failed' ? colors.statusCritical : colors.blue;

  return (
    <View style={styles.shell} onLayout={onLayout}>
      <LinearGradient
        colors={[colors.navy, colors.primaryDeep, colors.blue]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.frame}
      >
        {/* ── Frame: security substrate ─────────────────────────────────── */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill} {...DECORATIVE}>
          <Art source={HEALTH_ID_ART.guillocheTexture} style={FILL} resizeMode="cover" opacity={0.45} />
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
            low={0.4}
            high={0.85}
            duration={presentation ? 1700 : 3600}
          />
          <FlowingDna style={styles.dnaHelix} opacity={0.9} />
          <Art source={HEALTH_ID_ART.dnaMicrodata} style={styles.dnaMicro} resizeMode="cover" opacity={0.55} />
        </View>
        <CornerBrackets color={colors.primarySoft} active={presentation} size={20} inset={8} radius={10} />

        {/* ── Frame: brand row + Africa tagline ─────────────────────────── */}
        <View style={styles.topRow}>
          <View style={styles.brand}>
            <View style={styles.logoDisc}>
              <PulseLogo size={22} />
            </View>
            <View style={styles.brandText}>
              <FitText style={styles.brandWord}>
                Opes<Text style={styles.brandWordAccent}>Care</Text>
              </FitText>
              <FitText style={styles.brandSub}>
                {t('healthId.secure.brandSub')}
              </FitText>
            </View>
          </View>
          <View style={[styles.tagline, narrow && styles.taglineNarrow]}>
            {/* Two phrases, two lines — never one squeezed line ending in "…". */}
            <View style={styles.taglineStack}>
              {splitAtDots(String(t('healthId.secure.frameTagline'))).map((part) => (
                <FitText key={part} style={styles.taglineText}>
                  {part}
                </FitText>
              ))}
            </View>
            {/* On narrow cards the motif yields its width to the words. */}
            {narrow ? null : <Art source={HEALTH_ID_ART.africa} style={styles.africa} />}
          </View>
        </View>

        {/* ── Face: the holder ──────────────────────────────────────────── */}
        <View style={styles.face}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill} {...DECORATIVE}>
            <Art source={HEALTH_ID_ART.guillocheLines} style={FILL} resizeMode="cover" opacity={0.07} />
            {/* Anatomical WATERMARK: a security/health motif behind the holder's
                details, never a portrait. 3–7% on the quiet card, 6–12% when the
                card is presented — it must not compete with patient data. */}
            <LivingAnatomy profile={model.anatomicalProfile} style={styles.hologram} opacity={presentation ? 0.4 : 0.34} />
          </View>

          <View style={styles.holderRow}>
            <Avatar name={name} size={40} uri={model.photoUrl} />
            <View style={styles.holderText}>
              {narrow ? (
                <Text style={styles.holderName} numberOfLines={2}>
                  {name}
                </Text>
              ) : (
                <FitText style={styles.holderName}>{name}</FitText>
              )}
              <FitText style={styles.holderSub}>
                {t('healthId.cardLabel')}
              </FitText>
              {narrow ? <View style={styles.badgeBelow}>{badge}</View> : null}
            </View>
            {narrow ? null : badge}
          </View>

          {/* Health ID spans the face so the number never wraps. */}
          <View style={styles.field}>
            <FitText style={styles.fieldLabel}>{t('opesCore.healthId.fieldHealthId')}</FitText>
            <View style={styles.idRow}>
              <Text style={[styles.idValue, narrow && styles.idValueNarrow]} numberOfLines={1}>
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
                  <Icon name={copyIcon} size={14} color={copyColor} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={[styles.body, narrow && styles.bodyNarrow]}>
            <View style={[styles.fields, narrow && styles.fieldsNarrow]}>
              <Field styles={styles} label={t('healthId.dob')} value={dobValue} extra={ageValue} />
              <View style={[styles.fieldRow, narrow && styles.fieldRowNarrow]}>
                <Field styles={styles} label={t('healthId.sex')} value={sexLabel} half />
                <Field styles={styles} label={t('healthId.bloodType')} value={model.bloodType ?? t('healthId.notSet')} half />
              </View>
              <LiveEcg source={HEALTH_ID_ART.ecgLine} style={styles.ecg} opacity={0.9} />
            </View>

            <View style={[styles.qrCol, narrow && styles.qrColNarrow]}>
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
                  <Icon name="qr" size={30} color={colors.textMuted} />
                </View>
              )}
              <Text style={styles.qrCaption} numberOfLines={2}>
                {model.qrPayload ? t('opesCore.healthId.scanToVerify') : (qrPlaceholder ?? t('offline.syncOfflineHint'))}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Frame: chip · security copy · (seal overlaps the face corner) ─ */}
        <View style={[styles.foot, narrow && styles.footNarrow]}>
          <Art source={HEALTH_ID_ART.chip} style={styles.chip} />
          <View style={styles.footCopy}>
            <Text style={styles.footLine1} numberOfLines={2}>
              {t('healthId.secure.footLine1')}
            </Text>
            <Text style={styles.footLine2} numberOfLines={2}>
              {glueDots(String(t('healthId.secure.footLine2')))}
            </Text>
          </View>
        </View>
        <View pointerEvents="none" style={styles.sealWrap}>
          <SealSystem size={66} active={presentation} />
          {verified ? <Art source={HEALTH_ID_ART.verificationShield} style={styles.shield} /> : null}
        </View>

        <Text style={styles.microtext} numberOfLines={1}>
          {t('healthId.secure.microtext')}
        </Text>

        {/* Vertical edge text, the mockup's "CARE · CONNECT · PROTECT" rail. */}
        <View pointerEvents="none" style={styles.edge} {...DECORATIVE}>
          <Text style={styles.edgeText} numberOfLines={1}>
            {t('healthId.secure.edgeText')}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function Field({
  styles,
  label,
  value,
  half = false,
  extra = null,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
  half?: boolean;
  extra?: string | null;
}) {
  return (
    <View style={[styles.field, half && styles.fieldHalf]}>
      <FitText style={styles.fieldLabel}>
        {label}
      </FitText>
      {extra ? (
        <View style={styles.valueWrap}>
          <FitText style={[styles.fieldValue, styles.valuePart]}>
            {`${value} ·`}
          </FitText>
          <FitText style={[styles.fieldValue, styles.valuePart]}>
            {extra}
          </FitText>
        </View>
      ) : (
        <FitText style={styles.fieldValue}>
          {value}
        </FitText>
      )}
    </View>
  );
}

/** One line that shrinks (native) instead of breaking a word. */
const MIN_FONT_SCALE = 0.8;
type HTMLElementLike = { clientWidth: number };
type RangeLike = { selectNodeContents: (n: unknown) => void; getBoundingClientRect: () => { width: number } };

/**
 * One line of text that shrinks (down to 80%) rather than wrapping or breaking
 * a word. Native uses adjustsFontSizeToFit; react-native-web ignores that prop,
 * so on web the rendered node is measured and the font scaled to fit.
 */
function FitText({ style, children }: { style: StyleProp<TextStyle>; children: React.ReactNode }) {
  const ref = useRef<unknown>(null);
  const [scale, setScale] = useState(1);
  const [tight, setTight] = useState(false);
  const flat = StyleSheet.flatten(style) ?? {};
  const base = flat.fontSize ?? 14;
  const measure = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current as (HTMLElementLike & { clientWidth: number }) | null;
    const doc = (globalThis as { document?: { createRange?: () => RangeLike } }).document;
    if (!node?.clientWidth || !doc?.createRange) return;
    const range = doc.createRange();
    range.selectNodeContents(node);
    const natural = range.getBoundingClientRect().width;
    if (natural <= node.clientWidth + 0.5) return;
    // First give up tracking (letter-spacing), then shrink the type, never below 80%.
    if (!tight && flat.letterSpacing) {
      setTight(true);
      return;
    }
    setScale((s) => Math.max(MIN_FONT_SCALE, (s * node.clientWidth) / natural - 0.005));
  }, [tight, flat.letterSpacing]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const fonts = (globalThis as { document?: { fonts?: { ready?: Promise<unknown> } } }).document?.fonts;
    let live = true;
    fonts?.ready?.then(() => {
      if (live) measure();
    });
    const timer = setTimeout(measure, 1500);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [measure, children, scale]);
  const scaled: TextStyle | null =
    scale < 1 || tight
      ? {
          fontSize: base * scale,
          ...(flat.lineHeight ? { lineHeight: flat.lineHeight * scale } : null),
          ...(tight ? { letterSpacing: 0 } : null),
        }
      : null;
  return (
    <Text
      ref={ref as never}
      style={[style, scaled]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={MIN_FONT_SCALE}
      onLayout={measure}
    >
      {children}
    </Text>
  );
}

const QR_EXTENT = qrPanelExtent(CARD_QR_SIZE);
/** The DNA rail on the left of the frame. */
const GUTTER = 26;
/** The vertical-text rail on the right of the frame. */
const EDGE = 22;

/** "A · B" → ["A", "B"]; a phrase list rendered one phrase per line. */
function splitAtDots(text: string): string[] {
  return text.split('·').map((part) => part.trim()).filter(Boolean);
}

/** Keep each "·" on the line of the word before it, so no line starts with a dot. */
function glueDots(text: string): string {
  return text.replace(/\s+·/g, '\u00A0·');
}

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
    frame: {
      borderRadius: radii.lg,
      overflow: 'hidden',
      paddingTop: 12,
      paddingBottom: 8,
      paddingLeft: GUTTER,
      paddingRight: EDGE,
      gap: 10,
    },

    // frame substrate geometry (explicit heights: see FILL in ./Layers)
    dnaGlow: { position: 'absolute', left: -22, top: 0, height: '100%', width: 72 },
    dnaHelix: { position: 'absolute', left: -7, top: 0, height: '100%', width: 36 },
    dnaMicro: { position: 'absolute', left: 0, top: 0, height: '100%', width: 150 },

    // brand row
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
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
      letterSpacing: 0.9,
      textTransform: 'uppercase',
      color: colors.primarySoft,
      opacity: 0.85,
    },
    tagline: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '48%' },
    taglineNarrow: { maxWidth: '58%' },
    taglineStack: { flexShrink: 1, minWidth: 0, alignItems: 'flex-end' },
    taglineText: {
      flexShrink: 1,
      minWidth: 0,
      textAlign: 'right',
      fontFamily: typography.fontFamily.medium,
      fontSize: 7.5,
      lineHeight: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.primarySoft,
      opacity: 0.9,
    },
    africa: { width: 34, height: 36 },

    // the white face
    face: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 12,
      gap: 10,
      overflow: 'hidden',
    },
    hologram: { position: 'absolute', left: '30%', top: '6%', height: '90%', width: 130 },
    ecg: { width: '100%', height: 30, marginTop: 2 },
    holderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    holderText: { flex: 1, minWidth: 0 },
    holderName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: 20,
      color: colors.textPrimary,
    },
    badgeBelow: { alignSelf: 'flex-start', marginTop: 4 },
    holderSub: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 9.5,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    body: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    bodyNarrow: { flexDirection: 'column', alignItems: 'stretch' },
    fieldsNarrow: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: '100%' },
    fieldRowNarrow: { gap: 8 },
    qrColNarrow: { alignSelf: 'center' },
    footNarrow: { paddingRight: 72 },
    fields: { flex: 1, minWidth: 0, gap: 8 },
    field: { minWidth: 0, flexShrink: 1 },
    fieldHalf: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 },
    fieldRow: { flexDirection: 'row', gap: 4 },
    valueWrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 4 },
    valuePart: { flexShrink: 0, maxWidth: '100%' },
    fieldLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 8.5,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    fieldValue: {
      marginTop: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 12.5,
      lineHeight: 16,
      color: colors.textPrimary,
    },
    idRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    idValue: {
      flexShrink: 1,
      minWidth: 0,
      marginTop: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: 15,
      lineHeight: 20,
      letterSpacing: 0.8,
      color: colors.textPrimary,
    },
    // Narrow cards: a monospace face keeps every character the same width so the
    // whole ID fits at a slightly smaller size instead of truncating.
    idValueNarrow: {
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, Consolas, monospace' }),
      fontSize: 13,
      lineHeight: 18,
      letterSpacing: 0.2,
    },
    copyButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.6 },
    qrCol: { width: QR_EXTENT, alignItems: 'center', gap: 0 },
    qrPlaceholder: {
      width: QR_EXTENT - 16,
      height: QR_EXTENT - 16,
      margin: 8,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qrCaption: {
      marginTop: -2,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 10,
      lineHeight: 13,
      textAlign: 'center',
      color: colors.textPrimary,
    },

    // frame foot
    foot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 84, minHeight: 44 },
    chip: { width: 42, height: 34 },
    footCopy: { flex: 1, minWidth: 0 },
    footLine1: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 8.5,
      lineHeight: 11,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.primarySoft,
    },
    footLine2: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 8,
      lineHeight: 11,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textOnBrand,
      opacity: 0.8,
    },
    sealWrap: { position: 'absolute', right: EDGE + 6, bottom: 22, alignItems: 'center' },
    shield: { position: 'absolute', width: 26, height: 26, right: -10, top: -6 },
    microtext: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 6.5,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      textAlign: 'center',
      color: colors.textOnBrand,
      opacity: 0.42,
    },
    // A 220-wide box turned 90° occupies 220 tall by ~12 wide, centred on its
    // own centre — so it is offset by half its width minus half the rail.
    edge: {
      position: 'absolute',
      right: -(110 - EDGE / 2),
      top: '50%',
      width: 220,
      marginTop: -8,
      alignItems: 'center',
      transform: [{ rotate: '90deg' }],
    },
    edgeText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 7,
      letterSpacing: 2.2,
      textTransform: 'uppercase',
      color: colors.primarySoft,
      opacity: 0.8,
    },
  });
