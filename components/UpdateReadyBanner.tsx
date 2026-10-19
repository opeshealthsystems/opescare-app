/**
 * Over-the-air updates, made visible.
 *
 * expo-updates already downloads a published update on launch, but it only
 * takes effect on the NEXT cold start — so a patient who never fully closes
 * the app keeps running yesterday's version and nothing on screen says why.
 *
 * This checks on launch and every time the app comes back to the foreground,
 * downloads a new update when there is one, and then offers a one-tap restart.
 * "Later" hides it until the next foreground; the update still applies on the
 * next cold start regardless. Inert in development and on web, where there is
 * no updater.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useTranslation } from 'react-i18next';
import { Icon, spacing, typography, useTheme } from '@/components/opes-ui';
import '@/lib/i18n/otaUpdateStrings';
import { fetchPendingUpdate } from '@/lib/otaUpdates';

const ENABLED = !__DEV__ && Platform.OS !== 'web' && Updates.isEnabled;
/** Don't hit the update server more than once a minute when the app flips foreground. */
const MIN_CHECK_INTERVAL_MS = 60_000;

export function UpdateReadyBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastCheck = useRef(0);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (!ENABLED || busy.current) return;
    const now = Date.now();
    if (now - lastCheck.current < MIN_CHECK_INTERVAL_MS) return;
    lastCheck.current = now;
    busy.current = true;
    try {
      // Offline or an unreachable update server resolves false: try again next foreground.
      if (await fetchPendingUpdate(Updates)) {
        setReady(true);
        setDismissed(false);
      }
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setDismissed(false);
        void check();
      }
    });
    return () => sub.remove();
  }, [check]);

  if (!ready || dismissed) return null;

  return (
    <View
      style={[styles.wrap, { backgroundColor: colors.navy }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon name="download" size={20} color="#FFFFFF" />
      <View style={styles.text}>
        <Text style={styles.title}>{t('otaUpdate.ready')}</Text>
        <Text style={styles.body}>{t('otaUpdate.body')}</Text>
      </View>
      <Pressable
        onPress={() => setDismissed(true)}
        accessibilityRole="button"
        accessibilityLabel={t('otaUpdate.later')}
        hitSlop={10}
        style={styles.later}
      >
        <Text style={styles.laterText}>{t('otaUpdate.later')}</Text>
      </Pressable>
      <Pressable
        onPress={() => void Updates.reloadAsync().catch(() => undefined)}
        accessibilityRole="button"
        accessibilityLabel={t('otaUpdate.restart')}
        style={[styles.restart, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.restartText}>{t('otaUpdate.restart')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 96,
    borderRadius: 16,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 900,
    elevation: 8,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: '#FFFFFF' },
  body: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: 'rgba(255,255,255,0.8)' },
  later: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  laterText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: 'rgba(255,255,255,0.85)' },
  restart: { minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: spacing.md },
  restartText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: '#FFFFFF' },
});
