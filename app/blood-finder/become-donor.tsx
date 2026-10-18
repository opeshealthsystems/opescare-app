import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  Icon,
  ScreenHeader,
  StatusBadge,
  formatDate,
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
import { useBloodOptions, type BloodGroupValue } from '@/lib/api/queries';
import {
  useJoinDonorRegister,
  useMyDonorRegistration,
  useSetDonorStatus,
} from '@/lib/api/donorQueries';

/**
 * Become a Donor (SB-03) — joining the volunteer register.
 *
 * ── Consent is the screen, not a checkbox at the bottom ───────────────────
 * Two separate decisions, asked separately because they are separate:
 *
 *   1. May other people SEE that you are a donor? Without this, the entry is
 *      saved but never appears in a search. It is the switch that makes the
 *      register a register.
 *   2. May they see your PHONE NUMBER? A volunteer can be willing to help
 *      without being willing to be rung by strangers, so the app offers to
 *      pass a request through a blood bank instead.
 *
 * Neither is pre-set to yes, and the second is not even asked until the first
 * is given.
 *
 * ── Why the step strip has TWO stops and not the reference's five ─────────
 * The reference draws "1 Personal Info · 2 Health Info · 3 Eligibility ·
 * 4 Contact & Location · 5 Review & Submit". Three of those five have nowhere
 * to go and must not be built:
 *
 *   - Health Info (weight, height, chronic conditions, last donation) and
 *     Eligibility (a ticked questionnaire) would be a health record about a
 *     volunteer that this platform has no reason to hold. The register accepts
 *     blood_group, city, region, listing_consent, share_phone, contact_phone,
 *     last_donated_on and note — no health field, and none is sent.
 *   - Review & Submit is not a step: the form saves in place, and everything
 *     it would review is on this one screen.
 *   - Personal Info (name, date of birth, gender, occupation) is the patient's
 *     own record; a donor entry does not re-ask for it or store a second copy.
 *
 * What is left is genuinely two: the details the register keeps, and the two
 * consents. Drawing five stops and implementing one would be a lie about how
 * much of somebody's data this screen is about to take, so the strip shows the
 * two that exist and moves as the form is filled in.
 *
 * ── The eligibility list is not a test ────────────────────────────────────
 * The reference draws an "Eligibility Quick Check" with GREEN TICKS against
 * the reader. This screen shows the same criteria, in the same two-column
 * arrangement, but with a neutral mark and no answer to give: it does not ask
 * the volunteer to confirm any of them and stores nothing about their health.
 * The blood bank assesses every donor on the day; a green tick here would be a
 * medical judgement the app is not entitled to make, and a stored answer would
 * be a health record.
 *
 * ── Leaving is as easy as joining ─────────────────────────────────────────
 * Pause and withdraw are on the same screen as join, not buried in settings.
 * Pausing is the common case — just donated, unwell, travelling — and it must
 * not cost somebody their place on the register.
 *
 * ── 375pt compromises (the reference frame is ~430pt) ─────────────────────
 *   - The lead panel's "one donation can help 3 people" box sits UNDER the
 *     copy rather than beside it.
 *   - The green "Why become a donor?" panel is a 2x2 grid, not a 4-up row:
 *     four cells would be ~70pt each, which is not a readable column.
 */

const ELIGIBILITY = ['age', 'weight', 'health', 'interval'] as const;

/** Static panel copy, not data — see the `why` strings. */
const WHY: { key: string; icon: IconName }[] = [
  { key: 'lives', icon: 'heart-pulse' },
  { key: 'community', icon: 'users' },
  { key: 'control', icon: 'refresh' },
  { key: 'free', icon: 'shield-check' },
];

export default function BecomeDonorScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const patient = useAuthStore((s) => s.patient);
  const options = useBloodOptions();
  const registration = useMyDonorRegistration();
  const join = useJoinDonorRegister();
  const setStatus = useSetDonorStatus();

  const [bloodGroup, setBloodGroup] = useState<BloodGroupValue | null>(null);
  const [city, setCity] = useState('');
  const [listed, setListed] = useState(false);
  const [sharePhone, setSharePhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);

  // Seed once from an existing entry, or from the patient's own record.
  useEffect(() => {
    if (seeded || registration.isPending) return;
    const existing = registration.data;
    setBloodGroup(
      (existing?.blood_group as BloodGroupValue | undefined) ??
        (patient?.blood_group as BloodGroupValue | undefined) ??
        null,
    );
    setCity(existing?.city ?? '');
    setListed(existing?.listed ?? false);
    setSharePhone(existing?.share_phone ?? false);
    setPhone(existing?.contact_phone ?? '');
    setSeeded(true);
  }, [registration.isPending, registration.data, patient, seeded]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  const groupOptions = options.data?.blood_groups ?? [];
  const current = registration.data;
  const canSubmit = !!bloodGroup && (!sharePhone || phone.trim().length > 0);

  /** Two real stops; the second opens once the details it depends on exist. */
  const steps = [
    { key: 'details', label: t('donor.steps.details') },
    { key: 'consent', label: t('donor.steps.consent') },
  ];
  const stepIndex = bloodGroup ? 1 : 0;

  const submit = () => {
    if (!bloodGroup) return;
    join.mutate(
      {
        blood_group: bloodGroup,
        city: city.trim() || null,
        listing_consent: listed,
        share_phone: sharePhone,
        contact_phone: sharePhone ? phone.trim() : null,
      },
      {
        onSuccess: () =>
          dialog.alert(
            listed ? t('donor.savedListedTitle') : t('donor.savedUnlistedTitle'),
            listed ? t('donor.savedListedBody') : t('donor.savedUnlistedBody'),
          ),
      },
    );
  };

  const confirmWithdraw = () =>
    dialog.confirm({
      title: t('donor.withdrawTitle'),
      message: t('donor.withdrawBody'),
      confirmLabel: t('donor.withdrawAction'),
      destructive: true,
      onConfirm: () => setStatus.mutate('withdrawn', { onSuccess: () => setListed(false) }),
    });

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('donor.joinTitle')}
        subtitle={t('donor.joinSubtitle')}
        onBack={goBack}
        right={
          <TouchableOpacity
            onPress={() => router.push('/help')}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('donor.help')}
            style={styles.helpAction}
          >
            <Icon name="help-circle" size={20} color={colors.statusCritical} />
            <Text style={styles.helpLabel}>{t('donor.help')}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Lead panel — tinted red with a round mark, as the reference draws it. */}
        <View style={styles.leadPanel}>
          <View style={styles.leadRow}>
            <View style={styles.leadMark}>
              <Icon name="droplet" size={22} color={colors.statusCritical} />
            </View>
            <View style={styles.leadBody}>
              <Text style={styles.leadTitle}>{t('donor.leadTitle')}</Text>
              <Text style={styles.leadText}>{t('donor.leadBody')}</Text>
            </View>
          </View>
          {/* 375pt: under the copy, not beside it — see the docblock. */}
          <View style={styles.livesBox}>
            <Icon name="heart-pulse" size={18} color={colors.statusCritical} />
            <Text style={styles.livesText}>{t('donor.livesBox')}</Text>
          </View>
        </View>

        {registration.isPending ? (
          <LoadingBlock label={t('donor.loading')} />
        ) : (
          <>
            {/* Current standing, when there is one. No equivalent in the
                reference, which only ever draws a first-time signup. */}
            {current ? (
              <Card>
                <View style={styles.statusRow}>
                  <View style={styles.statusBody}>
                    <Text style={styles.statusLabel}>{t('donor.currentTitle')}</Text>
                    <Text style={styles.muted}>
                      {current.listing_consent_at
                        ? t('donor.joinedOn', { when: formatDate(current.listing_consent_at) })
                        : t('donor.notListedYet')}
                    </Text>
                  </View>
                  <StatusBadge
                    status={current.status}
                    tone={
                      current.status === 'active' && current.listed
                        ? 'normal'
                        : current.status === 'paused'
                          ? 'warning'
                          : 'neutral'
                    }
                    label={t(`donor.status.${current.status}`)}
                  />
                </View>

                {current.status !== 'withdrawn' ? (
                  <View style={styles.statusActions}>
                    <CareButton
                      label={
                        current.status === 'paused' ? t('donor.resume') : t('donor.pause')
                      }
                      icon={current.status === 'paused' ? 'refresh' : 'clock'}
                      variant="secondary"
                      size="sm"
                      disabled={setStatus.isPending}
                      onPress={() =>
                        setStatus.mutate(current.status === 'paused' ? 'active' : 'paused')
                      }
                      style={styles.statusAction}
                    />
                    <CareButton
                      label={t('donor.withdraw')}
                      icon="trash"
                      variant="danger"
                      size="sm"
                      disabled={setStatus.isPending}
                      onPress={confirmWithdraw}
                      style={styles.statusAction}
                    />
                  </View>
                ) : null}
              </Card>
            ) : null}

            {/* ── The step strip. Two stops, and both of them exist. ───────── */}
            <View
              style={styles.steps}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={t('donor.stepOf', {
                current: stepIndex + 1,
                total: steps.length,
                label: steps[stepIndex]?.label ?? '',
              })}
              accessibilityValue={{ min: 1, max: steps.length, now: stepIndex + 1 }}
            >
              {steps.map((step, index) => {
                const on = index <= stepIndex;
                const last = index === steps.length - 1;
                return (
                  // The last column hugs its own width so the connector before
                  // it can stretch and the final stop lands at the right edge,
                  // as the reference draws it.
                  <View key={step.key} style={[styles.stepCol, last && styles.stepColLast]}>
                    <View style={styles.stepHead}>
                      {/* The strip is a progress read-out, not navigation:
                          nothing here is pressable, because there is nowhere
                          to jump to — it is one form. */}
                      <View style={[styles.stepDot, on && styles.stepDotOn]}>
                        <Text style={[styles.stepNumber, on && styles.stepNumberOn]}>
                          {index + 1}
                        </Text>
                      </View>
                      {!last ? (
                        <View style={[styles.stepLine, stepIndex > index && styles.stepLineOn]} />
                      ) : null}
                    </View>
                    <Text style={[styles.stepLabel, on && styles.stepLabelOn]} numberOfLines={2}>
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* ── Your details ─────────────────────────────────────────────── */}
            <Card>
              <SectionHead icon="person" title={t('donor.detailsTitle')} />

              {/* Two columns, as the reference lays its fields out. */}
              <View style={styles.fieldRow}>
                <SelectField
                  style={styles.fieldCell}
                  label={t('donor.groupLabel')}
                  placeholder={t('donor.groupPlaceholder')}
                  icon="droplet"
                  iconColor={colors.statusCritical}
                  value={bloodGroup}
                  options={groupOptions.map((g) => ({ value: g.value, label: g.label }))}
                  onSelect={setBloodGroup}
                  sheetTitle={t('donor.groupLabel')}
                />
                {/*
                  Free text, not a dropdown: the API returns no list of towns
                  to populate one with, and a hardcoded list would be invented.
                */}
                <View style={styles.fieldCell}>
                  <Text style={styles.fieldLabel} numberOfLines={1}>
                    {t('donor.areaLabel')}
                  </Text>
                  <View style={styles.fieldBox}>
                    <Icon name="location" size={16} color={colors.textMuted} />
                    <TextInput
                      style={styles.fieldInput}
                      value={city}
                      onChangeText={setCity}
                      placeholder={t('donor.areaPlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      accessibilityLabel={t('donor.areaLabel')}
                    />
                  </View>
                </View>
              </View>

              {/*
                An area, not a location. The reference lists donors with a
                distance in kilometres; this register stores the town a
                volunteer chose to publish and nothing finer, because a live
                distance to a named person is a location.
              */}
              <Text style={styles.hint}>{t('donor.areaHint')}</Text>
            </Card>

            {/* ── Consent ──────────────────────────────────────────────────── */}
            <Card>
              <SectionHead icon="eye" title={t('donor.consentTitle')} />

              <View style={styles.switchRow}>
                <View style={styles.switchBody}>
                  <Text style={styles.switchTitle}>{t('donor.listedTitle')}</Text>
                  <Text style={styles.hint}>{t('donor.listedHint')}</Text>
                </View>
                <Switch
                  value={listed}
                  onValueChange={(value) => {
                    setListed(value);
                    // Being findable is a precondition for being callable.
                    if (!value) setSharePhone(false);
                  }}
                  trackColor={{ true: colors.blue, false: colors.border }}
                  accessibilityLabel={t('donor.listedTitle')}
                />
              </View>

              {listed ? (
                <>
                  <View style={[styles.switchRow, styles.switchDivider]}>
                    <View style={styles.switchBody}>
                      <Text style={styles.switchTitle}>{t('donor.phoneTitle')}</Text>
                      <Text style={styles.hint}>{t('donor.phoneHint')}</Text>
                    </View>
                    <Switch
                      value={sharePhone}
                      onValueChange={setSharePhone}
                      trackColor={{ true: colors.blue, false: colors.border }}
                      accessibilityLabel={t('donor.phoneTitle')}
                    />
                  </View>

                  {sharePhone ? (
                    <View style={styles.phoneField}>
                      <Text style={styles.fieldLabel}>{t('donor.phoneTitle')}</Text>
                      <View style={styles.fieldBox}>
                        <Icon name="phone" size={16} color={colors.textMuted} />
                        <TextInput
                          style={styles.fieldInput}
                          value={phone}
                          onChangeText={setPhone}
                          placeholder={t('donor.phonePlaceholder')}
                          placeholderTextColor={colors.textMuted}
                          keyboardType="phone-pad"
                          accessibilityLabel={t('donor.phoneTitle')}
                        />
                      </View>
                    </View>
                  ) : (
                    <NoticeBanner
                      icon="shield-check"
                      tone="pending"
                      message={t('donor.phoneWithheld')}
                    />
                  )}
                </>
              ) : (
                <NoticeBanner
                  icon="eye-off"
                  tone="pending"
                  message={t('donor.notListedExplained')}
                />
              )}
            </Card>

            {/* ── Eligibility, shown but not asked ──────────────────────────── */}
            <Card>
              <SectionHead icon="first-aid" title={t('donor.eligibilityTitle')} />

              {/* Two columns with a title and a sub-line each, as drawn — but
                  the mark is neutral. A green tick would read as this app
                  certifying that the reader qualifies. */}
              <View style={styles.criteriaGrid}>
                {ELIGIBILITY.map((key) => (
                  <View key={key} style={styles.criteriaCell}>
                    <Icon name="info" size={16} color={colors.textMuted} />
                    <View style={styles.criteriaBody}>
                      <Text style={styles.criteriaTitle}>
                        {t(`donor.eligibilityItems.${key}.title`)}
                      </Text>
                      <Text style={styles.criteriaSub}>
                        {t(`donor.eligibilityItems.${key}.sub`)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* The reference's "View full eligibility criteria" expander. */}
              <TouchableOpacity
                style={styles.expander}
                activeOpacity={0.7}
                onPress={() => setCriteriaOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityLabel={t('donor.eligibilityExpand')}
                accessibilityState={{ expanded: criteriaOpen }}
              >
                <Text style={styles.expanderText}>{t('donor.eligibilityExpand')}</Text>
                <Icon
                  name={criteriaOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.link}
                />
              </TouchableOpacity>

              {criteriaOpen ? (
                <View style={styles.expanded}>
                  {/*
                    Deliberately NOT a checklist the reader answers. The blood
                    bank makes that call on the day, and this app stores
                    nothing about anyone's health to make it with.
                  */}
                  <Text style={styles.hint}>{t('donor.eligibilityNote')}</Text>
                  <CareButton
                    label={t('donor.readEducation')}
                    icon="book"
                    variant="secondary"
                    size="sm"
                    onPress={() => router.push('/blood-finder/education')}
                    style={styles.expandedAction}
                  />
                </View>
              ) : null}
            </Card>

            {/* ── Why become a donor? ───────────────────────────────────────── */}
            <View style={styles.whyPanel}>
              <View style={styles.whyHead}>
                <View style={styles.whyMark}>
                  <Icon name="heart-pulse" size={18} color={colors.statusNormal} />
                </View>
                <Text style={styles.whyTitle}>{t('donor.why.title')}</Text>
              </View>
              {/* 2x2, not the reference's 4-up row — see the docblock. */}
              <View style={styles.whyGrid}>
                {WHY.map((item, index) => (
                  <React.Fragment key={item.key}>
                    {index > 0 && <View style={styles.whyDivider} />}
                    <View style={styles.whyCell}>
                      <View style={styles.whyIcon}>
                        <Icon name={item.icon} size={16} color={colors.statusNormal} />
                      </View>
                      <Text style={styles.whyCellTitle} numberOfLines={2}>
                        {t(`donor.why.${item.key}.title`)}
                      </Text>
                      <Text style={styles.whyCellText} numberOfLines={3}>
                        {t(`donor.why.${item.key}.sub`)}
                      </Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </View>

            {join.isError ? (
              <NoticeBanner
                icon="alert-circle"
                tone="critical"
                title={t('donor.saveFailedTitle')}
                message={t('donor.saveFailedBody')}
              />
            ) : null}

            {/* Solid red primary, outlined red secondary, as drawn.
                The reference's secondary is "Save & Complete Later"; there is
                no draft in the API — an entry is either saved or not, and
                saving with listing off (the switch above) is what "not
                finished yet" means here. So the outlined button carries the
                one thing that genuinely belongs beside the primary. */}
            <CareButton
              label={
                join.isPending
                  ? t('donor.saving')
                  : current
                    ? t('donor.update')
                    : t('donor.join')
              }
              icon="droplet"
              iconRight="chevron-right"
              variant="dangerSolid"
              disabled={!canSubmit || join.isPending}
              loading={join.isPending}
              onPress={submit}
            />
            <CareButton
              label={t('donor.readEducation')}
              icon="book"
              variant="danger"
              onPress={() => router.push('/blood-finder/education')}
              style={styles.secondaryAction}
            />

            <View style={styles.footNoteRow}>
              <Icon name="lock" size={13} color={colors.textMuted} />
              <Text style={styles.footNote}>{t('donor.footNote')}</Text>
            </View>
          </>
        )}
      </ScrollView>

      {dialog.element}
    </Screen>
  );
}

/** The reference's small red circular icon at the head of every section card. */
function SectionHead({ icon, title }: { icon: IconName; title: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.cardHead}>
      <View style={styles.cardHeadMark}>
        <Icon name={icon} size={15} color={colors.statusCritical} />
      </View>
      <Text style={styles.cardHeadTitle} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/**
 * The reference's dropdown control.
 *
 * Deliberately local to this screen rather than added to the shared kit: the
 * kit is owned elsewhere, and SB-02 carries its own copy for the same reason.
 */
function SelectField<T extends string>({
  label,
  value,
  options,
  onSelect,
  placeholder,
  icon,
  iconColor,
  sheetTitle,
  style,
  accessibilityLabel,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onSelect: (value: T) => void;
  placeholder: string;
  icon?: IconName;
  iconColor?: string;
  sheetTitle?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <View style={style}>
      <Text style={styles.fieldLabel} numberOfLines={1}>
        {label}
      </Text>
      <TouchableOpacity
        style={styles.fieldBox}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        // A placeholder is not a name, and the label above is a separate node.
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityState={{ expanded: open }}
      >
        {icon ? <Icon name={icon} size={16} color={iconColor ?? colors.textMuted} /> : null}
        <Text
          style={[styles.fieldValue, !selected && styles.fieldPlaceholder]}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('donor.closeSheet')}
        >
          {/* Swallows the press so tapping the sheet does not dismiss it. */}
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {sheetTitle ?? label}
            </Text>
            <ScrollView bounces={false}>
              {options.map((option) => {
                const on = option.value === value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.sheetOption}
                    activeOpacity={0.75}
                    onPress={() => {
                      onSelect(option.value);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.sheetOptionText, on && styles.sheetOptionTextOn]}>
                      {option.label}
                    </Text>
                    {on ? <Icon name="check" size={18} color={colors.statusCritical} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

    helpAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    helpLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.statusCritical,
    },

    leadPanel: {
      backgroundColor: c.statusCriticalBg,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.tintRedBg,
      padding: spacing.md,
    },
    leadRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    leadMark: {
      width: 44,
      height: 44,
      borderRadius: radii.pill,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leadBody: { flex: 1 },
    leadTitle: {
      fontFamily: typography.fontFamily.semiBold,
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
    livesBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm + 4,
      padding: spacing.sm + 2,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.tintRedBg,
      backgroundColor: c.surface,
    },
    livesText: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textPrimary,
    },

    steps: { flexDirection: 'row', alignItems: 'flex-start' },
    stepCol: { flex: 1, minWidth: 0 },
    // The last stop has no connecting line, so it sizes to its content —
    // which was the 22pt dot, leaving "Consent" with no room to render.
    stepColLast: { flexGrow: 0, flexShrink: 0, minWidth: 76, alignItems: 'center' },
    stepHead: { flexDirection: 'row', alignItems: 'center' },
    stepDot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepDotOn: { borderColor: c.statusCritical, backgroundColor: c.statusCritical },
    stepNumber: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    stepNumberOn: { color: c.textOnBrand },
    stepLine: { flex: 1, height: 1.5, backgroundColor: c.border, marginHorizontal: 6 },
    stepLineOn: { backgroundColor: c.statusCritical },
    stepLabel: {
      marginTop: 6,
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      lineHeight: 15,
      color: c.textMuted,
    },
    stepLabelOn: { color: c.statusCritical },

    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    cardHeadMark: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.statusCriticalBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardHeadTitle: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },

    statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    statusBody: { flex: 1 },
    statusLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
      marginBottom: spacing.xs,
    },
    statusActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    statusAction: { flex: 1 },

    fieldRow: { flexDirection: 'row', gap: spacing.sm },
    fieldCell: { flex: 1, minWidth: 0 },
    fieldLabel: {
      fontFamily: typography.fontFamily.medium,
      // 11px, not `size.xs`: two labels have to sit side by side in half a
      // 375pt card without truncating.
      fontSize: 11,
      lineHeight: 15,
      color: c.textSecondary,
      marginBottom: 5,
    },
    fieldBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minWidth: 0,
      minHeight: 44,
      paddingHorizontal: spacing.sm + 2,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    fieldValue: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    fieldPlaceholder: {
      fontFamily: typography.fontFamily.regular,
      color: c.textMuted,
    },
    fieldInput: {
      flex: 1,
      // See PillInput's note: on web an <input> keeps a content-based minimum
      // width and will not shrink inside a half-width cell without this.
      minWidth: 0,
      paddingVertical: 10,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    phoneField: { marginTop: spacing.md },

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

    switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    switchDivider: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    switchBody: { flex: 1 },
    switchTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    criteriaGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md, columnGap: spacing.sm },
    criteriaCell: {
      // Two per row on a 375pt card: half the row, minus half the gap.
      width: '48%',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
    },
    criteriaBody: { flex: 1, minWidth: 0 },
    criteriaTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: 17,
      color: c.textPrimary,
    },
    criteriaSub: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textMuted,
      marginTop: 2,
    },
    expander: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: spacing.md,
      paddingTop: spacing.sm + 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    expanderText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.link,
    },
    expanded: { marginTop: spacing.sm },
    expandedAction: { marginTop: spacing.sm, alignSelf: 'flex-start' },

    whyPanel: {
      backgroundColor: c.statusNormalBg,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.tintGreenBg,
      padding: spacing.md,
    },
    whyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    whyMark: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    whyTitle: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.statusNormal,
    },
    whyGrid: {
      flexDirection: 'row',
      alignItems: 'stretch',
      marginTop: spacing.md,
    },
    // Four equal columns, hairline-divided, as the reference draws them.
    // flexBasis 0 rather than a percentage so they share the row exactly;
    // minWidth 0 so a caption wraps instead of widening its own column.
    whyCell: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    whyDivider: { width: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: 2 },
    whyIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    whyCellTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textPrimary,
      textAlign: 'center',
    },
    whyCellText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textSecondary,
      textAlign: 'center',
      marginTop: 2,
    },

    secondaryAction: { borderColor: c.statusCritical },

    footNoteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: spacing.sm,
    },
    footNote: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      textAlign: 'center',
    },

    sheetBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '70%',
      backgroundColor: c.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    sheetTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
      marginBottom: spacing.sm,
    },
    sheetOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingVertical: spacing.sm + 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    sheetOptionText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    sheetOptionTextOn: {
      fontFamily: typography.fontFamily.semiBold,
      color: c.statusCritical,
    },
  });
