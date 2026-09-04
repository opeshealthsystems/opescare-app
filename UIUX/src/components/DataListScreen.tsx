import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { NotLinkedError } from '../api/clinical';
import { EmptyState } from './EmptyState';
import { StaleNotice } from './StaleNotice';
import { readCache, writeCache } from '../lib/offlineCache';
import { useTranslation } from '../i18n';
import { colors, radii, spacing, typography } from '../theme/theme';

type Props<T> = {
  title: string;
  emptyLabel: string;
  fetcher: () => Promise<{ data: T[] }>;
  renderItem: (item: T) => React.ReactNode;
  keyExtractor: (item: T) => string;
  /**
   * Enables offline instant-render. On a successful load the list is written to
   * `lib/offlineCache` under this key; a cold, no-signal open then shows the
   * last saved copy under a StaleNotice instead of a bare "could not load".
   * Same contract as `useAsync`'s cacheKey — cached clinical data is never
   * presented as live. Omit it for lists whose staleness is a hazard.
   */
  cacheKey?: string;
  /** How old a cached copy may be before it is discarded rather than shown. */
  cacheMaxAgeMs?: number;
};

/**
 * Shared list-screen behavior for every patient-portal clinical data
 * category (appointments, encounters, prescriptions, vitals, diagnoses,
 * immunizations, invoices, documents): loading, pull-to-refresh, empty
 * state, the "account not linked yet" state they all share, and — when a
 * cacheKey is given — offline last-known render.
 */
export function DataListScreen<T>({
  title,
  emptyLabel,
  fetcher,
  renderItem,
  keyExtractor,
  cacheKey,
  cacheMaxAgeMs,
}: Props<T>) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notLinked, setNotLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  // True while the list on screen is the offline copy, not this session's fetch.
  const [fromCache, setFromCache] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    setNotLinked(false);
    try {
      const res = await fetcher();
      setItems(res.data);
      setLoadedAt(new Date());
      setFromCache(false);
      if (cacheKey) void writeCache(cacheKey, res.data);
    } catch (e) {
      if (e instanceof NotLinkedError) {
        setNotLinked(true);
      } else {
        setError(t('components.listLoadFailed'));
        // Cold open with no signal and a copy on disk: show it under the
        // StaleNotice rather than an error. Only on the first load — a failed
        // refresh keeps whatever is already on screen.
        if (cacheKey && !isRefresh) {
          const hit = await readCache<T[]>(cacheKey, cacheMaxAgeMs);
          if (hit) {
            setItems(hit.data);
            setLoadedAt(hit.capturedAt);
            setFromCache(true);
          }
        }
      }
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, [fetcher, t, cacheKey, cacheMaxAgeMs]);

  useEffect(() => {
    load();
  }, [load]);

  // "Still loading" cue once a load outlasts the ordinary case (report 39, F3),
  // so a long-but-healthy request on a weak signal does not read as a hang.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) { setSlow(false); return; }
    const id = setTimeout(() => setSlow(true), 8_000);
    return () => clearTimeout(id);
  }, [loading]);

  if (loading) {
    return (
      // A spinner is invisible to a screen reader: with no label and no live
      // region this branch is a completely silent screen, and the patient has
      // no way to tell "still loading" from "nothing here".
      <View
        style={styles.center}
        accessibilityLiveRegion="polite"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('common.loading')}
      >
        <ActivityIndicator size="large" color={colors.blue} />
        {slow && <Text style={styles.slowHint}>{t('components.slowHint')}</Text>}
      </View>
    );
  }

  if (notLinked) {
    // P8: this used to be a card with no button on it — it named the problem
    // and offered nothing to do about it. The enrolment flow is the way out.
    return (
      <View style={styles.center}>
        <EmptyState
          icon="id-card"
          tint="amber"
          title={t('enrol.gate.title')}
          message={t('enrol.gate.messageWith', { what: title.toLowerCase() })}
          actionLabel={t('enrol.gate.action')}
          onAction={() => navigation.navigate('AccountSetup')}
        />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={keyExtractor}
      contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.blue} />}
      renderItem={({ item }) => <>{renderItem(item)}</>}
      ListHeaderComponent={
        // Only when the offline copy is what is on screen. A live load — even an
        // empty one — shows no strip.
        fromCache && items.length > 0 ? (
          <View style={styles.staleWrap}>
            <StaleNotice
              message={error ?? t('components.listLoadFailed')}
              loadedAt={loadedAt}
              onRetry={() => load(true)}
              retrying={refreshing}
            />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.center} accessibilityLiveRegion="polite">
          <Text style={styles.emptyText}>{error ?? emptyLabel}</Text>
        </View>
      }
    />
  );
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background },
  listContainer: { padding: spacing.md, backgroundColor: colors.background },
  staleWrap: { marginBottom: spacing.sm },
  slowHint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
    marginTop: spacing.sm,
  },
  emptyContainer: { flexGrow: 1, backgroundColor: colors.background },
  emptyText: {
    fontFamily: typography.fontFamily.regular,
    color: colors.textMuted,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  cardBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  detailLabel: {
    fontFamily: typography.fontFamily.regular,
    color: colors.textMuted,
    fontSize: typography.size.sm,
  },
  detailValue: {
    fontFamily: typography.fontFamily.medium,
    color: colors.textPrimary,
    fontSize: typography.size.sm,
    flexShrink: 1,
    textAlign: 'right',
  },
});
