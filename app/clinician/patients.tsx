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
 * i18n: the `opesDoctor.search.*` catalogue was written for the NAME search
 * this screen deliberately does not do (`search.placeholder` reads "Name or
 * medical record number"). Those keys are left alone — locale files are not
 * edited here — and the ID-specific strings carry English `defaultValue`s
 * until keys for them land. Reused as-is: `search.title`, `search.searching`,
 * `search.years`, `search.allergiesBadge`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
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
  type ChartPatient,
  type StaffAppointment,
} from '@/lib/api/doctorQueries';
import { sexLabel } from '@/components/doctor/chartShared';
import { patientName, staffTypeLabel } from '@/components/doctor/scheduleShared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';

/** 404 / 501: no such patient — or no such route. See the header comment. */
function isNotServed(e: unknown): boolean {
  const status = axios.isAxiosError(e) ? e.response?.status : undefined;
  return status === 404 || status === 501;
}

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

  const [entry, setEntry] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [request, setRequest] = useState<LookupRequest | null>(null);
  const nonce = useRef(0);

  // Nothing is sent until a full, plausible Health ID has been submitted:
  // the hook itself is `enabled: isPlausibleHealthId(...)`.
  const lookup = usePatientLookup(request?.healthId);
  const match = lookup.data ?? null;

  // A match opens the chart. Guarded per submission, so returning to this tab
  // does not bounce the clinician straight back into the chart they just left,
  // and a second press on the same ID still opens it.
  const openedFor = useRef(-1);
  useEffect(() => {
    if (!request || !match) return;
    if (openedFor.current === request.nonce) return;
    openedFor.current = request.nonce;
    router.push(doctorRoutes.patient(match.id));
  }, [request, match, router]);

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
  const today = isoDay(new Date());
  const schedule = useDoctorSchedule({ from: today, to: today });
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
    const ambiguous = isNotServed(lookup.error);
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
    result = (
      <>
        <SectionHeader title={tx('search.matchTitle', 'Match')} />
        <Card variant="flush">
          <PatientRow
            patient={match}
            onPress={() => router.push(doctorRoutes.patient(match.id))}
            tx={tx}
          />
        </Card>
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
            placeholder={tx('search.idPlaceholder', 'e.g. OPES-24-AEDL-4L8D')}
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

        {result}

        <TodaySection
          rows={todayRows}
          loading={schedule.isPending}
          failed={schedule.isError && schedule.data === undefined}
          failure={schedule.isError ? describeFailure(schedule.error).message : null}
          onRetry={() => void schedule.refetch()}
          onOpen={(a) => router.push(doctorRoutes.patient(chartIdOf(a)))}
          tx={tx}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Rows ──────────────────────────────────────────────────────────────────

/**
 * The matched patient.
 *
 * `has_allergies` is the server's own flag and is shown so a clinician knows
 * there is something to read before opening the chart. It is a POINTER, never
 * a summary — and its absence is never rendered as "no allergies". Only the
 * chart's `AllergyBlock`, after a successful read of the allergy list, is
 * allowed to make that claim.
 */
function PatientRow({
  patient: p,
  onPress,
  tx,
}: {
  patient: ChartPatient;
  onPress: () => void;
  tx: (key: string, defaultValue: string, params?: Record<string, unknown>) => string;
}) {
  const age = p.age !== null ? tx('search.years', '{{count}} yrs', { count: p.age }) : null;
  return (
    <ListRow
      icon="person"
      tint={p.has_allergies ? 'red' : 'blue'}
      title={p.name}
      meta={[p.health_id, age, p.sex ? sexLabel(p.sex) : null]}
      trailing={
        p.has_allergies ? (
          <StatusBadge
            status="critical"
            label={tx('search.allergiesBadge', 'Allergies')}
            tone="critical"
            icon="alert-triangle"
            size="sm"
          />
        ) : undefined
      }
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
    section: { gap: 0 },
  });
