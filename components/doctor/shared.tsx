/**
 * Shared vocabulary for the doctor's clinical inbox.
 *
 * Port of `UIUX/src/screens/doctor/shared.tsx`. Composition only — every
 * colour, radius, type size and icon comes from `@/components/opes-ui`; the
 * palette is this app's own (`opescare`), never re-skinned here. Nothing new
 * is introduced.
 *
 * What changed from the OPES source, and why:
 *  - `../../components` → `@/components/opes-ui` (the installed kit).
 *  - `../../i18n` (custom) → `react-i18next` / `i18next`. Every OPES key keeps
 *    its path under the `opesDoctor.` prefix (`doctor.inbox.x` →
 *    `opesDoctor.inbox.x`), and carries an English `defaultValue` because that
 *    namespace is still being migrated into `lib/i18n/locales/*.json` by
 *    another agent. The moment the keys land, the catalogue wins and the
 *    defaults stop being used. Locale files are NOT edited here.
 *  - `InboxResult.patient_number` does not exist on this app's wire type. The
 *    server sends `patient_health_id` (the portable OpesCare Health ID) — that
 *    is what the row shows. No facility MRN is invented to fill the gap.
 *  - NOTHING IN HERE FETCHES. These are presentation helpers; the screens own
 *    their queries (`lib/api/doctorQueries.ts`).
 *
 * Backend gap, stated honestly: the finder serves no `/mobile/doctor/*` routes
 * yet, so every doctor hook 404s today. That is a screen-level concern —
 * these components simply render whatever rows they are handed, and render
 * nothing at all when handed none.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  Icon,
  ListRow,
  StatusBadge,
  colors,
  formatDate,
  formatTime,
  spacing,
  statusMap,
  typography,
  type IconName,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import type { InboxResult } from '@/lib/api/doctorQueries';

// ── Category vocabulary ───────────────────────────────────────────────────

/**
 * Mirrors `App\Domain\Worklist\Support\NotificationPresenter::CATEGORY_ICONS`
 * for the four result categories the inbox carries. The API sends its own
 * localised `category_label`; the app labels from its own catalogue and takes
 * only the raw `category` as truth, so the wording follows the app's language
 * rather than whatever the account happened to be set to server-side.
 */
const CATEGORY: Record<string, { icon: IconName; tint: Tint; label: string }> = {
  lab_review: { icon: 'alert-circle', tint: 'red', label: 'Needs review' },
  lab_result: { icon: 'flask', tint: 'green', label: 'Lab result' },
  laboratory: { icon: 'flask', tint: 'green', label: 'Laboratory' },
  radiology: { icon: 'image', tint: 'blue', label: 'Imaging' },
};

/**
 * A non-hook `t` for the module-level helpers below — the same pattern as
 * `components/care/shared.tsx`. Pure functions called from render: the
 * component calling them has already re-rendered off the i18n context, so the
 * locale read here is the current one.
 */
const tx = (key: string, defaultValue: string, params?: Record<string, unknown>): string =>
  i18next.t(`opesDoctor.${key}`, { defaultValue, ...params }) as string;

/** "Lab result" / « Résultat de laboratoire » — never the raw category token. */
export function categoryLabel(category: string): string {
  return tx(
    `inbox.category.${category}`,
    CATEGORY[category]?.label ?? tx('inbox.categoryFallback', 'Clinical notification'),
  );
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
 * "Today at 14:20" / « Aujourd'hui à 14:20 » — when the laboratory reported.
 *
 * The clock and the date come from the kit's locale-aware formatters, so FR
 * gets a 24-hour clock and a French month exactly as the desktop prints them;
 * only the joining phrase is a catalogue string.
 */
export function fmtReported(iso: string | null): string {
  if (!iso) return tx('when.reportedUnknown', 'Time not recorded');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return tx('when.reportedUnknown', 'Time not recorded');
  const time = formatTime(d);
  const now = new Date();
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  );
  if (days === 0) return tx('when.reportedTodayAt', 'Today at {{time}}', { time });
  if (days === 1) return tx('when.reportedYesterdayAt', 'Yesterday at {{time}}', { time });
  return tx('when.reportedOnAt', '{{date}} at {{time}}', { date: formatDate(d), time });
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
          <Text style={styles.criticalRailText}>
            {t('opesDoctor.inbox.rail', { defaultValue: 'CRITICAL' })}
          </Text>
        </View>
      )}
      <ListRow
        icon={result.is_critical ? 'alert-circle' : categoryIcon(result.category)}
        tint={result.is_critical ? 'red' : categoryTint(result.category)}
        title={
          result.patient_name ??
          t('opesDoctor.inbox.patientNotOnRecord', { defaultValue: 'Patient not on record' })
        }
        meta={[
          result.title,
          // The Health ID — this app's wire type carries no facility MRN.
          result.patient_health_id ?? undefined,
          fmtReported(result.reported_at),
        ]}
        trailing={
          acked ? (
            <StatusBadge
              status={t('opesDoctor.inbox.badgeAcknowledged', { defaultValue: 'Acknowledged' })}
              tone="normal"
              icon="check"
              size="sm"
            />
          ) : (
            <StatusBadge
              status={
                result.is_critical
                  ? t('opesDoctor.inbox.badgeCritical', { defaultValue: 'Critical' })
                  : categoryLabel(result.category)
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
        count === 0
          ? t('opesDoctor.home.tileNothing', { defaultValue: 'Nothing waiting' })
          : t('opesDoctor.home.tileWaiting', {
              defaultValue: count === 1 ? '1 waiting on you' : '{{count}} waiting on you',
              count,
            })
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
