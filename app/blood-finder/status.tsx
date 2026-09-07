import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatDateTime,
  formatTime,
  initialsFrom,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import { useBloodRequest } from '@/lib/api/bloodRequestQueries';

/**
 * Blood Request Status (PM-BLOOD-05) — tracking one request.
 *
 * ── The rail is the screen ────────────────────────────────────────────────
 * The reference's progress rail is the thing a patient actually came for, so
 * it sits directly under the reference strip. Each stop is a real status the
 * API returns, in the order a request moves through them; a stop is only
 * "done" when the request has genuinely reached or passed it. Nothing here
 * interpolates a step the server has not reported.
 *
 * ── It refreshes itself ───────────────────────────────────────────────────
 * The status is written by the BLOOD BANK, not by this app, and a hold expires
 * on a clock. A tracking screen that shows a stale "Reserved" while the
 * reservation has lapsed is worse than one that says nothing, so the query
 * polls (see useBloodRequest) and every timestamp is printed with its date.
 *
 * ── Expiry is stated in the patient's favour ──────────────────────────────
 * `expires_at` is shown as an explicit warning rather than a quiet field. The
 * whole reason a reservation exists is that units are held for a while and
 * then let go, and a patient who misses that has travelled for nothing.
 *
 * ═══ WHAT THE REFERENCE DRAWS THAT THIS SCREEN DOES NOT ═══════════════════
 * Every omission below is a fact the API does not return. Drawing it would
 * mean inventing it, and this screen is the one a patient reads before
 * travelling for blood.
 *
 *  · FIVE rail stops (Received / Availability confirmed / RESERVED / Ready /
 *    Collected). `App\Enums\BloodRequestStatus` has four forward states —
 *    pending, confirmed, ready, fulfilled. There is no `reserved`. A fifth
 *    node would be a stop that can never light on its own, so the rail draws
 *    FOUR, horizontally, exactly as drawn otherwise.
 *  · PER-STOP TIMESTAMPS under each node ("15 May 2025 / 10:02 AM"). The
 *    payload carries `created_at` and `expires_at` and nothing else — no
 *    transition log. Each stop shows its STATE (done / now / waiting), which
 *    is true, instead of a time that would be fabricated. `created_at` is
 *    printed once, where it belongs, in the reference strip.
 *  · "Updated 10 min ago". Nothing says when the BLOOD BANK last touched the
 *    row. What is knowable is when this app last polled, so the strip says
 *    "Checked <time>" from the query's own `dataUpdatedAt` — a different
 *    claim, and a true one.
 *  · The Patient cell (name + Health ID) in the details grid. The request
 *    payload has no patient block.
 *  · "8 Units Available Now" at the blood bank. The request's `facility`
 *    block is id/name/city/address/phone — no stock. The units box therefore
 *    shows the units RESERVED ON THIS REQUEST, labelled as such.
 *  · The bank's verified tick and "Open 24/7". Neither is in this payload.
 *  · "Download" and "Print". There is no blood-request document endpoint —
 *    nothing to download and nothing to print. The five-up row spends those
 *    two slots on Share and Copy ID, which do work.
 *  · "View Full Details >" on the details header. This screen IS the full
 *    detail; the link had nowhere to go.
 *  · Collection Instructions. Not a field. The slot renders `facility_note`
 *    (the blood bank's own message) when there is one, and collapses when
 *    there is not.
 *
 * ═══ 375pt COMPROMISES ════════════════════════════════════════════════════
 *  · The reference is ~430pt. At 375 the card interior is 311pt.
 *  · The blood-bank block draws logo | name | units box | Call as ONE row.
 *    Four items in 311pt gives the name ~90pt. Split into two rows here:
 *    identity, then units box + Call.
 *  · The reservation-summary table draws label and value on one line. In a
 *    150pt column "15 May 2025 10:00 PM" alone needs two. Each summary row
 *    stacks its label above its value instead; the two-column arrangement
 *    survives.
 *  · Grid labels are 11px and shortened ("Hold expires", not "Reservation
 *    Expires") so a 3-column cell holds them on one line.
 */

/**
 * The stops, in the order a request passes through them.
 *
 * Four, not the reference's five — see the header comment. `statuses` lists
 * every status at or beyond that stop, so a stop is "done" only once the
 * request has actually passed it.
 */
const RAIL: { key: string; icon: IconName; statuses: string[] }[] = [
  { key: 'received', icon: 'receipt', statuses: ['pending', 'confirmed', 'ready', 'fulfilled'] },
  { key: 'confirmed', icon: 'check-circle', statuses: ['confirmed', 'ready', 'fulfilled'] },
  { key: 'ready', icon: 'shield-check', statuses: ['ready', 'fulfilled'] },
  { key: 'collected', icon: 'check-double', statuses: ['fulfilled'] },
];

const STATUS_TONE: Record<string, StatusTone> = {
  pending: 'pending',
  confirmed: 'info',
  ready: 'normal',
  fulfilled: 'normal',
  cancelled: 'neutral',
  rejected: 'critical',
  expired: 'warning',
};

const TONE_ICON: Record<StatusTone, IconName> = {
  normal: 'check-circle',
  critical: 'alert-circle',
  warning: 'clock',
  pending: 'clock',
  info: 'info',
  neutral: 'circle',
};

/** One label/value cell of the 3-column details grid. */
type Fact = {
  key: string;
  icon: IconName;
  iconColor: string;
  label: string;
  value: string;
  valueColor?: string;
};

/** One tile of the five-up action row. */
type ActionTile = {
  key: string;
  icon: IconName;
  label: string;
  a11y: string;
  onPress: () => void;
  disabled?: boolean;
};

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function dial(number: string | null | undefined): void {
  if (!number) return;
  void Linking.openURL(`tel:${number.replace(/\s+/g, '')}`);
}

/**
 * The dashed half-connector of the reference's rail, drawn as five spaced
 * dashes rather than `borderStyle: 'dashed'`: RN only honours a dashed border
 * when every side is set, and a single dashed `borderTopWidth` renders SOLID
 * on Android — which would say the last stop had been reached.
 */
function DashedRail({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.railDashRow}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.railDash} />
      ))}
    </View>
  );
}

export default function BloodRequestStatusScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const request = useBloodRequest(requestId ?? null);

  // "Copied" reports on the control that was pressed, for two seconds, then
  // rests — the app-wide pattern (see app/(tabs)/health-id.tsx).
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const reference = request.data?.reference ?? null;
  const facilityName = request.data?.facility?.name ?? null;

  const copyReference = useCallback(async () => {
    if (!reference) return;
    try {
      await Clipboard.setStringAsync(reference);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — say nothing rather than claim a copy.
    }
  }, [reference]);

  const shareReference = useCallback(async () => {
    if (!reference) return;
    try {
      await Share.share({
        message: t('bloodStatus.shareMessage', {
          reference,
          facility: facilityName ?? t('bloodStatus.notGiven'),
        }),
      });
    } catch {
      // Share sheet dismissed — nothing to surface.
    }
  }, [reference, facilityName, t]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  if (request.isPending) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodStatus.title')} onBack={goBack} />
        <View style={styles.centred}>
          <LoadingBlock label={t('bloodStatus.loading')} />
        </View>
      </Screen>
    );
  }

  if (request.isError || !request.data) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodStatus.title')} onBack={goBack} />
        <View style={styles.centred}>
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('bloodStatus.notFoundTitle')}
              message={t('bloodStatus.notFoundBody')}
              actionLabel={t('bloodStatus.backToFinder')}
              onAction={() => router.replace('/blood-finder')}
            />
          </Card>
        </View>
      </Screen>
    );
  }

  const data = request.data;
  const status = data.status;
  const closed = ['cancelled', 'rejected', 'expired'].includes(status);
  const reachedIndex = RAIL.findIndex((stop) => !stop.statuses.includes(status));
  const doneCount = reachedIndex === -1 ? RAIL.length : reachedIndex;
  const tone = STATUS_TONE[status] ?? 'neutral';

  const lapsed = !!data.expires_at && new Date(data.expires_at).getTime() < Date.now();
  const track = closed ? 'closed' : lapsed ? 'attention' : 'onTrack';
  const trackColor =
    track === 'onTrack'
      ? colors.statusNormal
      : track === 'attention'
        ? colors.statusWarning
        : colors.textMuted;

  const address = [data.facility?.address, data.facility?.city].filter(Boolean).join(', ');
  const unitsValue = t('bloodStatus.units', { count: data.quantity });

  /**
   * The 3x3 details grid. Nine cells, all of them real fields of the payload;
   * a field the patient did not give reads "Not given" rather than vanishing,
   * so the grid keeps the reference's shape without inventing a value.
   */
  const facts: Fact[] = [
    {
      key: 'group',
      icon: 'droplet',
      iconColor: colors.statusCritical,
      label: t('bloodStatus.group'),
      value: data.blood_group,
    },
    {
      key: 'units',
      icon: 'receipt',
      iconColor: colors.blue,
      label: t('bloodStatus.quantity'),
      value: unitsValue,
    },
    {
      key: 'bank',
      icon: 'building',
      iconColor: colors.blue,
      label: t('bloodStatus.bank'),
      value: data.facility?.name ?? t('bloodStatus.notGiven'),
    },
    {
      key: 'component',
      icon: 'flask',
      iconColor: colors.statusCritical,
      label: t('bloodStatus.component'),
      value: data.component_label ?? data.component_type,
    },
    {
      key: 'urgency',
      icon: 'alert-triangle',
      iconColor: data.urgency === 'emergency' ? colors.statusCritical : colors.statusWarning,
      label: t('bloodStatus.urgency'),
      value: t(`bloodFinder.urgency.${data.urgency}`, { defaultValue: data.urgency }),
      valueColor:
        data.urgency === 'emergency'
          ? colors.statusCritical
          : data.urgency === 'urgent'
            ? colors.statusWarning
            : undefined,
    },
    {
      key: 'expires',
      icon: 'clock',
      iconColor: colors.statusWarning,
      label: t('bloodStatus.expiresLabel'),
      value: data.expires_at ? formatDateTime(data.expires_at) : t('bloodStatus.notGiven'),
      valueColor: data.expires_at ? colors.statusWarning : undefined,
    },
    {
      key: 'neededBy',
      icon: 'calendar',
      iconColor: colors.blue,
      label: t('bloodStatus.neededBy'),
      value: data.needed_by ? formatDateTime(data.needed_by) : t('bloodStatus.notGiven'),
    },
    {
      key: 'contact',
      icon: 'phone',
      iconColor: colors.blue,
      label: t('bloodStatus.contact'),
      value: data.contact_phone ?? t('bloodStatus.notGiven'),
    },
    {
      key: 'note',
      icon: 'document-text',
      iconColor: colors.tintPurple,
      label: t('bloodStatus.note'),
      value: data.patient_note ?? t('bloodStatus.notGiven'),
    },
  ];

  /** Five actions, every one of which does something. See the header comment. */
  const actions: ActionTile[] = [
    {
      key: 'refresh',
      icon: 'refresh',
      label: t('bloodStatus.actions.refresh'),
      a11y: t('bloodStatus.actions.refreshA11y'),
      onPress: () => void request.refetch(),
      disabled: request.isFetching,
    },
    {
      key: 'share',
      icon: 'share',
      label: t('bloodStatus.actions.share'),
      a11y: t('bloodStatus.actions.shareA11y'),
      onPress: () => void shareReference(),
    },
    {
      key: 'copy',
      icon: 'copy',
      label: copied ? t('bloodStatus.copied') : t('bloodStatus.actions.copy'),
      a11y: t('bloodStatus.actions.copyA11y'),
      onPress: () => void copyReference(),
    },
    {
      key: 'directions',
      icon: 'location',
      label: t('bloodStatus.actions.directions'),
      a11y: t('bloodStatus.actions.directionsA11y'),
      onPress: () => {
        if (!data.facility) return;
        router.push({ pathname: '/facility/[id]', params: { id: data.facility.id } });
      },
      disabled: !data.facility,
    },
    {
      key: 'call',
      icon: 'phone',
      label: t('bloodStatus.actions.call'),
      a11y: t('bloodStatus.actions.callA11y'),
      onPress: () => dial(data.facility?.phone),
      disabled: !data.facility?.phone,
    },
  ];

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('bloodStatus.title')}
        subtitle={t('bloodStatus.subtitle')}
        onBack={goBack}
        right={
          <CareButton
            label={t('bloodStatus.share')}
            icon="share"
            variant="secondary"
            size="sm"
            onPress={() => void shareReference()}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Reference strip: three columns, as drawn ─────────────────────
            ID + copy | current status + when this app last checked | whether
            it is on track. */}
        <Card>
          <View style={styles.strip}>
            <View style={styles.stripCol}>
              <Text style={styles.stripLabel}>{t('bloodStatus.requestId')}</Text>
              <TouchableOpacity
                style={styles.refRow}
                onPress={() => void copyReference()}
                activeOpacity={0.7}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('bloodStatus.copyId')}
              >
                <Text style={[styles.reference, { color: colors.blue }]} numberOfLines={2}>
                  {data.reference}
                </Text>
                <Icon name={copied ? 'check' : 'copy'} size={14} color={colors.link} />
              </TouchableOpacity>
              {copied ? (
                <Text style={[styles.stripMeta, { color: colors.statusNormal }]}>
                  {t('bloodStatus.copied')}
                </Text>
              ) : data.created_at ? (
                <Text style={styles.stripMeta}>
                  {t('bloodStatus.requestedOn', { when: formatDateTime(data.created_at) })}
                </Text>
              ) : null}
            </View>

            <View style={styles.stripRule} />

            <View style={styles.stripColMid}>
              <Text style={styles.stripLabel}>{t('bloodStatus.currentStatus')}</Text>
              <StatusBadge
                status={status}
                tone={tone}
                icon={TONE_ICON[tone]}
                size="sm"
                label={data.status_label}
                style={styles.stripBadge}
              />
              <View style={styles.stripMetaRow}>
                <Icon name="clock" size={11} color={colors.textMuted} />
                <Text style={[styles.stripMeta, styles.stripMetaFlush]} numberOfLines={2}>
                  {t('bloodStatus.checkedAt', { when: formatTime(new Date(request.dataUpdatedAt)) })}
                </Text>
              </View>
            </View>

            <View style={styles.stripRule} />

            <View style={styles.stripColLast}>
              <View style={styles.stripMetaRow}>
                <Icon name="heart-pulse" size={13} color={trackColor} />
                <Text style={[styles.trackTitle, { color: trackColor }]} numberOfLines={2}>
                  {t(`bloodStatus.track.${track}Title`)}
                </Text>
              </View>
              <Text style={styles.stripMeta} numberOfLines={3}>
                {t(`bloodStatus.track.${track}Body`)}
              </Text>
            </View>
          </View>
        </Card>

        {/* ── The rail: horizontal, four stops ─────────────────────────────
            No per-stop timestamp exists in the payload; each stop states what
            it IS (done / now / waiting) instead of a time nobody reported. */}
        {closed ? (
          <NoticeBanner
            icon="info"
            tone={status === 'rejected' ? 'critical' : 'warning'}
            title={data.status_label}
            message={t(`bloodStatus.closed.${status}`, {
              defaultValue: t('bloodStatus.closed.generic'),
            })}
          />
        ) : (
          <Card>
            <View style={styles.rail}>
              {RAIL.map((stop, index) => {
                const done = index < doneCount;
                const current = index === doneCount;
                // A connector is solid up to and including the current node,
                // dashed beyond it — the reference's own reading.
                const leftSolid = index <= doneCount && index > 0;
                const rightSolid = index + 1 <= doneCount;

                return (
                  <View
                    key={stop.key}
                    style={styles.railStop}
                    accessible
                    accessibilityLabel={`${t(`bloodStatus.rail.${stop.key}`)}: ${
                      done
                        ? t('bloodStatus.done')
                        : current
                          ? t('bloodStatus.inProgress')
                          : t('bloodStatus.waiting')
                    }`}
                  >
                    <View style={styles.railNodeRow}>
                      {index === 0 ? (
                        <View style={styles.railGap} />
                      ) : leftSolid ? (
                        <View style={styles.railLineOn} />
                      ) : (
                        <DashedRail styles={styles} />
                      )}
                      <View
                        style={[
                          styles.railNode,
                          done
                            ? { backgroundColor: colors.blue }
                            : current
                              ? {
                                  backgroundColor: colors.tintBlueBg,
                                  borderWidth: 2.5,
                                  borderColor: colors.blue,
                                }
                              : { backgroundColor: colors.surfaceMuted },
                        ]}
                      >
                        <Icon
                          name={stop.icon}
                          size={16}
                          color={
                            done ? colors.textOnBrand : current ? colors.blue : colors.textMuted
                          }
                        />
                      </View>
                      {index === RAIL.length - 1 ? (
                        <View style={styles.railGap} />
                      ) : rightSolid ? (
                        <View style={styles.railLineOn} />
                      ) : (
                        <DashedRail styles={styles} />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.railTitle,
                        done || current
                          ? { color: colors.textPrimary }
                          : { color: colors.textMuted },
                      ]}
                      numberOfLines={2}
                    >
                      {t(`bloodStatus.rail.${stop.key}`)}
                    </Text>
                    <Text
                      style={[styles.railState, current && { color: colors.blue }]}
                      numberOfLines={1}
                    >
                      {done
                        ? t('bloodStatus.done')
                        : current
                          ? t('bloodStatus.inProgress')
                          : t('bloodStatus.waiting')}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* The reference's info strip sits at the foot of the rail card.
                It only appears when there is a real hold to miss. */}
            {data.expires_at ? (
              <View style={[styles.strip1, { backgroundColor: colors.statusWarningBg }]}>
                <Icon name="clock" size={16} color={colors.statusWarning} />
                <View style={styles.strip1Body}>
                  <Text style={[styles.strip1Title, { color: colors.statusWarning }]}>
                    {t('bloodStatus.expiresTitle')}
                  </Text>
                  <Text style={styles.strip1Text}>
                    {t('bloodStatus.expiresBody', { when: formatDateTime(data.expires_at) })}
                  </Text>
                </View>
              </View>
            ) : null}
          </Card>
        )}

        {/* ── Request details: 3 columns x 3 rows ──────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodStatus.detailsTitle')} />
          <Card>
            <View style={styles.grid}>
              {chunk(facts, 3).map((row, rowIndex) => (
                <View
                  key={row.map((f) => f.key).join('-')}
                  style={[styles.gridRow, rowIndex > 0 && styles.gridRowDivider]}
                >
                  {row.map((fact, colIndex) => (
                    <View
                      key={fact.key}
                      style={[styles.gridCell, colIndex > 0 && styles.gridCellDivider]}
                      accessible
                      accessibilityLabel={`${fact.label}: ${fact.value}`}
                    >
                      <View style={styles.gridHead}>
                        <Icon name={fact.icon} size={12} color={fact.iconColor} />
                        <Text style={styles.gridLabel} numberOfLines={2}>
                          {fact.label}
                        </Text>
                      </View>
                      <Text
                        style={[styles.gridValue, !!fact.valueColor && { color: fact.valueColor }]}
                        numberOfLines={3}
                      >
                        {fact.value}
                      </Text>
                    </View>
                  ))}
                  {row.length < 3
                    ? Array.from({ length: 3 - row.length }).map((_, i) => (
                        <View key={`pad${i}`} style={styles.gridCell} />
                      ))
                    : null}
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* ── The blood bank ───────────────────────────────────────────────
            Two rows rather than the reference's one: four items abreast do
            not fit 311pt. */}
        {data.facility ? (
          <View style={styles.stack}>
            <SectionHeader title={t('bloodStatus.facilityTitle')} />
            <Card>
              <View style={styles.bankRow}>
                <View style={[styles.bankLogo, { backgroundColor: colors.statusCriticalBg }]}>
                  <Text style={[styles.bankLogoText, { color: colors.statusCritical }]}>
                    {initialsFrom(data.facility.name, '+')}
                  </Text>
                </View>
                <View style={styles.bankMain}>
                  <Text style={styles.bankName} numberOfLines={2}>
                    {data.facility.name}
                  </Text>
                  <View style={styles.bankMetaRow}>
                    <Icon name="location" size={13} color={colors.textMuted} />
                    <Text style={styles.bankMeta} numberOfLines={2}>
                      {address || t('bloodStatus.addressUnknown')}
                    </Text>
                  </View>
                  {data.facility.phone ? (
                    <TouchableOpacity
                      style={styles.bankMetaRow}
                      onPress={() => dial(data.facility?.phone)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t('bloodStatus.actions.callA11y')}
                    >
                      <Icon name="phone" size={13} color={colors.link} />
                      <Text style={[styles.bankPhone, { color: colors.link }]}>
                        {data.facility.phone}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <View style={styles.bankFooter}>
                <View style={[styles.unitsBox, { backgroundColor: colors.tintBlueBg }]}>
                  <Text style={[styles.unitsNumber, { color: colors.blue }]}>{data.quantity}</Text>
                  <Text style={[styles.unitsWord, { color: colors.blue }]}>
                    {t('bloodStatus.unitsWord')}
                  </Text>
                  <Text style={styles.unitsNote} numberOfLines={2}>
                    {t('bloodStatus.unitsReservedNote')}
                  </Text>
                </View>
                <CareButton
                  label={data.facility.phone ? t('bloodStatus.call') : t('bloodStatus.noPhone')}
                  icon="phone"
                  variant="secondary"
                  size="sm"
                  disabled={!data.facility.phone}
                  onPress={() => dial(data.facility?.phone)}
                  style={styles.bankCall}
                />
              </View>
            </Card>
          </View>
        ) : null}

        {/* ── Collection information: two columns ──────────────────────────── */}
        {data.facility ? (
          <View style={styles.stack}>
            <SectionHeader title={t('bloodStatus.collectionTitle')} />
            <Card>
              <View style={styles.twoCol}>
                <View style={styles.colLeft}>
                  <View style={styles.gridHead}>
                    <Icon name="location" size={13} color={colors.blue} />
                    <Text style={styles.gridLabel}>{t('bloodStatus.collectionLocation')}</Text>
                  </View>
                  <Text style={styles.colValue}>{data.facility.name}</Text>
                  {address ? <Text style={styles.colMuted}>{address}</Text> : null}

                  {/* The blood bank's own words, when it wrote any. Never a
                      standing instruction this app made up. */}
                  {data.facility_note ? (
                    <>
                      <View style={[styles.gridHead, styles.colSpacer]}>
                        <Icon name="document-text" size={13} color={colors.blue} />
                        <Text style={styles.gridLabel}>{t('bloodStatus.bankMessage')}</Text>
                      </View>
                      <Text style={styles.colMuted}>{data.facility_note}</Text>
                    </>
                  ) : null}
                </View>

                <View style={styles.colRight}>
                  <View style={styles.gridHead}>
                    <Icon name="list" size={13} color={colors.blue} />
                    <Text style={styles.gridLabel} numberOfLines={2}>
                      {t('bloodStatus.summaryTitle')}
                    </Text>
                  </View>
                  <View style={[styles.summaryBox, { backgroundColor: colors.surfaceMuted }]}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{t('bloodStatus.quantity')}</Text>
                      <Text style={styles.summaryValue}>{unitsValue}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{t('bloodStatus.expiresLabel')}</Text>
                      <Text
                        style={[
                          styles.summaryValue,
                          !!data.expires_at && { color: colors.statusWarning },
                        ]}
                      >
                        {data.expires_at
                          ? formatDateTime(data.expires_at)
                          : t('bloodStatus.notGiven')}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{t('bloodStatus.group')}</Text>
                      <Text style={styles.summaryValue}>{data.blood_group}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{t('bloodStatus.component')}</Text>
                      <Text style={styles.summaryValue}>
                        {data.component_label ?? data.component_type}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </Card>
          </View>
        ) : null}

        {/* The facility answers a request; the patient may amend it while it is
            still open. Offered only when it is real. */}
        {data.is_cancellable ? (
          <CareButton
            label={t('bloodStatus.modify')}
            icon="edit"
            variant="primary"
            onPress={() =>
              router.push({
                pathname: '/blood-finder/modify',
                params: { requestId: data.id },
              })
            }
          />
        ) : null}

        {/* ── Five-up actions ──────────────────────────────────────────────── */}
        <View style={styles.actionsRow}>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={[styles.actionTile, action.disabled && styles.actionTileOff]}
              onPress={action.onPress}
              disabled={action.disabled}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={action.a11y}
              accessibilityState={{ disabled: !!action.disabled }}
            >
              <Icon
                name={action.icon}
                size={17}
                color={action.disabled ? colors.textMuted : colors.link}
              />
              <Text
                style={[styles.actionLabel, action.disabled && { color: colors.textMuted }]}
                numberOfLines={2}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Footer advisory ──────────────────────────────────────────────── */}
        <View
          style={[styles.footer, { backgroundColor: colors.tintBlueBg }]}
          accessibilityRole="summary"
        >
          <Icon name="shield-check" size={20} color={colors.blue} />
          <View style={styles.footerBody}>
            <Text style={[styles.footerTitle, { color: colors.blue }]}>
              {t('bloodFinder.safetyTitle')}
            </Text>
            <Text style={styles.footerText}>{t('bloodFinder.safetyBody')}</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.sm },
    centred: { padding: spacing.md },

    // ── Reference strip ────────────────────────────────────────────────────
    // Column 1 gets the extra width: it carries an 18-character reference.
    strip: { flexDirection: 'row', alignItems: 'stretch' },
    stripCol: { flex: 1.15, minWidth: 0, paddingRight: spacing.sm },
    stripColMid: { flex: 1.15, minWidth: 0, paddingHorizontal: spacing.sm },
    stripColLast: { flex: 0.95, minWidth: 0, paddingLeft: spacing.sm },
    stripRule: { width: StyleSheet.hairlineWidth, backgroundColor: c.border },
    stripLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      color: c.textMuted,
    },
    refRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    reference: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: 13,
      lineHeight: 17,
    },
    stripBadge: { marginTop: 4 },
    stripMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    stripMeta: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 13,
      color: c.textMuted,
      marginTop: 2,
    },
    stripMetaFlush: { marginTop: 0 },
    trackTitle: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      lineHeight: 14,
    },

    // ── Horizontal rail ────────────────────────────────────────────────────
    // Four stops across 311pt = ~78pt each. Labels wrap to two lines and the
    // block below them is height-locked so every node sits on one baseline.
    rail: { flexDirection: 'row', alignItems: 'flex-start' },
    railStop: { flex: 1, minWidth: 0, alignItems: 'center' },
    railNodeRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
    railNode: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    railGap: { flex: 1, height: 2 },
    railLineOn: { flex: 1, height: 2, backgroundColor: c.blue },
    railDashRow: {
      flex: 1,
      height: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      overflow: 'hidden',
    },
    railDash: { width: 4, height: 2, borderRadius: 1, backgroundColor: c.border },
    railTitle: {
      marginTop: 6,
      minHeight: 30,
      textAlign: 'center',
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      lineHeight: 14,
      paddingHorizontal: 2,
    },
    railState: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 13,
      color: c.textMuted,
    },

    // ── Info strip at the foot of the rail card ────────────────────────────
    strip1: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      borderRadius: radii.sm,
      padding: spacing.sm,
      marginTop: spacing.md,
    },
    strip1Body: { flex: 1, minWidth: 0 },
    strip1Title: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: 16,
    },
    strip1Text: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textSecondary,
      marginTop: 1,
    },

    // ── 3 x 3 details grid ─────────────────────────────────────────────────
    // 311pt interior / 3 = ~103pt a cell; 11px labels hold on one line.
    grid: { marginVertical: -6 },
    gridRow: { flexDirection: 'row', alignItems: 'stretch' },
    gridRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    gridCell: { flex: 1, minWidth: 0, paddingVertical: 8, paddingHorizontal: 6 },
    gridCellDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.divider },
    gridHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    gridLabel: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      color: c.textMuted,
    },
    gridValue: {
      marginTop: 2,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: 16,
      color: c.textPrimary,
    },

    // ── Blood bank ─────────────────────────────────────────────────────────
    bankRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    bankLogo: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bankLogoText: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.md },
    bankMain: { flex: 1, minWidth: 0 },
    bankName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: 21,
      color: c.textPrimary,
    },
    bankMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
    bankMeta: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: 16,
      color: c.textSecondary,
    },
    bankPhone: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs },
    bankFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    unitsBox: {
      width: 96,
      borderRadius: radii.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: 6,
      alignItems: 'center',
    },
    unitsNumber: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.lg },
    unitsWord: { fontFamily: typography.fontFamily.semiBold, fontSize: 11, lineHeight: 14 },
    unitsNote: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 13,
      color: c.textSecondary,
    },
    bankCall: { flex: 1 },

    // ── Collection information ─────────────────────────────────────────────
    twoCol: { flexDirection: 'row', gap: spacing.sm + 4, alignItems: 'flex-start' },
    colLeft: { flex: 1, minWidth: 0 },
    colRight: { flex: 1.1, minWidth: 0 },
    colSpacer: { marginTop: spacing.sm + 2 },
    colValue: {
      marginTop: 3,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: 16,
      color: c.textPrimary,
    },
    colMuted: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textSecondary,
    },
    summaryBox: { marginTop: 5, borderRadius: radii.sm, padding: spacing.sm, gap: 6 },
    summaryRow: { minWidth: 0 },
    summaryLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 13,
      color: c.textSecondary,
    },
    summaryValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      lineHeight: 15,
      color: c.textPrimary,
    },

    // ── Five-up actions ────────────────────────────────────────────────────
    // (343 - 4 gaps of 6) / 5 = ~64pt a tile; label at 10px over two lines.
    actionsRow: { flexDirection: 'row', gap: 6 },
    actionTile: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 4,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: 2,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    actionTileOff: { opacity: 0.45 },
    actionLabel: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.medium,
      fontSize: 10,
      lineHeight: 13,
      color: c.link,
    },

    // ── Footer advisory ────────────────────────────────────────────────────
    footer: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      padding: spacing.sm + 2,
      borderRadius: radii.md,
    },
    footerBody: { flex: 1, minWidth: 0 },
    footerTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: 16,
    },
    footerText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textSecondary,
      marginTop: 2,
    },
  });
