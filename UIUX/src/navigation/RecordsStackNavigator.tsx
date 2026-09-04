import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { AllergiesScreen } from '../screens/AllergiesScreen';
import { DiagnosesScreen } from '../screens/DiagnosesScreen';
import { DocumentsScreen } from '../screens/DocumentsScreen';
import { EncounterDetailScreen } from '../screens/EncounterDetailScreen';
import { EncountersScreen } from '../screens/EncountersScreen';
import { ImmunizationsScreen } from '../screens/ImmunizationsScreen';
import { MedicationsScreen } from '../screens/meds/MedicationsScreen';
import { RecordsHubScreen } from '../screens/RecordsHubScreen';
import { TimelineScreen } from '../screens/TimelineScreen';
import { VitalsScreen } from '../screens/VitalsScreen';
import { useTranslation } from '../i18n';
import { colors, typography } from '../theme/theme';
import { AppBackground } from '../components/Watermark';

import { RecordsStackParamList } from './routes';

export type { RecordsStackParamList };

const Stack = createNativeStackNavigator<RecordsStackParamList>();

const headerOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTitleStyle: { fontFamily: typography.fontFamily.semiBold, color: colors.textPrimary },
  headerTintColor: colors.blue,
};

export function RecordsStackNavigator() {
  const { t } = useTranslation();
  return (
    <Stack.Navigator
      screenOptions={headerOptions}
      screenLayout={({ children }) => <AppBackground>{children}</AppBackground>}
    >
      <Stack.Screen name="RecordsHub" component={RecordsHubScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Encounters" component={EncountersScreen} options={{ title: t('records.header.encounters') }} />
      <Stack.Screen name="EncounterDetail" component={EncounterDetailScreen} options={{ title: t('records.header.encounterDetail') }} />
      <Stack.Screen name="Diagnoses" component={DiagnosesScreen} options={{ title: t('records.header.diagnoses') }} />
      {/* MED-001 is the canonical prescriptions screen; it renders its own header. */}
      <Stack.Screen name="Prescriptions" component={MedicationsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Vitals" component={VitalsScreen} options={{ title: t('records.header.vitals') }} />
      <Stack.Screen name="Immunizations" component={ImmunizationsScreen} options={{ title: t('records.header.immunizations') }} />
      <Stack.Screen name="Allergies" component={AllergiesScreen} options={{ title: t('records.header.allergies') }} />
      <Stack.Screen name="Documents" component={DocumentsScreen} options={{ title: t('records.header.documents') }} />
      <Stack.Screen name="Timeline" component={TimelineScreen} options={{ title: t('records.header.timeline') }} />
    </Stack.Navigator>
  );
}
