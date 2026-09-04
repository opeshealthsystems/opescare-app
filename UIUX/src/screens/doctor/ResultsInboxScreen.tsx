/**
 * Results Inbox — results and clinical notifications awaiting this doctor's
 * acknowledgement.
 *
 * Live on `GET /doctor/results-inbox`, which is the same `app_notifications`
 * feed the desktop results inbox pages over and the same server-side ordering:
 * unacknowledged criticals pinned to the top, then everything newest-first.
 *
 * Nothing on this screen acknowledges anything. Opening a row, scrolling past
 * it or refreshing the list changes no state — acknowledgement is an explicit,
 * confirmed act, and it lives on the detail screen alone.
 */
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { fetchResultsInbox, type InboxFilter, type InboxPage } from '../../api';
import { Card, EmptyState, ScreenHeader, SegmentedTabs } from '../../components';
import { useTranslation } from '../../i18n';
import { colors, spacing } from '../../theme/theme';
import { AsyncBoundary, NoticeBanner, useAsync } from '../care/shared';
import { ResultRow } from './shared';

/** Tab key → the `doctor.inbox.*` key naming it. */
const TAB_LABEL: Record<InboxFilter, string> = {
  unacknowledged: 'doctor.inbox.tabToReview',
  critical: 'doctor.inbox.tabCritical',
  acknowledged: 'doctor.inbox.tabDone',
  all: 'doctor.inbox.tabAll',
};

const TABS: InboxFilter[] = ['unacknowledged', 'critical', 'acknowledged', 'all'];

/**
 * The empty state per filter. Each says what IS true of the filter rather than
 * a single generic "nothing here" — "no critical results" and "nothing
 * acknowledged yet" are different claims and must not be collapsed.
 */
const EMPTY: Record<InboxFilter, { title: string; message: string }> = {
  unacknowledged: { title: 'doctor.inbox.emptyUnackTitle', message: 'doctor.inbox.emptyUnackBody' },
  critical: { title: 'doctor.inbox.emptyCriticalTitle', message: 'doctor.inbox.emptyCriticalBody' },
  acknowledged: { title: 'doctor.inbox.emptyAckedTitle', message: 'doctor.inbox.emptyAckedBody' },
  all: { title: 'doctor.inbox.emptyAllTitle', message: 'doctor.inbox.emptyAllBody' },
};

/**
 * The route's declared `filter` vocabulary, mapped onto the server's. The
 * server's is the one that matters — "unread" here means "not yet
 * acknowledged", which is the state the desktop inbox also pages on.
 */
type RouteParams = { ResultsInbox: { filter?: 'unread' | 'abnormal' | 'all' } | undefined };

const ROUTE_FILTER: Record<'unread' | 'abnormal' | 'all', InboxFilter> = {
  unread: 'unacknowledged',
  abnormal: 'critical',
  all: 'all',
};

export function ResultsInboxScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<RouteParams, 'ResultsInbox'>>();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<InboxFilter>(
    params?.filter ? ROUTE_FILTER[params.filter] : 'unacknowledged'
  );
  const state = useAsync<InboxPage>(() => fetchResultsInbox(filter), [filter]);
  const { reload } = state;

  // Coming back from the detail screen after an acknowledgement must not leave
  // an acknowledged row sitting in "To Review".
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('doctor.inbox.title')} subtitle={t('doctor.inbox.subtitle')} />
      <View style={styles.tabs}>
        <SegmentedTabs
          options={TABS.map((key) => {
            // Counts come from the server's own meta.counts — never a length
            // of whatever page happens to be loaded.
            const n = state.data?.counts[key === 'all' ? 'all' : key];
            const label = t(TAB_LABEL[key]);
            return {
              key,
              label: n === undefined ? label : t('doctor.inbox.tabWithCount', { label, count: n }),
            };
          })}
          value={filter}
          onChange={(k) => setFilter(k as InboxFilter)}
          scrollable
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.loading && state.data !== null}
            onRefresh={reload}
            tintColor={colors.blue}
          />
        }
      >
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('DoctorHome')}
          loadingLabel={t('doctor.inbox.loading')}
          isEmpty={(d) => d.rows.length === 0}
          empty={
            <EmptyState
              icon="check-circle"
              tint="green"
              title={t(EMPTY[filter].title)}
              message={t(EMPTY[filter].message)}
            />
          }
        >
          {(page) => (
            <>
              {page.counts.critical_pending > 0 && filter !== 'acknowledged' && (
                <NoticeBanner
                  icon="alert-triangle"
                  tone="critical"
                  title={t('doctor.inbox.criticalBanner', {
                    count: page.counts.critical_pending,
                  })}
                  message={t('doctor.inbox.criticalBannerBody')}
                />
              )}
              <Card variant="flush">
                {page.rows.map((r) => (
                  <ResultRow
                    key={r.id}
                    result={r}
                    onPress={() => navigation.navigate('ResultDetail', { resultId: r.id })}
                  />
                ))}
              </Card>
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  tabs: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  content: { padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.sm },
});
