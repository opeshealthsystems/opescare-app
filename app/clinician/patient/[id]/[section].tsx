import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
/**
 * Doctor — One chart section, in full (`/clinician/patient/[id]/[section]`).
 *
 * Port of design reference `src/screens/doctor/PatientChartSectionScreen.tsx` (archived prototype, see docs/DESIGN_REFERENCE.md) onto
 * expo-router, the OPES UI kit and this app's doctor foundation. `[id]` is the
 * Health ID; `[section]` is a `PatientChartSectionName` from
 * `components/doctor/chartRoutes` — this screen invents no slugs of its own.
 *
 * The chart overview shows three of everything; this is where a clinician goes
 * when three is not enough. Same data, same components, deeper scan: the
 * encounter fan-out behind medications, diagnoses and orders walks
 * `SECTION_ENCOUNTER_SCAN` encounters here instead of
 * `OVERVIEW_ENCOUNTER_SCAN`, because completeness is the whole point.
 *
 * ── ALL NINE SECTIONS ARE ANSWERED ────────────────────────────────────────
 *
 * Any of the nine can arrive by deep link even though the overview links to
 * seven. The two with no mobile data story — `summary` (which IS the chart)
 * and `documents` (a workstation surface) — are answered explicitly, and an
 * unrecognised slug is answered too. Nothing here falls through to a blank
 * scroll view that reads as "this section is empty".
 *
 * ── STILL READ-ONLY, STILL HONEST ABOUT WHAT IT COULD NOT READ ────────────
 *
 * `AllergyBlock` is exactly as loud here as on the overview; `IncompleteNotice`
 * reports every partial fan-out; `ChartBoundary` renders the kit's
 * `StaleNotice` over data a refresh failed to replace; `ReadOnlyFooter` stands
 * at the foot of every section. There is no edit affordance anywhere — the
 * finder has no clinical-write endpoint and this screen does not pretend
 * otherwise.
 *
 * Lab and imaging go a level deeper than the overview: the order carries the
 * bench's `result_summary`, and the analyte rows come from
 * `useOrderResults`. Their `reference` range and `flag` are the LABORATORY's
 * own and are printed verbatim — this app holds reference bands for vital
 * signs only and never derives one for a lab analyte.
 *
 * ── WHAT THE SERVER NOW ANSWERS, AND WHAT IT STILL DOES NOT ───────────────
 *
 * The finder serves the seven chart sections
 * (`/api/mobile/doctor/patients/{id}/…`, `MobileDoctorChartController`, behind
 * `auth.provider`). It does NOT serve `/mobile/doctor/orders/{id}/results`,
 * which is a different slice — so an order card shows the order and the
 * bench's `result_summary`, then says plainly that the value-by-value
 * breakdown is not available on this server yet. That sentence is about the
 * SERVER; it is never allowed to read as a claim about the patient's results.
 *
 * A 403 from a section is a REAL answer: the server opens a chart only for a
 * clinician with a care relationship to that patient and refuses everyone
 * else. 403 is no longer folded in with 404 — neither `isDoctorApiUnavailable`
 * nor the `isDoctorFeatureUnserved` this screen calls matches it — so a
 * refusal can no longer render through the "not available on this server yet"
 * `EmptyState`. The response body carries
 * `error_code: NO_CLINICAL_RELATIONSHIP` and a `required_action`;
 * `doctorAccessRefusal` reads them.
 *
 * Every section opened here writes an `access_logs` row on the server, tagged
 * with the data category this screen actually asked for.
 *
 * i18n: `opesDoctor.section.*` is in the locales; anything this port needed
 * beyond it carries an English `defaultValue` and is staged for translation in
 * `lib/i18n/pending/doctor_chart.{en,fr}.json`. Locale files are not edited here.
 */
import { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGate } from '@/components/doctor/RoleGate';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  Card,
  CardStack,
  EmptyState,
  Icon,
  LastUpdatedLine,
  ListRow,
  ResultList,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  radii,
  spacing,
  typography,
  useTheme,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import { describeFailure, type Translate } from '@/components/care/shared';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  SECTION_ENCOUNTER_SCAN,
  useChartAllergies,
  useChartDiagnoses,
  useChartEncounters,
  useChartOrders,
  useChartPatient,
  useChartPrescriptions,
  useChartProblems,
  useChartVitals,
  useOrderResults,
  type ChartDiagnosis,
  type ChartEncounter,
  type ChartLabResult,
  type ChartOrder,
  type ChartPrescription,
  type ChartProblem,
  type ChartVitals,
  type DoctorPage,
  type ScanResult,
  isDoctorFeatureUnserved,
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
  fmtChartDateTime,
  metaLine,
  orderStatusLabel,
  orderTypeIcon,
  orderTypeLabel,
  prescriptionStatusLabel,
  priorityLabel,
  problemStatusLabel,
  routeLabel,
  titleCase,
} from '@/components/doctor/chartShared';
import {
  LINKED_SECTIONS,
  SECTION_ORDER_TYPE,
  chartSectionTitle,
  doctorRoutes,
  type PatientChartSectionName,
} from '@/components/doctor/chartRoutes';

/** How many encounters the encounter section asks for in one page. */
const ENCOUNTER_PAGE = 20;
/** How many vitals recordings the vitals section asks for. */
const VITALS_LIMIT = 20;

/**
 * Every section name, so an arriving slug can be checked before it is used.
 *
 * Built from `LINKED_SECTIONS` plus the two that are reachable only by deep
 * link, rather than retyped — and `SECTIONS_COVER_THE_UNION` below fails to
 * compile the day a tenth section is added to `PatientChartSectionName` and
 * not listed here, which is the point.
 */
const ALL_SECTIONS = [...LINKED_SECTIONS, 'summary', 'documents'] as const;

type ListedSection = (typeof ALL_SECTIONS)[number];
type Uncovered = Exclude<PatientChartSectionName, ListedSection>;
const SECTIONS_COVER_THE_UNION: Uncovered extends never ? true : never = true;
void SECTIONS_COVER_THE_UNION;

function asSection(value: unknown): PatientChartSectionName | null {
  return typeof value === 'string' && (ALL_SECTIONS as readonly string[]).includes(value)
    ? (value as PatientChartSectionName)
    : null;
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

/**
 * Role gate — clinical_chart. A role without it never mounts the screen
 * below, so none of its queries run and the server is never asked what it
 * would refuse (`lib/staffCapabilities.ts`, mirror of config/staff_capabilities.php).
 */
export default function PatientChartSectionScreen() {
  usePrivateScreen();
  return (
    <RoleGate need={['clinical_chart']}>
      <PatientChartSectionScreenBody />
    </RoleGate>
  );
}

function PatientChartSectionScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const params = useLocalSearchParams<{ id: string; section: string }>();
  const patientId = typeof params.id === 'string' && params.id.length > 0 ? params.id : undefined;
  const section = asSection(params.section);

  const tx = useCallback<Tx>((key, defaultValue, p) => String(t(`opesDoctor.${key}`, { defaultValue, ...p })), [t]);
  const tr = useCallback<Translate>((key, p) => String(t(key, p as Record<string, unknown>)), [t]);

  // The header names the patient, so a clinician can never be reading the
  // right section of the wrong chart. It comes from the server, not a param.
  const identity = useChartPatient(patientId);

  /**
   * Each section's data, gated by passing `undefined` for the patient id — the
   * foundation's hooks are `enabled: !!patientId`, so a section that is not on
   * screen sends no request at all. Every hook is still CALLED on every
   * render, which is what the rules of hooks require.
   */
  const at = (want: PatientChartSectionName | PatientChartSectionName[]) => {
    if (!section || !patientId) return undefined;
    const wanted = Array.isArray(want) ? want : [want];
    return wanted.includes(section) ? patientId : undefined;
  };

  const allergies = useChartAllergies(at('allergies'));
  const problems = useChartProblems(at('diagnoses'));
  const diagnoses = useChartDiagnoses(at('diagnoses'), SECTION_ENCOUNTER_SCAN);
  const prescriptions = useChartPrescriptions(at('medications'), SECTION_ENCOUNTER_SCAN);
  const vitals = useChartVitals(at('vitals'), VITALS_LIMIT);
  const encounters = useChartEncounters(at('encounters'), {
    per_page: ENCOUNTER_PAGE,
  });
  // Deliberately UNFILTERED: `labs` and `imaging` are the same endpoint, and
  // holding both lets the empty state say "nothing of this kind, though N
  // other orders were placed" instead of the flatly different claim
  // "nothing was ordered".
  const orders = useChartOrders(at(['labs', 'imaging']), SECTION_ENCOUNTER_SCAN);

  const active: ChartQuery<unknown> | null =
    section === 'allergies'
      ? allergies
      : section === 'diagnoses'
        ? diagnoses
        : section === 'medications'
          ? prescriptions
          : section === 'vitals'
            ? vitals
            : section === 'encounters'
              ? encounters
              : section === 'labs' || section === 'imaging'
                ? orders
                : null;

  const refreshing = !!active && active.isFetching && !active.isPending;
  const reload = useCallback(() => {
    void identity.refetch();
    if (active) void active.refetch();
  }, [identity, active]);

  const openChart = () =>
    patientId ? router.push(doctorRoutes.patient(patientId)) : router.push(doctorRoutes.patients);

  const patient = identity.data ?? null;
  const subtitle = patient ? [patient.name, patient.health_id].filter(Boolean).join(' · ') : undefined;

  const shared = { tx, tr, styles };

  let body: React.ReactNode;
  if (!patientId) {
    body = (
      <EmptyState
        icon="id-card"
        tint="amber"
        title={tx('chart.noIdTitle', 'No Health ID in this link')}
        message={tx(
          'chart.noIdBody',
          'A chart is opened with a patient’s Health ID. Look the patient up again from the Patients tab.',
        )}
        actionLabel={tx('section.openLookup', 'Find a patient')}
        onAction={() => router.push(doctorRoutes.patients)}
      />
    );
  } else if (!section) {
    body = (
      <EmptyState
        icon="help-circle"
        tint="amber"
        title={tx('section.unknownTitle', 'That is not a chart section')}
        message={tx(
          'section.unknownBody',
          'This link names a section the chart does not have. Open the chart and pick one from there.',
        )}
        actionLabel={tx('section.openChart', 'Open the chart')}
        onAction={openChart}
      />
    );
  } else if (section === 'summary') {
    body = (
      <EmptyState
        icon="folder"
        tint="blue"
        title={tx('section.summaryTitle', 'The chart is the summary')}
        message={tx(
          'section.summaryBody',
          'There is no separate summary section — the patient chart itself is the overview.',
        )}
        actionLabel={tx('section.openChart', 'Open the chart')}
        onAction={openChart}
      />
    );
  } else if (section === 'documents') {
    body = (
      <EmptyState
        icon="document-text"
        tint="amber"
        title={tx('section.notHereTitle', '{{section}} are not in the mobile chart', {
          section: chartSectionTitle(section),
        })}
        message={tx(
          'section.notHereBody',
          'This section is part of the desktop record. The mobile chart carries allergies, problems, medications, vitals, encounters and results.',
        )}
        actionLabel={tx('section.openChart', 'Open the chart')}
        onAction={openChart}
      />
    );
  } else if (section === 'allergies') {
    // Allergies never go through a generic boundary: `AllergyBlock` owns all
    // three states, and the difference between "none recorded" and "could not
    // be read" is the reason this component exists.
    body = <AllergyBlock state={chartState(allergies)} />;
  } else if (section === 'diagnoses') {
    body = <DiagnosesFull problems={problems} diagnoses={diagnoses} {...shared} />;
  } else if (section === 'medications') {
    body = <MedicationsFull query={prescriptions} {...shared} />;
  } else if (section === 'vitals') {
    body = <VitalsFull query={vitals} {...shared} />;
  } else if (section === 'encounters') {
    body = <EncountersFull query={encounters} {...shared} />;
  } else {
    body = <OrdersFull query={orders} section={section} {...shared} />;
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={section ? chartSectionTitle(section) : tx('chart.title', 'Patient Chart')}
        subtitle={subtitle}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.blue} />}
      >
        {body}

        {!!active && <LastUpdatedLine loadedAt={active.dataUpdatedAt ? new Date(active.dataUpdatedAt) : null} />}
        <ReadOnlyFooter />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── The one boundary every data section goes through ──────────────────────

type SharedProps = {
  tx: Tx;
  tr: Translate;
  styles: ReturnType<typeof makeStyles>;
};

/**
 * `ChartBoundary`, plus the one distinction it cannot make on its own.
 *
 * A 404 on this server means the clinician surface is not served, not that the
 * read failed — so it gets its own copy and never reaches the generic "Something
 * went wrong". Everything else (loading, empty, stale-over-data, real errors)
 * is `ChartBoundary`'s job and is left to it.
 */
function SectionData<T>({
  query,
  loadingLabel,
  notServedBody,
  isEmpty,
  empty,
  tx,
  tr,
  children,
}: {
  query: ChartQuery<T>;
  loadingLabel: string;
  notServedBody: string;
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  tx: Tx;
  tr: Translate;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isError && query.data === undefined && isDoctorFeatureUnserved(query.error)) {
    return (
      <EmptyState
        icon="folder"
        tint="blue"
        title={tx('shared.notServedTitle', 'Not available on this server yet')}
        message={notServedBody}
        actionLabel={tr('opesCore.common.retry')}
        onAction={() => void query.refetch()}
      />
    );
  }
  return (
    <ChartBoundary<T> state={chartState(query)} loadingLabel={loadingLabel} isEmpty={isEmpty} empty={empty}>
      {children}
    </ChartBoundary>
  );
}

/** The "the clinician service is off" body, once, for every data section. */
function notServedFor(tx: Tx, section: PatientChartSectionName): string {
  return tx(
    'shared.notServedSection',
    '{{section}} will appear here once the clinician service is enabled for this app. Nothing on this screen is a statement about the patient’s record.',
    { section: chartSectionTitle(section) },
  );
}

// ── Diagnoses & problem list ──────────────────────────────────────────────

/**
 * Two related but distinct things, kept apart on purpose.
 *
 * The PROBLEM LIST is the longitudinal, curated set a clinician maintains.
 * ENCOUNTER DIAGNOSES are what was coded at a particular visit. Merging them
 * would make a one-off working diagnosis look like a standing problem, so they
 * are separate blocks under separate headings, from separate endpoints.
 */
function DiagnosesFull({
  problems,
  diagnoses,
  tx,
  tr,
  styles,
}: SharedProps & {
  problems: ChartQuery<ChartProblem[]>;
  diagnoses: ChartQuery<ScanResult<ChartDiagnosis>>;
}) {
  const groups: [string, string][] = [
    ['active', tx('section.groupActive', 'Active')],
    ['inactive', tx('section.groupInactive', 'Inactive')],
    ['resolved', tx('section.groupResolved', 'Resolved')],
  ];
  const known = new Set(groups.map(([k]) => k));

  const problemTone = (status: string): StatusTone =>
    status === 'active' ? 'warning' : status === 'resolved' ? 'normal' : 'neutral';

  return (
    <>
      <SectionHeader title={tx('section.problemList', 'Problem List')} variant="overline" />
      <SectionData<ChartProblem[]>
        query={problems}
        tx={tx}
        tr={tr}
        loadingLabel={tx('section.loading', 'Loading…')}
        notServedBody={notServedFor(tx, 'diagnoses')}
        isEmpty={(rows) => rows.length === 0}
        empty={
          <Card>
            <Text style={styles.note}>
              {tx('section.problemListEmpty', 'Nothing has been added to this patient’s problem list.')}
            </Text>
          </Card>
        }
      >
        {(rows) => {
          const other = rows.filter((p) => !known.has(p.status));
          return (
            <>
              {groups.map(([key, title]) => {
                const group = rows.filter((p) => p.status === key);
                if (group.length === 0) return null;
                return (
                  <View key={key} style={styles.group}>
                    <Text style={styles.groupLabel}>
                      {tx('section.groupCount', '{{label}} ({{count}})', {
                        label: title,
                        count: group.length,
                      })}
                    </Text>
                    <ResultList>
                      {group.map((p) => (
                        <Card key={p.id} variant="flush">
                          <ProblemRow problem={p} tone={problemTone(key)} tx={tx} />
                        </Card>
                      ))}
                    </ResultList>
                  </View>
                );
              })}

              {other.length > 0 && (
                <View style={styles.group}>
                  <Text style={styles.groupLabel}>
                    {tx('section.groupCount', '{{label}} ({{count}})', {
                      label: tx('section.groupOther', 'Other'),
                      count: other.length,
                    })}
                  </Text>
                  <ResultList>
                    {other.map((p) => (
                      <Card key={p.id} variant="flush">
                        <ProblemRow problem={p} tone="neutral" tx={tx} />
                      </Card>
                    ))}
                  </ResultList>
                </View>
              )}
            </>
          );
        }}
      </SectionData>

      <SectionHeader
        title={tx('section.codedDiagnoses', 'Diagnoses Coded at Recent Visits')}
        variant="overline"
        style={styles.blockGap}
      />
      <SectionData<ScanResult<ChartDiagnosis>>
        query={diagnoses}
        tx={tx}
        tr={tr}
        loadingLabel={tx('section.loadingDiagnoses', 'Loading diagnoses…')}
        notServedBody={notServedFor(tx, 'diagnoses')}
        isEmpty={(d) => d.items.length === 0 && d.failed === 0}
        empty={
          <Card>
            <Text style={styles.note}>
              {tx('section.diagnosesEmpty', 'No diagnoses were coded in the {{scan}} most recent encounters.', {
                scan: SECTION_ENCOUNTER_SCAN,
              })}
            </Text>
          </Card>
        }
      >
        {(d) => (
          <>
            <IncompleteNotice scan={d} noun="opesDoctor.chart.nounDiagnoses" scanLimit={SECTION_ENCOUNTER_SCAN} />
            <ResultList>
              {d.items.map((dx) => (
                <Card key={dx.id} variant="flush">
                  <ListRow
                    icon="first-aid"
                    tint={dx.diagnosis_type === 'primary' ? 'amber' : 'blue'}
                    title={dx.icd10_description}
                    meta={[
                      dx.icd10_code,
                      dx.diagnosis_type ? titleCase(dx.diagnosis_type) : null,
                      dx.diagnosis_nature ? titleCase(dx.diagnosis_nature) : null,
                      fmtChartDate(dx.created_at),
                    ]}
                    chevron={false}
                  />
                </Card>
              ))}
            </ResultList>
          </>
        )}
      </SectionData>
    </>
  );
}

function ProblemRow({ problem: p, tone, tx }: { problem: ChartProblem; tone: StatusTone; tx: Tx }) {
  const onset = fmtChartDate(p.onset_date);
  return (
    <ListRow
      icon="clipboard"
      tint={tone === 'warning' ? 'amber' : 'blue'}
      title={p.icd10_description}
      meta={[p.icd10_code, onset ? tx('chart.onset', 'Onset {{date}}', { date: onset }) : null, p.notes]}
      trailing={<StatusBadge status={p.status} label={problemStatusLabel(p.status)} tone={tone} size="sm" />}
      chevron={false}
    />
  );
}

// ── Medications ───────────────────────────────────────────────────────────

/**
 * Active first, then everything else.
 *
 * A stopped or completed prescription is history and is grouped as such — the
 * HEADING, not just a pill, is what stops a discontinued drug being read as a
 * current one.
 */
function MedicationsFull({
  query,
  tx,
  tr,
  styles,
}: SharedProps & { query: ChartQuery<ScanResult<ChartPrescription>> }) {
  return (
    <SectionData<ScanResult<ChartPrescription>>
      query={query}
      tx={tx}
      tr={tr}
      loadingLabel={tx('section.loading', 'Loading…')}
      notServedBody={notServedFor(tx, 'medications')}
    >
      {(scan) => {
        const all = scan.items;
        const active = all.filter((m) => m.status === 'active');
        const past = all.filter((m) => m.status !== 'active');
        return (
          <>
            <IncompleteNotice scan={scan} noun="opesDoctor.chart.nounMedications" scanLimit={SECTION_ENCOUNTER_SCAN} />
            {all.length === 0 ? (
              <EmptyState
                icon="pill"
                tint="blue"
                title={tx('section.medsEmptyTitle', 'No prescriptions found')}
                message={tx('section.medsEmptyBody', 'Nothing was prescribed in the {{scan}} most recent encounters.', {
                  scan: SECTION_ENCOUNTER_SCAN,
                })}
              />
            ) : (
              <>
                <MedGroup
                  title={tx('section.medsActive', 'Active')}
                  rows={active}
                  tone="normal"
                  tint="green"
                  tx={tx}
                  styles={styles}
                />
                <MedGroup
                  title={tx('section.medsNotActive', 'Not active')}
                  rows={past}
                  tone="neutral"
                  tint="blue"
                  tx={tx}
                  styles={styles}
                />
              </>
            )}
          </>
        );
      }}
    </SectionData>
  );
}

function MedGroup({
  title,
  rows,
  tone,
  tint,
  tx,
  styles,
}: {
  title: string;
  rows: ChartPrescription[];
  tone: 'normal' | 'neutral';
  tint: 'green' | 'blue';
  tx: Tx;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { colors, tintMap } = useTheme();
  if (rows.length === 0) return null;
  return (
    <View style={styles.group}>
      <SectionHeader
        title={tx('section.groupCount', '{{label}} ({{count}})', {
          label: title,
          count: rows.length,
        })}
        variant="overline"
      />
      {rows.map((m) => (
        <Card key={m.id} style={styles.blockCard} accentColor={tintMap[tint].fg}>
          <View style={styles.cardHead}>
            <Icon name="pill" size={20} color={tintMap[tint].fg} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{m.drug_name}</Text>
            <StatusBadge status={m.status} label={prescriptionStatusLabel(m.status)} tone={tone} size="sm" />
          </View>
          <ChartLine label={tx('section.dose', 'Dose')} value={m.dosage} />
          <ChartLine label={tx('section.frequency', 'Frequency')} value={m.frequency} />
          <ChartLine label={tx('section.route', 'Route')} value={routeLabel(m.route) || null} />
          <ChartLine label={tx('section.duration', 'Duration')} value={m.duration} />
          <ChartLine label={tx('section.instructions', 'Instructions')} value={m.instructions} />
          <ChartLine label={tx('section.prescribed', 'Prescribed')} value={fmtChartDate(m.created_at)} />
          <ChartLine label={tx('section.prescriber', 'Prescriber')} value={m.prescribed_by_name} />
        </Card>
      ))}
    </View>
  );
}

// ── Vitals ────────────────────────────────────────────────────────────────

/** Every recording the record holds for this patient, newest first. */
function VitalsFull({ query, tx, tr, styles }: SharedProps & { query: ChartQuery<ChartVitals[]> }) {
  return (
    <SectionData<ChartVitals[]>
      query={query}
      tx={tx}
      tr={tr}
      loadingLabel={tx('section.loadingVitals', 'Loading vitals…')}
      notServedBody={notServedFor(tx, 'vitals')}
      isEmpty={(rows) => rows.length === 0}
      empty={
        <EmptyState
          icon="heart-rate"
          tint="blue"
          title={tx('section.vitalsEmptyTitle', 'No vitals recorded')}
          message={tx(
            'section.vitalsEmptyMobile',
            'No vital signs are on this patient’s record. This is what the server returned, not a failure to read it.',
          )}
        />
      }
    >
      {(rows) => (
        <>
          {/* A full page is a page, not the whole record — say so rather than
              let the oldest recording on screen pass for the oldest there is. */}
          {rows.length >= VITALS_LIMIT && (
            <Text style={styles.note}>
              {tx(
                'section.vitalsCapped',
                'Showing the {{limit}} most recent recordings. Older ones are on the record but not on this screen.',
                { limit: VITALS_LIMIT },
              )}
            </Text>
          )}
          {[...rows]
            .sort((a, b) => vitalTime(b) - vitalTime(a))
            .map((v) => (
              <VitalsCard key={v.id} vitals={v} />
            ))}
        </>
      )}
    </SectionData>
  );
}

const vitalTime = (v: ChartVitals) => {
  const parsed = Date.parse(v.recorded_at ?? v.created_at ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};

// ── Encounters ────────────────────────────────────────────────────────────

/** The SOAP body of each visit, which is what a clinician is reading for. */
function EncountersFull({ query, tx, tr, styles }: SharedProps & { query: ChartQuery<DoctorPage<ChartEncounter>> }) {
  const { colors, tintMap } = useTheme();
  return (
    <SectionData<DoctorPage<ChartEncounter>>
      query={query}
      tx={tx}
      tr={tr}
      loadingLabel={tx('section.loading', 'Loading…')}
      notServedBody={notServedFor(tx, 'encounters')}
      // The encounters endpoint answers the paginated envelope, so the rows are
      // one level in — `page.data`, never the page object itself.
      isEmpty={(page) => (page.data ?? []).length === 0}
      empty={
        <EmptyState
          icon="stethoscope"
          tint="blue"
          title={tx('section.encountersEmptyTitle', 'No encounters')}
          message={tx('section.encountersEmptyBody', 'This patient has no recorded encounters.')}
        />
      }
    >
      {(page) => {
        const rows = page.data ?? [];
        const total = page.meta?.pagination?.total ?? rows.length;
        return (
          <>
            {total > rows.length && (
              <Text style={styles.note}>
                {tx('section.showingRecent', 'Showing the {{shown}} most recent of {{total}} encounters.', {
                  shown: rows.length,
                  total,
                })}
              </Text>
            )}
            {rows.map((e) => (
              <Card key={e.id} style={styles.blockCard}>
                <View style={styles.cardHead}>
                  <Icon name="stethoscope" size={20} color={tintMap[encounterTint(e.encounter_type)].fg} />
                  <View style={styles.cardHeadText}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                      {encounterTypeLabel(e.encounter_type)}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {metaLine(fmtChartDate(e.encounter_date), e.encounter_time, e.doctor_name, e.facility_name)}
                    </Text>
                  </View>
                  <StatusBadge status={e.status} label={encounterStatusLabel(e.status)} size="sm" />
                </View>

                <ChartLine label={tx('section.chiefComplaint', 'Chief complaint')} value={e.chief_complaint} />
                <ChartLine label={tx('section.subjective', 'Subjective')} value={e.subjective} />
                <ChartLine label={tx('section.objective', 'Objective')} value={e.objective} />
                <ChartLine label={tx('section.assessment', 'Assessment')} value={e.assessment} />
                <ChartLine label={tx('section.plan', 'Plan')} value={e.plan} />
                <ChartLine label={tx('section.dischargeNote', 'Discharge note')} value={e.discharge_note} />
                <ChartLine label={tx('section.followUp', 'Follow-up')} value={fmtChartDate(e.follow_up_date)} />
              </Card>
            ))}
          </>
        );
      }}
    </SectionData>
  );
}

// ── Orders & results ──────────────────────────────────────────────────────

/**
 * `labs` and `imaging` are the same list filtered on `order_type`.
 *
 * The filter runs here rather than on the server so that, when it matches
 * nothing, the screen can tell the two different claims apart: "no imaging on
 * a patient who has five lab orders" is not "nothing was ordered".
 */
function OrdersFull({
  query,
  section,
  tx,
  tr,
  styles,
}: SharedProps & {
  query: ChartQuery<ScanResult<ChartOrder>>;
  section: PatientChartSectionName;
}) {
  const wanted = SECTION_ORDER_TYPE[section];
  return (
    <SectionData<ScanResult<ChartOrder>>
      query={query}
      tx={tx}
      tr={tr}
      loadingLabel={tx('section.loading', 'Loading…')}
      notServedBody={notServedFor(tx, section)}
    >
      {(scan) => {
        const all = scan.items;
        const rows = [...all]
          .filter((o) => !wanted || o.order_type === wanted)
          .sort((a, b) => orderTime(b.ordered_at ?? b.created_at) - orderTime(a.ordered_at ?? a.created_at));
        return (
          <>
            <IncompleteNotice scan={scan} noun="opesDoctor.chart.nounResults" scanLimit={SECTION_ENCOUNTER_SCAN} />
            {rows.length === 0 ? (
              <EmptyState
                icon={section === 'imaging' ? 'image' : 'flask'}
                tint="blue"
                title={
                  section === 'imaging'
                    ? tx('section.noOrdersImaging', 'No imaging orders')
                    : tx('section.noOrdersLab', 'No laboratory orders')
                }
                message={
                  all.length > 0
                    ? tx(
                        'section.noOrdersOthers',
                        'Nothing of this kind was ordered in the {{scan}} most recent encounters, though {{count}} other orders were placed.',
                        { scan: SECTION_ENCOUNTER_SCAN, count: all.length },
                      )
                    : tx('section.noOrdersAtAll', 'Nothing was ordered in the {{scan}} most recent encounters.', {
                        scan: SECTION_ENCOUNTER_SCAN,
                      })
                }
              />
            ) : (
              rows.map((o) => <OrderCard key={o.id} order={o} tx={tx} styles={styles} />)
            )}
          </>
        );
      }}
    </SectionData>
  );
}

const orderTime = (value: string | null) => {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * One order, with its analyte rows when the bench has entered any.
 *
 * A completed order frequently carries a `result_summary` and NO analyte rows —
 * the bench released a conclusion without itemising it. So an empty result
 * list is never rendered as "no result": the summary is shown, and the absence
 * of rows is described as an absence of ITEMISED VALUES, which is what it is.
 */
function OrderCard({ order: o, tx, styles }: { order: ChartOrder; tx: Tx; styles: ReturnType<typeof makeStyles> }) {
  const { colors, tintMap } = useTheme();
  const results = useOrderResults(o.id);
  const rows = results.data ?? [];

  return (
    <Card style={styles.blockCard}>
      <View style={styles.cardHead}>
        <Icon name={orderTypeIcon(o.order_type)} size={20} color={tintMap.blue.fg} />
        <View style={styles.cardHeadText}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{o.name}</Text>
          <Text style={styles.cardMeta}>
            {metaLine(
              orderTypeLabel(o.order_type),
              o.code,
              priorityLabel(o.priority) || null,
              fmtAgo(o.ordered_at ?? o.created_at),
            )}
          </Text>
        </View>
        <StatusBadge status={o.status} label={orderStatusLabel(o.status)} size="sm" />
      </View>

      <ChartLine label={tx('section.ordered', 'Ordered')} value={fmtChartDateTime(o.ordered_at ?? o.created_at)} />
      <ChartLine label={tx('section.clinicalNotes', 'Clinical notes')} value={o.clinical_notes} />

      {!!o.result_summary && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>{tx('section.reportedResult', 'Reported result')}</Text>
          <Text style={styles.summaryText}>{o.result_summary}</Text>
        </View>
      )}

      {results.isError && results.data === undefined ? (
        /*
          Two different silences, told apart.

          The chart sections ARE served now (`/mobile/doctor/patients/{id}/…`),
          but the per-order analyte endpoint `/mobile/doctor/orders/{id}/results`
          is not part of that slice and this server does not answer it. A 404
          there is a statement about the SERVER; any other failure is a
          statement about this READ. Both are said out loud, and neither is
          ever allowed to render as "no values were released", which would be a
          statement about the PATIENT.
        */
        <Text style={isDoctorFeatureUnserved(results.error) ? styles.note : styles.failed}>
          {isDoctorFeatureUnserved(results.error)
            ? tx(
                'section.itemisedNotServed',
                'Itemised analyte values are not available on this server yet. The order, and any reported result above, are complete — only the value-by-value breakdown is missing.',
              )
            : tx('section.itemisedFailed', 'Itemised results could not be loaded. {{error}}', {
                error: describeFailure(results.error).message,
              })}
        </Text>
      ) : results.isPending ? (
        <Text style={styles.note}>{tx('section.loadingItemised', 'Loading itemised results…')}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.note}>
          {o.result_summary
            ? tx(
                'section.noItemisedWithSummary',
                'No itemised analyte values were entered for this order — the reported result above is what the laboratory released.',
              )
            : tx('section.noItemised', 'No values have been entered for this order yet.')}
        </Text>
      ) : (
        <CardStack spacing="sm" style={styles.resultTable}>
          {rows.map((r) => (
            <Card key={r.id}>
              <AnalyteRow result={r} tx={tx} styles={styles} />
            </Card>
          ))}
        </CardStack>
      )}
    </Card>
  );
}

/**
 * One analyte.
 *
 * `reference` and `flag` are the LABORATORY's, printed as received. This app
 * holds reference bands for vital signs only and no thresholds at all for lab
 * analytes — so where the lab sent no range, the row says so rather than
 * implying one exists.
 */
function AnalyteRow({
  result: r,
  tx,
  styles,
}: {
  result: ChartLabResult;
  tx: Tx;
  styles: ReturnType<typeof makeStyles>;
}) {
  const { statusMap } = useTheme();
  const tone = r.is_abnormal ? statusMap.critical : statusMap.neutral;
  return (
    <View style={styles.resultRow}>
      <View style={styles.resultMain}>
        <Text style={styles.resultAnalyte}>{r.analyte}</Text>
        <Text style={styles.resultRef}>
          {r.reference
            ? tx('section.labReference', 'Lab reference: {{range}}', {
                range: r.reference,
              })
            : tx('section.noLabReference', 'No reference range supplied by the laboratory')}
        </Text>
      </View>
      <View style={styles.resultValueWrap}>
        <Text style={[styles.resultValue, r.is_abnormal && { color: tone.fg }]}>
          {r.value ?? '—'}
          {r.unit ? <Text style={styles.resultUnit}> {r.unit}</Text> : null}
        </Text>
        {!!r.flag && <StatusBadge status={r.flag} tone={r.is_abnormal ? 'critical' : 'normal'} size="sm" />}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: {
      padding: spacing.md,
      paddingTop: 0,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },

    group: { gap: 0 },
    blockGap: { marginTop: spacing.md },
    blockCard: { marginBottom: spacing.sm },
    groupLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textMuted,
      marginBottom: spacing.xs,
    },

    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    cardHeadText: { flex: 1, minWidth: 0 },
    cardTitle: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
    },
    cardMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
      marginTop: 1,
    },

    note: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      paddingTop: spacing.xs,
    },
    failed: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.statusCritical,
      paddingTop: spacing.xs,
    },

    summaryBox: {
      marginTop: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceMuted,
      gap: 2,
    },
    summaryLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      color: colors.textSecondary,
    },
    summaryText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },

    resultTable: {
      marginTop: spacing.sm,
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    resultMain: { flex: 1, minWidth: 0 },
    resultAnalyte: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    resultRef: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 1,
    },
    resultValueWrap: { alignItems: 'flex-end', gap: 4 },
    resultValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    resultUnit: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
    },
  });
