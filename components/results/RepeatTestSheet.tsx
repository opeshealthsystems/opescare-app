/**
 * "Repeat this test" — the small sheet behind the Repeat-test next step.
 *
 * Test name and code are pre-filled from the result (editable — a clinician
 * may want the panel, not the analyte); urgency is a three-way pick; the
 * clinical indication is required because the laboratory reads it. The
 * sheet validates presence and hands the values up — the SCREEN posts
 * `POST /mobile/doctor/patients/{id}/lab-orders` and judges the answer.
 * Nothing here says "ordered".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Icon, PillInput, spacing, useTheme, type Palette } from '@/components/opes-ui';
import { CareButton } from '@/components/care/shared';
import {
  LAB_ORDER_URGENCIES,
  RESULT_NOTE_MAX,
  type LabOrderUrgency,
} from '@/lib/api/resultActionQueries';
import { FieldHelper, FieldLabel, NoteField, SheetShell, type ResultTx } from './SheetShell';

export function urgencyLabel(urgency: LabOrderUrgency, tx: ResultTx): string {
  switch (urgency) {
    case 'urgent':
      return tx('result.urgencyUrgent', 'Urgent');
    case 'stat':
      return tx('result.urgencyStat', 'STAT');
    case 'routine':
    default:
      return tx('result.urgencyRoutine', 'Routine');
  }
}

export type RepeatTestValues = {
  test_name: string;
  test_code: string;
  urgency: LabOrderUrgency;
  clinical_indication: string;
};

export type RepeatTestSheetProps = {
  visible: boolean;
  onClose: () => void;
  busy: boolean;
  patientLabel: string;
  testName: string | null;
  testCode: string | null;
  onSubmit: (values: RepeatTestValues) => void;
  tx: ResultTx;
};

export function RepeatTestSheet({
  visible,
  onClose,
  busy,
  patientLabel,
  testName,
  testCode,
  onSubmit,
  tx,
}: RepeatTestSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [name, setName] = useState(testName ?? '');
  const [code, setCode] = useState(testCode ?? '');
  const [urgency, setUrgency] = useState<LabOrderUrgency>('routine');
  const [indication, setIndication] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(testName ?? '');
      setCode(testCode ?? '');
      setUrgency('routine');
      setIndication('');
      setTouched(false);
    }
  }, [visible, testName, testCode]);

  const nameMissing = name.trim() === '';
  const indicationMissing = indication.trim() === '';
  const required = tx('result.fieldRequired', 'This field is required.');

  const submit = () => {
    setTouched(true);
    if (nameMissing || indicationMissing) return;
    onSubmit({
      test_name: name.trim(),
      test_code: code.trim(),
      urgency,
      clinical_indication: indication.trim(),
    });
  };

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      busy={busy}
      icon="flask"
      tone="pending"
      title={tx('result.repeatSheetTitle', 'Repeat this test')}
      lead={tx('result.repeatSheetLead', 'A new laboratory order for {{patient}}, in your name.', {
        patient: patientLabel,
      })}
      closeLabel={tx('result.sheetCancel', 'Cancel')}
      actions={
        <>
          <CareButton
            label={tx('result.repeatCta', 'Order test')}
            icon="flask"
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
      <FieldLabel label={tx('result.repeatTestNameLabel', 'Test')} />
      <PillInput
        icon={<Icon name="flask" size={16} color={colors.blue} />}
        value={name}
        onChangeText={setName}
        editable={!busy}
        maxLength={200}
        error={touched && nameMissing ? required : undefined}
        accessibilityLabel={tx('result.repeatTestNameLabel', 'Test')}
        style={styles.pillText}
      />
      <FieldLabel label={tx('result.repeatTestCodeLabel', 'Code (optional)')} />
      <PillInput
        icon={<Icon name="qr" size={16} color={colors.blue} />}
        value={code}
        onChangeText={setCode}
        editable={!busy}
        maxLength={64}
        autoCapitalize="characters"
        accessibilityLabel={tx('result.repeatTestCodeLabel', 'Code (optional)')}
        style={styles.pillText}
      />

      <FieldLabel label={tx('result.urgencyLabel', 'Urgency')} />
      <View style={styles.chips} accessibilityRole="radiogroup">
        {LAB_ORDER_URGENCIES.map((u) => (
          <Chip
            key={u}
            label={urgencyLabel(u, tx)}
            selected={urgency === u}
            onPress={busy ? undefined : () => setUrgency(u)}
          />
        ))}
      </View>

      <FieldLabel
        label={tx('result.indicationLabel', 'Clinical indication')}
        trailing={tx('result.charCount', '{{count}}/{{max}}', {
          count: indication.length,
          max: RESULT_NOTE_MAX,
        })}
      />
      <NoteField
        value={indication}
        onChangeText={setIndication}
        maxLength={RESULT_NOTE_MAX}
        minHeight={72}
        editable={!busy}
        placeholder={tx('result.indicationPlaceholder', 'Why the test is being repeated…')}
        accessibilityLabel={tx('result.indicationLabel', 'Clinical indication')}
        error={touched && indicationMissing ? required : undefined}
      />
      <FieldHelper
        text={tx(
          'result.repeatHelper',
          'The laboratory desk sees this order under your name; the patient is told a new test was ordered.'
        )}
      />
    </SheetShell>
  );
}

const makeStyles = (_colors: Palette) =>
  StyleSheet.create({
    pillText: { paddingVertical: spacing.sm + 2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
  });
