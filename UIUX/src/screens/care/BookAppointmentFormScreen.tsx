/**
 * CARE-009 — Book Appointment Form.
 *
 * Collects visit mode, visit type and the reason. Nothing is written here — the
 * draft is handed to CARE-010, which performs the single transactional
 * `POST /patient/appointments`.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
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
import {
  fetchProvider,
  fetchProviderSlots,
  type AppointmentType,
  type AvailabilitySlot,
  type PortalProviderDetail,
  type VisitMode,
} from '../../api';
import { Card, Chip, EmptyState, Icon, IconName, ScreenHeader } from '../../components';
import type { AppStackParamList } from '../../navigation/routes';
import { useTranslation } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { putDraft } from './draft';
import { AsyncBoundary, CareButton, isoDay, ProviderAvatar, useAsync } from './shared';
import { typeLabelOf } from './apptLabels';
import { formatDateLong, formatTime } from '../../utils/format';

const REASON_MAX = 250;

const TYPE_CHOICES: AppointmentType[] = ['consultation', 'follow_up', 'procedure', 'vaccination', 'lab', 'imaging', 'antenatal', 'other'];

type Data = { provider: PortalProviderDetail; slot: AvailabilitySlot | null };

export function BookAppointmentFormScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'BookAppointmentForm'>>();
  const providerId = params?.providerId ? Number(params.providerId) : null;
  const slotId = params?.slot ?? null;

  const load = useCallback(async (): Promise<Data> => {
    if (!providerId) throw new Error('Pick a provider first.');
    const today = new Date();
    const to = new Date(today);
    to.setDate(today.getDate() + 21);
    const [provider, availability] = await Promise.all([
      fetchProvider(providerId),
      fetchProviderSlots(providerId, { from: isoDay(today), to: isoDay(to), include_booked: true }),
    ]);
    const slot = slotId
      ? availability.days.flatMap((d) => d.slots).find((s) => s.id === slotId) ?? null
      : null;
    return { provider, slot };
  }, [providerId, slotId]);

  const state = useAsync<Data>(load, [providerId, slotId]);

  const [visitMode, setVisitMode] = useState<VisitMode>('in_person');
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('consultation');
  const [reason, setReason] = useState('');

  if (!providerId) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={t('care.bookForm.title')} subtitle={t('care.bookForm.subtitle')} />
        <View style={styles.content}>
          <Card>
            <EmptyState
              icon="person-search"
              tint="blue"
              title={t('care.bookForm.noProviderTitle')}
              message={t('care.bookForm.noProviderMessage')}
              actionLabel={t('care.appt.findProvider')}
              onAction={() => navigation.navigate('FindProvider')}
            />
          </Card>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('care.bookForm.title')} subtitle={t('care.bookForm.subtitle')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('care.bookForm.loading')}>
          {(data) => {
            const p = data.provider;
            const slot = data.slot;
            const telemedicineOk = p.offers_telemedicine;

            return (
              <>
                <Card>
                  <CardHead
                    icon="person"
                    title={t('care.appt.provider')}
                    action={t('care.appt.change')}
                    onAction={() => navigation.navigate('FindProvider')}
                  />
                  <View style={styles.providerRow}>
                    <ProviderAvatar name={p.name} size={64} />
                    <View style={styles.providerBody}>
                      <Text style={styles.providerName} numberOfLines={2}>
                        {p.name}
                      </Text>
                      <Text style={styles.providerSpecialty}>{p.specialty ?? p.title ?? t('care.appt.provider')}</Text>
                      <View style={styles.metaRow}>
                        <Icon name="building" size={15} color={colors.textSecondary} />
                        <Text style={styles.meta} numberOfLines={1}>
                          {p.facility_name ?? t('care.appt.facilityTbd')}
                        </Text>
                      </View>
                      {!!p.room && (
                        <View style={styles.metaRow}>
                          <Icon name="location" size={15} color={colors.textSecondary} />
                          <Text style={styles.meta} numberOfLines={1}>
                            {p.room}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Card>

                <Card>
                  <CardHead
                    icon="calendar"
                    title={t('care.bookForm.dateAndTime')}
                    action={t('care.appt.change')}
                    onAction={() => navigation.navigate('AvailableTimeSlots', { providerId: String(p.id) })}
                  />
                  {slot ? (
                    <View style={styles.chipRow}>
                      <View style={styles.softChip}>
                        <Icon name="calendar" size={18} color={colors.blue} />
                        <Text style={styles.softChipText} numberOfLines={1}>
                          {formatDateLong(slot.slot_start)}
                        </Text>
                      </View>
                      <View style={styles.softChip}>
                        <Icon name="clock" size={18} color={colors.blue} />
                        <Text style={styles.softChipText} numberOfLines={1}>
                          {formatTime(slot.slot_start)} – {formatTime(slot.slot_end)}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.slotMissing}>
                      <Icon name="alert-circle" size={20} color={colors.statusWarning} />
                      <Text style={styles.slotMissingText}>
                        {slotId ? t('care.bookForm.slotGoneMessage') : t('care.bookForm.slotNoneMessage')}
                      </Text>
                    </View>
                  )}
                </Card>

                <Card>
                  <CardHead icon="clipboard" title={t('care.appt.appointmentType')} />
                  <Radio
                    selected={visitMode === 'in_person'}
                    title={t('care.appt.inPersonVisit')}
                    subtitle={t('care.appt.inPersonVisitHint')}
                    onPress={() => setVisitMode('in_person')}
                  />
                  <Radio
                    selected={visitMode === 'telemedicine'}
                    title={t('care.appt.videoConsultation')}
                    subtitle={
                      telemedicineOk
                        ? t('care.appt.videoConsultationHint')
                        : t('care.bookForm.telemedicineUnavailable')
                    }
                    disabled={!telemedicineOk}
                    onPress={() => setVisitMode('telemedicine')}
                  />

                  <Text style={styles.subLabel}>{t('care.bookForm.visitForPrompt')}</Text>
                  <View style={styles.typeChips}>
                    {TYPE_CHOICES.map((choice) => (
                      <Chip
                        key={choice}
                        label={typeLabelOf(t, choice)}
                        selected={appointmentType === choice}
                        onPress={() => setAppointmentType(choice)}
                      />
                    ))}
                  </View>
                </Card>

                <Card>
                  <CardHead icon="edit" title={t('care.appt.reasonForVisit')} />
                  <TextInput
                    style={styles.textarea}
                    value={reason}
                    onChangeText={(v) => setReason(v.slice(0, REASON_MAX))}
                    placeholder={t('care.bookForm.reasonPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                  />
                  <Text style={styles.counter}>
                    {reason.length}/{REASON_MAX}
                  </Text>
                </Card>

                <View style={styles.notice}>
                  <Icon name="info" size={20} color={colors.blue} />
                  <Text style={styles.noticeText}>{t('care.bookForm.attachedNotice')}</Text>
                </View>

                <CareButton
                  label={t('care.bookForm.submit')}
                  icon="calendar-check"
                  disabled={!slot}
                  onPress={() => {
                    const draftId = putDraft({
                      provider: p,
                      slot: slot!,
                      appointmentType,
                      visitMode,
                      reason: reason.trim(),
                    });
                    navigation.navigate('AppointmentReview', { draftId });
                  }}
                />
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CardHead({
  icon,
  title,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.cardHead}>
      <Icon name={icon} size={22} color={colors.blue} />
      <Text style={styles.cardTitle}>{title}</Text>
      {!!action && !!onAction && (
        <TouchableOpacity onPress={onAction} hitSlop={8}>
          <Text style={styles.cardAction}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Radio({
  selected,
  title,
  subtitle,
  onPress,
  disabled,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.radio, disabled && styles.radioOff]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={[styles.radioMark, selected && styles.radioMarkOn]}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <View style={styles.radioBody}>
        <Text style={styles.radioTitle}>{title}</Text>
        <Text style={styles.radioSubtitle}>{subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md - 4 },
  cardTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  cardAction: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },

  providerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 2 },
  providerBody: { flex: 1, minWidth: 0, gap: 2 },
  providerName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  providerSpecialty: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  meta: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  chipRow: { flexDirection: 'row', gap: spacing.sm + 2 },
  softChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  softChipText: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.link,
  },
  slotMissing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  slotMissingText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  radio: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 9 },
  radioOff: { opacity: 0.45 },
  radioMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioMarkOn: { borderColor: colors.blue },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blue },
  radioBody: { flex: 1, minWidth: 0 },
  radioTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  radioSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  subLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    marginTop: spacing.md - 4,
    marginBottom: spacing.sm,
  },
  typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  textarea: {
    minHeight: 92,
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
    alignSelf: 'flex-end',
    marginTop: 4,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
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
});
