/**
 * CARE-015 — Waiting Room.
 *
 * Everything on this screen is server state: the position, the number of
 * patients in the line and the estimated wait all come from
 * `GET /patient/appointments/{id}/queue`, which derives them from real
 * check-ins. The screen re-polls on an interval rather than animating a
 * countdown, so the numbers only ever move when the clinic does.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchQueue, type QueueSnapshot, type QueueState } from '../../api';
import { Card, Icon, IconName, ScreenHeader, SectionHeader } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation, type TFunction } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { formatDateLong, formatTime } from '../../utils/format';
import {
  AsyncBoundary,
  CareButton,
  ProviderAvatar,
  typeLabel,
  useAsync,
} from './shared';
import type { PortalAppointment } from '../../api';

/** How often the queue is re-read. The clinic moves in minutes, not seconds. */
const POLL_MS = 20_000;

/** Cap the rendered stepper so a very long line still fits the card. */
const MAX_PIPS = 8;

function endTime(a: PortalAppointment): string {
  return formatTime(
    new Date(new Date(a.scheduled_at).getTime() + a.duration_minutes * 60_000).toISOString()
  );
}

function FactColumn({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <View style={styles.factHead}>
        <Icon name={icon} size={18} color={colors.blue} />
        <Text style={styles.factLabel} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

/**
 * The pip rail. Pips before the patient are served (check), the patient's own
 * pip carries their position, the rest are still waiting.
 */
function QueueRail({ queue, t }: { queue: QueueState; t: TFunction }) {
  const total = Math.max(queue.total_in_queue, queue.position, 1);
  const shown = Math.min(total, MAX_PIPS);
  const pips = Array.from({ length: shown }, (_, i) => i + 1);

  return (
    <View style={styles.rail}>
      {pips.map((n, i) => {
        const served = queue.position > 0 && n < queue.position;
        const mine = n === queue.position;
        return (
          <View key={n} style={styles.railItem}>
            {i > 0 && <View style={[styles.railLink, (served || mine) && styles.railLinkOn]} />}
            <View style={styles.railPipWrap}>
              {mine && (
                <View style={styles.railFlag}>
                  <Text style={styles.railFlagText}>{t('care.waitingRoom.railYou')}</Text>
                </View>
              )}
              <View style={[styles.railPip, (served || mine) && styles.railPipOn]}>
                {served ? (
                  <Icon name="check" size={14} color={colors.textOnBrand} />
                ) : (
                  <Text style={[styles.railPipText, mine && styles.railPipTextOn]}>{n}</Text>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ActionTile({
  icon,
  title,
  subtitle,
  badge,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
      <Icon name={icon} size={22} color={colors.blue} />
      <View style={styles.tileBody}>
        <Text style={styles.tileTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.tileSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {badge ? (
        <View style={styles.tileBadge}>
          <Text style={styles.tileBadgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : (
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}

/**
 * Literal `t()` calls per branch rather than a computed key, so
 * `npm run i18n:check` can see all five statuses statically.
 */
function queueStatusLabel(t: TFunction, status: QueueState['status']): string {
  switch (status) {
    case 'called':
      return t('care.waitingRoom.statusCalled');
    case 'in_room':
      return t('care.waitingRoom.statusInRoom');
    case 'completed':
      return t('care.waitingRoom.statusCompleted');
    case 'left':
      return t('care.waitingRoom.statusLeft');
    default:
      return t('care.waitingRoom.statusWaiting');
  }
}

export function WaitingRoomScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'WaitingRoom'>>();
  const id = params.appointmentId;
  const { messages } = useUnread();

  const state = useAsync<QueueSnapshot>(() => fetchQueue(id), [id]);
  const reload = state.reload;

  // Poll while the screen is mounted. `reload` is stable, so this interval is
  // installed once and torn down on unmount.
  useEffect(() => {
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('care.waitingRoom.title')}
        subtitle={t('care.waitingRoom.subtitle')}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('care.waitingRoom.loading')}
        >
          {({ appointment: a, queue }) => {
            const waitLabel =
              queue.estimated_wait_max_minutes <= 0
                ? t('care.waitingRoom.youAreNext')
                : t('care.waitingRoom.waitRange', {
                    min: queue.estimated_wait_min_minutes,
                    max: queue.estimated_wait_max_minutes,
                  });
            const called = queue.status === 'called' || queue.status === 'in_room';

            return (
              <>
                <View style={styles.hero}>
                  <View style={styles.heroMark}>
                    <Icon name="clock" size={24} color={colors.textOnBrand} />
                  </View>
                  <View style={styles.heroBody}>
                    <Text style={styles.heroLabel}>{t('care.waitingRoom.estimatedWait')}</Text>
                    <Text style={styles.heroValue}>{waitLabel}</Text>
                    <Text style={styles.heroText}>
                      {called
                        ? t('care.waitingRoom.providerReady')
                        : t('care.waitingRoom.willNotify')}
                    </Text>
                  </View>
                </View>

                <Card variant="flush">
                  <View style={styles.band}>
                    <Icon name="calendar" size={20} color={colors.textOnBrand} />
                    <Text style={styles.bandText}>{t('care.waitingRoom.yourAppointment')}</Text>
                  </View>

                  <View style={styles.providerRow}>
                    <ProviderAvatar
                      name={a.provider_name ?? t('care.waitingRoom.avatarFallback')}
                      size={72}
                    />
                    <View style={styles.providerBody}>
                      <Text style={styles.providerName}>
                        {a.provider_name ?? t('care.waitingRoom.careTeam')}
                      </Text>
                      <Text style={styles.providerSpecialty}>
                        {a.provider_specialty ?? typeLabel(a.appointment_type)}
                      </Text>
                      <View style={styles.providerMeta}>
                        <Icon name="building" size={16} color={colors.blue} />
                        <Text style={styles.providerMetaText} numberOfLines={1}>
                          {a.facility_name ?? t('care.waitingRoom.facilityTbc')}
                        </Text>
                      </View>
                      <View style={styles.providerMeta}>
                        <Icon name="location" size={16} color={colors.blue} />
                        <Text style={styles.providerMetaText} numberOfLines={1}>
                          {queue.room ?? a.location ?? t('care.waitingRoom.roomTbc')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.modeChip}>
                      <Icon name="person" size={16} color={colors.link} />
                      <Text style={styles.modeChipText}>
                        {a.visit_mode === 'telemedicine'
                          ? t('care.waitingRoom.visitModeTelemedicine')
                          : t('care.waitingRoom.visitModeInPerson')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.factRow}>
                    <FactColumn
                      icon="calendar"
                      label={t('care.waitingRoom.labelDate')}
                      value={formatDateLong(a.scheduled_at)}
                    />
                    <View style={styles.factDivider} />
                    <FactColumn
                      icon="clock"
                      label={t('care.waitingRoom.labelTime')}
                      value={`${t('care.waitingRoom.timeRange', {
                        start: formatTime(a.scheduled_at),
                        end: endTime(a),
                      })}\n(${t('care.waitingRoom.durationMinutes', {
                        count: a.duration_minutes,
                      })})`}
                    />
                    <View style={styles.factDivider} />
                    <FactColumn
                      icon="document-text"
                      label={t('care.waitingRoom.labelReason')}
                      value={a.reason ?? typeLabel(a.appointment_type)}
                    />
                  </View>
                </Card>

                <Card variant="flush">
                  <View style={styles.cardHead}>
                    <Icon name="users" size={22} color={colors.blue} />
                    <Text style={styles.cardTitle}>{t('care.waitingRoom.queueTitle')}</Text>
                  </View>

                  <View style={styles.queueRow}>
                    <View style={styles.queueNumbers}>
                      <Text style={styles.queuePosition}>
                        {queue.position > 0
                          ? t('care.waitingRoom.youAreNumber', { position: queue.position })
                          : queueStatusLabel(t, queue.status)}
                      </Text>
                      <Text style={styles.queueTotal}>
                        {queue.total_in_queue === 1
                          ? t('care.waitingRoom.onlyPatientWaiting')
                          : t('care.waitingRoom.outOfPatients', { count: queue.total_in_queue })}
                      </Text>
                    </View>
                    <QueueRail queue={queue} t={t} />
                  </View>

                  <View style={styles.notify}>
                    <Icon name="bell" size={22} color={colors.statusNormal} />
                    <View style={styles.notifyBody}>
                      <Text style={styles.notifyTitle}>{t('care.waitingRoom.notifyTitle')}</Text>
                      <Text style={styles.notifyText}>{t('care.waitingRoom.notifyText')}</Text>
                    </View>
                  </View>
                </Card>

                <SectionHeader title={t('care.waitingRoom.whileYouWait')} variant="overline" />
                <View style={styles.tiles}>
                  <ActionTile
                    icon="book"
                    title={t('care.waitingRoom.tileEducation')}
                    subtitle={t('care.waitingRoom.tileEducationSub')}
                    onPress={() => navigation.navigate('MainTabs', { screen: 'HealthTab' })}
                  />
                  <ActionTile
                    icon="person"
                    title={t('care.waitingRoom.tileProfile')}
                    subtitle={t('care.waitingRoom.tileProfileSub')}
                    onPress={() => navigation.navigate('MainTabs', { screen: 'ProfileTab', params: { sheet: 'personal' } })}
                  />
                  <ActionTile
                    icon="calendar"
                    title={t('care.waitingRoom.tilePast')}
                    subtitle={t('care.waitingRoom.tilePastSub')}
                    onPress={() => navigation.navigate('AppointmentList', { filter: 'past' })}
                  />
                  <ActionTile
                    icon="chat"
                    title={t('care.waitingRoom.tileMessages')}
                    subtitle={t('care.waitingRoom.tileMessagesSub')}
                    badge={messages}
                    onPress={() => navigation.navigate('MainTabs', { screen: 'MessagesTab' })}
                  />
                  <ActionTile
                    icon="help-circle"
                    title={t('care.waitingRoom.tileAsk')}
                    subtitle={t('care.waitingRoom.tileAskSub')}
                    onPress={() =>
                      navigation.navigate('NewMessage', a.provider_id ? { providerId: String(a.provider_id) } : undefined)
                    }
                  />
                  <ActionTile
                    icon="star"
                    title={t('care.waitingRoom.tileFeedback')}
                    subtitle={t('care.waitingRoom.tileFeedbackSub')}
                    onPress={() => navigation.navigate('NewMessage')}
                  />
                </View>

                <View style={styles.tip}>
                  <View style={styles.tipMark}>
                    <Icon name="info" size={16} color={colors.textOnBrand} />
                  </View>
                  <Text style={styles.tipText}>
                    <Text style={styles.tipStrong}>{t('care.waitingRoom.tipLabel')}</Text>
                    {t('care.waitingRoom.tipText')}
                  </Text>
                </View>

                <Card>
                  <TouchableOpacity
                    style={styles.helpRow}
                    onPress={() => navigation.navigate('NewMessage')}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                  >
                    <Icon name="headset" size={24} color={colors.blue} />
                    <View style={styles.helpBody}>
                      <Text style={styles.helpTitle}>{t('care.waitingRoom.needHelp')}</Text>
                      <Text style={styles.helpText}>{t('care.waitingRoom.needHelpSub')}</Text>
                    </View>
                    <Icon name="chevron-right" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </Card>

                <CareButton
                  label={t('care.waitingRoom.refresh')}
                  icon="refresh"
                  variant="secondary"
                  onPress={reload}
                />
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 2,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  heroMark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: { flex: 1, minWidth: 0, gap: 2 },
  heroLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  heroValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xxl,
    lineHeight: typography.lineHeight.xxl,
    color: colors.blue,
  },
  heroText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 2,
    backgroundColor: colors.blue,
  },
  bandText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    letterSpacing: 0.8,
    color: colors.textOnBrand,
  },

  providerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md - 2,
    padding: spacing.md,
  },
  providerBody: { flex: 1, minWidth: 0, gap: 3, paddingTop: 4 },
  providerName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  providerSpecialty: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },
  providerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  providerMetaText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  modeChipText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.link,
  },

  factRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.sm + 2,
  },
  factDivider: { width: 1, backgroundColor: colors.divider, marginVertical: 2 },
  fact: { flex: 1, paddingHorizontal: spacing.sm, gap: 4 },
  factHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  factLabel: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  factValue: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  cardTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },

  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  queueNumbers: { minWidth: 120, gap: 2 },
  queuePosition: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.blue,
  },
  queueTotal: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  rail: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  railItem: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  railLink: { width: 10, height: 2, backgroundColor: colors.border },
  railLinkOn: { backgroundColor: colors.blue },
  railPipWrap: { alignItems: 'center' },
  railFlag: {
    position: 'absolute',
    bottom: 30,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  railFlagText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    color: colors.link,
  },
  railPip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  railPipOn: { backgroundColor: colors.blue },
  railPipText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  railPipTextOn: { color: colors.textOnBrand },

  notify: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    margin: spacing.md,
    marginTop: 0,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.statusNormalBg,
  },
  notifyBody: { flex: 1, minWidth: 0, gap: 2 },
  notifyTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.statusNormal,
  },
  notifyText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2 },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.md - 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileBody: { flex: 1, minWidth: 0 },
  tileTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  tileSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  tileBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadgeText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    color: colors.textOnBrand,
  },

  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  tipMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  tipStrong: { fontFamily: typography.fontFamily.semiBold },

  helpRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4 },
  helpBody: { flex: 1, minWidth: 0, gap: 1 },
  helpTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  helpText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
});
