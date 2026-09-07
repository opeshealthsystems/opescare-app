import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  Chip,
  Icon,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatDate,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
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
 * ── The eligibility list is not a test ────────────────────────────────────
 * The reference draws an "Eligibility Quick Check" with ticks against the
 * reader. This screen shows the same criteria but does NOT ask the volunteer
 * to answer them, and stores nothing about their health. The blood bank
 * assesses every donor on the day; a stored "has a chronic condition" flag
 * would be a health record this platform has no reason to hold, and a green
 * tick here would be a medical judgement the app is not entitled to make.
 *
 * ── Leaving is as easy as joining ─────────────────────────────────────────
 * Pause and withdraw are on the same screen as join, not buried in settings.
 * Pausing is the common case — just donated, unwell, travelling — and it must
 * not cost somebody their place on the register.
 */

const ELIGIBILITY = ['age', 'weight', 'health', 'interval'] as const;

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
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Lead panel, as the reference draws it. */}
        <Card accentColor={colors.statusCritical}>
          <View style={styles.leadRow}>
            <View style={[styles.leadMark, { backgroundColor: colors.statusCriticalBg }]}>
              <Icon name="droplet" size={22} color={colors.statusCritical} />
            </View>
            <View style={styles.leadBody}>
              <Text style={styles.leadTitle}>{t('donor.leadTitle')}</Text>
              <Text style={styles.leadText}>{t('donor.leadBody')}</Text>
            </View>
          </View>
        </Card>

        {registration.isPending ? (
          <LoadingBlock label={t('donor.loading')} />
        ) : (
          <>
            {/* Current standing, when there is one. */}
            {current ? (
              <Card>
                <View style={styles.statusRow}>
                  <View style={styles.statusBody}>
                    <Text style={styles.fieldLabel}>{t('donor.currentTitle')}</Text>
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

            {/* ── Your details ─────────────────────────────────────────────── */}
            <View style={styles.stack}>
              <SectionHeader title={t('donor.detailsTitle')} />
              <Card>
                <Text style={styles.fieldLabel}>{t('donor.groupLabel')}</Text>
                <View style={styles.chipWrap}>
                  {groupOptions.map((group) => (
                    <Chip
                      key={group.value}
                      icon="droplet"
                      label={group.label}
                      selected={group.value === bloodGroup}
                      onPress={() => setBloodGroup(group.value)}
                    />
                  ))}
                </View>

                <Text style={[styles.fieldLabel, styles.spacer]}>{t('donor.areaLabel')}</Text>
                <PillInput
                  icon={<Icon name="location" size={18} color={colors.blue} />}
                  value={city}
                  onChangeText={setCity}
                  placeholder={t('donor.areaPlaceholder')}
                  accessibilityLabel={t('donor.areaLabel')}
                />
                {/*
                  An area, not a location. The reference lists donors with a
                  distance in kilometres; this register stores the town a
                  volunteer chose to publish and nothing finer, because a live
                  distance to a named person is a location.
                */}
                <Text style={styles.hint}>{t('donor.areaHint')}</Text>
              </Card>
            </View>

            {/* ── Consent ──────────────────────────────────────────────────── */}
            <View style={styles.stack}>
              <SectionHeader title={t('donor.consentTitle')} />
              <Card>
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
                      <View style={styles.spacer}>
                        <PillInput
                          icon={<Icon name="phone" size={18} color={colors.blue} />}
                          value={phone}
                          onChangeText={setPhone}
                          placeholder={t('donor.phonePlaceholder')}
                          keyboardType="phone-pad"
                          accessibilityLabel={t('donor.phoneTitle')}
                        />
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
            </View>

            {/* ── Eligibility, shown but not asked ──────────────────────────── */}
            <View style={styles.stack}>
              <SectionHeader title={t('donor.eligibilityTitle')} />
              <Card>
                {ELIGIBILITY.map((key, index) => (
                  <View
                    key={key}
                    style={[
                      styles.checkRow,
                      index < ELIGIBILITY.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <Icon name="info" size={17} color={colors.blue} />
                    <Text style={styles.checkText}>{t(`bloodEducation.eligibility.${key}`)}</Text>
                  </View>
                ))}
                {/*
                  Deliberately NOT ticks against the reader. The reference draws
                  a checklist that appears to judge whether this person
                  qualifies; the blood bank makes that call on the day, and this
                  app stores nothing about anyone's health to make it with.
                */}
                <Text style={styles.hint}>{t('donor.eligibilityNote')}</Text>
              </Card>
            </View>

            {join.isError ? (
              <NoticeBanner
                icon="alert-circle"
                tone="critical"
                title={t('donor.saveFailedTitle')}
                message={t('donor.saveFailedBody')}
              />
            ) : null}

            <CareButton
              label={
                join.isPending
                  ? t('donor.saving')
                  : current
                    ? t('donor.update')
                    : t('donor.join')
              }
              icon="check-circle"
              variant="primary"
              disabled={!canSubmit || join.isPending}
              onPress={submit}
            />

            <Text style={styles.footNote}>{t('donor.footNote')}</Text>
          </>
        )}
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
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    leadText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
      marginTop: 4,
    },

    statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    statusBody: { flex: 1 },
    statusActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    statusAction: { flex: 1 },

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

    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    checkText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
    },

    footNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      textAlign: 'center',
    },
  });
