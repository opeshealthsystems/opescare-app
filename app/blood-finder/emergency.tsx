import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  SectionHeader,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import { useAuthStore } from '@/lib/store/auth';
import {
  useBloodOptions,
  useBloodSearch,
  useCreateBloodRequest,
  type BloodBankResult,
  type BloodComponentValue,
  type BloodGroupValue,
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
 *
 * Nothing on this screen is stored anywhere the reference implies but the API
 * does not have.
 *
 * ── Urgency is fixed ──────────────────────────────────────────────────────
 * This screen sends `urgency: emergency` and does not offer the choice. A
 * screen titled "Emergency" with a dropdown that can be set to "Routine" is a
 * trap; somebody who wants routine should use the ordinary request flow.
 */

const COMPONENTS: { value: BloodComponentValue; icon: IconName }[] = [
  { value: 'whole_blood', icon: 'droplet' },
  { value: 'red_cells', icon: 'droplet' },
  { value: 'platelets', icon: 'activity' },
  { value: 'plasma', icon: 'flask' },
];

const NOTE_MAX = 500;
const MAX_UNITS = 6;

/** Douala, as the default origin — the same one the finder opens on. */
const DEFAULT_ORIGIN = { lat: 4.0511, lng: 9.7679 };

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
    create.mutate(
      {
        care_facility_id: facility.id,
        blood_group: bloodGroup,
        component_type: component,
        quantity: units,
        urgency: 'emergency',
        contact_phone: phone.trim() || null,
        note: composeNote(),
      },
      {
        onSuccess: (created) =>
          router.replace({
            pathname: '/blood-finder/status',
            params: { requestId: created.id },
          }),
        onError: () =>
          dialog.alert(t('bloodEmergency.failedTitle'), t('bloodEmergency.failedBody')),
      },
    );
  };

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('bloodEmergency.title')}
        subtitle={t('bloodEmergency.subtitle')}
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* The reference's priority banner, and the sentence that has to come
            before any form on a screen like this. */}
        <Card accentColor={colors.statusCritical}>
          <View style={styles.leadRow}>
            <View style={[styles.leadMark, { backgroundColor: colors.statusCriticalBg }]}>
              <Icon name="alert-triangle" size={22} color={colors.statusCritical} />
            </View>
            <View style={styles.leadBody}>
              <Text style={[styles.leadTitle, { color: colors.statusCritical }]}>
                {t('bloodEmergency.leadTitle')}
              </Text>
              <Text style={styles.leadText}>{t('bloodEmergency.leadBody')}</Text>
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
        </Card>

        {/* ── Who this is for ──────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodEmergency.patientTitle')} />
          <Card>
            <View style={styles.patientRow}>
              <View style={[styles.patientMark, { backgroundColor: colors.tintBlueBg }]}>
                <Icon name="person" size={20} color={colors.blue} />
              </View>
              <View style={styles.patientBody}>
                <Text style={styles.patientName}>
                  {[patient?.first_name, patient?.last_name].filter(Boolean).join(' ') ||
                    t('bloodEmergency.you')}
                </Text>
                {patient?.health_id ? (
                  <Text style={styles.muted}>{patient.health_id}</Text>
                ) : null}
              </View>
            </View>
            {/* The reference offers "request for someone else" by typing a
                name. This platform identifies people by Health ID or not at
                all, so the request is attached to whoever is signed in. */}
            <Text style={styles.hint}>{t('bloodEmergency.patientHint')}</Text>
          </Card>
        </View>

        {/* ── What is needed ───────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodEmergency.needTitle')} />
          <Card>
            <Text style={styles.fieldLabel}>{t('bloodEmergency.groupLabel')}</Text>
            <View style={styles.chipWrap}>
              {groupOptions.map((group) => (
                <Chip
                  key={group.value}
                  icon="droplet"
                  label={group.label}
                  selected={group.value === bloodGroup}
                  onPress={() => {
                    setBloodGroup(group.value);
                    setFacility(null);
                  }}
                />
              ))}
            </View>

            <Text style={[styles.fieldLabel, styles.spacer]}>
              {t('bloodEmergency.componentLabel')}
            </Text>
            <View style={styles.chipWrap}>
              {COMPONENTS.map((option) => (
                <Chip
                  key={option.value}
                  icon={option.icon}
                  label={t(`bloodFinder.components.${option.value}`)}
                  selected={option.value === component}
                  onPress={() => {
                    setComponent(option.value);
                    setFacility(null);
                  }}
                />
              ))}
            </View>

            <Text style={[styles.fieldLabel, styles.spacer]}>
              {t('bloodEmergency.unitsLabel')}
            </Text>
            <View style={styles.stepper}>
              <CareButton
                label="−"
                variant="secondary"
                size="sm"
                onPress={() => setUnits((u) => Math.max(1, u - 1))}
                disabled={units <= 1}
                style={styles.stepButton}
              />
              <View style={styles.stepValue}>
                <Text style={styles.stepNumber}>{units}</Text>
                <Text style={styles.muted}>{t('bloodModify.unitsWord')}</Text>
              </View>
              <CareButton
                label="+"
                variant="secondary"
                size="sm"
                onPress={() => setUnits((u) => Math.min(MAX_UNITS, u + 1))}
                disabled={units >= MAX_UNITS}
                style={styles.stepButton}
              />
            </View>
          </Card>
        </View>

        {/* ── Where from ───────────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodEmergency.facilityTitle')} />
          {!bloodGroup ? (
            <Card variant="flush">
              <EmptyState
                icon="droplet"
                tint="red"
                title={t('bloodEmergency.pickGroupTitle')}
                message={t('bloodEmergency.pickGroupBody')}
              />
            </Card>
          ) : search.isPending ? (
            <LoadingBlock label={t('bloodFinder.searching')} />
          ) : facilities.length === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('bloodEmergency.noFacilityTitle')}
                message={t('bloodEmergency.noFacilityBody')}
                actionLabel={t('bloodEmergency.findEr')}
                onAction={() => router.push('/care-map')}
              />
            </Card>
          ) : (
            <Card variant="flush">
              {facilities.slice(0, 6).map((row, index) => (
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
              ))}
            </Card>
          )}
        </View>

        {/* ── Context the blood bank reads ─────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodEmergency.contextTitle')} />
          <Card>
            <Text style={styles.fieldLabel}>{t('bloodEmergency.contactLabel')}</Text>
            <PillInput
              icon={<Icon name="phone" size={18} color={colors.blue} />}
              value={phone}
              onChangeText={setPhone}
              placeholder={t('bloodModify.phonePlaceholder')}
              keyboardType="phone-pad"
              accessibilityLabel={t('bloodEmergency.contactLabel')}
            />

            <Text style={[styles.fieldLabel, styles.spacer]}>
              {t('bloodEmergency.wardLabel')}
            </Text>
            <PillInput
              icon={<Icon name="building" size={18} color={colors.blue} />}
              value={ward}
              onChangeText={setWard}
              placeholder={t('bloodEmergency.wardPlaceholder')}
              accessibilityLabel={t('bloodEmergency.wardLabel')}
            />

            <Text style={[styles.fieldLabel, styles.spacer]}>
              {t('bloodEmergency.reasonLabel')}
            </Text>
            <TextInput
              value={reason}
              onChangeText={(value) => setReason(value.slice(0, NOTE_MAX))}
              placeholder={t('bloodEmergency.reasonPlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              style={styles.noteInput}
              accessibilityLabel={t('bloodEmergency.reasonLabel')}
            />
            <Text style={styles.counter}>{`${reason.length}/${NOTE_MAX}`}</Text>
            {/* Says where the text goes, so nobody types into a field that
                quietly goes nowhere. */}
            <Text style={styles.hint}>{t('bloodEmergency.noteHint')}</Text>
          </Card>
        </View>

        <NoticeBanner
          icon="info"
          tone="warning"
          title={t('bloodEmergency.importantTitle')}
          message={t('bloodEmergency.importantBody')}
        />

        <CareButton
          label={create.isPending ? t('bloodEmergency.sending') : t('bloodEmergency.submit')}
          icon="droplet"
          variant="dangerSolid"
          disabled={!canSubmit || create.isPending}
          onPress={submit}
        />
        {!canSubmit ? <Text style={styles.hint}>{t('bloodEmergency.needAll')}</Text> : null}
      </ScrollView>

      {dialog.element}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.sm },

    leadRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    leadMark: {
      width: 44,
      height: 44,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leadBody: { flex: 1 },
    leadTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
    },
    leadText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
      marginTop: 4,
    },
    leadAction: { marginTop: spacing.md, alignSelf: 'flex-start' },

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
      fontSize: typography.size.sm,
      color: c.textPrimary,
      marginBottom: spacing.xs,
    },
    spacer: { marginTop: spacing.md },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
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

    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    stepButton: { minWidth: 52 },
    stepValue: { alignItems: 'center', minWidth: 64 },
    stepNumber: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      color: c.textPrimary,
    },

    noteInput: {
      minHeight: 88,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: radii.md,
      padding: spacing.sm,
      textAlignVertical: 'top',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
      backgroundColor: c.surface,
    },
    counter: {
      alignSelf: 'flex-end',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
      marginTop: 4,
    },
  });
