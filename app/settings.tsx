import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  SegmentedTabs,
  StatusBadge,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type PaletteName,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import {
  NOTIFICATION_PREFERENCE_KEYS,
  readPreference,
  useLanguagePreference,
  useNotificationPreferences,
  usePushRegistration,
  type NotificationPreferenceKey,
} from '../lib/api/settingsQueries';
import { runningVersion, useAppConfig, compareVersions } from '../lib/api/appConfigQueries';
import { useAuthStore } from '../lib/store/auth';

/**
 * Settings — the account hub, in the OPES CORE-008 layout: an identity card,
 * then overline-labelled groups of tint-circle rows inside flush cards, with
 * trailing switches for toggles, a privacy assurance block and a support
 * footer. Every data hook is the one the previous version used.
 *
 * Deliberate departures from the OPES reference, each because the platform
 * does not support what it draws:
 *  - **No light/dark picker.** `preferred_theme` is a real API field
 *    (light|dark|system) but the app ships one light palette; a dark option
 *    would store a preference that changes nothing. What *is* here is the
 *    kit's brand-palette switch (OpesCare ↔ OPES), which is a device-local
 *    presentation choice, persisted under `PALETTE_STORAGE_KEY` and never
 *    written to the API.
 *  - **No biometric-login toggle.** `biometric_login_enabled` is likewise real
 *    on the API, but `expo-local-authentication` is not installed and no login
 *    path consults it.
 *  - **No date/time-format or temperature rows.** The API has no such fields.
 *  - **No "Delete account" row.** There is no mobile account-deletion endpoint;
 *    data rights live under Privacy, which is wired.
 *
 * Every row here navigates to a route that exists under `app/`.
 */

/** Route targets, each verified against a file under `app/`. */
const ROUTES = {
  editProfile: '/edit-profile',
  family: '/family',
  notifications: '/notifications',
  privacy: '/privacy',
  accessLogs: '/privacy/access-logs',
  dataRequests: '/privacy/export',
  downloadRecords: '/export-records',
  carePlans: '/care-plans',
  referrals: '/referrals',
  offlineAccess: '/offline-access',
  help: '/help',
  // `app/legal/privacy.tsx` and `app/legal/terms.tsx` shipped with no entry
  // point anywhere in the app — `scripts/nav-audit.mjs` reported both as
  // orphans. Both screens' own back handler is
  // `router.canGoBack() ? back() : replace('/settings')`, so this is the
  // parent they were written for.
  privacyPolicy: '/legal/privacy',
  terms: '/legal/terms',
  // Both stores require an in-app way to delete your account when the app
  // creates them. This screen used to carry a comment saying no such route
  // existed; it does now.
  deleteAccount: '/account/delete',
} as const;

/**
 * Where the palette choice lives on this device. The root `ThemeProvider`
 * (app/_layout.tsx) reads this key at launch and passes it as
 * `initialPalette`; this screen is the only writer. Values are the kit's
 * `PaletteName` — `'opescare'` (default) or `'opes'`. SecureStore natively,
 * localStorage on web (expo-secure-store has no web implementation), the same
 * split every other device-local flag in `lib/` uses.
 */
export const PALETTE_STORAGE_KEY = 'opescare_ui_palette';

async function persistPalette(next: PaletteName): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(PALETTE_STORAGE_KEY, next);
      return;
    }
    await SecureStore.setItemAsync(PALETTE_STORAGE_KEY, next);
  } catch {
    // A presentation preference is not worth an error state: the switch has
    // already flipped in memory, and the worst case is the default palette on
    // the next launch.
  }
}

const PREFERENCE_META: Record<
  NotificationPreferenceKey,
  { icon: IconName; tint: Tint; labelKey: string; bodyKey: string }
> = {
  push_appointments: {
    icon: 'calendar-check',
    tint: 'blue',
    labelKey: 'settings.notifications.appointments',
    bodyKey: 'settings.notifications.appointmentsBody',
  },
  push_lab_results: {
    icon: 'flask',
    tint: 'green',
    labelKey: 'settings.notifications.labResults',
    bodyKey: 'settings.notifications.labResultsBody',
  },
  push_prescriptions: {
    icon: 'pill',
    tint: 'purple',
    labelKey: 'settings.notifications.prescriptions',
    bodyKey: 'settings.notifications.prescriptionsBody',
  },
  push_billing: {
    icon: 'credit-card',
    tint: 'amber',
    labelKey: 'settings.notifications.billing',
    bodyKey: 'settings.notifications.billingBody',
  },
  push_consent_requests: {
    icon: 'shield-check',
    tint: 'blue',
    labelKey: 'settings.notifications.consentRequests',
    bodyKey: 'settings.notifications.consentRequestsBody',
  },
};

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, palette, togglePalette, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const patient = useAuthStore((s) => s.patient);
  const { settings, query, toggle, pendingKey, isError: prefsError } = useNotificationPreferences();
  const { language, setLanguage, isError: languageError } = useLanguagePreference();
  const push = usePushRegistration();
  const appConfig = useAppConfig();

  const installedVersion = runningVersion();
  const latestVersion = appConfig.data?.latest_version ?? null;
  const updateAvailable =
    !!installedVersion && !!latestVersion && compareVersions(installedVersion, latestVersion) < 0;

  const fullName =
    [patient?.first_name, patient?.last_name].filter(Boolean).join(' ').trim() ||
    patient?.display_name ||
    '';
  const initials =
    `${patient?.first_name?.[0] ?? ''}${patient?.last_name?.[0] ?? ''}`.toUpperCase() || '?';
  const status = (patient?.status ?? '').toLowerCase();
  const isVerified = status === 'verified' || status === 'active';

  // The kit's `togglePalette()` flips from whatever is current; the value
  // persisted is the one it is about to become.
  const onTogglePalette = useCallback(() => {
    const next: PaletteName = palette === 'opes' ? 'opescare' : 'opes';
    togglePalette();
    void persistPalette(next);
  }, [palette, togglePalette]);

  const paletteIsOpes = palette === 'opes';
  const paletteLabel = paletteIsOpes
    ? t('settings.appearance.opes', { defaultValue: 'OPES' })
    : t('settings.appearance.opescare', { defaultValue: 'OpesCare' });

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* No `onBack`: the kit falls back to the app-wide handler registered in
          app/_layout.tsx (`canGoBack() ? back() : replace('/(tabs)/home')`).
          Passing `() => router.back()` here OVERRODE that with a call that is
          a silent no-op when there is no stack to pop — and Settings is
          reached without one every time, from the Notification Center's empty
          state, from a deep link, or from a cold start on this URL. */}
      <ScreenHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Identity — who these settings belong to, straight from the session. */}
        {patient ? (
          <Card
            onPress={() => router.push(ROUTES.editProfile)}
            accessibilityLabel={t('settings.account.viewProfile')}
          >
            <View style={styles.identity}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.identityBody}>
                <Text style={styles.identityName} numberOfLines={1}>
                  {fullName}
                </Text>
                <Text style={styles.identityId} numberOfLines={1}>
                  {t('settings.account.healthId', { id: patient.health_id })}
                </Text>
                <View style={styles.identityBadge}>
                  <StatusBadge
                    status={isVerified ? 'verified' : 'pending'}
                    label={isVerified ? t('profile.verified') : t('profile.pending')}
                    icon={isVerified ? 'check-circle' : 'alert-circle'}
                    size="sm"
                  />
                </View>
              </View>
              <Icon name="chevron-right" size={18} color={colors.textMuted} />
            </View>
          </Card>
        ) : null}

        {/* Everything below is rendered unconditionally.
            GET /mobile/settings feeds ONE group — the notification toggles —
            but its failure used to replace the whole screen with a retry card,
            taking Privacy, Consent, Access logs, Data requests, Help and
            Offline access down with it. Settings is the hub those live behind,
            so a failed preferences fetch became a dead end for six features
            that never needed the call. The load/error/retry states now live
            inside the group that actually depends on them.

            The fragment below is what the removed ternary's branch left
            behind. It is kept rather than unwrapped so this diff stays a
            behaviour change and not a 250-line re-indent. */}
        <>
            {/* ── Account ─────────────────────────────────────────────── */}
            <View>
              <SectionHeader title={t('settings.group.account')} variant="overline" />
              <Card variant="flush">
                <ListRow
                  icon="person"
                  tint="blue"
                  title={t('settings.account.personal')}
                  subtitle={t('settings.account.personalBody')}
                  onPress={() => router.push(ROUTES.editProfile)}
                  divider
                />
                <ListRow
                  icon="users"
                  tint="purple"
                  title={t('settings.account.family')}
                  subtitle={t('settings.account.familyBody')}
                  onPress={() => router.push(ROUTES.family)}
                  divider
                />
                {/*
                  Last in the group and red, because it is the destructive one.
                  It opens a disclosure screen, not a confirmation dialog — the
                  patient reads what is erased, what is de-identified and what
                  is RETAINED under a statutory duty before anything happens,
                  and there is a 30-day grace period after that.
                */}
                <ListRow
                  icon="trash"
                  tint="red"
                  title={t('accountDeletion.settingsRow', {
                    defaultValue: 'Close my account',
                  })}
                  subtitle={t('accountDeletion.settingsRowBody', {
                    defaultValue:
                      'Erase your sign-in and personal details. Your clinical record is kept as the law requires.',
                  })}
                  onPress={() => router.push(ROUTES.deleteAccount)}
                />
              </Card>
            </View>

            {/* ── Language ────────────────────────────────────────────── */}
            <View>
              <SectionHeader title={t('settings.group.language')} variant="overline" />
              <Card>
                <View style={styles.languageHead}>
                  <View style={[styles.circle, { backgroundColor: tintMap.blue.bg }]}>
                    <Icon name="globe" size={20} color={tintMap.blue.fg} />
                  </View>
                  <View style={styles.languageText}>
                    <Text style={styles.rowTitle}>{t('settings.language.title')}</Text>
                    <Text style={styles.rowSubtitle}>{t('settings.language.body')}</Text>
                  </View>
                </View>

                <SegmentedTabs
                  variant="pill"
                  value={language}
                  onChange={(key) => setLanguage(key === 'fr' ? 'fr' : 'en')}
                  options={[
                    { key: 'en', label: t('settings.language.en') },
                    { key: 'fr', label: t('settings.language.fr') },
                  ]}
                  style={styles.languageTabs}
                />

                {languageError ? (
                  <Text style={styles.inlineError}>{t('settings.language.saveError')}</Text>
                ) : null}
              </Card>
            </View>

            {/* ── Appearance — the kit's palette switch, device-local ─── */}
            <View>
              <SectionHeader title={t('opesCore.profile.preferences')} variant="overline" />
              <Card variant="flush">
                <ListRow
                  icon="contrast"
                  tint="purple"
                  title={t('opesCore.profile.theme')}
                  subtitle={t('settings.appearance.body', {
                    defaultValue: 'Switch between the OpesCare brand and the OPES template palette.',
                  })}
                  trailing={
                    <View style={styles.switchWithValue}>
                      <Text style={styles.switchValue} numberOfLines={1}>
                        {paletteLabel}
                      </Text>
                      <ThemedSwitch
                        value={paletteIsOpes}
                        onValueChange={onTogglePalette}
                        accessibilityLabel={t('opesCore.profile.theme')}
                      />
                    </View>
                  }
                />
              </Card>
            </View>

            {/* ── Notifications ───────────────────────────────────────── */}
            <View>
              <SectionHeader title={t('settings.group.notifications')} variant="overline" />
              {query.isLoading ? (
                <Card>
                  <View style={styles.loading}>
                    <ActivityIndicator color={colors.blue} />
                    <Text style={styles.loadingText}>{t('opesCore.common.loading')}</Text>
                  </View>
                </Card>
              ) : query.isError || !settings ? (
                <Card variant="flush">
                  <EmptyState
                    icon="alert-circle"
                    tint="red"
                    title={t('settings.loadError')}
                    message={t('settings.loadErrorBody')}
                    actionLabel={t('settings.retry')}
                    onAction={() => query.refetch()}
                  />
                </Card>
              ) : (
                <Card variant="flush">
                  {NOTIFICATION_PREFERENCE_KEYS.map((key, index) => {
                    const meta = PREFERENCE_META[key];
                    return (
                      <ToggleRow
                        key={key}
                        icon={meta.icon}
                        tint={meta.tint}
                        title={t(meta.labelKey)}
                        subtitle={t(meta.bodyKey)}
                        value={readPreference(settings, key)}
                        onChange={(next) => toggle(key, next)}
                        busy={pendingKey === key}
                        unknownLabel={t('settings.notifications.unavailable')}
                        divider={index < NOTIFICATION_PREFERENCE_KEYS.length - 1}
                      />
                    );
                  })}
                </Card>
              )}

              {prefsError ? (
                <InlineNotice
                  tone="critical"
                  icon="alert-circle"
                  body={t('settings.notifications.updateError')}
                />
              ) : null}

              <Card variant="flush" style={styles.stackedCard}>
                <ListRow
                  icon="history"
                  tint="blue"
                  title={t('settings.notifications.centre')}
                  subtitle={t('settings.notifications.centreBody')}
                  onPress={() => router.push(ROUTES.notifications)}
                />
              </Card>
            </View>

            {/* ── This device ─────────────────────────────────────────── */}
            <View>
              <SectionHeader title={t('settings.group.device')} variant="overline" />
              <Card variant="flush">
                <ToggleRow
                  icon="bell"
                  tint="amber"
                  title={t('settings.device.pushLabel')}
                  subtitle={t('settings.device.pushBody')}
                  value={push.loading ? null : push.enabled}
                  onChange={(next) => void push.setEnabled(next)}
                  busy={push.busy}
                  unknownLabel={t('settings.device.pushChecking')}
                  divider
                />
                <ListRow
                  // No "cloud-off" glyph in the kit; the lock reads as "an
                  // encrypted copy on this device", which is what the row is.
                  icon="lock"
                  tint="amber"
                  title={t('settings.device.offline')}
                  subtitle={t('settings.device.offlineBody')}
                  onPress={() => router.push(ROUTES.offlineAccess)}
                />
              </Card>

              {push.error ? (
                <InlineNotice
                  tone={push.error === 'os_denied' ? 'warning' : 'critical'}
                  icon={push.error === 'os_denied' ? 'bell-off' : 'alert-circle'}
                  body={t(`settings.device.${push.error}`)}
                />
              ) : null}
            </View>

            {/* ── Privacy & data ──────────────────────────────────────── */}
            <View>
              <SectionHeader title={t('settings.group.privacy')} variant="overline" />
              <Card variant="flush">
                <ListRow
                  icon="shield-check"
                  tint="green"
                  title={t('settings.privacy.consent')}
                  subtitle={t('settings.privacy.consentBody')}
                  onPress={() => router.push(ROUTES.privacy)}
                  divider
                />
                <ListRow
                  icon="history"
                  tint="blue"
                  title={t('settings.privacy.accessLogs')}
                  subtitle={t('settings.privacy.accessLogsBody')}
                  onPress={() => router.push(ROUTES.accessLogs)}
                  divider
                />
                <ListRow
                  icon="clipboard"
                  tint="purple"
                  title={t('settings.privacy.dataRequests')}
                  subtitle={t('settings.privacy.dataRequestsBody')}
                  onPress={() => router.push(ROUTES.dataRequests)}
                  divider
                />
                <ListRow
                  icon="download"
                  tint="blue"
                  title={t('settings.privacy.download')}
                  subtitle={t('settings.privacy.downloadBody')}
                  onPress={() => router.push(ROUTES.downloadRecords)}
                />
              </Card>
            </View>

            {/* ── Care ────────────────────────────────────────────────── */}
            <View>
              <SectionHeader title={t('settings.group.care')} variant="overline" />
              <Card variant="flush">
                <ListRow
                  icon="target"
                  tint="green"
                  title={t('settings.care.carePlans')}
                  subtitle={t('settings.care.carePlansBody')}
                  onPress={() => router.push(ROUTES.carePlans)}
                  divider
                />
                <ListRow
                  icon="send"
                  tint="purple"
                  title={t('settings.care.referrals')}
                  subtitle={t('settings.care.referralsBody')}
                  onPress={() => router.push(ROUTES.referrals)}
                />
              </Card>
            </View>

            {/* ── About & support ─────────────────────────────────────── */}
            <View>
              <SectionHeader title={t('settings.group.about')} variant="overline" />
              <Card variant="flush">
                <ListRow
                  icon="help-circle"
                  tint="blue"
                  title={t('settings.about.help')}
                  subtitle={t('settings.about.helpBody')}
                  onPress={() => router.push(ROUTES.help)}
                  divider
                />
                {/* The two legal documents. `legal.*` lives in
                    lib/i18n/pending/legal.{en,fr}.json and is not loaded by
                    lib/i18n/index.ts yet, so every string here carries a
                    defaultValue and starts reading correctly the moment those
                    keys land. */}
                <ListRow
                  icon="shield"
                  tint="blue"
                  title={t('legal.privacy.title', { defaultValue: 'Privacy Policy' })}
                  subtitle={t('settings.about.privacyPolicyBody', {
                    defaultValue: 'What we collect, who can see it, and your rights over it.',
                  })}
                  onPress={() => router.push(ROUTES.privacyPolicy)}
                  divider
                />
                <ListRow
                  icon="document-text"
                  tint="blue"
                  title={t('legal.terms.title', { defaultValue: 'Terms of Service' })}
                  subtitle={t('settings.about.termsBody', {
                    defaultValue: 'The rules this app runs by, and what it does not do.',
                  })}
                  onPress={() => router.push(ROUTES.terms)}
                  divider
                />
                <ListRow
                  icon="info"
                  tint="blue"
                  title={t('settings.about.version')}
                  subtitle={
                    updateAvailable
                      ? t('settings.about.updateAvailable', { version: latestVersion })
                      : undefined
                  }
                  value={installedVersion ?? t('settings.about.versionUnknown')}
                  valueColor={colors.textSecondary}
                />
              </Card>
            </View>

            <InlineNotice
              tone="warning"
              icon="heart-pulse"
              title={t('settings.assurance.title')}
              body={t('settings.assurance.body')}
            />
        </>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** A `Switch` painted with the active palette. */
function ThemedSwitch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <Switch
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      trackColor={{ false: colors.divider, true: colors.primarySoft }}
      thumbColor={value ? colors.blue : colors.surface}
      ios_backgroundColor={colors.divider}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
    />
  );
}

/**
 * A list row whose trailing slot is a switch. `value === null` means the
 * server did not give us a value, and the row says so instead of rendering a
 * confident OFF over a stored ON.
 */
function ToggleRow({
  icon,
  tint,
  title,
  subtitle,
  value,
  onChange,
  busy,
  unknownLabel,
  divider,
}: {
  icon: IconName;
  tint: Tint;
  title: string;
  subtitle: string;
  value: boolean | null;
  onChange: (next: boolean) => void;
  busy: boolean;
  unknownLabel: string;
  divider?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const trailing = busy ? (
    <ActivityIndicator color={colors.blue} />
  ) : value === null ? (
    <Text style={styles.unknown} numberOfLines={2}>
      {unknownLabel}
    </Text>
  ) : (
    <ThemedSwitch value={value} onValueChange={onChange} accessibilityLabel={title} />
  );
  return <ListRow icon={icon} tint={tint} title={title} subtitle={subtitle} trailing={trailing} divider={divider} />;
}

/** Tinted inline notice: an icon in a status circle, optional title, body. */
function InlineNotice({
  tone,
  icon,
  title,
  body,
}: {
  tone: StatusTone;
  icon: IconName;
  title?: string;
  body: string;
}) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = statusMap[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: skin.bg }]}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.noticeIcon, { backgroundColor: colors.surface }]}>
        <Icon name={icon} size={20} color={skin.fg} />
      </View>
      <View style={styles.noticeBody}>
        {title ? <Text style={[styles.noticeTitle, { color: skin.fg }]}>{title}</Text> : null}
        <Text style={styles.noticeText}>{body}</Text>
      </View>
    </View>
  );
}

// ── Styles (colour-dependent, built per palette) ───────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },
    stackedCard: { marginTop: spacing.sm + 4 },

    loading: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    // Identity card
    identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.blue,
    },
    identityBody: { flex: 1, minWidth: 0, gap: 2 },
    identityName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textPrimary,
    },
    identityId: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    identityBadge: { flexDirection: 'row', marginTop: spacing.xs },

    // Language card
    languageHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    circle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    languageText: { flex: 1, minWidth: 0 },
    languageTabs: { marginTop: spacing.md },
    rowTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    rowSubtitle: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    inlineError: {
      marginTop: spacing.sm + 4,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.statusCritical,
    },

    // Switch rows
    switchWithValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    switchValue: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    unknown: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
      textAlign: 'right',
    },

    // Inline notice
    notice: {
      marginTop: spacing.sm + 4,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      padding: spacing.md,
      borderRadius: radii.md,
    },
    noticeIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noticeBody: { flex: 1, minWidth: 0, gap: 2 },
    noticeTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
    noticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
  });
