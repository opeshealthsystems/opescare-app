/**
 * The patient chart — what a doctor came to this app to look up.
 *
 * Read-only, on purpose. Identity, allergies, active problems, current
 * medications, latest vitals, recent encounters and recent orders/results. No
 * prescribing, no ordering, no documentation: those live on the desktop where
 * the decision support and the signing flow are.
 *
 * ── Three independent loads, and why ──────────────────────────────────────
 *
 * This screen runs three separate `useAsync` states rather than one:
 *
 *   1. identity   — `GET /patients/{id}`
 *   2. allergies  — `GET /patients/{id}/allergies`
 *   3. summary    — problems, encounters, and the encounter fan-out
 *
 * Splitting (2) out is the single most important decision on this screen. If
 * allergies were one branch of a combined request, a failure anywhere in the
 * bundle would take the allergy section down with it — and an allergy section
 * that renders empty because of a network error reads, to someone glancing at a
 * phone before prescribing, as "no known allergies". Loaded alone, an allergy
 * failure is an allergy failure, and `AllergyBlock` says so in red.
 *
 * Splitting (1) out means the header is useful the moment the identity request
 * lands, instead of waiting on the slowest section.
 *
 * ── Staleness ─────────────────────────────────────────────────────────────
 *
 * Every section renders through `ChartBoundary`, so a refresh that fails while
 * older data is on screen gets the app's `StaleNotice` — "you are seeing what
 * was loaded N minutes ago". A doctor reading yesterday's medication list as
 * today's is a real hazard; the screen never lets old data pass as current, and
 * carries a `LastUpdatedLine` at the foot even on the happy path.
 *
 * ── Completeness ──────────────────────────────────────────────────────────
 *
 * There is no patient-level prescriptions or orders endpoint on the staff API —
 * both are scoped to an encounter. So "current medications" is assembled by
 * opening the most recent encounters (`OVERVIEW_ENCOUNTER_SCAN`). When that
 * scan is partial, `IncompleteNotice` says the list is a subset. A quietly
 * short medication list is the same class of hazard as a quietly stale one.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  fetchAllergies,
  fetchPatient,
  loadChartSummary,
  OVERVIEW_ENCOUNTER_SCAN,
  type ChartAllergy,
  type ChartPatient,
  type ChartSummary,
} from '../../api/doctorChart';
import {
  Card,
  LastUpdatedLine,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
} from '../../components';
import { useTranslation } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { useAsync } from '../care/shared';
import {
  AllergyBlock,
  ChartBoundary,
  ChartLine,
  encounterTint,
  encounterTypeLabel,
  fmtAgo,
  fmtChartDate,
  IncompleteNotice,
  metaLine,
  orderStatusLabel,
  encounterStatusLabel,
  orderTypeIcon,
  orderTypeLabel,
  prescriptionStatusLabel,
  problemStatusLabel,
  ReadOnlyFooter,
  routeLabel,
  sexLabel,
  VitalsCard,
} from './chartShared';
import type { DoctorStackParamList, PatientChartSectionName } from './chartRoutes';

/** How many rows each overview section shows before "View All". */
const PREVIEW = 3;

type Nav = NativeStackNavigationProp<DoctorStackParamList, 'PatientChart'>;
type Rt = RouteProp<DoctorStackParamList, 'PatientChart'>;

export function PatientChartScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { patientId } = useRoute<Rt>().params;

  const identity = useAsync<ChartPatient>(() => fetchPatient(patientId), [patientId]);
  const allergies = useAsync<ChartAllergy[]>(() => fetchAllergies(patientId), [patientId]);
  const summary = useAsync<ChartSummary>(() => loadChartSummary(patientId), [patientId]);

  const refreshing = identity.loading || allergies.loading || summary.loading;
  function reloadAll() {
    identity.reload();
    allergies.reload();
    summary.reload();
  }

  const openSection = (section: PatientChartSectionName) =>
    navigation.navigate('PatientChartSection', { patientId, section });

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title={identity.data?.name ?? t('doctor.chart.title')}
        subtitle={identity.data?.medical_id}
      />

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reloadAll} tintColor={colors.blue} />}
      >
        {/* ---- Identity ---------------------------------------------- */}
        <ChartBoundary<ChartPatient> state={identity} loadingLabel={t('doctor.chart.loadingPatient')}>
          {(p) => <IdentityCard patient={p} />}
        </ChartBoundary>

        {/* ---- Allergies. First thing after identity, and unmissable. -- */}
        <AllergyBlock
          state={allergies}
          limit={PREVIEW}
          onViewAll={() => openSection('allergies')}
        />

        {/* ---- Everything else ---------------------------------------- */}
        <ChartBoundary<ChartSummary> state={summary} loadingLabel={t('doctor.chart.loadingChart')}>
          {(s) => (
            <>
              <ProblemsSection summary={s} onViewAll={() => openSection('diagnoses')} />
              <MedicationsSection summary={s} onViewAll={() => openSection('medications')} />
              <VitalsSection summary={s} onViewAll={() => openSection('vitals')} />
              <EncountersSection summary={s} onViewAll={() => openSection('encounters')} />
              <ResultsSection summary={s} onViewAll={() => openSection('labs')} />
            </>
          )}
        </ChartBoundary>

        <LastUpdatedLine loadedAt={summary.loadedAt} />
        <ReadOnlyFooter />
      </ScrollView>
    </View>
  );
}

// ── Identity ──────────────────────────────────────────────────────────────

function IdentityCard({ patient: p }: { patient: ChartPatient }) {
  const { t } = useTranslation();
  const dob = fmtChartDate(p.date_of_birth);
  return (
    <Card>
      <Text style={styles.name}>{p.name}</Text>
      <Text style={styles.mrn}>{p.medical_id}</Text>

      <View style={styles.chips}>
        {p.age !== null && <Fact label={t('doctor.chart.age')} value={`${p.age}`} />}
        <Fact label={t('doctor.chart.sex')} value={sexLabel(p.sex)} />
        {!!p.blood_group && (
          <Fact label={t('doctor.chart.bloodGroup')} value={p.blood_group} />
        )}
      </View>

      <View style={styles.identityLines}>
        <ChartLine label={t('doctor.chart.dateOfBirth')} value={dob} />
        <ChartLine label={t('doctor.chart.phone')} value={p.phone} />
        <ChartLine
          label={t('doctor.chart.location')}
          value={[p.address, p.city].filter(Boolean).join(', ') || null}
        />
        <ChartLine
          label={t('doctor.chart.nextOfKin')}
          value={
            p.next_of_kin?.name
              ? [p.next_of_kin.name, p.next_of_kin.relation, p.next_of_kin.phone]
                  .filter(Boolean)
                  .join(' · ')
              : null
          }
        />
      </View>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────

function SectionShell({
  title,
  count,
  onViewAll,
  emptyText,
  children,
}: {
  title: string;
  count: number;
  onViewAll: () => void;
  emptyText: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <SectionHeader
        title={count > 0 ? t('doctor.section.groupCount', { label: title, count }) : title}
        onAction={count > PREVIEW ? onViewAll : undefined}
        actionLabel={t('doctor.chart.viewAll')}
        actionChevron
      />
      {count === 0 ? (
        <Card>
          <Text style={styles.empty}>{emptyText}</Text>
        </Card>
      ) : (
        children
      )}
    </View>
  );
}

function ProblemsSection({ summary, onViewAll }: { summary: ChartSummary; onViewAll: () => void }) {
  const { t } = useTranslation();
  // "Active problems" means active. Resolved and inactive entries are history
  // and belong on the full section screen, not in the doctor's first glance.
  const active = summary.problems.filter((p) => p.status === 'active');
  const shown = active.slice(0, PREVIEW);

  return (
    <SectionShell
      title={t('doctor.chart.activeProblems')}
      count={active.length}
      onViewAll={onViewAll}
      emptyText={
        summary.problems.length > 0
          ? t('doctor.chart.problemsEmptyOthers')
          : t('doctor.chart.problemsEmpty')
      }
    >
      <Card variant="flush">
        {shown.map((p, i) => (
          <ListRow
            key={p.id}
            icon="clipboard"
            tint="amber"
            title={p.icd10_description}
            meta={[
              p.icd10_code,
              fmtChartDate(p.onset_date)
                ? t('doctor.chart.onset', { date: fmtChartDate(p.onset_date) as string })
                : null,
            ]}
            trailing={<StatusBadge status={problemStatusLabel(p.status)} tone="warning" size="sm" />}
            chevron={false}
            divider={i < shown.length - 1}
          />
        ))}
      </Card>
    </SectionShell>
  );
}

function MedicationsSection({ summary, onViewAll }: { summary: ChartSummary; onViewAll: () => void }) {
  const { t } = useTranslation();
  const active = summary.prescriptions.items.filter((p) => p.status === 'active');
  const shown = active.slice(0, PREVIEW);

  return (
    <View style={styles.section}>
      <SectionHeader
        title={
          active.length > 0
            ? t('doctor.section.groupCount', {
                label: t('doctor.chart.currentMedications'),
                count: active.length,
              })
            : t('doctor.chart.currentMedications')
        }
        onAction={onViewAll}
        actionLabel={t('doctor.chart.viewAll')}
        actionChevron
      />
      <IncompleteNotice
        scan={summary.prescriptions}
        noun="doctor.chart.nounMedications"
        scanLimit={OVERVIEW_ENCOUNTER_SCAN}
      />
      {active.length === 0 ? (
        <Card>
          <Text style={styles.empty}>
            {t('doctor.chart.medsEmpty', { scan: OVERVIEW_ENCOUNTER_SCAN })}
          </Text>
        </Card>
      ) : (
        <Card variant="flush">
          {shown.map((m, i) => (
            <ListRow
              key={m.id}
              icon="pill"
              tint="green"
              title={m.drug_name}
              meta={[m.dosage, m.frequency, routeLabel(m.route) || null]}
              trailing={<StatusBadge status={prescriptionStatusLabel(m.status)} tone="normal" size="sm" />}
              chevron={false}
              divider={i < shown.length - 1}
            />
          ))}
        </Card>
      )}
    </View>
  );
}

function VitalsSection({ summary, onViewAll }: { summary: ChartSummary; onViewAll: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <SectionHeader
        title={t('doctor.chart.latestVitals')}
        onAction={onViewAll}
        actionLabel={t('doctor.chart.viewAll')}
        actionChevron
      />
      {summary.vitalsFailed ? (
        <Card>
          {/* A failure to load, said as a failure — never an empty vitals card. */}
          <Text style={styles.failed}>{t('doctor.chart.vitalsFailed')}</Text>
        </Card>
      ) : summary.latestVitals ? (
        <VitalsCard vitals={summary.latestVitals} />
      ) : (
        <Card>
          <Text style={styles.empty}>
            {t('doctor.chart.vitalsEmpty', { scan: OVERVIEW_ENCOUNTER_SCAN })}
          </Text>
        </Card>
      )}
    </View>
  );
}

function EncountersSection({ summary, onViewAll }: { summary: ChartSummary; onViewAll: () => void }) {
  const { t } = useTranslation();
  const shown = summary.encounters.slice(0, PREVIEW);

  return (
    <SectionShell
      title={t('doctor.chart.recentEncounters')}
      count={summary.encounterTotal}
      onViewAll={onViewAll}
      emptyText={t('doctor.chart.encountersEmpty')}
    >
      <Card variant="flush">
        {shown.map((e, i) => (
          <ListRow
            key={e.id}
            icon="stethoscope"
            tint={encounterTint(e.encounter_type)}
            title={e.chief_complaint || encounterTypeLabel(e.encounter_type)}
            meta={[
              fmtChartDate(e.encounter_date),
              encounterTypeLabel(e.encounter_type),
              e.doctor_name,
            ]}
            trailing={<StatusBadge status={e.status} label={encounterStatusLabel(e.status)} size="sm" />}
            chevron={false}
            divider={i < shown.length - 1}
          />
        ))}
      </Card>
    </SectionShell>
  );
}

function ResultsSection({ summary, onViewAll }: { summary: ChartSummary; onViewAll: () => void }) {
  const { t } = useTranslation();
  const orders = summary.orders.items;
  const shown = orders.slice(0, PREVIEW);

  return (
    <View style={styles.section}>
      <SectionHeader
        title={
          orders.length > 0
            ? t('doctor.section.groupCount', {
                label: t('doctor.chart.recentOrders'),
                count: orders.length,
              })
            : t('doctor.chart.recentOrders')
        }
        onAction={onViewAll}
        actionLabel={t('doctor.chart.viewAll')}
        actionChevron
      />
      <IncompleteNotice
        scan={summary.orders}
        noun="doctor.chart.nounResults"
        scanLimit={OVERVIEW_ENCOUNTER_SCAN}
      />
      {orders.length === 0 ? (
        <Card>
          <Text style={styles.empty}>
            {t('doctor.chart.ordersEmpty', { scan: OVERVIEW_ENCOUNTER_SCAN })}
          </Text>
        </Card>
      ) : (
        <Card variant="flush">
          {shown.map((o, i) => (
            <ListRow
              key={o.id}
              icon={orderTypeIcon(o.order_type)}
              tint={o.status === 'completed' ? 'green' : 'blue'}
              title={o.name}
              subtitle={
                o.result_summary ??
                metaLine(orderTypeLabel(o.order_type), fmtAgo(o.ordered_at ?? o.created_at))
              }
              trailing={<StatusBadge status={orderStatusLabel(o.status)} size="sm" />}
              chevron={false}
              divider={i < shown.length - 1}
            />
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xl },

  name: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
  },
  mrn: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md - 4 },
  fact: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 78,
  },
  factLabel: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.textMuted },
  factValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  identityLines: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.xs,
  },

  section: { gap: 0 },
  empty: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textMuted,
  },
  failed: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.statusCritical,
  },
});
