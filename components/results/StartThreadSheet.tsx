/**
 * "Message the patient" — the small sheet behind the Message next step when
 * no conversation with this patient exists yet.
 *
 * Subject is pre-filled from the test the result is about; the body is the
 * clinician's. The sheet validates presence only and hands the values up —
 * the SCREEN posts `POST /mobile/doctor/messages/threads` and judges the
 * answer (a created thread is opened; a 404/405 is reported as "not
 * available on this server yet", never as sent).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Icon, PillInput, spacing, useTheme, type Palette } from '@/components/opes-ui';
import { CareButton } from '@/components/care/shared';
import { RESULT_NOTE_MAX } from '@/lib/api/resultActionQueries';
import { FieldHelper, FieldLabel, NoteField, SheetShell, type ResultTx } from './SheetShell';

export type StartThreadSheetProps = {
  visible: boolean;
  onClose: () => void;
  busy: boolean;
  patientLabel: string;
  /** The test the result is about — seeds the subject. Null when unknown. */
  testName: string | null;
  onSubmit: (values: { subject: string; body: string }) => void;
  tx: ResultTx;
};

export function StartThreadSheet({
  visible,
  onClose,
  busy,
  patientLabel,
  testName,
  onSubmit,
  tx,
}: StartThreadSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const defaultSubject = testName
    ? tx('result.threadSubjectPrefill', 'About your {{test}} result', { test: testName })
    : tx('result.threadSubjectPrefillGeneric', 'About your recent result');

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (visible) {
      setSubject(defaultSubject);
      setBody('');
      setTouched(false);
    }
    // `defaultSubject` follows `testName`, which is stable for one result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const subjectMissing = subject.trim() === '';
  const bodyMissing = body.trim() === '';
  const required = tx('result.fieldRequired', 'This field is required.');

  const submit = () => {
    setTouched(true);
    if (subjectMissing || bodyMissing) return;
    onSubmit({ subject: subject.trim(), body: body.trim() });
  };

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      busy={busy}
      icon="chat"
      tone="pending"
      title={tx('result.threadSheetTitle', 'Message the patient')}
      lead={tx('result.threadSheetLead', 'A new conversation with {{patient}}. They read it in their app.', {
        patient: patientLabel,
      })}
      closeLabel={tx('result.sheetCancel', 'Cancel')}
      actions={
        <>
          <CareButton
            label={tx('result.threadCta', 'Send and open')}
            icon="send"
            loading={busy}
            onPress={submit}
          />
          <CareButton
            label={tx('result.sheetCancel', 'Cancel')}
            variant="secondary"
            disabled={busy}
            onPress={onClose}
          />
        </>
      }
    >
      <FieldLabel label={tx('result.threadSubjectLabel', 'Subject')} />
      <PillInput
        icon={<Icon name="document-text" size={16} color={colors.blue} />}
        value={subject}
        onChangeText={setSubject}
        editable={!busy}
        maxLength={200}
        error={touched && subjectMissing ? required : undefined}
        accessibilityLabel={tx('result.threadSubjectLabel', 'Subject')}
        style={styles.pillText}
      />
      <FieldLabel
        label={tx('result.threadBodyLabel', 'Message')}
        trailing={tx('result.charCount', '{{count}}/{{max}}', { count: body.length, max: RESULT_NOTE_MAX })}
      />
      <NoteField
        value={body}
        onChangeText={setBody}
        maxLength={RESULT_NOTE_MAX}
        editable={!busy}
        placeholder={tx('result.threadBodyPlaceholder', 'What you want the patient to know or do…')}
        accessibilityLabel={tx('result.threadBodyLabel', 'Message')}
        error={touched && bodyMissing ? required : undefined}
      />
      <FieldHelper
        text={tx(
          'result.threadHelper',
          'Sent under your name. Do not paste values the patient has not been told about in person if your service requires that.'
        )}
      />
    </SheetShell>
  );
}

const makeStyles = (_colors: Palette) =>
  StyleSheet.create({
    pillText: { paddingVertical: spacing.sm + 2 },
  });
