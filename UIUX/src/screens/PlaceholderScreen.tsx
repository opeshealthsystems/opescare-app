import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ScreenHeader';
import { IconName } from '../components/Icon';
import { useTranslation } from '../i18n';
import { colors } from '../theme/theme';

/**
 * Stands in for a route whose screen has not shipped yet.
 *
 * A patient reaches this by tapping a real button on a finished screen, so the
 * copy is written for them: it says plainly that the feature is not ready,
 * points at the clinic as the way to get the thing done today, and gives them a
 * way back. Nothing internal — no ticket codes, no build language — belongs on
 * this screen.
 */
export function createPlaceholderScreen(title: string, icon: IconName = 'document') {
  function PlaceholderScreen() {
    const navigation = useNavigation<any>();
    const { t } = useTranslation();
    return (
      <View style={styles.flex}>
        <ScreenHeader title={title} />
        <ScrollView contentContainerStyle={styles.body}>
          <EmptyState
            icon={icon}
            title={t('placeholder.title', { name: title })}
            message={t('placeholder.body')}
            actionLabel={navigation.canGoBack() ? t('placeholder.goBack') : undefined}
            onAction={navigation.canGoBack() ? () => navigation.goBack() : undefined}
          />
        </ScrollView>
      </View>
    );
  }
  PlaceholderScreen.displayName = `Placeholder(${title})`;
  return PlaceholderScreen;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  body: { flexGrow: 1, justifyContent: 'center' },
});
