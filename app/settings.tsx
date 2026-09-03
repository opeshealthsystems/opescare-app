import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  Bell,
  BellRing,
  CalendarCheck,
  CircleAlert,
  ClipboardList,
  CloudOff,
  CreditCard,
  Download,
  FileClock,
  FileOutput,
  FlaskConical,
  Globe,
  HeartPulse,
  Info,
  LifeBuoy,
  Pill,
  Send,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
} from 'lucide-react-native';
import { Screen } from '../components/ui/Screen';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { ListRow } from '../components/ui/ListRow';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/Skeleton';
import {
  GroupCard,
  InlineNotice,
  ScreenHeader,
  SegmentedControl,
  ToggleRow,
} from '../components/settings/SettingsUi';
import {
  NOTIFICATION_PREFERENCE_KEYS,
  readPreference,
  useLanguagePreference,
  useNotificationPreferences,
  usePushRegistration,
  type AppLanguage,
  type NotificationPreferenceKey,
} from '../lib/api/settingsQueries';
import { runningVersion, useAppConfig, compareVersions } from '../lib/api/appConfigQueries';
import { useAuthStore } from '../lib/store/auth';
import { colors, radii, sizing, spacing, typography } from '../theme/tokens';

/**
 * Settings — the account hub.
 *
 * Reference: `Mobile app screens/a_clean_mobile_app_settings_screen_ui_screenshot.png`
 * ("Account Settings": identity card, then labelled groups of icon-tiled rows,
 * a privacy assurance block and a support footer) and
 * `a_bright_clean_white_mobile_app_settings_screen.png` (the notification
 * toggle block and the value-on-the-right privacy rows).
 *
 * Deliberate departures from those references, each because the platform does
 * not support what they draw:
 *  - **No theme picker.** `preferred_theme` is a real API field
 *    (light|dark|system) but the app ships one light palette; a dark option
 *    would store a preference that changes nothing.
 *  - **No biometric-login toggle.** `biometric_login_enabled` is likewise real
 *    on the API, but `expo-local-authentication` is not installed and no login
 *    path consults it.
 *  - **No date/time-format or temperature rows.** The API has no such fields.
 *  - **No "Delete account" row.** There is no mobile account-deletion endpoint;
 *    data rights live under Privacy, which is wired.
 *
 * Every row here navigates to a route that exists under `app/`. Two of them —
 * Care plans and Referrals — were previously reachable by URL only.
 */

/** Route targets, each verified against a file under `app/`. */
const ROUTES = {
  editProfile: '/edit-profile',
  family: '/family',
  insurance: '/insurance',
  notifications: '/notifications',
  privacy: '/privacy',
  accessLogs: '/privacy/access-logs',
  dataRequests: '/privacy/export',
  downloadRecords: '/export-records',
  carePlans: '/care-plans',
  referrals: '/referrals',
  offlineAccess: '/offline-access',
  help: '/help',
} as const;

const PREFERENCE_META: Record<
  NotificationPreferenceKey,
  { icon: typeof Bell; labelKey: string; bodyKey: string }
> = {
  push_appointments: {
    icon: CalendarCheck,
    labelKey: 'settings.notifications.appointments',
    bodyKey: 'settings.notifications.appointmentsBody',
  },
  push_lab_results: {
    icon: FlaskConical,
    labelKey: 'settings.notifications.labResults',
    bodyKey: 'settings.notifications.labResultsBody',
  },
  push_prescriptions: {
    icon: Pill,
    labelKey: 'settings.notifications.prescriptions',
    bodyKey: 'settings.notifications.prescriptionsBody',
  },
  push_billing: {
    icon: CreditCard,
    labelKey: 'settings.notifications.billing',
    bodyKey: 'settings.notifications.billingBody',
  },
  push_consent_requests: {
    icon: ShieldCheck,
    labelKey: 'settings.notifications.consentRequests',
    bodyKey: 'settings.notifications.consentRequestsBody',
  },
};

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

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

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing['2xl'], paddingBottom: spacing['4xl'] }}
      >
        <ScreenHeader
          title={t('settings.title')}
          subtitle={t('settings.subtitle')}
          onBack={() => router.back()}
        />

        {/* Identity — who these settings belong to, straight from the session. */}
        {patient ? (
          <Card
            className="mt-6"
            padding="lg"
            onPress={() => router.push(ROUTES.editProfile)}
            accessibilityLabel={t('settings.account.viewProfile')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: sizing.avatar.lg,
                  height: sizing.avatar.lg,
                  borderRadius: radii.pill,
                  backgroundColor: colors.brand[50],
                  borderWidth: 1,
                  borderColor: colors.brand[100],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: typography.size.xl,
                    fontWeight: typography.weight.extrabold,
                    color: colors.brand[600],
                  }}
                >
                  {initials}
                </Text>
              </View>

              <View style={{ flex: 1, marginLeft: spacing.lg }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: typography.size.lg,
                    lineHeight: typography.lineHeight.lg,
                    fontWeight: typography.weight.bold,
                    color: colors.navy.text,
                  }}
                >
                  {fullName}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 2,
                    fontSize: typography.size.sm,
                    lineHeight: typography.lineHeight.sm,
                    color: colors.navy.secondary,
                  }}
                >
                  {t('settings.account.healthId', { id: patient.health_id })}
                </Text>
                <View style={{ marginTop: spacing.sm }}>
                  <Chip
                    label={isVerified ? t('profile.verified') : t('profile.pending')}
                    tone={isVerified ? 'success' : 'warning'}
                    icon={isVerified ? BadgeCheck : CircleAlert}
                  />
                </View>
              </View>
            </View>
          </Card>
        ) : null}

        {query.isLoading ? (
          <View style={{ marginTop: spacing['2xl'], gap: spacing.lg }}>
            <SkeletonCard rows={2} />
            <SkeletonCard rows={5} />
            <SkeletonCard rows={3} />
          </View>
        ) : query.isError || !settings ? (
          <Card className="mt-6" padding="none">
            <EmptyState
              compact
              tone="danger"
              icon={CircleAlert}
              title={t('settings.loadError')}
              description={t('settings.loadErrorBody')}
              actionLabel={t('settings.retry')}
              onAction={() => query.refetch()}
            />
          </Card>
        ) : (
          <>
            {/* ── Account ─────────────────────────────────────────────── */}
            <GroupCard label={t('settings.group.account')} className="mt-7">
              <ListRow
                icon={UserRound}
                title={t('settings.account.personal')}
                subtitle={t('settings.account.personalBody')}
                onPress={() => router.push(ROUTES.editProfile)}
                divider
              />
              <ListRow
                icon={Users}
                title={t('settings.account.family')}
                subtitle={t('settings.account.familyBody')}
                onPress={() => router.push(ROUTES.family)}
                divider
              />
              <ListRow
                icon={CreditCard}
                title={t('settings.account.insurance')}
                subtitle={t('settings.account.insuranceBody')}
                onPress={() => router.push(ROUTES.insurance)}
              />
            </GroupCard>

            {/* ── Language ────────────────────────────────────────────── */}
            <View className="mt-7">
              <Text
                style={{
                  marginBottom: spacing.md,
                  fontSize: typography.size.xs,
                  lineHeight: typography.lineHeight.xs,
                  fontWeight: typography.weight.bold,
                  letterSpacing: typography.tracking.overline,
                  textTransform: 'uppercase',
                  color: colors.brand[600],
                }}
              >
                {t('settings.group.language')}
              </Text>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View
                    style={{
                      width: sizing.tile.sm,
                      height: sizing.tile.sm,
                      borderRadius: radii.tile,
                      backgroundColor: colors.brand[50],
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Globe color={colors.brand[600]} size={sizing.icon.md} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text
                      style={{
                        fontSize: typography.size.md,
                        lineHeight: typography.lineHeight.md,
                        fontWeight: typography.weight.semibold,
                        color: colors.navy.text,
                      }}
                    >
                      {t('settings.language.title')}
                    </Text>
                    <Text
                      style={{
                        marginTop: 2,
                        fontSize: typography.size.sm,
                        lineHeight: typography.lineHeight.sm,
                        color: colors.navy.secondary,
                      }}
                    >
                      {t('settings.language.body')}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: spacing.lg }}>
                  <SegmentedControl<AppLanguage>
                    value={language}
                    onChange={setLanguage}
                    options={[
                      { value: 'en', label: t('settings.language.en') },
                      { value: 'fr', label: t('settings.language.fr') },
                    ]}
                  />
                </View>

                {languageError ? (
                  <Text
                    style={{
                      marginTop: spacing.md,
                      fontSize: typography.size.xs,
                      color: colors.semantic.danger,
                    }}
                  >
                    {t('settings.language.saveError')}
                  </Text>
                ) : null}
              </Card>
            </View>

            {/* ── Notifications ───────────────────────────────────────── */}
            <GroupCard label={t('settings.group.notifications')} className="mt-7">
              {NOTIFICATION_PREFERENCE_KEYS.map((key, index) => {
                const meta = PREFERENCE_META[key];
                return (
                  <ToggleRow
                    key={key}
                    icon={meta.icon}
                    label={t(meta.labelKey)}
                    body={t(meta.bodyKey)}
                    value={readPreference(settings, key)}
                    onChange={(next) => toggle(key, next)}
                    busy={pendingKey === key}
                    unknownLabel={t('settings.notifications.unavailable')}
                    divider={index < NOTIFICATION_PREFERENCE_KEYS.length - 1}
                  />
                );
              })}
            </GroupCard>

            {prefsError ? (
              <InlineNotice
                className="mt-3"
                tone="danger"
                icon={CircleAlert}
                body={t('settings.notifications.updateError')}
              />
            ) : null}

            <Card className="mt-4" padding="none" style={{ paddingHorizontal: spacing.lg }}>
              <ListRow
                icon={Bell}
                title={t('settings.notifications.centre')}
                subtitle={t('settings.notifications.centreBody')}
                onPress={() => router.push(ROUTES.notifications)}
              />
            </Card>

            {/* ── This device ─────────────────────────────────────────── */}
            <GroupCard label={t('settings.group.device')} className="mt-7">
              <ToggleRow
                icon={BellRing}
                label={t('settings.device.pushLabel')}
                body={t('settings.device.pushBody')}
                value={push.loading ? null : push.enabled}
                onChange={(next) => void push.setEnabled(next)}
                busy={push.busy}
                unknownLabel={t('settings.device.pushChecking')}
                divider
              />
              <ListRow
                icon={CloudOff}
                title={t('settings.device.offline')}
                subtitle={t('settings.device.offlineBody')}
                onPress={() => router.push(ROUTES.offlineAccess)}
              />
            </GroupCard>

            {push.error ? (
              <InlineNotice
                className="mt-3"
                tone={push.error === 'os_denied' ? 'warning' : 'danger'}
                icon={push.error === 'os_denied' ? Smartphone : CircleAlert}
                body={t(`settings.device.${push.error}`)}
              />
            ) : null}

            {/* ── Privacy & data ──────────────────────────────────────── */}
            <GroupCard label={t('settings.group.privacy')} className="mt-7">
              <ListRow
                icon={ShieldCheck}
                title={t('settings.privacy.consent')}
                subtitle={t('settings.privacy.consentBody')}
                onPress={() => router.push(ROUTES.privacy)}
                divider
              />
              <ListRow
                icon={FileClock}
                title={t('settings.privacy.accessLogs')}
                subtitle={t('settings.privacy.accessLogsBody')}
                onPress={() => router.push(ROUTES.accessLogs)}
                divider
              />
              <ListRow
                icon={FileOutput}
                title={t('settings.privacy.dataRequests')}
                subtitle={t('settings.privacy.dataRequestsBody')}
                onPress={() => router.push(ROUTES.dataRequests)}
                divider
              />
              <ListRow
                icon={Download}
                title={t('settings.privacy.download')}
                subtitle={t('settings.privacy.downloadBody')}
                onPress={() => router.push(ROUTES.downloadRecords)}
              />
            </GroupCard>

            {/* ── Care — the two areas that had no entry point anywhere ─ */}
            <GroupCard label={t('settings.group.care')} className="mt-7">
              <ListRow
                icon={ClipboardList}
                title={t('settings.care.carePlans')}
                subtitle={t('settings.care.carePlansBody')}
                onPress={() => router.push(ROUTES.carePlans)}
                divider
              />
              <ListRow
                icon={Send}
                title={t('settings.care.referrals')}
                subtitle={t('settings.care.referralsBody')}
                onPress={() => router.push(ROUTES.referrals)}
              />
            </GroupCard>

            {/* ── About & support ─────────────────────────────────────── */}
            <GroupCard label={t('settings.group.about')} className="mt-7">
              <ListRow
                icon={LifeBuoy}
                title={t('settings.about.help')}
                subtitle={t('settings.about.helpBody')}
                onPress={() => router.push(ROUTES.help)}
                divider
              />
              <ListRow
                icon={Info}
                title={t('settings.about.version')}
                subtitle={
                  updateAvailable
                    ? t('settings.about.updateAvailable', { version: latestVersion })
                    : undefined
                }
                value={installedVersion ?? t('settings.about.versionUnknown')}
                showChevron={false}
              />
            </GroupCard>

            <View className="mt-6">
              <InlineNotice
                tone="gold"
                icon={HeartPulse}
                title={t('settings.assurance.title')}
                body={t('settings.assurance.body')}
              />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
