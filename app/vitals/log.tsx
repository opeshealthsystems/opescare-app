import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
/**
 * Log a reading — `/vitals/log`.
 *
 * The patient's own vitals log: a blood pressure, weight, temperature or blood
 * sugar they measured at home. Backed by `POST /mobile/patient-vitals`
 * (App\Http\Controllers\Api\Mobile\PatientRecordedVitalsController).
 *
 * ── The one thing this screen must never get wrong ──────────────────────────
 *
 * A self-reported reading is NOT a clinical measurement, and the screen must
 * make that visible without the patient having to read anything. So:
 *
 *   - the two sets of readings live in two separate, separately-headed
 *     sections — "Recorded by you" and "Measured at a facility" — never one
 *     merged list sorted by date;
 *   - every row carries a provenance chip, and the chips are visually
 *     different: self-reported is an outlined amber chip with a `person`
 *     glyph, facility-measured is a filled green chip with `shield-check`.
 *     A glance is enough; colour is not the only difference, so it survives
 *     colour-blindness and a monochrome screenshot;
 *   - the self-reported section carries the API's own explanation
 *     (`provenance.description`) as a notice, not as fine print.
 *
 * ── Refusals ────────────────────────────────────────────────────────────────
 *
 * The server refuses a physiologically impossible value rather than clamping
 * it. That refusal is rendered inline, per field, with the value the patient
 * typed and the accepted range — never as a generic failure toast. The form
 * keeps everything the patient entered so they can fix one number.
 *
 * The accepted ranges shown under each input come from
 * `GET /mobile/patient-vitals/options`, so the client and the server cannot
 * disagree about what is acceptable.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardStack,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ScreenHeader,
  SectionHeader,
  formatDateTime,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { NoticeBanner } from '@/components/care/shared';
import {
  provenanceOfClinicalSource,
  refusalMessageOf,
  rejectionsOf,
  useLogVital,
  useSelfReportedVitals,
  useVitalLogOptions,
  useVoidVital,
  type MeasureOption,
  type MeasureUnitOption,
  type Provenance,
  type Rejection,
  type SelfReportedMeasure,
  type SelfReportedVital,
} from '@/lib/api/patientWriteQueries';
import { useLatestVitals, type VitalMeasure } from '@/lib/api/vitalsQueries';

/** Kit glyphs, never Lucide and never emoji. */
const MEASURE_ICON: Record<SelfReportedMeasure, IconName> = {
  blood_pressure: 'heart-pulse',
  weight: 'ruler',
  temperature: 'activity',
  blood_sugar: 'droplet',
};

/**
 * Labels for the CLINICAL endpoint's measures. Reuses `home.vitals.*` — the
 * keys the home vitals card already ships in both languages — so the same
 * measure is not named two different things on two screens. A key this map
 * does not cover falls back to the API's own key rather than inventing a name.
 */
const CLINICAL_MEASURE_KEY: Record<string, string> = {
  heart_rate: 'home.vitals.heartRate',
  blood_pressure: 'home.vitals.bloodPressure',
  blood_sugar: 'home.vitals.bloodSugar',
  oxygen_saturation: 'home.vitals.oxygenSaturation',
  temperature: 'home.vitals.temperature',
  respiratory_rate: 'home.vitals.respiratoryRate',
};

export default function LogVitalScreen() {
  usePrivateScreen();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const optionsQuery = useVitalLogOptions();
  const logQuery = useSelfReportedVitals();
  const clinicalQuery = useLatestVitals();
  const logVital = useLogVital();
  const voidVital = useVoidVital();

  const options = optionsQuery.data;

  const [measureKey, setMeasureKey] = useState<SelfReportedMeasure>('blood_pressure');
  const [unit, setUnit] = useState<string | null>(null);
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [context, setContext] = useState<string | null>(null);
  const [device, setDevice] = useState('');
  const [note, setNote] = useState('');
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [refusalMessage, setRefusalMessage] = useState<string | null>(null);

  const measure: MeasureOption | undefined = useMemo(
    () => options?.measures.find((m) => m.measure === measureKey),
    [options, measureKey],
  );

  const unitOption: MeasureUnitOption | undefined = useMemo(() => {
    if (!measure) return undefined;
    return measure.units.find((u) => u.unit === unit) ?? measure.units.find((u) => u.is_default) ?? measure.units[0];
  }, [measure, unit]);

  // Switching measure clears the numbers: a systolic left in the box while the
  // patient now means "weight" is the sort of carry-over that gets recorded.
  const chooseMeasure = useCallback((next: SelfReportedMeasure) => {
    setMeasureKey(next);
    setUnit(null);
    setPrimary('');
    setSecondary('');
    setContext(null);
    setRejections([]);
    setRefusalMessage(null);
  }, []);

  useEffect(() => {
    if (measure && unit && !measure.units.some((u) => u.unit === unit)) setUnit(null);
  }, [measure, unit]);

  const rejectionFor = useCallback((field: string) => rejections.find((r) => r.field === field) ?? null, [rejections]);

  const parsed = (raw: string): number | null => {
    const n = Number(raw.replace(',', '.').trim());
    return raw.trim() !== '' && Number.isFinite(n) ? n : null;
  };

  const primaryValue = parsed(primary);
  const secondaryValue = parsed(secondary);
  const ready =
    !!measure &&
    !!unitOption &&
    primaryValue !== null &&
    (!measure.has_two_values || secondaryValue !== null) &&
    !logVital.isPending;

  const submit = useCallback(async () => {
    if (!measure || !unitOption || primaryValue === null) return;
    setRejections([]);
    setRefusalMessage(null);

    try {
      const saved = await logVital.mutateAsync({
        measure: measure.measure,
        unit: unitOption.unit,
        ...(measure.has_two_values
          ? { systolic: primaryValue, diastolic: secondaryValue ?? 0 }
          : { value: primaryValue }),
        ...(context ? { measurement_context: context } : {}),
        ...(device.trim() ? { device_label: device.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });

      setPrimary('');
      setSecondary('');
      setNote('');

      // The API's own advice, when it has any, is the headline — a reading it
      // flagged for a human is more important than the confirmation.
      dialog.show({
        title: saved.advisory
          ? t('patientWrites.vitals.seekCareTitle', {
              defaultValue: 'Please contact a health worker',
            })
          : t('patientWrites.vitals.savedTitle', {
              defaultValue: 'Reading saved',
            }),
        message:
          saved.advisory?.message ??
          t('patientWrites.vitals.savedBody', {
            defaultValue: '{{value}} {{unit}} is now in your own log, marked as recorded by you.',
            value: saved.value,
            unit: saved.unit,
          }),
        tone: saved.advisory ? 'warning' : 'success',
        cancelLabel: t('patientWrites.common.close', { defaultValue: 'Close' }),
      });
    } catch (error) {
      const refused = rejectionsOf(error);
      setRejections(refused);
      setRefusalMessage(
        refusalMessageOf(error) ??
          t('patientWrites.common.unavailableBody', {
            defaultValue: 'We could not reach your record. Nothing you typed has been lost — try again in a moment.',
          }),
      );
    }
  }, [measure, unitOption, primaryValue, secondaryValue, context, device, note, logVital, dialog, t]);

  const confirmVoid = useCallback(
    (reading: SelfReportedVital) => {
      dialog.confirm({
        title: t('patientWrites.vitals.voidTitle', {
          defaultValue: 'Remove this reading?',
        }),
        message: t('patientWrites.vitals.voidBody', {
          defaultValue:
            'It stays in your history as removed, so nothing quietly disappears from your record. You can log a corrected reading afterwards.',
        }),
        confirmLabel: t('patientWrites.vitals.voidConfirm', {
          defaultValue: 'Remove it',
        }),
        cancelLabel: t('patientWrites.common.cancel', {
          defaultValue: 'Cancel',
        }),
        destructive: true,
        onConfirm: async () => {
          await voidVital.mutateAsync({ id: reading.id });
        },
      });
    },
    [dialog, t, voidVital],
  );

  const selfReported = logQuery.data?.data ?? [];
  const selfProvenance: Provenance | undefined = logQuery.data?.meta.provenance ?? options?.provenance;
  const clinical = clinicalQuery.data?.measures ?? [];

  const refreshing = logQuery.isRefetching || clinicalQuery.isRefetching;
  const refresh = useCallback(() => {
    void logQuery.refetch();
    void clinicalQuery.refetch();
  }, [logQuery, clinicalQuery]);

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('patientWrites.vitals.title', {
          defaultValue: 'Log a reading',
        })}
        subtitle={t('patientWrites.vitals.subtitle', {
          defaultValue: 'A measurement you took yourself',
        })}
      />

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />}
      >
        {/* What this is, before anything is typed. */}
        <NoticeBanner
          icon="info"
          tone="pending"
          title={t('patientWrites.vitals.notClinicalTitle', {
            defaultValue: 'This is your own reading',
          })}
          message={
            selfProvenance?.description ??
            t('patientWrites.vitals.notClinicalBody', {
              defaultValue:
                'Anything you log here is marked as recorded by you. It is kept separate from measurements taken at a facility, and a health worker can tell the two apart.',
            })
          }
        />

        {optionsQuery.isLoading ? (
          <Card>
            <View style={s.loading}>
              <ActivityIndicator color={colors.blue} />
              <Text style={s.loadingText}>{t('patientWrites.common.loading', { defaultValue: 'Loading' })}</Text>
            </View>
          </Card>
        ) : !options || !measure || !unitOption ? (
          <Card>
            <EmptyState
              icon="alert-circle"
              tint="amber"
              title={t('patientWrites.common.unavailableTitle', {
                defaultValue: 'This is not available right now',
              })}
              message={t('patientWrites.common.unavailableBody', {
                defaultValue:
                  'We could not reach your record. Nothing you typed has been lost — try again in a moment.',
              })}
            />
          </Card>
        ) : (
          <Card>
            <View style={s.form}>
              <FieldLabel
                text={t('patientWrites.vitals.measureLabel', {
                  defaultValue: 'What did you measure?',
                })}
              />
              <View style={s.chipRow}>
                {options.measures.map((m) => (
                  <Chip
                    key={m.measure}
                    label={m.label}
                    icon={MEASURE_ICON[m.measure]}
                    selected={m.measure === measureKey}
                    onPress={() => chooseMeasure(m.measure)}
                  />
                ))}
              </View>

              {measure.units.length > 1 ? (
                <>
                  <FieldLabel
                    text={t('patientWrites.vitals.unitLabel', {
                      defaultValue: 'Unit',
                    })}
                  />
                  <View style={s.chipRow}>
                    {measure.units.map((u) => (
                      <Chip
                        key={u.unit}
                        label={u.unit}
                        selected={u.unit === unitOption.unit}
                        onPress={() => setUnit(u.unit)}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              <NumberField
                label={measure.primary_label}
                value={primary}
                onChange={setPrimary}
                unit={unitOption.unit}
                bounds={unitOption.primary_bounds}
                rejection={rejectionFor(measure.has_two_values ? 'systolic' : 'value')}
              />

              {measure.has_two_values && unitOption.secondary_bounds ? (
                <NumberField
                  label={measure.secondary_label ?? ''}
                  value={secondary}
                  onChange={setSecondary}
                  unit={unitOption.unit}
                  bounds={unitOption.secondary_bounds}
                  rejection={rejectionFor('diastolic')}
                />
              ) : null}

              {measure.contexts.length > 0 ? (
                <>
                  <FieldLabel
                    text={t('patientWrites.vitals.contextLabel', {
                      defaultValue: 'When did you take it?',
                    })}
                  />
                  <View style={s.chipRow}>
                    {measure.contexts.map((c) => (
                      <Chip
                        key={c.value}
                        label={c.label}
                        selected={c.value === context}
                        onPress={() => setContext(c.value === context ? null : c.value)}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              <TextField
                label={t('patientWrites.vitals.deviceLabel', {
                  defaultValue: 'What did you measure with?',
                })}
                placeholder={t('patientWrites.vitals.devicePlaceholder', {
                  defaultValue: 'e.g. Omron home cuff',
                })}
                value={device}
                onChange={setDevice}
              />

              <TextField
                label={t('patientWrites.vitals.noteLabel', {
                  defaultValue: 'Anything worth noting?',
                })}
                placeholder={t('patientWrites.vitals.notePlaceholder', {
                  defaultValue: 'e.g. sitting, after five minutes of rest',
                })}
                value={note}
                onChange={setNote}
                multiline
              />

              {/* The refusal, in full, where the patient is looking. */}
              {refusalMessage ? (
                <View style={s.refusal}>
                  <View style={s.refusalHead}>
                    <Icon name="alert-triangle" size={18} color={colors.tintRed} />
                    <Text style={s.refusalTitle}>
                      {t('patientWrites.vitals.refusedTitle', {
                        defaultValue: 'Not saved',
                      })}
                    </Text>
                  </View>
                  <Text style={s.refusalText}>{refusalMessage}</Text>
                  {rejections.map((r) => (
                    <Text key={`${r.field}-${r.reason}`} style={s.refusalItem}>
                      {r.reason}
                    </Text>
                  ))}
                </View>
              ) : null}

              <GradientButton
                label={
                  logVital.isPending
                    ? t('patientWrites.vitals.submitting', {
                        defaultValue: 'Saving',
                      })
                    : t('patientWrites.vitals.submit', {
                        defaultValue: 'Save this reading',
                      })
                }
                onPress={submit}
                loading={logVital.isPending}
                disabled={!ready}
                icon="none"
              />
            </View>
          </Card>
        )}

        {/* ── Recorded by you ──────────────────────────────────────────── */}
        <SectionHeader
          variant="overline"
          title={t('patientWrites.vitals.yourLogTitle', {
            defaultValue: 'Recorded by you',
          })}
        />
        {selfReported.length === 0 ? (
          <Card>
            <EmptyState
              icon="person"
              tint="amber"
              title={t('patientWrites.vitals.yourLogEmptyTitle', {
                defaultValue: 'You have not logged anything yet',
              })}
              message={t('patientWrites.vitals.yourLogEmptyBody', {
                defaultValue: 'Readings you take at home appear here, kept separate from what a facility measured.',
              })}
            />
          </Card>
        ) : (
          <CardStack spacing="sm">
            {selfReported.map((reading) => (
              <Card key={reading.id} variant="flush">
                <SelfReportedRow reading={reading} onVoid={() => confirmVoid(reading)} busy={voidVital.isPending} />
              </Card>
            ))}
          </CardStack>
        )}

        {/* ── Measured at a facility ───────────────────────────────────── */}
        <SectionHeader
          variant="overline"
          title={t('patientWrites.vitals.facilityTitle', {
            defaultValue: 'Measured at a facility',
          })}
        />
        {clinical.length === 0 ? (
          <Card>
            <EmptyState
              icon="building"
              tint="green"
              title={t('patientWrites.vitals.facilityEmptyTitle', {
                defaultValue: 'No facility measurements on record',
              })}
              message={t('patientWrites.vitals.facilityEmptyBody', {
                defaultValue: 'Readings taken during a visit will appear here. Nothing is shown until one is recorded.',
              })}
            />
          </Card>
        ) : (
          <CardStack spacing="sm">
            {clinical.map((m) => (
              <Card key={m.key} variant="flush">
                <ClinicalRow measure={m} />
              </Card>
            ))}
          </CardStack>
        )}
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ rows */

/**
 * The provenance chip. Self-reported is OUTLINED and amber with a `person`
 * glyph; verified is FILLED and green with `shield-check`. Shape, colour and
 * glyph all differ, so the distinction survives a colour-blind reader and a
 * grayscale screenshot — it is never carried by colour alone.
 */
function ProvenanceChip({ provenance }: { provenance: Provenance }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const verified = provenance.clinically_verified;

  return (
    <View
      style={[s.provChip, verified ? s.provChipVerified : s.provChipSelf]}
      accessible
      accessibilityLabel={`${provenance.label}. ${provenance.description}`}
    >
      <Icon
        name={verified ? 'shield-check' : 'person'}
        size={12}
        strokeWidth={2}
        color={verified ? colors.tintGreen : colors.tintAmber}
      />
      <Text style={[s.provChipText, { color: verified ? colors.tintGreen : colors.tintAmber }]}>
        {provenance.label}
      </Text>
    </View>
  );
}

function SelfReportedRow({ reading, onVoid, busy }: { reading: SelfReportedVital; onVoid: () => void; busy: boolean }) {
  const { t } = useTranslation();
  const { colors, tintMap } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const tint = tintMap.amber;

  const detail = [
    reading.context_label,
    reading.device_label
      ? t('patientWrites.vitals.measuredWith', {
          defaultValue: 'Measured with {{device}}',
          device: reading.device_label,
        })
      : null,
    reading.note,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={s.row}>
      <View style={s.rowMark}>
        <Icon name={MEASURE_ICON[reading.measure]} size={26} color={tint.fg} />
      </View>

      <View style={s.rowBody}>
        <View style={s.rowTop}>
          <Text style={s.rowTitle}>{reading.label}</Text>
          <Text style={s.rowValue}>
            {reading.value} <Text style={s.rowUnit}>{reading.unit}</Text>
          </Text>
        </View>

        <View style={s.rowChips}>
          <ProvenanceChip provenance={reading.provenance} />
          {reading.advisory ? (
            <View style={[s.provChip, s.provChipAlert]}>
              <Icon name="alert-triangle" size={12} strokeWidth={2} color={colors.tintRed} />
              <Text style={[s.provChipText, { color: colors.tintRed }]}>
                {t('patientWrites.vitals.seekCareTitle', {
                  defaultValue: 'Please contact a health worker',
                })}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={s.rowMeta}>
          {t('patientWrites.vitals.takenAt', {
            defaultValue: 'Taken {{when}}',
            when: formatDateTime(reading.measured_at, ''),
          })}
        </Text>
        {detail ? <Text style={s.rowMeta}>{detail}</Text> : null}

        <Text
          style={[s.rowAction, busy && s.rowActionBusy]}
          onPress={busy ? undefined : onVoid}
          accessibilityRole="button"
        >
          {t('patientWrites.vitals.voidCta', {
            defaultValue: 'Remove this reading',
          })}
        </Text>
      </View>
    </View>
  );
}

/**
 * A facility reading, from the untouched clinical endpoint. Rendered through
 * the SAME provenance chip component as a self-reported one, so the two can
 * never drift into looking alike.
 */
function ClinicalRow({ measure }: { measure: VitalMeasure }) {
  const { t } = useTranslation();
  const { colors, tintMap } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const tint = tintMap.green;

  const labelKey = CLINICAL_MEASURE_KEY[measure.key];
  const measureLabel = labelKey
    ? t(labelKey, { defaultValue: measure.key.replace(/_/g, ' ') })
    : measure.key.replace(/_/g, ' ');

  const provenance = provenanceOfClinicalSource(
    measure.source,
    measure.source === 'lab'
      ? t('patientWrites.vitals.provenanceLab', {
          defaultValue: 'Laboratory result',
        })
      : t('patientWrites.vitals.provenanceFacility', {
          defaultValue: 'Measured at a facility',
        }),
    measure.source === 'lab'
      ? t('patientWrites.vitals.provenanceLabBody', {
          defaultValue: 'Produced by a laboratory from a sample.',
        })
      : t('patientWrites.vitals.provenanceFacilityBody', {
          defaultValue: 'Taken by health staff during a visit.',
        }),
  );

  return (
    <View style={s.row}>
      <View style={s.rowMark}>
        <Icon name="shield-check" size={26} color={tint.fg} />
      </View>
      <View style={s.rowBody}>
        <View style={s.rowTop}>
          <Text style={s.rowTitle}>{measureLabel}</Text>
          <Text style={s.rowValue}>
            {measure.value} <Text style={s.rowUnit}>{measure.unit ?? ''}</Text>
          </Text>
        </View>
        <View style={s.rowChips}>
          <ProvenanceChip provenance={provenance} />
        </View>
        <Text style={s.rowMeta}>
          {t('patientWrites.vitals.takenAt', {
            defaultValue: 'Taken {{when}}',
            when: formatDateTime(measure.recorded_at, ''),
          })}
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ fields */

function FieldLabel({ text }: { text: string }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={s.label}>{text}</Text>;
}

/**
 * A number the server has bounds for. The accepted range is printed under the
 * box BEFORE the patient submits, and a server refusal replaces it with the
 * refusal's own sentence — which names the value that was rejected.
 */
function NumberField({
  label,
  value,
  onChange,
  unit,
  bounds,
  rejection,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  unit: string;
  bounds: { min: number; max: number };
  rejection: Rejection | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={s.field}>
      <FieldLabel text={label} />
      <View style={[s.inputWrap, !!rejection && s.inputWrapError]}>
        <TextInput
          style={s.input}
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder="--"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label}
        />
        <Text style={s.inputUnit}>{unit}</Text>
      </View>
      <Text style={[s.hint, !!rejection && s.hintError]}>
        {rejection
          ? rejection.reason
          : t('patientWrites.vitals.rangeHint', {
              defaultValue: 'Accepted range: {{min}} to {{max}} {{unit}}',
              min: bounds.min,
              max: bounds.max,
              unit,
            })}
      </Text>
    </View>
  );
}

function TextField({
  label,
  placeholder,
  value,
  onChange,
  multiline,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.field}>
      <FieldLabel text={label} />
      <View style={s.inputWrap}>
        <TextInput
          style={[s.input, multiline && s.inputMultiline]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ styles */

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: {
      padding: spacing.md,
      gap: spacing.md,
      paddingBottom: spacing.xl,
    },

    loading: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
    },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    form: { gap: spacing.md },
    field: { gap: spacing.xs },
    label: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.divider,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      minHeight: 48,
    },
    inputWrapError: { borderColor: colors.tintRed, borderWidth: 1.5 },
    input: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.md,
      color: colors.textPrimary,
      paddingVertical: spacing.sm + 2,
    },
    inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
    inputUnit: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    hintError: { color: colors.tintRed },

    refusal: {
      gap: spacing.xs,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.tintRed,
      backgroundColor: colors.tintRedBg,
      padding: spacing.md,
    },
    refusalHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
    },
    refusalTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.tintRed,
    },
    refusalText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textPrimary,
    },
    refusalItem: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textPrimary,
    },

    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
    },
    rowMark: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: { flex: 1, minWidth: 0, gap: 4 },
    rowTop: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    rowTitle: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    rowValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    rowUnit: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    rowChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs + 2,
      marginTop: 2,
    },
    rowMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    rowAction: {
      marginTop: spacing.xs,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.blue,
    },
    rowActionBusy: { color: colors.textMuted },

    // Outlined + amber + `person` for self-reported; filled + green +
    // `shield-check` for verified. Never colour alone.
    provChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radii.pill,
    },
    provChipSelf: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.tintAmber,
    },
    provChipVerified: { backgroundColor: colors.tintGreenBg },
    provChipAlert: { backgroundColor: colors.tintRedBg },
    provChipText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
    },
  });
