/**
 * The clinician's own account: who they are, the professional profile
 * colleagues and patients see, and the way out of the app.
 *
 * Three things live here:
 *
 *   • WHO IS SIGNED IN — name, role, e-mail and account status, from
 *     `GET /auth/me` (via `staffAuth.me()`). Re-issued on focus so a role or a
 *     deactivation changed on the server is reflected rather than a stale copy.
 *
 *   • PROFESSIONAL PROFILE — the provider profile (photo, title, specialty,
 *     subspecialty, years of experience, biography, languages, qualifications,
 *     consulting room) from `GET /staff/profile`, which the clinician can EDIT
 *     in place and SAVE with `PUT /staff/profile`. Three fields are shown but
 *     never editable here because the hospital governs them: the consultation
 *     fee, its currency, and the licence status. The photo is replaced through
 *     `POST /staff/profile/photo`.
 *
 *   • SIGN OUT — `useAuth().logout()`, which revokes the STAFF token and clears
 *     the offline cache. Untouched by this change.
 *
 * Honesty rules carried from the rest of the app: a save whose outcome is
 * unknown (a timeout) is NEVER painted as success — `writeFailureMessage`
 * renders the uncertainty and points the clinician at where to check. A session
 * renewed mid-save surfaces its own "tap again" copy rather than a false error.
 *
 * Photo picking is WEB-ONLY: no image-picker dependency is bundled, so on
 * native the photo control tells the clinician to upload from the desktop
 * rather than dragging in a heavy new dependency. On web a hidden file input is
 * used — react-native-web cannot render a raw `<input>`, so it is created on the
 * DOM directly at pick time.
 *
 * Composition only — `ScreenHeader`, `Card`, `ListRow`, `SectionHeader`,
 * `StatusBadge`, `CareButton`, `NoticeBanner`, `useDialog` and theme tokens.
 * No new colours, radii or spacing.
 */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { me as fetchStaffUser, type StaffUser } from '../../api/staffAuth';
import {
  getProfile,
  updateProfile,
  uploadPhoto,
  type ProviderProfile,
  type ProviderProfileEdit,
} from '../../api/staffProfile';
import { SessionRenewedError } from '../../api/sessionRefresh';
import { BUILD_STAMP } from '../../buildInfo';
import { Card, Icon, ListRow, ScreenHeader, SectionHeader, StatusBadge, useDialog } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useTranslation, type TFunction } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import { fmtMoney } from '../care/shared';
import type { StatusTone } from '../../theme/theme';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { CareButton, NoticeBanner, useAsync } from '../care/shared';

/** Two initials for the identity mark, as on the patient profile hero. */
function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * `users.role` → a word. An unrecognised role is "Staff" / « Personnel »,
 * never the raw column value.
 */
function roleLabel(role: string | null | undefined, t: TFunction): string {
  if (!role) return t('doctor.profile.roleFallback');
  const key = `doctor.profile.role.${role}`;
  const hit = t(key);
  return hit === key ? t('doctor.profile.roleFallback') : hit;
}

/** Licence badge label + tone. An unknown status is shown, never hidden. */
function licenseLabel(status: string | null | undefined, t: TFunction): string {
  if (!status) return t('doctor.profile.licenseFallback');
  const key = `doctor.profile.license.${status}`;
  const hit = t(key);
  return hit === key ? t('doctor.profile.licenseFallback') : hit;
}

function licenseTone(status: string | null | undefined): StatusTone {
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

/** "fr, en" → the display list; known codes are named, unknown ones shown raw. */
function languageLabel(code: string, t: TFunction): string {
  const key = `doctor.profile.langName.${code.toLowerCase()}`;
  const hit = t(key);
  return hit === key ? code : hit;
}

/** A comma-separated free-text field ↔ a trimmed, non-empty string array. */
function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

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
  const parsedYears = years === '' ? null : Number.parseInt(years, 10);
  return {
    title: f.title.trim() || null,
    specialty: f.specialty.trim() || null,
    subspecialty: f.subspecialty.trim() || null,
    bio: f.bio.trim() || null,
    years_experience: parsedYears != null && Number.isFinite(parsedYears) ? parsedYears : null,
    languages: splitList(f.languages),
    qualifications: splitList(f.qualifications),
    room: f.room.trim() || null,
  };
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function DoctorProfileScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { staffUser, logout } = useAuth();
  const dialog = useDialog();

  const [signingOut, setSigningOut] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(() => formFrom(null));
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const meState = useAsync<StaffUser>(fetchStaffUser, []);
  const profileState = useAsync<ProviderProfile | null>(getProfile, []);
  const { reload: reloadMe } = meState;
  const { reload: reloadProfile, setData: setProfileData } = profileState;

  useFocusEffect(
    useCallback(() => {
      reloadMe();
      // A profile open in edit mode must not be yanked out from under the
      // clinician by a focus refetch; only refresh the read-only view.
      if (!editing) reloadProfile();
    }, [reloadMe, reloadProfile, editing])
  );

  // The freshly-fetched account when we have one, otherwise the session's own.
  const user = meState.data ?? staffUser;
  const meStale = meState.data === null && meState.error !== null && user !== null;

  const profile = profileState.data ?? null;
  const profileStale = profileState.error !== null && profileState.data !== null;

  const displayName = profile?.display_name || user?.name || '—';

  // ── Sign out (unchanged) ─────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      setSigningOut(false);
      dialog.alert(t('doctor.profile.failedTitle'), t('doctor.profile.failedBody'));
    }
  }, [logout, dialog, t]);

  const confirmSignOut = useCallback(() => {
    dialog.confirm({
      title: t('doctor.profile.confirmTitle'),
      message: t('doctor.profile.confirmMessage', { name: user?.name ?? '—' }),
      confirmLabel: t('doctor.profile.confirmCta'),
      cancelLabel: t('doctor.profile.confirmCancel'),
      destructive: true,
      onConfirm: signOut,
    });
  }, [dialog, t, user, signOut]);

  // ── Edit ─────────────────────────────────────────────────────────────────

  const startEdit = useCallback(() => {
    setForm(formFrom(profile));
    setEditing(true);
  }, [profile]);

  const cancelEdit = useCallback(() => setEditing(false), []);

  const setField = useCallback(
    (key: keyof EditForm) => (value: string) => setForm((f) => ({ ...f, [key]: value })),
    []
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await updateProfile(editFromForm(form));
      setProfileData(updated);
      setEditing(false);
    } catch (e) {
      if (e instanceof SessionRenewedError) {
        // The save was not replayed: the session was renewed, one more tap
        // works. Stay in edit mode so the tap is possible.
        dialog.alert(t('doctor.profile.saveFailedTitle'), e.message);
      } else {
        // A timed-out save may have been recorded — never assert it failed.
        dialog.alert(
          t('doctor.profile.saveFailedTitle'),
          writeFailureMessage(e, t('doctor.profile.saveCheckHint')),
          'critical'
        );
      }
    } finally {
      setSaving(false);
    }
  }, [form, setProfileData, dialog, t]);

  // ── Photo ──────────────────────────────────────────────────────────────────

  const onPhotoChosen = useCallback(
    async (file: Blob, filename: string) => {
      if (file.size > MAX_PHOTO_BYTES || !/^image\//.test(file.type || '')) {
        dialog.alert(t('doctor.profile.photoFailedTitle'), t('doctor.profile.photoInvalid'));
        return;
      }
      setUploadingPhoto(true);
      try {
        const { photo_url } = await uploadPhoto(file, filename);
        if (profile) setProfileData({ ...profile, photo_url });
        else reloadProfile();
      } catch (e) {
        if (e instanceof SessionRenewedError) {
          dialog.alert(t('doctor.profile.photoFailedTitle'), e.message);
        } else {
          dialog.alert(
            t('doctor.profile.photoFailedTitle'),
            writeFailureMessage(e, t('doctor.profile.photoCheckHint')),
            'critical'
          );
        }
      } finally {
        setUploadingPhoto(false);
      }
    },
    [profile, setProfileData, reloadProfile, dialog, t]
  );

  const changePhoto = useCallback(() => {
    // Native has no in-app picker (no image-picker dependency bundled): point
    // the clinician at the desktop rather than pull in a large native module.
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      dialog.alert(t('doctor.profile.photo'), t('doctor.profile.photoDesktopOnly'));
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void onPhotoChosen(file, file.name);
    };
    input.click();
  }, [dialog, t, onPhotoChosen]);

  const photoActionLabel = profile?.photo_url ? t('doctor.profile.changePhoto') : t('doctor.profile.addPhoto');

  // ── Render ─────────────────────────────────────────────────────────────────

  const headerActions = useMemo(
    () =>
      !editing && user !== null
        ? [
            {
              icon: 'edit' as const,
              onPress: startEdit,
              accessibilityLabel: t('doctor.profile.editProfile'),
            },
          ]
        : undefined,
    [editing, user, startEdit, t]
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('doctor.profile.title')}
        subtitle={t('doctor.profile.subtitle')}
        showBack={navigation.canGoBack()}
        actions={headerActions}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={(meState.loading || profileState.loading) && user !== null}
            onRefresh={() => {
              reloadMe();
              reloadProfile();
            }}
            tintColor={colors.blue}
          />
        }
      >
        {user === null ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.blue} />
            <Text style={styles.loadingText}>{t('doctor.profile.loading')}</Text>
          </View>
        ) : (
          <>
            {meStale && (
              <NoticeBanner icon="alert-circle" tone="warning" message={t('doctor.profile.refreshFailed')} />
            )}
            {profileStale && (
              <NoticeBanner icon="alert-circle" tone="warning" message={t('doctor.profile.profileRefreshFailed')} />
            )}

            {/* ── Hero: photo + name + title/role ── */}
            <View style={styles.hero}>
              <View style={styles.avatar}>
                {profile?.photo_url ? (
                  <Image
                    source={{ uri: profile.photo_url }}
                    style={styles.avatarImage}
                    accessibilityIgnoresInvertColors
                    accessibilityLabel={displayName}
                  />
                ) : (
                  <Text style={styles.avatarText}>{initials(displayName)}</Text>
                )}
              </View>
              <View style={styles.heroIdentity}>
                <Text style={styles.heroName} numberOfLines={2}>
                  {displayName}
                </Text>
                <View style={styles.heroChip}>
                  <Icon name="stethoscope" size={14} color={colors.textOnBrand} />
                  <Text style={styles.heroChipText} numberOfLines={1}>
                    {profile?.title || roleLabel(user.role, t)}
                  </Text>
                </View>
                <CareButton
                  label={photoActionLabel}
                  variant="ghost"
                  size="sm"
                  icon="camera"
                  loading={uploadingPhoto}
                  disabled={uploadingPhoto}
                  onPress={changePhoto}
                  style={styles.photoButton}
                />
              </View>
            </View>

            {/* ── Professional profile ── */}
            <View>
              <SectionHeader title={t('doctor.profile.sectionProfile')} variant="overline" />
              {editing ? (
                <ProfileEditor
                  form={form}
                  setField={setField}
                  onSave={save}
                  onCancel={cancelEdit}
                  saving={saving}
                  t={t}
                />
              ) : profileState.loading && profile === null ? (
                <Card>
                  <View style={styles.loading}>
                    <ActivityIndicator color={colors.blue} />
                    <Text style={styles.loadingText}>{t('doctor.profile.profileLoading')}</Text>
                  </View>
                </Card>
              ) : profile === null ? (
                <Card>
                  <Text style={styles.emptyTitle}>{t('doctor.profile.noProfileTitle')}</Text>
                  <Text style={styles.hint}>{t('doctor.profile.noProfileBody')}</Text>
                  <CareButton
                    label={t('doctor.profile.addDetails')}
                    icon="edit"
                    onPress={startEdit}
                    style={styles.addButton}
                  />
                </Card>
              ) : (
                <ProfileDisplay profile={profile} t={t} />
              )}
            </View>

            {/* ── Account ── */}
            <View>
              <SectionHeader title={t('doctor.profile.sectionAccount')} variant="overline" />
              <Card variant="flush">
                <ListRow
                  icon="person"
                  tint="blue"
                  title={t('doctor.profile.rowName')}
                  subtitle={user.name}
                  chevron={false}
                  divider
                />
                <ListRow
                  icon="id-card"
                  tint="blue"
                  title={t('doctor.profile.rowRole')}
                  subtitle={roleLabel(user.role, t)}
                  chevron={false}
                  divider
                />
                <ListRow
                  icon="mail"
                  tint="blue"
                  title={t('doctor.profile.rowEmail')}
                  subtitle={user.email}
                  chevron={false}
                />
              </Card>
            </View>

            {/* ── Sign out (unchanged) ── */}
            <View>
              <SectionHeader title={t('doctor.profile.sectionSession')} variant="overline" />
              <Card>
                <Text style={styles.hint}>{t('doctor.profile.signOutHint')}</Text>
                <CareButton
                  label={t('doctor.profile.signOut')}
                  variant="danger"
                  icon="logout"
                  loading={signingOut}
                  disabled={signingOut}
                  onPress={confirmSignOut}
                  style={styles.signOutButton}
                />
              </Card>
            </View>
          </>
        )}

        <Text style={styles.buildStamp} selectable>
          {BUILD_STAMP}
        </Text>
      </ScrollView>

      {dialog.element}
    </View>
  );
}

// ── Read-only display ────────────────────────────────────────────────────────

function ProfileDisplay({ profile, t }: { profile: ProviderProfile; t: TFunction }) {
  const dash = t('doctor.profile.notSet');
  const years =
    profile.years_experience != null
      ? t('doctor.profile.experienceYears', { count: profile.years_experience })
      : dash;
  const languages =
    profile.languages.length > 0
      ? profile.languages.map((c) => languageLabel(c, t)).join(', ')
      : dash;
  const qualifications = profile.qualifications.length > 0 ? profile.qualifications.join(', ') : dash;
  const fee =
    profile.consultation_fee != null && profile.currency
      ? fmtMoney(profile.consultation_fee, profile.currency)
      : null;

  return (
    <>
      {/* Licence — read-only badge, and the account-status equivalent for the
          professional identity. Its own card so it reads as a statement, not a
          row the clinician might expect to tap and change. */}
      <Card style={styles.licenseCard}>
        <View style={styles.licenseRow}>
          <View style={styles.licenseLabelWrap}>
            <Icon name="shield-check" size={18} color={colors.textSecondary} />
            <Text style={styles.licenseLabel}>{t('doctor.profile.rowLicense')}</Text>
          </View>
          <StatusBadge
            status={profile.license_status ?? 'unknown'}
            tone={licenseTone(profile.license_status)}
            label={licenseLabel(profile.license_status, t)}
          />
        </View>
      </Card>

      <Card variant="flush">
        <ListRow
          icon="stethoscope"
          tint="blue"
          title={t('doctor.profile.rowSpecialty')}
          subtitle={profile.specialty || dash}
          chevron={false}
          divider
        />
        {!!profile.subspecialty && (
          <ListRow
            icon="stethoscope"
            tint="blue"
            title={t('doctor.profile.rowSubspecialty')}
            subtitle={profile.subspecialty}
            chevron={false}
            divider
          />
        )}
        <ListRow
          icon="star"
          tint="amber"
          title={t('doctor.profile.rowExperience')}
          subtitle={years}
          chevron={false}
          divider
        />
        <ListRow
          icon="globe"
          tint="green"
          title={t('doctor.profile.rowLanguages')}
          subtitle={languages}
          chevron={false}
          divider
        />
        <ListRow
          icon="book"
          tint="purple"
          title={t('doctor.profile.rowQualifications')}
          subtitle={qualifications}
          chevron={false}
          divider
        />
        <ListRow
          icon="location"
          tint="blue"
          title={t('doctor.profile.rowRoom')}
          subtitle={profile.room || dash}
          chevron={false}
          divider={fee !== null}
        />
        {fee !== null && (
          <ListRow
            icon="credit-card"
            tint="blue"
            title={t('doctor.profile.rowFee')}
            subtitle={fee}
            value={t('doctor.profile.feeReadOnly')}
            chevron={false}
          />
        )}
      </Card>

      {/* Bio */}
      <Card>
        <Text style={styles.aboutLabel}>{t('doctor.profile.aboutTitle')}</Text>
        <Text style={[styles.aboutBody, !profile.bio && styles.aboutEmpty]}>
          {profile.bio || t('doctor.profile.bioEmpty')}
        </Text>
      </Card>
    </>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────

function ProfileEditor({
  form,
  setField,
  onSave,
  onCancel,
  saving,
  t,
}: {
  form: EditForm;
  setField: (key: keyof EditForm) => (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  t: TFunction;
}) {
  return (
    <Card>
      <Text style={styles.editHint}>{t('doctor.profile.editHint')}</Text>

      <Field
        label={t('doctor.profile.fieldTitle')}
        value={form.title}
        onChangeText={setField('title')}
        placeholder={t('doctor.profile.fieldTitlePlaceholder')}
      />
      <Field
        label={t('doctor.profile.fieldSpecialty')}
        value={form.specialty}
        onChangeText={setField('specialty')}
        placeholder={t('doctor.profile.fieldSpecialtyPlaceholder')}
      />
      <Field
        label={t('doctor.profile.fieldSubspecialty')}
        value={form.subspecialty}
        onChangeText={setField('subspecialty')}
        placeholder={t('doctor.profile.fieldSubspecialtyPlaceholder')}
      />
      <Field
        label={t('doctor.profile.fieldExperience')}
        value={form.years_experience}
        onChangeText={setField('years_experience')}
        placeholder={t('doctor.profile.fieldExperiencePlaceholder')}
        keyboardType="number-pad"
      />
      <Field
        label={t('doctor.profile.fieldRoom')}
        value={form.room}
        onChangeText={setField('room')}
        placeholder={t('doctor.profile.fieldRoomPlaceholder')}
      />
      <Field
        label={t('doctor.profile.fieldLanguages')}
        value={form.languages}
        onChangeText={setField('languages')}
        hint={t('doctor.profile.fieldLanguagesHint')}
      />
      <Field
        label={t('doctor.profile.fieldQualifications')}
        value={form.qualifications}
        onChangeText={setField('qualifications')}
        hint={t('doctor.profile.fieldQualificationsHint')}
      />
      <Field
        label={t('doctor.profile.fieldBio')}
        value={form.bio}
        onChangeText={setField('bio')}
        placeholder={t('doctor.profile.fieldBioPlaceholder')}
        multiline
      />

      <View style={styles.editActions}>
        <CareButton
          label={t('doctor.profile.cancel')}
          variant="secondary"
          onPress={onCancel}
          disabled={saving}
          style={styles.editAction}
        />
        <CareButton
          label={t('doctor.profile.save')}
          icon="check"
          loading={saving}
          disabled={saving}
          onPress={onSave}
          style={styles.editAction}
        />
      </View>
    </Card>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  multiline,
  keyboardType,
}: {
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
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        accessibilityLabel={label}
      />
      {!!hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

const AVATAR = 74;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },

  loading: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm },
  loadingText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

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
  photoButton: { alignSelf: 'flex-start', marginTop: spacing.xs },

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
  licenseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  licenseLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  licenseLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },

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
    marginBottom: spacing.sm,
  },
  field: { marginBottom: spacing.md },
  fieldLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  fieldHint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  editActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  editAction: { flex: 1 },

  signOutButton: { marginTop: spacing.md },

  buildStamp: {
    marginTop: spacing.lg,
    textAlign: 'center',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
