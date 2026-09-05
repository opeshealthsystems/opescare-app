/**
 * Ask for a referral — `/referrals/request`.
 *
 * Backed by `POST /mobile/referral-requests`
 * (App\Http\Controllers\Api\Mobile\PatientReferralRequestController).
 *
 * ── The one thing this screen must never get wrong ──────────────────────────
 *
 * A referral request is a REQUEST. It must not read as an issued referral at
 * any point, so:
 *
 *   - the disclaimer the API ships (`options.disclaimer`) is the first thing on
 *     the screen, before a single input;
 *   - the success dialog says the patient has NOT been referred yet;
 *   - nothing here writes to `referral_cases`, and nothing here can. The list
 *     of issued referrals lives on `/referrals` and is fed by a different hook
 *     over a different endpoint — the two are never concatenated;
 *   - urgency is labelled as the patient's own sense of it, carrying the API's
 *     `reported_urgency_caveat` verbatim, because a clinician sets the clinical
 *     priority and this field is not that.
 *
 * The specialty list, the durations, the urgency wording and the length limits
 * all come from `GET /mobile/referral-requests/options`, so this screen cannot
 * offer an option the server would refuse.
 */
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ScreenHeader,
  SectionHeader,
  StepProgress,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { NoticeBanner } from '@/components/care/shared';
import {
  refusalMessageOf,
  rejectionsOf,
  useReferralRequestOptions,
  useRequestReferral,
  type Rejection,
  type ReportedUrgency,
} from '@/lib/api/patientWriteQueries';

export default function RequestReferralScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const optionsQuery = useReferralRequestOptions();
  const options = optionsQuery.data;
  const requestReferral = useRequestReferral();

  const [specialty, setSpecialty] = useState<string | null>(null);
  const [specialtyText, setSpecialtyText] = useState('');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState<string | null>(null);
  const [urgency, setUrgency] = useState<ReportedUrgency>('routine');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [refusalMessage, setRefusalMessage] = useState<string | null>(null);

  const reasonMin = options?.limits.reason_min ?? 10;
  const reasonMax = options?.limits.reason_max ?? 2000;

  // "other" is a prompt to describe it, not an answer — the free-text box is
  // what gets sent, so a request never arrives saying only "something else".
  const usesFreeText = specialty === 'other' || specialty === null;
  const resolvedSpecialty = usesFreeText ? specialtyText.trim() : specialty;

  const reasonLength = reason.trim().length;
  const reasonReady = reasonLength >= reasonMin;
  const ready = !!options && reasonReady && !requestReferral.isPending;

  const steps = useMemo(
    () => [
      { key: 'who', label: t('patientWrites.referralRequest.stepSpecialty', { defaultValue: 'Who' }) },
      { key: 'why', label: t('patientWrites.referralRequest.stepReason', { defaultValue: 'Why' }) },
      { key: 'when', label: t('patientWrites.referralRequest.stepUrgency', { defaultValue: 'How soon' }) },
    ],
    [t],
  );
  const stepIndex = !resolvedSpecialty ? 0 : !reasonReady ? 1 : 2;

  const rejectionFor = useCallback(
    (field: string) => rejections.find((r) => r.field === field) ?? null,
    [rejections],
  );

  const submit = useCallback(async () => {
    if (!ready) return;
    setRejections([]);
    setRefusalMessage(null);

    try {
      const created = await requestReferral.mutateAsync({
        ...(resolvedSpecialty ? { requested_specialty: resolvedSpecialty } : {}),
        reason: reason.trim(),
        ...(duration ? { symptom_duration: duration } : {}),
        reported_urgency: urgency,
        ...(phone.trim() ? { contact_phone: phone.trim() } : {}),
        ...(note.trim() ? { patient_note: note.trim() } : {}),
      });

      setReason('');
      setNote('');

      dialog.show({
        title: t('patientWrites.referralRequest.sentTitle', { defaultValue: 'Request sent' }),
        message: t('patientWrites.referralRequest.sentBody', {
          defaultValue:
            'Your request ({{reference}}) is with a clinician. You have not been referred yet — you will see the outcome in your referrals.',
          reference: created.reference,
        }),
        tone: 'success',
        cancelLabel: t('patientWrites.common.close', { defaultValue: 'Close' }),
        actions: [
          {
            label: t('patientWrites.referralRequest.viewRequests', { defaultValue: 'See my requests' }),
            onPress: () => router.replace('/referrals'),
          },
        ],
      });
    } catch (error) {
      setRejections(rejectionsOf(error));
      setRefusalMessage(
        refusalMessageOf(error) ??
          t('patientWrites.common.unavailableBody', {
            defaultValue:
              'We could not reach your record. Nothing you typed has been lost — try again in a moment.',
          }),
      );
    }
  }, [ready, requestReferral, resolvedSpecialty, reason, duration, urgency, phone, note, dialog, t, router]);

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('patientWrites.referralRequest.title', { defaultValue: 'Ask for a referral' })}
        subtitle={t('patientWrites.referralRequest.subtitle', {
          defaultValue: 'A clinician reviews this before anything happens',
        })}
      />

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Said before anything is filled in, in the API's own words. */}
        <NoticeBanner
          icon="info"
          tone="pending"
          title={t('patientWrites.referralRequest.notAReferralTitle', {
            defaultValue: 'This is a request, not a referral',
          })}
          message={
            options?.disclaimer ??
            t('patientWrites.referralRequest.subtitle', {
              defaultValue: 'A clinician reviews this before anything happens',
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
        ) : !options ? (
          <Card>
            <EmptyState
              icon="alert-circle"
              tint="amber"
              title={t('patientWrites.common.unavailableTitle', { defaultValue: 'This is not available right now' })}
              message={t('patientWrites.common.unavailableBody', {
                defaultValue:
                  'We could not reach your record. Nothing you typed has been lost — try again in a moment.',
              })}
            />
          </Card>
        ) : (
          <>
            <StepProgress steps={steps} currentIndex={stepIndex} />

            <Card>
              <View style={s.form}>
                {/* ── Who ──────────────────────────────────────────────── */}
                <FieldLabel
                  text={t('patientWrites.referralRequest.specialtyLabel', {
                    defaultValue: 'Who would you like to see?',
                  })}
                />
                <Text style={s.hint}>
                  {t('patientWrites.referralRequest.specialtyHint', {
                    defaultValue: 'Pick the closest one, or describe it in your own words.',
                  })}
                </Text>
                <View style={s.chipRow}>
                  {options.specialties.map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      selected={o.value === specialty}
                      onPress={() => setSpecialty(o.value === specialty ? null : o.value)}
                    />
                  ))}
                </View>

                {usesFreeText ? (
                  <TextField
                    label={t('patientWrites.referralRequest.specialtyPlaceholder', {
                      defaultValue: 'e.g. a heart specialist',
                    })}
                    placeholder={t('patientWrites.referralRequest.specialtyPlaceholder', {
                      defaultValue: 'e.g. a heart specialist',
                    })}
                    value={specialtyText}
                    onChange={setSpecialtyText}
                    rejection={rejectionFor('requested_specialty')}
                  />
                ) : null}

                {/* ── Why ──────────────────────────────────────────────── */}
                <TextField
                  label={t('patientWrites.referralRequest.reasonLabel', {
                    defaultValue: 'Why do you think you need this?',
                  })}
                  hint={t('patientWrites.referralRequest.reasonHint', {
                    defaultValue: 'What you are feeling, and what has changed. A clinician reads this.',
                  })}
                  placeholder={t('patientWrites.referralRequest.reasonPlaceholder', {
                    defaultValue: 'Describe your symptoms and how long you have had them',
                  })}
                  value={reason}
                  onChange={(next) => setReason(next.slice(0, reasonMax))}
                  multiline
                  rejection={rejectionFor('reason')}
                  footer={
                    reasonLength > 0 && !reasonReady
                      ? t('patientWrites.referralRequest.reasonTooShort', {
                          defaultValue: 'Please write a little more, so a clinician can understand.',
                        })
                      : t('patientWrites.referralRequest.reasonCount', {
                          defaultValue: '{{count}} of {{max}} characters',
                          count: reasonLength,
                          max: reasonMax,
                        })
                  }
                />

                <FieldLabel
                  text={t('patientWrites.referralRequest.durationLabel', {
                    defaultValue: 'How long has this been going on?',
                  })}
                />
                <View style={s.chipRow}>
                  {options.durations.map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      selected={o.value === duration}
                      onPress={() => setDuration(o.value === duration ? null : o.value)}
                    />
                  ))}
                </View>

                {/* ── How soon — the PATIENT's reading, and labelled so ── */}
                <FieldLabel
                  text={t('patientWrites.referralRequest.urgencyLabel', {
                    defaultValue: 'How urgent does it feel to you?',
                  })}
                />
                <View style={s.urgencyList}>
                  {options.reported_urgencies.map((o) => {
                    const selected = o.value === urgency;
                    return (
                      <View
                        key={o.value}
                        style={[s.urgencyRow, selected && s.urgencyRowSelected]}
                        accessible
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${o.label}. ${o.description}`}
                        onTouchEnd={() => setUrgency(o.value)}
                      >
                        <Icon
                          name={selected ? 'check-circle' : 'circle'}
                          size={20}
                          color={selected ? colors.blue : colors.textMuted}
                        />
                        <View style={s.urgencyBody}>
                          <Text style={s.urgencyTitle}>{o.label}</Text>
                          <Text style={s.urgencyText}>{o.description}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                <TextField
                  label={t('patientWrites.referralRequest.phoneLabel', {
                    defaultValue: 'A number to reach you on',
                  })}
                  placeholder={t('patientWrites.referralRequest.phonePlaceholder', {
                    defaultValue: 'e.g. 6XX XX XX XX',
                  })}
                  value={phone}
                  onChange={setPhone}
                  keyboard="phone-pad"
                  rejection={rejectionFor('contact_phone')}
                />

                <TextField
                  label={t('patientWrites.referralRequest.noteLabel', {
                    defaultValue: 'Anything else a clinician should know?',
                  })}
                  placeholder={t('patientWrites.referralRequest.notePlaceholder', { defaultValue: 'Optional' })}
                  value={note}
                  onChange={setNote}
                  multiline
                  rejection={rejectionFor('patient_note')}
                />

                {refusalMessage ? (
                  <View style={s.refusal}>
                    <View style={s.refusalHead}>
                      <Icon name="alert-triangle" size={18} color={colors.tintRed} />
                      <Text style={s.refusalTitle}>
                        {t('patientWrites.referralRequest.refusedTitle', { defaultValue: 'Not sent' })}
                      </Text>
                    </View>
                    <Text style={s.refusalText}>{refusalMessage}</Text>
                    {rejections.map((r) => (
                      <Text key={`${r.field}-${r.reason}`} style={s.refusalText}>
                        {r.reason}
                      </Text>
                    ))}
                  </View>
                ) : null}

                <GradientButton
                  label={
                    requestReferral.isPending
                      ? t('patientWrites.referralRequest.submitting', { defaultValue: 'Sending' })
                      : t('patientWrites.referralRequest.submit', { defaultValue: 'Send this request' })
                  }
                  onPress={submit}
                  loading={requestReferral.isPending}
                  disabled={!ready}
                  icon="none"
                />
              </View>
            </Card>

            <SectionHeader
              variant="overline"
              title={t('patientWrites.referralRequest.urgencyCaveatTitle', {
                defaultValue: 'How urgent it feels to you',
              })}
            />
            <NoticeBanner
              icon="info"
              tone="pending"
              message={t('opesCare.referral.urgencyCaveat', {
                defaultValue: 'This is how urgent it feels to you. A clinician decides the clinical priority.',
              })}
            />
          </>
        )}
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ fields */

function FieldLabel({ text }: { text: string }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={s.label}>{text}</Text>;
}

function TextField({
  label,
  hint,
  placeholder,
  value,
  onChange,
  multiline,
  keyboard,
  rejection,
  footer,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  keyboard?: 'default' | 'phone-pad';
  rejection?: Rejection | null;
  footer?: string;
}) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.field}>
      <FieldLabel text={label} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      <View style={[s.inputWrap, !!rejection && s.inputWrapError]}>
        <TextInput
          style={[s.input, multiline && s.inputMultiline]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          keyboardType={keyboard ?? 'default'}
          accessibilityLabel={label}
        />
      </View>
      {rejection ? (
        <Text style={[s.hint, s.hintError]}>{rejection.reason}</Text>
      ) : footer ? (
        <Text style={s.hint}>{footer}</Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ styles */

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

    loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
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
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    hintError: { color: colors.tintRed },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

    inputWrap: {
      borderWidth: 1,
      borderColor: colors.divider,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      minHeight: 48,
      justifyContent: 'center',
    },
    inputWrapError: { borderColor: colors.tintRed, borderWidth: 1.5 },
    input: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.md,
      color: colors.textPrimary,
      paddingVertical: spacing.sm + 2,
    },
    inputMultiline: { minHeight: 96, textAlignVertical: 'top' },

    urgencyList: { gap: spacing.sm },
    urgencyRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 2,
      borderWidth: 1,
      borderColor: colors.divider,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    urgencyRowSelected: { borderColor: colors.blue, backgroundColor: colors.tintBlueBg },
    urgencyBody: { flex: 1, minWidth: 0, gap: 2 },
    urgencyTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    urgencyText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    refusal: {
      gap: spacing.xs,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.tintRed,
      backgroundColor: colors.tintRedBg,
      padding: spacing.md,
    },
    refusalHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
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
  });
