import { useMemo, useState, type ReactNode } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  ScreenHeader,
  formatDate,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock } from '@/components/care/shared';
import { useAuthStore } from '@/lib/store/auth';
import {
  useBloodOptions,
  useBloodSearch,
  useCreateBloodRequest,
  type BloodBankResult,
  type BloodComponentValue,
  type BloodGroupValue,
  type CreateBloodRequestInput,
} from '@/lib/api/queries';

/**
 * Emergency Blood Request (SB-01).
 *
 * ── One screen, because an emergency is not a two-step wizard ─────────────
 * `app/blood-finder/request.tsx` is the considered path: details, then a
 * review step that repeats every value before it is sent. That review is right
 * for a planned request and wrong for this one. Here the fields are the
 * minimum the blood bank needs, on one screen, with the submit at the bottom.
 *
 * ── What the reference asks for, and where it actually goes ───────────────
 * The image collects a patient name, age and sex, a patient ID, a hospital and
 * ward, a requester name, their role, and two phone numbers. The API accepts
 * eight fields — facility, group, component, quantity, urgency, contact phone,
 * note and needed-by — and it attaches the request to the AUTHENTICATED
 * patient. So:
 *
 *   - The patient is whoever is signed in. There is no "request for someone
 *     else by typing their name": that would create an unverified identity
 *     next to a blood request, and this platform identifies people by Health
 *     ID or not at all.
 *   - Ward and clinical justification are collected and sent in `note`, which
 *     is what the blood bank reads. They are labelled as going there, so
 *     nobody types into a field that quietly goes nowhere.
 *   - Requester name and role are NOT collected. The request already carries
 *     who sent it.
 *   - The reference's "Preferred Contact Method" four-up row is NOT built.
 *     `contact_phone` is the only contact the endpoint carries; a method
 *     choice could only be prose inside the note, which would promise the
 *     patient a routing rule ("I said WhatsApp") that nothing enforces. In an
 *     emergency that false promise is worse than the missing control.
 *   - "Alternate phone" is not built for the same reason: one phone field,
 *     one phone number.
 *
 * Nothing on this screen is stored anywhere the reference implies but the API
 * does not have.
 *
 * ── Urgency is fixed ──────────────────────────────────────────────────────
 * This screen sends `urgency: emergency` and does not offer the choice. A
 * screen titled "Emergency" with a dropdown that can be set to "Routine" is a
 * trap; somebody who wants routine should use the ordinary request flow. The
 * reference's "Urgency Level" cell is therefore built as a READ-ONLY display
 * in the same two-column row, not as a picker.
 *
 * ── Where the layout departs from the image, and why ──────────────────────
 *   - FOUR component tiles, not the image's five. `BloodComponentType` has
 *     whole_blood, red_cells, platelets and plasma; nothing in this platform
 *     tracks cryoprecipitate, so a fifth tile would name a component no
 *     facility can ever report. Four tiles at 375pt are ~73pt wide, which is
 *     roomier than the five-up the reference could afford at 430pt.
 *   - The image's "Expected Transfusion Time" is a clock. `needed_by` is
 *     validated `after_or_equal:today` — a DATE, no time of day — so the
 *     control is a day chooser and is labelled "Needed by".
 *   - The clinical-justification counter reads /500, not the image's /250:
 *     500 is the server's real `max` on `note`.
 *   - The image's second red button is "Notify Me About Availability". There
 *     is no availability-watch feature on this platform, so that button would
 *     be a promise nothing keeps. The outlined red button dials the chosen
 *     blood bank instead — the one secondary action that is real here, and the
 *     one every safety notice in this feature already tells people to take.
 *   - The kit has no siren and no lightning glyph (see Icon.tsx GLYPHS), so
 *     the banner mark is `alert-triangle` and the PRIORITY pill carries
 *     `alert-circle`.
 */

const COMPONENTS: { value: BloodComponentValue; icon: IconName }[] = [
  { value: 'whole_blood', icon: 'droplet' },
  { value: 'red_cells', icon: 'droplet' },
  { value: 'platelets', icon: 'activity' },
  { value: 'plasma', icon: 'flask' },
];

const NOTE_MAX = 500;
const MAX_UNITS = 6;

/** `needed_by` is `after_or_equal:today`, so every offer starts at today. */
const NEEDED_BY_OFFSETS = [0, 1, 3] as const;

/** Douala, as the default origin — the same one the finder opens on. */
const DEFAULT_ORIGIN = { lat: 4.0511, lng: 9.7679 };

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayFromNow(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

function dial(number: string | null | undefined): void {
  if (!number) return;
  void Linking.openURL(`tel:${number.replace(/\s+/g, '')}`);
}

/* ── Local presentation pieces ───────────────────────────────────────────────
 * These live at MODULE scope, not inside the screen. A component declared in
 * the render body is a new component type on every render, so React unmounts
 * and remounts its subtree — a `TextInput` inside one loses focus after every
 * single keystroke. `styles` and `colors` are passed in instead.
 * ───────────────────────────────────────────────────────────────────────── */

type Styles = ReturnType<typeof makeStyles>;

/** A section card led by a small red circular mark, per the reference. */
function SectionCard({
  styles,
  colors,
  icon,
  title,
  actionLabel,
  onAction,
  flush,
  children,
}: {
  styles: Styles;
  colors: Palette;
  icon: IconName;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <Card variant="flush">
      <View style={styles.sectionHead}>
        <View style={styles.sectionMark}>
          <Icon name={icon} size={16} color={colors.textOnBrand} />
        </View>
        <Text style={styles.sectionTitle} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
        {!!onAction && !!actionLabel && (
          <TouchableOpacity
            onPress={onAction}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel}: ${title}`}
          >
            <Text style={styles.sectionAction}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={flush ? undefined : styles.sectionBody}>{children}</View>
    </Card>
  );
}

/** The reference's inputs are underlined, not boxed. */
function UnderlineInput({
  styles,
  colors,
  icon,
  value,
  onChangeText,
  placeholder,
  label,
  keyboardType,
}: {
  styles: Styles;
  colors: Palette;
  icon?: IconName;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  label: string;
  keyboardType?: 'phone-pad';
}) {
  return (
    <View style={styles.underlineWrap}>
      {!!icon && <Icon name={icon} size={16} color={colors.textMuted} />}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        style={styles.underlineInput}
        accessibilityLabel={label}
      />
    </View>
  );
}

/**
 * A boxed dropdown. The kit has no select and `Card` sets
 * `overflow: 'hidden'`, so a floating menu would be clipped — the options
 * expand inline underneath the box instead.
 */
function SelectField({
  styles,
  colors,
  icon,
  value,
  placeholder,
  label,
  open,
  onToggle,
  children,
}: {
  styles: Styles;
  colors: Palette;
  icon?: IconName;
  value: string | null;
  placeholder: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        accessibilityState={{ expanded: open }}
        style={[styles.selectBox, open && { borderColor: colors.statusCritical }]}
      >
        {!!icon && <Icon name={icon} size={16} color={colors.textMuted} />}
        <Text style={[styles.selectValue, !value && { color: colors.textMuted }]} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </TouchableOpacity>
      {open && <View style={styles.selectList}>{children}</View>}
    </View>
  );
}

function SelectOption({
  styles,
  colors,
  label,
  selected,
  onPress,
}: {
  styles: Styles;
  colors: Palette;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={styles.selectOption}
    >
      <Text style={[styles.selectOptionText, selected && { color: colors.statusCritical }]}>
        {label}
      </Text>
      {selected && <Icon name="check" size={14} color={colors.statusCritical} />}
    </TouchableOpacity>
  );
}

export default function EmergencyBloodRequestScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const patient = useAuthStore((s) => s.patient);
  const options = useBloodOptions();
  const create = useCreateBloodRequest();

  const [bloodGroup, setBloodGroup] = useState<BloodGroupValue | null>(
    (patient?.blood_group as BloodGroupValue | undefined) ?? null,
  );
  const [component, setComponent] = useState<BloodComponentValue>('whole_blood');
  const [units, setUnits] = useState(1);
  const [facility, setFacility] = useState<BloodBankResult | null>(null);
  const [phone, setPhone] = useState(patient?.phone ?? '');
  const [ward, setWard] = useState('');
  const [reason, setReason] = useState('');
  const [neededByOffset, setNeededByOffset] = useState<number | null>(null);

  /** Which inline dropdown is expanded. Cards clip, so no floating menus. */
  const [openField, setOpenField] = useState<'group' | 'neededBy' | null>(null);

  // Which facilities can actually take this request right now.
  const search = useBloodSearch({
    bloodGroup,
    componentType: component,
    lat: DEFAULT_ORIGIN.lat,
    lng: DEFAULT_ORIGIN.lng,
    radiusKm: 100,
    enabled: !!bloodGroup,
  });

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  const groupOptions = options.data?.blood_groups ?? [];
  const facilities = search.data ?? [];
  const canSubmit = !!bloodGroup && !!facility && reason.trim().length > 0;
  const bankNumber = facility?.phone ?? facility?.emergency_contact ?? null;

  const neededByLabel = (offset: number) =>
    offset === 0
      ? t('bloodEmergency.neededByToday')
      : offset === 1
        ? t('bloodEmergency.neededByTomorrow')
        : t('bloodEmergency.neededByInDays', { days: offset });

  /** The reference's "Use my profile" link, doing the only thing it can. */
  const useMyProfile = () => {
    const group = patient?.blood_group as BloodGroupValue | undefined;
    if (!group && !patient?.phone) {
      dialog.alert(t('bloodEmergency.useMyProfile'), t('bloodEmergency.profileEmpty'));
      return;
    }
    if (group) {
      setBloodGroup(group);
      setFacility(null);
    }
    if (patient?.phone) setPhone(patient.phone);
    dialog.alert(t('bloodEmergency.useMyProfile'), t('bloodEmergency.profileFilled'));
  };

  /*
   * The note is assembled from the two fields the reference asks for, because
   * `note` is the only free-text the API carries. Labelled inside the text so
   * the blood bank can tell them apart.
   */
  const composeNote = () => {
    const parts: string[] = [];
    if (ward.trim()) parts.push(`${t('bloodEmergency.wardLabel')}: ${ward.trim()}`);
    if (reason.trim()) parts.push(`${t('bloodEmergency.reasonLabel')}: ${reason.trim()}`);
    return parts.join('\n').slice(0, NOTE_MAX);
  };

  const submit = () => {
    if (!bloodGroup || !facility) return;
    // `needed_by` is a real field on MobileBloodController::store() that the
    // shared `CreateBloodRequestInput` predates, so the payload is that type
    // widened by the one key rather than an edit to the shared data layer.
    const payload: CreateBloodRequestInput & { needed_by?: string | null } = {
      care_facility_id: facility.id,
      blood_group: bloodGroup,
      component_type: component,
      quantity: units,
      urgency: 'emergency',
      contact_phone: phone.trim() || null,
      note: composeNote(),
      needed_by: neededByOffset === null ? null : isoDate(dayFromNow(neededByOffset)),
    };

    create.mutate(payload, {
      onSuccess: (created) =>
        router.replace({
          pathname: '/blood-finder/status',
          params: { requestId: created.id },
        }),
      onError: () => dialog.alert(t('bloodEmergency.failedTitle'), t('bloodEmergency.failedBody')),
    });
  };

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('bloodEmergency.title')}
        subtitle={t('bloodEmergency.subtitle')}
        onBack={goBack}
        actions={[
          {
            icon: 'help-circle',
            onPress: () => router.push('/blood-finder/education'),
            accessibilityLabel: t('bloodEmergency.learn'),
          },
        ]}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── The priority banner, and the sentence that has to come before
              any form on a screen like this ─────────────────────────────── */}
        <View style={styles.lead} accessibilityRole="alert">
          <View style={styles.leadRow}>
            <View style={styles.leadMark}>
              <Icon name="alert-triangle" size={22} color={colors.statusCritical} />
            </View>
            <View style={styles.leadBody}>
              <Text style={styles.leadTitle}>{t('bloodEmergency.leadTitle')}</Text>
              <Text style={styles.leadText}>{t('bloodEmergency.leadBody')}</Text>
            </View>
            <View style={styles.priorityPill}>
              <Icon name="alert-circle" size={11} color={colors.textOnBrand} />
              <Text style={styles.priorityText}>{t('bloodEmergency.priorityPill')}</Text>
            </View>
          </View>
          <CareButton
            label={t('bloodEmergency.findEr')}
            icon="first-aid"
            variant="dangerSolid"
            size="sm"
            onPress={() => router.push('/care-map')}
            style={styles.leadAction}
          />
        </View>

        {/* ── Who this is for ──────────────────────────────────────────────── */}
        <SectionCard
          styles={styles}
          colors={colors}
          icon="person"
          title={t('bloodEmergency.patientTitle')}
          actionLabel={t('bloodEmergency.useMyProfile')}
          onAction={useMyProfile}
        >
          <View style={styles.patientRow}>
            <View style={[styles.patientMark, { backgroundColor: colors.tintBlueBg }]}>
              <Icon name="person" size={20} color={colors.blue} />
            </View>
            <View style={styles.patientBody}>
              <Text style={styles.patientName}>
                {[patient?.first_name, patient?.last_name].filter(Boolean).join(' ') ||
                  t('bloodEmergency.you')}
              </Text>
              {patient?.health_id ? <Text style={styles.muted}>{patient.health_id}</Text> : null}
            </View>
          </View>
          {/* The reference offers "request for someone else" by typing a name.
              This platform identifies people by Health ID or not at all, so the
              request is attached to whoever is signed in. */}
          <Text style={styles.hint}>{t('bloodEmergency.patientHint')}</Text>

          {/* The reference's two-column field row: a boxed group select beside
              the hospital / ward line. */}
          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>{t('bloodEmergency.groupLabel')}</Text>
              <SelectField
                styles={styles}
                colors={colors}
                icon="droplet"
                label={t('bloodEmergency.groupLabel')}
                value={bloodGroup}
                placeholder={t('bloodEmergency.groupPlaceholder')}
                open={openField === 'group'}
                onToggle={() => setOpenField((f) => (f === 'group' ? null : 'group'))}
              >
                {groupOptions.map((group) => (
                  <SelectOption
                    key={group.value}
                    styles={styles}
                    colors={colors}
                    label={group.label}
                    selected={group.value === bloodGroup}
                    onPress={() => {
                      setBloodGroup(group.value);
                      setFacility(null);
                      setOpenField(null);
                    }}
                  />
                ))}
              </SelectField>
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>{t('bloodEmergency.wardLabel')}</Text>
              <UnderlineInput
                styles={styles}
                colors={colors}
                icon="building"
                label={t('bloodEmergency.wardLabel')}
                value={ward}
                onChangeText={setWard}
                placeholder={t('bloodEmergency.wardPlaceholder')}
              />
            </View>
          </View>
          <Text style={styles.hint}>{t('bloodEmergency.wardHint')}</Text>
        </SectionCard>

        {/* ── What is needed ───────────────────────────────────────────────── */}
        <SectionCard
          styles={styles}
          colors={colors}
          icon="droplet"
          title={t('bloodEmergency.needTitle')}
        >
          <Text style={styles.fieldLabel}>{t('bloodEmergency.componentLabel')}</Text>
          <View
            style={styles.tileRow}
            accessibilityRole="radiogroup"
            accessibilityLabel={t('bloodEmergency.componentGroupA11y')}
          >
            {COMPONENTS.map((option) => {
              const on = option.value === component;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => {
                    setComponent(option.value);
                    setFacility(null);
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="radio"
                  accessibilityLabel={t(`bloodFinder.components.${option.value}`)}
                  accessibilityState={{ selected: on, checked: on }}
                  style={[
                    styles.tile,
                    on && { borderColor: colors.statusCritical, backgroundColor: colors.statusCriticalBg },
                  ]}
                >
                  <Icon
                    name={option.icon}
                    size={20}
                    color={on ? colors.statusCritical : colors.textSecondary}
                  />
                  <Text
                    style={[styles.tileLabel, on && { color: colors.statusCritical }]}
                    numberOfLines={2}
                  >
                    {t(`bloodFinder.components.${option.value}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Units stepper beside the needed-by chooser, as the reference pairs
              "Units Requested" with "Expected Transfusion Time". */}
          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>{t('bloodEmergency.unitsLabel')}</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  onPress={() => setUnits((u) => Math.max(1, u - 1))}
                  disabled={units <= 1}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('bloodEmergency.unitsLabel')} −`}
                  accessibilityState={{ disabled: units <= 1 }}
                  style={[styles.stepButton, units <= 1 && styles.stepButtonOff]}
                >
                  <Icon
                    name="minus"
                    size={16}
                    color={units <= 1 ? colors.textMuted : colors.statusCritical}
                  />
                </TouchableOpacity>
                <Text style={styles.stepNumber} accessibilityLabel={`${units}`}>
                  {units}
                </Text>
                <TouchableOpacity
                  onPress={() => setUnits((u) => Math.min(MAX_UNITS, u + 1))}
                  disabled={units >= MAX_UNITS}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('bloodEmergency.unitsLabel')} +`}
                  accessibilityState={{ disabled: units >= MAX_UNITS }}
                  style={[styles.stepButton, units >= MAX_UNITS && styles.stepButtonOff]}
                >
                  <Icon
                    name="plus"
                    size={16}
                    color={units >= MAX_UNITS ? colors.textMuted : colors.statusCritical}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>{t('bloodEmergency.neededByLabel')}</Text>
              <SelectField
                styles={styles}
                colors={colors}
                icon="clock"
                label={t('bloodEmergency.neededByLabel')}
                value={neededByOffset === null ? null : neededByLabel(neededByOffset)}
                placeholder={t('bloodEmergency.neededByPlaceholder')}
                open={openField === 'neededBy'}
                onToggle={() => setOpenField((f) => (f === 'neededBy' ? null : 'neededBy'))}
              >
                {NEEDED_BY_OFFSETS.map((offset) => (
                  <SelectOption
                    key={offset}
                    styles={styles}
                    colors={colors}
                    label={
                      offset > 1
                        ? `${neededByLabel(offset)} · ${formatDate(dayFromNow(offset))}`
                        : neededByLabel(offset)
                    }
                    selected={offset === neededByOffset}
                    onPress={() => {
                      setNeededByOffset(offset);
                      setOpenField(null);
                    }}
                  />
                ))}
              </SelectField>
            </View>
          </View>

          <Text style={[styles.fieldLabel, styles.spacer]}>{t('bloodEmergency.reasonLabel')}</Text>
          <View style={styles.noteBox}>
            <View style={styles.noteHead}>
              <TextInput
                value={reason}
                onChangeText={(value) => setReason(value.slice(0, NOTE_MAX))}
                placeholder={t('bloodEmergency.reasonPlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                style={styles.noteInput}
                accessibilityLabel={t('bloodEmergency.reasonLabel')}
              />
              <Icon name="clipboard" size={16} color={colors.statusCritical} />
            </View>
            <Text style={styles.counter}>{`${reason.length}/${NOTE_MAX}`}</Text>
          </View>
          {/* Says where the text goes, so nobody types into a field that
              quietly goes nowhere. */}
          <Text style={styles.hint}>{t('bloodEmergency.noteHint')}</Text>
        </SectionCard>

        {/* ── Where from ───────────────────────────────────────────────────── */}
        <SectionCard
          styles={styles}
          colors={colors}
          icon="location"
          title={t('bloodEmergency.facilityTitle')}
          flush
        >
          {!bloodGroup ? (
            <EmptyState
              icon="droplet"
              tint="red"
              title={t('bloodEmergency.pickGroupTitle')}
              message={t('bloodEmergency.pickGroupBody')}
            />
          ) : search.isPending ? (
            <LoadingBlock label={t('bloodFinder.searching')} />
          ) : facilities.length === 0 ? (
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('bloodEmergency.noFacilityTitle')}
              message={t('bloodEmergency.noFacilityBody')}
              actionLabel={t('bloodEmergency.findEr')}
              onAction={() => router.push('/care-map')}
            />
          ) : (
            facilities.slice(0, 6).map((row, index) => (
              <ListRow
                key={row.id}
                icon="droplet"
                tint="red"
                title={row.name}
                meta={[
                  [row.city, row.region].filter(Boolean).join(', ') || null,
                  row.availability?.units_range
                    ? t('bloodEmergency.reports', { units: row.availability.units_range })
                    : null,
                ]}
                trailing={
                  facility?.id === row.id ? (
                    <Icon name="check-circle" size={20} color={colors.statusNormal} />
                  ) : undefined
                }
                chevron={false}
                divider={index < Math.min(facilities.length, 6) - 1}
                onPress={() => setFacility(row)}
              />
            ))
          )}
        </SectionCard>

        {/* ── How the blood bank reaches you ───────────────────────────────── */}
        <SectionCard
          styles={styles}
          colors={colors}
          icon="phone"
          title={t('bloodEmergency.contextTitle')}
          actionLabel={t('bloodEmergency.useMyProfile')}
          onAction={useMyProfile}
        >
          <Text style={styles.fieldLabel}>{t('bloodEmergency.contactLabel')}</Text>
          <UnderlineInput
            styles={styles}
            colors={colors}
            icon="phone"
            label={t('bloodEmergency.contactLabel')}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('bloodModify.phonePlaceholder')}
            keyboardType="phone-pad"
          />
          {/* One field, because `contact_phone` is one field. The reference's
              alternate number and its four-up "Preferred Contact Method" row
              have nowhere to go — see the note at the top of this file. */}
        </SectionCard>

        {/* ── The reference's two-up summary row ───────────────────────────── */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <View style={styles.summaryHead}>
              <Icon name="location" size={14} color={colors.statusCritical} />
              <Text style={styles.summaryLabel} numberOfLines={1}>
                {t('bloodEmergency.pickupLabel')}
              </Text>
            </View>
            <Text
              style={[styles.summaryValue, !facility && { color: colors.textMuted }]}
              numberOfLines={2}
            >
              {facility?.name ?? t('bloodEmergency.pickupNone')}
            </Text>
          </View>
          {/* Read-only on purpose: this screen always sends `emergency`, and a
              picker here could be set to "Routine" on a screen titled
              Emergency. */}
          <View style={styles.summaryCell}>
            <View style={styles.summaryHead}>
              <Icon name="alert-circle" size={14} color={colors.statusCritical} />
              <Text style={styles.summaryLabel} numberOfLines={1}>
                {t('bloodEmergency.urgencyLabel')}
              </Text>
            </View>
            <Text style={[styles.summaryValue, { color: colors.statusCritical }]}>
              {t('bloodEmergency.urgencyValue')}
            </Text>
            <Text style={styles.muted}>{t('bloodEmergency.urgencyFixed')}</Text>
          </View>
        </View>

        {/* ── The amber note the reference closes the form with ─────────────── */}
        <View
          style={styles.importantPanel}
          accessible
          accessibilityRole="alert"
          accessibilityLabel={`${t('bloodEmergency.importantTitle')}. ${t('bloodEmergency.importantBody')}`}
        >
          <View style={styles.importantMark}>
            <Icon name="shield-check" size={18} color={colors.textOnBrand} />
          </View>
          <View style={styles.importantBody}>
            <Text style={styles.importantTitle}>{t('bloodEmergency.importantTitle')}</Text>
            <Text style={styles.importantText}>{t('bloodEmergency.importantBody')}</Text>
          </View>
          {/* Decorative ECG trace, as in the reference. */}
          <Icon name="heart-rate" size={28} color={colors.statusWarning} />
        </View>

        <CareButton
          label={create.isPending ? t('bloodEmergency.sending') : t('bloodEmergency.submit')}
          icon="droplet"
          variant="dangerSolid"
          disabled={!canSubmit || create.isPending}
          onPress={submit}
        />
        <CareButton
          label={bankNumber ? t('bloodEmergency.callBank') : t('bloodEmergency.callBankNone')}
          icon="phone"
          variant="danger"
          disabled={!bankNumber}
          onPress={() => dial(bankNumber)}
          style={styles.secondaryButton}
        />
        {!canSubmit ? <Text style={styles.hint}>{t('bloodEmergency.needAll')}</Text> : null}

        <View style={styles.footer}>
          <Icon name="lock" size={13} color={colors.textMuted} />
          <Text style={styles.footerText}>{t('bloodEmergency.privacyFooter')}</Text>
        </View>
      </ScrollView>

      {dialog.element}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

    /* Lead / priority banner */
    lead: {
      backgroundColor: c.statusCriticalBg,
      borderWidth: 1,
      borderColor: c.statusCritical,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    leadRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    leadMark: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leadBody: { flex: 1 },
    leadTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: c.statusCritical,
    },
    leadText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
      marginTop: 4,
    },
    priorityPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: c.statusCritical,
      borderRadius: radii.sm,
      paddingHorizontal: 7,
      paddingVertical: 5,
    },
    priorityText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 9,
      letterSpacing: 0.5,
      color: c.textOnBrand,
    },
    leadAction: { marginTop: spacing.md, alignSelf: 'flex-start' },

    /* Section card head */
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      paddingBottom: spacing.sm,
    },
    sectionMark: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.statusCritical,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    sectionAction: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: c.statusCritical,
    },
    sectionBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },

    patientRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    patientMark: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    patientBody: { flex: 1 },
    patientName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },

    fieldLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textPrimary,
      marginBottom: spacing.xs,
    },
    spacer: { marginTop: spacing.md },
    /* Two columns at 375pt is ~140pt of field each — enough for a group
       select and a ward line, which is why the reference's three-up field
       rows are rebalanced to two. */
    fieldRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.md },
    fieldCol: { flex: 1, minWidth: 0 },

    underlineWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      minWidth: 0,
    },
    underlineInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 8,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    selectBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 9,
      backgroundColor: c.surface,
      minWidth: 0,
    },
    selectValue: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    selectList: {
      marginTop: 4,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.sm,
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    selectOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.divider,
    },
    selectOptionText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: c.textPrimary,
      flexShrink: 1,
    },

    /* Component tiles — four-up, ~73pt each at 375pt. The label is 10px on two
       lines, which is what makes a boxed tile row survive that width. */
    tileRow: { flexDirection: 'row', gap: 6 },
    tile: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      gap: 4,
      paddingVertical: spacing.sm,
      paddingHorizontal: 2,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.sm,
      backgroundColor: c.surface,
    },
    tileLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 10,
      lineHeight: 13,
      height: 26,
      textAlign: 'center',
      color: c.textSecondary,
    },

    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.sm,
      paddingHorizontal: 6,
      paddingVertical: 5,
      backgroundColor: c.surface,
    },
    stepButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: c.statusCritical,
      backgroundColor: c.statusCriticalBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepButtonOff: { borderColor: c.border, backgroundColor: c.surfaceMuted },
    stepNumber: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },

    noteBox: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.sm,
      backgroundColor: c.surface,
      padding: spacing.sm,
    },
    noteHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    noteInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 72,
      padding: 0,
      textAlignVertical: 'top',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    counter: {
      alignSelf: 'flex-end',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    summaryRow: { flexDirection: 'row', gap: spacing.sm },
    summaryCell: {
      flex: 1,
      minWidth: 0,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.md,
      padding: spacing.sm + 2,
      gap: 4,
    },
    summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    summaryLabel: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textPrimary,
    },
    summaryValue: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    importantPanel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.statusWarningBg,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    importantMark: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.statusWarning,
      alignItems: 'center',
      justifyContent: 'center',
    },
    importantBody: { flex: 1, minWidth: 0 },
    importantTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.statusWarning,
    },
    importantText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
      marginTop: 2,
    },

    /* The reference's second button is an outlined red one; CareButton's
       `danger` skin borders with the tint, so the outline is restated here. */
    secondaryButton: { borderColor: c.statusCritical },

    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      marginTop: spacing.xs,
    },
    footerText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    muted: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      marginTop: 6,
    },
  });
