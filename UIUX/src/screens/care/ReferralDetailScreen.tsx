/**
 * CARE-020 — Referral Detail.
 *
 * Reads `GET /patient/referrals/{id}`. "I Accept This Referral" performs the
 * real `acknowledge` write (which moves the referral to `acknowledged`
 * server-side), and the reminder toggle persists too. Nothing on this screen
 * is local-only state.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  acknowledgeReferral,
  fetchReferral,
  setReferralReminders,
  type PortalReferralDetail,
} from '../../api';
import { Card, Icon, IconName, ScreenHeader, StatusBadge } from '../../components';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, StatusTone, typography } from '../../theme/theme';
import { AsyncBoundary, CareButton, errorMessage, fmtDate, ProviderAvatar, useAsync } from './shared';

const TYPE_LABEL: Record<string, string> = {
  internal: 'Internal Referral',
  external: 'External Referral',
  specialist: 'Specialist Consultation',
  investigation: 'Investigation',
};

const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Patient-facing wording for the referral lifecycle. The chart stores `sent`;
 * CARE-020 shows that live referral as "Active" in the green tone, so the raw
 * domain value is mapped here rather than leaked into the badge.
 */
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  sent: 'Active',
  accepted: 'Active',
  acknowledged: 'Acknowledged',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  declined: 'Declined',
};

const STATUS_TONE: Record<string, StatusTone> = {
  draft: 'warning',
  pending: 'pending',
  sent: 'normal',
  accepted: 'normal',
  acknowledged: 'normal',
  scheduled: 'pending',
  completed: 'normal',
  cancelled: 'critical',
  declined: 'critical',
};

const statusLabel = (s: string) => STATUS_LABEL[s] ?? titleCase(s);
const statusTone = (s: string): StatusTone | undefined => STATUS_TONE[s];

/** A label/value line in the "Referral Information" table. */
function FieldRow({
  label,
  value,
  caption,
  first,
  onPress,
  trailing,
}: {
  label: string;
  value?: string | null;
  caption?: string | null;
  first?: boolean;
  onPress?: () => void;
  trailing?: React.ReactNode;
}) {
  const body = (
    <View style={[styles.fieldRow, !first && styles.rowDivider]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBody}>
        {trailing ?? (
          <>
            <Text style={styles.fieldValue}>{value ?? '—'}</Text>
            {!!caption && <Text style={styles.fieldCaption}>{caption}</Text>}
          </>
        )}
      </View>
      {!!onPress && <Icon name="chevron-right" size={18} color={colors.textMuted} />}
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} accessibilityRole="button">
      {body}
    </TouchableOpacity>
  ) : (
    body
  );
}

function StepRow({
  icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.stepRow}>
      <Icon name={icon} size={22} color={colors.blue} />
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepText}>{text}</Text>
      </View>
      {!!actionLabel && !!onAction && (
        <CareButton label={actionLabel} variant="secondary" size="sm" onPress={onAction} />
      )}
    </View>
  );
}

export function ReferralDetailScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'ReferralDetail'>>();
  const id = params.referralId;

  const state = useAsync<PortalReferralDetail>(() => fetchReferral(id), [id]);
  const [pending, setPending] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<PortalReferralDetail>) => {
    setPending(key);
    setProblem(null);
    try {
      state.setData(await fn());
    } catch (e) {
      setProblem(errorMessage(e, "That change didn't save. Please try again."));
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Your Referral"
        subtitle="Information about your referral and next steps."
        actions={[{ icon: 'bell', onPress: () => navigation.navigate('Notifications'), accessibilityLabel: 'Notifications' }]}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel="Loading your referral…">
          {(r) => {
            const acknowledged = r.acknowledged_at !== null;
            const closed = r.status === 'completed' || r.status === 'cancelled';
            const letterDoc = r.letter_document_id ?? r.attachments[0]?.id ?? null;

            return (
              <>
                <View style={styles.topActions}>
                  <StatusBadge status={statusLabel(r.status)} tone={statusTone(r.status)} />
                </View>

                <Card variant="flush">
                  <View style={styles.providerRow}>
                    <ProviderAvatar name={r.referrer_name ?? 'OPES Clinician'} size={72} />
                    <View style={styles.providerBody}>
                      <Text style={styles.providerName}>{r.referrer_name ?? 'Referring clinician'}</Text>
                      <Text style={styles.providerSpecialty}>{r.referrer_specialty ?? 'Referring provider'}</Text>
                      <View style={styles.providerMeta}>
                        <Icon name="building" size={16} color={colors.blue} />
                        <Text style={styles.providerMetaText} numberOfLines={1}>
                          {r.facility ?? 'Facility to be confirmed'}
                        </Text>
                      </View>
                      <View style={styles.providerMeta}>
                        <Icon name="calendar" size={16} color={colors.blue} />
                        <Text style={styles.providerMetaText} numberOfLines={1}>
                          Referred {r.referred_at ? fmtDate(r.referred_at) : '—'}
                        </Text>
                      </View>
                      {!!r.urgency && (
                        <View style={styles.providerMeta}>
                          <Icon name="alert-circle" size={16} color={colors.blue} />
                          <Text style={styles.providerMetaText} numberOfLines={1}>
                            {titleCase(r.urgency)} priority
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.overview}>
                    <View style={styles.overviewMark}>
                      <Icon name="info" size={16} color={colors.textOnBrand} />
                    </View>
                    <View style={styles.overviewBody}>
                      <Text style={styles.overviewTitle}>Referral Overview</Text>
                      <Text style={styles.overviewText}>
                        You have been referred to a specialist for further evaluation and management. Please follow the
                        instructions below.
                      </Text>
                    </View>
                  </View>
                </Card>

                <Card variant="flush">
                  <View style={styles.cardHead}>
                    <Icon name="users" size={22} color={colors.blue} />
                    <Text style={styles.cardTitle}>Referral Information</Text>
                  </View>

                  <FieldRow
                    first
                    label="Referral To"
                    value={r.referred_to}
                    caption={r.specialty ? `${r.specialty} Specialist` : null}
                    onPress={() => navigation.navigate('FindProvider', r.specialty ? { specialty: r.specialty } : undefined)}
                  />
                  <FieldRow
                    label="Department"
                    value={r.facility}
                    onPress={() => navigation.navigate('FindFacility')}
                  />
                  <FieldRow label="Reason for Referral" value={r.reason} />
                  <FieldRow label="Referral Date" value={r.referred_at ? fmtDate(r.referred_at) : '—'} />
                  <FieldRow
                    label="Referral Type"
                    trailing={
                      <View style={styles.typeChip}>
                        <Text style={styles.typeChipText}>
                          {TYPE_LABEL[r.referral_type ?? ''] ?? titleCase(r.referral_type ?? 'Referral')}
                        </Text>
                      </View>
                    }
                  />
                  <FieldRow label="Referral Status" trailing={<StatusBadge status={statusLabel(r.status)} tone={statusTone(r.status)} />} />
                </Card>

                <Card variant="flush">
                  <View style={styles.cardHead}>
                    <Icon name="document-text" size={22} color={colors.blue} />
                    <Text style={styles.cardTitle}>Clinical Summary</Text>
                  </View>
                  <FieldRow first label="Summary" value={r.clinical_summary ?? r.notes} />
                  <FieldRow
                    label="Attachments"
                    value={`${r.attachments.length} file(s)`}
                    onPress={r.attachments.length ? () => navigation.navigate('Documents') : undefined}
                  />
                </Card>

                <View style={styles.nextSteps}>
                  <View style={styles.cardHeadFlat}>
                    <Icon name="list" size={22} color={colors.blue} />
                    <Text style={styles.cardTitle}>Next Steps</Text>
                  </View>
                  <StepRow
                    icon="calendar-plus"
                    title="Schedule Appointment"
                    text="Book an appointment with the referred specialist."
                    actionLabel="Schedule Now"
                    onAction={() =>
                      navigation.navigate('FindProvider', r.specialty ? { specialty: r.specialty } : undefined)
                    }
                  />
                  <StepRow
                    icon="clipboard"
                    title="Bring Documents"
                    text="Carry this referral letter and relevant test results."
                  />
                  <StepRow
                    icon="phone"
                    title="Need Help?"
                    text="Contact us if you need assistance."
                    actionLabel="Contact Us"
                    onAction={() => navigation.navigate('NewMessage')}
                  />
                </View>

                <View style={styles.letter}>
                  <Icon name="document-text" size={22} color={colors.blue} />
                  <View style={styles.letterBody}>
                    <Text style={styles.letterTitle}>Referral Letter</Text>
                    <Text style={styles.letterText}>
                      {letterDoc
                        ? 'View or download your official referral letter.'
                        : 'Your referral letter has not been issued yet.'}
                    </Text>
                  </View>
                  <CareButton
                    label="View / Download"
                    icon="download"
                    variant="secondary"
                    size="sm"
                    disabled={!letterDoc}
                    onPress={() => letterDoc && navigation.navigate('DocumentPreview', { documentId: letterDoc })}
                  />
                </View>

                <View style={styles.reminder}>
                  <Icon name={r.reminders_enabled ? 'bell' : 'bell-off'} size={22} color={colors.statusNormal} />
                  <View style={styles.letterBody}>
                    <Text style={styles.letterTitle}>Follow-up Reminder</Text>
                    <Text style={styles.letterText}>
                      {r.reminders_enabled
                        ? "We'll remind you to complete this referral and follow up."
                        : 'Follow-up reminders are turned off for this referral.'}
                    </Text>
                  </View>
                  <CareButton
                    label={r.reminders_enabled ? 'Turn Off' : 'Turn On'}
                    variant="secondary"
                    size="sm"
                    loading={pending === 'reminders'}
                    onPress={() => run('reminders', () => setReferralReminders(id, !r.reminders_enabled))}
                  />
                </View>

                {!!problem && (
                  <View style={styles.errorStrip}>
                    <Icon name="alert-circle" size={18} color={colors.statusCritical} />
                    <Text style={styles.errorText}>{problem}</Text>
                  </View>
                )}

                <CareButton
                  label={
                    acknowledged
                      ? `Accepted ${fmtDate(r.acknowledged_at as string)}`
                      : closed
                        ? `Referral ${statusLabel(r.status)}`
                        : 'I Accept This Referral'
                  }
                  icon={acknowledged ? 'check-circle' : undefined}
                  disabled={acknowledged || closed}
                  loading={pending === 'ack'}
                  onPress={() => run('ack', () => acknowledgeReferral(id))}
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

  topActions: { flexDirection: 'row', justifyContent: 'flex-end' },

  providerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md - 2,
    padding: spacing.md,
  },
  providerBody: { flex: 1, minWidth: 0, gap: 3, paddingTop: 2 },
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

  overview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    margin: spacing.md,
    marginTop: 0,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  overviewMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewBody: { flex: 1, minWidth: 0, gap: 2 },
  overviewTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  overviewText: {
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
    paddingBottom: spacing.sm + 2,
  },
  cardHeadFlat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingBottom: spacing.sm + 2,
  },
  cardTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },

  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md - 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  fieldLabel: {
    width: 120,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  fieldBody: { flex: 1, minWidth: 0, gap: 1, alignItems: 'flex-start' },
  fieldValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  fieldCaption: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  typeChipText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.link,
  },

  nextSteps: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.statusWarningBg,
    gap: spacing.md - 4,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  stepBody: { flex: 1, minWidth: 0, gap: 2 },
  stepTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  stepText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  letter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  letterBody: { flex: 1, minWidth: 0, gap: 2 },
  letterTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  letterText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.statusNormalBg,
  },

  errorStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 4,
    borderRadius: radii.sm,
    backgroundColor: colors.statusCriticalBg,
  },
  errorText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.statusCritical,
  },
});
