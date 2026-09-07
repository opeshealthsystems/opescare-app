/**
 * Doctor — Results Inbox (`/clinician/results`).
 *
 * Port of `UIUX/src/screens/doctor/ResultsInboxScreen.tsx` onto expo-router,
 * the OPES UI kit and this app's doctor foundation.
 *
 * Results and clinical notifications awaiting this doctor's acknowledgement,
 * in the server's own order: unacknowledged criticals pinned to the top, then
 * newest first. Counts on the filter chips come from the server's meta —
 * never a length of whatever page happens to be loaded.
 *
 * The server reads a BOUNDED window (250 lab orders + 250 radiology reports)
 * and reports `meta.truncated` when it bit. When it did, the list and every
 * count on this screen describe that window and not the clinician's record,
 * and the screen SAYS SO — see `truncation` below. Silence there would be the
 * screen making a completeness claim the server never made.
 *
 * NOTHING ON THIS SCREEN ACKNOWLEDGES ANYTHING. Opening a row, scrolling
 * past it or refreshing the list changes no state — acknowledgement is an
 * explicit, confirmed act and lives on the detail screen alone.
 *
 * Deep link: `/clinician/results?filter=unread|abnormal|all`. "unread" means
 * "not yet acknowledged" and "abnormal" means "flagged critical" — the
 * server's vocabulary is the one that matters, and this maps onto it.
 *
 * Backend gap: the finder does not serve `/mobile/doctor/*` yet. A 404 (or any
 * failure with nothing on screen) renders an honest EmptyState with a retry.
 *
 * i18n: `opesDoctor.*` is being migrated; every string carries a
 * `defaultValue` until the keys land. Locale files are not edited here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGate } from '@/components/doctor/RoleGate';
import axios from 'axios';
import {
  Card,
  Chip,
  EmptyState,
  ResultList,
  ScreenHeader,
  StaleNotice,
  spacing,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { LoadingBlock, NoticeBanner, describeFailure, type Translate } from '@/components/care/shared';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import { useResultsInbox, type InboxCounts, type InboxFilter } from '@/lib/api/doctorQueries';
import { ResultRow } from '@/components/doctor/shared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';

const FILTERS: readonly InboxFilter[] = ['unacknowledged', 'critical', 'acknowledged', 'all'];

/** Chip per filter: `opesDoctor.inbox.*` key, its default, and a glyph. */
const FILTER_CHIP: Record<InboxFilter, { key: string; defaultValue: string; icon: IconName }> = {
  unacknowledged: { key: 'inbox.tabToReview', defaultValue: 'To Review', icon: 'clipboard' },
  critical: { key: 'inbox.tabCritical', defaultValue: 'Critical', icon: 'alert-triangle' },
  acknowledged: { key: 'inbox.tabDone', defaultValue: 'Done', icon: 'check-circle' },
  all: { key: 'inbox.tabAll', defaultValue: 'All', icon: 'list' },
};

/**
 * The empty state per filter. Each says what IS true of the filter rather
 * than a generic "nothing here" — "no critical results" and "nothing
 * acknowledged yet" are different claims and must not be collapsed.
 */
const EMPTY: Record<InboxFilter, { title: [string, string]; message: [string, string] }> = {
  unacknowledged: {
    title: ['inbox.emptyUnackTitle', 'Nothing awaiting review'],
    message: ['inbox.emptyUnackBody', 'Every result sent to you has been acknowledged.'],
  },
  critical: {
    title: ['inbox.emptyCriticalTitle', 'No critical results'],
    message: [
      'inbox.emptyCriticalBody',
      'No result sent to you has been flagged critical by the laboratory or radiologist.',
    ],
  },
  acknowledged: {
    title: ['inbox.emptyAckedTitle', 'Nothing acknowledged yet'],
    message: [
      'inbox.emptyAckedBody',
      'Results you acknowledge — here or on a workstation — will be listed here.',
    ],
  },
  all: {
    title: ['inbox.emptyAllTitle', 'No results yet'],
    message: [
      'inbox.emptyAllBody',
      'Results from orders you placed will arrive here once the laboratory releases them.',
    ],
  },
};

/** The route's `filter` vocabulary, mapped onto the server's. */
const ROUTE_FILTER: Record<string, InboxFilter> = {
  unread: 'unacknowledged',
  abnormal: 'critical',
  all: 'all',
};

/**
 * "This server does not serve the clinician surface yet" — as opposed to any
 * other failure.
 *
 * A bare status check is no longer enough now that `/mobile/doctor/*` is
 * served: the inbox answers 404 for a result that is not this clinician's, and
 * telling them "not available on this server yet" when the real answer is
 * "expired session" or "not your result" sends them to the wrong fix. Laravel's
 * unknown-API-route handler is the discriminator — it answers
 * `{"error_code":"ENDPOINT_NOT_FOUND"}`, which no controller in this slice
 * ever returns.
 */
function isNotServed(e: unknown): boolean {
  if (!axios.isAxiosError(e)) return false;
  const status = e.response?.status;
  if (status === 501) return true;
  if (status !== 404) return false;
  const body = e.response?.data as { error_code?: string; message?: string } | undefined;
  return body?.error_code === 'ENDPOINT_NOT_FOUND' || !body?.message;
}

/**
 * Role gate — clinical_chart or lab_results. A role without it never mounts the screen
 * below, so none of its queries run and the server is never asked what it
 * would refuse (`lib/staffCapabilities.ts`, mirror of config/staff_capabilities.php).
 */
export default function ResultsInboxScreen() {
  return (
    <RoleGate need={['clinical_chart', 'lab_results']}>
      <ResultsInboxScreenBody />
    </RoleGate>
  );
}

function ResultsInboxScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ filter?: string }>();

  /** `opesDoctor.<key>` with a readable default until the catalogue lands. */
  const tx = useCallback(
    (key: string, defaultValue: string, p?: Record<string, unknown>) =>
      String(t(`opesDoctor.${key}`, { defaultValue, ...p })),
    [t]
  );
  const tr = useCallback<Translate>(
    (key, p) => String(t(key, p as Record<string, unknown>)),
    [t]
  );

  const [filter, setFilter] = useState<InboxFilter>(
    () => (params.filter ? ROUTE_FILTER[params.filter] : undefined) ?? 'unacknowledged'
  );
  const inbox = useResultsInbox(filter);
  const { refetch } = inbox;

  // The last counts the server gave us, kept across a filter switch so the
  // chips do not blank while the next page loads.
  const [counts, setCounts] = useState<InboxCounts | null>(null);
  useEffect(() => {
    if (inbox.data) setCounts(inbox.data.counts);
  }, [inbox.data]);

  // Coming back from the detail screen after an acknowledgement must not
  // leave an acknowledged row sitting in "To Review". The first focus is the
  // mount fetch itself, so it is skipped.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refetch();
    }, [refetch])
  );

  const rows = inbox.data?.rows ?? [];
  const criticalPending = counts?.critical_pending ?? 0;

  /**
   * TRUE ⇒ this inbox is a SUBSET of the clinician's results.
   *
   * The endpoint assembles rows from a bounded window (250 lab orders + 250
   * radiology reports) and says so on `meta.truncated`; `InboxPage.truncated`
   * carries it here. Read off `inbox.data` rather than kept in state on
   * purpose — unlike the chip counts, a completeness claim must never outlive
   * the page it describes, and it is `false` while loading and on a failure
   * that left nothing on screen, which is exactly right.
   */
  const truncated = inbox.data?.truncated === true;

  // A refresh that failed while rows are on screen must never pass as fresh.
  const stale =
    inbox.isError && inbox.data !== undefined ? (
      <StaleNotice
        message={describeFailure(inbox.error).message}
        loadedAt={inbox.dataUpdatedAt ? new Date(inbox.dataUpdatedAt) : null}
        onRetry={() => void refetch()}
        retrying={inbox.isFetching}
      />
    ) : null;

  /**
   * A quietly short results inbox is the same hazard as a quietly stale one,
   * and worse here than on a chart: the row that fell off the end could be an
   * unacknowledged CRITICAL.
   *
   * Rendered ABOVE `body`, not inside the rows branch, because the branch that
   * needs it most is the EMPTY one — on `filter=critical` a truncated window
   * with no criticals in it renders "No critical results / No result sent to
   * you has been flagged critical", which is a claim about the record that the
   * server never made. It is also placed before the list so the caveat is read
   * before the figures it qualifies: `counts` describes the loaded window, so
   * the critical-pending banner below is a count over that window too.
   *
   * Tone is `warning`, not `critical`, and the glyph is a circle rather than
   * the critical banner's triangle: an incomplete list must not outrank, or be
   * mistaken for, an unacknowledged critical result sitting under it.
   *
   * Only when `truncated` — a completeness warning shown on every load is
   * trained away as noise, and would be worthless on the day it is true.
   */
  const truncation = truncated ? (
    <NoticeBanner
      icon="alert-circle"
      tone="warning"
      title={tx('inbox.truncatedTitle', 'Showing your most recent results')}
      message={`${tx(
        'inbox.truncatedBody',
        'You have more results than this list can load at once. The counts above describe what is loaded, not your whole record — open the results inbox on a workstation to see everything.'
      )}\n\n${tx('inbox.truncatedAction', 'Open on a workstation')}`}
    />
  ) : null;

  let body: React.ReactNode;
  if (inbox.isPending) {
    body = <LoadingBlock label={tx('inbox.loading', 'Loading your inbox…')} />;
  } else if (inbox.isError && inbox.data === undefined) {
    const notServed = isNotServed(inbox.error);
    // An expired clinician session, a withdrawn role and a dead network are
    // three different problems with three different fixes. `describeFailure`
    // already names each one in both languages — the title was being thrown
    // away and replaced with a generic "something went wrong", which tells a
    // clinician nothing about how to reach their results.
    const failure = describeFailure(inbox.error);
    body = (
      <EmptyState
        icon={notServed ? 'flask' : 'alert-circle'}
        tint={notServed ? 'green' : 'red'}
        title={
          notServed
            ? tx('shared.notServedTitle', 'Not available on this server yet')
            : failure.title
        }
        message={
          notServed
            ? tx(
                'shared.notServedResults',
                'Results awaiting your acknowledgement will appear here once the clinician service is enabled for this app.'
              )
            : failure.message
        }
        actionLabel={tr('opesCore.common.retry')}
        onAction={() => void refetch()}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon="check-circle"
        tint="green"
        title={tx(...EMPTY[filter].title)}
        message={tx(...EMPTY[filter].message)}
      />
    );
  } else {
    body = (
      <>
        {criticalPending > 0 && filter !== 'acknowledged' && (
          <NoticeBanner
            icon="alert-triangle"
            tone="critical"
            title={tx(
              'inbox.criticalBanner',
              criticalPending === 1
                ? '1 critical result is not acknowledged'
                : '{{count}} critical results are not acknowledged',
              { count: criticalPending }
            )}
            message={tx(
              'inbox.criticalBannerBody',
              'Critical results are pinned to the top of this list and must each be acknowledged individually.'
            )}
          />
        )}
        <ResultList>
          {rows.map((r) => (
            <Card key={r.id} variant="flush">
              <ResultRow result={r} onPress={() => router.push(doctorRoutes.result(r.id))} />
            </Card>
          ))}
        </ResultList>
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('inbox.title', 'Results Inbox')}
        subtitle={tx('inbox.subtitle', 'Awaiting your acknowledgement')}
      />

      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((key) => (
            <Chip
              key={key}
              label={tx(FILTER_CHIP[key].key, FILTER_CHIP[key].defaultValue)}
              icon={FILTER_CHIP[key].icon}
              count={counts?.[key]}
              selected={filter === key}
              onPress={() => setFilter(key)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={inbox.isFetching && !inbox.isPending}
            onRefresh={() => void refetch()}
            tintColor={colors.blue}
          />
        }
      >
        {stale}
        {truncation}
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    chipsWrap: { paddingBottom: spacing.sm },
    chips: { paddingHorizontal: spacing.md, gap: spacing.sm },
    content: { padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.sm },
  });
