/**
 * Quick-Add bottom sheet — opened by the raised centre FAB in the OPES tab bar
 * (UIUX/DESIGN_SPEC.md §11). Lists the Finder's core actions as kit `ListRow`s
 * and pushes the matching route.
 *
 * Built from RN `Modal` + `Animated` only (no new dependencies) so it behaves
 * identically on iOS, Android and the react-native-web build served at /app.
 * Sheet chrome per the kit: `radii.lg` top corners, `colors.surface`, a grab
 * handle, a title, a scrim derived from the active palette, and dismissal on
 * scrim tap, hardware back and (web) Escape via `onRequestClose`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  ListRow,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type Tint,
} from '@/components/opes-ui';

export type QuickAddSheetProps = {
  visible: boolean;
  onClose: () => void;
};

type QuickAction = {
  key: string;
  icon: IconName;
  tint: Tint;
  title: string;
  subtitle?: string;
  href: Href;
};

/** Native driver has no counterpart in react-native-web; gate it or RNW warns on every run. */
const NATIVE_DRIVER = Platform.OS !== 'web';
/** Fallback slide distance until the sheet has reported its own height. */
const FALLBACK_TRAVEL = 480;

/**
 * `#RRGGBB` → `rgba(r,g,b,a)`. The kit palette has no `overlay` token, so the
 * scrim is derived from the palette's `navy` rather than hardcoded — it follows
 * a palette switch like every other colour on the sheet.
 */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function QuickAddSheet({ visible, onClose }: QuickAddSheetProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Kept mounted through the close animation, then unmounted.
  const [mounted, setMounted] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: NATIVE_DRIVER,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, progress]);

  const actions = useMemo<QuickAction[]>(
    () => [
      {
        key: 'facility',
        icon: 'building',
        tint: 'blue',
        // No existing "find a facility" key — reported in the hand-off.
        title: t('opesCore.quickAdd.findFacility', { defaultValue: 'Find a facility' }),
        subtitle: t('careMap.subtitle'),
        href: '/care-map',
      },
      {
        key: 'doctor',
        icon: 'stethoscope',
        tint: 'purple',
        // No existing "find a doctor" key — reported in the hand-off.
        title: t('opesCore.quickAdd.findDoctor', { defaultValue: 'Find a doctor' }),
        subtitle: t('opesCare.findProvider.searchPlaceholder'),
        // Route is being built by another agent; linked by path only.
        href: '/doctors',
      },
      {
        key: 'appointment',
        icon: 'calendar-plus',
        tint: 'blue',
        title: t('opesCore.quickAdd.bookAppointment'),
        subtitle: t('appointments.ctaBody'),
        href: '/appointments/book',
      },
      {
        key: 'blood',
        icon: 'droplet',
        tint: 'red',
        title: t('home.quickActions.findBlood'),
        subtitle: t('bloodFinder.subtitle'),
        href: '/blood-finder',
      },
      {
        key: 'medicine',
        icon: 'pill',
        tint: 'green',
        title: t('prescriptions.findMedicine'),
        subtitle: t('pharmacy.subtitle'),
        href: '/pharmacy',
      },
      {
        key: 'records',
        icon: 'folder',
        tint: 'blue',
        title: t('home.quickActions.healthRecords'),
        subtitle: t('records.subtitle'),
        href: '/(tabs)/records',
      },
    ],
    [t],
  );

  const go = useCallback(
    (href: Href) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  if (!mounted) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight || FALLBACK_TRAVEL, 0],
  });

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('opesCore.common.close')}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + spacing.md, transform: [{ translateY }] },
          ]}
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
          accessibilityViewIsModal
        >
          <View style={styles.grab} />
          <Text style={styles.title} accessibilityRole="header">
            {t('opesCore.quickAdd.title')}
          </Text>

          <View style={styles.list}>
            {actions.map((action, index) => (
              <ListRow
                key={action.key}
                icon={action.icon}
                tint={action.tint}
                title={action.title}
                subtitle={action.subtitle}
                onPress={() => go(action.href)}
                divider={index < actions.length - 1}
              />
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    scrim: { backgroundColor: withAlpha(colors.navy, 0.45) },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingTop: spacing.sm,
      // Sheets sit on the page, so the hairline is the card border, not a shadow.
      borderTopWidth: 1,
      borderColor: colors.border,
      maxHeight: '86%',
    },
    grab: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: radii.pill,
      backgroundColor: colors.border,
      marginBottom: spacing.sm,
    },
    title: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textPrimary,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xs,
    },
    list: {
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
  });
