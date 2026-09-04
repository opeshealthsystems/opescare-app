import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { useUnread } from '../context/UnreadContext';
import { useTranslation } from '../i18n';
import { HomeDashboardScreen } from '../screens/core/HomeDashboardScreen';
import { ProfileSettingsScreen } from '../screens/core/ProfileSettingsScreen';
import { MessagesScreen } from '../screens/messaging/MessagesScreen';
import { colors, iconStroke, shadow, typography } from '../theme/theme';
import { AppBackground } from '../components/Watermark';
import { QuickAddSheet } from './QuickAddSheet';
import { RecordsStackNavigator } from './RecordsStackNavigator';
import { MainTabParamList } from './routes';
import { HealthIcon, HomeIcon, MessagesIcon, ProfileIcon } from './TabIcons';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Never rendered — the QuickAddTab press is intercepted and opens the sheet.
const QuickAddNoop = () => null;

const TAB_BAR_HEIGHT = 62;

/**
 * Bottom tab bar, per CORE-006 / CORE-008.
 *
 *   Home  |  Records  |  ( + )  |  Messages(badge)  |  Profile
 *
 * The centre slot is a raised circular blue FAB, not a real tab: its
 * `tabPress` is prevented and it opens the Quick Add action sheet instead.
 */
export function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const { messages } = useUnread();
  const { t } = useTranslation();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  return (
    <>
      <Tab.Navigator
        // Per-scene opaque page + watermark — see DoctorTabNavigator for the
        // full reasoning. A bottom-tab navigator keeps every visited scene
        // mounted and stacked; with the watermark's transparent screen fills the
        // inactive tabs bled through the active one. Painting the opaque page
        // per-scene makes the focused tab cover the rest and puts the seal on it.
        screenLayout={({ children }) => <AppBackground>{children}</AppBackground>}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.blue,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: {
            fontFamily: typography.fontFamily.medium,
            fontSize: 11,
          },
          tabBarItemStyle: { paddingTop: 6 },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom,
            ...(Platform.OS === 'android' ? { elevation: 8 } : null),
          },
          tabBarBadgeStyle: {
            backgroundColor: colors.badge,
            color: colors.textOnBrand,
            fontFamily: typography.fontFamily.semiBold,
            fontSize: 10,
            minWidth: 17,
            height: 17,
            lineHeight: 13,
          },
        }}
      >
        <Tab.Screen
          name="HomeTab"
          component={HomeDashboardScreen}
          options={{
            title: t('tabs.home'),
            tabBarIcon: ({ color }) => <HomeIcon color={color} />,
          }}
        />

        <Tab.Screen
          name="HealthTab"
          component={RecordsStackNavigator}
          options={{
            // The destination is called "Health Records" everywhere in the app;
            // the tab strip is the one place the full name cannot fit at 11pt,
            // so the label abbreviates while the route keeps the real title.
            title: t('tabs.recordsFull'),
            tabBarLabel: t('tabs.records'),
            tabBarIcon: ({ color }) => <HealthIcon color={color} />,
          }}
        />

        <Tab.Screen
          name="QuickAddTab"
          component={QuickAddNoop}
          options={{
            title: t('quickAdd.title'),
            tabBarButton: (props: BottomTabBarButtonProps) => (
              <QuickAddButton {...props} onPress={() => setQuickAddOpen(true)} />
            ),
          }}
          listeners={{
            tabPress: (e) => {
              // Never focus this tab — it is a button, not a destination.
              e.preventDefault();
              setQuickAddOpen(true);
            },
          }}
        />

        <Tab.Screen
          name="MessagesTab"
          component={MessagesScreen}
          options={{
            title: t('tabs.messages'),
            tabBarIcon: ({ color }) => <MessagesIcon color={color} />,
            tabBarBadge: messages > 0 ? (messages > 99 ? '99+' : messages) : undefined,
          }}
        />

        <Tab.Screen
          name="ProfileTab"
          component={ProfileSettingsScreen}
          options={{
            title: t('tabs.profile'),
            tabBarIcon: ({ color }) => <ProfileIcon color={color} />,
          }}
        />
      </Tab.Navigator>

      <QuickAddSheet visible={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </>
  );
}

/** The raised circular centre button. */
function QuickAddButton({ onPress, accessibilityLabel }: BottomTabBarButtonProps & { onPress?: () => void }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={styles.fabSlot}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? t('quickAdd.title')}
    >
      <View style={styles.fab}>
        <Icon name="plus" size={26} color={colors.textOnBrand} strokeWidth={iconStroke.bold + 0.4} />
      </View>
      <Text style={styles.fabLabel}>{t('quickAdd.title')}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginTop: -18,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.surface,
    ...shadow.fab,
  },
  fabLabel: {
    marginTop: 2,
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    color: colors.textMuted,
  },
});
