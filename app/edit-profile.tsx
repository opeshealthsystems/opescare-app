import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Droplet,
  Lock,
  Mail,
  MapPin,
  Phone,
  PhoneCall,
  Trash2,
  User,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../components/ui/Screen';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { useAuthStore } from '../lib/store/auth';
import { useUpdateMyProfile } from '../lib/api/profileQueries';
import { colors } from '../theme/tokens';

const SEX_OPTIONS = ['male', 'female'] as const;
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

function extractErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message ?? fallback;
}

function formatDate(value: string | null | undefined, locale: string, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Edit Profile — PATCH /mobile/me. The only place a patient can correct
 * their own demographic data and emergency contact after signup; both were
 * previously write-once (captured at registration, never editable again).
 *
 * MobilePatientController::updateMe accepts exactly first_name, last_name,
 * sex, blood_group, address and emergency_contact — date of birth, phone and
 * email are pinned to the Health ID and are rendered here as locked rows so
 * the boundary is visible instead of being discovered as a silent no-op. */
export default function EditProfileScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const patient = useAuthStore((s) => s.patient);
  const updateProfile = useUpdateMyProfile();

  const savedEmergency = patient?.emergency_contact ?? null;

  const [firstName, setFirstName] = useState(patient?.first_name ?? '');
  const [lastName, setLastName] = useState(patient?.last_name ?? '');
  const [sex, setSex] = useState<(typeof SEX_OPTIONS)[number] | null>(
    (patient?.sex as (typeof SEX_OPTIONS)[number] | null) ?? null,
  );
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
    setSex((patient.sex as (typeof SEX_OPTIONS)[number] | null) ?? null);
    setBloodGroup(patient.blood_group ?? null);
    setAddress(patient.address ?? '');
    setEmergencyName(patient.emergency_contact?.name ?? '');
    setEmergencyRelationship(patient.emergency_contact?.relationship ?? '');
    setEmergencyPhone(patient.emergency_contact?.phone ?? '');
  }, [patient]);

  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Per-field red borders only appear once the patient has actually tried to
  // save — the always-visible status chip is what teaches the rule.
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

  const emergencyStatus = emergencyComplete
    ? { label: t('editProfile.emergencyStatusComplete'), tone: 'success' as const }
    : emergencyPartial
      ? {
          label: t('editProfile.emergencyStatusIncomplete', { filled: emergencyFilled }),
          tone: 'warning' as const,
        }
      : emergencyWillRemove
        ? { label: t('editProfile.emergencyStatusWillRemove'), tone: 'danger' as const }
        : { label: t('editProfile.emergencyStatusEmpty'), tone: 'muted' as const };

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

  const initials =
    `${patient?.first_name?.[0] ?? ''}${patient?.last_name?.[0] ?? ''}`.toUpperCase() || '?';

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        <View className="flex-row items-center pt-2">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('editProfile.back')}
            hitSlop={8}
            className="h-11 w-11 items-center justify-center rounded-full border border-brand-300 bg-white"
          >
            <ArrowLeft size={18} color={colors.brand[600]} />
          </Pressable>
          <Text className="ml-4 text-xl font-extrabold text-navy-text">
            {t('editProfile.title')}
          </Text>
        </View>
        <Text className="mt-2 text-sm text-navy-secondary">{t('editProfile.subtitle')}</Text>

        {/* Identity anchor — who this form is editing */}
        <View className="mt-5 flex-row items-center rounded-2xl border border-cream-300 bg-white p-4">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-100">
            <Text className="text-base font-extrabold text-brand-600">{initials}</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-sm font-bold text-navy-text" numberOfLines={1}>
              {[patient?.first_name, patient?.last_name].filter(Boolean).join(' ') || '—'}
            </Text>
            <Text className="mt-0.5 text-xs text-navy-muted">
              {t('editProfile.healthIdLabel')} · {patient?.health_id ?? '—'}
            </Text>
          </View>
        </View>

        {/* Personal details */}
        <SectionCard
          icon={UserRound}
          title={t('editProfile.personalTitle')}
          description={t('editProfile.personalDesc')}
        >
          <TextField
            label={t('editProfile.firstName')}
            placeholder={t('editProfile.firstNamePlaceholder')}
            icon={User}
            value={firstName}
            onChangeText={setFirstName}
            error={showFieldErrors && !firstName.trim() ? t('editProfile.required') : undefined}
          />
          <TextField
            label={t('editProfile.lastName')}
            placeholder={t('editProfile.lastNamePlaceholder')}
            icon={User}
            value={lastName}
            onChangeText={setLastName}
            error={showFieldErrors && !lastName.trim() ? t('editProfile.required') : undefined}
          />

          <Text className="mb-2 text-sm font-semibold text-navy-text">{t('editProfile.sex')}</Text>
          <View className="mb-4 flex-row" style={{ gap: 8 }}>
            {SEX_OPTIONS.map((option) => {
              const active = sex === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setSex(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className="flex-1 items-center rounded-full border px-3 py-2.5"
                  style={{
                    borderColor: active ? colors.brand[500] : colors.cream[300],
                    backgroundColor: active ? colors.brand[50] : colors.white,
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: active ? colors.brand[600] : colors.navy.secondary }}
                  >
                    {t(`editProfile.sex${option.charAt(0).toUpperCase()}${option.slice(1)}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mb-2 flex-row items-center">
            <Droplet size={14} color={colors.navy.muted} />
            <Text className="ml-1.5 text-sm font-semibold text-navy-text">
              {t('editProfile.bloodGroup')}
            </Text>
          </View>
          <Text className="mb-2 text-xs text-navy-muted">{t('editProfile.bloodGroupHint')}</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {BLOOD_GROUPS.map((option) => {
              const active = bloodGroup === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setBloodGroup(active ? null : option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className="rounded-full border px-4 py-2"
                  style={{
                    borderColor: active ? colors.brand[500] : colors.cream[300],
                    backgroundColor: active ? colors.brand[50] : colors.white,
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: active ? colors.brand[600] : colors.navy.secondary }}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>

        {/* Address */}
        <SectionCard
          icon={MapPin}
          title={t('editProfile.addressTitle')}
          description={t('editProfile.addressDesc')}
        >
          <TextField
            label={t('editProfile.address')}
            placeholder={t('editProfile.addressPlaceholder')}
            icon={MapPin}
            value={address}
            onChangeText={setAddress}
          />
        </SectionCard>

        {/* Emergency contact — the all-or-nothing rule is stated up front and
            mirrored live by the status chip, so it is never a surprise 422. */}
        <SectionCard
          icon={PhoneCall}
          title={t('editProfile.emergencyContactTitle')}
          description={t('editProfile.emergencyContactDesc')}
          trailing={<StatusChip label={emergencyStatus.label} tone={emergencyStatus.tone} />}
        >
          <TextField
            label={t('editProfile.emergencyName')}
            placeholder={t('editProfile.emergencyNamePlaceholder')}
            icon={UserRound}
            value={emergencyName}
            onChangeText={setEmergencyName}
            error={
              showFieldErrors && emergencyPartial && !emergencyName.trim()
                ? t('editProfile.required')
                : undefined
            }
          />
          <TextField
            label={t('editProfile.emergencyRelationship')}
            placeholder={t('editProfile.emergencyRelationshipPlaceholder')}
            icon={Users}
            value={emergencyRelationship}
            onChangeText={setEmergencyRelationship}
            error={
              showFieldErrors && emergencyPartial && !emergencyRelationship.trim()
                ? t('editProfile.required')
                : undefined
            }
          />
          <TextField
            label={t('editProfile.emergencyPhone')}
            placeholder={t('editProfile.emergencyPhonePlaceholder')}
            icon={Phone}
            keyboardType="phone-pad"
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
            error={
              showFieldErrors && emergencyPartial && !emergencyPhone.trim()
                ? t('editProfile.required')
                : undefined
            }
          />

          {savedEmergency?.name && emergencyFilled > 0 ? (
            <Pressable
              onPress={() => {
                setEmergencyName('');
                setEmergencyRelationship('');
                setEmergencyPhone('');
                setShowFieldErrors(false);
                setFormError(null);
              }}
              accessibilityRole="button"
              className="flex-row items-center self-start rounded-full px-3 py-2"
              style={{ backgroundColor: colors.semantic.dangerSurface }}
            >
              <Trash2 size={14} color={colors.semantic.danger} />
              <Text className="ml-1.5 text-xs font-bold" style={{ color: colors.semantic.danger }}>
                {t('editProfile.emergencyRemove')}
              </Text>
            </Pressable>
          ) : null}

          {emergencyWillRemove ? (
            <View
              className="mt-1 flex-row items-start rounded-2xl p-3"
              style={{ backgroundColor: colors.semantic.dangerSurface }}
            >
              <AlertTriangle size={15} color={colors.semantic.danger} />
              <Text
                className="ml-2 flex-1 text-xs font-semibold"
                style={{ color: colors.semantic.danger }}
              >
                {t('editProfile.emergencyRemoveNotice')}
              </Text>
            </View>
          ) : null}
        </SectionCard>

        {/* Locked — the API pins these to the Health ID */}
        <SectionCard
          icon={Lock}
          title={t('editProfile.lockedTitle')}
          description={t('editProfile.lockedDesc')}
        >
          <LockedRow
            icon={Mail}
            label={t('editProfile.email')}
            value={patient?.email ?? t('editProfile.notProvided')}
          />
          <LockedRow
            icon={Phone}
            label={t('editProfile.phone')}
            value={patient?.phone ?? t('editProfile.notProvided')}
          />
          <LockedRow
            icon={UserRound}
            label={t('editProfile.dateOfBirth')}
            value={formatDate(patient?.dob, i18n.language, t('editProfile.notProvided'))}
            last
          />
        </SectionCard>

        {formError ? (
          <View
            className="mb-3 mt-5 flex-row items-start rounded-2xl p-3"
            style={{ backgroundColor: colors.semantic.dangerSurface }}
          >
            <AlertTriangle size={16} color={colors.semantic.danger} />
            <Text
              className="ml-2 flex-1 text-sm font-semibold"
              style={{ color: colors.semantic.danger }}
            >
              {formError}
            </Text>
          </View>
        ) : null}

        {showSuccess ? (
          <View
            className="mb-3 mt-5 flex-row items-center justify-center rounded-2xl p-3"
            style={{ backgroundColor: colors.semantic.successSurface }}
          >
            <CheckCircle2 size={16} color={colors.semantic.success} />
            <Text
              className="ml-2 text-sm font-semibold"
              style={{ color: colors.semantic.success }}
            >
              {successMessage}
            </Text>
          </View>
        ) : null}

        <View className={formError || showSuccess ? '' : 'mt-6'}>
          <Button
            label={t('editProfile.save')}
            onPress={handleSave}
            loading={updateProfile.isPending}
            disabled={!isDirty}
            showChevron={false}
          />
          {!isDirty ? (
            <Text className="mt-2 text-center text-xs text-navy-muted">
              {t('editProfile.noChanges')}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  trailing,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-4 rounded-3xl border border-cream-300 bg-white p-4">
      <View className="mb-4 flex-row items-start">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
          <Icon size={18} color={colors.brand[600]} />
        </View>
        <View className="ml-3 flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 pr-2 text-base font-bold text-navy-text">{title}</Text>
            {trailing}
          </View>
          <Text className="mt-1 text-xs text-navy-secondary">{description}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'muted';
}) {
  const palette = {
    success: { bg: colors.semantic.successSurface, fg: colors.semantic.success },
    warning: { bg: colors.semantic.warningSurface, fg: colors.semantic.warning },
    danger: { bg: colors.semantic.dangerSurface, fg: colors.semantic.danger },
    muted: { bg: colors.cream[200], fg: colors.navy.secondary },
  }[tone];

  return (
    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: palette.bg }}>
      <Text className="text-[10px] font-bold" style={{ color: palette.fg }}>
        {label}
      </Text>
    </View>
  );
}

function LockedRow({
  icon: Icon,
  label,
  value,
  last = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center py-3 ${last ? '' : 'border-b border-cream-200'}`}
      accessibilityRole="text"
    >
      <Icon size={15} color={colors.navy.muted} />
      <Text className="ml-2 flex-1 text-sm text-navy-secondary">{label}</Text>
      <Text
        className="text-sm font-semibold text-navy-text"
        style={{ maxWidth: '55%' }}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Lock size={13} color={colors.navy.muted} style={{ marginLeft: 8 }} />
    </View>
  );
}
