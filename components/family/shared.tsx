/**
 * Pieces the two Family screens share — the list (app/family/index.tsx) and
 * the member detail (app/family/[id].tsx). Presentation only: every string is
 * a `family.*` key, every colour a palette token, every icon a kit `<Icon>`.
 */
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  StatusBadge,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import type { TFunction } from 'i18next';
import type { FamilyAccessLevel, FamilyRelationship } from '@/lib/api/types';
import {
  accessLevelKey,
  isDependentForbidden,
  isFamilyLinkGone,
  isFamilyNotServed,
} from '@/lib/api/familyQueries';

/** The guardian's role toward the dependent, in their language; the raw token
 * only when the server invents a value the app has no word for. */
export function relationshipLabelOf(t: TFunction, relationship: FamilyRelationship | null | undefined): string {
  const key = (relationship ?? '').trim();
  if (!key) return t('family.relationships.other');
  return t(`family.relationships.${key}`, { defaultValue: key.replace(/_/g, ' ') });
}

export function accessLabelOf(t: TFunction, level: FamilyAccessLevel | null | undefined): string {
  return t(`family.accessLevels.${accessLevelKey(level)}`);
}

/** Access level → badge tone. `full` is the strongest grant, so it reads as the
 * "active" tone; read-only stays neutral. */
export function accessToneOf(level: FamilyAccessLevel | null | undefined): StatusTone {
  return accessLevelKey(level) === 'full' ? 'normal' : 'neutral';
}

export function AccessBadge({ level }: { level: FamilyAccessLevel | null | undefined }) {
  const { t } = useTranslation();
  const key = accessLevelKey(level);
  return (
    <StatusBadge
      status={key}
      tone={accessToneOf(level)}
      label={accessLabelOf(t, level)}
      icon={key === 'full' ? 'lock-open' : 'eye'}
      size="sm"
    />
  );
}

/** Tinted inline notice, optionally with one action. */
export function Notice({
  tone,
  icon,
  text,
  actionLabel,
  onAction,
  spaced,
}: {
  tone: StatusTone;
  icon: IconName;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Adds the bottom gap needed when the notice sits inside a form card. */
  spaced?: boolean;
}) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = statusMap[tone];
  return (
    <View
      style={[styles.notice, spaced && styles.noticeSpaced, { backgroundColor: skin.bg }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon name={icon} size={16} color={skin.fg} />
      <Text style={[styles.noticeText, { color: skin.fg }]}>{text}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={styles.noticeAction}
        >
          <Text style={[styles.noticeActionText, { color: skin.fg }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Placeholder while a family query resolves. */
export function LoadingCard({ label }: { label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card>
      <View style={styles.loading} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.blue} />
        <Text style={styles.loadingText}>{label}</Text>
      </View>
    </Card>
  );
}

/** One count on the Summary tab — a number and what it counts. */
export function SummaryTile({ icon, value, label }: { icon: IconName; value: string; label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label} ${value}`}>
      <View style={styles.tileIcon}>
        <Icon name={icon} size={16} color={colors.blue} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/**
 * What a failed dependent read means, in words. Three honest states and a
 * generic one:
 *  - 403 dependent_forbidden → the link is no longer active (revoked, lapsed at 18, or removed);
 *  - 404 without an error_code → this server does not serve the endpoint yet;
 *  - 404 with one → the link is gone;
 *  - anything else → could not load, retry.
 */
export function familyErrorCopy(
  t: TFunction,
  error: unknown,
): { icon: IconName; title: string; message: string; retryable: boolean } {
  if (isDependentForbidden(error)) {
    return {
      icon: 'lock',
      title: t('family.member.linkInactiveTitle'),
      message: t('family.member.linkInactiveBody'),
      retryable: false,
    };
  }
  if (isFamilyNotServed(error)) {
    return {
      icon: 'info',
      title: t('family.notServedTitle'),
      message: t('family.notServedBody'),
      retryable: false,
    };
  }
  if (isFamilyLinkGone(error)) {
    return {
      icon: 'x-circle',
      title: t('family.member.linkGoneTitle'),
      message: t('family.member.linkGoneBody'),
      retryable: false,
    };
  }
  return {
    icon: 'alert-triangle',
    title: t('family.loadFailed'),
    message: t('family.member.loadFailedBody'),
    retryable: true,
  };
}

/** A section-sized empty state for one failed dependent read. */
export function FamilyErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const copy = familyErrorCopy(t, error);
  const tint = isDependentForbidden(error) ? 'amber' : isFamilyNotServed(error) ? 'blue' : 'red';
  return (
    <Card variant="flush">
      <EmptyState
        icon={copy.icon}
        tint={tint}
        title={copy.title}
        message={copy.message}
        actionLabel={copy.retryable && onRetry ? t('family.retry') : undefined}
        onAction={copy.retryable && onRetry ? onRetry : undefined}
      />
    </Card>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm + 4,
      borderRadius: radii.md,
    },
    noticeSpaced: { marginBottom: spacing.md },
    noticeText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
    },
    noticeAction: {
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.xs,
      backgroundColor: colors.surface,
    },
    noticeActionText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
    },
    loading: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    tile: {
      flexBasis: '47%',
      flexGrow: 1,
      minWidth: 0,
      padding: spacing.sm + 4,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    tileIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.tintBlueBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    tileValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      color: colors.textPrimary,
    },
    tileLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
  });
