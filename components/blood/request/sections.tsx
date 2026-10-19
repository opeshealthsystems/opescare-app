/** Large JSX sections of the blood request screen (app/blood-finder/request.tsx). */
import {
  Share,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
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
  formatTime,
  type Step,
} from '@/components/opes-ui';
import { CareButton, InfoRow, NoticeBanner } from '@/components/care/shared';
import { type BloodUrgencyValue } from '@/lib/api/queries';
import {
  URGENCY_ICON,
  URGENCY_TONE,
  URGENCY_FIELD_TONE,
  BLOOD_TINT,
  PHONE_MAX_LENGTH,
  REQUEST_FOR_MAX_LENGTH,
  CONTACT_CHOICES,
  CONTACT_ICON,
  facilityIcon,
  FRESHNESS_TONE,
  VERIFICATION_FALLBACK,
  isVerified,
  dial,
  LIFECYCLE,
} from '@/components/blood/request/helpers';
import {
  Fact,
  SelectField,
  DropdownField,
  RadioTile,
  FactGrid,
  Bullet,
  ActionTile,
  StepperButton,
  FailurePanel,
} from '@/components/blood/request/parts';
import type { BloodRequestFormModel, BloodRequestView } from './useBloodRequestForm';

/** PM-BLOOD-04 · Blood Request Confirmed. Rendered only once `confirmed` is set. */
export function ConfirmedView({ vm }: { vm: BloodRequestFormModel }) {
  const { t, router, colors, styles, patient, contactChoice, showRoute, setShowRoute, confirmed, facility, phone, hasCoords, availability, contactLabelOf, forWho } = vm;
  if (!confirmed) return null;
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
  const confirmedComponent = t(`bloodFinder.components.${confirmed.component_type}`, {
    defaultValue: confirmed.component_label,
  });
  const statusLabel = t(`bloodFinder.statuses.${confirmed.status}`, {
    defaultValue: confirmed.status_label,
  });

  /* The reference's four-across header row. At 375pt it wraps to 2 × 2 —
     same cells, same dividers, same reading order. */
  const stats: Fact[] = [
    {
      key: 'date',
      icon: 'calendar',
      label: t('bloodFinder.request.statDate', { defaultValue: 'Date' }),
      value: confirmed.created_at ? formatDate(confirmed.created_at) : '—',
      sub: confirmed.created_at ? formatTime(confirmed.created_at) : null,
    },
    {
      key: 'status',
      icon: 'clock',
      label: t('bloodFinder.request.statStatus', { defaultValue: 'Status' }),
      value: statusLabel,
      valueColor: colors.statusNormal,
      sub: confirmed.is_open
        ? t('bloodFinder.request.statOnHold', { defaultValue: 'On hold' })
        : null,
    },
    {
      key: 'units',
      icon: 'droplet',
      label: t('bloodFinder.request.statUnits', { defaultValue: 'Units reserved' }),
      value: String(confirmed.quantity),
      valueColor: colors.link,
      sub: `${confirmed.blood_group} · ${confirmedComponent}`,
    },
  ];
  if (confirmed.expires_at) {
    stats.push({
      key: 'expires',
      icon: 'history',
      label: t('bloodFinder.request.statExpires', { defaultValue: 'Reservation expires' }),
      value: formatDate(confirmed.expires_at),
      sub: formatTime(confirmed.expires_at),
    });
  }

  /* The reference's 4 × 2 summary grid, 2 × 4 at this width. Every cell is a
     value that was actually transmitted. */
  const summary: Fact[] = [
    {
      key: 'patient',
      icon: 'person',
      label: t('bloodFinder.request.patientLabel', { defaultValue: 'Patient' }),
      value: patient?.display_name || '—',
      sub: patient?.health_id ?? null,
    },
    {
      key: 'group',
      icon: 'droplet',
      label: t('bloodFinder.bloodGroup'),
      value: confirmed.blood_group,
      valueColor: colors.statusCritical,
    },
    {
      key: 'component',
      icon: 'flask',
      label: t('bloodFinder.component'),
      value: confirmedComponent,
    },
    {
      key: 'quantity',
      icon: 'receipt',
      label: t('bloodFinder.request.reviewUnits'),
      value: String(confirmed.quantity),
    },
    {
      key: 'urgency',
      icon: URGENCY_ICON[confirmed.urgency],
      label: t('bloodFinder.request.reviewUrgency'),
      value: t(`bloodFinder.urgencies.${confirmed.urgency}`),
      valueColor:
        URGENCY_TONE[confirmed.urgency] === 'critical'
          ? colors.statusCritical
          : URGENCY_TONE[confirmed.urgency] === 'warning'
            ? colors.statusWarning
            : undefined,
    },
    {
      key: 'neededBy',
      icon: 'calendar',
      label: t('bloodFinder.request.neededBy', { defaultValue: 'Needed by' }),
      value: confirmed.needed_by
        ? formatDate(confirmed.needed_by)
        : t('bloodFinder.request.neededByAny', { defaultValue: 'Not specified' }),
      valueColor: confirmed.needed_by ? undefined : colors.textMuted,
    },
    {
      key: 'requestFor',
      icon: 'users',
      label: t('bloodFinder.request.requestForLabel', { defaultValue: 'Request for' }),
      value: forWho || t('bloodFinder.request.requestForSelf', { defaultValue: 'Self' }),
    },
    {
      key: 'contact',
      icon: CONTACT_ICON[contactChoice],
      label: t('bloodFinder.request.contactTitle', { defaultValue: 'Contact preference' }),
      value: contactLabelOf(contactChoice),
      sub: confirmed.contact_phone,
    },
  ];

  const shareRequest = () => {
    Share.share({
      message: t('bloodFinder.request.shareMessage', {
        reference: confirmed.reference,
        units: confirmed.quantity,
        group: confirmed.blood_group,
        component: confirmedComponent,
        facility: facilityName,
        defaultValue:
          'OpesCare blood request {{reference}} — {{units}} × {{group}} {{component}} at {{facility}}.',
      }),
    }).catch(() => undefined);
  };

  const openStatus = () =>
    router.push({ pathname: '/blood-finder/status', params: { requestId: confirmed.id } });

  return (
    <Screen className="px-0">
      <ScreenHeader
        // Short on purpose: `ScreenHeader` truncates its title to one line at
        // 24px and the right-hand Share pill takes ~80pt of it. The full
        // sentence is the hero title inside the first card, as in the
        // reference.
        title={t('bloodFinder.request.confirmedTitle', { defaultValue: 'Request confirmed' })}
        subtitle={t('bloodFinder.request.confirmedSubtitle', {
          defaultValue: 'Your request has been created.',
        })}
        showBack={false}
        right={
          <TouchableOpacity
            onPress={shareRequest}
            activeOpacity={0.7}
            style={styles.headerPill}
            accessibilityRole="button"
            accessibilityLabel={t('bloodFinder.request.share', { defaultValue: 'Share' })}
          >
            <Icon name="share" size={16} color={colors.link} />
            <Text style={styles.headerPillText}>
              {t('bloodFinder.request.share', { defaultValue: 'Share' })}
            </Text>
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero + the request ID + the four facts: one card, as PM-BLOOD-04. */}
        <Card variant="flush">
          <View style={styles.hero} accessibilityLiveRegion="polite">
            <View style={styles.heroMark}>
              <Icon name="check" size={40} color={colors.statusNormal} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle} accessibilityRole="header">
                {t('bloodFinder.request.confirmedHero', {
                  defaultValue: 'Blood request confirmed',
                })}
              </Text>
              <Text style={styles.heroBody}>
                {t('bloodFinder.request.confirmedThanks', {
                  defaultValue: 'Thank you for helping save lives.',
                })}
              </Text>
            </View>
          </View>

          {/* The one thing to show at the counter. Full width rather than a
              right-hand panel: at 375pt the reference's side-by-side split
              leaves the hero title three words to a line. */}
          <View style={styles.referencePanel}>
            <Text style={styles.referenceLabel}>
              {t('bloodFinder.request.requestIdLabel', { defaultValue: 'Request ID' })}
            </Text>
            <Text style={styles.referenceValue} accessibilityLabel={confirmed.reference}>
              {confirmed.reference}
            </Text>
          </View>

          <FactGrid facts={stats} columns={4} />
        </Card>

        {/* Where the request has actually got to. Real statuses only. */}
        <Card>
          <StepProgress
            steps={lifecycleSteps}
            currentIndex={lifecycleIndex}
            accessibilityLabel={statusLabel}
          />
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
          <View style={styles.cardHead}>
            <Icon name="document" size={20} color={colors.link} />
            <Text style={styles.cardHeadTitle} accessibilityRole="header">
              {t('bloodFinder.request.summaryTitle', { defaultValue: 'Request summary' })}
            </Text>
            <TouchableOpacity
              onPress={openStatus}
              activeOpacity={0.7}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('bloodFinder.request.viewDetails', {
                defaultValue: 'View details',
              })}
            >
              <Text style={styles.linkText}>
                {t('bloodFinder.request.viewDetails', { defaultValue: 'View details' })}
              </Text>
            </TouchableOpacity>
          </View>
          <FactGrid facts={summary} />
          {confirmed.patient_note ? (
            <View style={styles.noteBlock}>
              <Text style={styles.fieldLabel}>{t('bloodFinder.request.note')}</Text>
              <Text style={styles.noteBlockText}>{confirmed.patient_note}</Text>
            </View>
          ) : null}
        </Card>

        {/* One facility, not two: the request is placed AT the facility that
            holds the units, so the reference's separate "blood bank" and
            "receiving hospital" blocks are the same record here. */}
        {facilityName ? (
          <Card variant="flush">
            <ListRow
              icon={facilityIcon(facility?.facility_type)}
              tint={BLOOD_TINT}
              title={facilityName}
              meta={[
                facilityPlace || null,
                confirmedPhone,
                availability?.units_range
                  ? t('bloodFinder.unitsRange', { range: availability.units_range })
                  : null,
              ]}
              chevron={false}
              trailing={
                isVerified(facility?.verification_status) ? (
                  <StatusBadge
                    status="verified"
                    tone="normal"
                    label={t('bloodFinder.verified')}
                    size="sm"
                  />
                ) : undefined
              }
              divider
            />
            <View style={styles.cardFoot}>
              <CareButton
                label={t('bloodFinder.getDirections')}
                icon="location"
                variant="secondary"
                size="sm"
                disabled={!hasCoords}
                onPress={() => setShowRoute((v) => !v)}
                style={styles.footAction}
              />
              {confirmedPhone ? (
                <CareButton
                  label={t('bloodFinder.call')}
                  icon="phone"
                  variant="dangerSolid"
                  size="sm"
                  onPress={() => dial(confirmedPhone)}
                  style={styles.footAction}
                />
              ) : null}
            </View>
            {/* In-app directions, not a hand-off to an external maps app. */}
            {showRoute && hasCoords && facility ? (
              <FacilityMap facilities={facility} height={200} directions />
            ) : null}
          </Card>
        ) : null}

        <Card variant="flush">
          <View style={styles.cardHead}>
            <Icon name="info" size={20} color={colors.link} />
            <Text style={styles.cardHeadTitle} accessibilityRole="header">
              {t('bloodFinder.request.instructionsTitle', {
                defaultValue: 'Important instructions',
              })}
            </Text>
          </View>
          <View style={styles.bullets}>
            {[
              t('bloodFinder.request.instructionCall', {
                defaultValue:
                  'Call the blood bank before travelling to confirm the units are still there.',
              }),
              t('bloodFinder.request.instructionBring', {
                defaultValue: "Bring this reference and the patient's Health ID to the counter.",
              }),
              t('bloodFinder.request.next1'),
              t('bloodFinder.request.next2'),
            ].map((line, index) => (
              <Bullet key={index} text={line} />
            ))}
          </View>
        </Card>

        <NoticeBanner
          icon="shield-check"
          tone="pending"
          title={t('bloodFinder.safetyTitle')}
          message={t('bloodFinder.safetyBody')}
        />

        <GradientButton
          label={t('bloodFinder.request.viewStatus', { defaultValue: 'View request status' })}
          onPress={openStatus}
        />

        {/* PM-BLOOD-04's action row. Download and Print are not here: there is
            no document endpoint and no print path behind them, and a tile
            that does nothing is not a tile. */}
        <View style={styles.tileRow}>
          <ActionTile
            icon="share"
            label={t('bloodFinder.request.share', { defaultValue: 'Share' })}
            onPress={shareRequest}
          />
          <ActionTile
            icon="phone"
            label={t('bloodFinder.call')}
            disabled={!confirmedPhone}
            onPress={() => dial(confirmedPhone)}
          />
          <ActionTile
            icon="location"
            label={t('bloodFinder.getDirections')}
            disabled={!hasCoords}
            onPress={() => setShowRoute(true)}
          />
        </View>

        <CareButton
          label={t('bloodFinder.request.backToSearch')}
          icon="search"
          variant="secondary"
          onPress={() => router.replace('/blood-finder')}
        />
      </ScrollView>
    </Screen>
  );
}

export function PatientSection({ vm }: { vm: BloodRequestView }) {
  const { t, colors, styles, patient, forOther, setForOther, forWhoInput, setForWhoInput, dobLine } = vm;
  return (
    <>
      {/* Patient information — who the units are for. */}
      <Card>
        <Text style={styles.cardTitle} accessibilityRole="header">
          {t('bloodFinder.request.patientTitle', { defaultValue: 'Patient information' })}
        </Text>
        <View style={styles.patientRow}>
          <View style={styles.avatar}>
            <Icon name="person" size={26} color={colors.tintBlue} />
          </View>
          <View style={styles.patientText}>
            <Text style={styles.patientName} numberOfLines={2}>
              {patient?.display_name || '—'}
            </Text>
            {patient?.health_id ? (
              <Text style={styles.patientId} numberOfLines={1}>
                {t('bloodFinder.request.healthIdLine', {
                  id: patient.health_id,
                  defaultValue: 'Health ID: {{id}}',
                })}
              </Text>
            ) : null}
            {dobLine ? (
              <Text style={styles.patientMeta} numberOfLines={1}>
                {dobLine}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => {
              if (forOther) setForWhoInput('');
              setForOther((v) => !v);
            }}
            activeOpacity={0.75}
            style={[styles.forPill, forOther && styles.forPillOn]}
            accessibilityRole="switch"
            accessibilityState={{ checked: forOther }}
            accessibilityLabel={t('bloodFinder.request.forSomeoneElse', {
              defaultValue: 'Request for someone else',
            })}
          >
            <Icon name="users" size={16} color={forOther ? colors.textOnBrand : colors.link} />
            <Text style={[styles.forPillText, forOther && styles.forPillTextOn]}>
              {t('bloodFinder.request.forSomeoneElse', {
                defaultValue: 'Request for someone else',
              })}
            </Text>
          </TouchableOpacity>
        </View>

        {forOther ? (
          <View style={styles.forBlock}>
            <Text style={styles.fieldLabel}>
              {t('bloodFinder.request.forWhoLabel', { defaultValue: 'Who is this for?' })}
            </Text>
            <TextInput
              style={styles.textInput}
              value={forWhoInput}
              onChangeText={setForWhoInput}
              placeholder={t('bloodFinder.request.forWhoPlaceholder', {
                defaultValue: 'Name and relationship',
              })}
              placeholderTextColor={colors.textMuted}
              maxLength={REQUEST_FOR_MAX_LENGTH}
              accessibilityLabel={t('bloodFinder.request.forWhoLabel', {
                defaultValue: 'Who is this for?',
              })}
            />
            {/* Said out loud, because it is the whole reason this control
                is allowed to exist: there is no patient-ID field on the
                request, so this line travels inside `note`. */}
            <Text style={styles.fieldHint}>
              {t('bloodFinder.request.forWhoHint', {
                defaultValue:
                  'OpesCare has no separate field for this, so it is sent to the blood bank as the first line of your note.',
              })}
            </Text>
          </View>
        ) : null}
      </Card>
    </>
  );
}

export function FacilitySection({ vm }: { vm: BloodRequestView }) {
  const { t, styles, facility, emergencyLine, phone, secondaryLine, listedLine, hasCoords, availability, stockLabel, freshnessKey, freshnessLabel, verificationKey } = vm;
  return (
    <>
      {/* Receiving facility. ABOVE the requirement block, unlike the
          reference: the safety notice tells every patient to phone before
          travelling, and that number must not sit below a form. */}
      <SectionHeader
        title={t('bloodFinder.request.receivingFacility', {
          defaultValue: 'Receiving facility',
        })}
      />
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

      {/* Where it is, and — the part that decides whether any of this is
          worth acting on — exactly when the facility last touched the
          figure. */}
      <Card variant="flush">
        <View style={styles.rows}>
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
    </>
  );
}

export function DetailsForm({ vm }: { vm: BloodRequestView }) {
  const { t, colors, styles, patient, bloodGroup, setPhase, quantity, setQuantity, urgency, setUrgency, neededByOffset, setNeededByOffset, contactChoice, setContactChoice, contactPhone, setContactPhone, note, setNote, openMenu, setOpenMenu, maxUnits, componentLabel, phone, neededByLabel, contactLabelOf, phoneWanted, phoneInvalid, foldPrefix, noteBudget, noteTooLong, canContinue, backToSearch, neededByOptions, urgencyOptions } = vm;
  return (
    <>
      {/* Blood Requirement — the reference's three-across field row,
          laid out 2 + 1 at 375pt. */}
      <Card>
        <Text style={styles.cardTitle} accessibilityRole="header">
          {t('bloodFinder.request.requirementTitle', {
            defaultValue: 'Blood requirement',
          })}
        </Text>

        <View style={styles.fieldRow}>
          {/* Group and component were chosen on the search screen and
              the facility list was filtered by them, so they carry a
              pencil (change it there) rather than a chevron (a menu
              that does not exist here). */}
          <SelectField
            style={styles.fieldCol}
            label={t('bloodFinder.bloodGroup')}
            icon="droplet"
            iconColor={colors.statusCritical}
            value={bloodGroup}
            trailing="edit"
            onPress={backToSearch}
            accessibilityHint={t('bloodFinder.request.changeInSearch', {
              defaultValue: 'Change this in the search',
            })}
          />
          <SelectField
            style={styles.fieldCol}
            label={t('bloodFinder.component')}
            icon="flask"
            value={componentLabel}
            trailing="edit"
            onPress={backToSearch}
            accessibilityHint={t('bloodFinder.request.changeInSearch', {
              defaultValue: 'Change this in the search',
            })}
          />
        </View>

        {/* Urgency is the one thing chosen here, so it is the one real
            dropdown — full width because "Emergency" and its French
            equivalent do not fit a third of 375pt. */}
        <View style={styles.fieldStacked}>
          <DropdownField
            label={t('bloodFinder.request.reviewUrgency')}
            icon={URGENCY_ICON[urgency]}
            value={t(`bloodFinder.urgencies.${urgency}`)}
            tone={URGENCY_FIELD_TONE[urgency]}
            options={urgencyOptions}
            selectedKey={urgency}
            open={openMenu === 'urgency'}
            onToggle={() => setOpenMenu((m) => (m === 'urgency' ? null : 'urgency'))}
            onSelect={(key) => {
              setUrgency(key as BloodUrgencyValue);
              setOpenMenu(null);
            }}
          />
        </View>

        {/* Units stepper beside the tinted advisory panel. */}
        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
          {t('bloodFinder.request.quantity')}
        </Text>
        <View style={styles.unitsRow}>
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
                {t('bloodFinder.request.unitsWord', { defaultValue: 'units' })}
              </Text>
            </View>
            <StepperButton
              icon="plus"
              label="+1"
              disabled={quantity >= maxUnits}
              onPress={() => setQuantity((q) => Math.min(maxUnits, q + 1))}
            />
          </View>
          <View style={styles.advisory}>
            <Icon name="shield-check" size={18} color={colors.link} />
            <View style={styles.advisoryText}>
              <Text style={styles.advisoryStrong}>{t('bloodFinder.trust.lives')}</Text>
              <Text style={styles.advisoryBody}>
                {t('bloodFinder.request.onlyWhatIsNeeded', {
                  defaultValue: 'Please request only what is needed.',
                })}
              </Text>
            </View>
          </View>
        </View>
        <Text style={styles.fieldHint}>
          {t('bloodFinder.request.maxUnits', { max: maxUnits })}
        </Text>
      </Card>

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

      {/* Need By. One field, not two: `needed_by` is stored as a DATE,
          so the reference's "preferred collection time" would be
          discarded on the way in and is not offered. */}
      <Card>
        <Text style={styles.cardTitle} accessibilityRole="header">
          {t('bloodFinder.request.neededBy', { defaultValue: 'Needed by' })}
        </Text>
        <DropdownField
          label={t('bloodFinder.request.requiredDate', { defaultValue: 'Required date' })}
          icon="calendar"
          value={neededByLabel}
          muted={neededByOffset === null}
          options={neededByOptions}
          selectedKey={neededByOffset === null ? 'any' : String(neededByOffset)}
          open={openMenu === 'neededBy'}
          onToggle={() => setOpenMenu((m) => (m === 'neededBy' ? null : 'neededBy'))}
          onSelect={(key) => {
            setNeededByOffset(key === 'any' ? null : Number(key));
            setOpenMenu(null);
          }}
        />
      </Card>

      {/* Request context — the ONE free-text field the request has.
          The reference's second box ("Additional information") and its
          attachments panel are deliberately absent: nothing would
          carry them. */}
      <Card>
        <Text style={styles.cardTitle} accessibilityRole="header">
          {t('bloodFinder.request.contextTitle', { defaultValue: 'Request context' })}
        </Text>
        <Text style={styles.fieldLabel}>
          {t('bloodFinder.request.clinicalIndication', {
            defaultValue: 'Clinical indication / reason',
          })}
        </Text>
        <TextInput
          style={styles.textarea}
          value={note}
          onChangeText={setNote}
          placeholder={t('bloodFinder.request.notePlaceholder')}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={noteBudget}
          textAlignVertical="top"
          accessibilityLabel={t('bloodFinder.request.note')}
        />
        <Text style={noteTooLong ? styles.counterOver : styles.counter}>
          {`${note.length}/${noteBudget}`}
        </Text>
        {foldPrefix ? (
          <Text style={styles.fieldHint}>
            {t('bloodFinder.request.noteFoldHint', {
              defaultValue:
                'Your answers above are added to the top of this note before it is sent.',
            })}
          </Text>
        ) : null}
      </Card>

      {/* Contact preference — three radio tiles. */}
      <Card>
        <Text style={styles.cardTitle} accessibilityRole="header">
          {t('bloodFinder.request.contactTitle', { defaultValue: 'Contact preference' })}
        </Text>
        <Text style={styles.fieldHintTop}>
          {t('bloodFinder.request.contactQuestion', {
            defaultValue: 'How should the blood bank reach you?',
          })}
        </Text>
        <View style={styles.tileRow} accessibilityRole="radiogroup">
          {CONTACT_CHOICES.map((choice) => (
            <RadioTile
              key={choice}
              icon={CONTACT_ICON[choice]}
              label={contactLabelOf(choice)}
              selected={contactChoice === choice}
              onPress={() => setContactChoice(choice)}
            />
          ))}
        </View>
        <Text style={styles.fieldHint}>
          {t('bloodFinder.request.contactFoldNote', {
            defaultValue:
              'There is no separate field for this, so your choice is sent as a line in your note.',
          })}
        </Text>

        {phoneWanted ? (
          <View style={styles.phoneBlock}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>
                {t('bloodFinder.request.contactPhone')}
              </Text>
              {patient?.phone && patient.phone !== contactPhone ? (
                <TouchableOpacity
                  onPress={() => setContactPhone(patient.phone as string)}
                  activeOpacity={0.7}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('bloodFinder.request.useMyNumber', {
                    defaultValue: 'Use my number',
                  })}
                >
                  <Text style={styles.linkText}>
                    {t('bloodFinder.request.useMyNumber', {
                      defaultValue: 'Use my number',
                    })}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <PillInput
              icon={<Icon name="phone" size={18} color={colors.blue} />}
              value={contactPhone}
              onChangeText={setContactPhone}
              placeholder={t('bloodFinder.request.contactPhonePlaceholder')}
              keyboardType="phone-pad"
              maxLength={PHONE_MAX_LENGTH}
              accessibilityLabel={t('bloodFinder.request.contactPhone')}
            />
            <Text style={phoneInvalid ? styles.fieldErrorTight : styles.fieldHintTight}>
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
        ) : (
          <Text style={styles.fieldHint}>
            {t('bloodFinder.request.contactAppHint', {
              defaultValue:
                'No phone number is sent. The blood bank answers in the app only.',
            })}
          </Text>
        )}
      </Card>

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
        disabled={!canContinue}
        onPress={() => setPhase('review')}
        accessibilityHint={t('bloodFinder.request.reviewTitle')}
      />
      <Text style={styles.footnote}>{t('bloodFinder.request.subtitle')}</Text>
    </>
  );
}

export function ReviewPanel({ vm }: { vm: BloodRequestView }) {
  const { t, colors, styles, bloodGroup, failure, createRequest, componentLabel, phone, composedNote, resendable, backToSearch, toForm, onSubmit, reviewFacts } = vm;
  return (
    <>
      {/* Review — everything that will be transmitted, including the
          fields deliberately left empty, before a single byte moves. */}
      <Card variant="flush">
        <View style={styles.cardHead}>
          <Icon name="clipboard" size={20} color={colors.link} />
          <Text style={styles.cardHeadTitle} accessibilityRole="header">
            {t('bloodFinder.request.reviewTitle')}
          </Text>
        </View>
        <FactGrid facts={reviewFacts} />
        <View style={styles.noteBlock}>
          <Text style={styles.fieldLabel}>{t('bloodFinder.request.note')}</Text>
          {/* Printed verbatim: the folded lines are part of what the
              blood bank will read, so they are part of what the
              patient approves. */}
          <Text
            style={composedNote ? styles.noteBlockText : styles.noteBlockEmpty}
            accessibilityLabel={`${t('bloodFinder.request.note')}: ${
              composedNote ||
              t('bloodFinder.request.notProvided', { defaultValue: 'Not provided' })
            }`}
          >
            {composedNote ||
              t('bloodFinder.request.notProvided', { defaultValue: 'Not provided' })}
          </Text>
        </View>
      </Card>

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
  );
}
