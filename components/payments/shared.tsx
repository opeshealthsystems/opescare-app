import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, radii, spacing, typography, useTheme, type Palette, type StatusTone } from '@/components/opes-ui';
import type { PaymentStatus } from '../../lib/api/paymentQueries';

/**
 * The one warning that has to appear wherever money is shown.
 *
 * `GET /mobile/payments/methods` reports `simulated` — whether this host holds
 * real merchant credentials or is standing in for them. A screen listing sums
 * in FCFA that asks for a phone number looks identical either way; the only
 * honest difference is saying so, before the amounts rather than after.
 *
 * It lives here rather than inside a screen because there are now two screens
 * that show money, and a second copy of a safety notice is a copy that drifts.
 */
export function DemoBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.demoBanner} accessibilityRole="alert">
      <Icon name="alert-triangle" size={18} color={colors.statusWarning} />
      <View style={styles.flex1}>
        <Text style={styles.demoTitle}>{t('payments.demoBanner')}</Text>
        <Text style={styles.demoBody}>{t('payments.demoBannerBody')}</Text>
      </View>
    </View>
  );
}

/**
 * Tone per lifecycle state.
 *
 * `pending` is amber because it is waiting on the PATIENT — a push they have
 * not answered — not because something is wrong. `expired` is neutral rather
 * than red: a lapsed attempt costs nothing and can simply be retried.
 */
export const PAYMENT_TONE: Record<PaymentStatus, StatusTone> = {
  pending: 'pending',
  paid: 'normal',
  failed: 'critical',
  expired: 'neutral',
  refunded: 'info',
};

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    demoBanner: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.statusWarningBg,
      borderWidth: 1,
      borderColor: colors.statusWarning,
      alignItems: 'flex-start',
    },
    flex1: { flex: 1, minWidth: 0 },
    demoTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.statusWarning,
    },
    demoBody: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textPrimary,
    },
  });
