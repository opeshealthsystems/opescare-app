/**
 * Family member detail — a dependent's Health ID card and records, seen by
 * their guardian.
 *
 * Data: GET /mobile/family/members/{linkId} (the link, the dependent's card
 * fields, immunisations, upcoming appointments and record counts), then the
 * dependent's own timeline / prescriptions / lab results read through the
 * ordinary endpoints with the `X-OpesCare-Dependent` act-as header
 * (lib/api/familyQueries.ts). Nothing here is fabricated: a server without
 * the route, a link that was revoked or lapsed at 18, and a link that no
 * longer exists each get their own honest empty state.
 *
 * The credential is the same `SecureCredentialCard` the Health ID tab
 * renders for the signed-in patient — fed `modelFromLive()` over the
 * dependent's card fields, so the anatomical hologram follows THEIR sex and
 * age (a boy, a girl, an adult). On a read-only link the server withholds the
 * QR payload and this screen says plainly that presenting or sharing is not
 * available; there is no Presentation Mode for a dependent here.
 *
 * Every read on this screen is written to the dependent's access log by the
 * server; the footer says so.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SegmentedTabs,
  StatusBadge,
  formatDate,
  formatDateTime,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { SecureCredentialCard } from '@/components/health-id/SecureCredentialCard';
import { PresentationMode } from '@/components/health-id/PresentationMode';
import { VERIFIED_STATUSES, formatCountdown, modelFromLive, titleCase, toneFor } from '@/components/health-id/model';
import { CareButton } from '@/components/care/shared';
import type { TemporaryQrCode } from '@/lib/api/types';
import {
  AccessBadge,
  FamilyErrorState,
  LoadingCard,
  Notice,
  SummaryTile,
  accessLabelOf,
  relationshipLabelOf,
} from '@/components/family/shared';
import { resolveStatusLabel } from '@/components/prescriptions/status';
import { statusLabelOf, statusToneOf, typeLabelOf } from '@/components/care/apptLabels';
import {
  dependentCard,
  isReadOnlyAccess,
  useDependentLabResults,
  useDependentPrescriptions,
  useDependentTimeline,
  useFamilyMember,
  useMintDependentTemporaryQr,
} from '@/lib/api/familyQueries';
import type { PrescriptionSummary } from '@/lib/api/queries';
import type { PortalLabOrder } from '@/lib/api/labsQueries';
import type { TimelineEvent } from '@/lib/api/types';

type Tab = 'summary' | 'immunisations' | 'appointments' | 'records';
const TABS: Tab[] = ['summary', 'immunisations', 'appointments', 'records'];

/** Timeline tint conventions, the same as the Records tab: labs/meds green, visits purple. */
const FEED_META: Record<TimelineEvent['event_type'], { icon: IconName; tint: Tint }> = {
  visit: { icon: 'stethoscope', tint: 'purple' },
  lab_result: { icon: 'flask', tint: 'green' },
  prescription: { icon: 'pill', tint: 'green' },
};

/** "Prescription — 3 item(s)" → "3 item(s)": the server's summary tail, used
 * only when it sent no `detail_label`. */
function summaryTail(summary: string): string | null {
  const parts = summary.split(/\s[—–-]\s/);
  return parts.length > 1 ? parts.slice(1).join(' — ').trim() || null : null;
}

/** The API's `status_color` → a kit badge tone. Retracted states read as critical. */
function prescriptionBadgeTone(p: PrescriptionSummary): StatusTone {
  const s = (p.status ?? '').toLowerCase();
  if (s === 'cancelled' || s === 'voided' || s === 'entered_in_error') return 'critical';
  switch (p.status_color) {
    case 'success':
      return 'normal';
    case 'info':
      return 'info';
    case 'warning':
      return 'warning';
    case 'danger':
      return 'critical';
    default:
      return 'neutral';
  }
}

function labBadgeTone(order: PortalLabOrder): StatusTone {
  if (order.status === 'cancelled') return 'critical';
  if (order.status !== 'completed') return 'pending';
  switch (order.overall_flag) {
    case 'critical':
      return 'critical';
    case 'abnormal':
      return 'warning';
    case 'normal':
      return 'normal';
    default:
      return 'neutral';
  }
}

/** One vocabulary with the Labs screens: the roll-up flag once results are in,
 * "Awaiting results" before, "Cancelled" for a withdrawn order. `unflagged`
 * deliberately reads "Not recorded", never "Normal". */
function labBadgeLabel(t: (key: string) => string, order: PortalLabOrder): string {
  if (order.status === 'cancelled') return t('family.member.records.labCancelled');
  if (order.status !== 'completed') return t('opesDiagnostics.flag.pending');
  return t(`opesDiagnostics.flag.${order.overall_flag}`);
}

export default function FamilyMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab, setTab] = useState<Tab>('summary');

  const detail = useFamilyMember(id);
  const data = detail.data;
  const patient = data?.patient ?? null;
  const link = data?.link ?? null;
  const dependentId = patient?.id ?? null;
  const readOnly = isReadOnlyAccess(link?.access_level);
  const pending = (link?.status ?? '') === 'pending_invite';

  // The dependent's records — only once the link is known to be active, and
  // only on the tab that shows them, so a revoked link never fires them.
  const recordsWanted = tab === 'records' && !!dependentId && !pending;
  const timeline = useDependentTimeline(recordsWanted ? dependentId : null);
  const prescriptions = useDependentPrescriptions(recordsWanted ? dependentId : null);
  const labs = useDependentLabResults(recordsWanted ? dependentId : null);

  const model = useMemo(() => (patient ? modelFromLive(dependentCard(patient)) : null), [patient]);

  // ── Presenting the dependent's Health ID ─────────────────────────────────
  // Same live credential as the holder's own Health ID tab: a 15-minute code
  // minted FOR the dependent (act-as header, full access only), counted down
  // here, removed at expiry, shown in the shared PresentationMode with the
  // dependent's own model — so a grandmother's card carries the adult-female
  // hologram, the seal, the ECG and the live QR, exactly as her own phone would.
  const mint = useMintDependentTemporaryQr();
  const [tempQr, setTempQr] = useState<TemporaryQrCode | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!tempQr) return;
    const expiresAtMs = new Date(tempQr.expires_at).getTime();
    const tick = () => {
      const remaining = Math.round((expiresAtMs - Date.now()) / 1000);
      if (remaining <= 0) {
        setSecondsLeft(0);
        setTempQr(null);
        return;
      }
      setSecondsLeft(remaining);
    };
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [tempQr]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  // A different dependent, or a link that lost full access: drop the code.
  useEffect(() => { setTempQr(null); setPresenting(false); }, [dependentId, readOnly]);

  const handleMint = useCallback(async () => {
    if (!dependentId || readOnly) return;
    try {
      setTempQr(await mint.mutateAsync(dependentId));
    } catch {
      // mint.isError drives the copy inside PresentationMode.
    }
  }, [dependentId, readOnly, mint]);

  const openPresentation = useCallback(() => {
    if (readOnly) return;
    setPresenting(true);
    if (!tempQr && !mint.isPending) void handleMint();
  }, [readOnly, tempQr, mint.isPending, handleMint]);

  const handleShare = useCallback(async () => {
    if (!tempQr) return;
    try {
      await Share.share({ message: t('healthId.shareMessage', { url: tempQr.verify_url, time: formatCountdown(secondsLeft) }) });
    } catch {
      // Share sheet dismissed — nothing to surface.
    }
  }, [tempQr, secondsLeft, t]);

  const handleCopyId = useCallback(async () => {
    const healthId = model?.healthId;
    if (!healthId) return;
    await Clipboard.setStringAsync(healthId);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1800);
  }, [model?.healthId]);

  const statusKey = model?.statusKey ?? '';
  const tone = toneFor(statusKey);
  const verified = VERIFIED_STATUSES.has(statusKey);
  const statusLabel = statusKey
    ? t(`healthId.statusValues.${statusKey}`, { defaultValue: titleCase(statusKey) })
    : t('healthId.notAvailable');

  const name = model?.name?.trim() || t('family.member.title');
  const subtitle = link
    ? `${relationshipLabelOf(t, link.relationship)} · ${accessLabelOf(t, link.access_level)}`
    : undefined;

  const tabOptions = TABS.map((key) => ({
    key,
    label: t(
      key === 'summary'
        ? 'family.member.tabSummary'
        : key === 'immunisations'
          ? 'family.member.tabImmunisations'
          : key === 'appointments'
            ? 'family.member.tabAppointments'
            : 'family.member.tabRecords',
    ),
  }));

  const refreshing = detail.isRefetching;
  const onRefresh = () => {
    detail.refetch();
    if (recordsWanted) {
      timeline.refetch();
      prescriptions.refetch();
      labs.refetch();
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader title={name} subtitle={subtitle} onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.blue}
            colors={[colors.blue]}
          />
        }
      >
        {detail.isLoading && !data ? (
          <LoadingCard label={t('opesCore.common.loading')} />
        ) : detail.isError && !data ? (
          <FamilyErrorState error={detail.error} onRetry={() => detail.refetch()} />
        ) : data && model && link ? (
          <>
            {/* ── Who this is, and what I may do ─────────────────────────── */}
            <View style={styles.linkRow}>
              <Text style={styles.linkText}>{relationshipLabelOf(t, link.relationship)}</Text>
              <AccessBadge level={link.access_level} />
            </View>

            {pending ? (
              <Card variant="flush">
                <EmptyState
                  icon="clock"
                  tint="amber"
                  title={t('family.member.pendingTitle')}
                  message={t('family.member.pendingBody', { name })}
                />
              </Card>
            ) : (
              <>
                {/* ── The dependent's credential ───────────────────────── */}
                <SecureCredentialCard
                  model={model}
                  statusTone={tone}
                  statusLabel={statusLabel}
                  verified={verified}
                  onPressQr={readOnly ? undefined : openPresentation}
                  qrPlaceholder={readOnly ? t('family.member.qrReadOnly') : undefined}
                />

                {/* ── Present / copy — the same rail as the holder's own tab ── */}
                <View style={styles.rail}>
                  <CareButton
                    label={t('family.member.present', { name })}
                    icon="maximize"
                    style={styles.railAction}
                    onPress={openPresentation}
                    disabled={readOnly || !model.healthId}
                    loading={presenting && mint.isPending}
                  />
                  <CareButton
                    label={copied ? t('family.member.copied') : t('family.member.copyId')}
                    icon={copied ? 'check' : 'copy'}
                    variant="secondary"
                    style={styles.railAction}
                    onPress={handleCopyId}
                    disabled={!model.healthId}
                  />
                </View>

                {readOnly ? (
                  <Notice
                    tone="info"
                    icon="eye"
                    text={`${t('family.member.readOnlyBanner', { name })} ${t('family.member.presentReadOnly', { name })}`}
                  />
                ) : (
                  <Notice
                    tone="normal"
                    icon="lock-open"
                    text={`${t('family.member.fullBanner', { name })} ${t('family.member.presentHint', { name })}`}
                  />
                )}

                {link.age_transition_expires_at ? (
                  <Notice
                    tone="warning"
                    icon="calendar"
                    text={t('family.ageTransition', {
                      name,
                      date: formatDate(link.age_transition_expires_at, '—'),
                    })}
                  />
                ) : null}

                {/* ── Sections ─────────────────────────────────────────── */}
                <SegmentedTabs
                  options={tabOptions}
                  value={tab}
                  onChange={(key) => setTab(key as Tab)}
                  scrollable
                />

                {tab === 'summary' ? (
                  <SummarySection data={data} name={name} />
                ) : tab === 'immunisations' ? (
                  <ImmunisationsSection data={data} name={name} />
                ) : tab === 'appointments' ? (
                  <AppointmentsSection data={data} name={name} />
                ) : (
                  <>
                    <View>
                      <SectionHeader title={t('family.member.records.timeline')} variant="overline" />
                      {timeline.isLoading ? (
                        <LoadingCard label={t('opesCore.common.loading')} />
                      ) : timeline.isError ? (
                        <FamilyErrorState error={timeline.error} onRetry={() => timeline.refetch()} />
                      ) : (timeline.data?.timeline.length ?? 0) === 0 ? (
                        <Card variant="flush">
                          <EmptyState
                            icon="history"
                            tint="blue"
                            title={t('family.member.records.timeline')}
                            message={t('family.member.records.timelineEmpty', { name })}
                          />
                        </Card>
                      ) : (
                        <Card variant="flush">
                          {(timeline.data?.timeline ?? []).map((ev, i, arr) => {
                            const meta = FEED_META[ev.event_type] ?? FEED_META.visit;
                            const title = t(
                              `records.item.${
                                ev.event_type === 'visit'
                                  ? 'visitTitle'
                                  : ev.event_type === 'lab_result'
                                    ? 'labTitle'
                                    : 'prescriptionTitle'
                              }`,
                            );
                            return (
                              <ListRow
                                key={`${ev.event_type}-${ev.id}`}
                                icon={meta.icon}
                                tint={meta.tint}
                                title={title}
                                meta={[
                                  ev.detail_label ?? summaryTail(ev.summary),
                                  ev.facility_name ?? t('records.item.unknownFacility'),
                                  formatDate(ev.occurred_at, '') || null,
                                ]}
                                chevron={false}
                                divider={i < arr.length - 1}
                              />
                            );
                          })}
                        </Card>
                      )}
                    </View>

                    <View>
                      <SectionHeader
                        title={t('family.member.records.prescriptions')}
                        variant="overline"
                      />
                      {prescriptions.isLoading ? (
                        <LoadingCard label={t('opesCore.common.loading')} />
                      ) : prescriptions.isError ? (
                        <FamilyErrorState
                          error={prescriptions.error}
                          onRetry={() => prescriptions.refetch()}
                        />
                      ) : (prescriptions.data?.data.length ?? 0) === 0 ? (
                        <Card variant="flush">
                          <EmptyState
                            icon="pill"
                            tint="green"
                            title={t('family.member.records.prescriptions')}
                            message={t('family.member.records.prescriptionsEmpty', { name })}
                          />
                        </Card>
                      ) : (
                        <Card variant="flush">
                          {(prescriptions.data?.data ?? []).map((p, i, arr) => (
                            <ListRow
                              key={p.id}
                              icon="pill"
                              tint="green"
                              title={p.facility_name ?? t('records.item.unknownFacility')}
                              meta={[
                                t('prescriptions.medicationCount', { count: p.item_count }),
                                p.prescribed_at ? formatDate(p.prescribed_at, '') : null,
                              ]}
                              chevron={false}
                              divider={i < arr.length - 1}
                              trailing={
                                <StatusBadge
                                  status={p.status}
                                  tone={prescriptionBadgeTone(p)}
                                  label={resolveStatusLabel(p.status, (key) => t(key))}
                                  size="sm"
                                />
                              }
                            />
                          ))}
                        </Card>
                      )}
                    </View>

                    <View>
                      <SectionHeader title={t('family.member.records.labs')} variant="overline" />
                      {labs.isLoading ? (
                        <LoadingCard label={t('opesCore.common.loading')} />
                      ) : labs.isError ? (
                        <FamilyErrorState error={labs.error} onRetry={() => labs.refetch()} />
                      ) : (labs.data?.data.length ?? 0) === 0 ? (
                        <Card variant="flush">
                          <EmptyState
                            icon="flask"
                            tint="green"
                            title={t('family.member.records.labs')}
                            message={t('family.member.records.labsEmpty', { name })}
                          />
                        </Card>
                      ) : (
                        <Card variant="flush">
                          {(labs.data?.data ?? []).map((order, i, arr) => (
                            <ListRow
                              key={order.id}
                              icon="flask"
                              tint="green"
                              title={order.name}
                              meta={[
                                t('family.member.records.resultCount', { count: order.result_count }),
                                order.ordered_at ? formatDate(order.ordered_at, '') : null,
                              ]}
                              chevron={false}
                              divider={i < arr.length - 1}
                              trailing={
                                <StatusBadge
                                  status={order.status === 'completed' ? order.overall_flag : order.status}
                                  tone={labBadgeTone(order)}
                                  label={labBadgeLabel((key) => t(key), order)}
                                  size="sm"
                                />
                              }
                            />
                          ))}
                        </Card>
                      )}
                    </View>
                  </>
                )}

                {/* ── Trust footer ─────────────────────────────────────── */}
                <Notice
                  tone="neutral"
                  icon="shield-check"
                  text={t('family.member.auditFooter', { name })}
                />
              </>
            )}
          </>
        ) : null}
      </ScrollView>

      {model && !readOnly ? (
        <PresentationMode
          visible={presenting}
          model={model}
          statusTone={tone}
          statusLabel={statusLabel}
          verified={verified}
          token={tempQr}
          secondsLeft={secondsLeft}
          minting={mint.isPending}
          mintFailed={mint.isError}
          onMint={handleMint}
          onShare={handleShare}
          onClose={() => setPresenting(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

// ── Sections ───────────────────────────────────────────────────────────────

type SectionProps = {
  data: NonNullable<ReturnType<typeof useFamilyMember>['data']>;
  name: string;
};

function SummarySection({ data, name }: SectionProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const s = data.records_summary;
  if (!s) {
    return (
      <Card variant="flush">
        <EmptyState
          icon="info"
          tint="blue"
          title={t('family.member.tabSummary')}
          message={t('family.member.summary.missing', { name })}
        />
      </Card>
    );
  }
  const n = (v: number | null | undefined) => String(v ?? 0);
  return (
    <View>
      <SectionHeader title={t('family.member.tabSummary')} variant="overline" />
      <View style={styles.tiles}>
        <SummaryTile icon="first-aid" value={n(s.allergies)} label={t('family.member.summary.allergies')} />
        <SummaryTile icon="stethoscope" value={n(s.diagnoses)} label={t('family.member.summary.diagnoses')} />
        <SummaryTile
          icon="pill"
          value={n(s.active_prescriptions)}
          label={t('family.member.summary.activePrescriptions')}
        />
        <SummaryTile icon="flask" value={n(s.lab_results)} label={t('family.member.summary.labResults')} />
        <SummaryTile icon="syringe" value={n(s.immunizations)} label={t('family.member.summary.immunizations')} />
        <SummaryTile
          icon="calendar-check"
          value={s.last_visit_at ? formatDate(s.last_visit_at, '—') : '—'}
          label={s.last_visit_at ? t('family.member.summary.lastVisit') : t('family.member.summary.noVisit')}
        />
      </View>
    </View>
  );
}

function ImmunisationsSection({ data, name }: SectionProps) {
  const { t } = useTranslation();
  const rows = data.immunizations ?? [];
  return (
    <View>
      <SectionHeader title={t('family.member.tabImmunisations')} variant="overline" />
      {rows.length === 0 ? (
        <Card variant="flush">
          <EmptyState
            icon="syringe"
            tint="green"
            title={t('family.member.tabImmunisations')}
            message={t('family.member.immunisations.empty', { name })}
          />
        </Card>
      ) : (
        <Card variant="flush">
          {rows.map((im, i) => (
            <ListRow
              key={im.id}
              icon="syringe"
              tint="green"
              title={im.vaccine_name}
              meta={[
                im.dose_number != null ? t('family.member.immunisations.dose', { n: im.dose_number }) : null,
                im.administered_at
                  ? t('family.member.immunisations.given', { date: formatDate(im.administered_at, '—') })
                  : t('family.member.immunisations.dateUnknown'),
              ]}
              chevron={false}
              divider={i < rows.length - 1}
              trailing={<StatusBadge status={im.status} size="sm" />}
            />
          ))}
        </Card>
      )}
    </View>
  );
}

function AppointmentsSection({ data, name }: SectionProps) {
  const { t } = useTranslation();
  const rows = data.upcoming_appointments ?? [];
  return (
    <View>
      <SectionHeader title={t('family.member.tabAppointments')} variant="overline" />
      {rows.length === 0 ? (
        <Card variant="flush">
          <EmptyState
            icon="calendar"
            tint="blue"
            title={t('family.member.tabAppointments')}
            message={t('family.member.appointments.empty', { name })}
          />
        </Card>
      ) : (
        <Card variant="flush">
          {rows.map((a, i) => (
            <ListRow
              key={a.id}
              icon="calendar"
              tint="blue"
              title={a.facility_name ?? t('family.member.appointments.unknownFacility')}
              meta={[
                a.starts_at ? formatDateTime(a.starts_at, '') : null,
                a.provider_name,
                a.appointment_type ? typeLabelOf(t, a.appointment_type) : null,
              ]}
              chevron={false}
              divider={i < rows.length - 1}
              trailing={
                <StatusBadge
                  status={a.status}
                  tone={statusToneOf(a.status)}
                  label={statusLabelOf(t, a.status)}
                  size="sm"
                />
              }
            />
          ))}
        </Card>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    rail: { flexDirection: 'row', gap: spacing.sm },
    railAction: { flex: 1 },
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    linkText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    tiles: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
  });
