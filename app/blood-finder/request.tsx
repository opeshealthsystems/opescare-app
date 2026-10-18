import { ScrollView, Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  formatDate,
  type IconName,
  type Step,
} from '@/components/opes-ui';
import { LoadingBlock } from '@/components/care/shared';
import {
  URGENCIES,
  URGENCY_ICON,
  URGENCY_TONE,
  URGENCY_FIELD_TONE,
  CONTACT_ICON,
  facilityIcon,
  dayFromNow,
  yearsSince,
  NEEDED_BY_OFFSETS,
} from '@/components/blood/request/helpers';
import {
  Option,
  Fact,
  WizardSteps,
  NotAvailablePanel,
} from '@/components/blood/request/parts';
import { useBloodRequestForm } from '@/components/blood/request/useBloodRequestForm';
import { ConfirmedView, PatientSection, FacilitySection, DetailsForm, ReviewPanel } from '@/components/blood/request/sections';

/**
 * Request Blood — PM-BLOOD-03 (Request Details) and PM-BLOOD-04 (Confirmed).
 *
 * Both reference screens live in this one file: the form, its review step, and
 * the confirmed state a sent request lands on.
 *
 * ── The controls ARE the design ─────────────────────────────────────────────
 * The references do not use one repeated pill for everything. Each block has
 * its own control type, and each is built here, locally, out of kit primitives:
 *
 *   · a 2-step INLINE progress strip (`WizardSteps`) — numbered circle with the
 *     label beside it, not the kit's stacked `StepProgress` (which stays, on
 *     the confirmed screen, for the request LIFECYCLE where that shape is right);
 *   · a patient card with a "request for someone else" pill on the right;
 *   · labelled FIELD BOXES (`SelectField`) — the reference's dropdowns. A field
 *     whose value is chosen here carries a chevron and opens an inline option
 *     list (`DropdownField`); a field whose value was chosen on a previous
 *     screen carries a pencil and takes you back there. A chevron that opens
 *     nothing is a lie about the control;
 *   · a units STEPPER beside a tinted advisory panel;
 *   · a text area with a live NN/NNN counter;
 *   · a three-up RADIO row for contact preference;
 *   · a `FactGrid` — the reference's bordered summary/stat grid — shared by the
 *     review step and both grids on the confirmed screen.
 *
 * ── Only the eight fields the endpoint accepts ──────────────────────────────
 * MobileBloodController::store() validates exactly care_facility_id,
 * blood_group, component_type, quantity, urgency, contact_phone, note and
 * needed_by. The reference draws several controls that have nowhere to go:
 *
 *   · Patient bed / ward, Department / unit, and the attachments panel are NOT
 *     rendered. There is no field for them and no file endpoint; a box that
 *     accepts typing and then drops it is worse than no box.
 *   · "Preferred collection time" is not rendered: `needed_by` is stored as a
 *     DATE (`after_or_equal:today`), so a time would be discarded on the way in.
 *   · The reference's second free-text box ("Additional information") is not
 *     rendered either — there is ONE `note`, and two boxes writing into one
 *     field cannot both be honest about where the text went.
 *   · "Request for someone else" and the contact preference DO reach the blood
 *     bank: both are folded into `note` as labelled lines, the section that
 *     collects them says so in plain words, and the review step prints the
 *     composed note verbatim so nothing is transmitted unread.
 *
 * ── 375pt compromises (the references are drawn ~430pt) ─────────────────────
 *   · Blood Group / Component / Urgency is 2 + 1 rather than 3 across: at 375pt
 *     three columns leave ~98pt each and "Whole Blood" alone needs more.
 *   · "Need By" and "Request Context" are stacked, not side by side: a text
 *     area in a 139pt column is not a text area.
 *   · PM-BLOOD-04's stat row is the reference's one row of four. The label
 *     sits UNDER its icon there rather than beside it, which is what lets
 *     "Reservation expires" live in a 72pt cell.
 *   · The contact tiles stack their radio above the label instead of sitting in
 *     a row, so three fit across.
 *   · The five-up action row on PM-BLOOD-04 is three: Download and Print have
 *     no implementation behind them, and a button that does nothing is not a
 *     button.
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
 * number sits near the TOP of both phases: the safety notice tells every
 * patient to call before travelling, and that number must never be below a
 * form. That is why the receiving-facility card sits ABOVE "Blood Requirement"
 * here, where the reference has it below.
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

export default function BloodRequestScreen() {
  const vm = useBloodRequestForm();
  const {
    t,
    router,
    colors,
    styles,
    patient,
    facilityId,
    bloodGroup,
    phase,
    quantity,
    urgency,
    neededByOffset,
    contactChoice,
    confirmed,
    search,
    componentLabel,
    facility,
    neededByLabel,
    contactLabelOf,
    phoneWanted,
    trimmedPhone,
    forWho,
    backToSearch,
    toForm,
  } = vm;

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

  /* ── PM-BLOOD-04 · Blood Request Confirmed ────────────────────────────── */

  if (confirmed) {
    return <ConfirmedView vm={vm} />;
  }

  /* ── PM-BLOOD-03 · Request Details → Review ───────────────────────────── */

  const wizardSteps: Step[] = [
    {
      key: 'details',
      label: t('bloodFinder.request.stepDetailsLong', { defaultValue: 'Request details' }),
    },
    {
      key: 'review',
      label: t('bloodFinder.request.stepReviewLong', { defaultValue: 'Review & confirm' }),
    },
  ];
  const stepIndex = phase === 'form' ? 0 : 1;
  const stepLine = t('bloodFinder.request.stepOfTwo', {
    step: stepIndex + 1,
    label: wizardSteps[stepIndex].label,
    defaultValue: 'Step {{step}} of 2 · {{label}}',
  });

  const patientAge = yearsSince(patient?.dob);
  const dobLine = patient?.dob
    ? `${t('bloodFinder.request.dobLabel', { defaultValue: 'DOB' })}: ${formatDate(patient.dob)}${
        patientAge === null
          ? ''
          : ` · ${t('bloodFinder.request.ageYears', {
              years: patientAge,
              defaultValue: '{{years}} yrs',
            })}`
      }`
    : null;

  const neededByOptions: Option[] = [
    {
      key: 'any',
      label: t('bloodFinder.request.neededByAny', { defaultValue: 'Not specified' }),
      icon: 'close',
    },
    ...NEEDED_BY_OFFSETS.map((offset) => ({
      key: String(offset),
      icon: 'calendar' as IconName,
      label:
        offset === 0
          ? t('bloodFinder.request.neededByToday', { defaultValue: 'Today' })
          : offset === 1
            ? t('bloodFinder.request.neededByTomorrow', { defaultValue: 'Tomorrow' })
            : formatDate(dayFromNow(offset)),
    })),
  ];

  const urgencyOptions: Option[] = URGENCIES.map((value) => ({
    key: value,
    label: t(`bloodFinder.urgencies.${value}`),
    sub: t(`bloodFinder.request.urgencyHints.${value}`),
    icon: URGENCY_ICON[value],
    tone: URGENCY_FIELD_TONE[value],
  }));

  /** The review step's grid — the same control as PM-BLOOD-04's summary. */
  const reviewFacts: Fact[] = [
    {
      key: 'group',
      icon: 'droplet',
      label: t('bloodFinder.bloodGroup'),
      value: bloodGroup,
      valueColor: colors.statusCritical,
    },
    {
      key: 'component',
      icon: 'flask',
      label: t('bloodFinder.component'),
      value: componentLabel,
    },
    {
      key: 'units',
      icon: 'receipt',
      label: t('bloodFinder.request.reviewUnits'),
      value: String(quantity),
    },
    {
      key: 'urgency',
      icon: URGENCY_ICON[urgency],
      label: t('bloodFinder.request.reviewUrgency'),
      value: t(`bloodFinder.urgencies.${urgency}`),
      valueColor:
        URGENCY_TONE[urgency] === 'critical'
          ? colors.statusCritical
          : URGENCY_TONE[urgency] === 'warning'
            ? colors.statusWarning
            : undefined,
    },
    {
      key: 'neededBy',
      icon: 'calendar',
      label: t('bloodFinder.request.neededBy', { defaultValue: 'Needed by' }),
      value: neededByLabel,
      valueColor: neededByOffset === null ? colors.textMuted : undefined,
    },
    {
      key: 'contact',
      icon: CONTACT_ICON[contactChoice],
      label: t('bloodFinder.request.contactTitle', { defaultValue: 'Contact preference' }),
      value: contactLabelOf(contactChoice),
      sub:
        phoneWanted && !trimmedPhone
          ? t('bloodFinder.request.notProvided', { defaultValue: 'Not provided' })
          : trimmedPhone || null,
    },
    {
      key: 'requestFor',
      icon: 'users',
      label: t('bloodFinder.request.requestForLabel', { defaultValue: 'Request for' }),
      value: forWho || t('bloodFinder.request.requestForSelf', { defaultValue: 'Self' }),
    },
    {
      key: 'facility',
      icon: facilityIcon(facility?.facility_type),
      label: t('bloodFinder.request.facility'),
      value: facility?.name ?? '—',
    },
  ];

  // The details/review sections read the narrowed group plus the review-step
  // values built above; `facility` is added where it has been checked.
  const view = {
    ...vm,
    bloodGroup,
    wizardSteps,
    stepIndex,
    stepLine,
    patientAge,
    dobLine,
    neededByOptions,
    urgencyOptions,
    reviewFacts,
  };

  return (
    <Screen className="px-0">
      <ScreenHeader
        // Short title + the step line, exactly as PM-BLOOD-03's header reads.
        title={t('bloodFinder.request.titleShort', { defaultValue: 'Request blood' })}
        subtitle={stepLine}
        onBack={phase === 'review' ? toForm : backToSearch}
        right={
          <View style={styles.headerPill}>
            <Icon name="shield-check" size={16} color={colors.statusNormal} />
            {/* The reference's badge reads "100% Safe". This app does not make
                that claim about blood — availability is self-reported and the
                safety notice says so. The badge states what IS true: the
                request is private and encrypted in transit. */}
            <Text style={styles.headerPillTextGreen}>
              {t('bloodFinder.request.secure', { defaultValue: 'Secure' })}
            </Text>
          </View>
        }
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
            <WizardSteps
              steps={wizardSteps}
              currentIndex={stepIndex}
              accessibilityLabel={stepLine}
            />

            <PatientSection vm={{ ...view, facility }} />

            <FacilitySection vm={{ ...view, facility }} />

            {phase === 'form' ? (
              <>
                <DetailsForm vm={{ ...view, facility }} />
              </>
            ) : (
              <>
                <ReviewPanel vm={{ ...view, facility }} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ── The reference's controls ─────────────────────────────────────────────── */
