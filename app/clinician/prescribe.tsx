import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
/**
 * Doctor — Write a prescription (`/clinician/prescribe`).
 *
 * The clinician writing a script FROM THE PHONE: find the patient by Health ID,
 * confirm who they are, write the medicine lines, review, issue. The reference
 * the patient quotes at a pharmacy comes back on the last step.
 *
 * The reference flow is the web prescriber's desk (`/facility/prescriptions/new`,
 * `PrescriberController::create/store`) — same field set, same limits, same
 * "blank lines are dropped, at least one real line is required" rule. This is
 * that desk, re-shaped for a thumb and a small screen.
 *
 * ── THE ONE RISK THIS SCREEN EXISTS TO MANAGE ─────────────────────────────
 *
 * A prescription written against the WRONG PATIENT is the worst thing that can
 * happen here, and a phone makes it easier than a desk does. So the patient is
 * not a field on the form — they are a gate in front of it:
 *
 *   1. EXACT Health ID only. No name search, no partial match, no result list
 *      (platform policy — see `app/clinician/patients.tsx`). The ID is
 *      normalised and refused client-side unless it is plausible, so a prefix
 *      is never even sent.
 *   2. The match is shown on a card — name, Health ID, date of birth, age, sex,
 *      blood group — and NOTHING can be typed until the clinician presses
 *      "Use this patient". Looking a patient up is not the same act as
 *      choosing them.
 *   3. The confirmed patient stays pinned above the form and above the review,
 *      with "Change patient" beside them.
 *   4. Changing the patient after lines have been drafted raises a banner on
 *      the form AND on the review — lines written for someone else are the
 *      exact route to a mis-prescription, and they are never silently
 *      re-targeted.
 *   5. The review step restates the patient and every line, and the confirm
 *      dialog names the patient, their Health ID and the number of medicines.
 *
 * ── NEVER A FAKE SUCCESS ──────────────────────────────────────────────────
 *
 * The three endpoints may land after this screen. If they 404 the screen says
 * so and issues nothing. If the POST gets NO answer at all (timeout, dropped
 * connection) the outcome is genuinely unknown, and the screen says THAT —
 * "we don't know whether it was issued, check the list before writing it
 * again" — rather than a "failed" that invites a duplicate script or a
 * "success" that sends a patient to a pharmacy with a reference that does not
 * exist. See `issueOutcomeIsUncertain()` in `lib/api/prescribingQueries.ts`.
 *
 * i18n: every string goes through `opesDoctor.*`. Keys that do not exist yet
 * carry an English `defaultValue`; the catalogue wins the moment they land.
 * Locale files are NOT edited here. Reused as-is: `search.idLabel`,
 * `search.idPlaceholder`, `search.lookUp`, `search.clear`, `search.idInvalid`,
 * `search.noNameSearch`, `search.idNoAnswerTitle/Body`, `search.years`,
 * `shared.notServedTitle`, `section.dose`, `section.route`, `vocab.route.*`,
 * `vocab.sex.*` (via `sexLabel`), and the whole `opesCore.common.*` set.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGate, RoleRefusedNotice } from '@/components/doctor/RoleGate';
import { isRoleForbidden } from '@/lib/api/roleErrors';
import * as Clipboard from 'expo-clipboard';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  ListRow,
  PillInput,
  ResultList,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  StepProgress,
  formatDate,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import {
  CareButton,
  LoadingBlock,
  NoticeBanner,
  describeFailure,
  type Translate,
} from '@/components/care/shared';
import { sexLabel } from '@/components/doctor/chartShared';
import {
  HEALTH_ID_MIN_LENGTH,
  LIMITS,
  MAX_DRAFT_LINES,
  PRESCRIBING_ROUTES,
  ROUTE_LABEL_EN,
  ROUTE_LABEL_KEY,
  ageFromDob,
  blankLine,
  buildIssuePayload,
  isBlankLine,
  isPlausibleHealthId,
  isPrescribingUnavailable,
  issuableLines,
  issueOutcomeIsUncertain,
  normaliseHealthId,
  patientDisplayName,
  useIssuePrescription,
  usePrescribingPatientLookup,
  usePrescriptionsIWrote,
  validateDraft,
  type DraftLine,
  type DraftProblem,
  type IssuedPrescription,
  type PrescribingPatient,
  type PrescribingRoute,
  type PrescriptionDraft,
} from '@/lib/api/prescribingQueries';

/** `opesDoctor.<key>` with a readable English default until the key lands. */
type Tx = (key: string, defaultValue: string, params?: Record<string, unknown>) => string;

/**
 * Where the clinician is.
 *
 *   patient → compose → review → issued
 *                  └──── written (the list, reachable from either end)
 */
type Stage = 'patient' | 'compose' | 'review' | 'issued' | 'written';

const EMPTY_DRAFT = (): PrescriptionDraft => ({
  lines: [blankLine()],
  notes: '',
  validity_days: '',
});

/**
 * The width one half of a two-column field row asks for, in px.
 *
 * It is the BREAKPOINT, not the final width: the cells grow to fill the row
 * when both fit, and wrap to full width when they do not. 140 puts the break
 * between the two phone widths that matter — a 375px screen leaves the card
 * ~310px of content (two 149px columns), a 320px screen leaves ~255px, which
 * is less than two columns plus the gap, so the pair stacks instead of
 * squeezing "Duration (days)" into something that cannot show its own label.
 */
const PAIR_COLUMN_BASIS = 140;

/**
 * Role gate — prescribe. A role without it never mounts the screen
 * below, so none of its queries run and the server is never asked what it
 * would refuse (`lib/staffCapabilities.ts`, mirror of config/staff_capabilities.php).
 */
export default function PrescribeScreen() {
  usePrivateScreen();
  return (
    <RoleGate need={['prescribe']}>
      <PrescribeScreenBody />
    </RoleGate>
  );
}

function PrescribeScreenBody() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const params = useLocalSearchParams<{ health_id?: string }>();

  const tx = useCallback<Tx>(
    (key, defaultValue, p) => String(t(`opesDoctor.${key}`, { defaultValue, ...p })),
    [t]
  );
  const tr = useCallback<Translate>(
    (key, p) => String(t(key, p as Record<string, unknown>)),
    [t]
  );

  // ── Patient ─────────────────────────────────────────────────────────────
  // `entry` is what is typed; `request` is what was submitted; `patient` is
  // what the clinician CONFIRMED. Only the third one can be prescribed against.
  const [entry, setEntry] = useState(() => params.health_id ?? '');
  const [entryError, setEntryError] = useState<string | null>(null);
  /** The normalised Health ID that was actually submitted, if any. */
  const [request, setRequest] = useState<string | null>(null);
  const [patient, setPatient] = useState<PrescribingPatient | null>(null);

  const lookup = usePrescribingPatientLookup(request);
  const match = lookup.data ?? null;

  // ── Draft ───────────────────────────────────────────────────────────────
  const [draft, setDraft] = useState<PrescriptionDraft>(EMPTY_DRAFT);
  // The patient the lines were last typed against. A mismatch with the
  // confirmed patient is loudly flagged rather than quietly accepted.
  const [draftedFor, setDraftedFor] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);

  const [stage, setStage] = useState<Stage>('patient');
  const [issued, setIssued] = useState<IssuedPrescription | null>(null);

  const issue = useIssuePrescription();
  const written = usePrescriptionsIWrote({ enabled: stage === 'patient' || stage === 'written' });

  const problems = useMemo(() => validateDraft(draft), [draft]);
  const linesToIssue = useMemo(() => issuableLines(draft), [draft]);
  const patientChanged = !!patient && !!draftedFor && draftedFor !== patient.id;

  // ── Editing ─────────────────────────────────────────────────────────────

  const touch = useCallback(() => setDraftedFor(patient?.id ?? null), [patient]);

  const updateLine = useCallback(
    (index: number, patch: Partial<DraftLine>) => {
      setDraft((d) => ({
        ...d,
        lines: d.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
      }));
      touch();
    },
    [touch]
  );

  const addLine = useCallback(() => {
    setDraft((d) => (d.lines.length >= MAX_DRAFT_LINES ? d : { ...d, lines: [...d.lines, blankLine()] }));
  }, []);

  /** At least one line always remains — an empty form has nothing to type into. */
  const removeLine = useCallback(
    (index: number) => {
      setDraft((d) =>
        d.lines.length <= 1
          ? { ...d, lines: [blankLine()] }
          : { ...d, lines: d.lines.filter((_, i) => i !== index) }
      );
      touch();
    },
    [touch]
  );

  // ── Lookup ──────────────────────────────────────────────────────────────

  const submitLookup = useCallback(() => {
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
    setRequest(healthId);
  }, [entry, tx]);

  const clearLookup = useCallback(() => {
    setEntry('');
    setEntryError(null);
    setRequest(null);
  }, []);

  /** The safety checkpoint: looking a patient up is not choosing them. */
  const confirmPatient = useCallback((found: PrescribingPatient) => {
    setPatient(found);
    setShowProblems(false);
    setStage('compose');
  }, []);

  /**
   * Step back to the lookup. The typed lines are KEPT — a clinician who mistyped
   * an ID should not lose the script — but the patient is unset, so nothing can
   * be issued until a new one is confirmed, and `patientChanged` will flag the
   * lines as drafted for someone else.
   */
  const changePatient = useCallback(() => {
    setPatient(null);
    setRequest(null);
    setEntry('');
    setEntryError(null);
    setStage('patient');
  }, []);

  // ── Issuing ─────────────────────────────────────────────────────────────

  const goToReview = useCallback(() => {
    if (problems.length > 0) {
      setShowProblems(true);
      return;
    }
    setStage('review');
  }, [problems]);

  const doIssue = useCallback(async () => {
    if (!patient) return;
    const payload = buildIssuePayload(patient.id, draft);
    if (payload.items.length === 0) {
      dialog.show({
        title: tx('prescribe.problemNoItemsTitle', 'Nothing to issue'),
        message: tx('prescribe.problemNoItems', 'Add at least one medicine with a drug name.'),
        tone: 'warning',
        cancelLabel: tr('opesCore.common.close'),
      });
      return;
    }
    try {
      const created = await issue.mutateAsync(payload);
      setIssued(created);
      setStage('issued');
    } catch (error) {
      const notice = issueFailureNotice(error, tx, tr);
      dialog.show({
        title: notice.title,
        message: notice.message,
        tone: notice.tone,
        cancelLabel: tr('opesCore.common.close'),
      });
    }
  }, [patient, draft, issue, dialog, tx, tr]);

  const askToIssue = useCallback(() => {
    if (!patient) return;
    const name = patientDisplayName(patient) ?? tx('prescribe.nameNotOnRecord', 'Name not on record');
    dialog.confirm({
      title: tx('prescribe.confirmTitle', 'Issue this prescription?'),
      message: tx(
        'prescribe.confirmBody',
        linesToIssue.length === 1
          ? '1 medicine will be issued to {{name}} ({{healthId}}). A prescription is a clinical record: once issued it can be voided with a reason, but never edited.'
          : '{{count}} medicines will be issued to {{name}} ({{healthId}}). A prescription is a clinical record: once issued it can be voided with a reason, but never edited.',
        {
          count: linesToIssue.length,
          name,
          healthId: patient.health_id ?? tx('prescribe.healthIdMissing', 'Health ID not on record'),
        }
      ),
      confirmLabel: tx('prescribe.confirmAction', 'Issue prescription'),
      cancelLabel: tr('opesCore.common.cancel'),
      onConfirm: doIssue,
    });
  }, [patient, linesToIssue.length, dialog, doIssue, tx, tr]);

  /** Back to a clean form, same clinician, no patient. */
  const startOver = useCallback(() => {
    setPatient(null);
    setRequest(null);
    setEntry('');
    setEntryError(null);
    setDraft(EMPTY_DRAFT());
    setDraftedFor(null);
    setShowProblems(false);
    setIssued(null);
    setStage('patient');
  }, []);

  // ── Copy the reference ──────────────────────────────────────────────────
  // The reference is what the patient quotes at the counter, so it has to be
  // liftable off the screen. There is no silent success and no silent failure.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    []
  );
  const copyReference = useCallback(async () => {
    const reference = issued?.reference;
    if (!reference) return;
    let next: 'copied' | 'failed' = 'copied';
    try {
      await Clipboard.setStringAsync(reference);
    } catch {
      next = 'failed';
    }
    setCopyState(next);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState('idle'), 2000);
  }, [issued]);

  // ── Header ──────────────────────────────────────────────────────────────

  const STEPS = useMemo(
    () => [
      { key: 'patient', label: tx('prescribe.stepPatient', 'Patient') },
      { key: 'compose', label: tx('prescribe.stepMedicines', 'Medicines') },
      { key: 'review', label: tx('prescribe.stepReview', 'Review') },
    ],
    [tx]
  );
  const stepIndex = stage === 'patient' ? 0 : stage === 'compose' ? 1 : 2;
  const showSteps = stage !== 'issued' && stage !== 'written';

  /**
   * The header names WHERE THE CLINICIAN IS, not what the screen was opened
   * for. Once the prescription is issued there is nothing left to write, so
   * "Write a prescription — Issued" is a header describing the wrong screen:
   * the title becomes the outcome, and the subtitle goes, because the card
   * underneath already carries the reference and what to do with it.
   */
  const issuedStage = stage === 'issued';
  const title = issuedStage
    ? tx('prescribe.issuedTitle', 'Prescription issued')
    : tx('prescribe.title', 'Write a prescription');

  const subtitle = issuedStage
    ? undefined
    : stage === 'written'
      ? tx('prescribe.subtitleWritten', 'Written by you')
      : tx('prescribe.subtitle', 'Health ID, medicines, issue');

  // ── Body per stage ──────────────────────────────────────────────────────

  let body: React.ReactNode;
  if (stage === 'issued') {
    body = (
      <IssuedBlock
        prescription={issued}
        copyState={copyState}
        onCopy={() => void copyReference()}
        onWriteAnother={startOver}
        onViewList={() => setStage('written')}
        tx={tx}
      />
    );
  } else if (stage === 'written') {
    body = (
      <WrittenList
        rows={written.data ?? null}
        loading={written.isPending}
        error={written.isError ? written.error : null}
        onRetry={() => void written.refetch()}
        onBack={() => setStage(issued ? 'issued' : 'patient')}
        tx={tx}
        tr={tr}
      />
    );
  } else if (stage === 'review') {
    body = (
      <ReviewBlock
        patient={patient}
        lines={linesToIssue}
        draft={draft}
        patientChanged={patientChanged}
        issuing={issue.isPending}
        onBack={() => setStage('compose')}
        onChangePatient={changePatient}
        onIssue={askToIssue}
        tx={tx}
      />
    );
  } else if (stage === 'compose' && patient) {
    body = (
      <ComposeBlock
        patient={patient}
        draft={draft}
        problems={showProblems ? problems : []}
        patientChanged={patientChanged}
        onChangePatient={changePatient}
        onUpdateLine={updateLine}
        onRemoveLine={removeLine}
        onAddLine={addLine}
        onNotes={(v) => {
          setDraft((d) => ({ ...d, notes: v }));
          touch();
        }}
        onValidity={(v) => {
          setDraft((d) => ({ ...d, validity_days: v }));
          touch();
        }}
        onReview={goToReview}
        tx={tx}
      />
    );
  } else {
    body = (
      <PatientStage
        entry={entry}
        entryError={entryError}
        request={request}
        lookup={lookup}
        match={match}
        draftLineCount={draft.lines.filter((line) => !isBlankLine(line)).length}
        written={written}
        onEntry={(v) => {
          setEntry(v);
          if (entryError) setEntryError(null);
        }}
        onSubmit={submitLookup}
        onClear={clearLookup}
        onConfirm={confirmPatient}
        onOpenList={() => setStage('written')}
        tx={tx}
        tr={tr}
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={title}
        subtitle={subtitle}
        actions={[
          {
            icon: 'list',
            accessibilityLabel: tx('prescribe.writtenTitle', 'Prescriptions you have written'),
            onPress: () => setStage('written'),
          },
        ]}
      />

      {showSteps && (
        <View style={styles.steps}>
          <StepProgress
            steps={STEPS}
            currentIndex={stepIndex}
            accessibilityLabel={tx('prescribe.stepOf', 'Step {{n}} of {{total}}: {{label}}', {
              n: stepIndex + 1,
              total: STEPS.length,
              label: STEPS[stepIndex]?.label ?? '',
            })}
          />
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.content, showSteps ? null : styles.contentNoSteps]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          stage === 'written' ? (
            <RefreshControl
              refreshing={written.isFetching && !written.isPending}
              onRefresh={() => void written.refetch()}
              tintColor={colors.blue}
            />
          ) : undefined
        }
      >
        {body}
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 1 — find and confirm the patient
// ═══════════════════════════════════════════════════════════════════════════

function PatientStage({
  entry,
  entryError,
  request,
  lookup,
  match,
  draftLineCount,
  written,
  onEntry,
  onSubmit,
  onClear,
  onConfirm,
  onOpenList,
  tx,
  tr,
}: {
  entry: string;
  entryError: string | null;
  request: string | null;
  lookup: ReturnType<typeof usePrescribingPatientLookup>;
  match: PrescribingPatient | null;
  draftLineCount: number;
  written: ReturnType<typeof usePrescriptionsIWrote>;
  onEntry: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onConfirm: (patient: PrescribingPatient) => void;
  onOpenList: () => void;
  tx: Tx;
  tr: Translate;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  let result: React.ReactNode = null;
  if (!request) {
    result = (
      <EmptyState
        icon="id-card"
        tint="blue"
        title={tx('prescribe.promptTitle', 'Start with the patient’s Health ID')}
        message={tx(
          'prescribe.promptBody',
          'Type the full Health ID from the patient’s card, then press Look up. A prescription can only be written against a patient you have confirmed on screen.'
        )}
      />
    );
  } else if (lookup.isPending) {
    result = <LoadingBlock label={tx('search.searching', 'Searching…')} />;
  } else if (lookup.isError) {
    // 404 is "no such patient" OR "no such route" — indistinguishable over the
    // wire, so this refuses to claim either. Saying "no patient carries that ID"
    // when the truth is "this server has no clinician service" is exactly the
    // confident wrong answer a prescribing screen must never give.
    const ambiguous = isPrescribingUnavailable(lookup.error);
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
                { healthId: request }
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
        <SectionHeader title={tx('prescribe.matchTitle', 'Is this the right patient?')} />
        <PatientCard patient={match} tx={tx} />
        <Text style={styles.note}>
          {tx(
            'prescribe.confirmPatientNote',
            'Check the name, date of birth and Health ID against the person in front of you before you continue. Everything you write next is issued to this record.'
          )}
        </Text>
        <CareButton
          label={tx('prescribe.usePatient', 'Use this patient')}
          icon="check-circle"
          onPress={() => onConfirm(match)}
          style={styles.blockAction}
        />
      </>
    );
  }

  return (
    <>
      <Card>
        <Text style={styles.fieldLabel}>{tx('search.idLabel', 'Health ID')}</Text>
        {/*
          A Health ID field must never be offered the phone's saved names or
          emails: `autoComplete="off"` + `textContentType="none"` is what says so
          on both platforms, and `autoCorrect={false}` stops a keyboard rewriting
          an ID into a word.
        */}
        <PillInput
          icon={<Icon name="id-card" size={18} color={colors.blue} />}
          value={entry}
          onChangeText={onEntry}
          onSubmitEditing={onSubmit}
          placeholder={tx('search.idPlaceholder', 'e.g. CM-HID-4F2A-9C31-70B5')}
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
            onPress={onSubmit}
            loading={!!request && lookup.isPending}
            disabled={entry.trim().length === 0}
          />
          {(entry.length > 0 || !!request) && (
            <CareButton
              label={tx('search.clear', 'Clear')}
              icon="close"
              variant="secondary"
              style={styles.action}
              onPress={onClear}
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

      {draftLineCount > 0 && (
        // The clinician stepped back from a half-written script. Say the lines
        // survived — and that they belong to whoever is confirmed NEXT.
        <NoticeBanner
          icon="alert-circle"
          tone="warning"
          title={tx('prescribe.draftKeptTitle', 'Your medicine lines are still here')}
          message={tx(
            'prescribe.draftKeptBody',
            draftLineCount === 1
              ? '1 medicine line is waiting. It will be issued to whichever patient you confirm next — check every line before issuing.'
              : '{{count}} medicine lines are waiting. They will be issued to whichever patient you confirm next — check every line before issuing.',
            { count: draftLineCount }
          )}
        />
      )}

      {result}

      <WrittenSummaryRow written={written} onPress={onOpenList} tx={tx} />
    </>
  );
}

/** The identity card. Every field is the server's; an absent one says so. */
function PatientCard({ patient, tx }: { patient: PrescribingPatient; tx: Tx }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const name = patientDisplayName(patient);
  const age = ageFromDob(patient.date_of_birth);
  const notRecorded = tx('prescribe.notRecorded', 'Not recorded');

  return (
    <Card>
      <View style={styles.patientHead}>
        <View style={styles.patientMark}>
          <Icon name="person" size={22} color={colors.blue} />
        </View>
        <View style={styles.patientHeadText}>
          <Text style={styles.patientName}>
            {name ?? tx('prescribe.nameNotOnRecord', 'Name not on record')}
          </Text>
          <Text style={styles.patientId}>{patient.health_id ?? notRecorded}</Text>
        </View>
      </View>

      <View style={styles.factGrid}>
        <Fact
          label={tx('prescribe.dob', 'Date of birth')}
          value={
            patient.date_of_birth
              ? age !== null
                ? `${formatDate(patient.date_of_birth)} · ${tx('search.years', '{{count}} yrs', { count: age })}`
                : formatDate(patient.date_of_birth)
              : notRecorded
          }
        />
        <Fact label={tx('prescribe.sex', 'Sex')} value={patient.sex ? sexLabel(patient.sex) : notRecorded} />
        <Fact
          label={tx('prescribe.bloodGroup', 'Blood group')}
          value={patient.blood_group ?? notRecorded}
        />
      </View>
    </Card>
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

/** The confirmed patient, pinned above the form and the review. */
function ConfirmedPatientBar({
  patient,
  onChange,
  tx,
}: {
  patient: PrescribingPatient;
  onChange: () => void;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const name = patientDisplayName(patient);
  const age = ageFromDob(patient.date_of_birth);
  return (
    <Card variant="flush">
      <ListRow
        icon="person"
        tint="blue"
        title={name ?? tx('prescribe.nameNotOnRecord', 'Name not on record')}
        meta={[
          patient.health_id,
          age !== null ? tx('search.years', '{{count}} yrs', { count: age }) : null,
          patient.sex ? sexLabel(patient.sex) : null,
          patient.blood_group,
        ]}
        chevron={false}
        trailing={
          <Text style={styles.changeLink} onPress={onChange} accessibilityRole="button">
            {tx('prescribe.changePatient', 'Change')}
          </Text>
        }
      />
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 2 — the medicine lines
// ═══════════════════════════════════════════════════════════════════════════

function ComposeBlock({
  patient,
  draft,
  problems,
  patientChanged,
  onChangePatient,
  onUpdateLine,
  onRemoveLine,
  onAddLine,
  onNotes,
  onValidity,
  onReview,
  tx,
}: {
  patient: PrescribingPatient;
  draft: PrescriptionDraft;
  problems: DraftProblem[];
  patientChanged: boolean;
  onChangePatient: () => void;
  onUpdateLine: (index: number, patch: Partial<DraftLine>) => void;
  onRemoveLine: (index: number) => void;
  onAddLine: () => void;
  onNotes: (value: string) => void;
  onValidity: (value: string) => void;
  onReview: () => void;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const general = problems.filter((p) => !('line' in p));

  return (
    <>
      <ConfirmedPatientBar patient={patient} onChange={onChangePatient} tx={tx} />

      {patientChanged && (
        <NoticeBanner
          icon="alert-triangle"
          tone="critical"
          title={tx('prescribe.patientChangedTitle', 'These lines were written for a different patient')}
          message={tx(
            'prescribe.patientChangedBody',
            'You changed the patient after drafting. Read every medicine line against the patient above before you issue anything.'
          )}
        />
      )}

      <SectionHeader
        title={tx('prescribe.medicinesTitle', 'Medicines')}
        actionLabel={
          draft.lines.length < MAX_DRAFT_LINES ? tx('prescribe.addMedicine', 'Add medicine') : undefined
        }
        onAction={draft.lines.length < MAX_DRAFT_LINES ? onAddLine : undefined}
      />

      {draft.lines.map((line, index) => (
        <MedicineLine
          key={line.key}
          index={index}
          line={line}
          count={draft.lines.length}
          problems={problems.filter((p) => 'line' in p && p.line === index)}
          onChange={(patch) => onUpdateLine(index, patch)}
          onRemove={() => onRemoveLine(index)}
          tx={tx}
        />
      ))}

      {draft.lines.length >= MAX_DRAFT_LINES && (
        <Text style={styles.note}>
          {tx('prescribe.lineCap', 'This form holds up to {{max}} medicines. Issue these, then write another prescription.', {
            max: MAX_DRAFT_LINES,
          })}
        </Text>
      )}

      <SectionHeader title={tx('prescribe.detailsTitle', 'Prescription details')} />
      <Card>
        <Text style={styles.fieldLabel}>{tx('prescribe.notesLabel', 'Notes to the pharmacy')}</Text>
        <PillInput
          icon={<Icon name="document-text" size={18} color={colors.blue} />}
          value={draft.notes}
          onChangeText={onNotes}
          placeholder={tx('prescribe.notesPlaceholder', 'Anything the dispenser needs to know')}
          multiline
          maxLength={LIMITS.notes}
          accessibilityLabel={tx('prescribe.notesLabel', 'Notes to the pharmacy')}
          style={styles.multiline}
        />

        <Text style={styles.fieldLabel}>{tx('prescribe.validityLabel', 'Valid for (days)')}</Text>
        <PillInput
          icon={<Icon name="calendar" size={18} color={colors.blue} />}
          value={draft.validity_days}
          onChangeText={onValidity}
          placeholder={tx('prescribe.validityPlaceholder', 'Leave blank for the facility default')}
          keyboardType="number-pad"
          maxLength={3}
          accessibilityLabel={tx('prescribe.validityLabel', 'Valid for (days)')}
        />
        <Text style={styles.note}>
          {tx(
            'prescribe.validityHelp',
            'Between {{min}} and {{max}} days. Left blank, the facility’s own expiry rule applies.',
            { min: LIMITS.validityDaysMin, max: LIMITS.validityDaysMax }
          )}
        </Text>
      </Card>

      {general.length > 0 && (
        <NoticeBanner
          icon="alert-circle"
          tone="warning"
          title={tx('prescribe.fixTitle', 'Not ready to issue')}
          message={general.map((p) => problemText(p, tx)).join('\n')}
        />
      )}

      <CareButton
        label={tx('prescribe.reviewAction', 'Review before issuing')}
        icon="arrow-right"
        onPress={onReview}
        style={styles.blockAction}
      />
    </>
  );
}

function MedicineLine({
  index,
  line,
  count,
  problems,
  onChange,
  onRemove,
  tx,
}: {
  index: number;
  line: DraftLine;
  count: number;
  problems: DraftProblem[];
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const problemFor = (code: DraftProblem['code']) =>
    problems.some((p) => p.code === code)
      ? problemText(problems.find((p) => p.code === code) as DraftProblem, tx)
      : undefined;

  return (
    <Card>
      <View style={styles.lineHead}>
        <Text style={styles.lineTitle}>
          {tx('prescribe.medicineN', 'Medicine {{n}}', { n: index + 1 })}
        </Text>
        <Text
          style={[styles.removeLink, count === 1 && line.drug_name.trim() === '' && styles.removeLinkOff]}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={tx('prescribe.removeMedicineN', 'Remove medicine {{n}}', { n: index + 1 })}
        >
          {count === 1 ? tx('prescribe.clearLine', 'Clear') : tx('prescribe.removeLine', 'Remove')}
        </Text>
      </View>

      <Text style={styles.fieldLabel}>{tx('prescribe.drugName', 'Drug name')}</Text>
      <PillInput
        icon={<Icon name="pill" size={18} color={colors.blue} />}
        value={line.drug_name}
        onChangeText={(v) => onChange({ drug_name: v })}
        placeholder={tx('prescribe.drugNamePlaceholder', 'e.g. Amoxicillin 500 mg capsule')}
        error={problemFor('missing_drug_name') ?? problemFor('drug_name_too_long')}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={LIMITS.drugName}
        accessibilityLabel={tx('prescribe.drugName', 'Drug name')}
      />

      <View style={styles.pair}>
        <View style={styles.pairCell}>
          <Text style={styles.fieldLabel}>{tx('section.dose', 'Dose')}</Text>
          <PillInput
            value={line.dose}
            onChangeText={(v) => onChange({ dose: v })}
            placeholder={tx('prescribe.dosePlaceholder', 'e.g. 500 mg')}
            error={problemFor('dose_too_long')}
            maxLength={LIMITS.dose}
            accessibilityLabel={tx('section.dose', 'Dose')}
          />
        </View>
        <View style={styles.pairCell}>
          <Text style={styles.fieldLabel}>{tx('prescribe.frequency', 'Frequency')}</Text>
          <PillInput
            value={line.frequency}
            onChangeText={(v) => onChange({ frequency: v })}
            placeholder={tx('prescribe.frequencyPlaceholder', 'e.g. 3 times a day')}
            error={problemFor('frequency_too_long')}
            maxLength={LIMITS.frequency}
            accessibilityLabel={tx('prescribe.frequency', 'Frequency')}
          />
        </View>
      </View>

      <Text style={styles.fieldLabel}>{tx('section.route', 'Route')}</Text>
      <View style={styles.routes}>
        {PRESCRIBING_ROUTES.map((route) => (
          <Chip
            key={route}
            label={routeLabel(route, tx)}
            selected={line.route === route}
            // Pressing the selected route clears it: the field is optional, and
            // a chip set with no way back out forces a value that was not meant.
            onPress={() => onChange({ route: line.route === route ? '' : route })}
          />
        ))}
      </View>

      <View style={styles.pair}>
        <View style={styles.pairCell}>
          <Text style={styles.fieldLabel}>{tx('prescribe.duration', 'Duration (days)')}</Text>
          <PillInput
            value={line.duration_days}
            onChangeText={(v) => onChange({ duration_days: v })}
            placeholder={tx('prescribe.durationPlaceholder', 'e.g. 7')}
            error={problemFor('bad_duration')}
            keyboardType="number-pad"
            maxLength={3}
            accessibilityLabel={tx('prescribe.duration', 'Duration (days)')}
          />
        </View>
        <View style={styles.pairCell}>
          <Text style={styles.fieldLabel}>{tx('prescribe.quantity', 'Quantity')}</Text>
          <PillInput
            value={line.quantity}
            onChangeText={(v) => onChange({ quantity: v })}
            placeholder={tx('prescribe.quantityPlaceholder', 'e.g. 21')}
            error={problemFor('bad_quantity')}
            keyboardType="number-pad"
            maxLength={4}
            accessibilityLabel={tx('prescribe.quantity', 'Quantity')}
          />
        </View>
      </View>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 3 — review, then issue
// ═══════════════════════════════════════════════════════════════════════════

function ReviewBlock({
  patient,
  lines,
  draft,
  patientChanged,
  issuing,
  onBack,
  onChangePatient,
  onIssue,
  tx,
}: {
  patient: PrescribingPatient | null;
  lines: DraftLine[];
  draft: PrescriptionDraft;
  patientChanged: boolean;
  issuing: boolean;
  onBack: () => void;
  onChangePatient: () => void;
  onIssue: () => void;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!patient) {
    // Only reachable if the patient was unset between steps. Never issue.
    return (
      <EmptyState
        icon="person-search"
        tint="amber"
        title={tx('prescribe.noPatientTitle', 'No patient confirmed')}
        message={tx('prescribe.noPatientBody', 'Look the patient up by Health ID and confirm them before issuing.')}
        actionLabel={tx('prescribe.backToPatient', 'Back to the patient')}
        onAction={onChangePatient}
      />
    );
  }

  return (
    <>
      <SectionHeader title={tx('prescribe.reviewPatientTitle', 'Issuing to')} />
      <PatientCard patient={patient} tx={tx} />
      <View style={styles.actions}>
        <CareButton
          label={tx('prescribe.changePatientFull', 'Change patient')}
          icon="person-search"
          variant="secondary"
          style={styles.action}
          onPress={onChangePatient}
        />
        <CareButton
          label={tx('prescribe.editMedicines', 'Edit medicines')}
          icon="edit"
          variant="secondary"
          style={styles.action}
          onPress={onBack}
        />
      </View>

      {patientChanged && (
        <NoticeBanner
          icon="alert-triangle"
          tone="critical"
          title={tx('prescribe.patientChangedTitle', 'These lines were written for a different patient')}
          message={tx(
            'prescribe.patientChangedBody',
            'You changed the patient after drafting. Read every medicine line against the patient above before you issue anything.'
          )}
        />
      )}

      <SectionHeader
        title={tx(
          'prescribe.reviewMedicinesTitle',
          lines.length === 1 ? '1 medicine' : '{{count}} medicines',
          { count: lines.length }
        )}
      />
      {/*
        NOT a `ListRow`: that clamps its title to one line and its meta to two.
        On the step where a clinician checks what they are about to issue,
        nothing may be hidden behind an ellipsis — a truncated drug name is a
        drug the reviewer did not actually read.
      */}
      <Card>
        {lines.map((line, index) => (
          <View key={line.key} style={index > 0 ? styles.reviewLine : undefined}>
            <View style={styles.reviewLineHead}>
              <View style={styles.reviewLineMark}>
                <Icon name="pill" size={16} color={colors.blue} />
              </View>
              <Text style={styles.reviewDrug}>{line.drug_name.trim()}</Text>
            </View>
            <Text style={styles.reviewDetail}>{lineDetail(line, tx)}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.fieldLabel}>{tx('prescribe.notesLabel', 'Notes to the pharmacy')}</Text>
        <Text style={styles.reviewValue}>
          {draft.notes.trim() || tx('prescribe.noNotes', 'No notes')}
        </Text>
        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
          {tx('prescribe.validityLabel', 'Valid for (days)')}
        </Text>
        <Text style={styles.reviewValue}>
          {draft.validity_days.trim() || tx('prescribe.validityDefault', 'Facility default')}
        </Text>
      </Card>

      <NoticeBanner
        icon="shield-check"
        tone="pending"
        message={tx(
          'prescribe.immutableNote',
          'A prescription is a clinical record. Once issued it can be voided with a documented reason, but it is never edited or deleted.'
        )}
      />

      <CareButton
        label={tx('prescribe.issueAction', 'Issue prescription')}
        icon="check-circle"
        onPress={onIssue}
        loading={issuing}
        style={styles.blockAction}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stage 4 — issued
// ═══════════════════════════════════════════════════════════════════════════

function IssuedBlock({
  prescription,
  copyState,
  onCopy,
  onWriteAnother,
  onViewList,
  tx,
}: {
  prescription: IssuedPrescription | null;
  copyState: 'idle' | 'copied' | 'failed';
  onCopy: () => void;
  onWriteAnother: () => void;
  onViewList: () => void;
  tx: Tx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!prescription) {
    return (
      <EmptyState
        icon="alert-circle"
        tint="amber"
        title={tx('prescribe.noIssuedTitle', 'Nothing to show')}
        message={tx('prescribe.noIssuedBody', 'No prescription has been issued in this session.')}
        actionLabel={tx('prescribe.writeAnother', 'Write a prescription')}
        onAction={onWriteAnother}
      />
    );
  }

  const reference = prescription.reference;

  return (
    <>
      <Card>
        <View style={styles.issuedHead}>
          <View style={styles.issuedMark}>
            <Icon name="check-circle" size={26} color={colors.statusNormal} />
          </View>
          <Text style={styles.issuedTitle}>{tx('prescribe.issuedTitle', 'Prescription issued')}</Text>
        </View>

        {reference ? (
          <>
            <Text style={styles.referenceLabel}>{tx('prescribe.referenceLabel', 'Reference')}</Text>
            {/*
              The one string the patient has to carry to a counter. Big, high
              contrast, selectable, and spoken character-by-character rather
              than as a mangled word.
            */}
            <Text
              style={styles.reference}
              selectable
              accessibilityLabel={tx('prescribe.referenceSpoken', 'Reference {{ref}}', {
                ref: reference.split('').join(' '),
              })}
            >
              {reference}
            </Text>
            <Text style={styles.note}>
              {tx(
                'prescribe.referenceHelp',
                'The patient quotes this at any OpesCare pharmacy. It is already on their record — nothing needs to be printed.'
              )}
            </Text>
            <CareButton
              label={
                copyState === 'copied'
                  ? tx('prescribe.referenceCopied', 'Copied')
                  : copyState === 'failed'
                    ? tx('prescribe.referenceCopyFailed', 'Could not copy')
                    : tx('prescribe.copyReference', 'Copy reference')
              }
              icon={copyState === 'copied' ? 'check' : copyState === 'failed' ? 'alert-circle' : 'copy'}
              variant="secondary"
              size="sm"
              onPress={onCopy}
              style={styles.blockAction}
            />
          </>
        ) : (
          // Issued, but the server sent no reference. Inventing one would send a
          // patient to a counter with a code that does not exist.
          <NoticeBanner
            icon="alert-circle"
            tone="warning"
            title={tx('prescribe.noReferenceTitle', 'Issued, but no reference came back')}
            message={tx(
              'prescribe.noReferenceBody',
              'The prescription was created. The server did not return the reference the patient quotes at a pharmacy — open the list below to find it.'
            )}
          />
        )}
      </Card>

      <Card variant="flush">
        <ListRow
          icon="person"
          tint="blue"
          title={prescription.patient_name ?? tx('prescribe.nameNotOnRecord', 'Name not on record')}
          meta={[prescription.patient_health_id, prescription.status]}
          chevron={false}
        />
        <ListRow
          icon="pill"
          tint="green"
          title={
            prescription.item_count === null
              ? tx('prescribe.itemsUnknown', 'Medicines not listed in the reply')
              : tx(
                  'prescribe.itemsN',
                  prescription.item_count === 1 ? '1 medicine' : '{{count}} medicines',
                  { count: prescription.item_count }
                )
          }
          meta={[
            prescription.prescribed_at ? formatDate(prescription.prescribed_at) : null,
            prescription.expires_at
              ? tx('prescribe.expiresOn', 'expires {{date}}', {
                  date: formatDate(prescription.expires_at),
                })
              : null,
          ]}
          chevron={false}
          divider={false}
        />
      </Card>

      <CareButton
        label={tx('prescribe.writeAnother', 'Write another prescription')}
        icon="plus"
        onPress={onWriteAnother}
        style={styles.blockAction}
      />
      <CareButton
        label={tx('prescribe.viewList', 'View what you have written')}
        icon="list"
        variant="secondary"
        onPress={onViewList}
        style={styles.blockAction}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// The clinician's own prescriptions
// ═══════════════════════════════════════════════════════════════════════════

/** A one-line entry point on the first stage. Never shows a count it lacks. */
function WrittenSummaryRow({
  written,
  onPress,
  tx,
}: {
  written: ReturnType<typeof usePrescriptionsIWrote>;
  onPress: () => void;
  tx: Tx;
}) {
  const rows = written.data;
  const subtitle = written.isPending
    ? tx('prescribe.writtenLoading', 'Reading your prescriptions…')
    : written.isError || !rows
      ? tx('prescribe.writtenUnknown', 'Open to see what you have written')
      : rows.length === 0
        ? tx('prescribe.writtenNone', 'You have not written any yet')
        : tx(
            'prescribe.writtenCount',
            rows.length === 1 ? '1 prescription' : '{{count}} prescriptions',
            { count: rows.length }
          );

  return (
    <Card variant="flush">
      <ListRow
        icon="clipboard"
        tint="amber"
        title={tx('prescribe.writtenTitle', 'Prescriptions you have written')}
        subtitle={subtitle}
        onPress={onPress}
      />
    </Card>
  );
}

function WrittenList({
  rows,
  loading,
  error,
  onRetry,
  onBack,
  tx,
  tr,
}: {
  rows: IssuedPrescription[] | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onBack: () => void;
  tx: Tx;
  tr: Translate;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  let body: React.ReactNode;
  if (loading) {
    body = <LoadingBlock label={tx('prescribe.writtenLoading', 'Reading your prescriptions…')} />;
  } else if (error && isRoleForbidden(error)) {
    // The server said this ACCOUNT may not use the desk. Not "not served".
    body = <RoleRefusedNotice />;
  } else if (error) {
    const notServed = isPrescribingUnavailable(error);
    body = (
      <EmptyState
        icon={notServed ? 'clipboard' : 'alert-circle'}
        tint={notServed ? 'blue' : 'red'}
        title={
          notServed
            ? tx('shared.notServedTitle', 'Not available on this server yet')
            : tr('opesCore.errors.unknownTitle')
        }
        message={
          notServed
            ? tx(
                'prescribe.notServedList',
                'Prescriptions you write will be listed here once the clinician prescribing service is enabled for this app. This is not a statement that you have written none.'
              )
            : describeFailure(error).message
        }
        actionLabel={tr('opesCore.common.retry')}
        onAction={onRetry}
      />
    );
  } else if (!rows || rows.length === 0) {
    body = (
      <EmptyState
        icon="clipboard"
        tint="blue"
        title={tx('prescribe.writtenEmptyTitle', 'Nothing written yet')}
        message={tx(
          'prescribe.writtenEmptyBody',
          'Prescriptions you issue from this app or from a workstation will be listed here, newest first.'
        )}
      />
    );
  } else {
    body = (
      <ResultList>
        {rows.map((row, index) => (
          <Card key={row.id ?? row.reference ?? `row-${index}`} variant="flush">
            <ListRow
              icon="pill"
              tint="blue"
              title={row.reference ?? tx('prescribe.referenceMissing', 'Reference not recorded')}
              meta={[
                row.patient_name,
                row.patient_health_id,
                row.prescribed_at ? formatDate(row.prescribed_at) : null,
                row.item_count === null
                  ? null
                  : tx('prescribe.itemsN', row.item_count === 1 ? '1 medicine' : '{{count}} medicines', {
                      count: row.item_count,
                    }),
              ]}
              trailing={row.status ? <StatusBadge status={row.status} size="sm" /> : undefined}
              chevron={false}
              divider={false}
            />
          </Card>
        ))}
      </ResultList>
    );
  }

  return (
    <>
      <SectionHeader title={tx('prescribe.writtenTitle', 'Prescriptions you have written')} />
      {body}
      <Text style={styles.note}>
        {tx(
          'prescribe.writtenNote',
          'This list is read from the record each time it loads. It is not a local copy.'
        )}
      </Text>
      <CareButton
        label={tx('prescribe.back', 'Back')}
        icon="arrow-left"
        variant="secondary"
        onPress={onBack}
        style={styles.blockAction}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Wording helpers
// ═══════════════════════════════════════════════════════════════════════════

/** The route's own EN/FR label from the chart vocabulary. */
function routeLabel(route: PrescribingRoute, tx: Tx): string {
  return tx(ROUTE_LABEL_KEY[route], ROUTE_LABEL_EN[route]);
}

/**
 * Everything on a line except the drug name, as one sentence.
 *
 * A line carrying nothing but a drug name SAYS so. Printing an empty second
 * line lets "no dose recorded" pass for "the dose is somewhere off screen",
 * and the dispenser is the one who then has to guess.
 */
function lineDetail(line: DraftLine, tx: Tx): string {
  const parts = [
    line.dose.trim(),
    line.frequency.trim(),
    line.route ? routeLabel(line.route, tx) : '',
    line.duration_days.trim()
      ? tx('prescribe.forNDays', 'for {{count}} days', { count: Number(line.duration_days.trim()) })
      : '',
    line.quantity.trim()
      ? tx('prescribe.qtyN', 'quantity {{count}}', { count: Number(line.quantity.trim()) })
      : '',
  ].filter((part) => part !== '');

  return parts.length > 0
    ? parts.join('  •  ')
    : tx('prescribe.lineBare', 'No dose, frequency, route, duration or quantity given.');
}

/** A validation code as a sentence the clinician can act on. */
function problemText(problem: DraftProblem, tx: Tx): string {
  const n = 'line' in problem ? problem.line + 1 : 0;
  switch (problem.code) {
    case 'no_items':
      return tx('prescribe.problemNoItems', 'Add at least one medicine with a drug name.');
    case 'missing_drug_name':
      return tx('prescribe.problemNoDrugName', 'Medicine {{n}} needs a drug name.', { n });
    case 'drug_name_too_long':
      return tx('prescribe.problemDrugNameLong', 'Medicine {{n}}: the drug name is too long ({{max}} characters).', {
        n,
        max: LIMITS.drugName,
      });
    case 'dose_too_long':
      return tx('prescribe.problemDoseLong', 'Medicine {{n}}: the dose is too long ({{max}} characters).', {
        n,
        max: LIMITS.dose,
      });
    case 'frequency_too_long':
      return tx('prescribe.problemFrequencyLong', 'Medicine {{n}}: the frequency is too long ({{max}} characters).', {
        n,
        max: LIMITS.frequency,
      });
    case 'bad_duration':
      return tx('prescribe.problemDuration', 'Duration must be a whole number of days between {{min}} and {{max}}.', {
        min: LIMITS.durationDaysMin,
        max: LIMITS.durationDaysMax,
      });
    case 'bad_quantity':
      return tx('prescribe.problemQuantity', 'Quantity must be a whole number between {{min}} and {{max}}.', {
        min: LIMITS.quantityMin,
        max: LIMITS.quantityMax,
      });
    case 'bad_validity':
      return tx('prescribe.problemValidity', 'Valid for must be a whole number of days between {{min}} and {{max}}.', {
        min: LIMITS.validityDaysMin,
        max: LIMITS.validityDaysMax,
      });
    case 'notes_too_long':
      return tx('prescribe.problemNotesLong', 'The notes are too long ({{max}} characters).', {
        max: LIMITS.notes,
      });
  }
}

/**
 * What to tell a clinician whose issue attempt did not come back clean.
 *
 * THREE different claims, and they must never be collapsed into one:
 *   • no answer at all  → the outcome is UNKNOWN. Check before re-issuing.
 *   • route missing     → nothing was written, and nothing can be until the
 *                         service is switched on.
 *   • any other failure → the server rejected it; nothing was written.
 */
function issueFailureNotice(
  error: unknown,
  tx: Tx,
  tr: Translate
): { title: string; message: string; tone: 'warning' | 'critical' } {
  if (issueOutcomeIsUncertain(error)) {
    return {
      tone: 'warning',
      title: tx('prescribe.uncertainTitle', 'No answer from the server'),
      message: tx(
        'prescribe.uncertainBody',
        'The prescription was sent but nothing came back, so it is not known whether it was issued. Open “Prescriptions you have written” and check before writing it again — issuing it twice would put two live scripts on this patient’s record.'
      ),
    };
  }
  if (isRoleForbidden(error)) {
    // A refusal for the ROLE, from a desk that IS served. Never "not available".
    return {
      tone: 'critical',
      title: tx('roleGate.serverRefusedTitle', 'Your role does not include this'),
      message: `${tx('roleGate.serverRefusedBody', 'The server refused this for your role. Nothing was changed.')} ${tx('prescribe.nothingIssued', 'Nothing was issued.')}`,
    };
  }
  if (isPrescribingUnavailable(error)) {
    return {
      tone: 'critical',
      title: tx('shared.notServedTitle', 'Not available on this server yet'),
      message: tx(
        'prescribe.notServedIssue',
        'This server cannot issue prescriptions yet. Nothing was written. Your medicine lines are still on screen — use a workstation, or try again once the clinician prescribing service is enabled.'
      ),
    };
  }
  const failure = describeFailure(error, tr('opesCore.errors.unknownBody'));
  return {
    tone: 'critical',
    title: failure.title,
    message: `${failure.message} ${tx('prescribe.nothingIssued', 'Nothing was issued.')}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    steps: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
    content: { padding: spacing.md, paddingTop: 0, paddingBottom: spacing.xxl, gap: spacing.sm },
    /** The step strip is hidden on the last two stages; keep the top breathing room. */
    contentNoSteps: { paddingTop: spacing.sm },

    fieldLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    fieldLabelSpaced: { marginTop: spacing.md },
    note: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    noteSpaced: { marginTop: spacing.sm },

    actions: { flexDirection: 'row', gap: spacing.sm },
    action: { flex: 1 },
    blockAction: { marginTop: spacing.sm },

    multiline: { minHeight: 64, textAlignVertical: 'top' },

    // ── Patient card ──────────────────────────────────────────────────────
    patientHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    patientMark: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.tintBlueBg,
    },
    patientHeadText: { flex: 1, minWidth: 0 },
    patientName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textPrimary,
    },
    patientId: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
      marginTop: 2,
    },
    factGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    fact: { minWidth: 100, flexGrow: 1, flexBasis: '30%' },
    factLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    factValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
      marginTop: 2,
    },
    changeLink: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.link,
    },

    // ── Medicine line ─────────────────────────────────────────────────────
    lineHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    lineTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    removeLink: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.statusCritical,
      paddingLeft: spacing.sm,
    },
    removeLinkOff: { color: colors.textMuted },
    // Dose/Frequency and Duration/Quantity. Two columns while both halves can
    // still hold a legible field, one column below that: `flexBasis` is the
    // width each half ASKS for, so the pair breaks onto two rows the moment
    // the card cannot give them both that much. On a 375px phone the card is
    // ~310px wide and they sit side by side; at 320px it is ~255px and they
    // stack, which beats two fields too narrow to read what you typed.
    pair: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    pairCell: { flexGrow: 1, flexShrink: 1, flexBasis: PAIR_COLUMN_BASIS, minWidth: 0 },
    routes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },

    // ── Review ────────────────────────────────────────────────────────────
    reviewLine: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    reviewLineHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    reviewLineMark: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.tintBlueBg,
    },
    reviewDrug: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: colors.textPrimary,
    },
    reviewDetail: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
      marginTop: spacing.xs,
      marginLeft: 30 + spacing.sm,
    },
    reviewValue: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },

    // ── Issued ────────────────────────────────────────────────────────────
    issuedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    issuedMark: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.statusNormalBg,
    },
    issuedTitle: {
      flex: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textPrimary,
    },
    referenceLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginTop: spacing.md,
    },
    reference: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xxl,
      lineHeight: typography.lineHeight.xxl,
      letterSpacing: 1.2,
      color: colors.blue,
      marginTop: 2,
      marginBottom: spacing.sm,
    },
  });
