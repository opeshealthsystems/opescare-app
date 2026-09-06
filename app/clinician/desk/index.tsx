/**
 * Front desk — the facility's appointment book for a day (`/clinician/desk`).
 *
 * The receptionist's screen: every appointment at THIS facility for one day,
 * read time-first, with the patient's short name and Health ID, the visit
 * type, who it is routed to (or an amber "Unassigned"), and the live status.
 * A row opens the desk record — the only place a row is confirmed, checked
 * in, routed, moved, cancelled or marked no-show.
 *
 * ── WHAT IS REAL ON THIS SCREEN ───────────────────────────────────────────
 *  • The five tiles are `GET /mobile/desk/home` — counted SERVER-side. When
 *    that read fails the tiles are not drawn (a dash would still be a claim).
 *  • The rows are `GET /mobile/desk/appointments?date=` — the whole day, read
 *    once and cached; the status and clinician filters are applied on the
 *    phone (`filterDeskAppointments`), so every filter shares one read and the
 *    detail screen derives its row from the same cache.
 *  • The clinician chips are `GET /mobile/desk/providers`; "Unassigned" is a
 *    phone-side filter for `provider === null`.
 *
 * Deep link: `/clinician/desk?date=YYYY-MM-DD`. Anything unparseable falls
 * back to today rather than rendering an invalid day.
 *
 * Backend gap handled honestly: a server that does not serve `/mobile/desk/*`
 * answers `404 ENDPOINT_NOT_FOUND` / 405; that renders the blue "not available
 * on this server yet" state with a retry, and nothing is invented.
 *
 * Role gate: `front_desk`. A role without it never mounts the body, so none of
 * its queries run (`lib/staffCapabilities.ts`).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGate } from '@/components/doctor/RoleGate';
import {
  Card,
  EmptyState,
  ScreenHeader,
  SegmentedTabs,
  StaleNotice,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, describeFailure, fmtDateLong } from '@/components/care/shared';
import {
  DESK_STATUS_FAMILIES,
  deskDay,
  filterDeskAppointments,
  isValidDeskDay,
  useDeskAppointments,
  useDeskHome,
  useDeskProviders,
  type DeskAppointment,
  type DeskProviderFilter,
  type DeskStatusFamily,
} from '@/lib/api/deskQueries';
import { DeskAppointmentRow, DeskFailureState, DeskTiles, deskFamilyFilterLabel } from '@/components/desk/shared';
import { DateField, DayChips } from '@/components/desk/DateTimeFields';
import { ProviderChips } from '@/components/desk/ProviderPicker';
import { deskRoutes } from '@/components/desk/routes';

type FamilyFilter = DeskStatusFamily | 'all';

export default function DeskBookScreen() {
  return (
    <RoleGate need={['front_desk']}>
      <DeskBookScreenBody />
    </RoleGate>
  );
}

function DeskBookScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ date?: string }>();

  // `day` is what is READ; `dateEntry` is what is TYPED. The field commits to
  // `day` only once it names a real date, so a half-typed day never fires a read.
  const [day, setDay] = useState<string>(() =>
    typeof params.date === 'string' && isValidDeskDay(params.date) ? params.date : deskDay(),
  );
  const [dateEntry, setDateEntry] = useState<string>(day);
  const [family, setFamily] = useState<FamilyFilter>('all');
  const [provider, setProvider] = useState<DeskProviderFilter>('all');

  const home = useDeskHome();
  const providers = useDeskProviders();
  const list = useDeskAppointments({ date: day });
  const { refetch } = list;

  // Coming back from a row that was checked in, moved or cancelled must not
  // leave the old status on the book. The first focus is the mount fetch.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refetch();
      void home.refetch();
    }, [refetch, home]),
  );

  const rows: DeskAppointment[] = useMemo(
    () => filterDeskAppointments(list.data ?? [], family, provider),
    [list.data, family, provider],
  );
  const filtered = family !== 'all' || provider !== 'all';

  const pickDay = (next: string) => {
    setDay(next);
    setDateEntry(next);
  };
  const onDateTyped = (next: string) => {
    setDateEntry(next);
    if (isValidDeskDay(next)) setDay(next);
  };

  const openRow = (a: DeskAppointment) => router.push(deskRoutes.appointment(a.id, day));
  const newAppointment = () => router.push(deskRoutes.newAppointment({ date: day }));
  const registerPatient = () => router.push(deskRoutes.registerPatient);

  const refreshAll = () => {
    void refetch();
    void home.refetch();
    void providers.refetch();
  };

  const dayLabel = fmtDateLong(`${day}T00:00:00`);
  const facilityName = home.data?.facility?.name?.trim();

  // A refresh that failed while rows are on screen must never pass as fresh.
  const stale =
    list.isError && list.data !== undefined ? (
      <StaleNotice
        message={describeFailure(list.error).message}
        loadedAt={list.dataUpdatedAt ? new Date(list.dataUpdatedAt) : null}
        onRetry={() => void refetch()}
        retrying={list.isFetching}
      />
    ) : null;

  let body: React.ReactNode;
  if (list.isPending) {
    body = <LoadingBlock label={t('desk.book.loading')} />;
  } else if (list.isError && list.data === undefined) {
    body = (
      <DeskFailureState
        error={list.error}
        onRetry={() => void refetch()}
        notServedMessage={t('desk.notServedBook')}
      />
    );
  } else if (rows.length === 0) {
    body = filtered ? (
      <EmptyState
        icon="filter"
        tint="blue"
        title={t('desk.book.emptyFilteredTitle')}
        message={t('desk.book.emptyFilteredBody')}
        actionLabel={t('desk.book.clearFilters')}
        onAction={() => {
          setFamily('all');
          setProvider('all');
        }}
      />
    ) : (
      <EmptyState
        icon="calendar"
        tint="blue"
        title={t('desk.book.emptyTitle')}
        message={t('desk.book.emptyBody', { date: dayLabel })}
        actionLabel={t('desk.book.newAppointment')}
        onAction={newAppointment}
      />
    );
  } else {
    body = (
      <Card variant="flush">
        {rows.map((a, i) => (
          <View key={a.id}>
            {i > 0 && <View style={styles.divider} />}
            <DeskAppointmentRow appointment={a} onPress={() => openRow(a)} />
          </View>
        ))}
      </Card>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={t('desk.book.title')}
        subtitle={facilityName ? `${facilityName} · ${dayLabel}` : dayLabel}
        showBack={router.canGoBack()}
        actions={[
          {
            icon: 'calendar-plus',
            accessibilityLabel: t('desk.book.newAppointment'),
            onPress: newAppointment,
          },
          {
            icon: 'id-card',
            accessibilityLabel: t('desk.book.registerPatient'),
            onPress: registerPatient,
          },
        ]}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={list.isFetching && !list.isPending}
            onRefresh={refreshAll}
            tintColor={colors.blue}
          />
        }
      >
        {/* ── Which day ──────────────────────────────────────────────── */}
        <View style={styles.dayRow}>
          <DayChips value={day} onChange={pickDay} />
        </View>
        <DateField
          value={dateEntry}
          onChange={onDateTyped}
          accessibilityLabel={t('desk.book.dateLabel')}
          error={dateEntry.length === 10 && !isValidDeskDay(dateEntry) ? t('desk.book.dateInvalid') : null}
        />

        {/* ── The day's counts — the server's numbers, or nothing ────── */}
        {home.data ? (
          <DeskTiles counts={home.data.counts} active={family} onPress={setFamily} />
        ) : home.isError ? (
          <Text style={styles.countsMissing}>{t('desk.tiles.unavailable')}</Text>
        ) : null}

        {/* ── Filters ────────────────────────────────────────────────── */}
        <SegmentedTabs
          variant="pill"
          scrollable
          options={[
            { key: 'all', label: deskFamilyFilterLabel(t, 'all') },
            ...DESK_STATUS_FAMILIES.map((f) => ({ key: f, label: deskFamilyFilterLabel(t, f) })),
          ]}
          value={family}
          onChange={(key) => setFamily(key as FamilyFilter)}
        />
        <ProviderChips providers={providers.data ?? []} value={provider} onChange={setProvider} />

        {/* ── Actions ────────────────────────────────────────────────── */}
        <View style={styles.actions}>
          <CareButton
            label={t('desk.book.newAppointment')}
            icon="calendar-plus"
            style={styles.action}
            onPress={newAppointment}
          />
          <CareButton
            label={t('desk.book.registerPatient')}
            icon="id-card"
            variant="secondary"
            style={styles.action}
            onPress={registerPatient}
          />
        </View>

        {stale}
        {body}

        {list.data && list.data.length > 0 && (
          <Text style={styles.footnote}>
            {filtered
              ? t('desk.book.showingFiltered', { shown: rows.length, total: list.data.length })
              : t('desk.book.showingAll', { total: list.data.length })}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.md },
    dayRow: { flexDirection: 'row' },
    divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.md },
    actions: { flexDirection: 'row', gap: spacing.sm },
    action: { flex: 1 },
    countsMissing: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    footnote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
