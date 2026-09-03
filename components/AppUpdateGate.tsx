import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleArrowUp, Download, ShieldAlert, X } from 'lucide-react-native';
import { useUpdateGate } from '../lib/api/appConfigQueries';
import { colors } from '../theme/tokens';

/**
 * Startup version gate, driven by GET /mobile/app-config.
 *
 * Mounted once in app/_layout.tsx as a sibling *after* the router's <Stack>, so
 * the blocking variant paints over whatever screen is mounted (including the
 * pre-auth screens — the endpoint is public and the gate applies before login).
 *
 * Renders `null` unless the backend affirmatively says this build is old. See
 * `useUpdateGate` for the fail-open rules: offline, slow, or malformed config
 * all resolve to "ok" and render nothing.
 */
export function AppUpdateGate() {
  const { t } = useTranslation();
  const gate = useUpdateGate();
  const [dismissed, setDismissed] = useState(false);

  if (gate.kind === 'ok') return null;
  if (gate.kind === 'optional' && dismissed) return null;

  const openStore = () => {
    if (!gate.storeUrl) return;
    Linking.openURL(gate.storeUrl).catch(() => {
      // Nothing actionable if no browser/store handler exists — the screen
      // stays put so the user can still read the instructions.
    });
  };

  const versionLine = gate.latestVersion
    ? t('appUpdate.latestVersion', { version: gate.latestVersion })
    : null;

  // ── Hard block: full-screen, non-dismissible ────────────────────────────
  if (gate.kind === 'blocked') {
    return (
      <View style={styles.blockingRoot}>
        <View className="w-full max-w-sm items-center">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-50">
            <ShieldAlert size={34} color={colors.brand[600]} />
          </View>

          <Text className="mt-6 text-center text-2xl font-extrabold text-navy-text">
            {t('appUpdate.blockedTitle')}
          </Text>
          <Text className="mt-3 text-center text-sm text-navy-secondary">
            {t('appUpdate.blockedBody')}
          </Text>
          {versionLine ? (
            <Text className="mt-2 text-center text-xs text-navy-muted">{versionLine}</Text>
          ) : null}

          {gate.storeUrl ? (
            <Pressable
              onPress={openStore}
              className="mt-8 h-14 w-full flex-row items-center justify-center gap-2 rounded-2xl"
              style={{ backgroundColor: colors.brand[500] }}
            >
              <Download size={18} color={colors.white} />
              <Text className="text-base font-bold text-white">{t('appUpdate.updateNow')}</Text>
            </Pressable>
          ) : (
            <Text className="mt-8 text-center text-sm font-semibold text-navy-secondary">
              {t('appUpdate.storeUnavailable')}
            </Text>
          )}
        </View>
      </View>
    );
  }

  // ── Soft prompt: dismissible card pinned to the bottom ───────────────────
  return (
    <View style={styles.promptRoot} pointerEvents="box-none">
      <View className="rounded-2xl bg-white p-4" style={styles.promptCard}>
        <View className="flex-row items-start">
          <View className="mr-3 h-11 w-11 items-center justify-center rounded-xl bg-brand-50">
            <CircleArrowUp size={20} color={colors.brand[600]} />
          </View>

          <View className="flex-1">
            <Text className="text-base font-bold text-navy-text">{t('appUpdate.availableTitle')}</Text>
            <Text className="mt-1 text-sm text-navy-secondary">{t('appUpdate.availableBody')}</Text>
            {versionLine ? (
              <Text className="mt-1 text-xs text-navy-muted">{versionLine}</Text>
            ) : null}

            <View className="mt-3 flex-row items-center gap-4">
              {gate.storeUrl ? (
                <Pressable onPress={openStore} className="flex-row items-center gap-1.5" hitSlop={6}>
                  <Download size={15} color={colors.brand[600]} />
                  <Text className="text-sm font-semibold text-brand-600">
                    {t('appUpdate.updateNow')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setDismissed(true)} hitSlop={6}>
                <Text className="text-sm font-semibold text-navy-secondary">
                  {t('appUpdate.notNow')}
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={() => setDismissed(true)}
            hitSlop={10}
            accessibilityLabel={t('appUpdate.dismiss')}
            className="ml-2 h-7 w-7 items-center justify-center rounded-full"
          >
            <X size={16} color={colors.navy.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  blockingRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.cream[100],
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  promptRoot: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
  },
  promptCard: {
    borderWidth: 1,
    borderColor: colors.cream[300],
    shadowColor: colors.black,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
