/**
 * Doctor — the clinician's own account (`/clinician/profile`).
 *
 * Port of design reference `src/screens/doctor/DoctorProfileScreen.tsx` (archived prototype, see docs/DESIGN_REFERENCE.md) onto expo-router,
 * the OPES UI kit and this app's doctor foundation.
 *
 * Four things live here, in this order:
 *
 *   • WHO IS SIGNED IN — name, role, e-mail and facility from
 *     `GET /mobile/doctor/me` (`useDoctorMe`).
 *   • THE PROFESSIONAL PROFILE — what colleagues and patients see
 *     (`useDoctorProfile`), EDITABLE in place through `useUpdateDoctorProfile`.
 *     Exactly the eight keys `ProviderProfileEdit` accepts are editable. The
 *     consultation fee, its currency and the LICENCE STATUS are shown and never
 *     editable here: credentialing asserts them, a clinician does not
 *     self-declare them.
 *   • APPEARANCE — the kit's palette switch, mirroring the patient Settings
 *     screen. Device-local, never written to the API. `togglePalette()` is the
 *     whole act: the root layout persists it through `ThemeProvider`'s
 *     `onPaletteChange` under `opescare.palette`, so this screen must NOT
 *     write the key itself or the two would fight.
 *   • SIGN OUT — the auth store's `logout()`, which clears the stored token.
 *
 * Honesty rules carried from the rest of the app: a save whose OUTCOME IS
 * UNKNOWN (a timeout) is never painted as success — the Dialog says so and
 * points at where to check; and the profile shown after a save is the one the
 * server recorded, never the unsent draft.
 *
 * NO PHOTO CONTROL. `useUploadDoctorPhoto` exists in the data layer, but this
 * app bundles no image picker (`expo-image-picker` is not a dependency), and
 * the brief is explicit: omit the control rather than add a dependency. An
 * existing `photo_url` IS rendered — the hero shows the real photo when the
 * server has one and initials when it does not.
 *
 * Backend gap: the finder does not serve `/mobile/doctor/*` yet, so `me` and
 * `profile` both 404. Everything that does not need the API — Appearance and
 * Sign out — still works, and the parts that do say honestly that they are not
 * served rather than rendering a blank identity.
 *
 * i18n: `opesDoctor.profile.*`. Every string carries a `defaultValue`.
 * Locale files are not edited here.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SignOutSheet } from '@/components/auth/SignOutSheet';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  StaleNotice,
  StatusBadge,
  initialsFrom,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import {
  CareButton,
  LoadingBlock,
  describeFailure,
  fmtMoney,
  type Translate,
} from '@/components/care/shared';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  useDoctorMe,
  useDoctorProfile,
  useUpdateDoctorProfile,
  type ProviderLicenseStatus,
  type ProviderProfile,
  type ProviderProfileEdit,
  isDoctorFeatureUnserved,
} from '@/lib/api/doctorQueries';
// ── Facility switching ────────────────────────────────────────────────────
import {
  facilitySwitchErrorCode,
  facilitySwitchErrorMessage,
  isFacilityNotAssigned,
  isFacilitySuspended,
  isFacilitySwitchUnavailable,
  useProviderFacilities,
  useSwitchProviderFacility,
  type ProviderFacility,
} from '@/lib/api/facilitySwitchQueries';
import { useAuthStore } from '@/lib/store/auth';
import {
  CredentialPanelContent,
  IdentityCard,
  IdentityLine,
  OverviewTiles,
  ProfileHeading,
  ProfileScreen as ProfileFrame,
  ProfileSection,
  TrustChips,
} from '@/components/profile';

/** Failure copy for a write, saying plainly when the outcome is unknown. */
function writeFailureMessage(t: Translate, e: unknown, checkHint: string): string {
  const f = describeFailure(e);
  const outcomeUnknown = f.kind === 'timeout' || f.kind === 'server' || f.kind === 'unknown';
  return outcomeUnknown
    ? t('opesCore.errors.unknownOutcome', { message: f.message, checkHint })
    : f.message;
}

/**
 * Two initials for the identity mark. Honorifics are not initials.
 *
 * The rule is the kit's now. The copy that used to live here matched the bare
 * "Dr" and left the dot standing, so the mark above a clinician's own name
 * read ".A" for "Dr. Amara Diallo".
 */
function initials(name: string): string {
  return initialsFrom(name);
}

/**
 * `license_status` → a badge tone. An UNKNOWN status is shown neutrally and
 * never hidden: a licence this client cannot classify is still a fact on the
 * record, and silently dropping it would read as "no licence recorded".
 */
function licenseTone(status: ProviderLicenseStatus | null): StatusTone {
  switch (status) {
    case 'active':
      return 'normal';
    case 'pending':
      return 'warning';
    case 'expired':
    case 'suspended':
      return 'critical';
    default:
      return 'neutral';
  }
}

/** A comma-separated free-text field ↔ a trimmed, non-empty string array. */
function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The edit form, as strings — exactly the keys `ProviderProfileEdit` accepts. */
type EditForm = {
  title: string;
  specialty: string;
  subspecialty: string;
  bio: string;
  years_experience: string;
  languages: string;
  qualifications: string;
  room: string;
};

function formFrom(p: ProviderProfile | null): EditForm {
  return {
    title: p?.title ?? '',
    specialty: p?.specialty ?? '',
    subspecialty: p?.subspecialty ?? '',
    bio: p?.bio ?? '',
    years_experience: p?.years_experience != null ? String(p.years_experience) : '',
    languages: (p?.languages ?? []).join(', '),
    qualifications: (p?.qualifications ?? []).join(', '),
    room: p?.room ?? '',
  };
}

function editFromForm(f: EditForm): ProviderProfileEdit {
  const years = f.years_experience.trim();
  const parsed = years === '' ? null : Number.parseInt(years, 10);
  return {
    title: f.title.trim() || null,
    specialty: f.specialty.trim() || null,
    subspecialty: f.subspecialty.trim() || null,
    bio: f.bio.trim() || null,
    // A years box someone typed "abc" into is NOT zero years of experience.
    years_experience: parsed != null && Number.isFinite(parsed) ? parsed : null,
    languages: splitList(f.languages),
    qualifications: splitList(f.qualifications),
    room: f.room.trim() || null,
  };
}

export default function DoctorProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, palette, togglePalette } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  /** `opesDoctor.<key>` with a readable default until the catalogue lands. */
  const tx = useCallback(
    (key: string, defaultValue: string, p?: Record<string, unknown>) =>
      String(t(`opesDoctor.${key}`, { defaultValue, ...p })),
    [t]
  );
  const tr = useCallback<Translate>(
    (key, p) => String(t(key, p as Record<string, unknown>)),
    [t]
  );

  /**
   * `users.role` → a word. A role the catalogue does not name is "Staff",
   * never the raw column value dumped on screen.
   */
  const roleLabel = useCallback(
    (role: string | null | undefined): string => {
      if (!role) return tx('profile.roleFallback', 'Staff');
      const hit = String(t(`opesDoctor.profile.role.${role}`, { defaultValue: '' }));
      return hit || tx('profile.roleFallback', 'Staff');
    },
    [t, tx]
  );

  const licenseLabel = useCallback(
    (status: ProviderLicenseStatus | null): string => {
      if (!status) return tx('profile.licenseFallback', 'On record');
      const hit = String(t(`opesDoctor.profile.license.${status}`, { defaultValue: '' }));
      return hit || tx('profile.licenseFallback', 'On record');
    },
    [t, tx]
  );

  /** A known code is named; an unknown one is shown as the server sent it. */
  const languageLabel = useCallback(
    (code: string): string => {
      const hit = String(
        t(`opesDoctor.profile.langName.${code.toLowerCase()}`, { defaultValue: '' })
      );
      return hit || code;
    },
    [t]
  );

  const me = useDoctorMe();
  const profileQuery = useDoctorProfile();
  const update = useUpdateDoctorProfile();

  // The signed-in clinician as the auth store knows them — the one thing on
  // this screen that always names the facility the TOKEN is scoped to, which
  // is what actually decides what the rest of the app may read.
  const provider = useAuthStore((s) => s.provider);
  const facilitiesQuery = useProviderFacilities(Boolean(provider));
  const switchFacility = useSwitchProviderFacility();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(() => formFrom(null));
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const profile = profileQuery.data ?? null;

  // Coming back to this tab should reflect a role or a profile changed on a
  // workstation — but an OPEN EDITOR is never yanked out from under the
  // clinician by a background refetch. The first focus is the mount fetch.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void me.refetch();
      if (!editing) void profileQuery.refetch();
      // The two `refetch`s are stable for the life of their query observers.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing])
  );

  // ── Edit ────────────────────────────────────────────────────────────────

  const startEdit = useCallback(() => {
    setForm(formFrom(profileQuery.data ?? null));
    setEditing(true);
  }, [profileQuery.data]);

  const setField = useCallback(
    (key: keyof EditForm) => (value: string) => setForm((f) => ({ ...f, [key]: value })),
    []
  );

  const save = useCallback(async () => {
    try {
      // The mutation writes the SERVER's answer into the cache, so what the
      // screen shows next is the stored truth, not the draft just typed.
      await update.mutateAsync(editFromForm(form));
      setEditing(false);
    } catch (e) {
      dialog.alert(
        tx('profile.saveFailedTitle', 'Profile not saved'),
        writeFailureMessage(
          tr,
          e,
          tx(
            'profile.saveCheckHint',
            'Open your profile again to see whether your changes were saved.'
          )
        ),
        'critical'
      );
      // Stay in edit mode: nothing typed is lost and one more tap retries.
    }
  }, [form, update, dialog, tx, tr]);

  // ── Facility ────────────────────────────────────────────────────────────

  /**
   * Move the session to another facility.
   *
   * Confirmed first, and the confirmation says what actually happens rather
   * than "are you sure?": the current session ENDS and a new one opens at the
   * other facility, because that is literally what the server does — it
   * revokes this token and issues another. A clinician deserves to know that
   * before they tap it in a corridor.
   */
  const runSwitch = useCallback(
    async (facility: ProviderFacility) => {
      setSwitchingTo(facility.id);
      try {
        await switchFacility.mutateAsync(facility.id);
        // The mutation cleared every cached query — everything on screen
        // belonged to the facility just left. Pull this screen's own data back
        // under the new session.
        await Promise.all([me.refetch(), profileQuery.refetch(), facilitiesQuery.refetch()]);
      } catch (e) {
        // A refusal here is not noise: a posting can be withdrawn between the
        // list being fetched and this tap, and a suspended facility is a real
        // answer. Say which, then refresh the list so the screen stops
        // offering a door that is closed.
        //
        // `error_code` is the fallback for a refusal this client does not
        // recognise by status: SetLocale runs on the `web` middleware group
        // only, so an /api/* message comes back in the server's default
        // language whatever the phone asked for — the code is what lets it be
        // said in the clinician's.
        const code = facilitySwitchErrorCode(e);
        const namedByCode = code
          ? String(t(`opesDoctor.serverErrors.${code}`, { defaultValue: '' }))
          : '';

        const message = isFacilityNotAssigned(e)
          ? tx(
              'facility.refusedNotAssigned',
              'You no longer have an active posting at {{name}}. Your session has not changed.',
              { name: facility.name }
            )
          : isFacilitySuspended(e)
            ? tx(
                'facility.refusedSuspended',
                '{{name}} is suspended and cannot be used. Your session has not changed.',
                { name: facility.name }
              )
            : namedByCode ||
              facilitySwitchErrorMessage(
                e,
                tx(
                  'facility.refusedUnknown',
                  'Your facility could not be changed. Check your connection and open this screen again to see which facility you are acting as.'
                )
              );

        dialog.alert(tx('facility.refusedTitle', 'Facility not changed'), message, 'critical');
        void facilitiesQuery.refetch();
      } finally {
        setSwitchingTo(null);
      }
    },
    [switchFacility, me, profileQuery, facilitiesQuery, dialog, tx, t]
  );

  const confirmSwitch = useCallback(
    (facility: ProviderFacility) => {
      if (facility.is_current || facility.status === 'suspended') return;

      dialog.confirm({
        title: tx('facility.confirmTitle', 'Act as {{name}}?', { name: facility.name }),
        message: tx(
          'facility.confirmMessage',
          'This ends your current session and starts a new one at {{name}}. Everything on this device — patients, diary, results — will reload for that facility.',
          { name: facility.name }
        ),
        confirmLabel: tx('facility.confirmCta', 'Switch facility'),
        cancelLabel: tx('facility.confirmCancel', 'Stay here'),
        onConfirm: () => runSwitch(facility),
      });
    },
    [dialog, tx, runSwitch]
  );

  // ── Sign out ────────────────────────────────────────────────────────────

  // The shared sign-out sheet says what leaves the phone, then runs logout()
  // and reports a failure itself.
  const [signOutOpen, setSignOutOpen] = useState(false);
  const confirmSignOut = useCallback(() => setSignOutOpen(true), []);

  // ── Header ──────────────────────────────────────────────────────────────

  const displayName = profile?.display_name || me.data?.name || '—';
  const heroSubtitle = profile?.title || roleLabel(me.data?.role);

  // ── Stale notices — a failed refresh over data on screen is never fresh ──

  const meStale =
    me.isError && me.data !== undefined ? (
      <StaleNotice
        message={describeFailure(me.error).message}
        loadedAt={me.dataUpdatedAt ? new Date(me.dataUpdatedAt) : null}
        onRetry={() => void me.refetch()}
        retrying={me.isFetching}
      />
    ) : null;

  const profileStale =
    profileQuery.isError && profileQuery.data !== undefined ? (
      <StaleNotice
        message={describeFailure(profileQuery.error).message}
        loadedAt={profileQuery.dataUpdatedAt ? new Date(profileQuery.dataUpdatedAt) : null}
        onRetry={() => void profileQuery.refetch()}
        retrying={profileQuery.isFetching}
      />
    ) : null;

  // ── Identity ────────────────────────────────────────────────────────────

  let identity: React.ReactNode;
  if (me.isPending) {
    identity = <LoadingBlock label={tx('profile.loading', 'Loading your account…')} />;
  } else if (me.isError && me.data === undefined) {
    const notServed = isDoctorFeatureUnserved(me.error);
    identity = (
      <Card variant="flush">
        <EmptyState
          icon={notServed ? 'id-card' : 'alert-circle'}
          tint={notServed ? 'blue' : 'red'}
          title={
            notServed
              ? tx('shared.notServedTitle', 'Not available on this server yet')
              : tr('opesCore.errors.unknownTitle')
          }
          message={
            notServed
              ? tx(
                  'shared.notServedProfile',
                  'Your clinician account and professional profile will appear here once the clinician service is enabled for this app.'
                )
              : describeFailure(me.error).message
          }
          actionLabel={tr('opesCore.common.retry')}
          onAction={() => void me.refetch()}
        />
      </Card>
    );
  } else {
    const licenceStatus = profile?.license_status ?? null;
    identity = (
      <IdentityCard
        photoUrl={profile?.photo_url}
        initials={initials(displayName)}
        name={displayName}
        verified={licenceStatus === 'active'}
        statusLabel={
          me.data?.is_active === false
            ? tx('profile.statusInactive', 'Inactive')
            : tx('profile.statusActive', 'Active')
        }
        statusTone={me.data?.is_active === false ? 'critical' : 'normal'}
        panel={{
          // No Health ID for a clinician: the licence credentialing asserts
          // sits in the slot instead — read-only, exactly as the record says.
          label: `${tx('profile.rowLicense', 'Licence')}: ${
            profile ? licenseLabel(licenceStatus) : tr('profiles.clinician.licenceNotOnFile')
          }`,
          content: (
            <CredentialPanelContent
              title={tr('profiles.clinician.brand')}
              icon="shield-check"
              tone={profile ? licenseTone(licenceStatus) : 'neutral'}
              status={
                profile ? licenseLabel(licenceStatus) : tr('profiles.clinician.licenceNotOnFile')
              }
              detail={tr('profiles.clinician.licenceTitle')}
            />
          ),
        }}
      >
        <IdentityLine icon="stethoscope" text={heroSubtitle} />
        {!!me.data?.facility_name && <IdentityLine icon="building" text={me.data.facility_name} />}
        {!!me.data?.email && <IdentityLine icon="mail" text={me.data.email} />}
      </IdentityCard>
    );
  }

  // ── Professional profile ────────────────────────────────────────────────

  const dash = tx('profile.notSet', 'Not set');

  let professional: React.ReactNode;
  if (editing) {
    professional = (
      <Card>
        <Text style={styles.editHint}>
          {tx(
            'profile.editHint',
            'Update the details colleagues and patients see. The consultation fee and licence are set by the hospital.'
          )}
        </Text>

        <Field
          styles={styles}
          label={tx('profile.fieldTitle', 'Title')}
          value={form.title}
          onChangeText={setField('title')}
          placeholder={tx('profile.fieldTitlePlaceholder', 'e.g. Consultant')}
        />
        <Field
          styles={styles}
          label={tx('profile.fieldSpecialty', 'Specialty')}
          value={form.specialty}
          onChangeText={setField('specialty')}
          placeholder={tx('profile.fieldSpecialtyPlaceholder', 'e.g. Cardiology')}
        />
        <Field
          styles={styles}
          label={tx('profile.fieldSubspecialty', 'Subspecialty')}
          value={form.subspecialty}
          onChangeText={setField('subspecialty')}
          placeholder={tx('profile.fieldSubspecialtyPlaceholder', 'e.g. Electrophysiology')}
        />
        <Field
          styles={styles}
          label={tx('profile.fieldExperience', 'Years of experience')}
          value={form.years_experience}
          onChangeText={setField('years_experience')}
          placeholder={tx('profile.fieldExperiencePlaceholder', 'e.g. 11')}
          keyboardType="number-pad"
        />
        <Field
          styles={styles}
          label={tx('profile.fieldRoom', 'Consulting room')}
          value={form.room}
          onChangeText={setField('room')}
          placeholder={tx('profile.fieldRoomPlaceholder', 'e.g. 4')}
        />
        <Field
          styles={styles}
          label={tx('profile.fieldLanguages', 'Languages')}
          value={form.languages}
          onChangeText={setField('languages')}
          hint={tx('profile.fieldLanguagesHint', 'Separate each language with a comma.')}
        />
        <Field
          styles={styles}
          label={tx('profile.fieldQualifications', 'Qualifications')}
          value={form.qualifications}
          onChangeText={setField('qualifications')}
          hint={tx('profile.fieldQualificationsHint', 'Separate each qualification with a comma.')}
        />
        <Field
          styles={styles}
          label={tx('profile.fieldBio', 'About you')}
          value={form.bio}
          onChangeText={setField('bio')}
          placeholder={tx('profile.fieldBioPlaceholder', 'A short professional biography.')}
          multiline
        />

        <GradientButton
          label={tx('profile.save', 'Save changes')}
          icon="none"
          loading={update.isPending}
          disabled={update.isPending}
          onPress={() => void save()}
        />
        <CareButton
          label={tx('profile.cancel', 'Cancel')}
          variant="secondary"
          disabled={update.isPending}
          onPress={() => setEditing(false)}
          style={styles.cancelButton}
        />
      </Card>
    );
  } else if (profileQuery.isPending) {
    professional = <LoadingBlock label={tx('profile.profileLoading', 'Loading your profile…')} />;
  } else if (profileQuery.isError && profileQuery.data === undefined) {
    const notServed = isDoctorFeatureUnserved(profileQuery.error);
    professional = (
      <Card variant="flush">
        <EmptyState
          icon={notServed ? 'stethoscope' : 'alert-circle'}
          tint={notServed ? 'blue' : 'red'}
          title={
            notServed
              ? tx('shared.notServedTitle', 'Not available on this server yet')
              : tr('opesCore.errors.unknownTitle')
          }
          message={
            notServed
              ? tx(
                  'shared.notServedProfileDetail',
                  'Your title, specialty, languages and qualifications will appear here once the clinician service is enabled for this app.'
                )
              : describeFailure(profileQuery.error).message
          }
          actionLabel={tr('opesCore.common.retry')}
          onAction={() => void profileQuery.refetch()}
        />
      </Card>
    );
  } else if (profile === null) {
    // `null` is a real answer — no profile created yet — and is NOT a failure.
    professional = (
      <Card>
        <Text style={styles.emptyTitle}>
          {tx('profile.noProfileTitle', 'No professional profile yet')}
        </Text>
        <Text style={styles.hint}>
          {tx(
            'profile.noProfileBody',
            'Your professional details have not been set up yet. Add your title, specialty and more so colleagues and patients can see who you are.'
          )}
        </Text>
        <CareButton
          label={tx('profile.addDetails', 'Add my details')}
          icon="edit"
          onPress={startEdit}
          style={styles.addButton}
        />
      </Card>
    );
  } else {
    const years =
      profile.years_experience != null
        ? tx('profile.experienceYears', '{{count}} years', { count: profile.years_experience })
        : dash;
    const languages =
      profile.languages.length > 0 ? profile.languages.map(languageLabel).join(', ') : dash;
    const qualifications =
      profile.qualifications.length > 0 ? profile.qualifications.join(', ') : dash;
    const fee =
      profile.consultation_fee != null && profile.currency
        ? fmtMoney(profile.consultation_fee, profile.currency)
        : null;

    professional = (
      <>
        {/* The licence is a STATEMENT, not a row someone might tap to change:
            credentialing asserts it, so it gets its own card and no chevron. */}
        <Card style={styles.licenseCard}>
          <View style={styles.licenseRow}>
            <View style={styles.licenseLabelWrap}>
              <Icon name="shield-check" size={18} color={colors.textSecondary} />
              <Text style={styles.licenseLabel}>{tx('profile.rowLicense', 'Licence')}</Text>
            </View>
            <StatusBadge
              status={profile.license_status ?? 'unknown'}
              tone={licenseTone(profile.license_status)}
              label={licenseLabel(profile.license_status)}
            />
          </View>
        </Card>

        <Card variant="flush">
          <ListRow
            icon="stethoscope"
            tint="blue"
            title={tx('profile.rowSpecialty', 'Specialty')}
            subtitle={profile.specialty || dash}
            chevron={false}
            divider
          />
          {!!profile.subspecialty && (
            <ListRow
              icon="stethoscope"
              tint="blue"
              title={tx('profile.rowSubspecialty', 'Subspecialty')}
              subtitle={profile.subspecialty}
              chevron={false}
              divider
            />
          )}
          <ListRow
            icon="star"
            tint="amber"
            title={tx('profile.rowExperience', 'Experience')}
            subtitle={years}
            chevron={false}
            divider
          />
          <ListRow
            icon="globe"
            tint="green"
            title={tx('profile.rowLanguages', 'Languages')}
            subtitle={languages}
            chevron={false}
            divider
          />
          <ListRow
            icon="book"
            tint="purple"
            title={tx('profile.rowQualifications', 'Qualifications')}
            subtitle={qualifications}
            chevron={false}
            divider
          />
          <ListRow
            icon="location"
            tint="blue"
            title={tx('profile.rowRoom', 'Consulting room')}
            subtitle={profile.room || dash}
            chevron={false}
            divider={fee !== null}
          />
          {fee !== null && (
            <ListRow
              icon="credit-card"
              tint="blue"
              title={tx('profile.rowFee', 'Consultation fee')}
              subtitle={fee}
              value={tx('profile.feeReadOnly', 'Set by the hospital — not editable here.')}
              chevron={false}
            />
          )}
        </Card>

        <Card style={styles.aboutCard}>
          <Text style={styles.aboutLabel}>{tx('profile.aboutTitle', 'About')}</Text>
          <Text style={[styles.aboutBody, !profile.bio && styles.aboutEmpty]}>
            {profile.bio || tx('profile.bioEmpty', 'No biography added yet.')}
          </Text>
        </Card>
      </>
    );
  }

  // ── Facility section ────────────────────────────────────────────────────
  //
  // Rendered from the clinician's REAL postings, so there is never a facility
  // offered here that the server would then refuse. Three shapes:
  //
  //   • server does not serve the endpoint  → nothing at all (no dead control);
  //   • exactly one posting                 → the facility, named, not tappable
  //                                           (a switch with one destination is
  //                                           not a choice);
  //   • more than one                       → every posting, the current one
  //                                           badged, the rest tappable.
  //
  // A suspended facility is SHOWN and refused rather than hidden: a clinician
  // who cannot find their second hospital in this list has no way to tell "not
  // yours" from "temporarily closed".

  const facilityRows = facilitiesQuery.data?.facilities ?? [];
  const facilitySwitchUnavailable =
    facilitiesQuery.isError &&
    facilitiesQuery.data === undefined &&
    isFacilitySwitchUnavailable(facilitiesQuery.error);

  let facilitySection: React.ReactNode = null;
  if (provider && !facilitySwitchUnavailable) {
    if (facilitiesQuery.isPending) {
      facilitySection = (
        <Card variant="flush">
          <LoadingBlock label={tx('facility.loading', 'Loading your facilities…')} />
        </Card>
      );
    } else if (facilityRows.length > 0) {
      facilitySection = (
        <Card variant="flush">
          {facilityRows.map((facility, index) => {
            const suspended = facility.status === 'suspended';
            // Nothing is tappable while a switch is in flight: the token is
            // being replaced, and a second switch started on top of the first
            // would race two sessions against one token slot.
            const tappable =
              facilityRows.length > 1 &&
              !facility.is_current &&
              !suspended &&
              switchingTo === null;

            return (
              <ListRow
                key={facility.id}
                icon="building"
                tint={facility.is_current ? 'blue' : suspended ? 'red' : 'green'}
                title={facility.name}
                meta={[
                  facility.role_label || facility.role || undefined,
                  facility.type || undefined,
                ]}
                chevron={tappable}
                onPress={tappable ? () => confirmSwitch(facility) : undefined}
                divider={index < facilityRows.length - 1}
                trailing={
                  facility.is_current ? (
                    <StatusBadge
                      status="active"
                      tone="normal"
                      label={tx('facility.current', 'Acting as')}
                      size="sm"
                    />
                  ) : suspended ? (
                    <StatusBadge
                      status="suspended"
                      tone="critical"
                      label={tx('facility.suspended', 'Suspended')}
                      size="sm"
                    />
                  ) : switchingTo === facility.id ? (
                    <StatusBadge
                      status="switching"
                      tone="neutral"
                      label={tx('facility.switching', 'Switching…')}
                      size="sm"
                    />
                  ) : undefined
                }
                accessibilityHint={
                  tappable
                    ? tx('facility.rowHint', 'Ends this session and starts one at this facility.')
                    : undefined
                }
              />
            );
          })}
        </Card>
      );
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const paletteIsOpes = palette === 'opes';

  return (
    <ProfileFrame
      masthead={{
        left: router.canGoBack()
          ? { icon: 'arrow-left', label: tr('profiles.back'), onPress: () => router.back() }
          : undefined,
        avatar: {
          photoUrl: profile?.photo_url,
          initials: initials(displayName),
          label: editing ? displayName : tx('profile.editProfile', 'Edit profile'),
          onPress: editing ? undefined : startEdit,
        },
      }}
      after={
        <>
          {dialog.element}
          <SignOutSheet visible={signOutOpen} onClose={() => setSignOutOpen(false)} />
        </>
      }
      keyboardShouldPersistTaps="handled"
      refreshControl={
          <RefreshControl
            refreshing={(me.isFetching || profileQuery.isFetching) && !me.isPending}
            onRefresh={() => {
              void me.refetch();
              if (!editing) void profileQuery.refetch();
            }}
            tintColor={colors.blue}
          />
      }
    >
        <ProfileHeading
          title={tx('profile.title', 'Profile')}
          subtitle={tx('profile.subtitle', 'Your account on this device')}
        />

        {meStale}
        {profileStale}

        {identity}

        <TrustChips
          items={[
            { key: 'consent', icon: 'shield-check', label: tr('profiles.trust.consent') },
            { key: 'encrypted', icon: 'lock', label: tr('profiles.trust.encrypted') },
            { key: 'audited', icon: 'history', label: tr('profiles.trust.audited') },
            { key: 'interoperable', icon: 'share', label: tr('profiles.trust.interoperable') },
          ]}
        />

        {/* Counts read straight off the profile and the postings list. A dash,
            never a 0, while either is unknown. */}
        <OverviewTiles
          title={tr('profiles.atAGlance')}
          tiles={[
            {
              key: 'experience',
              icon: 'star',
              tint: 'amber',
              value: profile?.years_experience != null ? String(profile.years_experience) : '—',
              label: tr('profiles.clinician.experience'),
              hint: tr('profiles.clinician.experienceHint'),
            },
            {
              key: 'languages',
              icon: 'globe',
              tint: 'green',
              value: profile ? String(profile.languages.length) : '—',
              label: tr('profiles.clinician.languages'),
              hint: tr('profiles.clinician.languagesHint'),
            },
            {
              key: 'qualifications',
              icon: 'book',
              tint: 'blue',
              value: profile ? String(profile.qualifications.length) : '—',
              label: tr('profiles.clinician.qualifications'),
              hint: tr('profiles.clinician.qualificationsHint'),
            },
            {
              key: 'facilities',
              icon: 'building',
              tint: 'blue',
              value: facilitiesQuery.data ? String(facilityRows.length) : '—',
              label: tr('profiles.clinician.facilities'),
              hint: tr('profiles.clinician.facilitiesHint'),
            },
          ]}
        />

        <ProfileSection
          icon="stethoscope"
          title={tx('profile.sectionProfile', 'Professional profile')}
          subtitle={tr('profiles.clinician.professionalDesc')}
          actionLabel={!editing && profile ? tr('profiles.edit') : undefined}
          actionIcon="edit"
          onAction={!editing && profile ? startEdit : undefined}
        >
          {professional}
        </ProfileSection>

        {!!me.data && (
          <ProfileSection
            icon="person"
            title={tx('profile.sectionAccount', 'Account')}
            subtitle={tr('profiles.clinician.accountSectionDesc')}
          >
            <Card variant="flush">
              <ListRow
                icon="person"
                tint="blue"
                title={tx('profile.rowName', 'Name')}
                subtitle={me.data.name}
                chevron={false}
                divider
              />
              <ListRow
                icon="id-card"
                tint="blue"
                title={tx('profile.rowRole', 'Role')}
                subtitle={roleLabel(me.data.role)}
                chevron={false}
                divider
              />
              <ListRow
                icon="mail"
                tint="blue"
                title={tx('profile.rowEmail', 'Email')}
                subtitle={me.data.email ?? dash}
                chevron={false}
                divider
              />
              <ListRow
                icon="shield-check"
                tint={me.data.is_active ? 'green' : 'red'}
                title={tx('profile.rowStatus', 'Account status')}
                chevron={false}
                trailing={
                  <StatusBadge
                    status={me.data.is_active ? 'active' : 'inactive'}
                    tone={me.data.is_active ? 'normal' : 'critical'}
                    label={
                      me.data.is_active
                        ? tx('profile.statusActive', 'Active')
                        : tx('profile.statusInactive', 'Inactive')
                    }
                    size="sm"
                  />
                }
              />
            </Card>
          </ProfileSection>
        )}

        {/* ── Facility — which building this session speaks for ─────────── */}
        {!!facilitySection && (
          <ProfileSection
            icon="building"
            title={tx('facility.section', 'Facility')}
            subtitle={tr('profiles.clinician.facilityDesc')}
          >
            {facilitySection}
          </ProfileSection>
        )}

        {/* ── Appearance — device-local, persisted by the root layout ───── */}
        <ProfileSection
          icon="contrast"
          title={tr('opesCore.profile.preferences')}
          subtitle={tr('profiles.clinician.preferencesDesc')}
        >
          <Card variant="flush">
            <ListRow
              icon="contrast"
              tint="purple"
              title={tr('opesCore.profile.theme')}
              subtitle={tr('settings.appearance.body', {
                defaultValue: 'Switch between the OpesCare brand and the OPES template palette.',
              })}
              // A switch plus its state word leaves this row's text column
              // ~136px wide on a 375px phone, where the sentence needs five
              // lines. Clamped at two it read "Switch between the OpesCare …".
              subtitleLines={0}
              chevron={false}
              trailing={
                <View style={styles.switchWithValue}>
                  <Text style={styles.switchValue} numberOfLines={1}>
                    {paletteIsOpes
                      ? tr('settings.appearance.opes', { defaultValue: 'OPES' })
                      : tr('settings.appearance.opescare', { defaultValue: 'OpesCare' })}
                  </Text>
                  <Switch
                    value={paletteIsOpes}
                    // `togglePalette()` is the whole act: the root layout's
                    // `onPaletteChange` writes `opescare.palette`. Persisting
                    // here as well would be two writers for one key.
                    onValueChange={togglePalette}
                    trackColor={{ false: colors.divider, true: colors.primarySoft }}
                    thumbColor={paletteIsOpes ? colors.blue : colors.surface}
                    ios_backgroundColor={colors.divider}
                    accessibilityLabel={tr('opesCore.profile.theme')}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: paletteIsOpes }}
                  />
                </View>
              }
            />
          </Card>
        </ProfileSection>

        {/* ── Sign out ──────────────────────────────────────────────────── */}
        <ProfileSection
          icon="phone"
          title={tx('profile.sectionSession', 'This device')}
          subtitle={tr('profiles.clinician.sessionDesc')}
        >
          <Card>
            <Text style={styles.hint}>
              {tx(
                'profile.signOutHint',
                'Sign out before you hand this phone to anyone else. Everything cached on this device — patient names, results, conversations — is removed when you do.'
              )}
            </Text>
            <CareButton
              label={tx('profile.signOut', 'Sign Out')}
              variant="danger"
              icon="logout"
              loading={signOutOpen}
              disabled={signOutOpen}
              onPress={confirmSignOut}
              style={styles.signOutButton}
            />
          </Card>
        </ProfileSection>
    </ProfileFrame>
  );
}

/** A labelled kit `PillInput`, with an optional hint under it. */
function Field({
  styles,
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  multiline,
  keyboardType,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  keyboardType?: 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <PillInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        style={multiline ? styles.inputMultiline : undefined}
      />
      {!!hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

const AVATAR = 74;

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },

    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.navy,
      borderRadius: radii.lg,
      padding: spacing.md,
    },
    avatar: {
      width: AVATAR,
      height: AVATAR,
      borderRadius: AVATAR / 2,
      backgroundColor: colors.navyLight,
      borderWidth: 3,
      borderColor: colors.blue,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImage: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
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
    heroChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: colors.navyLight,
    },
    heroChipText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textOnBrand,
    },
    heroFacility: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textOnBrand,
      opacity: 0.85,
    },

    emptyTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    addButton: { marginTop: spacing.md },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    licenseCard: { marginBottom: spacing.md },
    licenseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    licenseLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    licenseLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },

    aboutCard: { marginTop: spacing.md },
    aboutLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    aboutBody: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    aboutEmpty: { fontStyle: 'italic', color: colors.textMuted },

    editHint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
      marginBottom: spacing.md,
    },
    field: { marginBottom: spacing.xs },
    fieldLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
      marginLeft: spacing.md,
    },
    inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
    fieldHint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
      marginTop: -spacing.sm,
      marginBottom: spacing.sm,
      marginLeft: spacing.md,
    },
    cancelButton: { marginTop: spacing.sm },

    // The state word sits UNDER the switch, not beside it: side by side the
    // pair is ~114px of a 254px row on a 320px phone, and the description in
    // the middle column was left with 76px to wrap in. Stacked it is as wide
    // as its widest half, and the sentence gets the space back.
    switchWithValue: { alignItems: 'flex-end', gap: 4 },
    switchValue: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },

    signOutButton: { marginTop: spacing.md },
  });
