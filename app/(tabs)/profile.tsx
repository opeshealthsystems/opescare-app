import { useCallback, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  formatDate,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type Tint,
} from '@/components/opes-ui';
import { useAuthStore } from '../../lib/store/auth';
import { useFamilyMembers } from '../../lib/api/queries';

/**
 * Profile tab — the OPES CORE-008 layout (navy identity hero, quick-overview
 * tiles, overline section headers over flush list cards, privacy banner,
 * confirmed sign-out) on top of the app's existing data: the auth store's
 * `patient`, `useFamilyMembers()` for the dependents tile and the store's
 * `logout()`. Presentation only — every row and link the previous version had
 * is still here, re-skinned with the kit.
 */

type QuickLink = {
  icon: IconName;
  tint: Tint;
  title: string;
  subtitle: string;
  onPress: () => void;
};

type Tile = {
  icon: IconName;
  tint: Tint;
  label: string;
  value: string;
  hint: string;
  onPress: () => void;
};

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const patient = useAuthStore((s) => s.patient);
  const logout = useAuthStore((s) => s.logout);

  // Powers the "Dependents" tile. Real GET /mobile/family — the same query key
  // the Family screen uses, so opening either one warms the other's cache.
  const familyQuery = useFamilyMembers();
  const dependentCount = useMemo(
    () => (familyQuery.data ?? []).filter((m) => !m.is_pending && m.patient).length,
    [familyQuery.data],
  );

  const fullName =
    [patient?.first_name, patient?.last_name].filter(Boolean).join(' ').trim() ||
    patient?.display_name ||
    '';

  const initials =
    `${patient?.first_name?.[0] ?? ''}${patient?.last_name?.[0] ?? ''}`.toUpperCase() || '?';

  // /mobile/me returns `identity_status` here, which for a confirmed patient is
  // 'verified' — not 'active'. Treating only 'active' as good (the previous
  // check) painted every verified patient's badge in the amber warning tone.
  const rawStatus = (patient?.status ?? '').toLowerCase();
  const isVerified = rawStatus === 'verified' || rawStatus === 'active';
  const statusLabel = isVerified
    ? t('profile.verified')
    : rawStatus
      ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1)
      : t('profile.pending');
  const statusSkin = statusMap[isVerified ? 'normal' : 'warning'];

  const genderLabel = (() => {
    switch (patient?.sex?.toLowerCase()) {
      case 'male':
        return t('profile.genderMale');
      case 'female':
        return t('profile.genderFemale');
      // The platform records two sexes. Anything else reaching this screen is
      // legacy data or a bad payload, and reads as "not provided" rather than
      // asserting a third option the platform does not offer.
      default:
        return t('profile.notProvided');
    }
  })();

  const emergency = patient?.emergency_contact ?? null;

  // "Profile strength" tile — derived from the record itself, not a guess: the
  // eight fields /mobile/me actually returns for a patient.
  const completeness = useMemo(() => {
    const fields = [
      patient?.first_name,
      patient?.last_name,
      patient?.dob,
      patient?.sex,
      patient?.blood_group,
      patient?.address,
      patient?.phone ?? patient?.email,
      patient?.emergency_contact?.phone,
    ];
    const filled = fields.filter((v) => !!v && String(v).trim() !== '').length;
    return { filled, total: fields.length, percent: Math.round((filled / fields.length) * 100) };
  }, [patient]);

  // Sign out is confirmed through the kit Dialog rather than `Alert.alert`,
  // which is a no-op on react-native-web. `logout()` clears the token and the
  // session; the root layout then routes to the welcome screen.
  const confirmSignOut = useCallback(() => {
    dialog.confirm({
      title: t('profile.signOutConfirmTitle'),
      message: t('profile.signOutConfirmBody'),
      confirmLabel: t('profile.signOut'),
      cancelLabel: t('profile.signOutConfirmCancel'),
      destructive: true,
      onConfirm: () => logout(),
    });
  }, [dialog, t, logout]);

  const goEditProfile = useCallback(() => router.push('/edit-profile'), [router]);

  if (!patient) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title={t('profile.title')} subtitle={t('profile.subtitle')} showBack={false} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.blue} />
          <Text style={styles.loadingText}>{t('profile.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const tiles: Tile[] = [
    {
      icon: 'alert-triangle',
      tint: 'amber',
      label: t('profile.allergies'),
      value: String(patient.allergies_count ?? 0),
      hint: t('profile.allergiesHint'),
      onPress: () => router.push('/(tabs)/records'),
    },
    {
      icon: 'activity',
      tint: 'purple',
      label: t('profile.conditions'),
      value: String(patient.conditions_count ?? 0),
      hint: t('profile.conditionsHint'),
      onPress: () => router.push('/(tabs)/records'),
    },
    {
      icon: 'users',
      tint: 'blue',
      label: t('profile.dependents'),
      value: familyQuery.isLoading && !familyQuery.data ? '…' : String(dependentCount),
      hint: familyQuery.isError ? t('profile.dependentsUnavailable') : t('profile.dependentsHint'),
      onPress: () => router.push('/family'),
    },
    {
      icon: 'check-circle',
      tint: 'green',
      label: t('profile.profileStrength'),
      value: `${completeness.percent}%`,
      hint:
        completeness.filled === completeness.total
          ? t('profile.profileStrengthComplete')
          : t('profile.profileStrengthHint', { missing: completeness.total - completeness.filled }),
      onPress: goEditProfile,
    },
  ];
  const tileRows: Tile[][] = [tiles.slice(0, 2), tiles.slice(2, 4)];

  const recordLinks: QuickLink[] = [
    {
      icon: 'qr',
      tint: 'blue',
      title: t('profile.healthIdCard'),
      subtitle: t('profile.healthIdCardDesc'),
      onPress: () => router.push('/(tabs)/health-id'),
    },
    {
      icon: 'document-text',
      tint: 'blue',
      title: t('profile.recordsTimeline'),
      subtitle: t('profile.recordsTimelineDesc'),
      onPress: () => router.push('/(tabs)/records'),
    },
    {
      icon: 'folder',
      tint: 'purple',
      title: t('profile.documents'),
      subtitle: t('profile.documentsDesc'),
      onPress: () => router.push('/documents'),
    },
    {
      icon: 'download',
      tint: 'green',
      title: t('profile.downloadRecords'),
      subtitle: t('profile.downloadRecordsDesc'),
      onPress: () => router.push('/export-records'),
    },
  ];

  const accountLinks: QuickLink[] = [
    {
      icon: 'users',
      tint: 'purple',
      title: t('profile.family'),
      subtitle: t('profile.familyDesc'),
      onPress: () => router.push('/family'),
    },
    {
      icon: 'chat',
      tint: 'blue',
      title: t('profile.messages'),
      subtitle: t('profile.messagesDesc'),
      onPress: () => router.push('/(tabs)/messages'),
    },
    {
      // The kit has no "cloud-off" glyph; the lock reads as "an encrypted copy
      // on this device", which is what the row is.
      icon: 'lock',
      tint: 'amber',
      title: t('profile.offlineAccess'),
      subtitle: t('profile.offlineAccessDesc'),
      onPress: () => router.push('/offline-access'),
    },
    {
      icon: 'settings',
      tint: 'blue',
      title: t('profile.settings'),
      subtitle: t('profile.settingsDesc'),
      onPress: () => router.push('/settings'),
    },
    {
      icon: 'help-circle',
      tint: 'green',
      title: t('profile.helpSupport'),
      subtitle: t('profile.helpSupportDesc'),
      onPress: () => router.push('/help'),
    },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader
        title={t('profile.title')}
        subtitle={t('profile.subtitle')}
        showBack={false}
        actions={[
          { icon: 'edit', onPress: goEditProfile, accessibilityLabel: t('profile.editProfileAction') },
          {
            icon: 'settings',
            onPress: () => router.push('/settings'),
            accessibilityLabel: t('profile.settings'),
          },
        ]}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Identity hero (navy inverse card, CORE-008) ─────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              {isVerified ? (
                <View style={styles.avatarBadge}>
                  <Icon name="check" size={12} color={colors.textOnBrand} strokeWidth={2.4} />
                </View>
              ) : null}
            </View>

            <View style={styles.heroIdentity}>
              <Text style={styles.heroName} numberOfLines={2}>
                {fullName || '—'}
              </Text>
              <View style={styles.heroChips}>
                <View style={[styles.heroChip, { backgroundColor: statusSkin.bg }]}>
                  <Icon
                    name={isVerified ? 'check-circle' : 'alert-circle'}
                    size={14}
                    color={statusSkin.fg}
                  />
                  <Text style={[styles.heroChipText, { color: statusSkin.fg }]}>{statusLabel}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Health ID → the QR card ("Tap to view") */}
          <TouchableOpacity
            style={styles.heroIdRow}
            activeOpacity={0.7}
            onPress={() => router.push('/(tabs)/health-id')}
            accessibilityRole="button"
            accessibilityLabel={t('profile.healthIdCard')}
            accessibilityHint={t('profile.tapToView')}
          >
            <View style={styles.heroIdIcon}>
              <Icon name="qr" size={20} color={colors.textOnBrand} />
            </View>
            <View style={styles.heroIdText}>
              <Text style={styles.heroIdLabel}>{t('profile.healthId')}</Text>
              <Text style={styles.heroIdValue} numberOfLines={1}>
                {patient.health_id || '—'}
              </Text>
              <Text style={styles.heroIdHint}>{t('profile.tapToView')}</Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textOnBrand} />
          </TouchableOpacity>

          <View style={styles.heroRule} />

          <View style={styles.heroFacts}>
            <HeroFact icon="phone" value={patient.phone || t('profile.notProvided')} />
            <View style={styles.heroFactRule} />
            <HeroFact icon="mail" value={patient.email || t('profile.notProvided')} />
            <View style={styles.heroFactRule} />
            <HeroFact icon="calendar" value={formatDate(patient.dob, t('profile.notProvided'))} />
          </View>
        </View>

        {/* ── Quick overview — every tile goes somewhere real ──────────── */}
        <View>
          <SectionHeader title={t('opesCore.profile.quickOverview')} variant="overline" />
          <View style={styles.tileGrid}>
            {tileRows.map((row, r) => (
              <View key={r} style={styles.tileRow}>
                {row.map((tile) => (
                  <StatTile key={tile.label} tile={tile} />
                ))}
              </View>
            ))}
          </View>
        </View>

        {/* ── Personal information (gender, blood group, location, emergency contact) ── */}
        <View>
          <SectionHeader
            title={t('opesCore.profile.personalInformation')}
            variant="overline"
            actionLabel={t('opesCore.common.edit')}
            onAction={goEditProfile}
          />
          <Card variant="flush">
            <ListRow icon="person" tint="blue" title={t('profile.gender')} subtitle={genderLabel} divider />
            <ListRow
              icon="droplet"
              tint="red"
              title={t('profile.bloodGroup')}
              subtitle={patient.blood_group ?? t('profile.notProvided')}
              divider
            />
            <ListRow
              icon="location"
              tint="green"
              title={t('profile.location')}
              subtitle={patient.address ?? t('profile.notProvided')}
              divider
            />
            {emergency?.name ? (
              <ListRow
                icon="phone"
                tint="red"
                title={t('profile.emergencyContact')}
                meta={[emergency.name, emergency.relationship, emergency.phone]}
                onPress={goEditProfile}
                accessibilityHint={t('profile.editProfileAction')}
                chevron={false}
                trailing={<Icon name="edit" size={18} color={colors.link} />}
              />
            ) : (
              <ListRow
                icon="phone"
                tint="amber"
                title={t('profile.addEmergencyContact')}
                subtitle={t('profile.addEmergencyContactHint')}
                onPress={goEditProfile}
              />
            )}
          </Card>
        </View>

        {/* ── Your health record ───────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('profile.sectionRecord')} variant="overline" />
          <Card variant="flush">
            {recordLinks.map((link, i) => (
              <ListRow
                key={link.title}
                icon={link.icon}
                tint={link.tint}
                title={link.title}
                subtitle={link.subtitle}
                onPress={link.onPress}
                divider={i < recordLinks.length - 1}
              />
            ))}
          </Card>
        </View>

        {/* ── Family & account ─────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('profile.sectionAccount')} variant="overline" />
          <Card variant="flush">
            {accountLinks.map((link, i) => (
              <ListRow
                key={link.title}
                icon={link.icon}
                tint={link.tint}
                title={link.title}
                subtitle={link.subtitle}
                onPress={link.onPress}
                divider={i < accountLinks.length - 1}
              />
            ))}
          </Card>
        </View>

        {/* ── Privacy banner → /privacy ────────────────────────────────── */}
        <Card
          onPress={() => router.push('/privacy')}
          accessibilityLabel={t('profile.privacyTitle')}
          accessibilityHint={t('profile.privacyLearnMore')}
        >
          <View style={styles.privacy}>
            <View style={[styles.privacyIcon, { backgroundColor: statusMap.normal.bg }]}>
              <Icon name="shield-check" size={22} color={statusMap.normal.fg} />
            </View>
            <View style={styles.privacyBody}>
              <Text style={styles.privacyTitle}>{t('profile.privacyTitle')}</Text>
              <Text style={styles.privacyText}>{t('profile.privacyBody')}</Text>
              <View style={styles.privacyLink}>
                <Text style={styles.privacyLinkText}>{t('profile.privacyLearnMore')}</Text>
                <Icon name="chevron-right" size={14} color={colors.link} />
              </View>
            </View>
          </View>
        </Card>

        {/* ── Sign out — destructive, and confirmed ────────────────────── */}
        <View>
          <SectionHeader title={t('opesCore.profile.signOutSection')} variant="overline" />
          <TouchableOpacity
            style={styles.signOut}
            activeOpacity={0.8}
            onPress={confirmSignOut}
            disabled={dialog.busy}
            accessibilityRole="button"
            accessibilityLabel={t('profile.signOut')}
            accessibilityState={{ disabled: dialog.busy }}
          >
            <Icon name="logout" size={18} color={colors.statusCritical} />
            <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function HeroFact({ icon, value }: { icon: IconName; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.heroFact}>
      <Icon name={icon} size={16} color={colors.textOnBrand} />
      <Text style={styles.heroFactText} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function StatTile({ tile }: { tile: Tile }) {
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = tintMap[tile.tint];
  return (
    <TouchableOpacity
      style={styles.tileWrap}
      activeOpacity={0.75}
      onPress={tile.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tile.label}: ${tile.value}`}
      accessibilityHint={tile.hint}
    >
      <Card style={styles.tile}>
        <View style={styles.tileTop}>
          <View style={[styles.tileCircle, { backgroundColor: skin.bg }]}>
            <Icon name={tile.icon} size={20} color={skin.fg} />
          </View>
          <Icon name="chevron-right" size={16} color={colors.textMuted} />
        </View>
        <Text style={styles.tileValue} numberOfLines={1}>
          {tile.value}
        </Text>
        <Text style={styles.tileLabel} numberOfLines={1}>
          {tile.label}
        </Text>
        <Text style={styles.tileHint} numberOfLines={2}>
          {tile.hint}
        </Text>
      </Card>
    </TouchableOpacity>
  );
}

// ── Styles (colour-dependent, built per palette) ───────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    // Hero
    hero: { backgroundColor: colors.navy, borderRadius: radii.lg, padding: spacing.md },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    avatarWrap: { width: 74, height: 74 },
    avatar: {
      width: 74,
      height: 74,
      borderRadius: 37,
      backgroundColor: colors.navyLight,
      borderWidth: 3,
      borderColor: colors.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textOnBrand,
    },
    avatarBadge: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.statusNormal,
      borderWidth: 2,
      borderColor: colors.navy,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroIdentity: { flex: 1, minWidth: 0, gap: spacing.xs },
    heroName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textOnBrand,
    },
    heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    heroChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    heroChipText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs },
    heroIdRow: {
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      backgroundColor: colors.navyLight,
      borderRadius: radii.md,
      padding: spacing.sm + 4,
    },
    heroIdIcon: {
      width: 44,
      height: 44,
      borderRadius: radii.sm + 4,
      backgroundColor: colors.navy,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroIdText: { flex: 1, minWidth: 0 },
    heroIdLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 10,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textOnBrand,
      opacity: 0.7,
    },
    heroIdValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: colors.textOnBrand,
    },
    heroIdHint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: colors.textOnBrand,
      opacity: 0.75,
    },
    heroRule: { height: 1, backgroundColor: colors.navyLight, marginVertical: spacing.md },
    heroFacts: { flexDirection: 'row', alignItems: 'center' },
    heroFact: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
    heroFactRule: {
      width: 1,
      height: 20,
      backgroundColor: colors.navyLight,
      marginHorizontal: spacing.sm,
    },
    heroFactText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textOnBrand,
    },

    // Quick overview tiles (2 × 2)
    tileGrid: { gap: spacing.sm + 4 },
    tileRow: { flexDirection: 'row', gap: spacing.sm + 4 },
    tileWrap: { flex: 1 },
    tile: { gap: 2 },
    tileTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    tileCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      lineHeight: typography.lineHeight.xl,
      color: colors.textPrimary,
    },
    tileLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    tileHint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    // Privacy banner
    privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    privacyIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    privacyBody: { flex: 1, minWidth: 0, gap: 2 },
    privacyTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    privacyText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    privacyLink: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: spacing.xs },
    privacyLinkText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.link,
    },

    // Sign out
    signOut: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.statusCritical,
      backgroundColor: colors.statusCriticalBg,
    },
    signOutText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.statusCritical,
    },
  });
