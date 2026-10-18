import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Share, type ViewToken } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDialog, useTheme, type TFunction } from '@/components/opes-ui';
import { appointmentReference, typeLabelOf } from '@/components/care/apptLabels';
import { useAuthStore } from '@/lib/store/auth';
import {
  useFacilityDetail,
  useFacilityProviders,
  useFacilitySlots,
  useBookAppointment,
  type AppointmentDetail,
  type AppointmentSlotOption,
  type CareFacilitySummary,
  type FacilityProviderSummary,
} from '@/lib/api/queries';
import {
  bookingErrorKey,
  daysCoveredBySlots,
  firstSlotAfterDay,
  groupSlotsByPeriod,
  slotDurationMinutes,
  slotsOnDay,
  useFacilityBookability,
  UNKNOWN_BOOKABILITY,
} from '@/lib/api/bookingQueries';
import { telUrl, usablePhone } from '@/lib/phone';
import {
  Step,
  WIZARD_STEPS,
  BookingFacility,
  FacilityType,
  FACILITY_TYPE_META,
  APPOINTMENT_TYPES,
  HORIZON_DAYS,
  MAX_PROBES,
  BookingScope,
  useBookingDirectory,
  nextDays,
  formatFullDateTime,
  openUrl,
  useStyles,
} from '@/components/appointments/book/helpers';

/**
 * State, queries, effects and derived data for the booking wizard
 * (app/appointments/book.tsx). Extracted verbatim from the screen component.
 */
export function useBookingFlow() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const router = useRouter();
  const queryClient = useQueryClient();
  const patient = useAuthStore((s) => s.patient);
  const { colors } = useTheme();
  const styles = useStyles();
  const dialog = useDialog();
  // The care helpers take the kit's narrow `t` contract; react-i18next's `t`
  // satisfies it, this just pins the return to `string` for TypeScript.
  const tt: TFunction = useCallback(
    (key: string, params?: Record<string, string | number>) => String(t(key, params)),
    [t],
  );

  // Deep-link entry: the facility and doctor screens push straight into this
  // flow with the facility (and optionally the clinician) already decided, so
  // the patient does not re-pick what they just tapped.
  const params = useLocalSearchParams<{ facilityId?: string; providerId?: string }>();
  const linkedFacilityId = typeof params.facilityId === 'string' ? params.facilityId : undefined;
  const linkedProviderId = typeof params.providerId === 'string' ? params.providerId : undefined;

  const [step, setStep] = useState<Step>('facility');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FacilityType | ''>('');
  // Opens on the facilities that can actually take a booking. See BookingScope.
  const [scope, setScope] = useState<BookingScope>('bookable');
  const [selectedFacility, setSelectedFacility] = useState<BookingFacility | null>(null);

  // The clinician filter is held as an id, not an object: a deep link knows the
  // id before the provider list has loaded, and slot filtering must not wait.
  // `null` means "any available clinician" — the pre-existing behaviour.
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    linkedProviderId ?? null,
  );
  const [hydratedFromLink, setHydratedFromLink] = useState(!linkedFacilityId);

  const days = useMemo(() => nextDays(HORIZON_DAYS), []);
  const [selectedDate, setSelectedDate] = useState(days[0].key);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlotOption | null>(null);

  const [appointmentType, setAppointmentType] = useState(APPOINTMENT_TYPES[0].value);
  const [reason, setReason] = useState('');
  const [bookedAppointment, setBookedAppointment] = useState<AppointmentDetail | null>(null);

  const facilitiesQuery = useBookingDirectory({
    q: appliedSearch || undefined,
    type: typeFilter || undefined,
    scope,
  });
  const facilities = useMemo<CareFacilitySummary[]>(
    () => (facilitiesQuery.data?.pages ?? []).flatMap((page) => page.data),
    [facilitiesQuery.data],
  );
  const totalFacilities = facilitiesQuery.data?.pages[0]?.pagination.total ?? 0;
  /** The honest denominator, straight from the response. Never computed here. */
  const registry = facilitiesQuery.data?.pages[0]?.registry;

  // Bookability is probed only for cards that have actually been on screen —
  // one request each, and there is no batch endpoint to do better.
  const [probeIds, setProbeIds] = useState<string[]>([]);
  const probeIdsRef = useRef<Set<string>>(new Set());
  // A new search, type filter or register slice is a new result set; keeping
  // the old ids would burn the probe budget on facilities no longer listed.
  useEffect(() => {
    probeIdsRef.current = new Set();
    setProbeIds([]);
  }, [appliedSearch, typeFilter, scope]);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const additions = viewableItems
      .map((token) => (token.item as CareFacilitySummary | undefined)?.id)
      .filter((id): id is string => !!id && !probeIdsRef.current.has(id));
    if (additions.length === 0 || probeIdsRef.current.size >= MAX_PROBES) return;
    additions.forEach((id) => probeIdsRef.current.add(id));
    setProbeIds(Array.from(probeIdsRef.current).slice(0, MAX_PROBES));
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;

  const bookabilityByFacility = useFacilityBookability(probeIds, days[0].key);

  const linkedFacilityQuery = useFacilityDetail(hydratedFromLink ? undefined : linkedFacilityId);
  const providersQuery = useFacilityProviders(selectedFacility?.id);
  const slotsQuery = useFacilitySlots(selectedFacility?.id, selectedDate);
  const bookMutation = useBookAppointment();

  // Resolve a deep link once: adopt the facility, then land on the clinician
  // step (or skip straight to slots when the clinician came with the link).
  useEffect(() => {
    if (hydratedFromLink || !linkedFacilityId) return;
    const facility = linkedFacilityQuery.data;
    if (!facility) return;
    setSelectedFacility(facility);
    setStep(linkedProviderId ? 'slot' : 'doctor');
    setHydratedFromLink(true);
  }, [hydratedFromLink, linkedFacilityId, linkedProviderId, linkedFacilityQuery.data]);

  const providers = providersQuery.data?.data ?? [];
  const selectedProvider: FacilityProviderSummary | null =
    providers.find((p) => p.id === selectedProviderId) ?? null;

  /**
   * A directory listing with no linked internal facility can never produce a
   * slot. Both the providers and the slots endpoints report it the same way
   * (`facility_id: null`), and the picker's probe knows it earlier still.
   */
  const probedBookability = selectedFacility
    ? (bookabilityByFacility.get(selectedFacility.id) ?? UNKNOWN_BOOKABILITY)
    : UNKNOWN_BOOKABILITY;
  const facilityIsUnlinked =
    providersQuery.data?.facility_id === null ||
    slotsQuery.data?.facility_id === null ||
    (!providersQuery.data && !slotsQuery.data && probedBookability.state === 'unlinked');

  // Slots come back for the whole window from `selectedDate` onward, capped at
  // 50 — so the grid must be narrowed to the chosen day, and the remainder is
  // exactly what powers the strip's dots and the "next opening" shortcut.
  const slotWindow = slotsQuery.data?.data ?? [];
  const windowForProvider = useMemo(
    () =>
      selectedProviderId
        ? slotWindow.filter((slot) => slot.provider_id === selectedProviderId)
        : slotWindow,
    [slotWindow, selectedProviderId],
  );
  const daySlots = useMemo(
    () => slotsOnDay(windowForProvider, selectedDate),
    [windowForProvider, selectedDate],
  );
  const slotGroups = useMemo(() => groupSlotsByPeriod(daySlots), [daySlots]);
  const daysWithSlots = useMemo(() => daysCoveredBySlots(windowForProvider), [windowForProvider]);
  const nextSlotAhead = useMemo(
    () => firstSlotAfterDay(windowForProvider, selectedDate),
    [windowForProvider, selectedDate],
  );
  const facilityHasSlotsOnDay = slotsOnDay(slotWindow, selectedDate).length > 0;

  // Not `?? null`: the register stores the literal string "N/A" where a
  // facility publishes no number, and that read as "there is a phone" — so the
  // "call the facility instead" fallback, offered exactly when booking is
  // impossible, handed the patient a button that dialled nothing.
  const facilityPhone = usablePhone(selectedFacility?.phone_primary);

  const facilityTypeLabel = useCallback(
    (value: string | null | undefined) => {
      const meta = value ? FACILITY_TYPE_META[value as FacilityType] : undefined;
      return meta ? t(`appointments.book.${meta.key}`) : (value ?? '—');
    },
    [t],
  );

  const appointmentTypeLabel = useCallback(
    (value: string | null | undefined) => typeLabelOf(tt, value),
    [tt],
  );

  const goBack = () => {
    if (step === 'facility') router.back();
    else if (step === 'doctor') {
      // A deep link skipped the picker entirely; there is no picker to go back
      // to, so honour the real back stack instead of stranding the patient.
      if (linkedFacilityId) router.back();
      else setStep('facility');
    } else if (step === 'slot') {
      setSelectedSlot(null);
      if (linkedProviderId) router.back();
      else setStep('doctor');
    } else if (step === 'confirm') setStep('slot');
  };

  const handleSelectFacility = (facility: BookingFacility) => {
    setSelectedFacility(facility);
    setSelectedSlot(null);
    setSelectedProviderId(null);
    setSelectedDate(days[0].key);
    setStep('doctor');
  };

  const handleChangeFacility = () => {
    if (linkedFacilityId) {
      // Entered via deep link — the picker was never on the stack.
      router.back();
      return;
    }
    setSelectedSlot(null);
    setSelectedProviderId(null);
    setStep('facility');
  };

  /** `providerId === null` is the "any available clinician" path — no filtering. */
  const handleSelectProvider = (providerId: string | null) => {
    setSelectedProviderId(providerId);
    setSelectedSlot(null);
    setStep('slot');
  };

  const handleConfirmBooking = () => {
    // `slotsQuery.data.facility_id` is the INTERNAL `facilities` id the slots
    // endpoint echoes back. POST /mobile/appointments validates
    // `exists:facilities,id`; posting the `care_facilities` id the patient
    // browsed is a 422 every time.
    const internalFacilityId = slotsQuery.data?.facility_id;
    if (!selectedFacility || !selectedSlot || !internalFacilityId) return;
    bookMutation.mutate(
      {
        facility_id: internalFacilityId,
        appointment_slot_id: selectedSlot.id,
        appointment_type: appointmentType,
        reason: reason.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          // The slot we just took now has one less place on it. useBookAppointment
          // only invalidates ['appointments'], so drop this facility's cached
          // slot windows too — otherwise a second booking in the same session
          // would be offered a place that no longer exists.
          queryClient.invalidateQueries({
            queryKey: ['facilities', selectedFacility.id, 'slots'],
          });
          setBookedAppointment(data);
          setStep('success');
        },
      },
    );
  };

  /** The 409 path: the slot went while the patient was reviewing. */
  const handlePickAnotherTime = () => {
    setSelectedSlot(null);
    bookMutation.reset();
    slotsQuery.refetch();
    setStep('slot');
  };

  // A failed booking is surfaced in the kit's bottom sheet — `Alert.alert` is
  // a no-op on react-native-web — and mirrored inline under the review card
  // so the reason is still on screen once the sheet is dismissed. Keyed on the
  // error object, which only changes when a new attempt fails.
  const bookingError = bookMutation.isError ? bookMutation.error : null;
  const showDialog = dialog.show;
  useEffect(() => {
    if (!bookingError) return;
    const key = bookingErrorKey(bookingError);
    const slotTaken = key === 'bookErrorSlotTaken';
    const outcomeUnknown =
      key === 'bookErrorNetwork' || key === 'bookErrorServer' || key === 'bookErrorUnknown';
    showDialog({
      title: t(`appointments.book.${key}`),
      message: slotTaken
        ? t('opesCare.review.conflictMessage')
        : outcomeUnknown
          ? t('opesCare.review.checkHint')
          : undefined,
      tone: 'critical',
      actions: slotTaken
        ? [{ label: t('appointments.book.pickAnotherTime'), onPress: handlePickAnotherTime }]
        : [],
    });
    // `handlePickAnotherTime` closes over mutation/query objects that change
    // identity every render; re-running on those would re-open the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingError, showDialog, t]);

  const handleCallFacility = () => {
    const url = telUrl(facilityPhone);
    if (url) openUrl(url);
  };

  const handleShareAppointment = async () => {
    if (!bookedAppointment) return;
    try {
      await Share.share({
        message: t('appointments.book.shareMessage', {
          type: appointmentTypeLabel(bookedAppointment.appointment_type),
          facility: bookedAppointment.facility_name ?? selectedFacility?.facility_name ?? '',
          datetime: bookedAppointment.scheduled_at
            ? formatFullDateTime(bookedAppointment.scheduled_at)
            : '',
          id: appointmentReference(bookedAppointment.id),
        }),
      });
    } catch {
      // Share sheet dismissed/cancelled — nothing to surface.
    }
  };

  const progressSteps = useMemo(
    () => [
      { key: 'facility', label: t('appointments.book.railFacility') },
      { key: 'doctor', label: t('appointments.book.railDoctor') },
      { key: 'slot', label: t('appointments.book.railSlot') },
      { key: 'confirm', label: t('appointments.book.railConfirm') },
    ],
    [t],
  );
  const stepIndex = WIZARD_STEPS.indexOf(step);
  const stepTitle =
    step === 'facility'
      ? t('appointments.book.stepFacility')
      : step === 'doctor'
        ? t('appointments.book.stepDoctor')
        : step === 'slot'
          ? t('appointments.book.stepSlot')
          : t('appointments.book.stepConfirm');
  const stepOf = t('appointments.book.stepOf', {
    current: stepIndex + 1,
    total: WIZARD_STEPS.length,
  });

  const bookedDuration = selectedSlot != null ? slotDurationMinutes(selectedSlot) : null;
  const bookingErrorKeyNow = bookingError ? bookingErrorKey(bookingError) : null;

  const facilityAddress = (facility: BookingFacility) =>
    [facility.address, facility.city].filter(Boolean).join(', ');

  return {
    t,
    i18n,
    locale,
    router,
    queryClient,
    patient,
    colors,
    styles,
    dialog,
    tt,
    params,
    linkedFacilityId,
    linkedProviderId,
    step,
    setStep,
    searchInput,
    setSearchInput,
    appliedSearch,
    setAppliedSearch,
    typeFilter,
    setTypeFilter,
    scope,
    setScope,
    selectedFacility,
    setSelectedFacility,
    selectedProviderId,
    setSelectedProviderId,
    hydratedFromLink,
    setHydratedFromLink,
    days,
    selectedDate,
    setSelectedDate,
    selectedSlot,
    setSelectedSlot,
    appointmentType,
    setAppointmentType,
    reason,
    setReason,
    bookedAppointment,
    setBookedAppointment,
    facilitiesQuery,
    facilities,
    totalFacilities,
    registry,
    probeIds,
    setProbeIds,
    onViewableItemsChanged,
    viewabilityConfig,
    bookabilityByFacility,
    linkedFacilityQuery,
    providersQuery,
    slotsQuery,
    bookMutation,
    providers,
    selectedProvider,
    probedBookability,
    facilityIsUnlinked,
    slotWindow,
    windowForProvider,
    daySlots,
    slotGroups,
    daysWithSlots,
    nextSlotAhead,
    facilityHasSlotsOnDay,
    facilityPhone,
    facilityTypeLabel,
    appointmentTypeLabel,
    goBack,
    handleSelectFacility,
    handleChangeFacility,
    handleSelectProvider,
    handleConfirmBooking,
    handlePickAnotherTime,
    bookingError,
    showDialog,
    handleCallFacility,
    handleShareAppointment,
    progressSteps,
    stepIndex,
    stepTitle,
    stepOf,
    bookedDuration,
    bookingErrorKeyNow,
    facilityAddress,
  };
}

export type BookingFlowModel = ReturnType<typeof useBookingFlow>;
