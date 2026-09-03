import { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  RotateCcw,
  ShieldCheck,
  Star,
  ThumbsDown,
  ThumbsUp,
  TimerOff,
  WifiOff,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import {
  useSubmitSurvey,
  useSurvey,
  type SurveyQuestion,
  type SurveyResponseValue,
} from '../../lib/api/queries';
import { colors } from '../../theme/tokens';

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.ceil((parsed.getTime() - Date.now()) / 86_400_000);
}

/** 0–1 ratio → a percentage React Native's style types accept. */
function pct(ratio: number): `${number}%` {
  return `${Math.round(Math.min(1, Math.max(0, ratio)) * 1000) / 10}%` as `${number}%`;
}

/**
 * Only the four question types the API actually declares
 * (`SurveyQuestionType` — rating_5, rating_10, yes_no, text) are rendered.
 * Scored questions are required; free text is not — that mirrors
 * SurveyService, which stores a numeric response for ratings and yes/no and
 * a text response otherwise.
 */
function isRequired(type: SurveyQuestion['type']): boolean {
  return type === 'rating_5' || type === 'rating_10' || type === 'yes_no';
}

/** Whether a question has an answer worth sending. */
function isAnswered(value: SurveyResponseValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/** Server-supplied failure detail, if any — never the English fallback, which
 * would surface untranslated in a French session. */
function serverMessage(error: unknown): string | null {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message.trim().length > 0 ? message : null;
}

export default function SurveyDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const surveyQuery = useSurvey(id ?? null);
  const submitMutation = useSubmitSurvey(id ?? '');

  const [answers, setAnswers] = useState<Record<string, SurveyResponseValue>>({});
  const [showValidation, setShowValidation] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const questionOffsets = useRef<Record<string, number>>({});

  const template = useMemo(() => surveyQuery.data?.template ?? [], [surveyQuery.data]);
  const answeredCount = template.filter((question) => isAnswered(answers[question.key])).length;
  const missingRequired = template.filter(
    (question) => isRequired(question.type) && !isAnswered(answers[question.key]),
  );

  const setAnswer = (key: string, value: SurveyResponseValue) => {
    setAnswers((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = () => {
    if (missingRequired.length > 0) {
      setShowValidation(true);
      // Take the patient straight to the first thing still missing rather than
      // leaving them to hunt for it in a long questionnaire.
      const target = questionOffsets.current[missingRequired[0].key];
      if (typeof target === 'number') {
        scrollRef.current?.scrollTo({ y: Math.max(0, target - 12), animated: true });
      }
      return;
    }
    setShowValidation(false);

    const payload: Record<string, SurveyResponseValue> = {};
    for (const question of template) {
      const value = answers[question.key];
      if (!isAnswered(value)) continue;
      payload[question.key] = typeof value === 'string' ? value.trim() : (value as SurveyResponseValue);
    }

    submitMutation.mutate(payload, { onSuccess: () => setSubmitted(true) });
  };

  const survey = surveyQuery.data?.survey;
  const headerTitle = survey
    ? t(`surveys.templates.${survey.template_key}`, { defaultValue: survey.template_key })
    : t('surveys.title');
  const remainingDays = survey && !submitted ? daysUntil(survey.expires_at) : null;

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
          <Text className="text-xl font-extrabold leading-6 text-navy-text" numberOfLines={2}>
            {headerTitle}
          </Text>
          <Text className="mt-0.5 text-xs text-navy-secondary">{t('surveys.detailSubtitle')}</Text>
        </View>
      </View>

      {surveyQuery.isLoading ? (
        <FormSkeleton />
      ) : surveyQuery.isError || !surveyQuery.data || !survey ? (
        <StatusPanel
          icon={WifiOff}
          tint={colors.semantic.dangerSurface}
          iconColor={colors.semantic.danger}
          title={t('surveys.loadError')}
          body={t('surveys.loadErrorHint')}
        >
          <Pressable
            onPress={() => surveyQuery.refetch()}
            accessibilityRole="button"
            className="mt-5 flex-row items-center rounded-full border border-brand-300 px-5 py-2.5"
          >
            <RotateCcw size={14} color={colors.brand[600]} />
            <Text className="ml-2 text-sm font-semibold text-brand-600">{t('surveys.retry')}</Text>
          </Pressable>
        </StatusPanel>
      ) : submitted || survey.status === 'completed' ? (
        <StatusPanel
          icon={CheckCircle2}
          tint={colors.semantic.successSurface}
          iconColor={colors.semantic.success}
          title={submitted ? t('surveys.submittedTitle') : t('surveys.completedTitle')}
          body={
            submitted
              ? t('surveys.submittedBody')
              : t('surveys.completedBody', { date: formatDate(survey.completed_at) ?? '—' })
          }
        >
          <View className="mt-6 w-full">
            <Button label={t('surveys.done')} onPress={() => router.replace('/surveys')} />
          </View>
        </StatusPanel>
      ) : survey.status === 'expired' ? (
        <StatusPanel
          icon={TimerOff}
          tint={colors.cream[200]}
          iconColor={colors.navy.muted}
          title={t('surveys.expiredTitle')}
          body={t('surveys.expiredBody')}
        >
          <View className="mt-6 w-full">
            <Button
              label={t('surveys.backToSurveys')}
              variant="outline"
              showChevron={false}
              onPress={() => router.replace('/surveys')}
            />
          </View>
        </StatusPanel>
      ) : template.length === 0 ? (
        <StatusPanel
          icon={AlertTriangle}
          tint={colors.semantic.warningSurface}
          iconColor={colors.semantic.warning}
          title={t('surveys.noQuestionsTitle')}
          body={t('surveys.noQuestionsBody')}
        >
          <View className="mt-6 w-full">
            <Button
              label={t('surveys.backToSurveys')}
              variant="outline"
              showChevron={false}
              onPress={() => router.replace('/surveys')}
            />
          </View>
        </StatusPanel>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={16}
        >
          {/* Progress stays pinned above the questions: a half-finished
              questionnaire must always say how much is left. */}
          <View className="px-6 pb-3 pt-4">
            <View className="flex-row items-end justify-between">
              <Text className="text-xs font-semibold text-navy-secondary">
                {t('surveys.progressLabel', { answered: answeredCount, total: template.length })}
              </Text>
              <Text className="text-xs font-bold text-brand-600">
                {Math.round((answeredCount / template.length) * 100)}%
              </Text>
            </View>
            <View className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: colors.cream[300] }}>
              <View
                className="h-2 rounded-full"
                style={{
                  width: pct(answeredCount / template.length),
                  backgroundColor: colors.brand[500],
                }}
              />
            </View>
            {remainingDays !== null && remainingDays >= 0 && remainingDays <= 7 ? (
              <View className="mt-2 flex-row items-center">
                <Clock size={12} color={colors.semantic.warning} />
                <Text className="ml-1.5 text-[11px] font-semibold text-warning">
                  {remainingDays === 0
                    ? t('surveys.closesToday')
                    : t('surveys.closesInDays', { count: remainingDays })}
                </Text>
              </View>
            ) : null}
          </View>

          <ScrollView
            ref={scrollRef}
            className="flex-1 px-6"
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {showValidation && missingRequired.length > 0 ? (
              <Banner
                tint={colors.semantic.dangerSurface}
                icon={AlertTriangle}
                iconColor={colors.semantic.danger}
                text={t('surveys.requiredErrorCount', { count: missingRequired.length })}
              />
            ) : null}

            {submitMutation.isError ? (
              <View
                className="mb-4 flex-row items-start rounded-2xl p-3"
                style={{ backgroundColor: colors.semantic.dangerSurface }}
              >
                <AlertTriangle size={16} color={colors.semantic.danger} />
                <View className="ml-2 flex-1">
                  <Text className="text-xs font-semibold text-danger">{t('surveys.submitError')}</Text>
                  {serverMessage(submitMutation.error) ? (
                    <Text className="mt-0.5 text-[11px] leading-4 text-navy-secondary">
                      {serverMessage(submitMutation.error)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {template.map((question, index) => (
              <QuestionCard
                key={question.key}
                question={question}
                index={index}
                total={template.length}
                value={answers[question.key]}
                missing={showValidation && isRequired(question.type) && !isAnswered(answers[question.key])}
                onChange={(value) => setAnswer(question.key, value)}
                onLayoutOffset={(y) => {
                  questionOffsets.current[question.key] = y;
                }}
                t={t}
              />
            ))}

            <View
              className="mb-2 mt-1 flex-row items-start rounded-2xl p-3"
              style={{ backgroundColor: colors.semantic.successSurface }}
            >
              <ShieldCheck size={16} color={colors.semantic.success} />
              <Text className="ml-2 flex-1 text-[11px] leading-4 text-navy-secondary">
                {t('surveys.privacyNote')}
              </Text>
            </View>
          </ScrollView>

          {/* Submit bar sits outside the scroll view so it is reachable from
              anywhere in a long questionnaire. */}
          <View className="border-t border-cream-300 px-6 pb-1 pt-3">
            {missingRequired.length > 0 ? (
              <Text className="mb-2 text-center text-[11px] text-navy-muted">
                {t('surveys.remainingRequired', { count: missingRequired.length })}
              </Text>
            ) : null}
            <Button
              label={t('surveys.submit')}
              onPress={handleSubmit}
              loading={submitMutation.isPending}
              showChevron={false}
            />
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

function QuestionCard({
  question,
  index,
  total,
  value,
  missing,
  onChange,
  onLayoutOffset,
  t,
}: {
  question: SurveyQuestion;
  index: number;
  total: number;
  value: SurveyResponseValue | undefined;
  missing: boolean;
  onChange: (value: SurveyResponseValue) => void;
  onLayoutOffset: (y: number) => void;
  t: TFunction;
}) {
  const answered = isAnswered(value);
  const required = isRequired(question.type);

  return (
    <View
      onLayout={(event) => onLayoutOffset(event.nativeEvent.layout.y)}
      className="mb-4 rounded-2xl border bg-white p-4"
      style={{ borderColor: missing ? colors.semantic.danger : colors.cream[300] }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-[11px] font-bold uppercase tracking-wide text-brand-600">
          {t('surveys.questionOf', { current: index + 1, total })}
        </Text>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: required ? colors.semantic.infoSurface : colors.cream[200] }}
          >
            <Text
              className={`text-[10px] font-semibold ${required ? 'text-info' : 'text-navy-muted'}`}
            >
              {required ? t('surveys.required') : t('surveys.optional')}
            </Text>
          </View>
          {answered ? (
            <View
              className="h-5 w-5 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.semantic.successSurface }}
            >
              <Check size={12} color={colors.semantic.success} />
            </View>
          ) : null}
        </View>
      </View>

      <Text className="mt-2 text-[15px] font-semibold leading-5 text-navy-text">{question.text}</Text>

      {question.type === 'rating_5' ? (
        <StarRating
          scale={5}
          value={typeof value === 'number' ? value : undefined}
          onChange={onChange}
          t={t}
        />
      ) : question.type === 'rating_10' ? (
        <NumericScale
          scale={10}
          value={typeof value === 'number' ? value : undefined}
          onChange={onChange}
          t={t}
        />
      ) : question.type === 'yes_no' ? (
        <YesNoChoice value={typeof value === 'boolean' ? value : undefined} onChange={onChange} t={t} />
      ) : (
        <FreeText value={typeof value === 'string' ? value : ''} onChange={onChange} t={t} />
      )}

      {missing ? (
        <Text className="mt-2 text-[11px] font-semibold text-danger">{t('surveys.answerRequired')}</Text>
      ) : null}
    </View>
  );
}

/** rating_5 — five stars, with the ends labelled so the scale's direction is
 * never ambiguous. */
function StarRating({
  scale,
  value,
  onChange,
  t,
}: {
  scale: number;
  value: number | undefined;
  onChange: (value: number) => void;
  t: TFunction;
}) {
  const steps = Array.from({ length: scale }, (_, index) => index + 1);
  return (
    <View className="mt-3">
      <View className="flex-row items-center" style={{ gap: 10 }}>
        {steps.map((step) => {
          const active = value !== undefined && step <= value;
          return (
            <Pressable
              key={step}
              onPress={() => onChange(step)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityState={{ selected: value === step }}
            >
              <Star
                size={32}
                color={active ? colors.brand[500] : colors.cream[300]}
                fill={active ? colors.brand[500] : 'transparent'}
              />
            </Pressable>
          );
        })}
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-[11px] text-navy-muted">{t('surveys.scaleLow')}</Text>
        {value !== undefined ? (
          <Text className="text-[11px] font-bold text-brand-600">{`${value} / ${scale}`}</Text>
        ) : null}
        <Text className="text-[11px] text-navy-muted">{t('surveys.scaleHigh')}</Text>
      </View>
    </View>
  );
}

/** rating_10 — ten stars would be unreadable on a phone, so the wider scale
 * renders as numbered chips instead. */
function NumericScale({
  scale,
  value,
  onChange,
  t,
}: {
  scale: number;
  value: number | undefined;
  onChange: (value: number) => void;
  t: TFunction;
}) {
  const steps = Array.from({ length: scale }, (_, index) => index + 1);
  return (
    <View className="mt-3">
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {steps.map((step) => {
          const selected = value === step;
          return (
            <Pressable
              key={step}
              onPress={() => onChange(step)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="h-11 w-11 items-center justify-center rounded-xl border"
              style={{
                borderColor: selected ? colors.brand[500] : colors.cream[300],
                backgroundColor: selected ? colors.brand[500] : colors.white,
              }}
            >
              <Text
                className="text-sm font-bold"
                style={{ color: selected ? colors.white : colors.navy.secondary }}
              >
                {step}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-[11px] text-navy-muted">{t('surveys.scaleLow')}</Text>
        <Text className="text-[11px] text-navy-muted">{t('surveys.scaleHigh')}</Text>
      </View>
    </View>
  );
}

function YesNoChoice({
  value,
  onChange,
  t,
}: {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  t: TFunction;
}) {
  const option = (choice: boolean) => {
    const selected = value === choice;
    const Icon = choice ? ThumbsUp : ThumbsDown;
    return (
      <Pressable
        onPress={() => onChange(choice)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        className="flex-1 flex-row items-center justify-center rounded-2xl border py-3.5"
        style={{
          borderColor: selected ? colors.brand[500] : colors.cream[300],
          backgroundColor: selected ? colors.brand[50] : colors.white,
        }}
      >
        <Icon size={16} color={selected ? colors.brand[600] : colors.navy.muted} />
        <Text
          className="ml-2 text-sm font-semibold"
          style={{ color: selected ? colors.brand[600] : colors.navy.secondary }}
        >
          {choice ? t('surveys.yes') : t('surveys.no')}
        </Text>
      </Pressable>
    );
  };

  return (
    <View className="mt-3 flex-row" style={{ gap: 12 }}>
      {option(true)}
      {option(false)}
    </View>
  );
}

const FREE_TEXT_LIMIT = 1000;

function FreeText({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (value: string) => void;
  t: TFunction;
}) {
  return (
    <View className="mt-3">
      <TextInput
        className="rounded-2xl border bg-cream-50 p-3 text-sm text-navy-text"
        style={{ borderColor: colors.cream[300], minHeight: 96, textAlignVertical: 'top' }}
        placeholder={t('surveys.commentsPlaceholder')}
        placeholderTextColor={colors.navy.muted}
        multiline
        maxLength={FREE_TEXT_LIMIT}
        value={value}
        onChangeText={onChange}
      />
      <Text className="mt-1 text-right text-[10px] text-navy-muted">
        {value.length} / {FREE_TEXT_LIMIT}
      </Text>
    </View>
  );
}

function Banner({
  tint,
  icon: Icon,
  iconColor,
  text,
}: {
  tint: string;
  icon: typeof AlertTriangle;
  iconColor: string;
  text: string;
}) {
  return (
    <View className="mb-4 flex-row items-center rounded-2xl p-3" style={{ backgroundColor: tint }}>
      <Icon size={16} color={iconColor} />
      <Text className="ml-2 flex-1 text-xs font-medium" style={{ color: iconColor }}>
        {text}
      </Text>
    </View>
  );
}

function StatusPanel({
  icon: Icon,
  tint,
  iconColor,
  title,
  body,
  children,
}: {
  icon: typeof CheckCircle2;
  tint: string;
  iconColor: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: tint }}>
        <Icon size={30} color={iconColor} />
      </View>
      <Text className="mt-4 text-center text-lg font-extrabold text-navy-text">{title}</Text>
      <Text className="mt-1.5 text-center text-sm leading-5 text-navy-secondary">{body}</Text>
      {children}
    </View>
  );
}

function FormSkeleton() {
  return (
    <View className="flex-1 px-6 pt-6" style={{ gap: 16 }}>
      <View className="h-2 w-full rounded-full bg-cream-300" />
      {[0, 1, 2].map((i) => (
        <View key={i} className="rounded-2xl border border-cream-300 bg-white p-4">
          <View className="h-3 w-1/4 rounded-full bg-cream-200" />
          <View className="mt-3 h-4 w-4/5 rounded-full bg-cream-200" />
          <View className="mt-4 h-8 w-3/5 rounded-full bg-cream-200" />
        </View>
      ))}
    </View>
  );
}
