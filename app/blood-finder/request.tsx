import { useEffect, useMemo, useState } from 'react';
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
import { Screen } from '@/components/ui/Screen';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  StepProgress,
  formatDate,
  formatDateTime,
  formatLabel,
  radii,
  spacing,
  typography,
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
import { useAuthStore } from '@/lib/store/auth';
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
  type CreateBloodRequestInput,
} from '@/lib/api/queries';

/**
 * Request Blood Units — the action panel of the Blood Finder.
 *
 * Presentation: the OPES kit (`ScreenHeader` → `StepProgress` → facility
 * `Card variant="flush"` + `ListRow` with the spec's RED tint circle → embedded
 * `FacilityMap` → `InfoRow` facts → a units stepper → urgency as selectable
 * `ListRow`s → "needed by" `Chip`s → `PillInput` contact phone → a review step
 * → `GradientButton` submit → a confirmed state built like
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
 * ── Details → Review → Sent ─────────────────────────────────────────────────
 * The form is two phases, not one screen with a button at the bottom. A blood
 * request is a message to a blood bank with a 24-hour hold on it
 * (BloodRequestService::HOLD_HOURS) and a five-request ceiling per patient
 * (MAX_OPEN_REQUESTS), so sending the wrong one costs something real. The
 * review phase repeats every value that will be transmitted — including the
 * fields left empty — and re-states the facility's own stock figure and how old
 * it is, so "confirm" is a decision rather than a reflex. The facility's phone
 * number sits at the TOP of both phases: the safety notice tells every patient
 * to call before travelling, and that number must never be below a form.
 *
 * ── Every field the endpoint accepts ────────────────────────────────────────
 * MobileBloodController::store() validates care_facility_id, blood_group,
 * component_type, quantity, urgency, contact_phone, note and `needed_by`. All
 * eight are collected here. `needed_by` is not on the shared
 * `CreateBloodRequestInput` type (it predates the field), so the payload is
 * built as that type widened by the one extra key rather than by editing the
 * shared data layer.
 *
 * ── On failure ──────────────────────────────────────────────────────────────
 * The four service-level refusals are ordinary outcomes, not rare faults, and
 * they mean four different things — the stock went, the listing went, you are
 * at your limit, you already asked. Each gets its own panel with its own next
 * action, rendered on the page (never in a dialog that can be dismissed and
 * forgotten). Losing the network is a fifth, distinct case: nothing was sent,
 * so retrying is the right move — which is exactly what a "not available"
 * panel must NOT offer.
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

/** `note` is validated `max:500` server-side; the counter mirrors that exactly. */
const NOTE_MAX_LENGTH = 500;

/** `contact_phone` is validated `max:32` server-side. */
const PHONE_MAX_LENGTH = 32;

/** Shortest string that could be a real Cameroonian number once punctuation goes. */
const PHONE_MIN_DIGITS = 7;

/** `needed_by` is `after_or_equal:today`, so every offer below starts at today. */
const NEEDED_BY_OFFSETS = [0, 1, 3, 7];

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

/**
 * English fallbacks for the stock-status word, phrased as the report it is
 * rather than as a fact. (See the i18n note in the report — `bloodFinder.stock.*`
 * does not exist yet.)
 */
const STOCK_FALLBACK: Record<string, string> = {
  available: 'Reported available',
  in_stock: 'Reported available',
  low: 'Reported low',
  limited: 'Reported low',
  none: 'Reported none left',
  out_of_stock: 'Reported none left',
  unavailable: 'No longer reported',
  unknown: 'Stock not reported',
};

/**
 * `blood_availability.freshness_status`: fresh ≤ 2 h, recent ≤ 6 h, stale
 * beyond that or never stamped (BloodAvailabilityProjector::freshness).
 */
const FRESHNESS_TONE: Record<string, StatusTone> = {
  fresh: 'normal',
  recent: 'pending',
  stale: 'warning',
};

/** All four `care_facilities.verification_status` values, spelled out. */
const VERIFICATION_FALLBACK: Record<string, string> = {
  government_verified: 'Government verified',
  license_verified: 'Licence verified',
  self_reported: 'Listed by the facility itself',
  unverified: 'Not verified',
};

function isVerified(status: string | null | undefined): boolean {
  return status === 'license_verified' || status === 'government_verified';
}

const normaliseNumber = (value: string): string => value.replace(/[^+\d]/g, '');

function dial(number: string | null | undefined): void {
  if (!number) return;
  Linking.openURL(`tel:${normaliseNumber(number)}`).catch(() => undefined);
}

/** `YYYY-MM-DD` in the device's own calendar day — what Laravel's `date` rule wants. */
function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayFromNow(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

/**
 * App\Enums\BloodRequestStatus, in the order a request travels. `rejected`,
 * `cancelled` and `expired` are terminal and never reach this strip.
 */
const LIFECYCLE: string[] = ['pending', 'confirmed', 'ready', 'fulfilled'];

/* ── Failures ─────────────────────────────────────────────────────────────── */

type FailureKind =
  | 'not_available'
  | 'facility_missing'
  | 'too_many'
  | 'duplicate'
  | 'validation'
  | 'network'
  | 'generic';

interface SubmitFailure {
  kind: FailureKind;
  /** The backend's `error_code`, when it sent one. */
  code: string | null;
  /** Field-level validation text, when the failure was a 422 with `errors`. */
  detail: string | null;
}

interface ApiErrorShape {
  response?: {
    status?: number;
    data?: {
      error_code?: string;
      message?: string;
      errors?: Record<string, string[]>;
    };
  };
}

/**
 * Sorts one failure into the five things that can actually have happened, so
 * the screen can say which — "we couldn't send it" and "they haven't got it"
 * are not the same sentence, and only one of them is worth retrying.
 */
function classifyFailure(error: unknown): SubmitFailure {
  const response = (error as ApiErrorShape)?.response;

  // No response at all: DNS, timeout, aeroplane mode. Nothing was created.
  if (!response) return { kind: 'network', code: null, detail: null };

  const data = response.data ?? {};
  const code = data.error_code ?? null;

  switch (code) {
    case 'BLOOD_NOT_AVAILABLE':
      return { kind: 'not_available', code, detail: null };
    case 'FACILITY_NOT_FOUND':
      return { kind: 'facility_missing', code, detail: null };
    case 'TOO_MANY_OPEN_REQUESTS':
      return { kind: 'too_many', code, detail: null };
    case 'REQUEST_ALREADY_OPEN':
      return { kind: 'duplicate', code, detail: null };
    default:
      break;
  }

  if (response.status === 422 && data.errors) {
    const detail = Object.values(data.errors).flat().join('\n');
    return { kind: 'validation', code, detail: detail || null };
  }

  return { kind: 'generic', code, detail: null };
}

type Phase = 'form' | 'review';

export default function BloodRequestScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const patient = useAuthStore((s) => s.patient);

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

  const [phase, setPhase] = useState<Phase>('form');
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState<BloodUrgencyValue>('routine');
  const [neededByOffset, setNeededByOffset] = useState<number | null>(null);
  const [contactPhone, setContactPhone] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState<BloodRequest | null>(null);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);

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

  // `max_units` arrives after the first paint, and BloodRequestService clamps
  // anything above it server-side — so the stepper must never be able to show
  // a number the request would not honour.
  useEffect(() => {
    setQuantity((q) => Math.min(q, maxUnits));
  }, [maxUnits]);

  const facility: BloodBankResult | null = useMemo(
    () => (search.data ?? []).find((row) => row.id === facilityId) ?? null,
    [search.data, facilityId],
  );

  const emergencyLine = facility?.emergency_contact ?? null;
  const mainLine = facility?.phone ?? null;
  const phone = emergencyLine ?? mainLine;
  // MobileBloodController falls back to the facility's main line when the
  // availability row carries no emergency contact, so the two fields are very
  // often the same string — offer the second number only when it is a second
  // number.
  const secondaryLine =
    emergencyLine && mainLine && normaliseNumber(emergencyLine) !== normaliseNumber(mainLine)
      ? mainLine
      : null;
  /** The non-emergency number to print, if there is a distinct one. */
  const listedLine = secondaryLine ?? (emergencyLine ? null : mainLine);

  const hasCoords = facility?.latitude != null && facility?.longitude != null;
  const availability = facility?.availability ?? null;

  // `status` is the facility's own stock word; `unknown` keeps the badge from
  // rendering an empty pill if a row ever arrives without one.
  const stockKey = (availability?.status ?? '').toLowerCase() || 'unknown';
  const stockLabel = t(`bloodFinder.stock.${stockKey}`, {
    defaultValue: STOCK_FALLBACK[stockKey] ?? formatLabel(stockKey),
  });

  const freshnessKey = (availability?.freshness ?? '').toLowerCase() || 'stale';
  const freshnessLabel = t(`bloodFinder.freshness.${freshnessKey}`, {
    defaultValue: t('bloodFinder.freshness.stale'),
  });

  const verificationKey = (facility?.verification_status ?? '').toLowerCase();

  const neededByDate = neededByOffset === null ? null : dayFromNow(neededByOffset);
  const neededByLabel =
    neededByOffset === null
      ? t('bloodFinder.request.neededByAny', { defaultValue: 'Not specified' })
      : neededByOffset === 0
        ? t('bloodFinder.request.neededByToday', { defaultValue: 'Today' })
        : neededByOffset === 1
          ? t('bloodFinder.request.neededByTomorrow', { defaultValue: 'Tomorrow' })
          : formatDate(neededByDate);

  const trimmedPhone = contactPhone.trim();
  const phoneInvalid =
    trimmedPhone.length > 0 && trimmedPhone.replace(/\D/g, '').length < PHONE_MIN_DIGITS;
  const canContinue = !!facility && !!bloodGroup && !phoneInvalid;

  /**
   * Whether sending the very same payload again could plausibly succeed. It
   * cannot after a stock, listing, quota or duplicate refusal — those are the
   * server's settled answer, and offering "Send Request" again would be a lie
   * dressed as a button.
   */
  const resendable =
    !failure ||
    failure.kind === 'network' ||
    failure.kind === 'generic' ||
    failure.kind === 'validation';

  const backToSearch = () =>
    router.canGoBack() ? router.back() : router.replace('/blood-finder');

  const toForm = () => {
    setFailure(null);
    setPhase('form');
  };

  const onSubmit = () => {
    if (!facilityId || !bloodGroup || phoneInvalid) return;
    setFailure(null);

    // `needed_by` is a real field on MobileBloodController::store() that the
    // shared `CreateBloodRequestInput` type does not yet declare. Widening the
    // payload here sends it without touching the shared data layer.
    const payload: CreateBloodRequestInput & { needed_by?: string | null } = {
      care_facility_id: facilityId,
      blood_group: bloodGroup,
      component_type: componentType,
      quantity,
      urgency,
      contact_phone: trimmedPhone || null,
      note: note.trim() || null,
      needed_by: neededByDate ? isoDate(neededByDate) : null,
    };

    createRequest.mutate(payload, {
      onSuccess: (request) => setConfirmed(request),
      onError: (error) => setFailure(classifyFailure(error)),
    });
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
    const facilityPlace = [confirmed.facility?.address, confirmed.facility?.city]
      .filter(Boolean)
      .join(', ');

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

          {/* The hold is not open-ended: BloodRequestService stamps expires_at
              24 hours out and the hourly sweep retires it. Saying so is the
              difference between waiting and phoning. */}
          {confirmed.expires_at ? (
            <NoticeBanner
              icon="clock"
              tone="warning"
              title={t('bloodFinder.request.expiresAt', { defaultValue: 'Hold expires' })}
              message={t('bloodFinder.request.expiresAtBody', {
                when: formatDateTime(confirmed.expires_at),
                defaultValue:
                  'If the blood bank has not answered by {{when}}, this request lapses on its own and you can send a new one.',
              })}
            />
          ) : null}

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
                  t(`bloodFinder.components.${confirmed.component_type}`, {
                    defaultValue: confirmed.component_label,
                  })
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
                divider
              />
              {confirmed.needed_by ? (
                <InfoRow
                  icon="calendar"
                  tint="amber"
                  label={t('bloodFinder.request.neededBy', { defaultValue: 'Needed by' })}
                  value={formatDate(confirmed.needed_by)}
                  divider
                />
              ) : null}
              {confirmed.contact_phone ? (
                <InfoRow
                  icon="phone"
                  tint="blue"
                  label={t('bloodFinder.request.contactPhone')}
                  value={confirmed.contact_phone}
                  divider
                />
              ) : null}
              {confirmed.patient_note ? (
                <InfoRow
                  icon="document-text"
                  tint="blue"
                  label={t('bloodFinder.request.note')}
                  value={confirmed.patient_note}
                  divider
                />
              ) : null}
              {confirmed.created_at ? (
                <InfoRow
                  icon="clock"
                  tint="blue"
                  label={t('bloodFinder.request.sentAt', { defaultValue: 'Sent' })}
                  value={formatDateTime(confirmed.created_at)}
                  divider={!!facilityName}
                />
              ) : null}
              {facilityName ? (
                <InfoRow
                  icon="building"
                  tint="blue"
                  label={t('bloodFinder.request.facility')}
                  value={facilityPlace ? `${facilityName} — ${facilityPlace}` : facilityName}
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
            {confirmedPhone ? (
              <CareButton
                label={t('bloodFinder.call')}
                icon="phone"
                variant="dangerSolid"
                onPress={() => dial(confirmedPhone)}
              />
            ) : null}
            <GradientButton
              label={t('bloodFinder.request.backToSearch')}
              onPress={() => router.replace('/blood-finder')}
            />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  /* ── Details / Review ─────────────────────────────────────────────────── */

  const wizardSteps: Step[] = [
    { key: 'details', label: t('bloodFinder.request.stepDetails', { defaultValue: 'Details' }) },
    { key: 'review', label: t('bloodFinder.request.stepReview', { defaultValue: 'Review' }) },
    { key: 'sent', label: t('bloodFinder.request.stepSent', { defaultValue: 'Sent' }) },
  ];

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('bloodFinder.request.title')}
        subtitle={t('bloodFinder.request.subtitle')}
        onBack={phase === 'review' ? toForm : backToSearch}
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
              message={t('bloodFinder.request.reloadHint', {
                defaultValue:
                  'This facility’s stock could not be re-checked, so nothing should be requested against it yet.',
              })}
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
            <StepProgress
              steps={wizardSteps}
              currentIndex={phase === 'form' ? 0 : 1}
              accessibilityLabel={
                phase === 'form'
                  ? t('bloodFinder.request.stepDetails', { defaultValue: 'Details' })
                  : t('bloodFinder.request.stepReview', { defaultValue: 'Review' })
              }
            />

            {/* Facility + the number to call before travelling. The safety
                notice tells every patient to phone first, so the phone has to
                be reachable without scrolling past the whole form. */}
            <Card variant="flush">
              <ListRow
                icon={facilityIcon(facility.facility_type)}
                tint={BLOOD_TINT}
                title={facility.name}
                meta={[
                  [facility.city, facility.region].filter(Boolean).join(', ') || null,
                  facility.distance_km === null
                    ? t('bloodFinder.distanceUnknown')
                    : t('bloodFinder.distanceKm', { km: facility.distance_km }),
                  stockLabel,
                ]}
                chevron={false}
                trailing={
                  <StatusBadge
                    status={freshnessKey}
                    tone={FRESHNESS_TONE[freshnessKey] ?? 'neutral'}
                    label={freshnessLabel}
                    size="sm"
                  />
                }
                divider
              />
              <View style={styles.cardFoot}>
                <CareButton
                  label={
                    phone
                      ? emergencyLine
                        ? t('bloodFinder.callEmergencyLine', { defaultValue: 'Emergency line' })
                        : t('bloodFinder.call')
                      : t('bloodFinder.noPhone')
                  }
                  icon="phone"
                  variant={phone ? 'dangerSolid' : 'secondary'}
                  size="sm"
                  disabled={!phone}
                  onPress={() => dial(phone)}
                  style={styles.footAction}
                />
                {secondaryLine ? (
                  <CareButton
                    label={t('bloodFinder.callShort')}
                    icon="phone"
                    variant="secondary"
                    size="sm"
                    onPress={() => dial(secondaryLine)}
                    style={styles.footAction}
                  />
                ) : null}
              </View>
            </Card>

            {/* Embedded map — a real in-app OpenStreetMap view of this facility
                with a locate-me/directions control that never leaves the app. */}
            {hasCoords ? (
              <Card variant="flush">
                <FacilityMap facilities={facility} height={200} directions />
              </Card>
            ) : null}

            {/* What is actually being asked for, where it is, and — the part
                that decides whether any of it is worth acting on — exactly when
                the facility last touched the figure. */}
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
                  value={availability?.component_label || componentLabel}
                  divider
                />
                <InfoRow
                  icon="activity"
                  tint={availability?.units_range ? 'green' : 'amber'}
                  label={t('bloodFinder.unitsLabel', { defaultValue: 'Units reported' })}
                  value={availability?.units_range ?? t('bloodFinder.unitsUnknown')}
                  divider
                />
                <InfoRow
                  icon="clock"
                  tint={freshnessKey === 'fresh' ? 'green' : 'amber'}
                  label={t('bloodFinder.stockUpdated', { defaultValue: 'Stock updated' })}
                  // The exact time when the facility stamped one, the freshness
                  // band when it did not. Never a guess dressed as a clock.
                  value={
                    availability?.last_updated_at
                      ? `${formatDateTime(availability.last_updated_at)}  ·  ${freshnessLabel}`
                      : freshnessLabel
                  }
                  divider={!!facility.address || !!verificationKey}
                />
                {facility.address ? (
                  <InfoRow
                    icon="location"
                    tint="blue"
                    label={t('bloodFinder.addressLabel', { defaultValue: 'Address' })}
                    value={[facility.address, facility.city].filter(Boolean).join(', ')}
                    divider={!!verificationKey || !!emergencyLine || !!listedLine}
                  />
                ) : null}
                {emergencyLine ? (
                  <InfoRow
                    icon="phone"
                    tint="red"
                    label={t('bloodFinder.callEmergencyLine', { defaultValue: 'Emergency line' })}
                    value={emergencyLine}
                    divider={!!listedLine || !!verificationKey}
                  />
                ) : null}
                {listedLine ? (
                  <InfoRow
                    icon="phone"
                    tint="blue"
                    label={t('bloodFinder.phoneLabel', { defaultValue: 'Phone' })}
                    value={listedLine}
                    divider={!!verificationKey}
                  />
                ) : null}
                {verificationKey ? (
                  <InfoRow
                    icon="shield-check"
                    tint={isVerified(facility.verification_status) ? 'green' : 'amber'}
                    label={t('bloodFinder.verificationLabel', { defaultValue: 'Listing' })}
                    value={t(`bloodFinder.verification.${verificationKey}`, {
                      defaultValue:
                        VERIFICATION_FALLBACK[verificationKey] ??
                        formatLabel(facility.verification_status),
                    })}
                  />
                ) : null}
              </View>
            </Card>

            {phase === 'form' ? (
              <>
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

                {/* Needed by — `after_or_equal:today`, so nothing offered here
                    can be refused by the validator. */}
                <View>
                  <SectionHeader
                    title={t('bloodFinder.request.neededBy', { defaultValue: 'Needed by' })}
                  />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.chipRail}
                    contentContainerStyle={styles.chipRailContent}
                  >
                    <Chip
                      icon="close"
                      label={t('bloodFinder.request.neededByAny', {
                        defaultValue: 'Not specified',
                      })}
                      selected={neededByOffset === null}
                      onPress={() => setNeededByOffset(null)}
                    />
                    {NEEDED_BY_OFFSETS.map((offset) => (
                      <Chip
                        key={offset}
                        icon="calendar"
                        label={
                          offset === 0
                            ? t('bloodFinder.request.neededByToday', { defaultValue: 'Today' })
                            : offset === 1
                              ? t('bloodFinder.request.neededByTomorrow', {
                                  defaultValue: 'Tomorrow',
                                })
                              : formatDate(dayFromNow(offset))
                        }
                        selected={neededByOffset === offset}
                        onPress={() => setNeededByOffset(offset)}
                        accessibilityLabel={formatDate(dayFromNow(offset))}
                      />
                    ))}
                  </ScrollView>
                </View>

                {/* Contact phone */}
                <View>
                  <SectionHeader
                    title={t('bloodFinder.request.contactPhone')}
                    actionLabel={
                      patient?.phone && patient.phone !== contactPhone
                        ? t('bloodFinder.request.useMyNumber', { defaultValue: 'Use my number' })
                        : undefined
                    }
                    onAction={
                      patient?.phone && patient.phone !== contactPhone
                        ? () => setContactPhone(patient.phone as string)
                        : undefined
                    }
                  />
                  <PillInput
                    icon={<Icon name="phone" size={18} color={colors.blue} />}
                    value={contactPhone}
                    onChangeText={setContactPhone}
                    placeholder={t('bloodFinder.request.contactPhonePlaceholder')}
                    keyboardType="phone-pad"
                    maxLength={PHONE_MAX_LENGTH}
                    accessibilityLabel={t('bloodFinder.request.contactPhone')}
                  />
                  <Text style={phoneInvalid ? styles.fieldError : styles.fieldHint}>
                    {phoneInvalid
                      ? t('bloodFinder.request.contactPhoneInvalid', {
                          defaultValue:
                            'That does not look like a phone number the blood bank could call back on.',
                        })
                      : t('bloodFinder.request.contactPhoneHint', {
                          defaultValue:
                            'Optional. The blood bank calls this number if it needs to reach you before you arrive.',
                        })}
                  </Text>
                </View>

                {/* Note */}
                <View>
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

                <GradientButton
                  label={t('bloodFinder.request.review', { defaultValue: 'Review request' })}
                  icon="none"
                  disabled={!canContinue}
                  onPress={() => setPhase('review')}
                  accessibilityHint={t('bloodFinder.request.reviewTitle')}
                />
              </>
            ) : (
              <>
                {/* Review — everything that will be transmitted, including the
                    fields deliberately left empty, before a single byte moves. */}
                <View>
                  <SectionHeader title={t('bloodFinder.request.reviewTitle')} />
                  <Card>
                    <SummaryLine label={t('bloodFinder.bloodGroup')} value={bloodGroup} strong />
                    <SummaryLine label={t('bloodFinder.component')} value={componentLabel} />
                    <SummaryLine
                      label={t('bloodFinder.request.reviewUnits')}
                      value={String(quantity)}
                    />
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
                    <SummaryLine
                      label={t('bloodFinder.request.neededBy', { defaultValue: 'Needed by' })}
                      value={neededByLabel}
                      valueColor={neededByOffset === null ? colors.textMuted : undefined}
                    />
                    <SummaryLine
                      label={t('bloodFinder.request.contactPhone')}
                      value={
                        trimmedPhone ||
                        t('bloodFinder.request.notProvided', { defaultValue: 'Not provided' })
                      }
                      valueColor={trimmedPhone ? undefined : colors.textMuted}
                    />
                    <SummaryLine
                      label={t('bloodFinder.request.note')}
                      value={
                        note.trim() ||
                        t('bloodFinder.request.notProvided', { defaultValue: 'Not provided' })
                      }
                      valueColor={note.trim() ? undefined : colors.textMuted}
                    />
                    <SummaryLine
                      label={t('bloodFinder.request.facility')}
                      value={facility.name}
                    />
                  </Card>
                </View>

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
                {/* "Call before travelling" belongs at the moment of committing,
                    not only after — the number is two cards up this same screen. */}
                <NoticeBanner
                  icon="shield-check"
                  tone="warning"
                  title={t('bloodFinder.safetyTitle')}
                  message={t('bloodFinder.safetyBody')}
                />

                {/* Outcome — one panel per thing that can actually be true. */}
                {failure ? (
                  <FailurePanel
                    failure={failure}
                    group={bloodGroup}
                    component={componentLabel}
                    phone={phone}
                    onBack={backToSearch}
                  />
                ) : null}

                {/* A refusal that would repeat identically is offered neither a
                    retry nor an edit — nothing on this form would change the
                    answer, and the panel above already carries the action that
                    would. A request that never left the handset gets both. */}
                {resendable ? (
                  <>
                    <GradientButton
                      label={t('bloodFinder.request.submit')}
                      icon="none"
                      loading={createRequest.isPending}
                      onPress={onSubmit}
                      accessibilityHint={t('bloodFinder.request.subtitle')}
                    />
                    <CareButton
                      label={t('bloodFinder.request.edit', { defaultValue: 'Change details' })}
                      icon="edit"
                      variant="secondary"
                      disabled={createRequest.isPending}
                      onPress={toForm}
                    />
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
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
 * One panel per failure, because they are not one failure.
 *
 *  - not_available  (409) the stock went between the search and the send
 *  - facility_missing (404) the listing itself is gone
 *  - too_many       (429) five open requests already — the ceiling, not a fault
 *  - duplicate      (409) this exact request is already open at this facility
 *  - validation     (422) a field the server refused — shown verbatim
 *  - network        nothing was sent; retrying is the correct move
 *  - generic        an unknown refusal, named as unknown rather than guessed
 */
function FailurePanel({
  failure,
  group,
  component,
  phone,
  onBack,
}: {
  failure: SubmitFailure;
  group: string;
  component: string;
  phone: string | null;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (failure.kind === 'not_available') {
    return <NotAvailablePanel group={group} component={component} phone={phone} onBack={onBack} />;
  }

  if (failure.kind === 'facility_missing') {
    return (
      <View style={styles.stack}>
        <Card variant="flush">
          <EmptyState
            icon="alert-circle"
            tint="red"
            title={t('bloodFinder.errors.FACILITY_NOT_FOUND')}
            message={t('bloodFinder.request.facilityMissingHint', {
              defaultValue:
                'The facility was removed from the OpesCare directory after your search ran, so nothing can be reserved there. Search again to see who else reports this blood.',
            })}
            actionLabel={t('bloodFinder.request.backToSearch')}
            onAction={onBack}
          />
        </Card>
        {phone ? (
          <CareButton
            label={t('bloodFinder.request.callNow')}
            icon="phone"
            variant="secondary"
            onPress={() => dial(phone)}
          />
        ) : null}
      </View>
    );
  }

  if (failure.kind === 'too_many') {
    return (
      <Card variant="flush">
        <EmptyState
          icon="alert-circle"
          tint="amber"
          title={t('bloodFinder.errors.TOO_MANY_OPEN_REQUESTS')}
          message={`${t('bloodFinder.request.openRequestsHint')}\n\n${t(
            'bloodFinder.request.tooManyHint',
            {
              defaultValue:
                'Cancel one you no longer need, or wait — an unanswered request lapses on its own after 24 hours and frees the slot.',
            },
          )}`}
          actionLabel={t('bloodFinder.myRequests')}
          onAction={onBack}
        />
      </Card>
    );
  }

  if (failure.kind === 'duplicate') {
    return (
      <Card variant="flush">
        <EmptyState
          icon="receipt"
          tint="blue"
          title={t('bloodFinder.errors.REQUEST_ALREADY_OPEN')}
          message={`${t('bloodFinder.request.duplicateHint', {
            defaultValue:
              'Sending it twice would not make the blood bank answer sooner. The request you already sent is still open.',
          })}\n\n${t('bloodFinder.request.openRequestsHint')}`}
          actionLabel={t('bloodFinder.myRequests')}
          onAction={onBack}
        />
      </Card>
    );
  }

  if (failure.kind === 'network') {
    return (
      <Card variant="flush">
        <EmptyState
          icon="alert-circle"
          tint="amber"
          title={t('bloodFinder.request.networkTitle', {
            defaultValue: "Your request didn't reach OpesCare.",
          })}
          // No retry button here on purpose: the "Send Request" button is still
          // on screen directly below, and two buttons that fire the same POST
          // is one too many to reason about while frightened.
          message={t('bloodFinder.request.networkBody', {
            defaultValue:
              'Nothing was sent and nothing was reserved. Check your connection and send it again — or call the facility, which does not need the internet.',
          })}
          actionLabel={phone ? t('bloodFinder.request.callNow') : undefined}
          onAction={phone ? () => dial(phone) : undefined}
        />
      </Card>
    );
  }

  // validation | generic
  return (
    <View style={styles.stack}>
      <NoticeBanner
        icon="alert-circle"
        tone="critical"
        title={t('bloodFinder.request.title')}
        message={
          failure.code
            ? t(`bloodFinder.errors.${failure.code}`, {
                defaultValue: t('bloodFinder.errors.generic'),
              })
            : t('bloodFinder.errors.generic')
        }
      />
      {failure.detail ? <Text style={styles.footnote}>{failure.detail}</Text> : null}
    </View>
  );
}

/**
 * The 409. `blood_availability` is self-reported, so a listing going away
 * between the search and the send is ordinary — this panel treats it as a fork
 * in the road rather than a failure, and every button on it does something.
 * Deliberately offers no "try again": the same POST would be refused by the
 * same availability check for the same reason.
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

    chipRail: { marginHorizontal: -spacing.md },
    chipRailContent: {
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      alignItems: 'center',
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

    // PillInput carries its own bottom margin, so the helper line sits tight
    // under it rather than a full gap below.
    fieldHint: {
      marginTop: -spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
    },
    fieldError: {
      marginTop: -spacing.sm,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.statusCritical,
    },

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
