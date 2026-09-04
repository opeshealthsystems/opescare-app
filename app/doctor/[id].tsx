import { useMemo, useRef, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
  a11yJoin,
  formatDate,
  formatLabel,
  formatTime,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import {
  CareButton,
  InfoRow,
  LoadingBlock,
  ProviderAvatar,
  dayDiff,
  describeFailure,
  errorMessage,
  type Translate,
} from '@/components/care/shared';
import {
  useFacilityDetail,
  useProviderDetail,
  useStartMessageThread,
  type ProviderDetail,
} from '@/lib/api/queries';
import {
  joinLocationParts,
  openStateToday,
  telUrl,
  type OpenState,
} from '@/lib/careMap/facilityDisplay';

/**
 * Clinician profile — the person behind a slot. OPES CARE-004 layout
 * (`UIUX/src/screens/care/ProviderProfileScreen.tsx`) on top of this app's own
 * data layer.
 *
 * Reachable from the facility page (app/facility/[id].tsx) and from the booking
 * flow's doctor step. The actions:
 *   • Book — deep-links into /appointments/book pre-filled with this
 *     clinician's directory facility AND provider id (that wizard reads both
 *     params), so the patient lands straight on this clinician's slots.
 *   • Message — messaging requires an existing care relationship (the backend
 *     validates the appointment belongs to the caller), so the composer only
 *     exists when the API hands back a `messaging_appointment_id`. With no
 *     appointment yet the action explains itself and routes to booking —
 *     never a send button that silently 422s.
 *   • Facility — opens /facility/[id] (the directory profile).
 *   • Call — the facility's published number, since a clinician has no
 *     personal one in the directory. Dimmed when the facility publishes none.
 *
 * ── What this screen may and may not show ─────────────────────────────────
 * Audited field by field against `ProviderDetail` in `lib/api/queries.ts` and
 * `MobileProviderController::formatProvider()`. `staff_profiles` has no bio and
 * no photo column, and there is no rating, review count, consultation fee,
 * languages list or years-of-experience anywhere in the schema. The OPES
 * reference carries all of those; this screen deliberately does NOT invent
 * them. The credibility signals here are the ones the API actually returns:
 * job title, profession, department, employment type, facility affiliation,
 * ACTIVE licences and credentials, and live open slots. The avatar is a
 * monogram because there is no image to load.
 *
 * Two secondary reads enrich (never gate) the page: `useFacilityDetail` for the
 * facility's address, phone and today's opening state — the same cached query
 * the facility page uses, so arriving from there costs nothing. If it fails the
 * clinician still renders in full; the phone action simply stays dimmed.
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

/**
 * `MobileProviderController::show()` caps `next_slots` at 10. A clinician
 * sitting on the cap may well have more, so the count is rendered "10+" rather
 * than claiming an exact 10.
 */
const SLOT_QUERY_LIMIT = 10;

/**
 * "Today" / "Tomorrow", else "Mon, 7 Sep" / « lun. 7 sept. » in the active
 * language; the kit's own date as a last resort.
 */
function slotDayLabel(tr: Translate, iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = dayDiff(date, new Date());
  if (diff === 0) return tr('opesCare.appt.today');
  if (diff === 1) return tr('opesCare.appt.tomorrow');
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

/** "Open · closes 17:00" / "Closed · opens 08:00" — the facility's, not the clinician's. */
function openStateLabel(tr: Translate, state: OpenState): string | null {
  switch (state.kind) {
    case 'open24':
      return tr('facility.open24');
    case 'open':
      return tr('facility.openUntil', { time: state.until });
    case 'closedNow':
      return tr('facility.closedUntil', { time: state.opensAt });
    case 'closed':
      return tr('facility.closedToday');
    default:
      return null;
  }
}

/** The circular quick action under the identity block (CARE-004). */
function CircleAction({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.action, disabled && styles.actionOff]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <View style={styles.actionCircle}>
        <Icon name={icon} size={22} color={colors.blue} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

type InfoLine = { key: string; icon: IconName; label: string; value: string; valueColor?: string };

export default function DoctorDetailScreen() {
  const { t, i18n } = useTranslation();
  // The shared care helpers take a plain `(key, params) => string`; i18next's
  // `t` is that, minus its overload noise.
  const tr: Translate = (key, options) => String(t(key, options));
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ id?: string }>();
  const providerId = typeof params.id === 'string' && params.id ? params.id : undefined;

  const providerQuery = useProviderDetail(providerId);
  const provider = providerQuery.data;

  // Enrichment, never a gate: address / phone / today's hours for the facility
  // this clinician practises at. Disabled until the provider resolves.
  const facilityQuery = useFacilityDetail(provider?.care_facility_id);
  const facility = facilityQuery.data;

  const startThread = useStartMessageThread();

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeBody, setComposeBody] = useState('');
  const [sent, setSent] = useState(false);

  // The composer lives in the Messaging section, well below the fold. Without
  // these the hero's "Message" action opens a box the patient cannot see and
  // the tap reads as broken.
  const scrollRef = useRef<ScrollView>(null);
  const messagingY = useRef(0);

  const openState = useMemo<OpenState>(
    () => openStateToday(facility?.hours ?? []),
    [facility?.hours],
  );

  // The API answers a de-listed / non-clinical id with a hard 404
  // (PROVIDER_NOT_FOUND) rather than an empty body, so "no longer listed" is
  // distinguishable from a network failure and gets its own copy.
  const isNotFound =
    axios.isAxiosError(providerQuery.error) && providerQuery.error.response?.status === 404;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const goToBooking = (p: ProviderDetail) =>
    router.push({
      pathname: '/appointments/book',
      params: { facilityId: p.care_facility_id, providerId: p.id },
    });

  const goToFacility = (p: ProviderDetail) => router.push(`/facility/${p.care_facility_id}`);

  const callFacility = () => {
    if (facility?.phone_primary) Linking.openURL(telUrl(facility.phone_primary)).catch(() => {});
  };

  const submitMessage = async (appointmentId: string) => {
    const body = composeBody.trim();
    if (!body || startThread.isPending) return;
    try {
      await startThread.mutateAsync({ appointment_id: appointmentId, body });
      setComposeBody('');
      setComposeOpen(false);
      setSent(true);
    } catch {
      // startThread.isError renders the classified error below the composer.
    }
  };

  /** Enum → translated label, falling back to a humanised raw value. */
  const enumLabel = (map: Record<string, string>, value: string | null): string | null => {
    if (!value) return null;
    const key = map[value];
    return key ? t(key) : formatLabel(value);
  };

  const headerTitle = t('opesCare.providerProfile.title');

  // ── Loading ───────────────────────────────────────────────────────────────
  // LoadingBlock, not a bare spinner: it reveals the "still working" line once
  // a load outlasts the ordinary case, which matters on the links this ships to.
  // `isFetching && !data` rather than `isLoading`, so pressing "Try again" on
  // the error below shows the retry running instead of leaving the same error
  // on screen with nothing happening.
  if (providerQuery.isFetching && !provider) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={headerTitle} onBack={goBack} />
        <LoadingBlock label={t('opesCare.providerProfile.loading')} />
      </Screen>
    );
  }

  // ── Not listed / no id / failed ───────────────────────────────────────────
  // Not a rare branch: a provider id only resolves when the clinician's
  // internal facility ALSO has an active `care_facilities` directory row, so a
  // stale link lands here. Each case gets a real way out.
  if (!providerId || providerQuery.isError || !provider) {
    const failure =
      providerQuery.error && !isNotFound
        ? describeFailure(providerQuery.error, t('doctor.loadError'))
        : null;

    return (
      <Screen className="px-0">
        <ScreenHeader title={headerTitle} onBack={goBack} />
        <View style={styles.center}>
          {isNotFound || !providerId ? (
            <EmptyState
              icon="person-search"
              tint="blue"
              title={t('doctor.notFound')}
              message={t('doctor.notFoundBody')}
              actionLabel={t('doctor.findAnotherClinician')}
              onAction={() => router.push('/care-map')}
            />
          ) : (
            // Offline, timed out and "the server is down" read differently —
            // describeFailure says which, instead of one grey line for all.
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={failure?.title ?? t('doctor.loadErrorTitle')}
              message={failure?.message ?? t('doctor.loadError')}
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
  const slotCountLabel = openSlots >= SLOT_QUERY_LIMIT ? `${openSlots}+` : String(openSlots);
  const inlineSlots = provider.next_slots.slice(0, MAX_INLINE_SLOTS);
  const nextSlot = provider.next_slots[0];

  // A "verified" mark is only honest here because the API returns *active*
  // credentials and *active* licences and nothing else — never decoration.
  const isVerified = provider.credentials.length > 0 || provider.licenses.length > 0;

  const profession = enumLabel(PROFESSION_KEYS, provider.profession);
  const employmentLabel = enumLabel(EMPLOYMENT_KEYS, provider.employment_type);
  // Reference order: job title, else profession, else a neutral noun.
  const roleLine = provider.job_title ?? profession ?? t('opesCare.providerProfile.providerFallback');

  const address = facility
    ? joinLocationParts(facility.address, facility.city, facility.region)
    : (provider.city ?? '');
  const facilityTypeLabel = facility
    ? t(`careMap.types.${facility.facility_type}`, {
        defaultValue: formatLabel(facility.facility_type),
      })
    : null;
  const openLabel = openStateLabel(tr, openState);

  // Every line below is a field the API really returns.
  const infoLines: InfoLine[] = [];
  if (profession) {
    infoLines.push({
      key: 'profession',
      icon: 'stethoscope',
      label: t('doctor.statProfession'),
      value: profession,
    });
  }
  if (provider.department) {
    infoLines.push({
      key: 'department',
      icon: 'grid',
      label: t('doctor.statDepartment'),
      value: provider.department,
    });
  }
  if (employmentLabel) {
    infoLines.push({
      key: 'engagement',
      icon: 'id-card',
      label: t('doctor.statEngagement'),
      value: employmentLabel,
    });
  }
  // No facility line here on purpose: the hero already names it and the
  // "Practises at" section below is the row you can actually tap.
  infoLines.push({
    key: 'slots',
    icon: 'calendar-check',
    label: t('doctor.statOpenSlots'),
    value: isAccepting ? slotCountLabel : t('doctor.statNone'),
    valueColor: isAccepting ? colors.statusNormal : colors.textMuted,
  });
  if (nextSlot) {
    infoLines.push({
      key: 'next',
      icon: 'clock',
      label: t('doctor.nextSlotsTitle'),
      value: `${slotDayLabel(tr, nextSlot.starts_at, i18n.language)} · ${formatTime(nextSlot.starts_at)}`,
      valueColor: colors.link,
    });
  }

  // With an appointment on file the composer opens AND the page moves to it;
  // without one the tap goes where the explanation card below sends it —
  // booking. Either way the button does something visible.
  const onMessagePress = () => {
    if (!provider.messaging_appointment_id) {
      goToBooking(provider);
      return;
    }
    if (!sent) setComposeOpen(true);
    scrollRef.current?.scrollTo({ y: Math.max(messagingY.current - spacing.sm, 0), animated: true });
  };

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={headerTitle}
        subtitle={t('opesCare.providerProfile.subtitle')}
        onBack={goBack}
      />

      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content}>
        {/* ── Profile hero ──────────────────────────────────────────────────
            Avatar left, identity stack right, facility / place as icon rows,
            honest status badges, then the four CARE-004 quick actions. */}
        <Card>
          <View style={styles.identity}>
            <ProviderAvatar name={provider.name} size={78} />
            <View style={styles.identityBody}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={2} accessibilityRole="header">
                  {provider.name}
                </Text>
                {/* Decorative on purpose: the "Verified" badge below says it
                    in words, so labelling this too reads it out twice. */}
                {isVerified ? <Icon name="check-circle" size={18} color={colors.primary} /> : null}
              </View>
              <Text style={styles.jobTitle}>{roleLine}</Text>
              {provider.department ? (
                <View style={styles.metaRow}>
                  <Icon name="grid" size={16} color={colors.textSecondary} />
                  <Text style={styles.meta} numberOfLines={1}>
                    {provider.department}
                  </Text>
                </View>
              ) : null}
              <View style={styles.metaRow}>
                <Icon name="building" size={16} color={colors.textSecondary} />
                <Text style={styles.meta} numberOfLines={2}>
                  {provider.facility_name}
                </Text>
              </View>
              {address ? (
                <View style={styles.metaRow}>
                  <Icon name="location" size={16} color={colors.textSecondary} />
                  <Text style={styles.meta} numberOfLines={2}>
                    {address}
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
            {facilityTypeLabel ? (
              <StatusBadge
                status={facility?.facility_type ?? 'facility'}
                tone="neutral"
                label={facilityTypeLabel}
                icon="building"
                size="sm"
              />
            ) : null}
          </View>

          {/* Call is the FACILITY's published line — a clinician has no
              personal number in the directory. Dimmed when there is none, or
              while the facility read is still in flight. */}
          <View style={styles.actions}>
            <CircleAction
              icon="phone"
              label={t('facility.callAction')}
              disabled={!facility?.phone_primary}
              onPress={callFacility}
            />
            <CircleAction
              icon="chat"
              label={t('opesCare.providerProfile.message')}
              onPress={onMessagePress}
            />
            <CircleAction
              icon="calendar-plus"
              label={t('opesCare.providerProfile.book')}
              onPress={() => goToBooking(provider)}
            />
            <CircleAction
              icon="building"
              label={t('opesCare.providerProfile.facility')}
              onPress={() => goToFacility(provider)}
            />
          </View>
        </Card>

        {/* ── Primary action, straight under the hero ───────────────────────
            With nothing published the label stops promising a booking and
            offers the wizard's own date search instead. */}
        <GradientButton
          label={
            isAccepting
              ? t('doctor.bookAppointment')
              : t('opesCare.providerProfile.viewAvailableTimes')
          }
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
                key={line.key}
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
              <>
                {inlineSlots.map((slot, index) => (
                  <ListRow
                    key={slot.id}
                    icon="clock"
                    tint="blue"
                    title={`${formatTime(slot.starts_at)} – ${formatTime(slot.ends_at)}`}
                    meta={[
                      slotDayLabel(tr, slot.starts_at, i18n.language),
                      // capacity − booked_count, straight off the slot row.
                      t('appointments.book.spotsLeft', { count: slot.available_count }),
                    ]}
                    onPress={() => goToBooking(provider)}
                    accessibilityHint={t('doctor.nextSlotsHint')}
                    divider={index < inlineSlots.length - 1 || openSlots > MAX_INLINE_SLOTS}
                  />
                ))}
                {openSlots > MAX_INLINE_SLOTS ? (
                  <ListRow
                    icon="calendar-plus"
                    tint="green"
                    title={t('opesCare.providerProfile.viewAvailableTimes')}
                    // A count is only printed when it is the true total: on the
                    // API's 10-slot cap there may well be more, so the row says
                    // what to do instead of naming a number it cannot vouch for.
                    subtitle={
                      openSlots >= SLOT_QUERY_LIMIT
                        ? t('doctor.nextSlotsHint')
                        : t('appointments.book.slotsOpen', { count: openSlots })
                    }
                    onPress={() => goToBooking(provider)}
                  />
                ) : null}
              </>
            ) : (
              // Empty, not broken: the wizard can still find this clinician
              // other days, or another clinician at the same facility.
              <EmptyState
                icon="clock"
                tint="amber"
                title={t('doctor.noSlots')}
                message={t('doctor.noSlotsBody')}
                actionLabel={t('opesCare.providerProfile.viewAvailableTimes')}
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
              meta={[facilityTypeLabel, address || null]}
              onPress={() => goToFacility(provider)}
              // The opening state lives in the trailing badge, which the row's
              // own generated label never reads — so it is spelled out here.
              accessibilityLabel={a11yJoin(
                provider.facility_name,
                facilityTypeLabel,
                address || null,
                openLabel,
              )}
              accessibilityHint={t('doctor.viewFacility')}
              trailing={
                openLabel ? (
                  <StatusBadge
                    status={
                      openState.kind === 'open' || openState.kind === 'open24' ? 'open' : 'closed'
                    }
                    tone={
                      openState.kind === 'open' || openState.kind === 'open24'
                        ? 'normal'
                        : openState.kind === 'closedNow'
                          ? 'warning'
                          : 'neutral'
                    }
                    icon="clock"
                    label={openLabel}
                    size="sm"
                  />
                ) : undefined
              }
              divider={!!facility?.phone_primary}
            />
            {facility?.phone_primary ? (
              <ListRow
                icon="phone"
                tint="green"
                title={t('facility.phone')}
                subtitle={facility.phone_primary}
                onPress={callFacility}
                accessibilityHint={t('facility.callAction')}
              />
            ) : null}
          </Card>
        </View>

        {/* ── Credentials — the schema's stand-in for a bio ─────────────────── */}
        <View>
          <SectionHeader title={t('doctor.credentialsTitle')} variant="overline" />
          {isVerified ? <Text style={styles.hint}>{t('doctor.credentialsHint')}</Text> : null}
          <Card variant="flush">
            {!isVerified ? (
              // Nothing published is NOT a failure — blue and informative, and
              // it says what is still verified (the facility affiliation).
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
                    title={
                      enumLabel(PROFESSION_KEYS, license.profession) ?? t('doctor.credentialOther')
                    }
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
                    title={
                      CREDENTIAL_KEYS[credential.type]
                        ? t(CREDENTIAL_KEYS[credential.type])
                        : formatLabel(credential.type)
                    }
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
        <View
          onLayout={(event) => {
            messagingY.current = event.nativeEvent.layout.y;
          }}
        >
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
                    <Text style={styles.inputError} accessibilityLiveRegion="polite">
                      {errorMessage(startThread.error, t('doctor.messageError'))}
                    </Text>
                  ) : null}
                  <GradientButton
                    label={
                      startThread.isPending ? t('doctor.messageSending') : t('doctor.messageSend')
                    }
                    icon="none"
                    loading={startThread.isPending}
                    disabled={!composeBody.trim()}
                    onPress={() => submitMessage(provider.messaging_appointment_id as string)}
                  />
                </Card>
              ) : null}
            </View>
          ) : (
            // No appointment with this clinician yet — the backend would reject
            // a thread, so there is no send button to press. The rule is stated
            // and the way to satisfy it is one tap away.
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
    metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 3 },
    meta: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md - 4 },

    actions: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    action: { alignItems: 'center', gap: 6 },
    actionOff: { opacity: 0.4 },
    actionCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textPrimary,
    },

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
