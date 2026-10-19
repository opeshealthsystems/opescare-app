/**
 * Home — the daily landing surface, on the OPES CORE-006 Home Dashboard layout.
 *
 * Presentation only. The data layer is untouched: `useHealthIdCard`
 * (health id, blood type, status), the auth store's `patient` (name, allergy
 * count), `useUpcomingAppointments`, `useLatestVitals`
 * (GET /mobile/vitals/latest), `useUnreadNotificationCount` (the bell),
 * plus `useTimeline` for the "Recent records" list and
 * `useActivePrescriptionSummary` for the prescriptions cell of the summary
 * band. Nothing here is placeholder; every empty section is a deliberate
 * `EmptyState`.
 *
 * Layout, top to bottom (design reference src/screens/core/HomeDashboardScreen.tsx (archived prototype, see docs/DESIGN_REFERENCE.md)):
 *   BrandHeader (bell + avatar) → greeting + compact Health ID card →
 *   Health Summary band → Quick Actions tiles → Upcoming (AppointmentRow) →
 *   Recent records (flush Card + ListRows) → Health Vitals → care-plan card.
 *
 * Every destination the previous Home reached is still reachable:
 *   /notifications (bell) · /(tabs)/profile (avatar) · /(tabs)/health-id
 *   (ID card, blood-group + status cells) · copy Health ID (ID card) ·
 *   /care-map ("All services" + tile) · /doctors · /appointments/book (tile +
 *   empty CTA) · /blood-finder · /pharmacy · /(tabs)/records (tile, band
 *   "View All", records "View all") · /prescriptions (band cell) ·
 *   /prescriptions/[id] (timeline rows) · /appointments (Upcoming "View all") ·
 *   /appointments/[id] (AppointmentRow) · /care-plans (care-plan card) ·
 *   vitals "See all / Show less" (in place).
 *
 * Deliberate departures from the previous screen, and why:
 *   - The inline QR is gone from the ID card. The kit's compact card is a
 *     shortcut to the full Health ID tab, where the scannable QR lives one tap
 *     away; at 375pt the QR was what clipped the Health ID string.
 *   - Cards are bordered, not shadowed (DESIGN_SPEC §4).
 *   - Colours come from `useTheme()` so the screen follows the palette switch.
 */
import { PaperWave } from '@/components/ui/PaperWave';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import {
  Card,
  CardStack,
  EmptyState,
  Icon,
  ListRow,
  SectionHeader,
  StatusBadge,
  a11yJoin,
  formatDate,
  formatTime,
  iconStroke,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { AppointmentRow, LoadingBlock } from '@/components/care/shared';
import { ActionTile, Avatar, BrandHeader } from '@/components/core/shared';
import { useAuthStore } from '@/lib/store/auth';
import { useHealthIdCard, useTimeline, useUpcomingAppointments } from '@/lib/api/queries';
import { useUnreadNotificationCount } from '@/lib/api/appConfigQueries';
import { useActivePrescriptionSummary } from '@/lib/api/prescriptionQueries';
import {
  isOutOfRange,
  readingAge,
  useLatestVitals,
  type VitalKey,
  type VitalMeasure,
  type VitalStatus,
} from '@/lib/api/vitalsQueries';
import type { TimelineEvent } from '@/lib/api/types';

type Translate = (key: string, options?: Record<string, unknown>) => string;

// ── Quick actions ─────────────────────────────────────────────────────────

type QuickAction = {
  key: string;
  icon: IconName;
  label: (t: Translate) => string;
  route: string;
};

/**
 * Six tiles, two rows of three. Every route is a file under `app/` except
 * `/doctors`, which is being added alongside this screen (linked by path).
 * "Find a facility" / "Find a doctor" have no locale key yet — same keys and
 * defaults as the Quick-Add sheet, so one locale addition fixes both.
 */
const QUICK_ACTIONS: QuickAction[] = [
  {
    key: 'facility',
    icon: 'building',
    label: (t) => t('opesCore.quickAdd.findFacility', { defaultValue: 'Find a facility' }),
    route: '/care-map',
  },
  {
    key: 'doctor',
    icon: 'stethoscope',
    label: (t) => t('opesCore.quickAdd.findDoctor', { defaultValue: 'Find a doctor' }),
    route: '/doctors',
  },
  {
    key: 'book',
    icon: 'calendar-plus',
    label: (t) => t('home.quickActions.bookAppointment'),
    route: '/appointments/book',
  },
  {
    key: 'blood',
    icon: 'droplet',
    label: (t) => t('home.quickActions.findBlood'),
    route: '/blood-finder',
  },
  {
    key: 'medicine',
    icon: 'pill',
    label: (t) => t('pharmacy.title'),
    route: '/pharmacy',
  },
  {
    key: 'records',
    icon: 'folder-plus',
    label: (t) => t('home.quickActions.healthRecords'),
    route: '/(tabs)/records',
  },
];

// ── Recent-record presentation ────────────────────────────────────────────

const RECORD_META: Record<TimelineEvent['event_type'], { icon: IconName; tint: Tint; titleKey: string }> = {
  visit: {
    icon: 'stethoscope',
    tint: 'purple',
    titleKey: 'records.item.visitTitle',
  },
  lab_result: {
    icon: 'flask',
    tint: 'green',
    titleKey: 'records.item.labTitle',
  },
  prescription: {
    icon: 'capsule',
    tint: 'blue',
    titleKey: 'records.item.prescriptionTitle',
  },
};

/** How many timeline rows Home shows before "View all" takes over. */
const RECENT_RECORDS_COUNT = 4;

// ── Vitals presentation ───────────────────────────────────────────────────

/**
 * Kit glyph per measure. The kit has no thermometer / gauge / wind glyphs:
 * blood pressure uses `activity`, breathing and SpO₂ use `lungs`, temperature
 * uses `sun` — reported in the hand-off rather than inlined as SVG here.
 */
const VITAL_META: Record<VitalKey, { icon: IconName; labelKey: string }> = {
  heart_rate: { icon: 'heart-rate', labelKey: 'home.vitals.heartRate' },
  blood_pressure: { icon: 'activity', labelKey: 'home.vitals.bloodPressure' },
  blood_sugar: { icon: 'droplet', labelKey: 'home.vitals.bloodSugar' },
  oxygen_saturation: {
    icon: 'lungs',
    labelKey: 'home.vitals.oxygenSaturation',
  },
  temperature: { icon: 'sun', labelKey: 'home.vitals.temperature' },
  respiratory_rate: { icon: 'lungs', labelKey: 'home.vitals.respiratoryRate' },
};

/** How many readings the card shows before "See all" expands it in place. */
const VITALS_COLLAPSED_COUNT = 4;

/**
 * Tone for an advisory status. `critical` is critical, anything else out of
 * range is warning, `unknown` is deliberately neutral — the API declined to
 * classify, so neither does the UI.
 */
function vitalTone(status: VitalStatus): { tone: StatusTone; tint: Tint } {
  switch (status) {
    case 'normal':
      return { tone: 'normal', tint: 'green' };
    case 'critical':
      return { tone: 'critical', tint: 'red' };
    case 'low':
    case 'high':
    case 'abnormal':
      return { tone: 'warning', tint: 'amber' };
    default:
      return { tone: 'neutral', tint: 'blue' };
  }
}

// ── Formatting ────────────────────────────────────────────────────────────

/** Time-of-day greeting from the device clock — chrome, never server text. */
function greetingKey(hour: number): string {
  if (hour < 12) return 'opesCore.home.greetingMorning';
  if (hour < 18) return 'opesCore.home.greetingAfternoon';
  return 'opesCore.home.greetingEvening';
}

/** `0` is a real, reassuring answer ("None") — not a missing value. */
function formatCount(count: number | null | undefined, t: Translate): string {
  if (count == null) return '—';
  if (count === 0) return t('home.healthId.none');
  return String(count);
}

/**
 * "Last updated: Today, 7:30 AM" only while that is true; otherwise the label
 * degrades to yesterday, an explicit day count, or a full date.
 */
function formatUpdated(recordedAt: string | null, t: Translate): string {
  const age = readingAge(recordedAt);
  if (!recordedAt || age.freshness === 'unknown' || age.days === null) {
    return t('home.vitals.updatedOn', { date: '—' });
  }
  if (age.freshness === 'today') return t('home.vitals.updatedToday', { time: formatTime(recordedAt) });
  if (age.days === 1) return t('home.vitals.updatedYesterday', { time: formatTime(recordedAt) });
  if (age.freshness === 'recent') return t('home.vitals.updatedDaysAgo', { days: age.days });
  return t('home.vitals.updatedOn', { date: formatDate(recordedAt) });
}

// ── Screen ────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, tintMap, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Four summary cells leave ~55pt each below 380dp, which broke labels
  // mid-word ("Prescripti / ons"); there the band goes two-by-two.
  const summaryTwoUp = useWindowDimensions().width < 380;

  const patient = useAuthStore((s) => s.patient);
  const authStatus = useAuthStore((s) => s.status);
  const healthId = useHealthIdCard();
  const appointments = useUpcomingAppointments();
  const vitals = useLatestVitals();
  const timeline = useTimeline(RECENT_RECORDS_COUNT);
  const prescriptions = useActivePrescriptionSummary();
  // Lightweight count endpoint, not the heavy list. Resolves to 0 (no badge)
  // while loading or on error. Gated on auth so it can never fire a pre-auth
  // 401 into the refresh interceptor.
  const unreadCount = useUnreadNotificationCount(authStatus === 'authenticated');

  const nextAppointment = appointments.data?.data?.[0];
  const statusValue = (healthId.data?.status ?? patient?.status ?? '').toLowerCase();
  const isVerified = statusValue === 'verified' || statusValue === 'active';
  const displayName = healthId.data?.display_name ?? patient?.display_name ?? patient?.first_name ?? '';
  const healthIdValue = healthId.data?.health_id ?? patient?.health_id ?? null;
  const bloodGroup = healthId.data?.blood_type ?? patient?.blood_group ?? null;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        healthId.refetch(),
        appointments.refetch(),
        vitals.refetch(),
        timeline.refetch(),
        prescriptions.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [healthId, appointments, vitals, timeline, prescriptions]);

  // ── Copy the Health ID ──────────────────────────────────────────────────
  // Writes the REAL id via expo-clipboard and reports the outcome for two
  // seconds; there is no silent success, and a failure says so.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const onCopyHealthId = useCallback(async () => {
    if (!healthIdValue) return;
    let next: 'copied' | 'failed' = 'copied';
    try {
      await Clipboard.setStringAsync(healthIdValue);
    } catch {
      next = 'failed';
    }
    setCopyState(next);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState('idle'), 2000);
  }, [healthIdValue]);

  // ── Vitals expand/collapse ──────────────────────────────────────────────
  const [vitalsExpanded, setVitalsExpanded] = useState(false);
  const measures = vitals.data?.measures ?? [];
  const visibleMeasures = vitalsExpanded ? measures : measures.slice(0, VITALS_COLLAPSED_COUNT);
  const canExpandVitals = measures.length > VITALS_COLLAPSED_COUNT;
  const vitalsAge = readingAge(vitals.data?.recorded_at);

  const events = timeline.data?.timeline ?? [];

  const openRecord = (ev: TimelineEvent) => {
    if (ev.event_type === 'prescription') router.push(`/prescriptions/${ev.id}`);
    else router.push('/(tabs)/records');
  };

  return (
    <View style={styles.screen}>
      <PaperWave />
      <SafeAreaView edges={['top']} style={styles.safe}>
        <BrandHeader
          onBell={() => router.push('/notifications')}
          bellBadge={unreadCount}
          right={<Avatar name={displayName} uri={patient?.photo_url} onPress={() => router.push('/(tabs)/profile')} />}
        />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
        >
          {/* ── Greeting + compact Health ID card ─────────────────────── */}
          <View style={styles.greetRow}>
            <View style={styles.greetCol}>
              <Text style={styles.greeting}>{t(greetingKey(new Date().getHours()))},</Text>
              <Text style={styles.name} numberOfLines={2}>
                {displayName || '—'}
              </Text>
              <View style={styles.taglineRow}>
                <Icon name="shield-check" size={16} color={colors.blue} />
                <Text style={styles.tagline}>{t('home.subtitle')}</Text>
              </View>
            </View>

            {/* Not itself pressable: the copy button and the "View ID Card"
                link inside it are buttons, and a button inside a button is
                invalid HTML that react-native-web un-nests. */}
            <View style={styles.idCardSlot}>
              <Card style={styles.idCard}>
                <Text style={styles.idCardTitle} numberOfLines={2}>
                  {t('home.healthId.title')}
                </Text>

                {healthId.isLoading ? (
                  <ActivityIndicator color={colors.blue} style={styles.idCardSpinner} />
                ) : healthId.isError && !healthIdValue ? (
                  <TouchableOpacity
                    onPress={() => healthId.refetch()}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.retry')}
                    style={styles.idCardRetry}
                  >
                    <Icon name="alert-circle" size={14} color={colors.statusCritical} />
                    <Text style={styles.idCardRetryText} numberOfLines={2}>
                      {t('home.healthId.loadError')} {t('home.retry')}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.idCardValueRow}>
                    <Text style={styles.idCardValue} numberOfLines={1}>
                      {t('opesCore.home.idCardValue', {
                        id: healthIdValue ?? '—',
                      })}
                    </Text>
                    {healthIdValue ? (
                      <TouchableOpacity
                        onPress={onCopyHealthId}
                        hitSlop={11}
                        accessibilityRole="button"
                        accessibilityLabel={t('home.healthId.copy')}
                        style={styles.copyButton}
                      >
                        <Icon
                          name={copyState === 'copied' ? 'check' : 'copy'}
                          size={20}
                          color={copyState === 'copied' ? colors.statusNormal : colors.link}
                          strokeWidth={iconStroke.bold}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}

                {copyState !== 'idle' ? (
                  <Text
                    style={[
                      styles.copyFeedback,
                      copyState === 'failed' && {
                        color: colors.statusCritical,
                      },
                    ]}
                    numberOfLines={2}
                    accessibilityLiveRegion="polite"
                  >
                    {t(copyState === 'copied' ? 'home.healthId.copied' : 'home.healthId.copyFailed')}
                  </Text>
                ) : (
                  <View style={styles.idCardBadgeRow}>
                    <StatusBadge
                      status={isVerified ? 'verified' : 'pending'}
                      label={t(isVerified ? 'home.healthId.verified' : 'home.healthId.pending')}
                      icon={isVerified ? 'check-circle' : 'clock'}
                      size="sm"
                    />
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/health-id')}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.healthId.viewCard')}
                  accessibilityHint={t('home.healthId.showQr')}
                  style={styles.idCardLinkRow}
                >
                  <Text style={styles.idCardLink} numberOfLines={1}>
                    {t('home.healthId.viewCard')}
                  </Text>
                  <Icon name="chevron-right" size={14} color={colors.link} />
                </TouchableOpacity>
              </Card>
            </View>
          </View>

          {/* ── Health Summary band ───────────────────────────────────── */}
          <View style={styles.band}>
            <View style={styles.bandHeader}>
              <View style={styles.bandTitleRow}>
                <Icon name="bar-chart" size={18} color={colors.textOnBrand} strokeWidth={iconStroke.bold} />
                <Text style={styles.bandTitle}>{t('opesCore.home.summaryTitle')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/records')}
                hitSlop={8}
                accessibilityRole="button"
                // There are several "View all" buttons on this dashboard;
                // naming the section keeps the rotor list navigable.
                accessibilityLabel={`${t('opesCore.home.viewAll')}: ${t('opesCore.home.summaryTitle')}`}
              >
                <Text style={styles.bandAction}>{t('opesCore.home.viewAll')}</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.bandInner, summaryTwoUp && styles.bandInnerWrap]}>
              <SummaryCell
                half={summaryTwoUp}
                styles={styles}
                tintMap={tintMap}
                label={t('home.healthId.bloodGroup')}
                icon="droplet"
                tint="red"
                value={bloodGroup ?? '—'}
                caption={t('opesCore.home.allergiesCaption', {
                  defaultValue: 'Allergies: {{value}}',
                  value: formatCount(patient?.allergies_count, t),
                })}
                onPress={() => router.push('/(tabs)/health-id')}
              />
              <SummaryCell
                half={summaryTwoUp}
                styles={styles}
                tintMap={tintMap}
                divided
                label={t('opesCore.home.nextAppointment')}
                icon="calendar-check"
                tint="blue"
                value={nextAppointment?.scheduled_at ? formatDate(nextAppointment.scheduled_at) : '—'}
                caption={
                  nextAppointment
                    ? nextAppointment.scheduled_at
                      ? formatTime(nextAppointment.scheduled_at)
                      : t('appointments.noDate')
                    : t('opesCore.home.nothingBooked')
                }
                onPress={() =>
                  router.push(nextAppointment ? `/appointments/${nextAppointment.id}` : '/appointments/book')
                }
              />
              <SummaryCell
                half={summaryTwoUp}
                styles={styles}
                tintMap={tintMap}
                divided={!summaryTwoUp}
                label={t('home.quickActions.prescriptions')}
                icon="capsule"
                tint="green"
                value={prescriptions.data ? String(prescriptions.data.prescriptionCount) : '—'}
                caption={
                  prescriptions.data
                    ? t('records.item.prescriptionItems', {
                        count: prescriptions.data.medicationCount,
                      })
                    : prescriptions.isLoading
                      ? t('opesCore.common.loading')
                      : t('opesCore.common.unknown')
                }
                onPress={() => router.push('/prescriptions')}
              />
              <SummaryCell
                half={summaryTwoUp}
                styles={styles}
                tintMap={tintMap}
                divided
                label={t('opesCore.home.healthIdStatus')}
                icon="shield-check"
                tint={isVerified ? 'green' : 'amber'}
                value={t(isVerified ? 'opesCore.home.statusVerified' : 'opesCore.home.statusPending')}
                valueColor={isVerified ? colors.statusNormal : colors.statusWarning}
                caption={t(isVerified ? 'opesCore.home.allSystemsConnected' : 'opesCore.home.verificationNeeded')}
                onPress={() => router.push('/(tabs)/health-id')}
              />
            </View>
          </View>

          {/* ── Quick actions ─────────────────────────────────────────── */}
          <View>
            <SectionHeader
              title={t('home.quickActions.title')}
              actionLabel={t('home.quickActions.viewAllServices')}
              actionChevron
              onAction={() => router.push('/care-map')}
            />
            <View style={styles.tileGrid}>
              {[QUICK_ACTIONS.slice(0, 3), QUICK_ACTIONS.slice(3)].map((row, i) => (
                <View key={i} style={styles.tileRow}>
                  {row.map((a) => (
                    <ActionTile key={a.key} icon={a.icon} label={a.label(t)} onPress={() => router.push(a.route)} />
                  ))}
                </View>
              ))}
            </View>
          </View>

          {/* ── Upcoming appointment ──────────────────────────────────── */}
          <View>
            <SectionHeader
              title={t('appointments.upcoming')}
              actionLabel={t('home.appointment.viewAll')}
              onAction={() => router.push('/appointments')}
            />
            <Card variant="flush">
              {appointments.isLoading ? (
                <LoadingBlock label={t('opesCare.home.loading')} />
              ) : appointments.isError ? (
                <EmptyState
                  icon="alert-circle"
                  tint="red"
                  title={t('home.appointment.loadError')}
                  actionLabel={t('home.retry')}
                  onAction={() => appointments.refetch()}
                />
              ) : nextAppointment ? (
                <AppointmentRow
                  appointment={nextAppointment}
                  onPress={() => router.push(`/appointments/${nextAppointment.id}`)}
                />
              ) : (
                <EmptyState
                  icon="calendar"
                  tint="blue"
                  title={t('home.appointment.empty')}
                  message={t('home.appointment.emptyBody')}
                  actionLabel={t('home.appointment.emptyCta')}
                  onAction={() => router.push('/appointments/book')}
                />
              )}
            </Card>
          </View>

          {/* ── Recent records ────────────────────────────────────────── */}
          <View>
            <SectionHeader title={t('opesCore.home.recentRecords')} onAction={() => router.push('/(tabs)/records')} />
            <CardStack spacing="sm">
              {timeline.isLoading ? (
                <Card variant="flush">
                  <LoadingBlock label={t('records.loading')} />
                </Card>
              ) : timeline.isError ? (
                <Card variant="flush">
                  <EmptyState
                    icon="alert-circle"
                    tint="red"
                    title={t('records.error.title')}
                    message={t('records.error.body')}
                    actionLabel={t('records.error.retry')}
                    onAction={() => timeline.refetch()}
                  />
                </Card>
              ) : events.length === 0 ? (
                <Card variant="flush">
                  <EmptyState
                    icon="folder"
                    tint="blue"
                    title={t('opesCore.home.noRecords')}
                    message={t('opesCore.home.noRecordsHint')}
                  />
                </Card>
              ) : (
                events.slice(0, RECENT_RECORDS_COUNT).map((ev) => {
                  const meta = RECORD_META[ev.event_type];
                  const category = t(`records.category.${ev.event_type}`);
                  // `summary` is the endpoint's English string — a French
                  // patient read "Prescription — 1 item(s)" here, plural
                  // parenthesis and all, because this row printed it verbatim.
                  // `summary_label` is the same line in their language with a
                  // real plural; `summary` remains the fallback for a server
                  // that predates it.
                  const summary = (ev.summary_label ?? ev.summary)?.trim();
                  return (
                    <Card key={`${ev.event_type}-${ev.id}`} variant="flush">
                      <ListRow
                        icon={meta.icon}
                        tint={meta.tint}
                        title={summary || t(meta.titleKey)}
                        meta={[
                          summary ? category : (ev.facility_name ?? t('records.item.unknownFacility')),
                          formatDate(ev.occurred_at),
                        ]}
                        onPress={() => openRecord(ev)}
                      />
                    </Card>
                  );
                })
              )}
            </CardStack>
          </View>

          {/* ── Health Vitals ─────────────────────────────────────────── */}
          {/* "See all" expands in place: there is no vitals screen to send the
              patient to, and a link that goes nowhere useful is worse than none. */}
          <View>
            <SectionHeader
              title={t('home.vitals.title')}
              actionLabel={
                canExpandVitals ? t(vitalsExpanded ? 'home.vitals.showLess' : 'home.vitals.seeAll') : undefined
              }
              onAction={canExpandVitals ? () => setVitalsExpanded((v) => !v) : undefined}
            />
            <CardStack spacing="sm">
              {vitals.isLoading ? (
                <Card variant="flush">
                  <LoadingBlock />
                </Card>
              ) : vitals.isError ? (
                <Card variant="flush">
                  <EmptyState
                    icon="alert-circle"
                    tint="red"
                    title={t('home.vitals.loadError')}
                    actionLabel={t('home.retry')}
                    onAction={() => vitals.refetch()}
                  />
                </Card>
              ) : measures.length === 0 ? (
                <Card variant="flush">
                  <EmptyState
                    icon="heart-rate"
                    tint="blue"
                    title={t('home.vitals.empty')}
                    message={t('home.vitals.emptyBody')}
                  />
                </Card>
              ) : (
                <>
                  {visibleMeasures.map((m: VitalMeasure) => {
                    const meta = VITAL_META[m.key];
                    const { tone, tint } = vitalTone(m.status);
                    const flagged = isOutOfRange(m.status) || m.status === 'unknown';
                    return (
                      <Card key={m.key} variant="flush">
                        <ListRow
                          icon={meta?.icon ?? 'heart-rate'}
                          tint={tint}
                          title={meta ? t(meta.labelKey) : m.key}
                          // The status in words as well as in colour — never colour alone.
                          subtitle={flagged ? t(`home.vitals.status.${m.status}`) : undefined}
                          value={m.unit ? `${m.value} ${m.unit}` : m.value}
                          valueColor={statusMap[tone].fg}
                          chevron={false}
                        />
                      </Card>
                    );
                  })}
                  <View style={styles.vitalsFooter}>
                    <Text style={styles.vitalsUpdated} numberOfLines={2}>
                      {formatUpdated(vitals.data?.recorded_at ?? null, t)}
                    </Text>
                    {vitalsAge.freshness === 'stale' ? (
                      <Text style={styles.vitalsStale} numberOfLines={2}>
                        {t('home.vitals.staleNote')}
                      </Text>
                    ) : null}
                  </View>
                </>
              )}
            </CardStack>
          </View>

          {/* ── Care-plan card ────────────────────────────────────────── */}
          <Card
            onPress={() => router.push('/care-plans')}
            accessibilityLabel={a11yJoin(t('home.insights.title'), t('home.insights.body'))}
            accessibilityHint={t('home.insights.cta')}
          >
            <View style={styles.promoHeader}>
              <View style={styles.promoIcon}>
                <Icon name="target" size={24} color={tintMap.blue.fg} />
              </View>
              <Text style={styles.promoTitle} numberOfLines={2}>
                {t('home.insights.title')}
              </Text>
            </View>
            <Text style={styles.promoBody}>{t('home.insights.body')}</Text>
            <View style={styles.promoCtaRow}>
              <Text style={styles.promoCta}>{t('home.insights.cta')}</Text>
              <Icon name="chevron-right" size={16} color={colors.link} />
            </View>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Health Summary cell ───────────────────────────────────────────────────

type Styles = ReturnType<typeof makeStyles>;

function SummaryCell({
  styles,
  tintMap,
  label,
  icon,
  tint,
  value,
  valueColor,
  caption,
  divided,
  half,
  onPress,
}: {
  styles: Styles;
  tintMap: Record<Tint, { bg: string; fg: string }>;
  label: string;
  icon: IconName;
  tint: Tint;
  value: string;
  valueColor?: string;
  caption: string;
  divided?: boolean;
  half?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Text style={styles.cellLabel} numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.cellCircle}>
        <Icon name={icon} size={28} color={tintMap[tint].fg} />
      </View>
      <Text style={[styles.cellValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.cellCaption} numberOfLines={2}>
        {caption}
      </Text>
    </>
  );

  if (!onPress)
    return <View style={[styles.cell, half && styles.cellHalf, divided && styles.cellDivided]}>{body}</View>;
  return (
    <TouchableOpacity
      style={[styles.cell, half && styles.cellHalf, divided && styles.cellDivided]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={a11yJoin(label, value, caption)}
    >
      {body}
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    safe: { flex: 1 },
    content: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },

    greetRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
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

    idCardSlot: { flex: 1, minWidth: 0 },
    idCard: { padding: 10 },
    idCardTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: 18,
      color: colors.blue,
    },
    idCardSpinner: { alignSelf: 'flex-start', marginVertical: 6 },
    idCardValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    idCardValue: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: colors.textSecondary,
    },
    copyButton: {
      width: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copyFeedback: {
      marginTop: 6,
      fontFamily: typography.fontFamily.medium,
      fontSize: 10,
      lineHeight: 13,
      color: colors.statusNormal,
    },
    idCardBadgeRow: { flexDirection: 'row', marginTop: 6 },
    idCardRetry: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    idCardRetryText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 13,
      color: colors.textSecondary,
    },
    idCardLinkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginTop: 6,
      alignSelf: 'flex-start',
    },
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
      minWidth: 0,
      alignItems: 'center',
      paddingHorizontal: 4,
      gap: 6,
    },
    bandInnerWrap: { flexWrap: 'wrap', rowGap: 14 },
    cellHalf: { flexBasis: '50%', flexGrow: 0, flexShrink: 0 },
    cellDivided: {
      borderLeftWidth: 1,
      borderLeftColor: colors.divider,
    },
    cellLabel: {
      minHeight: 28,
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      lineHeight: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    cellCircle: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 6,
    },
    cellValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    cellCaption: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 13,
      color: colors.textMuted,
      textAlign: 'center',
    },

    tileGrid: { gap: spacing.sm },
    tileRow: { flexDirection: 'row', gap: spacing.sm },

    vitalsFooter: {
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      gap: 4,
    },
    vitalsUpdated: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    vitalsStale: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.statusWarning,
    },

    promoHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    promoIcon: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    promoTitle: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: colors.textPrimary,
    },
    promoBody: {
      marginTop: 10,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    promoCtaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginTop: 12,
    },
    promoCta: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
    },
  });
