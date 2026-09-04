/**
 * CARE-019 — Care Plan Detail.
 *
 * Reads `GET /patient/care-plans/{id}` and performs every write the reference
 * implies for real: marking a goal met, completing a task, acknowledging the
 * plan and turning reminders on or off. Each write returns the whole plan, so
 * the screen re-renders from the server's answer rather than a local guess.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  acknowledgeCarePlan,
  fetchCarePlan,
  setCarePlanReminders,
  updateCarePlanGoal,
  updateCarePlanTask,
  type CarePlanGoal,
  type CarePlanTask,
  type PortalCarePlanDetail,
} from '../../api';
import { Card, Icon, IconName, iconNames, ScreenHeader, StatusBadge } from '../../components';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, StatusTone, typography } from '../../theme/theme';
import { AsyncBoundary, CareButton, errorMessage, fmtDate, ProviderAvatar, useAsync } from './shared';

/** How many rows show before the "View all …" link appears. */
const PREVIEW = 3;
const TASK_PREVIEW = 5;

/** CARE-019 header pill wording — the chart's `active` reads as "Active Plan". */
const PLAN_STATUS_LABEL: Record<string, string> = {
  active: 'Active Plan',
  completed: 'Completed',
  cancelled: 'Cancelled',
  on_hold: 'On Hold',
  draft: 'Draft',
};

const GOAL_LABEL: Record<CarePlanGoal['status'], string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  met: 'Met',
};
const GOAL_TONE: Record<CarePlanGoal['status'], StatusTone> = {
  not_started: 'neutral',
  in_progress: 'pending',
  met: 'normal',
};

const TASK_LABEL: Record<CarePlanTask['status'], string> = {
  active: 'Active',
  scheduled: 'Scheduled',
  completed: 'Completed',
};
const TASK_TONE: Record<CarePlanTask['status'], StatusTone> = {
  active: 'normal',
  scheduled: 'pending',
  completed: 'normal',
};

/** The clinician picks the glyph; fall back rather than trust the string. */
function taskIcon(name: string): IconName {
  return (iconNames as string[]).includes(name) ? (name as IconName) : 'check-circle';
}

function StatTile({
  icon,
  tintBg,
  tintFg,
  value,
  unit,
  label,
  caption,
}: {
  icon: IconName;
  tintBg: string;
  tintFg: string;
  value: string;
  unit?: string;
  label: string;
  caption: string;
}) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statMark, { backgroundColor: tintBg }]}>
        <Icon name={icon} size={22} color={tintFg} />
      </View>
      <View style={styles.statBody}>
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
          {!!unit && <Text style={styles.statUnit}> {unit}</Text>}
        </Text>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statCaption} numberOfLines={1}>
          {caption}
        </Text>
      </View>
    </View>
  );
}

function MoreLink({ label, expanded, onPress }: { label: string; expanded: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.moreLink} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <Text style={styles.moreLinkText}>{expanded ? `Show fewer` : label}</Text>
      <Icon name={expanded ? 'chevron-up' : 'chevron-right'} size={18} color={colors.link} />
    </TouchableOpacity>
  );
}

export function CarePlanDetailScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'CarePlanDetail'>>();
  const id = params.carePlanId;

  const state = useAsync<PortalCarePlanDetail>(() => fetchCarePlan(id), [id]);
  const [pending, setPending] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [allGoals, setAllGoals] = useState(false);
  const [allTasks, setAllTasks] = useState(false);

  /** Every write returns the full plan — replace the state with it. */
  const run = async (key: string, fn: () => Promise<PortalCarePlanDetail>) => {
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

  const share = (plan: PortalCarePlanDetail) => {
    const lines = [
      `Care plan — ${plan.problem ?? 'Care plan'}`,
      plan.goal ? `Goal: ${plan.goal}` : '',
      ...plan.goals.map((g) => `• ${g.title} (${GOAL_LABEL[g.status]})`),
      ...plan.tasks.map((t) => `• ${t.title}${t.frequency ? ` — ${t.frequency}` : ''}`),
    ].filter(Boolean);
    void Share.share({ message: lines.join('\n') });
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Care Plan"
        subtitle="Your personalized care plan and next steps."
        actions={[{ icon: 'bell', onPress: () => navigation.navigate('Notifications'), accessibilityLabel: 'Notifications' }]}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel="Loading your care plan…">
          {(plan) => {
            const goals = allGoals ? plan.goals : plan.goals.slice(0, PREVIEW);
            const tasks = allTasks ? plan.tasks : plan.tasks.slice(0, TASK_PREVIEW);
            const acknowledged = plan.acknowledged_at !== null;

            return (
              <>
                <View style={styles.topActions}>
                  <CareButton label="Print Plan" icon="print" variant="secondary" size="sm" onPress={() => share(plan)} />
                </View>

                <Card variant="flush">
                  <View style={styles.providerRow}>
                    <ProviderAvatar name={plan.provider_name ?? 'OPES Clinician'} size={72} />
                    <View style={styles.providerBody}>
                      <Text style={styles.providerName}>{plan.provider_name ?? 'Care team'}</Text>
                      <Text style={styles.providerSpecialty}>{plan.provider_specialty ?? 'Care plan author'}</Text>
                      <View style={styles.providerMeta}>
                        <Icon name="building" size={16} color={colors.blue} />
                        <Text style={styles.providerMetaText} numberOfLines={1}>
                          {plan.facility_name ?? 'OPES EMR'}
                        </Text>
                      </View>
                      <View style={styles.providerMeta}>
                        <Icon name="calendar" size={16} color={colors.blue} />
                        <Text style={styles.providerMetaText} numberOfLines={1}>
                          Started {plan.created_at ? fmtDate(plan.created_at) : '—'}
                        </Text>
                      </View>
                      <View style={styles.providerMeta}>
                        <Icon name="calendar-check" size={16} color={colors.blue} />
                        <Text style={styles.providerMetaText} numberOfLines={1}>
                          Target {plan.target_date ? fmtDate(plan.target_date) : 'not set'}
                        </Text>
                      </View>
                    </View>
                    <StatusBadge status={PLAN_STATUS_LABEL[plan.status] ?? plan.status} />
                  </View>

                  <View style={styles.overview}>
                    <View style={styles.overviewMark}>
                      <Icon name="info" size={16} color={colors.textOnBrand} />
                    </View>
                    <View style={styles.overviewBody}>
                      <Text style={styles.overviewTitle}>Plan Overview</Text>
                      <Text style={styles.overviewText}>
                        {plan.goal ??
                          'This care plan is based on your consultation. Follow the steps below and keep track of your progress.'}
                      </Text>
                    </View>
                  </View>
                </Card>

                <Card>
                  <Text style={styles.sectionTitle}>Plan Summary</Text>
                  <View style={styles.stats}>
                    <StatTile
                      icon="clipboard"
                      tintBg={colors.statusNormalBg}
                      tintFg={colors.statusNormal}
                      value={String(plan.goal_count)}
                      label="Goals"
                      caption="Health goals set"
                    />
                    <StatTile
                      icon="check-double"
                      tintBg={colors.primarySoft}
                      tintFg={colors.blue}
                      value={String(plan.task_count)}
                      label="Tasks"
                      caption="To do items"
                    />
                    <StatTile
                      icon="calendar"
                      tintBg={colors.statusInfoBg}
                      tintFg={colors.statusInfo}
                      value={plan.duration_weeks ? String(plan.duration_weeks) : '—'}
                      unit={plan.duration_weeks ? 'Weeks' : undefined}
                      label="Duration"
                      caption="Plan duration"
                    />
                  </View>
                </Card>

                <Card variant="flush">
                  <Text style={styles.cardSectionTitle}>Health Goals</Text>
                  {plan.goals.length === 0 ? (
                    <Text style={styles.emptyLine}>No goals have been set on this plan yet.</Text>
                  ) : (
                    goals.map((g, i) => (
                      <View key={g.id} style={[styles.goalRow, i > 0 && styles.rowDivider]}>
                        <View style={styles.goalIndex}>
                          <Text style={styles.goalIndexText}>{plan.goals.indexOf(g) + 1}</Text>
                        </View>
                        <View style={styles.goalMark}>
                          <Icon name="target" size={20} color={colors.statusNormal} />
                        </View>
                        <View style={styles.goalBody}>
                          <Text style={styles.goalTitle}>{g.title}</Text>
                          {!!g.description && <Text style={styles.goalText}>{g.description}</Text>}
                        </View>
                        <TouchableOpacity
                          onPress={() => run(g.id, () => updateCarePlanGoal(g.id, g.status === 'met' ? 'in_progress' : 'met'))}
                          disabled={pending === g.id}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={g.status === 'met' ? `Reopen goal ${g.title}` : `Mark ${g.title} met`}
                          style={pending === g.id && styles.rowBusy}
                        >
                          <StatusBadge status={GOAL_LABEL[g.status]} tone={GOAL_TONE[g.status]} />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                  {plan.goals.length > PREVIEW && (
                    <MoreLink label="View all goals" expanded={allGoals} onPress={() => setAllGoals((v) => !v)} />
                  )}
                </Card>

                <Card variant="flush">
                  <Text style={styles.cardSectionTitle}>Tasks &amp; Activities</Text>
                  {plan.tasks.length === 0 ? (
                    <Text style={styles.emptyLine}>No tasks have been assigned yet.</Text>
                  ) : (
                    tasks.map((t, i) => (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.taskRow, i > 0 && styles.rowDivider, pending === t.id && styles.rowBusy]}
                        disabled={pending === t.id}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={t.status === 'completed' ? `Reopen ${t.title}` : `Complete ${t.title}`}
                        onPress={() =>
                          run(t.id, () => updateCarePlanTask(t.id, t.status === 'completed' ? 'active' : 'completed'))
                        }
                      >
                        <View style={styles.taskMark}>
                          <Icon name={taskIcon(t.icon)} size={20} color={colors.textOnBrand} />
                        </View>
                        <View style={styles.taskBody}>
                          <Text style={styles.taskTitle}>{t.title}</Text>
                          {!!t.description && <Text style={styles.taskText}>{t.description}</Text>}
                        </View>
                        {!!(t.frequency || t.due_date) && (
                          <View style={styles.taskWhen}>
                            <Icon name="calendar" size={16} color={colors.blue} />
                            <Text style={styles.taskWhenText} numberOfLines={1}>
                              {t.frequency ?? (t.due_date ? fmtDate(t.due_date) : '')}
                            </Text>
                          </View>
                        )}
                        <StatusBadge status={TASK_LABEL[t.status]} tone={TASK_TONE[t.status]} size="sm" />
                        <Icon name="chevron-right" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    ))
                  )}
                  {plan.tasks.length > TASK_PREVIEW && (
                    <MoreLink label="View all tasks" expanded={allTasks} onPress={() => setAllTasks((v) => !v)} />
                  )}
                </Card>

                {!!plan.patient_notes && (
                  <View style={styles.notes}>
                    <Icon name="document-text" size={22} color={colors.statusWarning} />
                    <View style={styles.notesBody}>
                      <Text style={styles.notesTitle}>Notes from Doctor</Text>
                      <Text style={styles.notesText}>{plan.patient_notes}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.reminder}>
                  <Icon name={plan.reminders_enabled ? 'bell' : 'bell-off'} size={22} color={colors.blue} />
                  <View style={styles.reminderBody}>
                    <Text style={styles.reminderTitle}>Reminder</Text>
                    <Text style={styles.reminderText}>
                      {plan.reminders_enabled
                        ? "You'll receive reminders to help you stay on track with your care plan."
                        : 'Reminders for this care plan are turned off.'}
                    </Text>
                  </View>
                  <CareButton
                    label={plan.reminders_enabled ? 'Turn Off' : 'Turn On'}
                    variant="secondary"
                    size="sm"
                    loading={pending === 'reminders'}
                    onPress={() => run('reminders', () => setCarePlanReminders(id, !plan.reminders_enabled))}
                  />
                </View>

                {!!problem && (
                  <View style={styles.errorStrip}>
                    <Icon name="alert-circle" size={18} color={colors.statusCritical} />
                    <Text style={styles.errorText}>{problem}</Text>
                  </View>
                )}

                <CareButton
                  label={acknowledged ? `Acknowledged ${fmtDate(plan.acknowledged_at as string)}` : 'I Understand This Plan'}
                  icon={acknowledged ? 'check-circle' : undefined}
                  disabled={acknowledged}
                  loading={pending === 'ack'}
                  onPress={() => run('ack', () => acknowledgeCarePlan(id))}
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

  sectionTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    marginBottom: 10,
  },
  cardSectionTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 10,
  },
  emptyLine: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },

  stats: { flexDirection: 'row', gap: spacing.sm + 2 },
  stat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statMark: {
    width: 38,
    height: 38,
    borderRadius: radii.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBody: { flex: 1, minWidth: 0 },
  statValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  statUnit: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  statLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
  },
  statCaption: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },

  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowBusy: { opacity: 0.5 },

  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  goalIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalIndexText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    color: colors.textOnBrand,
  },
  goalMark: {
    width: 36,
    height: 36,
    borderRadius: radii.sm + 2,
    backgroundColor: colors.statusNormalBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalBody: { flex: 1, minWidth: 0, gap: 1 },
  goalTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  goalText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  taskMark: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskBody: { flex: 1, minWidth: 0, gap: 1 },
  taskTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  taskText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  taskWhen: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 110 },
  taskWhenText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  notes: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.statusWarningBg,
  },
  notesBody: { flex: 1, minWidth: 0, gap: 3 },
  notesTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  notesText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  reminderBody: { flex: 1, minWidth: 0, gap: 2 },
  reminderTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  reminderText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  moreLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  moreLinkText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
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
