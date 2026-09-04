/**
 * CARE-003 — Appointment Detail.
 *
 * Live `GET /patient/appointments/{id}`. Every action button is driven by the
 * server's own `can_cancel` / `can_reschedule` / `can_check_in` flags rather
 * than re-deriving the rules here.
 */
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchAppointment, type PortalAppointment } from '../../api';
import { Card, Icon, IconName, LastUpdatedLine, ScreenHeader, SectionHeader } from '../../components';
import type { AppStackParamList } from '../../navigation/routes';
import { useTranslation } from '../../i18n';
import { colors, radii, spacing, typography, tintMap } from '../../theme/theme';
import {
  AsyncBoundary,
  CareButton,
  fmtDuration,
  NoticeBanner,
  ProviderAvatar,
  statusTint,
  StatusPill,
  SummaryLine,
  typeIcon,
  useAsync,
} from './shared';
import { statusLabelOf, typeLabelOf, visitModeLabelOf } from './apptLabels';
import { formatDate, formatDateLong, formatTime } from '../../utils/format';

const PRE_VISIT: { icon: IconName; key: string }[] = [
  { icon: 'clipboard', key: 'care.detail.preVisitArrive' },
  { icon: 'id-card', key: 'care.detail.preVisitId' },
  { icon: 'document-text', key: 'care.detail.preVisitMeds' },
  { icon: 'x-circle', key: 'care.detail.preVisitCancel' },
];

export function AppointmentDetailScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'AppointmentDetail'>>();
  const id = params.appointmentId;

  const state = useAsync<PortalAppointment>(() => fetchAppointment(id), [id]);
  const { reload, reloadIfStale } = state;

  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('care.detail.title')} subtitle={t('care.detail.subtitle')} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={state.loading && state.data !== null} onRefresh={reload} tintColor={colors.blue} />
        }
      >
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('care.detail.loading')}>
          {(a) => (
            <>
              {a.status === 'cancelled' && (
                <NoticeBanner
                  icon="x-circle"
                  tone="critical"
                  title={t('care.detail.cancelledTitle')}
                  message={
                    a.cancel_reason
                      ? t('care.detail.cancelledReason', { reason: a.cancel_reason })
                      : t('care.detail.cancelledNoReason')
                  }
                />
              )}
              {!!a.rescheduled_from_id && a.status !== 'cancelled' && (
                <NoticeBanner
                  icon="refresh"
                  tone="pending"
                  title={t('care.detail.rescheduledTitle')}
                  message={t('care.detail.rescheduledMessage')}
                />
              )}

              {/* Summary card */}
              <Card>
                <View style={styles.summaryTop}>
                  <View style={[styles.summaryIcon, { backgroundColor: tintMap[statusTint(a.status)].bg }]}>
                    <Icon name={typeIcon(a.appointment_type)} size={22} color={tintMap[statusTint(a.status)].fg} />
                  </View>
                  <View style={styles.summaryHead}>
                    <StatusPill status={a.status} size="sm" />
                    <Text style={styles.summaryTitle}>{typeLabelOf(t, a.appointment_type)}</Text>
                    <Text style={styles.summaryId} numberOfLines={1}>
                      {t('care.detail.appointmentId')}
                      <Text style={styles.summaryIdValue}>{a.id}</Text>
                    </Text>
                  </View>
                </View>
                <View style={styles.factRow}>
                  <Fact icon="calendar" label={t('care.appt.date')} value={formatDate(a.scheduled_at)} />
                  <Fact icon="clock" label={t('care.appt.time')} value={formatTime(a.scheduled_at)} />
                  <Fact icon="history" label={t('care.appt.duration')} value={fmtDuration(a.duration_minutes)} />
                  <Fact icon="check-circle" label={t('care.appt.status')} value={statusLabelOf(t, a.status)} />
                </View>
              </Card>

              {/* Provider card */}
              <Card>
                <View style={styles.providerRow}>
                  <ProviderAvatar name={a.provider_name ?? t('care.appt.careTeam')} size={64} />
                  <View style={styles.providerBody}>
                    <Text style={styles.providerName} numberOfLines={2}>
                      {a.provider_name ?? t('care.appt.providerTbd')}
                    </Text>
                    {!!a.provider_specialty && <Text style={styles.providerTitle}>{a.provider_specialty}</Text>}
                    <View style={styles.providerMetaRow}>
                      <Icon name="building" size={16} color={colors.textSecondary} />
                      <Text style={styles.providerMeta} numberOfLines={1}>
                        {a.facility_name ?? t('care.appt.facilityTbd')}
                      </Text>
                    </View>
                    {!!a.location && (
                      <View style={styles.providerMetaRow}>
                        <Icon name="location" size={16} color={colors.textSecondary} />
                        <Text style={styles.providerMeta} numberOfLines={1}>
                          {a.location}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.circleActions}>
                  <CircleAction
                    icon="chat"
                    label={t('care.detail.actionMessage')}
                    onPress={() =>
                      navigation.navigate('NewMessage', a.provider_id ? { providerId: String(a.provider_id) } : undefined)
                    }
                  />
                  <CircleAction
                    icon="person"
                    label={t('care.detail.actionProfile')}
                    disabled={!a.provider_id}
                    onPress={() => navigation.navigate('ProviderProfile', { providerId: String(a.provider_id) })}
                  />
                  <CircleAction
                    icon="building"
                    label={t('care.detail.actionFacility')}
                    disabled={!a.facility_id}
                    onPress={() => a.department_id && navigation.navigate('FacilityProfile', { departmentId: String(a.department_id) })}
                  />
                </View>
              </Card>

              {/* Appointment information */}
              <View>
                <SectionHeader title={t('care.detail.infoHeading')} variant="overline" />
                <Card>
                  <SummaryLine label={t('care.detail.typeOfVisit')} value={visitModeLabelOf(t, a.visit_mode)} />
                  <View style={styles.hair} />
                  <SummaryLine label={t('care.appt.reasonForVisit')} value={a.reason ?? t('care.appt.notSpecified')} />
                  <View style={styles.hair} />
                  <SummaryLine
                    label={t('care.detail.scheduledFor')}
                    value={`${formatDateLong(a.scheduled_at)} · ${formatTime(a.scheduled_at)}`}
                  />
                  <View style={styles.hair} />
                  <SummaryLine
                    label={t('care.detail.bookedOn')}
                    value={`${formatDate(a.created_at)}, ${formatTime(a.created_at)}`}
                  />
                  <View style={styles.hair} />
                  <SummaryLine
                    label={t('care.detail.bookedVia')}
                    value={
                      a.booking_channel === 'patient_app'
                        ? t('care.detail.bookedViaApp')
                        : a.booking_channel.replace(/_/g, ' ')
                    }
                  />
                </Card>
              </View>

              {/* Pre-visit instructions */}
              <View>
                <SectionHeader title={t('care.detail.preVisitHeading')} variant="overline" />
                <Card variant="flush">
                  {PRE_VISIT.map((p, i) => (
                    <View key={p.key} style={[styles.instruction, i < PRE_VISIT.length - 1 && styles.instructionDivider]}>
                      <Icon name={p.icon} size={20} color={colors.blue} />
                      <Text style={styles.instructionText}>{t(p.key)}</Text>
                    </View>
                  ))}
                </Card>
              </View>

              {/* Actions */}
              {a.can_check_in && (
                <CareButton
                  label={t('care.detail.startCheckIn')}
                  icon="qr"
                  onPress={() => navigation.navigate('AppointmentCheckIn', { appointmentId: a.id })}
                />
              )}

              <View style={styles.tiles}>
                <Tile
                  icon="refresh"
                  label={t('care.detail.tileReschedule')}
                  disabled={!a.can_reschedule}
                  onPress={() => navigation.navigate('RescheduleAppointment', { appointmentId: a.id })}
                />
                <Tile
                  icon="calendar-check"
                  label={t('care.detail.tileCheckIn')}
                  disabled={!a.can_check_in}
                  onPress={() => navigation.navigate('AppointmentCheckIn', { appointmentId: a.id })}
                />
                <Tile
                  icon="location"
                  label={t('care.detail.tileDirections')}
                  disabled={!a.facility_id}
                  onPress={() => a.department_id && navigation.navigate('FacilityProfile', { departmentId: String(a.department_id) })}
                />
                <Tile
                  icon="calendar-plus"
                  label={t('care.detail.tileBookAgain')}
                  disabled={!a.provider_id}
                  onPress={() => navigation.navigate('AvailableTimeSlots', { providerId: String(a.provider_id) })}
                />
              </View>

              {a.can_cancel && (
                <CareButton
                  label={t('care.detail.cancelCta')}
                  icon="trash"
                  variant="danger"
                  onPress={() => navigation.navigate('CancellationConfirmation', { appointmentId: a.id })}
                />
              )}

              {/* The clinic can move an appointment; say when this was read. */}
              <LastUpdatedLine loadedAt={state.loadedAt} />
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={20} color={colors.blue} />
      <View style={styles.factText}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function CircleAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.circleAction, disabled && styles.tileOff]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <View style={styles.circleActionCircle}>
        <Icon name={icon} size={22} color={colors.blue} />
      </View>
      <Text style={styles.circleActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function Tile({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.tile, disabled && styles.tileOff]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Icon name={icon} size={22} color={colors.blue} />
      <Text style={styles.tileLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  summaryIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  summaryHead: { flex: 1, minWidth: 0, gap: 4 },
  summaryTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  summaryId: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  summaryIdValue: { fontFamily: typography.fontFamily.medium, color: colors.link },

  factRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  fact: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  factText: { flex: 1, minWidth: 0 },
  factLabel: { fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.textMuted },
  factValue: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: colors.link },

  providerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 2 },
  providerBody: { flex: 1, minWidth: 0, gap: 2 },
  providerName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  providerTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },
  providerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  providerMeta: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  circleActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  circleAction: { alignItems: 'center', gap: 6 },
  circleActionCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActionLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
  },

  hair: { height: 1, backgroundColor: colors.divider },

  instruction: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 13 },
  instructionDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  instructionText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  tiles: { flexDirection: 'row', gap: spacing.sm + 2 },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md - 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileOff: { opacity: 0.4 },
  tileLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    color: colors.textPrimary,
  },
});
