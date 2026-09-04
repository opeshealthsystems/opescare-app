/**
 * Request a Refill — ask the prescriber for a repeat prescription.
 *
 * There is no refill endpoint in the patient portal API: nothing in
 * `routes/api.php` under `patient/` creates, queues or approves a repeat, and
 * the prescribing workflow (`PrescriptionWidget`) is staff-only. So this
 * screen does not pretend to file a refill. It does the one thing the API
 * genuinely supports and the clinic genuinely acts on — it sends the request
 * as a secure message to the doctor who wrote the prescription:
 *
 *   POST /patient/messages/threads  { provider_id, subject?, body }
 *
 * `provider_id` is the prescription's `prescribed_by` (the prescriber's staff
 * user id, returned by `GET /patient/prescriptions`). The server reuses an
 * open thread with that doctor if one exists, so this never creates a
 * duplicate conversation. Copy on the screen says exactly this, because the
 * patient must not read "sent" as "approved".
 *
 * Live data:
 *   GET  /patient/prescriptions?status=active
 *   POST /patient/messages/threads
 */
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { fetchPrescriptions, startThread, type PortalPrescription } from '../../api';
import { Card, EmptyState, Icon, ScreenHeader, StatusBadge, useDialog } from '../../components';
import { type TFunction, useTranslation } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  AsyncBoundary,
  MedButton,
  TintCircle,
  ROW_TINTS,
  daysLeftLabel,
  doseSummary,
  fmtShortDate,
  formIcon,
  useAsync,
} from './shared';

/** The server's own limits — `body` max:4000, `subject` max:255. */
const NOTE_MAX = 500;

export function RequestRefillScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const presetId = (route.params?.medicationId as string | undefined) ?? null;
  const dialog = useDialog();
  const { t } = useTranslation();

  const [pickedId, setPickedId] = useState<string | null>(presetId);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    const page = await fetchPrescriptions({ status: 'active', per_page: 50 });
    return page.data;
  }, []);
  const state = useAsync<PortalPrescription[]>(load, []);

  const list = state.data;
  const picked = useMemo(
    () => (list && pickedId ? (list.find((rx) => rx.id === pickedId) ?? null) : null),
    [list, pickedId]
  );

  /** Exactly what will be sent — shown to the patient before they send it. */
  const messageBody = useMemo(() => {
    if (!picked) return '';
    const what = [picked.drug_name, picked.dosage, picked.frequency].filter(Boolean).join(', ');
    const lines = [
      t('meds.refill.bodyAsk', { what }),
      picked.quantity_label
        ? t('meds.refill.bodyQuantity', { quantity: picked.quantity_label })
        : null,
      picked.refills_remaining > 0
        ? t('meds.refill.bodyRefills', { count: picked.refills_remaining })
        : t('meds.refill.bodyNoRefills'),
      picked.pharmacy_name
        ? t('meds.refill.bodyPharmacy', { pharmacy: picked.pharmacy_name })
        : null,
      note.trim() ? `\n${note.trim()}` : null,
    ].filter(Boolean);
    return lines.join('\n');
  }, [picked, note, t]);

  const prescriberMissing = !!picked && picked.prescribed_by === null;
  const canSend = !!picked && !prescriberMissing && !sending;

  const send = useCallback(async () => {
    if (!picked || picked.prescribed_by === null || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      const thread = await startThread({
        provider_id: picked.prescribed_by,
        subject: t('meds.refill.subject'),
        body: messageBody,
      });
      dialog.show({
        title: t('meds.refill.sentTitle'),
        tone: 'success',
        message: t('meds.refill.sentBody', {
          drug: picked.drug_name,
          name:
            thread.provider_name ?? picked.prescriber_name ?? t('meds.refill.yourPrescriber'),
        }),
        cancelLabel: t('meds.refill.sentDone'),
        actions: [
          {
            label: t('meds.refill.openConversation'),
            onPress: () =>
              navigation.navigate('MessageThread', {
                threadId: thread.id,
                title: thread.provider_name ?? picked.prescriber_name ?? undefined,
              }),
          },
        ],
      });
      setNote('');
    } catch (e) {
      dialog.show({
        title: t('meds.refill.failTitle'),
        tone: 'critical',
        cancelLabel: t('meds.refill.failOk'),
        message: writeFailureMessage(e, t('meds.refill.failHint')),
      });
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }, [picked, messageBody, navigation, dialog, t]);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('meds.refill.title')} subtitle={t('meds.refill.subtitle')} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('meds.refill.loading')}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyState
              icon="pill"
              tint="blue"
              title={t('meds.refill.emptyTitle')}
              message={t('meds.refill.emptyBody')}
              actionLabel={t('meds.refill.emptyCta')}
              onAction={() => navigation.navigate('Medications')}
            />
          }
        >
          {(rows) => (
            <>
              <View style={styles.notice}>
                <Icon name="info" size={20} color={colors.blue} />
                <Text style={styles.noticeText}>{t('meds.refill.notice')}</Text>
              </View>

              <Card>
                <Text style={styles.overline}>{t('meds.refill.whichMedication')}</Text>
                <View style={styles.list}>
                  {rows.map((rx, i) => (
                    <MedicationOption
                      key={rx.id}
                      rx={rx}
                      index={i}
                      t={t}
                      selected={rx.id === pickedId}
                      onPress={() => setPickedId(rx.id)}
                    />
                  ))}
                </View>
              </Card>

              {!!picked && (
                <>
                  <Card>
                    <Text style={styles.overline}>{t('meds.refill.noteOverline')}</Text>
                    <TextInput
                      style={styles.textarea}
                      value={note}
                      onChangeText={(v) => setNote(v.slice(0, NOTE_MAX))}
                      placeholder={t('meds.refill.notePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      textAlignVertical="top"
                      autoComplete="off"
                      textContentType="none"
                      accessibilityLabel={t('meds.refill.noteA11y')}
                    />
                    <Text style={styles.counter}>
                      {note.length}/{NOTE_MAX}
                    </Text>
                  </Card>

                  <Card>
                    <Text style={styles.overline}>{t('meds.refill.previewOverline')}</Text>
                    <View style={styles.preview}>
                      <Text style={styles.previewTo}>
                        {picked.prescriber_specialty
                          ? t('meds.refill.previewToWithSpecialty', {
                              name: picked.prescriber_name ?? t('meds.refill.yourPrescriber'),
                              specialty: picked.prescriber_specialty,
                            })
                          : t('meds.refill.previewTo', {
                              name: picked.prescriber_name ?? t('meds.refill.yourPrescriber'),
                            })}
                      </Text>
                      <Text style={styles.previewBody}>{messageBody}</Text>
                    </View>
                  </Card>

                  {prescriberMissing && (
                    <View style={styles.warn}>
                      <Icon name="alert-circle" size={20} color={colors.statusWarning} />
                      <Text style={styles.warnText}>{t('meds.refill.noPrescriber')}</Text>
                    </View>
                  )}

                  <MedButton
                    label={sending ? t('meds.refill.sending') : t('meds.refill.send')}
                    icon="send"
                    variant="primary"
                    disabled={!canSend}
                    onPress={send}
                  />

                  <MedButton
                    label={t('meds.refill.messageAnother')}
                    icon="chat"
                    variant="secondary"
                    onPress={() => navigation.navigate('NewMessage', {})}
                  />
                </>
              )}
            </>
          )}
        </AsyncBoundary>
      </ScrollView>

      {dialog.element}
    </KeyboardAvoidingView>
  );
}

/** A selectable prescription row — human-readable first, reference demoted. */
function MedicationOption({
  rx,
  index,
  t,
  selected,
  onPress,
}: {
  rx: PortalPrescription;
  index: number;
  t: TFunction;
  selected: boolean;
  onPress: () => void;
}) {
  const refills =
    rx.refills_remaining > 0
      ? t('meds.refill.refillsLeft', { count: rx.refills_remaining })
      : t('meds.refill.noRefillsLeft');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.option, selected && styles.optionOn]}
    >
      <TintCircle icon={formIcon(rx)} tint={ROW_TINTS[index % ROW_TINTS.length]} />
      <View style={styles.optionBody}>
        <Text style={styles.optionTitle} numberOfLines={2}>
          {rx.drug_name}
        </Text>
        <Text style={styles.optionMeta} numberOfLines={1}>
          {doseSummary(rx)}
        </Text>
        <Text style={styles.optionMeta} numberOfLines={1}>
          {rx.refill_due_on
            ? t('meds.refill.refillDue', {
                date: fmtShortDate(rx.refill_due_on),
                left: daysLeftLabel(rx.refill_due_on, t),
              })
            : refills}
        </Text>
      </View>
      <View style={styles.optionRight}>
        <StatusBadge status={refills} tone={rx.refills_remaining > 0 ? 'normal' : 'warning'} size="sm" />
        <Icon
          name={selected ? 'check-circle' : 'chevron-right'}
          size={20}
          color={selected ? colors.blue : colors.textMuted}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  noticeText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  warn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.statusWarningBg,
  },
  warnText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  overline: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },

  list: { marginTop: spacing.sm, gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.sm + 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionOn: { borderColor: colors.blue, backgroundColor: colors.primarySoft },
  optionBody: { flex: 1, minWidth: 0, gap: 2 },
  optionTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  optionMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  optionRight: { alignItems: 'flex-end', gap: spacing.xs },

  textarea: {
    minHeight: 92,
    marginTop: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm + 4,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  counter: {
    marginTop: spacing.xs,
    textAlign: 'right',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  preview: {
    marginTop: spacing.sm,
    padding: spacing.sm + 4,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.xs,
  },
  previewTo: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.link,
  },
  previewBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
});
