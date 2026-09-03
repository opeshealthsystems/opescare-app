import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloudOff, ChevronRight } from 'lucide-react-native';
import { useOfflineStatus } from '../../lib/api/offlineQueries';
import { useIsOnline } from '../../lib/offline/connectivity';
import { formatSavedAt } from '../../lib/offline/relativeTime';
import { colors } from '../../theme/tokens';

/**
 * The honest offline indicator, mounted once at the root.
 *
 * It says two different things because they are two different situations:
 * "showing data saved 12 min ago" when there is a local copy, and "no saved
 * data on this device" when there is not. It never implies the app is working
 * normally, and it never claims data is fresher than it is.
 *
 * Rendered as a floating pill rather than a layout row so that going offline
 * cannot reflow every screen underneath it.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isOnline = useIsOnline();
  const { data: status } = useOfflineStatus();

  if (isOnline) return null;

  const savedWhen = formatSavedAt(status?.lastCachedAt, t);
  const message = savedWhen
    ? t('offline.bannerOffline', { when: savedWhen })
    : t('offline.bannerNoData');

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, zIndex: 50 }}
    >
      <Pressable
        onPress={() => router.push('/offline-access')}
        accessibilityRole="button"
        accessibilityLabel={message}
        className="flex-row items-center rounded-full px-4 py-2.5"
        style={{
          backgroundColor: colors.semantic.warningSurface,
          borderWidth: 1,
          borderColor: colors.brand[100],
        }}
      >
        <CloudOff size={15} color={colors.semantic.warning} />
        <Text
          className="ml-2 flex-1 text-xs font-semibold"
          style={{ color: colors.brand[700] }}
          numberOfLines={2}
        >
          {message}
        </Text>
        <ChevronRight size={15} color={colors.brand[600]} />
      </Pressable>
    </View>
  );
}
