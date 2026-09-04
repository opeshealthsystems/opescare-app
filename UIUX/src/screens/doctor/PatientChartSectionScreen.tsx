/**
 * One section of the chart, in full.
 *
 * The chart overview shows three of everything; this is where a doctor goes
 * when three is not enough. Same data, same components, deeper scan: the
 * encounter fan-out that feeds medications, diagnoses and orders walks
 * `SECTION_ENCOUNTER_SCAN` encounters here instead of
 * `OVERVIEW_ENCOUNTER_SCAN`, because the whole point of this screen is
 * completeness.
 *
 * ── Why all nine sections are handled ─────────────────────────────────────
 *
 * `linking.ts` maps `patients/:patientId/:section` straight onto
 * `PatientChartSectionName`, so any of the nine can arrive by deep link even
 * though the chart overview only links to seven. The two this app has no data
 * story for — `summary` (which IS the chart) and `documents` (a desktop
 * surface) — are answered explicitly rather than falling through to a blank
 * screen.
 *
 * Still read-only, and still honest about what it could not read: the same
 * `IncompleteNotice` and `StaleNotice` machinery as the overview, and the same
 * `AllergyBlock`, so an allergy load failure is exactly as loud here.
 *
 * Lab results go a level deeper than the overview. `orders` gives the order and
 * the bench's `result_summary`; the analyte rows live behind
 * `GET /orders/{id}/results` and carry the LABORATORY's own `reference` range
 * and `flag`. Those are rendered verbatim — this app holds reference bands for
 * vital signs only and never derives one for a lab analyte.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  fetchAllergies,
  fetchEncounterDiagnoses,
  fetchEncounterVitals,
  fetchOrderResults,
  fetchPatient,
  loadChartSummary,
  SECTION_ENCOUNTER_SCAN,
  type ChartAllergy,
  type ChartDiagnosis,
  type ChartLabResult,
  type ChartOrder,
  type ChartPatient,
  type ChartSummary,
  type ChartVitals,
} from '../../api/doctorChart';
import {
  Card,
  EmptyState,
  Icon,
  LastUpdatedLine,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
} from '../../components';
import { useTranslation } from '../../i18n';
import { colors, radii, spacing, statusMap, typography } from '../../theme/theme';
import { useAsync } from '../care/shared';
import {
  AllergyBlock,
  ChartBoundary,
  ChartLine,
  encounterTint,
  encounterTypeLabel,
  fmtAgo,
  fmtChartDate,
  fmtChartDateTime,
  encounterStatusLabel,
  IncompleteNotice,
  metaLine,
  orderStatusLabel,
  orderTypeIcon,
  orderTypeLabel,
  prescriptionStatusLabel,
  priorityLabel,
  problemStatusLabel,
  ReadOnlyFooter,
  routeLabel,
  titleCase,
  VitalsCard,
} from './chartShared';
import {
  chartSectionTitle,
  SECTION_ORDER_TYPE,
  type DoctorStackParamList,
  type PatientChartSectionName,
} from './chartRoutes';

type Nav = NativeStackNavigationProp<DoctorStackParamList, 'PatientChartSection'>;
type Rt = RouteProp<DoctorStackParamList, 'PatientChartSection'>;

/** Sections whose data comes from the encounter fan-out. */
const NEEDS_SUMMARY: PatientChartSectionName[] = [
  'diagnoses',
  'medications',
  'vitals',
  'encounters',
  'labs',
  'imaging',
];

export function PatientChartSectionScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { patientId, section } = useRoute<Rt>().params;

  // The header names the patient, so the doctor can never be reading the right
  // section of the wrong chart. It comes from the server, not from a param.
  const identity = useAsync<ChartPatient>(() => fetchPatient(patientId), [patientId]);

  // Allergies have their own endpoint and their own failure story, so the
  // allergies section never goes through the summary loader.
  const isAllergies = section === 'allergies';
  const needsSummary = NEEDS_SUMMARY.includes(section);

  const allergies = useAsync<ChartAllergy[]>(
    () => (isAllergies ? fetchAllergies(patientId) : Promise.resolve([])),
    [patientId, isAllergies]
  );

  const summary = useAsync<ChartSummary>(
    () =>
      needsSummary
        ? loadChartSummary(patientId, SECTION_ENCOUNTER_SCAN)
        : Promise.resolve(EMPTY_SUMMARY),
    [patientId, needsSummary]
  );

  const state = isAllergies ? allergies : summary;

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title={chartSectionTitle(section)}
        subtitle={identity.data ? `${identity.data.name} · ${identity.data.medical_id}` : undefined}
      />

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={state.loading} onRefresh={state.reload} tintColor={colors.blue} />
        }
      >
        {isAllergies ? (
          <AllergyBlock state={allergies} />
        ) : needsSummary ? (
          <ChartBoundary<ChartSummary> state={summary} loadingLabel={t('doctor.section.loading')}>
            {(s) => <SectionBody section={section} summary={s} patientId={patientId} />}
          </ChartBoundary>
        ) : (
          <NotOnMobile
            section={section}
            onOpenChart={() => navigation.navigate('PatientChart', { patientId })}
          />
        )}

        {(isAllergies || needsSummary) && <LastUpdatedLine loadedAt={state.loadedAt} />}
        <ReadOnlyFooter />
      </ScrollView>
    </View>
  );
}

const EMPTY_SUMMARY: ChartSummary = {
  problems: [],
  encounters: [],
  encounterTotal: 0,
  prescriptions: { items: [], scanned: 0, failed: 0, truncated: false },
  orders: { items: [], scanned: 0, failed: 0, truncated: false },
  latestVitals: null,
  vitalsFailed: false,
};

function SectionBody({
  section,
  summary,
  patientId,
}: {
  section: PatientChartSectionName;
  summary: ChartSummary;
  patientId: string;
}) {
  switch (section) {
    case 'diagnoses':
      return <DiagnosesFull summary={summary} />;
    case 'medications':
      return <MedicationsFull summary={summary} />;
    case 'vitals':
      return <VitalsFull summary={summary} />;
    case 'encounters':
      return <EncountersFull summary={summary} />;
    case 'labs':
    case 'imaging':
      return <OrdersFull summary={summary} section={section} />;
    default:
      return null;
  }
}

/**
 * The honest answer for a section this app does not carry.
 *
 * `summary` is the chart screen itself, and patient documents are a desktop
 * surface. Both are only reachable by deep link. Saying so — and offering the
 * way back to the chart — is better than an empty scroll view that looks like
 * a section with nothing in it.
 */
function NotOnMobile({
  section,
  onOpenChart,
}: {
  section: PatientChartSectionName;
  onOpenChart: () => void;
}) {
  const { t } = useTranslation();
  if (section === 'summary') {
    return (
      <EmptyState
        icon="folder"
        tint="blue"
        title={t('doctor.section.summaryTitle')}
        message={t('doctor.section.summaryBody')}
        actionLabel={t('doctor.section.openChart')}
        onAction={onOpenChart}
      />
    );
  }

  return (
    <EmptyState
      icon="document-text"
      tint="amber"
      title={t('doctor.section.notHereTitle', { section: chartSectionTitle(section) })}
      message={t('doctor.section.notHereBody')}
      actionLabel={t('doctor.section.openChart')}
      onAction={onOpenChart}
    />
  );
}

// ── Diagnoses & problem list ──────────────────────────────────────────────

/**
 * Two related but distinct things, kept apart on purpose.
 *
 * The PROBLEM LIST is the longitudinal, curated set a clinician maintains.
 * ENCOUNTER DIAGNOSES are what was coded at a particular visit. Merging them
 * would make a one-off working diagnosis look like a standing problem, so they
 * are separate blocks with separate headings.
 */
function DiagnosesFull({ summary }: { summary: ChartSummary }) {
  const { t } = useTranslation();
  const encounterIds = summary.encounters.slice(0, SECTION_ENCOUNTER_SCAN).map((e) => e.id);
  const byId = new Map(summary.encounters.map((e) => [e.id, e]));

  const state = useAsync<{ rows: ChartDiagnosis[]; failed: number }>(async () => {
    const settled = await Promise.all(
      encounterIds.map((id) =>
        fetchEncounterDiagnoses(id).then(
          (rows) => ({ ok: true as const, rows }),
          () => ({ ok: false as const, rows: [] as ChartDiagnosis[] })
        )
      )
    );
    return {
      rows: settled.flatMap((s) => s.rows),
      failed: settled.filter((s) => !s.ok).length,
    };
  }, [encounterIds.join(',')]);

  const groups: [string, string][] = [
    ['active', t('doctor.section.groupActive')],
    ['inactive', t('doctor.section.groupInactive')],
    ['resolved', t('doctor.section.groupResolved')],
  ];
  const known = new Set(groups.map(([k]) => k));
  const other = summary.problems.filter((p) => !known.has(p.status));

  return (
    <>
      <SectionHeader title={t('doctor.section.problemList')} variant="overline" />
      {summary.problems.length === 0 ? (
        <Card>
          <Text style={styles.note}>{t('doctor.section.problemListEmpty')}</Text>
        </Card>
      ) : (
        <>
          {groups.map(([key, title]) => {
            const rows = summary.problems.filter((p) => p.status === key);
            if (rows.length === 0) return null;
            return (
              <View key={key} style={styles.group}>
                <Text style={styles.groupLabel}>
                  {t('doctor.section.groupCount', { label: title, count: rows.length })}
                </Text>
                <Card variant="flush">
                  {rows.map((p, i) => (
                    <ListRow
                      key={p.id}
                      icon="clipboard"
                      tint={key === 'active' ? 'amber' : 'blue'}
                      title={p.icd10_description}
                      meta={[
                        p.icd10_code,
                        fmtChartDate(p.onset_date)
                          ? t('doctor.chart.onset', { date: fmtChartDate(p.onset_date) as string })
                          : null,
                        p.notes,
                      ]}
                      trailing={
                        <StatusBadge
                          status={problemStatusLabel(p.status)}
                          tone={key === 'active' ? 'warning' : key === 'resolved' ? 'normal' : 'neutral'}
                          size="sm"
                        />
                      }
                      chevron={false}
                      divider={i < rows.length - 1}
                    />
                  ))}
                </Card>
              </View>
            );
          })}
          {other.length > 0 && (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>
                {t('doctor.section.groupCount', {
                  label: t('doctor.section.groupOther'),
                  count: other.length,
                })}
              </Text>
              <Card variant="flush">
                {other.map((p, i) => (
                  <ListRow
                    key={p.id}
                    icon="clipboard"
                    title={p.icd10_description}
                    meta={[p.icd10_code, problemStatusLabel(p.status)]}
                    chevron={false}
                    divider={i < other.length - 1}
                  />
                ))}
              </Card>
            </View>
          )}
        </>
      )}

      <SectionHeader
        title={t('doctor.section.codedDiagnoses')}
        variant="overline"
        style={styles.blockGap}
      />
      <ChartBoundary<{ rows: ChartDiagnosis[]; failed: number }>
        state={state}
        loadingLabel={t('doctor.section.loadingDiagnoses')}
        isEmpty={(d) => d.rows.length === 0 && d.failed === 0}
        empty={
          <Card>
            <Text style={styles.note}>
              {t('doctor.section.diagnosesEmpty', { scan: SECTION_ENCOUNTER_SCAN })}
            </Text>
          </Card>
        }
      >
        {(d) => (
          <>
            <ScanWarning failed={d.failed} noun="doctor.chart.nounDiagnoses" />
            <Card variant="flush">
              {d.rows.map((dx, i) => {
                const enc = byId.get(dx.encounter_id);
                return (
                  <ListRow
                    key={dx.id}
                    icon="first-aid"
                    tint={dx.diagnosis_type === 'primary' ? 'amber' : 'blue'}
                    title={dx.icd10_description}
                    meta={[
                      dx.icd10_code,
                      dx.diagnosis_type ? titleCase(dx.diagnosis_type) : null,
                      dx.diagnosis_nature ? titleCase(dx.diagnosis_nature) : null,
                      enc ? fmtChartDate(enc.encounter_date) : null,
                    ]}
                    chevron={false}
                    divider={i < d.rows.length - 1}
                  />
                );
              })}
            </Card>
          </>
        )}
      </ChartBoundary>
    </>
  );
}

// ── Medications ───────────────────────────────────────────────────────────

/**
 * Active first, then everything else.
 *
 * A stopped or completed prescription is history and is grouped as such — the
 * heading, not just a pill, is what stops a discontinued drug being read as a
 * current one.
 */
function MedicationsFull({ summary }: { summary: ChartSummary }) {
  const { t } = useTranslation();
  const all = summary.prescriptions.items;
  const active = all.filter((m) => m.status === 'active');
  const past = all.filter((m) => m.status !== 'active');

  return (
    <>
      <IncompleteNotice
        scan={summary.prescriptions}
        noun="doctor.chart.nounMedications"
        scanLimit={SECTION_ENCOUNTER_SCAN}
      />

      {all.length === 0 ? (
        <EmptyState
          icon="pill"
          tint="blue"
          title={t('doctor.section.medsEmptyTitle')}
          message={t('doctor.section.medsEmptyBody', { scan: SECTION_ENCOUNTER_SCAN })}
        />
      ) : (
        <>
          <MedGroup title={t('doctor.section.medsActive')} rows={active} tone="normal" tint="green" />
          <MedGroup
            title={t('doctor.section.medsNotActive')}
            rows={past}
            tone="neutral"
            tint="blue"
          />
        </>
      )}
    </>
  );
}

function MedGroup({
  title,
  rows,
  tone,
  tint,
}: {
  title: string;
  rows: ChartSummary['prescriptions']['items'];
  tone: 'normal' | 'neutral';
  tint: 'green' | 'blue';
}) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <View style={styles.group}>
      <SectionHeader
        title={t('doctor.section.groupCount', { label: title, count: rows.length })}
        variant="overline"
      />
      {rows.map((m) => (
        <Card key={m.id} style={styles.medCard}>
          <View style={styles.medHead}>
            <Icon name="pill" size={20} color={tint === 'green' ? colors.tintGreen : colors.tintBlue} />
            <Text style={styles.medName}>{m.drug_name}</Text>
            <StatusBadge status={prescriptionStatusLabel(m.status)} tone={tone} size="sm" />
          </View>
          <ChartLine label={t('doctor.section.dose')} value={m.dosage} />
          <ChartLine label={t('doctor.section.frequency')} value={m.frequency} />
          <ChartLine label={t('doctor.section.route')} value={routeLabel(m.route) || null} />
          <ChartLine label={t('doctor.section.duration')} value={m.duration} />
          <ChartLine label={t('doctor.section.instructions')} value={m.instructions} />
          <ChartLine label={t('doctor.section.prescribed')} value={fmtChartDate(m.created_at)} />
        </Card>
      ))}
    </View>
  );
}

// ── Vitals ────────────────────────────────────────────────────────────────

/**
 * Every vitals recording from the scanned encounters, newest first.
 *
 * The summary loader only keeps the latest set, so this refetches across the
 * encounter window. Each encounter's vitals load independently; one that fails
 * is counted and reported rather than silently dropped.
 */
function VitalsFull({ summary }: { summary: ChartSummary }) {
  const { t } = useTranslation();
  const encounterIds = summary.encounters.slice(0, SECTION_ENCOUNTER_SCAN).map((e) => e.id);

  const state = useAsync<{ rows: ChartVitals[]; failed: number }>(async () => {
    const settled = await Promise.all(
      encounterIds.map((id) =>
        fetchEncounterVitals(id).then(
          (rows) => ({ ok: true as const, rows }),
          () => ({ ok: false as const, rows: [] as ChartVitals[] })
        )
      )
    );
    const rows = settled.flatMap((s) => s.rows).sort((a, b) => vtime(b) - vtime(a));
    return { rows, failed: settled.filter((s) => !s.ok).length };
  }, [encounterIds.join(',')]);

  return (
    <ChartBoundary<{ rows: ChartVitals[]; failed: number }>
      state={state}
      loadingLabel={t('doctor.section.loadingVitals')}
      isEmpty={(d) => d.rows.length === 0 && d.failed === 0}
      empty={
        <EmptyState
          icon="heart-rate"
          tint="blue"
          title={t('doctor.section.vitalsEmptyTitle')}
          message={t('doctor.section.vitalsEmptyBody', { scan: SECTION_ENCOUNTER_SCAN })}
        />
      }
    >
      {(d) => (
        <>
          <ScanWarning failed={d.failed} noun="doctor.chart.nounRecordings" />
          {d.rows.map((v) => (
            <View key={v.id} style={styles.group}>
              <VitalsCard vitals={v} />
            </View>
          ))}
        </>
      )}
    </ChartBoundary>
  );
}

const vtime = (v: ChartVitals) => {
  const t = Date.parse(v.recorded_at ?? v.created_at ?? '');
  return Number.isFinite(t) ? t : 0;
};

/** "N encounters could not be read" — the fan-out's own honesty line. */
function ScanWarning({ failed, noun }: { failed: number; noun: string }) {
  const { t } = useTranslation();
  if (failed === 0) return null;
  return (
    <View style={[styles.warn, { backgroundColor: statusMap.warning.bg }]} accessibilityRole="alert">
      <Icon name="alert-circle" size={16} color={statusMap.warning.fg} />
      <Text style={styles.warnText}>
        {t('doctor.section.scanWarning', { count: failed, noun: t(noun) })}
      </Text>
    </View>
  );
}

// ── Encounters ────────────────────────────────────────────────────────────

/** The SOAP body of each visit, which is what a doctor is actually reading for. */
function EncountersFull({ summary }: { summary: ChartSummary }) {
  const { t } = useTranslation();
  if (summary.encounters.length === 0) {
    return (
      <EmptyState
        icon="stethoscope"
        tint="blue"
        title={t('doctor.section.encountersEmptyTitle')}
        message={t('doctor.section.encountersEmptyBody')}
      />
    );
  }

  return (
    <>
      {summary.encounterTotal > summary.encounters.length && (
        <Text style={styles.note}>
          {t('doctor.section.showingRecent', {
            shown: summary.encounters.length,
            total: summary.encounterTotal,
          })}
        </Text>
      )}
      {summary.encounters.map((e) => (
        <Card key={e.id} style={styles.group}>
          <View style={styles.encHead}>
            <Icon name="stethoscope" size={20} color={tintColor(encounterTint(e.encounter_type))} />
            <View style={styles.encHeadText}>
              <Text style={styles.encTitle}>{encounterTypeLabel(e.encounter_type)}</Text>
              <Text style={styles.encMeta}>
                {metaLine(fmtChartDate(e.encounter_date), e.encounter_time, e.doctor_name)}
              </Text>
            </View>
            <StatusBadge status={e.status} label={encounterStatusLabel(e.status)} size="sm" />
          </View>

          <ChartLine label={t('doctor.section.chiefComplaint')} value={e.chief_complaint} />
          <ChartLine label={t('doctor.section.subjective')} value={e.subjective} />
          <ChartLine label={t('doctor.section.objective')} value={e.objective} />
          <ChartLine label={t('doctor.section.assessment')} value={e.assessment} />
          <ChartLine label={t('doctor.section.plan')} value={e.plan} />
          <ChartLine label={t('doctor.section.dischargeNote')} value={e.discharge_note} />
          <ChartLine label={t('doctor.section.followUp')} value={fmtChartDate(e.follow_up_date)} />
        </Card>
      ))}
    </>
  );
}

const tintColor = (t: 'red' | 'purple' | 'blue' | 'green' | 'amber') =>
  t === 'red' ? colors.tintRed : t === 'purple' ? colors.tintPurple : colors.tintBlue;

// ── Orders & results ──────────────────────────────────────────────────────

/**
 * `labs` and `imaging` are the same endpoint filtered on `order_type`.
 *
 * When the filter matches nothing but there ARE orders of other types, the
 * empty state says so — otherwise "no imaging" on a patient who has five lab
 * orders reads as "nothing was ordered", which is a different claim.
 */
function OrdersFull({
  summary,
  section,
}: {
  summary: ChartSummary;
  section: PatientChartSectionName;
}) {
  const { t } = useTranslation();
  const wanted = SECTION_ORDER_TYPE[section];
  const all = summary.orders.items;
  const orders = [...all]
    .filter((o) => !wanted || o.order_type === wanted)
    .sort(
      (a, b) =>
        Date.parse(b.ordered_at ?? b.created_at ?? '') - Date.parse(a.ordered_at ?? a.created_at ?? '')
    );

  return (
    <>
      <IncompleteNotice
        scan={summary.orders}
        noun="doctor.chart.nounResults"
        scanLimit={SECTION_ENCOUNTER_SCAN}
      />
      {orders.length === 0 ? (
        <EmptyState
          icon={section === 'imaging' ? 'image' : 'flask'}
          tint="blue"
          title={t(
            section === 'imaging' ? 'doctor.section.noOrdersImaging' : 'doctor.section.noOrdersLab'
          )}
          message={
            // "No imaging" on a patient with five lab orders is a different
            // claim from "nothing was ordered" — say which one is true.
            all.length > 0
              ? t('doctor.section.noOrdersOthers', {
                  scan: SECTION_ENCOUNTER_SCAN,
                  count: all.length,
                })
              : t('doctor.section.noOrdersAtAll', { scan: SECTION_ENCOUNTER_SCAN })
          }
        />
      ) : (
        orders.map((o) => <OrderCard key={o.id} order={o} />)
      )}
    </>
  );
}

/**
 * One order, with its analyte rows when the bench has entered any.
 *
 * On the live system a completed order frequently carries a `result_summary`
 * and NO analyte rows — the bench released a conclusion without itemising it.
 * So an empty result list is never rendered as "no result": the summary is
 * shown, and the absence of rows is described as an absence of itemised
 * values, which is what it actually is.
 */
function OrderCard({ order: o }: { order: ChartOrder }) {
  const { t } = useTranslation();
  const results = useAsync<ChartLabResult[]>(() => fetchOrderResults(o.id), [o.id]);

  return (
    <Card style={styles.group}>
      <View style={styles.encHead}>
        <Icon name={orderTypeIcon(o.order_type)} size={20} color={colors.tintBlue} />
        <View style={styles.encHeadText}>
          <Text style={styles.encTitle}>{o.name}</Text>
          <Text style={styles.encMeta}>
            {metaLine(
              orderTypeLabel(o.order_type),
              o.code,
              priorityLabel(o.priority) || null,
              fmtAgo(o.ordered_at ?? o.created_at)
            )}
          </Text>
        </View>
        <StatusBadge status={orderStatusLabel(o.status)} size="sm" />
      </View>

      <ChartLine
        label={t('doctor.section.ordered')}
        value={fmtChartDateTime(o.ordered_at ?? o.created_at)}
      />
      <ChartLine label={t('doctor.section.clinicalNotes')} value={o.clinical_notes} />

      {!!o.result_summary && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>{t('doctor.section.reportedResult')}</Text>
          <Text style={styles.summaryText}>{o.result_summary}</Text>
        </View>
      )}

      {results.error && results.data === null ? (
        <Text style={styles.failed}>
          {t('doctor.section.itemisedFailed', { error: results.error })}
        </Text>
      ) : results.loading && results.data === null ? (
        <Text style={styles.note}>{t('doctor.section.loadingItemised')}</Text>
      ) : (results.data ?? []).length === 0 ? (
        <Text style={styles.note}>
          {/* An empty result list is an absence of ITEMISED values, not an
              absence of a result — the two are said differently. */}
          {o.result_summary
            ? t('doctor.section.noItemisedWithSummary')
            : t('doctor.section.noItemised')}
        </Text>
      ) : (
        <View style={styles.resultTable}>
          {(results.data ?? []).map((r) => (
            <ResultRow key={r.id} result={r} />
          ))}
        </View>
      )}
    </Card>
  );
}

/**
 * One analyte.
 *
 * `reference` and `flag` are the LABORATORY's, printed as received. This app
 * has reference bands for vital signs only (`utils/vitalBands`, sourced from
 * `VitalSignsController::BANDS`) and holds no thresholds for lab analytes — so
 * where the lab sent no range, the row says so rather than implying one.
 */
function ResultRow({ result: r }: { result: ChartLabResult }) {
  const { t } = useTranslation();
  const tone = r.is_abnormal ? statusMap.critical : statusMap.neutral;
  return (
    <View style={styles.resultRow}>
      <View style={styles.resultMain}>
        <Text style={styles.resultAnalyte}>{r.analyte}</Text>
        <Text style={styles.resultRef}>
          {r.reference
            ? t('doctor.section.labReference', { range: r.reference })
            : t('doctor.section.noLabReference')}
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

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xl },

  group: { gap: 0 },
  blockGap: { marginTop: spacing.md },
  groupLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs,
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

  warn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
  },
  warnText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  medCard: { marginBottom: spacing.sm },
  medHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  medName: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },

  encHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  encHeadText: { flex: 1, minWidth: 0 },
  encTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  encMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 1,
  },

  summaryBox: {
    marginTop: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
  },
  summaryLabel: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.textMuted },
  summaryText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    marginTop: 1,
  },

  resultTable: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  resultMain: { flex: 1, minWidth: 0 },
  resultAnalyte: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  resultRef: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.textMuted, marginTop: 1 },
  resultValueWrap: { alignItems: 'flex-end', gap: 3 },
  resultValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  resultUnit: { fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.textMuted },
});
