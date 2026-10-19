import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
/**
 * Doctor — Result detail + acknowledgement (`/clinician/results/[id]`).
 *
 * Port of design reference `src/screens/doctor/ResultDetailScreen.tsx` (archived prototype, see docs/DESIGN_REFERENCE.md) onto expo-router,
 * the OPES UI kit and this app's doctor foundation.
 *
 * The highest-stakes screen in the doctor app, so its rules are explicit:
 *
 *  1. ACKNOWLEDGEMENT IS A CLINICAL ACT. Nothing here acknowledges as a side
 *     effect. Opening the screen does not. Only the button does, and only
 *     after a confirmation sheet that names the patient and the result.
 *  2. NEVER CLAIM SUCCESS WE CANNOT SEE. A failed acknowledgement is reported
 *     in a Dialog that says plainly when the outcome is unknown and where to
 *     check. The result is only shown as acknowledged when the server
 *     answered with an `acknowledged_at`.
 *  3. NEVER PRESENT STALE DATA AS CURRENT. A refresh that failed over data
 *     already on screen renders the kit's `StaleNotice` above it.
 *  4. NEVER INVENT A THRESHOLD. Reference intervals and flags are printed as
 *     the laboratory recorded them; where there is none, the screen says so.
 *
 *  5. THE SHEET DECIDES NOTHING. "Acknowledge and act" (components/results/
 *     AcknowledgeSheet) collects a patient-facing note, a private comment and
 *     the next step the clinician intends, and hands one body to ONE
 *     acknowledge call. The next step is RECORDED with the acknowledgement
 *     and then OFFERED as a button — prescribing, booking, messaging and
 *     ordering each remain their own act on their own screen or sheet.
 *  6. A NEXT STEP THE SERVER CANNOT TAKE YET IS SAID SO. `POST …/messages/
 *     threads` and `POST …/patients/{id}/lab-orders` are new; a 404 / 405 /
 *     501 renders "not available on this server yet" — never "sent" or
 *     "ordered". A thread is opened only with the id the server returned; an
 *     order is called ordered only when the server answered with one.
 *
 * `id` is the id of the notification row the inbox listed — the same
 * identifier the desktop inbox acknowledges against.
 *
 * Backend gap: the finder does not serve `/mobile/doctor/*` yet. A 404 (or any
 * failure with nothing on screen) renders an honest EmptyState with a retry.
 *
 * i18n: `opesDoctor.*` is being migrated; every string carries a
 * `defaultValue` until the keys land. Locale files are not edited here.
 */
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGate } from '@/components/doctor/RoleGate';
import { useStaffCapability } from '@/lib/staffCapabilities';
import { isAxiosError } from 'axios';
import {
  Card,
  CardStack,
  EmptyState,
  Icon,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
  StatusBadge,
  typography,
  useDialog,
  useTheme,
  type Palette,
  type StatusTone,
  spacing,
} from '@/components/opes-ui';
import {
  CareButton,
  InfoRow,
  LoadingBlock,
  NoticeBanner,
  SummaryLine,
  describeFailure,
  type Translate,
} from '@/components/care/shared';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  useResultDetail,
  type InboxAnalyte,
  type InboxResultDetail,
  isDoctorFeatureUnserved,
} from '@/lib/api/doctorQueries';
import { categoryLabel, fmtReported } from '@/components/doctor/shared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';
// ── Acknowledge-and-act (T7b; this screen's own data layer + sheets) ──────
import {
  healthIdFromPrescribeLink,
  isResultStepInvalid,
  isResultStepUnserved,
  nextActionLinks,
  resultStepFailureMessage,
  startedThreadId,
  useAcknowledgeResultWithAction,
  useOrderLabTest,
  useStartPatientThread,
  type AcknowledgeResultBody,
  type InterpretedResultDetail,
  type NextActionLinks,
  type OrderedLabTest,
  type ResultNextAction,
} from '@/lib/api/resultActionQueries';
import { AcknowledgeSheet, NEXT_ACTION_ICON, nextActionLabel } from '@/components/results/AcknowledgeSheet';
import { StartThreadSheet } from '@/components/results/StartThreadSheet';
import { RepeatTestSheet, type RepeatTestValues } from '@/components/results/RepeatTestSheet';
import { InterpretationCard } from '@/components/results/InterpretationCard';

/**
 * The server's own sentence, when it sent one.
 *
 * On a 404 the API says which of "not yours / not here / gone" applies, in the
 * clinician's language. Replacing that with a generic classification would
 * throw away the only specific thing anyone knows about the failure.
 */
function serverMessage(e: unknown): string | null {
  if (!isAxiosError(e)) return null;
  const body = e.response?.data as { message?: string } | undefined;
  return typeof body?.message === 'string' && body.message !== '' ? body.message : null;
}

/** Failure copy for a write, saying plainly when the outcome is unknown. */
function writeFailureMessage(t: Translate, e: unknown, checkHint: string): string {
  const f = describeFailure(e);
  const outcomeUnknown = f.kind === 'timeout' || f.kind === 'server' || f.kind === 'unknown';
  return outcomeUnknown ? t('opesCore.errors.unknownOutcome', { message: f.message, checkHint }) : f.message;
}

/**
 * The laboratory's own flag → a badge tone. Mirrors the patient diagnostics
 * screens' `toneForFlag`: this screen classifies nothing itself.
 */
function toneForFlag(flag: string | null | undefined): StatusTone {
  switch ((flag ?? '').toLowerCase()) {
    case 'normal':
      return 'normal';
    case 'low':
      return 'warning';
    case 'high':
    case 'abnormal':
    case 'critical':
      return 'critical';
    // An ordered-but-unresulted analyte is not a result at all — never the
    // alarming critical tone, a calm neutral.
    case 'pending':
    default:
      return 'neutral';
  }
}

/**
 * Role gate — clinical_chart or lab_results. A role without it never mounts the screen
 * below, so none of its queries run and the server is never asked what it
 * would refuse (`lib/staffCapabilities.ts`, mirror of config/staff_capabilities.php).
 */
export default function ResultDetailScreen() {
  usePrivateScreen();
  return (
    <RoleGate need={['clinical_chart', 'lab_results']}>
      <ResultDetailScreenBody />
    </RoleGate>
  );
}

function ResultDetailScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const { id } = useLocalSearchParams<{ id: string }>();
  const resultId = typeof id === 'string' ? id : '';
  // A lab technician sees the inbox but holds no chart; the link is not drawn.
  const canChart = useStaffCapability('clinical_chart');

  /** `opesDoctor.<key>` with a readable default until the catalogue lands. */
  const tx = useCallback(
    (key: string, defaultValue: string, params?: Record<string, unknown>) =>
      String(t(`opesDoctor.${key}`, { defaultValue, ...params })),
    [t],
  );
  const tr = useCallback<Translate>((key, params) => String(t(key, params as Record<string, unknown>)), [t]);

  const detail = useResultDetail(resultId);
  const acknowledge = useAcknowledgeResultWithAction();
  const startThread = useStartPatientThread();
  const orderTest = useOrderLabTest();
  const { refetch } = detail;

  // Which next steps THIS role may take from this device. The chips are only
  // offered for steps the clinician could actually complete here; the server
  // is never asked what it would refuse.
  const canPrescribe = useStaffCapability('prescribe');
  const canMessage = useStaffCapability('messaging');

  // ── Sheet + next-step state ───────────────────────────────────────────
  const [ackOpen, setAckOpen] = useState(false);
  /** The links the acknowledge response carried — only that call returns them. */
  const [servedLinks, setServedLinks] = useState<NextActionLinks | null>(null);
  /** The next step chosen in the sheet, confirmed by the server's row when it carries one. */
  const [chosenStep, setChosenStep] = useState<ResultNextAction | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  /** The order the server answered with — the ONLY thing that renders "Ordered". */
  const [ordered, setOrdered] = useState<OrderedLabTest | null>(null);

  const patientLabelOf = (result: InboxResultDetail) =>
    result.patient_name ?? tx('result.confirmThisPatient', 'this patient');

  /** The row plus the links the acknowledge response carried, for `nextActionLinks`. */
  const withLinks = (result: InterpretedResultDetail) => ({
    ...result,
    next_action_links: servedLinks ?? undefined,
  });

  /** The next steps offered in the sheet for this result and this role. */
  function offeredSteps(result: InboxResultDetail): ResultNextAction[] {
    const out: ResultNextAction[] = [];
    const hasPatient = !!result.patient_id;
    if (canPrescribe && (hasPatient || result.patient_health_id)) out.push('prescribe');
    if (canChart && hasPatient) out.push('follow_up');
    if (canMessage && hasPatient) out.push('message');
    if (canChart && hasPatient) out.push('repeat_test');
    return out;
  }

  /**
   * The acknowledgement itself. One call, one body. Every rule of the old
   * confirm handler is kept: idempotent on the server (a retry after a
   * dropped response gets the ORIGINAL row), the screen is painted as done
   * only on an `acknowledged_at`, and a failure names when the outcome is
   * unknown and where to check.
   */
  async function acknowledgeWith(result: InboxResultDetail, body: AcknowledgeResultBody) {
    const patient = patientLabelOf(result);
    try {
      const updated = await acknowledge.mutateAsync({ id: result.id, body });
      if (!updated?.acknowledged_at) {
        // The server answered, but not with an acknowledgement. Do not paint
        // the screen as done on the strength of a 200 alone.
        setAckOpen(false);
        dialog.alert(
          tx('result.notAckedTitle', 'Not acknowledged'),
          tx(
            'result.notAckedBody',
            'The hospital record did not come back with an acknowledgement. Please try again, or acknowledge it on a workstation.',
          ),
          'critical',
        );
        void refetch();
        return;
      }
      // What the server recorded wins over what we sent; what we sent fills
      // in only when the row carries no interpretation block at all.
      const recordedStep = updated.interpretation?.next_action ?? body.next_action ?? 'none';
      setServedLinks(updated.next_action_links ?? null);
      setChosenStep(recordedStep === 'none' ? null : recordedStep);
      setAckOpen(false);
      // Re-read so what is on screen is the server's row, not our guess.
      void refetch();
      dialog.alert(
        tx('result.doneTitle', 'Acknowledged'),
        tx('result.doneBody', 'Recorded against {{patient}} at {{when}} in the name of {{name}}.', {
          patient,
          when: fmtReported(updated.acknowledged_at),
          name: updated.acknowledged_by_name ?? tx('result.doneNameYou', 'you'),
        }),
        'success',
      );
    } catch (e) {
      setAckOpen(false);
      dialog.alert(
        tx('result.failedTitle', 'Could not acknowledge'),
        writeFailureMessage(
          tr,
          e,
          tx(
            'result.failedHint',
            'Open this result again — if it shows as acknowledged, it was recorded. If it does not, acknowledge it again or use a workstation.',
          ),
        ),
        'critical',
      );
      void refetch();
    }
  }

  /**
   * A next step the server could not take. 404 / 405 / 501 on the two new
   * endpoints means "nothing served it" and is said so; a 422 carries the
   * server's own sentence; anything else goes through `describeFailure`.
   */
  function reportStepFailure(e: unknown, failedTitle: string) {
    if (isResultStepUnserved(e)) {
      dialog.alert(
        tx('result.stepUnservedTitle', 'Not available on this server yet'),
        tx(
          'result.stepUnservedBody',
          'This server does not offer this step from the app yet. Your acknowledgement was recorded; complete this step on a workstation.',
        ),
        'warning',
      );
      return;
    }
    if (isResultStepInvalid(e)) {
      dialog.alert(
        tx('result.stepInvalidTitle', 'Check the form'),
        resultStepFailureMessage(e) ?? describeFailure(e).message,
        'warning',
      );
      return;
    }
    dialog.alert(failedTitle, serverMessage(e) ?? describeFailure(e).message, 'critical');
  }

  /** Follow the chosen next step. Each one is its own act on its own screen. */
  function takeStep(step: ResultNextAction, result: InterpretedResultDetail) {
    const links = nextActionLinks(withLinks(result));
    const needsPatient = () =>
      dialog.alert(
        tx('result.nextStepNoPatientTitle', 'Patient record not linked'),
        tx(
          'result.nextStepNoPatient',
          'This step needs the patient’s record, which this notification does not carry. Use a workstation.',
        ),
        'warning',
      );
    switch (step) {
      case 'prescribe': {
        const healthId = healthIdFromPrescribeLink(links.prescribe) ?? result.patient_health_id ?? null;
        router.push(
          healthId ? `${doctorRoutes.prescribe}?health_id=${encodeURIComponent(healthId)}` : doctorRoutes.prescribe,
        );
        return;
      }
      case 'follow_up': {
        const pid = links.follow_up?.patient_id ?? result.patient_id;
        if (!pid) return needsPatient();
        // The chart screen opens its follow-up sheet on this param.
        router.push(`${doctorRoutes.patient(pid)}?followUp=1`);
        return;
      }
      case 'message': {
        if (links.message?.thread_id) {
          router.push(doctorRoutes.thread(String(links.message.thread_id)));
          return;
        }
        if (!(links.message?.patient_id ?? result.patient_id)) return needsPatient();
        setThreadOpen(true);
        return;
      }
      case 'repeat_test': {
        if (!(links.repeat_test?.patient_id ?? result.patient_id)) return needsPatient();
        setRepeatOpen(true);
        return;
      }
      case 'none':
      default:
        return;
    }
  }

  /** POST …/messages/threads, then open the thread the server created. */
  async function submitThread(result: InterpretedResultDetail, values: { subject: string; body: string }) {
    const links = nextActionLinks(withLinks(result));
    const patientId = links.message?.patient_id ?? result.patient_id;
    if (!patientId) return;
    try {
      const thread = await startThread.mutateAsync({
        patient_id: patientId,
        ...values,
      });
      const threadId = startedThreadId(thread);
      setThreadOpen(false);
      if (!threadId) {
        // Created, said the server, but with no id we can open. Say exactly that.
        dialog.alert(
          tx('result.threadNoIdTitle', 'Conversation started'),
          tx(
            'result.threadNoIdBody',
            'The server created the conversation but did not return its reference. Find it under Messages.',
          ),
          'warning',
        );
        return;
      }
      router.push(doctorRoutes.thread(threadId));
    } catch (e) {
      setThreadOpen(false);
      reportStepFailure(e, tx('result.threadFailedTitle', 'Could not start the conversation'));
    }
  }

  /** POST …/patients/{id}/lab-orders; "Ordered" is rendered from the answer only. */
  async function submitRepeat(result: InterpretedResultDetail, values: RepeatTestValues) {
    const links = nextActionLinks(withLinks(result));
    const patientId = links.repeat_test?.patient_id ?? result.patient_id;
    if (!patientId) return;
    try {
      const order = await orderTest.mutateAsync({
        patient_id: patientId,
        test_name: values.test_name,
        test_code: values.test_code || undefined,
        urgency: values.urgency,
        clinical_indication: values.clinical_indication,
      });
      setRepeatOpen(false);
      setOrdered(order ?? null);
      if (!order) {
        dialog.alert(
          tx('result.orderNoRowTitle', 'Order not confirmed'),
          tx(
            'result.orderNoRowBody',
            'The server did not return the order it created. Check the patient’s chart before ordering again.',
          ),
          'warning',
        );
      }
    } catch (e) {
      setRepeatOpen(false);
      reportStepFailure(e, tx('result.repeatFailedTitle', 'Could not order the test'));
    }
  }

  // A refresh that failed while the result is on screen must never pass as fresh.
  const stale =
    detail.isError && detail.data !== undefined ? (
      <StaleNotice
        message={describeFailure(detail.error).message}
        loadedAt={detail.dataUpdatedAt ? new Date(detail.dataUpdatedAt) : null}
        onRetry={() => void refetch()}
        retrying={detail.isFetching}
      />
    ) : null;

  let body: React.ReactNode;
  if (!resultId) {
    body = (
      <EmptyState
        icon="alert-circle"
        tint="amber"
        title={tr('opesCore.errors.notFoundTitle')}
        message={tr('opesCore.errors.notFoundBody')}
      />
    );
  } else if (detail.isPending) {
    body = <LoadingBlock label={tx('result.loading', 'Loading this result…')} />;
  } else if (detail.isError && detail.data === undefined) {
    const notServed = isDoctorFeatureUnserved(detail.error);
    // An expired clinician session, a result that is not theirs and a dead
    // network are three different problems with three different fixes.
    // `describeFailure` names each in both languages; the server's own 404
    // sentence is more specific still, so it wins when there is one.
    const failure = describeFailure(detail.error);
    body = (
      <EmptyState
        icon={notServed ? 'flask' : 'alert-circle'}
        tint={notServed ? 'green' : 'red'}
        title={notServed ? tx('shared.notServedTitle', 'Not available on this server yet') : failure.title}
        message={
          notServed
            ? tx(
                'shared.notServedResult',
                'This result cannot be opened until the clinician service is enabled for this app.',
              )
            : (serverMessage(detail.error) ?? failure.message)
        }
        actionLabel={tr('opesCore.common.retry')}
        onAction={() => void refetch()}
      />
    );
  } else if (detail.data) {
    const r = detail.data as InterpretedResultDetail;
    const acked = !!r.acknowledged_at;
    const analytes = r.result?.kind === 'lab' ? (r.result.analytes ?? []) : [];
    // `show()` carries the interpretation once one exists; the acknowledge
    // response (already written into this cache entry) carries it too.
    const interpretation = r.interpretation ?? null;
    // The step to offer: the server's recorded one, else the one chosen in
    // the sheet this session. A step that needs a patient this row does not
    // carry is still offered — `takeStep` says why it cannot proceed.
    const recorded = interpretation?.next_action ?? null;
    const nextStep: ResultNextAction | null = acked ? (recorded && recorded !== 'none' ? recorded : chosenStep) : null;
    const nextStepCta = (step: ResultNextAction): string => {
      switch (step) {
        case 'prescribe':
          return tx('result.nextStepOpenPrescribe', 'Open prescribing');
        case 'follow_up':
          return tx('result.nextStepBookFollowUp', 'Book a follow-up');
        case 'message':
          return nextActionLinks(withLinks(r)).message?.thread_id
            ? tx('result.nextStepOpenThread', 'Open the conversation')
            : tx('result.nextStepMessagePatient', 'Message the patient');
        case 'repeat_test':
          return tx('result.nextStepRepeatTest', 'Order the repeat test');
        default:
          return nextActionLabel(step, tx);
      }
    };

    body = (
      <>
        {r.is_critical && !acked && (
          <NoticeBanner
            icon="alert-triangle"
            tone="critical"
            title={tx('result.criticalTitle', 'CRITICAL RESULT — NOT ACKNOWLEDGED')}
            message={tx(
              'result.criticalBody',
              'This result was flagged critical when it was released. It stays unacknowledged until you confirm below.',
            )}
          />
        )}

        <Card>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{r.title}</Text>
            <StatusBadge
              status={
                acked
                  ? tx('result.badgeAcknowledged', 'Acknowledged')
                  : r.is_critical
                    ? tx('result.badgeCritical', 'Critical')
                    : tx('result.badgeAwaiting', 'Awaiting review')
              }
              tone={acked ? 'normal' : r.is_critical ? 'critical' : 'pending'}
              icon={acked ? 'check' : undefined}
              size="sm"
            />
          </View>
          {!!r.body && <Text style={styles.body}>{r.body}</Text>}
        </Card>

        <CardStack spacing="sm">
          <Card>
            <InfoRow
              icon="person"
              tint="blue"
              label={tx('result.patient', 'Patient')}
              value={r.patient_name ?? tx('result.patientNotOnRecord', 'Not on record')}
            />
          </Card>
          {!!r.patient_health_id && (
            <Card>
              <InfoRow
                icon="id-card"
                tint="purple"
                label={tx('result.healthId', 'Health ID')}
                value={r.patient_health_id}
              />
            </Card>
          )}
          <Card>
            <InfoRow
              icon="flask"
              tint="green"
              label={tx('result.test', 'Test')}
              value={r.result?.test_name ?? categoryLabel(r.category)}
            />
          </Card>
          <Card>
            <InfoRow
              icon="clock"
              tint="amber"
              label={tx('result.reported', 'Reported')}
              value={fmtReported(r.reported_at)}
            />
          </Card>
        </CardStack>

        {canChart && !!r.patient_id && (
          <CareButton
            label={tx('appointment.openChart', 'Open Patient Chart')}
            icon="person"
            iconRight="chevron-right"
            variant="secondary"
            onPress={() => router.push(doctorRoutes.patient(r.patient_id as string))}
          />
        )}

        {r.result?.kind === 'lab' && (
          <>
            <SectionHeader title={tx('result.values', 'Values')} />
            {analytes.length === 0 ? (
              <Card variant="flush">
                <Text style={styles.none}>
                  {tx('result.noValues', 'The laboratory has not released individual values for this order.')}
                </Text>
              </Card>
            ) : (
              <CardStack spacing="sm">
                {analytes.map((a, i) => (
                  <Card key={a.id ?? `${a.analyte}-${i}`} variant="flush">
                    <AnalyteRow analyte={a} styles={styles} valueColor={statusMap[toneForFlag(a.flag)].fg} tx={tx} />
                  </Card>
                ))}
              </CardStack>
            )}
            <Text style={styles.caption}>
              {tx(
                'result.valuesCaption',
                'Values, flags and reference intervals are shown exactly as the laboratory released them. Where no interval was recorded, none is shown.',
              )}
            </Text>
          </>
        )}

        {r.result?.kind === 'radiology' && (
          <>
            <SectionHeader title={tx('result.report', 'Report')} />
            <CardStack spacing="sm">
              <Card>
                <SummaryLine label={tx('result.reportNumber', 'Report')} value={r.result.report_number ?? '—'} />
              </Card>
              <Card>
                <SummaryLine label={tx('result.reportStatus', 'Status')} value={r.result.report_status ?? '—'} />
              </Card>
              <Card>
                <SummaryLine label={tx('result.radiologist', 'Radiologist')} value={r.result.reported_by_name ?? '—'} />
              </Card>
              {(
                [
                  ['technique', 'Technique', r.result.technique],
                  ['findings', 'Findings', r.result.findings],
                  ['impression', 'Impression', r.result.impression],
                  ['recommendation', 'Recommendation', r.result.recommendation],
                ] as const
              ).map(([key, fallback, text]) =>
                text ? (
                  <Card key={key}>
                    <Text style={styles.blockLabel}>{tx(`result.${key}`, fallback)}</Text>
                    <Text style={styles.blockText}>{text}</Text>
                  </Card>
                ) : null,
              )}
            </CardStack>
          </>
        )}

        {r.result === null && (
          <NoticeBanner
            icon="info"
            tone="pending"
            title={tx('result.noDetailTitle', 'Detail not available on this device')}
            message={tx(
              'result.noDetailBody',
              'The underlying record could not be loaded for this notification. What is shown above is the notification as it was raised — open the patient’s chart on a workstation for the full report.',
            )}
          />
        )}

        {acked ? (
          <>
            <Card style={styles.ackedCard}>
              <View style={styles.ackedRow}>
                <Icon name="check-circle" size={20} color={colors.statusNormal} />
                <Text style={styles.ackedText}>
                  {tx('result.ackedBy', 'Acknowledged by {{name}} — {{when}}.', {
                    name: r.acknowledged_by_name ?? tx('result.ackedByUnknown', 'a clinician'),
                    when: fmtReported(r.acknowledged_at),
                  })}
                </Text>
              </View>
              <Text style={styles.caption}>
                {tx('result.ackedCaption', 'This is the same acknowledgement the desktop results inbox shows.')}
              </Text>
            </Card>

            {/* The recorded interpretation, read-only — from the server's row. */}
            {interpretation ? <InterpretationCard interpretation={interpretation} tx={tx} /> : null}

            {/* The chosen next step, offered — never taken — as a button. */}
            {nextStep ? (
              <>
                <SectionHeader title={tx('result.nextStepTitle', 'Your next step')} />
                <CareButton
                  label={nextStepCta(nextStep)}
                  icon={NEXT_ACTION_ICON[nextStep]}
                  iconRight="chevron-right"
                  variant="primary"
                  onPress={() => takeStep(nextStep, r)}
                />
                <Text style={styles.caption}>
                  {tx(
                    'result.nextStepCaption',
                    'Recorded with your acknowledgement as “{{step}}”. Nothing happens until you take it.',
                    { step: nextActionLabel(nextStep, tx) },
                  )}
                </Text>
              </>
            ) : null}

            {ordered ? (
              <NoticeBanner
                icon="check-circle"
                tone="normal"
                title={tx('result.orderedTitle', 'Ordered')}
                message={
                  ordered.code
                    ? tx('result.orderedBodyWithCode', 'Ordered as {{code}}; the laboratory will see it.', {
                        code: ordered.code,
                      })
                    : tx('result.orderedBody', 'Ordered; the laboratory will see it.')
                }
              />
            ) : null}
          </>
        ) : (
          <>
            <CareButton
              label={
                r.is_critical
                  ? tx('result.ackCritical', 'Acknowledge Critical Result')
                  : tx('result.ack', 'Acknowledge Result')
              }
              icon="check-circle"
              variant={r.is_critical ? 'dangerSolid' : 'primary'}
              loading={acknowledge.isPending}
              onPress={() => setAckOpen(true)}
            />
            <Text style={styles.caption}>
              {tx(
                'result.ackCaptionAct',
                'Acknowledging records your name and the time against this result on the hospital record. You will be asked to confirm, and may add a note for the patient and a next step.',
              )}
            </Text>
          </>
        )}
      </>
    );
  } else {
    body = <LoadingBlock label={tx('result.loading', 'Loading this result…')} />;
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={tx('result.title', 'Result')} align="center" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={detail.isFetching && !detail.isPending}
            onRefresh={() => void refetch()}
            tintColor={colors.blue}
          />
        }
      >
        {stale}
        {body}
      </ScrollView>
      {detail.data ? (
        <ResultActionSheets
          result={detail.data as InterpretedResultDetail}
          patientLabel={patientLabelOf(detail.data)}
          offered={offeredSteps(detail.data)}
          links={nextActionLinks(withLinks(detail.data as InterpretedResultDetail))}
          ackOpen={ackOpen && !detail.data.acknowledged_at}
          onAckClose={() => setAckOpen(false)}
          ackBusy={acknowledge.isPending}
          onAck={(body) => void acknowledgeWith(detail.data as InboxResultDetail, body)}
          threadOpen={threadOpen}
          onThreadClose={() => setThreadOpen(false)}
          threadBusy={startThread.isPending}
          onThread={(values) => void submitThread(detail.data as InterpretedResultDetail, values)}
          repeatOpen={repeatOpen}
          onRepeatClose={() => setRepeatOpen(false)}
          repeatBusy={orderTest.isPending}
          onRepeat={(values) => void submitRepeat(detail.data as InterpretedResultDetail, values)}
          tx={tx}
        />
      ) : null}
      {dialog.element}
    </SafeAreaView>
  );
}

/**
 * The three sheets this screen can open, mounted together. Pure presentation:
 * every decision (what to send, what the answer means) stays in the screen.
 */
function ResultActionSheets({
  result,
  patientLabel,
  offered,
  links,
  ackOpen,
  onAckClose,
  ackBusy,
  onAck,
  threadOpen,
  onThreadClose,
  threadBusy,
  onThread,
  repeatOpen,
  onRepeatClose,
  repeatBusy,
  onRepeat,
  tx,
}: {
  result: InterpretedResultDetail;
  patientLabel: string;
  offered: readonly ResultNextAction[];
  links: NextActionLinks;
  ackOpen: boolean;
  onAckClose: () => void;
  ackBusy: boolean;
  onAck: (body: AcknowledgeResultBody) => void;
  threadOpen: boolean;
  onThreadClose: () => void;
  threadBusy: boolean;
  onThread: (values: { subject: string; body: string }) => void;
  repeatOpen: boolean;
  onRepeatClose: () => void;
  repeatBusy: boolean;
  onRepeat: (values: RepeatTestValues) => void;
  tx: (key: string, defaultValue: string, params?: Record<string, unknown>) => string;
}) {
  const testName = result.result?.test_name ?? null;
  return (
    <>
      <AcknowledgeSheet
        visible={ackOpen}
        onClose={onAckClose}
        busy={ackBusy}
        result={result}
        patientLabel={patientLabel}
        offered={offered}
        onSubmit={onAck}
        tx={tx}
      />
      <StartThreadSheet
        visible={threadOpen}
        onClose={onThreadClose}
        busy={threadBusy}
        patientLabel={patientLabel}
        testName={testName}
        onSubmit={onThread}
        tx={tx}
      />
      <RepeatTestSheet
        visible={repeatOpen}
        onClose={onRepeatClose}
        busy={repeatBusy}
        patientLabel={patientLabel}
        testName={links.repeat_test?.test_name ?? testName}
        testCode={links.repeat_test?.test_code ?? null}
        onSubmit={onRepeat}
        tx={tx}
      />
    </>
  );
}

/**
 * One analyte. The flag is the laboratory's own (`flag`), mapped to a tone by
 * `toneForFlag` — this row classifies nothing itself.
 */
function AnalyteRow({
  analyte,
  styles,
  valueColor,
  tx,
}: {
  analyte: InboxAnalyte;
  styles: ReturnType<typeof makeStyles>;
  valueColor: string;
  tx: (key: string, defaultValue: string, params?: Record<string, unknown>) => string;
}) {
  const tone = toneForFlag(analyte.flag);
  return (
    <View style={styles.analyte}>
      <View style={styles.analyteHead}>
        <Text style={styles.analyteName}>{analyte.analyte}</Text>
        {analyte.flag ? (
          <StatusBadge status={analyte.flag} tone={tone} size="sm" />
        ) : (
          <Text style={styles.analyteNoFlag}>{tx('result.noFlag', 'No flag recorded')}</Text>
        )}
      </View>
      <Text style={[styles.analyteValue, { color: valueColor }]}>
        {analyte.value ?? '—'}
        {analyte.unit ? <Text style={styles.analyteUnit}>{` ${analyte.unit}`}</Text> : null}
      </Text>
      <Text style={styles.analyteRef}>
        {analyte.reference
          ? tx('result.reference', 'Reference {{range}}', {
              range: analyte.reference,
            })
          : tx('result.noReference', 'No reference interval recorded by the laboratory')}
      </Text>
    </View>
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

    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    title: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: colors.textPrimary,
    },
    body: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },

    blockLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textMuted,
      marginBottom: 2,
    },
    blockText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },

    analyte: { padding: spacing.md - 2, gap: 2 },
    analyteHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    analyteName: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    analyteNoFlag: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    analyteValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
    },
    analyteUnit: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    analyteRef: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    none: {
      padding: spacing.md,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    caption: {
      paddingHorizontal: spacing.xs,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    ackedCard: { gap: spacing.sm },
    ackedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    ackedText: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
  });
