/**
 * Shared chrome for the CORE slice (CORE-006 Home Dashboard, CORE-007 Health ID).
 *
 * Composition over `src/components` + `src/theme/theme` only — no new colours,
 * no inline SVG paths.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon, IconName } from '../../components';
import { PulseLogo } from '../../components/PulseLogo';
import { useTranslation } from '../../i18n';
import { colors, iconStroke, radii, spacing, typography } from '../../theme/theme';

// ── Brand header ──────────────────────────────────────────────────────────

export type BrandHeaderProps = {
  /** Show the back chevron (CORE-007). */
  onBack?: () => void;
  /** Bell action + its red count bubble. */
  onBell?: () => void;
  bellBadge?: number;
  /** Right-most slot: the avatar on CORE-006, the kebab on CORE-007. */
  right?: React.ReactNode;
};

/**
 * The logo lock-up header both CORE screens open with:
 * `‹  ⟨mark⟩ OPES EMR / ELECTRONIC MEDICAL RECORD      🔔³  ⟨right⟩`
 *
 * `ScreenHeader` covers title-led screens; this one is logo-led, so it is a
 * local composition rather than a fork of that component.
 */
export function BrandHeader({ onBack, onBell, bellBadge = 0, right }: BrandHeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel={t('components.goBack')} hitSlop={HIT}>
          <Icon name="chevron-left" size={24} color={colors.textPrimary} strokeWidth={2.2} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.lockup}>
        <PulseLogo size={44} />
        <View>
          <Text style={styles.wordmark}>
            <Text style={styles.wordmarkOpes}>OPES </Text>
            <Text style={styles.wordmarkEmr}>EMR</Text>
          </Text>
          <View style={styles.taglineRow}>
            <View style={styles.taglineLine} />
            <Text style={styles.tagline}>ELECTRONIC MEDICAL RECORD</Text>
            <View style={styles.taglineLine} />
          </View>
        </View>
      </View>

      <View style={styles.headerActions}>
        {onBell ? (
          <TouchableOpacity onPress={onBell} accessibilityRole="button" accessibilityLabel={t('common.notifications')} hitSlop={HIT}>
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

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

// ── Avatar ────────────────────────────────────────────────────────────────

/** Circular initials avatar — the reference shows a photo we do not ship. */
export function Avatar({ name, size = 44, onPress }: { name: string; size?: number; onPress?: () => void }) {
  const { t } = useTranslation();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  const body = (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials || '—'}</Text>
    </View>
  );

  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={t('components.openProfile')}>
      {body}
    </TouchableOpacity>
  );
}

// ── Quick-action tile ─────────────────────────────────────────────────────

export type ActionTileProps = {
  icon: IconName;
  /** Rendered on two lines, exactly as the references break them. */
  label: string;
  /** CORE-007's tiles carry a small grey sub-label. */
  caption?: string;
  onPress: () => void;
};

/** The bordered icon-over-label tile in the CORE-006 / CORE-007 action rails. */
export function ActionTile({ icon, label, caption, onPress }: ActionTileProps) {
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

/** A labelled field in the CORE-007 ID card. */
export function CardField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  wordmark: { fontFamily: typography.fontFamily.bold },
  wordmarkOpes: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: colors.navy,
  },
  wordmarkEmr: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: colors.blue,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  taglineLine: { flex: 1, height: 1, backgroundColor: colors.border },
  tagline: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 7,
    letterSpacing: 0.9,
    color: colors.textSecondary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
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
