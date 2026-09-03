import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertTriangle,
  ArrowLeft,
  Baby,
  Calendar,
  ChevronRight,
  Clock,
  Mail,
  MailCheck,
  Phone,
  RotateCw,
  Send,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { colors } from '../../theme/tokens';
import {
  useCancelFamilyInvitation,
  useFamilyInvitations,
  useFamilyMembers,
  useRegisterDependent,
  useSendFamilyInvitation,
  type FamilyInvitation,
} from '../../lib/api/queries';

const RELATIONSHIP_OPTIONS = [
  'parent',
  'grandparent',
  'spouse',
  'sibling',
  'caregiver',
  'legal_guardian',
  'child',
  'other',
] as const;

const SEX_OPTIONS = ['male', 'female'] as const;
const SEX_LABEL_KEYS: Record<(typeof SEX_OPTIONS)[number], string> = {
  male: 'family.sexMale',
  female: 'family.sexFemale',
};

function extractErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message ?? fallback;
}

/** Turns raw digit entry into "YYYY-MM-DD" as the guardian types, without a
 * date-picker dependency this screen isn't allowed to add — mirrors
 * (auth)/signup.tsx's formatDobInput/isValidPastDate exactly. */
function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  return [y, m, d].filter(Boolean).join('-');
}

function isValidPastDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return false;
  }
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return date.getTime() < todayUtc;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

type Mode = 'invite' | 'register';

/**
 * Family: linked members + invitations. GET /mobile/family (active + pending
 * links), GET/POST /mobile/family/invitations, DELETE /mobile/family/invitations/{id}.
 * Backend: App\Http\Controllers\Api\Mobile\MobileFamilyController (already wired).
 *
 * Two genuinely different actions share this screen, so they are presented as a
 * deliberate choice rather than a segmented control over one blob of fields:
 * inviting an *existing* OpesCare patient by contact, and registering a brand
 * new dependent (which mints a real Patient + Health ID).
 */
export default function FamilyScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const membersQuery = useFamilyMembers();
  const invitationsQuery = useFamilyInvitations();
  const sendInvitation = useSendFamilyInvitation();
  const cancelInvitation = useCancelFamilyInvitation();
  const registerDependent = useRegisterDependent();

  const [mode, setMode] = useState<Mode | null>(null);
  const [contact, setContact] = useState('');
  const [relationship, setRelationship] = useState<(typeof RELATIONSHIP_OPTIONS)[number]>('parent');
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Register-a-dependent form (POST /mobile/family — a brand-new Patient with
  // no account of their own, e.g. a child), distinct from the invite-by-contact
  // form which links an *existing* OpesCare patient.
  const [depFullName, setDepFullName] = useState('');
  const [depDob, setDepDob] = useState('');
  const [depSex, setDepSex] = useState<(typeof SEX_OPTIONS)[number] | null>(null);
  const [depRelationship, setDepRelationship] =
    useState<(typeof RELATIONSHIP_OPTIONS)[number]>('child');
  const [depBloodGroup, setDepBloodGroup] = useState('');
  const [depPhone, setDepPhone] = useState('');

  const members = useMemo(
    () => (membersQuery.data ?? []).filter((m) => !m.is_pending && m.patient),
    [membersQuery.data],
  );
  const invitations = invitationsQuery.data ?? [];

  const refreshing = membersQuery.isRefetching || invitationsQuery.isRefetching;
  const initialLoading =
    (membersQuery.isLoading && !membersQuery.data) ||
    (invitationsQuery.isLoading && !invitationsQuery.data);
  const hasLoadError = membersQuery.isError || invitationsQuery.isError;

  const onRefresh = () => {
    membersQuery.refetch();
    invitationsQuery.refetch();
  };

  const closeForm = () => {
    setMode(null);
    setFormError(null);
  };

  const openForm = (next: Mode) => {
    setMode(next);
    setFormError(null);
    setSuccessMessage(null);
  };

  const handleSendInvitation = async () => {
    setFormError(null);
    setSuccessMessage(null);
    if (!contact.trim()) {
      setFormError(t('family.contactRequired'));
      return;
    }
    try {
      await sendInvitation.mutateAsync({ contact: contact.trim(), relationship });
      setContact('');
      setRelationship('parent');
      setMode(null);
      setSuccessMessage(t('family.invitationSent'));
    } catch (err) {
      setFormError(extractErrorMessage(err, t('family.invitationFailed')));
    }
  };

  const handleRegisterDependent = async () => {
    setFormError(null);
    setSuccessMessage(null);
    if (!depFullName.trim()) {
      setFormError(t('family.fullNameRequired'));
      return;
    }
    if (!isValidPastDate(depDob)) {
      setFormError(t('family.dobInvalid'));
      return;
    }
    if (!depSex) {
      setFormError(t('family.sexRequired'));
      return;
    }
    try {
      await registerDependent.mutateAsync({
        full_name: depFullName.trim(),
        date_of_birth: depDob,
        sex: depSex,
        relationship: depRelationship,
        ...(depBloodGroup.trim() ? { blood_group: depBloodGroup.trim() } : {}),
        ...(depPhone.trim() ? { phone: depPhone.trim() } : {}),
      });
      setDepFullName('');
      setDepDob('');
      setDepSex(null);
      setDepRelationship('child');
      setDepBloodGroup('');
      setDepPhone('');
      setMode(null);
      setSuccessMessage(t('family.dependentRegistered'));
    } catch (err) {
      setFormError(extractErrorMessage(err, t('family.dependentRegisterFailed')));
    }
  };

  const handleCancelInvitation = (invitation: FamilyInvitation) => {
    Alert.alert(
      t('family.cancelInviteTitle'),
      t('family.cancelInviteBody', { contact: invitation.contact }),
      [
        { text: t('family.dismiss'), style: 'cancel' },
        {
          text: t('family.cancelInviteConfirm'),
          style: 'destructive',
          onPress: async () => {
            setCancellingId(invitation.id);
            try {
              await cancelInvitation.mutateAsync(invitation.id);
            } catch (err) {
              Alert.alert(
                t('family.error'),
                extractErrorMessage(err, t('family.cancelInviteFailed')),
              );
            } finally {
              setCancellingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen className="px-0">
      <View className="flex-row items-center px-6 pt-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('family.back')}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full border border-brand-300 bg-white"
        >
          <ArrowLeft size={18} color={colors.brand[600]} />
        </Pressable>
        <Text className="ml-4 text-xl font-extrabold text-navy-text">{t('family.title')}</Text>
      </View>

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand[500]}
          />
        }
      >
        <Text className="mt-2 text-sm text-navy-secondary">{t('family.subtitle')}</Text>

        {/* Care-circle summary */}
        <LinearGradient
          colors={[colors.brand[600], colors.brand[500], colors.brand[300]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 24, marginTop: 20, padding: 20 }}
        >
          <View className="flex-row items-center">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-white/25">
              <Users size={20} color={colors.white} />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-base font-extrabold text-white">
                {t('family.summaryTitle')}
              </Text>
              <Text className="mt-0.5 text-xs text-white/90">{t('family.summaryDesc')}</Text>
            </View>
          </View>
          <View className="mt-5 flex-row">
            <SummaryStat
              label={t('family.summaryLinked')}
              value={initialLoading ? '…' : String(members.length)}
            />
            <View className="mx-4 w-px bg-white/30" />
            <SummaryStat
              label={t('family.summaryPending')}
              value={initialLoading ? '…' : String(invitations.length)}
            />
          </View>
        </LinearGradient>

        {hasLoadError ? (
          <View
            className="mt-4 flex-row items-center rounded-2xl p-4"
            style={{ backgroundColor: colors.semantic.dangerSurface }}
          >
            <AlertTriangle size={17} color={colors.semantic.danger} />
            <Text
              className="ml-2 flex-1 text-sm font-semibold"
              style={{ color: colors.semantic.danger }}
            >
              {t('family.loadFailed')}
            </Text>
            <Pressable
              onPress={onRefresh}
              accessibilityRole="button"
              hitSlop={8}
              className="ml-2 flex-row items-center rounded-full bg-white px-3 py-1.5"
            >
              <RotateCw size={13} color={colors.semantic.danger} />
              <Text
                className="ml-1 text-xs font-bold"
                style={{ color: colors.semantic.danger }}
              >
                {t('family.retry')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Add someone — an explicit choice between two different actions */}
        {mode === null ? (
          <View className="mt-4 rounded-3xl border border-cream-300 bg-white p-4">
            <Text className="text-base font-bold text-navy-text">{t('family.addTitle')}</Text>
            <Text className="mt-1 text-xs text-navy-secondary">{t('family.addDesc')}</Text>

            <View className="mt-4">
              <ChoiceRow
                icon={UserPlus}
                title={t('family.optionInviteTitle')}
                description={t('family.optionInviteDesc')}
                onPress={() => openForm('invite')}
              />
              <View className="h-px bg-cream-200" style={{ marginVertical: 4 }} />
              <ChoiceRow
                icon={Baby}
                title={t('family.optionRegisterTitle')}
                description={t('family.optionRegisterDesc')}
                onPress={() => openForm('register')}
              />
            </View>
          </View>
        ) : (
          <View className="mt-4 rounded-3xl border border-cream-300 bg-white p-4">
            <View className="flex-row items-start">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
                {mode === 'invite' ? (
                  <UserPlus size={18} color={colors.brand[600]} />
                ) : (
                  <Baby size={18} color={colors.brand[600]} />
                )}
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-bold text-navy-text">
                  {mode === 'invite'
                    ? t('family.optionInviteTitle')
                    : t('family.optionRegisterTitle')}
                </Text>
                <Text className="mt-1 text-xs text-navy-secondary">
                  {mode === 'invite' ? t('family.tabInviteHint') : t('family.tabRegisterHint')}
                </Text>
              </View>
              <Pressable
                onPress={closeForm}
                accessibilityRole="button"
                accessibilityLabel={t('family.cancel')}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-cream-200"
              >
                <X size={16} color={colors.navy.secondary} />
              </Pressable>
            </View>

            <View className="mt-5">
              {mode === 'invite' ? (
                <>
                  <TextField
                    label={t('family.contactLabel')}
                    placeholder={t('family.contactPlaceholder')}
                    icon={contact.includes('@') ? Mail : Phone}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={contact}
                    onChangeText={setContact}
                  />

                  <ChipGroup
                    label={t('family.relationshipLabel')}
                    options={RELATIONSHIP_OPTIONS}
                    value={relationship}
                    onSelect={setRelationship}
                    labelFor={(option) => t(`family.relationships.${option}`)}
                  />

                  {formError ? <FormError message={formError} /> : null}

                  <Button
                    label={t('family.sendInvite')}
                    onPress={handleSendInvitation}
                    loading={sendInvitation.isPending}
                    leftIcon={Send}
                    showChevron={false}
                  />
                </>
              ) : (
                <>
                  <TextField
                    label={t('family.fullNameLabel')}
                    placeholder={t('family.fullNamePlaceholder')}
                    icon={UserPlus}
                    value={depFullName}
                    onChangeText={setDepFullName}
                  />
                  <TextField
                    label={t('family.dateOfBirth')}
                    placeholder={t('family.dateOfBirthPlaceholder')}
                    icon={Calendar}
                    keyboardType="number-pad"
                    maxLength={10}
                    value={depDob}
                    onChangeText={(v) => setDepDob(formatDobInput(v))}
                  />

                  <Text className="mb-2 text-sm font-semibold text-navy-text">
                    {t('family.sexLabel')}
                  </Text>
                  <View className="mb-4 flex-row" style={{ gap: 8 }}>
                    {SEX_OPTIONS.map((option) => {
                      const active = depSex === option;
                      return (
                        <Pressable
                          key={option}
                          onPress={() => setDepSex(option)}
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
                            {t(SEX_LABEL_KEYS[option])}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <ChipGroup
                    label={t('family.relationshipLabel')}
                    options={RELATIONSHIP_OPTIONS}
                    value={depRelationship}
                    onSelect={setDepRelationship}
                    labelFor={(option) => t(`family.relationships.${option}`)}
                  />

                  <TextField
                    label={t('family.bloodGroupLabel')}
                    placeholder={t('family.bloodGroupPlaceholder')}
                    value={depBloodGroup}
                    onChangeText={setDepBloodGroup}
                  />
                  <TextField
                    label={t('family.phoneLabel')}
                    placeholder={t('family.phonePlaceholder')}
                    icon={Phone}
                    keyboardType="phone-pad"
                    value={depPhone}
                    onChangeText={setDepPhone}
                  />

                  <View
                    className="mb-4 flex-row items-start rounded-2xl p-3"
                    style={{ backgroundColor: colors.brand[50] }}
                  >
                    <Baby size={15} color={colors.brand[600]} />
                    <Text className="ml-2 flex-1 text-xs text-navy-secondary">
                      {t('family.registerNotice')}
                    </Text>
                  </View>

                  {formError ? <FormError message={formError} /> : null}

                  <Button
                    label={t('family.registerDependent')}
                    onPress={handleRegisterDependent}
                    loading={registerDependent.isPending}
                    leftIcon={Baby}
                    showChevron={false}
                  />
                </>
              )}
            </View>
          </View>
        )}

        {successMessage ? (
          <View
            className="mt-4 flex-row items-center justify-center rounded-2xl p-3"
            style={{ backgroundColor: colors.semantic.successSurface }}
          >
            <MailCheck size={16} color={colors.semantic.success} />
            <Text
              className="ml-2 text-sm font-semibold"
              style={{ color: colors.semantic.success }}
            >
              {successMessage}
            </Text>
          </View>
        ) : null}

        {/* Pending invitations */}
        <SectionHeader
          title={t('family.pendingInvitations')}
          count={initialLoading ? null : invitations.length}
        />

        {initialLoading ? (
          <SkeletonRow />
        ) : invitations.length === 0 ? (
          <EmptyState icon={MailCheck} message={t('family.noPendingInvitations')} />
        ) : (
          invitations.map((invitation) => (
            <View
              key={invitation.id}
              className="mb-3 flex-row items-center rounded-2xl border border-cream-300 bg-white p-4"
            >
              <View
                className="h-11 w-11 items-center justify-center rounded-2xl"
                style={{ backgroundColor: colors.semantic.warningSurface }}
              >
                <Clock size={17} color={colors.semantic.warning} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-sm font-bold text-navy-text" numberOfLines={1}>
                  {invitation.contact}
                </Text>
                <Text className="mt-0.5 text-xs text-navy-secondary">
                  {t(`family.relationships.${invitation.relationship}`, {
                    defaultValue: invitation.relationship,
                  })}
                </Text>
                <Text className="mt-0.5 text-[11px] text-navy-muted">
                  {t('family.expiresOn', { date: invitation.expires_at ?? '—' })}
                </Text>
              </View>
              <Pressable
                onPress={() => handleCancelInvitation(invitation)}
                accessibilityRole="button"
                accessibilityLabel={t('family.cancelInviteConfirm')}
                hitSlop={8}
                disabled={cancellingId === invitation.id}
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{
                  backgroundColor: colors.semantic.dangerSurface,
                  opacity: cancellingId === invitation.id ? 0.5 : 1,
                }}
              >
                {cancellingId === invitation.id ? (
                  <ActivityIndicator size="small" color={colors.semantic.danger} />
                ) : (
                  <X size={16} color={colors.semantic.danger} />
                )}
              </Pressable>
            </View>
          ))
        )}

        {/* Linked members */}
        <SectionHeader
          title={t('family.linkedMembers')}
          count={initialLoading ? null : members.length}
        />

        {initialLoading ? (
          <SkeletonRow />
        ) : members.length === 0 ? (
          <EmptyState icon={Users} message={t('family.noMembers')} />
        ) : (
          members.map((member) => (
            <View
              key={member.id}
              className="mb-3 rounded-2xl border border-cream-300 bg-white p-4"
            >
              <View className="flex-row items-center">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-100">
                  <Text className="text-sm font-extrabold text-brand-600">
                    {initialsOf(member.patient?.full_name ?? '?')}
                  </Text>
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold text-navy-text" numberOfLines={1}>
                    {member.patient?.full_name}
                  </Text>
                  <Text className="mt-0.5 text-xs text-navy-secondary">
                    {t(`family.relationships.${member.relationship}`, {
                      defaultValue: member.relationship,
                    })}
                    {member.patient?.age != null
                      ? ` · ${t('family.age', { age: member.patient.age })}`
                      : ''}
                  </Text>
                </View>
                <View className="rounded-full bg-cream-200 px-3 py-1">
                  <Text className="text-[10px] font-bold text-navy-secondary">
                    {t(`family.accessLevels.${member.access_level}`, {
                      defaultValue: member.access_level,
                    })}
                  </Text>
                </View>
              </View>

              {member.patient?.health_id ? (
                <View className="mt-3 flex-row items-center border-t border-cream-200 pt-3">
                  <Text className="text-[10px] font-bold uppercase tracking-wide text-navy-muted">
                    {t('family.healthIdLabel')}
                  </Text>
                  <Text className="ml-2 flex-1 text-xs font-bold text-brand-600" numberOfLines={1}>
                    {member.patient.health_id}
                  </Text>
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="text-2xl font-extrabold text-white">{value}</Text>
      <Text className="mt-0.5 text-xs text-white/90">{label}</Text>
    </View>
  );
}

function ChoiceRow({
  icon: Icon,
  title,
  description,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="flex-row items-center py-3"
    >
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-brand-50">
        <Icon size={19} color={colors.brand[600]} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-sm font-bold text-navy-text">{title}</Text>
        <Text className="mt-0.5 text-xs text-navy-secondary">{description}</Text>
      </View>
      <ChevronRight size={18} color={colors.navy.muted} />
    </Pressable>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onSelect,
  labelFor,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onSelect: (option: T) => void;
  labelFor: (option: T) => string;
}) {
  return (
    <>
      <Text className="mb-2 text-sm font-semibold text-navy-text">{label}</Text>
      <View className="mb-4 flex-row flex-wrap" style={{ gap: 8 }}>
        {options.map((option) => {
          const active = value === option;
          return (
            <Pressable
              key={option}
              onPress={() => onSelect(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className="rounded-full border px-3 py-2"
              style={{
                borderColor: active ? colors.brand[500] : colors.cream[300],
                backgroundColor: active ? colors.brand[50] : colors.white,
              }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: active ? colors.brand[600] : colors.navy.secondary }}
              >
                {labelFor(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <View
      className="mb-3 flex-row items-start rounded-2xl p-3"
      style={{ backgroundColor: colors.semantic.dangerSurface }}
    >
      <AlertTriangle size={15} color={colors.semantic.danger} />
      <Text
        className="ml-2 flex-1 text-xs font-semibold"
        style={{ color: colors.semantic.danger }}
      >
        {message}
      </Text>
    </View>
  );
}

function SectionHeader({ title, count }: { title: string; count: number | null }) {
  return (
    <View className="mb-3 mt-7 flex-row items-center">
      <Text className="text-base font-bold text-navy-text">{title}</Text>
      {count !== null ? (
        <View className="ml-2 rounded-full bg-cream-200 px-2 py-0.5">
          <Text className="text-[11px] font-bold text-navy-secondary">{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function EmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <View className="items-center rounded-2xl border border-dashed border-cream-300 px-6 py-8">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-cream-200">
        <Icon size={20} color={colors.navy.muted} />
      </View>
      <Text className="mt-3 text-center text-sm text-navy-secondary">{message}</Text>
    </View>
  );
}

/** Placeholder card matching the real row's geometry, so the list doesn't jump
 * when the two family queries resolve. */
function SkeletonRow() {
  return (
    <View className="mb-3 flex-row items-center rounded-2xl border border-cream-300 bg-white p-4">
      <View className="h-12 w-12 rounded-full bg-cream-200" />
      <View className="ml-3 flex-1">
        <View className="h-3 rounded-full bg-cream-200" style={{ width: '55%' }} />
        <View className="mt-2 h-2.5 rounded-full bg-cream-200" style={{ width: '35%' }} />
      </View>
      <ActivityIndicator size="small" color={colors.brand[500]} />
    </View>
  );
}
