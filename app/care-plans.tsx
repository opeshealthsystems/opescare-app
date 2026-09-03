import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertCircle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ClipboardList,
  HandHeart,
  Info,
  ListChecks,
  NotebookPen,
  Pill,
  RefreshCw,
  Share2,
  Stethoscope,
  Target,
  TrendingUp,
  Utensils,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../components/ui/Screen';
import {
  Callout,
  ExplainerSteps,
  GhostButton,
  IconTile,
  ScreenHeader,
  StateHeading,
  StatusPill,
  type Tone,
} from '../components/clinical/CareUi';
import {
  useCarePlan,
  useCarePlans,
  type CarePlan,
  type CarePlanGoal,
  type CarePlanIntervention,
} from '../lib/api/queries';
import { colors } from '../theme/tokens';

/**
 * Care plans — read-only (GET /mobile/care-plans, GET /mobile/care-plans/{id}).
 *
 * ── Why the empty state is the design ─────────────────────────────────────
 * A care plan is authored and assigned by a care team after a visit; the
 * patient cannot create one and there is no mobile write endpoint. The list
 * endpoint additionally returns only `status = active` plans, so a patient
 * between episodes of care legitimately sees nothing. The empty state
 * therefore explains who writes a plan and what it will contain rather than
 * presenting a void.
 *
 * ── Progress without a round trip ─────────────────────────────────────────
 * CarePlanService::getActivePlansForPatient() eager-loads goals and
 * interventions, and `progress_pct` is a pure function of them
 * (achieved / total). Progress is therefore computed from the list payload and
 * rendered immediately; the per-plan detail query still runs on expand so the
 * server stays authoritative, but the UI never blocks on it.
 *
 * No reference image covers care plans (the reference set's 72-screen app plan
 * lists none), so goals and interventions borrow the "Health Goals" row
 * treatment from the Health Preferences reference: tinted icon tile, title +
 * sub-line, status pill trailing.
 */

const PLAN_STATUS_TONE: Record<CarePlan['status'], Tone> = {
  active: 'success',
  completed: 'info',
  on_hold: 'warning',
  cancelled: 'danger',
};

const GOAL_STATUS_TONE: Record<CarePlanGoal['status'], Tone> = {
  pending: 'warning',
  in_progress: 'info',
  achieved: 'success',
  abandoned: 'danger',
};

const INTERVENTION_STATUS_TONE: Record<CarePlanIntervention['status'], Tone> = {
  active: 'success',
  completed: 'info',
  discontinued: 'danger',
};

const INTERVENTION_ICON: Record<CarePlanIntervention['intervention_type'], LucideIcon> = {
  medication: Pill,
  exercise: Activity,
  diet: Utensils,
  monitoring: Stethoscope,
  referral: Share2,
  education: BookOpen,
  other: ClipboardList,
};

const GOAL_ICON: Record<CarePlanGoal['status'], LucideIcon> = {
  pending: Circle,
  in_progress: Target,
  achieved: CheckCircle2,
  abandoned: XCircle,
};

function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** achieved / total, matching CarePlanService::getSummary() exactly. */
function progressOf(goals: CarePlanGoal[]): number {
  if (goals.length === 0) return 0;
  return Math.round((goals.filter((g) => g.status === 'achieved').length / goals.length) * 100);
}

export default function CarePlansScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const plansQuery = useCarePlans();
  const detailQuery = useCarePlan(expandedId);
  const plans = plansQuery.data ?? [];

  const header = (
    <ScreenHeader
      title={t('carePlans.title')}
      subtitle={t('carePlans.subtitle')}
      onBack={() => router.back()}
      trailingIcon={ClipboardList}
    />
  );

  if (plansQuery.isLoading) {
    return (
      <Screen className="px-0">
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand[500]} size="large" />
        </View>
      </Screen>
    );
  }

  if (plansQuery.isError) {
    return (
      <Screen className="px-0">
        {header}
        <View className="flex-1 justify-center px-8">
          <StateHeading
            icon={AlertCircle}
            tone="danger"
            title={t('carePlans.loadErrorTitle')}
            body={t('carePlans.loadError')}
          />
          <View className="mt-7">
            <GhostButton
              label={t('carePlans.retry')}
              icon={RefreshCw}
              onPress={() => plansQuery.refetch()}
            />
          </View>
        </View>
      </Screen>
    );
  }

  // ── Empty: explain what a care plan is and who assigns it ─────────────────
  if (plans.length === 0) {
    return (
      <Screen className="px-0">
        {header}
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingTop: 28, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <StateHeading
            icon={HandHeart}
            title={t('carePlans.emptyTitle')}
            body={t('carePlans.emptyBody')}
          />

          <Text className="mb-2 mt-8 text-sm font-bold text-navy-text">
            {t('carePlans.howItWorksTitle')}
          </Text>
          <ExplainerSteps
            steps={[
              {
                icon: NotebookPen,
                title: t('carePlans.step1Title'),
                body: t('carePlans.step1Body'),
              },
              {
                icon: Target,
                title: t('carePlans.step2Title'),
                body: t('carePlans.step2Body'),
              },
              {
                icon: ListChecks,
                title: t('carePlans.step3Title'),
                body: t('carePlans.step3Body'),
              },
            ]}
          />

          <View className="mt-4">
            <Callout
              icon={Info}
              tone="info"
              title={t('carePlans.emptyCalloutTitle')}
              body={t('carePlans.emptyCalloutBody')}
            />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen className="px-0">
      {header}
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingTop: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mb-3 text-xs font-bold uppercase text-navy-muted">
          {t('carePlans.countLabel', { count: plans.length })}
        </Text>

        {plans.map((plan) => {
          const isExpanded = expandedId === plan.id;
          // Only trust the detail payload once it belongs to THIS plan.
          const detail = detailQuery.data?.plan.id === plan.id ? detailQuery.data : undefined;
          const goals = detail?.goals ?? plan.goals ?? [];
          const interventions = detail?.interventions ?? plan.interventions ?? [];
          const achieved = goals.filter((g) => g.status === 'achieved').length;
          const progressPct = detail?.progress_pct ?? progressOf(goals);
          const start = formatDate(plan.start_date, i18n.language);
          const end = plan.end_date
            ? formatDate(plan.end_date, i18n.language)
            : t('carePlans.ongoing');

          return (
            <Pressable
              key={plan.id}
              onPress={() => setExpandedId(isExpanded ? null : plan.id)}
              accessibilityRole="button"
              accessibilityLabel={isExpanded ? t('carePlans.collapse') : t('carePlans.expand')}
              className="mb-4 rounded-2xl bg-white p-4"
            >
              <View className="flex-row items-start">
                <IconTile icon={ClipboardList} tone="gold" size={42} />
                <View className="ml-3 flex-1">
                  <Text className="text-base font-extrabold text-navy-text">{plan.title}</Text>
                  {plan.description ? (
                    <Text
                      className="mt-1 text-sm leading-5 text-navy-secondary"
                      numberOfLines={isExpanded ? undefined : 2}
                    >
                      {plan.description}
                    </Text>
                  ) : null}
                </View>
                <View className="ml-2 items-end">
                  <StatusPill
                    label={t(`carePlans.status.${plan.status}`)}
                    tone={PLAN_STATUS_TONE[plan.status] ?? 'neutral'}
                  />
                  <View className="mt-2">
                    {isExpanded ? (
                      <ChevronUp size={18} color={colors.navy.muted} />
                    ) : (
                      <ChevronDown size={18} color={colors.navy.muted} />
                    )}
                  </View>
                </View>
              </View>

              {/* Progress renders straight from the list payload — no spinner,
                  no waiting on the detail round trip. */}
              {goals.length > 0 ? (
                <View className="mt-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <TrendingUp size={13} color={colors.brand[600]} />
                      <Text className="ml-1.5 text-xs font-bold text-navy-text">
                        {t('carePlans.progress')}
                      </Text>
                    </View>
                    <Text className="text-xs font-bold text-brand-600">
                      {t('carePlans.goalsAchieved', { achieved, total: goals.length })}
                    </Text>
                  </View>
                  <View className="mt-2 h-2 overflow-hidden rounded-full bg-cream-200">
                    <View
                      className="h-2 rounded-full bg-brand-500"
                      style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                    />
                  </View>
                </View>
              ) : null}

              <View className="mt-4 flex-row flex-wrap items-center gap-3">
                <View className="flex-row items-center">
                  <CalendarDays size={12} color={colors.navy.muted} />
                  <Text className="ml-1.5 text-[11px] text-navy-muted">
                    {start ? `${start} — ${end}` : end}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Target size={12} color={colors.navy.muted} />
                  <Text className="ml-1.5 text-[11px] text-navy-muted">
                    {t('carePlans.goalsCount', { count: goals.length })}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <ListChecks size={12} color={colors.navy.muted} />
                  <Text className="ml-1.5 text-[11px] text-navy-muted">
                    {t('carePlans.interventionsCount', { count: interventions.length })}
                  </Text>
                </View>
              </View>

              {isExpanded ? (
                <View
                  className="mt-4 pt-4"
                  style={{ borderTopWidth: 1, borderTopColor: colors.cream[300] }}
                >
                  {detailQuery.isError ? (
                    <Text className="mb-3 text-xs text-danger">
                      {t('carePlans.detailStaleNotice')}
                    </Text>
                  ) : null}

                  <Text className="mb-2.5 text-sm font-bold text-navy-text">
                    {t('carePlans.goals')}
                  </Text>
                  {goals.length === 0 ? (
                    <Text className="mb-4 text-xs text-navy-muted">{t('carePlans.noGoals')}</Text>
                  ) : (
                    goals.map((goal) => {
                      const tone = GOAL_STATUS_TONE[goal.status] ?? 'neutral';
                      const target = formatDate(goal.target_date, i18n.language);
                      return (
                        <View key={goal.id} className="mb-3 flex-row items-start">
                          <IconTile icon={GOAL_ICON[goal.status] ?? Circle} tone={tone} size={34} />
                          <View className="ml-3 flex-1">
                            <Text className="text-sm font-semibold leading-5 text-navy-text">
                              {goal.goal_text}
                            </Text>
                            {target ? (
                              <Text className="mt-0.5 text-[11px] text-navy-muted">
                                {t('carePlans.target')}: {target}
                              </Text>
                            ) : null}
                            {goal.notes ? (
                              <Text className="mt-1 text-[11px] leading-4 text-navy-secondary">
                                {goal.notes}
                              </Text>
                            ) : null}
                          </View>
                          <View className="ml-2">
                            <StatusPill
                              label={t(`carePlans.goalStatus.${goal.status}`)}
                              tone={tone}
                            />
                          </View>
                        </View>
                      );
                    })
                  )}

                  <Text className="mb-2.5 mt-3 text-sm font-bold text-navy-text">
                    {t('carePlans.interventions')}
                  </Text>
                  {interventions.length === 0 ? (
                    <Text className="text-xs text-navy-muted">
                      {t('carePlans.noInterventions')}
                    </Text>
                  ) : (
                    interventions.map((intervention) => {
                      const tone = INTERVENTION_STATUS_TONE[intervention.status] ?? 'neutral';
                      const meta = [intervention.frequency, intervention.responsible_party]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <View key={intervention.id} className="mb-3 flex-row items-start">
                          <IconTile
                            icon={INTERVENTION_ICON[intervention.intervention_type] ?? ClipboardList}
                            tone="gold"
                            size={34}
                          />
                          <View className="ml-3 flex-1">
                            <Text className="text-sm font-semibold text-navy-text">
                              {t(`carePlans.interventionType.${intervention.intervention_type}`)}
                            </Text>
                            {intervention.description ? (
                              <Text className="mt-0.5 text-xs leading-5 text-navy-secondary">
                                {intervention.description}
                              </Text>
                            ) : null}
                            {meta ? (
                              <Text className="mt-0.5 text-[11px] text-navy-muted">{meta}</Text>
                            ) : null}
                          </View>
                          <View className="ml-2">
                            <StatusPill
                              label={t(`carePlans.interventionStatus.${intervention.status}`)}
                              tone={tone}
                            />
                          </View>
                        </View>
                      );
                    })
                  )}

                  {detailQuery.isLoading ? (
                    <View className="mt-1 flex-row items-center">
                      <ActivityIndicator color={colors.brand[500]} size="small" />
                      <Text className="ml-2 text-[11px] text-navy-muted">
                        {t('carePlans.refreshing')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
