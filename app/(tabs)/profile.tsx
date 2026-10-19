import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { SignOutSheet } from '@/components/auth/SignOutSheet';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  formatDate,
  useDialog,
  useTheme,
  type IconName,
} from '@/components/opes-ui';
import {
  FactGrid,
  HealthIdPanelContent,
  IdentityCard,
  IdentityLine,
  OverviewTiles,
  PrivacyFooter,
  ProfileHeading,
  ProfilePanel,
  ProfileScreen as ProfileFrame,
  SignOutButton,
  TileGrid,
  TrustChips,
  useProfileStyles,
  type Fact,
  type LinkTile,
  type OverviewTile,
} from '@/components/profile';
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
  const { colors } = useTheme();
  const styles = useProfileStyles();
  const dialog = useDialog();
  const patient = useAuthStore((s) => s.patient);
  const authStatus = useAuthStore((s) => s.status);
  const profileState = useAuthStore((s) => s.profileState);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [retrying, setRetrying] = useState(false);
  const [showAllRecord, setShowAllRecord] = useState(false);
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

  // Sign out opens the shared confirmation sheet, which says what leaves the
  // phone and runs `logout()`; the root layout then leaves the signed-in area.
  const [signOutOpen, setSignOutOpen] = useState(false);
  const confirmSignOut = useCallback(() => setSignOutOpen(true), []);
  const signOutSheet = <SignOutSheet visible={signOutOpen} onClose={() => setSignOutOpen(false)} />;

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
        {signOutSheet}
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
    <ProfileFrame
      masthead={{
        left: { icon: 'gear', label: t('profile.settings'), onPress: () => router.push('/settings') },
        bell: { count: unreadCount, onPress: () => router.push('/notifications') },
        avatar: {
          photoUrl: patient.photo_url,
          photoFailed,
          onPhotoFail: () => setPhotoFailed(true),
          initials,
          label: t('profile.editProfileAction'),
          onPress: goEditProfile,
        },
      }}
      after={
        <>
          {dialog.element}
          {signOutSheet}
        </>
      }
    >
      {/* ── Page heading, with the motto block the render carries ────── */}
      <ProfileHeading title={t('profile.title')} subtitle={t('profile.subtitle')} />

      {/* ── 1. Identity card: portrait | details | Health ID panel ───── */}
      <IdentityCard
        photoUrl={patient.photo_url}
        initials={initials}
        onChangePhoto={goEditProfile}
        name={fullName}
        verified={isVerified}
        statusLabel={statusLabel}
        statusTone={isVerified ? 'normal' : 'warning'}
        quote={t('profile.brandQuote', {
          defaultValue: '“Better health. A brighter tomorrow.”',
        })}
        panel={{
          // The QR itself lives on the Health ID tab, which owns the permanent
          // payload and the 15-minute temporary token — this is the way in,
          // not a second place that encodes an identifier.
          label: t('profile.healthIdCard'),
          onPress: () => router.push('/(tabs)/health-id'),
          content: (
            <HealthIdPanelContent
              qrPayload={qrPayload}
              healthId={patient.health_id}
              failed={healthIdCard.isError}
              actionLabel={t('profile.tapToView', { defaultValue: 'Tap to view' })}
            />
          ),
        }}
      >
        {/* Age only: sex and blood group are rows of the grid below, and the
            same string twice on one screen is noise. */}
        {!!ageLabel && <IdentityLine icon="person" text={ageLabel} />}
        {/* Contact only. Date of birth and address belong to the grid. */}
        {!!patient.phone && <IdentityLine icon="phone" text={patient.phone} />}
        {!!patient.email && <IdentityLine icon="mail" text={patient.email} />}
      </IdentityCard>

      {/* ── 2. Trust strip ──────────────────────────────────────────── */}
      <TrustChips
        items={TRUST.map((item) => ({ ...item, label: t(`profile.trust.${item.key}`) }))}
      />

      {/* ── 3. Quick Overview ───────────────────────────────────────── */}
      <OverviewTiles
        title={t('profile.quickOverview', { defaultValue: 'Quick overview' })}
        action={{
          label: t('profile.viewFullRecord', { defaultValue: 'View full record' }),
          onPress: () => router.push('/(tabs)/records'),
        }}
        tiles={overview}
        ring={{
          percent: completeness.percent,
          label: t('profile.profileStrength'),
          hint:
            completeness.filled === completeness.total
              ? t('profile.profileStrengthComplete')
              : t('profile.profileStrengthHint', {
                  count: completeness.total - completeness.filled,
                  missing: completeness.total - completeness.filled,
                }),
          onPress: goEditProfile,
        }}
      />

      {/* ── 4. Personal information ─────────────────────────────────── */}
      <ProfilePanel
        icon="person"
        title={t('profile.personalInfo', { defaultValue: 'Personal information' })}
        subtitle={t('profile.personalInfoDesc', {
          defaultValue: 'Your basic details and emergency contact.',
        })}
        actionLabel={t('profile.edit', { defaultValue: 'Edit' })}
        actionIcon="edit"
        onAction={goEditProfile}
        seal
      >
        <FactGrid facts={facts} />
      </ProfilePanel>

      {/* ── 5. Health record ────────────────────────────────────────── */}
      <ProfilePanel
        icon="document-text"
        title={t('profile.healthRecord', { defaultValue: 'Health record' })}
        subtitle={t('profile.healthRecordDesc', {
          defaultValue: 'Access and manage your health information.',
        })}
        actionLabel={
          showAllRecord
            ? t('opesRecords.hub.showFewer', { defaultValue: 'Show fewer' })
            : t('common.viewAll', { defaultValue: 'View all' })
        }
        onAction={() => setShowAllRecord((v) => !v)}
      >
        <TileGrid tiles={recordTiles.filter((tile) => showAllRecord || !tile.extra)} />
      </ProfilePanel>

      {/* ── 6. Family & account ─────────────────────────────────────── */}
      <ProfilePanel
        icon="users"
        title={t('profile.familyAccount', { defaultValue: 'Family & account' })}
        subtitle={t('profile.familyAccountDesc', {
          defaultValue: 'Manage your family, payments and app settings.',
        })}
        actionLabel={
          showAllAccount
            ? t('opesRecords.hub.showFewer', { defaultValue: 'Show fewer' })
            : t('common.viewAll', { defaultValue: 'View all' })
        }
        onAction={() => setShowAllAccount((v) => !v)}
      >
        <TileGrid tiles={accountTiles.filter((tile) => showAllAccount || !tile.extra)} />
      </ProfilePanel>

      {/* ── 7. Privacy footer ───────────────────────────────────────── */}
      <PrivacyFooter title={t('profile.privacyTitle')} body={t('profile.privacyBody')} />

      {/* Sign out stays the last thing on the screen. */}
      <SignOutButton
        label={t('profile.signOut')}
        onPress={confirmSignOut}
        disabled={dialog.busy}
      />
    </ProfileFrame>
  );
}
