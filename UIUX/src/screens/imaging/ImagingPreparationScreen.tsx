/**
 * DIA-017 — Imaging Preparation.
 *
 * The instructions a patient must follow before a study, from
 * `GET /patient/imaging/{id}/preparation`. Every numbered step, its glyph and
 * its tint come from `imaging_preparation_instructions` — body-part rows
 * override the generic modality rows — so no clinical advice is hardcoded here.
 *
 * "I Understand & Accept" is a real, recorded attestation, not component state:
 * it POSTs to the acknowledge endpoint and the screen comes back showing the
 * acknowledgement it already has.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  acknowledgeImagingPreparation,
  fetchImagingPreparation,
  type ImagingPreparation,
  type PreparationInstruction,
} from '../../api/imaging';
import { Card, Icon, iconNames, type IconName, ScreenHeader, useDialog } from '../../components';
import { useTranslation } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, tintMap, type Tint, typography } from '../../theme/theme';
import { fmtDate, fmtTime, IconFact, PersonBlock } from './detailShared';
import { AsyncBoundary, DiagButton, titleCase, useAsync } from '../diagnostics/shared';

/** The server stores a glyph name; refuse anything the icon set does not have. */
function safeIcon(name: string): IconName {
  return (iconNames as string[]).includes(name) ? (name as IconName) : 'info';
}

const TINTS: Tint[] = ['green', 'blue', 'purple', 'amber', 'red'];

function safeTint(tint: string): Tint {
  return TINTS.includes(tint as Tint) ? (tint as Tint) : 'blue';
}

/**
 * One numbered step. The reference fills the circle solid in the step's tint
 * with a white glyph, rather than the pastel list-row treatment.
 */
function StepCard({ step }: { step: PreparationInstruction }) {
  const tint = tintMap[safeTint(step.tint)];

  return (
    <Card style={styles.stepCard}>
      <View style={[styles.stepCircle, { backgroundColor: tint.fg }]}>
        <Icon name={safeIcon(step.icon)} size={24} color={colors.textOnBrand} />
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>
          {step.step_number}. {step.title}
        </Text>
        <Text style={styles.stepText}>{step.body}</Text>
      </View>
    </Card>
  );
}

export function ImagingPreparationScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'ImagingPreparation'>>();
  const studyId = params.studyId;

  const state = useAsync<ImagingPreparation>(() => fetchImagingPreparation(studyId), [studyId]);
  const [accepting, setAccepting] = useState(false);
  const dialog = useDialog();
  const acceptingRef = useRef(false);

  const accept = useCallback(async () => {
    if (accepting || acceptingRef.current) return;
    acceptingRef.current = true;
    setAccepting(true);
    try {
      const ack = await acknowledgeImagingPreparation(studyId);
      if (state.data) {
        state.setData({ ...state.data, acknowledged_at: ack.acknowledged_at });
      }
    } catch (e) {
      dialog.show({
        title: t('imaging.prep.ackFailedTitle'),
        tone: 'warning',
        cancelLabel: 'OK',
        message: writeFailureMessage(e, t('imaging.prep.ackFailedBody')),
      });
    } finally {
      acceptingRef.current = false;
      setAccepting(false);
    }
  }, [accepting, state, studyId, dialog, t]);

  const call = useCallback(
    (phone: string) => {
      Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {
        dialog.show({
          title: t('imaging.prep.callFailedTitle'),
          tone: 'info',
          cancelLabel: 'OK',
          message: t('imaging.prep.callFailedBody', { phone }),
        });
      });
    },
    [dialog, t]
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.prep.title')}
        subtitle={t('imaging.prep.subtitle')}
        right={
          <View style={styles.importantPill}>
            <View style={styles.importantHead}>
              <Icon name="info" size={16} color={colors.blue} />
              <Text style={styles.importantTitle}>{t('imaging.prep.importantPill')}</Text>
            </View>
            <Text style={styles.importantSub}>{t('imaging.prep.importantPillSub')}</Text>
          </View>
        }
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
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('imaging.prep.loading')}
        >
          {(prep) => {
            const accepted = prep.acknowledged_at !== null;
            const when = prep.appointment.scheduled_at;

            return (
              <>
                {/* ── Who / when / where ──────────────────────────────── */}
                <Card>
                  <View style={styles.identityRow}>
                    <PersonBlock
                      name={prep.patient.name ?? t('imaging.prep.patientFallback')}
                      lines={[
                        [
                          prep.patient.medical_id
                            ? t('imaging.prep.opesId', { id: prep.patient.medical_id })
                            : null,
                          [
                            prep.patient.age != null
                              ? t('imaging.common.yearsShort', { count: prep.patient.age })
                              : null,
                            prep.patient.sex ? titleCase(prep.patient.sex).charAt(0) : null,
                          ]
                            .filter(Boolean)
                            .join(', ') || null,
                        ]
                          .filter(Boolean)
                          .join('  •  '),
                        prep.patient.phone,
                      ]}
                    />
                    <DiagButton
                      label={t('imaging.prep.edit')}
                      icon="edit"
                      variant="secondary"
                      size="sm"
                      onPress={() => navigation.navigate('MainTabs', { screen: 'ProfileTab', params: { sheet: 'personal' } })}
                    />
                  </View>

                  <View style={styles.factDivider} />

                  <View style={styles.factGrid}>
                    <View style={styles.factCell}>
                      <IconFact
                        icon="lungs"
                        label={t('imaging.prep.factStudy')}
                        value={prep.study.study_name}
                      />
                    </View>
                    <View style={styles.factCell}>
                      <IconFact
                        icon="calendar"
                        label={t('imaging.prep.factAppointment')}
                        value={
                          when
                            ? `${fmtDate(when)}\n${fmtTime(when)}`
                            : t('imaging.prep.toBeScheduled')
                        }
                      />
                    </View>
                    <View style={styles.factCell}>
                      <IconFact
                        icon="building"
                        label={t('imaging.prep.factLocation')}
                        value={prep.appointment.location}
                      />
                    </View>
                    <View style={styles.factCell}>
                      <IconFact
                        icon="document"
                        label={t('imaging.prep.factReference')}
                        value={prep.appointment.order_number ?? '—'}
                      />
                    </View>
                  </View>
                </Card>

                {/* ── Numbered steps ──────────────────────────────────── */}
                <Text style={styles.sectionTitle}>{t('imaging.prep.instructions')}</Text>

                {prep.instructions.length === 0 ? (
                  <Card>
                    <Text style={styles.stepText}>{t('imaging.prep.noInstructions')}</Text>
                  </Card>
                ) : (
                  <View style={styles.stepList}>
                    {prep.instructions.map((step) => (
                      <StepCard key={step.id} step={step} />
                    ))}
                  </View>
                )}

                {/* ── Important notes ─────────────────────────────────── */}
                {prep.notes.length > 0 && (
                  <View style={styles.notes}>
                    <View style={styles.notesBody}>
                      <View style={styles.notesHead}>
                        <Icon name="info" size={18} color={colors.blue} />
                        <Text style={styles.notesTitle}>{t('imaging.prep.notesTitle')}</Text>
                      </View>
                      {prep.notes.map((note) => (
                        <View key={note} style={styles.noteRow}>
                          <Text style={styles.noteDot}>•</Text>
                          <Text style={styles.noteText}>{note}</Text>
                        </View>
                      ))}
                    </View>
                    <Icon name="clipboard" size={56} color={colors.blueLight} />
                  </View>
                )}

                {/* ── Need help ───────────────────────────────────────── */}
                <Card style={styles.helpCard}>
                  <Icon name="headset" size={28} color={colors.textSecondary} />
                  <View style={styles.helpBody}>
                    <Text style={styles.helpTitle}>{t('imaging.prep.needHelp')}</Text>
                    <Text style={styles.helpSub}>{prep.contact.label}</Text>
                  </View>
                  <DiagButton
                    label={t('imaging.prep.callContact', { phone: prep.contact.phone })}
                    icon="phone"
                    variant="secondary"
                    size="sm"
                    onPress={() => call(prep.contact.phone)}
                  />
                </Card>

                {/* ── Attestation ─────────────────────────────────────── */}
                {accepted ? (
                  <View style={styles.acceptedBar}>
                    <Icon name="check-circle" size={20} color={colors.statusNormal} />
                    <Text style={styles.acceptedText}>
                      {t('imaging.prep.acceptedOn', {
                        date: fmtDate(prep.acknowledged_at),
                        time: fmtTime(prep.acknowledged_at),
                      })}
                    </Text>
                  </View>
                ) : (
                  <DiagButton
                    label={accepting ? t('imaging.prep.accepting') : t('imaging.prep.accept')}
                    icon="check-circle"
                    variant="primary"
                    disabled={accepting}
                    onPress={accept}
                    style={styles.acceptButton}
                  />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  importantPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 190,
  },
  importantHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  importantTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.blue,
  },
  importantSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },

  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  factDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  factCell: { width: '50%', paddingRight: spacing.sm },

  sectionTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },

  stepList: { gap: 10 },
  stepCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepCircle: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBody: { flex: 1, gap: 4 },
  stepTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  stepText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  notes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  notesBody: { flex: 1, gap: 6 },
  notesHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  notesTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.blue,
  },
  noteRow: { flexDirection: 'row', gap: 8 },
  noteDot: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  noteText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  helpCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  helpBody: { flex: 1 },
  helpTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.link,
  },
  helpSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  acceptButton: { marginTop: spacing.xs },
  acceptedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.statusNormalBg,
    borderRadius: radii.md,
    paddingVertical: 14,
    marginTop: spacing.xs,
  },
  acceptedText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.statusNormal,
  },
});
