/**
 * CORE-006 — Home Dashboard.
 *
 * The app's centrepiece. Everything on it comes from one call to
 * `GET /patient/dashboard`: the Health ID card, the Health Summary band, the
 * Recent Records list, the current medications, the Health Tip carousel and the
 * alert banner.
 */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  fetchDashboard,
  type HealthTip,
  type PortalDashboard,
  type PortalPrescription,
  type RecentRecord,
} from '../../api';
import { Card, Icon, IconName, ListRow, SectionHeader } from '../../components';
import { a11yJoin } from '../../components/a11y';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation, type TFunction } from '../../i18n';
import { colors, iconStroke, radii, spacing, Tint, tintMap, typography } from '../../theme/theme';
import { ScoreRing } from '../../utils/ScoreRing';
import { AsyncBoundary, fmtDate, fmtRelativeDay, fmtTime, isToday, useAsync } from '../care/shared';
import { cacheKeys } from '../../lib/offlineCache';
import { ActionTile, Avatar, BrandHeader } from './shared';

// ── Quick actions ─────────────────────────────────────────────────────────

type QuickAction = { icon: IconName; labelKey: string; go: (nav: any) => void };

const QUICK_ACTIONS: QuickAction[] = [
  { icon: 'calendar-plus', labelKey: 'home.actionBook', go: (n) => n.navigate('BookAppointmentForm') },
  { icon: 'flask', labelKey: 'home.actionLabs', go: (n) => n.navigate('DiagnosticsDashboard') },
  { icon: 'capsule', labelKey: 'home.actionPrescriptions', go: (n) => n.navigate('Medications') },
  {
    icon: 'folder-plus',
    labelKey: 'home.actionRecords',
    go: (n) => n.navigate('MainTabs', { screen: 'HealthTab' }),
  },
  { icon: 'stethoscope', labelKey: 'home.actionProvider', go: (n) => n.navigate('FindProvider') },
];

// ── Recent-record presentation ────────────────────────────────────────────

const RECORD_ICON: Record<RecentRecord['type'], { icon: IconName; tint: Tint; actionKey: string }> = {
  lab_result: { icon: 'flask', tint: 'green', actionKey: 'home.actionViewResult' },
  imaging: { icon: 'lungs', tint: 'blue', actionKey: 'home.actionViewReport' },
  encounter: { icon: 'users', tint: 'purple', actionKey: 'home.actionViewSummary' },
};

function recordLabel(record: RecentRecord, t: TFunction): { text: string; color: string } {
  if (record.type === 'lab_result') {
    return record.is_abnormal
      ? { text: t('home.resultAbnormal'), color: colors.statusCritical }
      : { text: t('home.resultNormal'), color: colors.statusNormal };
  }
  return { text: t(RECORD_ICON[record.type].actionKey), color: colors.link };
}

function metaLabel(record: RecentRecord, t: TFunction): string {
  switch (record.type) {
    case 'lab_result':
      return t('home.typeLabResult');
    case 'imaging':
      return t('home.typeImaging');
    default:
      return t('home.typeEncounter');
  }
}

/** Health-tip glyphs come back as strings; fall back rather than crash. */
function tipIcon(name: string): IconName {
  return (name as IconName) || 'bulb';
}

function tipTint(name: string): Tint {
  return (['green', 'blue', 'purple', 'amber', 'red'] as Tint[]).includes(name as Tint)
    ? (name as Tint)
    : 'blue';
}

/**
 * The greeting is chrome, not clinical content, so it is generated on the
 * device and localized — never taken from `dashboard.greeting`, which the
 * server only ever emits in English and which therefore rendered "Good morning"
 * in the middle of the French UI. Split by local hour: morning < 12:00 ≤
 * afternoon < 18:00 ≤ evening.
 */
function greetingKey(hour: number): string {
  if (hour < 12) return 'home.greetingMorning';
  if (hour < 18) return 'home.greetingAfternoon';
  return 'home.greetingEvening';
}

/** "3 months ago" / « il y a 3 mois » — the caption under the last-checkup date. */
function agoLabel(iso: string, t: TFunction): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const days = Math.max(0, Math.round((Date.now() - then) / 86400000));
  if (days === 0) return t('common.today');
  if (days === 1) return t('common.yesterday');
  if (days < 31) return t('home.agoDays', { count: days });
  const months = Math.round(days / 30);
  if (months < 12) return t('home.agoMonths', { count: months });
  return t('home.agoYears', { count: Math.round(months / 12) });
}

// The server derives this band label from the score and sends it in English
// only; map it to a localized catalogue key so it doesn't render as English
// under a French UI. Keyed by the closed HealthScore['label'] union.
const SCORE_LABEL_KEY: Record<string, string> = {
  Good: 'home.scoreGood',
  Fair: 'home.scoreFair',
  'Needs attention': 'home.scoreNeedsAttention',
  'At risk': 'home.scoreAtRisk',
};

// ── Screen ────────────────────────────────────────────────────────────────

export function HomeDashboardScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  // Cached: the next-appointment line is the single thing a patient opens the
  // app for, and it must be readable with no signal.
  const state = useAsync<PortalDashboard>(fetchDashboard, [], { cacheKey: cacheKeys.dashboard });
  const { reload, reloadIfStale, data } = state;
  const { setMessages, setNotifications } = useUnread();

  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  useEffect(() => {
    if (!data) return;
    setMessages(data.counts.unread_messages);
    setNotifications(data.counts.unread_notifications);
  }, [data, setMessages, setNotifications]);

  const openRecord = (record: RecentRecord) => {
    if (record.type === 'lab_result') navigation.navigate('LabResultDetail', { resultId: record.id });
    else if (record.type === 'imaging') navigation.navigate('ImagingResultDetail', { studyId: record.id });
    else
      navigation.navigate('MainTabs', {
        screen: 'HealthTab',
        params: { screen: 'EncounterDetail', params: { id: record.id } },
      });
  };

  return (
    <View style={styles.screen}>
      <BrandHeader
        onBell={() => navigation.navigate('Notifications')}
        bellBadge={data?.counts.unread_notifications ?? 0}
        right={
          <Avatar
            name={data?.patient.name ?? ''}
            onPress={() => navigation.navigate('MainTabs', { screen: 'ProfileTab' })}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={state.loading && state.data !== null}
            onRefresh={reload}
            tintColor={colors.blue}
          />
        }
      >
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('home.loading')}
        >
          {(d) => (
            <>
              {/* Greeting + Health ID card */}
              <View style={styles.greetRow}>
                <View style={styles.greetCol}>
                  <Text style={styles.greeting}>{t(greetingKey(new Date().getHours()))},</Text>
                  <Text style={styles.name} numberOfLines={2}>
                    {d.patient.name}
                  </Text>
                  <View style={styles.taglineRow}>
                    <Icon name="shield-check" size={16} color={colors.blue} />
                    <Text style={styles.tagline}>{t('home.tagline')}</Text>
                  </View>
                </View>

                {/*
                  Card's onPress wraps in a Touchable, so the flex lives on this
                  View. The title and ID span the full card width: this compact
                  card is a shortcut to the full Health ID screen (the chevron
                  and "View Health ID" say so), and the 62px QR that used to sit
                  beside them squeezed the text column to ~46px at 320 — enough
                  to break « Identifiant » mid-word and clip the ID. The
                  scannable QR lives on that screen, one tap away.
                */}
                <View style={styles.idCardSlot}>
                <Card style={styles.idCard} onPress={() => navigation.navigate('MyHealthId')}>
                  <Text style={styles.idCardTitle} numberOfLines={2}>{t('home.idCardTitle')}</Text>
                  <Text style={styles.idCardValue} numberOfLines={1}>
                    {t('home.idCardValue', { id: d.patient.health_id })}
                  </Text>
                  <View style={styles.idCardLinkRow}>
                    <Text style={styles.idCardLink}>{t('home.idCardLink')}</Text>
                    <Icon name="chevron-right" size={14} color={colors.link} />
                  </View>
                </Card>
                </View>
              </View>

              {/* Health Summary band */}
              <HealthSummary data={d} onViewAll={() => navigation.navigate('MainTabs', { screen: 'HealthTab' })} />

              {/* Quick Actions */}
              <View>
                <SectionHeader
                  title={t('home.quickActions')}
                  actionLabel={t('home.customize')}
                  onAction={() => navigation.navigate('MainTabs', { screen: 'ProfileTab' })}
                />
                <View style={styles.tileRow}>
                  {QUICK_ACTIONS.map((a) => (
                    <ActionTile
                      key={a.labelKey}
                      icon={a.icon}
                      label={t(a.labelKey)}
                      onPress={() => a.go(navigation)}
                    />
                  ))}
                </View>
              </View>

              {/* Recent Health Records */}
              <View>
                <SectionHeader
                  title={t('home.recentRecords')}
                  onAction={() => navigation.navigate('MainTabs', { screen: 'HealthTab' })}
                />
                <Card variant="flush">
                  {d.recent_records.length === 0 ? (
                    <ListRow
                      icon="folder"
                      tint="blue"
                      title={t('home.noRecords')}
                      subtitle={t('home.noRecordsHint')}
                      chevron={false}
                    />
                  ) : (
                    d.recent_records.slice(0, 3).map((r, i, all) => {
                      const label = recordLabel(r, t);
                      return (
                        <ListRow
                          key={`${r.type}-${r.id}`}
                          icon={RECORD_ICON[r.type].icon}
                          tint={RECORD_ICON[r.type].tint}
                          title={r.title}
                          meta={[metaLabel(r, t), r.occurred_at ? fmtDate(r.occurred_at) : null]}
                          value={label.text}
                          valueColor={label.color}
                          onPress={() => openRecord(r)}
                          divider={i < all.length - 1}
                        />
                      );
                    })
                  )}
                </Card>
              </View>

              {/* Current Medications + Health Tip */}
              <View style={styles.twoUp}>
                <MedicationsCard
                  medications={d.current_medications}
                  onViewAll={() => navigation.navigate('Medications')}
                  onOpen={(id) => navigation.navigate('PrescriptionDetail', { prescriptionId: id })}
                />
                <HealthTipCard tips={d.health_tips} />
              </View>

              {/* Alert banner */}
              <AlertBanner data={d} onPress={() => navigation.navigate('Notifications')} />
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

// ── Health Summary band ───────────────────────────────────────────────────

function HealthSummary({ data, onViewAll }: { data: PortalDashboard; onViewAll: () => void }) {
  const { t } = useTranslation();
  const checkup = data.last_checkup;
  const next = data.next_appointment;
  const verified = data.health_id_status === 'verified';

  // A brand-new record has nothing to score, yet the server still sends a
  // number (100). Presenting that as a perfect health score is a meaningless
  // reassurance, so we only show the ring when there is real data behind it —
  // a checkup, a record, a medication, a problem or an allergy — and otherwise
  // say so honestly.
  const hasScoreBasis =
    data.last_checkup != null ||
    data.recent_records.length > 0 ||
    data.current_medications.length > 0 ||
    data.counts.active_problems > 0 ||
    data.counts.allergies > 0;

  return (
    <View style={styles.band}>
      <View style={styles.bandHeader}>
        <View style={styles.bandTitleRow}>
          <Icon name="bar-chart" size={18} color={colors.textOnBrand} strokeWidth={iconStroke.bold} />
          <Text style={styles.bandTitle}>{t('home.summaryTitle')}</Text>
        </View>
        <TouchableOpacity
          onPress={onViewAll}
          accessibilityRole="button"
          // There are four "View all" buttons on this dashboard. Undifferentiated
          // they are four identical entries in the screen reader's button list.
          accessibilityLabel={`${t('home.viewAll')}: ${t('home.summaryTitle')}`}
        >
          <Text style={styles.bandAction}>{t('home.viewAll')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bandInner}>
        <View style={styles.cell}>
          <Text style={styles.cellLabel}>{t('home.overallHealth')}</Text>
          {hasScoreBasis ? (
            <>
              <ScoreRing value={data.health_score.score} size={72} />
              <Text style={[styles.cellCaption, { color: colors.statusNormal }]}>
                {t(SCORE_LABEL_KEY[data.health_score.label] ?? 'home.scoreFair')}
              </Text>
            </>
          ) : (
            <>
              <View style={styles.scoreEmptyRing}>
                <Text style={styles.scoreEmptyMark}>—</Text>
              </View>
              <Text style={styles.cellCaption}>{t('home.noScoreYet')}</Text>
            </>
          )}
        </View>

        <SummaryCell
          label={t('home.lastCheckup')}
          icon="calendar-plus"
          tint="blue"
          value={checkup?.date ? fmtDate(checkup.date) : '—'}
          caption={checkup?.date ? agoLabel(checkup.date, t) : t('home.noVisitRecorded')}
        />

        <SummaryCell
          label={t('home.nextAppointment')}
          icon="calendar-check"
          tint="blue"
          value={next ? fmtDate(next.scheduled_at) : '—'}
          caption={next ? fmtTime(next.scheduled_at) : t('home.nothingBooked')}
        />

        <SummaryCell
          label={t('home.healthIdStatus')}
          icon="shield-check"
          tint={verified ? 'green' : 'amber'}
          value={verified ? t('home.statusVerified') : t('home.statusPending')}
          valueColor={verified ? colors.statusNormal : colors.statusWarning}
          caption={verified ? t('home.allSystemsConnected') : t('home.verificationNeeded')}
        />
      </View>
    </View>
  );
}

function SummaryCell({
  label,
  icon,
  tint,
  value,
  valueColor,
  caption,
}: {
  label: string;
  icon: IconName;
  tint: Tint;
  value: string;
  valueColor?: string;
  caption: string;
}) {
  return (
    <View style={[styles.cell, styles.cellDivided]}>
      <Text style={styles.cellLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.cellCircle, { backgroundColor: tintMap[tint].bg }]}>
        <Icon name={icon} size={20} color={tintMap[tint].fg} />
      </View>
      <Text style={[styles.cellValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.cellCaption} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

// ── Current Medications ───────────────────────────────────────────────────

function MedicationsCard({
  medications,
  onViewAll,
  onOpen,
}: {
  medications: PortalPrescription[];
  onViewAll: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card variant="flush" style={styles.halfCard}>
      <SectionHeader
        title={t('home.currentMedications')}
        actionLabel={t('home.viewAll')}
        onAction={onViewAll}
        style={styles.halfCardHeader}
      />
      {medications.length === 0 ? (
        <Text style={styles.halfCardEmpty}>{t('home.noMedications')}</Text>
      ) : (
        medications.slice(0, 2).map((m, i, all) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.medRow, i < all.length - 1 && styles.medRowDivided]}
            activeOpacity={0.85}
            onPress={() => onOpen(m.id)}
            accessibilityRole="button"
            accessibilityLabel={a11yJoin(
              [m.drug_name, m.dosage].filter(Boolean).join(' '),
              m.frequency ?? m.instructions,
              m.next_dose_at
                ? t('home.nextDose', {
                    day: fmtRelativeDay(m.next_dose_at),
                    time: fmtTime(m.next_dose_at),
                  })
                : m.next_dose_label ?? t('home.noDoseScheduled')
            )}
          >
            <View style={[styles.medCircle, { backgroundColor: tintMap[i === 0 ? 'green' : 'blue'].bg }]}>
              <Icon name="capsule" size={20} color={tintMap[i === 0 ? 'green' : 'blue'].fg} />
            </View>
            <View style={styles.medText}>
              <Text style={styles.medName} numberOfLines={1}>
                {[m.drug_name, m.dosage].filter(Boolean).join(' ')}
              </Text>
              <Text style={styles.medSub} numberOfLines={1}>
                {m.frequency ?? m.instructions ?? '—'}
              </Text>
              <Text
                style={[
                  styles.medDose,
                  { color: isToday(m.next_dose_at) ? colors.statusWarning : colors.statusNormal },
                ]}
                numberOfLines={1}
              >
                {m.next_dose_at
                  ? t('home.nextDose', {
                      day: fmtRelativeDay(m.next_dose_at),
                      time: fmtTime(m.next_dose_at),
                    })
                  : m.next_dose_label ?? t('home.noDoseScheduled')}
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))
      )}
    </Card>
  );
}

// ── Health Tip carousel ───────────────────────────────────────────────────

function HealthTipCard({ tips }: { tips: HealthTip[] }) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const pages = tips.slice(0, 4);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <Card variant="flush" style={styles.halfCard}>
      <View style={styles.tipHeader}>
        <Text style={styles.tipHeading}>{t('home.healthTip')}</Text>
        <Icon name="bulb" size={20} color={colors.blue} />
      </View>

      {pages.length === 0 ? (
        <Text style={styles.halfCardEmpty}>{t('home.noTips')}</Text>
      ) : (
        <>
          <View onLayout={onLayout}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onScroll}
              scrollEventThrottle={16}
            >
              {pages.map((tip) => (
                <View key={tip.id} style={[styles.tipPage, width ? { width } : null]}>
                  <View style={[styles.tipCircle, { backgroundColor: tintMap[tipTint(tip.tint)].bg }]}>
                    <Icon name={tipIcon(tip.icon)} size={26} color={tintMap[tipTint(tip.tint)].fg} />
                  </View>
                  <View style={styles.tipText}>
                    <Text style={styles.tipTitle} numberOfLines={2}>
                      {tip.title}
                    </Text>
                    <Text style={styles.tipBody} numberOfLines={4}>
                      {tip.body}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={styles.dots}>
            {pages.map((tip, i) => (
              <View
                key={tip.id}
                style={[styles.dot, i === page ? styles.dotActive : null]}
              />
            ))}
          </View>
        </>
      )}
    </Card>
  );
}

// ── Alert banner ──────────────────────────────────────────────────────────

function AlertBanner({ data, onPress }: { data: PortalDashboard; onPress: () => void }) {
  const critical = data.alerts.severity === 'critical';
  return (
    <Card
      variant="flush"
      style={[
        styles.alert,
        { backgroundColor: critical ? colors.statusCriticalBg : colors.statusNormalBg },
      ]}
    >
      <ListRow
        icon={critical ? 'alert-triangle' : 'shield-check'}
        tint={critical ? 'red' : 'green'}
        title={data.alerts.title}
        subtitle={data.alerts.body}
        onPress={onPress}
      />
    </Card>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },

  greetRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  greetCol: { flex: 1, minWidth: 0 },
  greeting: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.lg,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  name: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    lineHeight: 30,
    color: colors.textPrimary,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  tagline: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  idCardSlot: { flex: 1 },
  idCard: { padding: 10 },
  idCardTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.blue,
  },
  idCardValue: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  idCardLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6 },
  idCardLink: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.link,
  },

  band: {
    backgroundColor: colors.blue,
    borderRadius: radii.lg,
    padding: 10,
    gap: 10,
  },
  bandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingTop: 2,
  },
  bandTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bandTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textOnBrand,
  },
  bandAction: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textOnBrand,
  },
  bandInner: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
    gap: 6,
  },
  cellDivided: {
    borderLeftWidth: 1,
    borderLeftColor: colors.divider,
  },
  cellLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cellCircle: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  // Same 72px footprint as the ScoreRing so the summary band keeps its height
  // whether or not there is a score to show. A muted ring with an em dash reads
  // as "nothing here yet", not as a zero.
  scoreEmptyRing: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    borderWidth: 6,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreEmptyMark: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 22,
    color: colors.textMuted,
  },
  cellValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 13,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  cellCaption: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },

  tileRow: { flexDirection: 'row', gap: spacing.sm },

  twoUp: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  halfCard: { flex: 1, paddingBottom: 10 },
  halfCardHeader: { paddingHorizontal: 12, paddingTop: 12 },
  halfCardEmpty: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  medRowDivided: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  medCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medText: { flex: 1, minWidth: 0 },
  medName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  medSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  medDose: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
  },

  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
  },
  tipHeading: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  tipPage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: 12,
  },
  tipCircle: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: { flex: 1, minWidth: 0 },
  tipTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  tipBody: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  dotActive: { backgroundColor: colors.blue },

  alert: { borderColor: colors.border },
});
