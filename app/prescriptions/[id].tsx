import { useMemo } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  ScreenHeader,
  StatusBadge,
  a11yJoin,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { Screen } from '../../components/ui/Screen';
import { useAuthStore } from '../../lib/store/auth';
import {
  usePrescriptionDetail,
  type PrescriptionDetail,
  type PrescriptionItemDetail,
} from '../../lib/api/queries';
import { useCatalogMedicineMatch } from '../../lib/api/prescriptionQueries';
import { formatXaf } from '../../lib/api/pharmacyQueries';
import {
  EXPIRY_WARNING_WINDOW_DAYS,
  daysUntil,
  referenceCode,
  statusLabelKey,
} from '../../components/prescriptions/status';
import {
  ActionGrid,
  FactCell,
  LoadingBlock,
  MetricRow,
  TintCircle,
  VerifiedBanner,
  fmtShortDate,
  formIcon,
  prescriptionTone,
  routeLabel,
} from '../../components/meds/shared';

/**
 * One prescription in full — issuing facility, dates, and every medication with
 * its dosage instructions.
 *
 * MED-003 layout on the existing data layer: the issuer hero card (facility,
 * reference, prescribed-on / ID `FactCell`s, status, expiry, patient line),
 * a `MetricRow` card for the key dates, one flush card holding the numbered
 * medications with their dosage grid and per-line dispense `StatusBadge`,
 * the shared instructions block, the safety banner and the action grid.
 *
 * Dosage is the one thing on this screen that must never be ambiguous, so
 * dose and frequency lead the grid and a missing value reads "Not specified"
 * rather than a dash that could be mistaken for a zero.
 *
 * Two things the OPES reference shows that this API cannot supply, and which
 * are therefore absent rather than invented: the prescriber (the mobile
 * endpoint returns the facility only) and the diagnosis. There is likewise no
 * refill action, because the mobile API has no refill route, and no PDF —
 * the download action says so instead of pretending.
 */

export default function PrescriptionDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  // The reference prints a patient identity line above the medications, and a
  // pharmacist checking this at the counter needs it. It is read from the auth
  // store the session already holds — no extra request, and nothing here that
  // the signed-in patient does not already own.
  const patient = useAuthStore((s) => s.patient);

  const { data: prescription, isLoading, isError, isFetching, refetch } = usePrescriptionDetail(id);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/prescriptions'));

  const explainNoPdf = () =>
    dialog.show({
      title: t('opesMeds.prescription.noPdfTitle'),
      tone: 'info',
      cancelLabel: t('opesUi.components.close'),
      message: t('opesMeds.prescription.noPdfBody'),
    });

  async function share(rx: PrescriptionDetail) {
    const message = [
      t('opesMeds.prescription.shareHeading', { reference: referenceCode(rx.id) }),
      rx.facility_name ? `${t('prescriptions.issuedBy')}: ${rx.facility_name}` : '',
      ...rx.items.map((item) => {
        const how = [item.dose, item.frequency].filter(Boolean).join(', ');
        return `• ${item.drug_name}${how ? ` — ${how}` : ''}`;
      }),
      rx.notes ?? '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await Share.share({ message });
    } catch {
      // Share sheet dismissed, or no share target on this platform (web).
    }
  }

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('prescriptions.detailTitle')}
        subtitle={t('opesMeds.prescription.subtitle')}
        onBack={goBack}
        actions={[
          {
            icon: 'download',
            accessibilityLabel: t('opesMeds.prescription.downloadA11y'),
            onPress: explainNoPdf,
          },
        ]}
      />

      {isLoading ? (
        <LoadingBlock label={t('opesMeds.prescription.loading')} />
      ) : isError || !prescription ? (
        <View style={styles.content}>
          <Card>
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={isError ? t('prescriptions.detailLoadError') : t('prescriptions.notFound')}
              actionLabel={isError ? t('prescriptions.retry') : undefined}
              onAction={isError ? () => refetch() : undefined}
            />
          </Card>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={() => refetch()}
              tintColor={colors.blue}
            />
          }
        >
          <IssuerCard
            prescription={prescription}
            patient={patient ? { name: patient.display_name, healthId: patient.health_id } : null}
          />

          {/* Key dates. The facility is deliberately not repeated here — the
              card above already carries it as the prescription's attribution. */}
          <Card>
            <MetricRow
              icon="calendar"
              label={t('prescriptions.prescribedAt')}
              value={
                prescription.prescribed_at
                  ? fmtShortDate(prescription.prescribed_at)
                  : t('prescriptions.notRecorded')
              }
              divider
            />
            {prescription.dispensed_at ? (
              <MetricRow
                icon="check-circle"
                label={t('prescriptions.dispensedAt')}
                value={fmtShortDate(prescription.dispensed_at)}
                valueColor={colors.statusNormal}
                divider
              />
            ) : null}
            <MetricRow
              icon="clock"
              label={t('prescriptions.expiresAt')}
              value={
                prescription.expires_at
                  ? fmtShortDate(prescription.expires_at)
                  : t('prescriptions.noExpiry')
              }
            />
          </Card>

          {/* Medications */}
          <Card variant="flush">
            <View style={styles.medHead}>
              <Icon name="pill" size={22} color={colors.blue} />
              <Text style={styles.medHeadTitle} accessibilityRole="header">
                {t('opesMeds.prescription.medicationsCount', { count: prescription.items.length })}
              </Text>
            </View>

            {prescription.items.length === 0 ? (
              <EmptyState icon="pill" tint="blue" title={t('prescriptions.noMedications')} />
            ) : (
              prescription.items.map((item, index) => (
                <MedicationItem
                  key={item.id}
                  item={item}
                  index={index + 1}
                  divider={index < prescription.items.length - 1}
                />
              ))
            )}

            {/* Notes from the care team, or the standing instruction when the
                prescription carries none. */}
            <View style={styles.instructions}>
              <Icon name="clipboard" size={22} color={colors.blue} />
              <View style={styles.instructionsBody}>
                <Text style={styles.instructionsTitle}>
                  {prescription.notes
                    ? t('prescriptions.notes')
                    : t('opesMeds.prescription.instructions')}
                </Text>
                <Text style={styles.instructionsText}>
                  {prescription.notes ?? t('opesMeds.prescription.instructionsFallback')}
                </Text>
              </View>
            </View>
          </Card>

          {/* "Important" callout — carried over from the reference verbatim in
              intent: this is the one message that must survive any redesign. */}
          <VerifiedBanner
            icon="shield-check"
            title={t('prescriptions.safetyTitle')}
            message={t('prescriptions.safetyBody')}
          />

          <ActionGrid
            columns={3}
            actions={[
              {
                icon: 'store',
                label: t('opesMeds.prescription.actionFulfil'),
                onPress: () => router.push('/pharmacy'),
              },
              {
                icon: 'download',
                label: t('opesMeds.prescription.actionDownload'),
                onPress: explainNoPdf,
              },
              {
                icon: 'share',
                label: t('opesMeds.prescription.actionShare'),
                onPress: () => share(prescription),
              },
            ]}
          />
        </ScrollView>
      )}

      {dialog.element}
    </Screen>
  );
}

/* -- Pieces ---------------------------------------------------------------- */

/**
 * Issuing facility + status. The facility is the only attribution the mobile
 * API returns — there is no prescriber name to show.
 */
function IssuerCard({
  prescription,
  patient,
}: {
  prescription: PrescriptionDetail;
  patient: { name: string; healthId: string } | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const remaining = daysUntil(prescription.expires_at);
  const isOpen = prescription.status === 'active' || prescription.status === 'partially_dispensed';
  const expiryDays =
    isOpen && remaining !== null && remaining >= 0 && remaining <= EXPIRY_WARNING_WINDOW_DAYS
      ? remaining
      : null;
  const expiryLabel =
    expiryDays === null
      ? null
      : expiryDays === 0
        ? t('prescriptions.expiresToday')
        : t('prescriptions.expiresInDays', { count: expiryDays });

  const facility = prescription.facility_name ?? t('prescriptions.unknownFacility');
  const reference = referenceCode(prescription.id);

  return (
    <Card>
      <View style={styles.issuer}>
        <TintCircle icon="building" tint="blue" size={64} />
        <View style={styles.issuerBody}>
          <Text style={styles.label}>{t('prescriptions.issuedBy')}</Text>
          <Text style={styles.issuerName} numberOfLines={2}>
            {facility}
          </Text>
          <Text style={styles.link}>{t('prescriptions.reference', { code: reference })}</Text>
        </View>
      </View>

      <View style={styles.facts}>
        <FactCell
          icon="calendar"
          label={t('opesMeds.prescription.prescribedOn')}
          value={
            prescription.prescribed_at
              ? fmtShortDate(prescription.prescribed_at)
              : t('prescriptions.notRecorded')
          }
        />
        <FactCell
          icon="document-text"
          label={t('opesMeds.prescription.prescriptionId')}
          value={reference}
          divided
        />
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusPair}>
          <Text style={styles.statusKey}>{t('opesMeds.prescription.status')}</Text>
          <StatusBadge
            status={prescription.status}
            tone={prescriptionTone(prescription.status, prescription.status_color)}
            label={t(statusLabelKey(prescription.status))}
            size="sm"
          />
        </View>
        {expiryLabel ? (
          <StatusBadge status="due" tone="warning" icon="clock" label={expiryLabel} size="sm" />
        ) : null}
      </View>

      {patient ? (
        <View
          style={styles.patientRow}
          accessible
          accessibilityLabel={a11yJoin(t('opesMeds.prescription.patient'), patient.name, patient.healthId)}
        >
          <TintCircle icon="person" tint="blue" size={40} />
          <View style={styles.patientBody}>
            <Text style={styles.label}>{t('opesMeds.prescription.patient')}</Text>
            <Text style={styles.patientName} numberOfLines={1}>
              {patient.name}
            </Text>
          </View>
          <Text style={styles.patientId} numberOfLines={1}>
            {patient.healthId}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

/** A dosage value, or null when it is blank — blank must read "Not specified". */
function clean(value: string | null | undefined): string | null {
  return value && value.trim().length > 0 ? value : null;
}

function MedicationItem({
  item,
  index,
  divider,
}: {
  item: PrescriptionItemDetail;
  index: number;
  divider?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // The backend now sends a per-line `status` (pending | dispensed | cancelled)
  // alongside the older boolean; the boolean is the fallback for a row that
  // predates it.
  const lineStatus = item.status || (item.is_dispensed ? 'dispensed' : 'pending');
  const lineLabel =
    lineStatus === 'dispensed'
      ? t('prescriptions.itemDispensed')
      : lineStatus === 'cancelled'
        ? t('prescriptions.statusCancelled')
        : t('prescriptions.itemPending');
  const lineIcon: IconName =
    lineStatus === 'dispensed' ? 'check-circle' : lineStatus === 'cancelled' ? 'x-circle' : 'clock';
  const dispensedOn =
    lineStatus === 'dispensed' && item.dispensed_at ? fmtShortDate(item.dispensed_at) : null;

  const missing = t('prescriptions.notSpecified');
  const dose = clean(item.dose);
  const frequency = clean(item.frequency);
  const route = clean(item.route);
  const duration =
    item.duration_days != null ? t('prescriptions.durationDays', { count: item.duration_days }) : null;
  const quantity = item.quantity != null ? String(item.quantity) : null;

  return (
    <View style={[styles.item, divider && styles.itemDivider]}>
      <View style={styles.itemHead}>
        <View style={styles.itemIndex}>
          <Text style={styles.itemIndexText}>{index}</Text>
        </View>
        <TintCircle
          icon={formIcon({ dosage: item.dose, drug_name: item.drug_name })}
          tint="blue"
          size={52}
          square
        />
        <View style={styles.itemBody}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.drug_name}
          </Text>
          {item.drug_code ? (
            <Text style={styles.itemCode}>{t('prescriptions.drugCode', { code: item.drug_code })}</Text>
          ) : null}
        </View>
        <View style={styles.itemStatus}>
          <StatusBadge status={lineStatus} label={lineLabel} icon={lineIcon} size="sm" />
          {dispensedOn ? <Text style={styles.itemMeta}>{dispensedOn}</Text> : null}
        </View>
      </View>

      {/* The safety-critical block. Deliberately the loudest thing on the card:
          how much and how often lead, then route, duration and quantity. */}
      <View style={styles.dosage}>
        <Text style={styles.dosageTitle}>{t('prescriptions.howToTake')}</Text>
        <View style={styles.itemFacts}>
          <FactCell
            icon="capsule"
            label={t('prescriptions.dose')}
            value={dose ?? missing}
            valueColor={dose ? undefined : colors.textMuted}
          />
          <FactCell
            icon="clock"
            label={t('prescriptions.frequency')}
            value={frequency ?? missing}
            valueColor={frequency ? undefined : colors.textMuted}
            divided
          />
        </View>
        <View style={[styles.itemFacts, styles.itemFactsNext]}>
          <FactCell
            icon="arrow-up-right"
            label={t('prescriptions.route')}
            value={route ? routeLabel(route) : missing}
            valueColor={route ? undefined : colors.textMuted}
          />
          <FactCell
            icon="calendar"
            label={t('prescriptions.duration')}
            value={duration ?? missing}
            valueColor={duration ? undefined : colors.textMuted}
            divided
          />
        </View>
        <View style={[styles.itemFacts, styles.itemFactsNext]}>
          <FactCell
            icon="receipt"
            label={t('prescriptions.quantity')}
            value={quantity ?? missing}
            valueColor={quantity ? undefined : colors.textMuted}
          />
        </View>
      </View>

      {item.dispense_notes ? (
        <View style={styles.dispenseNote}>
          <Text style={styles.dispenseNoteTitle}>{t('prescriptions.dispenseNotes')}</Text>
          <Text style={styles.dispenseNoteText}>{item.dispense_notes}</Text>
        </View>
      ) : null}

      <FindNearbyRow drugName={item.drug_name} />
    </View>
  );
}

/**
 * "Find this medicine nearby" — the bridge into the Medicine Finder.
 *
 * A prescription item carries free text, never a catalog id, so the drug name
 * is resolved against `GET /mobile/pharmacy/medicines` first. On a hit this
 * deep-links straight to `/pharmacy/[medicineId]` (which fills in its own
 * default search origin when lat/lng are omitted) and shows the real catalog
 * price floor and pharmacy count. On a miss it opens the Medicine Finder itself
 * rather than a dead end — and says so, instead of implying stock it has not
 * confirmed.
 */
function FindNearbyRow({ drugName }: { drugName: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data: medicine, isPending } = useCatalogMedicineMatch(drugName);

  const price = medicine?.availability.price_min ?? null;
  const pharmacyCount = medicine?.availability.pharmacy_count ?? 0;

  const hint = medicine
    ? price != null && pharmacyCount > 0
      ? t('prescriptions.nearbyFrom', { price: formatXaf(price) ?? '', count: pharmacyCount })
      : t('prescriptions.nearbyInCatalog', { name: medicine.name })
    : t('prescriptions.nearbySearchInstead');

  return (
    <View style={styles.nearby}>
      <ListRow
        icon={medicine ? 'store' : 'search'}
        tint="green"
        title={t('prescriptions.findNearby')}
        subtitle={isPending ? t('prescriptions.nearbyChecking') : hint}
        onPress={() => {
          if (medicine) {
            router.push({ pathname: '/pharmacy/[medicineId]', params: { medicineId: medicine.id } });
          } else {
            router.push('/pharmacy');
          }
        }}
        style={styles.nearbyRow}
      />
    </View>
  );
}

/* -- Styles ---------------------------------------------------------------- */

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

    label: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    link: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: c.link },

    // -- Issuer --------------------------------------------------------------
    issuer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    issuerBody: { flex: 1, minWidth: 0, gap: 2 },
    issuerName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: c.textPrimary,
    },
    facts: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: spacing.md,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.divider,
      marginHorizontal: -10,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: 12,
    },
    statusPair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusKey: {
      overflow: 'hidden',
      borderRadius: radii.sm,
      backgroundColor: c.blue,
      color: c.textOnBrand,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    patientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: spacing.md,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    patientBody: { flex: 1, minWidth: 0, gap: 1 },
    patientName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    patientId: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    // -- Medications ---------------------------------------------------------
    medHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.divider,
    },
    medHeadTitle: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.blue,
    },

    item: { paddingHorizontal: spacing.md, paddingVertical: 12, gap: 12 },
    itemDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
    itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    itemIndex: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemIndexText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textOnBrand,
    },
    itemBody: { flex: 1, minWidth: 0, gap: 2 },
    itemName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: c.textPrimary,
    },
    itemCode: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: c.textMuted },
    itemStatus: { alignItems: 'flex-end', gap: 3, maxWidth: 120 },
    itemMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: c.textMuted },

    dosage: {
      borderRadius: radii.md,
      backgroundColor: c.primarySoft,
      paddingVertical: 12,
      paddingHorizontal: 6,
      gap: 10,
    },
    dosageTitle: {
      paddingHorizontal: 10,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.blue,
    },
    itemFacts: { flexDirection: 'row', alignItems: 'flex-start' },
    itemFactsNext: { paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border },

    dispenseNote: {
      borderRadius: radii.sm,
      backgroundColor: c.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 2,
    },
    dispenseNoteTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    dispenseNoteText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },

    nearby: { borderTopWidth: 1, borderTopColor: c.divider },
    nearbyRow: { paddingHorizontal: 0, paddingBottom: 2 },

    instructions: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: c.primarySoft,
    },
    instructionsBody: { flex: 1, minWidth: 0, gap: 2 },
    instructionsTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.blue,
    },
    instructionsText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
    },
  });
