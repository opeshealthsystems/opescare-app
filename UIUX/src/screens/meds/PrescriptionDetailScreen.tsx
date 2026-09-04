/**
 * MED-003 — Prescription Detail.
 *
 * The prescription slip as the patient sees it: prescriber, patient and
 * diagnosis, every drug written at that visit, the shared instructions,
 * refills / follow-up, the dispensing pharmacy and the verification banner.
 *
 * Live data: `GET /patient/prescriptions/{id}` — `items` is every prescription
 * written in the same encounter, so a multi-drug slip renders as one card.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchPrescription, type PortalPrescription, type PrescriptionDetail } from '../../api';
import { Card, Icon, ScreenHeader, StatusBadge, useDialog } from '../../components';
import { type TFunction, useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  ActionGrid,
  AsyncBoundary,
  FactCell,
  TintCircle,
  VerifiedBanner,
  clock,
  fmtShortDate,
  formIcon,
  prescriptionStatusLabel,
  routeLabel,
  toDate,
  useAsync,
} from './shared';

export function PrescriptionDetailScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'PrescriptionDetail'>>();
  const id = params.prescriptionId;
  const dialog = useDialog();
  const { t } = useTranslation();

  const explainNoPdf = () =>
    dialog.show({
      title: t('meds.prescription.noPdfTitle'),
      tone: 'info',
      cancelLabel: t('common.close'),
      message: t('meds.prescription.noPdfBody'),
    });

  const load = useCallback(() => fetchPrescription(id), [id]);
  const state = useAsync<PrescriptionDetail>(load, [id]);

  async function share(rx: PrescriptionDetail) {
    try {
      await Share.share({
        message: [
          t('meds.prescription.shareHeading', { reference: rx.reference ?? '' }).trim(),
          rx.prescriber_name
            ? t('meds.prescription.sharePrescribedBy', { name: rx.prescriber_name })
            : '',
          ...rx.items.map((i) => `• ${i.drug_name} — ${[i.dosage, i.frequency].filter(Boolean).join(', ')}`),
          rx.instructions ?? '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } catch {
      // Share sheet dismissed.
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('meds.prescription.title')}
        subtitle={t('meds.prescription.subtitle')}
        actions={[
          {
            icon: 'download',
            accessibilityLabel: t('meds.prescription.downloadA11y'),
            onPress: explainNoPdf,
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
          loadingLabel={t('meds.prescription.loading')}
        >
          {(rx) => (
            <>
              {/* -- Prescriber ------------------------------------------- */}
              <Card>
                <View style={styles.prescriber}>
                  <View style={styles.prescriberLeft}>
                    <TintCircle icon="stethoscope" tint="blue" size={64} />
                    <View style={styles.prescriberBody}>
                      <Text style={styles.prescriberName} numberOfLines={2}>
                        {rx.prescriber_name ?? t('meds.prescription.prescriberMissing')}
                      </Text>
                      {!!rx.prescriber_specialty && <Text style={styles.prescriberMeta}>{rx.prescriber_specialty}</Text>}
                      {!!rx.facility_name && <Text style={styles.prescriberLink}>{rx.facility_name}</Text>}
                    </View>
                  </View>

                  <View style={styles.prescriberAside}>
                    <View style={styles.asideRow}>
                      <Icon name="calendar" size={18} color={colors.blue} />
                      <View style={styles.asideBody}>
                        <Text style={styles.asideLabel}>{t('meds.prescription.prescribedOn')}</Text>
                        <Text style={styles.asideValue}>
                          {`${fmtShortDate(rx.started_at)}  •  ${clock(toDate(rx.started_at))}`}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.asideRow}>
                      <Icon name="document-text" size={18} color={colors.blue} />
                      <View style={styles.asideBody}>
                        <Text style={styles.asideLabel}>{t('meds.prescription.prescriptionId')}</Text>
                        <Text style={styles.asideValueStrong} numberOfLines={1}>
                          {rx.reference ?? '—'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.statusPair}>
                      <Text style={styles.statusKey}>{t('meds.prescription.status')}</Text>
                      <StatusBadge status={rx.status} label={prescriptionStatusLabel(rx.status)} size="sm" />
                    </View>
                  </View>
                </View>
              </Card>

              {/* -- Patient & diagnosis ---------------------------------- */}
              {/* The portal has no standalone diagnosis screen on this stack, so
                  the diagnosis is shown inline rather than as a dead link. */}
              <Card>
                <View style={styles.patientRow}>
                  <TintCircle icon="person" tint="blue" size={48} />
                  <View style={styles.patientBody}>
                    <Text style={styles.asideLabel}>{t('meds.prescription.patient')}</Text>
                    <Text style={styles.patientName} numberOfLines={1}>
                      {rx.patient_name ?? '—'}
                    </Text>
                    {!!rx.patient_reference && (
                      <Text style={styles.prescriberLink}>
                        {t('meds.prescription.patientId', { reference: rx.patient_reference })}
                      </Text>
                    )}
                  </View>
                  <View style={styles.patientDiagnosis}>
                    <Text style={styles.asideLabel}>{t('meds.prescription.diagnosisLabel')}</Text>
                    <Text style={styles.diagnosisText}>
                      {rx.diagnosis ?? rx.purpose ?? t('common.notRecorded')}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* -- Medications ------------------------------------------ */}
              <Card variant="flush">
                <View style={styles.medHead}>
                  <Icon name="pill" size={22} color={colors.blue} />
                  <Text style={styles.medHeadTitle}>
                    {t('meds.prescription.medicationsCount', { count: rx.items.length })}
                  </Text>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Medications')}
                    activeOpacity={0.7}
                    style={styles.medHeadAction}
                    accessibilityRole="button"
                    accessibilityLabel={t('meds.prescription.viewAsList')}
                  >
                    <Text style={styles.medHeadActionText}>{t('meds.prescription.viewAsList')}</Text>
                    <Icon name="list" size={18} color={colors.link} />
                  </TouchableOpacity>
                </View>

                {rx.items.map((item, i) => (
                  <MedicationItem
                    key={item.id}
                    item={item}
                    index={i + 1}
                    t={t}
                    divider={i < rx.items.length - 1}
                    onPress={() => navigation.navigate('MedicationDetail', { medicationId: item.id })}
                  />
                ))}

                <View style={styles.instructions}>
                  <Icon name="clipboard" size={22} color={colors.blue} />
                  <View style={styles.instructionsBody}>
                    <Text style={styles.instructionsTitle}>{t('meds.prescription.instructions')}</Text>
                    <Text style={styles.instructionsText}>
                      {rx.instructions ?? t('meds.prescription.instructionsFallback')}
                    </Text>
                  </View>
                </View>

                <View style={styles.footerFacts}>
                  <FactCell
                    icon="refresh"
                    label={t('meds.prescription.refills')}
                    value={t('meds.prescription.refillsUsed', {
                      used: rx.refills_used,
                      allowed: rx.refills_allowed,
                    })}
                  />
                  <FactCell
                    icon="calendar"
                    label={t('meds.prescription.followUp')}
                    value={fmtShortDate(rx.follow_up_on)}
                    divided
                  />
                </View>
              </Card>

              {/* -- Pharmacy --------------------------------------------- */}
              <Card onPress={() => navigation.navigate('OrderFromPharmacy', { medicationId: rx.id })}>
                <View style={styles.pharmacyRow}>
                  <Icon name="store" size={24} color={colors.blue} />
                  <View style={styles.pharmacyBody}>
                    <Text style={styles.asideLabel}>{t('meds.prescription.pharmacy')}</Text>
                    <Text style={styles.pharmacyName} numberOfLines={2}>
                      {rx.pharmacy_name ?? t('meds.prescription.pharmacyUnassigned')}
                    </Text>
                    {!!rx.pharmacy_phone && (
                      <View style={styles.phoneRow}>
                        <Icon name="phone" size={16} color={colors.link} />
                        <Text style={styles.prescriberLink}>{rx.pharmacy_phone}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.fulfilment}>
                    <Text style={styles.asideLabel}>{t('meds.prescription.fulfilment')}</Text>
                    <StatusBadge
                      status={
                        rx.is_dispensed
                          ? t('meds.prescription.fulfilled')
                          : t('meds.prescription.notFulfilled')
                      }
                      tone={rx.is_dispensed ? 'normal' : 'warning'}
                      size="sm"
                    />
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.textMuted} />
                </View>
              </Card>

              {/* -- Verification ----------------------------------------- */}
              {!!rx.verified_at && (
                <VerifiedBanner
                  title={t('meds.prescription.verifiedTitle')}
                  message={t('meds.prescription.verifiedMessage')}
                  footnote={rx.prescriber_name ?? undefined}
                  action={
                    <StatusBadge
                      status={t('meds.prescription.verifiedBadge')}
                      tone="pending"
                      icon="check-circle"
                      size="sm"
                    />
                  }
                />
              )}

              {/* -- Actions ---------------------------------------------- */}
              <ActionGrid
                columns={3}
                actions={[
                  {
                    icon: 'plus',
                    label: t('meds.prescription.actionAdd'),
                    onPress: () => navigation.navigate('Medications'),
                  },
                  {
                    icon: 'bell',
                    label: t('meds.prescription.actionReminder'),
                    onPress: () =>
                      navigation.navigate('MainTabs', {
                        screen: 'ProfileTab',
                        params: { sheet: 'notifications' },
                      }),
                  },
                  {
                    icon: 'store',
                    label: t('meds.prescription.actionFulfil'),
                    onPress: () => navigation.navigate('OrderFromPharmacy', { medicationId: rx.id }),
                  },
                  {
                    icon: 'download',
                    label: t('meds.prescription.actionDownload'),
                    onPress: explainNoPdf,
                  },
                  { icon: 'share', label: t('meds.prescription.actionShare'), onPress: () => share(rx) },
                ]}
              />
            </>
          )}
        </AsyncBoundary>
      </ScrollView>

      {dialog.element}
    </View>
  );
}

function MedicationItem({
  item,
  index,
  t,
  divider,
  onPress,
}: {
  item: PortalPrescription;
  index: number;
  t: TFunction;
  divider?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      style={[styles.item, divider && styles.itemDivider]}
    >
      <View style={styles.itemHead}>
        <View style={styles.itemIndex}>
          <Text style={styles.itemIndexText}>{index}</Text>
        </View>
        <TintCircle icon={formIcon(item)} tint="blue" size={52} square />
        <View style={styles.itemBody}>
          <Text style={styles.itemName} numberOfLines={2}>
            {[item.drug_name, item.form].filter(Boolean).join(' ')}
          </Text>
          {!!item.purpose && <Text style={styles.itemPurpose}>{item.purpose}</Text>}
        </View>
        {!!item.quantity_label && (
          <View style={styles.quantity}>
            <Text style={styles.quantityText}>{item.quantity_label}</Text>
          </View>
        )}
      </View>

      <View style={styles.itemFacts}>
        <FactCell icon="capsule" label={t('meds.prescription.dose')} value={item.dosage ?? '—'} />
        <FactCell icon="clock" label={t('meds.prescription.frequency')} value={item.frequency ?? '—'} divided />
        <FactCell icon="arrow-up-right" label={t('meds.prescription.route')} value={routeLabel(item.route) || '—'} divided />
        <FactCell icon="calendar" label={t('meds.prescription.duration')} value={item.duration ?? '—'} divided />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  // -- Prescriber ----------------------------------------------------------
  prescriber: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  // On a 320px card the fixed 156px aside would leave the left column ~88px —
  // after the 64px avatar the name gets ~12px and shatters. minWidth forces the
  // aside to wrap below instead; on wide screens both still sit side by side.
  prescriberLeft: { flex: 1, minWidth: 200, flexDirection: 'row', gap: 12 },
  prescriberBody: { flex: 1, minWidth: 0, gap: 2 },
  prescriberName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.md,
    color: colors.textPrimary,
  },
  prescriberMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  prescriberLink: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.link },

  prescriberAside: {
    width: 156,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.divider,
    gap: spacing.sm,
  },
  asideRow: { flexDirection: 'row', gap: 6 },
  asideBody: { flex: 1, minWidth: 0 },
  asideLabel: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },
  asideValue: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.textPrimary },
  asideValueStrong: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
  },
  statusPair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusKey: {
    overflow: 'hidden',
    borderRadius: radii.sm,
    backgroundColor: colors.blue,
    color: colors.textOnBrand,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  // -- Patient -------------------------------------------------------------
  patientRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  patientBody: { flex: 1, minWidth: 0, gap: 1 },
  patientName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  patientDiagnosis: {
    flex: 1.1,
    minWidth: 0,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.divider,
    gap: 2,
  },
  diagnosisText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.link,
  },

  // -- Medications ---------------------------------------------------------
  medHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  medHeadTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.blue,
  },
  medHeadAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  medHeadActionText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.link },

  item: { paddingHorizontal: spacing.md, paddingVertical: 12, gap: 12 },
  itemDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIndexText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textOnBrand,
  },
  itemBody: { flex: 1, minWidth: 0, gap: 2 },
  itemName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  itemPurpose: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.link },
  quantity: {
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quantityText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: colors.link },
  itemFacts: { flexDirection: 'row', alignItems: 'flex-start' },

  instructions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.primarySoft,
  },
  instructionsBody: { flex: 1, minWidth: 0, gap: 2 },
  instructionsTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.blue,
  },
  instructionsText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  footerFacts: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },

  // -- Pharmacy ------------------------------------------------------------
  pharmacyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pharmacyBody: { flex: 1, minWidth: 0, gap: 2 },
  pharmacyName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fulfilment: {
    alignItems: 'flex-start',
    gap: 4,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.divider,
  },
});
