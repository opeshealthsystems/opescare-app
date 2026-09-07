import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  PillInput,
  ScreenHeader,
  SectionHeader,
  radii,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import { useAuthStore } from '@/lib/store/auth';
import { useBloodOptions, type BloodGroupValue } from '@/lib/api/queries';
import { useDonorSearch, type DonorResult } from '@/lib/api/donorQueries';

/**
 * Find Donors (SB-02) — the volunteer register, searched.
 *
 * ── This is the reference's layout over a different data source ───────────
 * The image is a browsable list of named people with photographs, ages, blood
 * groups, last-donation dates, distances to a tenth of a kilometre and direct
 * Call buttons. Read off `patients`, that is enumeration of patients and of
 * health data, which this platform forbids outright — no patient lists, no
 * `LIKE` search, exact Health ID only.
 *
 * So the search card, the results list and the "can't find one?" panel are all
 * as drawn, and what fills them is the CONSENT REGISTER: people who completed
 * SB-03 and said yes. Four things in the image are deliberately not here, and
 * the screen says why rather than leaving a gap:
 *
 *   - No photograph. Nobody consented to have their face listed by blood group.
 *   - No age or date of birth.
 *   - No distance. The register stores a published AREA and nothing finer; a
 *     live distance to a named person is a location.
 *   - No phone number unless that volunteer separately agreed to publish one.
 *     Where they did not, the screen offers the route that always works — ask
 *     a blood bank, which holds its own donor list and can call on your behalf.
 *
 * ── The search refuses to run without a group ─────────────────────────────
 * There is no "show me everyone" state, on the screen or in the API. A
 * register you can page through from the top is the directory this design
 * exists not to be.
 */

function dial(number: string | null): void {
  if (!number) return;
  void Linking.openURL(`tel:${number.replace(/\s+/g, '')}`);
}

export default function FindDonorsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const patient = useAuthStore((s) => s.patient);
  const options = useBloodOptions();

  const [bloodGroup, setBloodGroup] = useState<BloodGroupValue | null>(
    (patient?.blood_group as BloodGroupValue | undefined) ?? null,
  );
  const [city, setCity] = useState('');
  const [appliedCity, setAppliedCity] = useState('');

  const search = useDonorSearch({ bloodGroup, city: appliedCity || null });

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  const groupOptions = options.data?.blood_groups ?? [];
  const donors = search.data?.data ?? [];
  const cappedAt = search.data?.meta?.capped_at ?? 20;

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('donorSearch.title')}
        subtitle={t('donorSearch.subtitle')}
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Lead panel, as drawn. */}
        <Card accentColor={colors.statusCritical}>
          <View style={styles.leadRow}>
            <View style={[styles.leadMark, { backgroundColor: colors.statusCriticalBg }]}>
              <Icon name="users" size={22} color={colors.statusCritical} />
            </View>
            <View style={styles.leadBody}>
              <Text style={styles.leadTitle}>{t('donorSearch.leadTitle')}</Text>
              <Text style={styles.leadText}>{t('donorSearch.leadBody')}</Text>
            </View>
          </View>
        </Card>

        {/* ── Search & filter ──────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('donorSearch.filterTitle')} />
          <Card>
            <Text style={styles.fieldLabel}>{t('donorSearch.groupLabel')}</Text>
            <View style={styles.chipWrap}>
              {groupOptions.map((group) => (
                <Chip
                  key={group.value}
                  icon="droplet"
                  label={group.label}
                  selected={group.value === bloodGroup}
                  onPress={() =>
                    setBloodGroup(group.value === bloodGroup ? null : group.value)
                  }
                />
              ))}
            </View>

            <Text style={[styles.fieldLabel, styles.spacer]}>{t('donorSearch.areaLabel')}</Text>
            <PillInput
              icon={<Icon name="location" size={18} color={colors.blue} />}
              value={city}
              onChangeText={setCity}
              onSubmitEditing={() => setAppliedCity(city.trim())}
              placeholder={t('donorSearch.areaPlaceholder')}
              returnKeyType="search"
              accessibilityLabel={t('donorSearch.areaLabel')}
            />
            <CareButton
              label={t('donorSearch.apply')}
              icon="search"
              variant="secondary"
              size="sm"
              onPress={() => setAppliedCity(city.trim())}
              style={styles.applyButton}
            />
          </Card>

          <NoticeBanner
            icon="shield-check"
            tone="pending"
            title={t('donorSearch.safetyTitle')}
            message={t('donorSearch.safetyBody')}
          />
        </View>

        {/* ── Results ──────────────────────────────────────────────────────── */}
        {!bloodGroup ? (
          <Card variant="flush">
            <EmptyState
              icon="droplet"
              tint="red"
              title={t('donorSearch.pickGroupTitle')}
              message={t('donorSearch.pickGroupBody')}
            />
          </Card>
        ) : search.isPending ? (
          <LoadingBlock label={t('donorSearch.searching')} />
        ) : search.isError ? (
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('donorSearch.failedTitle')}
              message={t('donorSearch.failedBody')}
              actionLabel={t('donorSearch.retry')}
              onAction={() => search.refetch()}
            />
          </Card>
        ) : donors.length === 0 ? (
          <Card variant="flush">
            <EmptyState
              icon="users"
              tint="blue"
              title={t('donorSearch.emptyTitle')}
              message={t('donorSearch.emptyBody')}
            />
          </Card>
        ) : (
          <View style={styles.stack}>
            <SectionHeader title={t('donorSearch.found', { count: donors.length })} />
            {donors.map((donor) => (
              <DonorCard key={donor.id} donor={donor} />
            ))}
            {donors.length >= cappedAt ? (
              <NoticeBanner
                icon="info"
                tone="pending"
                message={t('donorSearch.capped', { count: cappedAt })}
              />
            ) : null}
          </View>
        )}

        {/* The reference's "Can't find the right donor?" panel. Here it leads
            to the route that always works, and does not depend on any
            volunteer having published a number. */}
        <Card accentColor={colors.blue}>
          <Text style={styles.leadTitle}>{t('donorSearch.noLuckTitle')}</Text>
          <Text style={styles.leadText}>{t('donorSearch.noLuckBody')}</Text>
          <View style={styles.noLuckActions}>
            <CareButton
              label={t('donorSearch.askBloodBank')}
              icon="droplet"
              variant="primary"
              size="sm"
              onPress={() => router.push('/blood-finder')}
              style={styles.noLuckAction}
            />
            <CareButton
              label={t('donorSearch.becomeDonor')}
              icon="heart-pulse"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/blood-finder/become-donor')}
              style={styles.noLuckAction}
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

/**
 * One volunteer.
 *
 * Everything drawn here came back from the register. There is no photograph,
 * no age and no distance because the API holds none — see the screen docblock.
 */
function DonorCard({ donor }: { donor: DonorResult }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const since =
    donor.months_since === null
      ? t('donorSearch.neverRecorded')
      : donor.months_since === 0
        ? t('donorSearch.donatedThisMonth')
        : t('donorSearch.donatedMonthsAgo', { count: donor.months_since });

  return (
    <Card variant="flush">
      <View style={styles.donorRow}>
        {/* An initial, not a face. Nobody consented to have their photograph
            listed beside their blood group. */}
        <View style={[styles.donorMark, { backgroundColor: colors.tintBlueBg }]}>
          <Text style={[styles.donorInitial, { color: colors.blue }]}>
            {donor.display_name.slice(0, 1).toUpperCase()}
          </Text>
        </View>

        <View style={styles.donorBody}>
          <Text style={styles.donorName}>{donor.display_name}</Text>
          <View style={styles.donorMeta}>
            <Icon name="droplet" size={13} color={colors.statusCritical} />
            <Text style={[styles.donorGroup, { color: colors.statusCritical }]}>
              {donor.blood_group}
            </Text>
            {donor.area ? (
              <>
                <Icon name="location" size={13} color={colors.textMuted} />
                <Text style={styles.donorArea}>{donor.area}</Text>
              </>
            ) : null}
          </View>
          <Text style={styles.donorSince}>{since}</Text>
        </View>

        <View style={styles.donorAside}>
          {donor.phone_shared ? (
            <CareButton
              label={t('donorSearch.call')}
              icon="phone"
              variant="primary"
              size="sm"
              onPress={() => dial(donor.contact_phone)}
            />
          ) : (
            /* They agreed to be listed, not to be rung. Saying so is better
               than a dead button or a fabricated number. */
            <View style={styles.withheld}>
              <Icon name="shield-check" size={15} color={colors.textMuted} />
              <Text style={styles.withheldText}>{t('donorSearch.phoneWithheld')}</Text>
            </View>
          )}
        </View>
      </View>
    </Card>
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

    fieldLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
      marginBottom: spacing.xs,
    },
    spacer: { marginTop: spacing.md },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    applyButton: { marginTop: spacing.sm, alignSelf: 'flex-start' },

    donorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
    },
    donorMark: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    donorInitial: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
    },
    donorBody: { flex: 1, gap: 2 },
    donorName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    donorMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
    donorGroup: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      marginRight: 4,
    },
    donorArea: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    donorSince: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    donorAside: { alignItems: 'flex-end', maxWidth: 118 },
    withheld: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    withheldText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      color: c.textMuted,
    },

    noLuckActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    noLuckAction: { flex: 1 },
  });
