/**
 * "Acknowledge and act" — the confirmation sheet on `/clinician/results/[id]`.
 *
 * It replaces the plain yes/no dialog. The act is still ONE button, still
 * named "Acknowledge", still recorded under the clinician's name — the sheet
 * only lets that same act carry a note to the patient, a private comment and
 * the next step the clinician intends. Everything is optional; an empty sheet
 * submitted is exactly the old acknowledgement.
 *
 * Rules inherited from the screen (see its header): the sheet names the
 * patient, their number and the result in its lead line so an accidental tap
 * cannot become an acknowledgement; it decides nothing about the outcome —
 * `onSubmit` hands the body up and the SCREEN judges the server's answer.
 *
 * The "Share with patient" switch defaults ON the moment a patient note is
 * typed, and is left alone once the clinician has touched it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Chip, spacing, typography, useTheme, type IconName, type Palette } from '@/components/opes-ui';
import { CareButton } from '@/components/care/shared';
import type { InboxResultDetail } from '@/lib/api/doctorQueries';
import {
  RESULT_NEXT_ACTIONS,
  RESULT_NOTE_MAX,
  type AcknowledgeResultBody,
  type ResultNextAction,
} from '@/lib/api/resultActionQueries';
import { FieldHelper, FieldLabel, NoteField, SheetShell, type ResultTx } from './SheetShell';

export const NEXT_ACTION_ICON: Record<ResultNextAction, IconName> = {
  none: 'check',
  prescribe: 'pill',
  follow_up: 'calendar-plus',
  message: 'chat',
  repeat_test: 'refresh',
};

/** The chip label for a next step — shared with the read-only card. */
export function nextActionLabel(action: ResultNextAction, tx: ResultTx): string {
  switch (action) {
    case 'prescribe':
      return tx('result.nextPrescribe', 'Prescribe');
    case 'follow_up':
      return tx('result.nextFollowUp', 'Book follow-up');
    case 'message':
      return tx('result.nextMessage', 'Message patient');
    case 'repeat_test':
      return tx('result.nextRepeat', 'Repeat test');
    case 'none':
    default:
      return tx('result.nextNone', 'None');
  }
}

export type AcknowledgeSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** True while the acknowledgement is in flight — the sheet locks. */
  busy: boolean;
  result: InboxResultDetail;
  /** The patient as the screen names them (name, or "this patient"). */
  patientLabel: string;
  /** Next steps this clinician may take from this device (capability-gated by the screen). */
  offered: readonly ResultNextAction[];
  onSubmit: (body: AcknowledgeResultBody) => void;
  tx: ResultTx;
};

export function AcknowledgeSheet({
  visible,
  onClose,
  busy,
  result,
  patientLabel,
  offered,
  onSubmit,
  tx,
}: AcknowledgeSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  const [shareTouched, setShareTouched] = useState(false);
  const [shareChoice, setShareChoice] = useState(true);
  const [nextAction, setNextAction] = useState<ResultNextAction>('none');

  // A fresh sheet every time it opens: nothing typed for one result may leak
  // into the next.
  useEffect(() => {
    if (visible) {
      setNote('');
      setComment('');
      setShareTouched(false);
      setShareChoice(true);
      setNextAction('none');
    }
  }, [visible, result.id]);

  const hasNote = note.trim().length > 0;
  const share = shareTouched ? shareChoice : hasNote;

  const chips = RESULT_NEXT_ACTIONS.filter((a) => a === 'none' || offered.includes(a));

  const lead = tx('result.sheetLead', '{{patient}}{{number}} — {{title}}.', {
    patient: patientLabel,
    number: result.patient_health_id ? ` (${result.patient_health_id})` : '',
    title: result.title,
  });

  const submit = () =>
    onSubmit({
      patient_note: hasNote ? note : undefined,
      share_with_patient: hasNote ? share : undefined,
      comment: comment.trim() ? comment : undefined,
      next_action: nextAction,
    });

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      busy={busy}
      icon={result.is_critical ? 'alert-circle' : 'check-circle'}
      tone={result.is_critical ? 'critical' : 'warning'}
      title={
        result.is_critical
          ? tx('result.sheetCriticalTitle', 'Acknowledge CRITICAL result and act')
          : tx('result.sheetTitle', 'Acknowledge and act')
      }
      lead={lead}
      closeLabel={tx('result.confirmCancel', 'Not yet')}
      actions={
        <>
          <CareButton
            label={tx('result.confirmCta', 'Acknowledge')}
            icon="check-circle"
            variant={result.is_critical ? 'dangerSolid' : 'primary'}
            loading={busy}
            onPress={submit}
          />
          <CareButton
            label={tx('result.confirmCancel', 'Not yet')}
            variant="secondary"
            disabled={busy}
            onPress={onClose}
          />
        </>
      }
    >
      {/* ── Patient-facing note ─────────────────────────────────────── */}
      <FieldLabel
        label={tx('result.patientNoteLabel', 'Note to the patient')}
        trailing={tx('result.charCount', '{{count}}/{{max}}', { count: note.length, max: RESULT_NOTE_MAX })}
      />
      <NoteField
        value={note}
        onChangeText={setNote}
        maxLength={RESULT_NOTE_MAX}
        editable={!busy}
        placeholder={tx(
          'result.patientNotePlaceholder',
          'In plain language: what this result means and what happens next…'
        )}
        accessibilityLabel={tx('result.patientNoteLabel', 'Note to the patient')}
      />
      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={styles.switchLabel}>{tx('result.shareLabel', 'Share with patient')}</Text>
          <Text style={styles.switchHelper}>
            {hasNote && !share
              ? tx(
                  'result.shareOffHelper',
                  'Kept on the hospital record only — the patient will not see this note.'
                )
              : tx(
                  'result.patientNoteHelper',
                  'The patient will read this in their app, under this result, with your name.'
                )}
          </Text>
        </View>
        <Switch
          value={hasNote && share}
          disabled={busy || !hasNote}
          onValueChange={(v) => {
            setShareTouched(true);
            setShareChoice(v);
          }}
          accessibilityLabel={tx('result.shareLabel', 'Share with patient')}
          trackColor={{ false: colors.border, true: colors.blueLight }}
          thumbColor={hasNote && share ? colors.blue : colors.surface}
          ios_backgroundColor={colors.border}
        />
      </View>

      {/* ── Private comment ─────────────────────────────────────────── */}
      <FieldLabel
        label={tx('result.commentLabel', 'Private comment')}
        trailing={tx('result.charCount', '{{count}}/{{max}}', {
          count: comment.length,
          max: RESULT_NOTE_MAX,
        })}
      />
      <NoteField
        value={comment}
        onChangeText={setComment}
        maxLength={RESULT_NOTE_MAX}
        minHeight={72}
        editable={!busy}
        placeholder={tx('result.commentPlaceholder', 'For the clinical team only. Never shown to the patient.')}
        accessibilityLabel={tx('result.commentLabel', 'Private comment')}
      />

      {/* ── Next step — only when this role can take one from here ──── */}
      {offered.length > 0 && (
        <>
          <FieldLabel label={tx('result.nextStepLabel', 'Next step')} />
          <View style={styles.chips} accessibilityRole="radiogroup">
            {chips.map((a) => (
              <Chip
                key={a}
                label={nextActionLabel(a, tx)}
                icon={NEXT_ACTION_ICON[a]}
                selected={nextAction === a}
                onPress={busy ? undefined : () => setNextAction(a)}
              />
            ))}
          </View>
          <FieldHelper
            text={tx(
              'result.nextStepHelper',
              'Recorded with the acknowledgement and offered to you as a button once it is saved. Nothing is prescribed, booked, sent or ordered by this sheet.'
            )}
          />
        </>
      )}

      <FieldHelper
        text={tx(
          'result.sheetRecordNote',
          'Your name and the time will be recorded against this result on the hospital record and on the desktop inbox. This cannot be undone from the app.'
        )}
        tone="warning"
      />
    </SheetShell>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    switchText: { flex: 1, minWidth: 0 },
    switchLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    switchHelper: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  });
