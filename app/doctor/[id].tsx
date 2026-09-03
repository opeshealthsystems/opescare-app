import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  Award,
  BadgeCheck,
  Building2,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Clock,
  Info,
  MapPin,
  MessageSquare,
  RefreshCw,
  ScrollText,
  SearchX,
  Stethoscope,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import {
  Callout,
  GhostButton,
  IconTile,
  MetaRow,
  ScreenHeader,
  SectionLabel,
  StateHeading,
} from '../../components/clinical/CareUi';
import { colors } from '../../theme/tokens';
import {
  useProviderDetail,
  useStartMessageThread,
  type AppointmentSlotOption,
  type ProviderDetail,
} from '../../lib/api/queries';

/**
 * Clinician profile — the person behind a slot.
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
 * review count or years-of-experience anywhere in the schema (verified against
 * the migrations and MobileProviderController). The reference clinician card
 * carries all of those; this screen deliberately does NOT invent them. The
 * credibility signals here are the ones the API actually returns: job title,
 * department, facility affiliation, employment type, active licences and
 * credentials, and live open-slot availability. The avatar is a monogram
 * because there is no image to load.
 */

/** Two-letter monogram — the schema stores no provider photo. */
function providerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

function slotParts(slot: AppointmentSlotOption, locale: string) {
  const localeTag = locale === 'fr' ? 'fr-FR' : 'en-US';
  const date = new Date(slot.starts_at);
  if (Number.isNaN(date.getTime())) return null;
  return {
    day: date.toLocaleDateString(localeTag, { weekday: 'short', day: 'numeric', month: 'short' }),
    time: date.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' }),
  };
}

export default function DoctorDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (providerQuery.isLoading) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('doctor.title')} onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand[500]} size="large" />
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
        <ScreenHeader title={t('doctor.title')} onBack={() => router.back()} />
        <View className="flex-1 justify-center px-8">
          <StateHeading
            icon={isNotFound ? SearchX : Stethoscope}
            tone={isNotFound ? 'neutral' : 'danger'}
            title={isNotFound ? t('doctor.notFound') : t('doctor.loadErrorTitle')}
            body={isNotFound ? t('doctor.notFoundBody') : t('doctor.loadError')}
          />
          <View className="mt-7 gap-3">
            {isNotFound ? (
              <GhostButton
                label={t('doctor.findAnotherClinician')}
                icon={Building2}
                onPress={() => router.push('/care-map')}
              />
            ) : (
              <GhostButton
                label={t('doctor.retry')}
                icon={RefreshCw}
                onPress={() => providerQuery.refetch()}
              />
            )}
          </View>
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

  const stats: { label: string; value: string }[] = [];
  if (provider.department) stats.push({ label: t('doctor.statDepartment'), value: provider.department });
  if (employmentLabel) stats.push({ label: t('doctor.statEngagement'), value: employmentLabel });
  stats.push({
    label: t('doctor.statOpenSlots'),
    value: isAccepting ? String(openSlots) : t('doctor.statNone'),
  });

  return (
    <Screen className="px-0">
      <ScreenHeader title={provider.name} onBack={() => router.back()} />

      <ScrollView className="flex-1 px-6 pt-4" contentContainerStyle={{ paddingBottom: 48 }}>
        {/* ── Credential card ───────────────────────────────────────────────
            Avatar left, identity stack right, metadata as icon rows — the
            clinician-card treatment from the booking reference. */}
        <View className="overflow-hidden rounded-2xl bg-white">
          <LinearGradient
            // className does not apply to LinearGradient (no cssInterop is
            // registered for it), so every value here must be inline style.
            colors={[colors.brand[50], colors.white]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18 }}
          >
            <View className="flex-row">
              <View>
                <LinearGradient
                  colors={[colors.brand[300], colors.brand[600]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    className="items-center justify-center rounded-full bg-white"
                    style={{ width: 68, height: 68 }}
                  >
                    <Text className="text-xl font-extrabold text-brand-600">
                      {providerInitials(provider.name)}
                    </Text>
                  </View>
                </LinearGradient>
                {/* Availability is derived from live open slots, not invented. */}
                <View
                  className="absolute h-5 w-5 items-center justify-center rounded-full border-2 border-white"
                  style={{
                    right: 0,
                    bottom: 0,
                    backgroundColor: isAccepting
                      ? colors.semantic.success
                      : colors.navy.muted,
                  }}
                >
                  <View className="h-1.5 w-1.5 rounded-full bg-white" />
                </View>
              </View>

              <View className="ml-4 flex-1 justify-center">
                <View className="flex-row items-center">
                  <Text
                    className="shrink text-xl font-extrabold text-navy-text"
                    numberOfLines={2}
                  >
                    {provider.name}
                  </Text>
                  {isVerified ? (
                    <BadgeCheck
                      size={17}
                      color={colors.brand[600]}
                      style={{ marginLeft: 6, marginTop: 2 }}
                    />
                  ) : null}
                </View>
                {provider.job_title ? (
                  <Text className="mt-0.5 text-sm font-bold text-brand-600">
                    {provider.job_title}
                  </Text>
                ) : null}
                <MetaRow icon={Building2}>{provider.facility_name}</MetaRow>
                {provider.city ? <MetaRow icon={MapPin}>{provider.city}</MetaRow> : null}
              </View>
            </View>

            <View className="mt-4 flex-row flex-wrap items-center gap-2">
              <View
                className="flex-row items-center rounded-full px-3 py-1"
                style={{
                  backgroundColor: isAccepting
                    ? colors.semantic.successSurface
                    : colors.cream[200],
                }}
              >
                <View
                  className="mr-1.5 h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: isAccepting
                      ? colors.semantic.success
                      : colors.navy.muted,
                  }}
                />
                <Text
                  className="text-[11px] font-bold"
                  style={{
                    color: isAccepting ? colors.semantic.success : colors.navy.secondary,
                  }}
                >
                  {isAccepting ? t('doctor.accepting') : t('doctor.notAccepting')}
                </Text>
              </View>
              {professionLabel(provider.profession) ? (
                <View className="flex-row items-center rounded-full bg-cream-200 px-3 py-1">
                  <Stethoscope size={11} color={colors.navy.secondary} />
                  <Text className="ml-1.5 text-[11px] font-bold text-navy-secondary">
                    {professionLabel(provider.profession)}
                  </Text>
                </View>
              ) : null}
            </View>
          </LinearGradient>

          {/* Stat strip — every column is a field the API really returns. */}
          <View
            className="flex-row"
            style={{ borderTopWidth: 1, borderTopColor: colors.cream[300] }}
          >
            {stats.map((stat, index) => (
              <View
                key={stat.label}
                className="flex-1 items-center px-2 py-3"
                style={
                  index > 0
                    ? { borderLeftWidth: 1, borderLeftColor: colors.cream[300] }
                    : undefined
                }
              >
                <Text
                  className="text-center text-sm font-extrabold text-navy-text"
                  numberOfLines={1}
                >
                  {stat.value}
                </Text>
                <Text className="mt-0.5 text-center text-[10px] font-semibold uppercase text-navy-muted">
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Primary action, straight under the credential card ───────────── */}
        <View className="mt-5">
          <Button
            label={t('doctor.bookAppointment')}
            leftIcon={CalendarPlus}
            onPress={() => goToBooking(provider)}
          />
        </View>

        {/* ── Next available slots ─────────────────────────────────────────── */}
        <SectionLabel
          title={t('doctor.nextSlotsTitle')}
          hint={isAccepting ? t('doctor.nextSlotsHint') : undefined}
        />
        {!isAccepting ? (
          <View className="flex-row items-start rounded-2xl bg-white p-4">
            <IconTile icon={Clock} tone="neutral" />
            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold text-navy-text">{t('doctor.noSlots')}</Text>
              <Text className="mt-1 text-xs leading-5 text-navy-secondary">
                {t('doctor.noSlotsBody')}
              </Text>
            </View>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {provider.next_slots.map((slot) => {
              const parts = slotParts(slot, i18n.language);
              if (!parts) return null;
              return (
                <Pressable
                  key={slot.id}
                  onPress={() => goToBooking(provider)}
                  accessibilityRole="button"
                  className="rounded-xl border bg-white px-3 py-2"
                  style={{ borderColor: colors.cream[300] }}
                >
                  <Text className="text-[10px] font-semibold uppercase text-navy-muted">
                    {parts.day}
                  </Text>
                  <View className="mt-0.5 flex-row items-center">
                    <Clock size={12} color={colors.brand[600]} />
                    <Text className="ml-1.5 text-sm font-bold text-navy-text">{parts.time}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Where they practise ──────────────────────────────────────────── */}
        <SectionLabel title={t('doctor.practisesAt')} />
        <Pressable
          onPress={() => router.push(`/facility/${provider.care_facility_id}`)}
          accessibilityRole="button"
          className="flex-row items-center rounded-2xl bg-white p-4"
        >
          <IconTile icon={Building2} tone="gold" size={42} />
          <View className="ml-3 flex-1">
            <Text className="text-base font-bold text-navy-text" numberOfLines={1}>
              {provider.facility_name}
            </Text>
            <Text className="mt-0.5 text-xs text-navy-secondary" numberOfLines={1}>
              {provider.city ?? t('doctor.viewFacility')}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.navy.muted} />
        </Pressable>

        {/* ── Credentials — the schema's stand-in for a bio ─────────────────── */}
        <SectionLabel
          title={t('doctor.credentialsTitle')}
          hint={isVerified ? t('doctor.credentialsHint') : undefined}
        />
        {!isVerified ? (
          <View className="flex-row items-start rounded-2xl bg-white p-4">
            <IconTile icon={ScrollText} tone="neutral" />
            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold text-navy-text">{t('doctor.noCredentials')}</Text>
              <Text className="mt-1 text-xs leading-5 text-navy-secondary">
                {t('doctor.noCredentialsBody')}
              </Text>
            </View>
          </View>
        ) : (
          <View className="rounded-2xl bg-white px-4">
            {provider.licenses.map((license, index) => (
              <View
                key={`lic-${index}`}
                className="flex-row items-center py-3.5"
                style={
                  index > 0 ? { borderTopWidth: 1, borderTopColor: colors.cream[300] } : undefined
                }
              >
                <IconTile icon={Award} tone="gold" />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold text-navy-text">
                    {professionLabel(license.profession) ?? t('doctor.credentialOther')}
                  </Text>
                  {license.issuing_body ? (
                    <Text className="mt-0.5 text-xs text-navy-secondary" numberOfLines={1}>
                      {license.issuing_body}
                    </Text>
                  ) : null}
                </View>
                <Text className="text-[10px] font-bold uppercase text-success">
                  {t('doctor.credentialActive')}
                </Text>
              </View>
            ))}
            {provider.credentials.map((credential, index) => (
              <View
                key={`cred-${index}`}
                className="flex-row items-center py-3.5"
                style={
                  index > 0 || provider.licenses.length > 0
                    ? { borderTopWidth: 1, borderTopColor: colors.cream[300] }
                    : undefined
                }
              >
                <IconTile icon={CheckCircle2} tone="success" />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold text-navy-text">
                    {t(CREDENTIAL_KEYS[credential.type] ?? 'doctor.credentialOther')}
                  </Text>
                  {credential.issuing_body ? (
                    <Text className="mt-0.5 text-xs text-navy-secondary" numberOfLines={1}>
                      {credential.issuing_body}
                    </Text>
                  ) : null}
                </View>
                <Text className="text-[10px] font-bold uppercase text-success">
                  {t('doctor.credentialActive')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Messaging ────────────────────────────────────────────────────── */}
        <SectionLabel title={t('doctor.messagingTitle')} />
        {sent ? (
          <View
            className="flex-row items-start rounded-2xl p-4"
            style={{ backgroundColor: colors.semantic.successSurface }}
          >
            <CheckCircle2 size={18} color={colors.semantic.success} />
            <View className="ml-3 flex-1">
              <Text className="text-sm text-navy-text">{t('doctor.messageSent')}</Text>
              <Pressable onPress={() => router.push('/(tabs)/messages')} className="mt-2">
                <Text className="text-sm font-bold text-brand-600">{t('doctor.openMessages')}</Text>
              </Pressable>
            </View>
          </View>
        ) : provider.messaging_appointment_id ? (
          <>
            <GhostButton
              label={t('doctor.message')}
              icon={MessageSquare}
              onPress={() => setComposeOpen((open) => !open)}
            />
            {composeOpen ? (
              <View className="mt-3 rounded-2xl bg-white p-4">
                <TextInput
                  className="min-h-[88px] rounded-xl border px-3 py-2 text-sm text-navy-text"
                  style={{ borderColor: colors.cream[300], textAlignVertical: 'top' }}
                  placeholder={t('doctor.messagePlaceholder')}
                  placeholderTextColor={colors.navy.muted}
                  value={composeBody}
                  onChangeText={setComposeBody}
                  multiline
                />
                {startThread.isError ? (
                  <Text className="mt-2 text-xs text-danger">{t('doctor.messageError')}</Text>
                ) : null}
                <View className="mt-3">
                  <Button
                    label={
                      startThread.isPending ? t('doctor.messageSending') : t('doctor.messageSend')
                    }
                    leftIcon={MessageSquare}
                    showChevron={false}
                    loading={startThread.isPending}
                    disabled={!composeBody.trim()}
                    onPress={() => submitMessage(provider.messaging_appointment_id as string)}
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : (
          // No appointment with this clinician yet — the action stays visible
          // and explains itself instead of failing on tap.
          <Pressable onPress={() => goToBooking(provider)} accessibilityRole="button">
            <Callout
              icon={Info}
              tone="info"
              title={t('doctor.message')}
              body={t('doctor.messageNeedsAppointment')}
            />
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}
