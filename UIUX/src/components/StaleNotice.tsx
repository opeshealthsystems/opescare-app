/**
 * "Showing what we last loaded" strip.
 *
 * Every `AsyncBoundary` in the app used to gate its error state on
 * `state.data === null`, so a refresh that failed after the first successful
 * load rendered nothing at all — the patient kept looking at the previous
 * payload, indistinguishable from fresh data. On a clinical screen (an
 * appointment time the clinic may since have moved, a dose that may already be
 * recorded) that is a safety problem, not a polish one.
 *
 * This strip says plainly that the refresh failed and when the figures on
 * screen were actually loaded, and offers another attempt.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation, type TFunction } from '../i18n';
import { colors, radii, spacing, statusMap, typography } from '../theme/theme';
import { Icon } from './Icon';

/**
 * "just now" / "6 minutes ago" / "at 10:32" — « à l’instant » / « il y a 6
 * minutes » / « à 10:32 ». The clock is 24-hour in both locales here because
 * it is a freshness stamp, not an appointment time.
 */
export function fmtLastLoaded(at: Date | null, t: TFunction): string {
  if (!at) return t('components.whenNotYet');
  const secs = Math.max(0, Math.round((Date.now() - at.getTime()) / 1000));
  if (secs < 45) return t('components.whenJustNow');
  const mins = Math.round(secs / 60);
  if (mins < 60) return t('components.whenMinutes', { count: mins });
  const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const days = Math.floor((Date.now() - at.getTime()) / 86_400_000);
  if (days < 1) return t('components.whenAt', { clock });
  if (days < 2) return t('components.whenYesterdayAt', { clock });
  return t('components.whenOnAt', { date: `${at.getDate()}/${at.getMonth() + 1}`, clock });
}

export function StaleNotice({
  message,
  loadedAt,
  onRetry,
  retrying,
}: {
  /** Why the refresh failed, in patient language. */
  message: string;
  loadedAt: Date | null;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation();
  const skin = statusMap.warning;
  return (
    <View
      style={[styles.wrap, { backgroundColor: skin.bg }]}
      accessibilityRole="alert"
      // This strip appears on its own, after a refresh the patient did not
      // start, over data they are already reading. Assertive: "the times on
      // this screen may have moved" is exactly the thing you must not learn
      // several swipes later.
      accessibilityLiveRegion="assertive"
    >
      <Icon name="alert-circle" size={20} color={skin.fg} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: skin.fg }]}>{t('components.staleTitle')}</Text>
        <Text style={styles.text}>
          {t('components.staleBody', { message, when: fmtLastLoaded(loadedAt, t) })}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onRetry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityLabel={t('components.staleRetry')}
        accessibilityHint={t('components.staleRetryHint')}
        accessibilityState={{ disabled: !!retrying, busy: !!retrying }}
        style={[styles.retry, retrying && styles.retryOff]}
      >
        <Text style={styles.retryText}>
          {retrying ? t('components.staleRetrying') : t('components.staleRetry')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** Quiet "as of …" line for a screen that loaded successfully. */
export function LastUpdatedLine({ loadedAt }: { loadedAt: Date | null }) {
  const { t } = useTranslation();
  const when = fmtLastLoaded(loadedAt, t);
  return (
    <Text style={styles.stamp} accessibilityLabel={t('components.loadedA11y', { when })}>
      {t('components.loadedAt', { when })}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    padding: spacing.md - 2,
    borderRadius: radii.md,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
  text: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  retry: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md - 4,
    borderRadius: radii.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  retryOff: { opacity: 0.5 },
  retryText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: colors.link },
  stamp: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
