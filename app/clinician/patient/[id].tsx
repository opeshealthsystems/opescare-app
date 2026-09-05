/**
 * Doctor — Patient chart (`/clinician/patient/[id]`).
 *
 * Port of `UIUX/src/screens/doctor/PatientChartScreen.tsx` onto expo-router,
 * the OPES UI kit and this app's doctor foundation. `[id]` is the OpesCare
 * **Health ID** — the key every `/mobile/doctor/patients/…` endpoint takes.
 *
 * Read-only, on purpose. Identity, allergies, active problems, current
 * medications, latest vitals, recent encounters and recent orders. No
 * prescribing, no ordering, no documentation: those stay on a workstation
 * where the decision support and the signing flow live, and `ReadOnlyFooter`
 * says so out loud rather than leaving it to be discovered.
 *
 * ── THREE INDEPENDENT LOADS, AND WHY ──────────────────────────────────────
 *
 *   1. identity   `useChartPatient`    — the header is useful the moment it lands
 *   2. allergies  `useChartAllergies`  — its own query, always
 *   3. summary    `useChartSummary`    — problems, encounters, the fan-out, vitals
 *
 * Splitting (2) out is the most important decision on this screen and it is
 * baked into the foundation: if allergies were one branch of the summary, a
 * failure anywhere in that bundle would take the allergy section down with it,
 * and an allergy section that renders empty because of a network error reads,
 * to someone glancing at a phone before prescribing, as "no known allergies".
 * Loaded alone, an allergy failure is an allergy failure, and `AllergyBlock`
 * says so in red.
 *
 * ── COMPLETENESS AND STALENESS ────────────────────────────────────────────
 *
 * The medication and order lists arrive inside the contract's `ScanResult`
 * envelope, and `IncompleteNotice` speaks up whenever that envelope says the
 * list is a subset of the record — a quietly short medication list is the same
 * class of hazard as a quietly stale one. `ChartBoundary` renders the kit's
 * `StaleNotice` whenever a refresh fails over data already on screen.
 *
 * ── WHAT THE SERVER NOW ANSWERS ───────────────────────────────────────────
 *
 * The finder serves `/api/mobile/doctor/patients/{id}` and its seven sections
 * (`MobileDoctorChartController`, behind `auth.provider`). Two consequences
 * for this screen:
 *
 *   • A 403 is a REAL answer, not a missing route. The server opens a chart
 *     only for a clinician with a care relationship to that patient — on their
 *     schedule, their own clinical act, an episode at their own facility, or a
 *     consent grant — and refuses everyone else. `isDoctorApiUnavailable`
 *     (foundation-owned) still folds 403 in with 404, so a refusal reads today
 *     as "not available on this server yet"; the response body carries
 *     `error_code: NO_CLINICAL_RELATIONSHIP` for the day those are split.
 *   • Every section read is a disclosure, and the server records each one in
 *     `access_logs`. Opening this screen writes three rows — one per
 *     independent load — which is exactly why the three are kept independent.
 *
 * Identity is the chart's spine, so a failure with nothing behind it renders
 * ONE honest `EmptyState` for the whole screen rather than five stacked error
 * cards — and never a spinner that never ends.
 *
 * i18n: `opesDoctor.chart.*` and `opesDoctor.section.title.*` are in the
 * locales; anything this port needed beyond them carries an English
 * `defaultValue` and is staged for translation in
 * `lib/i18n/pending/doctor_chart.{en,fr}.json`. Locale files are not edited here.
 */
import { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  Card,
  EmptyState,
  LastUpdatedLine,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type Tint,
} from '@/components/opes-ui';
import { NoticeBanner, describeFailure, type Translate } from '@/components/care/shared';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  OVERVIEW_ENCOUNTER_SCAN,
  useChartAllergies,
  useChartPatient,
  useChartSummary,
  type ChartPatient,
  type ChartSummary,
} from '@/lib/api/doctorQueries';
import {
  AllergyBlock,
  ChartBoundary,
  ChartLine,
  IncompleteNotice,
  ReadOnlyFooter,
  VitalsCard,
  asAsyncState,
  encounterStatusLabel,
  encounterTint,
  encounterTypeLabel,
  fmtAgo,
  fmtChartDate,
  metaLine,
  orderStatusLabel,
  orderTypeIcon,
  orderTypeLabel,
  prescriptionStatusLabel,
  problemStatusLabel,
  routeLabel,
  sexLabel,
} from '@/components/doctor/chartShared';
import {
  LINKED_SECTIONS,
  chartSectionTitle,
  doctorRoutes,
  type PatientChartSectionName,
} from '@/components/doctor/chartRoutes';

/** How many rows each overview section shows before "View All". */
const PREVIEW = 3;

/** 404 / 501: this server does not serve the clinician surface yet. */
function isNotServed(e: unknown): boolean {
  const status = axios.isAxiosError(e) ? e.response?.status : undefined;
  return status === 404 || status === 501;
}

/**
 * A chart hook's result, with the error type the foundation actually produces.
 *
 * `doctorQueries` passes `doctorRetry(failureCount, error: unknown)` to every
 * `useQuery`, which makes react-query infer `TError = unknown`; `asAsyncState`
 * is declared against react-query's default `Error`. Same value, two declared
 * types — and `asAsyncState` does nothing with the error but hand it to
 * `describeFailure(e: unknown)`. So the widening is asserted here, once,
 * rather than at every call site, and no foundation file is touched.
 */
type ChartQuery<T> = UseQueryResult<T, unknown>;

const chartState = <T,>(query: ChartQuery<T>) => asAsyncState(query as UseQueryResult<T>);

/** `opesDoctor.<key>` with a readable default until the catalogue lands. */
type Tx = (key: string, defaultValue: string, params?: Record<string, unknown>) => string;

export default function PatientChartScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { id } = useLocalSearchParams<{ id: string }>();
  const patientId = typeof id === 'string' && id.length > 0 ? id : undefined;

  const tx = useCallback<Tx>(
    (key, defaultValue, params) => String(t(`opesDoctor.${key}`, { defaultValue, ...params })),
    [t]
  );
  const tr = useCallback<Translate>(
    (key, params) => String(t(key, params as Record<string, unknown>)),
    [t]
  );

  const identity = useChartPatient(patientId);
  const allergies = useChartAllergies(patientId);
  const summary = useChartSummary(patientId, OVERVIEW_ENCOUNTER_SCAN);

  const refreshing =
    (identity.isFetching || allergies.isFetching || summary.isFetching) &&
    !(identity.isPending && allergies.isPending && summary.isPending);

  const reloadAll = useCallback(() => {
    void identity.refetch();
    void allergies.refetch();
    void summary.refetch();
  }, [identity, allergies, summary]);

  const openSection = (section: PatientChartSectionName) =>
    patientId ? router.push(doctorRoutes.chartSection(patientId, section)) : undefined;

  const patient = identity.data ?? null;

  // Identity is the chart's spine. With nothing behind it there is no chart to
  // draw, so one honest empty state answers for the whole screen.
  const identityDead = !patientId || (identity.isError && identity.data === undefined);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={patient?.name ?? tx('chart.title', 'Patient Chart')}
        subtitle={patient?.health_id ?? undefined}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={reloadAll} tintColor={colors.blue} />
        }
      >
        {identityDead ? (
          <DeadChart
            missingId={!patientId}
            notServed={isNotServed(identity.error)}
            message={identity.error ? describeFailure(identity.error).message : null}
            onRetry={() => void identity.refetch()}
            tx={tx}
            tr={tr}
          />
        ) : (
          <>
            {/* ---- Identity ------------------------------------------- */}
            <ChartBoundary<ChartPatient>
              state={chartState(identity)}
              loadingLabel={tx('chart.loadingPatient', 'Loading patient…')}
            >
              {(p) => <IdentityCard patient={p} tx={tx} />}
            </ChartBoundary>

            {/* ---- Allergies. First after identity, and unmissable. ---- */}
            <AllergyBlock
              state={chartState(allergies)}
              limit={PREVIEW}
              onViewAll={() => openSection('allergies')}
            />

            {/* ---- Everything else ------------------------------------ */}
            <ChartBoundary<ChartSummary>
              state={chartState(summary)}
              loadingLabel={tx('chart.loadingChart', 'Loading chart…')}
            >
              {(s) => (
                <>
                  <ProblemsSection summary={s} onViewAll={() => openSection('diagnoses')} tx={tx} />
                  <MedicationsSection
                    summary={s}
                    onViewAll={() => openSection('medications')}
                    tx={tx}
                  />
                  <VitalsSection summary={s} onViewAll={() => openSection('vitals')} tx={tx} />
                  <EncountersSection
                    summary={s}
                    onViewAll={() => openSection('encounters')}
                    tx={tx}
                  />
                  <OrdersSection summary={s} onViewAll={() => openSection('labs')} tx={tx} />
                </>
              )}
            </ChartBoundary>

            {/* Every section, including the two the previews above do not
                reach on their own (allergies in full, and imaging). */}
            <SectionIndex onOpen={openSection} tx={tx} />

            <LastUpdatedLine
              loadedAt={summary.dataUpdatedAt ? new Date(summary.dataUpdatedAt) : null}
            />
          </>
        )}

        <ReadOnlyFooter />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── The chart that could not be opened ────────────────────────────────────

/**
 * No identity, no chart. Says WHICH failure it was — a route this server does
 * not serve, a link with no Health ID in it, or a genuine read failure — and
 * never implies anything about the patient's record.
 */
function DeadChart({
  missingId,
  notServed,
  message,
  onRetry,
  tx,
  tr,
}: {
  missingId: boolean;
  notServed: boolean;
  message: string | null;
  onRetry: () => void;
  tx: Tx;
  tr: Translate;
}) {
  if (missingId) {
    return (
      <EmptyState
        icon="id-card"
        tint="amber"
        title={tx('chart.noIdTitle', 'No Health ID in this link')}
        message={tx(
          'chart.noIdBody',
          'A chart is opened with a patient’s Health ID. Look the patient up again from the Patients tab.'
        )}
      />
    );
  }
  return (
    <EmptyState
      icon={notServed ? 'folder' : 'alert-circle'}
      tint={notServed ? 'blue' : 'red'}
      title={
        notServed
          ? tx('shared.notServedTitle', 'Not available on this server yet')
          : tr('opesCore.errors.unknownTitle')
      }
      message={
        notServed
          ? tx(
              'shared.notServedChart',
              'Patient charts will appear here once the clinician service is enabled for this app. Nothing on this screen is a statement about the patient’s record.'
            )
          : (message ?? tx('chart.loadFailed', 'The chart could not be read.'))
      }
      actionLabel={tr('opesCore.common.retry')}
      onAction={onRetry}
    />
  );
}

// ── Identity ──────────────────────────────────────────────────────────────

function IdentityCard({ patient: p, tx }: { patient: ChartPatient; tx: Tx }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const location = [p.address, p.city].filter(Boolean).join(', ') || null;
  const kin = p.next_of_kin?.name
    ? [p.next_of_kin.name, p.next_of_kin.relation, p.next_of_kin.phone].filter(Boolean).join(' · ')
    : null;

  return (
    <>
      {/*
        Consent is what makes this record readable at all. When the server says
        the grant is not held, the chart says so above everything else — a
        clinician must know they are looking at a record they are not currently
        authorised for, whatever the endpoint chose to return.
      */}
      {p.consent_granted === false && (
        <NoticeBanner
          icon="lock"
          tone="warning"
          title={tx('chart.noConsentTitle', 'No consent grant on file')}
          message={tx(
            'chart.noConsentBody',
            'This record is not currently shared with you. Ask the patient to grant access before relying on anything below.'
          )}
        />
      )}

      <Card>
        <Text style={styles.name}>{p.name}</Text>
        <Text style={styles.healthId}>{p.health_id}</Text>
        {!!p.medical_id && (
          <Text style={styles.mrn}>
            {tx('chart.facilityRecord', 'Facility record {{mrn}}', { mrn: p.medical_id })}
          </Text>
        )}

        <View style={styles.chips}>
          {p.age !== null && <Fact label={tx('chart.age', 'Age')} value={String(p.age)} />}
          <Fact label={tx('chart.sex', 'Sex')} value={sexLabel(p.sex)} />
          <Fact
            label={tx('chart.bloodGroup', 'Blood group')}
            value={p.blood_group || tx('vocab.notRecorded', 'Not recorded')}
          />
        </View>

        <View style={styles.identityLines}>
          <ChartLine label={tx('chart.dateOfBirth', 'Date of birth')} value={fmtChartDate(p.date_of_birth)} />
          <ChartLine label={tx('chart.phone', 'Phone')} value={p.phone} />
          <ChartLine label={tx('chart.location', 'Location')} value={location} />
          <ChartLine label={tx('chart.nextOfKin', 'Next of kin')} value={kin} />
        </View>
      </Card>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  tx,
  children,
}: {
  title: string;
  count: number;
  onViewAll: () => void;
  emptyText: string;
  tx: Tx;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <SectionHeader
        title={count > 0 ? tx('section.groupCount', '{{label}} ({{count}})', { label: title, count }) : title}
        onAction={onViewAll}
        actionLabel={tx('chart.viewAll', 'View All')}
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

function ProblemsSection({
  summary,
  onViewAll,
  tx,
}: {
  summary: ChartSummary;
  onViewAll: () => void;
  tx: Tx;
}) {
  // "Active problems" means active. Resolved and inactive entries are history
  // and belong on the full section screen, not in the doctor's first glance.
  const active = summary.problems.filter((p) => p.status === 'active');
  const shown = active.slice(0, PREVIEW);

  return (
    <SectionShell
      title={tx('chart.activeProblems', 'Active Problems')}
      count={active.length}
      onViewAll={onViewAll}
      tx={tx}
      emptyText={
        summary.problems.length > 0
          ? tx(
              'chart.problemsEmptyOthers',
              'No active problems. There are inactive or resolved entries on the problem list.'
            )
          : tx('chart.problemsEmpty', 'The problem list is empty.')
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
                ? tx('chart.onset', 'Onset {{date}}', { date: fmtChartDate(p.onset_date) as string })
                : null,
            ]}
            trailing={
              <StatusBadge
                status={p.status}
                label={problemStatusLabel(p.status)}
                tone="warning"
                size="sm"
              />
            }
            chevron={false}
            divider={i < shown.length - 1}
          />
        ))}
      </Card>
    </SectionShell>
  );
}

function MedicationsSection({
  summary,
  onViewAll,
  tx,
}: {
  summary: ChartSummary;
  onViewAll: () => void;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const active = summary.prescriptions.items.filter((m) => m.status === 'active');
  const shown = active.slice(0, PREVIEW);

  return (
    <View style={styles.section}>
      <SectionHeader
        title={
          active.length > 0
            ? tx('section.groupCount', '{{label}} ({{count}})', {
                label: tx('chart.currentMedications', 'Current Medications'),
                count: active.length,
              })
            : tx('chart.currentMedications', 'Current Medications')
        }
        onAction={onViewAll}
        actionLabel={tx('chart.viewAll', 'View All')}
        actionChevron
      />
      <IncompleteNotice
        scan={summary.prescriptions}
        noun="opesDoctor.chart.nounMedications"
        scanLimit={OVERVIEW_ENCOUNTER_SCAN}
      />
      {active.length === 0 ? (
        <Card>
          <Text style={styles.empty}>
            {tx(
              'chart.medsEmpty',
              'No active prescriptions in the {{scan}} most recent encounters. Older or non-active prescriptions may exist — open the full list.',
              { scan: OVERVIEW_ENCOUNTER_SCAN }
            )}
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
              trailing={
                <StatusBadge
                  status={m.status}
                  label={prescriptionStatusLabel(m.status)}
                  tone="normal"
                  size="sm"
                />
              }
              chevron={false}
              divider={i < shown.length - 1}
            />
          ))}
        </Card>
      )}
    </View>
  );
}

function VitalsSection({
  summary,
  onViewAll,
  tx,
}: {
  summary: ChartSummary;
  onViewAll: () => void;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <SectionHeader
        title={tx('chart.latestVitals', 'Latest Vitals')}
        onAction={onViewAll}
        actionLabel={tx('chart.viewAll', 'View All')}
        actionChevron
      />
      {summary.vitalsFailed ? (
        // A failure to load, said as a failure — never an empty vitals card.
        <Card>
          <Text style={styles.failed}>
            {tx(
              'chart.vitalsFailed',
              'Vitals could not be read for any recent encounter. This is a failure to load, not a record with no vitals — pull down to retry.'
            )}
          </Text>
        </Card>
      ) : summary.latestVitals ? (
        <VitalsCard vitals={summary.latestVitals} />
      ) : (
        <Card>
          <Text style={styles.empty}>
            {tx('chart.vitalsEmpty', 'No vitals recorded in the {{scan}} most recent encounters.', {
              scan: OVERVIEW_ENCOUNTER_SCAN,
            })}
          </Text>
        </Card>
      )}
    </View>
  );
}

function EncountersSection({
  summary,
  onViewAll,
  tx,
}: {
  summary: ChartSummary;
  onViewAll: () => void;
  tx: Tx;
}) {
  const shown = summary.encounters.slice(0, PREVIEW);

  return (
    <SectionShell
      title={tx('chart.recentEncounters', 'Recent Encounters')}
      count={summary.encounterTotal}
      onViewAll={onViewAll}
      tx={tx}
      emptyText={tx('chart.encountersEmpty', 'No encounters on record.')}
    >
      <Card variant="flush">
        {shown.map((e, i) => (
          <ListRow
            key={e.id}
            icon="stethoscope"
            tint={encounterTint(e.encounter_type)}
            title={e.chief_complaint || encounterTypeLabel(e.encounter_type)}
            meta={[fmtChartDate(e.encounter_date), encounterTypeLabel(e.encounter_type), e.doctor_name]}
            trailing={
              <StatusBadge status={e.status} label={encounterStatusLabel(e.status)} size="sm" />
            }
            chevron={false}
            divider={i < shown.length - 1}
          />
        ))}
      </Card>
    </SectionShell>
  );
}

function OrdersSection({
  summary,
  onViewAll,
  tx,
}: {
  summary: ChartSummary;
  onViewAll: () => void;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const orders = summary.orders.items;
  const shown = orders.slice(0, PREVIEW);

  return (
    <View style={styles.section}>
      <SectionHeader
        title={
          orders.length > 0
            ? tx('section.groupCount', '{{label}} ({{count}})', {
                label: tx('chart.recentOrders', 'Recent Orders & Results'),
                count: orders.length,
              })
            : tx('chart.recentOrders', 'Recent Orders & Results')
        }
        onAction={onViewAll}
        actionLabel={tx('chart.viewAll', 'View All')}
        actionChevron
      />
      <IncompleteNotice
        scan={summary.orders}
        noun="opesDoctor.chart.nounResults"
        scanLimit={OVERVIEW_ENCOUNTER_SCAN}
      />
      {orders.length === 0 ? (
        <Card>
          <Text style={styles.empty}>
            {tx('chart.ordersEmpty', 'No orders in the {{scan}} most recent encounters.', {
              scan: OVERVIEW_ENCOUNTER_SCAN,
            })}
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
              trailing={
                <StatusBadge status={o.status} label={orderStatusLabel(o.status)} size="sm" />
              }
              chevron={false}
              divider={i < shown.length - 1}
            />
          ))}
        </Card>
      )}
    </View>
  );
}

// ── Section index ─────────────────────────────────────────────────────────

/** Glyph + tint per section. Kit icons only; nothing hand-rolled. */
const SECTION_MARK: Record<
  (typeof LINKED_SECTIONS)[number],
  { icon: IconName; tint: Tint; blurb: [string, string] }
> = {
  allergies: {
    icon: 'alert-triangle',
    tint: 'red',
    blurb: ['section.indexAllergies', 'Every recorded allergy, in full'],
  },
  diagnoses: {
    icon: 'clipboard',
    tint: 'amber',
    blurb: ['section.indexDiagnoses', 'The problem list and diagnoses coded at recent visits'],
  },
  medications: {
    icon: 'pill',
    tint: 'green',
    blurb: ['section.indexMedications', 'Active and past prescriptions, with dose and route'],
  },
  vitals: {
    icon: 'heart-rate',
    tint: 'blue',
    blurb: ['section.indexVitals', 'Every recording, against the record’s usual ranges'],
  },
  encounters: {
    icon: 'stethoscope',
    tint: 'blue',
    blurb: ['section.indexEncounters', 'Each visit with its subjective, objective, assessment and plan'],
  },
  labs: {
    icon: 'flask',
    tint: 'green',
    blurb: ['section.indexLabs', 'Laboratory orders and the values the bench released'],
  },
  imaging: {
    icon: 'image',
    tint: 'purple',
    blurb: ['section.indexImaging', 'Imaging orders and their reported findings'],
  },
};

/**
 * Every section of the chart, as one list.
 *
 * The previews above reach five of the seven; allergies in full and imaging
 * have no preview header of their own. A section reachable only by typing a
 * URL is a section that does not exist, so all seven are listed here.
 */
function SectionIndex({
  onOpen,
  tx,
}: {
  onOpen: (section: PatientChartSectionName) => void;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <SectionHeader title={tx('section.indexTitle', 'Open a section')} variant="overline" />
      <Card variant="flush">
        {LINKED_SECTIONS.map((s, i) => (
          <ListRow
            key={s}
            icon={SECTION_MARK[s].icon}
            tint={SECTION_MARK[s].tint}
            title={chartSectionTitle(s)}
            subtitle={tx(...SECTION_MARK[s].blurb)}
            onPress={() => onOpen(s)}
            divider={i < LINKED_SECTIONS.length - 1}
          />
        ))}
      </Card>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },

    name: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      color: colors.textPrimary,
    },
    healthId: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
      marginTop: 2,
    },
    mrn: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
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
