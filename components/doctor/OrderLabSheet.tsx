/**
 * "Order a laboratory test" — the clinician's sheet on the chart (and the
 * scanner's hand-off), as opposed to `components/results/RepeatTestSheet`,
 * which pre-fills from a result.
 *
 * The test is picked from the laboratory catalogue (`GET
 * /mobile/doctor/lab-catalogue?q=`) or typed as written; the code is optional;
 * urgency is a three-way pick; the clinical indication is required because
 * the laboratory reads it. The sheet posts `POST
 * /mobile/doctor/patients/{id}/lab-orders` itself and only says "Ordered" from
 * the server's answer. A 404/405 on the route is named as such, never faked.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Chip, Icon, PillInput, spacing, typography, useTheme, type Palette } from '@/components/opes-ui';
import { CareButton, describeFailure } from '@/components/care/shared';
import { FieldHelper, FieldLabel, NoteField, SheetShell } from '@/components/results/SheetShell';
import { isDoctorFeatureUnserved } from '@/lib/api/doctorQueries';
import {
  LAB_ORDER_URGENCIES,
  RESULT_NOTE_MAX,
  useLabCatalogue,
  useOrderLabTest,
  type LabCatalogueEntry,
  type LabOrderUrgency,
} from '@/lib/api/resultActionQueries';

export type OrderLabSheetProps = {
  visible: boolean;
  onClose: () => void;
  patientId: string;
  patientLabel: string | null;
};

export function OrderLabSheet({ visible, onClose, patientId, patientLabel }: OrderLabSheetProps) {
  const { t } = useTranslation();
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors, statusMap.critical.fg), [colors, statusMap]);
  const order = useOrderLabTest();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [urgency, setUrgency] = useState<LabOrderUrgency>('routine');
  const [indication, setIndication] = useState('');
  const [touched, setTouched] = useState(false);
  const [ordered, setOrdered] = useState<{ name: string; code: string | null } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName('');
      setCode('');
      setUrgency('routine');
      setIndication('');
      setTouched(false);
      setOrdered(null);
      setFailure(null);
      order.reset();
    }
    // The mutation object is stable per render; resetting on open is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const catalogue = useLabCatalogue(name, { enabled: visible && ordered === null });
  const suggestions: LabCatalogueEntry[] = useMemo(() => {
    const rows = catalogue.data ?? [];
    const typed = name.trim().toLowerCase();
    // Hide the one exact pick the clinician already took.
    return rows.filter((r) => !(r.name.toLowerCase() === typed && r.code === code)).slice(0, 6);
  }, [catalogue.data, name, code]);

  const busy = order.isPending;
  const nameMissing = name.trim() === '';
  const indicationMissing = indication.trim() === '';
  const required = t('opesDoctor.orderLab.required');
  const urgencyLabel = (u: LabOrderUrgency) =>
    u === 'urgent'
      ? t('opesDoctor.result.urgencyUrgent', { defaultValue: 'Urgent' })
      : u === 'stat'
        ? t('opesDoctor.result.urgencyStat', { defaultValue: 'STAT' })
        : t('opesDoctor.result.urgencyRoutine', { defaultValue: 'Routine' });

  const pick = (entry: LabCatalogueEntry) => {
    setName(entry.name);
    setCode(entry.code);
  };

  const submit = async () => {
    setTouched(true);
    setFailure(null);
    if (nameMissing || indicationMissing) return;
    try {
      const result = await order.mutateAsync({
        patient_id: patientId,
        test_name: name.trim(),
        test_code: code.trim() || undefined,
        urgency,
        clinical_indication: indication.trim(),
      });
      setOrdered({
        name: result?.test_name ?? result?.name ?? name.trim(),
        code: result?.code ?? (code.trim() || null),
      });
    } catch (e) {
      setFailure(
        isDoctorFeatureUnserved(e)
          ? t('opesDoctor.orderLab.notServed')
          : describeFailure(e).message
      );
    }
  };

  const lead = t('opesDoctor.orderLab.lead', {
    patient: patientLabel ?? t('opesDoctor.chart.title', { defaultValue: 'this patient' }),
  });

  if (ordered) {
    return (
      <SheetShell
        visible={visible}
        onClose={onClose}
        busy={false}
        icon="check-circle"
        tone="normal"
        title={t('opesDoctor.orderLab.orderedTitle')}
        lead={t('opesDoctor.orderLab.orderedBody', {
          test: ordered.code ? `${ordered.name} (${ordered.code})` : ordered.name,
        })}
        closeLabel={t('opesCore.common.close', { defaultValue: 'Close' })}
        actions={
          <CareButton
            label={t('opesCore.common.close', { defaultValue: 'Close' })}
            icon="check-circle"
            onPress={onClose}
          />
        }
      >
        <View />
      </SheetShell>
    );
  }

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      busy={busy}
      icon="flask"
      tone="pending"
      title={t('opesDoctor.orderLab.title')}
      lead={lead}
      closeLabel={t('opesDoctor.orderLab.cancel')}
      actions={
        <>
          <CareButton label={t('opesDoctor.orderLab.cta')} icon="flask" loading={busy} onPress={() => void submit()} />
          <CareButton label={t('opesDoctor.orderLab.cancel')} variant="secondary" disabled={busy} onPress={onClose} />
        </>
      }
    >
      <FieldLabel label={t('opesDoctor.orderLab.searchLabel')} />
      <PillInput
        icon={<Icon name="flask" size={16} color={colors.blue} />}
        value={name}
        onChangeText={(v) => {
          setName(v);
          setCode('');
        }}
        editable={!busy}
        maxLength={200}
        placeholder={t('opesDoctor.orderLab.searchPlaceholder')}
        error={touched && nameMissing ? required : undefined}
        accessibilityLabel={t('opesDoctor.orderLab.searchLabel')}
        style={styles.pillText}
      />
      {suggestions.length > 0 ? (
        <View style={styles.suggestBlock}>
          <Text style={styles.suggestTitle}>{t('opesDoctor.orderLab.suggestions')}</Text>
          <View style={styles.chips}>
            {suggestions.map((s) => (
              <Chip
                key={`${s.code}:${s.name}`}
                label={s.code ? `${s.name} · ${s.code}` : s.name}
                selected={false}
                onPress={busy ? undefined : () => pick(s)}
              />
            ))}
          </View>
        </View>
      ) : name.trim().length >= 2 && catalogue.isFetched && !catalogue.isError ? (
        <FieldHelper text={t('opesDoctor.orderLab.noCatalogue')} />
      ) : null}

      <FieldLabel label={t('opesDoctor.orderLab.codeLabel')} />
      <PillInput
        icon={<Icon name="qr" size={16} color={colors.blue} />}
        value={code}
        onChangeText={setCode}
        editable={!busy}
        maxLength={64}
        autoCapitalize="characters"
        accessibilityLabel={t('opesDoctor.orderLab.codeLabel')}
        style={styles.pillText}
      />

      <FieldLabel label={t('opesDoctor.orderLab.urgencyLabel')} />
      <View style={styles.chips} accessibilityRole="radiogroup">
        {LAB_ORDER_URGENCIES.map((u) => (
          <Chip key={u} label={urgencyLabel(u)} selected={urgency === u} onPress={busy ? undefined : () => setUrgency(u)} />
        ))}
      </View>

      <FieldLabel
        label={t('opesDoctor.orderLab.indicationLabel')}
        trailing={`${indication.length}/${RESULT_NOTE_MAX}`}
      />
      <NoteField
        value={indication}
        onChangeText={setIndication}
        maxLength={RESULT_NOTE_MAX}
        minHeight={72}
        editable={!busy}
        placeholder={t('opesDoctor.orderLab.indicationPlaceholder')}
        accessibilityLabel={t('opesDoctor.orderLab.indicationLabel')}
        error={touched && indicationMissing ? required : undefined}
      />
      <FieldHelper text={t('opesDoctor.orderLab.helper')} />
      {failure ? (
        <View style={styles.failure} accessibilityRole="alert">
          <Icon name="alert-triangle" size={16} color={statusMap.critical.fg} />
          <Text style={styles.failureText}>{failure}</Text>
        </View>
      ) : null}
    </SheetShell>
  );
}

const makeStyles = (colors: Palette, alert: string) =>
  StyleSheet.create({
    pillText: { paddingVertical: spacing.sm + 2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs },
    suggestBlock: { marginTop: spacing.xs, marginBottom: spacing.sm, gap: spacing.xs },
    suggestTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    failure: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    failureText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: alert,
    },
  });
