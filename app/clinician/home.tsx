/**
 * Doctor — Today (`/clinician/home`).
 *
 * Port of `UIUX/src/screens/doctor/DoctorHomeScreen.tsx` onto expo-router,
 * the OPES UI kit and this app's doctor foundation.
 *
 * The clinician's day on one screen: what is waiting on them, the most urgent
 * results, and what is booked next. EVERY FIGURE HERE IS COUNTED BY THE
 * SERVER (`GET /mobile/doctor/home`) with the same query the screen it links
 * to would run. Nothing on this screen is derived, cached or estimated on the
 * phone, and a count of zero is shown as zero rather than hidden — a doctor
 * has to be able to tell "nothing waiting" from "we don't know".
 *
 * The one figure the home endpoint does NOT carry is the number of bookings
 * still awaiting a decision. It is read from the requests endpoint itself —
 * the same query `/clinician/requests` runs, sharing its cache — and when that
 * read fails the row becomes a plain link with NO number, never a zero.
 *
 * ── ONE SCREEN, DRAWN PER ROLE ────────────────────────────────────────────
 * Every professional with a posting lands here — receptionists, pharmacists
 * and lab staff as well as doctors and nurses — and the server refuses each
 * the routes their role lacks (`config/staff_capabilities.php`, mirrored in
 * `lib/staffCapabilities.ts`). So each section below is drawn only for a role
 * whose capability the server would honour: Write for prescribers, the
 * results tiles for chart and lab roles, the diary for roles with a schedule.
 * A role without the chart gets an honest "what this app does for you" card
 * instead — and it says where the rest of its work lives (the web desk), not
 * that a mobile counter, bench or check-in exists when none does.
 *
 * Backend gap: the finder does not serve `/mobile/doctor/*` yet, so this hook
 * 404s today. A 404 (or any failure with nothing on screen) renders an honest
 * EmptyState with a retry; nothing spins forever and nothing is invented.
 *
 * i18n: `opesDoctor.*` is being migrated into the app locales. Every string
 * carries a `defaultValue` so the screen reads correctly before a key lands
 * and picks the catalogue up the moment it does. Locale files are not edited
 * here.
 */
import { useCallback, useMemo, useRef } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { LoadingBlock, NoticeBanner, describeFailure, type Translate } from '@/components/care/shared';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  useAppointmentRequests,
  useDoctorHome,
  type DoctorAppointment,
  type StaffAppointment,
  type StaffAppointmentStatus,
  isDoctorFeatureUnserved,
} from '@/lib/api/doctorQueries';
import { CountTile, ResultRow } from '@/components/doctor/shared';
import { ScheduleRow } from '@/components/doctor/scheduleShared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';
import {
  roleFamily,
  useProviderRole,
  useStaffCapability,
  type RoleFamily,
} from '@/lib/staffCapabilities';

/**
 * The home endpoint sends a slimmer appointment than the schedule endpoint
 * does. `ScheduleRow` is the app's one appointment row, so the slim row is
 * widened onto the shape it takes.
 *
 * NOTHING IS INVENTED HERE. Every value the wire carried is carried across;
 * every field it did not carry is `null` (or, where the type forbids null, an
 * empty string) and none of those fields is rendered by `ScheduleRow` —
 * `patient_sex` and `patient_dob` are simply absent, so the row's meta line
 * shows the Health ID alone rather than a guessed age or sex.
 *
 * `at` is passed separately because the caller has already established the
 * appointment has a time; a row without one never reaches here.
 */
function asScheduleRow(a: DoctorAppointment, at: string): StaffAppointment {
  return {
    id: a.id,
    patient_id: a.patient_id ?? '',
    patient_name: a.patient_name,
    patient_health_id: a.patient_health_id,
    provider_id: null,
    provider_name: null,
    facility_id: null,
    facility_name: null,
    scheduled_at: at,
    duration_minutes: a.duration_minutes,
    appointment_type: a.appointment_type,
    reason: a.reason,
    status: a.status as StaffAppointmentStatus,
    visit_mode: a.visit_mode,
    location: a.location,
    room: null,
    priority: null,
    checked_in_at: null,
    encounter_id: null,
    cancel_reason: null,
    cancelled_at: null,
    // Not on the home payload and not rendered by the row — never displayed
    // as a date, so an empty string cannot become "01 Jan 1970" on screen.
    created_at: '',
  };
}

export default function DoctorHomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  /** `opesDoctor.<key>` with a readable default until the catalogue lands. */
  const tx = useCallback(
    (key: string, defaultValue: string, params?: Record<string, unknown>) =>
      String(t(`opesDoctor.${key}`, { defaultValue, ...params })),
    [t]
  );
  const tr = useCallback<Translate>(
    (key, params) => String(t(key, params as Record<string, unknown>)),
    [t]
  );

  // ── What this ROLE gets (`lib/staffCapabilities.ts`) ────────────────────
  const canPrescribe = useStaffCapability('prescribe');
  const canChart = useStaffCapability('clinical_chart');
  const canRequestAccess = useStaffCapability('request_access');
  const canResults = useStaffCapability('clinical_chart', 'lab_results');
  const canMessage = useStaffCapability('messaging');
  const canSchedule = useStaffCapability('schedule');
  const family = roleFamily(useProviderRole());

  const home = useDoctorHome();
  // The same query `/clinician/requests` runs (identical key → shared cache),
  // solely for its server-counted total. A failure here never blanks the
  // screen: the row degrades to a link without a number. Not asked at all for
  // a role without a schedule — the server would only refuse it.
  const requests = useAppointmentRequests({}, { enabled: canSchedule });
  const { refetch } = home;
  const refetchRequests = requests.refetch;

  // Coming back from the inbox, a thread or an appointment must not leave a
  // stale count on the dashboard. The first focus is the mount fetch itself.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refetch();
      void refetchRequests();
    }, [refetch, refetchRequests])
  );

  const reload = useCallback(() => {
    void refetch();
    void refetchRequests();
  }, [refetch, refetchRequests]);

  const data = home.data;

  // `useAppointmentRequests` answers the paginated envelope (`DoctorPage<T>` =
  // { data, meta.pagination }), so the TOTAL is one level in — not the length
  // of whatever page happened to load. Unknown stays null, never 0.
  const requestTotal: number | null = requests.data?.meta?.pagination?.total ?? null;

  // A refresh that failed while the dashboard is on screen must never pass as
  // fresh — the figures are the whole point of this screen.
  const stale =
    home.isError && data !== undefined ? (
      <StaleNotice
        message={describeFailure(home.error).message}
        loadedAt={home.dataUpdatedAt ? new Date(home.dataUpdatedAt) : null}
        onRetry={reload}
        retrying={home.isFetching}
      />
    ) : null;

  // Prescribing is deliberately OUTSIDE the dashboard's success branch. The
  // clinician summary endpoint is not served by every backend, and when it 404s
  // this screen renders a full-height EmptyState — which used to swallow the
  // only route to `app/clinician/prescribe.tsx` and leave a doctor with no way
  // to write a prescription at all. Writing one needs nothing from the summary.
  // Who may write is `canPrescribe` above — the capability map, not a
  // hand-rolled role list.

  const identifySection = (
    <>
      <SectionHeader title={tx('home.identifySection', 'Identify')} />
      <Card variant="flush">
        <ListRow
          icon="qr"
          tint="blue"
          title={tx('home.tileScan', 'Scan a patient’s Health ID')}
          subtitle={
            canChart || canRequestAccess
              ? tx('home.tileScanSub', 'Read the code they present, then ask for access or open the chart')
              : tx('home.tileScanSubIdentify', 'Read the code they present to confirm who they are')
          }
          onPress={() => router.push(doctorRoutes.scan)}
        />
      </Card>
    </>
  );

  const writeSection = !canPrescribe ? null : (
    <>
      <SectionHeader title={tx('home.writeSection', 'Write')} />
      <Card variant="flush">
        <ListRow
          icon="pill"
          tint="green"
          title={tx('prescribe.title', 'Write a prescription')}
          subtitle={tx('home.tilePrescribe', 'Look the patient up by Health ID, then issue')}
          onPress={() => router.push('/clinician/prescribe')}
        />
      </Card>
    </>
  );

  // For a role without the chart, say what the phone CAN do for it — and
  // where the rest of its work lives. Nothing here is a feature the backend
  // lacks dressed up as one it has: there is no mobile dispensing counter, no
  // lab-side result entry and no facility-wide front-desk book, and the copy
  // says so rather than implying one.
  const roleCopy = roleHomeCopy(family, tx);
  const roleSection = canChart ? null : (
    <>
      <SectionHeader title={tx('home.roleSection', 'What this app does for you')} />
      <Card>
        <View style={styles.roleRow}>
          <Icon name="info" size={18} color={colors.blue} />
          <View style={styles.roleText}>
            <Text style={styles.roleTitle}>{roleCopy.title}</Text>
            <Text style={styles.roleBody}>{roleCopy.body}</Text>
          </View>
        </View>
      </Card>
    </>
  );

  // The "waiting on you" card only when at least one of its tiles is this
  // role's to see — an empty card would read as "nothing is waiting".
  const waitingTiles = canResults || canMessage || canSchedule;

  let body: React.ReactNode;
  if (home.isPending) {
    body = <LoadingBlock label={tx('home.loading', 'Loading your day…')} />;
  } else if (home.isError && data === undefined) {
    const notServed = isDoctorFeatureUnserved(home.error);
    body = (
      <EmptyState
        icon={notServed ? 'stethoscope' : 'alert-circle'}
        tint={notServed ? 'blue' : 'red'}
        title={
          notServed
            ? tx('shared.notServedTitle', 'Not available on this server yet')
            : tr('opesCore.errors.unknownTitle')
        }
        message={
          notServed
            ? tx(
                'shared.notServedHome',
                "Clinician data isn't connected yet. Your day, your counts and your results will appear here once the clinician service is enabled for this app."
              )
            : describeFailure(home.error).message
        }
        actionLabel={tr('opesCore.common.retry')}
        onAction={reload}
      />
    );
  } else if (data) {
    body = (
      <>
        {canResults && data.counts.critical_unacknowledged > 0 && (
          <NoticeBanner
            icon="alert-triangle"
            tone="critical"
            title={tx(
              'home.criticalBanner',
              data.counts.critical_unacknowledged === 1
                ? '1 critical result is not acknowledged'
                : '{{count}} critical results are not acknowledged',
              { count: data.counts.critical_unacknowledged }
            )}
            message={tx(
              'home.criticalBannerBody',
              'A critical result stays unacknowledged until you open it and confirm. Open the inbox to review.'
            )}
          />
        )}

        {waitingTiles && (
          <>
            <SectionHeader title={tx('home.waitingOnYou', 'Waiting on you')} />
            <Card variant="flush">
              {canResults && (
                <CountTile
                  icon="alert-circle"
                  tint="red"
                  count={data.counts.unacknowledged_results}
                  label={tx('home.tileResults', 'Results to acknowledge')}
                  emphasise={data.counts.critical_unacknowledged > 0}
                  onPress={() => router.push(doctorRoutes.results)}
                />
              )}
              {canMessage && (
                <CountTile
                  icon="chat"
                  tint="blue"
                  count={data.counts.unread_messages}
                  label={tx('home.tileMessages', 'Unread patient messages')}
                  onPress={() => router.push(doctorRoutes.messages)}
                />
              )}
              {canSchedule && (
                <CountTile
                  icon="calendar"
                  tint="purple"
                  count={data.counts.appointments_today}
                  label={tx('home.tileAppointments', 'Appointments today')}
                  onPress={() => router.push(doctorRoutes.schedule)}
                />
              )}
              {canSchedule &&
                (requestTotal === null ? (
                  // The count could not be read. A link, not a number we don't have.
                  <ListRow
                    icon="clipboard"
                    tint="amber"
                    title={tx('schedule.requestsAction', 'Appointment requests')}
                    subtitle={tx(
                      'home.tileRequestsUnknown',
                      'Open to see what is awaiting your decision'
                    )}
                    onPress={() => router.push(doctorRoutes.requests)}
                  />
                ) : (
                  <CountTile
                    icon="clipboard"
                    tint="amber"
                    count={requestTotal}
                    label={tx('schedule.requestsAction', 'Appointment requests')}
                    onPress={() => router.push(doctorRoutes.requests)}
                  />
                ))}
            </Card>
          </>
        )}

        {canResults && data.urgent_results.length > 0 && (
          <>
            <SectionHeader
              title={tx('home.urgentResults', 'Most urgent results')}
              actionLabel={tx('home.viewAll', 'View all')}
              onAction={() => router.push(doctorRoutes.results)}
            />
            <Card variant="flush">
              {data.urgent_results.map((r) => (
                <ResultRow key={r.id} result={r} onPress={() => router.push(doctorRoutes.result(r.id))} />
              ))}
            </Card>
          </>
        )}

        {canSchedule && (
          <>
            <SectionHeader
              title={tx('home.nextToday', 'Next today')}
              actionLabel={
                data.counts.appointments_today > 0 ? tx('home.fullSchedule', 'Full schedule') : undefined
              }
              onAction={
                data.counts.appointments_today > 0 ? () => router.push(doctorRoutes.schedule) : undefined
              }
            />
            {data.next_appointments.length === 0 ? (
          <EmptyState
            icon="calendar-check"
            tint="blue"
            title={tx('home.nothingTodayTitle', 'Nothing booked today')}
            message={tx('home.nothingTodayBody', 'You have no appointments scheduled for today.')}
          />
        ) : (
          <Card variant="flush">
            {data.next_appointments.map((a, i) => (
              <View key={a.id}>
                {i > 0 && <View style={styles.divider} />}
                {a.scheduled_at ? (
                  <ScheduleRow
                    appointment={asScheduleRow(a, a.scheduled_at)}
                    onPress={() => router.push(doctorRoutes.appointment(a.id))}
                  />
                ) : (
                  // A time-first row with no time would print a clock it does
                  // not have. This one says so instead.
                  <ListRow
                    icon={a.visit_mode === 'telemedicine' ? 'video' : 'stethoscope'}
                    tint={a.visit_mode === 'telemedicine' ? 'purple' : 'blue'}
                    title={a.patient_name ?? tx('home.patientNotOnRecord', 'Patient not on record')}
                    meta={[
                      tx('home.timeNotRecorded', 'Time not recorded'),
                      a.location ?? undefined,
                      a.reason ?? undefined,
                    ]}
                    onPress={() => router.push(doctorRoutes.appointment(a.id))}
                  />
                )}
              </View>
            ))}
          </Card>
        )}
          </>
        )}

        <View style={styles.footer}>
          <Icon name="shield-check" size={16} color={colors.textMuted} />
          <Text style={styles.footerText}>
            {tx(
              'home.countedLive',
              'These figures are counted live on the hospital record each time this screen loads.'
            )}
          </Text>
        </View>
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('home.title', 'Today')}
        subtitle={data?.provider.name}
        showBack={false}
        actions={[
          // The inbox bell only for a role that has an inbox to open.
          ...(canResults
            ? [
                {
                  icon: 'bell' as const,
                  // No count when we do not have one — never a zero bubble.
                  badge: data?.counts.unacknowledged_results,
                  accessibilityLabel: tx('home.inboxAction', 'Results inbox'),
                  onPress: () => router.push(doctorRoutes.results),
                },
              ]
            : []),
          {
            // The profile route is registered href:null (it is not one of the five
            // tab slots), so without this action it would be reachable by URL only —
            // which this project does not allow for any feature.
            icon: 'person',
            accessibilityLabel: tx('profile.title', 'My profile'),
            onPress: () => router.push(doctorRoutes.profile),
          },
        ]}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={home.isFetching && !home.isPending}
            onRefresh={reload}
            tintColor={colors.blue}
          />
        }
      >
        {stale}
        {identifySection}
        {writeSection}
        {roleSection}
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * What the phone does for a role without the chart, by the PHP config's own
 * grouping. Every sentence that names a desk names the WEB desk: the backend
 * has no mobile dispensing counter, no lab-side result entry and no
 * facility-wide front-desk book, and this copy must not suggest otherwise.
 */
function roleHomeCopy(
  family: RoleFamily,
  tx: (key: string, defaultValue: string, params?: Record<string, unknown>) => string
): { title: string; body: string } {
  switch (family) {
    case 'frontDesk':
      return {
        title: tx('home.roleFrontDeskTitle', 'Identify patients and see your diary'),
        body: tx(
          'home.roleFrontDeskBody',
          'Scan or type a Health ID to confirm who is in front of you. Check-in, the queue and the facility-wide appointment book are managed on the web desk, not in this app.'
        ),
      };
    case 'pharmacy':
    case 'pharmacyStock':
      return {
        title: tx('home.rolePharmacyTitle', 'Identify patients and ask for access'),
        body: tx(
          'home.rolePharmacyBody',
          'Scan or type a Health ID to confirm who is at the counter, and ask the patient for access to their record. Dispensing against a prescription and stock are managed on the web pharmacy counter, not in this app.'
        ),
      };
    case 'lab':
      return {
        title: tx('home.roleLabTitle', 'Identify patients and follow results'),
        body: tx(
          'home.roleLabBody',
          'Scan or type a Health ID to confirm who is giving a sample. The results inbox lists results on orders placed under your account; entering and validating results is done on the web laboratory desk, not in this app.'
        ),
      };
    case 'labCollection':
      return {
        title: tx('home.roleLabCollectionTitle', 'Identify patients'),
        body: tx(
          'home.roleLabCollectionBody',
          'Scan or type a Health ID to confirm who is giving a sample. The sample collection workflow is managed on the web laboratory desk, not in this app.'
        ),
      };
    default:
      return {
        title: tx('home.roleOtherTitle', 'Identify patients'),
        body: tx(
          'home.roleOtherBody',
          'Scan or type a Health ID to confirm who is in front of you. The rest of your work is on the OpesCare web portal.'
        ),
      };
  }
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },

    divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.md },

    roleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    roleText: { flex: 1 },
    roleTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    roleBody: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.sm,
    },
    footerText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
  });
