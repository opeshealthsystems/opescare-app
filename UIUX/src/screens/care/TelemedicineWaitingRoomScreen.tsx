/**
 * CARE-016 — Telemedicine Waiting Room.
 *
 * Joining is a real state change: `POST …/telemedicine/join` creates (or
 * re-enters) the session, records `patient_joined_at`, and promotes the
 * session to `active` the moment the provider is also present. The queue
 * position, wait estimate and connection quality on this screen are all server
 * values, and the screen polls so it moves to CARE-017 on its own.
 *
 * There is no audio or video here — nothing on this screen pretends to open a
 * media stream. That is CARE-017's placeholder surface.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  fetchTelemedicineSession,
  joinTelemedicine,
  leaveTelemedicine,
  testTelemedicineConnection,
  type ConnectionQuality,
  type TelemedicineSession,
} from '../../api';
import { Card, Icon, IconName, ScreenHeader, SectionHeader, useDialog } from '../../components';
import { useTranslation, type TFunction } from '../../i18n';
import { patientErrorMessage, writeFailureMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, statusMap, typography } from '../../theme/theme';
import { formatDateLong, formatTime } from '../../utils/format';
import { AsyncBoundary, CareButton, ProviderAvatar, useAsync } from './shared';

const POLL_MS = 6000;

/** The tone per band. The copy lives in `care.telemedWaiting.quality*`. */
const QUALITY_TONE: Record<ConnectionQuality, 'normal' | 'warning' | 'critical' | 'pending'> = {
  good: 'pending',
  fair: 'warning',
  poor: 'critical',
  unknown: 'pending',
};

/**
 * Literal `t()` calls rather than a computed key, so `npm run i18n:check` can
 * see every one of these four bands statically.
 */
function qualityText(t: TFunction, q: ConnectionQuality): { label: string; note: string } {
  switch (q) {
    case 'good':
      return {
        label: t('care.telemedWaiting.qualityGood'),
        note: t('care.telemedWaiting.qualityGoodNote'),
      };
    case 'fair':
      return {
        label: t('care.telemedWaiting.qualityFair'),
        note: t('care.telemedWaiting.qualityFairNote'),
      };
    case 'poor':
      return {
        label: t('care.telemedWaiting.qualityPoor'),
        note: t('care.telemedWaiting.qualityPoorNote'),
      };
    default:
      return {
        label: t('care.telemedWaiting.qualityUnknown'),
        note: t('care.telemedWaiting.qualityUnknownNote'),
      };
  }
}

export function TelemedicineWaitingRoomScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'TelemedicineWaitingRoom'>>();
  const appointmentId = params.appointmentId;

  const [testing, setTesting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const movedOn = useRef(false);
  const dialog = useDialog();
  const testingRef = useRef(false);
  const leavingRef = useRef(false);

  const load = useCallback(() => joinTelemedicine(appointmentId), [appointmentId]);
  const state = useAsync<TelemedicineSession>(load, [appointmentId]);
  const { setData, data } = state;

  // Poll for the provider. When the server flips the session to `active`, the
  // consultation has genuinely started — hand over to CARE-017.
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(async () => {
      try {
        const next = await fetchTelemedicineSession(appointmentId);
        setData(next);
        if (next.status === 'active' && !movedOn.current) {
          movedOn.current = true;
          navigation.replace('TelemedicineConsultation', { appointmentId });
        }
      } catch {
        // A transient poll failure must not tear the waiting room down.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [appointmentId, data, navigation, setData]);

  async function runTest() {
    if (testingRef.current) return;
    testingRef.current = true;
    setTesting(true);
    try {
      // The app can measure reachability but not bandwidth — a completed
      // round-trip to the API is reported as "good", a failure as "poor".
      const started = Date.now();
      await fetchTelemedicineSession(appointmentId);
      const rtt = Date.now() - started;
      const quality: 'good' | 'fair' | 'poor' = rtt < 800 ? 'good' : rtt < 2500 ? 'fair' : 'poor';
      setData(await testTelemedicineConnection(appointmentId, quality));
    } catch (e) {
      try {
        setData(await testTelemedicineConnection(appointmentId, 'poor'));
      } catch {
        dialog.show({
          title: t('care.telemedWaiting.testFailTitle'),
          tone: 'warning',
          cancelLabel: 'OK',
          message: patientErrorMessage(e, t('care.telemedWaiting.testFailBody')),
        });
      }
    } finally {
      testingRef.current = false;
      setTesting(false);
    }
  }

  function confirmLeave() {
    dialog.confirm({
      title: t('care.telemedWaiting.leaveTitle'),
      message: t('care.telemedWaiting.leaveBody'),
      confirmLabel: t('care.telemedWaiting.leaveConfirm'),
      cancelLabel: t('care.telemedWaiting.leaveStay'),
      destructive: true,
      onConfirm: async () => {
        if (leavingRef.current) return;
        leavingRef.current = true;
        setLeaving(true);
        try {
          await leaveTelemedicine(appointmentId);
          navigation.goBack();
        } catch (e) {
          dialog.show({
            title: t('care.telemedWaiting.leaveFailTitle'),
            tone: 'critical',
            cancelLabel: 'OK',
            message: writeFailureMessage(
              e,
              t('care.telemedWaiting.leaveFailHint'),
              t('care.telemedWaiting.leaveFailFallback')
            ),
          });
        } finally {
          leavingRef.current = false;
          setLeaving(false);
        }
      },
    });
  }

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={t('care.telemedWaiting.title')}
        subtitle={t('care.telemedWaiting.subtitle')}
      />

      <ScrollView contentContainerStyle={s.body}>
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('care.telemedWaiting.loading')}
        >
          {(sess) => {
            const a = sess.appointment;
            const qTone = QUALITY_TONE[sess.connection_quality];
            const q = qualityText(t, sess.connection_quality);
            const queueDots = Math.max(sess.queue_total, sess.queue_position, 1);
            return (
              <>
                {/* Wait estimate */}
                <View style={s.waitCard}>
                  <View style={s.waitIcon}>
                    <Icon name="clock" size={28} color={colors.textOnBrand} />
                  </View>
                  <View style={s.waitBody}>
                    <Text style={s.waitLabel}>{t('care.telemedWaiting.estimatedWait')}</Text>
                    <Text style={s.waitValue}>
                      {t('care.telemedWaiting.waitRange', {
                        min: sess.estimated_wait_min_minutes,
                        max: sess.estimated_wait_max_minutes,
                      })}
                    </Text>
                    <Text style={s.waitNote}>{t('care.telemedWaiting.waitNote')}</Text>
                  </View>
                  <Icon name="clock" size={40} color={colors.blueLight} />
                </View>

                {/* Appointment */}
                <Card variant="flush" style={s.apptCard}>
                  <View style={s.apptHead}>
                    <Icon name="calendar" size={20} color={colors.textOnBrand} />
                    <Text style={s.apptHeadText}>{t('care.telemedWaiting.yourAppointment')}</Text>
                  </View>

                  <View style={s.apptTop}>
                    <ProviderAvatar
                      name={a.provider_name ?? t('care.telemedWaiting.avatarFallback')}
                      size={72}
                    />
                    <View style={s.apptWho}>
                      <Text style={s.apptName} numberOfLines={1}>
                        {a.provider_name ?? t('care.telemedWaiting.providerFallback')}
                      </Text>
                      <Text style={s.apptSpecialty} numberOfLines={1}>
                        {a.provider_specialty ?? t('care.telemedWaiting.specialtyFallback')}
                      </Text>
                      <View style={s.apptLine}>
                        <Icon name="building" size={14} color={colors.textSecondary} />
                        <Text style={s.apptLineText} numberOfLines={1}>
                          {a.facility_name ?? t('care.telemedWaiting.facilityTbc')}
                        </Text>
                      </View>
                      <View style={s.apptLine}>
                        <Icon name="location" size={14} color={colors.textSecondary} />
                        <Text style={s.apptLineText}>{t('care.telemedWaiting.onlineConsultation')}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={s.presencePad}>
                    <View
                      style={[
                        s.presence,
                        { backgroundColor: sess.provider_present ? statusMap.normal.bg : colors.divider },
                      ]}
                    >
                      <View
                        style={[
                          s.presenceDot,
                          { backgroundColor: sess.provider_present ? statusMap.normal.fg : colors.textMuted },
                        ]}
                      />
                      <Text
                        style={[
                          s.presenceText,
                          { color: sess.provider_present ? statusMap.normal.fg : colors.textSecondary },
                        ]}
                      >
                        {sess.provider_present
                          ? t('care.telemedWaiting.providerJoined')
                          : t('care.telemedWaiting.providerSoon')}
                      </Text>
                    </View>
                  </View>

                  <View style={s.factRow}>
                    <FactCol
                      icon="calendar"
                      label={t('care.telemedWaiting.labelDate')}
                      lines={[formatDateLong(a.scheduled_at)]}
                    />
                    <FactCol
                      icon="clock"
                      label={t('care.telemedWaiting.labelTime')}
                      lines={[
                        t('care.telemedWaiting.timeRange', {
                          start: formatTime(a.scheduled_at),
                          end: formatTime(
                            new Date(
                              new Date(a.scheduled_at).getTime() + a.duration_minutes * 60000
                            ).toISOString()
                          ),
                        }),
                        t('care.telemedWaiting.durationMinutes', { count: a.duration_minutes }),
                      ]}
                      divider
                    />
                    <FactCol
                      icon="document-text"
                      label={t('care.telemedWaiting.labelReason')}
                      lines={[a.reason ?? t('care.telemedWaiting.reasonFallback')]}
                      divider
                    />
                  </View>
                </Card>

                {/* Connection */}
                <Card style={s.connCard}>
                  <View style={s.connRow}>
                    <Icon name="activity" size={22} color={statusMap[qTone].fg} />
                    <View style={s.connBody}>
                      <Text style={s.connLabel}>{t('care.telemedWaiting.connectionTitle')}</Text>
                      <Text style={[s.connValue, { color: statusMap[qTone].fg }]}>
                        {q.label}
                      </Text>
                      <Text style={s.connNote}>{q.note}</Text>
                    </View>
                    <CareButton
                      label={t('care.telemedWaiting.runTest')}
                      variant="secondary"
                      size="sm"
                      loading={testing}
                      onPress={runTest}
                    />
                  </View>
                </Card>

                {/* Queue */}
                <Card style={s.queueCard}>
                  <View style={s.queueHead}>
                    <Icon name="users" size={22} color={colors.blue} />
                    <Text style={s.queueTitle}>{t('care.telemedWaiting.queueTitle')}</Text>
                  </View>
                  <View style={s.queueRow}>
                    <View style={s.queueLeft}>
                      <Text style={s.queueBig}>
                        {t('care.telemedWaiting.youAreNumber', {
                          position: sess.queue_position || 1,
                        })}
                      </Text>
                      <Text style={s.queueSub}>
                        {sess.queue_position <= 1
                          ? t('care.telemedWaiting.nextToBeSeen')
                          : t('care.telemedWaiting.aheadOfYou', { count: sess.queue_position - 1 })}
                      </Text>
                    </View>
                    <View style={s.dots}>
                      {Array.from({ length: Math.min(queueDots, 5) }, (_, i) => {
                        const n = i + 1;
                        const mine = n === sess.queue_position;
                        return (
                          <React.Fragment key={n}>
                            {i > 0 && <View style={s.dotLine} />}
                            <View style={[s.dot, mine && s.dotMine]}>
                              <Text style={[s.dotText, mine && s.dotTextMine]}>{n}</Text>
                            </View>
                          </React.Fragment>
                        );
                      })}
                    </View>
                  </View>
                  <View style={s.notify}>
                    <Icon name="bell" size={20} color={statusMap.normal.fg} />
                    <View style={s.notifyBody}>
                      <Text style={s.notifyTitle}>{t('care.telemedWaiting.notifyTitle')}</Text>
                      <Text style={s.notifyText}>{t('care.telemedWaiting.notifyText')}</Text>
                    </View>
                  </View>
                </Card>

                {/* Readiness checklist */}
                <View style={s.checklist}>
                  <Icon name="shield-check" size={24} color={colors.blue} />
                  <View style={s.checklistBody}>
                    <Text style={s.checklistTitle}>{t('care.telemedWaiting.checklistTitle')}</Text>
                    {[
                      t('care.telemedWaiting.checkQuiet'),
                      t('care.telemedWaiting.checkDevice'),
                      t('care.telemedWaiting.checkNetwork'),
                    ].map((line) => (
                      <View key={line} style={s.checkLine}>
                        <Icon name="check-circle" size={18} color={colors.blue} />
                        <Text style={s.checkText}>{line}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* While you wait */}
                <SectionHeader title={t('care.telemedWaiting.whileYouWait')} variant="overline" />
                <View style={s.tiles}>
                  <Tile
                    icon="headset"
                    title={t('care.telemedWaiting.tileTestAv')}
                    subtitle={t('care.telemedWaiting.tileTestAvSub')}
                    onPress={() =>
                      dialog.show({
                        title: t('care.telemedWaiting.tileTestAv'),
                        tone: 'info',
                        cancelLabel: t('common.close'),
                        message: t('care.telemedWaiting.testAvBody'),
                      })
                    }
                  />
                  <Tile
                    icon="chat"
                    title={t('care.telemedWaiting.tileMessage')}
                    subtitle={t('care.telemedWaiting.tileMessageSub')}
                    onPress={() => navigation.navigate('NewMessage')}
                  />
                  <Tile
                    icon="info"
                    title={t('care.telemedWaiting.tileGuidelines')}
                    subtitle={t('care.telemedWaiting.tileGuidelinesSub')}
                    onPress={() =>
                      dialog.show({
                        title: t('care.telemedWaiting.tileGuidelines'),
                        tone: 'info',
                        cancelLabel: t('common.close'),
                        message: t('care.telemedWaiting.guidelinesBody'),
                      })
                    }
                  />
                  <Tile
                    icon="logout"
                    title={t('care.telemedWaiting.tileLeave')}
                    subtitle={t('care.telemedWaiting.tileLeaveSub')}
                    tone="critical"
                    onPress={confirmLeave}
                  />
                </View>

                <View style={s.help}>
                  <Icon name="help-circle" size={22} color={colors.link} />
                  <View style={s.helpBody}>
                    <Text style={s.helpTitle}>{t('care.telemedWaiting.needHelp')}</Text>
                    <Text style={s.helpText}>
                      {t('care.telemedWaiting.helpText', { code: sess.room_code })}
                    </Text>
                  </View>
                </View>

                <CareButton
                  label={t('care.telemedWaiting.leaveCta')}
                  variant="danger"
                  icon="logout"
                  loading={leaving}
                  onPress={confirmLeave}
                />
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>

      {dialog.element}
    </View>
  );
}

function FactCol({
  icon,
  label,
  lines,
  divider,
}: {
  icon: IconName;
  label: string;
  lines: string[];
  divider?: boolean;
}) {
  return (
    <View style={[s.factCol, divider && s.factDivider]}>
      <View style={s.factHead}>
        <Icon name={icon} size={18} color={colors.blue} />
        <Text style={s.factLabel}>{label}</Text>
      </View>
      {lines.map((l, i) => (
        <Text key={`${l}-${i}`} style={s.factText}>
          {l}
        </Text>
      ))}
    </View>
  );
}

function Tile({
  icon,
  title,
  subtitle,
  onPress,
  tone = 'normal',
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  tone?: 'normal' | 'critical';
}) {
  const fg = tone === 'critical' ? colors.statusCritical : colors.blue;
  return (
    <TouchableOpacity style={s.tile} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <Icon name={icon} size={24} color={fg} />
      <Text style={[s.tileTitle, tone === 'critical' && { color: colors.statusCritical }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={s.tileSub} numberOfLines={1}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  waitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  waitIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  waitBody: { flex: 1, minWidth: 0, gap: 2 },
  waitLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
  waitValue: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.xl, color: colors.blue },
  waitNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  apptCard: { overflow: 'hidden' },
  apptHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.blue,
  },
  apptHeadText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    letterSpacing: 0.8,
    color: colors.textOnBrand,
  },
  apptTop: { flexDirection: 'row', gap: spacing.md - 4, padding: spacing.md },
  apptWho: { flex: 1, minWidth: 0, gap: 3 },
  apptName: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.lg, color: colors.textPrimary },
  apptSpecialty: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link },
  apptLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  apptLineText: { flex: 1, fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },

  presencePad: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  presence: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.sm },
  presenceDot: { width: 9, height: 9, borderRadius: 5 },
  presenceText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },

  factRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.divider },
  factCol: { flex: 1, padding: spacing.md - 4, gap: 4 },
  factDivider: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  factHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.textPrimary },
  factText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  connCard: {},
  connRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4 },
  connBody: { flex: 1, minWidth: 0, gap: 1 },
  connLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.textPrimary },
  connValue: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.lg },
  connNote: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },

  queueCard: { gap: spacing.md },
  queueHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  queueTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  queueLeft: { flex: 1, minWidth: 0, gap: 2 },
  queueBig: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.xl, color: colors.blue },
  queueSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },
  dots: { flexDirection: 'row', alignItems: 'center' },
  dotLine: { width: 14, height: 1, backgroundColor: colors.border },
  dot: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
  dotMine: { backgroundColor: colors.blue },
  dotText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: colors.textSecondary },
  dotTextMine: { color: colors.textOnBrand },
  notify: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md - 4,
    borderRadius: radii.sm,
    backgroundColor: statusMap.normal.bg,
  },
  notifyBody: { flex: 1, gap: 2 },
  notifyTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: statusMap.normal.fg },
  notifyText: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: statusMap.normal.fg },

  checklist: {
    flexDirection: 'row',
    gap: spacing.md - 4,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  checklistBody: { flex: 1, gap: 6 },
  checklistTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.textPrimary },
  checkLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkText: { flex: 1, fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.textPrimary },
  tileSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },

  help: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md - 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  helpBody: { flex: 1, gap: 2 },
  helpTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.textPrimary },
  helpText: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },
});
