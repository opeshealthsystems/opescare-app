import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../theme/tokens';
import type { PrescriptionSummary } from '../../lib/api/queries';

/**
 * Shared prescription presentation helpers — status vocabulary, the status
 * pill, and the date/reference formatting used by both the list and the detail
 * screen. Lives here rather than being exported from a route file so
 * expo-router only ever sees a screen's default export.
 */

export type PrescriptionStatusColor = PrescriptionSummary['status_color'];

export function statusLabelKey(status: string): string {
  switch (status) {
    case 'active':
      return 'prescriptions.statusActive';
    case 'dispensed':
      return 'prescriptions.statusDispensed';
    case 'partially_dispensed':
      return 'prescriptions.statusPartiallyDispensed';
    case 'expired':
      return 'prescriptions.statusExpired';
    case 'cancelled':
      return 'prescriptions.statusCancelled';
    default:
      return 'prescriptions.statusActive';
  }
}

export interface StatusTone {
  fg: string;
  bg: string;
}

/**
 * Pill colours for a prescription status, taken from `colors.semantic`.
 *
 * The API's own `status_color` drives this, with one deliberate exception: it
 * returns `default` for both `expired` and `cancelled`, which would render a
 * revoked prescription identically to a merely lapsed one. On a medication list
 * that is a safety-legibility problem, so `cancelled` is promoted to danger.
 */
export function statusTone(status: string, statusColor: PrescriptionStatusColor): StatusTone {
  if (status === 'cancelled') {
    return { fg: colors.semantic.danger, bg: colors.semantic.dangerSurface };
  }

  switch (statusColor) {
    case 'success':
      return { fg: colors.semantic.success, bg: colors.semantic.successSurface };
    case 'info':
      return { fg: colors.semantic.info, bg: colors.semantic.infoSurface };
    case 'warning':
      return { fg: colors.semantic.warning, bg: colors.semantic.warningSurface };
    default:
      return { fg: colors.navy.secondary, bg: colors.cream[200] };
  }
}

export function StatusPill({
  status,
  statusColor,
  large,
}: {
  status: string;
  statusColor: PrescriptionStatusColor;
  large?: boolean;
}) {
  const { t } = useTranslation();
  const tone = statusTone(status, statusColor);

  return (
    <View
      className={`flex-row items-center rounded-full ${large ? 'px-3 py-1.5' : 'px-2.5 py-1'}`}
      style={{ backgroundColor: tone.bg }}
    >
      <View className="mr-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tone.fg }} />
      <Text
        className={`font-bold ${large ? 'text-xs' : 'text-[11px]'}`}
        style={{ color: tone.fg }}
      >
        {t(statusLabelKey(status))}
      </Text>
    </View>
  );
}

export function formatDate(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Whole days from now until `iso`; negative once the date has passed. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - Date.now()) / 86_400_000);
}

/** Short human handle for a prescription — the record UUID is all the API gives. */
export function referenceCode(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** Days inside which an approaching expiry is worth flagging in warning colour. */
export const EXPIRY_WARNING_WINDOW_DAYS = 14;
