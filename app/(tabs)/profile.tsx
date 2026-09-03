import { Fragment, useMemo } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Calendar,
  ChevronRight,
  CloudOff,
  Download,
  Droplet,
  FileText,
  FolderOpen,
  HelpCircle,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  PhoneCall,
  QrCode,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { useAuthStore } from '../../lib/store/auth';
import { useFamilyMembers } from '../../lib/api/queries';
import { colors } from '../../theme/tokens';

/** Formats an ISO date string ("1985-03-14") into a locale-aware short date,
 * falling back to the not-provided copy when missing/unparsable. */
function formatDate(value: string | null, locale: string, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const patient = useAuthStore((s) => s.patient);
  const logout = useAuthStore((s) => s.logout);

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

  const confirmSignOut = () => {
    Alert.alert(t('profile.signOutConfirmTitle'), t('profile.signOutConfirmBody'), [
      { text: t('profile.signOutConfirmCancel'), style: 'cancel' },
      { text: t('profile.signOut'), style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const recordLinks: MenuItem[] = [
    {
      icon: QrCode,
      label: t('profile.healthIdCard'),
      description: t('profile.healthIdCardDesc'),
      onPress: () => router.push('/(tabs)/health-id'),
    },
    {
      icon: FileText,
      label: t('profile.recordsTimeline'),
      description: t('profile.recordsTimelineDesc'),
      onPress: () => router.push('/(tabs)/records'),
    },
    {
      icon: FolderOpen,
      label: t('profile.documents'),
      description: t('profile.documentsDesc'),
      onPress: () => router.push('/documents'),
    },
    {
      icon: Download,
      label: t('profile.downloadRecords'),
      description: t('profile.downloadRecordsDesc'),
      onPress: () => router.push('/export-records'),
    },
  ];

  const accountLinks: MenuItem[] = [
    {
      icon: Users,
      label: t('profile.family'),
      description: t('profile.familyDesc'),
      onPress: () => router.push('/family'),
    },
    {
      icon: MessageCircle,
      label: t('profile.messages'),
      description: t('profile.messagesDesc'),
      onPress: () => router.push('/(tabs)/messages'),
    },
    {
      icon: CloudOff,
      label: t('profile.offlineAccess'),
      description: t('profile.offlineAccessDesc'),
      onPress: () => router.push('/offline-access'),
    },
    {
      icon: SettingsIcon,
      label: t('profile.settings'),
      description: t('profile.settingsDesc'),
      onPress: () => router.push('/settings'),
    },
    {
      icon: HelpCircle,
      label: t('profile.helpSupport'),
      description: t('profile.helpSupportDesc'),
      onPress: () => router.push('/help'),
    },
  ];

  if (!patient) {
    return (
      <Screen>
        <View className="mt-2">
          <Text className="text-2xl font-extrabold text-navy-text">{t('profile.title')}</Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand[500]} />
          <Text className="mt-3 text-sm text-navy-secondary">{t('profile.loading')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="px-0">
      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        {/* Header — title left, labelled edit action right (reference anatomy) */}
        <View className="mt-2 flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-2xl font-extrabold text-navy-text">{t('profile.title')}</Text>
            <Text className="mt-1 text-sm text-navy-secondary">{t('profile.subtitle')}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/edit-profile')}
            accessibilityRole="button"
            accessibilityLabel={t('profile.editProfileAction')}
            hitSlop={6}
            className="flex-row items-center rounded-full border border-brand-300 bg-white px-3 py-2"
          >
            <Pencil size={14} color={colors.brand[600]} />
            <Text className="ml-1.5 text-xs font-bold text-brand-600">
              {t('profile.editProfileAction')}
            </Text>
          </Pressable>
        </View>

        {/* Identity card */}
        <View className="mt-5 rounded-3xl border border-cream-300 bg-white p-5">
          <View className="flex-row items-center">
            <View>
              <LinearGradient
                colors={[colors.brand[300], colors.brand[500], colors.brand[700]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 42,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  className="items-center justify-center rounded-full bg-cream-50"
                  style={{ width: 74, height: 74 }}
                >
                  <Text className="text-2xl font-extrabold text-brand-600">{initials}</Text>
                </View>
              </LinearGradient>
              {isVerified ? (
                <View
                  className="absolute h-7 w-7 items-center justify-center rounded-full"
                  style={{
                    right: -2,
                    bottom: -2,
                    backgroundColor: colors.semantic.success,
                    borderWidth: 2,
                    borderColor: colors.white,
                  }}
                >
                  <BadgeCheck size={13} color={colors.white} />
                </View>
              ) : null}
            </View>

            <View className="ml-4 flex-1">
              <Text className="text-xl font-extrabold text-navy-text" numberOfLines={2}>
                {fullName || '—'}
              </Text>
              <View
                className="mt-2 flex-row items-center self-start rounded-full px-2.5 py-1"
                style={{
                  backgroundColor: isVerified
                    ? colors.semantic.successSurface
                    : colors.semantic.warningSurface,
                }}
              >
                <BadgeCheck
                  size={12}
                  color={isVerified ? colors.semantic.success : colors.semantic.warning}
                />
                <Text
                  className="ml-1 text-xs font-semibold"
                  style={{
                    color: isVerified ? colors.semantic.success : colors.semantic.warning,
                  }}
                >
                  {statusLabel}
                </Text>
              </View>
            </View>
          </View>

          {/* Contact lines */}
          <View className="mt-4 border-t border-cream-300 pt-4">
            <ContactLine
              icon={Mail}
              value={patient.email}
              fallback={t('profile.notProvided')}
            />
            <View className="h-2" />
            <ContactLine
              icon={Phone}
              value={patient.phone}
              fallback={t('profile.notProvided')}
            />
          </View>

          {/* Health ID → the QR card, the reference's "Tap to view" panel */}
          <Pressable
            onPress={() => router.push('/(tabs)/health-id')}
            accessibilityRole="button"
            accessibilityLabel={t('profile.healthIdCard')}
            className="mt-4 flex-row items-center rounded-2xl bg-cream-100 p-3"
          >
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white">
              <QrCode size={21} color={colors.brand[600]} />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-[10px] font-bold uppercase tracking-wide text-navy-muted">
                {t('profile.healthId')}
              </Text>
              <Text className="mt-0.5 text-base font-extrabold text-brand-600" numberOfLines={1}>
                {patient.health_id || '—'}
              </Text>
              <Text className="mt-0.5 text-[11px] text-navy-secondary">
                {t('profile.tapToView')}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.navy.muted} />
          </Pressable>

          {/* Info grid */}
          <View className="mt-4 flex-row flex-wrap">
            <InfoItem
              icon={Calendar}
              label={t('profile.dateOfBirth')}
              value={formatDate(patient.dob, i18n.language, t('profile.notProvided'))}
            />
            <InfoItem icon={UserRound} label={t('profile.gender')} value={genderLabel} />
            <InfoItem
              icon={Droplet}
              label={t('profile.bloodGroup')}
              value={patient.blood_group ?? t('profile.notProvided')}
            />
            <InfoItem
              icon={MapPin}
              label={t('profile.location')}
              value={patient.address ?? t('profile.notProvided')}
            />
          </View>

          {/* Emergency contact — present, or an explicit invitation to add one */}
          {emergency?.name ? (
            <View className="mt-1 flex-row items-center rounded-2xl border border-cream-300 p-3">
              <View
                className="h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: colors.semantic.dangerSurface }}
              >
                <PhoneCall size={17} color={colors.semantic.danger} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-navy-muted">
                  {t('profile.emergencyContact')}
                </Text>
                <Text className="mt-0.5 text-sm font-bold text-navy-text" numberOfLines={1}>
                  {emergency.name}
                  {emergency.relationship ? ` · ${emergency.relationship}` : ''}
                </Text>
                {emergency.phone ? (
                  <Text className="text-xs text-navy-secondary">{emergency.phone}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => router.push('/edit-profile')}
                accessibilityRole="button"
                accessibilityLabel={t('profile.editProfileAction')}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-brand-50"
              >
                <Pencil size={15} color={colors.brand[600]} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => router.push('/edit-profile')}
              accessibilityRole="button"
              accessibilityLabel={t('profile.addEmergencyContact')}
              className="mt-1 flex-row items-center rounded-2xl border border-dashed border-brand-300 bg-brand-50 p-3"
            >
              <PhoneCall size={17} color={colors.brand[600]} />
              <View className="ml-3 flex-1">
                <Text className="text-sm font-bold text-navy-text">
                  {t('profile.addEmergencyContact')}
                </Text>
                <Text className="mt-0.5 text-xs text-navy-secondary">
                  {t('profile.addEmergencyContactHint')}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.brand[600]} />
            </Pressable>
          )}
        </View>

        {/* Stat tiles — every tile goes somewhere real */}
        <View className="mt-4 flex-row" style={{ gap: 12 }}>
          <StatTile
            icon={AlertTriangle}
            label={t('profile.allergies')}
            value={String(patient.allergies_count ?? 0)}
            hint={t('profile.allergiesHint')}
            onPress={() => router.push('/(tabs)/records')}
          />
          <StatTile
            icon={Activity}
            label={t('profile.conditions')}
            value={String(patient.conditions_count ?? 0)}
            hint={t('profile.conditionsHint')}
            onPress={() => router.push('/(tabs)/records')}
          />
        </View>
        <View className="mt-3 flex-row" style={{ gap: 12 }}>
          <StatTile
            icon={Users}
            label={t('profile.dependents')}
            value={familyQuery.isLoading && !familyQuery.data ? '…' : String(dependentCount)}
            hint={
              familyQuery.isError ? t('profile.dependentsUnavailable') : t('profile.dependentsHint')
            }
            onPress={() => router.push('/family')}
          />
          <StatTile
            icon={Sparkles}
            label={t('profile.profileStrength')}
            value={`${completeness.percent}%`}
            hint={
              completeness.filled === completeness.total
                ? t('profile.profileStrengthComplete')
                : t('profile.profileStrengthHint', {
                    missing: completeness.total - completeness.filled,
                  })
            }
            onPress={() => router.push('/edit-profile')}
          />
        </View>

        {/* Quick links — grouped, each row carries a description like the reference */}
        <SectionHeading label={t('profile.sectionRecord')} />
        <MenuCard items={recordLinks} />

        <SectionHeading label={t('profile.sectionAccount')} />
        <MenuCard items={accountLinks} />

        {/* Privacy note */}
        <Pressable
          onPress={() => router.push('/privacy')}
          accessibilityRole="button"
          accessibilityLabel={t('profile.privacyTitle')}
          className="mt-5 flex-row items-start rounded-2xl bg-brand-50 p-4"
        >
          <ShieldCheck size={17} color={colors.brand[600]} />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-semibold text-navy-text">
              {t('profile.privacyTitle')}
            </Text>
            <Text className="mt-1 text-xs text-navy-secondary">{t('profile.privacyBody')}</Text>
            <View className="mt-2 flex-row items-center">
              <Text className="text-xs font-bold text-brand-600">
                {t('profile.privacyLearnMore')}
              </Text>
              <ChevronRight size={14} color={colors.brand[600]} />
            </View>
          </View>
        </Pressable>

        {/* Sign out — destructive, and confirmed */}
        <Pressable
          onPress={confirmSignOut}
          accessibilityRole="button"
          accessibilityLabel={t('profile.signOut')}
          className="mt-6 h-14 flex-row items-center justify-center rounded-2xl border"
          style={{
            borderColor: colors.semantic.danger,
            backgroundColor: colors.semantic.dangerSurface,
          }}
        >
          <LogOut size={17} color={colors.semantic.danger} />
          <Text className="ml-2 font-bold" style={{ color: colors.semantic.danger }}>
            {t('profile.signOut')}
          </Text>
        </Pressable>

        <View className="h-10" />
      </ScrollView>
    </Screen>
  );
}

interface MenuItem {
  icon: LucideIcon;
  label: string;
  description: string;
  onPress: () => void;
}

function SectionHeading({ label }: { label: string }) {
  return (
    <Text className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-navy-muted">
      {label}
    </Text>
  );
}

function MenuCard({ items }: { items: MenuItem[] }) {
  return (
    <View className="overflow-hidden rounded-2xl border border-cream-300 bg-white">
      {items.map((item, index) => (
        <Fragment key={item.label}>
          <Pressable
            onPress={item.onPress}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            className="flex-row items-center px-4 py-3.5"
          >
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
              <item.icon size={18} color={colors.brand[600]} />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold text-navy-text">{item.label}</Text>
              <Text className="mt-0.5 text-xs text-navy-secondary" numberOfLines={2}>
                {item.description}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.navy.muted} />
          </Pressable>
          {index < items.length - 1 ? (
            <View className="h-px bg-cream-200" style={{ marginLeft: 64 }} />
          ) : null}
        </Fragment>
      ))}
    </View>
  );
}

function ContactLine({
  icon: Icon,
  value,
  fallback,
}: {
  icon: LucideIcon;
  value: string | null;
  fallback: string;
}) {
  return (
    <View className="flex-row items-center">
      <Icon size={15} color={colors.navy.muted} />
      <Text
        className={`ml-2 text-sm ${value ? 'text-navy-secondary' : 'text-navy-muted'}`}
        numberOfLines={1}
      >
        {value || fallback}
      </Text>
    </View>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <View className="mb-4" style={{ width: '50%' }}>
      <View className="flex-row items-center">
        <Icon size={13} color={colors.navy.muted} />
        <Text className="ml-1.5 text-xs text-navy-muted">{label}</Text>
      </View>
      <Text className="mt-1 pr-2 text-sm font-semibold text-navy-text" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      className="flex-1 rounded-2xl border border-cream-300 bg-white p-4"
    >
      <View className="flex-row items-center justify-between">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand-50">
          <Icon size={16} color={colors.brand[600]} />
        </View>
        <ChevronRight size={16} color={colors.navy.muted} />
      </View>
      <Text className="mt-3 text-2xl font-extrabold text-navy-text">{value}</Text>
      <Text className="text-xs font-semibold text-navy-text">{label}</Text>
      <Text className="mt-0.5 text-[11px] text-navy-muted" numberOfLines={2}>
        {hint}
      </Text>
    </Pressable>
  );
}
