import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  CalendarCheck,
  CalendarClock,
  Hospital,
  Info,
  NotebookPen,
  RefreshCw,
  Signpost,
  Stethoscope,
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
import { colors } from '../theme/tokens';
import {
  useReferrals,
  type Referral,
  type ReferralStatus,
  type ReferralUrgency,
} from '../lib/api/queries';

/**
 * Referral cases — read-only (GET /mobile/referrals).
 *
 * ── Why the empty state is the design ─────────────────────────────────────
 * A referral is authored by a clinician, never by the patient: there is no
 * mobile write endpoint and there should not be one. For any patient who has
 * not been referred — which is the demo patient and most real patients — this
 * screen has no rows and no action to offer. A bare "nothing here" would read
 * as a broken screen, so the empty state explains who creates a referral, what
 * happens to it, and what will appear here when one exists.
 *
 * No reference image covers referrals (the 173-image reference set and its
 * 72-screen app plan contain no referral screen), so the layout follows the
 * established language: white `rounded-2xl` cards on cream, tinted icon tiles
 * leading each row, tinted status pills, gold accents from the tokens.
 */

const STATUS_TONE: Record<ReferralStatus, Tone> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  completed: 'success',
  expired: 'warning',
};

const URGENT: ReferralUrgency[] = ['urgent', 'emergency'];

function formatDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ReferralsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data, isLoading, isError, isRefetching, refetch } = useReferrals();
  const referrals = data?.data ?? [];

  const header = (
    <ScreenHeader
      title={t('referrals.title')}
      subtitle={t('referrals.subtitle')}
      onBack={() => router.back()}
      trailingIcon={ArrowRightLeft}
    />
  );

  if (isLoading) {
    return (
      <Screen className="px-0">
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand[500]} size="large" />
        </View>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen className="px-0">
        {header}
        <View className="flex-1 justify-center px-8">
          <StateHeading
            icon={AlertCircle}
            tone="danger"
            title={t('referrals.loadErrorTitle')}
            body={t('referrals.loadErrorBody')}
          />
          <View className="mt-7">
            <GhostButton label={t('referrals.retry')} icon={RefreshCw} onPress={() => refetch()} />
          </View>
        </View>
      </Screen>
    );
  }

  // ── Empty: explain the process rather than showing a void ─────────────────
  if (referrals.length === 0) {
    return (
      <Screen className="px-0">
        {header}
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingTop: 28, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor={colors.brand[500]}
            />
          }
        >
          <StateHeading
            icon={Signpost}
            title={t('referrals.emptyTitle')}
            body={t('referrals.emptyBody')}
          />

          <Text className="mb-2 mt-8 text-sm font-bold text-navy-text">
            {t('referrals.howItWorksTitle')}
          </Text>
          <ExplainerSteps
            steps={[
              {
                icon: Stethoscope,
                title: t('referrals.step1Title'),
                body: t('referrals.step1Body'),
              },
              {
                icon: Hospital,
                title: t('referrals.step2Title'),
                body: t('referrals.step2Body'),
              },
              {
                icon: CalendarCheck,
                title: t('referrals.step3Title'),
                body: t('referrals.step3Body'),
              },
            ]}
          />

          <View className="mt-4">
            <Callout
              icon={Info}
              tone="info"
              title={t('referrals.emptyCalloutTitle')}
              body={t('referrals.emptyCalloutBody')}
            />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen className="px-0">
      {header}
      <FlatList
        data={referrals}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListHeaderComponent={
          <Text className="mb-3 text-xs font-bold uppercase text-navy-muted">
            {t('referrals.countLabel', { count: referrals.length })}
          </Text>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.brand[500]}
          />
        }
        renderItem={({ item }) => <ReferralCard referral={item} locale={i18n.language} />}
      />
    </Screen>
  );
}

/** One facility node on the from → to rail. */
function FacilityNode({ label, name, isOrigin }: { label: string; name: string; isOrigin: boolean }) {
  return (
    <View className="flex-row items-center">
      <IconTile icon={Building2} tone={isOrigin ? 'neutral' : 'gold'} size={34} />
      <View className="ml-3 flex-1">
        <Text className="text-[10px] font-bold uppercase text-navy-muted">{label}</Text>
        <Text className="text-sm font-bold text-navy-text" numberOfLines={2}>
          {name}
        </Text>
      </View>
    </View>
  );
}

function ReferralCard({ referral, locale }: { referral: Referral; locale: string }) {
  const { t } = useTranslation();
  const isUrgent = URGENT.includes(referral.urgency);
  const urgencyColor =
    referral.urgency === 'emergency' ? colors.semantic.danger : colors.semantic.warning;

  // Show every milestone the record actually carries, oldest first — a single
  // "latest date" line throws away the rest of the case history.
  const milestones = [
    { key: 'referredOn', date: formatDate(referral.referred_at, locale) },
    { key: 'acceptedOn', date: formatDate(referral.accepted_at, locale) },
    { key: 'completedOn', date: formatDate(referral.completed_at, locale) },
  ].filter((m): m is { key: string; date: string } => m.date !== null);

  return (
    <View className="rounded-2xl bg-white p-4">
      <View className="flex-row items-center justify-between">
        <StatusPill
          label={t(`referrals.status.${referral.status}`)}
          tone={STATUS_TONE[referral.status] ?? 'neutral'}
        />
        {isUrgent ? (
          <View className="flex-row items-center">
            <AlertTriangle size={13} color={urgencyColor} />
            <Text className="ml-1.5 text-[11px] font-bold" style={{ color: urgencyColor }}>
              {t(`referrals.urgency.${referral.urgency}`)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── From → to rail ──────────────────────────────────────────────────
          Stacked rather than side-by-side: two facility names on one row both
          truncate to uselessness on a phone. */}
      <View className="mt-4">
        <FacilityNode
          label={t('referrals.from')}
          name={referral.referring_facility}
          isOrigin
        />
        <View className="flex-row items-center" style={{ height: 22 }}>
          <View className="items-center" style={{ width: 34 }}>
            <View
              className="h-full"
              style={{ width: 2, backgroundColor: colors.cream[300] }}
            />
          </View>
          <ArrowRightLeft
            size={12}
            color={colors.navy.muted}
            style={{ marginLeft: 10, transform: [{ rotate: '90deg' }] }}
          />
        </View>
        <FacilityNode
          label={t('referrals.to')}
          name={referral.receiving_facility}
          isOrigin={false}
        />
      </View>

      <View
        className="mt-4 pt-4"
        style={{ borderTopWidth: 1, borderTopColor: colors.cream[300] }}
      >
        <Text className="text-[10px] font-bold uppercase text-navy-muted">
          {t('referrals.reason')}
        </Text>
        <Text className="mt-1 text-sm leading-5 text-navy-text">{referral.reason}</Text>
      </View>

      {referral.notes ? (
        <View className="mt-3 flex-row items-start rounded-xl bg-cream-100 p-3">
          <NotebookPen size={14} color={colors.navy.muted} style={{ marginTop: 1 }} />
          <View className="ml-2.5 flex-1">
            <Text className="text-[10px] font-bold uppercase text-navy-muted">
              {t('referrals.notes')}
            </Text>
            <Text className="mt-0.5 text-xs leading-5 text-navy-secondary">{referral.notes}</Text>
          </View>
        </View>
      ) : null}

      {milestones.length > 0 ? (
        <View
          className="mt-4 flex-row flex-wrap items-center gap-3 pt-3"
          style={{ borderTopWidth: 1, borderTopColor: colors.cream[300] }}
        >
          {milestones.map((milestone) => (
            <View key={milestone.key} className="flex-row items-center">
              <CalendarClock size={12} color={colors.navy.muted} />
              <Text className="ml-1.5 text-[11px] text-navy-muted">
                {t(`referrals.${milestone.key}`, { date: milestone.date })}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
