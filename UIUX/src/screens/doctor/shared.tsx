/**
 * Shared vocabulary for the doctor's clinical inbox.
 *
 * Composition only — every colour, radius, type size and icon comes from
 * `theme/theme`, `components/*` and `screens/care/shared` / `screens/
 * diagnostics/shared`. Nothing new is introduced here.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon, IconName, ListRow, StatusBadge } from '../../components';
import { getLocale, translator, useTranslation } from '../../i18n';
import { formatDate, formatTime } from '../../utils/format';
import { colors, spacing, StatusTone, statusMap, Tint, typography } from '../../theme/theme';
import type { InboxResult } from '../../api';

// ── Category vocabulary ───────────────────────────────────────────────────

/**
 * Mirrors `App\Domain\Worklist\Support\NotificationPresenter::CATEGORY_ICONS`
 * for the four result categories the inbox carries. The API sends its own
 * localised `category_label`; the app labels from its own catalogue and takes
 * only the raw `category` as truth, so the wording follows the app's language
 * rather than whatever the account happened to be set to server-side.
 */
const CATEGORY: Record<string, { icon: IconName; tint: Tint }> = {
  lab_review: { icon: 'alert-circle', tint: 'red' },
  lab_result: { icon: 'flask', tint: 'green' },
  laboratory: { icon: 'flask', tint: 'green' },
  radiology: { icon: 'image', tint: 'blue' },
};

/** A `t` for the helpers below — same pattern as `utils/format.ts`. */
const tr = () => translator(getLocale());

export function categoryLabel(category: string): string {
  const t = tr();
  const key = `doctor.inbox.category.${category}`;
  const hit = t(key);
  return hit === key ? t('doctor.inbox.categoryFallback') : hit;
}

export function categoryIcon(category: string): IconName {
  return CATEGORY[category]?.icon ?? 'bell';
}

export function categoryTint(category: string): Tint {
  return CATEGORY[category]?.tint ?? 'blue';
}

/**
 * Severity → tone. `is_critical` is the server's own flag (severity ===
 * 'critical' on the notification row), never re-derived from the text.
 */
export function toneForSeverity(severity: string): StatusTone {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'success':
      return 'normal';
    default:
      return 'pending';
  }
}

/**
 * "Today at 14:20" / "Aujourd’hui à 14:20" — when the laboratory reported.
 *
 * The clock and the date come from `utils/format`, so FR gets a 24-hour clock
 * and a French month exactly as the desktop prints them; only the joining
 * phrase is a catalogue string.
 */
export function fmtReported(iso: string | null): string {
  const t = tr();
  if (!iso) return t('doctor.when.reportedUnknown');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('doctor.when.reportedUnknown');
  const time = formatTime(d);
  const now = new Date();
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000
  );
  if (days === 0) return t('doctor.when.reportedTodayAt', { time });
  if (days === 1) return t('doctor.when.reportedYesterdayAt', { time });
  return t('doctor.when.reportedOnAt', { date: formatDate(d), time });
}

// ── Inbox row ─────────────────────────────────────────────────────────────

/**
 * One result awaiting review.
 *
 * A CRITICAL row is unmistakable at a glance and by screen reader: a red
 * "CRITICAL" rail and banner above the row, the red alert glyph, and the word
 * itself. It is never distinguished by colour alone.
 */
export function ResultRow({ result, onPress }: { result: InboxResult; onPress: () => void }) {
  const { t } = useTranslation();
  const acked = !!result.acknowledged_at;
  const critical = result.is_critical && !acked;

  return (
    <View style={critical ? styles.criticalWrap : undefined}>
      {critical && (
        <View style={styles.criticalRail}>
          <Icon name="alert-triangle" size={14} color={colors.textOnBrand} />
          <Text style={styles.criticalRailText}>{t('doctor.inbox.rail')}</Text>
        </View>
      )}
      <ListRow
        icon={result.is_critical ? 'alert-circle' : categoryIcon(result.category)}
        tint={result.is_critical ? 'red' : categoryTint(result.category)}
        title={result.patient_name ?? t('doctor.inbox.patientNotOnRecord')}
        meta={[
          result.title,
          result.patient_number ?? undefined,
          fmtReported(result.reported_at),
        ]}
        trailing={
          acked ? (
            <StatusBadge
              status={t('doctor.inbox.badgeAcknowledged')}
              tone="normal"
              icon="check"
              size="sm"
            />
          ) : (
            <StatusBadge
              status={
                result.is_critical ? t('doctor.inbox.badgeCritical') : categoryLabel(result.category)
              }
              tone={toneForSeverity(result.severity)}
              size="sm"
            />
          )
        }
        onPress={onPress}
        style={critical ? styles.criticalRow : undefined}
      />
    </View>
  );
}

/** Small "3 awaiting" style figure used on the home screen tiles. */
export function CountTile({
  icon,
  tint,
  count,
  label,
  onPress,
  emphasise,
}: {
  icon: IconName;
  tint: Tint;
  count: number;
  label: string;
  onPress: () => void;
  /** Paint the figure in the critical colour (unacknowledged criticals). */
  emphasise?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <ListRow
      icon={icon}
      tint={emphasise ? 'red' : tint}
      title={label}
      subtitle={
        count === 0 ? t('doctor.home.tileNothing') : t('doctor.home.tileWaiting', { count })
      }
      trailing={
        <Text
          style={[
            styles.tileCount,
            { color: emphasise && count > 0 ? colors.statusCritical : colors.textPrimary },
          ]}
        >
          {count}
        </Text>
      }
      onPress={onPress}
    />
  );
}

export const styles = StyleSheet.create({
  criticalWrap: {
    borderRadius: 0,
    backgroundColor: colors.statusCriticalBg,
  },
  criticalRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.statusCritical,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 5,
  },
  criticalRailText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xs,
    letterSpacing: 0.6,
    color: colors.textOnBrand,
  },
  criticalRow: { backgroundColor: statusMap.critical.bg },
  tileCount: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
});
