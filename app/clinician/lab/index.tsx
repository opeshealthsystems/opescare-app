/**
 * Lab desk — the queue (`/clinician/lab`).
 *
 * THE LAB TECHNICIAN'S ONE JOB: work this facility's lab orders. Six tiles
 * from `GET /mobile/lab/home` (awaiting collection · awaiting results · in
 * progress · resulted today · urgent · requests pending), then the queue
 * itself, segmented by status (ordered · collected · in progress · resulted)
 * with an "urgent only" chip, plus a Requests segment listing the patient
 * test requests submitted to this facility with Approve / Decline (reason).
 *
 * Every list is the SERVER'S list for the token's facility. Nothing here
 * enumerates patients: the one filter that names a patient is `?health_id=`,
 * handed over by the scanner or the lookup, and it narrows the rows already
 * on screen CLIENT-SIDE to that exact Health ID — it never sends a search.
 * The filter is shown as a removable chip so the technician always knows the
 * queue is narrowed.
 *
 * Counts on the tiles are the server's, never a length of whatever segment is
 * loaded. A tile is a shortcut: tapping it opens the matching segment.
 *
 * Deep links: `/clinician/lab?segment=ordered|collected|in_progress|resulted|requests`,
 * `?urgent=1`, `?health_id=CM-…`.
 *
 * Degrades honestly: a 404/405 from a server that does not serve the desk yet
 * renders "not available on this server yet" with a retry; a `role_forbidden`
 * 403 renders the role notice with no retry; anything else names the failure.
 *
 * i18n: `labDesk.*`, EN + FR (added through the shared locale helper).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  ResultList,
  ScreenHeader,
  SectionHeader,
  SegmentedTabs,
  StaleNotice,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type Tint,
} from '@/components/opes-ui';
import { LoadingBlock, NoticeBanner, describeFailure, type Translate } from '@/components/care/shared';
import { RoleGate } from '@/components/doctor/RoleGate';
import {
  LabFailureState,
  LabOrderRow,
  LabTile,
  labRoutes,
  useLabT,
  type LabSegment,
} from '@/components/lab/shared';
import { LabRequestCard } from '@/components/lab/RequestCard';
import {
  isNotServed,
  isRoleForbidden,
  labServerMessage,
  normaliseLabHealthId,
  useApproveLabRequest,
  useDeclineLabRequest,
  useLabHome,
  useLabOrders,
  useLabRequests,
  type LabHomeCounts,
  type LabOrderStatus,
  type LabTestRequest,
} from '@/lib/api/labDeskQueries';

const SEGMENTS: readonly LabSegment[] = ['ordered', 'collected', 'in_progress', 'resulted', 'requests'];

/** Each tile: which count it shows, how it is drawn, and which segment it opens. */
const TILES: readonly {
  key: keyof LabHomeCounts;
  icon: IconName;
  tint: Tint;
  segment: LabSegment;
  urgent?: boolean;
  emphasise?: boolean;
}[] = [
  { key: 'awaiting_collection', icon: 'syringe', tint: 'blue', segment: 'ordered' },
  { key: 'awaiting_results', icon: 'flask', tint: 'amber', segment: 'collected' },
  { key: 'in_progress', icon: 'microscope', tint: 'purple', segment: 'in_progress' },
  { key: 'resulted_today', icon: 'check-circle', tint: 'green', segment: 'resulted' },
  { key: 'urgent', icon: 'alert-triangle', tint: 'red', segment: 'ordered', urgent: true, emphasise: true },
  { key: 'requests_pending', icon: 'clipboard', tint: 'blue', segment: 'requests' },
];

const isSegment = (v: unknown): v is LabSegment =>
  typeof v === 'string' && (SEGMENTS as readonly string[]).includes(v);

/**
 * Role gate — `lab_results`. The desk's reads all sit behind it on the server
 * (`sample_collection` alone may only POST `/collect`, from a scanned order),
 * so a role without it never mounts the queue and never fires a request the
 * server would refuse.
 */
export default function LabDeskScreen() {
  return (
    <RoleGate need={['lab_results']}>
      <LabDeskScreenBody />
    </RoleGate>
  );
}

function LabDeskScreenBody() {
  const { t } = useTranslation();
  const tx = useLabT();
  const tr = useCallback<Translate>((key, p) => String(t(key, p as Record<string, unknown>)), [t]);
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const params = useLocalSearchParams<{ segment?: string; urgent?: string; health_id?: string }>();

  const [segment, setSegment] = useState<LabSegment>(() =>
    isSegment(params.segment) ? params.segment : 'ordered'
  );
  const [urgent, setUrgent] = useState(() => params.urgent === '1' || params.urgent === 'true');

  // ── The patient filter ───────────────────────────────────────────────────
  // Applied once per distinct `health_id` value handed over; removing the chip
  // clears it locally and remembers the value so the still-present route
  // param does not re-apply it on the next render.
  const [patientFilter, setPatientFilter] = useState<string | null>(null);
  const dismissedFor = useRef<string | null>(null);
  useEffect(() => {
    const raw = typeof params.health_id === 'string' ? normaliseLabHealthId(params.health_id) : '';
    if (!raw || dismissedFor.current === raw) return;
    setPatientFilter(raw);
  }, [params.health_id]);

  function removePatientFilter() {
    dismissedFor.current = patientFilter;
    setPatientFilter(null);
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  const home = useLabHome();
  const onOrders = segment !== 'requests';
  const status: LabOrderStatus = onOrders ? segment : 'ordered';
  const orders = useLabOrders(status, urgent, { enabled: onOrders });
  const requests = useLabRequests({ enabled: segment === 'requests' });
  const approve = useApproveLabRequest();
  const decline = useDeclineLabRequest();
  const [decidingId, setDecidingId] = useState<string | null>(null);

  // Stable `refetch` references only — the query objects themselves change on
  // every render, and a focus effect keyed on them would refetch in a loop.
  const refetchHome = home.refetch;
  const refetchOrders = orders.refetch;
  const refetchRequests = requests.refetch;
  const refetchAll = useCallback(() => {
    void refetchHome();
    if (onOrders) void refetchOrders();
    else void refetchRequests();
  }, [refetchHome, refetchOrders, refetchRequests, onOrders]);

  // Coming back from an order after a collect / release must not leave the
  // row in the wrong segment. The first focus is the mount fetch, skipped.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refetchAll();
    }, [refetchAll])
  );

  const counts = home.data?.counts ?? null;
  const facilityName = home.data?.facility?.name?.trim() || null;

  function openTile(tile: (typeof TILES)[number]) {
    setSegment(tile.segment);
    setUrgent(!!tile.urgent);
  }

  // ── Requests: the two decisions ──────────────────────────────────────────
  function askToApprove(request: LabTestRequest) {
    const patient = request.patient?.display_name?.trim() || request.patient?.health_id || tx('row.patientUnknown');
    dialog.confirm({
      title: tx('requests.approveTitle'),
      message: tx('requests.approveBody', { test: request.test_name, patient }),
      confirmLabel: tx('requests.approveCta'),
      tone: 'info',
      onConfirm: async () => {
        setDecidingId(request.id);
        try {
          await approve.mutateAsync(request.id);
          dialog.alert(tx('requests.approvedTitle'), tx('requests.approvedBody', { patient }), 'success');
        } catch (e) {
          dialog.alert(tx('requests.failedTitle'), decisionFailure(tr, e, tx('requests.failedHint')), 'critical');
          void requests.refetch();
        } finally {
          setDecidingId(null);
        }
      },
    });
  }

  async function doDecline(request: LabTestRequest, reason: string) {
    setDecidingId(request.id);
    try {
      await decline.mutateAsync({ id: request.id, reason });
      dialog.alert(tx('requests.declinedTitle'), tx('requests.declinedBody'), 'success');
    } catch (e) {
      dialog.alert(tx('requests.failedTitle'), decisionFailure(tr, e, tx('requests.failedHint')), 'critical');
      void requests.refetch();
    } finally {
      setDecidingId(null);
    }
  }

  // ── Bodies ───────────────────────────────────────────────────────────────
  const list = onOrders ? orders : requests;
  const refreshing = (home.isFetching && !home.isPending) || (list.isFetching && !list.isPending);

  // A refresh that failed while rows are on screen must never pass as fresh.
  const stale =
    list.isError && list.data !== undefined ? (
      <StaleNotice
        message={describeFailure(list.error).message}
        loadedAt={list.dataUpdatedAt ? new Date(list.dataUpdatedAt) : null}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    ) : null;

  // The tiles could not be counted, and the list did not already say the desk
  // is unserved (in which case one notice is enough).
  const listUnserved = list.isError && list.data === undefined && (isNotServed(list.error) || isRoleForbidden(list.error));
  const countsNotice =
    home.isError && home.data === undefined && !listUnserved ? (
      <NoticeBanner icon="alert-circle" tone="warning" message={tx('queue.countsFailed')} />
    ) : null;

  let body: React.ReactNode;
  if (onOrders) {
    if (orders.isPending) {
      body = <LoadingBlock label={tx('queue.loading')} />;
    } else if (orders.isError && orders.data === undefined) {
      body = (
        <LabFailureState
          error={orders.error}
          onRetry={() => void orders.refetch()}
          notServedBody={tx('queue.notServedBody')}
        />
      );
    } else {
      const all = orders.data ?? [];
      const rows = patientFilter
        ? all.filter((o) => normaliseLabHealthId(o.patient?.health_id) === patientFilter)
        : all;
      if (rows.length === 0) {
        body = (
          <EmptyState
            icon={patientFilter ? 'person-search' : urgent ? 'alert-triangle' : 'check-circle'}
            tint={patientFilter ? 'blue' : urgent ? 'amber' : 'green'}
            title={
              patientFilter
                ? tx('queue.emptyForPatient.title', { healthId: patientFilter })
                : urgent
                  ? tx('queue.emptyUrgent.title')
                  : tx(`queue.empty.${status}.title`)
            }
            message={
              patientFilter
                ? tx('queue.emptyForPatient.body')
                : urgent
                  ? tx('queue.emptyUrgent.body')
                  : tx(`queue.empty.${status}.body`)
            }
            actionLabel={patientFilter ? tx('queue.removeFilter') : undefined}
            onAction={patientFilter ? removePatientFilter : undefined}
          />
        );
      } else {
        body = (
          <ResultList>
            {rows.map((o) => (
              <Card key={o.id} variant="flush">
                <LabOrderRow
                  order={o}
                  divider={false}
                  onPress={() => router.push(labRoutes.order(o.id))}
                />
              </Card>
            ))}
          </ResultList>
        );
      }
    }
  } else if (requests.isPending) {
    body = <LoadingBlock label={tx('requests.loading')} />;
  } else if (requests.isError && requests.data === undefined) {
    body = (
      <LabFailureState
        error={requests.error}
        onRetry={() => void requests.refetch()}
        notServedBody={tx('requests.notServedBody')}
      />
    );
  } else {
    const all = requests.data ?? [];
    const rows = patientFilter
      ? all.filter((r) => normaliseLabHealthId(r.patient?.health_id) === patientFilter)
      : all;
    body =
      rows.length === 0 ? (
        <EmptyState
          icon={patientFilter ? 'person-search' : 'clipboard'}
          tint="blue"
          title={
            patientFilter
              ? tx('queue.emptyForPatient.title', { healthId: patientFilter })
              : tx('requests.empty.title')
          }
          message={patientFilter ? tx('queue.emptyForPatient.body') : tx('requests.empty.body')}
          actionLabel={patientFilter ? tx('queue.removeFilter') : undefined}
          onAction={patientFilter ? removePatientFilter : undefined}
        />
      ) : (
        <View style={styles.stack}>
          {rows.map((r) => (
            <LabRequestCard
              key={r.id}
              request={r}
              busy={decidingId === r.id}
              onApprove={() => askToApprove(r)}
              onDecline={(reason) => doDecline(r, reason)}
            />
          ))}
        </View>
      );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('queue.title')}
        subtitle={facilityName ?? tx('queue.subtitle')}
        showBack={false}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.blue} />}
      >
        {countsNotice}

        {/* ── The six tiles ─────────────────────────────────────────────── */}
        <View style={styles.tiles}>
          {TILES.map((tile) => (
            <LabTile
              key={tile.key}
              icon={tile.icon}
              tint={tile.tint}
              count={counts ? counts[tile.key] : null}
              label={tx(`queue.tiles.${tile.key}`)}
              emphasise={tile.emphasise}
              onPress={() => openTile(tile)}
            />
          ))}
        </View>

        {/* ── The patient filter, when one was handed over ──────────────── */}
        {patientFilter && (
          <TouchableOpacity
            onPress={removePatientFilter}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={tx('queue.patientFilter', { healthId: patientFilter })}
            accessibilityHint={tx('queue.patientFilterHint')}
            style={styles.filterChip}
          >
            <Icon name="id-card" size={16} color={colors.blue} />
            <Text style={styles.filterText} numberOfLines={1}>
              {tx('queue.patientFilter', { healthId: patientFilter })}
            </Text>
            <Icon name="close" size={16} color={colors.blue} />
          </TouchableOpacity>
        )}

        {/* ── Segments + urgent chip ────────────────────────────────────── */}
        <SectionHeader title={onOrders ? tx('queue.queueTitle') : tx('requests.title')} />
        <SegmentedTabs
          options={SEGMENTS.map((key) => ({ key, label: tx(`queue.segments.${key}`) }))}
          value={segment}
          onChange={(key) => setSegment(key as LabSegment)}
          scrollable
        />
        {onOrders && (
          <View style={styles.chipRow}>
            <Chip
              label={tx('queue.urgentChip')}
              icon="alert-triangle"
              count={counts?.urgent}
              selected={urgent}
              onPress={() => setUrgent((v) => !v)}
              accessibilityHint={tx('queue.urgentChipHint')}
            />
          </View>
        )}

        {stale}
        {body}
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

/**
 * Failure copy for a request decision. A role refusal says so and offers no
 * retry; a conflict (already decided elsewhere) shows the server's sentence;
 * an unknown outcome says plainly where to check.
 */
function decisionFailure(tr: Translate, e: unknown, checkHint: string): string {
  if (isRoleForbidden(e)) return tr('opesDoctor.roleGate.serverRefusedBody');
  const f = describeFailure(e);
  const outcomeUnknown = f.kind === 'timeout' || f.kind === 'server' || f.kind === 'unknown';
  if (outcomeUnknown) return tr('opesCore.errors.unknownOutcome', { message: f.message, checkHint });
  // A 409 / 422 the server explained (already decided on a workstation, say)
  // is more specific than any classification of ours.
  return labServerMessage(e) ?? f.message;
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    stack: { gap: spacing.sm },
    chipRow: { flexDirection: 'row', gap: spacing.sm, marginTop: -spacing.sm },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.sm,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.blue,
      backgroundColor: colors.primarySoft,
      maxWidth: '100%',
    },
    filterText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.blue,
    },
  });
