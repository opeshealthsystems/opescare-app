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
} from '../../lib/api/queries';
import {
  useConsentLedger,
  useRevokeConsentGrant,
  type ConsentGrantItem,
  type ConsentGrantState,
} from '../../lib/api/consentLedgerQueries';

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
 *
 * ── Where the "who has access" numbers now come from ───────────────────────
 *
 * They used to be counted off `GET /mobile/consent-requests`: "active" meant a
 * request whose `status` was `approved` and whose `grant_status` was `active`.
 * That reaches a ConsentGrant only by following `consent_requests.grant`, so a
 * grant created WITHOUT an originating request was not merely miscounted — it
 * was invisible. On a record where every grant is request-less, which is the
 * normal case, this screen showed "0 active" and an empty Active section while
 * facilities held live, unexpired access. A privacy screen that answers "who
 * can see my record" with a confident, wrong "nobody" is worse than one that
 * does not answer at all.
 *
 * The counts and both grant lists now come from `GET /mobile/consents` (the
 * consent ledger), which reads the grants themselves. Pending REQUESTS still
 * come from `consent-requests` — that endpoint's actual job, and the one thing
 * a grant list cannot tell you.
 *
 * Two more things the ledger fixes here:
 *
 *  · Expiry. Nothing in the backend sweeps `consent_grants.status`, so a grant
 *    whose clock ran out months ago still reads `status = 'active'`. The
 *    server derives the state from the expiry as well as the column, and this
 *    screen renders what it derived — an ended grant never sits in Active.
 *
 *  · Access that is not consent. A clinician treating you can open your record
 *    with no grant at all. That is never folded into the Active count; it has
 *    its own figure and its own screen (`/privacy/access`), because a patient
 *    who withdraws everything here and still sees their doctor read the chart
 *    has been misled.
 */

type ScreenNotice = { tone: StatusTone; icon: IconName; body: string };
type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** How each derived grant state is dressed. Only `active` looks live. */
const GRANT_SKIN: Record<ConsentGrantState, { tone: StatusTone; icon: IconName; tint: Tint }> = {
  active: { tone: 'normal', icon: 'shield-check', tint: 'green' },
  expired: { tone: 'warning', icon: 'clock', tint: 'amber' },
  revoked: { tone: 'neutral', icon: 'lock', tint: 'purple' },
  ended: { tone: 'neutral', icon: 'x-circle', tint: 'purple' },
};

export default function PrivacyHubScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);

  // Requests awaiting the patient's decision. This endpoint's real job.
  const { data, isLoading, isError, refetch, isRefetching } = useConsentRequests();
  // The grants themselves — who can actually open the record.
  const ledgerQuery = useConsentLedger();
  const approveMutation = useApproveConsent();
  const denyMutation = useDenyConsent();
  const revokeMutation = useRevokeConsentGrant();

  const requests = data ?? [];
  const pending = requests.filter((r) => r.status === 'pending_patient_approval');

  const ledger = ledgerQuery.data;
  const active = ledger?.active ?? [];
  const history = ledger?.history ?? [];
  const relationshipCount = ledger?.meta?.care_relationship_count ?? 0;
  /** Counted by the server from real expiries, not re-derived here. */
  const expiringSoonCount = ledger?.meta?.expiring_soon_count ?? 0;

  const refetchAll = useCallback(() => {
    void refetch();
    void ledgerQuery.refetch();
  }, [ledgerQuery, refetch]);

  const facilityLabel = useCallback(
    (item: ConsentRequestItem) => item.requesting_facility_name ?? t('privacy.unknownFacility'),
    [t],
  );

  const grantFacilityLabel = useCallback(
    (item: ConsentGrantItem) => item.facility?.name ?? t('privacy.unknownFacility'),
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

  /**
   * Withdraw a grant by the id the ledger listed. There is nothing to look up
   * and nothing to derive: `GET /mobile/consents` returns the exact id that
   * `POST /mobile/consents/{id}/revoke` takes.
   */
  const runRevoke = useCallback(
    (item: ConsentGrantItem) =>
      new Promise<void>((resolve) => {
        revokeMutation.mutate(item.id, {
          onSuccess: () => {
            succeed(t('privacy.revokeSuccessNamed', { facility: grantFacilityLabel(item) }));
            // It has moved to History — open it, so the row is seen to move
            // rather than seen to vanish.
            setHistoryOpen(true);
            resolve();
          },
          onError: (err) => {
            fail(err);
            resolve();
          },
        });
      }),
    [fail, grantFacilityLabel, revokeMutation, succeed, t],
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
    (item: ConsentGrantItem) => {
      setNotice(null);
      dialog.confirm({
        title: t('privacy.revoke'),
        message: t('privacy.confirmRevokeBody', { facility: grantFacilityLabel(item) }),
        confirmLabel: t('privacy.confirmRevokeCta'),
        // "Keep access" — the safe way out, in the patient's own words.
        cancelLabel: t('privacy.keepAccess'),
        destructive: true,
        onConfirm: () => runRevoke(item),
      });
    },
    [dialog, grantFacilityLabel, runRevoke, t],
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
            refreshing={isRefetching || ledgerQuery.isRefetching}
            onRefresh={refetchAll}
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

        {isLoading || ledgerQuery.isLoading ? (
          <Card>
            <View style={styles.loading} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.blue} />
              <Text style={styles.loadingText}>{t('privacy.loadingConsent')}</Text>
            </View>
          </Card>
        ) : /* Either half failing means the figures below would be built on a
              partial answer, so neither is shown. "Some of your access" is not
              an answer this screen is allowed to give. */
        isError || ledgerQuery.isError ? (
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('privacy.consentErrorTitle')}
              message={t('privacy.consentErrorBody')}
              actionLabel={t('privacy.retry')}
              onAction={refetchAll}
            />
          </Card>
        ) : (
          <>
            {/* ── Overview ────────────────────────────────────────────────
                Active / expiring / ended are counted by the server off the
                GRANTS (GET /mobile/consents), not off consent requests, so a
                grant with no originating request is no longer missing from
                them. Pending is counted off the requests, which is what a
                pending request is. "Through your care" is separate on purpose:
                it is not consent and cannot be withdrawn, so folding it into
                Active would overstate what withdrawing achieves. */}
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
                  value={expiringSoonCount}
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
                  divider
                />
                <OverviewRow
                  icon="stethoscope"
                  tint="amber"
                  value={relationshipCount}
                  label={t('consentLedger.statOther', { defaultValue: 'Through your care' })}
                  caption={t('consentLedger.statOtherCaption', {
                    defaultValue: 'Access that is not consent, and cannot be withdrawn here',
                  })}
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

            {/* ── Active grants ─────────────────────────────────────────────
                Straight off the ledger, so a grant that never had a consent
                request is here too. The withdraw control sits on the row that
                shows the grant — seeing and withdrawing are one screen — and
                it uses the id the server listed, which is the id revoke takes. */}
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
                    <GrantRow
                      key={item.id}
                      item={item}
                      onWithdraw={() => confirmRevoke(item)}
                      withdrawing={revokeMutation.isPending}
                    />
                  ))}
                </View>
              )}
            </View>

            {/* ── History ─────────────────────────────────────────────────
                Expired and withdrawn grants, kept behind a disclosure and
                never styled like the live ones above. */}
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
                    <GrantRow key={item.id} item={item} />
                  ))}
                </View>
              ) : null}
            </View>

            {/* ── Access that is not consent ──────────────────────────────
                The one thing withdrawing everything above does NOT stop. The
                sentence is the server's own, and it is shown whether or not
                there are any: "nobody else can see it" is a claim, and it has
                to be as visible as a list would be. */}
            {ledger?.meta?.care_relationship_note ? (
              <View>
                <SectionHeader
                  title={t('consentLedger.relationshipsSection', {
                    defaultValue: 'Access through your care',
                  })}
                  variant="overline"
                />
                <Notice tone="pending" icon="info" body={ledger.meta.care_relationship_note} />
                <View style={styles.stackTop}>
                  <Card variant="flush">
                    <ListRow
                      icon="stethoscope"
                      tint="amber"
                      title={t('consentLedger.hubCard', {
                        defaultValue: 'Who can see my record',
                      })}
                      subtitle={t('consentLedger.hubCardDesc', {
                        defaultValue:
                          'Everyone who can open your record right now, and how to stop them',
                      })}
                      value={relationshipCount > 0 ? String(relationshipCount) : undefined}
                      onPress={() => router.push('/privacy/access')}
                    />
                  </Card>
                </View>
              </View>
            ) : null}
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

/**
 * One consent GRANT, from the ledger — as opposed to `ConsentCard` below,
 * which renders a consent REQUEST.
 *
 * A live grant and an ended one are never allowed to look the same: the live
 * one gets the brand hairline, a green shield badge and the withdraw control;
 * an ended one gets a muted surface, a neutral badge, the date it stopped and
 * no control at all. This matters more than it looks, because
 * `consent_grants.status` is never swept — an expired grant is still literally
 * `status = 'active'` in the table, and it is only the server's derived state
 * that keeps it out of the live list.
 *
 * `state_label`, `state_detail` and `revoke.message` all arrive from the
 * server already in the patient's language.
 */
function GrantRow({
  item,
  onWithdraw,
  withdrawing,
}: {
  item: ConsentGrantItem;
  onWithdraw?: () => void;
  withdrawing?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const skin = GRANT_SKIN[item.state] ?? GRANT_SKIN.ended;
  const live = item.state === 'active';
  const canWithdraw = live && item.revoke.available && !!onWithdraw;

  const when = live ? item.expires_at : item.ended_at;
  const whenDate = when ? new Date(when) : null;
  const whenValid = !!whenDate && !Number.isNaN(whenDate.getTime());

  return (
    <Card
      variant="flush"
      style={live ? { borderColor: colors.blue } : styles.endedCard}
    >
      <ListRow
        icon="building"
        tint={live ? 'blue' : 'purple'}
        title={item.facility?.name ?? t('privacy.unknownFacility')}
        meta={[
          item.facility?.type
            ? t(`privacy.facilityType.${item.facility.type}`, {
                defaultValue: formatLabel(item.facility.type),
              })
            : undefined,
          whenValid
            ? live
              ? t('consentLedger.expiresLabel', {
                  date: formatDateTime(whenDate),
                  defaultValue: 'Expires {{date}}',
                })
              : t('consentLedger.endedLabel', {
                  date: formatDateTime(whenDate),
                  defaultValue: 'Ended {{date}}',
                })
            : undefined,
        ]}
        chevron={false}
        trailing={
          <StatusBadge
            status={item.state}
            tone={skin.tone}
            icon={skin.icon}
            label={item.state_label}
            size="sm"
          />
        }
        divider
      />

      <View style={styles.detail}>
        {/* The server's sentence for this exact state. On an expired grant it
            is the line that stops it reading as live. */}
        <Text style={live ? styles.detailValue : styles.detailValueMuted}>{item.state_detail}</Text>

        {/* WHAT they can see. */}
        {item.scope.length > 0 ? (
          <View style={styles.chips}>
            {item.scope.map((scope) => (
              <Chip
                key={scope}
                label={t(`privacy.scope.${scope}`, { defaultValue: formatLabel(scope) })}
              />
            ))}
          </View>
        ) : null}

        {/* ON WHOSE AUTHORITY. `facility_policy` says outright that the patient
            did not approve it — the one line a patient most needs to read. */}
        <Text style={styles.basisText}>{item.basis.detail}</Text>

        {live ? (
          canWithdraw ? (
            <View style={styles.actions}>
              <View style={styles.spacer} />
              <TouchableOpacity
                onPress={onWithdraw}
                disabled={withdrawing}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('privacy.revoke')}
                accessibilityHint={item.revoke.message}
                accessibilityState={{ disabled: !!withdrawing }}
                style={[styles.denyButton, withdrawing && styles.buttonOff]}
              >
                <Icon name="lock" size={18} color={colors.statusCritical} />
                <Text style={styles.denyLabel}>{t('privacy.revoke')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Not a disabled button — a sentence saying why. Most often the
               patient record has no linked sign-in account, so the revoke
               endpoint would answer 401. A button that always fails teaches
               the patient nothing about how to actually stop the access. */
            <View style={styles.blockedBox}>
              <Icon name="info" size={16} color={colors.textMuted} />
              <Text style={styles.blockedText}>{item.revoke.message}</Text>
            </View>
          )
        ) : null}
      </View>
    </Card>
  );
}

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
    // The same sentence, dimmed, on a grant that has ended.
    detailValueMuted: {
      marginTop: spacing.xs,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    basisText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    // An ended grant never wears the live card's surface or its brand hairline.
    endedCard: { backgroundColor: colors.surfaceMuted, borderColor: colors.divider },
    blockedBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radii.sm,
      backgroundColor: colors.page,
    },
    blockedText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
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
