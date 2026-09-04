/**
 * Patient lookup — the doctor's way into a chart.
 *
 * Reads `GET /patients?q=` and nothing else. That endpoint is the server's own
 * bounded, indexed search over name, medical_id and phone
 * (`PatientService::list`), which is exactly the question a doctor asks: "the
 * Nkomo who came in on Tuesday", "EMR-2026-00001".
 *
 * What this screen deliberately does NOT do is list the patient population. An
 * empty `q` would make the server return every patient newest-first, and a
 * scrollable directory of everyone who has ever attended is a privacy surface
 * with no clinical use. So the query is required, minimum two characters, and
 * before that the screen shows a prompt instead of rows.
 *
 * Search is debounced and last-write-wins: `useAsync` re-runs on the debounced
 * term and cancels the previous result, so a fast typist cannot end up looking
 * at the rows for a prefix they have already moved past.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { searchPatients, type ChartPatient } from '../../api/doctorChart';
import { Card, EmptyState, ListRow, ScreenHeader, StatusBadge } from '../../components';
import { useTranslation } from '../../i18n';
import { colors, spacing, typography } from '../../theme/theme';
import { SearchField, useAsync } from '../care/shared';
import { ChartBoundary, sexLabel } from './chartShared';
import type { DoctorStackParamList } from './chartRoutes';

/** Below this, the server would be answering a question nobody asked. */
const MIN_QUERY = 2;
const DEBOUNCE_MS = 350;
const PER_PAGE = 25;

type Nav = NativeStackNavigationProp<DoctorStackParamList, 'PatientSearch'>;
type Rt = RouteProp<DoctorStackParamList, 'PatientSearch'>;

type SearchResult = { patients: ChartPatient[]; total: number };

export function PatientSearchScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  // `query` lets another screen (or a deep link) hand this screen a term to
  // start from — e.g. jumping here from a result that names a patient.
  const initial = useRoute<Rt>().params?.query ?? '';
  const [term, setTerm] = useState(initial);
  const [debounced, setDebounced] = useState(initial.trim());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [term]);

  const ready = debounced.length >= MIN_QUERY;

  const state = useAsync<SearchResult>(async () => {
    // `useAsync` runs on mount regardless, so the "no query yet" case is
    // answered locally instead of firing an unbounded list request.
    if (!ready) return { patients: [], total: 0 };
    const page = await searchPatients({ q: debounced, per_page: PER_PAGE });
    return { patients: page.data, total: page.meta?.pagination?.total ?? page.data.length };
  }, [debounced, ready]);

  return (
    <View style={styles.flex}>
      <ScreenHeader title={t('doctor.search.title')} showBack={false} />

      <View style={styles.searchWrap}>
        <SearchField
          value={term}
          onChangeText={setTerm}
          placeholder={t('doctor.search.placeholder')}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!ready ? (
          <EmptyState
            icon="person-search"
            tint="blue"
            title={t('doctor.search.promptTitle')}
            message={
              term.length > 0
                ? t('doctor.search.promptShort', { min: MIN_QUERY })
                : t('doctor.search.promptBody')
            }
          />
        ) : (
          <ChartBoundary<SearchResult>
            state={state}
            loadingLabel={t('doctor.search.searching')}
            isEmpty={(d) => d.patients.length === 0}
            empty={
              <EmptyState
                icon="person-search"
                tint="amber"
                title={t('doctor.search.noMatchTitle')}
                message={t('doctor.search.noMatchBody', { query: debounced })}
              />
            }
          >
            {(data) => (
              <>
                <Text style={styles.count}>
                  {data.total > data.patients.length
                    ? t('doctor.search.showingSome', {
                        shown: data.patients.length,
                        total: data.total,
                      })
                    : t('doctor.search.matches', { count: data.total })}
                </Text>

                <Card variant="flush">
                  {data.patients.map((p, i) => (
                    <PatientRow
                      key={p.id}
                      patient={p}
                      divider={i < data.patients.length - 1}
                      onPress={() => navigation.navigate('PatientChart', { patientId: p.id })}
                    />
                  ))}
                </Card>
              </>
            )}
          </ChartBoundary>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * One search result.
 *
 * The allergy marker is the server's own `has_allergies` flag, shown here so a
 * doctor can see there is something to read before opening the chart. It is a
 * pointer, not a summary — the chart itself loads the actual allergy list, and
 * the ABSENCE of this marker is never presented as "no allergies".
 */
function PatientRow({
  patient,
  divider,
  onPress,
}: {
  patient: ChartPatient;
  divider: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const age = patient.age !== null ? t('doctor.search.years', { count: patient.age }) : null;

  return (
    <ListRow
      icon="person"
      tint={patient.has_allergies ? 'red' : 'blue'}
      title={patient.name}
      meta={[patient.medical_id, age, patient.sex ? sexLabel(patient.sex) : null]}
      trailing={
        patient.has_allergies ? (
          <StatusBadge status={t('doctor.search.allergiesBadge')} tone="critical" icon="alert-triangle" size="sm" />
        ) : undefined
      }
      onPress={onPress}
      divider={divider}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  searchWrap: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md - 4,
  },
  body: { padding: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.xl },
  count: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
