import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, radii, spacing, typography, useTheme, type IconName, type Palette } from '@/components/opes-ui';
import { useAuthStore } from '@/lib/store/auth';
import { emergencyCard } from '@/lib/emergency/snapshot';
import { markSignedOutLanding } from './signOutLanding';
import '@/lib/i18n/authRedesignStrings';

/**
 * "Sign out of OpesCare?" — a bottom sheet that says plainly what signing out
 * does on this phone, then runs the auth store's `logout()` (which revokes the
 * session and runs `wipeSessionData`). On success the root layout leaves the
 * signed-in area and the welcome screen forwards to the signed-out landing.
 */
export function SignOutSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const logout = useAuthStore((st) => st.logout);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardOn, setCardOn] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    void emergencyCard.isEnabled().then(setCardOn);
  }, [visible]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    markSignedOutLanding();
    try {
      await logout();
      onClose();
    } catch {
      setError(t('authRedesign.signOut.failed'));
    } finally {
      setBusy(false);
    }
  };

  const points: { icon: IconName; text: string }[] = [
    { icon: 'key', text: t('authRedesign.signOut.point1') },
    { icon: 'trash', text: t('authRedesign.signOut.point2') },
    { icon: 'bell-off', text: t('authRedesign.signOut.point3') },
  ];
  if (cardOn) points.push({ icon: 'first-aid', text: t('authRedesign.signOut.pointEmergency') });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <Pressable style={s.scrim} onPress={busy ? undefined : onClose} accessibilityLabel={t('authRedesign.signOut.cancel')} />
      <View style={s.sheet} accessibilityViewIsModal>
        <View style={s.grabber} />
        <View style={s.badge}>
          <Icon name="logout" size={24} color={colors.statusCritical} />
        </View>
        <Text style={s.title} accessibilityRole="header">
          {t('authRedesign.signOut.title')}
        </Text>
        <Text style={s.body}>{t('authRedesign.signOut.body')}</Text>
        <View style={s.points}>
          {points.map((p) => (
            <View key={p.icon} style={s.point}>
              <Icon name={p.icon} size={16} color={colors.blue} />
              <Text style={s.pointText}>{p.text}</Text>
            </View>
          ))}
        </View>
        {error ? (
          <Text style={s.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <TouchableOpacity
          onPress={confirm}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          accessibilityLabel={t('authRedesign.signOut.confirm')}
          style={[s.danger, busy && { opacity: 0.6 }]}
          activeOpacity={0.8}
        >
          <Icon name="logout" size={18} color="#FFFFFF" />
          <Text style={s.dangerText}>{busy ? t('authRedesign.signOut.working') : t('authRedesign.signOut.confirm')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onClose}
          disabled={busy}
          accessibilityRole="button"
          style={s.secondary}
          activeOpacity={0.7}
        >
          <Text style={s.secondaryText}>{t('authRedesign.signOut.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 22, 40, 0.45)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.surface,
      borderTopLeftRadius: radii.lg + 4,
      borderTopRightRadius: radii.lg + 4,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      paddingTop: spacing.sm,
      gap: spacing.sm + 4,
    },
    grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: spacing.sm },
    badge: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.statusCriticalBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.lg, color: c.textPrimary },
    body: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: c.textSecondary },
    points: { gap: spacing.sm + 2, marginBottom: spacing.sm },
    point: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'flex-start' },
    pointText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: 20,
      color: c.textPrimary,
    },
    error: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: c.statusCritical },
    danger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      height: 52,
      borderRadius: radii.md,
      backgroundColor: c.statusCritical,
    },
    secondary: {
      height: 52,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: c.blue },
    dangerText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: '#FFFFFF' },
  });
