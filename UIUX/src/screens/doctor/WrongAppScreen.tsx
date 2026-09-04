import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { EmptyState } from '../../components/EmptyState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { colors } from '../../theme/theme';

/**
 * Shown when a signed-in staff account cannot use this app.
 *
 * OPES has staff roles this mobile app deliberately does not serve — a cashier,
 * a lab technician, a pharmacist. Their work lives in the desktop EMR. Before
 * this screen existed, such an account would have signed in and landed on an
 * empty or half-broken clinician tree with no explanation. This says the true
 * thing instead, names the account so they can see they signed in as who they
 * meant to, and gives them the way out.
 *
 * It is also the terminal state of the navigator guard in
 * `DoctorStackNavigator` — anything that reaches the clinician stack without a
 * clinical session lands here rather than on a clinician screen.
 */
export function WrongAppScreen() {
  const { staffUser, logout } = useAuth();
  const { t } = useTranslation();

  return (
    <View style={styles.flex}>
      <ScreenHeader title={t('doctor.wrongApp.header')} />
      <ScrollView contentContainerStyle={styles.body}>
        <EmptyState
          icon="shield"
          tint="amber"
          title={t('doctor.wrongApp.title')}
          message={
            (staffUser ? t('doctor.wrongApp.signedInAs', { name: staffUser.name }) : '') +
            t('doctor.wrongApp.body')
          }
          actionLabel={t('doctor.wrongApp.signOut')}
          onAction={() => {
            void logout();
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  body: { flexGrow: 1, justifyContent: 'center' },
});
