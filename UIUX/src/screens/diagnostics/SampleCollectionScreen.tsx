/**
 * DIA-005 — Lab Appointment / Sample Collection.
 *
 * Where and when to give a sample, and what the laboratory is waiting on.
 *
 * CONTRACTS — every field comes from an endpoint that exists today:
 *   • GET /patient/appointments        (PatientSchedulingController::index)
 *       → PortalPresenter::appointment. `appointment_type` is a real enum value
 *         (`'lab'`, one of PatientSchedulingController::BOOKABLE_TYPES), so the
 *         lab visits are filtered out of the patient's own appointment list —
 *         the endpoint has no type filter, so the narrowing happens here.
 *   • GET /patient/appointments/{id}   (…::show) when a specific visit is named.
 *   • GET /patient/lab-orders?status=ordered,in_progress
 *       (PatientDiagnosticsController::labOrders) → the tests still waiting on
 *         a sample. That is the "test panel" the reference prints.
 *   • GET /patient/profile             → the patient block.
 * Reschedule and cancel hand off to the existing CARE-012 / CARE-013 screens,
 * which own those writes.
 *
 * NOT SHOWN, DELIBERATELY: sample type, fasting hours, preparation instructions
 * and a separate check-in time. `PortalPresenter::appointment` carries none of
 * them and there is no other patient endpoint that does, so the screen omits
 * them rather than inventing clinical preparation advice.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  fetchAppointment,
  fetchAppointments,
  fetchLabOrders,
  fetchProfile,
  type PortalAppointment,
  type PortalLabOrder,
  type PortalProfile,
} from '../../api';
import { Card, EmptyState, Icon, ListRow, ScreenHeader } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, spacing, typography } from '../../theme/theme';
import { fmtDateLong, fmtDuration, fmtTime, StatusPill } from '../care/shared';
import { TechnicalDetails } from '../imaging/detailShared';
import {
  AsyncBoundary,
  DiagButton,
  fmtDate,
  HeroBand,
  InfoStrip,
  Overline,
  StatGrid,
  titleCase,
  useAsync,
} from './shared';

type Collection = {
  /** The lab visit being shown — null when the patient has none booked. */
  appointment: PortalAppointment | null;
  /** Other lab visits on file, so the patient can switch between them. */
  others: PortalAppointment[];
  /** Lab orders still waiting on a sample. */
  pending: PortalLabOrder[];
  profile: PortalProfile | null;
};

/** Soonest upcoming lab visit first; otherwise the most recent one. */
function pickAppointment(rows: PortalAppointment[]): PortalAppointment | null {
  const upcoming = rows
    .filter((a) => a.is_upcoming)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  if (upcoming.length) return upcoming[0];
  const past = [...rows].sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  return past[0] ?? null;
}

export function SampleCollectionScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'LabAppointmentCollection'>>();
  const appointmentId = params?.appointmentId;

  const load = useCallback(async (): Promise<Collection> => {
    const page = await fetchAppointments({ scope: 'all', per_page: 100 });
    const labVisits = page.data.filter((a) => a.appointment_type === 'lab');

    let appointment: PortalAppointment | null = null;
    if (appointmentId) {
      appointment =
        labVisits.find((a) => a.id === appointmentId) ?? (await fetchAppointment(appointmentId).catch(() => null));
    }
    appointment = appointment ?? pickAppointment(labVisits);

    const pending = await fetchLabOrders({ status: 'ordered,in_progress', per_page: 50 })
      .then((p) => p.data)
      .catch(() => [] as PortalLabOrder[]);
    const profile = await fetchProfile().catch(() => null);

    return {
      appointment,
      others: labVisits.filter((a) => a.id !== appointment?.id),
      pending,
      profile,
    };
  }, [appointmentId]);

  const state = useAsync<Collection>(load, [appointmentId]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('diagnostics.collection.title')}
        align="center"
        actions={[
          { icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications') },
          { icon: 'more-vertical', onPress: () => navigation.navigate('DiagnosticsDashboard') },
        ]}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.loading && state.data !== null}
            onRefresh={state.reload}
            tintColor={colors.blue}
          />
        }
      >
        <HeroBand
          title={t('diagnostics.collection.heroTitle')}
          subtitle={t('diagnostics.collection.heroSubtitle')}
          icon="syringe"
        />

        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('diagnostics.collection.loading')}
        >
          {({ appointment: a, others, pending, profile }) => {
            const patient = profile?.patient ?? null;

            return (
              <>
                {a ? (
                  <>
                    {/* ── When and where ─────────────────────────────── */}
                    <Card>
                      <View style={styles.headRow}>
                        <StatusPill status={a.status} />
                        {a.is_upcoming ? (
                          <Text style={styles.upcoming}>{t('diagnostics.collection.upcoming')}</Text>
                        ) : null}
                      </View>

                      <View style={styles.whenRow}>
                        <View style={styles.whenIcon}>
                          <Icon name="calendar-check" size={24} color={colors.blue} />
                        </View>
                        <View style={styles.whenBody}>
                          <Text style={styles.whenDate}>{fmtDateLong(a.scheduled_at)}</Text>
                          <Text style={styles.whenTime}>{fmtTime(a.scheduled_at)}</Text>
                        </View>
                      </View>

                      <StatGrid
                        tiles={[
                          {
                            key: 'duration',
                            label: t('diagnostics.collection.statDuration'),
                            value: fmtDuration(a.duration_minutes),
                            icon: 'clock',
                            tint: 'blue',
                          },
                          {
                            key: 'status',
                            label: t('diagnostics.collection.statStatus'),
                            value: titleCase(a.status),
                            icon: 'check-circle',
                            tint: 'green',
                          },
                          {
                            key: 'mode',
                            label: t('diagnostics.collection.statVisit'),
                            value:
                              a.visit_mode === 'in_person'
                                ? t('diagnostics.collection.visitInPerson')
                                : t('diagnostics.collection.visitVideo'),
                            icon: 'building',
                            tint: 'purple',
                          },
                          {
                            key: 'booked',
                            label: t('diagnostics.collection.statBookedOn'),
                            value: fmtDate(a.created_at),
                            icon: 'calendar',
                            tint: 'amber',
                          },
                        ]}
                      />
                    </Card>

                    {/* ── Patient ────────────────────────────────────── */}
                    {patient && (
                      <Card>
                        <Overline
                          label={t('diagnostics.collection.patientInformation')}
                          style={styles.overlineGap}
                        />
                        <View style={styles.personRow}>
                          <View style={styles.avatar}>
                            <Icon name="person" size={24} color={colors.blue} />
                          </View>
                          <View style={styles.personBody}>
                            <Text style={styles.personName} numberOfLines={1}>
                              {patient.name}
                            </Text>
                            <Text style={styles.personMeta} numberOfLines={1}>
                              {[
                                patient.health_id,
                                patient.sex ? titleCase(patient.sex) : null,
                                patient.age != null
                                  ? t('diagnostics.collection.years', { count: patient.age })
                                  : null,
                              ]
                                .filter(Boolean)
                                .join('  •  ')}
                            </Text>
                            {!!patient.phone && (
                              <Text style={styles.personMeta} numberOfLines={1}>
                                {patient.phone}
                              </Text>
                            )}
                          </View>
                          <DiagButton
                            label={t('diagnostics.collection.profile')}
                            icon="person"
                            variant="secondary"
                            size="sm"
                            onPress={() => navigation.navigate('MyHealthId')}
                          />
                        </View>
                      </Card>
                    )}

                    {/* ── Who ordered it ─────────────────────────────── */}
                    <Card>
                      <Overline label={t('diagnostics.collection.orderDetails')} style={styles.overlineGap} />
                      <View style={styles.personRow}>
                        <View style={styles.avatar}>
                          <Icon name="stethoscope" size={24} color={colors.blue} />
                        </View>
                        <View style={styles.personBody}>
                          <Text style={styles.personName} numberOfLines={1}>
                            {a.provider_name ?? t('diagnostics.collection.yourCareTeam')}
                          </Text>
                          <Text style={styles.personRole} numberOfLines={1}>
                            {a.provider_specialty ?? t('diagnostics.collection.laboratory')}
                          </Text>
                          {!!a.department_name && (
                            <Text style={styles.personMeta} numberOfLines={1}>
                              {a.department_name}
                            </Text>
                          )}
                        </View>
                        {!!a.provider_id && (
                          <DiagButton
                            label={t('diagnostics.collection.view')}
                            icon="chevron-right"
                            variant="secondary"
                            size="sm"
                            onPress={() => navigation.navigate('ProviderProfile', { providerId: String(a.provider_id) })}
                          />
                        )}
                      </View>

                      {!!a.reason && (
                        <View style={styles.reasonBlock}>
                          <Text style={styles.reasonLabel}>{t('diagnostics.collection.reasonLabel')}</Text>
                          <Text style={styles.reasonText}>{a.reason}</Text>
                        </View>
                      )}
                    </Card>

                    {/* ── Where to go ────────────────────────────────── */}
                    <Card>
                      <Overline label={t('diagnostics.collection.location')} style={styles.overlineGap} />
                      <View style={styles.personRow}>
                        <View style={styles.avatar}>
                          <Icon name="location" size={24} color={colors.blue} />
                        </View>
                        <View style={styles.personBody}>
                          <Text style={styles.personName} numberOfLines={2}>
                            {a.location ?? a.facility_name ?? t('diagnostics.collection.locationFallback')}
                          </Text>
                          {!!a.facility_name && a.location !== a.facility_name && (
                            <Text style={styles.personMeta} numberOfLines={2}>
                              {a.facility_name}
                            </Text>
                          )}
                        </View>
                        {!!a.department_id && (
                          <DiagButton
                            label={t('diagnostics.collection.directions')}
                            icon="location"
                            variant="secondary"
                            size="sm"
                            onPress={() =>
                              navigation.navigate('FacilityProfile', { departmentId: String(a.department_id) })
                            }
                          />
                        )}
                      </View>

                      <InfoStrip icon="info" tone="pending">
                        <Text style={styles.noticeTitle}>{t('diagnostics.collection.beforeTitle')}</Text>
                        <Text style={styles.noticeBody}>{t('diagnostics.collection.beforeBody')}</Text>
                      </InfoStrip>
                    </Card>
                  </>
                ) : (
                  <EmptyState
                    icon="calendar"
                    tint="blue"
                    title={t('diagnostics.collection.noAppointmentTitle')}
                    message={t('diagnostics.collection.noAppointmentBody')}
                    actionLabel={t('diagnostics.collection.noAppointmentCta')}
                    onAction={() => navigation.navigate('RequestLabTest')}
                  />
                )}

                {/* ── What the lab is waiting on ─────────────────────── */}
                <Card>
                  <Overline label={t('diagnostics.collection.awaitingSample')} style={styles.overlineGap} />
                  {pending.length === 0 ? (
                    <Text style={styles.emptyLine}>{t('diagnostics.collection.awaitingEmpty')}</Text>
                  ) : (
                    pending.map((o, i) => (
                      <ListRow
                        key={o.id}
                        icon="flask"
                        tint="green"
                        title={o.name}
                        subtitle={t('diagnostics.collection.orderedOn', {
                          priority: titleCase(o.priority),
                          date: fmtDate(o.ordered_at),
                        })}
                        onPress={() => navigation.navigate('LabResultDetail', { resultId: o.id })}
                        divider={i < pending.length - 1}
                      />
                    ))
                  )}
                </Card>

                {/* ── Other lab visits ───────────────────────────────── */}
                {others.length > 0 && (
                  <Card>
                    <Overline label={t('diagnostics.collection.otherVisits')} style={styles.overlineGap} />
                    {others.map((o, i) => (
                      <ListRow
                        key={o.id}
                        icon="syringe"
                        tint="blue"
                        title={fmtDateLong(o.scheduled_at)}
                        subtitle={t('diagnostics.collection.otherVisitMeta', {
                          time: fmtTime(o.scheduled_at),
                          status: titleCase(o.status),
                        })}
                        onPress={() => navigation.navigate('LabAppointmentCollection', { appointmentId: o.id })}
                        divider={i < others.length - 1}
                      />
                    ))}
                  </Card>
                )}

                {a && (
                  <>
                    <TechnicalDetails
                      caption={t('diagnostics.collection.technicalCaption')}
                      facts={[
                        { label: t('diagnostics.collection.factAppointmentRef'), value: a.id },
                        {
                          label: t('diagnostics.collection.factBookedThrough'),
                          value: titleCase(a.booking_channel),
                        },
                      ]}
                    />

                    <View style={styles.actions}>
                      <DiagButton
                        label={t('diagnostics.collection.reschedule')}
                        icon="refresh"
                        variant="secondary"
                        disabled={!a.can_reschedule}
                        style={styles.actionButton}
                        onPress={() => navigation.navigate('RescheduleAppointment', { appointmentId: a.id })}
                      />
                      <DiagButton
                        label={t('diagnostics.collection.cancelVisit')}
                        icon="x-circle"
                        variant="secondary"
                        disabled={!a.can_cancel}
                        style={styles.actionButton}
                        onPress={() => navigation.navigate('CancellationConfirmation', { appointmentId: a.id })}
                      />
                    </View>
                    {a.can_check_in && (
                      <DiagButton
                        label={t('diagnostics.collection.checkIn')}
                        icon="qr"
                        onPress={() => navigation.navigate('AppointmentCheckIn', { appointmentId: a.id })}
                      />
                    )}
                  </>
                )}
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
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  upcoming: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  whenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  whenIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.tintBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whenBody: { flex: 1, minWidth: 0 },
  whenDate: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.md,
    color: colors.textPrimary,
  },
  whenTime: {
    marginTop: 2,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },

  overlineGap: { marginBottom: spacing.sm },

  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.tintBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personBody: { flex: 1, minWidth: 0 },
  personName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.md,
    color: colors.textPrimary,
  },
  personRole: {
    marginTop: 2,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },
  personMeta: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  reasonBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  reasonLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  reasonText: {
    marginTop: 2,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  noticeTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  noticeBody: {
    marginTop: spacing.xs / 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  emptyLine: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  actions: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flex: 1 },
});
