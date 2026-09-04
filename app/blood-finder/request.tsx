import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  StepProgress,
  formatLabel,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Step,
  type Tint,
} from '@/components/opes-ui';
import {
  CareButton,
  InfoRow,
  LoadingBlock,
  NoticeBanner,
  SummaryLine,
} from '@/components/care/shared';
import { useNationwideBloodSearch } from '@/lib/api/bloodQueries';
import {
  useBloodOptions,
  useBloodSearch,
  useCreateBloodRequest,
  type BloodBankResult,
  type BloodComponentValue,
  type BloodGroupValue,
  type BloodRequest,
  type BloodUrgencyValue,
} from '@/lib/api/queries';

/**
 * Request Blood Units — the action panel of the Blood Finder.
 *
 * Presentation: the OPES kit (`ScreenHeader` → facility `Card variant="flush"`
 * + `ListRow` with the spec's RED tint circle → embedded `FacilityMap` →
 * `InfoRow` facts → a units stepper → urgency as selectable `ListRow`s →
 * `PillInput` contact phone → summary `Card` → `GradientButton` submit →
 * `Dialog` for failures → a confirmed state built like
 * `app/appointments/book.tsx`'s success step), in the app's own `opescare`
 * palette read from `useTheme()`.
 *
 * The data layer is untouched: `useBloodOptions`, `useBloodSearch`,
 * `useNationwideBloodSearch`, `useCreateBloodRequest`.
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
 * ── Why no wizard ───────────────────────────────────────────────────────────
 * The form is deliberately ONE page rather than a `StepProgress` wizard: units,
 * urgency and a phone number are three fields, and this screen is reached by
 * someone in a hurry. `StepProgress` appears on the confirmed state instead,
 * where it maps a real thing — the request's lifecycle through
 * App\Enums\BloodRequestStatus (pending → confirmed → ready → fulfilled).
 *
 * ── On the 409 ──────────────────────────────────────────────────────────────
 * `blood_availability` is self-reported and frequently empty, so
 * `BLOOD_NOT_AVAILABLE` is a routine outcome rather than a rare failure. It is
 * therefore rendered as a recovery panel with working actions (phone the
 * facility, go back and try a compatible group), not as a red line of text at
 * the bottom of a form.
 */

const URGENCIES: BloodUrgencyValue[] = ['routine', 'urgent', 'emergency'];

/** The kit has no `timer` or `siren`; `clock` / `refresh` / `alert-triangle` carry it. */
const URGENCY_ICON: Record<BloodUrgencyValue, IconName> = {
  routine: 'clock',
  urgent: 'refresh',
  emergency: 'alert-triangle',
};

const URGENCY_TINT: Record<BloodUrgencyValue, Tint> = {
  routine: 'blue',
  urgent: 'amber',
  emergency: 'red',
};

const URGENCY_TONE: Record<BloodUrgencyValue, StatusTone> = {
  routine: 'neutral',
  urgent: 'warning',
  emergency: 'critical',
};

/** DESIGN_SPEC §1: red is the critical tint, and every row on this screen is blood. */
const BLOOD_TINT: Tint = 'red';

const NOTE_MAX_LENGTH = 500;

/** Kit glyph per `care_facilities.facility_type` (same map as the finder list). */
const FACILITY_TYPE_ICON: Record<string, IconName> = {
  hospital: 'building',
  clinic: 'stethoscope',
  health_center: 'first-aid',
  blood_bank: 'droplet',
  laboratory: 'flask',
};

const facilityIcon = (type: string | undefined): IconName =>
  FACILITY_TYPE_ICON[type ?? ''] ?? 'building';

/** English fallbacks for the stock-status badge (see the i18n note in the report). */
const STOCK_FALLBACK: Record<string, string> = {
  available: 'Available',
  in_stock: 'Available',
  low: 'Low stock',
  limited: 'Low stock',
  none: 'None reported',
  out_of_stock: 'None reported',
  unavailable: 'Not reported',
  unknown: 'Not reported',
};

/** available → success · low → warning · none → critical. */
function stockTone(status: string | null | undefined): StatusTone {
  switch ((status ?? '').toLowerCase()) {
    case 'available':
    case 'in_stock':
      return 'normal';
    case 'low':
    case 'limited':
      return 'warning';
    case 'none':
    case 'out_of_stock':
    case 'unavailable':
      return 'critical';
    default:
      return 'neutral';
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

/**
 * App\Enums\BloodRequestStatus, in the order a request travels. `rejected`,
 * `cancelled` and `expired` are terminal and never reach this strip.
 */
const LIFECYCLE: string[] = ['pending', 'confirmed', 'ready', 'fulfilled'];

export default function BloodRequestScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

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

  const phone = facility?.emergency_contact ?? facility?.phone ?? null;
  const hasCoords = facility?.latitude != null && facility?.longitude != null;
  const availability = facility?.availability ?? null;
  // `status` is the facility's own stock word; `unknown` keeps the badge from
  // rendering an empty pill if a row ever arrives without one.
  const stockKey = (availability?.status ?? '').toLowerCase() || 'unknown';
  const stockLabel = availability
    ? t(`bloodFinder.stock.${stockKey}`, {
        defaultValue: STOCK_FALLBACK[stockKey] ?? formatLabel(availability.status),
      })
    : t('bloodFinder.unitsUnknown');

  const backToSearch = () =>
    router.canGoBack() ? router.back() : router.replace('/blood-finder');

  const onSubmit = () => {
    if (!facilityId || !bloodGroup) return;
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
        onError: (error) => {
          const code = errorCodeOf(error) ?? 'generic';
          setErrorCode(code);
          // The routine outcomes get their own on-screen recovery panels below;
          // everything else is a one-off failure and belongs in a dialog, where
          // it cannot be quietly scrolled past.
          if (
            code !== 'BLOOD_NOT_AVAILABLE' &&
            code !== 'FACILITY_NOT_FOUND' &&
            code !== 'TOO_MANY_OPEN_REQUESTS' &&
            code !== 'REQUEST_ALREADY_OPEN'
          ) {
            dialog.alert(
              t('bloodFinder.request.title'),
              t(`bloodFinder.errors.${code}`, { defaultValue: t('bloodFinder.errors.generic') }),
              'critical',
            );
          }
        },
      },
    );
  };

  /* ── Nothing to request against ───────────────────────────────────────── */

  if (!facilityId || !bloodGroup) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodFinder.request.title')} onBack={backToSearch} />
        <View style={styles.gutter}>
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('bloodFinder.request.noFacility')}
              message={t('bloodFinder.request.subtitle')}
              actionLabel={t('bloodFinder.request.backToSearch')}
              onAction={() => router.replace('/blood-finder')}
            />
          </Card>
        </View>
        {dialog.element}
      </Screen>
    );
  }

  /* ── Confirmed ────────────────────────────────────────────────────────── */

  if (confirmed) {
    const lifecycleSteps: Step[] = LIFECYCLE.map((key) => ({
      key,
      label: t(`bloodFinder.statuses.${key}`, { defaultValue: formatLabel(key) }),
    }));
    const lifecycleIndex = Math.max(0, LIFECYCLE.indexOf(confirmed.status));
    const facilityName = confirmed.facility?.name ?? facility?.name ?? '';
    const confirmedPhone = confirmed.facility?.phone ?? phone;

    return (
      <Screen className="px-0">
        <ScreenHeader
          title={t('bloodFinder.request.successTitle')}
          align="center"
          showBack={false}
        />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero} accessibilityLiveRegion="polite">
            <View style={styles.heroMark}>
              <Icon name="check" size={38} color={colors.textOnBrand} />
            </View>
            <Text style={styles.heroTitle} accessibilityRole="header">
              {t('bloodFinder.request.successTitle')}
            </Text>
            <Text style={styles.heroText}>
              {t('bloodFinder.request.successBody', {
                reference: confirmed.reference,
                facility: facilityName,
              })}
            </Text>
          </View>

          {/* The reference is the one thing to show at the counter. */}
          <Card>
            <Text style={styles.referenceLabel}>
              {t('bloodFinder.reference', { reference: '' }).trim()}
            </Text>
            <Text style={styles.referenceValue} accessibilityLabel={confirmed.reference}>
              {confirmed.reference}
            </Text>
            <View style={styles.lifecycle}>
              <StepProgress
                steps={lifecycleSteps}
                currentIndex={lifecycleIndex}
                accessibilityLabel={t(`bloodFinder.statuses.${confirmed.status}`, {
                  defaultValue: confirmed.status_label,
                })}
              />
            </View>
          </Card>

          <Card variant="flush">
            <View style={styles.detailsHead}>
              <Icon name="droplet" size={22} color={colors.statusCritical} />
              <Text style={styles.detailsTitle} accessibilityRole="header">
                {t('bloodFinder.request.reviewTitle')}
              </Text>
              <StatusBadge
                status={confirmed.status}
                label={t(`bloodFinder.statuses.${confirmed.status}`, {
                  defaultValue: confirmed.status_label,
                })}
                size="sm"
              />
            </View>
            <View style={styles.rows}>
              <InfoRow
                icon="droplet"
                tint={BLOOD_TINT}
                label={t('bloodFinder.bloodGroup')}
                value={confirmed.blood_group}
                divider
              />
              <InfoRow
                icon="flask"
                tint="blue"
                label={t('bloodFinder.component')}
                value={
                  confirmed.component_label ||
                  t(`bloodFinder.components.${confirmed.component_type}`)
                }
                divider
              />
              <InfoRow
                icon="receipt"
                tint="green"
                label={t('bloodFinder.request.reviewUnits')}
                value={String(confirmed.quantity)}
                divider
              />
              <InfoRow
                icon={URGENCY_ICON[confirmed.urgency]}
                tint={URGENCY_TINT[confirmed.urgency]}
                label={t('bloodFinder.request.reviewUrgency')}
                value={t(`bloodFinder.urgencies.${confirmed.urgency}`)}
                divider={!!facilityName}
              />
              {facilityName ? (
                <InfoRow
                  icon="building"
                  tint="blue"
                  label={t('bloodFinder.request.facility')}
                  value={facilityName}
                />
              ) : null}
            </View>
          </Card>

          <Card variant="flush">
            <Text style={styles.overline}>{t('bloodFinder.request.nextSteps')}</Text>
            {[
              t('bloodFinder.request.next1'),
              t('bloodFinder.request.next2'),
              t('bloodFinder.request.next3'),
            ].map((line, index, all) => (
              <ListRow
                key={index}
                leading={
                  <View style={styles.stepMark}>
                    <Text style={styles.stepNumber}>{index + 1}</Text>
                  </View>
                }
                title={line}
                chevron={false}
                divider={index < all.length - 1}
              />
            ))}
          </Card>

          <NoticeBanner
            icon="shield-check"
            tone="pending"
            title={t('bloodFinder.safetyTitle')}
            message={t('bloodFinder.safetyBody')}
          />

          <View style={styles.ctaStack}>
            <GradientButton
              label={t('bloodFinder.request.backToSearch')}
              onPress={() => router.replace('/blood-finder')}
            />
            {confirmedPhone ? (
              <CareButton
                label={t('bloodFinder.call')}
                icon="phone"
                variant="secondary"
                onPress={() => dial(confirmedPhone)}
              />
            ) : null}
          </View>
        </ScrollView>

        {dialog.element}
      </Screen>
    );
  }

  /* ── The form ─────────────────────────────────────────────────────────── */

  const notAvailable = errorCode === 'BLOOD_NOT_AVAILABLE' || errorCode === 'FACILITY_NOT_FOUND';
  const tooMany = errorCode === 'TOO_MANY_OPEN_REQUESTS' || errorCode === 'REQUEST_ALREADY_OPEN';

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('bloodFinder.request.title')}
        subtitle={t('bloodFinder.request.subtitle')}
        onBack={backToSearch}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {search.isPending ? (
          <LoadingBlock label={t('bloodFinder.searching')} />
        ) : search.isError ? (
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('bloodFinder.loadFailed')}
              actionLabel={t('bloodFinder.retry')}
              onAction={() => search.refetch()}
            />
          </Card>
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
            onBack={backToSearch}
          />
        ) : (
          <>
            {/* Facility + the number to call before travelling. The safety
                notice tells every patient to phone first, so the phone has to
                be reachable without scrolling past the whole form. */}
            <Card variant="flush">
              <ListRow
                icon={facilityIcon(facility.facility_type)}
                tint={BLOOD_TINT}
                title={facility.name}
                meta={[
                  [facility.address, facility.city].filter(Boolean).join(', ') || null,
                  facility.distance_km === null
                    ? t('bloodFinder.distanceUnknown')
                    : t('bloodFinder.distanceKm', { km: facility.distance_km }),
                  isVerified(facility.verification_status) ? t('bloodFinder.verified') : null,
                ]}
                chevron={false}
                trailing={
                  <StatusBadge
                    status={stockKey}
                    tone={stockTone(stockKey)}
                    label={stockLabel}
                    size="sm"
                  />
                }
                divider
              />
              <View style={styles.cardFoot}>
                <CareButton
                  label={phone ? t('bloodFinder.call') : t('bloodFinder.noPhone')}
                  icon="phone"
                  variant="secondary"
                  size="sm"
                  disabled={!phone}
                  onPress={() => dial(phone)}
                  style={styles.footAction}
                />
              </View>
            </Card>

            {/* Embedded map — a real in-app OpenStreetMap view of this facility
                with a locate-me/directions control that never leaves the app. */}
            {hasCoords ? (
              <Card variant="flush">
                <FacilityMap facilities={facility} height={200} directions />
              </Card>
            ) : null}

            {/* What is actually being asked for, and how fresh the figure is. */}
            <Card variant="flush">
              <View style={styles.rows}>
                <InfoRow
                  icon="droplet"
                  tint={BLOOD_TINT}
                  label={t('bloodFinder.bloodGroup')}
                  value={bloodGroup}
                  divider
                />
                <InfoRow
                  icon="flask"
                  tint="blue"
                  label={t('bloodFinder.component')}
                  value={componentLabel}
                  divider
                />
                <InfoRow
                  icon="activity"
                  tint={availability?.units_range ? 'green' : 'amber'}
                  label={t('bloodFinder.request.reviewUnits')}
                  value={
                    availability?.units_range
                      ? t('bloodFinder.unitsRange', { range: availability.units_range })
                      : t('bloodFinder.unitsUnknown')
                  }
                  divider
                />
                <InfoRow
                  icon="clock"
                  tint="blue"
                  label={t('bloodFinder.stockUpdated', { defaultValue: 'Stock updated' })}
                  value={t(`bloodFinder.freshness.${availability?.freshness ?? 'stale'}`, {
                    defaultValue: t('bloodFinder.freshness.stale'),
                  })}
                />
              </View>
            </Card>

            {/* Units */}
            <View>
              <SectionHeader title={t('bloodFinder.request.quantity')} />
              <Card>
                <View style={styles.stepper}>
                  <StepperButton
                    icon="minus"
                    label="-1"
                    disabled={quantity <= 1}
                    onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  />
                  <View style={styles.stepperValue}>
                    <Text style={styles.stepperNumber}>{quantity}</Text>
                    <Text style={styles.stepperHint}>
                      {t('bloodFinder.request.maxUnits', { max: maxUnits })}
                    </Text>
                  </View>
                  <StepperButton
                    icon="plus"
                    label="+1"
                    disabled={quantity >= maxUnits}
                    onPress={() => setQuantity((q) => Math.min(maxUnits, q + 1))}
                  />
                </View>
              </Card>
            </View>

            {/* Urgency — the one choice that changes how the blood bank reads
                this request, so it gets full-width rows, not chips. */}
            <View>
              <SectionHeader title={t('bloodFinder.request.urgency')} />
              <Card variant="flush">
                {URGENCIES.map((value, index) => (
                  <ListRow
                    key={value}
                    icon={URGENCY_ICON[value]}
                    tint={URGENCY_TINT[value]}
                    title={t(`bloodFinder.urgencies.${value}`)}
                    subtitle={t(`bloodFinder.request.urgencyHints.${value}`)}
                    chevron={false}
                    trailing={
                      value === urgency ? (
                        <Icon name="check-circle" size={20} color={colors.blue} />
                      ) : (
                        <View style={styles.radio} />
                      )
                    }
                    onPress={() => setUrgency(value)}
                    divider={index < URGENCIES.length - 1}
                  />
                ))}
              </Card>
            </View>

            {urgency === 'emergency' ? (
              <>
                <NoticeBanner
                  icon="alert-triangle"
                  tone="critical"
                  title={t('bloodFinder.urgencies.emergency')}
                  message={t('bloodFinder.request.emergencyWarning')}
                />
                {phone ? (
                  <CareButton
                    label={t('bloodFinder.request.callNow')}
                    icon="phone"
                    variant="dangerSolid"
                    onPress={() => dial(phone)}
                  />
                ) : null}
              </>
            ) : null}

            {/* Contact phone */}
            <View>
              <SectionHeader title={t('bloodFinder.request.contactPhone')} />
              <PillInput
                icon={<Icon name="phone" size={18} color={colors.blue} />}
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder={t('bloodFinder.request.contactPhonePlaceholder')}
                keyboardType="phone-pad"
                maxLength={32}
                accessibilityLabel={t('bloodFinder.request.contactPhone')}
              />
            </View>

            {/* Note. PillInput carries its own bottom margin and the scroll
                container already spaces siblings — cancel the double gap. */}
            <View style={styles.noteBlock}>
              <SectionHeader title={t('bloodFinder.request.note')} />
              <Card>
                <TextInput
                  style={styles.textarea}
                  value={note}
                  onChangeText={setNote}
                  placeholder={t('bloodFinder.request.notePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={NOTE_MAX_LENGTH}
                  textAlignVertical="top"
                  accessibilityLabel={t('bloodFinder.request.note')}
                />
                <Text style={styles.counter}>{`${note.length} / ${NOTE_MAX_LENGTH}`}</Text>
              </Card>
            </View>

            {/* Review — the whole request in one card, before sending. */}
            <View>
              <SectionHeader title={t('bloodFinder.request.reviewTitle')} />
              <Card>
                <SummaryLine label={t('bloodFinder.bloodGroup')} value={bloodGroup} strong />
                <SummaryLine label={t('bloodFinder.component')} value={componentLabel} />
                <SummaryLine label={t('bloodFinder.request.reviewUnits')} value={String(quantity)} />
                <SummaryLine
                  label={t('bloodFinder.request.reviewUrgency')}
                  value={t(`bloodFinder.urgencies.${urgency}`)}
                  valueColor={
                    URGENCY_TONE[urgency] === 'critical'
                      ? colors.statusCritical
                      : URGENCY_TONE[urgency] === 'warning'
                        ? colors.statusWarning
                        : undefined
                  }
                />
                <SummaryLine label={t('bloodFinder.request.facility')} value={facility.name} />
              </Card>
            </View>

            {/* Clinical + payment notes */}
            <NoticeBanner
              icon="info"
              tone="pending"
              message={t('bloodFinder.request.clinicalNote')}
            />
            <NoticeBanner
              icon="wallet"
              tone="normal"
              message={t('bloodFinder.request.paymentNote')}
            />

            {/* Outcome */}
            {notAvailable ? (
              <NotAvailablePanel
                group={bloodGroup}
                component={componentLabel}
                phone={phone}
                onBack={backToSearch}
              />
            ) : tooMany ? (
              <Card variant="flush">
                <EmptyState
                  icon="alert-circle"
                  tint="amber"
                  title={t(`bloodFinder.errors.${errorCode}`, {
                    defaultValue: t('bloodFinder.errors.generic'),
                  })}
                  message={t('bloodFinder.request.openRequestsHint')}
                  actionLabel={t('bloodFinder.request.backToSearch')}
                  onAction={backToSearch}
                />
              </Card>
            ) : null}

            {/* Submit */}
            <GradientButton
              label={t('bloodFinder.request.submit')}
              icon="none"
              loading={createRequest.isPending}
              onPress={onSubmit}
              accessibilityHint={t('bloodFinder.request.subtitle')}
            />
          </>
        )}
      </ScrollView>

      {dialog.element}
    </Screen>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/** Square 44pt tap target for the units stepper. */
function StepperButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.stepperButton, disabled && styles.stepperButtonOff]}
    >
      <Icon name={icon} size={20} color={colors.link} />
    </TouchableOpacity>
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
  onBack,
}: {
  group: string;
  component: string;
  phone: string | null;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.stack}>
      <Card variant="flush">
        <EmptyState
          icon="alert-circle"
          tint="red"
          title={t('bloodFinder.request.notAvailableTitle')}
          message={`${t('bloodFinder.request.notAvailableBody', { group, component })}\n\n${t(
            'bloodFinder.empty.body',
          )}`}
          actionLabel={t('bloodFinder.request.backToSearch')}
          onAction={onBack}
        />
      </Card>
      {phone ? (
        <CareButton
          label={t('bloodFinder.request.callNow')}
          icon="phone"
          variant="dangerSolid"
          onPress={() => dial(phone)}
        />
      ) : null}
      <Text style={styles.footnote}>{t('bloodFinder.noResultsHint')}</Text>
    </View>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    gutter: { padding: spacing.md },
    stack: { gap: spacing.md },
    rows: { paddingVertical: spacing.xs },

    hero: { alignItems: 'center', gap: spacing.sm + 2, paddingVertical: spacing.md },
    heroMark: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: c.statusNormal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      color: c.textPrimary,
      textAlign: 'center',
    },
    heroText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
      textAlign: 'center',
    },

    referenceLabel: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.textMuted,
    },
    referenceValue: {
      marginTop: 2,
      textAlign: 'center',
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      letterSpacing: 2,
      color: c.textPrimary,
    },
    lifecycle: { marginTop: spacing.md },

    detailsHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    detailsTitle: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },

    overline: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.textPrimary,
    },
    stepMark: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumber: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      color: c.link,
    },

    cardFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
    },
    footAction: { flexGrow: 1, flexBasis: 120 },

    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    stepperButton: {
      width: 44,
      height: 44,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperButtonOff: { opacity: 0.4 },
    stepperValue: { alignItems: 'center', gap: 2 },
    stepperNumber: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xxl,
      color: c.textPrimary,
    },
    stepperHint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    radio: {
      width: 20,
      height: 20,
      borderRadius: radii.pill,
      borderWidth: 1.5,
      borderColor: c.border,
    },

    noteBlock: { marginTop: -spacing.md },
    textarea: {
      minHeight: 92,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: spacing.sm + 4,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
    },
    counter: {
      alignSelf: 'flex-end',
      marginTop: 4,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    footnote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
    },

    ctaStack: { gap: spacing.sm + 4 },
  });
