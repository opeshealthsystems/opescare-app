/**
 * CARE-010 — Appointment Review & Confirmation.
 *
 * This is where the write happens: one transactional
 * `POST /patient/appointments { slot_id, … }`. The API locks the slot row, so a
 * race returns 409 — surfaced here as "just taken" with a route back to the
 * refreshed slot grid rather than a fake success.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  bookAppointment,
  NotLinkedError,
  PortalConflictError,
  ValidationError,
} from '../../api';
import { Card, EmptyState, Icon, IconName, ScreenHeader } from '../../components';
import { useTranslation } from '../../i18n';
import { describeFailure, writeFailureMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { formatLabel } from '../../utils/format';
import { typeLabelOf, visitModeLabelOf } from './apptLabels';
import { getDraft, dropDraft } from './draft';
import {
  CareButton,
  fmtDateLong,
  fmtDuration,
  fmtTime,
  NoticeBanner,
  ProviderAvatar,
} from './shared';

type Failure =
  | { kind: 'conflict'; title: string; detail: string }
  | { kind: 'validation'; violations: { field: string; message: string }[] }
  | { kind: 'notLinked' }
  | { kind: 'error'; title: string; message: string };

export function AppointmentReviewScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'AppointmentReview'>>();
  const draft = getDraft(params.draftId);

  const [submitting, setSubmitting] = useState(false);
  // Flips synchronously, so a second tap on a slow link cannot start a
  // second booking before React has disabled the button.
  const submittingRef = useRef(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  if (!draft) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={t('care.review.title')} subtitle={t('care.review.subtitle')} />
        <View style={styles.content}>
          <Card>
            <EmptyState
              icon="alert-circle"
              tint="amber"
              title={t('care.review.draftExpiredTitle')}
              message={t('care.review.draftExpiredMessage')}
              actionLabel={t('care.appt.findProvider')}
              onAction={() => navigation.navigate('FindProvider')}
            />
          </Card>
        </View>
      </View>
    );
  }

  const { provider: p, slot } = draft;

  async function confirm() {
    if (!draft) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFailure(null);
    setSubmitting(true);
    try {
      const appointment = await bookAppointment({
        slot_id: draft.slot.id,
        appointment_type: draft.appointmentType,
        visit_mode: draft.visitMode,
        ...(draft.reason ? { reason: draft.reason } : {}),
        ...(draft.slot.facility_id ? { facility_id: draft.slot.facility_id } : {}),
      });
      dropDraft(draft.id);
      // CARE-011 renders the appointment the API actually created.
      navigation.replace('AppointmentConfirmed', { appointmentId: appointment.id });
    } catch (e) {
      if (e instanceof PortalConflictError) setFailure({ kind: 'conflict', title: e.title, detail: e.detail });
      else if (e instanceof ValidationError) setFailure({ kind: 'validation', violations: e.violations });
      else if (e instanceof NotLinkedError) setFailure({ kind: 'notLinked' });
      else {
        // A timed-out booking may well have been recorded. Never assert it
        // failed — classify it and tell the patient the outcome is unknown,
        // pointing them at their appointments to check for themselves.
        const f = describeFailure(e);
        setFailure({ kind: 'error', title: f.title, message: writeFailureMessage(e, t('care.review.checkHint')) });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('care.review.title')} subtitle={t('care.review.subtitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        {failure === null ? (
          <View style={styles.almost}>
            <View style={styles.almostIcon}>
              <Icon name="check" size={20} color={colors.textOnBrand} />
            </View>
            <View style={styles.almostBody}>
              <Text style={styles.almostTitle}>{t('care.review.almostTitle')}</Text>
              <Text style={styles.almostText}>{t('care.review.almostText')}</Text>
            </View>
          </View>
        ) : (
          <FailureBanner
            failure={failure}
            onPickAnotherTime={() => navigation.navigate('AvailableTimeSlots', { providerId: String(p.id) })}
            onLink={() => navigation.navigate('MyHealthId')}
          />
        )}

        <Card>
          <CardHead icon="person" title={t('care.review.providerTitle')} onAction={() => navigation.navigate('FindProvider')} />
          <View style={styles.providerRow}>
            <ProviderAvatar name={p.name} size={64} />
            <View style={styles.providerBody}>
              <Text style={styles.providerName} numberOfLines={2}>
                {p.name}
              </Text>
              <Text style={styles.providerSpecialty}>{p.specialty ?? p.title ?? t('care.review.providerFallback')}</Text>
              <View style={styles.metaRow}>
                <Icon name="building" size={15} color={colors.textSecondary} />
                <Text style={styles.meta} numberOfLines={1}>
                  {p.facility_name ?? t('care.appt.facilityTbd')}
                </Text>
              </View>
              {!!p.room && (
                <View style={styles.metaRow}>
                  <Icon name="location" size={15} color={colors.textSecondary} />
                  <Text style={styles.meta} numberOfLines={1}>
                    {p.room}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Card>

        <Card>
          <CardHead
            icon="calendar"
            title={t('care.review.dateTimeTitle')}
            onAction={() => navigation.navigate('AvailableTimeSlots', { providerId: String(p.id) })}
          />
          <View style={styles.chipRow}>
            <View style={styles.softChip}>
              <Icon name="calendar" size={18} color={colors.blue} />
              <Text style={styles.softChipText} numberOfLines={2}>
                {fmtDateLong(slot.slot_start)}
              </Text>
            </View>
            <View style={styles.softChip}>
              <Icon name="clock" size={18} color={colors.blue} />
              <View style={styles.softChipStack}>
                <Text style={styles.softChipText} numberOfLines={1}>
                  {fmtTime(slot.slot_start)} – {fmtTime(slot.slot_end)}
                </Text>
                <Text style={styles.softChipSub}>{fmtDuration(slot.duration_minutes)}</Text>
              </View>
            </View>
          </View>
        </Card>

        <Card>
          <CardHead icon="clipboard" title={t('care.review.typeTitle')} onAction={() => navigation.goBack()} />
          <View style={styles.typeRow}>
            <View style={styles.typeCircle}>
              <Icon name={draft.visitMode === 'telemedicine' ? 'video' : 'person'} size={22} color={colors.blue} />
            </View>
            <View style={styles.typeBody}>
              <Text style={styles.typeTitle}>
                {draft.visitMode === 'telemedicine' ? t('care.appt.videoConsultation') : t('care.appt.inPersonVisit')}
              </Text>
              <Text style={styles.typeSubtitle}>
                {draft.visitMode === 'telemedicine'
                  ? t('care.appt.videoConsultationHint')
                  : t('care.appt.inPersonVisitHint')}
                {' · '}
                {typeLabelOf(t, draft.appointmentType)}
              </Text>
            </View>
          </View>
        </Card>

        <Card>
          <CardHead icon="edit" title={t('care.review.reasonTitle')} onAction={() => navigation.goBack()} />
          <Text style={styles.reason}>{draft.reason || t('care.review.reasonFallback')}</Text>
        </Card>

        <Card>
          <CardHead icon="bell" title={t('care.review.remindersTitle')} />
          <Policy title={t('care.review.reminderTitle')} text={t('care.review.reminderText')} />
          <Policy title={t('care.review.cancelPolicyTitle')} text={t('care.review.cancelPolicyText')} />
        </Card>

        <NoticeBanner
          icon="info"
          tone="pending"
          title={t('care.review.confirmNoticeTitle')}
          message={t('care.review.confirmNoticeText')}
        />

        <CareButton
          label={submitting ? t('care.review.booking') : t('care.review.confirm')}
          icon="calendar-check"
          loading={submitting}
          onPress={confirm}
        />
      </ScrollView>
    </View>
  );
}

function FailureBanner({
  failure,
  onPickAnotherTime,
  onLink,
}: {
  failure: Failure;
  onPickAnotherTime: () => void;
  onLink: () => void;
}) {
  const { t } = useTranslation();
  if (failure.kind === 'conflict') {
    return (
      <View style={styles.failure}>
        <NoticeBanner
          icon="alert-triangle"
          tone="warning"
          title={failure.title || t('care.review.conflictTitle')}
          message={failure.detail || t('care.review.conflictMessage')}
        />
        <CareButton label={t('care.review.chooseAnotherTime')} icon="clock" onPress={onPickAnotherTime} />
      </View>
    );
  }
  if (failure.kind === 'validation') {
    return (
      <View style={styles.failure}>
        <NoticeBanner
          icon="alert-circle"
          tone="critical"
          title={t('care.review.validationTitle')}
          message={failure.violations.length ? '' : t('care.review.validationMessage')}
        />
        <Card>
          {failure.violations.map((v) => (
            <View key={`${v.field}-${v.message}`} style={styles.violation}>
              <Icon name="alert-circle" size={16} color={colors.statusCritical} />
              <Text style={styles.violationText}>
                <Text style={styles.violationField}>{formatLabel(v.field)}: </Text>
                {v.message}
              </Text>
            </View>
          ))}
        </Card>
      </View>
    );
  }
  if (failure.kind === 'notLinked') {
    return (
      <View style={styles.failure}>
        <NoticeBanner
          icon="id-card"
          tone="warning"
          title={t('care.review.notLinkedTitle')}
          message={t('care.review.notLinkedMessage')}
        />
        <CareButton label={t('care.review.linkCta')} icon="id-card" onPress={onLink} />
      </View>
    );
  }
  return (
    <NoticeBanner icon="alert-circle" tone="critical" title={failure.title} message={failure.message} />
  );
}

function CardHead({ icon, title, onAction }: { icon: IconName; title: string; onAction?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.cardHead}>
      <Icon name={icon} size={22} color={colors.blue} />
      <Text style={styles.cardTitle}>{title}</Text>
      {!!onAction && (
        <TouchableOpacity onPress={onAction} hitSlop={8}>
          <Text style={styles.cardAction}>{t('care.appt.change')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Policy({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.policy}>
      <View style={styles.policyMark}>
        <Icon name="check" size={13} color={colors.textOnBrand} />
      </View>
      <View style={styles.policyBody}>
        <Text style={styles.policyTitle}>{title}</Text>
        <Text style={styles.policyText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  almost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.statusNormalBg,
  },
  almostIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.statusNormal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  almostBody: { flex: 1, minWidth: 0 },
  almostTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.statusNormal,
  },
  almostText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },

  failure: { gap: spacing.sm + 2 },
  violation: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 5 },
  violationText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  violationField: { fontFamily: typography.fontFamily.semiBold, color: colors.textPrimary },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md - 4 },
  cardTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  cardAction: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },

  providerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 2 },
  providerBody: { flex: 1, minWidth: 0, gap: 2 },
  providerName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  providerSpecialty: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  meta: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  chipRow: { flexDirection: 'row', gap: spacing.sm + 2 },
  softChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  softChipStack: { flex: 1, minWidth: 0 },
  softChipText: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.link,
  },
  softChipSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },

  typeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  typeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBody: { flex: 1, minWidth: 0 },
  typeTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  typeSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  reason: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  policy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 2, paddingVertical: 6 },
  policyMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.statusNormal,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  policyBody: { flex: 1, minWidth: 0 },
  policyTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  policyText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
