import { useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EncounterDetail, fetchEncounterDetail } from '../api/clinical';
import { Card, DetailRow } from '../components/DataListScreen';
import { StatusBadge } from '../components/StatusBadge';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme/theme';
import { formatDate, formatLabel } from '../utils/format';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function EncounterDetailScreen() {
  const route = useRoute<any>();
  const { t } = useTranslation();
  const { id } = route.params as { id: string };
  const [encounter, setEncounter] = useState<EncounterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setEncounter(await fetchEncounterDetail(id));
      } catch {
        setError(t('records.encounter.loadFailed'));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, t]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.blue} />
      </View>
    );
  }

  if (error || !encounter) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? t('records.encounter.notFound')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{formatLabel(encounter.encounter_type)}</Text>
        <StatusBadge status={encounter.status} />
      </View>
      <Text style={styles.date}>{formatDate(encounter.encounter_date)}</Text>
      {!!encounter.doctor_name && (
        <Text style={styles.meta}>
          {t('records.encounters.seenBy', { name: encounter.doctor_name })}
        </Text>
      )}

      <Card>
        <SectionTitle>{t('records.encounter.summary')}</SectionTitle>
        <DetailRow label={t('records.encounter.chiefComplaint')} value={encounter.chief_complaint} />
        <DetailRow label={t('records.encounter.assessment')} value={encounter.assessment} />
        <DetailRow label={t('records.encounter.plan')} value={encounter.plan} />
        <DetailRow label={t('records.encounter.dischargeNote')} value={encounter.discharge_note} />
        <DetailRow
          label={t('records.encounter.followUpDate')}
          value={encounter.follow_up_date ? formatDate(encounter.follow_up_date) : null}
        />
      </Card>

      {(!!encounter.subjective || !!encounter.objective) && (
        <Card>
          <SectionTitle>{t('records.encounter.clinicalNotes')}</SectionTitle>
          <DetailRow label={t('records.encounter.subjective')} value={encounter.subjective} />
          <DetailRow label={t('records.encounter.objective')} value={encounter.objective} />
        </Card>
      )}

      {encounter.vitals && (
        <Card>
          <SectionTitle>{t('records.encounter.vitals')}</SectionTitle>
          <DetailRow
            label={t('records.vitals.bloodPressure')}
            value={
              encounter.vitals.bp_systolic && encounter.vitals.bp_diastolic
                ? `${encounter.vitals.bp_systolic}/${encounter.vitals.bp_diastolic} mmHg`
                : null
            }
          />
          <DetailRow
            label={t('records.vitals.temperature')}
            value={encounter.vitals.temperature ? `${encounter.vitals.temperature} °C` : null}
          />
          <DetailRow
            label={t('records.vitals.pulse')}
            value={
              encounter.vitals.pulse ? `${encounter.vitals.pulse} ${t('records.vitals.unitBpm')}` : null
            }
          />
          <DetailRow
            label={t('records.vitals.breathingRate')}
            value={encounter.vitals.respiratory_rate}
          />
          <DetailRow label="SpO2" value={encounter.vitals.spo2 ? `${encounter.vitals.spo2}%` : null} />
          <DetailRow
            label={t('records.vitals.weight')}
            value={encounter.vitals.weight ? `${encounter.vitals.weight} kg` : null}
          />
          <DetailRow
            label={t('records.encounter.height')}
            value={encounter.vitals.height ? `${encounter.vitals.height} cm` : null}
          />
          <DetailRow label={t('records.vitals.bmi')} value={encounter.vitals.bmi} />
        </Card>
      )}

      {encounter.diagnoses.length > 0 && (
        <Card>
          <SectionTitle>{t('records.encounter.diagnoses')}</SectionTitle>
          {encounter.diagnoses.map((d) => (
            <View key={d.id} style={styles.subItem}>
              <Text style={styles.subItemTitle}>
                {d.icd10_description || t('records.diagnoses.codeOnly', { code: d.icd10_code })}
              </Text>
              {!!d.notes && <Text style={styles.subItemBody}>{d.notes}</Text>}
              {!!d.icd10_code && !!d.icd10_description && (
                <Text style={styles.subItemMeta}>
                  {t('records.diagnoses.icdCode', { code: d.icd10_code })}
                </Text>
              )}
            </View>
          ))}
        </Card>
      )}

      {encounter.prescriptions.length > 0 && (
        <Card>
          <SectionTitle>{t('records.encounter.prescriptions')}</SectionTitle>
          {encounter.prescriptions.map((p) => (
            <View key={p.id} style={styles.subItem}>
              <View style={styles.subItemRow}>
                <Text style={styles.subItemTitle}>{p.drug_name}</Text>
                <StatusBadge status={p.status} />
              </View>
              <Text style={styles.subItemBody}>
                {[p.dosage, p.route, p.frequency, p.duration].filter(Boolean).join(' · ')}
              </Text>
              {!!p.instructions && <Text style={styles.subItemBody}>{p.instructions}</Text>}
            </View>
          ))}
        </Card>
      )}

      {encounter.clinical_orders.length > 0 && (
        <Card>
          <SectionTitle>{t('records.encounter.ordersResults')}</SectionTitle>
          {encounter.clinical_orders.map((o) => (
            <View key={o.id} style={styles.subItem}>
              <View style={styles.subItemRow}>
                <Text style={styles.subItemTitle}>{o.name}</Text>
                <StatusBadge status={o.status} />
              </View>
              {!!o.result_summary && <Text style={styles.subItemBody}>{o.result_summary}</Text>}
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  errorText: { fontFamily: typography.fontFamily.regular, color: colors.textMuted },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.lg, color: colors.textPrimary },
  date: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.blue, marginTop: 4 },
  meta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary, marginBottom: spacing.md },
  sectionTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.textPrimary, marginBottom: 8 },
  subItem: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  subItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subItemTitle: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.textPrimary },
  subItemBody: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary, marginTop: 2 },
  subItemMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted, marginTop: 4 },
});
