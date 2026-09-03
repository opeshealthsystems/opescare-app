import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Inbox,
  MessageSquareQuote,
  RotateCcw,
  ShieldCheck,
  TimerOff,
  WifiOff,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { useSurveys, type Survey } from '../../lib/api/queries';
import { colors } from '../../theme/tokens';

const TABS = ['all', 'todo', 'completed', 'expired'] as const;
type Tab = (typeof TABS)[number];

/** Only 'pending' and 'sent' are answerable — everything else is history. */
function isAnswerable(survey: Survey): boolean {
  return survey.status === 'pending' || survey.status === 'sent';
}

function tabOf(survey: Survey): Exclude<Tab, 'all'> {
  if (survey.status === 'completed') return 'completed';
  if (survey.status === 'expired') return 'expired';
  return 'todo';
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Whole days from now until `value`; negative once it has passed. */
function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.ceil((parsed.getTime() - Date.now()) / 86_400_000);
}

/**
 * Feedback questionnaires a facility has sent this patient after a visit.
 *
 * Backed by GET /mobile/surveys, verified live (200) and empty for the demo
 * patient. Ordering puts anything still answerable first, then the closest
 * deadline, so the list is a worklist rather than a log.
 */
export default function SurveysScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isLoading, isError, isFetching, refetch } = useSurveys();
  const [tab, setTab] = useState<Tab>('all');

  const surveys = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    const base: Record<Tab, number> = { all: surveys.length, todo: 0, completed: 0, expired: 0 };
    for (const survey of surveys) base[tabOf(survey)] += 1;
    return base;
  }, [surveys]);

  const visible = useMemo(() => {
    const filtered = tab === 'all' ? surveys : surveys.filter((s) => tabOf(s) === tab);
    return [...filtered].sort((a, b) => {
      // Answerable first; within that, the soonest deadline; then newest sent.
      if (isAnswerable(a) !== isAnswerable(b)) return isAnswerable(a) ? -1 : 1;
      const expiryA = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY;
      const expiryB = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY;
      if (expiryA !== expiryB) return expiryA - expiryB;
      const sentA = a.sent_at ? new Date(a.sent_at).getTime() : 0;
      const sentB = b.sent_at ? new Date(b.sent_at).getTime() : 0;
      return sentB - sentA;
    });
  }, [surveys, tab]);

  return (
    <Screen className="px-0">
      <View className="flex-row items-start px-6 pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('surveys.back')}
          className="h-11 w-11 items-center justify-center rounded-full border border-brand-300"
        >
          <ArrowLeft size={18} color={colors.brand[600]} />
        </Pressable>
        <View className="ml-3 flex-1">
          <Text className="text-2xl font-extrabold text-navy-text">{t('surveys.title')}</Text>
          <Text className="mt-0.5 text-xs leading-4 text-navy-secondary">{t('surveys.listSubtitle')}</Text>
        </View>
      </View>

      {/* Tabs carry real counts — the list endpoint is unpaginated, so every
          survey the API returned is already in hand and the numbers are exact. */}
      {!isLoading && !isError && surveys.length > 0 ? (
        <FlatList
          data={TABS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 16, gap: 8 }}
          renderItem={({ item }) => {
            const active = item === tab;
            return (
              <Pressable
                onPress={() => setTab(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className="flex-row items-center rounded-full px-4 py-2"
                style={{
                  backgroundColor: active ? colors.brand[500] : colors.white,
                  borderWidth: active ? 0 : 1,
                  borderColor: colors.cream[300],
                }}
              >
                <Text
                  className={
                    active ? 'text-sm font-semibold text-white' : 'text-sm font-semibold text-navy-secondary'
                  }
                >
                  {t(`surveys.tab.${item}`)}
                </Text>
                <View
                  className="ml-2 min-w-[22px] items-center rounded-full px-1.5 py-0.5"
                  style={{ backgroundColor: active ? colors.white : colors.cream[200] }}
                >
                  <Text
                    className={`text-[11px] font-bold ${active ? 'text-brand-600' : 'text-navy-secondary'}`}
                  >
                    {counts[item]}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      ) : (
        <View className="h-4" />
      )}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState t={t} onRetry={() => refetch()} />
      ) : surveys.length === 0 ? (
        <EmptyState t={t} onOpenAppointments={() => router.push('/appointments')} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(survey) => survey.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={colors.brand[500]}
            />
          }
          ListEmptyComponent={
            <View className="items-center rounded-2xl border border-cream-300 bg-white px-6 py-10">
              <View
                className="h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.cream[200] }}
              >
                <Inbox size={24} color={colors.navy.muted} />
              </View>
              <Text className="mt-3 text-center text-sm font-bold text-navy-text">
                {t('surveys.tabEmptyTitle')}
              </Text>
              <Text className="mt-1 text-center text-xs leading-4 text-navy-secondary">
                {t('surveys.tabEmptyBody')}
              </Text>
            </View>
          }
          ListFooterComponent={
            <View
              className="mt-4 flex-row items-start rounded-2xl p-3"
              style={{ backgroundColor: colors.semantic.successSurface }}
            >
              <ShieldCheck size={16} color={colors.semantic.success} />
              <Text className="ml-2 flex-1 text-[11px] leading-4 text-navy-secondary">
                {t('surveys.privacyNote')}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <SurveyCard survey={item} t={t} onPress={() => router.push(`/surveys/${item.id}`)} />
          )}
        />
      )}
    </Screen>
  );
}

function SurveyCard({ survey, t, onPress }: { survey: Survey; t: TFunction; onPress: () => void }) {
  const answerable = isAnswerable(survey);
  const completed = survey.status === 'completed';
  const expired = survey.status === 'expired';

  const templateLabel = t(`surveys.templates.${survey.template_key}`, { defaultValue: survey.template_key });
  const sent = formatDate(survey.sent_at);
  const completedOn = formatDate(survey.completed_at);
  const expiresOn = formatDate(survey.expires_at);
  const remainingDays = answerable ? daysUntil(survey.expires_at) : null;
  const closingSoon = remainingDays !== null && remainingDays >= 0 && remainingDays <= 7;

  const tile = completed
    ? { surface: colors.semantic.successSurface, icon: colors.semantic.success, Icon: CheckCircle2 }
    : expired
      ? { surface: colors.cream[200], icon: colors.navy.muted, Icon: TimerOff }
      : { surface: colors.brand[50], icon: colors.brand[600], Icon: ClipboardList };

  const statusPill = completed
    ? { label: t('surveys.statusCompleted'), surface: colors.semantic.successSurface, text: 'text-success' }
    : expired
      ? { label: t('surveys.statusExpired'), surface: colors.cream[200], text: 'text-navy-muted' }
      : { label: t('surveys.statusToDo'), surface: colors.semantic.infoSurface, text: 'text-info' };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="rounded-2xl border bg-white p-4"
      style={{ borderColor: closingSoon ? colors.semantic.warning : colors.cream[300] }}
    >
      <View className="flex-row items-start">
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: tile.surface }}
        >
          <tile.Icon size={19} color={tile.icon} />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-base font-bold leading-5 text-navy-text" numberOfLines={2}>
            {templateLabel}
          </Text>
          <View className="mt-1.5 self-start rounded-full px-2.5 py-0.5" style={{ backgroundColor: statusPill.surface }}>
            <Text className={`text-[11px] font-semibold ${statusPill.text}`}>{statusPill.label}</Text>
          </View>
        </View>
        <ChevronRight size={18} color={colors.navy.muted} />
      </View>

      <View className="mt-3" style={{ gap: 4 }}>
        {sent ? <MetaRow icon={CalendarDays} text={t('surveys.sentOn', { date: sent })} /> : null}
        {completed && completedOn ? (
          <MetaRow icon={CheckCircle2} text={t('surveys.completedOn', { date: completedOn })} />
        ) : null}
        {!completed && expiresOn ? (
          <MetaRow icon={Clock} text={t('surveys.expiresOn', { date: expiresOn })} />
        ) : null}
      </View>

      {closingSoon ? (
        <View
          className="mt-3 flex-row items-center rounded-xl px-3 py-2"
          style={{ backgroundColor: colors.semantic.warningSurface }}
        >
          <Clock size={14} color={colors.semantic.warning} />
          <Text className="ml-2 flex-1 text-xs font-semibold text-warning">
            {remainingDays === 0
              ? t('surveys.closesToday')
              : t('surveys.closesInDays', { count: remainingDays as number })}
          </Text>
        </View>
      ) : null}

      <View className="mt-3 border-t border-cream-200 pt-3">
        <View className="flex-row items-center justify-end">
          <Text className={`text-sm font-bold ${expired ? 'text-navy-muted' : 'text-brand-600'}`}>
            {completed ? t('surveys.viewResponses') : expired ? t('surveys.viewDetails') : t('surveys.takeSurvey')}
          </Text>
          <ChevronRight size={16} color={expired ? colors.navy.muted : colors.brand[600]} />
        </View>
      </View>
    </Pressable>
  );
}

function MetaRow({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <View className="flex-row items-center">
      <Icon size={13} color={colors.navy.muted} />
      <Text className="ml-1.5 flex-1 text-xs text-navy-secondary" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function LoadingState() {
  return (
    <View className="flex-1 px-6" style={{ gap: 12 }}>
      {[0, 1].map((i) => (
        <View key={i} className="rounded-2xl border border-cream-300 bg-white p-4">
          <View className="flex-row items-center">
            <View className="h-11 w-11 rounded-2xl bg-cream-200" />
            <View className="ml-3 flex-1">
              <View className="h-4 w-2/3 rounded-full bg-cream-200" />
              <View className="mt-2 h-3 w-1/4 rounded-full bg-cream-200" />
            </View>
          </View>
          <View className="mt-4 h-3 w-1/2 rounded-full bg-cream-200" />
        </View>
      ))}
    </View>
  );
}

function ErrorState({ t, onRetry }: { t: TFunction; onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <View
        className="h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.semantic.dangerSurface }}
      >
        <WifiOff size={26} color={colors.semantic.danger} />
      </View>
      <Text className="mt-4 text-center text-base font-bold text-navy-text">{t('surveys.loadError')}</Text>
      <Text className="mt-1 text-center text-sm leading-5 text-navy-secondary">{t('surveys.loadErrorHint')}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        className="mt-5 flex-row items-center rounded-full border border-brand-300 px-5 py-2.5"
      >
        <RotateCcw size={14} color={colors.brand[600]} />
        <Text className="ml-2 text-sm font-semibold text-brand-600">{t('surveys.retry')}</Text>
      </Pressable>
    </View>
  );
}

/** Nothing to answer is the normal, good state — say so, explain when one
 * appears, and leave a route to the visits that trigger them. */
function EmptyState({ t, onOpenAppointments }: { t: TFunction; onOpenAppointments: () => void }) {
  return (
    <ScrollView
      className="flex-1 px-6"
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="items-center pt-4">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-100">
            <CheckCircle2 size={26} color={colors.brand[600]} />
          </View>
        </View>
        <Text className="mt-4 text-center text-lg font-extrabold text-navy-text">{t('surveys.emptyTitle')}</Text>
        <Text className="mt-1.5 text-center text-sm leading-5 text-navy-secondary">{t('surveys.emptyBody')}</Text>
      </View>

      <View className="mt-6 rounded-2xl border border-cream-300 bg-white p-4">
        <View className="flex-row items-center">
          <MessageSquareQuote size={16} color={colors.brand[600]} />
          <Text className="ml-2 text-sm font-bold text-navy-text">{t('surveys.whyTitle')}</Text>
        </View>
        <Text className="mt-2 text-xs leading-4 text-navy-secondary">{t('surveys.whyBody')}</Text>
      </View>

      <View className="mt-5">
        <Button
          label={t('surveys.openAppointments')}
          variant="outline"
          showChevron={false}
          onPress={onOpenAppointments}
        />
      </View>

      <View
        className="mt-5 flex-row items-start rounded-2xl p-3"
        style={{ backgroundColor: colors.semantic.successSurface }}
      >
        <ShieldCheck size={16} color={colors.semantic.success} />
        <Text className="ml-2 flex-1 text-[11px] leading-4 text-navy-secondary">{t('surveys.privacyNote')}</Text>
      </View>
    </ScrollView>
  );
}
