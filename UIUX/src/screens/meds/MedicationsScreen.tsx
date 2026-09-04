/**
 * MED-001 — Medications & Prescriptions.
 *
 * Navy hero (active count, ongoing treatments, adherence ring, next dose),
 * the filterable prescription list, today's dose timeline with real
 * taken/skip writes, refill reminders and the pharmacy panel.
 *
 * Live data: `/patient/medications`, `/patient/medications/schedule`,
 * `/patient/prescriptions`, `POST /patient/medications/doses/{id}/taken|skip`.
 */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  fetchMedicationSchedule,
  fetchMedications,
  fetchPrescriptions,
  markDoseSkipped,
  markDoseTaken,
  type MedicationDose,
  type MedicationsOverview,
  type PortalPrescription,
  type PrescriptionStatus,
} from '../../api';
import { Card, EmptyState, Icon, LastUpdatedLine, ListRow, SegmentedTabs, StatusBadge, useDialog } from '../../components';
import { type TFunction, useTranslation } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import { cacheKeys } from '../../lib/offlineCache';
import { colors, radii, spacing, typography, tintMap } from '../../theme/theme';
import { ScreenHeader } from '../../components';
import {
  AsyncBoundary,
  DoseRow,
  MedButton,
  ROW_TINTS,
  TintCircle,
  clock,
  daysLeftLabel,
  daysUntil,
  fmtShortDate,
  fmtWhen,
  formIcon,
  prescriptionStatusLabel,
  sortDoses,
  toDate,
  useAsync,
} from './shared';

type Filter = 'active' | 'recent' | 'all';

const FILTERS: { key: Filter; labelKey: string; status: PrescriptionStatus | 'all' }[] = [
  { key: 'active', labelKey: 'meds.list.filterActive', status: 'active' },
  { key: 'recent', labelKey: 'meds.list.filterRecent', status: 'completed' },
  { key: 'all', labelKey: 'meds.list.filterAll', status: 'all' },
];

type Data = {
  overview: MedicationsOverview;
  prescriptions: PortalPrescription[];
  doses: MedicationDose[];
  scheduleDate: string;
};

export function MedicationsScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('active');
  const [busyDose, setBusyDose] = useState<string | null>(null);
  /**
   * Doses whose last write failed. The app cannot tell whether the change
   * landed, so the row has to keep saying so out loud until a reload proves
   * otherwise — silence would sound like success.
   */
  const [unknownDoses, setUnknownDoses] = useState<Set<string>>(() => new Set());
  const dialog = useDialog();
  // Belt and braces against a double tap on a slow link: the ref flips
  // synchronously, before React has re-rendered the disabled row.
  const writing = useRef(false);

  const load = useCallback(async (): Promise<Data> => {
    const status = FILTERS.find((f) => f.key === filter)!.status;
    const [overview, page, schedule] = await Promise.all([
      fetchMedications(),
      fetchPrescriptions({ status, per_page: 20 }),
      fetchMedicationSchedule(),
    ]);
    const day = schedule.days[0];
    return {
      overview,
      prescriptions: page.data,
      doses: day ? sortDoses(day.doses) : [],
      scheduleDate: schedule.from,
    };
  }, [filter]);

  // Cached per filter: a patient with no signal still needs to know what to
  // take today, and the schedule is rendered with its capture time.
  const state = useAsync<Data>(load, [filter], { cacheKey: cacheKeys.medications(filter) });
  const { reload, reloadIfStale } = state;

  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  /** Real, persisted dose write. The sheet only offers legal transitions. */
  function onDosePress(dose: MedicationDose) {
    if (dose.status === 'taken' || dose.status === 'skipped') {
      navigation.navigate('MedicationDetail', { medicationId: dose.prescription_id });
      return;
    }

    dialog.show({
      title: dose.drug_name,
      tone: 'info',
      message: t('meds.dose.sheetMessage', {
        dose: dose.dose_label ?? t('meds.dose.sheetFallback'),
        time: clock(toDate(dose.scheduled_at)),
      }),
      cancelLabel: t('meds.dose.notNow'),
      actions: [
        { label: t('meds.dose.markTaken'), onPress: () => recordDose(dose, 'taken') },
        {
          label: t('meds.dose.skipDose'),
          variant: 'destructive',
          onPress: () => recordDose(dose, 'skipped'),
        },
        {
          label: t('meds.dose.viewMedication'),
          variant: 'secondary',
          onPress: () => navigation.navigate('MedicationDetail', { medicationId: dose.prescription_id }),
        },
      ],
    });
  }

  async function recordDose(dose: MedicationDose, next: 'taken' | 'skipped') {
    if (writing.current) return;
    writing.current = true;
    setBusyDose(dose.id);
    setUnknownDoses((prev) => {
      if (!prev.has(dose.id)) return prev;
      const next = new Set(prev);
      next.delete(dose.id);
      return next;
    });
    try {
      if (next === 'taken') await markDoseTaken(dose.id);
      else await markDoseSkipped(dose.id);
      reload();
    } catch (e) {
      // Reload regardless: if the write did land, the row must stop saying
      // "due" — and the refreshed list is how the patient checks.
      reload();
      setUnknownDoses((prev) => new Set(prev).add(dose.id));
      dialog.show({
        title: t('meds.dose.failTitle'),
        tone: 'critical',
        cancelLabel: t('meds.dose.failOk'),
        message: writeFailureMessage(e, t('meds.dose.failHintList')),
      });
    } finally {
      writing.current = false;
      setBusyDose(null);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('meds.list.title')}
        subtitle={t('meds.list.subtitle')}
        showBack={navigation.canGoBack()}
        right={
          <MedButton
            label={t('meds.list.addPrescription')}
            icon="calendar-plus"
            variant="navy"
            size="sm"
            onPress={() => navigation.navigate('RequestRefill', {})}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={state.loading && state.data !== null} onRefresh={reload} tintColor={colors.blue} />
        }
      >
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('meds.list.loading')}
        >
          {(data) => (
            <>
              <Hero
                t={t}
                overview={data.overview}
                onViewSchedule={() => navigation.navigate('MedicationSchedule', { date: data.scheduleDate })}
              />

              <Card>
                <View style={styles.sectionRow}>
                  <Text style={styles.overline}>{t('meds.list.prescriptionsTitle')}</Text>
                  <SegmentedTabs
                    options={FILTERS.map((f) => ({ key: f.key, label: t(f.labelKey) }))}
                    value={filter}
                    onChange={(k) => setFilter(k as Filter)}
                    style={styles.tabs}
                  />
                </View>

                {data.prescriptions.length === 0 ? (
                  <EmptyState
                    icon="pill"
                    tint="blue"
                    title={t('meds.list.emptyTitle')}
                    message={t('meds.list.emptyBody')}
                  />
                ) : (
                  <View style={styles.stack}>
                    {data.prescriptions.slice(0, 3).map((rx, i) => (
                      <PrescriptionRow
                        key={rx.id}
                        rx={rx}
                        index={i}
                        t={t}
                        onPress={() => navigation.navigate('MedicationDetail', { medicationId: rx.id })}
                      />
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => setFilter('all')}
                  activeOpacity={0.7}
                  style={styles.viewAll}
                  accessibilityRole="button"
                  accessibilityLabel={t('meds.list.viewAllPrescriptions')}
                >
                  <Text style={styles.viewAllText}>{t('meds.list.viewAllPrescriptions')}</Text>
                  <Icon name="chevron-right" size={18} color={colors.link} />
                </TouchableOpacity>
              </Card>

              <Card>
                <View style={styles.sectionRow}>
                  <Text style={styles.overline}>{t('meds.list.scheduleTitle')}</Text>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('MedicationSchedule', { date: data.scheduleDate })}
                    activeOpacity={0.7}
                    style={styles.dateLink}
                    accessibilityRole="button"
                    accessibilityLabel={t('meds.list.scheduleToday', {
                      date: fmtShortDate(data.scheduleDate),
                    })}
                  >
                    <Text style={styles.dateLinkText}>
                      {t('meds.list.scheduleToday', { date: fmtShortDate(data.scheduleDate) })}
                    </Text>
                    <Icon name="calendar" size={18} color={colors.link} />
                  </TouchableOpacity>
                </View>

                {data.doses.length === 0 ? (
                  <EmptyState
                    icon="clock"
                    tint="blue"
                    title={t('meds.list.scheduleEmptyTitle')}
                    message={t('meds.list.scheduleEmptyBody')}
                  />
                ) : (
                  <View>
                    {data.doses.map((d, i) => (
                      <DoseRow
                        key={d.id}
                        dose={d}
                        first={i === 0}
                        last={i === data.doses.length - 1}
                        busy={busyDose === d.id}
                        outcomeUnknown={unknownDoses.has(d.id)}
                        locked={busyDose !== null && busyDose !== d.id}
                        onPress={() => onDosePress(d)}
                      />
                    ))}
                  </View>
                )}
              </Card>

              {/*
                MED-002's entry point.

                Medical Tasks was registered, deep-linkable at /app/tasks and
                reachable from precisely nowhere. It belongs here: the tasks a
                patient is given are overwhelmingly about the medicines,
                analyses and follow-ups this screen is already about, and MED-002
                sits in the same reference group as MED-001.
              */}
              <Card variant="flush">
                <ListRow
                  icon="clipboard"
                  tint="purple"
                  title={t('tasks.entryTitle')}
                  subtitle={t('tasks.entrySubtitle')}
                  onPress={() => navigation.navigate('MedicalTasks')}
                />
              </Card>

              <View style={styles.split}>
                <RefillCard
                  t={t}
                  prescriptions={data.overview.medications}
                  onViewAll={() => navigation.navigate('RequestRefill', {})}
                  onPress={(id) => navigation.navigate('MedicationDetail', { medicationId: id })}
                />
                <PharmacyCard t={t} onOrder={() => navigation.navigate('OrderFromPharmacy', {})} />
              </View>

              <View style={styles.privacy}>
                <Icon name="shield-check" size={24} color={colors.textOnBrand} />
                <View style={styles.privacyBody}>
                  <Text style={styles.privacyTitle}>{t('meds.list.privacyTitle')}</Text>
                  <Text style={styles.privacyNote}>{t('meds.list.privacyNote')}</Text>
                </View>
                <MedButton
                  label={t('meds.list.manageAccess')}
                  icon="users"
                  variant="onNavy"
                  size="sm"
                  onPress={() => navigation.navigate('MainTabs', { screen: 'ProfileTab', params: { sheet: 'privacy' } })}
                />
              </View>

              {/* Doses and refill dates are time-sensitive — say when this was read. */}
              <LastUpdatedLine loadedAt={state.loadedAt} />
            </>
          )}
        </AsyncBoundary>
      </ScrollView>

      {dialog.element}
    </View>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────

function Hero({
  t,
  overview,
  onViewSchedule,
}: {
  t: TFunction;
  overview: MedicationsOverview;
  onViewSchedule: () => void;
}) {
  const next = overview.next_dose;
  const pct = overview.adherence_percent;

  return (
    <View style={styles.hero}>
      <View style={styles.heroCol}>
        <Text style={styles.heroLabel}>{t('meds.list.heroActive')}</Text>
        <Text style={styles.heroNumber}>{String(overview.active_count).padStart(2, '0')}</Text>
        <Text style={[styles.heroLabel, styles.heroLabelSpaced]}>{t('meds.list.heroOngoing')}</Text>
        <Text style={[styles.heroNumber, styles.heroNumberGreen]}>
          {String(overview.ongoing_treatments).padStart(2, '0')}
        </Text>
      </View>

      <AdherenceRing percent={pct} t={t} />

      <View style={styles.heroCol}>
        <Text style={styles.heroLabel}>{t('meds.list.heroNextDose')}</Text>
        <Text style={styles.heroDrug} numberOfLines={2}>
          {next ? next.drug_name : t('meds.list.heroNoDose')}
        </Text>
        <Text style={styles.heroWhen}>
          {next ? fmtWhen(next.scheduled_at, t) : t('meds.list.heroCaughtUp')}
        </Text>
        <MedButton
          label={t('meds.list.heroViewSchedule')}
          icon="calendar-plus"
          variant="onNavy"
          size="sm"
          onPress={onViewSchedule}
          style={styles.heroButton}
        />
      </View>
    </View>
  );
}

/**
 * The adherence dial behind the pill mark. Drawn from two rotated bordered
 * circles so no SVG lives in a screen — the arc grows with the percentage.
 */
function AdherenceRing({ percent, t }: { percent: number | null; t: TFunction }) {
  const pct = Math.max(0, Math.min(100, percent ?? 0));
  const half = pct <= 50;
  return (
    <View style={styles.ringWrap} accessibilityLabel={t('meds.list.adherenceA11y', { percent: pct })}>
      <View style={styles.ringTrack} />
      <View style={[styles.ringArc, { transform: [{ rotate: `${-45 + (half ? pct / 50 : 1) * 180}deg` }] }]} />
      {!half && (
        <View style={[styles.ringArc, styles.ringArcSecond, { transform: [{ rotate: `${135 + ((pct - 50) / 50) * 180}deg` }] }]} />
      )}
      <Icon name="capsule" size={44} color={colors.textOnBrand} strokeWidth={1.8} />
    </View>
  );
}

// ── Rows ──────────────────────────────────────────────────────────────────

function PrescriptionRow({
  rx,
  index,
  t,
  onPress,
}: {
  rx: PortalPrescription;
  index: number;
  t: TFunction;
  onPress: () => void;
}) {
  const tint = ROW_TINTS[index % ROW_TINTS.length];
  return (
    <Card variant="flush" accentColor={tintMap[tint].fg} onPress={onPress}>
      <View style={styles.rxRow}>
        <TintCircle icon={formIcon(rx)} tint={tint} size={48} />
        <View style={styles.rxBody}>
          <Text style={styles.rxTitle} numberOfLines={2}>
            {[rx.drug_name, rx.form].filter(Boolean).join(' ')}
          </Text>
          {!!rx.purpose && <Text style={styles.rxPurpose}>{rx.purpose}</Text>}
          <View style={styles.rxMetaRow}>
            <Icon name="calendar" size={14} color={colors.textMuted} />
            <Text style={styles.rxMeta} numberOfLines={1}>
              {t('meds.list.startedOn', { date: fmtShortDate(rx.starts_on ?? rx.started_at) })}
              {rx.prescriber_name ? `  •  ${rx.prescriber_name}` : ''}
            </Text>
          </View>
        </View>
        <View style={styles.rxRight}>
          <StatusBadge status={rx.status} label={prescriptionStatusLabel(rx.status)} size="sm" />
          {!!rx.dosage && <Text style={styles.rxDose}>{rx.dosage}</Text>}
          {!!rx.frequency && <Text style={styles.rxDose}>{rx.frequency}</Text>}
        </View>
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

// ── Bottom pair ───────────────────────────────────────────────────────────

function RefillCard({
  t,
  prescriptions,
  onViewAll,
  onPress,
}: {
  t: TFunction;
  prescriptions: PortalPrescription[];
  onViewAll: () => void;
  onPress: (id: string) => void;
}) {
  const due = prescriptions
    .filter((p) => !!p.refill_due_on)
    .sort((a, b) => (a.refill_due_on! < b.refill_due_on! ? -1 : 1))
    .slice(0, 2);

  return (
    <Card style={styles.splitCard}>
      <View style={styles.sectionRow}>
        <Text style={styles.overline}>{t('meds.list.refillTitle')}</Text>
        <TouchableOpacity
          onPress={onViewAll}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('meds.list.refillViewAll')}
        >
          <Text style={styles.dateLinkText}>{t('meds.list.refillViewAll')}</Text>
        </TouchableOpacity>
      </View>

      {due.length === 0 ? (
        <Text style={styles.emptyLine}>{t('meds.list.refillNone')}</Text>
      ) : (
        due.map((p, i) => {
          const left = daysUntil(p.refill_due_on!);
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => onPress(p.id)}
              activeOpacity={0.8}
              style={[styles.refillRow, i > 0 && styles.refillDivider]}
              accessibilityRole="button"
            >
              <TintCircle icon="calendar-plus" tint={i === 0 ? 'green' : 'blue'} size={38} />
              <View style={styles.refillBody}>
                <Text style={styles.refillTitle} numberOfLines={2}>
                  {[p.drug_name, p.form].filter(Boolean).join(' ')}
                </Text>
                <Text style={styles.refillMeta} numberOfLines={1}>
                  {t('meds.list.refillOn', { date: fmtShortDate(p.refill_due_on) })}
                </Text>
              </View>
              <StatusBadge
                status={daysLeftLabel(p.refill_due_on!, t)}
                tone={left < 0 ? 'critical' : left <= 3 ? 'warning' : 'pending'}
                size="sm"
              />
            </TouchableOpacity>
          );
        })
      )}
    </Card>
  );
}

function PharmacyCard({ t, onOrder }: { t: TFunction; onOrder: () => void }) {
  return (
    <Card style={[styles.splitCard, styles.pharmacyCard]}>
      <Text style={styles.overline}>{t('meds.list.pharmacyTitle')}</Text>
      <View style={styles.pharmacyBody}>
        <View style={styles.pharmacyMark}>
          <Icon name="truck" size={30} color={colors.blue} />
        </View>
        <Text style={styles.pharmacyText}>{t('meds.list.pharmacyBody')}</Text>
      </View>
      <MedButton label={t('meds.list.pharmacyCta')} icon="cart" variant="navy" onPress={onOrder} />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  stack: { gap: spacing.sm + 2 },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 12,
  },
  overline: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textPrimary,
  },
  tabs: { flexShrink: 0 },

  // -- Hero ----------------------------------------------------------------
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.navy,
  },
  heroCol: { flex: 1, minWidth: 0 },
  heroLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textOnBrand,
  },
  heroLabelSpaced: { marginTop: spacing.sm },
  heroNumber: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xxl,
    lineHeight: typography.lineHeight.xxl,
    color: colors.textOnBrand,
  },
  heroNumberGreen: { color: colors.statusNormal },
  heroDrug: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textOnBrand,
    marginTop: 2,
  },
  heroWhen: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.statusNormal,
    marginTop: 2,
  },
  heroButton: { marginTop: spacing.sm + 2 },

  ringWrap: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  ringTrack: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  ringArc: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 6,
    borderTopColor: colors.statusNormal,
    borderRightColor: colors.statusNormal,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  ringArcSecond: { borderTopColor: colors.statusNormal, borderRightColor: 'transparent' },

  // -- Prescription rows ---------------------------------------------------
  rxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  rxBody: { flex: 1, minWidth: 0, gap: 2 },
  rxTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.md,
    color: colors.textPrimary,
  },
  rxPurpose: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  rxMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  rxMeta: { flex: 1, fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },
  rxRight: { alignItems: 'flex-end', gap: 3, maxWidth: 108 },
  rxDose: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textAlign: 'right',
  },

  // -- Dose timeline -------------------------------------------------------
  doseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12 },
  doseDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  doseRowLocked: { opacity: 0.5 },
  doseTime: { width: 52 },
  doseHour: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
  doseAmPm: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
  doseRail: { width: 12, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  doseRailLine: { position: 'absolute', top: 0, bottom: 0, width: 1.5, backgroundColor: colors.border },
  doseRailLineTop: { top: '50%' },
  doseRailLineBottom: { bottom: '50%' },
  doseDot: { width: 10, height: 10, borderRadius: 5 },
  doseBody: { flex: 1, minWidth: 0, gap: 2 },
  doseDrug: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  doseMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doseMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },
  doseRight: { alignItems: 'flex-end', gap: 4, minWidth: 84 },
  doseWhen: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },

  // -- View all link -------------------------------------------------------
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: spacing.md,
  },
  viewAllText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.link },
  dateLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateLinkText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.link },

  // -- Bottom pair ---------------------------------------------------------
  split: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'stretch' },
  splitCard: { flex: 1, minWidth: 0 },
  emptyLine: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },
  refillRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  refillDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  refillBody: { flex: 1, minWidth: 0, gap: 1 },
  refillTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
  },
  refillMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },

  pharmacyCard: { backgroundColor: colors.surface },
  pharmacyBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  pharmacyMark: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pharmacyText: {
    flex: 1,
    minWidth: 0,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  // -- Privacy banner ------------------------------------------------------
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.navy,
  },
  privacyBody: { flex: 1, minWidth: 0, gap: 2 },
  privacyTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textOnBrand,
  },
  privacyNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.statusNormal,
  },
});
