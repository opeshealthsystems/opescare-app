/**
 * My Appointments — the patient's care schedule.
 *
 * OPES CARE-001 (Appointments home) + CARE-002 (Appointment list) ported onto
 * this route: kit `ScreenHeader` with the "Book New" action, the two-panel
 * next-appointment hero, Upcoming / Past segmented `Chip`s carrying live
 * server counts, one flush `Card` per `AppointmentRow`, a "Recent
 * Appointments" strip while the Upcoming tab is showing, the "Need to change
 * an appointment?" helper row and the Finder's own stay-on-track notice.
 *
 * Presentation only. Data is unchanged: GET /mobile/appointments?scope=
 * upcoming|past via `useAppointmentBoard`, which fetches both scopes so the
 * segment counts are live and switching tabs never flashes a spinner. Every
 * colour comes from the active kit palette (`useTheme()`), never a literal.
 */
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  formatTime,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type TFunction,
} from '@/components/opes-ui';
import {
  AppointmentRow,
  CareButton,
  DateBlock,
  LoadingBlock,
  NoticeBanner,
  StatusPill,
} from '@/components/care/shared';
import { relativeDay, statusTintOf, typeLabelOf } from '@/components/care/apptLabels';
import {
  useAppointmentBoard,
  type AppointmentBoardScope,
} from '@/lib/api/appointmentsQueries';
import type { Appointment } from '@/lib/api/types';

const BOOK_ROUTE = '/appointments/book';

type TabDef = {
  scope: AppointmentBoardScope;
  icon: IconName;
  labelKey: string;
  headingKey: string;
  emptyTitleKey: string;
  emptyMessageKey: string;
};

const TABS: TabDef[] = [
  {
    scope: 'upcoming',
    icon: 'calendar-plus',
    labelKey: 'opesCare.list.tabUpcoming',
    headingKey: 'opesCare.list.headingUpcoming',
    emptyTitleKey: 'opesCare.list.emptyUpcomingTitle',
    emptyMessageKey: 'opesCare.list.emptyUpcomingMessage',
  },
  {
    scope: 'past',
    icon: 'history',
    labelKey: 'opesCare.list.tabPast',
    headingKey: 'opesCare.list.headingPast',
    emptyTitleKey: 'opesCare.list.emptyPastTitle',
    // The Finder's own wording says WHAT lands here (completed, cancelled,
    // missed) — more useful than the catalogue's "Nothing to show" line.
    emptyMessageKey: 'appointments.emptyPastBody',
  },
];

/** How many past rows the Upcoming tab previews before "View all". */
const RECENT_PREVIEW = 3;

export default function AppointmentsListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [scope, setScope] = useState<AppointmentBoardScope>('upcoming');
  const board = useAppointmentBoard(50);
  const segment = board[scope];
  const tab = TABS.find((def) => def.scope === scope) ?? TABS[0];

  const goBook = () => router.push(BOOK_ROUTE);
  const open = (id: string) => router.push(`/appointments/${id}`);

  const nextUp: Appointment | undefined = board.upcoming.items[0];
  const recent = board.past.items.slice(0, RECENT_PREVIEW);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader
        title={t('opesCare.home.title')}
        subtitle={t('opesCare.home.subtitle')}
        right={
          <CareButton
            label={t('opesCare.home.bookNew')}
            icon="calendar-plus"
            variant="primary"
            size="sm"
            onPress={goBook}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={board.isFetching}
            onRefresh={board.refetch}
            tintColor={colors.blue}
          />
        }
      >
        {board.isLoading ? (
          <LoadingBlock label={t('opesCare.home.loading')} />
        ) : board.isError ? (
          <Card>
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('appointments.loadError')}
              message={t('appointments.loadErrorBody')}
              actionLabel={t('appointments.retry')}
              onAction={board.refetch}
            />
          </Card>
        ) : (
          <>
            <NextAppointmentHero
              t={t}
              styles={styles}
              appointment={nextUp}
              onDetails={open}
              onBook={goBook}
            />

            {/* Segmented Upcoming / Past — kit chips with the live server totals. */}
            <View style={styles.tabs} accessibilityRole="tablist">
              {TABS.map((def) => {
                const total = board[def.scope].total;
                return (
                  <Chip
                    key={def.scope}
                    label={t(def.labelKey)}
                    icon={def.icon}
                    count={total > 0 ? total : undefined}
                    selected={def.scope === scope}
                    onPress={() => setScope(def.scope)}
                    style={styles.tab}
                  />
                );
              })}
            </View>

            <View>
              <SectionHeader title={t(tab.headingKey)} />
              {segment.isError ? (
                <Card>
                  <EmptyState
                    icon="alert-circle"
                    tint="red"
                    title={t('appointments.loadError')}
                    message={t('appointments.loadErrorBody')}
                    actionLabel={t('appointments.retry')}
                    onAction={board.refetch}
                  />
                </Card>
              ) : segment.items.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={tab.icon}
                    tint="blue"
                    title={t(tab.emptyTitleKey)}
                    message={t(tab.emptyMessageKey)}
                    actionLabel={scope === 'upcoming' ? t('opesCare.list.bookCta') : undefined}
                    onAction={scope === 'upcoming' ? goBook : undefined}
                  />
                </Card>
              ) : (
                <View style={styles.stack}>
                  {segment.items.map((item) => (
                    <Card key={item.id} variant="flush">
                      <AppointmentRow appointment={item} onPress={() => open(item.id)} />
                    </Card>
                  ))}
                </View>
              )}
            </View>

            {scope === 'upcoming' && recent.length > 0 ? (
              <View>
                <SectionHeader
                  title={t('opesCare.home.recentTitle')}
                  actionLabel={t('opesCare.list.viewAll')}
                  actionChevron
                  onAction={() => setScope('past')}
                />
                <View style={styles.stack}>
                  {recent.map((item) => (
                    <CompactCard
                      key={item.id}
                      t={t}
                      styles={styles}
                      appointment={item}
                      onPress={() => open(item.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {/* CARE-002's helper strip: opens the first appointment in view, or booking when there is none. */}
            <Card variant="flush">
              <ListRow
                icon="edit"
                tint="blue"
                title={t('opesCare.list.helperTitle')}
                subtitle={t('opesCare.list.helperText')}
                onPress={() => (segment.items[0] ? open(segment.items[0].id) : goBook())}
              />
            </Card>

            <NoticeBanner
              icon="shield-check"
              tone="normal"
              title={t('appointments.tipTitle')}
              message={t('appointments.tipBody')}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Next-appointment hero — CARE-001's two-panel card
// ---------------------------------------------------------------------------

function NextAppointmentHero({
  t,
  styles,
  appointment,
  onDetails,
  onBook,
}: {
  t: TFunction;
  styles: Styles;
  appointment?: Appointment;
  onDetails: (id: string) => void;
  onBook: () => void;
}) {
  const { colors } = useTheme();

  if (!appointment) {
    return (
      <Card>
        <View style={styles.heroEmpty}>
          <View style={styles.heroEmptyCircle}>
            <Icon name="calendar" size={24} color={colors.blue} />
          </View>
          <View style={styles.heroEmptyBody}>
            <Text style={styles.heroEmptyTitle}>{t('opesCare.home.heroEmptyTitle')}</Text>
            <Text style={styles.heroEmptyText}>{t('opesCare.home.heroEmptyText')}</Text>
          </View>
        </View>
        <GradientButton
          label={t('opesCare.home.heroEmptyCta')}
          onPress={onBook}
          style={styles.heroEmptyButton}
        />
      </Card>
    );
  }

  const a = appointment;
  const day = relativeDay(t, a.scheduled_at) || t('appointments.noDate');
  const time = formatTime(a.scheduled_at);

  return (
    <View style={styles.hero}>
      <View style={styles.heroLeft}>
        <View style={styles.heroIcon}>
          <Icon name="calendar" size={26} color={colors.textOnBrand} />
        </View>
        <Text style={styles.heroKicker}>{t('opesCare.home.heroKicker')}</Text>
        <Text style={styles.heroDay} numberOfLines={2}>
          {day}
        </Text>
        {!!time && <Text style={styles.heroTime}>{time}</Text>}
      </View>
      <View style={styles.heroRight}>
        <Text style={styles.heroType}>{typeLabelOf(t, a.appointment_type)}</Text>
        <Text style={styles.heroName} numberOfLines={2}>
          {a.provider_name ?? t('opesCare.appt.providerTbd')}
        </Text>
        {!!a.reason && (
          <View style={styles.heroMetaRow}>
            <Icon name="clipboard" size={18} color={colors.textSecondary} />
            <Text style={styles.heroMeta} numberOfLines={1}>
              {a.reason}
            </Text>
          </View>
        )}
        <View style={styles.heroMetaRow}>
          <Icon name="building" size={18} color={colors.textSecondary} />
          <Text style={styles.heroMeta} numberOfLines={2}>
            {a.facility_name ?? t('opesCare.appt.facilityTbd')}
          </Text>
        </View>
        <CareButton
          label={t('opesCare.home.heroDetails')}
          variant="secondary"
          iconRight="chevron-right"
          onPress={() => onDetails(a.id)}
          style={styles.heroButton}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Compact past-appointment card — CARE-002's "Past appointments" preview row
// ---------------------------------------------------------------------------

function CompactCard({
  t,
  styles,
  appointment,
  onPress,
}: {
  t: TFunction;
  styles: Styles;
  appointment: Appointment;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const a = appointment;
  const kind = typeLabelOf(t, a.appointment_type);
  const time = formatTime(a.scheduled_at);
  const facility = a.facility_name ?? t('opesCare.appt.facilityTbd');
  const meta = [time, facility].filter(Boolean).join(' • ');

  return (
    <Card
      variant="flush"
      onPress={onPress}
      accessibilityLabel={[kind, a.provider_name, meta].filter(Boolean).join(', ')}
      accessibilityHint={t('opesCare.appt.apptRowHint')}
    >
      <View style={styles.compact}>
        <DateBlock iso={a.scheduled_at} tint={statusTintOf(a.status)} check={a.status === 'completed'} />
        <View style={styles.compactBody}>
          <Text style={styles.compactTitle} numberOfLines={2}>
            {kind}
          </Text>
          <Text style={styles.compactProvider} numberOfLines={1}>
            {a.provider_name ?? '—'}
          </Text>
          <Text style={styles.compactMeta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <View style={styles.compactTrailing}>
          <StatusPill status={a.status} size="sm" />
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </View>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.sm + 2 },

    tabs: { flexDirection: 'row', gap: spacing.sm },
    tab: { flex: 1, justifyContent: 'center' },

    hero: {
      flexDirection: 'row',
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    heroLeft: {
      width: 148,
      backgroundColor: colors.primaryDeep,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.sm,
      gap: 2,
    },
    heroIcon: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: colors.blueLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm + 2,
    },
    heroKicker: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textOnBrand,
    },
    heroDay: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textOnBrand,
      textAlign: 'center',
      marginTop: 2,
    },
    heroTime: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textOnBrand,
    },
    heroRight: { flex: 1, padding: spacing.md, gap: 6 },
    heroType: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
    },
    heroName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
    },
    heroMetaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    heroMeta: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    heroButton: { marginTop: spacing.sm + 2 },

    heroEmpty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    heroEmptyCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroEmptyBody: { flex: 1, minWidth: 0 },
    heroEmptyTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    heroEmptyText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
      marginTop: 2,
    },
    heroEmptyButton: { marginTop: spacing.md },

    compact: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4, padding: spacing.md - 2 },
    compactBody: { flex: 1, minWidth: 0, gap: 2 },
    compactTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    compactProvider: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    compactMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    compactTrailing: {
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
      gap: spacing.md,
    },
  });
