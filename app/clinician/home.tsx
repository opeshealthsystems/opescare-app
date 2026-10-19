/**
 * Today (`/clinician/home`) — one screen, drawn per role.
 *
 * Port of design reference `src/screens/doctor/DoctorHomeScreen.tsx` (archived prototype, see docs/DESIGN_REFERENCE.md) onto expo-router,
 * the OPES UI kit and this app's doctor foundation — then widened to every
 * professional with a posting.
 *
 * EVERY FIGURE HERE IS COUNTED BY THE SERVER, with the same query the screen
 * it links to would run. Nothing on this screen is derived, cached or
 * estimated on the phone, and a count of zero is shown as zero rather than
 * hidden — a professional has to be able to tell "nothing waiting" from "we
 * don't know".
 *
 * ── ONE SCREEN, DRAWN PER ROLE ────────────────────────────────────────────
 * The server refuses each role the routes it lacks (`config/staff_capabilities.php`,
 * mirrored in `lib/staffCapabilities.ts`), so each section below is drawn
 * only for a role whose capability the server would honour, and each desk's
 * counts come from that desk's own home endpoint:
 *
 *   clinicians (clinical_chart)   GET /mobile/doctor/home   Write · Waiting on you · Results · Next today
 *   pharmacist (dispense)         GET /mobile/pharmacy-desk/home the counter's queue, reservations, deliveries, low stock
 *   medicine_stock (stock only)   —                         a row into Stock (the home route is dispense-gated)
 *   lab (lab_results)             GET /mobile/lab/home      the bench: collection, results, urgent, requests
 *   sample_collection only        —                         a row into Lab (the home route is lab_results-gated)
 *   receptionist (front_desk)     GET /mobile/desk/home     today's book, plus "Book" and "Register a patient"
 *
 * Everyone keeps Identify (the scanner). The desk queries live in
 * `lib/api/deskHomeQueries.ts` — deliberately not in the desks' own query
 * files, which other agents are writing in parallel.
 *
 * ── WHEN A DESK ANSWERS NOTHING ───────────────────────────────────────────
 * A desk whose home route this host does not serve yet (a bodyless 404 or a
 * 501, `isDeskHomeUnserved`) degrades to ONE plain row — "Open the Pharmacy
 * desk" — with an honest line saying live counts are not available here. Any
 * other failure is named, with a retry, and never rendered as an empty desk.
 * A refresh that failed over figures already on screen renders `StaleNotice`.
 *
 * The one figure the doctor's home endpoint does NOT carry is the number of
 * bookings still awaiting a decision. It is read from the requests endpoint
 * itself — the same query `/clinician/requests` runs, sharing its cache — and
 * when that read fails the row becomes a plain link with NO number.
 *
 * i18n: `opesDoctor.*`. Every string carries a `defaultValue` so the screen
 * reads correctly before a key lands and picks the catalogue up the moment it
 * does.
 */
import { useCallback, useMemo, useRef } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  Card,
  CardStack,
  EmptyState,
  Icon,
  ListRow,
  ResultList,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type Tint,
} from '@/components/opes-ui';
import { LoadingBlock, NoticeBanner, describeFailure, type Translate } from '@/components/care/shared';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  useAppointmentRequests,
  useDoctorHome,
  useDoctorUnreadCounts,
  type DoctorAppointment,
  type StaffAppointment,
  type StaffAppointmentStatus,
  isDoctorFeatureUnserved,
} from '@/lib/api/doctorQueries';
import { isDeskHomeUnserved, useDeskHome, useLabHome, usePharmacyHome } from '@/lib/api/deskHomeQueries';
import { CountTile, ResultRow, styles as tileStyles } from '@/components/doctor/shared';
import { ScheduleRow } from '@/components/doctor/scheduleShared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';
import { useHasProviderSession, useStaffCapability } from '@/lib/staffCapabilities';

type Tx = (key: string, defaultValue: string, params?: Record<string, unknown>) => string;

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
  const tx = useCallback<Tx>(
    (key, defaultValue, params) => String(t(`opesDoctor.${key}`, { defaultValue, ...params })),
    [t],
  );
  const tr = useCallback<Translate>((key, params) => String(t(key, params as Record<string, unknown>)), [t]);

  // ── What this ROLE gets (`lib/staffCapabilities.ts`) ────────────────────
  const realSession = useHasProviderSession();
  const canPrescribe = useStaffCapability('prescribe');
  const canChart = useStaffCapability('clinical_chart');
  const canRequestAccess = useStaffCapability('request_access');
  const canMessage = useStaffCapability('messaging');
  const holdsSchedule = useStaffCapability('schedule');
  const holdsFrontDesk = useStaffCapability('front_desk');
  const holdsDispense = useStaffCapability('dispense');
  const holdsStock = useStaffCapability('pharmacy_stock');
  const holdsLabResults = useStaffCapability('lab_results');
  const holdsCollection = useStaffCapability('sample_collection');

  // The same role → slot decisions as `_layout.tsx`, so Today never points at
  // a tab the bar does not have. The desks are drawn for a REAL provider
  // session only; the preview persona gets the doctor's day.
  const isClinician = canChart;
  const canFrontDesk = realSession && holdsFrontDesk;
  const canDispense = realSession && holdsDispense;
  const stockOnly = realSession && holdsStock && !holdsDispense;
  const canLabResults = realSession && holdsLabResults;
  const canLab = realSession && (holdsLabResults || holdsCollection);
  const canSchedule = holdsSchedule && !canFrontDesk;
  const canResults = canChart;

  // ── The reads, each enabled only for the role the server would answer ───
  const home = useDoctorHome({ enabled: isClinician });
  // The same query `/clinician/requests` runs (identical key → shared cache),
  // solely for its server-counted total. A failure here never blanks the
  // screen: the row degrades to a link without a number.
  const requests = useAppointmentRequests({}, { enabled: canSchedule });
  const pharmacyHome = usePharmacyHome({ enabled: canDispense });
  const labHome = useLabHome({ enabled: canLabResults });
  const deskHome = useDeskHome({ enabled: canFrontDesk });
  // The messaging badge's own query (shared key with the tab bar) — the one
  // "waiting on you" figure every non-clinician role with messaging has.
  const unread = useDoctorUnreadCounts({ enabled: !isClinician && canMessage });

  const reload = useCallback(() => {
    // `refetch()` ignores `enabled`, so each read is guarded by its own flag —
    // a role must never be made to ask what the server would refuse.
    if (isClinician) void home.refetch();
    if (canSchedule) void requests.refetch();
    if (canDispense) void pharmacyHome.refetch();
    if (canLabResults) void labHome.refetch();
    if (canFrontDesk) void deskHome.refetch();
    if (!isClinician && canMessage) void unread.refetch();
    // The query objects are stable per hook; their refetch identity is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isClinician,
    canSchedule,
    canDispense,
    canLabResults,
    canFrontDesk,
    canMessage,
    home.refetch,
    requests.refetch,
    pharmacyHome.refetch,
    labHome.refetch,
    deskHome.refetch,
    unread.refetch,
  ]);

  // Coming back from a desk, a thread or an appointment must not leave a
  // stale count on the dashboard. The first focus is the mount fetch itself.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      reload();
    }, [reload]),
  );

  const data = home.data;

  // `useAppointmentRequests` answers the paginated envelope (`DoctorPage<T>` =
  // { data, meta.pagination }), so the TOTAL is one level in — not the length
  // of whatever page happened to load. Unknown stays null, never 0.
  const requestTotal: number | null = requests.data?.meta?.pagination?.total ?? null;

  const fetching = home.isFetching || pharmacyHome.isFetching || labHome.isFetching || deskHome.isFetching;
  const pending =
    (isClinician && home.isPending) ||
    (canDispense && pharmacyHome.isPending) ||
    (canLabResults && labHome.isPending) ||
    (canFrontDesk && deskHome.isPending);

  // A refresh that failed while figures are on screen must never pass as
  // fresh — the figures are the whole point of this screen. One notice, for
  // whichever read it was.
  const staleOf = [home, pharmacyHome, labHome, deskHome].find((q) => q.isError && q.data !== undefined);
  const stale = staleOf ? (
    <StaleNotice
      message={describeFailure(staleOf.error).message}
      loadedAt={staleOf.dataUpdatedAt ? new Date(staleOf.dataUpdatedAt) : null}
      onRetry={reload}
      retrying={fetching}
    />
  ) : null;

  // ── Identify: everyone. The subtitle names where THIS role goes next. ───
  const scanSubtitle = canDispense
    ? tx('home.tileScanSubDispense', 'Read the code they present, then dispense against their prescriptions')
    : canFrontDesk
      ? tx('home.tileScanSubDesk', 'Read the code they present, then check them in or book a visit')
      : canLab
        ? tx('home.tileScanSubLab', 'Read the code they present, then open their laboratory orders')
        : canChart || canRequestAccess
          ? tx('home.tileScanSub', 'Read the code they present, then ask for access or open the chart')
          : tx('home.tileScanSubIdentify', 'Read the code they present to confirm who they are');

  const identifySection = (
    <>
      <SectionHeader style={styles.sectionGap} title={tx('home.identifySection', 'Identify')} />
      <Card variant="flush">
        <ListRow
          icon="qr"
          tint="blue"
          title={tx('home.tileScan', 'Scan a patient’s Health ID')}
          subtitle={scanSubtitle}
          onPress={() => router.push(doctorRoutes.scan)}
        />
      </Card>
    </>
  );

  // Prescribing is deliberately OUTSIDE the dashboard's success branch. The
  // clinician summary endpoint is not served by every backend, and when it 404s
  // this screen renders a full-height EmptyState — which used to swallow the
  // only route to `app/clinician/prescribe.tsx` and leave a doctor with no way
  // to write a prescription at all. Writing one needs nothing from the summary.
  const writeSection = !canPrescribe ? null : (
    <>
      <SectionHeader style={styles.sectionGap} title={tx('home.writeSection', 'Write')} />
      <Card variant="flush">
        <ListRow
          icon="pill"
          tint="green"
          title={tx('prescribe.title', 'Write a prescription')}
          subtitle={tx('home.tilePrescribe', 'Look the patient up by Health ID, then issue')}
          onPress={() => router.push(doctorRoutes.prescribe)}
        />
      </Card>
    </>
  );

  // ── The desks ───────────────────────────────────────────────────────────
  const pharmacySection = !canDispense ? null : (
    <DeskSection
      title={tx('home.pharmacySection', 'Pharmacy counter')}
      query={pharmacyHome}
      open={{
        icon: 'pill',
        tint: 'green',
        title: tx('home.openPharmacy', 'Open the Pharmacy desk'),
        route: doctorRoutes.pharmacy(),
      }}
      tx={tx}
    >
      {(d) => (
        <CardStack spacing="sm">
          <Card variant="flush">
            <CountTile
              icon="pill"
              tint="blue"
              count={d.counts.incoming}
              label={tx('home.tileIncoming', 'Incoming prescriptions')}
              onPress={() => router.push(doctorRoutes.pharmacy())}
            />
          </Card>
          <Card variant="flush">
            <CountTile
              icon="clock"
              tint="amber"
              count={d.counts.preparing}
              label={tx('home.tilePreparing', 'Being prepared')}
              onPress={() => router.push(doctorRoutes.pharmacy())}
            />
          </Card>
          <Card variant="flush">
            <CountTile
              icon="check-circle"
              tint="green"
              count={d.counts.ready}
              label={tx('home.tileReady', 'Ready to collect')}
              onPress={() => router.push(doctorRoutes.pharmacy())}
            />
          </Card>
          <Card variant="flush">
            <CountTile
              icon="cart"
              tint="purple"
              count={d.counts.reservations_pending}
              label={tx('home.tileReservations', 'Reservations to accept')}
              onPress={() => router.push(doctorRoutes.pharmacy())}
            />
          </Card>
          <Card variant="flush">
            <CountTile
              icon="truck"
              tint="blue"
              count={d.counts.deliveries_open}
              label={tx('home.tileDeliveries', 'Deliveries open')}
              onPress={() => router.push(doctorRoutes.pharmacy())}
            />
          </Card>
          {holdsStock && (
            <FigureRow
              icon="archive"
              tint={d.counts.low_stock > 0 ? 'red' : 'green'}
              count={d.counts.low_stock}
              title={tx('home.tileLowStock', 'Low stock lines')}
              subtitle={tx('home.tileLowStockSub', 'At or under their reorder level')}
              onPress={() => router.push(doctorRoutes.pharmacyStock)}
            />
          )}
        </CardStack>
      )}
    </DeskSection>
  );

  // The stock-only role: the pharmacy home route is dispense-gated, so no
  // counts are asked for — one honest row into the stock screen.
  const stockSection = !stockOnly ? null : (
    <>
      <SectionHeader style={styles.sectionGap} title={tx('home.stockSection', 'Pharmacy stock')} />
      <Card variant="flush">
        <ListRow
          icon="archive"
          tint="green"
          title={tx('home.openStock', 'Stock on hand')}
          subtitle={tx('home.openStockSub', 'Quantities, reorder levels and adjustments')}
          onPress={() => router.push(doctorRoutes.pharmacyStock)}
        />
      </Card>
    </>
  );

  const labSection = !canLab ? null : canLabResults ? (
    <DeskSection
      title={tx('home.labSection', 'Laboratory bench')}
      query={labHome}
      open={{
        icon: 'flask',
        tint: 'green',
        title: tx('home.openLab', 'Open the Lab desk'),
        route: doctorRoutes.lab(),
      }}
      tx={tx}
    >
      {(d) => (
        <CardStack spacing="sm">
          {d.counts.urgent > 0 && (
            <Card variant="flush">
              <CountTile
                icon="alert-triangle"
                tint="red"
                count={d.counts.urgent}
                label={tx('home.tileUrgentOrders', 'Urgent orders')}
                emphasise
                onPress={() => router.push(doctorRoutes.lab())}
              />
            </Card>
          )}
          <Card variant="flush">
            <CountTile
              icon="syringe"
              tint="amber"
              count={d.counts.awaiting_collection}
              label={tx('home.tileAwaitingCollection', 'Awaiting collection')}
              onPress={() => router.push(doctorRoutes.lab())}
            />
          </Card>
          <Card variant="flush">
            <CountTile
              icon="flask"
              tint="blue"
              count={d.counts.awaiting_results}
              label={tx('home.tileAwaitingResults', 'Awaiting results')}
              onPress={() => router.push(doctorRoutes.lab())}
            />
          </Card>
          <Card variant="flush">
            <CountTile
              icon="activity"
              tint="purple"
              count={d.counts.in_progress}
              label={tx('home.tileInProgress', 'In progress')}
              onPress={() => router.push(doctorRoutes.lab())}
            />
          </Card>
          <Card variant="flush">
            <CountTile
              icon="clipboard"
              tint="amber"
              count={d.counts.requests_pending}
              label={tx('home.tileTestRequests', 'Test requests to review')}
              onPress={() => router.push(doctorRoutes.lab())}
            />
          </Card>
          <FigureRow
            icon="check-double"
            tint="green"
            count={d.counts.resulted_today}
            title={tx('home.tileResultedToday', 'Resulted today')}
            subtitle={tx('home.tileResultedTodaySub', 'Released to patients and clinicians')}
            onPress={() => router.push(doctorRoutes.lab())}
          />
        </CardStack>
      )}
    </DeskSection>
  ) : (
    // Sample collection only: the lab home route is lab_results-gated, so no
    // counts are asked for — one honest row into the bench.
    <>
      <SectionHeader style={styles.sectionGap} title={tx('home.labSection', 'Laboratory bench')} />
      <Card variant="flush">
        <ListRow
          icon="syringe"
          tint="green"
          title={tx('home.openLab', 'Open the Lab desk')}
          subtitle={tx('home.openLabCollectionSub', 'Sample collection for orders at your facility')}
          onPress={() => router.push(doctorRoutes.lab())}
        />
      </Card>
    </>
  );

  const deskSection = !canFrontDesk ? null : (
    <>
      <DeskSection
        title={tx('home.deskSection', 'Front desk')}
        query={deskHome}
        open={{
          icon: 'calendar',
          tint: 'blue',
          title: tx('home.openDesk', 'Open today’s book'),
          route: doctorRoutes.desk,
        }}
        tx={tx}
      >
        {(d) => (
          <CardStack spacing="sm">
            <Card variant="flush">
              <FigureRow
                icon="calendar"
                tint="blue"
                count={d.counts.today_total}
                title={tx('home.tileAppointments', 'Appointments today')}
                subtitle={tx('home.tileBookSub', 'Every provider at your facility')}
                onPress={() => router.push(doctorRoutes.desk)}
              />
            </Card>
            <Card variant="flush">
              <CountTile
                icon="clock"
                tint="amber"
                count={d.counts.awaiting_confirmation}
                label={tx('home.tileAwaitingConfirmation', 'Awaiting confirmation')}
                onPress={() => router.push(doctorRoutes.desk)}
              />
            </Card>
            <Card variant="flush">
              <FigureRow
                icon="check-circle"
                tint="green"
                count={d.counts.checked_in}
                title={tx('home.tileCheckedIn', 'Checked in')}
                subtitle={tx('home.tileCheckedInSub', 'Arrived and waiting to be seen')}
                onPress={() => router.push(doctorRoutes.desk)}
              />
            </Card>
            <Card variant="flush">
              <FigureRow
                icon="alert-circle"
                tint={d.counts.no_show > 0 ? 'red' : 'green'}
                count={d.counts.no_show}
                title={tx('home.tileNoShow', 'No-shows')}
                onPress={() => router.push(doctorRoutes.desk)}
              />
            </Card>
            <Card variant="flush">
              <FigureRow
                icon="close"
                tint="amber"
                count={d.counts.cancelled}
                title={tx('home.tileCancelled', 'Cancelled today')}
                onPress={() => router.push(doctorRoutes.desk)}
              />
            </Card>
          </CardStack>
        )}
      </DeskSection>
      <SectionHeader style={styles.sectionGap} title={tx('home.deskActions', 'At the desk')} />
      <CardStack spacing="sm">
        <Card variant="flush">
          <ListRow
            icon="calendar-plus"
            tint="blue"
            title={tx('home.bookAppointment', 'Book an appointment')}
            subtitle={tx('home.bookAppointmentSub', 'By Health ID, with any provider at your facility')}
            onPress={() => router.push(doctorRoutes.deskNewAppointment())}
          />
        </Card>
        <Card variant="flush">
          <ListRow
            icon="folder-plus"
            tint="green"
            title={tx('home.registerPatient', 'Register a patient')}
            subtitle={tx('home.registerPatientSub', 'For someone with no Health ID yet — a match is never bypassed')}
            onPress={() => router.push(doctorRoutes.deskRegisterPatient)}
          />
        </Card>
      </CardStack>
    </>
  );

  // Messages, for a non-clinician role that holds messaging (the clinician's
  // figure is inside the doctor home payload below). A count we do not have
  // is a link without a number — never a zero.
  const messagesSection =
    isClinician || !canMessage ? null : (
      <>
        <SectionHeader style={styles.sectionGap} title={tx('home.messagesSection', 'Messages')} />
        <CardStack spacing="sm">
          {unread.data ? (
            <Card variant="flush">
              <CountTile
                icon="chat"
                tint="blue"
                count={unread.data.unread_threads}
                label={tx('home.tileUnreadThreads', 'Unread conversations')}
                onPress={() => router.push(doctorRoutes.messages)}
              />
            </Card>
          ) : (
            <Card variant="flush">
              <ListRow
                icon="chat"
                tint="blue"
                title={tx('home.tileUnreadThreads', 'Unread conversations')}
                subtitle={tx('home.tileMessagesUnknown', 'Open to see what is waiting for you')}
                onPress={() => router.push(doctorRoutes.messages)}
              />
            </Card>
          )}
        </CardStack>
      </>
    );

  // ── The clinician's day ─────────────────────────────────────────────────
  // The "waiting on you" card only when at least one of its tiles is this
  // role's to see — an empty card would read as "nothing is waiting".
  const waitingTiles = canResults || canMessage || canSchedule;

  let doctorBody: React.ReactNode = null;
  if (!isClinician) {
    doctorBody = null;
  } else if (home.isPending) {
    doctorBody = <LoadingBlock label={tx('home.loading', 'Loading your day…')} />;
  } else if (home.isError && data === undefined) {
    const notServed = isDoctorFeatureUnserved(home.error);
    doctorBody = (
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
                "Clinician data isn't connected yet. Your day, your counts and your results will appear here once the clinician service is enabled for this app.",
              )
            : describeFailure(home.error).message
        }
        actionLabel={tr('opesCore.common.retry')}
        onAction={reload}
      />
    );
  } else if (data) {
    doctorBody = (
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
              { count: data.counts.critical_unacknowledged },
            )}
            message={tx(
              'home.criticalBannerBody',
              'A critical result stays unacknowledged until you open it and confirm. Open the inbox to review.',
            )}
          />
        )}

        {waitingTiles && (
          <>
            <SectionHeader style={styles.sectionGap} title={tx('home.waitingOnYou', 'Waiting on you')} />
            <CardStack spacing="sm">
              {canResults && (
                <Card variant="flush">
                  <CountTile
                    icon="alert-circle"
                    tint="red"
                    count={data.counts.unacknowledged_results}
                    label={tx('home.tileResults', 'Results to acknowledge')}
                    emphasise={data.counts.critical_unacknowledged > 0}
                    onPress={() => router.push(doctorRoutes.results)}
                  />
                </Card>
              )}
              {canMessage && (
                <Card variant="flush">
                  <CountTile
                    icon="chat"
                    tint="blue"
                    count={data.counts.unread_messages}
                    label={tx('home.tileMessages', 'Unread patient messages')}
                    onPress={() => router.push(doctorRoutes.messages)}
                  />
                </Card>
              )}
              {canSchedule && (
                <Card variant="flush">
                  <CountTile
                    icon="calendar"
                    tint="purple"
                    count={data.counts.appointments_today}
                    label={tx('home.tileAppointments', 'Appointments today')}
                    onPress={() => router.push(doctorRoutes.schedule)}
                  />
                </Card>
              )}
              {canSchedule && (
                <CardStack spacing="sm">
                  {requestTotal === null ? (
                    // The count could not be read. A link, not a number we don't have.
                    <Card variant="flush">
                      <ListRow
                        icon="clipboard"
                        tint="amber"
                        title={tx('schedule.requestsAction', 'Appointment requests')}
                        subtitle={tx('home.tileRequestsUnknown', 'Open to see what is awaiting your decision')}
                        onPress={() => router.push(doctorRoutes.requests)}
                      />
                    </Card>
                  ) : (
                    <Card variant="flush">
                      <CountTile
                        icon="clipboard"
                        tint="amber"
                        count={requestTotal}
                        label={tx('schedule.requestsAction', 'Appointment requests')}
                        onPress={() => router.push(doctorRoutes.requests)}
                      />
                    </Card>
                  )}
                </CardStack>
              )}
            </CardStack>
          </>
        )}

        {canResults && data.urgent_results.length > 0 && (
          <>
            <SectionHeader
              style={styles.sectionGap}
              title={tx('home.urgentResults', 'Most urgent results')}
              actionLabel={tx('home.viewAll', 'View all')}
              onAction={() => router.push(doctorRoutes.results)}
            />
            <ResultList>
              {data.urgent_results.map((r) => (
                <Card key={r.id} variant="flush">
                  <ResultRow result={r} onPress={() => router.push(doctorRoutes.result(r.id))} />
                </Card>
              ))}
            </ResultList>
          </>
        )}

        {canSchedule && (
          <>
            <SectionHeader
              style={styles.sectionGap}
              title={tx('home.nextToday', 'Next today')}
              actionLabel={data.counts.appointments_today > 0 ? tx('home.fullSchedule', 'Full schedule') : undefined}
              onAction={data.counts.appointments_today > 0 ? () => router.push(doctorRoutes.schedule) : undefined}
            />
            {data.next_appointments.length === 0 ? (
              <EmptyState
                icon="calendar-check"
                tint="blue"
                title={tx('home.nothingTodayTitle', 'Nothing booked today')}
                message={tx('home.nothingTodayBody', 'You have no appointments scheduled for today.')}
              />
            ) : (
              <ResultList>
                {data.next_appointments.map((a) =>
                  a.scheduled_at ? (
                    <Card key={a.id} variant="flush">
                      <ScheduleRow
                        appointment={asScheduleRow(a, a.scheduled_at)}
                        onPress={() => router.push(doctorRoutes.appointment(a.id))}
                      />
                    </Card>
                  ) : (
                    <Card key={a.id} variant="flush">
                      {/* A time-first row with no time would print a clock it does
                          not have. This one says so instead. */}
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
                    </Card>
                  ),
                )}
              </ResultList>
            )}
          </>
        )}
      </>
    );
  }

  // The footer only once at least one server-counted figure is on screen.
  const anyFigures =
    (isClinician && !!data) ||
    (canDispense && !!pharmacyHome.data) ||
    (canLabResults && !!labHome.data) ||
    (canFrontDesk && !!deskHome.data);

  // Header subtitle: the clinician's name from their home payload, else the
  // facility the desk counts were made for. Nothing when neither has landed.
  const subtitle =
    data?.provider.name ??
    pharmacyHome.data?.facility?.name ??
    labHome.data?.facility?.name ??
    deskHome.data?.facility?.name ??
    undefined;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('home.title', 'Today')}
        subtitle={subtitle}
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
            // The profile route is registered href:null (it is not one of the
            // tab slots), so without this action it would be reachable by URL
            // only — which this project does not allow for any feature.
            icon: 'person',
            accessibilityLabel: tx('profile.title', 'My profile'),
            onPress: () => router.push(doctorRoutes.profile),
          },
        ]}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={fetching && !pending} onRefresh={reload} tintColor={colors.blue} />}
      >
        {stale}
        {identifySection}
        {writeSection}
        {pharmacySection}
        {stockSection}
        {labSection}
        {deskSection}
        {messagesSection}
        {doctorBody}

        {anyFigures && (
          <View style={styles.footer}>
            <Icon name="shield-check" size={16} color={colors.textMuted} />
            <Text style={styles.footerText}>
              {tx(
                'home.countedLive',
                'These figures are counted live on the hospital record each time this screen loads.',
              )}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Desk section: figures when the desk answers, one honest row when not ──

/**
 * One desk's block. Four states, four different claims:
 *   • loading    — nothing is asserted;
 *   • unserved   — this host does not serve the desk's home route (a
 *                  bodyless 404 / 501): ONE row into the desk, and a line
 *                  saying live counts are not available here. Never an empty
 *                  desk dressed as a quiet one;
 *   • failed     — the read failed for another reason: named, with a retry,
 *                  and the row into the desk still there;
 *   • data       — the server's figures, drawn by `children`.
 */
function DeskSection<T>({
  title,
  query,
  open,
  tx,
  children,
}: {
  title: string;
  query: UseQueryResult<T, unknown>;
  open: { icon: IconName; tint: Tint; title: string; route: string };
  tx: Tx;
  children: (data: T) => React.ReactNode;
}) {
  const router = useRouter();
  const failed = query.isError && query.data === undefined;
  const unserved = failed && isDeskHomeUnserved(query.error);

  return (
    <>
      <SectionHeader
        style={{ marginTop: spacing.md }}
        title={title}
        actionLabel={failed && !unserved ? tx('home.retry', 'Retry') : tx('home.openDeskAction', 'Open')}
        onAction={failed && !unserved ? () => void query.refetch() : () => router.push(open.route)}
        actionChevron={!(failed && !unserved)}
      />
      {query.isPending ? (
        <LoadingBlock label={tx('home.loadingDesk', 'Counting…')} />
      ) : query.data !== undefined ? (
        children(query.data)
      ) : (
        <>
          {failed && !unserved && (
            <NoticeBanner
              icon="alert-circle"
              tone="warning"
              title={tx('home.deskFailedTitle', 'The desk’s figures could not be read')}
              message={describeFailure(query.error).message}
            />
          )}
          <Card variant="flush">
            <ListRow
              icon={open.icon}
              tint={open.tint}
              title={open.title}
              subtitle={
                unserved
                  ? tx('home.deskNotServed', 'Live counts are not available on this server yet.')
                  : tx('home.deskOpenAnyway', 'Open the desk to see what is waiting.')
              }
              onPress={() => router.push(open.route)}
            />
          </Card>
        </>
      )}
    </>
  );
}

/** A server figure that is a fact rather than a queue — no "waiting on you" line. */
function FigureRow({
  icon,
  tint,
  count,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  tint: Tint;
  count: number;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <ListRow
      icon={icon}
      tint={tint}
      title={title}
      subtitle={subtitle}
      trailing={<Text style={[tileStyles.tileCount, { color: colors.textPrimary }]}>{count}</Text>}
      onPress={onPress}
    />
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: {
      padding: spacing.md,
      paddingBottom: spacing.xxl,
      gap: spacing.sm,
    },
    // Headings sat 8px under the card above but 18px over their own card, so
    // each read as a caption of the previous block; this restores the grouping.
    sectionGap: { marginTop: spacing.md },

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
