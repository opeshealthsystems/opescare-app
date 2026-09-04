import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatDate,
  formatTime,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, InfoRow, ProviderAvatar } from '@/components/care/shared';
import {
  useProviderDetail,
  useStartMessageThread,
  type ProviderDetail,
} from '@/lib/api/queries';

/**
 * Clinician profile — the person behind a slot. OPES CARE-004 layout
 * (ProviderProfileScreen) on top of the app's own data layer.
 *
 * Reachable from the facility page (app/facility/[id].tsx) and from the booking
 * flow's doctor step. Two primary actions:
 *   • Book — deep-links into /appointments/book pre-filled with this
 *     clinician's facility AND provider id (that wizard reads both params), so
 *     the patient lands straight on this clinician's slots.
 *   • Message — messaging requires an existing care relationship (the backend
 *     validates the appointment belongs to the caller), so the action is only
 *     wired to a composer when the API hands back a `messaging_appointment_id`.
 *     With no appointment yet it stays visible, explains itself, and routes to
 *     booking — never a button that silently 422s.
 *
 * ── What this screen may and may not show ─────────────────────────────────
 * `staff_profiles` has no bio and no photo column, and there is no rating,
 * review count, consultation fee or years-of-experience anywhere in the schema
 * (verified against the migrations and MobileProviderController). The OPES
 * reference carries all of those; this screen deliberately does NOT invent
 * them. The credibility signals here are the ones the API actually returns:
 * job title, department, facility affiliation, employment type, active
 * licences and credentials, and live open-slot availability. The avatar is a
 * monogram because there is no image to load.
 */

/** provider_credentials.credential_type is a fixed DB enum — map it, never print it raw. */
const CREDENTIAL_KEYS: Record<string, string> = {
  medical_license: 'doctor.credentialMedicalLicense',
  specialist_cert: 'doctor.credentialSpecialistCert',
  board_certification: 'doctor.credentialBoardCertification',
  dea_registration: 'doctor.credentialDeaRegistration',
  cpr_cert: 'doctor.credentialCprCert',
  hospital_privilege: 'doctor.credentialHospitalPrivilege',
  other: 'doctor.credentialOther',
};

/** professional_licenses.profession — same treatment, with a raw-value fallback. */
const PROFESSION_KEYS: Record<string, string> = {
  doctor: 'doctor.professionDoctor',
  nurse: 'doctor.professionNurse',
  pharmacist: 'doctor.professionPharmacist',
  lab_technician: 'doctor.professionLabTechnician',
  midwife: 'doctor.professionMidwife',
};

/** staff_profiles.employment_type — full_time | part_time | contract | locum. */
const EMPLOYMENT_KEYS: Record<string, string> = {
  full_time: 'doctor.employmentFullTime',
  part_time: 'doctor.employmentPartTime',
  contract: 'doctor.employmentContract',
  locum: 'doctor.employmentLocum',
};

/** Open slots listed inline before the section defers to the booking flow. */
const MAX_INLINE_SLOTS = 6;

/** "Mon, 7 Sep" / "lun. 7 sept." in the active language; kit date as fallback. */
function slotDay(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(language.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch {
    return formatDate(date);
  }
}

type InfoLine = { icon: IconName; label: string; value: string; valueColor?: string };

export default function DoctorDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ id?: string }>();
  const providerId = params.id;

  const providerQuery = useProviderDetail(providerId);
  const startThread = useStartMessageThread();

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeBody, setComposeBody] = useState('');
  const [sent, setSent] = useState(false);

  const provider = providerQuery.data;

  // The API answers a de-listed / non-clinical id with a hard 404
  // (PROVIDER_NOT_FOUND) rather than an empty body, so the "no longer listed"
  // case is distinguishable from a network failure and gets its own copy.
  const isNotFound =
    axios.isAxiosError(providerQuery.error) && providerQuery.error.response?.status === 404;

  const goToBooking = (p: ProviderDetail) =>
    router.push({
      pathname: '/appointments/book',
      params: { facilityId: p.care_facility_id, providerId: p.id },
    });

  const goToFacility = (p: ProviderDetail) => router.push(`/facility/${p.care_facility_id}`);

  const submitMessage = async (appointmentId: string) => {
    const body = composeBody.trim();
    if (!body || startThread.isPending) return;
    try {
      await startThread.mutateAsync({ appointment_id: appointmentId, body });
      setComposeBody('');
      setComposeOpen(false);
      setSent(true);
    } catch {
      // startThread.isError renders the inline error below the composer.
    }
  };

  const professionLabel = (value: string | null) => {
    if (!value) return null;
    const key = PROFESSION_KEYS[value];
    return key ? t(key) : value;
  };

  const headerTitle = t('opesCare.providerProfile.title');

  // ── Loading ───────────────────────────────────────────────────────────────
  if (providerQuery.isLoading) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={headerTitle} />
        <View style={styles.center} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>{t('opesCare.providerProfile.loading')}</Text>
        </View>
      </Screen>
    );
  }

  // ── Not listed / failed ───────────────────────────────────────────────────
  // This is not a rare branch: a provider id only resolves when the clinician's
  // internal facility also has an active `care_facilities` directory row, so a
  // stale link lands here. It gets a real way out instead of one grey line.
  if (providerQuery.isError || !provider) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={headerTitle} />
        <View style={styles.center}>
          {isNotFound ? (
            <EmptyState
              icon="person-search"
              tint="blue"
              title={t('doctor.notFound')}
              message={t('doctor.notFoundBody')}
              actionLabel={t('doctor.findAnotherClinician')}
              onAction={() => router.push('/care-map')}
            />
          ) : (
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('doctor.loadErrorTitle')}
              message={t('doctor.loadError')}
              actionLabel={t('doctor.retry')}
              onAction={() => providerQuery.refetch()}
            />
          )}
        </View>
      </Screen>
    );
  }

  // ── Loaded ────────────────────────────────────────────────────────────────
  const openSlots = provider.next_slots.length;
  const isAccepting = openSlots > 0;
  // A "verified" mark is only honest when the registry actually holds an active
  // licence or credential for this person — never decoration.
  const isVerified = provider.credentials.length > 0 || provider.licenses.length > 0;
  const employmentLabel = provider.employment_type
    ? (EMPLOYMENT_KEYS[provider.employment_type]
        ? t(EMPLOYMENT_KEYS[provider.employment_type])
        : provider.employment_type)
    : null;
  const profession = professionLabel(provider.profession);
  const inlineSlots = provider.next_slots.slice(0, MAX_INLINE_SLOTS);

  // Every line is a field the API really returns.
  const infoLines: InfoLine[] = [];
  if (profession) {
    infoLines.push({
      icon: 'stethoscope',
      label: t('doctor.statProfession', { defaultValue: 'Profession' }),
      value: profession,
    });
  }
  if (provider.department) {
    infoLines.push({ icon: 'grid', label: t('doctor.statDepartment'), value: provider.department });
  }
  if (employmentLabel) {
    infoLines.push({ icon: 'id-card', label: t('doctor.statEngagement'), value: employmentLabel });
  }
  infoLines.push({
    icon: 'calendar-check',
    label: t('doctor.statOpenSlots'),
    value: isAccepting ? String(openSlots) : t('doctor.statNone'),
    valueColor: isAccepting ? colors.statusNormal : colors.textMuted,
  });

  // With an appointment on file the composer opens; without one the tap goes
  // where the explanation card below sends it — booking.
  const onMessagePress = () => {
    if (provider.messaging_appointment_id) setComposeOpen((open) => !open);
    else goToBooking(provider);
  };

  return (
    <Screen className="px-0">
      <ScreenHeader title={headerTitle} subtitle={t('opesCare.providerProfile.subtitle')} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* ── Profile hero ──────────────────────────────────────────────────
            Avatar left, identity stack right, facility / city as icon rows,
            honest status badges, then the secondary actions. */}
        <Card>
          <View style={styles.identity}>
            <ProviderAvatar name={provider.name} size={78} />
            <View style={styles.identityBody}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={2} accessibilityRole="header">
                  {provider.name}
                </Text>
                {isVerified ? <Icon name="check-circle" size={18} color={colors.primary} /> : null}
              </View>
              {provider.job_title ? <Text style={styles.jobTitle}>{provider.job_title}</Text> : null}
              <View style={styles.metaRow}>
                <Icon name="building" size={16} color={colors.textSecondary} />
                <Text style={styles.meta} numberOfLines={1}>
                  {provider.facility_name}
                </Text>
              </View>
              {provider.city ? (
                <View style={styles.metaRow}>
                  <Icon name="location" size={16} color={colors.textSecondary} />
                  <Text style={styles.meta} numberOfLines={1}>
                    {provider.city}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.badges}>
            {/* Availability is derived from live open slots, not invented. */}
            <StatusBadge
              status={isAccepting ? 'active' : 'neutral'}
              tone={isAccepting ? 'normal' : 'neutral'}
              icon={isAccepting ? 'calendar-check' : 'clock'}
              label={isAccepting ? t('doctor.accepting') : t('doctor.notAccepting')}
              size="sm"
            />
            {isVerified ? (
              <StatusBadge
                status="verified"
                icon="shield-check"
                label={t('opesCore.common.verified')}
                size="sm"
              />
            ) : null}
          </View>

          <View style={styles.actions}>
            <CareButton
              label={t('doctor.message')}
              icon="chat"
              variant="secondary"
              size="sm"
              style={styles.actionButton}
              onPress={onMessagePress}
            />
            <CareButton
              label={t('opesCare.providerProfile.facility')}
              icon="building"
              variant="secondary"
              size="sm"
              style={styles.actionButton}
              onPress={() => goToFacility(provider)}
            />
          </View>
        </Card>

        {/* ── Primary action, straight under the hero ──────────────────────── */}
        <GradientButton
          label={t('doctor.bookAppointment')}
          onPress={() => goToBooking(provider)}
          accessibilityHint={t('doctor.nextSlotsHint')}
        />

        {/* ── Professional information ─────────────────────────────────────── */}
        <View>
          <SectionHeader
            title={t('opesCare.providerProfile.professionalInformation')}
            variant="overline"
          />
          <Card variant="flush">
            {infoLines.map((line, index) => (
              <InfoRow
                key={line.label}
                icon={line.icon}
                label={line.label}
                value={line.value}
                valueColor={line.valueColor}
                divider={index < infoLines.length - 1}
              />
            ))}
          </Card>
        </View>

        {/* ── Availability ─────────────────────────────────────────────────── */}
        <View>
          <SectionHeader
            title={t('doctor.nextSlotsTitle')}
            variant="overline"
            actionLabel={isAccepting ? t('opesCare.providerProfile.viewAvailableTimes') : undefined}
            onAction={isAccepting ? () => goToBooking(provider) : undefined}
            actionChevron
          />
          {isAccepting ? <Text style={styles.hint}>{t('doctor.nextSlotsHint')}</Text> : null}
          <Card variant="flush">
            {isAccepting ? (
              inlineSlots.map((slot, index) => (
                <ListRow
                  key={slot.id}
                  icon="clock"
                  tint="blue"
                  title={`${formatTime(slot.starts_at)} – ${formatTime(slot.ends_at)}`}
                  subtitle={slotDay(slot.starts_at, i18n.language)}
                  onPress={() => goToBooking(provider)}
                  accessibilityHint={t('doctor.nextSlotsHint')}
                  divider={index < inlineSlots.length - 1}
                />
              ))
            ) : (
              <EmptyState
                icon="clock"
                tint="amber"
                title={t('doctor.noSlots')}
                message={t('doctor.noSlotsBody')}
                actionLabel={t('doctor.bookAppointment')}
                onAction={() => goToBooking(provider)}
              />
            )}
          </Card>
        </View>

        {/* ── Where they practise ──────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('doctor.practisesAt')} variant="overline" />
          <Card variant="flush">
            <ListRow
              icon="building"
              tint="blue"
              title={provider.facility_name}
              subtitle={provider.city ?? t('doctor.viewFacility')}
              onPress={() => goToFacility(provider)}
              accessibilityHint={t('doctor.viewFacility')}
            />
          </Card>
        </View>

        {/* ── Credentials — the schema's stand-in for a bio ─────────────────── */}
        <View>
          <SectionHeader title={t('doctor.credentialsTitle')} variant="overline" />
          {isVerified ? <Text style={styles.hint}>{t('doctor.credentialsHint')}</Text> : null}
          <Card variant="flush">
            {!isVerified ? (
              <EmptyState
                icon="document-text"
                tint="blue"
                title={t('doctor.noCredentials')}
                message={t('doctor.noCredentialsBody')}
              />
            ) : (
              <>
                {provider.licenses.map((license, index) => (
                  <ListRow
                    key={`lic-${index}`}
                    icon="shield-check"
                    tint="green"
                    title={professionLabel(license.profession) ?? t('doctor.credentialOther')}
                    subtitle={license.issuing_body ?? undefined}
                    trailing={
                      <StatusBadge status="active" label={t('doctor.credentialActive')} size="sm" />
                    }
                    divider={index < provider.licenses.length - 1 || provider.credentials.length > 0}
                  />
                ))}
                {provider.credentials.map((credential, index) => (
                  <ListRow
                    key={`cred-${index}`}
                    icon="check-circle"
                    tint="green"
                    title={t(CREDENTIAL_KEYS[credential.type] ?? 'doctor.credentialOther')}
                    subtitle={credential.issuing_body ?? undefined}
                    trailing={
                      <StatusBadge status="active" label={t('doctor.credentialActive')} size="sm" />
                    }
                    divider={index < provider.credentials.length - 1}
                  />
                ))}
              </>
            )}
          </Card>
        </View>

        {/* ── Messaging ────────────────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('doctor.messagingTitle')} variant="overline" />
          {sent ? (
            <Card accentColor={colors.statusNormal}>
              <View style={styles.sentRow} accessibilityLiveRegion="polite">
                <Icon name="check-circle" size={20} color={colors.statusNormal} />
                <View style={styles.sentBody}>
                  <Text style={styles.sentText}>{t('doctor.messageSent')}</Text>
                  <CareButton
                    label={t('doctor.openMessages')}
                    icon="chat"
                    variant="ghost"
                    size="sm"
                    onPress={() => router.push('/(tabs)/messages')}
                  />
                </View>
              </View>
            </Card>
          ) : provider.messaging_appointment_id ? (
            <View style={styles.stack}>
              <CareButton
                label={t('doctor.message')}
                icon="chat"
                variant="ghost"
                onPress={() => setComposeOpen((open) => !open)}
              />
              {composeOpen ? (
                <Card style={styles.composer}>
                  <TextInput
                    style={styles.input}
                    placeholder={t('doctor.messagePlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    value={composeBody}
                    onChangeText={setComposeBody}
                    multiline
                    accessibilityLabel={t('doctor.messagePlaceholder')}
                  />
                  {startThread.isError ? (
                    <Text style={styles.inputError}>{t('doctor.messageError')}</Text>
                  ) : null}
                  <GradientButton
                    label={startThread.isPending ? t('doctor.messageSending') : t('doctor.messageSend')}
                    icon="none"
                    loading={startThread.isPending}
                    disabled={!composeBody.trim()}
                    onPress={() => submitMessage(provider.messaging_appointment_id as string)}
                  />
                </Card>
              ) : null}
            </View>
          ) : (
            // No appointment with this clinician yet — the action stays visible
            // and explains itself instead of failing on tap.
            <Card variant="flush">
              <EmptyState
                icon="info"
                tint="blue"
                title={t('doctor.message')}
                message={t('doctor.messageNeedsAppointment')}
                actionLabel={t('doctor.bookAppointment')}
                onAction={() => goToBooking(provider)}
              />
            </Card>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    center: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.sm },
    loadingText: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    identity: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 2 },
    identityBody: { flex: 1, minWidth: 0, gap: 2 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      color: colors.textPrimary,
    },
    jobTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.link,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    meta: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md - 4 },

    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    actionButton: { flex: 1 },

    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
      marginTop: -4,
      marginBottom: 10,
    },

    stack: { gap: spacing.sm + 4 },
    composer: { gap: spacing.sm + 4 },
    input: {
      minHeight: 96,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: spacing.md - 4,
      paddingVertical: spacing.sm + 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
      textAlignVertical: 'top',
    },
    inputError: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.danger,
    },

    sentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 2 },
    sentBody: { flex: 1, gap: spacing.sm },
    sentText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
  });
