/**
 * CARE-017 — Telemedicine Consultation.
 *
 * The session is real: it is fetched from `GET …/telemedicine`, the timer runs
 * off the server's `started_at`/`elapsed_seconds`, and "End Visit" posts to
 * `…/telemedicine/end`, which freezes the true duration and completes the
 * appointment before CARE-018 renders the record.
 *
 * THE MEDIA STREAM IS NOT IMPLEMENTED. There is no WebRTC provider behind this
 * app, and the server says as much (`media_available: false`). The stage below
 * is a labelled placeholder surface, and the mic / camera / speaker controls
 * are local UI state only — they are disabled while no stream exists rather
 * than pretending to mute something.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  endTelemedicine,
  fetchTelemedicineSession,
  type TelemedicineSession,
} from '../../api';
import { Card, Icon, IconName, ScreenHeader, SectionHeader, useDialog } from '../../components';
import { useTranslation, type TFunction } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, statusMap, typography } from '../../theme/theme';
import { formatDateLong, formatTime } from '../../utils/format';
import { AsyncBoundary, ProviderAvatar, useAsync } from './shared';

function hhmmss(total: number): string {
  const t = Math.max(0, Math.floor(total));
  const m = Math.floor(t / 60);
  const sec = t % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function TelemedicineConsultationScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'TelemedicineConsultation'>>();
  const appointmentId = params.appointmentId;

  const [ending, setEnding] = useState(false);
  const [tick, setTick] = useState(0);
  const dialog = useDialog();
  const endingRef = useRef(false);

  const load = useCallback(() => fetchTelemedicineSession(appointmentId), [appointmentId]);
  const state = useAsync<TelemedicineSession>(load, [appointmentId]);
  const { data } = state;

  // The clock is the server's elapsed count plus wall time since we loaded it.
  useEffect(() => {
    if (!data || data.status !== 'active') return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [data]);

  useEffect(() => {
    setTick(0);
  }, [data?.elapsed_seconds]);

  function confirmEnd() {
    dialog.confirm({
      title: t('care.telemedConsult.endTitle'),
      message: t('care.telemedConsult.endBody'),
      confirmLabel: t('care.telemedConsult.endConfirm'),
      cancelLabel: t('care.telemedConsult.endStay'),
      destructive: true,
      onConfirm: async () => {
        if (endingRef.current) return;
        endingRef.current = true;
        setEnding(true);
        try {
          await endTelemedicine(appointmentId);
          navigation.replace('ConsultationCompleted', { appointmentId });
        } catch (e) {
          dialog.show({
            title: t('care.telemedConsult.endFailTitle'),
            tone: 'critical',
            cancelLabel: 'OK',
            message: writeFailureMessage(
              e,
              t('care.telemedConsult.endFailHint'),
              t('care.telemedConsult.endFailFallback')
            ),
          });
        } finally {
          endingRef.current = false;
          setEnding(false);
        }
      },
    });
  }

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={t('care.telemedConsult.title')}
        right={
          data ? (
            <View style={s.timer}>
              <View style={s.recDot} />
              <Text style={s.timerText}>
                {hhmmss((data.elapsed_seconds ?? 0) + (data.status === 'active' ? tick : 0))}
              </Text>
            </View>
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={s.body}>
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('care.telemedConsult.loading')}
        >
          {(sess) => {
            const a = sess.appointment;
            const ended = sess.status === 'completed' || sess.status === 'cancelled';
            return (
              <>
                <View style={s.secureStrip}>
                  <Icon name="lock" size={16} color={colors.link} />
                  <Text style={s.secureStripText}>{t('care.telemedConsult.secureStrip')}</Text>
                </View>

                {/* Video stage — placeholder surface, no media transport. */}
                <View style={s.stage} accessibilityLabel={t('care.telemedConsult.stageA11y')}>
                  <View style={s.stageCentre}>
                    <Icon name="video" size={40} color={colors.textOnBrand} />
                    <Text style={s.stageTitle}>{t('care.telemedConsult.stageTitle')}</Text>
                    <Text style={s.stageText}>{t('care.telemedConsult.stageText')}</Text>
                  </View>

                  {/* Provider name card */}
                  <View style={s.namecard}>
                    <Text style={s.nameText} numberOfLines={1}>
                      {a.provider_name ?? t('care.telemedConsult.providerFallback')}
                    </Text>
                    <Text style={s.nameSpecialty} numberOfLines={1}>
                      {a.provider_specialty ?? t('care.telemedConsult.specialtyFallback')}
                    </Text>
                    <View style={s.nameStatus}>
                      <View
                        style={[
                          s.nameDot,
                          { backgroundColor: sess.provider_present ? statusMap.normal.fg : colors.textMuted },
                        ]}
                      />
                      <Text style={s.nameStatusText}>
                        {sess.provider_present
                          ? t('care.telemedConsult.online')
                          : t('care.telemedConsult.notJoined')}
                      </Text>
                    </View>
                  </View>

                  {/* Self tile */}
                  <View style={s.selfTile}>
                    <ProviderAvatar name={t('care.telemedConsult.you')} size={44} />
                    <Text style={s.selfLabel}>{t('care.telemedConsult.you')}</Text>
                  </View>

                  {/* Confidentiality caption */}
                  <View style={s.caption}>
                    <Icon name="shield-check" size={20} color={colors.textOnBrand} />
                    <View style={s.captionBody}>
                      <Text style={s.captionText}>{t('care.telemedConsult.captionSecure')}</Text>
                      <Text style={s.captionText}>{t('care.telemedConsult.captionShare')}</Text>
                    </View>
                  </View>
                </View>

                {/* Consultation details */}
                <Card style={s.detailCard}>
                  <View style={s.detailHead}>
                    <Icon name="clipboard" size={20} color={colors.blue} />
                    <Text style={s.detailTitle}>{t('care.telemedConsult.detailsTitle')}</Text>
                    <TouchableOpacity
                      style={s.detailAction}
                      accessibilityRole="button"
                      onPress={() => navigation.navigate('AppointmentDetail', { appointmentId })}
                    >
                      <Text style={s.detailActionText}>{t('care.telemedConsult.viewDetails')}</Text>
                      <Icon name="chevron-right" size={16} color={colors.link} />
                    </TouchableOpacity>
                  </View>
                  <View style={s.detailRow}>
                    <DetailCol
                      icon="calendar"
                      label={t('care.telemedConsult.labelDate')}
                      lines={[formatDateLong(a.scheduled_at)]}
                    />
                    <DetailCol
                      icon="clock"
                      label={t('care.telemedConsult.labelTime')}
                      divider
                      lines={[
                        t('care.telemedConsult.timeRange', {
                          start: formatTime(a.scheduled_at),
                          end: formatTime(
                            new Date(
                              new Date(a.scheduled_at).getTime() + a.duration_minutes * 60000
                            ).toISOString()
                          ),
                        }),
                        t('care.telemedConsult.durationMinutes', { count: a.duration_minutes }),
                      ]}
                    />
                    <DetailCol
                      icon="document-text"
                      label={t('care.telemedConsult.labelReason')}
                      divider
                      lines={[a.reason ?? t('care.telemedConsult.reasonFallback')]}
                    />
                  </View>
                </Card>

                <SectionHeader title={t('care.telemedConsult.quickActions')} variant="overline" />
                <View style={s.quick}>
                  <Quick
                    icon="chat"
                    label={t('care.telemedConsult.quickChat')}
                    onPress={() => navigation.navigate('NewMessage')}
                  />
                  <Quick
                    icon="paperclip"
                    label={t('care.telemedConsult.quickShareFile')}
                    onPress={() => navigation.navigate('MainTabs', { screen: 'HealthTab', params: { screen: 'Documents' } })}
                  />
                  <Quick
                    icon="pill"
                    label={t('care.telemedConsult.quickPrescriptions')}
                    onPress={() => navigation.navigate('Medications')}
                  />
                  <Quick
                    icon="folder"
                    label={t('care.telemedConsult.quickDocuments')}
                    onPress={() => navigation.navigate('MainTabs', { screen: 'HealthTab', params: { screen: 'Documents' } })}
                  />
                  <Quick
                    icon="phone"
                    label={t('care.telemedConsult.quickEnd')}
                    tone="critical"
                    onPress={confirmEnd}
                  />
                </View>

                {/* Call control bar — inert while there is no stream. */}
                <View style={s.bar}>
                  <Control icon="headset" label={t('care.telemedConsult.ctrlMicrophone')} t={t} />
                  <Control icon="video" label={t('care.telemedConsult.ctrlCamera')} t={t} />
                  <Control icon="activity" label={t('care.telemedConsult.ctrlSpeaker')} t={t} />
                  <Control icon="more-horizontal" label={t('care.telemedConsult.ctrlMore')} t={t} />
                  <TouchableOpacity
                    style={s.hangup}
                    onPress={confirmEnd}
                    disabled={ending || ended}
                    accessibilityRole="button"
                    accessibilityLabel={t('care.telemedConsult.endVisitA11y')}
                  >
                    <Icon name="phone" size={26} color={colors.textOnBrand} />
                  </TouchableOpacity>
                </View>
                <Text style={s.barNote}>{t('care.telemedConsult.barNote')}</Text>

                {ended && (
                  <Card style={s.endedCard}>
                    <Text style={s.endedText}>{t('care.telemedConsult.endedText')}</Text>
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => navigation.replace('ConsultationCompleted', { appointmentId })}
                    >
                      <Text style={s.endedLink}>{t('care.telemedConsult.endedLink')}</Text>
                    </TouchableOpacity>
                  </Card>
                )}
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>

      {dialog.element}
    </View>
  );
}

function DetailCol({
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
    <View style={[s.detailCol, divider && s.detailDivider]}>
      <View style={s.detailColHead}>
        <Icon name={icon} size={18} color={colors.blue} />
        <Text style={s.detailColLabel}>{label}</Text>
      </View>
      {lines.map((l, i) => (
        <Text key={`${l}-${i}`} style={s.detailColText}>
          {l}
        </Text>
      ))}
    </View>
  );
}

function Quick({
  icon,
  label,
  onPress,
  tone = 'normal',
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'normal' | 'critical';
}) {
  const fg = tone === 'critical' ? colors.statusCritical : colors.blue;
  return (
    <TouchableOpacity style={s.quickTile} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <Icon name={icon} size={22} color={fg} />
      <Text style={[s.quickLabel, tone === 'critical' && { color: colors.statusCritical }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** A call control that is deliberately disabled: there is nothing to control. */
function Control({ icon, label, t }: { icon: IconName; label: string; t: TFunction }) {
  return (
    <View
      style={s.control}
      accessibilityLabel={t('care.telemedConsult.ctrlUnavailableA11y', { label })}
      accessibilityState={{ disabled: true }}
    >
      <Icon name={icon} size={22} color={colors.textMuted} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.statusCritical },
  timerText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },

  secureStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  secureStripText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: colors.link },

  stage: {
    height: 420,
    borderRadius: radii.lg,
    backgroundColor: colors.navy,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  stageCentre: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  stageTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textOnBrand },
  stageText: {
    textAlign: 'center',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.sm,
    color: colors.surfaceMuted,
  },

  namecard: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    gap: 2,
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.navyLight,
    maxWidth: '58%',
  },
  nameText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textOnBrand },
  nameSpecialty: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.blueLight },
  nameStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  nameDot: { width: 8, height: 8, borderRadius: 4 },
  nameStatusText: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textOnBrand },

  selfTile: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 96,
    height: 128,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.navyLight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  selfLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: colors.textOnBrand },

  caption: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md - 4,
    borderRadius: radii.sm,
    backgroundColor: colors.navyLight,
  },
  captionBody: { flex: 1, gap: 2 },
  captionText: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textOnBrand },

  detailCard: { gap: spacing.md },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailTitle: { flex: 1, fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
  detailAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailActionText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link },
  detailRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md - 4 },
  detailCol: { flex: 1, paddingHorizontal: spacing.sm, gap: 4 },
  detailDivider: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  detailColHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailColLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.textPrimary },
  detailColText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickTile: {
    flexGrow: 1,
    flexBasis: '30%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md - 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quickLabel: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.textPrimary },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md - 4,
    borderRadius: radii.lg,
    backgroundColor: colors.navy,
  },
  control: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.navyLight,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.6,
  },
  hangup: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.statusCritical,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barNote: {
    textAlign: 'center',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: -spacing.sm,
  },

  endedCard: { gap: spacing.sm },
  endedText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },
  endedLink: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link },
});
