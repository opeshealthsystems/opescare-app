import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  Building2,
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  Clock,
  Droplets,
  Hospital,
  Info,
  MapPin,
  Minus,
  Navigation,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Siren,
  Timer,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { colors } from '../../theme/tokens';
import { useNationwideBloodSearch } from '../../lib/api/bloodQueries';
import {
  useBloodOptions,
  useBloodSearch,
  useCreateBloodRequest,
  type BloodBankResult,
  type BloodComponentValue,
  type BloodGroupValue,
  type BloodRequest,
  type BloodUrgencyValue,
} from '../../lib/api/queries';

/**
 * Request Blood Units — the action panel of the Blood Finder.
 *
 * The chosen facility is re-resolved from the same search the list ran (origin
 * and radius are carried in the params) rather than passed through as loose
 * strings, so what the patient confirms against is live availability, not a
 * snapshot that may already be stale by the time they got here. A facility
 * reached from the finder's nationwide sweep carries `nationwide=1` and is
 * re-resolved against the origin-less query instead, for the same reason.
 *
 * Requesting reserves a place at the counter. No payment is taken, no unit is
 * issued, and nothing here is a cross-match or a clinical approval — the
 * facility performs its own checks before releasing anything.
 *
 * ── On the 409 ──────────────────────────────────────────────────────────────
 * `blood_availability` is self-reported and frequently empty, so
 * `BLOOD_NOT_AVAILABLE` is a routine outcome rather than a rare failure. It is
 * therefore rendered as a recovery panel with working actions (phone the
 * facility, get directions, go back and try a compatible group), not as a red
 * line of text at the bottom of a form.
 */

const URGENCIES: BloodUrgencyValue[] = ['routine', 'urgent', 'emergency'];

const URGENCY_ICONS: Record<BloodUrgencyValue, LucideIcon> = {
  routine: Clock,
  urgent: Timer,
  emergency: Siren,
};

interface UrgencyTone {
  accent: string;
  surface: string;
  /** Selected urgency cards fill; emergency fills solid so it cannot be missed. */
  solid: boolean;
}

function urgencyTone(value: BloodUrgencyValue): UrgencyTone {
  switch (value) {
    case 'emergency':
      return { accent: colors.semantic.danger, surface: colors.semantic.dangerSurface, solid: true };
    case 'urgent':
      return {
        accent: colors.semantic.warning,
        surface: colors.semantic.warningSurface,
        solid: false,
      };
    default:
      return { accent: colors.brand[500], surface: colors.brand[50], solid: false };
  }
}

function iconForFacility(type: string | undefined): LucideIcon {
  switch (type) {
    case 'blood_bank':
      return Droplets;
    case 'hospital':
      return Hospital;
    default:
      return Building2;
  }
}

function freshnessTone(freshness: string | undefined): string {
  switch (freshness) {
    case 'fresh':
      return colors.semantic.success;
    case 'recent':
      return colors.semantic.warning;
    case 'stale':
      return colors.semantic.danger;
    default:
      return colors.navy.muted;
  }
}

/** Only license/government verification is a check by someone other than the facility. */
function isVerified(status: string | null | undefined): boolean {
  return status === 'license_verified' || status === 'government_verified';
}

function dial(number: string | null | undefined): void {
  if (!number) return;
  Linking.openURL(`tel:${number.replace(/[^+\d]/g, '')}`).catch(() => undefined);
}

/** Pulls the backend's `error_code` out of an axios failure, if there is one. */
function errorCodeOf(error: unknown): string | null {
  const body = (error as { response?: { data?: { error_code?: string } } })?.response?.data;
  return body?.error_code ?? null;
}

export default function BloodRequestScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    facilityId?: string;
    bloodGroup?: string;
    componentType?: string;
    lat?: string;
    lng?: string;
    radiusKm?: string;
    nationwide?: string;
  }>();

  const facilityId = params.facilityId ?? null;
  const bloodGroup = (params.bloodGroup ?? null) as BloodGroupValue | null;
  const componentType = (params.componentType ?? 'whole_blood') as BloodComponentValue;
  const lat = Number(params.lat ?? 4.0511);
  const lng = Number(params.lng ?? 9.7679);
  const radiusKm = Number(params.radiusKm ?? 25);
  const fromNationwide = params.nationwide === '1';

  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState<BloodUrgencyValue>('routine');
  const [contactPhone, setContactPhone] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState<BloodRequest | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const options = useBloodOptions();
  const localSearch = useBloodSearch({
    bloodGroup,
    componentType,
    lat,
    lng,
    radiusKm,
    enabled: !!bloodGroup && !fromNationwide,
  });
  const nationwideSearch = useNationwideBloodSearch({
    bloodGroup,
    componentType,
    enabled: !!bloodGroup && fromNationwide,
  });
  const search = fromNationwide ? nationwideSearch : localSearch;
  const createRequest = useCreateBloodRequest();

  const maxUnits = options.data?.max_units ?? 6;
  const componentLabel = t(`bloodFinder.components.${componentType}`);

  const facility: BloodBankResult | null = useMemo(
    () => (search.data ?? []).find((row) => row.id === facilityId) ?? null,
    [search.data, facilityId],
  );

  const FacilityIcon = iconForFacility(facility?.facility_type);
  const phone = facility?.emergency_contact ?? facility?.phone ?? null;
  const hasCoords = facility?.latitude != null && facility?.longitude != null;

  const backToSearch = () =>
    router.canGoBack() ? router.back() : router.replace('/blood-finder');

  const openDirections = () => {
    if (!facility || facility.latitude == null || facility.longitude == null) return;
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${facility.latitude},${facility.longitude}`,
    ).catch(() => undefined);
  };

  if (!facilityId || !bloodGroup) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-cream-200">
            <CircleAlert size={24} color={colors.navy.muted} />
          </View>
          <Text className="mt-3 text-center text-sm text-navy-secondary">
            {t('bloodFinder.request.noFacility')}
          </Text>
          <Pressable
            onPress={() => router.replace('/blood-finder')}
            accessibilityRole="button"
            className="mt-4 rounded-xl border border-brand-500 px-4 py-2"
          >
            <Text className="text-xs font-bold text-brand-600">
              {t('bloodFinder.request.backToSearch')}
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const onSubmit = () => {
    setErrorCode(null);
    createRequest.mutate(
      {
        care_facility_id: facilityId,
        blood_group: bloodGroup,
        component_type: componentType,
        quantity,
        urgency,
        contact_phone: contactPhone.trim() || null,
        note: note.trim() || null,
      },
      {
        onSuccess: (request) => setConfirmed(request),
        onError: (error) => setErrorCode(errorCodeOf(error) ?? 'generic'),
      },
    );
  };

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="mt-2 flex-row items-center">
          <Pressable
            onPress={backToSearch}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('bloodFinder.back')}
            className="h-10 w-10 items-center justify-center rounded-xl border border-cream-300 bg-white"
          >
            <ChevronLeft size={20} color={colors.navy.text} />
          </Pressable>
          <Text className="ml-3 flex-1 text-lg font-extrabold text-navy-text">
            {t('bloodFinder.request.title')}
          </Text>
        </View>

        <Text className="mt-3 text-xs leading-4 text-navy-secondary">
          {t('bloodFinder.request.subtitle')}
        </Text>

        {/* Facility + live availability */}
        {search.isPending ? (
          <View className="mt-6" style={{ gap: 12 }}>
            <View className="h-24 rounded-2xl bg-cream-200" />
            <View className="h-16 rounded-2xl bg-cream-200" />
          </View>
        ) : search.isError ? (
          <View className="mt-6 items-center rounded-2xl border border-cream-300 bg-white px-6 py-8">
            <CircleAlert size={22} color={colors.semantic.danger} />
            <Text className="mt-2 text-center text-sm text-navy-secondary">
              {t('bloodFinder.loadFailed')}
            </Text>
            <Pressable
              onPress={() => search.refetch()}
              accessibilityRole="button"
              className="mt-3 rounded-xl border border-brand-500 px-4 py-2"
            >
              <Text className="text-xs font-bold text-brand-600">{t('bloodFinder.retry')}</Text>
            </Pressable>
          </View>
        ) : !facility ? (
          /*
            The listing vanished between the search and this screen — the same
            situation the 409 describes, so it gets the same recovery treatment
            rather than a bare "not available" line.
          */
          <NotAvailablePanel
            group={bloodGroup}
            component={componentLabel}
            phone={null}
            hasCoords={false}
            onCall={() => undefined}
            onDirections={() => undefined}
            onBack={backToSearch}
          />
        ) : (
          <>
            <View className="mt-5 flex-row rounded-2xl border border-brand-100 bg-cream-200 p-4">
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-white">
                <FacilityIcon size={24} color={colors.brand[600]} />
              </View>
              <View className="ml-4 flex-1">
                <View className="flex-row items-start">
                  <Text
                    className="flex-1 pr-2 text-base font-extrabold text-navy-text"
                    numberOfLines={2}
                  >
                    {facility.name}
                  </Text>
                  {isVerified(facility.verification_status) ? (
                    <BadgeCheck size={16} color={colors.semantic.info} />
                  ) : null}
                </View>
                <Text className="mt-1 text-xs text-navy-secondary" numberOfLines={2}>
                  {[facility.address, facility.city].filter(Boolean).join(', ')}
                </Text>
                <View className="mt-1 flex-row items-center">
                  <MapPin size={11} color={colors.navy.muted} />
                  <Text className="ml-1 text-[11px] text-navy-secondary">
                    {facility.distance_km === null
                      ? t('bloodFinder.distanceUnknown')
                      : t('bloodFinder.distanceKm', { km: facility.distance_km })}
                  </Text>
                </View>
              </View>
            </View>

            {/* Call / directions sit above the form: the safety notice tells
                every patient to phone before travelling, so the phone must be
                reachable without scrolling past the whole request form. */}
            <View className="mt-3 flex-row" style={{ gap: 8 }}>
              <Pressable
                onPress={() => dial(phone)}
                disabled={!phone}
                accessibilityRole="button"
                className="h-11 flex-1 flex-row items-center justify-center rounded-xl border border-brand-500 bg-white"
                style={{ opacity: phone ? 1 : 0.45 }}
              >
                <Phone size={14} color={colors.brand[600]} />
                <Text className="ml-2 text-xs font-bold text-brand-600">
                  {phone ? t('bloodFinder.callShort') : t('bloodFinder.noPhone')}
                </Text>
              </Pressable>
              <Pressable
                onPress={openDirections}
                disabled={!hasCoords}
                accessibilityRole="button"
                className="h-11 flex-1 flex-row items-center justify-center rounded-xl border border-cream-300 bg-white"
                style={{ opacity: hasCoords ? 1 : 0.45 }}
              >
                <Navigation size={14} color={colors.navy.secondary} />
                <Text className="ml-2 text-xs font-bold text-navy-text">
                  {t('bloodFinder.getDirections')}
                </Text>
              </Pressable>
            </View>

            {/* What is actually being asked for */}
            <View className="mt-3 flex-row items-center justify-between rounded-2xl border border-cream-300 bg-white p-4">
              <View className="flex-1 pr-2">
                <Text className="text-[11px] font-semibold text-navy-muted">
                  {`${bloodGroup}  •  ${componentLabel}`}
                </Text>
                <Text className="mt-0.5 text-sm font-extrabold text-navy-text">
                  {facility.availability?.units_range
                    ? t('bloodFinder.unitsRange', { range: facility.availability.units_range })
                    : t('bloodFinder.unitsUnknown')}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Clock size={12} color={freshnessTone(facility.availability?.freshness)} />
                <Text
                  className="ml-1 text-[11px] font-bold"
                  style={{ color: freshnessTone(facility.availability?.freshness) }}
                >
                  {t(`bloodFinder.freshness.${facility.availability?.freshness ?? 'stale'}`, {
                    defaultValue: t('bloodFinder.freshness.stale'),
                  })}
                </Text>
              </View>
            </View>

            {/* Units */}
            <Text className="mt-7 text-base font-extrabold text-navy-text">
              {t('bloodFinder.request.quantity')}
            </Text>
            <View className="mt-3 flex-row items-center justify-between rounded-2xl border border-cream-300 bg-white px-4 py-3">
              <Pressable
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                accessibilityRole="button"
                accessibilityLabel="-1"
                className="h-11 w-11 items-center justify-center rounded-xl border border-cream-300 bg-cream-100"
                style={{ opacity: quantity <= 1 ? 0.4 : 1 }}
              >
                <Minus size={18} color={colors.navy.text} />
              </Pressable>
              <View className="items-center">
                <Text className="text-2xl font-extrabold text-navy-text">{quantity}</Text>
                <Text className="mt-0.5 text-[10px] text-navy-muted">
                  {t('bloodFinder.request.maxUnits', { max: maxUnits })}
                </Text>
              </View>
              <Pressable
                onPress={() => setQuantity((q) => Math.min(maxUnits, q + 1))}
                disabled={quantity >= maxUnits}
                accessibilityRole="button"
                accessibilityLabel="+1"
                className="h-11 w-11 items-center justify-center rounded-xl border border-cream-300 bg-cream-100"
                style={{ opacity: quantity >= maxUnits ? 0.4 : 1 }}
              >
                <Plus size={18} color={colors.navy.text} />
              </Pressable>
            </View>

            {/* Urgency — the one choice that changes how the blood bank reads
                this request, so it gets full-width cards, not chips. */}
            <Text className="mt-7 text-base font-extrabold text-navy-text">
              {t('bloodFinder.request.urgency')}
            </Text>
            <View className="mt-3" style={{ gap: 8 }}>
              {URGENCIES.map((value) => (
                <UrgencyCard
                  key={value}
                  value={value}
                  selected={value === urgency}
                  onPress={() => setUrgency(value)}
                />
              ))}
            </View>

            {urgency === 'emergency' ? (
              <View
                className="mt-3 flex-row rounded-2xl p-4"
                style={{
                  backgroundColor: colors.semantic.dangerSurface,
                  borderWidth: 1,
                  borderColor: colors.semantic.danger,
                }}
              >
                <Siren size={17} color={colors.semantic.danger} />
                <View className="ml-3 flex-1">
                  <Text className="text-[11px] leading-4" style={{ color: colors.semantic.danger }}>
                    {t('bloodFinder.request.emergencyWarning')}
                  </Text>
                  {phone ? (
                    <Pressable
                      onPress={() => dial(phone)}
                      accessibilityRole="button"
                      className="mt-3 h-10 flex-row items-center justify-center rounded-xl"
                      style={{ backgroundColor: colors.semantic.danger }}
                    >
                      <Phone size={14} color={colors.white} />
                      <Text
                        className="ml-2 text-xs font-bold"
                        style={{ color: colors.white }}
                      >
                        {t('bloodFinder.request.callNow')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Contact phone */}
            <Text className="mt-7 text-base font-extrabold text-navy-text">
              {t('bloodFinder.request.contactPhone')}
            </Text>
            <View className="mt-3 h-14 flex-row items-center rounded-2xl border border-cream-300 bg-white px-4">
              <Phone size={16} color={colors.brand[600]} />
              <TextInput
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder={t('bloodFinder.request.contactPhonePlaceholder')}
                placeholderTextColor={colors.navy.muted}
                keyboardType="phone-pad"
                maxLength={32}
                className="ml-3 flex-1 text-base text-navy-text"
              />
            </View>

            {/* Note */}
            <Text className="mt-7 text-base font-extrabold text-navy-text">
              {t('bloodFinder.request.note')}
            </Text>
            <View className="mt-3 rounded-2xl border border-cream-300 bg-white px-4 py-3">
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('bloodFinder.request.notePlaceholder')}
                placeholderTextColor={colors.navy.muted}
                multiline
                maxLength={500}
                className="min-h-[72px] text-sm text-navy-text"
                style={{ textAlignVertical: 'top' }}
              />
            </View>

            {/* Review strip — the whole request in one line, before sending. */}
            <View className="mt-5 rounded-2xl border border-cream-300 bg-white p-4">
              <Text className="text-xs font-extrabold text-navy-text">
                {t('bloodFinder.request.reviewTitle')}
              </Text>
              <View className="mt-3" style={{ gap: 8 }}>
                <ReviewRow label={t('bloodFinder.bloodGroup')} value={bloodGroup} />
                <ReviewRow label={t('bloodFinder.component')} value={componentLabel} />
                <ReviewRow label={t('bloodFinder.request.reviewUnits')} value={String(quantity)} />
                <ReviewRow
                  label={t('bloodFinder.request.reviewUrgency')}
                  value={t(`bloodFinder.urgencies.${urgency}`)}
                  tone={urgency === 'routine' ? undefined : urgencyTone(urgency).accent}
                />
              </View>
            </View>

            {/* Clinical + payment notes */}
            <View className="mt-3 flex-row rounded-2xl border border-cream-300 bg-white p-4">
              <Info size={16} color={colors.semantic.info} />
              <View className="ml-3 flex-1">
                <Text className="text-[11px] leading-4 text-navy-secondary">
                  {t('bloodFinder.request.clinicalNote')}
                </Text>
                <Text className="mt-2 text-[11px] leading-4 text-navy-muted">
                  {t('bloodFinder.request.paymentNote')}
                </Text>
              </View>
            </View>

            {/* Outcome */}
            {confirmed ? (
              <SuccessPanel
                request={confirmed}
                facilityName={confirmed.facility?.name ?? facility.name}
                phone={phone}
                hasCoords={hasCoords}
                onCall={() => dial(phone)}
                onDirections={openDirections}
                onBack={() => router.replace('/blood-finder')}
              />
            ) : errorCode === 'BLOOD_NOT_AVAILABLE' || errorCode === 'FACILITY_NOT_FOUND' ? (
              <NotAvailablePanel
                group={bloodGroup}
                component={componentLabel}
                phone={phone}
                hasCoords={hasCoords}
                onCall={() => dial(phone)}
                onDirections={openDirections}
                onBack={backToSearch}
              />
            ) : errorCode ? (
              <View
                className="mt-4 rounded-2xl p-4"
                style={{ backgroundColor: colors.semantic.dangerSurface }}
              >
                <Text className="text-xs leading-4" style={{ color: colors.semantic.danger }}>
                  {t(`bloodFinder.errors.${errorCode}`, {
                    defaultValue: t('bloodFinder.errors.generic'),
                  })}
                </Text>
                {errorCode === 'TOO_MANY_OPEN_REQUESTS' || errorCode === 'REQUEST_ALREADY_OPEN' ? (
                  <>
                    <Text className="mt-2 text-[11px] leading-4 text-navy-secondary">
                      {t('bloodFinder.request.openRequestsHint')}
                    </Text>
                    <Pressable
                      onPress={backToSearch}
                      accessibilityRole="button"
                      className="mt-3 h-10 items-center justify-center rounded-xl bg-white"
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: colors.semantic.danger }}
                      >
                        {t('bloodFinder.request.backToSearch')}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null}

            {/* Submit */}
            {confirmed ? null : (
              <View className="mt-5">
                <Button
                  label={t('bloodFinder.request.submit')}
                  onPress={onSubmit}
                  leftIcon={Send}
                  showChevron={false}
                  loading={createRequest.isPending}
                />
              </View>
            )}
          </>
        )}

        <View className="h-10" />
      </ScrollView>
    </Screen>
  );
}

/* -- Pieces ---------------------------------------------------------------- */

function UrgencyCard({
  value,
  selected,
  onPress,
}: {
  value: BloodUrgencyValue;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const Icon = URGENCY_ICONS[value];
  const tone = urgencyTone(value);
  const filled = selected && tone.solid;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-row items-center rounded-2xl p-4"
      style={{
        backgroundColor: filled ? tone.accent : selected ? tone.surface : colors.white,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? tone.accent : colors.cream[300],
      }}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: filled ? colors.white : tone.surface }}
      >
        <Icon size={18} color={tone.accent} />
      </View>
      <View className="ml-3 flex-1">
        <Text
          className="text-sm font-extrabold"
          style={{ color: filled ? colors.white : selected ? tone.accent : colors.navy.text }}
        >
          {t(`bloodFinder.urgencies.${value}`)}
        </Text>
        <Text
          className="mt-0.5 text-[11px] leading-4"
          style={{ color: filled ? colors.cream[100] : colors.navy.secondary }}
        >
          {t(`bloodFinder.request.urgencyHints.${value}`)}
        </Text>
      </View>
      {selected ? (
        <CircleCheck size={20} color={filled ? colors.white : tone.accent} />
      ) : (
        <View
          className="h-5 w-5 rounded-full border"
          style={{ borderColor: colors.cream[300] }}
        />
      )}
    </Pressable>
  );
}

function ReviewRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-[11px] text-navy-secondary">{label}</Text>
      <Text
        className="text-xs font-extrabold text-navy-text"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * The 409. `blood_availability` is self-reported, so a listing going away
 * between the search and the send is ordinary — this panel treats it as a fork
 * in the road rather than a failure, and every button on it does something.
 */
function NotAvailablePanel({
  group,
  component,
  phone,
  hasCoords,
  onCall,
  onDirections,
  onBack,
}: {
  group: string;
  component: string;
  phone: string | null;
  hasCoords: boolean;
  onCall: () => void;
  onDirections: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View
      className="mt-5 rounded-2xl p-5"
      style={{
        backgroundColor: colors.semantic.dangerSurface,
        borderWidth: 1,
        borderColor: colors.semantic.danger,
      }}
    >
      <View className="flex-row items-center">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-white">
          <CircleAlert size={19} color={colors.semantic.danger} />
        </View>
        <Text
          className="ml-3 flex-1 text-sm font-extrabold"
          style={{ color: colors.semantic.danger }}
        >
          {t('bloodFinder.request.notAvailableTitle')}
        </Text>
      </View>

      <Text className="mt-3 text-[11px] leading-4 text-navy-secondary">
        {t('bloodFinder.request.notAvailableBody', { group, component })}
      </Text>
      <Text className="mt-2 text-[11px] leading-4 text-navy-secondary">
        {t('bloodFinder.empty.body')}
      </Text>

      <View className="mt-4" style={{ gap: 8 }}>
        {phone ? (
          <Pressable
            onPress={onCall}
            accessibilityRole="button"
            className="h-11 flex-row items-center justify-center rounded-xl"
            style={{ backgroundColor: colors.semantic.danger }}
          >
            <Phone size={15} color={colors.white} />
            <Text className="ml-2 text-xs font-bold" style={{ color: colors.white }}>
              {t('bloodFinder.request.callNow')}
            </Text>
          </Pressable>
        ) : null}

        {hasCoords ? (
          <Pressable
            onPress={onDirections}
            accessibilityRole="button"
            className="h-11 flex-row items-center justify-center rounded-xl bg-white"
          >
            <Navigation size={15} color={colors.navy.text} />
            <Text className="ml-2 text-xs font-bold text-navy-text">
              {t('bloodFinder.getDirections')}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          className="h-11 flex-row items-center justify-center rounded-xl border bg-white"
          style={{ borderColor: colors.semantic.danger }}
        >
          <Droplets size={15} color={colors.semantic.danger} />
          <Text className="ml-2 text-xs font-bold" style={{ color: colors.semantic.danger }}>
            {t('bloodFinder.request.backToSearch')}
          </Text>
        </Pressable>
      </View>

      <Text className="mt-3 text-[11px] leading-4 text-navy-muted">
        {t('bloodFinder.noResultsHint')}
      </Text>
    </View>
  );
}

function SuccessPanel({
  request,
  facilityName,
  phone,
  hasCoords,
  onCall,
  onDirections,
  onBack,
}: {
  request: BloodRequest;
  facilityName: string;
  phone: string | null;
  hasCoords: boolean;
  onCall: () => void;
  onDirections: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="mt-5 overflow-hidden rounded-2xl border border-cream-300 bg-white">
      <LinearGradient
        colors={[colors.brand[600], colors.brand[500], colors.brand[300]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 20, paddingVertical: 20, alignItems: 'center' }}
      >
        <View
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.white }}
        >
          <CircleCheck size={24} color={colors.semantic.success} />
        </View>
        <Text className="mt-3 text-base font-extrabold" style={{ color: colors.white }}>
          {t('bloodFinder.request.successTitle')}
        </Text>
        <Text
          className="mt-1 text-center text-[11px] leading-4"
          style={{ color: colors.cream[100] }}
        >
          {t('bloodFinder.request.successBody', {
            reference: request.reference,
            facility: facilityName,
          })}
        </Text>
      </LinearGradient>

      <View className="items-center border-b border-cream-200 bg-cream-200 px-5 py-4">
        <Text className="text-[10px] font-semibold uppercase text-navy-muted">
          {t('bloodFinder.reference', { reference: '' }).trim()}
        </Text>
        <Text className="mt-1 text-xl font-extrabold tracking-widest text-navy-text">
          {request.reference}
        </Text>
      </View>

      <View className="px-5 py-4">
        <Text className="text-xs font-extrabold text-navy-text">
          {t('bloodFinder.request.nextSteps')}
        </Text>
        <View className="mt-3" style={{ gap: 10 }}>
          {[
            t('bloodFinder.request.next1'),
            t('bloodFinder.request.next2'),
            t('bloodFinder.request.next3'),
          ].map((line, index) => (
            <View key={index} className="flex-row">
              <View className="mt-0.5 h-5 w-5 items-center justify-center rounded-full bg-brand-50">
                <Text className="text-[10px] font-extrabold text-brand-700">{index + 1}</Text>
              </View>
              <Text className="ml-3 flex-1 text-[11px] leading-4 text-navy-secondary">{line}</Text>
            </View>
          ))}
        </View>

        <View className="mt-4" style={{ gap: 8 }}>
          {phone ? (
            <Pressable
              onPress={onCall}
              accessibilityRole="button"
              className="h-11 flex-row items-center justify-center rounded-xl border border-brand-500"
            >
              <Phone size={14} color={colors.brand[600]} />
              <Text className="ml-2 text-xs font-bold text-brand-600">
                {t('bloodFinder.call')}
              </Text>
            </Pressable>
          ) : null}
          {hasCoords ? (
            <Pressable
              onPress={onDirections}
              accessibilityRole="button"
              className="h-11 flex-row items-center justify-center rounded-xl border border-cream-300"
            >
              <Navigation size={14} color={colors.navy.secondary} />
              <Text className="ml-2 text-xs font-bold text-navy-text">
                {t('bloodFinder.getDirections')}
              </Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onBack} accessibilityRole="button">
            <LinearGradient
              colors={[colors.brand[600], colors.brand[500], colors.brand[300]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                height: 44,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Droplets size={14} color={colors.white} />
              <Text className="ml-2 text-xs font-bold" style={{ color: colors.white }}>
                {t('bloodFinder.request.backToSearch')}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>

        <View className="mt-4 flex-row items-center">
          <ShieldCheck size={13} color={colors.brand[600]} />
          <Text className="ml-2 flex-1 text-[10px] leading-4 text-navy-muted">
            {t('bloodFinder.safetyBody')}
          </Text>
        </View>
      </View>
    </View>
  );
}
