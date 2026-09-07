import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  PillInput,
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
import { CareButton, InfoRow, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import { useAmendBloodRequest, useBloodRequest } from '@/lib/api/bloodRequestQueries';
import { useCancelBloodRequest, type BloodUrgencyValue } from '@/lib/api/queries';

/**
 * Modify or Cancel Request (PM-BLOOD-06).
 *
 * ── The two actions are not symmetrical, and the screen says so ───────────
 * The reference puts "Modify" and "Cancel" side by side as equal choices.
 * They are not equal: an amendment adjusts a hold that stays yours, and a
 * cancellation releases units back and cannot be undone. So the cancel card
 * states its consequences as consequences, the button is destructive-styled,
 * and it goes through a confirmation naming the request. The layout stays as
 * drawn; the weighting does not pretend the two are the same act.
 *
 * ── Three fields are missing on purpose ───────────────────────────────────
 * Blood group, component and facility cannot be edited here, because the API
 * refuses them: those three are what the facility checked against its stock
 * when it took the hold. Changing them is a different request, not an
 * amendment, and it has to re-run the availability check. The screen says that
 * plainly rather than showing three disabled dropdowns and leaving the patient
 * to guess.
 *
 * ── Only while it is still open ───────────────────────────────────────────
 * A request the facility has fulfilled, rejected or let expire is history.
 * The screen refuses to edit it and says which, rather than posting an
 * amendment the server will reject.
 */

const URGENCIES: { value: BloodUrgencyValue; icon: IconName }[] = [
  { value: 'emergency', icon: 'alert-triangle' },
  { value: 'urgent', icon: 'clock' },
  { value: 'routine', icon: 'clock' },
];

const NOTE_MAX = 500;

export default function ModifyBloodRequestScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const request = useBloodRequest(requestId ?? null);
  const amend = useAmendBloodRequest();
  const cancel = useCancelBloodRequest();

  const [quantity, setQuantity] = useState<number | null>(null);
  const [urgency, setUrgency] = useState<BloodUrgencyValue | null>(null);
  const [phone, setPhone] = useState<string>('');
  const [note, setNote] = useState<string>('');

  // Seed the form from the request once it arrives, and never again — typing
  // must not be overwritten by a background refetch.
  useEffect(() => {
    if (!request.data || quantity !== null) return;
    setQuantity(request.data.quantity);
    setUrgency(request.data.urgency as BloodUrgencyValue);
    setPhone(request.data.contact_phone ?? '');
    setNote(request.data.patient_note ?? '');
  }, [request.data, quantity]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  if (request.isPending) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodModify.title')} onBack={goBack} />
        <View style={styles.centred}>
          <LoadingBlock label={t('bloodStatus.loading')} />
        </View>
      </Screen>
    );
  }

  if (request.isError || !request.data) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodModify.title')} onBack={goBack} />
        <View style={styles.centred}>
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('bloodStatus.notFoundTitle')}
              message={t('bloodStatus.notFoundBody')}
              actionLabel={t('bloodStatus.backToFinder')}
              onAction={() => router.replace('/blood-finder')}
            />
          </Card>
        </View>
      </Screen>
    );
  }

  const data = request.data;

  if (!data.is_cancellable) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodModify.title')} onBack={goBack} />
        <View style={styles.centred}>
          <Card variant="flush">
            <EmptyState
              icon="lock"
              tint="amber"
              title={t('bloodModify.closedTitle')}
              message={t('bloodModify.closedBody', { status: data.status_label })}
              actionLabel={t('bloodModify.viewStatus')}
              onAction={() =>
                router.replace({ pathname: '/blood-finder/status', params: { requestId: data.id } })
              }
            />
          </Card>
        </View>
      </Screen>
    );
  }

  const submit = () => {
    amend.mutate(
      {
        id: data.id,
        quantity: quantity ?? undefined,
        urgency: urgency ?? undefined,
        contact_phone: phone.trim() === '' ? null : phone.trim(),
        note: note.trim() === '' ? null : note.trim(),
      },
      {
        onSuccess: () =>
          router.replace({ pathname: '/blood-finder/status', params: { requestId: data.id } }),
      },
    );
  };

  const confirmCancel = () =>
    dialog.confirm({
      title: t('bloodModify.cancelConfirmTitle'),
      message: t('bloodModify.cancelConfirmBody', { reference: data.reference }),
      confirmLabel: t('bloodModify.cancelConfirmAction'),
      destructive: true,
      onConfirm: () =>
        cancel.mutate(
          { id: data.id },
          { onSuccess: () => router.replace('/blood-finder') },
        ),
    });

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('bloodModify.title')}
        subtitle={data.reference}
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {data.expires_at ? (
          <NoticeBanner
            icon="clock"
            tone="warning"
            title={t('bloodModify.windowTitle')}
            message={t('bloodModify.windowBody', { when: formatDateTime(data.expires_at) })}
          />
        ) : null}

        {/* ── What cannot move ─────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodModify.fixedTitle')} />
          <Card>
            <InfoRow
              icon="droplet"
              label={t('bloodStatus.group')}
              value={`${data.blood_group}  ·  ${data.component_label ?? data.component_type}`}
            />
            {data.facility ? (
              <InfoRow
                icon="building"
                label={t('bloodModify.facility')}
                value={data.facility.name}
              />
            ) : null}
            <Text style={styles.fixedNote}>{t('bloodModify.fixedExplained')}</Text>
          </Card>
        </View>

        {/* ── What can ─────────────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodModify.editableTitle')} />
          <Card>
            <Text style={styles.fieldLabel}>{t('bloodStatus.quantity')}</Text>
            <View style={styles.stepper}>
              <CareButton
                label="−"
                variant="secondary"
                size="sm"
                onPress={() => setQuantity((q) => Math.max(1, (q ?? 1) - 1))}
                disabled={(quantity ?? 1) <= 1}
                style={styles.stepButton}
              />
              <View style={styles.stepValue}>
                <Text style={styles.stepNumber}>{quantity ?? 1}</Text>
                <Text style={styles.muted}>{t('bloodModify.unitsWord')}</Text>
              </View>
              <CareButton
                label="+"
                variant="secondary"
                size="sm"
                onPress={() => setQuantity((q) => Math.min(6, (q ?? 1) + 1))}
                disabled={(quantity ?? 1) >= 6}
                style={styles.stepButton}
              />
            </View>

            <Text style={[styles.fieldLabel, styles.fieldSpacer]}>{t('bloodStatus.urgency')}</Text>
            <View style={styles.chipWrap}>
              {URGENCIES.map((option) => (
                <Chip
                  key={option.value}
                  icon={option.icon}
                  label={t(`bloodFinder.urgency.${option.value}`)}
                  selected={option.value === urgency}
                  onPress={() => setUrgency(option.value)}
                />
              ))}
            </View>

            <Text style={[styles.fieldLabel, styles.fieldSpacer]}>{t('bloodStatus.contact')}</Text>
            <PillInput
              icon={<Icon name="phone" size={18} color={colors.blue} />}
              value={phone}
              onChangeText={setPhone}
              placeholder={t('bloodModify.phonePlaceholder')}
              keyboardType="phone-pad"
              accessibilityLabel={t('bloodStatus.contact')}
            />

            <Text style={[styles.fieldLabel, styles.fieldSpacer]}>{t('bloodStatus.note')}</Text>
            <TextInput
              value={note}
              onChangeText={(value) => setNote(value.slice(0, NOTE_MAX))}
              placeholder={t('bloodModify.notePlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.noteInput}
              accessibilityLabel={t('bloodStatus.note')}
            />
            <Text style={styles.counter}>{`${note.length}/${NOTE_MAX}`}</Text>
          </Card>
        </View>

        {amend.isError ? (
          <NoticeBanner
            icon="alert-circle"
            tone="critical"
            title={t('bloodModify.saveFailedTitle')}
            message={t('bloodModify.saveFailedBody')}
          />
        ) : null}

        <CareButton
          label={amend.isPending ? t('bloodModify.saving') : t('bloodModify.save')}
          icon="check-circle"
          variant="primary"
          disabled={amend.isPending}
          onPress={submit}
        />

        {/* ── Cancelling ───────────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodModify.cancelTitle')} />
          <Card accentColor={colors.statusCritical}>
            <Text style={styles.cancelLead}>{t('bloodModify.cancelLead')}</Text>
            {(['release', 'undone'] as const).map((key) => (
              <View key={key} style={styles.cancelPoint}>
                <Icon name="x-circle" size={16} color={colors.statusCritical} />
                <Text style={styles.cancelText}>{t(`bloodModify.cancelPoints.${key}`)}</Text>
              </View>
            ))}
            <CareButton
              label={cancel.isPending ? t('bloodModify.cancelling') : t('bloodModify.cancelAction')}
              icon="trash"
              variant="dangerSolid"
              disabled={cancel.isPending}
              onPress={confirmCancel}
              style={styles.cancelButton}
            />
          </Card>
        </View>
      </ScrollView>

      {dialog.element}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.sm },
    centred: { padding: spacing.md },

    fieldLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
      marginBottom: spacing.xs,
    },
    fieldSpacer: { marginTop: spacing.md },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },

    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    stepButton: { minWidth: 52 },
    stepValue: { alignItems: 'center', minWidth: 64 },
    stepNumber: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      color: c.textPrimary,
    },
    muted: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    noteInput: {
      minHeight: 84,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: radii.md,
      padding: spacing.sm,
      textAlignVertical: 'top',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
      backgroundColor: c.surface,
    },
    counter: {
      alignSelf: 'flex-end',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
      marginTop: 4,
    },

    fixedNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      marginTop: spacing.sm,
    },

    cancelLead: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
      marginBottom: spacing.xs,
    },
    cancelPoint: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 3 },
    cancelText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },
    cancelButton: { marginTop: spacing.sm },
  });
