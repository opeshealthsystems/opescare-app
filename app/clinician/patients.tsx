/**
 * Doctor — Patient lookup (`/clinician/patients`).
 *
 * Port of `UIUX/src/screens/doctor/PatientSearchScreen.tsx` onto expo-router,
 * the OPES UI kit and this app's doctor foundation — with the one deliberate
 * departure from the source.
 *
 * ── NO NAME SEARCH. NO ENUMERATION. ───────────────────────────────────────
 *
 * The OPES original reads `GET /patients?q=` — a bounded server-side search
 * over name, medical_id and phone. OpesCare forbids that platform-wide: no
 * patient `LIKE`, no prefix search, no fuzzy matching, no listing. A doctor
 * with a phone must not be able to type "Nk" and receive a directory of
 * everyone whose surname starts that way.
 *
 * So this screen is an EXACT HEALTH ID LOOKUP and nothing else:
 *
 *   • one field, one Health ID, one "Look up" press;
 *   • `isPlausibleHealthId` refuses to send anything that is not a full ID
 *     (letters, digits and dashes, at least `HEALTH_ID_MIN_LENGTH` of them),
 *     so the server is never asked a prefix, a name or a wildcard;
 *   • the answer is one patient or none. There is no result LIST to page.
 *
 * The second block is the clinician's OWN diary for today (`useDoctorSchedule`
 * bounded to this date). That is not a patient search — it is the appointments
 * this provider already holds, which they could read on the Schedule tab
 * anyway — and it is the only "recent patients" any hook in this app honestly
 * exposes. Nothing here browses the patient population.
 *
 * ── A 404 IS AMBIGUOUS HERE, AND THE COPY SAYS SO ─────────────────────────
 *
 * The lookup endpoint answers 404 for "no such patient" — and the finder,
 * which serves no `/mobile/doctor/*` route at all yet, answers 404 for "no
 * such route". They are indistinguishable over the wire, so this screen
 * refuses to claim either one. Telling a clinician "no patient carries that
 * Health ID" when the truth is "this server has no clinician service" is
 * exactly the kind of confident wrong answer a chart app must never give.
 *
 * ── WHERE A CONFIRMED IDENTITY LEADS, PER ROLE ────────────────────────────
 * A clinician's match opens the chart. Every other role stays on the identity
 * and is handed to ITS desk, by path (`components/doctor/chartRoutes.ts`) and
 * never by importing a desk screen — the desks are built by other agents:
 *
 *   pharmacist (dispense)         Dispense for this patient → /clinician/pharmacy?health_id=…
 *   receptionist (front_desk)     Check in / book → /clinician/desk/new-appointment?health_id=…
 *   lab (lab_results | sample_collection)   Lab orders → /clinician/lab?health_id=…
 *   + Ask for access, for any role holding `request_access`
 *
 * i18n: the `opesDoctor.search.*` catalogue was written for the NAME search
 * this screen deliberately does not do (`search.placeholder` reads "Name or
 * medical record number"). Those keys are left alone, and the ID-specific
 * strings carry English `defaultValue`s. Reused as-is: `search.title`,
 * `search.searching`, `search.years`, `search.allergiesBadge`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import {
  CareButton,
  LoadingBlock,
  NoticeBanner,
  describeFailure,
  isoDay,
  type Translate,
} from '@/components/care/shared';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  HEALTH_ID_MIN_LENGTH,
  isPlausibleHealthId,
  normaliseHealthId,
  useDoctorSchedule,
  usePatientLookup,
  ageFromDateOfBirth,
  type PatientLookupResult,
  type ChartPatient,
  type StaffAppointment,
  isDoctorFeatureUnserved,
  isDoctorRecordNotFound,
} from '@/lib/api/doctorQueries';
import { sexLabel } from '@/components/doctor/chartShared';
import { patientName, staffTypeLabel } from '@/components/doctor/scheduleShared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';
import { useHasProviderSession, useStaffCapability } from '@/lib/staffCapabilities';

/** One submitted lookup. The nonce lets the same ID be looked up twice. */
type LookupRequest = { healthId: string; nonce: number };

export default function PatientLookupScreen() {
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

  // What this ROLE may do with an identified patient (`lib/staffCapabilities.ts`,
  // the mirror of the server's config/staff_capabilities.php). Identification
  // is open to every professional; the chart, the consent ask, the emergency
  // override and the diary are not, and nothing the server would refuse is drawn.
  const canChart = useStaffCapability('clinical_chart');
  const canRequestAccess = useStaffCapability('request_access');
  const canEmergency = useStaffCapability('emergency_access');
  const holdsSchedule = useStaffCapability('schedule');
  // The desks, for a REAL provider session only — the same decision as the
  // tab bar's (`_layout.tsx`), so a hand-off never points at a tab the bar
  // does not have. The preview persona keeps the clinician's paths.
  const realSession = useHasProviderSession();
  const holdsDispense = useStaffCapability('dispense');
  const holdsFrontDesk = useStaffCapability('front_desk');
  const holdsLab = useStaffCapability('lab_results', 'sample_collection');
  const canDispense = realSession && holdsDispense;
  const canFrontDesk = realSession && holdsFrontDesk;
  const canLab = realSession && holdsLab;
  // The diary below is the clinician's OWN. The front desk holds `schedule`
  // for the FACILITY's book, which is the Desk tab — so no diary here for it.
  const canSchedule = holdsSchedule && !canFrontDesk;
  const params = useLocalSearchParams<{ health_id?: string }>();

  const [entry, setEntry] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [request, setRequest] = useState<LookupRequest | null>(null);
  const nonce = useRef(0);

  // A Health ID handed over by another screen (the scanner's keyboard path)
  // is looked up at once — exactly as if it had been typed here. Once per
  // value, and only a plausible one: nothing partial is ever sent.
  const prefilled = useRef<string | null>(null);
  useEffect(() => {
    const raw = typeof params.health_id === 'string' ? normaliseHealthId(params.health_id) : '';
    if (!raw || prefilled.current === raw || !isPlausibleHealthId(raw)) return;
    prefilled.current = raw;
    setEntry(raw);
    setEntryError(null);
    nonce.current += 1;
    setRequest({ healthId: raw, nonce: nonce.current });
  }, [params.health_id]);

  // Nothing is sent until a full, plausible Health ID has been submitted:
  // the hook itself is `enabled: isPlausibleHealthId(...)`.
  const lookup = usePatientLookup(request?.healthId);
  const match = lookup.data ?? null;

  // A match opens the chart — for a role that holds the chart. Guarded per
  // submission, so returning to this tab does not bounce the clinician straight
  // back into the chart they just left, and a second press on the same ID
  // still opens it. Every other role stays here, on the confirmed identity.
  const openedFor = useRef(-1);
  useEffect(() => {
    if (!canChart || !request || !match) return;
    if (openedFor.current === request.nonce) return;
    openedFor.current = request.nonce;
    router.push(doctorRoutes.patient(match.id));
  }, [canChart, request, match, router]);

  function submit() {
    const healthId = normaliseHealthId(entry);
    if (!isPlausibleHealthId(healthId)) {
      setEntryError(
        tx(
          'search.idInvalid',
          'Enter the full Health ID — at least {{min}} characters, letters, digits and dashes only. This app cannot search by name.',
          { min: HEALTH_ID_MIN_LENGTH }
        )
      );
      setRequest(null);
      return;
    }
    setEntryError(null);
    nonce.current += 1;
    setRequest({ healthId, nonce: nonce.current });
  }

  function clear() {
    setEntry('');
    setEntryError(null);
    setRequest(null);
  }

  // ── The clinician's own day. Not a patient search: these are appointments
  // this provider already holds, bounded to today by an explicit date window
  // rather than trusting a server default.
  // Not asked at all for a role without a diary: the server would only refuse.
  const today = isoDay(new Date());
  const schedule = useDoctorSchedule({ from: today, to: today }, { enabled: canSchedule });
  const todayRows = dedupePatients(schedule.data?.data ?? []);

  let result: React.ReactNode = null;
  if (!request) {
    result = (
      <EmptyState
        icon="id-card"
        tint="blue"
        title={tx('search.idPromptTitle', 'Look a patient up by Health ID')}
        message={tx(
          'search.idPromptBody',
          'Type the full Health ID from the patient’s card, then press Look up. This app never searches by name and never lists patients — an exact Health ID is the only way in.'
        )}
      />
    );
  } else if (lookup.isPending) {
    result = <LoadingBlock label={tx('search.searching', 'Searching…')} />;
  } else if (lookup.isError) {
    // Both halves of the ambiguity the header describes, spelled out. On every
    // other clinician screen a 404 the server ANSWERED (`isDoctorRecordNotFound`)
    // is worth naming separately from a route nothing serves
    // (`isDoctorFeatureUnserved`) — here it is not, because the copy below
    // deliberately declines to guess between "no record carries this Health ID"
    // and "no clinician service on this host". Keeping both in this branch is
    // what preserves that refusal; dropping either would make the screen claim
    // one of the two answers it says it cannot tell apart.
    const ambiguous =
      isDoctorFeatureUnserved(lookup.error) || isDoctorRecordNotFound(lookup.error);
    result = (
      <EmptyState
        icon={ambiguous ? 'person-search' : 'alert-circle'}
        tint={ambiguous ? 'amber' : 'red'}
        title={
          ambiguous
            ? tx('search.idNoAnswerTitle', 'No patient came back for that Health ID')
            : tr('opesCore.errors.unknownTitle')
        }
        message={
          ambiguous
            ? tx(
                'search.idNoAnswerBody',
                'Either no record carries {{healthId}}, or this server does not serve the clinician service yet — both answer the same way, so this screen will not tell you which. Check the ID against the patient’s card, and try again once clinician access is switched on.',
                { healthId: request.healthId }
              )
            : describeFailure(lookup.error).message
        }
        actionLabel={tr('opesCore.common.retry')}
        onAction={() => void lookup.refetch()}
      />
    );
  } else if (match) {
    // The chart only for a role that holds it. Everyone else ends on the
    // confirmed identity — demographics, never clinical history — and is
    // handed to ITS desk by path (`chartRoutes`): the counter, the front
    // desk's booking form, the bench. The consent request is offered only to
    // roles the server would let ask. Nothing the server would refuse is drawn.
    const handOffs: { key: string; label: string; icon: 'pill' | 'calendar-plus' | 'flask' | 'key'; route: string }[] = [];
    if (canDispense) {
      handOffs.push({ key: 'dispense', label: tx('search.dispense', 'Dispense for this patient'), icon: 'pill', route: doctorRoutes.pharmacy(match.health_id) });
    }
    if (canFrontDesk) {
      handOffs.push({ key: 'desk', label: tx('search.checkInBook', 'Check in / book'), icon: 'calendar-plus', route: doctorRoutes.deskNewAppointment(match.health_id) });
    }
    if (canLab) {
      handOffs.push({ key: 'lab', label: tx('search.labOrders', 'Lab orders for this patient'), icon: 'flask', route: doctorRoutes.lab(match.health_id) });
    }
    if (canRequestAccess) {
      handOffs.push({ key: 'ask', label: tx('search.askAccess', 'Ask for access'), icon: 'key', route: doctorRoutes.requestAccess(match.health_id) });
    }
    const roleNote = canFrontDesk
      ? tx('search.deskNote', 'Book or check this patient in from here. Today’s book is in the Desk tab.')
      : canDispense
        ? tx('search.dispenseNote', 'Dispense against this patient’s prescriptions from here. Their chart is not part of your role.')
        : canLab
          ? tx('search.labNote', 'Open this patient’s laboratory orders from here. Their chart is not part of your role.')
          : tx('search.noChartForRole', 'Their chart is not part of your role.');

    result = (
      <>
        <SectionHeader
          title={
            canChart
              ? tx('search.matchTitle', 'Match')
              : tx('search.identifiedTitle', 'Identity confirmed')
          }
        />
        <Card variant="flush">
          <PatientRow
            patient={match}
            onPress={canChart ? () => router.push(doctorRoutes.patient(match.id)) : undefined}
            tx={tx}
          />
        </Card>
        {!canChart && (
          <Card>
            <Text style={styles.note}>{roleNote}</Text>
            {handOffs.length > 0 && (
              <View style={[styles.stack, styles.noteSpaced]}>
                {handOffs.map((h, i) => (
                  <CareButton
                    key={h.key}
                    label={h.label}
                    icon={h.icon}
                    variant={i === 0 ? 'primary' : 'secondary'}
                    onPress={() => router.push(h.route)}
                  />
                ))}
              </View>
            )}
          </Card>
        )}
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('search.title', 'Find a Patient')}
        subtitle={tx('search.idSubtitle', 'Exact Health ID lookup')}
        showBack={false}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={schedule.isFetching && !schedule.isPending}
            onRefresh={() => void schedule.refetch()}
            tintColor={colors.blue}
          />
        }
      >
        <Card>
          <Text style={styles.fieldLabel}>{tx('search.idLabel', 'Health ID')}</Text>
          {/*
            A Health ID field must never be offered the phone's saved names or
            emails: `autoComplete="off"` + `textContentType="none"` is what says
            so on both platforms, and `autoCorrect={false}` stops a keyboard
            rewriting an ID into a word.
          */}
          <PillInput
            icon={<Icon name="id-card" size={18} color={colors.blue} />}
            value={entry}
            onChangeText={(v) => {
              setEntry(v);
              if (entryError) setEntryError(null);
            }}
            onSubmitEditing={submit}
            placeholder={tx('search.idPlaceholder', 'e.g. CM-HID-XXXX-XXXX-XXXX')}
            error={entryError ?? undefined}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            returnKeyType="search"
            accessibilityLabel={tx('search.idLabel', 'Health ID')}
          />
          <View style={styles.actions}>
            <CareButton
              label={tx('search.lookUp', 'Look up')}
              icon="search"
              style={styles.action}
              onPress={submit}
              loading={!!request && lookup.isPending}
              disabled={entry.trim().length === 0}
            />
            <CareButton
              label={tx('search.scanCode', 'Scan code')}
              icon="qr"
              variant="secondary"
              style={styles.action}
              onPress={() => router.push(doctorRoutes.scan)}
            />
            {(entry.length > 0 || !!request) && (
              <CareButton
                label={tx('search.clear', 'Clear')}
                icon="close"
                variant="secondary"
                style={styles.action}
                onPress={clear}
              />
            )}
          </View>
          <Text style={[styles.note, styles.noteSpaced]}>
            {tx(
              'search.noNameSearch',
              'No name search: OpesCare does not allow a patient list or a partial-name lookup on any surface.'
            )}
          </Text>
        </Card>

        {/*
          Emergency access lives HERE, on the lookup screen, and deliberately
          NOT on a refusal.

          The temptation is to offer it the moment a chart 403s — which would
          turn it into a retry button and hollow out the refusal it sits behind.
          A clinician would learn that "no relationship" is a speed bump with a
          text box in front of it. So it is a standing, separately-labelled
          route a clinician chooses on purpose, worded as the exception it is:
          the screen itself then demands an exact Health ID, twenty characters
          of free-text account, and three acknowledgements before anything
          opens, and the patient is told.

          Until now nothing in the app linked to it at all — the screen shipped
          reachable only by typing a URL, which on a phone means not at all.

          Only for roles that hold `emergency_access` (doctors, nurses, medical
          supervisors) — the server refuses everyone else.
        */}
        {canEmergency && (
          <Card variant="flush">
            <ListRow
              icon="alert-triangle"
              tint="red"
              title={tx('emergency.entryTitle', 'Emergency access')}
              subtitle={tx(
                'emergency.entryBody',
                'For an unconscious or unidentified patient with no record of care here. Logged as an override, and the patient is told.'
              )}
              onPress={() => router.push(doctorRoutes.breakGlass)}
            />
          </Card>
        )}

        {result}

        {/* The diary only for a role with a schedule; a row opens the chart for
            a role that holds it and the appointment itself for one that does
            not (the front desk). */}
        {canSchedule && (
          <TodaySection
            rows={todayRows}
            loading={schedule.isPending}
            failed={schedule.isError && schedule.data === undefined}
            failure={schedule.isError ? describeFailure(schedule.error).message : null}
            onRetry={() => void schedule.refetch()}
            onOpen={(a) =>
              router.push(canChart ? doctorRoutes.patient(chartIdOf(a)) : doctorRoutes.appointment(a.id))
            }
            tx={tx}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Rows ──────────────────────────────────────────────────────────────────

/**
 * The matched patient.
 *
 * NO ALLERGY SIGNAL HERE, deliberately. This row used to tint red and show an
 * "Allergies" badge from `has_allergies` — but the lookup endpoint has never
 * returned that field. `MobilePrescribingController::lookupPatient` states its
 * intent plainly: it "identifies a patient, it does not disclose their record",
 * and an allergy flag is clinical history. So the value was always `undefined`,
 * always falsy, and every patient rendered as though nothing had been flagged.
 *
 * The old docblock had the principle exactly right — "its absence is never
 * rendered as 'no allergies'" — and the code did precisely that, silently, for
 * every patient. A blue row that means "not checked" is indistinguishable from
 * one that means "checked, none found", which is the worse of the two to get
 * wrong. Only the chart's `AllergyBlock`, after actually reading the allergy
 * list, may say anything on the subject.
 */
function PatientRow({
  patient: p,
  onPress,
  tx,
}: {
  patient: PatientLookupResult;
  /** Absent for a role without the chart: the row is then a fact, not a door. */
  onPress?: () => void;
  tx: (key: string, defaultValue: string, params?: Record<string, unknown>) => string;
}) {
  // Derived here rather than read off the payload: the lookup returns
  // `date_of_birth`, never `age`. The old `p.age !== null` guard passed on
  // `undefined` and printed the literal string "undefined".
  const years = ageFromDateOfBirth(p.date_of_birth);
  const age = years !== null ? tx('search.years', '{{count}} yrs', { count: years }) : null;
  const name = p.full_name?.trim() || p.health_id;
  return (
    <ListRow
      icon="person"
      tint="blue"
      title={name}
      meta={[p.health_id, age, p.sex ? sexLabel(p.sex) : null]}
      onPress={onPress}
    />
  );
}

/** The chart endpoint is keyed on the Health ID; fall back to the raw id. */
function chartIdOf(a: StaffAppointment): string {
  return a.patient_health_id || a.patient_id;
}

/** One row per patient, first appointment wins — a doctor sees a person once. */
function dedupePatients(rows: StaffAppointment[]): StaffAppointment[] {
  const seen = new Set<string>();
  const out: StaffAppointment[] = [];
  for (const a of rows) {
    const key = chartIdOf(a);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/**
 * The patients this clinician is seeing today.
 *
 * Four distinct states, and they are four different claims:
 *   • loading   — nothing is asserted;
 *   • failed    — say the list could not be READ. An unread diary rendered as
 *                 an empty one reads as "you have no patients today";
 *   • empty     — only after a successful read, and only about this diary;
 *   • rows      — the appointments, deduplicated to one row per patient.
 */
function TodaySection({
  rows,
  loading,
  failed,
  failure,
  onRetry,
  onOpen,
  tx,
}: {
  rows: StaffAppointment[];
  loading: boolean;
  failed: boolean;
  failure: string | null;
  onRetry: () => void;
  onOpen: (a: StaffAppointment) => void;
  tx: (key: string, defaultValue: string, params?: Record<string, unknown>) => string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  let body: React.ReactNode;
  if (loading) {
    body = (
      <Card>
        <Text style={styles.note}>{tx('search.todayLoading', 'Reading your schedule…')}</Text>
      </Card>
    );
  } else if (failed) {
    body = (
      <NoticeBanner
        icon="alert-circle"
        tone="warning"
        title={tx('search.todayFailedTitle', 'Today’s list could not be read')}
        message={`${
          failure ??
          tx('search.todayFailedBody', 'Your schedule did not load. This is not a statement that you have no patients today.')
        } ${tx('search.todayFailedHint', 'Pull down to try again.')}`}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <Card>
        <Text style={styles.note}>
          {tx('search.todayEmpty', 'No appointments on your schedule today.')}
        </Text>
      </Card>
    );
  } else {
    body = (
      <Card variant="flush">
        {rows.map((a, i) => (
          <ListRow
            key={a.id}
            icon="person"
            tint="blue"
            title={patientName(a)}
            meta={[a.patient_health_id, staffTypeLabel(a.appointment_type)]}
            onPress={() => onOpen(a)}
            divider={i < rows.length - 1}
          />
        ))}
      </Card>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader
        title={tx('search.todayTitle', 'Your patients today')}
        actionLabel={failed ? tx('search.todayRetry', 'Retry') : undefined}
        onAction={failed ? onRetry : undefined}
      />
      {body}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },

    fieldLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    note: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    noteSpaced: { marginTop: spacing.sm },
    actions: { flexDirection: 'row', gap: spacing.sm },
    action: { flex: 1 },
    stack: { gap: spacing.sm },
    section: { gap: 0 },
  });
