import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  CircleAlert,
  CloudOff,
  Database,
  HeartPulse,
  Lock,
  Pill,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  UploadCloud,
  Wifi,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../components/ui/Screen';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { SkeletonCard } from '../components/ui/Skeleton';
import { ConfirmPanel, InlineNotice, ScreenHeader } from '../components/settings/SettingsUi';
import {
  useDisableOfflineAccess,
  useEnableOfflineAccess,
  useFlushOfflineOutbox,
  useOfflineStatus,
  useSyncOfflineCache,
} from '../lib/api/offlineQueries';
import { useIsOnline } from '../lib/offline/connectivity';
import { formatDateTime, formatSavedAt } from '../lib/offline/relativeTime';
import type { OfflineScope } from '../lib/offline/scopes';
import type { ScopeCacheSummary } from '../lib/offline/cache';
import { colors, radii, sizing, spacing, typography } from '../theme/tokens';

/**
 * Offline access — the patient-facing control for the backend's limited
 * encrypted offline mode (App\Modules\Offline\Services\SyncService).
 *
 * The patient opts in, sees exactly what is held on this device and when it
 * was last refreshed, and can erase it. Nothing is stored before they say yes.
 *
 * No reference screen in `Mobile app screens/` covers offline access — the
 * reference set has no equivalent — so this follows the app's established
 * language instead: `ScreenHeader`, overline-labelled groups, `Card` blocks
 * and `InlineNotice` callouts, exactly as Settings and Help use them.
 *
 * Two honest limits are surfaced in the UI rather than hidden:
 *  1. **Erasing does not revoke the server-side authorisation.** The API has
 *     no revoke route at all — `routes/api.php` exposes only
 *     `POST /mobile/offline/policies` and `POST .../{policy}/queue`. Erasing
 *     wipes this device; the authorisation itself lapses on its own when it
 *     expires. Saying "removes this device's authorisation" would be false.
 *  2. **On web the copy is not encrypted at rest** — `localStorage` offers no
 *     at-rest encryption, and the screen says so.
 *
 * Every confirmation is in-screen. `Alert.alert` is a silent no-op on React
 * Native Web, so a destructive confirm built on it never fires there — this
 * screen previously erased behind such a dialog.
 */

const SCOPE_LABEL_KEY: Record<OfflineScope, string> = {
  demographics: 'offline.scopeDemographics',
  appointments: 'offline.scopeAppointments',
  medications: 'offline.scopeMedications',
  allergies: 'offline.scopeAllergies',
  emergency_profile: 'offline.scopeEmergencyProfile',
};

const SCOPE_ICON: Record<OfflineScope, LucideIcon> = {
  demographics: Smartphone,
  appointments: Database,
  medications: Pill,
  allergies: AlertTriangle,
  emergency_profile: HeartPulse,
};

type Mode = 'full' | 'emergency';
type Notice = { tone: 'danger' | 'warning' | 'success'; body: string };

export default function OfflineAccessScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isOnline = useIsOnline();

  const { data: status, isLoading, refetch, isRefetching } = useOfflineStatus();
  const enableMutation = useEnableOfflineAccess();
  const syncMutation = useSyncOfflineCache();
  const disableMutation = useDisableOfflineAccess();
  const flushMutation = useFlushOfflineOutbox();

  const [mode, setMode] = useState<Mode>('full');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmingErase, setConfirmingErase] = useState(false);

  const enabled = status?.enabled ?? false;
  const policy = status?.policy ?? null;
  const grantedScopes = policy?.allowed_scopes ?? [];
  const outbox = status?.outbox ?? [];

  const lastSavedLabel = formatSavedAt(status?.lastCachedAt, t);

  /** Every network action funnels through this so "you need a connection"
   * always lands in the page rather than in an OS dialog that web ignores. */
  const requireConnection = useCallback(() => {
    if (isOnline) return true;
    setNotice({ tone: 'warning', body: t('offline.errorNeedsConnection') });
    return false;
  }, [isOnline, t]);

  const handleEnable = useCallback(() => {
    setNotice(null);
    if (!requireConnection()) return;
    enableMutation.mutate(
      { emergencyAccess: mode === 'emergency' },
      { onError: () => setNotice({ tone: 'danger', body: t('offline.errorEnable') }) },
    );
  }, [enableMutation, mode, requireConnection, t]);

  const handleSync = useCallback(() => {
    setNotice(null);
    if (!requireConnection()) return;
    syncMutation.mutate(undefined, {
      onError: () => setNotice({ tone: 'danger', body: t('offline.errorSync') }),
    });
  }, [requireConnection, syncMutation, t]);

  const handleFlush = useCallback(() => {
    setNotice(null);
    if (!requireConnection()) return;
    flushMutation.mutate(undefined, {
      onError: () => setNotice({ tone: 'danger', body: t('offline.errorSync') }),
    });
  }, [flushMutation, requireConnection, t]);

  const handleErase = useCallback(() => {
    setNotice(null);
    disableMutation.mutate(undefined, {
      onSuccess: () => {
        setConfirmingErase(false);
        setNotice({ tone: 'success', body: t('offline.erased') });
      },
      onError: () => setNotice({ tone: 'danger', body: t('offline.errorErase') }),
    });
  }, [disableMutation, t]);

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing['2xl'], paddingBottom: spacing['4xl'] }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand[500]} />
        }
      >
        <ScreenHeader
          title={t('offline.title')}
          subtitle={t('offline.subtitle')}
          onBack={() => router.back()}
          action={
            <Chip
              label={isOnline ? t('offline.statusOnline') : t('offline.statusOffline')}
              tone={isOnline ? 'success' : 'warning'}
              icon={isOnline ? Wifi : CloudOff}
            />
          }
        />

        {notice ? (
          <View style={{ marginTop: spacing.lg }}>
            <InlineNotice
              tone={notice.tone}
              icon={notice.tone === 'success' ? Check : CircleAlert}
              body={notice.body}
            />
          </View>
        ) : null}

        {status && !status.encryptedAtRest ? (
          <View style={{ marginTop: spacing.lg }}>
            <InlineNotice tone="warning" icon={AlertTriangle} body={t('offline.webNotice')} />
          </View>
        ) : null}

        {isLoading ? (
          <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
            <SkeletonCard rows={2} />
            <SkeletonCard rows={3} />
          </View>
        ) : !enabled ? (
          /* ── Opt in ──────────────────────────────────────────────── */
          <>
            <Card className="mt-6" padding="lg">
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: sizing.tile.md,
                    height: sizing.tile.md,
                    borderRadius: radii.tile,
                    backgroundColor: colors.brand[50],
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloudOff color={colors.brand[600]} size={sizing.icon.lg} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text
                    style={{
                      fontSize: typography.size.lg,
                      lineHeight: typography.lineHeight.lg,
                      fontWeight: typography.weight.bold,
                      color: colors.navy.text,
                    }}
                  >
                    {t('offline.notEnabledTitle')}
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  marginTop: spacing.md,
                  fontSize: typography.size.sm,
                  lineHeight: typography.lineHeight.sm,
                  color: colors.navy.secondary,
                }}
              >
                {t('offline.notEnabledBody')}
              </Text>
            </Card>

            <SectionLabel text={t('offline.chooseMode')} />
            <ModeOption
              selected={mode === 'full'}
              onPress={() => setMode('full')}
              icon={Database}
              title={t('offline.modeFull')}
              body={t('offline.modeFullBody')}
            />
            <View style={{ height: spacing.md }} />
            <ModeOption
              selected={mode === 'emergency'}
              onPress={() => setMode('emergency')}
              icon={HeartPulse}
              title={t('offline.modeEmergency')}
              body={t('offline.modeEmergencyBody')}
            />

            <View style={{ marginTop: spacing.xl }}>
              <Button
                label={enableMutation.isPending ? t('offline.enabling') : t('offline.enableCta')}
                onPress={handleEnable}
                loading={enableMutation.isPending}
                disabled={!isOnline}
                leftIcon={Lock}
                showChevron={false}
              />
            </View>
            {!isOnline ? (
              <Text
                style={{
                  marginTop: spacing.sm,
                  textAlign: 'center',
                  fontSize: typography.size.xs,
                  color: colors.navy.muted,
                }}
              >
                {t('offline.errorNeedsConnection')}
              </Text>
            ) : null}
          </>
        ) : (
          /* ── Enabled ─────────────────────────────────────────────── */
          <>
            {/* Device authorisation — the server-side policy this device holds */}
            <SectionLabel text={t('offline.policyTitle')} />
            <Card padding="lg">
              {policy?.emergency_access ? (
                <View style={{ marginBottom: spacing.md, flexDirection: 'row' }}>
                  <Chip
                    label={t('offline.policyEmergencyBadge')}
                    tone="danger"
                    icon={HeartPulse}
                  />
                </View>
              ) : null}

              <DetailRow icon={Smartphone} label={t('offline.policyDevice')} value={policy?.device_id ?? '—'} />
              <DetailRow
                icon={Lock}
                label={t('offline.policyEncryption')}
                value={
                  status?.encryptedAtRest
                    ? t('offline.policyEncryptionOn')
                    : t('offline.policyEncryptionOff')
                }
              />
              <DetailRow
                icon={ShieldCheck}
                label={t('offline.policyExpires')}
                value={
                  status?.policyUsable
                    ? (formatDateTime(policy?.expires_at, i18n.language) ?? '—')
                    : t('offline.policyExpired')
                }
                danger={!status?.policyUsable}
                isLast={!policy?.review_required}
              />

              {policy?.review_required ? (
                <Text
                  style={{
                    marginTop: spacing.sm,
                    fontSize: typography.size.xs,
                    lineHeight: typography.lineHeight.xs,
                    color: colors.navy.muted,
                  }}
                >
                  {t('offline.policyReviewNote')}
                </Text>
              ) : null}
            </Card>

            {/* What is actually on the device right now */}
            <SectionLabel text={t('offline.savedDataTitle')} />
            <Text
              style={{
                marginTop: -spacing.sm,
                marginBottom: spacing.md,
                fontSize: typography.size.xs,
                color: colors.navy.muted,
              }}
            >
              {lastSavedLabel ? t('offline.lastSaved', { when: lastSavedLabel }) : t('offline.neverSaved')}
            </Text>

            <Card padding="none" style={{ paddingHorizontal: spacing.lg }}>
              {(status?.scopes ?? [])
                .filter((scope) => grantedScopes.includes(scope.scope))
                .map((scope, index, list) => (
                  <ScopeRow
                    key={scope.scope}
                    scope={scope}
                    isLast={index === list.length - 1}
                    t={t}
                  />
                ))}
            </Card>

            <View style={{ marginTop: spacing.lg }}>
              <Button
                label={syncMutation.isPending ? t('offline.syncing') : t('offline.syncCta')}
                onPress={handleSync}
                loading={syncMutation.isPending}
                disabled={!isOnline}
                leftIcon={RefreshCw}
                variant="outline"
                showChevron={false}
              />
            </View>
            {!isOnline ? (
              <Text
                style={{
                  marginTop: spacing.sm,
                  textAlign: 'center',
                  fontSize: typography.size.xs,
                  color: colors.navy.muted,
                }}
              >
                {t('offline.syncOfflineHint')}
              </Text>
            ) : null}
            {syncMutation.isSuccess && syncMutation.data ? (
              <Text
                style={{
                  marginTop: spacing.sm,
                  textAlign: 'center',
                  fontSize: typography.size.xs,
                  color: colors.semantic.success,
                }}
              >
                {t('offline.syncDone', {
                  done: syncMutation.data.outcomes.filter((outcome) => outcome.ok).length,
                  total: syncMutation.data.outcomes.length,
                })}
              </Text>
            ) : null}

            {/* Changes captured while offline, awaiting reconciliation */}
            <SectionLabel text={t('offline.outboxTitle')} />
            <Card padding="lg">
              <Text
                style={{
                  fontSize: typography.size.sm,
                  lineHeight: typography.lineHeight.sm,
                  color: colors.navy.secondary,
                }}
              >
                {t('offline.outboxBody')}
              </Text>

              {outbox.length === 0 ? (
                <Text
                  style={{
                    marginTop: spacing.md,
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.navy.muted,
                  }}
                >
                  {t('offline.outboxEmpty')}
                </Text>
              ) : (
                <>
                  {outbox.map((item) => (
                    <View
                      key={item.id}
                      style={{ marginTop: spacing.md, flexDirection: 'row', alignItems: 'center' }}
                    >
                      <UploadCloud color={colors.brand[600]} size={sizing.icon.sm} />
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          marginLeft: spacing.sm,
                          fontSize: typography.size.xs,
                          color: colors.navy.text,
                        }}
                      >
                        {item.method} {item.path}
                      </Text>
                      <Text style={{ fontSize: typography.size.xs, color: colors.navy.muted }}>
                        {formatSavedAt(item.capturedAt, t)}
                      </Text>
                    </View>
                  ))}
                  <View style={{ marginTop: spacing.lg }}>
                    <Button
                      label={
                        flushMutation.isPending ? t('offline.outboxSending') : t('offline.outboxSendCta')
                      }
                      onPress={handleFlush}
                      loading={flushMutation.isPending}
                      disabled={!isOnline}
                      leftIcon={UploadCloud}
                      variant="outline"
                      showChevron={false}
                    />
                  </View>
                </>
              )}

              {flushMutation.isSuccess && flushMutation.data ? (
                <Text
                  style={{
                    marginTop: spacing.sm,
                    fontSize: typography.size.xs,
                    color: colors.semantic.success,
                  }}
                >
                  {t('offline.outboxSent', { count: flushMutation.data.queued })}
                </Text>
              ) : null}
            </Card>

            <View style={{ marginTop: spacing.lg }}>
              <InlineNotice tone="gold" icon={ShieldCheck} body={t('offline.privacyNote')} />
            </View>

            {/* Opt out — in-screen confirm, and honest about what it does not do */}
            <SectionLabel text={t('offline.disableTitle')} />
            {confirmingErase ? (
              <ConfirmPanel
                icon={Trash2}
                title={t('offline.disableConfirmTitle')}
                body={t('offline.disableConfirmBody')}
                confirmLabel={t('offline.disableCta')}
                cancelLabel={t('offline.disableCancel')}
                onConfirm={handleErase}
                onCancel={() => setConfirmingErase(false)}
                busy={disableMutation.isPending}
              />
            ) : (
              <>
                <Text
                  style={{
                    marginTop: -spacing.sm,
                    marginBottom: spacing.md,
                    fontSize: typography.size.sm,
                    lineHeight: typography.lineHeight.sm,
                    color: colors.navy.secondary,
                  }}
                >
                  {t('offline.disableBody')}
                </Text>
                <Pressable
                  onPress={() => setConfirmingErase(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('offline.disableCta')}
                  style={({ pressed }) => ({
                    height: sizing.control.lg,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radii.card,
                    borderWidth: 1,
                    borderColor: colors.semantic.danger,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Trash2 color={colors.semantic.danger} size={sizing.icon.md} />
                  <Text
                    style={{
                      marginLeft: spacing.sm,
                      fontSize: typography.size.md,
                      fontWeight: typography.weight.semibold,
                      color: colors.semantic.danger,
                    }}
                  >
                    {t('offline.disableCta')}
                  </Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function SectionLabel({ text }: { text: string }) {
  return (
    <Text
      style={{
        marginTop: spacing['3xl'],
        marginBottom: spacing.md,
        fontSize: typography.size.xs,
        lineHeight: typography.lineHeight.xs,
        fontWeight: typography.weight.bold,
        letterSpacing: typography.tracking.overline,
        textTransform: 'uppercase',
        color: colors.brand[600],
      }}
    >
      {text}
    </Text>
  );
}

function ModeOption({
  selected,
  onPress,
  icon: Icon,
  title,
  body,
}: {
  selected: boolean;
  onPress: () => void;
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <Card
      variant={selected ? 'elevated' : 'flat'}
      padding="lg"
      onPress={onPress}
      accessibilityLabel={title}
      style={selected ? { borderColor: colors.brand[500], borderWidth: 1.5 } : undefined}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View
          style={{
            width: sizing.tile.md,
            height: sizing.tile.md,
            borderRadius: radii.tile,
            backgroundColor: selected ? colors.brand[50] : colors.surface.sunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon color={selected ? colors.brand[600] : colors.navy.secondary} size={sizing.icon.lg} />
        </View>

        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text
            style={{
              fontSize: typography.size.md,
              lineHeight: typography.lineHeight.md,
              fontWeight: typography.weight.bold,
              color: colors.navy.text,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 3,
              fontSize: typography.size.sm,
              lineHeight: typography.lineHeight.sm,
              color: colors.navy.secondary,
            }}
          >
            {body}
          </Text>
        </View>

        <View
          style={{
            marginLeft: spacing.sm,
            marginTop: 2,
            width: 22,
            height: 22,
            borderRadius: radii.pill,
            borderWidth: 1.5,
            borderColor: selected ? colors.brand[500] : colors.line.strong,
            backgroundColor: selected ? colors.brand[500] : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? <Check color={colors.white} size={13} /> : null}
        </View>
      </View>
    </Card>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  danger = false,
  isLast = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  danger?: boolean;
  isLast?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingBottom: isLast ? 0 : spacing.md,
        marginBottom: isLast ? 0 : spacing.md,
        borderBottomWidth: isLast ? 0 : sizing.hairline,
        borderBottomColor: colors.line.subtle,
      }}
    >
      <Icon color={colors.navy.muted} size={sizing.icon.sm} style={{ marginTop: 1 }} />
      <Text
        style={{
          marginLeft: spacing.sm,
          width: 118,
          fontSize: typography.size.xs,
          lineHeight: typography.lineHeight.xs,
          color: colors.navy.muted,
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={2}
        style={{
          flex: 1,
          fontSize: typography.size.xs,
          lineHeight: typography.lineHeight.xs,
          fontWeight: typography.weight.semibold,
          color: danger ? colors.semantic.danger : colors.navy.text,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function ScopeRow({
  scope,
  isLast,
  t,
}: {
  scope: ScopeCacheSummary;
  isLast: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const Icon = SCOPE_ICON[scope.scope];
  const savedWhen = formatSavedAt(scope.cachedAt, t);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.md + 2,
        borderBottomWidth: isLast ? 0 : sizing.hairline,
        borderBottomColor: colors.line.subtle,
      }}
    >
      <View
        style={{
          width: sizing.tile.sm,
          height: sizing.tile.sm,
          borderRadius: radii.tile,
          backgroundColor: colors.brand[50],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon color={colors.brand[600]} size={sizing.icon.md} />
      </View>

      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text
          style={{
            fontSize: typography.size.md,
            lineHeight: typography.lineHeight.md,
            fontWeight: typography.weight.semibold,
            color: colors.navy.text,
          }}
        >
          {t(SCOPE_LABEL_KEY[scope.scope])}
        </Text>
        <Text
          style={{
            marginTop: 2,
            fontSize: typography.size.xs,
            lineHeight: typography.lineHeight.xs,
            color: colors.navy.muted,
          }}
        >
          {savedWhen ? t('offline.lastSaved', { when: savedWhen }) : t('offline.scopeEmpty')}
        </Text>
      </View>

      {scope.itemCount !== null ? (
        <Text
          style={{
            marginLeft: spacing.sm,
            fontSize: typography.size.xs,
            fontWeight: typography.weight.semibold,
            color: colors.brand[600],
          }}
        >
          {t('offline.itemsSaved', { count: scope.itemCount })}
        </Text>
      ) : null}
    </View>
  );
}
