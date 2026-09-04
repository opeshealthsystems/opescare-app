/**
 * CORE-008 — Profile & Settings.
 *
 * Everything on this screen is live:
 *   • `GET  /patient/profile`   — hero identity + contact details
 *   • `PUT  /patient/profile`   — the "Personal Information" / "Contact &
 *                                 Emergency" edit sheets (survives a reload)
 *   • `GET  /patient/settings`  — Preferences, Notification Preferences,
 *                                 Security & Privacy toggles, Account Security
 *   • `PUT  /patient/settings`  — every picker / switch on this screen
 *   • `GET  /patient/dashboard` — the Quick Overview counters
 *   • `GET  /patient/health-id` — verification status + "Patient Since"
 *
 * Layout note: the reference render is ~425pt wide and sets Account Settings /
 * Preferences side by side. At real phone widths those two columns collapse the
 * row subtitles to two or three words each, so the cards are stacked full-width
 * in the same order. Content, order and styling are otherwise unchanged.
 */
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchDashboard,
  fetchHealthId,
  fetchProfile,
  fetchSettings,
  updateProfile,
  updateSettings,
  type HealthIdCard,
  type PatientSettings,
  type PortalDashboard,
  type PortalProfile,
  type PortalSettings,
  type UpdateProfileInput,
} from '../../api';
import { BUILD_STAMP } from '../../buildInfo';
import { Card, Icon, IconName, ListRow, ScreenHeader, SectionHeader, useDialog } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useUnread } from '../../context/UnreadContext';
import { toBcp47, toLocale, useLocale, useTranslation, type Locale, type TFunction } from '../../i18n';
import type { MainTabParamList } from '../../navigation/routes';
import { colors, radii, spacing, Tint, tintMap, typography } from '../../theme/theme';
import { formatDate } from '../../utils/format';
import { AsyncBoundary, CareButton, errorMessage, useAsync } from '../care/shared';

// ── Data ──────────────────────────────────────────────────────────────────

type ProfileData = {
  profile: PortalProfile;
  settings: PortalSettings;
  dashboard: PortalDashboard;
  healthId: HealthIdCard;
};

async function load(): Promise<ProfileData> {
  const [profile, settings, dashboard, healthId] = await Promise.all([
    fetchProfile(),
    fetchSettings(),
    fetchDashboard(),
    fetchHealthId(),
  ]);
  return { profile, settings, dashboard, healthId };
}

// ── Formatting helpers ────────────────────────────────────────────────────

/**
 * Dates go through `src/utils/format.ts`, which is locale-aware and matches
 * the desktop's `App\Support\Format` — `01 Sep 2026` in English,
 * `01 sept. 2026` in French. The hand-rolled English month array that used to
 * live here is exactly the kind of thing a bilingual app cannot have.
 */
function fmtLastLogin(iso: string | null, locale: Locale, t: TFunction): string {
  if (!iso) return t('profile.noRecentSignIn');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('profile.noRecentSignIn');
  const sameDay = d.toDateString() === new Date().toDateString();
  // The clock follows the locale for the same reason the date does: FR is
  // 24-hour in this hospital.
  const time = d.toLocaleTimeString(toBcp47(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: locale !== 'fr',
  });
  return `${sameDay ? t('common.today') : formatDate(iso, t('common.none'))}, ${time}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** "OPES-7845-2217" → "OPES-7845": drop the last block so the tile fits. */
function shortHealthId(id: string): string {
  const parts = id.split('-');
  return parts.length > 2 ? parts.slice(0, parts.length - 1).join('-') : id;
}

/**
 * The two languages the app actually HAS.
 *
 * The picker used to offer three — English (US), English (UK), Français — and
 * translate none of them; it wrote the tag to `PUT /patient/settings` and the
 * app carried on in English. Offering a distinction the product does not make
 * was part of the same broken promise, so the list is now the truth: English,
 * or French. A stored `en-US` from the old list still resolves to English via
 * `toLocale`, and `languageLabel` still names it, so nobody's saved value
 * becomes an unreadable tag.
 */
const LANGUAGES: { key: string; locale: Locale }[] = [
  { key: 'en-GB', locale: 'en' },
  { key: 'fr-FR', locale: 'fr' },
];

const languageLabel = (tag: string, t: TFunction) =>
  t(`languages.${toBcp47(toLocale(tag) ?? 'en')}`);

const themeLabel = (t: TFunction): Record<PatientSettings['theme'], string> => ({
  light: t('profile.themeLight'),
  dark: t('profile.themeDark'),
  system: t('profile.themeSystem'),
});

const unitsLabel = (t: TFunction): Record<PatientSettings['units'], string> => ({
  metric: t('profile.unitsMetric'),
  imperial: t('profile.unitsImperial'),
});

const timeLabel = (t: TFunction): Record<PatientSettings['time_format'], string> => ({
  '24h': t('profile.time24h'),
  '12h': t('profile.time12h'),
});

// ── Screen ────────────────────────────────────────────────────────────────

type SheetKind =
  | { kind: 'none' }
  | { kind: 'personal' }
  | { kind: 'contact' }
  | { kind: 'security' }
  | { kind: 'privacy' }
  | { kind: 'notifications' }
  | { kind: 'option'; field: 'theme' | 'units' | 'date_format' | 'time_format' | 'language' };

export function ProfileSettingsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<MainTabParamList, 'ProfileTab'>>();
  const state = useAsync<ProfileData>(load, []);
  const { t } = useTranslation();
  const { reload, reloadIfStale, setData } = state;
  const { notifications, setNotifications, setMessages } = useUnread();
  const { logout } = useAuth();
  const dialog = useDialog();
  const [sheet, setSheet] = useState<SheetKind>({ kind: 'none' });
  const [copied, setCopied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  /**
   * The CORE-008 sub-settings are these sheets, not screens of their own, so
   * other screens deep-link here with `{ sheet: … }` — "Edit your details"
   * before a scan, "Manage access" from the Health ID. The param is consumed
   * once so a later back-navigation does not reopen the sheet.
   */
  const requestedSheet = route.params?.sheet;
  React.useEffect(() => {
    if (!requestedSheet) return;
    setSheet({ kind: requestedSheet });
    navigation.setParams({ sheet: undefined });
  }, [requestedSheet, navigation]);

  // Keep the header bell and the Messages tab badge honest.
  const counts = state.data?.dashboard.counts;
  React.useEffect(() => {
    if (!counts) return;
    setNotifications(counts.unread_notifications);
    setMessages(counts.unread_messages);
  }, [counts, setNotifications, setMessages]);

  const applyProfile = useCallback(
    (profile: PortalProfile) => {
      if (!state.data) return;
      setData({ ...state.data, profile });
    },
    [state.data, setData]
  );

  const applySettings = useCallback(
    (settings: PortalSettings) => {
      if (!state.data) return;
      setData({ ...state.data, settings });
    },
    [state.data, setData]
  );

  const copyHealthId = useCallback((value: string) => {
    Clipboard.setString(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, []);

  // Sign out — the SAME implementation the doctor side uses. `logout()`
  // unregisters push, revokes the token, clears the stored patient token
  // (`opes_emr_patient_token`) AND the offline cache (`clearCache()`), then
  // drops the session so `RootNavigator` returns to the login screen. This is
  // the only way to hand a shared clinic phone to the next patient safely.
  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await logout();
      // No navigation and no success notice: `logout()` drops the session and
      // `RootNavigator` unmounts this whole tree. Anything else races that.
    } catch {
      setSigningOut(false);
      dialog.alert(t('profile.signOutFailedTitle'), t('profile.signOutFailedBody'));
    }
  }, [logout, dialog, t]);

  const confirmSignOut = useCallback(() => {
    dialog.confirm({
      title: t('profile.signOutConfirmTitle'),
      message: t('profile.signOutConfirmMessage'),
      confirmLabel: t('profile.signOutConfirmCta'),
      destructive: true,
      onConfirm: signOut,
    });
  }, [dialog, t, signOut]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('profile.title')}
        subtitle={t('profile.subtitle')}
        showBack={navigation.canGoBack()}
        actions={[
          { icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications'), accessibilityLabel: t('common.notifications') },
          { icon: 'more-vertical', onPress: () => setSheet({ kind: 'security' }), accessibilityLabel: t('common.moreOptions') },
        ]}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={state.loading && state.data !== null} onRefresh={reload} tintColor={colors.blue} />
        }
      >
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('profile.loading')}>
          {(data) => (
            <>
              <IdentityHero data={data} copied={copied} onCopy={copyHealthId} />

              <QuickOverview data={data} navigate={(r: string, p?: object) => navigation.navigate(r, p)} />

              <View>
                <SectionHeader title={t('profile.accountSettings')} variant="overline" />
                <Card variant="flush">
                  <ListRow
                    icon="person-search"
                    tint="blue"
                    title={t('profile.personalInformation')}
                    subtitle={t('profile.personalInformationHint')}
                    onPress={() => setSheet({ kind: 'personal' })}
                    divider
                  />
                  <ListRow
                    icon="clipboard"
                    tint="blue"
                    title={t('profile.contactEmergency')}
                    subtitle={t('profile.contactEmergencyHint')}
                    onPress={() => setSheet({ kind: 'contact' })}
                    divider
                  />
                  <ListRow
                    icon="shield-check"
                    tint="blue"
                    title={t('profile.security')}
                    subtitle={t('profile.securityHint')}
                    onPress={() => setSheet({ kind: 'security' })}
                    divider
                  />
                  <ListRow
                    icon="lock"
                    tint="blue"
                    title={t('profile.privacyData')}
                    subtitle={t('profile.privacyDataHint')}
                    onPress={() => setSheet({ kind: 'privacy' })}
                    divider
                  />
                  <ListRow
                    icon="bell"
                    tint="blue"
                    title={t('profile.notificationPreferences')}
                    subtitle={t('profile.notificationPreferencesHint')}
                    onPress={() => setSheet({ kind: 'notifications' })}
                    divider
                  />
                  <ListRow
                    icon="globe"
                    tint="blue"
                    title={t('profile.language')}
                    subtitle={t('profile.languageHint')}
                    value={languageLabel(data.settings.settings.language, t)}
                    onPress={() => setSheet({ kind: 'option', field: 'language' })}
                  />
                </Card>
              </View>

              <View>
                <SectionHeader title={t('profile.preferences')} variant="overline" />
                <Card variant="flush">
                  <ListRow
                    icon="sun"
                    tint="blue"
                    title={t('profile.theme')}
                    subtitle={themeLabel(t)[data.settings.settings.theme]}
                    onPress={() => setSheet({ kind: 'option', field: 'theme' })}
                    divider
                  />
                  <ListRow
                    icon="ruler"
                    tint="blue"
                    title={t('profile.units')}
                    subtitle={unitsLabel(t)[data.settings.settings.units]}
                    onPress={() => setSheet({ kind: 'option', field: 'units' })}
                    divider
                  />
                  <ListRow
                    icon="calendar"
                    tint="blue"
                    title={t('profile.dateFormat')}
                    subtitle={data.settings.settings.date_format}
                    onPress={() => setSheet({ kind: 'option', field: 'date_format' })}
                    divider
                  />
                  <ListRow
                    icon="clock"
                    tint="blue"
                    title={t('profile.timeFormat')}
                    subtitle={timeLabel(t)[data.settings.settings.time_format]}
                    onPress={() => setSheet({ kind: 'option', field: 'time_format' })}
                  />
                </Card>
              </View>

              <View>
                <SectionHeader title={t('profile.accountSecurity')} variant="overline" />
                <SecurityCard data={data} onManage={() => setSheet({ kind: 'security' })} />
              </View>

              <PrivacyBanner onLearnMore={() => setSheet({ kind: 'privacy' })} />

              <View>
                <SectionHeader title={t('profile.signOutSection')} variant="overline" />
                <Card>
                  <Text style={styles.signOutHint}>{t('profile.signOutHint')}</Text>
                  <CareButton
                    label={t('common.signOut')}
                    variant="danger"
                    icon="logout"
                    loading={signingOut}
                    disabled={signingOut}
                    onPress={confirmSignOut}
                    style={styles.signOutButton}
                  />
                </Card>
              </View>

              {/*
                  WAS: a "Connected Providers" card linking at a route with no
                  backend anywhere in the platform — no table, no endpoint, no
                  model — so every patient who tapped it landed on a
                  placeholder. Removed rather than made to apologise: Settings
                  should not offer a door that opens onto nothing. Restore this
                  card, its route and its strings together, on the day the API
                  ships.
              */}
            </>
          )}
        </AsyncBoundary>

        {/* Build identity — the only way support can tell which bundle a
            patient is on. Injected at export time; see src/buildInfo.ts. */}
        <Text style={styles.buildStamp} selectable>
          {BUILD_STAMP}
        </Text>
      </ScrollView>

      {state.data ? (
        <Sheets
          sheet={sheet}
          data={state.data}
          onClose={() => setSheet({ kind: 'none' })}
          onProfileSaved={applyProfile}
          onSettingsSaved={applySettings}
        />
      ) : null}

      {dialog.element}
    </View>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────

function IdentityHero({
  data,
  copied,
  onCopy,
}: {
  data: ProfileData;
  copied: boolean;
  onCopy: (value: string) => void;
}) {
  const { t } = useTranslation();
  const { patient } = data.profile;
  const since = data.healthId.linked_at ? new Date(data.healthId.linked_at).getFullYear() : null;
  const verified = data.healthId.status === 'verified';

  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(patient.name)}</Text>
        </View>
        <View style={styles.heroIdentity}>
          <Text style={styles.heroName} numberOfLines={1}>
            {patient.name}
          </Text>
          <TouchableOpacity
            style={styles.heroIdRow}
            activeOpacity={0.7}
            onPress={() => onCopy(patient.health_id)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.healthIdLabel', { id: patient.health_id })}
            // Nothing about a row of text and a small glyph says it can be
            // pressed, let alone that pressing it copies. The copy icon is the
            // only clue and it is 16px of ornament.
            accessibilityHint={t('profile.copyHealthIdHint')}
          >
            <Text style={styles.heroId} numberOfLines={1}>
              {t('profile.healthIdLabel', { id: patient.health_id })}
            </Text>
            <Icon name={copied ? 'check' : 'copy'} size={16} color={colors.textOnBrand} />
          </TouchableOpacity>
          <View style={styles.heroChips}>
            <View style={[styles.heroChip, styles.heroChipVerified]}>
              <Icon
                name={verified ? 'check-circle' : 'alert-circle'}
                size={14}
                color={verified ? colors.statusNormal : colors.statusWarning}
              />
              <Text style={[styles.heroChipText, { color: verified ? colors.statusNormal : colors.statusWarning }]}>
                {verified ? t('common.verified') : t('common.unverified')}
              </Text>
            </View>
            {since ? (
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>{t('profile.patientSince', { year: since })}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.heroRule} />

      <View style={styles.heroFacts}>
        <HeroFact icon="phone" value={patient.phone ?? data.profile.account.phone ?? t('common.none')} />
        <View style={styles.heroFactRule} />
        <HeroFact icon="mail" value={patient.email ?? data.profile.account.email} />
        <View style={styles.heroFactRule} />
        <HeroFact icon="calendar" value={formatDate(patient.date_of_birth, t('common.none'))} />
      </View>
    </View>
  );
}

function HeroFact({ icon, value }: { icon: IconName; value: string }) {
  return (
    <View style={styles.heroFact}>
      <Icon name={icon} size={16} color={colors.textOnBrand} />
      <Text style={styles.heroFactText} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

// ── Quick overview ────────────────────────────────────────────────────────

function QuickOverview({ data, navigate }: { data: ProfileData; navigate: (r: string, p?: object) => void }) {
  const { t } = useTranslation();
  const { patient } = data.profile;

  // "Complete" only when every field the front desk needs is actually filled.
  const complete = [patient.date_of_birth, patient.phone, patient.address, patient.city, patient.next_of_kin_name].every(
    (v) => !!v
  );

  const tiles: { icon: IconName; tint: Tint; label: string; value: string; onPress: () => void }[] = [
    {
      icon: 'person-search',
      tint: 'green',
      label: t('profile.tileHealthId'),
      value: shortHealthId(patient.health_id),
      onPress: () => navigate('MyHealthId'),
    },
    {
      icon: 'document-text',
      tint: 'blue',
      label: t('profile.tileHealthRecord'),
      value: complete ? t('common.complete') : t('common.incomplete'),
      onPress: () => navigate('MainTabs', { screen: 'HealthTab' }),
    },
    {
      icon: 'calendar-plus',
      tint: 'purple',
      label: t('profile.tileUpcomingAppointment'),
      value: String(data.dashboard.counts.upcoming_appointments),
      onPress: () => navigate('AppointmentList', { filter: 'upcoming' }),
    },
    {
      icon: 'capsule',
      tint: 'amber',
      label: t('profile.tileActiveMedications'),
      value: String(data.dashboard.active_medications),
      onPress: () => navigate('Medications'),
    },
  ];

  return (
    <View>
      <SectionHeader title={t('profile.quickOverview')} variant="overline" />
      <Card>
        <View style={styles.tiles}>
          {tiles.map((tile, i) => (
            <View key={tile.label} style={[styles.tile, i > 0 && styles.tileDivided]}>
              <View style={[styles.tileCircle, { backgroundColor: tintMap[tile.tint].bg }]}>
                <Icon name={tile.icon} size={20} color={tintMap[tile.tint].fg} />
              </View>
              <Text style={styles.tileLabel} numberOfLines={2}>
                {tile.label}
              </Text>
              <Text style={styles.tileValue} numberOfLines={1}>
                {tile.value}
              </Text>
              <TouchableOpacity onPress={tile.onPress} accessibilityRole="button">
                <Text style={styles.tileLink}>{t('common.view')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

// ── Account security ──────────────────────────────────────────────────────

function SecurityCard({ data, onManage }: { data: ProfileData; onManage: () => void }) {
  const { t, locale } = useTranslation();
  const { security } = data.settings;
  return (
    <Card>
      <View style={styles.securityRow}>
        <View style={styles.securityShield}>
          <Icon
            name="shield-check"
            size={26}
            color={security.is_secure ? colors.statusNormal : colors.statusWarning}
          />
        </View>
        <View style={styles.securityBody}>
          <Text style={[styles.securityTitle, { color: security.is_secure ? colors.statusNormal : colors.statusWarning }]}>
            {security.is_secure ? t('profile.accountSecure') : t('profile.accountNeedsAttention')}
          </Text>
          <Text style={styles.securityLine}>
            {t('profile.lastLogin', { value: fmtLastLogin(security.last_login_at, locale, t) })}
          </Text>
          <Text style={styles.securityLine}>
            {t('profile.device', { value: security.device ?? t('profile.unknownDevice') })}
          </Text>
        </View>
      </View>
      <CareButton label={t('profile.manageSecurity')} variant="secondary" iconRight="arrow-right" onPress={onManage} style={styles.securityButton} />
    </Card>
  );
}

// ── Footer blocks ─────────────────────────────────────────────────────────

function PrivacyBanner({ onLearnMore }: { onLearnMore: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.privacy}>
      <View style={styles.privacyIcon}>
        <Icon name="lock" size={22} color={colors.statusNormal} />
      </View>
      <View style={styles.privacyBody}>
        <Text style={styles.privacyTitle}>{t('profile.privacyBannerTitle')}</Text>
        <Text style={styles.privacyText}>{t('profile.privacyBannerBody')}</Text>
      </View>
      <CareButton label={t('common.learnMore')} variant="secondary" iconRight="external-link" size="sm" onPress={onLearnMore} />
    </View>
  );
}

// ── Sheets ────────────────────────────────────────────────────────────────

/**
 * `labelKey` / `placeholderKey` are i18n keys. A literal placeholder is kept
 * only where it is a format rather than a word — a Cameroonian phone number
 * and an email address read the same in both languages.
 */
type FieldSpec = {
  key: keyof UpdateProfileInput;
  labelKey: string;
  placeholder?: string;
  placeholderKey?: string;
  keyboard?: 'default' | 'phone-pad' | 'email-address';
};

const PERSONAL_FIELDS: FieldSpec[] = [
  { key: 'phone', labelKey: 'profile.fieldPhone', placeholder: '+237 6 78 45 67 89', keyboard: 'phone-pad' },
  { key: 'email', labelKey: 'profile.fieldEmail', placeholder: 'you@email.com', keyboard: 'email-address' },
  { key: 'address', labelKey: 'profile.fieldAddress', placeholderKey: 'profile.fieldAddressPlaceholder' },
  { key: 'city', labelKey: 'profile.fieldCity', placeholderKey: 'profile.fieldCity' },
];

const CONTACT_FIELDS: FieldSpec[] = [
  { key: 'phone', labelKey: 'profile.fieldPhone', placeholder: '+237 6 78 45 67 89', keyboard: 'phone-pad' },
  { key: 'next_of_kin_name', labelKey: 'profile.fieldKinName', placeholderKey: 'profile.fieldKinNamePlaceholder' },
  { key: 'next_of_kin_phone', labelKey: 'profile.fieldKinPhone', placeholder: '+237 6 00 00 00 00', keyboard: 'phone-pad' },
  { key: 'next_of_kin_relation', labelKey: 'profile.fieldRelation', placeholderKey: 'profile.fieldRelationPlaceholder' },
];

function Sheets({
  sheet,
  data,
  onClose,
  onProfileSaved,
  onSettingsSaved,
}: {
  sheet: SheetKind;
  data: ProfileData;
  onClose: () => void;
  onProfileSaved: (p: PortalProfile) => void;
  onSettingsSaved: (s: PortalSettings) => void;
}) {
  const { t } = useTranslation();
  const { setLocale } = useLocale();

  /**
   * THE PICKER, MADE HONEST.
   *
   * Choosing a language now does two things instead of one:
   *
   *   - `updateSettings({ language })` — the write this screen always made, to
   *     the endpoint it always used. The account keeps its preference and the
   *     web portal sees it.
   *   - `setLocale(...)` — switches the running app and persists the choice on
   *     this device, so the next launch is already in that language whether or
   *     not the network is there.
   *
   * The local switch is applied FIRST and is not undone if the API call fails.
   * The user asked for French; they get French, and the sheet surfaces the
   * save error as it does for every other preference. Refusing to change the
   * language because a server round-trip failed would reproduce the original
   * defect from the other direction.
   */
  const pickLanguage = useCallback(
    async (tag: string) => {
      const next = toLocale(tag);
      if (next) await setLocale(next);
      return updateSettings({ language: tag } as Partial<PatientSettings>);
    },
    [setLocale]
  );

  if (sheet.kind === 'none') return null;

  if (sheet.kind === 'personal' || sheet.kind === 'contact') {
    const personal = sheet.kind === 'personal';
    return (
      <EditSheet
        title={personal ? t('profile.personalInformation') : t('profile.contactEmergency')}
        subtitle={personal ? t('profile.personalSubtitle') : t('profile.contactSubtitle')}
        fields={personal ? PERSONAL_FIELDS : CONTACT_FIELDS}
        profile={data.profile}
        onClose={onClose}
        onSaved={onProfileSaved}
      />
    );
  }

  if (sheet.kind === 'option') {
    const field = sheet.field;
    const options: { key: string; label: string }[] =
      field === 'theme'
        ? (['light', 'dark', 'system'] as const).map((k) => ({ key: k, label: themeLabel(t)[k] }))
        : field === 'units'
          ? (['metric', 'imperial'] as const).map((k) => ({ key: k, label: unitsLabel(t)[k] }))
          : field === 'date_format'
            ? (['DD MMM YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const).map((k) => ({ key: k, label: k }))
            : field === 'time_format'
              ? (['24h', '12h'] as const).map((k) => ({ key: k, label: timeLabel(t)[k] }))
              : LANGUAGES.map((l) => ({ key: l.key, label: languageLabel(l.key, t) }));

    const title = t(
      field === 'date_format'
        ? 'profile.dateFormat'
        : field === 'time_format'
          ? 'profile.timeFormat'
          : field === 'language'
            ? 'profile.language'
            : field === 'theme'
              ? 'profile.theme'
              : 'profile.units'
    );

    // A stored `en-US` from the old three-option list must still show its tick.
    const current = String(data.settings.settings[field]);
    const value = field === 'language' ? toBcp47(toLocale(current) ?? 'en') : current;

    return (
      <OptionSheet
        title={title}
        options={options}
        value={value}
        onClose={onClose}
        onPick={
          field === 'language'
            ? pickLanguage
            : (key) => updateSettings({ [field]: key } as Partial<PatientSettings>)
        }
        onSaved={onSettingsSaved}
      />
    );
  }

  const toggles: { key: keyof PatientSettings; label: string; hint: string }[] =
    sheet.kind === 'notifications'
      ? [
          { key: 'notify_appointments', label: t('profile.notifyAppointments'), hint: t('profile.notifyAppointmentsHint') },
          { key: 'notify_medications', label: t('profile.notifyMedications'), hint: t('profile.notifyMedicationsHint') },
          { key: 'notify_lab_results', label: t('profile.notifyLabResults'), hint: t('profile.notifyLabResultsHint') },
          { key: 'notify_messages', label: t('profile.notifyMessages'), hint: t('profile.notifyMessagesHint') },
          { key: 'notify_billing', label: t('profile.notifyBilling'), hint: t('profile.notifyBillingHint') },
          { key: 'channel_push', label: t('profile.channelPush'), hint: t('profile.channelPushHint') },
          { key: 'channel_email', label: t('profile.channelEmail'), hint: t('profile.channelEmailHint') },
          { key: 'channel_sms', label: t('profile.channelSms'), hint: t('profile.channelSmsHint') },
        ]
      : sheet.kind === 'security'
        ? [
            { key: 'biometric_enabled', label: t('profile.biometric'), hint: t('profile.biometricHint') },
            { key: 'two_factor_enabled', label: t('profile.twoFactor'), hint: t('profile.twoFactorHint') },
          ]
        : [{ key: 'share_data_for_research', label: t('profile.shareResearch'), hint: t('profile.shareResearchHint') }];

  return (
    <TogglesSheet
      title={t(
        sheet.kind === 'notifications'
          ? 'profile.notificationPreferences'
          : sheet.kind === 'security'
            ? 'profile.security'
            : 'profile.privacyData'
      )}
      subtitle={
        sheet.kind === 'security'
          ? t('profile.securitySheetSubtitle')
          : sheet.kind === 'privacy'
            ? t('profile.privacySheetSubtitle')
            : undefined
      }
      toggles={toggles}
      settings={data.settings.settings}
      onClose={onClose}
      onSaved={onSettingsSaved}
    />
  );
}

function SheetShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.sheetGrab} />
        <View style={styles.sheetHead}>
          <View style={styles.sheetHeadText}>
            <Text style={styles.sheetTitle}>{title}</Text>
            {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
          </View>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Icon name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer}
      </View>
    </Modal>
  );
}

function EditSheet({
  title,
  subtitle,
  fields,
  profile,
  onClose,
  onSaved,
}: {
  title: string;
  subtitle?: string;
  fields: FieldSpec[];
  profile: PortalProfile;
  onClose: () => void;
  onSaved: (p: PortalProfile) => void;
}) {
  const { t } = useTranslation();
  const initial = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = (profile.patient as Record<string, unknown>)[f.key as string];
      out[f.key as string] = typeof v === 'string' ? v : '';
    }
    return out;
  }, [fields, profile]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = fields.some((f) => (values[f.key as string] ?? '') !== (initial[f.key as string] ?? ''));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: UpdateProfileInput = {};
      for (const f of fields) {
        const next = (values[f.key as string] ?? '').trim();
        if (next === (initial[f.key as string] ?? '')) continue;
        // `phone` is the one field the API refuses to null out.
        (body as Record<string, unknown>)[f.key as string] = next === '' && f.key !== 'phone' ? null : next;
      }
      const saved = await updateProfile(body);
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(errorMessage(e, t('profile.saveFailed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetShell
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <View style={styles.sheetFooter}>
          {error ? <Text style={styles.sheetError}>{error}</Text> : null}
          <CareButton
            label={saving ? t('common.saving') : t('common.saveChanges')}
            onPress={save}
            disabled={!dirty}
            loading={saving}
          />
        </View>
      }
    >
      {fields.map((f) => (
        <View key={String(f.key)} style={styles.field}>
          <Text style={styles.fieldLabel}>{t(f.labelKey)}</Text>
          <TextInput
            style={styles.input}
            value={values[f.key as string]}
            onChangeText={(t) => setValues((v) => ({ ...v, [f.key as string]: t }))}
            placeholder={f.placeholderKey ? t(f.placeholderKey) : f.placeholder}
            placeholderTextColor={colors.textMuted}
            keyboardType={f.keyboard === 'phone-pad' ? 'phone-pad' : f.keyboard === 'email-address' ? 'email-address' : 'default'}
            autoCapitalize={f.keyboard === 'email-address' ? 'none' : 'sentences'}
            // Derived from the keyboard the field already declares, so a new
            // field cannot be added with the right keypad and the wrong
            // autofill category. `off`/`none` for everything else is the
            // honest answer: an emergency contact's relationship is not a
            // thing any keychain holds.
            autoComplete={
              f.keyboard === 'email-address' ? 'email' : f.keyboard === 'phone-pad' ? 'tel' : 'off'
            }
            textContentType={
              f.keyboard === 'email-address'
                ? 'emailAddress'
                : f.keyboard === 'phone-pad'
                  ? 'telephoneNumber'
                  : 'none'
            }
            // The label above the field is a sibling `Text`, not a `<label>`;
            // nothing associates the two without this.
            accessibilityLabel={t(f.labelKey)}
          />
        </View>
      ))}
    </SheetShell>
  );
}

function OptionSheet({
  title,
  options,
  value,
  onClose,
  onPick,
  onSaved,
}: {
  title: string;
  options: { key: string; label: string }[];
  value: string;
  onClose: () => void;
  onPick: (key: string) => Promise<PortalSettings>;
  onSaved: (s: PortalSettings) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  async function pick(key: string) {
    if (key === value) return onClose();
    setBusy(key);
    setError(null);
    try {
      onSaved(await onPick(key));
      onClose();
    } catch (e) {
      setError(errorMessage(e, t('profile.preferenceSaveFailed')));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SheetShell title={title} onClose={onClose} footer={error ? <Text style={styles.sheetError}>{error}</Text> : undefined}>
      <Card variant="flush">
        {options.map((o, i) => (
          <ListRow
            key={o.key}
            title={o.label}
            chevron={false}
            onPress={() => pick(o.key)}
            divider={i < options.length - 1}
            trailing={
              busy === o.key ? (
                <ActivityIndicator color={colors.blue} />
              ) : o.key === value ? (
                <Icon name="check-circle" size={20} color={colors.statusNormal} />
              ) : undefined
            }
          />
        ))}
      </Card>
    </SheetShell>
  );
}

function TogglesSheet({
  title,
  subtitle,
  toggles,
  settings,
  onClose,
  onSaved,
}: {
  title: string;
  subtitle?: string;
  toggles: { key: keyof PatientSettings; label: string; hint: string }[];
  settings: PatientSettings;
  onClose: () => void;
  onSaved: (s: PortalSettings) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  async function flip(key: keyof PatientSettings, next: boolean) {
    setBusy(String(key));
    setError(null);
    try {
      onSaved(await updateSettings({ [key]: next } as Partial<PatientSettings>));
    } catch (e) {
      setError(errorMessage(e, t('profile.settingSaveFailed')));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SheetShell
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={error ? <Text style={styles.sheetError}>{error}</Text> : undefined}
    >
      <Card variant="flush">
        {toggles.map((row, i) => (
          <View key={String(row.key)} style={[styles.toggleRow, i < toggles.length - 1 && styles.toggleDivider]}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>{row.label}</Text>
              <Text style={styles.toggleHint}>{row.hint}</Text>
            </View>
            <Switch
              value={Boolean(settings[row.key])}
              disabled={busy === String(row.key)}
              onValueChange={(next) => flip(row.key, next)}
              trackColor={{ false: colors.divider, true: colors.primarySoft }}
              thumbColor={Boolean(settings[row.key]) ? colors.blue : colors.surface}
              ios_backgroundColor={colors.divider}
            />
          </View>
        ))}
      </Card>
    </SheetShell>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  buildStamp: {
    marginTop: spacing.lg,
    textAlign: 'center',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  // Hero
  hero: {
    backgroundColor: colors.navy,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
  heroIdentity: { flex: 1, minWidth: 0, gap: spacing.xs },
  heroName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textOnBrand,
  },
  heroIdRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroId: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textOnBrand,
    flexShrink: 1,
  },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.navyLight,
  },
  heroChipVerified: { backgroundColor: colors.statusNormalBg },
  heroChipText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textOnBrand,
  },
  heroRule: { height: 1, backgroundColor: colors.navyLight, marginVertical: spacing.md },
  heroFacts: { flexDirection: 'row', alignItems: 'center' },
  heroFact: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  heroFactRule: { width: 1, height: 20, backgroundColor: colors.navyLight, marginHorizontal: spacing.sm },
  heroFactText: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textOnBrand,
  },

  // Quick overview
  tiles: { flexDirection: 'row', alignItems: 'stretch' },
  tile: { flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  tileDivided: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  tileCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tileLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  tileValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  tileLink: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.statusNormal,
  },

  // Security
  securityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  securityShield: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.statusNormalBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityBody: { flex: 1, minWidth: 0, gap: 2 },
  securityTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
  securityLine: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  securityButton: { marginTop: spacing.md },

  // Sign out
  signOutHint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  signOutButton: { marginTop: spacing.md },

  // Privacy banner
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  privacyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.statusNormalBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyBody: { flex: 1, minWidth: 0, gap: 2 },
  privacyTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.statusNormal,
  },
  privacyText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  // Sheets
  backdrop: { flex: 1, backgroundColor: 'rgba(11,26,92,0.35)' },
  sheet: {
    // Opaque `page`, not the now-transparent `background`: this sheet floats in
    // a transparent Modal with no opaque layer behind it, so `background` let
    // the screen bleed through. `page` restores the pre-watermark look.
    backgroundColor: colors.page,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '86%',
  },
  sheetGrab: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingBottom: spacing.sm },
  sheetHeadText: { flex: 1, minWidth: 0, gap: 2 },
  sheetTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  sheetSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  sheetScroll: { flexGrow: 0 },
  sheetBody: { gap: spacing.md, paddingBottom: spacing.md },
  sheetFooter: { gap: spacing.sm, paddingTop: spacing.sm },
  sheetError: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.statusCritical,
  },

  field: { gap: 6 },
  fieldLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  toggleDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  toggleText: { flex: 1, minWidth: 0, gap: 2 },
  toggleLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  toggleHint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
});
