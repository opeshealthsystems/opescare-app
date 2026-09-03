import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  BadgeCheck,
  Hourglass,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import {
  useInsurancePolicies,
  type InsurancePolicy,
  type InsurancePolicyStatus,
} from '../../lib/api/queries';
import { colors } from '../../theme/tokens';

/** Credential-card tones. `live` = cover you can actually use today, `awaiting`
 * = created but not yet activated by the insurer (every self-enrolment starts
 * here — the mobile purchase endpoint always writes status `pending`), and
 * `dormant` = expired / cancelled / on hold. The tone drives the whole card
 * treatment so a patient can tell at a glance whether the card is usable. */
type CardTone = 'live' | 'awaiting' | 'dormant';

/** `className` does NOT reach expo-linear-gradient (no cssInterop is
 * registered for it), so every gradient card below is styled inline. The
 * colour tuples need `as const` — LinearGradient's `colors` prop is a tuple
 * type, not `string[]`. */
const LIVE_GRADIENT = [colors.brand[600], colors.brand[500], colors.brand[300]] as const;
const AWAITING_GRADIENT = [colors.navy.text, colors.navy.secondary] as const;

const CARD_STYLE = {
  borderRadius: 24,
  padding: 20,
  overflow: 'hidden',
} as const;

/** Status pill colours for the flat (dormant) card variant. */
const DORMANT_STATUS_STYLES: Record<InsurancePolicyStatus, { text: string; surface: string }> = {
  active: { text: colors.semantic.success, surface: colors.semantic.successSurface },
  pending: { text: colors.semantic.warning, surface: colors.semantic.warningSurface },
  inactive: { text: colors.navy.secondary, surface: colors.cream[300] },
  expired: { text: colors.semantic.danger, surface: colors.semantic.dangerSurface },
  cancelled: { text: colors.semantic.danger, surface: colors.semantic.dangerSurface },
};

function toneFor(policy: InsurancePolicy): CardTone {
  if (policy.status === 'active' && !policy.is_expired) return 'live';
  if (policy.status === 'pending') return 'awaiting';
  return 'dormant';
}

function formatDate(value: string | null, language: string): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(language.startsWith('fr') ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Whole days from today to `value`; negative once the date has passed. */
function daysUntil(value: string | null): number | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

/** "My Coverage" — the patient's own policies (GET /mobile/insurance), rendered
 * as insurance credentials. */
export default function InsurancePoliciesScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data, isLoading, isError, isRefetching, refetch } = useInsurancePolicies();
  const policies = data?.data ?? [];

  const counts = useMemo(() => {
    let live = 0;
    let awaiting = 0;
    let dormant = 0;
    for (const policy of policies) {
      const tone = toneFor(policy);
      if (tone === 'live') live += 1;
      else if (tone === 'awaiting') awaiting += 1;
      else dormant += 1;
    }
    return { live, awaiting, dormant };
  }, [policies]);

  return (
    <Screen className="px-0">
      <View className="flex-row items-center justify-between px-6 pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('insurance.back')}
          className="h-11 w-11 items-center justify-center rounded-full border border-brand-300"
        >
          <ArrowLeft size={18} color={colors.brand[600]} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.brand[500]}
          />
        }
      >
        <View className="mt-4">
          <Text className="text-2xl font-extrabold text-navy-text">{t('insurance.title')}</Text>
          <Text className="mt-1 text-sm text-navy-secondary">{t('insurance.subtitle')}</Text>
        </View>

        {isLoading ? (
          <View className="mt-20 items-center">
            <ActivityIndicator color={colors.brand[500]} size="large" />
          </View>
        ) : isError ? (
          <View className="mt-8 items-center rounded-3xl bg-white p-6">
            <View
              className="h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.semantic.dangerSurface }}
            >
              <ShieldAlert size={26} color={colors.semantic.danger} />
            </View>
            <Text className="mt-4 text-center text-base font-bold text-navy-text">
              {t('insurance.loadError')}
            </Text>
            <Text className="mt-2 text-center text-sm text-navy-secondary">
              {t('insurance.loadErrorBody')}
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="mt-5 rounded-full bg-brand-50 px-6 py-3"
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-brand-600">{t('insurance.retry')}</Text>
            </Pressable>
          </View>
        ) : policies.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <View className="mt-5 flex-row flex-wrap">
              {counts.live > 0 ? (
                <SummaryChip
                  label={t('insurance.summary.active')}
                  value={counts.live}
                  text={colors.semantic.success}
                  surface={colors.semantic.successSurface}
                />
              ) : null}
              {counts.awaiting > 0 ? (
                <SummaryChip
                  label={t('insurance.summary.pending')}
                  value={counts.awaiting}
                  text={colors.semantic.warning}
                  surface={colors.semantic.warningSurface}
                />
              ) : null}
              {counts.dormant > 0 ? (
                <SummaryChip
                  label={t('insurance.summary.dormant')}
                  value={counts.dormant}
                  text={colors.navy.secondary}
                  surface={colors.cream[200]}
                />
              ) : null}
            </View>

            <View className="mt-5">
              {policies.map((policy) => (
                <PolicyCard key={policy.id} policy={policy} language={i18n.language} />
              ))}
            </View>
          </>
        )}

        {!isLoading && !isError && policies.length > 0 ? (
          <Text className="mt-6 text-center text-[11px] text-navy-muted">
            {t('insurance.privacyNote')}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SummaryChip({
  label,
  value,
  text,
  surface,
}: {
  label: string;
  value: number;
  text: string;
  surface: string;
}) {
  return (
    <View
      className="mb-2 mr-2 flex-row items-center rounded-full px-4 py-2"
      style={{ backgroundColor: surface }}
    >
      <Text className="text-sm font-extrabold" style={{ color: text }}>
        {value}
      </Text>
      <Text className="ml-2 text-xs font-semibold" style={{ color: text }}>
        {label}
      </Text>
    </View>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <View className="mt-8 rounded-3xl bg-white p-6">
      <View className="items-center">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-50">
          <ShieldCheck size={30} color={colors.brand[500]} />
        </View>
        <Text className="mt-4 text-center text-lg font-extrabold text-navy-text">
          {t('insurance.emptyTitle')}
        </Text>
        <Text className="mt-2 text-center text-sm leading-5 text-navy-secondary">
          {t('insurance.emptyBody')}
        </Text>
      </View>

      <View className="mt-5 flex-row items-start rounded-2xl bg-brand-50 p-4">
        <ShieldCheck size={16} color={colors.brand[600]} />
        <Text className="ml-3 flex-1 text-xs leading-4 text-navy-secondary">
          {t('insurance.emptyNote')}
        </Text>
      </View>
    </View>
  );
}

function PolicyCard({ policy, language }: { policy: InsurancePolicy; language: string }) {
  const tone = toneFor(policy);
  const dark = tone !== 'dormant';
  const remaining = daysUntil(policy.expiry_date);

  const body = <PolicyCardBody policy={policy} tone={tone} dark={dark} language={language} remaining={remaining} />;

  if (dark) {
    return (
      <LinearGradient
        colors={tone === 'live' ? LIVE_GRADIENT : AWAITING_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          ...CARD_STYLE,
          marginBottom: 16,
          shadowColor: tone === 'live' ? colors.brand[700] : colors.navy.text,
          shadowOpacity: 0.22,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 4,
        }}
      >
        {body}
      </LinearGradient>
    );
  }

  return (
    <View
      className="mb-4 border border-cream-300"
      style={{ ...CARD_STYLE, backgroundColor: colors.cream[200] }}
    >
      {body}
    </View>
  );
}

function PolicyCardBody({
  policy,
  tone,
  dark,
  language,
  remaining,
}: {
  policy: InsurancePolicy;
  tone: CardTone;
  dark: boolean;
  language: string;
  remaining: number | null;
}) {
  const { t } = useTranslation();

  const labelCls = dark ? 'text-white/70' : 'text-navy-muted';
  const valueCls = dark ? 'text-white' : 'text-navy-text';
  const dividerCls = dark ? 'bg-white/25' : 'bg-cream-300';
  const dormantStatus = DORMANT_STATUS_STYLES[policy.status] ?? DORMANT_STATUS_STYLES.inactive;

  const planType = policy.plan?.plan_type;
  const credentialLabel = policy.member_id ? t('insurance.card.memberId') : t('insurance.card.policyNumber');
  const credentialValue = policy.member_id ?? policy.policy_number;

  const notice = (() => {
    if (tone === 'awaiting') {
      return { icon: Hourglass, text: t('insurance.card.pendingNotice') };
    }
    if (tone === 'live' && remaining !== null && remaining <= 60) {
      return {
        icon: TriangleAlert,
        text: t('insurance.card.expiringNotice', {
          date: formatDate(policy.expiry_date, language),
        }),
      };
    }
    if (tone === 'dormant') {
      const key =
        policy.status === 'cancelled'
          ? 'insurance.card.cancelledNotice'
          : policy.status === 'expired' || policy.is_expired
            ? 'insurance.card.expiredNotice'
            : 'insurance.card.inactiveNotice';
      return { icon: ShieldAlert, text: t(key) };
    }
    return null;
  })();

  const NoticeIcon = notice?.icon;

  return (
    <>
      {/* Watermark emblem — the credential "seal" seen on the Health ID card. */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', right: -18, top: -18, opacity: dark ? 0.16 : 0.5 }}
      >
        <BadgeCheck size={124} color={dark ? colors.white : colors.cream[300]} />
      </View>

      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text
            className={`text-[10px] font-bold uppercase tracking-widest ${labelCls}`}
            numberOfLines={1}
          >
            {policy.plan?.provider_name ?? t('insurance.card.label')}
          </Text>
          <Text className={`mt-1.5 text-lg font-extrabold ${valueCls}`} numberOfLines={2}>
            {policy.plan?.name ?? '—'}
          </Text>
        </View>

        <View
          className="flex-row items-center rounded-full px-3 py-1"
          style={{ backgroundColor: dark ? 'rgba(255,255,255,0.22)' : dormantStatus.surface }}
        >
          {tone === 'live' ? (
            <ShieldCheck size={12} color={colors.white} />
          ) : tone === 'awaiting' ? (
            <Hourglass size={12} color={colors.white} />
          ) : (
            <ShieldAlert size={12} color={dormantStatus.text} />
          )}
          <Text
            className="ml-1.5 text-[11px] font-bold"
            style={{ color: dark ? colors.white : dormantStatus.text }}
          >
            {t(`insurance.status.${policy.status}`)}
          </Text>
        </View>
      </View>

      {planType ? (
        <View
          className="mt-3 self-start rounded-full px-3 py-1"
          style={{ backgroundColor: dark ? 'rgba(255,255,255,0.18)' : colors.white }}
        >
          <Text
            className="text-[11px] font-semibold"
            style={{ color: dark ? colors.white : colors.navy.secondary }}
          >
            {t(`insurance.planType.${planType}`, { defaultValue: planType })}
          </Text>
        </View>
      ) : null}

      <View className={`mt-5 h-px ${dividerCls}`} />

      <View className="mt-4">
        <Text className={`text-[10px] font-bold uppercase tracking-widest ${labelCls}`}>
          {credentialLabel}
        </Text>
        <Text className={`mt-1 text-xl font-extrabold tracking-wider ${valueCls}`}>
          {credentialValue}
        </Text>
        {policy.member_id ? (
          <Text className={`mt-1 text-xs ${labelCls}`}>
            {t('insurance.card.policyNumber')} {policy.policy_number}
          </Text>
        ) : null}
      </View>

      <View className={`mt-4 h-px ${dividerCls}`} />

      <View className="mt-4 flex-row justify-between">
        <CardStat
          label={t('insurance.card.validFrom')}
          value={formatDate(policy.effective_date, language)}
          labelCls={labelCls}
          valueCls={valueCls}
        />
        <CardStat
          label={t('insurance.card.validUntil')}
          value={formatDate(policy.expiry_date, language)}
          labelCls={labelCls}
          valueCls={valueCls}
        />
        <CardStat
          label={t('insurance.card.holder')}
          value={t(`insurance.relationshipToPrimary.${policy.relationship_to_primary}`, {
            defaultValue: policy.relationship_to_primary,
          })}
          labelCls={labelCls}
          valueCls={valueCls}
        />
      </View>

      {notice && NoticeIcon ? (
        <View
          className="mt-5 flex-row items-start rounded-2xl p-3"
          style={{ backgroundColor: dark ? 'rgba(255,255,255,0.16)' : colors.white }}
        >
          <NoticeIcon size={14} color={dark ? colors.white : colors.navy.secondary} />
          <Text
            className="ml-2.5 flex-1 text-[11px] leading-4"
            style={{ color: dark ? colors.white : colors.navy.secondary }}
          >
            {notice.text}
          </Text>
        </View>
      ) : null}
    </>
  );
}

function CardStat({
  label,
  value,
  labelCls,
  valueCls,
}: {
  label: string;
  value: string;
  labelCls: string;
  valueCls: string;
}) {
  return (
    <View className="flex-1 pr-2">
      <Text className={`text-[10px] ${labelCls}`} numberOfLines={1}>
        {label}
      </Text>
      <Text className={`mt-1 text-xs font-bold ${valueCls}`} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
