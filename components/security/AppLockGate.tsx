import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GradientButton, Icon, Wordmark, spacing, typography, useTheme } from '@/components/opes-ui';
import { PaperWave } from '@/components/ui/PaperWave';
import { installAppLockWatcher, useAppLock } from '@/lib/security/appLock';
import { MedicalIdCard } from '@/components/emergency/MedicalIdCard';
import { useEmergencySnapshotSync, useVisibleEmergencyCard } from '@/lib/emergency/sync';

/**
 * Full-screen cover shown while the app is locked. Rendered after the Stack
 * in app/_layout.tsx, so nothing underneath — Health ID, records, messages —
 * is visible or reachable until the owner authenticates.
 */
export function AppLockGate({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { locked, ready, load, unlock } = useAppLock();
  const prompted = useRef(false);
  // Always mounted from the root layout, so the opt-in emergency card is kept
  // in step with the profile from here, and shown on the lock cover.
  useEmergencySnapshotSync();
  const medicalId = useVisibleEmergencyCard();

  useEffect(() => {
    void load();
    return installAppLockWatcher();
  }, [load]);

  const tryUnlock = useCallback(() => {
    void unlock(String(t('appLock.prompt')));
  }, [unlock, t]);

  // Ask once, straight away, each time the cover appears.
  useEffect(() => {
    if (active && locked && !prompted.current) {
      prompted.current = true;
      tryUnlock();
    }
    if (!locked) prompted.current = false;
  }, [active, locked, tryUnlock]);

  if (!active || !ready || !locked) return null;

  return (
    <View style={styles.cover} accessibilityViewIsModal>
      <PaperWave />
      <Wordmark size="lg" />
      <View style={styles.badge}>
        <Icon name="lock" size={32} color={colors.blue} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {t('appLock.title')}
      </Text>
      <Text style={styles.body}>{t('appLock.body')}</Text>
      <GradientButton label={t('appLock.unlock')} onPress={tryUnlock} icon="none" />
      {medicalId ? (
        <View style={styles.medical}>
          <MedicalIdCard snapshot={medicalId} />
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    cover: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.page,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.md,
      overflow: 'hidden',
      zIndex: 1000,
    },
    medical: { alignSelf: 'stretch', marginTop: spacing.md },
    badge: {
      marginTop: spacing.lg,
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.tintBlueBg,
    },
    title: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xl,
      color: c.textPrimary,
      textAlign: 'center',
    },
    body: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
  });
}
