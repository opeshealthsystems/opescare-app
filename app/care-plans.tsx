/**
 * Care plans — read-only (GET /mobile/care-plans, GET /mobile/care-plans/{id}).
 *
 * Presentation follows the OPES kit's CARE-019 Care Plan Detail: a flush card
 * per plan with a status badge, a soft-blue overview strip, the three-tile
 * plan summary, a progress bar, then goals and interventions as rows with
 * status badges. Every plan expands in place — the per-plan detail query still
 * runs on expand so the server stays authoritative, but progress renders from
 * the list payload immediately and the UI never blocks on the round trip.
 *
 * A care plan is authored and assigned by a care team after a visit; the
 * patient cannot create one and there is no mobile write endpoint (the source
 * screen's "mark goal met" / "acknowledge" writes have no counterpart here).
 * The list endpoint returns only `status = active` plans, so the empty state
 * explains who writes a plan and what it will contain rather than a void.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatDate,
  formatLabel,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { AsyncBoundary, NoticeBanner } from '@/components/care/shared';
import { asyncStateOf } from '@/components/docs/shared';
import { useIsOnline } from '@/lib/offline';
import {
  useCarePlan,
  useCarePlans,
  type CarePlan,
  type CarePlanGoal,
  type CarePlanIntervention,
} from '@/lib/api/queries';

const PLAN_TONE: Record<CarePlan['status'], StatusTone> = {
  active: 'normal',
  completed: 'info',
  on_hold: 'warning',
  cancelled: 'critical',
};

const GOAL_TONE: Record<CarePlanGoal['status'], StatusTone> = {
  pending: 'warning',
  in_progress: 'pending',
  achieved: 'normal',
  abandoned: 'critical',
};

const GOAL_ICON: Record<CarePlanGoal['status'], IconName> = {
  pending: 'clock',
  in_progress: 'target',
  achieved: 'check-circle',
  abandoned: 'x-circle',
};

const GOAL_TINT: Record<CarePlanGoal['status'], Tint> = {
  pending: 'amber',
  in_progress: 'blue',
  achieved: 'green',
  abandoned: 'red',
};

const INTERVENTION_TONE: Record<CarePlanIntervention['status'], StatusTone> = {
  active: 'normal',
  completed: 'info',
  discontinued: 'critical',
};

/** §1 conventions: medication green, monitoring/referral purple, the rest blue/amber. */
const INTERVENTION_META: Record<CarePlanIntervention['intervention_type'], { icon: IconName; tint: Tint }> = {
  medication: { icon: 'pill', tint: 'green' },
  exercise: { icon: 'activity', tint: 'blue' },
  diet: { icon: 'cup', tint: 'amber' },
  monitoring: { icon: 'stethoscope', tint: 'purple' },
  referral: { icon: 'send', tint: 'purple' },
  education: { icon: 'book', tint: 'blue' },
  other: { icon: 'clipboard', tint: 'blue' },
};

/** achieved / total, matching CarePlanService::getSummary() exactly. */
function progressOf(goals: CarePlanGoal[]): number {
  if (goals.length === 0) return 0;
  return Math.round((goals.filter((g) => g.status === 'achieved').length / goals.length) * 100);
}

/** Whole weeks between two ISO dates, or null when either is missing/invalid. */
function weeksBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.max(1, Math.round((b - a) / (7 * 86_400_000)));
}

export default function CarePlansScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const online = useIsOnline();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const plansQuery = useCarePlans();
  const detailQuery = useCarePlan(expandedId);

  const state = asyncStateOf(plansQuery, {
    offline: !online,
    offlineMessage: t('opesCore.errors.offlineBody'),
  });

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <ScreenHeader title={t('carePlans.title')} subtitle={t('carePlans.subtitle')} />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={plansQuery.isRefetching}
            onRefresh={() => plansQuery.refetch()}
            tintColor={colors.blue}
          />
        }
      >
        <AsyncBoundary
          state={state}
          loadingLabel={t('opesCore.common.loading')}
          isEmpty={(plans) => plans.length === 0}
          empty={<EmptyPlans />}
        >
          {(plans) => (
            <>
              <SectionHeader variant="overline" title={t('carePlans.countLabel', { count: plans.length })} />
              {plans.map((plan) => {
                const expanded = expandedId === plan.id;
                // Only trust the detail payload once it belongs to THIS plan.
                const detail = detailQuery.data?.plan.id === plan.id ? detailQuery.data : undefined;
                return (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    goals={detail?.goals ?? plan.goals ?? []}
                    interventions={detail?.interventions ?? plan.interventions ?? []}
                    progressPct={detail?.progress_pct ?? progressOf(detail?.goals ?? plan.goals ?? [])}
                    expanded={expanded}
                    detailLoading={expanded && detailQuery.isLoading}
                    detailFailed={expanded && detailQuery.isError}
                    onToggle={() => setExpandedId(expanded ? null : plan.id)}
                  />
                );
              })}
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ plan card */

function PlanCard({
  plan,
  goals,
  interventions,
  progressPct,
  expanded,
  detailLoading,
  detailFailed,
  onToggle,
}: {
  plan: CarePlan;
  goals: CarePlanGoal[];
  interventions: CarePlanIntervention[];
  progressPct: number;
  expanded: boolean;
  detailLoading: boolean;
  detailFailed: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { colors, statusMap } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const achieved = goals.filter((g) => g.status === 'achieved').length;
  const start = formatDate(plan.start_date, '');
  const end = plan.end_date ? formatDate(plan.end_date, '') : t('carePlans.ongoing');
  const range = start ? `${start} — ${end}` : end;
  const weeks = weeksBetween(plan.start_date, plan.end_date);
  const pct = Math.min(100, Math.max(0, progressPct));

  return (
    <Card variant="flush">
      <ListRow
        icon="clipboard"
        tint="blue"
        title={plan.title}
        meta={[range]}
        chevron={false}
        trailing={
          <View style={s.headTrailing}>
            <StatusBadge
              status={plan.status}
              tone={PLAN_TONE[plan.status] ?? 'neutral'}
              label={t(`carePlans.status.${plan.status}`, { defaultValue: formatLabel(plan.status) })}
              size="sm"
            />
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </View>
        }
        onPress={onToggle}
        accessibilityLabel={plan.title}
        accessibilityHint={expanded ? t('carePlans.collapse') : t('carePlans.expand')}
      />

      {plan.description ? (
        <View style={s.overview}>
          <View style={s.overviewMark}>
            <Icon name="info" size={16} color={colors.textOnBrand} />
          </View>
          <View style={s.overviewBody}>
            <Text style={s.overviewTitle}>
              {t('opesCare.carePlan.overview', { defaultValue: 'Plan overview' })}
            </Text>
            <Text style={s.overviewText} numberOfLines={expanded ? undefined : 2}>
              {plan.description}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Plan summary — the CARE-019 three-tile row, from real counts only. */}
      <View style={s.stats}>
        <StatTile
          icon="target"
          bg={statusMap.normal.bg}
          fg={statusMap.normal.fg}
          value={String(goals.length)}
          label={t('carePlans.goals')}
        />
        <StatTile
          icon="check-double"
          bg={colors.primarySoft}
          fg={colors.blue}
          value={String(interventions.length)}
          label={t('carePlans.interventions')}
        />
        <StatTile
          icon="calendar"
          bg={statusMap.info.bg}
          fg={statusMap.info.fg}
          value={weeks === null ? '—' : String(weeks)}
          unit={weeks === null ? undefined : t('opesCare.carePlan.weeks', { defaultValue: 'wks' })}
          label={t('opesCare.carePlan.duration', { defaultValue: 'Duration' })}
        />
      </View>

      {/* Progress renders straight from the list payload — no spinner. */}
      {goals.length > 0 ? (
        <View
          style={s.progress}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${t('carePlans.progress')}: ${t('carePlans.goalsAchieved', { achieved, total: goals.length })}`}
          accessibilityValue={{ min: 0, max: 100, now: pct }}
        >
          <View style={s.progressHead}>
            <Text style={s.progressTitle}>{t('carePlans.progress')}</Text>
            <Text style={s.progressValue}>
              {t('carePlans.goalsAchieved', { achieved, total: goals.length })}
            </Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct}%` }]} />
          </View>
        </View>
      ) : null}

      {expanded ? (
        <View style={s.details}>
          {detailFailed ? (
            <View style={s.inset}>
              <NoticeBanner tone="warning" icon="alert-circle" message={t('carePlans.detailStaleNotice')} />
            </View>
          ) : null}

          <Text style={s.cardSectionTitle}>{t('carePlans.goals')}</Text>
          {goals.length === 0 ? (
            <Text style={s.emptyLine}>{t('carePlans.noGoals')}</Text>
          ) : (
            goals.map((goal, i) => <GoalRow key={goal.id} goal={goal} index={i} divider={i > 0} />)
          )}

          <Text style={s.cardSectionTitle}>{t('carePlans.interventions')}</Text>
          {interventions.length === 0 ? (
            <Text style={s.emptyLine}>{t('carePlans.noInterventions')}</Text>
          ) : (
            interventions.map((item, i) => {
              const meta = INTERVENTION_META[item.intervention_type] ?? INTERVENTION_META.other;
              return (
                <ListRow
                  key={item.id}
                  icon={meta.icon}
                  tint={meta.tint}
                  title={t(`carePlans.interventionType.${item.intervention_type}`, {
                    defaultValue: formatLabel(item.intervention_type),
                  })}
                  meta={[item.description, item.frequency, item.responsible_party]}
                  trailing={
                    <StatusBadge
                      status={item.status}
                      tone={INTERVENTION_TONE[item.status] ?? 'neutral'}
                      label={t(`carePlans.interventionStatus.${item.status}`, { defaultValue: formatLabel(item.status) })}
                      size="sm"
                    />
                  }
                  divider={i < interventions.length - 1}
                />
              );
            })
          )}

          {detailLoading ? (
            <View style={s.refreshRow}>
              <ActivityIndicator size="small" color={colors.blue} />
              <Text style={s.refreshText}>{t('carePlans.refreshing')}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** CARE-019 goal row: index bubble, tinted mark, goal text (wrapping), status badge. */
function GoalRow({ goal, index, divider }: { goal: CarePlanGoal; index: number; divider: boolean }) {
  const { t } = useTranslation();
  const { colors, tintMap } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const tint = tintMap[GOAL_TINT[goal.status] ?? 'blue'];
  const target = formatDate(goal.target_date, '');
  const label = t(`carePlans.goalStatus.${goal.status}`, { defaultValue: formatLabel(goal.status) });

  return (
    <View
      style={[s.goalRow, divider && s.rowDivider]}
      accessible
      accessibilityLabel={[goal.goal_text, target ? `${t('carePlans.target')}: ${target}` : '', label]
        .filter(Boolean)
        .join(', ')}
    >
      <View style={s.goalIndex}>
        <Text style={s.goalIndexText}>{index + 1}</Text>
      </View>
      <View style={[s.goalMark, { backgroundColor: tint.bg }]}>
        <Icon name={GOAL_ICON[goal.status] ?? 'target'} size={20} color={tint.fg} />
      </View>
      <View style={s.goalBody}>
        <Text style={s.goalTitle}>{goal.goal_text}</Text>
        {target ? (
          <Text style={s.goalMeta}>
            {t('carePlans.target')}: {target}
          </Text>
        ) : null}
        {goal.notes ? <Text style={s.goalText}>{goal.notes}</Text> : null}
      </View>
      <StatusBadge status={goal.status} tone={GOAL_TONE[goal.status] ?? 'neutral'} label={label} size="sm" />
    </View>
  );
}

function StatTile({
  icon,
  bg,
  fg,
  value,
  unit,
  label,
}: {
  icon: IconName;
  bg: string;
  fg: string;
  value: string;
  unit?: string;
  label: string;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.stat} accessible accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}>
      <View style={[s.statMark, { backgroundColor: bg }]}>
        <Icon name={icon} size={20} color={fg} />
      </View>
      <View style={s.statBody}>
        <Text style={s.statValue} numberOfLines={1}>
          {value}
          {unit ? <Text style={s.statUnit}> {unit}</Text> : null}
        </Text>
        <Text style={s.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ empty */

/** Explain what a care plan is and who assigns it, rather than show a void. */
function EmptyPlans() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const steps: { icon: IconName; title: string; body: string }[] = [
    { icon: 'edit', title: t('carePlans.step1Title'), body: t('carePlans.step1Body') },
    { icon: 'target', title: t('carePlans.step2Title'), body: t('carePlans.step2Body') },
    { icon: 'list', title: t('carePlans.step3Title'), body: t('carePlans.step3Body') },
  ];
  return (
    <>
      <Card>
        <EmptyState icon="clipboard" tint="blue" title={t('carePlans.emptyTitle')} message={t('carePlans.emptyBody')} />
      </Card>
      <SectionHeader title={t('carePlans.howItWorksTitle')} style={s.sectionAfterCard} />
      <Card variant="flush">
        {steps.map((step, i) => (
          <StepRow key={step.title} icon={step.icon} title={step.title} body={step.body} divider={i < steps.length - 1} />
        ))}
      </Card>
      <NoticeBanner icon="info" tone="pending" title={t('carePlans.emptyCalloutTitle')} message={t('carePlans.emptyCalloutBody')} />
    </>
  );
}

/** A §8 row whose body is allowed to wrap — explanatory prose, not a record. */
function StepRow({ icon, title, body, divider }: { icon: IconName; title: string; body: string; divider: boolean }) {
  const { colors, tintMap } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const tint = tintMap.blue;
  return (
    <View style={[s.stepRow, divider && s.rowDivider]} accessible accessibilityLabel={`${title}. ${body}`}>
      <View style={[s.goalMark, { backgroundColor: tint.bg }]}>
        <Icon name={icon} size={20} color={tint.fg} />
      </View>
      <View style={s.goalBody}>
        <Text style={s.goalTitle}>{title}</Text>
        <Text style={s.goalText}>{body}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ styles */

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
    sectionAfterCard: { marginTop: spacing.sm },

    headTrailing: { alignItems: 'flex-end', gap: 6 },

    overview: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 2,
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
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
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    overviewText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },

    stats: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
    stat: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statMark: {
      width: 34,
      height: 34,
      borderRadius: radii.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statBody: { flex: 1, minWidth: 0 },
    statValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    statUnit: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textPrimary,
    },
    statLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
    },

    progress: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 8 },
    progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    progressTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textPrimary,
    },
    progressValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.link,
    },
    progressTrack: { height: 8, borderRadius: radii.pill, backgroundColor: colors.divider, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: radii.pill, backgroundColor: colors.blue },

    details: { borderTopWidth: 1, borderTopColor: colors.divider },
    inset: { padding: spacing.md, paddingBottom: 0 },
    cardSectionTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: 6,
    },
    emptyLine: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textMuted,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },

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
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    goalBody: { flex: 1, minWidth: 0, gap: 2 },
    goalTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    goalMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    goalText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
    },

    refreshRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    refreshText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
  });
