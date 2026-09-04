/**
 * Pieces shared by the three financial documents (BILL-001 invoice, BILL-002
 * payment status, BILL-003 receipt). All three references share the same head:
 * a soft blue banner with the document type and its reference number, then a
 * facility block with two dated columns on the right.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon, IconName, toneForStatus } from '../../components';
import { useTranslation } from '../../i18n';
import { colors, radii, spacing, typography, type StatusTone } from '../../theme/theme';
import { formatDate, formatLabel } from '../../utils/format';

/**
 * Translate a raw invoice status ("paid", "issued", …) into a patient-facing
 * badge label + tone. The badge used to render `formatLabel(status)`, which
 * only capitalises the English enum — so a French patient saw "Paid" on a
 * "Payée" invoice. The label now comes from the catalogue; the tone stays
 * derived from the raw status so colours never depend on the translation.
 */
export function invoiceStatusBadge(
  status: string,
  t: (key: string) => string
): { label: string; tone: StatusTone } {
  const key = `billing.statuses.${status}`;
  const label = t(key);
  return { label: label === key ? formatLabel(status) : label, tone: toneForStatus(status) };
}

/**
 * The day separator above each financial document — "Today, 01 Sep 2026" /
 * « Aujourd’hui, 01 sept. 2026 ».
 *
 * `chat/shared`'s `dayLabel` hard-codes `en-GB` and the English words, so the
 * billing screens build theirs here instead: the words come from the catalogue
 * and the date from `utils/format`, which already knows the locale.
 */
export function useDayLabel(): (iso: string | null | undefined) => string {
  const { t } = useTranslation();
  return React.useCallback(
    (iso: string | null | undefined) => {
      const date = formatDate(iso);
      if (!date) return '';
      const d = new Date(iso as string);
      const today = new Date();
      const yesterday = new Date(today.getTime() - 86_400_000);
      const same = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
      if (same(d, today)) return `${t('common.today')}, ${date}`;
      if (same(d, yesterday)) return `${t('common.yesterday')}, ${date}`;
      return date;
    },
    [t]
  );
}

export type DatedColumn = {
  label: string;
  value: string;
  icon?: IconName;
  /** Renders the value in the critical colour (an overdue due date). */
  overdue?: boolean;
};

/** "📄 INVOICE ............ INV-CCM-45872" */
export function DocumentBanner({
  icon,
  title,
  reference,
}: {
  icon: IconName;
  title: string;
  reference?: string | null;
}) {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerCircle}>
        <Icon name={icon} size={22} color={colors.link} />
      </View>
      <Text style={styles.bannerTitle}>{title}</Text>
      <View style={styles.bannerSpacer} />
      {!!reference && <Text style={styles.bannerRef}>{reference}</Text>}
    </View>
  );
}

/** Facility identity on the left, one or two dated columns on the right. */
export function FacilityBlock({
  facility,
  left,
  right,
}: {
  facility: { name: string; address: string; phone: string | null; email: string | null };
  left?: DatedColumn;
  right?: DatedColumn;
}) {
  return (
    <View style={styles.facilityRow}>
      <View style={styles.facilityMain}>
        <View style={styles.facilityCircle}>
          <Icon name="building" size={24} color={colors.tintBlue} />
        </View>
        <View style={styles.facilityBody}>
          <Text style={styles.facilityName}>{facility.name}</Text>
          {!!facility.address && (
            <View style={styles.facilityMetaRow}>
              <Icon name="location" size={15} color={colors.textSecondary} />
              <Text style={styles.facilityMeta} numberOfLines={2}>
                {facility.address}
              </Text>
            </View>
          )}
          {!!facility.phone && (
            <View style={styles.facilityMetaRow}>
              <Icon name="phone" size={15} color={colors.textSecondary} />
              <Text style={styles.facilityMeta}>{facility.phone}</Text>
            </View>
          )}
          {!!facility.email && (
            <View style={styles.facilityMetaRow}>
              <Icon name="mail" size={15} color={colors.textSecondary} />
              <Text style={styles.facilityMeta} numberOfLines={1}>
                {facility.email}
              </Text>
            </View>
          )}
        </View>
      </View>

      {(!!left || !!right) && (
        <View style={styles.dates}>
          {!!left && <DateColumn column={left} />}
          {!!right && <DateColumn column={right} />}
        </View>
      )}
    </View>
  );
}

function DateColumn({ column }: { column: DatedColumn }) {
  return (
    <View style={styles.dateCol}>
      <Text style={styles.dateLabel}>{column.label}</Text>
      <View style={styles.dateValueRow}>
        {!!column.icon && (
          <Icon name={column.icon} size={15} color={column.overdue ? colors.statusCritical : colors.link} />
        )}
        <Text style={[styles.dateValue, column.overdue && styles.dateOverdue]}>{column.value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm + 4,
  },
  bannerCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md + 2,
    letterSpacing: 0.4,
    color: colors.link,
  },
  bannerSpacer: { flex: 1 },
  bannerRef: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },

  facilityRow: { flexDirection: 'row', gap: spacing.sm + 4 },
  facilityMain: { flex: 1, flexDirection: 'row', gap: spacing.sm + 2, minWidth: 0 },
  facilityCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.tintBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  facilityBody: { flex: 1, minWidth: 0, gap: 2 },
  facilityName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  facilityMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  facilityMeta: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  dates: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    borderLeftWidth: 1,
    borderLeftColor: colors.divider,
    paddingLeft: spacing.sm + 4,
    // The longer French labels ("Date d’émission", "Date d’échéance") used to
    // grow this block until the facility name was squeezed to one letter per
    // line at 375. Cap the date columns and let them shrink first, so the name
    // always keeps enough width to wrap on word boundaries.
    flexShrink: 1,
    maxWidth: '46%',
  },
  dateCol: { gap: 3, minWidth: 0, flexShrink: 1 },
  dateLabel: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },
  dateValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateValue: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: colors.textPrimary },
  dateOverdue: { color: colors.statusCritical },
});
