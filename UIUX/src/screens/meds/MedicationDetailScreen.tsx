/**
 * MED-005 — Medication Detail.
 *
 * The full patient view of one prescribed medication: identity, dosage and
 * instructions, related clinical information, refills & adherence, the
 * dispensing source, the verification banner and the action grid.
 *
 * Live data: `GET /patient/prescriptions/{id}`.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { fetchPrescription, type PrescriptionDetail } from '../../api';
import { Card, Icon, ScreenHeader, StatusBadge } from '../../components';
import { useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  ActionGrid,
  AsyncBoundary,
  CardOverline,
  FactCell,
  MedButton,
  MetricRow,
  StackedFact,
  TintCircle,
  VerifiedBanner,
  adherenceLabel,
  fmtShortDate,
  fmtWhen,
  formIcon,
  prescriptionStatusLabel,
  prescriptionTypeLabel,
  routeLabel,
  useAsync,
} from './shared';

export function MedicationDetailScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'MedicationDetail'>>();
  const { t } = useTranslation();
  const id = params.medicationId;

  const load = useCallback(() => fetchPrescription(id), [id]);
  const state = useAsync<PrescriptionDetail>(load, [id]);

  async function share(rx: PrescriptionDetail) {
    try {
      await Share.share({
        message: [
          `${rx.drug_name}${rx.form ? ` (${rx.form})` : ''}`,
          [rx.dosage, rx.frequency, rx.route].filter(Boolean).join(' · '),
          rx.instructions ?? '',
          rx.reference ? t('meds.detail.shareRxId', { reference: rx.reference }) : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } catch {
      // The user dismissed the share sheet — nothing to report.
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('meds.detail.title')}
        subtitle={t('meds.detail.subtitle')}
        actions={[
          {
            icon: 'bell',
            onPress: () => navigation.navigate('Notifications'),
            accessibilityLabel: t('meds.detail.notifications'),
          },
        ]}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={state.loading && state.data !== null} onRefresh={state.reload} tintColor={colors.blue} />
        }
      >
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('meds.detail.loading')}
        >
          {(rx) => {
            const recorded = rx.doses_taken + rx.doses_missed;
            const adherence = recorded > 0 ? Math.round((rx.doses_taken / recorded) * 100) : null;
            const tone = adherenceLabel(adherence, t);

            return (
              <>
                {/* -- Identity ------------------------------------------- */}
                <Card>
                  <View style={styles.identity}>
                    <TintCircle icon={formIcon(rx)} tint="blue" size={72} square />
                    <View style={styles.identityBody}>
                      <Text style={styles.drugName} numberOfLines={2}>
                        {rx.drug_name}
                      </Text>
                      {!!rx.form && <Text style={styles.drugForm}>{rx.form}</Text>}
                      <StatusBadge
                        status={rx.status}
                        label={prescriptionStatusLabel(rx.status)}
                        size="sm"
                        style={styles.identityBadge}
                      />
                    </View>
                    <View style={styles.identityAside}>
                      <Text style={styles.asideLabel}>{t('meds.detail.rxId')}</Text>
                      <Text style={styles.asideValue} numberOfLines={1}>
                        {rx.reference ?? '—'}
                      </Text>
                      <Text style={[styles.asideLabel, styles.asideLabelSpaced]}>
                        {t('meds.detail.prescribedOn')}
                      </Text>
                      <Text style={styles.asideValue}>{fmtShortDate(rx.started_at)}</Text>
                    </View>
                  </View>

                  <View style={styles.identityFacts}>
                    <FactCell
                      icon="person"
                      label={t('meds.detail.prescribedBy')}
                      value={rx.prescriber_name ?? t('common.notRecorded')}
                      valueColor={colors.link}
                      align="center"
                    />
                    <FactCell
                      icon="building"
                      label={t('meds.detail.facility')}
                      value={rx.facility_name ?? t('common.notRecorded')}
                      valueColor={colors.link}
                      align="center"
                      divided
                    />
                    <FactCell
                      icon="document-text"
                      label={t('meds.detail.prescription')}
                      value={rx.reference ?? '—'}
                      valueColor={colors.link}
                      align="center"
                      divided
                    />
                    <FactCell
                      icon="check-circle"
                      label={t('meds.detail.status')}
                      value={prescriptionStatusLabel(rx.status)}
                      valueColor={rx.status === 'active' ? colors.statusNormal : colors.textSecondary}
                      align="center"
                      divided
                    />
                  </View>

                  {!!rx.prescriber_specialty && (
                    <Text style={styles.specialty}>{rx.prescriber_specialty}</Text>
                  )}
                </Card>

                {/* -- Dosage & instructions ------------------------------- */}
                <Card>
                  <CardOverline title={t('meds.detail.dosageOverline')} />
                  <View style={styles.factRow}>
                    <FactCell icon="capsule" label={t('meds.detail.dose')} value={rx.dosage ?? '—'} />
                    <FactCell icon="clock" label={t('meds.detail.frequency')} value={rx.frequency ?? '—'} divided />
                    <FactCell
                      icon="arrow-up-right"
                      label={t('meds.detail.route')}
                      value={routeLabel(rx.route) || '—'}
                      divided
                    />
                    <FactCell icon="calendar" label={t('meds.detail.duration')} value={rx.duration ?? '—'} divided />
                  </View>

                  <View style={[styles.factRow, styles.factRowDivided]}>
                    <FactCell
                      icon="calendar"
                      label={t('meds.detail.startDate')}
                      value={fmtShortDate(rx.starts_on ?? rx.started_at)}
                      valueColor={colors.link}
                    />
                    <FactCell
                      icon="calendar"
                      label={t('meds.detail.endDate')}
                      value={fmtShortDate(rx.ends_on)}
                      valueColor={colors.link}
                      divided
                    />
                  </View>

                  <View style={styles.instructionsRow}>
                    <Icon name="chat" size={18} color={colors.blue} />
                    <View style={styles.instructionsBody}>
                      <Text style={styles.factLabel}>{t('meds.detail.instructions')}</Text>
                      <Text style={styles.instructionsText}>
                        {rx.instructions ?? t('meds.detail.instructionsFallback')}
                      </Text>
                    </View>
                  </View>
                </Card>

                {/* -- Related information / refills ----------------------- */}
                <View style={styles.split}>
                  <Card style={styles.splitCard}>
                    <CardOverline title={t('meds.detail.relatedOverline')} />
                    <StackedFact
                      icon="stethoscope"
                      label={t('meds.detail.reasonDiagnosis')}
                      value={rx.diagnosis ?? rx.purpose ?? t('common.notRecorded')}
                      divider
                    />
                    <StackedFact
                      icon="first-aid"
                      label={t('meds.detail.conditionTreated')}
                      value={rx.condition_treated ?? t('common.notRecorded')}
                      divider
                    />
                    <StackedFact
                      icon="document-text"
                      label={t('meds.detail.prescriberNotes')}
                      value={rx.prescriber_notes ?? t('meds.detail.noNotes')}
                    />
                  </Card>

                  <Card style={styles.splitCard}>
                    <CardOverline title={t('meds.detail.refillsOverline')} />
                    <MetricRow
                      icon="refresh"
                      label={t('meds.detail.refillsRemaining')}
                      value={String(rx.refills_remaining)}
                      divider
                    />
                    <MetricRow
                      icon="shield-check"
                      label={t('meds.detail.adherence')}
                      value={tone.label}
                      valueColor={tone.color}
                      divider
                    />
                    <MetricRow
                      icon="clock"
                      label={t('meds.detail.lastTaken')}
                      value={fmtWhen(rx.last_taken_at, t)}
                      divider
                    />
                    <MetricRow icon="clock" label={t('meds.detail.nextDose')} value={fmtWhen(rx.next_dose_at, t)} />
                  </Card>
                </View>

                {/* -- Source ---------------------------------------------- */}
                <Card>
                  <CardOverline title={t('meds.detail.sourceOverline')} />
                  <View style={styles.factRow}>
                    <FactCell
                      icon="store"
                      label={t('meds.detail.pharmacy')}
                      value={rx.pharmacy_name ?? t('meds.detail.pharmacyUnassigned')}
                      valueColor={colors.link}
                    />
                    <FactCell
                      icon="truck"
                      label={t('meds.detail.fulfilmentStatus')}
                      value={rx.is_dispensed ? t('meds.detail.fulfilled') : t('meds.detail.notFulfilled')}
                      valueColor={rx.is_dispensed ? colors.statusNormal : colors.statusWarning}
                      divided
                    />
                    <FactCell
                      icon="document"
                      label={t('meds.detail.prescriptionType')}
                      value={prescriptionTypeLabel(rx.prescription_type) || '—'}
                      valueColor={colors.link}
                      divided
                    />
                  </View>
                </Card>

                {/* -- Verification ---------------------------------------- */}
                {!!rx.verified_at && (
                  <VerifiedBanner
                    title={t('meds.detail.verifiedTitle')}
                    message={t('meds.detail.verifiedMessage')}
                    footnote={t('meds.detail.verifiedOn', { when: fmtWhen(rx.verified_at, t) })}
                    action={
                      <MedButton
                        label={t('meds.detail.verifyQr')}
                        icon="qr"
                        variant="secondary"
                        size="sm"
                        onPress={() => navigation.navigate('MyHealthId')}
                      />
                    }
                  />
                )}

                {/* -- Actions --------------------------------------------- */}
                <ActionGrid
                  columns={3}
                  actions={[
                    {
                      icon: 'plus',
                      label: t('meds.detail.actionAdd'),
                      onPress: () => navigation.navigate('Medications'),
                    },
                    {
                      icon: 'bell',
                      label: t('meds.detail.actionReminder'),
                      onPress: () =>
                        navigation.navigate('MainTabs', {
                          screen: 'ProfileTab',
                          params: { sheet: 'notifications' },
                        }),
                    },
                    {
                      icon: 'refresh',
                      label: t('meds.detail.actionRefill'),
                      onPress: () => navigation.navigate('RequestRefill', { medicationId: rx.id }),
                    },
                    {
                      icon: 'store',
                      label: t('meds.detail.actionFindPharmacy'),
                      onPress: () =>
                        navigation.navigate('FindFacility', { query: t('meds.detail.findPharmacyQuery') }),
                    },
                    {
                      icon: 'clock',
                      label: t('meds.detail.actionHistory'),
                      onPress: () => navigation.navigate('PrescriptionDetail', { prescriptionId: rx.id }),
                    },
                    { icon: 'share', label: t('meds.detail.actionShare'), onPress: () => share(rx) },
                  ]}
                />

                {rx.doses_remaining === 0 && rx.status === 'active' && (
                  <Text style={styles.footnote}>{t('meds.detail.allDosesRecorded')}</Text>
                )}
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  identity: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 },
  // At 320px the 72px badge + 122px aside would crush the drug name into ~38px.
  // A minWidth on the body drops the aside to its own line on narrow screens;
  // wider screens keep badge, name and aside on one row.
  identityBody: { flex: 1, minWidth: 160, gap: 2 },
  identityBadge: { alignSelf: 'flex-start', marginTop: 4 },
  drugName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    lineHeight: typography.lineHeight.lg,
    color: colors.textPrimary,
  },
  drugForm: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  identityAside: {
    width: 122,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.divider,
    gap: 1,
  },
  asideLabel: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },
  asideLabelSpaced: { marginTop: spacing.sm },
  asideValue: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },

  identityFacts: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  specialty: {
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  factRow: { flexDirection: 'row', alignItems: 'flex-start' },
  factRowDivided: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  factLabel: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },

  instructionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  instructionsBody: { flex: 1, minWidth: 0, gap: 2 },
  instructionsText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  split: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'stretch' },
  splitCard: { flex: 1, minWidth: 0 },

  footnote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
