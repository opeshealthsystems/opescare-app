import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  PulseLogo,
  ScreenHeader,
  Wordmark,
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
import QRCode from 'react-native-qrcode-svg';
import { HEALTH_ID_ART } from '@/components/health-id/assets';
import { useAuthStore } from '../../lib/store/auth';
import { useFamilyMembers, useHealthIdCard, useMessageThreads } from '../../lib/api/queries';
// Registers `profile.profileStrengthHint_one/_other` (and the consent chrome)
// from lib/i18n/pending/ until those keys are folded into locales/{en,fr}.json.
import '../../lib/i18n/consentCopyStrings';

/**
 * Profile tab — the OPES CORE-008 layout (navy identity hero, quick-overview
 * tiles, overline section headers over flush list cards, privacy banner,
 * confirmed sign-out) on top of the app's existing data: the auth store's
 * `patient`, `useFamilyMembers()` for the dependents tile and the store's
 * `logout()`. Presentation only — every row and link the previous version had
 * is still here, re-skinned with the kit.
 */

type OverviewTile = {
  key: string;
  icon: IconName;
  tint: Tint;
  value: string;
  label: string;
  hint: string;
  onPress: () => void;
};

type LinkTile = {
  icon: IconName;
  tint: Tint;
  label: string;
  onPress: () => void;
  /** Unread count; absent or 0 draws no badge. */
  badge?: number;
  /** Beyond the four the reference draws — revealed by "View all". */
  extra?: boolean;
};

type Fact = {
  /** Spans both columns — for the one field whose value runs to two lines. */
  wide?: boolean;
  icon: IconName;
  tint: Tint;
  label: string;
  value: string;
  sub?: string;
  onPress?: () => void;
};

/** The four assurances the render prints under the identity card. */
const TRUST: { key: string; icon: IconName }[] = [
  { key: 'identity', icon: 'shield-check' },
  { key: 'encrypted', icon: 'lock' },
  { key: 'interoperable', icon: 'share' },
  { key: 'people', icon: 'users' },
];

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const patient = useAuthStore((s) => s.patient);
  const logout = useAuthStore((s) => s.logout);
  const authStatus = useAuthStore((s) => s.status);
  const profileState = useAuthStore((s) => s.profileState);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [retrying, setRetrying] = useState(false);
  const [showAllRecord, setShowAllRecord] = useState(false);
  // The identity card's own width, measured. Everything in that row is sized
  // from it rather than from a number that only holds at 375pt.
  const [cardWidth, setCardWidth] = useState(0);
  // A signed photo link that has expired renders nothing; this flips the card
  // back to initials instead of leaving a grey hole.
  const [photoFailed, setPhotoFailed] = useState(false);
  const [showAllAccount, setShowAllAccount] = useState(false);

  // Opening this tab is itself a reason to try again: if the boot-time fetch
  // failed (no signal, a deploy in progress), the person should not have to
  // find a Retry button — the screen asks for the profile the moment it is
  // looked at, and the store's own backoff keeps asking in the background.
  useFocusEffect(
    useCallback(() => {
      if (authStatus === 'authenticated' && !patient && profileState !== 'loading') {
        fetchMe().catch(() => {
          // The state machine already records the failure; the retry card shows it.
        });
      }
    }, [authStatus, patient, profileState, fetchMe]),
  );

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

  // A refreshed signed link deserves a fresh attempt.
  useEffect(() => {
    setPhotoFailed(false);
  }, [patient?.photo_url]);

  /**
   * Portrait and Health-ID columns as a share of the measured card, clamped.
   * Below ~56pt a face is a thumbnail and the initials stop being readable;
   * above ~96pt the portrait starts crowding the details column on a tablet.
   * `cardWidth || 311` keeps the first paint (before onLayout fires) at the
   * 375pt figure rather than collapsing to zero.
   */
  const columns = useMemo(() => {
    const inner = (cardWidth || 311) - spacing.md * 2;
    const clamp = (min: number, value: number, max: number) =>
      Math.round(Math.max(min, Math.min(max, value)));
    const portrait = clamp(56, inner * 0.21, 96);
    return {
      // Below ~300pt of card there is not enough width for three columns:
      // the details column falls under 110pt and the age line, phone and
      // email ellipsise together. The ID panel drops below instead.
      stacked: inner < 300,
      portrait,
      // 4:3 portrait crop, which is what a face wants.
      portraitHeight: Math.round(portrait * 1.32),
      panel: clamp(84, inner * 0.3, 124),
    };
  }, [cardWidth]);

  const showPhoto = !!patient?.photo_url && !photoFailed;

  /** Whole years, or null when no usable date of birth is recorded. */
  const ageLabel = useMemo(() => {
    if (!patient?.dob) return null;
    const born = new Date(patient.dob);
    if (Number.isNaN(born.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - born.getFullYear();
    const m = now.getMonth() - born.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < born.getDate())) years -= 1;
    if (years < 0 || years > 130) return null;
    return t('profile.ageYears', { count: years, defaultValue: '{{count}} years' });
  }, [patient?.dob, t]);

  /**
   * The permanent Health ID QR, from the same hook the Health ID tab uses —
   * one payload, so the two screens can never encode different codes for the
   * same person. Nothing is drawn until it arrives: a QR that scans to the
   * wrong thing is worse at a counter than no QR at all.
   */
  const healthIdCard = useHealthIdCard();
  const qrPayload = healthIdCard.data?.qr_payload ?? null;

  // The bell badge and the Messages tile read the same real figure.
  const threads = useMessageThreads();
  // `MessageThreadSummary` carries `unread: boolean`, not a message count, so
  // this is the number of THREADS with something unread. Anything else would
  // be a number the payload cannot support.
  const unreadCount = useMemo(
    () => (threads.data ?? []).filter((thread) => thread.unread).length,
    [threads.data],
  );

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

  // Pull the profile again by hand. `fetchMe` throws on failure; the catch is
  // what keeps a second failed attempt from unmounting the retry button.
  const retryProfile = useCallback(async () => {
    setRetrying(true);
    try {
      await fetchMe();
    } catch {
      // Still unreachable. The state below is unchanged and offers the retry
      // again — saying "it failed twice" adds nothing the screen is not
      // already showing.
    } finally {
      setRetrying(false);
    }
  }, [fetchMe]);

  if (!patient) {
    /**
     * NO PROFILE. Two different situations, and they must not look the same.
     *
     * `booting` is the ordinary one: the session is still resolving and the
     * profile is seconds away. A spinner is the honest answer.
     *
     * Authenticated WITHOUT a profile is not a loading state — it is where an
     * offline cold start lands when there is no cached demographic record
     * (see the `isNetworkError` branch of `bootstrap()` in lib/store/auth.ts:
     * the token is kept, the session is authenticated, and `fetchMe` is
     * retried on a 2s/5s/15s/30s backoff). After roughly a minute that backoff
     * gives up for good and NOTHING re-runs it from this screen. This branch
     * used to render the same spinner in that case, so the Profile tab became
     * a permanent spinner with no explanation, no retry and no forward action
     * — the tab bar was the only way out. It now says what happened and hands
     * back the two moves that exist: try again, or sign out and back in.
     */
    // A spinner while the session boots, while a fetch is in flight, and while
    // the store still has a retry scheduled; the retry card only once the last
    // attempt has actually failed with nothing further pending.
    const stillBooting = authStatus === 'booting' || retrying || profileState !== 'error';
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title={t('profile.title')} subtitle={t('profile.subtitle')} showBack={false} />
        {stillBooting ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.blue} />
            <Text style={styles.loadingText}>{t('profile.loading')}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Card variant="flush">
              <EmptyState
                icon="alert-circle"
                tint="amber"
                title={t('profile.unavailableTitle', {
                  defaultValue: 'Your profile has not loaded',
                })}
                message={t('profile.unavailableBody', {
                  defaultValue:
                    'We could not reach OpesCare to load your details. Everything else in the app still works — check your connection and try again.',
                })}
                actionLabel={t('opesCore.common.retry')}
                onAction={() => void retryProfile()}
                actionHint={t('profile.unavailableRetryHint', {
                  defaultValue: 'Fetches your profile again',
                })}
              />
            </Card>

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
          </ScrollView>
        )}
        {dialog.element}
      </SafeAreaView>
    );
  }


  /* ── Quick Overview ─────────────────────────────────────────────────────
     Four tiles across, three counts and a ring. Every figure is read from
     the record: `allergies_count` and `conditions_count` come down on
     /mobile/me, the dependent count is the family query, and the ring is
     `completeness`, which counts the eight fields that endpoint actually
     returns. Nothing here is a target or a score we invented. */
  const overview: OverviewTile[] = [
    {
      key: 'allergies',
      icon: 'alert-triangle',
      tint: 'amber',
      value: String(patient.allergies_count ?? 0),
      label: t('profile.allergies'),
      hint: t('profile.allergiesHint'),
      onPress: () => router.push('/(tabs)/records'),
    },
    {
      key: 'conditions',
      icon: 'activity',
      tint: 'blue',
      value: String(patient.conditions_count ?? 0),
      label: t('profile.conditions'),
      hint: t('profile.conditionsHint'),
      onPress: () => router.push('/(tabs)/records'),
    },
    {
      key: 'dependents',
      icon: 'users',
      tint: 'green',
      // A dash, not a 0, while the query is still in flight or has failed —
      // "0 dependents" is a claim, and we do not have it yet.
      value: familyQuery.isLoading && !familyQuery.data ? '—' : String(dependentCount),
      label: t('profile.dependents'),
      hint: familyQuery.isError ? t('profile.dependentsUnavailable') : t('profile.dependentsHint'),
      onPress: () => router.push('/family'),
    },
  ];

  /* ── The two link groups ────────────────────────────────────────────────
     The reference draws four tiles per group. This app has more links than
     that, and a link that is not on screen is a page reachable by URL only —
     which on a phone means not at all. So each group shows the reference's
     four and "View all" reveals the rest in place. Nothing is dropped. */
  const recordTiles: LinkTile[] = [
    { icon: 'qr', tint: 'blue', label: t('profile.healthIdCard'), onPress: () => router.push('/(tabs)/health-id') },
    { icon: 'document-text', tint: 'blue', label: t('profile.recordsTimeline'), onPress: () => router.push('/(tabs)/records') },
    { icon: 'folder', tint: 'purple', label: t('profile.documents'), onPress: () => router.push('/documents') },
    { icon: 'download', tint: 'green', label: t('profile.downloadRecords'), onPress: () => router.push('/export-records') },
    { icon: 'lock', tint: 'amber', label: t('profile.offlineAccess'), onPress: () => router.push('/offline-access'), extra: true },
    { icon: 'shield-check', tint: 'green', label: t('profile.privacyTitle'), onPress: () => router.push('/privacy'), extra: true },
  ];

  const accountTiles: LinkTile[] = [
    { icon: 'users', tint: 'purple', label: t('profile.family'), onPress: () => router.push('/family') },
    { icon: 'receipt', tint: 'green', label: t('profile.payments'), onPress: () => router.push('/payments') },
    { icon: 'chat', tint: 'blue', label: t('profile.messages'), onPress: () => router.push('/(tabs)/messages'), badge: unreadCount },
    { icon: 'settings', tint: 'blue', label: t('profile.settings'), onPress: () => router.push('/settings') },
    { icon: 'help-circle', tint: 'green', label: t('profile.helpSupport'), onPress: () => router.push('/help'), extra: true },
  ];

  /* The identity card's fact grid — two columns, as drawn. Every value is
     either recorded or says plainly that it is not. */
  const facts: Fact[] = [
    { icon: 'person', tint: 'blue', label: t('profile.gender'), value: genderLabel, onPress: goEditProfile },
    { icon: 'calendar', tint: 'blue', label: t('profile.dob'), value: patient.dob ? formatDate(patient.dob) : t('profile.notProvided') },
    { icon: 'droplet', tint: 'red', label: t('profile.bloodGroup'), value: patient.blood_group || t('profile.notProvided'), onPress: goEditProfile },
    { icon: 'location', tint: 'green', label: t('profile.location'), value: patient.address || t('profile.notProvided'), onPress: goEditProfile },
    // Full width: it is the only field with two lines of value, and as a half
    // cell it forced its whole row 95pt tall with a hole beside it.
    {
      wide: true,
      icon: 'phone',
      tint: 'red',
      label: t('profile.emergencyContact'),
      value: emergency?.name
        ? [emergency.name, emergency.relationship ? `(${emergency.relationship})` : null].filter(Boolean).join(' ')
        : t('profile.notProvided'),
      sub: emergency?.phone ?? undefined,
      onPress: goEditProfile,
    },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* The render's paper: a wave field under the masthead, at watermark
          strength. Behind everything, untappable, and invisible to a screen
          reader — it carries nothing a reader would otherwise miss. */}
      <Image
        source={HEALTH_ID_ART.guillocheMesh}
        style={styles.paperWave}
        resizeMode="cover"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        alt=""
      />

      {/* ── Brand bar ─────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('profile.settings')}
          style={styles.topBarSide}
        >
          <Icon name="settings" size={21} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.topBarBrand}>
          <PulseLogo size={34} />
          <Wordmark size="md" showTagline />
        </View>

        <View style={styles.topBarActions}>
          <TouchableOpacity
            onPress={() => router.push('/notifications')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('profile.notifications', { defaultValue: 'Notifications' })}
            style={styles.topBarBell}
          >
            <Icon name="bell" size={20} color={colors.textPrimary} />
            {unreadCount > 0 ? (
              <View style={styles.topBarBadge}>
                <Text style={styles.topBarBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={goEditProfile}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('profile.editProfileAction')}
            style={styles.topAvatarWrap}
          >
            {showPhoto ? (
              <Image
                source={{ uri: patient.photo_url as string }}
                style={styles.topAvatar}
                resizeMode="cover"
                onError={() => setPhotoFailed(true)}
                accessibilityIgnoresInvertColors
                alt=""
              />
            ) : (
              <View style={[styles.topAvatar, styles.topAvatarFallback]}>
                <Text style={styles.topAvatarText}>{initials}</Text>
              </View>
            )}
            {/* Signed in — the one thing a dot here can honestly mean. */}
            <View style={styles.topAvatarDot} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Page heading, with the motto block the render carries ────── */}
        <View style={styles.headingRow}>
          <View style={styles.headingText}>
            <Text style={styles.headingTitle}>{t('profile.title')}</Text>
            <Text style={styles.headingSub}>{t('profile.subtitle')}</Text>
          </View>
          {/* The render carries a pale Africa silhouette behind this rule. Left
              out on purpose: `africa.png` is an opaque square illustration for
              the credential face (Cameroon picked out in flag colours), and at
              watermark opacity it reads as a grey rectangle, not a continent.
              The only other candidate in the library is a four-sided polygon
              that does not read as Africa at all. A missing watermark is
              invisible; a wrong one looks like a bug. */}
          <View style={styles.motto}>
            <Text style={styles.mottoText}>{t('profile.motto', { defaultValue: 'A HEALTHIER PEOPLE\nA STRONGER AFRICA' })}</Text>
          </View>
        </View>

        {/* ── 1. Identity card: portrait | details | Health ID panel ───── */}
        <Card
          style={styles.identity}
          onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
        >
          <View style={styles.identityMain}>
            {/* left: portrait · middle: who you are · right: your Health ID */}
            <View>
              <View
                style={[
                  styles.portrait,
                  { width: columns.portrait, height: columns.portraitHeight },
                ]}
              >
                {showPhoto ? (
                  <Image
                    source={{ uri: patient.photo_url as string }}
                    style={styles.portraitImg}
                    resizeMode="cover"
                    onError={() => setPhotoFailed(true)}
                    accessibilityIgnoresInvertColors
                    alt=""
                  />
                ) : (
                  <View style={[styles.portraitImg, styles.portraitFallback]}>
                    <Text
                      style={[
                        styles.portraitInitials,
                        // The initials track the portrait so they neither
                        // rattle around in a large frame nor overflow a small one.
                        { fontSize: Math.round(columns.portrait * 0.36) },
                      ]}
                    >
                      {initials}
                    </Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={goEditProfile}
                accessibilityRole="button"
                accessibilityLabel={t('profile.changePhoto', { defaultValue: 'Change photo' })}
                style={styles.portraitCamera}
              >
                <Icon name="camera" size={14} color={colors.textOnBrand} />
              </TouchableOpacity>
            </View>

            <View style={styles.identityBody}>
              <View style={styles.identityNameRow}>
                <Text style={styles.identityName} numberOfLines={2}>{fullName || '—'}</Text>
                {isVerified ? <Icon name="check-circle" size={17} color={colors.link} /> : null}
              </View>

              <View style={[styles.verifiedPill, { backgroundColor: statusSkin.bg }]}>
                <Icon name="shield-check" size={13} color={statusSkin.fg} />
                <Text style={[styles.verifiedText, { color: statusSkin.fg }]} numberOfLines={1}>{statusLabel}</Text>
              </View>

              {/* Sex · age · blood group, on one line as drawn — each part
                  dropped rather than guessed when the record has no value. */}
              <IdentityLine icon="person" text={[genderLabel, ageLabel, patient.blood_group].filter(Boolean).join('   |   ')} />
              {/* Contact only. The date of birth and the address belong to the
                  grid below — printing them here as well was the same string
                  twice on one screen. */}
              {!!patient.phone && <IdentityLine icon="phone" text={patient.phone} />}
              {!!patient.email && <IdentityLine icon="mail" text={patient.email} />}

              {/* The render closes the details column on the brand line. It is
                  our own copy, not a claim about the patient. */}
              <Text style={styles.identityQuote} numberOfLines={2}>
                {t('profile.brandQuote', {
                  defaultValue: '\u201cBetter health. A brighter tomorrow.\u201d',
                })}
              </Text>
            </View>

            {columns.stacked ? null : <View style={styles.identityRule} />}

            {/* The Health ID column. The QR itself lives on the Health ID tab,
                which owns the permanent payload and the 15-minute temporary
                token — this is the way in, not a second place that encodes an
                identifier. */}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/health-id')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('profile.healthIdCard')}
              style={[
                styles.idPanel,
                columns.stacked ? styles.idPanelStacked : { width: columns.panel },
              ]}
            >
              <View style={styles.idPanelHead}>
                <PulseLogo size={18} />
                <Text style={styles.idPanelTitle} numberOfLines={2}>
                  {t('profile.healthIdBrand', { defaultValue: 'OPESCARE HEALTH ID' })}
                </Text>
              </View>
              <View style={styles.idPanelQr}>
                {qrPayload ? (
                  <QRCode
                    value={qrPayload}
                    size={62}
                    color={colors.textPrimary}
                    backgroundColor={colors.surface}
                  />
                ) : (
                  /* Not yet, or not at all — either way this is a placeholder
                     and must not be mistaken for something scannable. */
                  <Icon
                    name="qr"
                    size={40}
                    color={healthIdCard.isError ? colors.textMuted : colors.border}
                  />
                )}
              </View>
              <Text style={styles.idPanelCode} numberOfLines={2}>
                {patient.health_id ?? '\u2014'}
              </Text>
              <View style={styles.idPanelAction}>
                <Text style={styles.idPanelActionText}>
                  {t('profile.tapToView', { defaultValue: 'Tap to view' })}
                </Text>
                <Icon name="chevron-right" size={12} color={colors.link} />
              </View>
            </TouchableOpacity>
          </View>

        </Card>

        {/* ── 2. Trust strip ──────────────────────────────────────────── */}
        <Card style={styles.trust}>
          {TRUST.map((item, index) => (
            <React.Fragment key={item.key}>
              {index > 0 && <View style={styles.trustRule} />}
              <View style={styles.trustCell}>
                <Icon name={item.icon} size={19} color={colors.blue} />
                <Text style={styles.trustText} numberOfLines={2}>{t(`profile.trust.${item.key}`)}</Text>
              </View>
            </React.Fragment>
          ))}
        </Card>

        {/* ── 3. Quick Overview ───────────────────────────────────────── */}
        <View style={styles.block}>
          <View style={styles.blockHead}>
            <View style={styles.blockHeadLeft}>
              <Icon name="bar-chart" size={18} color={colors.blue} />
              <Text style={styles.blockTitle}>{t('profile.quickOverview', { defaultValue: 'Quick overview' })}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/records')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('profile.viewFullRecord', { defaultValue: 'View full record' })} style={styles.blockAction}>
              <Text style={styles.blockActionText}>{t('profile.viewFullRecord', { defaultValue: 'View full record' })}</Text>
              <Icon name="chevron-right" size={14} color={colors.link} />
            </TouchableOpacity>
          </View>

          <View style={styles.overviewRow}>
            {overview.map((tile) => (
              <OverviewCard key={tile.key} tile={tile} />
            ))}
            <ProfileRingCard
              percent={completeness.percent}
              label={t('profile.profileStrength')}
              hint={completeness.filled === completeness.total ? t('profile.profileStrengthComplete') : t('profile.profileStrengthHint', { count: completeness.total - completeness.filled, missing: completeness.total - completeness.filled })}
              onPress={goEditProfile}
            />
          </View>
        </View>

        {/* ── 4. Personal information ─────────────────────────────────── */}
        <Card style={styles.panel}>
          <PanelHeader
            icon="person"
            title={t('profile.personalInfo', { defaultValue: 'Personal information' })}
            subtitle={t('profile.personalInfoDesc', { defaultValue: 'Your basic details and emergency contact.' })}
            actionLabel={t('profile.edit', { defaultValue: 'Edit' })}
            actionIcon="edit"
            onAction={goEditProfile}
          />
          {/* Debossed into the corner like a paper seal — never a badge. This
              screen verifies nothing; the mark is stationery, not a claim. */}
          <Image
            source={HEALTH_ID_ART.seal}
            style={styles.panelSeal}
            resizeMode="contain"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            alt=""
          />
          <View style={styles.factGrid}>
            {facts.map((fact, index) => (
              <FactCell
                key={fact.label}
                fact={fact}
                // A rule only where a cell actually sits on the other side of
                // it: never against a full-width field, and never trailing
                // into the empty half of an odd last row.
                rule={!fact.wide && index % 2 === 0 && !!facts[index + 1] && !facts[index + 1]!.wide}
              />
            ))}
          </View>
        </Card>

        {/* ── 5. Health record ────────────────────────────────────────── */}
        <Card style={styles.panel}>
          <PanelHeader
            icon="document-text"
            title={t('profile.healthRecord', { defaultValue: 'Health record' })}
            subtitle={t('profile.healthRecordDesc', { defaultValue: 'Access and manage your health information.' })}
            actionLabel={showAllRecord ? t('opesRecords.hub.showFewer', { defaultValue: 'Show fewer' }) : t('common.viewAll', { defaultValue: 'View all' })}
            onAction={() => setShowAllRecord((v) => !v)}
          />
          <View style={styles.tileGrid}>
            {recordTiles.filter((tile) => showAllRecord || !tile.extra).map((tile) => (
              <LinkTileView key={tile.label} tile={tile} />
            ))}
          </View>
        </Card>

        {/* ── 6. Family & account ─────────────────────────────────────── */}
        <Card style={styles.panel}>
          <PanelHeader
            icon="users"
            title={t('profile.familyAccount', { defaultValue: 'Family & account' })}
            subtitle={t('profile.familyAccountDesc', { defaultValue: 'Manage your family, payments and app settings.' })}
            actionLabel={showAllAccount ? t('opesRecords.hub.showFewer', { defaultValue: 'Show fewer' }) : t('common.viewAll', { defaultValue: 'View all' })}
            onAction={() => setShowAllAccount((v) => !v)}
          />
          <View style={styles.tileGrid}>
            {accountTiles.filter((tile) => showAllAccount || !tile.extra).map((tile) => (
              <LinkTileView key={tile.label} tile={tile} />
            ))}
          </View>
        </Card>

        {/* ── 7. Privacy footer ───────────────────────────────────────── */}
        <View style={styles.privacy}>
          <View style={styles.privacyMark}>
            <Icon name="shield-check" size={22} color={colors.statusNormal} />
          </View>
          <View style={styles.privacyBody}>
            <Text style={styles.privacyTitle}>{t('profile.privacyTitle')}</Text>
            <Text style={styles.privacyText}>{t('profile.privacyBody')}</Text>
          </View>
          <View style={styles.privacyRule} />
          <Text style={styles.privacyMotto}>{t('profile.privacyMotto', { defaultValue: 'SECURE\nINTEROPERABLE\nPEOPLE-CENTERED' })}</Text>
        </View>

        {/* Sign out stays the last thing on the screen. */}
        <TouchableOpacity
          onPress={confirmSignOut}
          disabled={dialog.busy}
          style={styles.signOut}
          accessibilityRole="button"
          accessibilityLabel={t('profile.signOut')}
          accessibilityState={{ disabled: dialog.busy }}
        >
          <Icon name="logout" size={18} color={colors.statusCritical} />
          <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** One glyph-and-text line in the identity card. */
function IdentityLine({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!text) return null;
  return (
    <View style={styles.identityLine}>
      <Icon name={icon} size={14} color={colors.blue} />
      <Text style={styles.identityLineText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

/** A counted overview tile: tinted mark, chevron, figure, label, hint. */
function OverviewCard({ tile }: { tile: OverviewTile }) {
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = tintMap[tile.tint];
  return (
    <TouchableOpacity
      onPress={tile.onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${tile.value} ${tile.label}. ${tile.hint}`}
      style={styles.overviewCard}
    >
      <View style={styles.overviewTop}>
        <View style={[styles.overviewMark, { backgroundColor: skin.bg }]}>
          <Icon name={tile.icon} size={17} color={skin.fg} />
        </View>
        <Icon name="chevron-right" size={14} color={colors.textMuted} />
      </View>
      <Text style={styles.overviewValue}>{tile.value}</Text>
      <Text style={styles.overviewLabel} numberOfLines={2}>{tile.label}</Text>
      <Text style={styles.overviewHint} numberOfLines={2}>{tile.hint}</Text>
    </TouchableOpacity>
  );
}

/**
 * The completeness ring. Drawn from stroked View segments rather than SVG so
 * it needs no new dependency: a full ring in the track colour with a quarter
 * arc rotated per 25%, capped at four — honest at the granularity it can
 * actually draw, with the exact figure printed in the middle either way.
 */
function ProfileRingCard({ percent, label, hint, onPress }: { percent: number; label: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${percent}%. ${hint}`}
      style={styles.overviewCard}
    >
      <View style={styles.ringWrap}>
        <View style={styles.ringTrack} />
        <View
          style={[
            styles.ringFill,
            { borderTopColor: percent >= 25 ? colors.statusNormal : 'transparent',
              borderRightColor: percent >= 50 ? colors.statusNormal : 'transparent',
              borderBottomColor: percent >= 75 ? colors.statusNormal : 'transparent',
              borderLeftColor: percent >= 100 ? colors.statusNormal : 'transparent' },
          ]}
        />
        <Text style={styles.ringText}>{percent}%</Text>
      </View>
      <Text style={styles.overviewLabel} numberOfLines={2}>{label}</Text>
      <Text style={styles.overviewHint} numberOfLines={2}>{hint}</Text>
    </TouchableOpacity>
  );
}

/** Panel header: rounded brand mark, title, subtitle, trailing action. */
function PanelHeader({ icon, title, subtitle, actionLabel, actionIcon, onAction }: { icon: IconName; title: string; subtitle: string; actionLabel: string; actionIcon?: IconName; onAction: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.panelHead}>
      <View style={styles.panelMark}>
        <Icon name={icon} size={19} color={colors.textOnBrand} />
      </View>
      <View style={styles.panelHeadText}>
        <Text style={styles.panelTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.panelSub} numberOfLines={2}>{subtitle}</Text>
      </View>
      <TouchableOpacity onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={actionLabel} style={styles.panelAction}>
        {actionIcon ? <Icon name={actionIcon} size={14} color={colors.link} /> : null}
        <Text style={styles.panelActionText} numberOfLines={1}>{actionLabel}</Text>
        {actionIcon ? null : <Icon name="chevron-right" size={14} color={colors.link} />}
      </TouchableOpacity>
    </View>
  );
}

/** One cell of the two-column fact grid. */
function FactCell({ fact, rule }: { fact: Fact; rule: boolean }) {
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = tintMap[fact.tint];
  const body = (
    <>
      <View style={[styles.factMark, { backgroundColor: skin.bg }]}>
        <Icon name={fact.icon} size={16} color={skin.fg} />
      </View>
      <View style={styles.factBody}>
        <Text style={styles.factLabel} numberOfLines={1}>{fact.label}</Text>
        <Text style={styles.factValue} numberOfLines={2}>{fact.value}</Text>
        {fact.sub ? <Text style={styles.factSub} numberOfLines={1}>{fact.sub}</Text> : null}
      </View>
      {fact.onPress ? <Icon name="chevron-right" size={14} color={colors.textMuted} /> : null}
    </>
  );

  return (
    <View style={[styles.factCell, fact.wide && styles.factCellWide, rule && styles.factCellRule]}>
      {fact.onPress ? (
        <TouchableOpacity onPress={fact.onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${fact.label}: ${fact.value}`} style={styles.factInner}>
          {body}
        </TouchableOpacity>
      ) : (
        <View style={styles.factInner} accessible accessibilityLabel={`${fact.label}: ${fact.value}`}>{body}</View>
      )}
    </View>
  );
}

/** One tinted square tile in the Health record / Family groups. */
function LinkTileView({ tile }: { tile: LinkTile }) {
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = tintMap[tile.tint];
  return (
    <TouchableOpacity
      onPress={tile.onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={tile.badge ? `${tile.label}, ${tile.badge}` : tile.label}
      style={[styles.linkTile, { backgroundColor: skin.bg }]}
    >
      <View style={styles.linkTileTop}>
        <Icon name={tile.icon} size={22} color={skin.fg} />
        {tile.badge ? (
          <View style={styles.linkTileBadge}>
            <Text style={styles.linkTileBadgeText}>{tile.badge > 9 ? '9+' : tile.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.linkTileLabel} numberOfLines={2}>{tile.label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.page },
    paperWave: {
      pointerEvents: 'none',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 300,
      // The asset is already drawn at watermark strength, so this is close to
      // full — the restraint is in the artwork, not in a low alpha that would
      // just grey it.
      opacity: 0.75,
    },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
    loadingText: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: c.textSecondary },

    /* Brand bar */
    topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    topBarSide: { width: 30, alignItems: 'flex-start' },
    topBarBrand: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
    topBarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    topBarBell: { position: 'relative', padding: 2 },
    topBarBadge: {
      position: 'absolute', top: -3, right: -5, minWidth: 16, height: 16, borderRadius: 8,
      paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: c.badge,
    },
    topBarBadgeText: { fontFamily: typography.fontFamily.bold, fontSize: 10, lineHeight: 14, color: c.textOnBrand },
    topAvatarWrap: { position: 'relative' },
    topAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.primarySoft },
    topAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
    topAvatarText: { fontFamily: typography.fontFamily.bold, fontSize: 13, color: c.blue },
    topAvatarDot: {
      position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: 6,
      backgroundColor: c.statusNormal, borderWidth: 2, borderColor: c.page,
    },

    /* Heading + motto */
    headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    headingText: { flex: 1, minWidth: 0, gap: 3 },
    headingTitle: { fontFamily: typography.fontFamily.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.4, color: c.textPrimary },
    headingSub: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, lineHeight: typography.lineHeight.sm, color: c.textSecondary },
    motto: { borderLeftWidth: 2, borderLeftColor: c.blue, paddingLeft: spacing.sm, maxWidth: 122 },
    mottoText: { fontFamily: typography.fontFamily.bold, fontSize: 10, lineHeight: 15, letterSpacing: 0.9, color: c.blue },

    /* 1. Identity card */
    identity: { gap: spacing.md },
    identityMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' },
    // width/height come from the measured card — see `columns`.
    portrait: { borderRadius: radii.md, overflow: 'hidden', backgroundColor: c.primarySoft },
    portraitImg: { width: '100%', height: '100%' },
    portraitFallback: { alignItems: 'center', justifyContent: 'center' },
    portraitInitials: { fontFamily: typography.fontFamily.bold, color: c.blue },
    portraitCamera: {
      position: 'absolute', right: -7, bottom: -7, width: 28, height: 28, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center', backgroundColor: c.blue,
      borderWidth: 2, borderColor: c.surface,
    },
    identityBody: { flex: 1, minWidth: 0, gap: 5 },
    identityNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    identityName: { flexShrink: 1, fontFamily: typography.fontFamily.bold, fontSize: 16, lineHeight: 21, color: c.textPrimary },
    identityQuote: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontStyle: 'italic',
      fontSize: 11,
      lineHeight: 15,
      color: c.link,
    },
    // The render's vertical divider between "who you are" and "your ID".
    identityRule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: c.border },
    verifiedPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
    verifiedText: { fontFamily: typography.fontFamily.semiBold, fontSize: 12, lineHeight: 16 },
    identityLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    identityLineText: { flexShrink: 1, fontFamily: typography.fontFamily.regular, fontSize: 11, lineHeight: 17, color: c.textSecondary },

    /* Health ID panel */
    idPanel: { alignItems: 'center', gap: 4, paddingLeft: 6 },
    // The narrow-screen shape: a full-width band under the details, divided by
    // a rule instead of standing beside one.
    idPanelStacked: {
      width: '100%',
      paddingLeft: 0,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    idPanelHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    idPanelTitle: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: 9,
      lineHeight: 12,
      letterSpacing: 0.4,
      color: c.textPrimary,
    },
    idPanelQr: {
      width: 72, height: 72, borderRadius: radii.sm, borderWidth: 1, borderColor: c.border,
      backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
    },
    idPanelCode: {
      alignSelf: 'stretch',
      textAlign: 'center',
      fontFamily: typography.fontFamily.bold,
      fontSize: 9.5,
      lineHeight: 12,
      letterSpacing: 0.1,
      color: c.textPrimary,
    },
    idPanelAction: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    idPanelActionText: { fontFamily: typography.fontFamily.semiBold, fontSize: 10, color: c.link },

    /* 2. Trust strip */
    trust: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: spacing.sm },
    trustCell: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', gap: 5, paddingHorizontal: 2 },
    trustRule: { width: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: 2 },
    trustText: { fontFamily: typography.fontFamily.medium, fontSize: 10, lineHeight: 13, textAlign: 'center', color: c.textSecondary },

    /* 3. Quick overview */
    block: { gap: spacing.sm },
    blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    blockHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1, minWidth: 0 },
    blockTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.md, color: c.textPrimary },
    blockAction: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    blockActionText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: c.link },
    overviewRow: { flexDirection: 'row', gap: spacing.sm - 2 },
    overviewCard: {
      flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 3,
      padding: spacing.sm, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border, backgroundColor: c.surface,
    },
    overviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    overviewMark: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    overviewValue: { fontFamily: typography.fontFamily.bold, fontSize: 21, lineHeight: 26, color: c.textPrimary, marginTop: 2 },
    overviewLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: 10, lineHeight: 14, color: c.textPrimary },
    overviewHint: { fontFamily: typography.fontFamily.regular, fontSize: 10, lineHeight: 13, color: c.textMuted },

    /* Completeness ring */
    ringWrap: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 4 },
    ringTrack: { position: 'absolute', width: 58, height: 58, borderRadius: 29, borderWidth: 5, borderColor: c.divider },
    ringFill: { position: 'absolute', width: 58, height: 58, borderRadius: 29, borderWidth: 5, transform: [{ rotate: '45deg' }] },
    ringText: { fontFamily: typography.fontFamily.bold, fontSize: 14, color: c.textPrimary },

    /* 4-6. Panels */
    panel: { gap: spacing.md, overflow: 'hidden' },
    panelSeal: {
      pointerEvents: 'none',
      position: 'absolute',
      right: -22,
      bottom: -26,
      width: 132,
      height: 132,
      opacity: 0.07,
    },
    panelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    panelMark: { width: 38, height: 38, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: c.blue },
    panelHeadText: { flex: 1, minWidth: 0, gap: 1 },
    panelTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.md, color: c.textPrimary },
    panelSub: { fontFamily: typography.fontFamily.regular, fontSize: 11, lineHeight: 15, color: c.textSecondary },
    panelAction: {
      flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6,
      borderRadius: radii.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.primarySoft,
    },
    panelActionText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: c.link },

    /* Fact grid */
    factGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    factCell: { width: '50%', paddingVertical: spacing.sm },
    factCellWide: {
      width: '100%',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.divider,
      paddingTop: spacing.sm + 2,
    },
    factCellRule: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: c.divider, paddingRight: spacing.sm },
    factInner: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingLeft: 2 },
    factMark: { width: 30, height: 30, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
    factBody: { flex: 1, minWidth: 0, gap: 1 },
    factLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: 11, lineHeight: 14, color: c.textPrimary },
    factValue: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, lineHeight: 17, color: c.textSecondary },
    factSub: { fontFamily: typography.fontFamily.regular, fontSize: 11, lineHeight: 15, color: c.textMuted },

    /* Link tiles */
    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    linkTile: {
      flexGrow: 1, flexBasis: '22%', minWidth: 76, minHeight: 82, borderRadius: radii.md,
      padding: spacing.sm, alignItems: 'center', justifyContent: 'center', gap: 7,
    },
    linkTileTop: { position: 'relative' },
    linkTileBadge: {
      position: 'absolute', top: -6, right: -10, minWidth: 16, height: 16, borderRadius: 8,
      paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: c.badge,
    },
    linkTileBadgeText: { fontFamily: typography.fontFamily.bold, fontSize: 10, lineHeight: 14, color: c.textOnBrand },
    linkTileLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: 11, lineHeight: 14, textAlign: 'center', color: c.textPrimary },

    /* 7. Privacy footer */
    privacy: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md,
      borderRadius: radii.md, backgroundColor: c.statusNormalBg,
    },
    privacyMark: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    privacyBody: { flex: 1, minWidth: 120, gap: 2 },
    privacyTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.sm, color: c.statusNormal },
    privacyText: { fontFamily: typography.fontFamily.regular, fontSize: 11, lineHeight: 15, color: c.textSecondary },
    privacyRule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: c.border },
    privacyMotto: { fontFamily: typography.fontFamily.bold, fontSize: 9, lineHeight: 13, letterSpacing: 0.7, color: c.blue },

    /* Sign out */
    signOut: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      paddingVertical: spacing.md, borderRadius: radii.md,
      borderWidth: 1, borderColor: c.statusCritical, backgroundColor: c.surface,
    },
    signOutText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: c.statusCritical },
  });
