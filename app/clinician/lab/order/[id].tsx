import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
/**
 * Lab desk — one order (`/clinician/lab/order/[id]`).
 *
 * The order as the server holds it — test, urgency, indication, ordering
 * clinician, patient — its position on the ordered → collected → in progress →
 * resulted line, the results entered so far, and the ONE action its state
 * allows:
 *
 *   ordered      → Collect sample        POST /orders/{id}/collect
 *   collected    → Enter results         POST /orders/{id}/results
 *   in_progress  → Enter results · Release
 *   resulted     → nothing; the release is shown with its time
 *
 * Release is the high-stakes act here, and its rules are explicit:
 *
 *  1. IT IS CONFIRMED, IN WORDS THAT SAY WHAT HAPPENS: "Releasing notifies the
 *     patient and the ordering clinician and cannot be undone."
 *  2. IT NEEDS RESULTS. The button is disabled until at least one row exists;
 *     a release of nothing is refused on the phone before the server sees it.
 *  3. A 409 `already_released` IS NOT A FAILURE OF OURS. It means a workstation
 *     got there first; the order is re-read and shown in its released state.
 *  4. NEVER CLAIM SUCCESS WE CANNOT SEE. A write whose outcome is unknown says
 *     so and says where to check.
 *  5. NOTHING IS CLASSIFIED HERE. Flags and ranges are drawn as entered.
 *
 * Roles: the screen mounts for `lab_results` or `sample_collection`. Collect is
 * offered to both (the server admits both on `/collect`); entering and
 * releasing results only to `lab_results`. A `sample_collection`-only role
 * whose GET is refused sees the role notice, not a broken page.
 *
 * i18n: `labDesk.*`, EN + FR (added through the shared locale helper).
 */
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
  formatDateTime,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import {
  CareButton,
  InfoRow,
  LoadingBlock,
  NoticeBanner,
  describeFailure,
  type Translate,
} from '@/components/care/shared';
import { RoleGate } from '@/components/doctor/RoleGate';
import { sexLabel } from '@/components/doctor/chartShared';
import { useStaffCapability } from '@/lib/staffCapabilities';
import { ageFromDateOfBirth } from '@/lib/api/doctorQueries';
import {
  FlagBadge,
  LabCaption,
  LabFailureState,
  LabStatusBadge,
  LabTimeline,
  UrgencyBadge,
  labRoutes,
  statusLabel,
  useLabT,
} from '@/components/lab/shared';
import { ResultsEntryForm } from '@/components/lab/ResultsEntryForm';
import {
  isAlreadyReleased,
  isRoleForbidden,
  labServerMessage,
  labStatusIndex,
  useAddLabResults,
  useCollectSample,
  useLabOrder,
  useReleaseResults,
  type LabOrderDetail,
  type LabResultInput,
  type LabResultRow,
} from '@/lib/api/labDeskQueries';

export default function LabOrderScreen() {
  usePrivateScreen();
  return (
    <RoleGate need={['lab_results', 'sample_collection']}>
      <LabOrderScreenBody />
    </RoleGate>
  );
}

function LabOrderScreenBody() {
  const { t } = useTranslation();
  const tx = useLabT();
  const tr = useCallback<Translate>((key, p) => String(t(key, p as Record<string, unknown>)), [t]);
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === 'string' ? id : '';

  const canResults = useStaffCapability('lab_results');
  const canCollect = useStaffCapability('lab_results', 'sample_collection');

  const detail = useLabOrder(orderId || undefined);
  const collect = useCollectSample();
  const addResults = useAddLabResults();
  const release = useReleaseResults();
  const { refetch } = detail;
  const [entering, setEntering] = useState(false);

  // ── Writes ───────────────────────────────────────────────────────────────

  function patientOf(order: LabOrderDetail): string {
    return order.patient?.display_name?.trim() || order.patient?.health_id || tx('row.patientUnknown');
  }

  function askToCollect(order: LabOrderDetail) {
    dialog.confirm({
      title: tx('order.collectTitle'),
      message: tx('order.collectBody', { test: order.test_name, patient: patientOf(order) }),
      confirmLabel: tx('order.collectCta'),
      tone: 'info',
      onConfirm: async () => {
        try {
          await collect.mutateAsync(order.id);
          void refetch();
          dialog.alert(tx('order.collectedTitle'), tx('order.collectedBody'), 'success');
        } catch (e) {
          dialog.alert(tx('order.collectFailedTitle'), writeFailure(tr, e, tx('order.collectFailedHint')), 'critical');
          void refetch();
        }
      },
    });
  }

  async function saveResults(order: LabOrderDetail, rows: LabResultInput[]) {
    try {
      await addResults.mutateAsync({ id: order.id, results: rows });
      setEntering(false);
      void refetch();
      dialog.alert(tx('order.savedTitle'), tx('order.savedBody', { count: rows.length }), 'success');
    } catch (e) {
      dialog.alert(tx('order.saveFailedTitle'), writeFailure(tr, e, tx('order.saveFailedHint')), 'critical');
      void refetch();
    }
  }

  function askToRelease(order: LabOrderDetail) {
    const count = order.results?.length ?? 0;
    dialog.confirm({
      title: tx('order.releaseTitle'),
      message: tx('order.releaseBody', { count, patient: patientOf(order), test: order.test_name }),
      confirmLabel: tx('order.releaseCta'),
      tone: 'warning',
      destructive: true,
      onConfirm: async () => {
        try {
          await release.mutateAsync(order.id);
          void refetch();
          dialog.alert(tx('order.releasedTitle'), tx('order.releasedBody'), 'success');
        } catch (e) {
          if (isAlreadyReleased(e)) {
            // A workstation got there first. Not our failure: show the server's
            // state (the mutation already invalidated it) and say what happened.
            void refetch();
            dialog.alert(tx('order.alreadyReleasedTitle'), tx('order.alreadyReleasedBody'), 'warning');
            return;
          }
          dialog.alert(tx('order.releaseFailedTitle'), writeFailure(tr, e, tx('order.releaseFailedHint')), 'critical');
          void refetch();
        }
      },
    });
  }

  // ── Bodies ───────────────────────────────────────────────────────────────

  const stale =
    detail.isError && detail.data !== undefined ? (
      <StaleNotice
        message={describeFailure(detail.error).message}
        loadedAt={detail.dataUpdatedAt ? new Date(detail.dataUpdatedAt) : null}
        onRetry={() => void refetch()}
        retrying={detail.isFetching}
      />
    ) : null;

  let body: React.ReactNode;
  if (!orderId) {
    body = (
      <EmptyState
        icon="alert-circle"
        tint="amber"
        title={tx('order.missingTitle')}
        message={tx('order.missingBody')}
        actionLabel={tx('order.backToQueue')}
        onAction={() => router.replace(labRoutes.desk)}
      />
    );
  } else if (detail.isPending) {
    body = <LoadingBlock label={tx('order.loading')} />;
  } else if (detail.isError && detail.data === undefined) {
    body = (
      <LabFailureState
        error={detail.error}
        onRetry={() => void refetch()}
        notServedBody={tx('order.notServedBody')}
      />
    );
  } else if (detail.data) {
    const o = detail.data;
    const results = o.results ?? [];
    const position = labStatusIndex(o.status);
    const offTrack = position < 0;
    const canEnter = canResults && (o.status === 'collected' || o.status === 'in_progress');
    const canRelease = canResults && (o.status === 'collected' || o.status === 'in_progress');
    const years = ageFromDateOfBirth(o.patient?.dob);
    const ageSex = [
      years !== null ? tx('row.years', { count: years }) : null,
      o.patient?.sex ? sexLabel(o.patient.sex) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const busy = collect.isPending || addResults.isPending || release.isPending;

    body = (
      <>
        {/* ── Header: what, how urgent, why, who ──────────────────────── */}
        <Card>
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <Text style={styles.title}>{o.test_name}</Text>
              {!!o.test_code && <Text style={styles.code}>{o.test_code}</Text>}
            </View>
            <View style={styles.badges}>
              <UrgencyBadge urgency={o.urgency} />
              <LabStatusBadge status={o.status} />
            </View>
          </View>

          <Text style={styles.blockLabel}>{tx('order.indication')}</Text>
          <Text style={styles.blockText}>{o.clinical_indication?.trim() || tx('order.noIndication')}</Text>

          <View style={styles.divider} />

          <InfoRow icon="person" tint="blue" label={tx('order.patient')} value={patientOf(o)} divider />
          {!!o.patient?.health_id && (
            <InfoRow icon="id-card" tint="purple" label={tx('order.healthId')} value={o.patient.health_id} divider />
          )}
          {!!ageSex && <InfoRow icon="info" tint="blue" label={tx('order.ageSex')} value={ageSex} divider />}
          <InfoRow
            icon="stethoscope"
            tint="green"
            label={tx('order.orderedBy')}
            value={o.ordered_by_name?.trim() || tx('order.orderedByUnknown')}
            divider
          />
          <InfoRow
            icon="clock"
            tint="amber"
            label={tx('order.orderedAt')}
            value={formatDateTime(o.ordered_at, tx('order.notYet'))}
            divider
          />
          <InfoRow
            icon="syringe"
            tint="amber"
            label={tx('order.collectedAt')}
            value={formatDateTime(o.collected_at, tx('order.notYet'))}
            divider
          />
          <InfoRow
            icon="check-circle"
            tint="green"
            label={tx('order.resultedAt')}
            value={formatDateTime(o.resulted_at, tx('order.notYet'))}
          />
        </Card>

        {!!o.patient?.health_id && (
          <CareButton
            label={tx('order.otherOrders')}
            icon="list"
            iconRight="chevron-right"
            variant="secondary"
            onPress={() => router.push(labRoutes.deskForPatient(o.patient.health_id))}
          />
        )}

        {/* ── Timeline ─────────────────────────────────────────────────── */}
        {offTrack ? (
          <NoticeBanner
            icon="info"
            tone="warning"
            title={tx('order.offTrackTitle', { status: statusLabel(tx, o.status) })}
            message={tx('order.offTrackBody')}
          />
        ) : (
          <Card>
            <LabTimeline status={o.status} />
          </Card>
        )}

        {/* ── Results ──────────────────────────────────────────────────── */}
        <SectionHeader
          title={
            results.length > 0
              ? `${tx('order.resultsTitle')} · ${tx('order.resultsCount', { count: results.length })}`
              : tx('order.resultsTitle')
          }
        />
        <Card variant="flush">
          {results.length === 0 ? (
            <Text style={styles.none}>{tx('order.noResults')}</Text>
          ) : (
            results.map((r, i) => (
              <ResultRowView key={r.id ?? `${r.parameter_name}-${i}`} row={r} divider={i < results.length - 1} styles={styles} />
            ))
          )}
        </Card>
        {results.length > 0 && <LabCaption>{tx('order.resultsCaption')}</LabCaption>}

        {/* ── Actions by state ─────────────────────────────────────────── */}
        {o.status === 'ordered' && canCollect && (
          <>
            <CareButton
              label={tx('order.collect')}
              icon="syringe"
              loading={collect.isPending}
              disabled={busy}
              onPress={() => askToCollect(o)}
            />
            <LabCaption>{tx('order.collectCaption')}</LabCaption>
          </>
        )}

        {canEnter && !entering && (
          <>
            <CareButton
              label={tx('order.enterResults')}
              icon="edit"
              variant={results.length === 0 ? 'primary' : 'secondary'}
              disabled={busy}
              onPress={() => setEntering(true)}
            />
            <LabCaption>{tx('order.enterResultsCaption')}</LabCaption>
          </>
        )}

        {canEnter && entering && (
          <ResultsEntryForm
            referenceRanges={o.reference_ranges ?? []}
            existingParameters={results.map((r) => r.parameter_name)}
            busy={addResults.isPending}
            onSubmit={(rows) => saveResults(o, rows)}
            onCancel={() => setEntering(false)}
          />
        )}

        {canRelease && !entering && (
          <>
            <CareButton
              label={tx('order.release')}
              icon="send"
              variant={results.length === 0 ? 'secondary' : 'primary'}
              loading={release.isPending}
              disabled={busy || results.length === 0}
              onPress={() => askToRelease(o)}
            />
            <LabCaption>
              {results.length === 0 ? tx('order.releaseNeedsResults') : tx('order.releaseCaption')}
            </LabCaption>
          </>
        )}

        {!canResults && (o.status === 'collected' || o.status === 'in_progress') && (
          <NoticeBanner icon="shield" tone="pending" message={tx('order.roleCollectOnly')} />
        )}

        {o.status === 'resulted' && (
          <Card style={styles.releasedCard}>
            <View style={styles.releasedRow}>
              <Icon name="check-circle" size={20} color={colors.statusNormal} />
              <Text style={styles.releasedText}>
                {o.resulted_at
                  ? tx('order.releasedCard', { when: formatDateTime(o.resulted_at, '—') })
                  : tx('order.releasedUnknownWhen')}
              </Text>
            </View>
            <LabCaption>{tx('order.releasedCardBody')}</LabCaption>
          </Card>
        )}
      </>
    );
  } else {
    body = <LoadingBlock label={tx('order.loading')} />;
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={tx('order.title')} align="center" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={detail.isFetching && !detail.isPending}
            onRefresh={() => void refetch()}
            tintColor={colors.blue}
          />
        }
      >
        {stale}
        {body}
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

/**
 * Failure copy for a write. A role refusal says so; a write whose outcome is
 * unknown (timeout, 5xx) says plainly where to check; a refusal the server
 * explained (422) uses its own sentence.
 */
function writeFailure(tr: Translate, e: unknown, checkHint: string): string {
  if (isRoleForbidden(e)) return tr('opesDoctor.roleGate.serverRefusedBody');
  const f = describeFailure(e);
  const outcomeUnknown = f.kind === 'timeout' || f.kind === 'server' || f.kind === 'unknown';
  if (outcomeUnknown) return tr('opesCore.errors.unknownOutcome', { message: f.message, checkHint });
  return labServerMessage(e) ?? f.message;
}

/** One entered analyte: parameter, value + unit, reference range, flag, notes — as recorded. */
function ResultRowView({
  row,
  divider,
  styles,
}: {
  row: LabResultRow;
  divider: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  const tx = useLabT();
  return (
    <View style={[styles.result, divider && styles.resultDivider]}>
      <View style={styles.resultHead}>
        <Text style={styles.resultName}>{row.parameter_name}</Text>
        <FlagBadge flag={row.flag} />
      </View>
      <Text style={styles.resultValue}>
        {row.value ?? '—'}
        {row.unit ? <Text style={styles.resultUnit}>{` ${row.unit}`}</Text> : null}
      </Text>
      <Text style={styles.resultRef}>
        {row.reference_range ? tx('order.reference', { range: row.reference_range }) : tx('order.noReference')}
      </Text>
      {!!row.notes && <Text style={styles.resultNotes}>{row.notes}</Text>}
      {!!row.resulted_at && (
        <Text style={styles.resultRef}>{tx('order.resultedAtRow', { when: formatDateTime(row.resulted_at, '—') })}</Text>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },

    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    titleText: { flex: 1, minWidth: 0 },
    title: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textPrimary,
    },
    code: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    badges: { alignItems: 'flex-end', gap: 4 },
    blockLabel: {
      marginTop: spacing.sm,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textMuted,
      marginBottom: 2,
    },
    blockText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },

    none: {
      padding: spacing.md,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    result: { padding: spacing.md - 2, gap: 2 },
    resultDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    resultHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    resultName: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    resultValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
    },
    resultUnit: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    resultRef: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    resultNotes: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },

    releasedCard: { gap: spacing.sm },
    releasedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    releasedText: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
  });
