import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
  formatDate,
  formatDateTime,
  formatLabel,
  GradientButton,
  Icon,
  ListRow,
  radii,
  ScreenHeader,
  SectionHeader,
  spacing,
  StatusBadge,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
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
 * Presentation is the OPES kit: `ScreenHeader`, overline `SectionHeader`s,
 * `Card variant="flush"` stacks of tint-circle `ListRow`s, `StatusBadge`s,
 * `Chip`s for the requested scopes and `EmptyState`s wherever a list is empty.
 * Colours are the platform's own — the OpesCare brand on the cream page —
 * because the kit's default `opescare` palette *is* the OpesCare brand.
 * Nothing here names a colour; it all reads `useTheme()`.
 *
 * This is a data-rights screen, so the re-skin changed the presentation and
 * nothing else. Every hook, every mutation and every consent sentence below is
 * the one that was here before, verbatim — including the Law No. 2010/012
 * reference, the "nothing is shared until you approve it" promise and the
 * approve/deny/revoke confirmation copy naming the facility, the scope, the
 * purpose and the duration.
 *
 * Confirmations go through the kit `Dialog`, never `Alert.alert`: Alert is a
 * silent no-op on React Native Web, so an Alert-gated approve/deny/revoke
 * would do nothing at all in a browser. Approving or revoking access to a
 * medical record is not an action to leave to a dialog that may never appear.
 * (The API side of these actions was scoped to the calling patient after an
 * IDOR — they are treated as serious operations on both ends.)
 *
 * Glyph substitutions, the kit carrying its own outline set: `Scale` → `book`
 * (the legal-rights notice), `Building2` → `building`, `Hourglass` → `clock`,
 * `Ban` → `x-circle`, `Layers` → `list`, `CircleCheck` → `check-circle`,
 * `CircleAlert` → `alert-circle`.
 */

/** A decision already taken — collapsed under History. */
const HISTORY_STATUSES = new Set(['denied', 'expired']);

type ScreenNotice = { tone: StatusTone; icon: IconName; body: string };
type TFn = (key: string, opts?: Record<string, unknown>) => string;

export default function PrivacyHubScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);

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

  const facilityLabel = useCallback(
    (item: ConsentRequestItem) => item.requesting_facility_name ?? t('privacy.unknownFacility'),
    [t],
  );

  const succeed = useCallback(
    (body: string) => setNotice({ tone: 'normal', icon: 'check-circle', body }),
    [],
  );
  const fail = useCallback(
    (err: unknown) =>
      setNotice({ tone: 'critical', icon: 'alert-circle', body: extractApiErrorMessage(err) }),
    [],
  );

  const runApprove = useCallback(
    (item: ConsentRequestItem) =>
      new Promise<void>((resolve) => {
        approveMutation.mutate(item.id, {
          onSuccess: () => {
            succeed(t('privacy.approveSuccessNamed', { facility: facilityLabel(item) }));
            resolve();
          },
          onError: (err) => {
            fail(err);
            resolve();
          },
        });
      }),
    [approveMutation, facilityLabel, fail, succeed, t],
  );

  const runDeny = useCallback(
    (item: ConsentRequestItem) =>
      new Promise<void>((resolve) => {
        denyMutation.mutate(item.id, {
          onSuccess: () => {
            succeed(t('privacy.denySuccessNamed', { facility: facilityLabel(item) }));
            resolve();
          },
          onError: (err) => {
            fail(err);
            resolve();
          },
        });
      }),
    [denyMutation, facilityLabel, fail, succeed, t],
  );

  const runRevoke = useCallback(
    (item: ConsentRequestItem) =>
      new Promise<void>((resolve) => {
        if (!item.grant_id) {
          resolve();
          return;
        }
        revokeMutation.mutate(item.grant_id, {
          onSuccess: () => {
            succeed(t('privacy.revokeSuccessNamed', { facility: facilityLabel(item) }));
            resolve();
          },
          onError: (err) => {
            fail(err);
            resolve();
          },
        });
      }),
    [facilityLabel, fail, revokeMutation, succeed, t],
  );

  /**
   * The approve confirmation repeats, verbatim, exactly what is being handed
   * over: the facility, the data scope, the stated purpose and how long the
   * access lasts. Consent is asked before a single record is opened.
   */
  const confirmApprove = useCallback(
    (item: ConsentRequestItem) => {
      setNotice(null);
      dialog.confirm({
        title: t('privacy.approve'),
        message: t('privacy.confirmApproveBody', {
          facility: facilityLabel(item),
          scope: scopeSummary(item, t as TFn),
          purpose: item.purpose,
          duration: item.duration_minutes,
        }),
        confirmLabel: t('privacy.confirmApproveCta'),
        cancelLabel: t('privacy.cancel'),
        tone: 'warning',
        onConfirm: () => runApprove(item),
      });
    },
    [dialog, facilityLabel, runApprove, t],
  );

  const confirmDeny = useCallback(
    (item: ConsentRequestItem) => {
      setNotice(null);
      dialog.confirm({
        title: t('privacy.deny'),
        message: t('privacy.confirmDenyBody', { facility: facilityLabel(item) }),
        confirmLabel: t('privacy.confirmDenyCta'),
        cancelLabel: t('privacy.cancel'),
        destructive: true,
        onConfirm: () => runDeny(item),
      });
    },
    [dialog, facilityLabel, runDeny, t],
  );

  const confirmRevoke = useCallback(
    (item: ConsentRequestItem) => {
      setNotice(null);
      dialog.confirm({
        title: t('privacy.revoke'),
        message: t('privacy.confirmRevokeBody', { facility: facilityLabel(item) }),
        confirmLabel: t('privacy.confirmRevokeCta'),
        // "Keep access" — the safe way out, in the patient's own words.
        cancelLabel: t('privacy.keepAccess'),
        destructive: true,
        onConfirm: () => runRevoke(item),
      });
    },
    [dialog, facilityLabel, runRevoke, t],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('privacy.title')}
        subtitle={t('privacy.subtitle')}
        onBack={() => router.back()}
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
        {/* The law, named. Kept verbatim — this is the whole basis of the screen. */}
        <Notice
          tone="pending"
          icon="book"
          title={t('privacy.rightsTitle')}
          body={t('privacy.rightsBody')}
        />

        {notice ? <Notice tone={notice.tone} icon={notice.icon} body={notice.body} /> : null}

        {isLoading ? (
          <Card>
            <View style={styles.loading} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.blue} />
              <Text style={styles.loadingText}>{t('privacy.loadingConsent')}</Text>
            </View>
          </Card>
        ) : isError ? (
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('privacy.consentErrorTitle')}
              message={t('privacy.consentErrorBody')}
              actionLabel={t('privacy.retry')}
              onAction={() => refetch()}
            />
          </Card>
        ) : (
          <>
            {/* ── Overview ────────────────────────────────────────────────
                Every figure is counted from the consent-request list the API
                returns in full, so no number here is an estimate. */}
            <View>
              <SectionHeader title={t('privacy.overviewTitle')} variant="overline" />
              <Card variant="flush">
                <OverviewRow
                  icon="check-circle"
                  tint="green"
                  value={active.length}
                  label={t('privacy.statActive')}
                  caption={t('privacy.statActiveCaption')}
                  divider
                />
                <OverviewRow
                  icon="clock"
                  tint="blue"
                  value={pending.length}
                  label={t('privacy.statPending')}
                  caption={t('privacy.statPendingCaption')}
                  divider
                />
                <OverviewRow
                  icon="clock"
                  tint="amber"
                  value={expiringSoon.length}
                  label={t('privacy.statExpiring')}
                  caption={t('privacy.statExpiringCaption')}
                  divider
                />
                <OverviewRow
                  icon="x-circle"
                  tint="purple"
                  value={history.length}
                  label={t('privacy.statEnded')}
                  caption={t('privacy.statEndedCaption')}
                />
                <View style={styles.cardFootnote}>
                  <Icon name="lock" size={16} color={colors.textMuted} />
                  <Text style={styles.cardFootnoteText}>{t('privacy.overviewFootnote')}</Text>
                </View>
              </Card>
            </View>

            {/* ── Pending: someone is asking ──────────────────────────────── */}
            <View>
              <SectionHeader title={t('privacy.pendingSection')} variant="overline" />
              {pending.length > 0 ? (
                <Text style={styles.sectionHint}>{t('privacy.pendingHint')}</Text>
              ) : null}

              {pending.length === 0 ? (
                <Card variant="flush">
                  <EmptyState
                    icon="check-circle"
                    tint="green"
                    title={t('privacy.pendingEmptyTitle')}
                    message={t('privacy.pendingEmpty')}
                  />
                </Card>
              ) : (
                <View style={styles.stack}>
                  {pending.map((item) => (
                    <ConsentCard key={item.id} item={item} highlight>
                      <View style={styles.actions}>
                        <TouchableOpacity
                          onPress={() => confirmDeny(item)}
                          disabled={denyMutation.isPending}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={t('privacy.deny')}
                          accessibilityState={{ disabled: denyMutation.isPending }}
                          style={[styles.denyButton, denyMutation.isPending && styles.buttonOff]}
                        >
                          <Icon name="x-circle" size={18} color={colors.statusCritical} />
                          <Text style={styles.denyLabel}>{t('privacy.deny')}</Text>
                        </TouchableOpacity>
                        <GradientButton
                          label={t('privacy.approve')}
                          onPress={() => confirmApprove(item)}
                          loading={approveMutation.isPending}
                          icon="none"
                          style={styles.approveButton}
                          accessibilityHint={t('privacy.pendingHint')}
                        />
                      </View>
                    </ConsentCard>
                  ))}
                </View>
              )}
            </View>

            {/* ── Active grants ───────────────────────────────────────────── */}
            <View>
              <SectionHeader title={t('privacy.activeSection')} variant="overline" />
              {active.length > 0 ? (
                <Text style={styles.sectionHint}>{t('privacy.activeHint')}</Text>
              ) : null}

              {active.length === 0 ? (
                <Card variant="flush">
                  <EmptyState
                    icon="shield-check"
                    tint="green"
                    title={t('privacy.activeEmptyTitle')}
                    message={t('privacy.activeEmpty')}
                  />
                </Card>
              ) : (
                <View style={styles.stack}>
                  {active.map((item) => (
                    <ConsentCard key={item.id} item={item}>
                      <View style={styles.actions}>
                        <StatusBadge
                          status="active"
                          tone="normal"
                          label={t('privacy.status.active')}
                          icon="check-circle"
                          size="sm"
                        />
                        <View style={styles.spacer} />
                        <TouchableOpacity
                          onPress={() => confirmRevoke(item)}
                          disabled={revokeMutation.isPending}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={t('privacy.revoke')}
                          accessibilityHint={t('privacy.activeHint')}
                          accessibilityState={{ disabled: revokeMutation.isPending }}
                          style={[styles.denyButton, revokeMutation.isPending && styles.buttonOff]}
                        >
                          <Icon name="lock" size={18} color={colors.statusCritical} />
                          <Text style={styles.denyLabel}>{t('privacy.revoke')}</Text>
                        </TouchableOpacity>
                      </View>
                    </ConsentCard>
                  ))}
                </View>
              )}
            </View>

            {/* ── History ─────────────────────────────────────────────────── */}
            <View>
              <Card variant="flush">
                <ListRow
                  icon="history"
                  tint="purple"
                  title={t('privacy.historySection')}
                  subtitle={
                    history.length > 0
                      ? t('privacy.historyCount', { count: history.length })
                      : t('privacy.historyEmpty')
                  }
                  onPress={() => setHistoryOpen((v) => !v)}
                  chevron={false}
                  trailing={
                    <Icon
                      name={historyOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.textMuted}
                    />
                  }
                />
              </Card>

              {historyOpen && history.length > 0 ? (
                <View style={[styles.stack, styles.stackTop]}>
                  {history.map((item) => (
                    <ConsentCard key={item.id} item={item}>
                      <View style={styles.actions}>
                        <StatusBadge
                          status={item.status === 'approved' ? 'revoked' : item.status}
                          tone={item.status === 'denied' ? 'critical' : 'neutral'}
                          label={t(
                            `privacy.status.${item.status === 'approved' ? 'revoked' : item.status}`,
                            { defaultValue: formatLabel(item.status) },
                          )}
                          size="sm"
                        />
                      </View>
                    </ConsentCard>
                  ))}
                </View>
              ) : null}
            </View>
          </>
        )}

        {/* ── The other two rights ───────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('privacy.moreRightsSection')} variant="overline" />
          <Card variant="flush">
            <ListRow
              icon="history"
              tint="blue"
              title={t('privacy.accessLogsCard')}
              subtitle={t('privacy.accessLogsCardDesc')}
              onPress={() => router.push('/privacy/access-logs')}
              divider
            />
            <ListRow
              icon="download"
              tint="purple"
              title={t('privacy.exportCard')}
              subtitle={t('privacy.exportCardDesc')}
              onPress={() => router.push('/privacy/export')}
            />
          </Card>
        </View>

        {/* Kept verbatim: what approving does NOT give away. */}
        <Notice tone="neutral" icon="shield-check" body={t('privacy.footerNote')} />
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** Comma-joined, translated scope list — used in the approve confirmation so
 * the patient reads exactly what they are handing over. */
function scopeSummary(item: ConsentRequestItem, t: TFn): string {
  const scopes = item.requested_scope ?? [];
  if (scopes.length === 0) return t('privacy.scopeUnspecified');
  return scopes
    .map((scope) => t(`privacy.scope.${scope}`, { defaultValue: formatLabel(scope) }))
    .join(', ');
}

/**
 * One consent request: who is asking, why, what they would see, for how long —
 * then whatever action belongs to its state. A pending request carries the
 * brand accent bar so the one thing waiting on the patient is the one thing
 * that stands out.
 */
function ConsentCard({
  item,
  highlight,
  children,
}: {
  item: ConsentRequestItem;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scopes = item.requested_scope ?? [];

  const expiry = item.grant_expires_at ? new Date(item.grant_expires_at) : null;
  const expiryValid = !!expiry && !Number.isNaN(expiry.getTime());
  const requested = item.created_at ? new Date(item.created_at) : null;
  const requestedValid = !!requested && !Number.isNaN(requested.getTime());

  const facilityType = item.requesting_facility_type
    ? t(`privacy.facilityType.${item.requesting_facility_type}`, {
        defaultValue: formatLabel(item.requesting_facility_type),
      })
    : t('privacy.facilityGeneric');

  return (
    // The highlight is a brand-coloured hairline, not the kit's left accent
    // bar: `accentColor` adds a 20px left inset, which on a flush card would
    // shove every row's tint circle out of line with the dividers under it.
    <Card variant="flush" style={highlight ? { borderColor: colors.blue } : undefined}>
      <ListRow
        icon="building"
        tint="blue"
        title={item.requesting_facility_name ?? t('privacy.unknownFacility')}
        meta={[facilityType, requestedValid ? formatDate(requested) : undefined]}
        chevron={false}
        divider
      />

      <View style={styles.detail}>
        {/* WHY they want it — the single most important line on the card. */}
        <View>
          <Text style={styles.detailLabel}>{t('privacy.purposeLabel')}</Text>
          <Text style={styles.detailValue}>
            {t(`privacy.purpose.${item.purpose}`, { defaultValue: formatLabel(item.purpose) })}
          </Text>
        </View>

        {/* WHAT they would see. */}
        <View>
          <View style={styles.detailLabelRow}>
            <Icon name="list" size={14} color={colors.textMuted} />
            <Text style={styles.detailLabel}>{t('privacy.scopeLabel')}</Text>
          </View>
          {scopes.length > 0 ? (
            <View style={styles.chips}>
              {scopes.map((scope) => (
                <Chip
                  key={scope}
                  label={t(`privacy.scope.${scope}`, { defaultValue: formatLabel(scope) })}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.detailValue}>{t('privacy.scopeUnspecified')}</Text>
          )}
        </View>

        {/* HOW LONG. */}
        <View style={styles.detailLabelRow}>
          <Icon name={expiryValid ? 'calendar' : 'clock'} size={14} color={colors.textMuted} />
          <Text style={styles.durationText}>
            {expiryValid
              ? t('privacy.expiresLabel', { date: formatDateTime(expiry) })
              : t('privacy.durationLabel', { count: item.duration_minutes })}
          </Text>
        </View>

        {children}
      </View>
    </Card>
  );
}

/** One overview figure, as a row: tint circle, label, caption, count. */
function OverviewRow({
  icon,
  tint,
  value,
  label,
  caption,
  divider,
}: {
  icon: IconName;
  tint: Tint;
  value: number;
  label: string;
  caption: string;
  divider?: boolean;
}) {
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ListRow
      icon={icon}
      tint={tint}
      title={label}
      subtitle={caption}
      chevron={false}
      divider={divider}
      accessibilityLabel={`${value} ${label}. ${caption}`}
      trailing={
        <Text style={[styles.statValue, { color: tintMap[tint].fg }]}>{String(value)}</Text>
      }
    />
  );
}

/** Tinted inline notice: icon in a status circle, optional title, body. */
function Notice({
  tone,
  icon,
  title,
  body,
}: {
  tone: StatusTone;
  icon: IconName;
  title?: string;
  body: string;
}) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = statusMap[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: skin.bg }]}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.noticeIcon, { backgroundColor: colors.surface }]}>
        <Icon name={icon} size={20} color={skin.fg} />
      </View>
      <View style={styles.noticeBody}>
        {title ? <Text style={[styles.noticeTitle, { color: skin.fg }]}>{title}</Text> : null}
        <Text style={styles.noticeText}>{body}</Text>
      </View>
    </View>
  );
}

// ── Styles (colour-dependent, built per palette) ───────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },

    stack: { gap: spacing.sm + 4 },
    stackTop: { marginTop: spacing.sm + 4 },
    spacer: { flex: 1 },

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

    sectionHint: {
      marginBottom: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    // Overview
    statValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
    },
    cardFootnote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    cardFootnoteText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    // Consent card body
    detail: { padding: spacing.md, gap: spacing.sm + 4 },
    detailLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
    detailLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    detailValue: {
      marginTop: spacing.xs,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    durationText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    chips: { marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

    // Actions
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      marginTop: spacing.xs,
    },
    approveButton: { flex: 1 },
    denyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: 50,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.statusCriticalBg,
      backgroundColor: colors.statusCriticalBg,
    },
    buttonOff: { opacity: 0.5 },
    denyLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.statusCritical,
    },

    // Inline notice
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      padding: spacing.md,
      borderRadius: radii.md,
    },
    noticeIcon: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noticeBody: { flex: 1, minWidth: 0, gap: 2 },
    noticeTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
    noticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
  });
