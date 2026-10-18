import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import {
  useCachedEmergencyProfile,
  useDisableOfflineAccess,
  useEnableOfflineAccess,
  useFlushOfflineOutbox,
  useOfflineStatus,
  useSyncOfflineCache,
} from '../lib/api/offlineQueries';
import { useIsOnline } from '../lib/offline/connectivity';
import { formatDateTime, formatSavedAt } from '../lib/offline/relativeTime';
import type { OfflineScope } from '../lib/offline/scopes';
import { isEncryptedAtRest } from '../lib/offline/storage';

/**
 * Offline access — the patient-facing control for the backend's limited
 * encrypted offline mode (App\Modules\Offline\Services\SyncService).
 *
 * The patient opts in, sees exactly what is held on this device and when it
 * was last refreshed, and can erase it. Nothing is stored before they say yes.
 *
 * This screen governs PHI held on the handset, so the re-skin changed the
 * presentation and nothing else: every consent sentence, every warning and
 * every honest limit below is the same string it was before.
 *
 *  1. **Erasing does not revoke the server-side authorisation.** The API has
 *     no revoke route at all — `routes/api.php` exposes only
 *     `POST /mobile/offline/policies` and `POST .../{policy}/queue`. Erasing
 *     wipes this device; the authorisation itself lapses on its own when it
 *     expires. Saying "removes this device's authorisation" would be false.
 *  2. **On web the copy is not encrypted at rest** — `localStorage` offers no
 *     at-rest encryption, and the screen says so.
 *
 * Every confirmation is in-screen, now through the kit `Dialog`. `Alert.alert`
 * is a silent no-op on React Native Web, so a destructive confirm built on it
 * never fires there; the sheet behaves identically on web, iOS and Android,
 * and the opt-in confirm repeats the mode's consent copy before a single byte
 * of the record is written to the device.
 *
 * The kit has no `wifi`, `cloud-off`, `database` or `smartphone` glyph, so the
 * connection chip uses `globe` / `alert-circle`, the record scope uses
 * `folder`, and the device row uses `fingerprint` — which is literally what
 * identifies the device here (`opescare_device_fingerprint`).
 */

const SCOPE_LABEL_KEY: Record<OfflineScope, string> = {
  demographics: 'offline.scopeDemographics',
  appointments: 'offline.scopeAppointments',
  medications: 'offline.scopeMedications',
  allergies: 'offline.scopeAllergies',
  emergency_profile: 'offline.scopeEmergencyProfile',
};

const SCOPE_ICON: Record<OfflineScope, IconName> = {
  demographics: 'person',
  appointments: 'calendar',
  medications: 'pill',
  allergies: 'alert-triangle',
  emergency_profile: 'heart-pulse',
};

const SCOPE_TINT: Record<OfflineScope, Tint> = {
  demographics: 'blue',
  appointments: 'blue',
  medications: 'green',
  allergies: 'amber',
  emergency_profile: 'red',
};

type Mode = 'full' | 'emergency';
type ScreenNotice = { tone: StatusTone; icon: IconName; body: string };

export default function OfflineAccessScreen() {
  usePrivateScreen();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isOnline = useIsOnline();
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const { data: status, isLoading, refetch, isRefetching } = useOfflineStatus();
  const enableMutation = useEnableOfflineAccess();
  const syncMutation = useSyncOfflineCache();
  const disableMutation = useDisableOfflineAccess();
  const flushMutation = useFlushOfflineOutbox();
  // Local read only — what the emergency card on this device actually holds.
  const emergencyProfile = useCachedEmergencyProfile();

  const [mode, setMode] = useState<Mode>('full');
  const [notice, setNotice] = useState<ScreenNotice | null>(null);

  const enabled = status?.enabled ?? false;
  const policy = status?.policy ?? null;
  const grantedScopes = policy?.allowed_scopes ?? [];
  const outbox = status?.outbox ?? [];

  const lastSavedLabel = formatSavedAt(status?.lastCachedAt, t);

  /** Every network action funnels through this so "you need a connection"
   * always lands in the page rather than in an OS dialog that web ignores. */
  const requireConnection = useCallback(() => {
    if (isOnline) return true;
    setNotice({ tone: 'warning', icon: 'alert-circle', body: t('offline.errorNeedsConnection') });
    return false;
  }, [isOnline, t]);

  const handleEnable = useCallback(() => {
    setNotice(null);
    if (!requireConnection()) return;
    enableMutation.mutate(
      { emergencyAccess: mode === 'emergency' },
      {
        onError: () =>
          setNotice({ tone: 'critical', icon: 'alert-circle', body: t('offline.errorEnable') }),
      },
    );
  }, [enableMutation, mode, requireConnection, t]);

  const handleSync = useCallback(() => {
    setNotice(null);
    if (!requireConnection()) return;
    syncMutation.mutate(undefined, {
      onError: () =>
        setNotice({ tone: 'critical', icon: 'alert-circle', body: t('offline.errorSync') }),
    });
  }, [requireConnection, syncMutation, t]);

  const handleFlush = useCallback(() => {
    setNotice(null);
    if (!requireConnection()) return;
    flushMutation.mutate(undefined, {
      onError: () =>
        setNotice({ tone: 'critical', icon: 'alert-circle', body: t('offline.errorSync') }),
    });
  }, [flushMutation, requireConnection, t]);

  const handleErase = useCallback(() => {
    setNotice(null);
    disableMutation.mutate(undefined, {
      onSuccess: () => setNotice({ tone: 'normal', icon: 'check-circle', body: t('offline.erased') }),
      onError: () =>
        setNotice({ tone: 'critical', icon: 'alert-circle', body: t('offline.errorErase') }),
    });
  }, [disableMutation, t]);

  /**
   * The opt-in confirm. The message repeats, verbatim, what this mode will
   * copy onto the device, the retention promise, and — on web — that the copy
   * is not encrypted at rest. Consent is asked before anything is written.
   */
  const confirmEnable = useCallback(() => {
    // Web has no encrypted storage: offline access cannot be enabled in a browser.
    if (!isEncryptedAtRest) {
      setNotice({ tone: 'warning', icon: 'alert-triangle', body: t('offline.webNotice') });
      return;
    }
    const modeBody = mode === 'emergency' ? t('offline.modeEmergencyBody') : t('offline.modeFullBody');
    const parts = [modeBody, t('offline.privacyNote')];
    dialog.confirm({
      title: t('offline.enableCta'),
      message: parts.join('\n\n'),
      confirmLabel: t('offline.enableCta'),
      cancelLabel: t('opesCore.common.cancel'),
      tone: 'warning',
      onConfirm: () => handleEnable(),
    });
  }, [dialog, handleEnable, mode, t]);

  /** The opt-out confirm — the full "this cannot be undone" consent string. */
  const confirmErase = useCallback(() => {
    dialog.confirm({
      title: t('offline.disableConfirmTitle'),
      message: t('offline.disableConfirmBody'),
      confirmLabel: t('offline.disableCta'),
      cancelLabel: t('offline.disableCancel'),
      destructive: true,
      onConfirm: () => handleErase(),
    });
  }, [dialog, handleErase, t]);

  const onToggleOffline = useCallback(
    (next: boolean) => (next ? confirmEnable() : confirmErase()),
    [confirmEnable, confirmErase],
  );

  const scopeRows = (status?.scopes ?? []).filter((scope) => grantedScopes.includes(scope.scope));
  const busy = enableMutation.isPending || disableMutation.isPending;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('offline.title')}
        subtitle={t('offline.subtitle')}
        onBack={() => router.back()}
        right={
          <Chip
            label={isOnline ? t('offline.statusOnline') : t('offline.statusOffline')}
            icon={isOnline ? 'globe' : 'alert-circle'}
            selected={isOnline}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.blue}
            colors={[colors.blue]}
          />
        }
      >
        {notice ? <Notice tone={notice.tone} icon={notice.icon} text={notice.body} /> : null}

        {/* Web storage is not encrypted at rest — offline access is unavailable in a browser. */}
        {!isEncryptedAtRest ? (
          <Notice tone="warning" icon="alert-triangle" text={t('offline.webNotice')} />
        ) : null}

        {isLoading ? (
          <LoadingCard label={t('opesCore.common.loading')} />
        ) : (
          <>
            {/* ── What this is, and whether it is on ───────────────────── */}
            <Card>
              <View style={styles.head}>
                <View style={[styles.circle, { backgroundColor: tintMap.blue.bg }]}>
                  <Icon name="lock" size={20} color={tintMap.blue.fg} />
                </View>
                <View style={styles.headText}>
                  <Text style={styles.headTitle}>
                    {enabled ? t('offline.savedDataTitle') : t('offline.notEnabledTitle')}
                  </Text>
                  <Text style={styles.headBody}>
                    {enabled ? t('offline.privacyNote') : t('offline.notEnabledBody')}
                  </Text>
                </View>
              </View>
              <View style={styles.headBadge}>
                <StatusBadge
                  status={enabled ? 'active' : 'inactive'}
                  tone={enabled ? 'normal' : 'neutral'}
                  label={
                    enabled ? t('records.status.active') : t('records.status.inactive')
                  }
                  icon={enabled ? 'check-circle' : 'lock'}
                  size="sm"
                />
              </View>
            </Card>

            {/* ── The master switch ────────────────────────────────────── */}
            <Card variant="flush">
              <ListRow
                icon="lock"
                tint={enabled ? 'green' : 'amber'}
                title={t('settings.device.offline')}
                subtitle={t('settings.device.offlineBody')}
                chevron={false}
                trailing={
                  busy ? (
                    <ActivityIndicator color={colors.blue} />
                  ) : (
                    <ThemedSwitch
                      value={enabled}
                      onValueChange={onToggleOffline}
                      accessibilityLabel={t('settings.device.offline')}
                    />
                  )
                }
              />
            </Card>

            {!enabled ? (
              /* ── Opt in ────────────────────────────────────────────── */
              <>
                <View>
                  <SectionHeader title={t('offline.chooseMode')} variant="overline" />
                  <Card variant="flush">
                    <ModeRow
                      selected={mode === 'full'}
                      onPress={() => setMode('full')}
                      icon="folder"
                      tint="blue"
                      title={t('offline.modeFull')}
                      body={t('offline.modeFullBody')}
                      divider
                    />
                    <ModeRow
                      selected={mode === 'emergency'}
                      onPress={() => setMode('emergency')}
                      icon="heart-pulse"
                      tint="red"
                      title={t('offline.modeEmergency')}
                      body={t('offline.modeEmergencyBody')}
                    />
                  </Card>
                </View>

                <View style={styles.actionBlock}>
                  <GradientButton
                    label={enableMutation.isPending ? t('offline.enabling') : t('offline.enableCta')}
                    onPress={confirmEnable}
                    loading={enableMutation.isPending}
                    disabled={!isOnline || !isEncryptedAtRest}
                    icon="none"
                  />
                  {!isOnline ? (
                    <Text style={styles.hint}>{t('offline.errorNeedsConnection')}</Text>
                  ) : null}
                </View>
              </>
            ) : (
              /* ── Enabled ───────────────────────────────────────────── */
              <>
                {/* Device authorisation — the server-side policy this device holds */}
                <View>
                  <SectionHeader title={t('offline.policyTitle')} variant="overline" />
                  <Card variant="flush">
                    {policy?.emergency_access ? (
                      <View style={styles.policyBadge}>
                        <StatusBadge
                          status="emergency"
                          tone="critical"
                          label={t('offline.policyEmergencyBadge')}
                          icon="heart-pulse"
                          size="sm"
                        />
                      </View>
                    ) : null}

                    <ListRow
                      icon="fingerprint"
                      tint="blue"
                      title={t('offline.policyDevice')}
                      subtitle={policy?.device_id ?? t('opesCore.common.none')}
                      chevron={false}
                      divider
                    />
                    <ListRow
                      icon="lock"
                      tint={status?.encryptedAtRest ? 'green' : 'amber'}
                      title={t('offline.policyEncryption')}
                      subtitle={
                        status?.encryptedAtRest
                          ? t('offline.policyEncryptionOn')
                          : t('offline.policyEncryptionOff')
                      }
                      chevron={false}
                      divider
                    />
                    <ListRow
                      icon="shield-check"
                      tint={status?.policyUsable ? 'green' : 'red'}
                      title={t('offline.policyExpires')}
                      subtitle={
                        status?.policyUsable
                          ? (formatDateTime(policy?.expires_at, i18n.language) ??
                            t('opesCore.common.none'))
                          : t('offline.policyExpired')
                      }
                      chevron={false}
                    />

                    {policy?.review_required ? (
                      <Text style={styles.policyNote}>{t('offline.policyReviewNote')}</Text>
                    ) : null}
                  </Card>
                </View>

                {/* What is actually on the device right now */}
                <View>
                  <SectionHeader title={t('offline.savedDataTitle')} variant="overline" />
                  <Text style={styles.lastSaved}>
                    {lastSavedLabel
                      ? t('offline.lastSaved', { when: lastSavedLabel })
                      : t('offline.neverSaved')}
                  </Text>

                  {scopeRows.length === 0 ? (
                    <Card variant="flush">
                      <EmptyState
                        icon="folder"
                        tint="blue"
                        title={t('offline.savedDataTitle')}
                        message={t('offline.neverSaved')}
                      />
                    </Card>
                  ) : (
                    <Card variant="flush">
                      {scopeRows.map((scope, index) => {
                        const savedWhen = formatSavedAt(scope.cachedAt, t);
                        const meta: (string | undefined)[] = [
                          savedWhen
                            ? t('offline.lastSaved', { when: savedWhen })
                            : t('offline.scopeEmpty'),
                        ];
                        // The emergency card is the one scope whose *contents*
                        // matter at a glance, so what is actually cached is
                        // named — read from this device, never the network.
                        if (scope.scope === 'emergency_profile' && emergencyProfile.data) {
                          const profile = emergencyProfile.data;
                          if (profile.blood_group) {
                            meta.push(`${t('editProfile.bloodGroup')} ${profile.blood_group}`);
                          }
                          meta.push(
                            `${profile.allergies.length} ${t('profile.allergies')}`,
                            `${profile.conditions.length} ${t('profile.conditions')}`,
                          );
                        }
                        return (
                          <ListRow
                            key={scope.scope}
                            icon={SCOPE_ICON[scope.scope]}
                            tint={SCOPE_TINT[scope.scope]}
                            title={t(SCOPE_LABEL_KEY[scope.scope])}
                            meta={meta}
                            chevron={false}
                            divider={index < scopeRows.length - 1}
                            value={
                              scope.itemCount !== null
                                ? t('offline.itemsSaved', { count: scope.itemCount })
                                : undefined
                            }
                            valueColor={colors.textSecondary}
                          />
                        );
                      })}
                    </Card>
                  )}
                </View>

                <View style={styles.actionBlock}>
                  <GradientButton
                    label={syncMutation.isPending ? t('offline.syncing') : t('offline.syncCta')}
                    onPress={handleSync}
                    loading={syncMutation.isPending}
                    disabled={!isOnline}
                    icon="none"
                  />
                  {!isOnline ? <Text style={styles.hint}>{t('offline.syncOfflineHint')}</Text> : null}
                  {syncMutation.isSuccess && syncMutation.data ? (
                    <Text style={[styles.hint, styles.hintGood]}>
                      {t('offline.syncDone', {
                        done: syncMutation.data.outcomes.filter((outcome) => outcome.ok).length,
                        total: syncMutation.data.outcomes.length,
                      })}
                    </Text>
                  ) : null}
                </View>

                {/* Changes captured while offline, awaiting reconciliation */}
                <View>
                  <SectionHeader title={t('offline.outboxTitle')} variant="overline" />
                  <Card>
                    <Text style={styles.cardBody}>{t('offline.outboxBody')}</Text>

                    {outbox.length === 0 ? (
                      <Text style={styles.outboxEmpty}>{t('offline.outboxEmpty')}</Text>
                    ) : (
                      <>
                        {outbox.map((item) => (
                          <View key={item.id} style={styles.outboxItem}>
                            <Icon name="upload" size={16} color={colors.blue} />
                            <Text style={styles.outboxPath} numberOfLines={1}>
                              {item.method} {item.path}
                            </Text>
                            <Text style={styles.outboxWhen}>{formatSavedAt(item.capturedAt, t)}</Text>
                          </View>
                        ))}
                        <GradientButton
                          label={
                            flushMutation.isPending
                              ? t('offline.outboxSending')
                              : t('offline.outboxSendCta')
                          }
                          onPress={handleFlush}
                          loading={flushMutation.isPending}
                          disabled={!isOnline}
                          icon="none"
                          style={styles.outboxButton}
                        />
                      </>
                    )}

                    {flushMutation.isSuccess && flushMutation.data ? (
                      <Text style={[styles.hint, styles.hintGood, styles.hintLeft]}>
                        {t('offline.outboxSent', { count: flushMutation.data.queued })}
                      </Text>
                    ) : null}
                  </Card>
                </View>

                {/* Retention promise — kept verbatim. */}
                <Notice tone="pending" icon="shield-check" text={t('offline.privacyNote')} />

                {/* Opt out — honest about what it does not do. */}
                <View>
                  <SectionHeader title={t('offline.disableTitle')} variant="overline" />
                  <Text style={styles.cardBodyLoose}>{t('offline.disableBody')}</Text>
                  <TouchableOpacity
                    onPress={confirmErase}
                    disabled={disableMutation.isPending}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t('offline.disableCta')}
                    accessibilityState={{
                      disabled: disableMutation.isPending,
                      busy: disableMutation.isPending,
                    }}
                    style={[styles.danger, disableMutation.isPending && styles.dangerBusy]}
                  >
                    {disableMutation.isPending ? (
                      <ActivityIndicator size="small" color={colors.statusCritical} />
                    ) : (
                      <Icon name="trash" size={18} color={colors.statusCritical} />
                    )}
                    <Text style={styles.dangerText}>
                      {disableMutation.isPending ? t('offline.erasing') : t('offline.disableCta')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** A `Switch` painted with the active palette. */
function ThemedSwitch({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.divider, true: colors.primarySoft }}
      thumbColor={value ? colors.blue : colors.surface}
      ios_backgroundColor={colors.divider}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    />
  );
}

/** One opt-in mode, as a selectable row with a radio in the trailing slot. */
function ModeRow({
  selected,
  onPress,
  icon,
  tint,
  title,
  body,
  divider,
}: {
  selected: boolean;
  onPress: () => void;
  icon: IconName;
  tint: Tint;
  title: string;
  body: string;
  divider?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ListRow
      icon={icon}
      tint={tint}
      title={title}
      subtitle={body}
      onPress={onPress}
      chevron={false}
      divider={divider}
      accessibilityLabel={`${title}. ${body}`}
      trailing={
        <View style={[styles.radio, selected && styles.radioOn]}>
          {selected ? <Icon name="check" size={13} color={colors.textOnBrand} /> : null}
        </View>
      }
    />
  );
}

/** Tinted inline notice: icon + body. */
function Notice({ tone, icon, text }: { tone: StatusTone; icon: IconName; text: string }) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = statusMap[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: skin.bg }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon name={icon} size={18} color={skin.fg} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function LoadingCard({ label }: { label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card>
      <View style={styles.loading} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.blue} />
        <Text style={styles.loadingText}>{label}</Text>
      </View>
    </Card>
  );
}

// ── Styles (colour-dependent, built per palette) ───────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },

    head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
    circle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headText: { flex: 1, minWidth: 0 },
    headTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    headBody: {
      marginTop: 4,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    headBadge: { flexDirection: 'row', marginTop: spacing.md },

    // Policy
    policyBadge: {
      flexDirection: 'row',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    policyNote: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    lastSaved: {
      marginBottom: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    // Choice radio
    radio: {
      width: 22,
      height: 22,
      borderRadius: radii.pill,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: { borderColor: colors.blue, backgroundColor: colors.blue },

    // Actions
    actionBlock: { gap: spacing.sm },
    hint: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    hintGood: { color: colors.statusNormal },
    hintLeft: { textAlign: 'left', marginTop: spacing.sm },

    // Outbox
    cardBody: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    cardBodyLoose: {
      marginBottom: spacing.md,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    outboxEmpty: {
      marginTop: spacing.md,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textMuted,
    },
    outboxItem: {
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    outboxPath: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textPrimary,
    },
    outboxWhen: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    outboxButton: { marginTop: spacing.md },

    // Destructive
    danger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      height: 52,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.statusCritical,
      backgroundColor: colors.surface,
    },
    dangerBusy: { opacity: 0.6 },
    dangerText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.statusCritical,
    },

    // Notices
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      padding: spacing.md - 2,
      borderRadius: radii.md,
    },
    noticeText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },

    // Loading
    loading: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
  });
