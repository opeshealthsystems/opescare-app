import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Ban,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  Clock,
  Download,
  History,
  Hourglass,
  Layers,
  Lock,
  RefreshCw,
  Scale,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import {
  CARD_SHADOW,
  Chip,
  ConfirmBar,
  EmptyState,
  InlineNotice,
  NavRow,
  RightsHeader,
  SectionTitle,
  humanizeSlug,
  toneColors,
  type Tone,
} from '../../components/privacy/DataRightsUi';
import { colors } from '../../theme/tokens';
import {
  type ConsentRequestItem,
  extractApiErrorMessage,
  useApproveConsent,
  useConsentRequests,
  useDenyConsent,
  useRevokeConsent,
} from '../../lib/api/queries';

/**
 * Privacy & Data — the hub for the rights a patient holds over their own
 * record under Cameroon Law No. 2010/012: see who has access, decide who gets
 * it, take it away again, and from here reach the access log, the export
 * request flow and the correction flow.
 *
 * No reference image depicts this screen; the closest is the "Access History"
 * mockup (a_bright_clean_mobile_app_screenshot_of_a_health_r.png), whose
 * reassurance banner, status pills and closing note are carried over, and the
 * onboarding permissions reference
 * (a_clean_mobile_app_permission_screen_mockup_iphon.png), whose row-of-cards
 * treatment for a grantable permission — icon medallion, title, explanation,
 * state pill — is what a consent request is modelled on here.
 *
 * Confirmations are rendered in-screen rather than through `Alert.alert`:
 * Alert is a no-op on React Native Web, so an Alert-gated approve/deny/revoke
 * would silently do nothing in a browser. Approving or revoking access to a
 * medical record is not an action to leave to a dialog that may never appear.
 * (The API side of these actions was recently scoped to the calling patient
 * after an IDOR — they are treated as serious operations on both ends.)
 */

/** A decision already taken — collapsed under History. */
const HISTORY_STATUSES = new Set(['denied', 'expired']);

type PendingAction = { id: string; kind: 'approve' | 'deny' | 'revoke' };
type Notice = { tone: Tone; icon: LucideIcon; body: string };

export default function PrivacyHubScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';

  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirming, setConfirming] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useConsentRequests();
  const approveMutation = useApproveConsent();
  const denyMutation = useDenyConsent();
  const revokeMutation = useRevokeConsent();

  const requests = data ?? [];
  const pending = requests.filter((r) => r.status === 'pending_patient_approval');
  const active = requests.filter((r) => r.status === 'approved' && r.grant_status === 'active');
  const history = requests.filter(
    (r) =>
      HISTORY_STATUSES.has(r.status) || (r.status === 'approved' && r.grant_status !== 'active'),
  );

  /** An active grant whose expiry falls inside the next seven days — the
   * reference's "Expiring Soon" tile, computed from real grant expiries
   * rather than assumed. */
  const expiringSoon = active.filter((r) => {
    if (!r.grant_expires_at) return false;
    const at = new Date(r.grant_expires_at).getTime();
    if (Number.isNaN(at)) return false;
    const days = (at - Date.now()) / 86_400_000;
    return days >= 0 && days <= 7;
  });

  const facilityLabel = (item: ConsentRequestItem) =>
    item.requesting_facility_name ?? t('privacy.unknownFacility');

  const succeed = (body: string) =>
    setNotice({ tone: 'success', icon: CircleCheck, body });
  const fail = (err: unknown) =>
    setNotice({ tone: 'danger', icon: CircleAlert, body: extractApiErrorMessage(err) });

  const runApprove = (item: ConsentRequestItem) => {
    approveMutation.mutate(item.id, {
      onSuccess: () => {
        setConfirming(null);
        succeed(t('privacy.approveSuccessNamed', { facility: facilityLabel(item) }));
      },
      onError: (err) => {
        setConfirming(null);
        fail(err);
      },
    });
  };

  const runDeny = (item: ConsentRequestItem) => {
    denyMutation.mutate(item.id, {
      onSuccess: () => {
        setConfirming(null);
        succeed(t('privacy.denySuccessNamed', { facility: facilityLabel(item) }));
      },
      onError: (err) => {
        setConfirming(null);
        fail(err);
      },
    });
  };

  const runRevoke = (item: ConsentRequestItem) => {
    if (!item.grant_id) return;
    revokeMutation.mutate(item.grant_id, {
      onSuccess: () => {
        setConfirming(null);
        succeed(t('privacy.revokeSuccessNamed', { facility: facilityLabel(item) }));
      },
      onError: (err) => {
        setConfirming(null);
        fail(err);
      },
    });
  };

  const isConfirming = (item: ConsentRequestItem, kind: PendingAction['kind']) =>
    confirming?.id === item.id && confirming.kind === kind;

  const startConfirm = (item: ConsentRequestItem, kind: PendingAction['kind']) => {
    setNotice(null);
    setConfirming({ id: item.id, kind });
  };

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.brand[500]}
          />
        }
      >
        <RightsHeader
          title={t('privacy.title')}
          subtitle={t('privacy.subtitle')}
          icon={ShieldCheck}
        />

        <View className="mt-5">
          <InlineNotice
            tone="brand"
            icon={Scale}
            title={t('privacy.rightsTitle')}
            body={t('privacy.rightsBody')}
          />
        </View>

        {notice ? (
          <View className="mt-3">
            <InlineNotice tone={notice.tone} icon={notice.icon} body={notice.body} />
          </View>
        ) : null}

        {isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={colors.brand[500]} size="large" />
            <Text className="mt-3 text-[13px] text-navy-muted">{t('privacy.loadingConsent')}</Text>
          </View>
        ) : isError ? (
          <View className="mt-8 items-center">
            <CircleAlert size={26} color={colors.semantic.danger} />
            <Text className="mt-3 text-center text-[15px] font-bold text-navy-text">
              {t('privacy.consentErrorTitle')}
            </Text>
            <Text className="mt-1.5 text-center text-[13px] leading-5 text-navy-secondary">
              {t('privacy.consentErrorBody')}
            </Text>
            <Pressable
              onPress={() => refetch()}
              accessibilityRole="button"
              className="mt-5 flex-row items-center rounded-full border border-brand-500 px-5 py-2.5"
            >
              <RefreshCw size={14} color={colors.brand[600]} />
              <Text className="ml-2 text-[13px] font-bold text-brand-600">{t('privacy.retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* ── Overview ────────────────────────────────────────────────
                Mirrors the "Your Consent Overview" tile row of the consent
                reference. Every figure is counted from the consent-request
                list the API returns in full, so no number is an estimate. */}
            <SectionTitle label={t('privacy.overviewTitle')} />
            <View className="rounded-2xl bg-white p-4" style={CARD_SHADOW}>
              <View className="flex-row" style={{ gap: 10 }}>
                <OverviewStat
                  icon={CircleCheck}
                  tone="success"
                  value={active.length}
                  label={t('privacy.statActive')}
                  caption={t('privacy.statActiveCaption')}
                />
                <OverviewStat
                  icon={Clock}
                  tone="info"
                  value={pending.length}
                  label={t('privacy.statPending')}
                  caption={t('privacy.statPendingCaption')}
                />
              </View>
              <View className="mt-2.5 flex-row" style={{ gap: 10 }}>
                <OverviewStat
                  icon={Hourglass}
                  tone="warning"
                  value={expiringSoon.length}
                  label={t('privacy.statExpiring')}
                  caption={t('privacy.statExpiringCaption')}
                />
                <OverviewStat
                  icon={Ban}
                  tone="muted"
                  value={history.length}
                  label={t('privacy.statEnded')}
                  caption={t('privacy.statEndedCaption')}
                />
              </View>
              <View className="mt-3.5 flex-row items-center border-t border-cream-200 pt-3">
                <Lock size={13} color={colors.navy.muted} />
                <Text className="ml-2 flex-1 text-[11px] leading-4 text-navy-secondary">
                  {t('privacy.overviewFootnote')}
                </Text>
              </View>
            </View>

            {/* ── Pending: someone is asking ──────────────────────────────── */}
            <SectionTitle
              label={t('privacy.pendingSection')}
              count={pending.length}
              hint={pending.length > 0 ? t('privacy.pendingHint') : undefined}
            />
            {pending.length === 0 ? (
              <EmptyState
                icon={CircleCheck}
                tone="success"
                title={t('privacy.pendingEmptyTitle')}
                body={t('privacy.pendingEmpty')}
              />
            ) : (
              pending.map((item) => (
                <ConsentCard key={item.id} item={item} locale={locale} highlight>
                  {isConfirming(item, 'approve') ? (
                    <ConfirmBar
                      tone="success"
                      message={t('privacy.confirmApproveBody', {
                        facility: facilityLabel(item),
                        scope: scopeSummary(item, t),
                        purpose: item.purpose,
                        duration: item.duration_minutes,
                      })}
                      cancelLabel={t('privacy.cancel')}
                      confirmLabel={t('privacy.confirmApproveCta')}
                      loading={approveMutation.isPending}
                      onCancel={() => setConfirming(null)}
                      onConfirm={() => runApprove(item)}
                    />
                  ) : isConfirming(item, 'deny') ? (
                    <ConfirmBar
                      tone="danger"
                      message={t('privacy.confirmDenyBody', { facility: facilityLabel(item) })}
                      cancelLabel={t('privacy.cancel')}
                      confirmLabel={t('privacy.confirmDenyCta')}
                      loading={denyMutation.isPending}
                      onCancel={() => setConfirming(null)}
                      onConfirm={() => runDeny(item)}
                    />
                  ) : (
                    <View className="mt-4 flex-row" style={{ gap: 10 }}>
                      <ActionPill
                        label={t('privacy.deny')}
                        icon={XCircle}
                        tone="danger"
                        onPress={() => startConfirm(item, 'deny')}
                      />
                      <ActionPill
                        label={t('privacy.approve')}
                        icon={CheckCircle2}
                        tone="success"
                        onPress={() => startConfirm(item, 'approve')}
                      />
                    </View>
                  )}
                </ConsentCard>
              ))
            )}

            {/* ── Active grants ───────────────────────────────────────────── */}
            <SectionTitle
              label={t('privacy.activeSection')}
              count={active.length}
              hint={active.length > 0 ? t('privacy.activeHint') : undefined}
            />
            {active.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                tone="success"
                title={t('privacy.activeEmptyTitle')}
                body={t('privacy.activeEmpty')}
              />
            ) : (
              active.map((item) => (
                <ConsentCard key={item.id} item={item} locale={locale}>
                  {isConfirming(item, 'revoke') ? (
                    <ConfirmBar
                      tone="danger"
                      message={t('privacy.confirmRevokeBody', { facility: facilityLabel(item) })}
                      cancelLabel={t('privacy.keepAccess')}
                      confirmLabel={t('privacy.confirmRevokeCta')}
                      loading={revokeMutation.isPending}
                      onCancel={() => setConfirming(null)}
                      onConfirm={() => runRevoke(item)}
                    />
                  ) : (
                    <View className="mt-4 flex-row items-center justify-between">
                      <Chip tone="success" icon={CircleCheck} label={t('privacy.status.active')} />
                      <Pressable
                        onPress={() => startConfirm(item, 'revoke')}
                        accessibilityRole="button"
                        className="flex-row items-center rounded-full px-4 py-2"
                        style={{ backgroundColor: colors.semantic.dangerSurface }}
                      >
                        <Ban size={14} color={colors.semantic.danger} />
                        <Text
                          className="ml-1.5 text-[13px] font-bold"
                          style={{ color: colors.semantic.danger }}
                        >
                          {t('privacy.revoke')}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </ConsentCard>
              ))
            )}

            {/* ── History ─────────────────────────────────────────────────── */}
            <Pressable
              onPress={() => setHistoryOpen((v) => !v)}
              accessibilityRole="button"
              className="mt-7 flex-row items-center justify-between rounded-2xl bg-white p-4"
              style={CARD_SHADOW}
            >
              <View className="flex-1 flex-row items-center">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-cream-200">
                  <History size={16} color={colors.navy.secondary} />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-[14px] font-bold text-navy-text">
                    {t('privacy.historySection')}
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-navy-secondary">
                    {history.length > 0
                      ? t('privacy.historyCount', { count: history.length })
                      : t('privacy.historyEmpty')}
                  </Text>
                </View>
              </View>
              {historyOpen ? (
                <ChevronUp size={18} color={colors.navy.muted} />
              ) : (
                <ChevronDown size={18} color={colors.navy.muted} />
              )}
            </Pressable>

            {historyOpen && history.length > 0 ? (
              <View className="mt-3">
                {history.map((item) => (
                  <ConsentCard key={item.id} item={item} locale={locale}>
                    <View className="mt-3">
                      <Chip
                        tone={item.status === 'denied' ? 'danger' : 'muted'}
                        label={t(
                          `privacy.status.${item.status === 'approved' ? 'revoked' : item.status}`,
                          { defaultValue: humanizeSlug(item.status) },
                        )}
                      />
                    </View>
                  </ConsentCard>
                ))}
              </View>
            ) : null}
          </>
        )}

        {/* ── The other two rights ───────────────────────────────────────── */}
        <SectionTitle label={t('privacy.moreRightsSection')} />
        <NavRow
          icon={History}
          title={t('privacy.accessLogsCard')}
          description={t('privacy.accessLogsCardDesc')}
          onPress={() => router.push('/privacy/access-logs')}
        />
        <View className="h-3" />
        <NavRow
          icon={Download}
          title={t('privacy.exportCard')}
          description={t('privacy.exportCardDesc')}
          onPress={() => router.push('/privacy/export')}
        />

        <View className="mt-6">
          <InlineNotice tone="muted" icon={ShieldCheck} body={t('privacy.footerNote')} />
        </View>
      </ScrollView>
    </Screen>
  );
}

/** Comma-joined, translated scope list — used in the approve confirmation so
 * the patient reads exactly what they are handing over. */
function scopeSummary(
  item: ConsentRequestItem,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const scopes = item.requested_scope ?? [];
  if (scopes.length === 0) return t('privacy.scopeUnspecified');
  return scopes
    .map((scope) => t(`privacy.scope.${scope}`, { defaultValue: humanizeSlug(scope) }))
    .join(', ');
}

function ConsentCard({
  item,
  locale,
  highlight,
  children,
}: {
  item: ConsentRequestItem;
  locale: string;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const scopes = item.requested_scope ?? [];

  const expiry = item.grant_expires_at ? new Date(item.grant_expires_at) : null;
  const expiryValid = expiry && !Number.isNaN(expiry.getTime());
  const requested = item.created_at ? new Date(item.created_at) : null;
  const requestedValid = requested && !Number.isNaN(requested.getTime());

  return (
    <View
      className="mb-3 rounded-2xl bg-white p-4"
      style={[
        CARD_SHADOW,
        highlight ? { borderWidth: 1.5, borderColor: colors.brand[300] } : null,
      ]}
    >
      <View className="flex-row items-start">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-100">
          <Building2 size={19} color={colors.brand[600]} />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-[15px] font-extrabold leading-5 text-navy-text" numberOfLines={2}>
            {item.requesting_facility_name ?? t('privacy.unknownFacility')}
          </Text>
          <Text className="mt-0.5 text-[11px] text-navy-muted" numberOfLines={1}>
            {item.requesting_facility_type
              ? t(`privacy.facilityType.${item.requesting_facility_type}`, {
                  defaultValue: humanizeSlug(item.requesting_facility_type),
                })
              : t('privacy.facilityGeneric')}
          </Text>
        </View>
        {requestedValid ? (
          <Text className="text-[10px] text-navy-muted">
            {requested.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
          </Text>
        ) : null}
      </View>

      {/* WHY they want it — the single most important line on the card. */}
      <View className="mt-3 rounded-xl bg-cream-100 p-3">
        <Text className="text-[10px] font-bold uppercase tracking-wide text-navy-muted">
          {t('privacy.purposeLabel')}
        </Text>
        <Text className="mt-1 text-[13px] leading-[18px] text-navy-text">
          {t(`privacy.purpose.${item.purpose}`, { defaultValue: humanizeSlug(item.purpose) })}
        </Text>
      </View>

      {/* WHAT they would see. */}
      <View className="mt-3">
        <View className="flex-row items-center">
          <Layers size={12} color={colors.navy.muted} />
          <Text className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-navy-muted">
            {t('privacy.scopeLabel')}
          </Text>
        </View>
        <View className="mt-2 flex-row flex-wrap" style={{ gap: 6 }}>
          {scopes.length > 0 ? (
            scopes.map((scope) => (
              <Chip
                key={scope}
                tone="muted"
                label={t(`privacy.scope.${scope}`, { defaultValue: humanizeSlug(scope) })}
              />
            ))
          ) : (
            <Text className="text-[12px] text-navy-muted">{t('privacy.scopeUnspecified')}</Text>
          )}
        </View>
      </View>

      {/* HOW LONG. */}
      <View className="mt-3 flex-row items-center">
        {expiryValid ? (
          <>
            <CalendarClock size={13} color={colors.navy.muted} />
            <Text className="ml-1.5 text-[12px] text-navy-secondary">
              {t('privacy.expiresLabel', {
                date: expiry.toLocaleString(locale, {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </Text>
          </>
        ) : (
          <>
            <Clock size={13} color={colors.navy.muted} />
            <Text className="ml-1.5 text-[12px] text-navy-secondary">
              {t('privacy.durationLabel', { count: item.duration_minutes })}
            </Text>
          </>
        )}
      </View>

      {children}
    </View>
  );
}

function OverviewStat({
  icon: Icon,
  tone,
  value,
  label,
  caption,
}: {
  icon: LucideIcon;
  tone: Tone;
  value: number;
  label: string;
  caption: string;
}) {
  const { surface, ink } = toneColors(tone);
  return (
    <View className="flex-1 rounded-xl bg-cream-100 p-3">
      <View
        className="h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: surface }}
      >
        <Icon size={15} color={ink} />
      </View>
      <Text className="mt-2 text-[22px] font-extrabold leading-7" style={{ color: ink }}>
        {value}
      </Text>
      <Text className="text-[12px] font-bold text-navy-text">{label}</Text>
      <Text className="mt-0.5 text-[10px] leading-[14px] text-navy-muted">{caption}</Text>
    </View>
  );
}

function ActionPill({
  label,
  icon: Icon,
  tone,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  tone: Tone;
  onPress: () => void;
}) {
  const { surface, ink } = toneColors(tone);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-1 flex-row items-center justify-center rounded-xl py-3"
      style={{ backgroundColor: surface }}
    >
      <Icon size={15} color={ink} />
      <Text className="ml-1.5 text-[13px] font-bold" style={{ color: ink }}>
        {label}
      </Text>
    </Pressable>
  );
}
