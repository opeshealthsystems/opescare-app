/**
 * The OPES bottom tab bar (design reference DESIGN_SPEC.md (archived prototype, see docs/DESIGN_REFERENCE.md) §11) with the raised Quick-Add
 * FAB in the centre slot:
 *
 *     Home   |   Health ID   |   ( + )   |   Messages•   |   Profile
 *
 * Rendered through expo-router's `<Tabs tabBar={…}>` so the four real tabs keep
 * stock React Navigation semantics (`tabPress` emitted with
 * `canPreventDefault`, then `navigate`), while the centre slot is pure chrome —
 * NOT a route. It never enters navigation state, so there is no phantom
 * `/quick-add` URL on the web build; it just opens `<QuickAddSheet />`.
 *
 * `slots` is the explicit, ordered list of route names to show, with
 * `QUICK_ADD_SLOT` marking the FAB. Routes not listed (e.g. `records`, which
 * is `href: null` in the layout) stay navigable but never get a bar item — we
 * do not depend on expo-router's internal `tabBarItemStyle` marker for that.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import {
  Icon,
  iconStroke,
  radii,
  shadow,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { useAuthStore } from '@/lib/store/auth';
import { useMessageThreads } from '@/lib/api/queries';
import { countUnreadThreads } from '@/lib/api/messagingQueries';
import { QuickAddSheet } from './QuickAddSheet';

/** Sentinel for the centre FAB position inside `slots`. */
export const QUICK_ADD_SLOT = '__quick_add__';

/** Bar height excluding the safe-area inset (§11). */
const BAR_HEIGHT = 62;
const ICON_SIZE = 24;
const FAB_SIZE = 52;
const FAB_RING = 4;
const FAB_ICON = 26;
/** How far the FAB breaks the bar's top edge (§11). */
const FAB_LIFT = -18;
const BADGE_MAX = 99;

export type OpesTabBarProps = BottomTabBarProps & {
  /** Ordered route names, with `QUICK_ADD_SLOT` where the FAB goes. */
  slots: readonly string[];
  /** Optional badge node per route name (e.g. `{ messages: <UnreadThreadsBadge /> }`). */
  badges?: Partial<Record<string, React.ReactNode>>;
};

export function OpesTabBar({ state, descriptors, navigation, insets, slots, badges }: OpesTabBarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const focusedName = state.routes[state.index]?.name;

  return (
    <>
      <View
        style={[styles.bar, { height: BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}
        accessibilityRole="tablist"
      >
        {slots.map((slot) => {
          if (slot === QUICK_ADD_SLOT) {
            return (
              <QuickAddFab
                key={slot}
                label={t('opesCore.tabs.quickAdd')}
                onPress={() => setQuickAddOpen(true)}
                styles={styles}
                colors={colors}
              />
            );
          }

          const route = state.routes.find((r) => r.name === slot);
          if (!route) return null;
          const { options } = descriptors[route.key];
          const focused = route.name === focusedName;
          const tint = focused ? colors.blue : colors.textMuted;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.item}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              testID={options.tabBarButtonTestID}
            >
              <View style={styles.iconWrap}>
                {options.tabBarIcon ? (
                  options.tabBarIcon({ focused, color: tint, size: ICON_SIZE })
                ) : (
                  <Icon name="grid" size={ICON_SIZE} color={tint} strokeWidth={iconStroke.bold} />
                )}
                {badges?.[route.name] ?? null}
              </View>
              <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <QuickAddSheet visible={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </>
  );
}

function QuickAddFab({
  label,
  onPress,
  styles,
  colors,
}: {
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.fabSlot}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {({ pressed }) => (
        <>
          <View style={styles.fabRing}>
            <View style={[styles.fab, pressed && styles.fabPressed]}>
              <Icon name="plus" size={FAB_ICON} color={colors.textOnBrand} strokeWidth={iconStroke.bold} />
            </View>
          </View>
          <Text style={[styles.label, styles.fabLabel]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Unread-message count for the Messages slot, sourced exactly the way the
 * Messages tab derives its own header count: `countUnreadThreads` over
 * `useMessageThreads()` (thread-level `unread` flag — no per-message read
 * state exists). Gated on auth by conditional mounting because the hook has
 * no `enabled` param, so it can never fire a pre-auth 401 into the refresh
 * interceptor. Renders nothing at 0.
 */
export function UnreadThreadsBadge() {
  const authed = useAuthStore((s) => s.status === 'authenticated');
  return authed ? <UnreadThreadsBadgeInner /> : null;
}

function UnreadThreadsBadgeInner() {
  const { data } = useMessageThreads();
  const count = useMemo(() => (data ? countUnreadThreads(data) : 0), [data]);
  return <TabBadge count={count} />;
}

/** The red count bubble from §11: `colors.badge`, white 10px semiBold. */
export function TabBadge({ count, max = BADGE_MAX }: { count: number; max?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <View
      style={[styles.badge, text.length > 1 && styles.badgeWide]}
      accessibilityRole="text"
      accessibilityLabel={`${count} ${t('messages.unreadLabel')}`}
    >
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      // The FAB breaks the top edge; nothing here may clip it.
      overflow: 'visible',
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 9,
      gap: 3,
    },
    iconWrap: {
      width: ICON_SIZE + 12,
      height: ICON_SIZE + 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center',
    },

    fabSlot: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-start',
      overflow: 'visible',
    },
    fabRing: {
      width: FAB_SIZE + FAB_RING * 2,
      height: FAB_SIZE + FAB_RING * 2,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: FAB_LIFT,
    },
    fab: {
      width: FAB_SIZE,
      height: FAB_SIZE,
      borderRadius: radii.pill,
      backgroundColor: colors.blue,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow.fab,
      // Keep the glow on-brand for whichever palette is active.
      shadowColor: colors.blue,
    },
    fabPressed: { opacity: 0.85 },
    fabLabel: { color: colors.textMuted, marginTop: 2 },

    badge: {
      position: 'absolute',
      top: -4,
      right: -2,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: radii.pill,
      backgroundColor: colors.badge,
      borderWidth: 1.5,
      borderColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeWide: { minWidth: 22 },
    badgeText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 10,
      lineHeight: 12,
      color: colors.textOnBrand,
    },
  });
