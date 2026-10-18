import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';
import {
  Card,
  Icon,
  PulseLogo,
  radii,
  spacing,
  useTheme,
  type IconName,
  type StatusTone,
} from '@/components/opes-ui';
import { CoverPhoto } from './CoverPhoto';
import { useProfileStyles } from './styles';

/** One glyph-and-text line in the identity card. */
export function IdentityLine({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useTheme();
  const styles = useProfileStyles();
  if (!text) return null;
  return (
    <View style={styles.identityLine}>
      <Icon name={icon} size={14} color={colors.blue} />
      <Text style={styles.identityLineText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

/**
 * The identity card of the My Profile reference: portrait | who this is |
 * a credential panel. The panel slot is the Health ID QR on a patient's or
 * dependent's profile; for a clinician it is their real licence or credential
 * status. The card measures itself and sizes its columns from that.
 */
export function IdentityCard({
  photoUrl,
  initials,
  onChangePhoto,
  changePhotoLabel,
  name,
  verified,
  statusLabel,
  statusTone,
  statusIcon = 'shield-check',
  children,
  quote,
  panel,
}: {
  photoUrl?: string | null;
  initials: string;
  /** Draws the camera button on the portrait corner when given. */
  onChangePhoto?: () => void;
  changePhotoLabel?: string;
  name: string;
  verified: boolean;
  statusLabel: string;
  statusTone: StatusTone;
  statusIcon?: IconName;
  /** The detail lines under the status pill (IdentityLine rows). */
  children?: React.ReactNode;
  /** The brand line that closes the details column; omit to draw none. */
  quote?: string | null;
  panel: {
    label: string;
    onPress?: () => void;
    content: React.ReactNode;
  };
}) {
  const { t } = useTranslation();
  const { colors, statusMap } = useTheme();
  const styles = useProfileStyles();
  // The identity card's own width, measured. Everything in that row is sized
  // from it rather than from a number that only holds at 375pt.
  const [cardWidth, setCardWidth] = useState(0);
  // A signed photo link that has expired renders nothing; this flips the card
  // back to initials instead of leaving a grey hole. Keyed on the URI, so a
  // refreshed signed link gets a fresh attempt.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showPhoto = !!photoUrl && failedUri !== photoUrl;
  const statusSkin = statusMap[statusTone];

  /**
   * Portrait and panel columns as a share of the measured card, clamped.
   * Below ~56pt a face is a thumbnail and the initials stop being readable;
   * above ~96pt the portrait starts crowding the details column on a tablet.
   * `cardWidth || 311` keeps the first paint (before onLayout fires) at the
   * 375pt figure rather than collapsing to zero.
   */
  const columns = useMemo(() => {
    const inner = (cardWidth || 311) - spacing.md * 2;
    const clamp = (min: number, value: number, max: number) =>
      Math.round(Math.max(min, Math.min(max, value)));
    const portrait = clamp(56, inner * 0.21, 96);
    return {
      // Below ~300pt of card there is not enough width for three columns:
      // the panel drops below the details instead.
      stacked: inner < 300,
      portrait,
      // 4:3 portrait crop, which is what a face wants.
      portraitHeight: Math.round(portrait * 1.32),
      panel: clamp(84, inner * 0.3, 124),
    };
  }, [cardWidth]);

  const panelStyle = [
    styles.idPanel,
    columns.stacked ? styles.idPanelStacked : { width: columns.panel },
  ];

  return (
    <Card style={styles.identity} onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
      <View style={styles.identityMain}>
        {/* left: portrait · middle: who this is · right: the credential */}
        <View>
          <View
            style={[styles.portrait, { width: columns.portrait, height: columns.portraitHeight }]}
          >
            {showPhoto ? (
              <CoverPhoto
                uri={photoUrl as string}
                width={columns.portrait}
                height={columns.portraitHeight}
                radius={radii.md}
                onFail={() => setFailedUri(photoUrl ?? null)}
              />
            ) : (
              <View style={[styles.portraitImg, styles.portraitFallback]}>
                <Text
                  style={[
                    styles.portraitInitials,
                    { fontSize: Math.round(columns.portrait * 0.36) },
                  ]}
                >
                  {initials}
                </Text>
              </View>
            )}
          </View>
          {onChangePhoto ? (
            <TouchableOpacity
              onPress={onChangePhoto}
              accessibilityRole="button"
              accessibilityLabel={
                changePhotoLabel ?? t('profile.changePhoto', { defaultValue: 'Change photo' })
              }
              // The button is 28pt by design (it overlaps the portrait
              // corner); 10pt of slop is what makes it a 48pt target.
              hitSlop={10}
              style={styles.portraitCamera}
            >
              <Icon name="camera" size={14} color={colors.textOnBrand} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.identityBody}>
          <View style={styles.identityNameRow}>
            <Text style={styles.identityName} numberOfLines={2}>
              {name || '—'}
            </Text>
            {verified ? <Icon name="check-circle" size={17} color={colors.link} /> : null}
          </View>

          <View style={[styles.verifiedPill, { backgroundColor: statusSkin.bg }]}>
            <Icon name={statusIcon} size={13} color={statusSkin.fg} />
            <Text style={[styles.verifiedText, { color: statusSkin.fg }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>

          {children}

          {quote ? (
            <Text style={styles.identityQuote} numberOfLines={2}>
              {quote}
            </Text>
          ) : null}
        </View>

        {columns.stacked ? null : <View style={styles.identityRule} />}

        {panel.onPress ? (
          <TouchableOpacity
            onPress={panel.onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={panel.label}
            style={panelStyle}
          >
            {panel.content}
          </TouchableOpacity>
        ) : (
          <View style={panelStyle} accessible accessibilityLabel={panel.label}>
            {panel.content}
          </View>
        )}
      </View>
    </Card>
  );
}

/** Panel head: the pulse mark and an uppercase brand title. */
function PanelHead({ title }: { title: string }) {
  const styles = useProfileStyles();
  return (
    <View style={styles.idPanelHead}>
      <PulseLogo size={18} />
      <Text style={styles.idPanelTitle} numberOfLines={2}>
        {title}
      </Text>
    </View>
  );
}

/** The trailing "Tap to view" link line of a panel. */
function PanelAction({ label }: { label: string }) {
  const { colors } = useTheme();
  const styles = useProfileStyles();
  return (
    <View style={styles.idPanelAction}>
      <Text style={styles.idPanelActionText}>{label}</Text>
      <Icon name="chevron-right" size={12} color={colors.link} />
    </View>
  );
}

/**
 * Health ID panel content: the permanent QR when its payload has arrived, a
 * non-scannable placeholder glyph otherwise, and the Health ID under it.
 */
export function HealthIdPanelContent({
  qrPayload,
  healthId,
  failed,
  actionLabel,
  title,
}: {
  qrPayload: string | null;
  healthId: string | null | undefined;
  failed?: boolean;
  /** Omit to draw no action line (a panel that cannot be opened). */
  actionLabel?: string | null;
  title?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useProfileStyles();
  return (
    <>
      <PanelHead
        title={title ?? t('profile.healthIdBrand', { defaultValue: 'OPESCARE HEALTH ID' })}
      />
      <View style={styles.idPanelQr}>
        {qrPayload ? (
          <QRCode
            value={qrPayload}
            size={62}
            color={colors.textPrimary}
            backgroundColor={colors.surface}
          />
        ) : (
          /* Not yet, or not at all: a placeholder that must never be
             mistaken for something scannable. */
          <Icon name="qr" size={40} color={failed ? colors.textMuted : colors.border} />
        )}
      </View>
      <Text style={styles.idPanelCode} numberOfLines={2}>
        {healthId ?? '—'}
      </Text>
      {actionLabel ? <PanelAction label={actionLabel} /> : null}
    </>
  );
}

/**
 * Credential panel content for people who carry no Health ID QR on this
 * screen (clinicians): their real licence / credential state in the same
 * slot. Nothing is asserted that the data does not say.
 */
export function CredentialPanelContent({
  title,
  icon,
  tone,
  status,
  detail,
  actionLabel,
}: {
  title: string;
  icon: IconName;
  tone: StatusTone;
  status: string;
  detail?: string | null;
  actionLabel?: string | null;
}) {
  const { statusMap } = useTheme();
  const styles = useProfileStyles();
  const skin = statusMap[tone];
  return (
    <>
      <PanelHead title={title} />
      <View style={[styles.idPanelQr, { backgroundColor: skin.bg, borderColor: skin.bg }]}>
        <Icon name={icon} size={34} color={skin.fg} />
      </View>
      <Text style={[styles.idPanelCode, { color: skin.fg }]} numberOfLines={2}>
        {status}
      </Text>
      {detail ? (
        <Text style={[styles.identityLineText, { textAlign: 'center' }]} numberOfLines={2}>
          {detail}
        </Text>
      ) : null}
      {actionLabel ? <PanelAction label={actionLabel} /> : null}
    </>
  );
}
