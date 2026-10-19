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
import { isAxiosError } from 'axios';
import { Screen } from '@/components/ui/Screen';
import {
  CredentialPanelContent,
  IdentityCard,
  IdentityLine,
  OverviewTiles,
  PanelHeader,
  ProfileHeading,
  ProfileScreen as ProfileFrame,
  TrustChips,
} from '@/components/profile';
import {
  Card,
  CardStack,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  ScreenHeader,
  initialsFrom,
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
  dayDiff,
  describeFailure,
  errorMessage,
  type Translate,
} from '@/components/care/shared';
import { useFacilityDetail, useProviderDetail, type ProviderDetail } from '@/lib/api/queries';
import {
  useMessageRecipients,
  useStartThread,
  type ClinicianRecipient,
} from '@/lib/api/messagingRecipients';
import { registerMessagingRecipientStrings } from '@/lib/i18n/messagingRecipientStrings';
import {
  joinLocationParts,
  openStateToday,
  telUrl,
  usablePhone,
  type OpenState,
} from '@/lib/careMap/facilityDisplay';

/**
 * Clinician profile — the person behind a slot. OPES CARE-004 layout
 * (design reference `src/screens/care/ProviderProfileScreen.tsx` (archived prototype, see docs/DESIGN_REFERENCE.md)) on top of this app's own
 * data layer.
 *
 * Reachable from the facility page (app/facility/[id].tsx) and from the booking
 * flow's doctor step. The actions:
 *   • Book — deep-links into /appointments/book pre-filled with this
 *     clinician's directory facility AND provider id (that wizard reads both
 *     params), so the patient lands straight on this clinician's slots.
 *   • Message — see below. It NEVER silently redirects.
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
 *
 * ── The "Message" action, and what it used to do ──────────────────────────
 * It used to check `messaging_appointment_id` and, when that was null, push the
 * patient to BOOKING. A tap labelled "Message" that lands on a booking wizard
 * is not an answer; the patient never learns why, and a patient who is in this
 * clinician's care WITHOUT an appointment on file (on their care team, treated
 * by them, under a consent grant) was sent to book something they did not need.
 *
 * The screen now asks the server the actual question —
 * `GET /mobile/messages/recipients`, whose `clinicians` list is the patient's
 * own care relationships and nobody else's — and says what it finds:
 *
 *   • a relationship, and an inbox that can receive it → the composer opens,
 *     addressed to this clinician (`clinician_id`, which the server re-checks);
 *   • a relationship, but nothing that can receive it yet → it says so, and
 *     offers the facility's front desk, which reads its messages;
 *   • no relationship → it says so, offers the front desk, and offers booking
 *     as a choice the patient makes rather than a redirect that happens to them.
 *
 * `messaging_appointment_id` is still honoured as the optimistic hint it always
 * was, so the composer is not gated behind a second round trip on the common
 * path — but it is no longer the only way to be allowed to write.
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
  /** Why the action is dimmed — a grey circle says nothing on its own. */
  hint,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  hint?: string;
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
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
    >
      <View style={styles.actionCircle}>
        <Icon name={icon} size={26} color={colors.blue} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

type InfoLine = { key: string; icon: IconName; label: string; value: string; valueColor?: string };

/**
 * What this screen may offer for "Message", resolved from the server rather
 * than guessed from an appointment id.
 *
 *   'checking'   — the recipients read is still in flight.
 *   'open'       — a relationship AND an inbox: the composer works.
 *   'unreachable'— a relationship, but nothing that can receive it yet.
 *   'none'       — no care relationship. Not an error, and not a redirect.
 *   'unknown'    — the read FAILED. Distinct from 'none' on purpose: telling a
 *                  patient "you are not in this clinician's care" because a
 *                  request timed out is a lie the app has no business telling.
 */
type MessageAccess = 'checking' | 'open' | 'unreachable' | 'none' | 'unknown';

// Renders this screen's messaging copy in both languages before the pending
// i18n files are merged into the shipped catalogue.
registerMessagingRecipientStrings();

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

  const startThread = useStartThread();

  // Who this patient may write to. The clinician half is built from the
  // patient's own record server-side, so finding this provider in it is the
  // real answer to "can I message them", not an inference from an appointment.
  const recipientsQuery = useMessageRecipients('', !!providerId);
  const recipient: ClinicianRecipient | undefined = useMemo(
    () => recipientsQuery.data?.clinicians.find((c) => c.id === providerId),
    [recipientsQuery.data, providerId],
  );

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeBody, setComposeBody] = useState('');
  const [sent, setSent] = useState(false);
  /** True when the message that was sent went to the desk, not the clinician. */
  const [sentToDesk, setSentToDesk] = useState(false);

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
    isAxiosError(providerQuery.error) && providerQuery.error.response?.status === 404;

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

  /**
   * The register writes the literal string "N/A" where a facility publishes no
   * number (1 840 of its 2 728 rows), so `phone_primary` being truthy never
   * meant there was anything to ring. One predicate decides.
   */
  const facilityPhone = usablePhone(facility?.phone_primary);

  const callFacility = () => {
    const url = telUrl(facilityPhone);
    if (url) Linking.openURL(url).catch(() => {});
  };

  /**
   * Write to the clinician by name. `clinician_id` is what goes on the wire —
   * the server resolves the care relationship and the appointment behind it,
   * and refuses if there is none, so the phone is not the thing deciding.
   */
  const submitMessage = async (clinicianId: string) => {
    const body = composeBody.trim();
    if (!body || startThread.isPending) return;
    try {
      await startThread.mutateAsync({ clinician_id: clinicianId, body });
      setComposeBody('');
      setComposeOpen(false);
      setSentToDesk(false);
      setSent(true);
    } catch {
      // startThread.isError renders the classified error below the composer.
    }
  };

  /**
   * Write to the facility's front desk instead — the honest offer when this
   * clinician cannot be written to. Never fired without the patient asking:
   * it is a labelled button, not a fallback the send path takes on its own.
   */
  const submitToDesk = async (facilityId: string) => {
    const body = composeBody.trim();
    if (!body || startThread.isPending) return;
    try {
      await startThread.mutateAsync({ facility_id: facilityId, body });
      setComposeBody('');
      setComposeOpen(false);
      setSentToDesk(true);
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

  /**
   * What the Messaging section is allowed to offer.
   *
   * `messaging_appointment_id` is kept as an optimistic hint so the common case
   * (an appointment on file) does not wait on a second request — but it is only
   * a hint now. The server's recipient list is the authority, and it is what
   * distinguishes "in your care but no inbox" from "not in your care", a
   * distinction the appointment id cannot make.
   */
  const messageAccess: MessageAccess = recipient
    ? recipient.deliverable
      ? 'open'
      : 'unreachable'
    : provider.messaging_appointment_id
      ? 'open'
      : recipientsQuery.isLoading
        ? 'checking'
        : recipientsQuery.isError
          ? 'unknown'
          : 'none';

  // The desk the honest fallback writes to: this clinician's own facility.
  const deskFacilityId = recipient?.facility_id ?? provider.facility_id ?? null;
  const deskFacilityName = recipient?.facility_name ?? provider.facility_name;

  // Every tap moves the page to the Messaging section and says something there.
  // It never navigates away: a button labelled "Message" that lands on a
  // booking wizard is a redirect the patient did not ask for.
  const onMessagePress = () => {
    if (!sent && messageAccess === 'open') setComposeOpen(true);
    scrollRef.current?.scrollTo({ y: Math.max(messagingY.current - spacing.sm, 0), animated: true });
  };

  return (
    <ProfileFrame
      ref={scrollRef}
      masthead={{
        left: { icon: 'arrow-left', label: t('profiles.back'), onPress: goBack },
      }}
    >
        <ProfileHeading title={headerTitle} subtitle={t('opesCare.providerProfile.subtitle')} />

        {/* ── Identity card ─────────────────────────────────────────────────
            The directory publishes no photo for a clinician, so the portrait
            is their initials. Their credentials sit in the panel slot a
            patient's Health ID takes: verified only when the API returned an
            active licence or credential, never as decoration. */}
        <IdentityCard
          initials={initialsFrom(provider.name)}
          name={provider.name}
          verified={isVerified}
          statusLabel={isAccepting ? t('doctor.accepting') : t('doctor.notAccepting')}
          statusTone={isAccepting ? 'normal' : 'neutral'}
          statusIcon={isAccepting ? 'calendar-check' : 'clock'}
          panel={{
            label: `${t('doctor.credentialsTitle')}: ${
              isVerified ? t('profiles.provider.verified') : t('profiles.provider.noneOnFile')
            }`,
            content: (
              <CredentialPanelContent
                title={t('profiles.provider.brand')}
                icon={isVerified ? 'shield-check' : 'document-text'}
                tone={isVerified ? 'normal' : 'neutral'}
                status={
                  isVerified ? t('profiles.provider.verified') : t('profiles.provider.noneOnFile')
                }
                detail={
                  isVerified
                    ? t('profiles.provider.counts', {
                        licences: provider.licenses.length,
                        credentials: provider.credentials.length,
                      })
                    : null
                }
              />
            ),
          }}
        >
          <IdentityLine icon="stethoscope" text={roleLine} />
          {provider.department ? <IdentityLine icon="grid" text={provider.department} /> : null}
          <IdentityLine icon="building" text={provider.facility_name} />
          {address ? <IdentityLine icon="location" text={address} /> : null}
        </IdentityCard>

        <TrustChips
          items={[
            { key: 'booking', icon: 'calendar-check', label: t('profiles.trust.booking') },
            { key: 'messaging', icon: 'chat', label: t('profiles.trust.messaging') },
            { key: 'consent', icon: 'shield-check', label: t('profiles.trust.consent') },
            { key: 'directory', icon: 'building', label: t('profiles.trust.directory') },
          ]}
        />

        {/* Badges and the four quick actions, unchanged. */}
        <Card>
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
              disabled={!facilityPhone}
              hint={facilityPhone ? undefined : t('facility.phoneNotListedHint')}
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

        <OverviewTiles
          title={t('profiles.atAGlance')}
          tiles={[
            {
              key: 'slots',
              icon: 'calendar-check',
              tint: 'green',
              value: isAccepting ? slotCountLabel : '0',
              label: t('profiles.provider.openSlots'),
              hint: t('profiles.provider.openSlotsHint'),
              onPress: () => goToBooking(provider),
            },
            {
              key: 'next',
              icon: 'clock',
              tint: 'blue',
              value: nextSlot ? formatTime(nextSlot.starts_at) : '—',
              label: t('profiles.provider.nextSlot'),
              hint: nextSlot
                ? slotDayLabel(tr, nextSlot.starts_at, i18n.language)
                : t('profiles.provider.noSlot'),
              onPress: () => goToBooking(provider),
            },
            {
              key: 'licences',
              icon: 'shield-check',
              tint: 'green',
              value: String(provider.licenses.length),
              label: t('profiles.provider.licences'),
              hint: t('profiles.provider.licencesHint'),
            },
            {
              key: 'credentials',
              icon: 'check-circle',
              tint: 'amber',
              value: String(provider.credentials.length),
              label: t('profiles.provider.credentials'),
              hint: t('profiles.provider.credentialsHint'),
            },
          ]}
        />

        {/* ── Professional information ─────────────────────────────────────── */}
        <View>
          <PanelHeader
            icon="stethoscope"
            title={t('opesCare.providerProfile.professionalInformation')}
            subtitle={t('profiles.provider.infoDesc')}
            style={{ marginBottom: spacing.sm }}
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
          <PanelHeader
            icon="calendar-check"
            title={t('doctor.nextSlotsTitle')}
            subtitle={t('profiles.provider.slotsDesc')}
            actionLabel={isAccepting ? t('opesCare.providerProfile.viewAvailableTimes') : undefined}
            onAction={isAccepting ? () => goToBooking(provider) : undefined}
            style={{ marginBottom: spacing.sm }}
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
          <PanelHeader
            icon="building"
            title={t('doctor.practisesAt')}
            subtitle={t('profiles.provider.practiseDesc')}
            style={{ marginBottom: spacing.sm }}
          />
          <CardStack spacing="sm">
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
              />
            </Card>
            {/* Says "Not listed" rather than disappearing: a patient looking
                for a number learns the register has none, instead of hunting
                for a row that was silently dropped. No `onPress`, so there is
                nothing to tap and no chevron. */}
            <Card variant="flush">
              <ListRow
                icon="phone"
                tint={facilityPhone ? 'green' : 'blue'}
                title={t('facility.phone')}
                subtitle={facilityPhone ?? t('facility.phoneNotListed')}
                onPress={facilityPhone ? callFacility : undefined}
                accessibilityHint={facilityPhone ? t('facility.callAction') : undefined}
              />
            </Card>
          </CardStack>
        </View>

        {/* ── Credentials — the schema's stand-in for a bio ─────────────────── */}
        <View>
          <PanelHeader
            icon="shield-check"
            title={t('doctor.credentialsTitle')}
            subtitle={t('profiles.provider.credentialsDesc')}
            style={{ marginBottom: spacing.sm }}
          />
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
          <PanelHeader
            icon="chat"
            title={t('doctor.messagingTitle')}
            subtitle={t('profiles.provider.messagingDesc')}
            style={{ marginBottom: spacing.sm }}
          />

          {/* The standing warning, above every state of this section. */}
          <View style={styles.emergencyNotice} accessibilityRole="alert">
            <Icon name="alert-triangle" size={18} color={colors.statusWarning} />
            <Text style={styles.emergencyNoticeText}>
              {recipientsQuery.data?.notice ?? t('messagingRecipients.notEmergency')}
            </Text>
          </View>

          {sent ? (
            <Card accentColor={colors.statusNormal}>
              <View style={styles.sentRow} accessibilityLiveRegion="polite">
                <Icon name="check-circle" size={20} color={colors.statusNormal} />
                <View style={styles.sentBody}>
                  <Text style={styles.sentText}>
                    {sentToDesk
                      ? t('messagingRecipients.facilitySentTitle')
                      : t('doctor.messageSent')}
                  </Text>
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
          ) : messageAccess === 'checking' ? (
            <LoadingBlock label={t('messagingRecipients.doctorCheckingAccess')} />
          ) : messageAccess === 'unknown' ? (
            // The read failed. Say THAT — never "you are not in their care",
            // which is a different sentence and, on a timeout, a false one.
            <Card variant="flush">
              <EmptyState
                icon="alert-circle"
                tint="amber"
                title={t('messagingRecipients.loadError')}
                message={t('opesCore.errors.offlineBody')}
                actionLabel={t('messages.retry')}
                onAction={() => recipientsQuery.refetch()}
              />
            </Card>
          ) : messageAccess === 'open' ? (
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
                    onPress={() => submitMessage(provider.id)}
                  />
                </Card>
              ) : null}
            </View>
          ) : (
            // Two different truths, told apart rather than blurred into one
            // "book first" card — and neither of them navigates on its own.
            //
            //   unreachable → the patient IS in this clinician's care; the
            //     clinician simply has no inbox that can receive it yet, so the
            //     honest route is the desk that does read its messages.
            //   none        → no care relationship. Booking is offered as a
            //     choice, sitting next to the desk, not taken on the patient's
            //     behalf the moment they tap "Message".
            <View style={styles.stack}>
              <Card variant="flush">
                <EmptyState
                  icon="info"
                  tint="blue"
                  title={t(
                    messageAccess === 'unreachable'
                      ? 'messagingRecipients.doctorUnreachableTitle'
                      : 'messagingRecipients.doctorNoRelationshipTitle',
                  )}
                  message={t(
                    messageAccess === 'unreachable'
                      ? 'messagingRecipients.doctorUnreachableBody'
                      : 'messagingRecipients.doctorNoRelationshipBody',
                    { name: provider.name },
                  )}
                />
              </Card>

              {deskFacilityId ? (
                <>
                  <CareButton
                    label={
                      deskFacilityName
                        ? t('messagingRecipients.messageFacility', { facility: deskFacilityName })
                        : t('messagingRecipients.messageFrontDesk')
                    }
                    icon="building"
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
                          startThread.isPending
                            ? t('doctor.messageSending')
                            : t('doctor.messageSend')
                        }
                        icon="none"
                        loading={startThread.isPending}
                        disabled={!composeBody.trim()}
                        onPress={() => submitToDesk(deskFacilityId)}
                      />
                    </Card>
                  ) : null}
                </>
              ) : null}

              {messageAccess === 'none' ? (
                <CareButton
                  label={t('messagingRecipients.bookInstead')}
                  icon="calendar-plus"
                  variant="ghost"
                  onPress={() => goToBooking(provider)}
                />
              ) : null}
            </View>
          )}
        </View>
    </ProfileFrame>
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

    // Warning tint, not the info blue the rest of the page uses: this is the
    // only line in the Messaging section that is about risk, and it is shown
    // in every state of it — composer, refusal and confirmation alike.
    emergencyNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginBottom: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radii.sm + 2,
      backgroundColor: colors.statusWarningBg,
    },
    emergencyNoticeText: {
      flex: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textPrimary,
    },
  });
