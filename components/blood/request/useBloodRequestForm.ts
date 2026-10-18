import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  formatDate,
  formatLabel,
  useTheme,
  type Step,
} from '@/components/opes-ui';
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
import {
  NOTE_MAX_LENGTH,
  PHONE_MIN_DIGITS,
  ContactChoice,
  CONTACT_FALLBACK,
  STOCK_FALLBACK,
  normaliseNumber,
  isoDate,
  dayFromNow,
  SubmitFailure,
  classifyFailure,
  Phase,
  OpenMenu,
} from '@/components/blood/request/helpers';
import { Option, Fact } from '@/components/blood/request/parts';
import { makeStyles } from '@/components/blood/request/styles';

/**
 * State, queries and derived data for the blood request screen
 * (app/blood-finder/request.tsx). Extracted verbatim from the screen component.
 */
export function useBloodRequestForm() {
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
  const [contactChoice, setContactChoice] = useState<ContactChoice>('phone');
  const [contactPhone, setContactPhone] = useState('');
  const [forOther, setForOther] = useState(false);
  const [forWhoInput, setForWhoInput] = useState('');
  const [note, setNote] = useState('');
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [showRoute, setShowRoute] = useState(false);
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
  // A facility that is not inside the radius we happen to have been given is
  // not the same thing as a facility that stopped reporting. Ask the national
  // register before saying so.
  const localMissed =
    !fromNationwide &&
    localSearch.isSuccess &&
    !(localSearch.data ?? []).some((row) => row.id === facilityId);

  const nationwideSearch = useNationwideBloodSearch({
    bloodGroup,
    componentType,
    enabled: !!bloodGroup && (fromNationwide || localMissed),
  });

  // Loading and retry follow whichever search still has something to say.
  const search = fromNationwide || localMissed ? nationwideSearch : localSearch;
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
    () =>
      (localSearch.data ?? []).find((row) => row.id === facilityId) ??
      (nationwideSearch.data ?? []).find((row) => row.id === facilityId) ??
      null,
    [localSearch.data, nationwideSearch.data, facilityId],
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

  const contactLabelOf = (choice: ContactChoice) =>
    t(`bloodFinder.request.contactChoices.${choice}`, { defaultValue: CONTACT_FALLBACK[choice] });

  /** `in_app` means exactly that: no number is transmitted. */
  const phoneWanted = contactChoice !== 'in_app';
  const trimmedPhone = phoneWanted ? contactPhone.trim() : '';
  const phoneInvalid =
    trimmedPhone.length > 0 && trimmedPhone.replace(/\D/g, '').length < PHONE_MIN_DIGITS;

  const forWho = forOther ? forWhoInput.trim() : '';

  /*
   * The two controls the reference draws that the endpoint has no column for.
   * They are not dropped and they are not silent: each becomes one labelled
   * line at the top of `note`, the section that collects them says so, and the
   * review step prints the result exactly as it will be sent.
   */
  const foldedLines: string[] = [];
  if (forWho) {
    foldedLines.push(
      t('bloodFinder.request.forWhoLine', { who: forWho, defaultValue: 'Requesting for: {{who}}' }),
    );
  }
  foldedLines.push(
    t('bloodFinder.request.contactLine', {
      choice: contactLabelOf(contactChoice),
      defaultValue: 'Preferred contact: {{choice}}',
    }),
  );

  const foldPrefix = foldedLines.length ? `${foldedLines.join('\n')}\n` : '';
  /** What is left of the server's `max:500` once the folded lines are counted. */
  const noteBudget = Math.max(0, NOTE_MAX_LENGTH - foldPrefix.length);
  // Never silently truncated: the counter turns red and "Review request" is
  // blocked instead, because cutting a clinical reason mid-sentence to fit is
  // not a thing an app may do quietly.
  const noteTooLong = note.length > noteBudget;
  const composedNote = `${foldPrefix}${note.trim()}`.trim();

  const canContinue = !!facility && !!bloodGroup && !phoneInvalid && !noteTooLong;

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

  const backToSearch = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  const toForm = () => {
    setFailure(null);
    setPhase('form');
  };

  const onSubmit = () => {
    if (!facilityId || !bloodGroup || phoneInvalid || noteTooLong) return;
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
      note: composedNote || null,
      needed_by: neededByDate ? isoDate(neededByDate) : null,
    };

    createRequest.mutate(payload, {
      onSuccess: (request) => setConfirmed(request),
      onError: (error) => setFailure(classifyFailure(error)),
    });
  };

  return {
    t,
    router,
    colors,
    styles,
    patient,
    params,
    facilityId,
    bloodGroup,
    componentType,
    lat,
    lng,
    radiusKm,
    fromNationwide,
    phase,
    setPhase,
    quantity,
    setQuantity,
    urgency,
    setUrgency,
    neededByOffset,
    setNeededByOffset,
    contactChoice,
    setContactChoice,
    contactPhone,
    setContactPhone,
    forOther,
    setForOther,
    forWhoInput,
    setForWhoInput,
    note,
    setNote,
    openMenu,
    setOpenMenu,
    showRoute,
    setShowRoute,
    confirmed,
    setConfirmed,
    failure,
    setFailure,
    options,
    localSearch,
    localMissed,
    nationwideSearch,
    search,
    createRequest,
    maxUnits,
    componentLabel,
    facility,
    emergencyLine,
    mainLine,
    phone,
    secondaryLine,
    listedLine,
    hasCoords,
    availability,
    stockKey,
    stockLabel,
    freshnessKey,
    freshnessLabel,
    verificationKey,
    neededByDate,
    neededByLabel,
    contactLabelOf,
    phoneWanted,
    trimmedPhone,
    phoneInvalid,
    forWho,
    foldedLines,
    foldPrefix,
    noteBudget,
    noteTooLong,
    composedNote,
    canContinue,
    resendable,
    backToSearch,
    toForm,
    onSubmit,
  };
}

export type BloodRequestFormModel = ReturnType<typeof useBloodRequestForm>;

/**
 * What the details/review sections read. By the time they render the screen has
 * already ruled out a missing group or facility, and has built the review-step
 * values that sit after its early returns.
 */
export type BloodRequestView = BloodRequestFormModel & {
  bloodGroup: BloodGroupValue;
  facility: BloodBankResult;
  wizardSteps: Step[];
  stepIndex: number;
  stepLine: string;
  patientAge: number | null;
  dobLine: string | null;
  neededByOptions: Option[];
  urgencyOptions: Option[];
  reviewFacts: Fact[];
};
