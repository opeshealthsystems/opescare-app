import { ActivityIndicator, Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader, StepProgress } from '@/components/opes-ui';
import { CareButton } from '@/components/care/shared';
import { EmptyCard } from '@/components/appointments/book/helpers';
import { useBookingFlow } from '@/components/appointments/book/useBookingFlow';
import { FacilityStep, DoctorStep, SlotStep, ConfirmStep, SuccessStep } from '@/components/appointments/book/sections';

/**
 * Book an appointment — facility → clinician → time → confirm.
 *
 * Presentation is the OPES kit (CARE-008 Available Time Slots, CARE-009 Book
 * Appointment Form, CARE-011 Appointment Confirmed) laid over the Finder's own
 * four-step state machine. The data layer and every decision below are
 * unchanged from the flow the patient has verified end-to-end:
 *
 *  1. **Most of the directory cannot be booked.** 903 `care_facilities` rows
 *     are listed; only the ones carrying a linked internal `facilities` id can
 *     hold slots (17 today). `GET /mobile/facilities` neither exposes nor
 *     filters on that link, so the picker probes the slots endpoint for the
 *     cards actually on screen and labels each one. A listing that cannot take
 *     a booking says so — and offers a phone number and directions — rather
 *     than dropping the patient into an empty slot grid.
 *  2. **`GET /facilities/{id}/slots` returns everything from `date` onward**,
 *     capped at 50 — not one day's worth. Rendered raw, tomorrow's 08:00 sits
 *     beside today's 08:00 with nothing to tell them apart. Every slot list
 *     here is filtered to the selected day; the rest of the window is used for
 *     the date strip's availability dots and the "next opening" jump.
 *
 * The id sent to `POST /mobile/appointments` is the **internal** `facilities`
 * id echoed back by the slots response, never the `care_facilities` id the
 * patient browsed — that endpoint validates `exists:facilities,id` and the
 * directory id is a 422.
 */

export default function BookAppointmentScreen() {
  const vm = useBookingFlow();
  const {
    t,
    colors,
    styles,
    dialog,
    step,
    hydratedFromLink,
    setHydratedFromLink,
    linkedFacilityQuery,
    goBack,
    progressSteps,
    stepIndex,
    stepTitle,
    stepOf,
  } = vm;

  return (
    <Screen className="px-0">
      {step !== 'success' ? (
        <>
          <ScreenHeader title={stepTitle} subtitle={stepOf} onBack={goBack} />
          <View style={styles.progress}>
            <StepProgress
              steps={progressSteps}
              currentIndex={stepIndex}
              accessibilityLabel={`${stepOf}: ${stepTitle}`}
            />
          </View>
        </>
      ) : null}

      {/* ── Deep link in flight ──────────────────────────────────────────
          Resolving the facility already chosen on the previous screen.
          Showing the picker here would flicker back to a decision the
          patient has already made. */}
      {step === 'facility' && !hydratedFromLink ? (
        <View style={styles.centre}>
          {linkedFacilityQuery.isError ? (
            <EmptyCard
              icon="alert-circle"
              tint="red"
              title={t('appointments.book.loadFacilityErrorTitle')}
              message={t('appointments.book.loadFacilityErrorBody')}
            >
              <CareButton
                label={t('appointments.book.chooseAnother')}
                icon="building"
                variant="secondary"
                onPress={() => setHydratedFromLink(true)}
              />
            </EmptyCard>
          ) : (
            <View
              style={styles.loading}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={t('appointments.book.openingFacility')}
              accessibilityLiveRegion="polite"
            >
              <ActivityIndicator color={colors.blue} />
              <Text style={styles.loadingText}>{t('appointments.book.openingFacility')}</Text>
            </View>
          )}
        </View>
      ) : null}

      <FacilityStep vm={vm} />

      <DoctorStep vm={vm} />

      <SlotStep vm={vm} />

      <ConfirmStep vm={vm} />

      <SuccessStep vm={vm} />

      {dialog.element}
    </Screen>
  );
}

// ── styles ────────────────────────────────────────────────────────────────
