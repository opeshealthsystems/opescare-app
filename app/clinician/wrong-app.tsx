/**
 * Doctor — "this is the clinician area" (`/clinician/wrong-app`).
 *
 * Port of design reference `src/screens/doctor/WrongAppScreen.tsx` (archived prototype, see docs/DESIGN_REFERENCE.md).
 *
 * Two jobs, one screen:
 *
 *  1. THE TERMINAL STATE OF THE GATE. `app/clinician/_layout.tsx` renders this
 *     component INSTEAD of the clinician tabs whenever the session is not a
 *     clinician one, so a `/clinician/…` URL typed, deep-linked or restored
 *     from history lands here rather than on a half-built clinician screen
 *     firing requests the server will refuse.
 *  2. AN HONEST ANSWER. OpesCare has roles this app deliberately does not
 *     serve — a cashier, a lab technician, a pharmacist — whose work lives on
 *     a workstation. And today NO account reaches the clinician area at all:
 *     the finder mints only patient tokens (see `lib/store/auth.ts`). Saying
 *     that plainly beats an empty screen with no explanation.
 *
 * The way out is the patient app's home tab, which is the app this account
 * genuinely has. `router.replace` rather than `push`: this screen is a
 * dead end, not a step, and must not sit under the patient app in the
 * back stack.
 *
 * i18n: `opesDoctor.*` is being migrated into the app locales. Every string
 * carries a `defaultValue` so this reads correctly before the keys land and
 * picks the catalogue up the moment they do. Locale files are not edited here.
 */
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, ScreenHeader, spacing, useTheme, type Palette } from '@/components/opes-ui';
import { PATIENT_HOME } from '@/components/doctor/chartRoutes';
import { useAuthStore } from '@/lib/store/auth';

export function WrongAppScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const patient = useAuthStore((s) => s.patient);

  const signedInAs = patient?.display_name
    ? t('opesDoctor.wrongApp.signedInAs', {
        defaultValue: 'You are signed in as {{name}}. ',
        name: patient.display_name,
      })
    : '';

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={t('opesDoctor.wrongApp.header', { defaultValue: 'Clinician area' })}
        showBack={false}
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View>
          <EmptyState
            icon="shield"
            tint="amber"
            title={t('opesDoctor.wrongApp.title', {
              defaultValue: 'This is the clinician area',
            })}
            message={
              signedInAs +
              t('opesDoctor.wrongApp.body', {
                defaultValue:
                  'Schedules, patient charts and the results inbox are for clinician accounts, and this account is not one. Nothing is missing from your app — this part of it is simply not yours.',
              })
            }
            actionLabel={t('opesDoctor.wrongApp.goHome', { defaultValue: 'Go to my app' })}
            actionHint={t('opesDoctor.wrongApp.goHomeHint', {
              defaultValue: 'Opens the home tab of the patient app',
            })}
            onAction={() => router.replace(PATIENT_HOME)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default WrongAppScreen;

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    body: { flexGrow: 1, justifyContent: 'center', padding: spacing.md },
  });
