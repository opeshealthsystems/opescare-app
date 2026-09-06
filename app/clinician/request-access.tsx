/**
 * Doctor — Ask a patient for access to their record (`/clinician/request-access`).
 *
 * ── WHY THIS SCREEN EXISTS ────────────────────────────────────────────────
 *
 * The chart refuses a patient this clinician has no relationship with:
 *
 *     403 NO_CLINICAL_RELATIONSHIP
 *     "… Ask the patient to grant your facility access …"
 *     required_action: 'request_consent'
 *
 * and until now there was no way to ask. `consent_requests` could only be
 * written by a service no route reached, the patient's consent inbox was
 * structurally always empty, and the chart's fifth access basis —
 * `consent_grant` — was unreachable in practice. This screen is the ask.
 *
 * ── WHAT IT IS CAREFUL ABOUT ──────────────────────────────────────────────
 *
 * 1. THE PATIENT IS A GATE, NOT A FIELD. EXACT Health ID only — no name
 *    search, no partial match, no result list (platform policy; see
 *    `app/clinician/patients.tsx`). The ID is normalised and refused
 *    client-side unless it is plausible, so a prefix is never even sent. The
 *    match is then shown on a card and NOTHING can be chosen until the
 *    clinician presses "Ask this patient" — looking a patient up is not the
 *    same act as sending them a request about their own record.
 *
 * 2. IT ASKS FOR THE LEAST IT CAN. Scope is a multi-select that starts at the
 *    record summary alone and the duration list starts at 24 hours. A consent
 *    screen whose defaults are "everything, for a month" is a consent screen
 *    that trains patients to stop reading.
 *
 * 3. THE FACILITY IS NEVER SENT. It comes from the clinician's token
 *    server-side. There is no facility field on this screen and there must
 *    never be one.
 *
 * 4. NEVER A FAKE SUCCESS. If the POST gets NO answer at all the outcome is
 *    genuinely unknown — the request may well have been created and the
 *    patient may already be looking at it — and the screen says THAT rather
 *    than a "failed" that invites a second tap the one-open-request rule will
 *    refuse. See `askOutcomeIsUncertain()` in
 *    `lib/api/consentRequestQueries.ts`.
 *
 * 5. IT DOES NOT ASK FOR WHAT IT ALREADY HAS. The lookup already answers
 *    `consent_granted`, and the server refuses a pointless ask with 409
 *    ALREADY_GRANTED; both are surfaced as an explanation, not an error.
 *
 * ── ROUTE WIRING (owned elsewhere — see the report) ───────────────────────
 * `app/clinician/_layout.tsx` needs `<Tabs.Screen name="request-access"
 * options={{ href: null }} />` or this file becomes a sixth tab button, and
 * `components/doctor/chartRoutes.ts` should carry the path. Both are contended
 * files, so this screen uses the literal path and neither is edited here.
 *
 * i18n: every string goes through `opesDoctor.consentRequest.*` with an
 * English `defaultValue` until the keys land; the catalogue wins the moment
 * they do. Locale files are NOT edited here — the new keys are staged in
 * `lib/i18n/pending/consent_requests.{en,fr}.json`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGate } from '@/components/doctor/RoleGate';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  StepProgress,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import {
  usePatientLookup,
  ageFromDateOfBirth,
  type PatientLookupResult,
} from '@/lib/api/doctorQueries';
import {
  GRANT_DURATION_CHOICES,
  GRANT_DURATION_EN,
  GRANT_DURATION_KEY,
  HEALTH_ID_MIN_LENGTH,
  LIMITS,
  askOutcomeIsUncertain,
  consentRequestConflict,
  consentRequestErrorMessage,
  hoursUntil,
  isConsentRequestSurfaceUnavailable,
  isPatientNotFound,
  isPlausibleHealthId,
  normaliseHealthId,
  statusTone,
  useConsentRequestOptions,
  useCreateConsentRequest,
  useFacilityConsentRequests,
  useWithdrawConsentRequest,
  type ConsentVocabularyItem,
  type FacilityConsentRequest,
  type GrantDurationChoice,
} from '@/lib/api/consentRequestQueries';

/** `opesDoctor.consentRequest.<key>` with a readable English default. */
type Tx = (key: string, defaultValue: string, params?: Record<string, unknown>) => string;

/**
 *   patient → compose → sent
 *        └──── outbox (what this facility has asked for; reachable from either)
 */
type Stage = 'patient' | 'compose' | 'sent' | 'outbox';

/** The least that can be asked for — and where the form starts. */
const DEFAULT_SCOPE = ['patient.summary'];

/**
 * Fallbacks used only until GET /options answers — and, if that call fails,
 * for as long as the clinician stays on the screen.
 *
 * They were English string literals, which made this the last place in the
 * app where the consent vocabulary existed twice: the server serves these
 * labels out of lang/{en,fr}/consent_requests.php, and a French clinician
 * still read "Record summary" until the fetch landed. Building them through
 * `tx()` keeps them a fallback while making them a TRANSLATED one — the
 * English text below is the i18n default, so nothing changed for English.
 *
 * The codes are the contract and stay literal: they are what gets submitted,
 * what the patient's screen resolves, and what the grant is written against.
 */
const buildFallbackPurposes = (tx: Tx): ConsentVocabularyItem[] => [
  { value: 'treatment', label: tx('fallbackPurpose.treatment', 'Treating this patient') },
  { value: 'referral', label: tx('fallbackPurpose.referral', 'A referral') },
  { value: 'second_opinion', label: tx('fallbackPurpose.second_opinion', 'A second opinion') },
  { value: 'continuity_of_care', label: tx('fallbackPurpose.continuity_of_care', 'Continuity of care') },
  { value: 'emergency_followup', label: tx('fallbackPurpose.emergency_followup', 'Follow-up after emergency care') },
];

const buildFallbackScopes = (tx: Tx): ConsentVocabularyItem[] => [
  { value: 'patient.summary', label: tx('fallbackScope.patient_summary', 'Record summary') },
  { value: 'allergies.read', label: tx('fallbackScope.allergies_read', 'Allergies') },
  { value: 'problems.read', label: tx('fallbackScope.problems_read', 'Ongoing problems') },
  { value: 'encounters.read', label: tx('fallbackScope.encounters_read', 'Visits and consultations') },
  { value: 'vitals.read', label: tx('fallbackScope.vitals_read', 'Vital signs') },
  { value: 'medications.read', label: tx('fallbackScope.medications_read', 'Medicines and prescriptions') },
  { value: 'diagnoses.read', label: tx('fallbackScope.diagnoses_read', 'Diagnoses') },
  { value: 'orders.read', label: tx('fallbackScope.orders_read', 'Laboratory and imaging orders') },
];

/**
 * Role gate — request_access. A role without it never mounts the screen
 * below, so none of its queries run and the server is never asked what it
 * would refuse (`lib/staffCapabilities.ts`, mirror of config/staff_capabilities.php).
 */
export default function RequestAccessScreen() {
  return (
    <RoleGate need={['request_access']}>
      <RequestAccessScreenBody />
    </RoleGate>
  );
}

function RequestAccessScreenBody() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const params = useLocalSearchParams<{ health_id?: string }>();

  const tx = useCallback<Tx>(
    (key, defaultValue, p) => String(t(`opesDoctor.consentRequest.${key}`, { defaultValue, ...p })),
    [t],
  );

  // ── The patient ─────────────────────────────────────────────────────────
  // `entry` is what is typed; `submitted` is the normalised ID that was
  // actually looked up; `patient` is who the clinician CONFIRMED. Only the
  // third can be asked.
  const [entry, setEntry] = useState(() => params.health_id ?? '');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(
    params.health_id && isPlausibleHealthId(params.health_id) ? normaliseHealthId(params.health_id) : null,
  );
  const [patient, setPatient] = useState<PatientLookupResult | null>(null);

  const lookup = usePatientLookup(submitted);
  const match = lookup.data ?? null;

  // ── The ask ─────────────────────────────────────────────────────────────
  const [purpose, setPurpose] = useState('treatment');
  const [scope, setScope] = useState<string[]>(DEFAULT_SCOPE);
  const [durationHours, setDurationHours] = useState<GrantDurationChoice>(24);
  const [justification, setJustification] = useState('');

  const [stage, setStage] = useState<Stage>('patient');
  const [sent, setSent] = useState<FacilityConsentRequest | null>(null);
  const [outboxOpenOnly, setOutboxOpenOnly] = useState(true);

  const options = useConsentRequestOptions();
  const create = useCreateConsentRequest();
  const withdraw = useWithdrawConsentRequest();
  const outbox = useFacilityConsentRequests(outboxOpenOnly ? 'open' : '', {
    enabled: stage === 'outbox',
  });

  const fallbackPurposes = useMemo(() => buildFallbackPurposes(tx), [tx]);
  const fallbackScopes = useMemo(() => buildFallbackScopes(tx), [tx]);
  const purposes = options.data?.purposes.length ? options.data.purposes : fallbackPurposes;
  const scopes = options.data?.scopes.length ? options.data.scopes : fallbackScopes;

  // If the server's vocabulary does not contain the purpose this screen
  // started on, follow the server rather than sending a value it will reject.
  useEffect(() => {
    if (purposes.length > 0 && !purposes.some((p) => p.value === purpose)) {
      setPurpose(purposes[0].value);
    }
  }, [purposes, purpose]);

  // ── Lookup ──────────────────────────────────────────────────────────────

  const submitLookup = useCallback(() => {
    const healthId = normaliseHealthId(entry);
    if (!isPlausibleHealthId(healthId)) {
      setEntryError(
        tx(
          'idInvalid',
          'Enter the full Health ID — at least {{min}} characters, letters, digits and dashes only. This app cannot search by name.',
          { min: HEALTH_ID_MIN_LENGTH },
        ),
      );
      setSubmitted(null);
      return;
    }
    setEntryError(null);
    setSubmitted(healthId);
  }, [entry, tx]);

  const clearLookup = useCallback(() => {
    setEntry('');
    setEntryError(null);
    setSubmitted(null);
    setPatient(null);
  }, []);

  /** The checkpoint: looking a patient up is not choosing to write to them. */
  const choosePatient = useCallback((found: PatientLookupResult) => {
    setPatient(found);
    setStage('compose');
  }, []);

  // ── Scope ───────────────────────────────────────────────────────────────

  const toggleScope = useCallback((value: string) => {
    setScope((current) =>
      current.includes(value) ? current.filter((s) => s !== value) : [...current, value],
    );
  }, []);

  // ── Sending ─────────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    if (!patient) return;
    try {
      const created = await create.mutateAsync({
        health_id: patient.health_id,
        purpose,
        scope,
        duration_hours: durationHours,
        justification: justification.trim() === '' ? undefined : justification.trim(),
      });
      setSent(created);
      setStage('sent');
    } catch (error) {
      // An ask that got NO answer may well have landed. Saying "failed" here
      // invites a second tap that the one-open-request rule refuses with a
      // 409 the clinician cannot make sense of.
      if (askOutcomeIsUncertain(error)) {
        dialog.alert(
          tx('uncertainTitle', 'We do not know whether the request was sent'),
          tx(
            'uncertainBody',
            'The connection dropped before the server answered. The patient may already have this request. Check your requests before asking again.',
          ),
          'warning',
        );
        return;
      }

      const conflict = consentRequestConflict(error);
      if (conflict?.code === 'ALREADY_GRANTED') {
        dialog.alert(
          tx('alreadyGrantedTitle', 'You already have access'),
          conflict.message ??
            tx(
              'alreadyGrantedBody',
              'This patient has already granted your facility access, so there is nothing to ask for. Open their chart.',
            ),
          'success',
        );
        return;
      }
      if (conflict?.code === 'REQUEST_ALREADY_PENDING') {
        dialog.alert(
          tx('pendingTitle', 'Already asked'),
          conflict.message ??
            tx(
              'pendingBody',
              'Your facility has already asked this patient and is waiting for their answer. They are not asked twice.',
            ),
          'info',
        );
        return;
      }
      if (isPatientNotFound(error)) {
        dialog.alert(
          tx('notFoundTitle', 'No patient holds that Health ID'),
          tx('notFoundBody', 'Check the full ID with the patient. It cannot be searched for.'),
          'warning',
        );
        return;
      }
      if (isConsentRequestSurfaceUnavailable(error)) {
        dialog.alert(
          tx('unavailableTitle', 'This server cannot take access requests yet'),
          tx(
            'unavailableBody',
            'Nothing was sent and the patient has not been contacted. Ask your administrator when this will be available.',
          ),
          'warning',
        );
        return;
      }
      dialog.alert(
        tx('failedTitle', 'The request was not sent'),
        consentRequestErrorMessage(error, tx('failedBody', 'Nothing was sent. Please try again.')),
        'critical',
      );
    }
  }, [patient, purpose, scope, durationHours, justification, create, dialog, tx]);

  const durationLabel = useCallback(
    (hours: GrantDurationChoice) =>
      tx(GRANT_DURATION_KEY[hours], GRANT_DURATION_EN[hours]),
    [tx],
  );

  const confirmSend = useCallback(() => {
    if (!patient) return;
    dialog.confirm({
      title: tx('confirmTitle', 'Send this request?'),
      message: tx(
        'confirmMessage',
        '{{name}} ({{healthId}}) will be asked to share {{parts}} part(s) of their record with your facility for {{duration}}. They can refuse.',
        {
          // full_name, not name — this dialog is the last thing a clinician
          // reads before asking a patient to open their record, and it was
          // interpolating an undefined field into the sentence.
          name: patient.full_name?.trim() || patient.health_id,
          healthId: patient.health_id,
          parts: scope.length,
          duration: durationLabel(durationHours),
        },
      ),
      confirmLabel: tx('send', 'Send request'),
      onConfirm: send,
    });
  }, [dialog, patient, scope.length, durationHours, durationLabel, send, tx]);

  const confirmWithdraw = useCallback(
    (row: FacilityConsentRequest) => {
      dialog.confirm({
        title: tx('withdrawConfirmTitle', 'Withdraw this request?'),
        message: tx(
          'withdrawConfirmMessage',
          'The patient will no longer be asked. You can raise a new request afterwards.',
        ),
        confirmLabel: tx('withdraw', 'Withdraw'),
        destructive: true,
        onConfirm: async () => {
          try {
            await withdraw.mutateAsync(row.id);
          } catch (error) {
            dialog.alert(
              tx('failedTitle', 'The request was not sent'),
              consentRequestErrorMessage(
                error,
                tx('withdrawFailed', 'This request could not be withdrawn.'),
              ),
              'critical',
            );
          }
        },
      });
    },
    [dialog, withdraw, tx],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  const showSteps = stage !== 'outbox';
  const stepIndex = stage === 'patient' ? 0 : stage === 'compose' ? 1 : 2;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('title', 'Ask for access')}
        subtitle={
          stage === 'outbox'
            ? tx('outboxSubtitle', 'What your facility has asked for')
            : tx('subtitle', 'A patient decides who may open their record')
        }
        onBack={() => (stage === 'outbox' ? setStage('patient') : router.back())}
        actions={
          stage === 'outbox'
            ? undefined
            : [
                {
                  icon: 'list',
                  accessibilityLabel: tx('outboxTitle', 'Requests you have sent'),
                  onPress: () => setStage('outbox'),
                },
              ]
        }
      />

      {showSteps && (
        <View style={styles.steps}>
          <StepProgress
            steps={[
              { key: 'patient', label: tx('stepPatient', 'Patient') },
              { key: 'compose', label: tx('stepCompose', 'The ask') },
              { key: 'sent', label: tx('stepSent', 'Sent') },
            ]}
            currentIndex={stepIndex}
          />
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          stage === 'outbox' ? (
            <RefreshControl
              refreshing={outbox.isFetching && !outbox.isPending}
              onRefresh={() => void outbox.refetch()}
              tintColor={colors.blue}
            />
          ) : undefined
        }
      >
        {stage === 'patient' && (
          <PatientStage
            entry={entry}
            entryError={entryError}
            submitted={submitted}
            lookup={lookup}
            match={match}
            onChange={setEntry}
            onSubmit={submitLookup}
            onClear={clearLookup}
            onChoose={choosePatient}
            tx={tx}
          />
        )}

        {stage === 'compose' && patient && (
          <ComposeStage
            patient={patient}
            purposes={purposes}
            scopes={scopes}
            purpose={purpose}
            scope={scope}
            durationHours={durationHours}
            justification={justification}
            durationLabel={durationLabel}
            onPurpose={setPurpose}
            onToggleScope={toggleScope}
            onDuration={setDurationHours}
            onJustification={setJustification}
            onChangePatient={() => {
              setStage('patient');
              setPatient(null);
            }}
            onSend={confirmSend}
            sending={create.isPending}
            tx={tx}
          />
        )}

        {stage === 'sent' && sent && (
          <SentStage
            request={sent}
            onAskAnother={() => {
              clearLookup();
              setSent(null);
              setScope(DEFAULT_SCOPE);
              setJustification('');
              setStage('patient');
            }}
            onViewOutbox={() => setStage('outbox')}
            tx={tx}
          />
        )}

        {stage === 'outbox' && (
          <OutboxStage
            openOnly={outboxOpenOnly}
            onFilter={setOutboxOpenOnly}
            rows={outbox.data ?? null}
            loading={outbox.isPending}
            error={outbox.error}
            onWithdraw={confirmWithdraw}
            onAsk={() => setStage('patient')}
            tx={tx}
          />
        )}
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 1 — find and choose the patient
// ═══════════════════════════════════════════════════════════════════════════

function PatientStage({
  entry,
  entryError,
  submitted,
  lookup,
  match,
  onChange,
  onSubmit,
  onClear,
  onChoose,
  tx,
}: {
  entry: string;
  entryError: string | null;
  submitted: string | null;
  lookup: { isPending: boolean; isError: boolean; error: unknown };
  match: PatientLookupResult | null;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onChoose: (p: PatientLookupResult) => void;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  let result: React.ReactNode = null;

  if (!submitted) {
    result = (
      <EmptyState
        icon="id-card"
        title={tx('lookupEmptyTitle', 'Start with the Health ID')}
        message={tx(
          'lookupEmptyBody',
          'A patient can only be found by their full Health ID. There is no search by name — that is deliberate.',
        )}
      />
    );
  } else if (lookup.isPending) {
    result = <LoadingBlock label={tx('lookingUp', 'Looking the Health ID up…')} />;
  } else if (lookup.isError || !match) {
    result = (
      <EmptyState
        icon="alert-circle"
        tint="amber"
        title={tx('notFoundTitle', 'No patient holds that Health ID')}
        message={tx('notFoundBody', 'Check the full ID with the patient. It cannot be searched for.')}
      />
    );
  } else {
    result = (
      <>
        <Card>
          {/*
            `full_name`, not `name`. This endpoint is served by
            MobilePrescribingController::lookupPatient and returns `full_name`;
            `name` was always undefined, so the one card whose entire job is
            confirming you have the right person rendered a BLANK name.
            Falling back to the Health ID keeps it identifying rather than empty.
          */}
          <Text style={styles.name}>{match.full_name?.trim() || match.health_id}</Text>
          <Text style={styles.healthId}>{match.health_id}</Text>
          <View style={styles.facts}>
            {/*
              Derived from date_of_birth: there is no `age` field. The old
              `match.age !== null` guard passed on `undefined` and printed the
              literal string "undefined" next to the label "Age".
            */}
            {ageFromDateOfBirth(match.date_of_birth) !== null && (
              <Fact
                label={tx('age', 'Age')}
                value={String(ageFromDateOfBirth(match.date_of_birth))}
              />
            )}
            {!!match.sex && <Fact label={tx('sex', 'Sex')} value={match.sex} />}
            {!!match.blood_group && (
              <Fact label={tx('bloodGroup', 'Blood group')} value={match.blood_group} />
            )}
          </View>
        </Card>

        {/*
          There is no "you already have access" branch here any more, because
          this screen cannot know. It used to read `match.consent_granted` — a
          field the lookup endpoint does not return — so the check was always
          falsy and the banner never appeared. Nothing was broken by its
          absence, but nothing was gained by pretending to check either.

          The server is the authority: POST refuses with 409 ALREADY_GRANTED
          when a live grant exists, and this screen already renders that
          conflict. Better one accurate refusal from the server than a
          confident-looking check that never ran.
        */}
        <CareButton
          label={tx('useThisPatient', 'Ask this patient')}
          icon="arrow-right"
          onPress={() => onChoose(match)}
        />
      </>
    );
  }

  return (
    <>
      <PillInput
        value={entry}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder={tx('idPlaceholder', 'CM-HID-XXXX-XXXX-XXXX')}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        error={entryError ?? undefined}
        accessibilityLabel={tx('idLabel', "The patient's Health ID")}
      />
      <Text style={styles.hint}>
        {tx('noNameSearch', 'Exact Health ID only. This app cannot look a patient up by name.')}
      </Text>

      <View style={styles.row}>
        <CareButton label={tx('lookUp', 'Look up')} icon="search" onPress={onSubmit} style={styles.grow} />
        {!!submitted && (
          <CareButton
            label={tx('clear', 'Clear')}
            variant="secondary"
            onPress={onClear}
            style={styles.grow}
          />
        )}
      </View>

      {result}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 2 — what is being asked for
// ═══════════════════════════════════════════════════════════════════════════

function ComposeStage({
  patient,
  purposes,
  scopes,
  purpose,
  scope,
  durationHours,
  justification,
  durationLabel,
  onPurpose,
  onToggleScope,
  onDuration,
  onJustification,
  onChangePatient,
  onSend,
  sending,
  tx,
}: {
  patient: PatientLookupResult;
  purposes: ConsentVocabularyItem[];
  scopes: ConsentVocabularyItem[];
  purpose: string;
  scope: string[];
  durationHours: GrantDurationChoice;
  justification: string;
  durationLabel: (hours: GrantDurationChoice) => string;
  onPurpose: (v: string) => void;
  onToggleScope: (v: string) => void;
  onDuration: (v: GrantDurationChoice) => void;
  onJustification: (v: string) => void;
  onChangePatient: () => void;
  onSend: () => void;
  sending: boolean;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tooLong = justification.length > LIMITS.justification;

  return (
    <>
      <Card>
        <View style={styles.pinned}>
          <Icon name="person" size={20} color={colors.blue} />
          <View style={styles.grow}>
            <Text style={styles.pinnedName}>{patient.full_name?.trim() || patient.health_id}</Text>
            <Text style={styles.healthId}>{patient.health_id}</Text>
          </View>
          <CareButton
            label={tx('changePatient', 'Change')}
            variant="secondary"
            size="sm"
            onPress={onChangePatient}
          />
        </View>
      </Card>

      <SectionHeader title={tx('purposeTitle', 'Why are you asking?')} />
      <Text style={styles.hint}>
        {tx('purposeHint', 'The patient sees this reason. It is also what the access is audited against.')}
      </Text>
      <View style={styles.chips}>
        {purposes.map((p) => (
          <Chip
            key={p.value}
            label={p.label}
            selected={p.value === purpose}
            onPress={() => onPurpose(p.value)}
          />
        ))}
      </View>

      <SectionHeader title={tx('scopeTitle', 'What do you need to see?')} />
      <Text style={styles.hint}>
        {tx('scopeHint', 'Ask for the least you need. A patient who is asked for everything stops reading.')}
      </Text>
      <View style={styles.chips}>
        {scopes.map((s) => (
          <Chip
            key={s.value}
            label={s.label}
            selected={scope.includes(s.value)}
            onPress={() => onToggleScope(s.value)}
            accessibilityLabel={s.label}
            accessibilityHint={
              scope.includes(s.value)
                ? tx('scopeRemoveHint', 'Remove this from the request')
                : tx('scopeAddHint', 'Add this to the request')
            }
          />
        ))}
      </View>
      {scope.length === 0 && (
        <NoticeBanner
          icon="alert-circle"
          tone="warning"
          message={tx('scopeNone', 'Choose at least one part of the record to ask for.')}
        />
      )}

      <SectionHeader title={tx('durationTitle', 'For how long?')} />
      <Text style={styles.hint}>
        {tx('durationHint', 'Access ends by itself when this runs out. The patient can revoke it sooner.')}
      </Text>
      <View style={styles.chips}>
        {GRANT_DURATION_CHOICES.map((hours) => (
          <Chip
            key={hours}
            label={durationLabel(hours)}
            selected={hours === durationHours}
            onPress={() => onDuration(hours)}
          />
        ))}
      </View>

      <SectionHeader title={tx('justificationTitle', 'Anything to add?')} />
      <Text style={styles.hint}>
        {tx(
          'justificationHint',
          'Optional, and read by the patient. One plain sentence explaining what you need and why.',
        )}
      </Text>
      <PillInput
        value={justification}
        onChangeText={onJustification}
        placeholder={tx(
          'justificationPlaceholder',
          'e.g. I need your allergy list before prescribing today.',
        )}
        multiline
        numberOfLines={3}
        maxLength={LIMITS.justification}
        error={
          tooLong
            ? tx('justificationTooLong', 'That is longer than {{max}} characters.', {
                max: LIMITS.justification,
              })
            : undefined
        }
        accessibilityLabel={tx('justificationTitle', 'Anything to add?')}
      />

      <CareButton
        label={tx('send', 'Send request')}
        icon="send"
        onPress={onSend}
        loading={sending}
        disabled={scope.length === 0 || tooLong}
      />
      <Text style={styles.footnote}>
        {tx(
          'footnote',
          'Nothing is shared until the patient approves. They may refuse, and refusing costs them nothing.',
        )}
      </Text>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 3 — sent
// ═══════════════════════════════════════════════════════════════════════════

function SentStage({
  request,
  onAskAnother,
  onViewOutbox,
  tx,
}: {
  request: FacilityConsentRequest;
  onAskAnother: () => void;
  onViewOutbox: () => void;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const lapses = hoursUntil(request.expires_at);

  return (
    <>
      <EmptyState
        icon="check-circle"
        tint="green"
        title={tx('sentTitle', 'Request sent')}
        message={tx(
          'sentBody',
          '{{name}} has been notified and will see it in their app. Nothing is shared until they approve.',
          { name: request.patient_name ?? request.patient_health_id ?? '' },
        )}
      />

      <Card>
        <RequestSummary request={request} tx={tx} />
        {lapses !== null && (
          <Text style={styles.hint}>
            {tx('lapsesIn', 'If nobody answers, this request lapses in about {{hours}} hours.', {
              hours: lapses,
            })}
          </Text>
        )}
      </Card>

      <CareButton label={tx('outboxTitle', 'Requests you have sent')} icon="list" variant="secondary" onPress={onViewOutbox} />
      <CareButton label={tx('askAnother', 'Ask another patient')} icon="plus" variant="ghost" onPress={onAskAnother} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The outbox — what this facility has asked for
// ═══════════════════════════════════════════════════════════════════════════

function OutboxStage({
  openOnly,
  onFilter,
  rows,
  loading,
  error,
  onWithdraw,
  onAsk,
  tx,
}: {
  openOnly: boolean;
  onFilter: (v: boolean) => void;
  rows: FacilityConsentRequest[] | null;
  loading: boolean;
  error: unknown;
  onWithdraw: (row: FacilityConsentRequest) => void;
  onAsk: () => void;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (loading) return <LoadingBlock label={tx('outboxLoading', 'Loading your requests…')} />;

  if (error) {
    return (
      <EmptyState
        icon="alert-circle"
        tint="amber"
        title={
          isConsentRequestSurfaceUnavailable(error)
            ? tx('unavailableTitle', 'This server cannot take access requests yet')
            : tx('outboxErrorTitle', 'Your requests could not be loaded')
        }
        message={consentRequestErrorMessage(
          error,
          tx('outboxErrorBody', 'Nothing has changed. Check your connection and try again.'),
        )}
        actionLabel={tx('backToAsk', 'Ask for access')}
        onAction={onAsk}
      />
    );
  }

  return (
    <>
      <View style={styles.chips}>
        <Chip label={tx('outboxOpen', 'Waiting')} selected={openOnly} onPress={() => onFilter(true)} />
        <Chip label={tx('outboxAll', 'All')} selected={!openOnly} onPress={() => onFilter(false)} />
      </View>

      {!rows || rows.length === 0 ? (
        <EmptyState
          icon="shield"
          title={tx('outboxEmptyTitle', 'Nothing waiting')}
          message={tx(
            'outboxEmptyBody',
            'Requests your facility sends appear here with the patient’s answer.',
          )}
          actionLabel={tx('backToAsk', 'Ask for access')}
          onAction={onAsk}
        />
      ) : (
        rows.map((row) => (
          <Card key={row.id}>
            <View style={styles.rowBetween}>
              <View style={styles.grow}>
                <Text style={styles.pinnedName}>
                  {row.patient_name ?? row.patient_health_id ?? '—'}
                </Text>
                <Text style={styles.healthId}>{row.patient_health_id}</Text>
              </View>
              <StatusBadge
                status={row.status}
                tone={statusTone(row.status)}
                label={row.status_label ?? undefined}
              />
            </View>

            <RequestSummary request={row} tx={tx} />

            {row.is_open && (
              <CareButton
                label={tx('withdraw', 'Withdraw')}
                variant="danger"
                size="sm"
                icon="close"
                onPress={() => onWithdraw(row)}
              />
            )}
          </Card>
        ))
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared bits
// ═══════════════════════════════════════════════════════════════════════════

function RequestSummary({ request, tx }: { request: FacilityConsentRequest; tx: Tx }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const grantHours = hoursUntil(request.grant_expires_at);

  return (
    <View style={styles.summary}>
      {!!request.purpose_label && (
        <Fact label={tx('purposeTitle', 'Why are you asking?')} value={request.purpose_label} />
      )}
      {request.scope_labels.length > 0 && (
        <Fact
          label={tx('scopeTitle', 'What do you need to see?')}
          value={request.scope_labels.join(' · ')}
        />
      )}
      {request.duration_hours !== null && (
        <Fact
          label={tx('durationTitle', 'For how long?')}
          value={tx('hours', '{{hours}} hours', { hours: request.duration_hours })}
        />
      )}
      {!!request.justification && (
        <Fact label={tx('justificationTitle', 'Anything to add?')} value={request.justification} />
      )}
      {grantHours !== null && (
        <Fact
          label={tx('grantRunsUntil', 'Access ends in')}
          value={tx('hours', '{{hours}} hours', { hours: grantHours })}
        />
      )}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    steps: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
    content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
    row: { flexDirection: 'row', gap: spacing.sm },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    grow: { flex: 1 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textSecondary,
    },
    footnote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 12,
      lineHeight: 18,
      color: colors.textMuted,
      textAlign: 'center',
    },
    name: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    pinned: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    pinnedName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    healthId: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 13,
      color: colors.textSecondary,
    },
    facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
    summary: { gap: spacing.sm, marginTop: spacing.xs },
    fact: { gap: 2 },
    factLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      color: colors.textMuted,
    },
    factValue: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textPrimary,
    },
  });
}
