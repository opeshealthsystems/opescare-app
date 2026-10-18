/**
 * Tab group — the OPES bottom bar (design reference DESIGN_SPEC.md (archived prototype, see docs/DESIGN_REFERENCE.md) §11):
 *
 *     Home   |   Health ID   |   ( + )   |   Messages•   |   Profile
 *
 * The bar itself is `OpesTabBar` (components/quick-add/), passed as a custom
 * `tabBar` so the centre Quick-Add FAB can be chrome rather than a route.
 * `records` no longer has a slot but MUST still resolve at /records — it stays
 * registered with `href: null` (hidden from the bar, reachable from Home and
 * from the Quick-Add sheet).
 */
import { useCallback } from 'react';
import type { ColorValue } from 'react-native';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { Icon, iconStroke, useTheme, type IconName } from '@/components/opes-ui';
import { OpesTabBar, QUICK_ADD_SLOT, UnreadThreadsBadge } from '@/components/quick-add/OpesTabBar';

/** Bar order. The FAB slot is not a route. */
const SLOTS = ['home', 'health-id', QUICK_ADD_SLOT, 'messages', 'profile'] as const;

/**
 * Tab glyphs are 24px at stroke 2.0 (§6 / §11). React Navigation types the
 * tint as `ColorValue`; the kit `Icon` takes a string, and our bar only ever
 * passes palette strings, so an opaque value simply falls back to the kit's
 * default colour.
 */
function tabIcon(name: IconName) {
  // eslint-disable-next-line react/display-name -- render callback for tabBarIcon, not a named component
  return ({ color, size }: { color: ColorValue; size: number; focused: boolean }) => (
    <Icon
      name={name}
      size={size}
      color={typeof color === 'string' ? color : undefined}
      strokeWidth={iconStroke.bold}
    />
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => (
      <OpesTabBar {...props} slots={SLOTS} badges={{ messages: <UnreadThreadsBadge /> }} />
    ),
    [],
  );

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('opesCore.tabs.home'), tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="health-id" options={{ title: t('healthId.title'), tabBarIcon: tabIcon('id-card') }} />
      <Tabs.Screen name="messages" options={{ title: t('opesCore.tabs.messages'), tabBarIcon: tabIcon('chat') }} />
      <Tabs.Screen name="profile" options={{ title: t('opesCore.tabs.profile'), tabBarIcon: tabIcon('person') }} />
      {/* Not a bar slot, but /records must keep resolving. */}
      <Tabs.Screen name="records" options={{ href: null, title: t('opesCore.tabs.recordsFull') }} />
    </Tabs>
  );
}
