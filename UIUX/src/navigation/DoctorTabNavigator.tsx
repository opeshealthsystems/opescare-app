import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnread } from '../context/UnreadContext';
import { useTranslation } from '../i18n';
import { colors, iconStroke, typography } from '../theme/theme';
import { Icon, IconName } from '../components/Icon';
import { doctorScreens } from './DoctorStackNavigator';
import { AppBackground } from '../components/Watermark';
import { DoctorTabParamList } from './routes';

const Tab = createBottomTabNavigator<DoctorTabParamList>();

/**
 * Clinician bottom bar.
 *
 *   Schedule  |  Patients  |  Results(badge)  |  Messages(badge)  |  Profile
 *
 * Why these five, and why no centre FAB:
 *
 *  • Schedule is first and is the landing tab, not a "Home" dashboard. A
 *    clinician opens this app between consultations to answer "who is next?" —
 *    a summary screen would put a card in front of the only thing they came for.
 *  • Patients is the search-led route into a chart, the second most common
 *    reason the app is opened (a patient is in front of them, off-schedule).
 *  • Results earns a tab rather than a card because an unacknowledged abnormal
 *    result is the one thing in the product that is time-critical and easy to
 *    lose; it needs a permanent, badgeable home.
 *  • Messages mirrors the patient bar — the same conversations, the other side.
 *  • Profile mirrors the patient bar for sign-out and account.
 *
 * The patient bar's centre FAB has no clinician analogue: a doctor's create
 * actions (order, prescribe, write a note) are meaningless without a patient
 * context, so they belong inside the chart, not floating over every screen.
 * Keeping five slots means the bar has the same rhythm and height as the
 * patient bar — same product, same shape.
 *
 * Styling here is a deliberate copy of `MainTabNavigator`'s `screenOptions`:
 * same tokens, same badge treatment, same heights.
 */

function tabIcon(name: IconName) {
  return function DoctorTabIcon({ color }: { color: string }) {
    return <Icon name={name} size={24} color={color} strokeWidth={iconStroke.bold} />;
  };
}

const ScheduleIcon = tabIcon('calendar');
const PatientsIcon = tabIcon('person-search');
const ResultsIcon = tabIcon('flask');
const DoctorMessagesIcon = tabIcon('chat');
const DoctorProfileIcon = tabIcon('person');

const TAB_BAR_HEIGHT = 62;

export function DoctorTabNavigator() {
  const insets = useSafeAreaInsets();
  const { messages } = useUnread();
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      // Each tab scene gets its OWN opaque page + watermark. The stack that
      // hosts this navigator paints AppBackground once behind the whole tab
      // view, but a bottom-tab navigator keeps every visited scene mounted and
      // stacked — so with the watermark's transparent screen fills, the inactive
      // tabs bled through the active one (all five composited at once) and the
      // seal was buried. Painting the opaque page per-scene restores the
      // pre-watermark behaviour: the focused scene covers the others, and the
      // seal shows on the tab you are actually looking at.
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
        name="ScheduleTab"
        component={doctorScreens.DoctorSchedule}
        options={{ title: t('tabs.schedule'), tabBarIcon: ScheduleIcon }}
      />
      <Tab.Screen
        name="PatientsTab"
        component={doctorScreens.PatientSearch}
        options={{ title: t('tabs.patients'), tabBarIcon: PatientsIcon }}
      />
      <Tab.Screen
        name="ResultsTab"
        component={doctorScreens.ResultsInbox}
        options={{ title: t('tabs.results'), tabBarIcon: ResultsIcon }}
      />
      <Tab.Screen
        name="DoctorMessagesTab"
        component={doctorScreens.DoctorMessages}
        options={{
          title: t('tabs.messages'),
          tabBarIcon: DoctorMessagesIcon,
          tabBarBadge: messages > 0 ? (messages > 99 ? '99+' : messages) : undefined,
        }}
      />
      <Tab.Screen
        name="DoctorProfileTab"
        component={doctorScreens.DoctorProfile}
        options={{ title: t('tabs.profile'), tabBarIcon: DoctorProfileIcon }}
      />
    </Tab.Navigator>
  );
}
