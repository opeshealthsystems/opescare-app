import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../components/Icon';
import { useTranslation } from '../i18n';
import { colors, radii, spacing, Tint, tintMap, typography } from '../theme/theme';
import { AppStackParamList, QUICK_ADD_ACTIONS } from './routes';

export type QuickAddSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** Bottom action sheet opened by the centre FAB in the tab bar. */
export function QuickAddSheet({ visible, onClose }: QuickAddSheetProps) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  function go(routeKey: string) {
    onClose();
    // Every QUICK_ADD_ACTIONS key is a param-optional route on AppStack.
    navigation.navigate(routeKey as never);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
          // Swallow the press so it doesn't reach the backdrop and close the sheet.
          onPress={() => {}}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{t('quickAdd.title')}</Text>

          {QUICK_ADD_ACTIONS.map((a) => {
            const tint = tintMap[a.tint as Tint];
            return (
              <TouchableOpacity
                key={a.key}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => go(a.key)}
              >
                <View style={[styles.circle, { backgroundColor: tint.bg }]}>
                  <Icon name={a.icon as IconName} size={20} color={tint.fg} />
                </View>
                <Text style={styles.rowLabel}>{t(a.labelKey)}</Text>
                <Icon name="chevron-right" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity style={styles.cancel} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,26,92,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  cancel: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  cancelText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.blue,
  },
});
