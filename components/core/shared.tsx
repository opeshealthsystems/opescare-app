/**
 * Shared chrome for the CORE slice (Home dashboard, Health ID).
 *
 * Ported from `UIUX/src/screens/core/shared.tsx`. Composition over
 * `@/components/opes-ui` only — no new colours, no inline SVG paths, no API
 * calls, no navigation. Colours are read at render through `useTheme()`, so
 * the header, avatar and tiles follow the runtime palette switch exactly like
 * every kit component (a `StyleSheet.create` at module load would freeze the
 * palette that happened to be active on first import).
 *
 * The brand lock-up is OpesCare's — the kit's "OPES EMR / ELECTRONIC MEDICAL
 * RECORD" wordmark is replaced by "OpesCare" over the app's own tagline
 * (`auth.tagline`); the layout, mark and rhythm are the kit's.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Icon,
  PulseLogo,
  iconStroke,
  initialsFrom,
  radii,
  spacing,
  typography,
  useTheme,
  Wordmark,
  type IconName,
  type Palette,
} from '@/components/opes-ui';

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

// ── Brand header ──────────────────────────────────────────────────────────

export type BrandHeaderProps = {
  /** Show the back chevron (Health ID). */
  onBack?: () => void;
  /** Bell action + its red count bubble. */
  onBell?: () => void;
  bellBadge?: number;
  /** Right-most slot: the avatar on Home, the kebab on Health ID. */
  right?: React.ReactNode;
};

/**
 * The logo lock-up header both CORE screens open with:
 * `<  (mark) OpesCare / ONE HEALTH ID. CONNECTED CARE.      bell(3)  (right)`
 *
 * `ScreenHeader` covers title-led screens; this one is logo-led, so it is a
 * local composition rather than a fork of that component.
 */
export function BrandHeader({ onBack, onBell, bellBadge = 0, right }: BrandHeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bellLabel = t('opesCore.common.notifications');

  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('opesCore.components.goBack')}
          hitSlop={HIT}
        >
          <Icon name="chevron-left" size={24} color={colors.textPrimary} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : null}

      {/* One brand bar for the whole app: the mark BESIDE the wordmark, the
          tagline under the word — the same `PulseLogo 34 + Wordmark md`
          lockup the finder top bars use, not a local re-cut of it. */}
      <View style={styles.lockup}>
        <PulseLogo size={34} />
        <Wordmark size="md" showTagline />
      </View>

      <View style={styles.headerActions}>
        {onBell ? (
          <TouchableOpacity
            onPress={onBell}
            accessibilityRole="button"
            // The badge is a red bubble with a number in it — silent otherwise,
            // and it is the reason to press the bell.
            accessibilityLabel={bellBadge > 0 ? `${bellLabel} (${bellBadge})` : bellLabel}
            hitSlop={HIT}
            style={styles.bell}
          >
            <Icon name="bell" size={22} color={colors.textPrimary} />
            {bellBadge > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{bellBadge > 99 ? '99+' : bellBadge}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}
        {right}
      </View>
    </View>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────

/**
 * Circular avatar: the person's own photo when they have set one (`uri`, the
 * short-lived signed link from /mobile/me), otherwise their initials. Never a
 * stock face — that would be a fabrication on a health credential. A link that
 * fails to load (expired signature, offline) falls back to the initials rather
 * than a broken image.
 */
export function Avatar({
  name,
  size = 44,
  onPress,
  uri,
}: {
  name: string;
  size?: number;
  onPress?: () => void;
  uri?: string | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Honorifics are not initials: this used to take the first two whitespace
  // tokens, so "Dr. Amara Diallo" rendered "DA" instead of "AD".
  const initials = initialsFrom(name, '');
  const [failedUri, setFailedUri] = useState<string | null>(null);
  useEffect(() => setFailedUri(null), [uri]);
  const showPhoto = !!uri && failedUri !== uri;

  const body = (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {showPhoto ? (
        <Image
          source={{ uri: uri as string }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          onError={() => setFailedUri(uri as string)}
          alt=""
        />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials || '—'}</Text>
      )}
    </View>
  );

  if (!onPress) return body;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={t('opesCore.components.openProfile')}
    >
      {body}
    </TouchableOpacity>
  );
}

// ── Quick-action tile ─────────────────────────────────────────────────────

export type ActionTileProps = {
  icon: IconName;
  /** Rendered on up to two lines. */
  label: string;
  /** Health ID's tiles carry a small grey sub-label. */
  caption?: string;
  onPress: () => void;
};

/** The bordered icon-over-label tile in the Home / Health ID action rails. */
export function ActionTile({ icon, label, caption, onPress }: ActionTileProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.tile}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon name={icon} size={26} color={colors.blue} strokeWidth={iconStroke.regular} />
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
      {caption ? (
        <Text style={styles.tileCaption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ── ID-card field ─────────────────────────────────────────────────────────

/** A labelled field in the Health ID card. */
export function CardField({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      backgroundColor: colors.background,
    },
    lockup: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    bell: { position: 'relative' },
    bellBadge: {
      position: 'absolute',
      top: -6,
      right: -8,
      minWidth: 17,
      height: 17,
      borderRadius: radii.pill,
      paddingHorizontal: 4,
      backgroundColor: colors.badge,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bellBadgeText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 10,
      lineHeight: 13,
      color: colors.textOnBrand,
    },
    avatar: {
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatarText: {
      fontFamily: typography.fontFamily.semiBold,
      color: colors.blue,
    },
    tile: {
      flex: 1,
      minHeight: 92,
      paddingVertical: 14,
      paddingHorizontal: 6,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    tileLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 12,
      lineHeight: 16,
      textAlign: 'center',
      color: colors.textPrimary,
    },
    tileCaption: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 13,
      textAlign: 'center',
      color: colors.textMuted,
    },
    field: { gap: 1 },
    fieldLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 9,
      letterSpacing: 0.6,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    fieldValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
  });
