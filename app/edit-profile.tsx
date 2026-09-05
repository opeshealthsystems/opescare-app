import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '@/components/core/shared';
import {
  Card,
  Chip,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  SectionHeader,
  SegmentedTabs,
  StatusBadge,
  formatDateLong,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import { useAuthStore } from '../lib/store/auth';
import { useRemoveMyPhoto, useUpdateMyProfile, useUploadMyPhoto } from '../lib/api/profileQueries';

const SEX_OPTIONS = ['male', 'female'] as const;
type SexOption = (typeof SEX_OPTIONS)[number];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

function extractErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message ?? fallback;
}

/** One of the pill buttons under the photo: choose / take / remove. */
function PhotoAction({
  styles,
  colors,
  icon,
  label,
  onPress,
  disabled = false,
  destructive = false,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.photoAction, destructive && styles.photoActionDestructive, disabled && styles.photoActionOff]}
    >
      <Icon name={icon} size={15} color={destructive ? colors.statusCritical : colors.blue} />
      <Text style={[styles.photoActionText, destructive && styles.photoActionDestructiveText]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Edit Profile — PATCH /mobile/me. The only place a patient can correct
 * their own demographic data and emergency contact after signup; both were
 * previously write-once (captured at registration, never editable again).
 *
 * MobilePatientController::updateMe accepts exactly first_name, last_name,
 * sex, blood_group, address and emergency_contact — date of birth, phone and
 * email are pinned to the Health ID and are rendered here as locked rows so
 * the boundary is visible instead of being discovered as a silent no-op.
 *
 * Presentation is the OPES kit (ScreenHeader, SectionHeader + Card sections,
 * PillInput fields, pill chips for the pickers, GradientButton to save); the
 * form state, validation and the three-state emergency-contact rule are
 * unchanged. */
export default function EditProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const patient = useAuthStore((s) => s.patient);
  const updateProfile = useUpdateMyProfile();
  const uploadPhoto = useUploadMyPhoto();
  const removePhoto = useRemoveMyPhoto();
  const dialog = useDialog();
  const [photoMessage, setPhotoMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const photoBusy = uploadPhoto.isPending || removePhoto.isPending;

  const savedEmergency = patient?.emergency_contact ?? null;

  const [firstName, setFirstName] = useState(patient?.first_name ?? '');
  const [lastName, setLastName] = useState(patient?.last_name ?? '');
  const [sex, setSex] = useState<SexOption | null>((patient?.sex as SexOption | null) ?? null);
  const [bloodGroup, setBloodGroup] = useState<string | null>(patient?.blood_group ?? null);
  const [address, setAddress] = useState(patient?.address ?? '');
  const [emergencyName, setEmergencyName] = useState(savedEmergency?.name ?? '');
  const [emergencyRelationship, setEmergencyRelationship] = useState(
    savedEmergency?.relationship ?? '',
  );
  const [emergencyPhone, setEmergencyPhone] = useState(savedEmergency?.phone ?? '');

  // The auth store's `patient` can still be null at mount (e.g. a deep link,
  // or a slow /me fetch that hasn't resolved yet) — the useState initializers
  // above only run once, so without this the form would stay blank forever
  // even after `patient` populates. Syncs exactly once, the first time
  // `patient` becomes available, so it never clobbers what the guardian is
  // actively typing.
  const hasHydrated = useRef(false);
  useEffect(() => {
    if (hasHydrated.current || !patient) return;
    hasHydrated.current = true;
    setFirstName(patient.first_name ?? '');
    setLastName(patient.last_name ?? '');
    setSex((patient.sex as SexOption | null) ?? null);
    setBloodGroup(patient.blood_group ?? null);
    setAddress(patient.address ?? '');
    setEmergencyName(patient.emergency_contact?.name ?? '');
    setEmergencyRelationship(patient.emergency_contact?.relationship ?? '');
    setEmergencyPhone(patient.emergency_contact?.phone ?? '');
  }, [patient]);

  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Per-field red borders only appear once the patient has actually tried to
  // save — the always-visible status badge is what teaches the rule.
  const [showFieldErrors, setShowFieldErrors] = useState(false);

  const emergencyValues = [emergencyName, emergencyRelationship, emergencyPhone];
  const emergencyFilled = emergencyValues.filter((v) => v.trim() !== '').length;
  const emergencyPartial = emergencyFilled > 0 && emergencyFilled < 3;
  const emergencyComplete = emergencyFilled === 3;
  const emergencyWillRemove = emergencyFilled === 0 && !!savedEmergency?.name;

  const namesMissing = !firstName.trim() || !lastName.trim();

  const isDirty = useMemo(() => {
    if (!patient) return false;
    return (
      firstName.trim() !== (patient.first_name ?? '') ||
      lastName.trim() !== (patient.last_name ?? '') ||
      (sex ?? null) !== ((patient.sex as string | null) ?? null) ||
      (bloodGroup ?? null) !== (patient.blood_group ?? null) ||
      address.trim() !== (patient.address ?? '') ||
      emergencyName.trim() !== (patient.emergency_contact?.name ?? '') ||
      emergencyRelationship.trim() !== (patient.emergency_contact?.relationship ?? '') ||
      emergencyPhone.trim() !== (patient.emergency_contact?.phone ?? '')
    );
  }, [
    patient,
    firstName,
    lastName,
    sex,
    bloodGroup,
    address,
    emergencyName,
    emergencyRelationship,
    emergencyPhone,
  ]);

  // The success banner belongs to the state that was saved; the moment the
  // patient starts editing again it is stale, so it hides itself.
  const showSuccess = !!successMessage && !isDirty;

  const emergencyStatus: { label: string; tone: StatusTone } = emergencyComplete
    ? { label: t('editProfile.emergencyStatusComplete'), tone: 'normal' }
    : emergencyPartial
      ? {
          label: t('editProfile.emergencyStatusIncomplete', { filled: emergencyFilled }),
          tone: 'warning',
        }
      : emergencyWillRemove
        ? { label: t('editProfile.emergencyStatusWillRemove'), tone: 'critical' }
        : { label: t('editProfile.emergencyStatusEmpty'), tone: 'neutral' };

  const handleSave = async () => {
    setFormError(null);
    setSuccessMessage(null);
    setShowFieldErrors(true);

    if (namesMissing) {
      setFormError(t('editProfile.nameRequired'));
      return;
    }
    if (emergencyPartial) {
      setFormError(t('editProfile.emergencyIncomplete'));
      return;
    }

    try {
      await updateProfile.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        sex,
        blood_group: bloodGroup,
        address: address.trim() || null,
        // Three states, not two: fill all three → save the contact; blank all
        // three when one was stored → send an explicit null so the API clears
        // it (omitting the key silently keeps the old contact); blank all three
        // when none was stored → omit entirely.
        ...(emergencyComplete
          ? {
              emergency_contact: {
                name: emergencyName.trim(),
                relationship: emergencyRelationship.trim(),
                phone: emergencyPhone.trim(),
              },
            }
          : emergencyWillRemove
            ? { emergency_contact: null }
            : {}),
      });
      setShowFieldErrors(false);
      setSuccessMessage(
        emergencyWillRemove ? t('editProfile.savedContactRemoved') : t('editProfile.saved'),
      );
    } catch (err) {
      setFormError(extractErrorMessage(err, t('editProfile.saveFailed')));
    }
  };

  const clearEmergencyContact = () => {
    setEmergencyName('');
    setEmergencyRelationship('');
    setEmergencyPhone('');
    setShowFieldErrors(false);
    setFormError(null);
  };

  /**
   * The photo on the Health ID card. Picked with expo-image-picker (a file
   * chooser on web, the library or camera on a phone), cropped square by the
   * picker, then POSTed to /mobile/me/photo, which re-encodes and stores it
   * privately and answers with a signed link. Permission refusals and upload
   * failures are said in words under the buttons, never swallowed.
   */
  const pickPhoto = async (source: 'library' | 'camera') => {
    setPhotoMessage(null);
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setPhotoMessage({ text: t('editProfile.photoPermission'), tone: 'error' });
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      await uploadPhoto.mutateAsync({
        uri: asset.uri,
        mimeType: asset.mimeType ?? null,
        fileName: asset.fileName ?? null,
      });
      setPhotoMessage({ text: t('editProfile.photoSaved'), tone: 'ok' });
    } catch (err) {
      setPhotoMessage({ text: extractErrorMessage(err, t('editProfile.photoFailed')), tone: 'error' });
    }
  };

  const confirmRemovePhoto = () => {
    dialog.confirm({
      title: t('editProfile.photoRemoveConfirmTitle'),
      message: t('editProfile.photoRemoveConfirmBody'),
      confirmLabel: t('editProfile.photoRemove'),
      cancelLabel: t('opesCore.components.goBack'),
      destructive: true,
      onConfirm: async () => {
        setPhotoMessage(null);
        try {
          await removePhoto.mutateAsync();
          setPhotoMessage({ text: t('editProfile.photoRemoved'), tone: 'ok' });
        } catch (err) {
          setPhotoMessage({ text: extractErrorMessage(err, t('editProfile.photoFailed')), tone: 'error' });
        }
      },
    });
  };

  const initials =
    `${patient?.first_name?.[0] ?? ''}${patient?.last_name?.[0] ?? ''}`.toUpperCase() || '?';
  const displayName = [patient?.first_name, patient?.last_name].filter(Boolean).join(' ');

  const fieldIcon = (name: IconName) => <Icon name={name} size={18} color={colors.blue} />;
  const requiredError = (missing: boolean) =>
    showFieldErrors && missing ? t('editProfile.required') : undefined;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('editProfile.title')}
        subtitle={t('editProfile.subtitle')}
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Identity anchor — who this form is editing, and their photo */}
        <Card>
          <View style={styles.identity}>
            <Avatar name={displayName || initials} size={72} uri={patient?.photo_url} />
            <View style={styles.identityBody}>
              <Text style={styles.identityName} numberOfLines={1}>
                {displayName || '—'}
              </Text>
              <Text style={styles.identityId} numberOfLines={1}>
                {t('editProfile.healthIdLabel')} · {patient?.health_id ?? '—'}
              </Text>
              <Text style={styles.photoHint} numberOfLines={1}>
                {patient?.photo_url ? t('editProfile.photoTitle') : t('editProfile.photoNone')}
              </Text>
            </View>
          </View>
          <Text style={styles.photoDesc}>{t('editProfile.photoDesc')}</Text>
          <View style={styles.photoActions}>
            <PhotoAction
              styles={styles}
              colors={colors}
              icon="image"
              label={t('editProfile.photoChange')}
              onPress={() => void pickPhoto('library')}
              disabled={photoBusy}
            />
            {Platform.OS !== 'web' ? (
              <PhotoAction
                styles={styles}
                colors={colors}
                icon="camera"
                label={t('editProfile.photoTake')}
                onPress={() => void pickPhoto('camera')}
                disabled={photoBusy}
              />
            ) : null}
            {patient?.photo_url ? (
              <PhotoAction
                styles={styles}
                colors={colors}
                icon="trash"
                label={t('editProfile.photoRemove')}
                onPress={confirmRemovePhoto}
                disabled={photoBusy}
                destructive
              />
            ) : null}
          </View>
          {photoBusy ? (
            <View style={styles.photoStatus} accessibilityRole="progressbar" accessibilityLabel={t('editProfile.photoUploading')}>
              <ActivityIndicator size="small" color={colors.blue} />
              <Text style={styles.photoStatusText}>{t('editProfile.photoUploading')}</Text>
            </View>
          ) : photoMessage ? (
            <Text
              style={[styles.photoStatusText, photoMessage.tone === 'error' && { color: statusMap.critical.fg }]}
              accessibilityRole={photoMessage.tone === 'error' ? 'alert' : 'text'}
            >
              {photoMessage.text}
            </Text>
          ) : null}
        </Card>

        {/* ── Personal details ─────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('editProfile.personalTitle')} />
          <Card>
            <Text style={styles.sectionDesc}>{t('editProfile.personalDesc')}</Text>

            <Text style={styles.fieldLabel}>{t('editProfile.firstName')}</Text>
            <PillInput
              icon={fieldIcon('person')}
              placeholder={t('editProfile.firstNamePlaceholder')}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoComplete="given-name"
              textContentType="givenName"
              accessibilityLabel={t('editProfile.firstName')}
              error={requiredError(!firstName.trim())}
            />

            <Text style={styles.fieldLabel}>{t('editProfile.lastName')}</Text>
            <PillInput
              icon={fieldIcon('person')}
              placeholder={t('editProfile.lastNamePlaceholder')}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoComplete="family-name"
              textContentType="familyName"
              accessibilityLabel={t('editProfile.lastName')}
              error={requiredError(!lastName.trim())}
            />

            <Text style={styles.fieldLabel}>{t('editProfile.sex')}</Text>
            <SegmentedTabs
              variant="pill"
              value={sex ?? ''}
              onChange={(key) => setSex(key === 'female' ? 'female' : 'male')}
              options={SEX_OPTIONS.map((option) => ({
                key: option,
                label: t(`editProfile.sex${option.charAt(0).toUpperCase()}${option.slice(1)}`),
              }))}
              style={styles.pickerRow}
            />

            <View style={styles.fieldLabelRow}>
              <Icon name="droplet" size={14} color={colors.textMuted} />
              <Text style={styles.fieldLabelInline}>{t('editProfile.bloodGroup')}</Text>
            </View>
            <Text style={styles.fieldHint}>{t('editProfile.bloodGroupHint')}</Text>
            <View style={styles.chipWrap}>
              {BLOOD_GROUPS.map((option) => {
                const active = bloodGroup === option;
                return (
                  <Chip
                    key={option}
                    label={option}
                    selected={active}
                    onPress={() => setBloodGroup(active ? null : option)}
                    accessibilityLabel={`${t('editProfile.bloodGroup')} ${option}`}
                  />
                );
              })}
            </View>
          </Card>
        </View>

        {/* ── Address ──────────────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('editProfile.addressTitle')} />
          <Card>
            <Text style={styles.sectionDesc}>{t('editProfile.addressDesc')}</Text>
            <Text style={styles.fieldLabel}>{t('editProfile.address')}</Text>
            <PillInput
              icon={fieldIcon('location')}
              placeholder={t('editProfile.addressPlaceholder')}
              value={address}
              onChangeText={setAddress}
              autoCapitalize="sentences"
              autoComplete="street-address"
              textContentType="fullStreetAddress"
              accessibilityLabel={t('editProfile.address')}
            />
          </Card>
        </View>

        {/* ── Emergency contact — the all-or-nothing rule is stated up front
            and mirrored live by the status badge, so it is never a surprise
            422. ─────────────────────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('editProfile.emergencyContactTitle')} />
          <Card>
            <View style={styles.sectionDescRow}>
              <Text style={[styles.sectionDesc, styles.sectionDescGrow]}>
                {t('editProfile.emergencyContactDesc')}
              </Text>
              <StatusBadge
                status="emergency_contact"
                tone={emergencyStatus.tone}
                label={emergencyStatus.label}
                size="sm"
              />
            </View>

            <Text style={styles.fieldLabel}>{t('editProfile.emergencyName')}</Text>
            <PillInput
              icon={fieldIcon('person')}
              placeholder={t('editProfile.emergencyNamePlaceholder')}
              value={emergencyName}
              onChangeText={setEmergencyName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              accessibilityLabel={t('editProfile.emergencyName')}
              error={requiredError(emergencyPartial && !emergencyName.trim())}
            />

            <Text style={styles.fieldLabel}>{t('editProfile.emergencyRelationship')}</Text>
            <PillInput
              icon={fieldIcon('users')}
              placeholder={t('editProfile.emergencyRelationshipPlaceholder')}
              value={emergencyRelationship}
              onChangeText={setEmergencyRelationship}
              autoCapitalize="sentences"
              autoComplete="off"
              textContentType="none"
              accessibilityLabel={t('editProfile.emergencyRelationship')}
              error={requiredError(emergencyPartial && !emergencyRelationship.trim())}
            />

            <Text style={styles.fieldLabel}>{t('editProfile.emergencyPhone')}</Text>
            <PillInput
              icon={fieldIcon('phone')}
              placeholder={t('editProfile.emergencyPhonePlaceholder')}
              keyboardType="phone-pad"
              value={emergencyPhone}
              onChangeText={setEmergencyPhone}
              autoComplete="tel"
              textContentType="telephoneNumber"
              accessibilityLabel={t('editProfile.emergencyPhone')}
              error={requiredError(emergencyPartial && !emergencyPhone.trim())}
            />

            {savedEmergency?.name && emergencyFilled > 0 ? (
              <TouchableOpacity
                onPress={clearEmergencyContact}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={t('editProfile.emergencyRemove')}
                style={[styles.clearButton, { backgroundColor: statusMap.critical.bg }]}
              >
                <Icon name="trash" size={14} color={statusMap.critical.fg} />
                <Text style={[styles.clearText, { color: statusMap.critical.fg }]}>
                  {t('editProfile.emergencyRemove')}
                </Text>
              </TouchableOpacity>
            ) : null}

            {emergencyWillRemove ? (
              <Notice tone="critical" icon="alert-triangle" text={t('editProfile.emergencyRemoveNotice')} />
            ) : null}
          </Card>
        </View>

        {/* ── Locked — the API pins these to the Health ID ─────────────── */}
        <View>
          <SectionHeader title={t('editProfile.lockedTitle')} />
          <Card variant="flush">
            <Text style={[styles.sectionDesc, styles.sectionDescFlush]}>
              {t('editProfile.lockedDesc')}
            </Text>
            <LockedRow
              icon="mail"
              label={t('editProfile.email')}
              value={patient?.email ?? t('editProfile.notProvided')}
              divider
            />
            <LockedRow
              icon="phone"
              label={t('editProfile.phone')}
              value={patient?.phone ?? t('editProfile.notProvided')}
              divider
            />
            <LockedRow
              icon="calendar"
              label={t('editProfile.dateOfBirth')}
              value={formatDateLong(patient?.dob, t('editProfile.notProvided'))}
            />
          </Card>
        </View>

        {formError ? <Notice tone="critical" icon="alert-triangle" text={formError} /> : null}
        {showSuccess && successMessage ? (
          <Notice tone="normal" icon="check-circle" text={successMessage} />
        ) : null}

        <View style={styles.footer}>
          <GradientButton
            label={t('editProfile.save')}
            onPress={() => void handleSave()}
            loading={updateProfile.isPending}
            disabled={!isDirty}
            icon="none"
          />
          {!isDirty ? <Text style={styles.noChanges}>{t('editProfile.noChanges')}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function LockedRow({
  icon,
  label,
  value,
  divider,
}: {
  icon: IconName;
  label: string;
  value: string;
  divider?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <ListRow
      icon={icon}
      tint="blue"
      title={label}
      subtitle={value}
      trailing={<Icon name="lock" size={16} color={colors.textMuted} />}
      divider={divider}
    />
  );
}

function Notice({ tone, icon, text }: { tone: StatusTone; icon: IconName; text: string }) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = statusMap[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: skin.bg }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon name={icon} size={16} color={skin.fg} />
      <Text style={[styles.noticeText, { color: skin.fg }]}>{text}</Text>
    </View>
  );
}

// ── Styles (colour-dependent, built per palette) ───────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },

    // Identity anchor
    identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: colors.blue,
    },
    photoHint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
    },
    photoDesc: {
      marginTop: spacing.sm + 4,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm + 4 },
    photoAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    photoActionText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.blue,
    },
    photoActionDestructive: { borderColor: colors.statusCriticalBg, backgroundColor: colors.statusCriticalBg },
    photoActionDestructiveText: { color: colors.statusCritical },
    photoActionOff: { opacity: 0.5 },
    photoStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    photoStatusText: {
      marginTop: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    identityBody: { flex: 1, minWidth: 0, gap: 2 },
    identityName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    identityId: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    // Sections
    sectionDesc: {
      marginBottom: spacing.md,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    sectionDescFlush: { marginBottom: 0, paddingHorizontal: spacing.md, paddingTop: spacing.md },
    sectionDescRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    sectionDescGrow: { flex: 1, minWidth: 0 },

    // Fields
    fieldLabel: {
      marginBottom: 6,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    fieldLabelInline: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    fieldHint: {
      marginBottom: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    pickerRow: { marginBottom: spacing.md },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

    clearButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.sm,
    },
    clearText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs },

    // Notices
    notice: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.sm + 4,
      borderRadius: radii.md,
    },
    noticeText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
    },

    // Footer
    footer: { gap: spacing.sm },
    noChanges: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
  });
