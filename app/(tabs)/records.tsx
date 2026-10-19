import React, { useMemo, useState } from 'react';
/**
 * Records hub — the patient's longitudinal clinical record.
 *
 * Built on the OPES kit's screen skeleton (DESIGN_SPEC §13): a `ScreenHeader`
 * with the export action, then one `SectionHeader` + flush `Card` of
 * `ListRow`s per section — browse hub, allergies, conditions, immunizations,
 * latest vitals and the recent timeline — closing on the privacy row. Tint
 * circles follow §1 (labs/meds green, documents blue, referrals/consults
 * purple, allergies red, conditions amber); statuses render as `StatusBadge`s.
 *
 * Data is unchanged: GET /mobile/timeline (visits, resulted labs,
 * prescriptions), /mobile/allergies (+ blood group), /mobile/clinical
 * (conditions), /mobile/immunizations and /mobile/vitals/latest. The backend
 * already excludes entered-in-error rows; nothing is filtered or synthesised
 * here — counts come from the responses themselves.
 *
 * Four states stay deliberately distinct: a loading block while the record
 * queries are in flight, a retry empty-state when *every* record query
 * failed, the onboarding-style empty state for a genuinely empty record (the
 * common case for a newly issued Health ID), and a `StaleNotice` when part of
 * the record failed or the phone is offline — so a section is never shown as
 * empty when it merely failed.
 */
import { usePrivateScreen } from '@/lib/security/usePrivateScreen';

import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  ScreenHeader,
  ResultList,
  SectionHeader,
  StaleNotice,
  StatusBadge,
  formatDate,
  formatLabel,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock } from '@/components/care/shared';
import { useAuthStore } from '@/lib/store/auth';
import { useIsOnline } from '@/lib/offline';
import { useAllergies, useClinical, useImmunizations, useTimeline } from '@/lib/api/queries';
import { useLatestVitals, type VitalKey, type VitalStatus } from '@/lib/api/vitalsQueries';
import type { TimelineEvent } from '@/lib/api/types';
import '../../lib/api/importRecordsQueries';

/** How many rows a section shows before "View all" expands it. */
const PREVIEW = 3;
const TIMELINE_PREVIEW = 5;

type FeedType = TimelineEvent['event_type'];

interface FeedItem {
  key: string;
  type: FeedType;
  title: string;
  /** Clinical payload line — test name, visit type, item count. */
  descriptor: string | null;
  facility: string | null;
  dateLabel: string | null;
  sortValue: number;
  /** A route that actually exists under app/, or null when there is no detail screen. */
  href: string | null;
  actionLabel: string | null;
}

/** §1 tint conventions for the timeline: labs/meds green, consultations purple. */
const FEED_META: Record<FeedType, { icon: IconName; tint: Tint }> = {
  visit: { icon: 'stethoscope', tint: 'purple' },
  lab_result: { icon: 'flask', tint: 'green' },
  prescription: { icon: 'pill', tint: 'green' },
};

const VITAL_META: Record<VitalKey, { labelKey: string; fallback: string; icon: IconName }> = {
  heart_rate: { labelKey: 'opesRecords.vitals.pulse', fallback: 'Pulse', icon: 'heart-rate' },
  blood_pressure: { labelKey: 'opesRecords.vitals.bloodPressure', fallback: 'Blood pressure', icon: 'heart-pulse' },
  blood_sugar: { labelKey: 'opesRecords.vitals.bloodSugar', fallback: 'Blood sugar', icon: 'droplet' },
  oxygen_saturation: { labelKey: 'opesRecords.vitals.oxygenLevel', fallback: 'Oxygen level', icon: 'lungs' },
  // No thermometer glyph in the kit set yet — `activity` stands in.
  temperature: { labelKey: 'opesRecords.vitals.temperature', fallback: 'Temperature', icon: 'activity' },
  respiratory_rate: { labelKey: 'opesRecords.vitals.breathingRate', fallback: 'Breathing rate', icon: 'lungs' },
};

/** Advisory band for a vital — the API flags, a human decides. */
function vitalBand(status: VitalStatus): { tone: StatusTone; tint: Tint; labelKey: string | null } {
  switch (status) {
    case 'normal':
      return { tone: 'normal', tint: 'green', labelKey: 'opesRecords.vitals.bandInRange' };
    case 'critical':
      return { tone: 'critical', tint: 'red', labelKey: 'opesRecords.vitals.bandWellOutside' };
    case 'low':
    case 'high':
    case 'abnormal':
      return { tone: 'warning', tint: 'amber', labelKey: 'opesRecords.vitals.bandOutside' };
    default:
      return { tone: 'neutral', tint: 'blue', labelKey: null };
  }
}

/** Allergy severity → badge tone. Anything unmapped stays neutral. */
function severityTone(severity: string): StatusTone {
  const s = severity.toLowerCase();
  if (s === 'severe' || s === 'high') return 'critical';
  if (s === 'moderate') return 'warning';
  if (s === 'mild' || s === 'low') return 'normal';
  return 'neutral';
}

/** Turns a raw enum-ish API token ("lab-only") into readable fallback text. */
function humanize(raw: string): string {
  return formatLabel(raw.replace(/[-_]/g, ' '));
}

/**
 * The timeline endpoint returns an English summary shaped
 * "Lab result — Full Blood Count". The label before the dash is chrome we can
 * localise; the part after it is real clinical data and is shown verbatim.
 */
function summaryTail(summary: string): string | null {
  const idx = summary.indexOf('—');
  const tail = idx === -1 ? summary : summary.slice(idx + 1);
  const trimmed = tail.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const ms = (iso: string | null | undefined): number => {
  if (!iso) return 0;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

export default function RecordsScreen() {
  usePrivateScreen();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, statusMap } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const online = useIsOnline();
  const patient = useAuthStore((st) => st.patient);

  const timeline = useTimeline();
  const allergies = useAllergies();
  const clinical = useClinical();
  const immunizations = useImmunizations();
  const vitals = useLatestVitals();

  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setShowAll((prev) => ({ ...prev, [key]: !prev[key] }));

  // The four record queries decide the screen state; vitals is advisory.
  const core = [timeline, allergies, clinical, immunizations];
  const firstLoad = core.every((q) => q.data === undefined) && core.some((q) => q.isLoading);
  const allFailed = core.every((q) => q.isError && q.data === undefined);
  const failedCount = core.filter((q) => q.isError).length;
  const hasAnyData = core.some((q) => q.data !== undefined);
  const isRefreshing = core.some((q) => q.isRefetching) || vitals.isRefetching;
  const stale = hasAnyData && (failedCount > 0 || !online);
  const loadedAtMs = Math.max(0, ...core.map((q) => (q.data !== undefined ? q.dataUpdatedAt : 0)));
  const loadedAt = loadedAtMs > 0 ? new Date(loadedAtMs) : null;

  const refetchAll = () => {
    void timeline.refetch();
    void allergies.refetch();
    void clinical.refetch();
    void immunizations.refetch();
    void vitals.refetch();
  };

  const enumLabel = (group: string, value: string | null | undefined) => {
    if (!value) return null;
    return t(`records.${group}.${value}`, { defaultValue: humanize(value) });
  };

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const ev of timeline.data?.timeline ?? []) {
      const tail = summaryTail(ev.summary);
      let descriptor: string | null = tail;
      let href: string | null = null;
      let actionLabel: string | null = null;

      // `detail_label` is the server's own tail — already in the patient's
      // language, already pluralised, out of lang/{en,fr}/patient_timeline.php.
      // Preferring it means one vocabulary rather than this screen re-deriving
      // one by parsing an English string. The parsing stays as the fallback for
      // a server that predates the field.
      if (ev.event_type === 'lab_result') {
        // The tail is the test name — real clinical data, shown as-is. The
        // dedicated lab detail screen is not part of the finder build.
        descriptor = ev.detail_label ?? tail;
      } else if (ev.event_type === 'prescription') {
        // "3 item(s)" — recover the real count so it can be pluralised properly.
        const n = tail ? Number.parseInt(tail, 10) : Number.NaN;
        descriptor =
          ev.detail_label ??
          (Number.isNaN(n) ? tail : t('records.item.prescriptionItems', { count: n }));
        href = `/prescriptions/${ev.id}`;
        actionLabel = t('records.action.viewPrescription');
      } else {
        // Visit: the tail is a visit_type token (outpatient, lab-only, …).
        descriptor = ev.detail_label ?? (tail ? enumLabel('visitType', tail) : null);
      }

      items.push({
        key: `${ev.event_type}-${ev.id}`,
        type: ev.event_type,
        title: t(
          `records.item.${ev.event_type === 'visit' ? 'visitTitle' : ev.event_type === 'lab_result' ? 'labTitle' : 'prescriptionTitle'}`,
        ),
        descriptor,
        facility: ev.facility_name,
        dateLabel: formatDate(ev.occurred_at, '') || null,
        sortValue: ms(ev.occurred_at),
        href,
        actionLabel,
      });
    }
    return items.sort((x, y) => y.sortValue - x.sortValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline.data, t]);

  const allergyRows = allergies.data?.allergies ?? [];
  const conditionRows = clinical.data?.conditions ?? [];
  const immunizationRows = immunizations.data?.immunizations ?? [];
  const vitalRows = vitals.data?.measures ?? [];
  const bloodGroup = allergies.data?.blood_group ?? patient?.blood_group ?? null;

  const recordIsEmpty =
    failedCount === 0 &&
    core.every((q) => q.data !== undefined) &&
    feed.length === 0 &&
    allergyRows.length === 0 &&
    conditionRows.length === 0 &&
    immunizationRows.length === 0;

  const limit = <T,>(rows: T[], key: string, n = PREVIEW) => (showAll[key] ? rows : rows.slice(0, n));

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScreenHeader
        title={t('records.title')}
        subtitle={t('records.subtitle')}
        showBack={false}
        actions={[
          { icon: 'download', onPress: () => router.push('/export-records'), accessibilityLabel: t('records.exportA11y') },
          { icon: 'upload', onPress: () => router.push('/import-records'), accessibilityLabel: t('importRecords.importA11y') },
        ]}
      />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refetchAll} tintColor={colors.blue} />}
      >
        {bloodGroup ? (
          <View style={s.badgeRow}>
            <StatusBadge status="blood-group" tone="critical" icon="droplet" label={t('records.bloodGroup', { group: bloodGroup })} />
          </View>
        ) : null}

        {firstLoad ? (
          <LoadingBlock label={t('records.loading')} />
        ) : allFailed ? (
          <Card>
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('records.error.title')}
              message={t('records.error.body')}
              actionLabel={t('records.error.retry')}
              onAction={refetchAll}
            />
          </Card>
        ) : (
          <>
            {stale ? (
              <StaleNotice
                message={!online ? t('opesCore.errors.offlineBody') : t('records.partial.body')}
                loadedAt={loadedAt}
                onRetry={refetchAll}
                retrying={isRefreshing}
              />
            ) : null}

            {/* Browse hub — every row is a route that exists under app/. */}
            <View>
              <SectionHeader variant="overline" title={t('records.browse.heading')} />
              <Card variant="flush">
                <ListRow
                  icon="pill"
                  tint="green"
                  title={t('records.browse.prescriptions')}
                  subtitle={t('opesRecords.hub.prescriptionsHint')}
                  onPress={() => router.push('/prescriptions')}
                  divider
                />
                <ListRow
                  icon="document-text"
                  tint="blue"
                  title={t('records.browse.documents')}
                  subtitle={t('opesRecords.hub.documentsHint')}
                  onPress={() => router.push('/documents')}
                  divider
                />
                <ListRow
                  icon="clipboard"
                  tint="blue"
                  title={t('carePlans.title')}
                  subtitle={t('opesRecords.hub.carePlansHint', { defaultValue: 'Goals and next steps from your care team' })}
                  onPress={() => router.push('/care-plans')}
                  divider
                />
                <ListRow
                  icon="send"
                  tint="purple"
                  title={t('referrals.title')}
                  subtitle={t('referrals.subtitle')}
                  onPress={() => router.push('/referrals')}
                />
              </Card>
            </View>

            {recordIsEmpty ? (
              <EmptyRecord
                onFindCare={() => router.push('/care-map')}
                onBook={() => router.push('/appointments/book')}
              />
            ) : (
              <>
                {/* Allergies */}
                {allergies.data ? (
                  <Section
                    title={t('opesRecords.allergies.title')}
                    count={allergyRows.length}
                    expanded={!!showAll.allergies}
                    onToggle={() => toggle('allergies')}
                  >
                    {allergyRows.length === 0 ? (
                      <EmptyState icon="alert-triangle" tint="red" title={t('opesRecords.allergies.empty')} />
                    ) : (
                      limit(allergyRows, 'allergies').map((a, i, arr) => (
                        <ListRow
                          key={a.id}
                          icon="alert-triangle"
                          tint="red"
                          title={a.substance}
                          meta={[a.recorded ? t('records.item.recordedOn', { date: formatDate(a.recorded, '') }) : null]}
                          trailing={
                            a.severity ? (
                              <StatusBadge status={a.severity} tone={severityTone(a.severity)} label={enumLabel('status', a.severity) ?? ''} size="sm" />
                            ) : (
                              <StatusBadge status={a.status} label={enumLabel('status', a.status) ?? ''} size="sm" />
                            )
                          }
                          divider={i < arr.length - 1}
                        />
                      ))
                    )}
                  </Section>
                ) : null}

                {/* Conditions */}
                {clinical.data ? (
                  <Section
                    title={t('records.summary.conditions')}
                    count={conditionRows.length}
                    expanded={!!showAll.conditions}
                    onToggle={() => toggle('conditions')}
                  >
                    {conditionRows.length === 0 ? (
                      <EmptyState icon="activity" tint="amber" title={t('opesRecords.diagnoses.empty')} />
                    ) : (
                      limit(conditionRows, 'conditions').map((c, i, arr) => (
                        <ListRow
                          key={c.id}
                          icon="activity"
                          tint="amber"
                          title={c.display_name}
                          meta={[
                            c.code ? `${c.code_system ? `${c.code_system} ` : ''}${c.code}` : null,
                            c.recorded ? t('records.item.recordedOn', { date: formatDate(c.recorded, '') }) : null,
                          ]}
                          trailing={<StatusBadge status={c.status} label={enumLabel('status', c.status) ?? ''} size="sm" />}
                          divider={i < arr.length - 1}
                        />
                      ))
                    )}
                  </Section>
                ) : null}

                {/* Immunizations */}
                {immunizations.data ? (
                  <Section
                    title={t('opesRecords.immunizations.title')}
                    count={immunizationRows.length}
                    expanded={!!showAll.immunizations}
                    onToggle={() => toggle('immunizations')}
                  >
                    {immunizationRows.length === 0 ? (
                      <EmptyState icon="syringe" tint="green" title={t('opesRecords.immunizations.empty')} />
                    ) : (
                      limit(immunizationRows, 'immunizations').map((im, i, arr) => (
                        <ListRow
                          key={im.id}
                          icon="syringe"
                          tint="green"
                          title={im.vaccine_name}
                          meta={[
                            im.dose_number ? t('opesRecords.immunizations.dose', { number: im.dose_number }) : null,
                            im.administered_at
                              ? t('opesRecords.immunizations.given', { date: formatDate(im.administered_at, '') })
                              : null,
                          ]}
                          trailing={<StatusBadge status={im.status} label={enumLabel('status', im.status) ?? ''} size="sm" />}
                          divider={i < arr.length - 1}
                        />
                      ))
                    )}
                  </Section>
                ) : null}

                {/* Latest vitals — advisory bands only; shown when the endpoint has readings. */}
                {vitalRows.length > 0 ? (
                  <View>
                    <SectionHeader title={t('opesRecords.vitals.title')} />
                    <Card variant="flush">
                      {vitalRows.map((m, i) => {
                        const meta = VITAL_META[m.key] ?? VITAL_META.heart_rate;
                        const band = vitalBand(m.status);
                        return (
                          <ListRow
                            key={m.key}
                            icon={meta.icon}
                            tint={band.tint}
                            title={t(meta.labelKey, { defaultValue: meta.fallback })}
                            meta={[band.labelKey ? t(band.labelKey) : null, formatDate(m.recorded_at, '')]}
                            value={`${m.value}${m.unit ? ` ${m.unit}` : ''}`}
                            valueColor={band.tone === 'neutral' ? colors.textPrimary : statusMap[band.tone].fg}
                            divider={i < vitalRows.length - 1}
                          />
                        );
                      })}
                    </Card>
                  </View>
                ) : null}

                {/* Recent timeline */}
                {timeline.data ? (
                  <Section
                    title={t('records.timeline.heading')}
                    count={feed.length}
                    preview={TIMELINE_PREVIEW}
                    expanded={!!showAll.timeline}
                    onToggle={() => toggle('timeline')}
                    variant="results"
                  >
                    {feed.length === 0 ? (
                      <EmptyState icon="history" tint="blue" title={t('opesRecords.timeline.empty')} />
                    ) : (
                      limit(feed, 'timeline', TIMELINE_PREVIEW).map((item) => {
                        const meta = FEED_META[item.type];
                        return (
                          <ListRow
                            key={item.key}
                            icon={meta.icon}
                            tint={meta.tint}
                            title={item.title}
                            meta={[item.descriptor, item.facility ?? t('records.item.unknownFacility'), item.dateLabel]}
                            onPress={item.href ? () => router.push(item.href as string) : undefined}
                            accessibilityHint={item.actionLabel ?? undefined}
                            divider={false}
                          />
                        );
                      })
                    )}
                  </Section>
                ) : null}
              </>
            )}

            {/* Trust footer — a privacy assurance paired with a real action. */}
            <Card variant="flush">
              <ListRow
                icon="shield-check"
                tint="green"
                title={t('records.privacy.title')}
                subtitle={t('records.privacy.body')}
                onPress={() => router.push('/privacy')}
                accessibilityHint={t('records.privacy.action')}
              />
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ pieces */

/**
 * Section header + body; "View all" toggles past the preview.
 *
 * `variant` decides how the body is drawn, and the two cases are genuinely
 * different things:
 *
 *  - `facts` (default) keeps the joined flush card. Allergies, conditions,
 *    immunisations and vitals are this patient's clinical facts — one table
 *    about one person, where the hairline between rows is what says they
 *    belong together.
 *  - `results` gives each child its own card. The timeline is a feed of
 *    separate records — a lab result, a prescription, a visit — each opening
 *    somewhere different. Those are picked from, not read down, so they get
 *    the same treatment as every other result list in the app.
 */
function Section({
  title,
  count,
  preview = PREVIEW,
  expanded,
  onToggle,
  variant = 'facts',
  children,
}: {
  title: string;
  count: number;
  preview?: number;
  expanded: boolean;
  onToggle: () => void;
  variant?: 'facts' | 'results';
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const canToggle = count > preview;
  return (
    <View>
      <SectionHeader
        title={count > 0 ? `${title} (${count})` : title}
        onAction={canToggle ? onToggle : undefined}
        actionLabel={expanded ? t('opesRecords.hub.showFewer', { defaultValue: 'Show fewer' }) : undefined}
        actionChevron
      />
      {variant === 'results' ? (
        <ResultList>
          {React.Children.map(children, (child, index) =>
            // An EmptyState is one panel, not a row — it must not be sliced
            // into per-child cards.
            React.isValidElement(child) ? (
              <Card key={index} variant="flush">
                {child}
              </Card>
            ) : (
              child
            ),
          )}
        </ResultList>
      ) : (
        <Card variant="flush">{children}</Card>
      )}
    </View>
  );
}

/**
 * Empty: the state this screen is in for every newly issued Health ID. It has
 * to say "nothing is wrong and nothing is missing", explain how the record
 * actually fills up, and give the patient the two things they can genuinely do
 * next — both routes exist.
 */
function EmptyRecord({ onFindCare, onBook }: { onFindCare: () => void; onBook: () => void }) {
  const { t } = useTranslation();
  const steps: { icon: IconName; title: string; body: string }[] = [
    { icon: 'building', title: t('records.empty.step1Title'), body: t('records.empty.step1Body') },
    { icon: 'stethoscope', title: t('records.empty.step2Title'), body: t('records.empty.step2Body') },
    { icon: 'heart-pulse', title: t('records.empty.step3Title'), body: t('records.empty.step3Body') },
  ];
  return (
    <>
      <Card>
        <EmptyState
          icon="folder"
          tint="blue"
          title={t('records.empty.title')}
          message={t('records.empty.body')}
          actionLabel={t('records.empty.findCare')}
          onAction={onFindCare}
        />
      </Card>
      <View>
        <SectionHeader title={t('records.empty.stepsHeading')} />
        <Card variant="flush">
          {steps.map((step, i) => (
            <StepRow key={step.title} icon={step.icon} title={step.title} body={step.body} divider={i < steps.length - 1} />
          ))}
        </Card>
      </View>
      <CareButton variant="secondary" icon="calendar" label={t('records.empty.bookVisit')} onPress={onBook} />
    </>
  );
}

/** A §8 row whose body is allowed to wrap — explanatory prose, not a record. */
function StepRow({ icon, title, body, divider }: { icon: IconName; title: string; body: string; divider: boolean }) {
  const { colors, tintMap } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const tint = tintMap.blue;
  return (
    <View style={[s.stepRow, divider && s.rowDivider]} accessible accessibilityLabel={`${title}. ${body}`}>
      <View style={[s.stepMark, { backgroundColor: tint.bg }]}>
        <Icon name={icon} size={24} color={tint.fg} />
      </View>
      <View style={s.stepBody}>
        <Text style={s.stepTitle}>{title}</Text>
        <Text style={s.stepText}>{body}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ styles */

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
    badgeRow: { flexDirection: 'row' },

    rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
    },
    stepMark: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBody: { flex: 1, minWidth: 0, gap: 2 },
    stepTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    stepText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
  });
