import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  SectionHeader,
  SegmentedTabs,
  StatusBadge,
  formatDate,
  initialsFrom,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import {
  useCancelFamilyInvitation,
  useFamilyInvitations,
  useFamilyMembers,
  useRegisterDependent,
  useSendFamilyInvitation,
  type FamilyInvitation,
} from '../../lib/api/queries';

/**
 * Family & Caregivers — linked members + invitations, in the OPES layout.
 *
 * GET /mobile/family (active + pending links), GET/POST
 * /mobile/family/invitations, DELETE /mobile/family/invitations/{id}.
 * Backend: App\Http\Controllers\Api\Mobile\MobileFamilyController.
 *
 * Presentation only in this pass: `ScreenHeader`, a care-circle summary
 * `Card`, overline `SectionHeader`s over `Card variant="flush"` lists of
 * `ListRow`s, `StatusBadge` for the invitation and access-level state,
 * `GradientButton` to submit, kit `EmptyState`s and the kit `Dialog` for the
 * cancel-invitation confirm. Every query, mutation, validation rule and error
 * string the previous version had is still here.
 *
 * Two genuinely different actions share this screen, so they stay a deliberate
 * choice rather than a segmented control over one blob of fields: inviting an
 * *existing* OpesCare patient by contact, and registering a brand-new
 * dependent (which mints a real Patient + Health ID).
 *
 * The cancel confirmation moved from `Alert.alert` to the kit `Dialog`:
 * `Alert.alert` is a no-op on react-native-web, so on the web build the
 * confirmation — and therefore the cancellation — never happened at all.
 */

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

type Relationship = (typeof RELATIONSHIP_OPTIONS)[number];

const SEX_OPTIONS = ['male', 'female'] as const;
type SexOption = (typeof SEX_OPTIONS)[number];
const SEX_LABEL_KEYS: Record<SexOption, string> = {
  male: 'family.sexMale',
  female: 'family.sexFemale',
};

/** Access level → badge tone. `full` is the strongest grant, so it reads as
 * the "active/complete" tone; `view_only` is the weakest and stays neutral. */
const ACCESS_TONE: Record<string, StatusTone> = {
  full: 'normal',
  guardian: 'pending',
  view_only: 'neutral',
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

/** One rule for initials app-wide — titles and punctuation are not initials. */
function initialsOf(name: string): string {
  return initialsFrom(name);
}

type Mode = 'invite' | 'register';

export default function FamilyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const membersQuery = useFamilyMembers();
  const invitationsQuery = useFamilyInvitations();
  const sendInvitation = useSendFamilyInvitation();
  const cancelInvitation = useCancelFamilyInvitation();
  const registerDependent = useRegisterDependent();

  const [mode, setMode] = useState<Mode | null>(null);
  const [contact, setContact] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('parent');
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Register-a-dependent form (POST /mobile/family — a brand-new Patient with
  // no account of their own, e.g. a child), distinct from the invite-by-contact
  // form which links an *existing* OpesCare patient.
  const [depFullName, setDepFullName] = useState('');
  const [depDob, setDepDob] = useState('');
  const [depSex, setDepSex] = useState<SexOption | null>(null);
  const [depRelationship, setDepRelationship] = useState<Relationship>('child');
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

  const onRefresh = useCallback(() => {
    membersQuery.refetch();
    invitationsQuery.refetch();
  }, [membersQuery, invitationsQuery]);

  const closeForm = useCallback(() => {
    setMode(null);
    setFormError(null);
  }, []);

  const openForm = useCallback((next: Mode) => {
    setMode(next);
    setFormError(null);
    setSuccessMessage(null);
  }, []);

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

  const handleCancelInvitation = useCallback(
    (invitation: FamilyInvitation) => {
      dialog.confirm({
        title: t('family.cancelInviteTitle'),
        message: t('family.cancelInviteBody', { contact: invitation.contact }),
        confirmLabel: t('family.cancelInviteConfirm'),
        cancelLabel: t('family.dismiss'),
        destructive: true,
        onConfirm: async () => {
          setCancellingId(invitation.id);
          try {
            await cancelInvitation.mutateAsync(invitation.id);
          } catch (err) {
            // Never rethrow into the sheet: the dialog runner has no catch, so
            // a rejected confirm would surface as an unhandled rejection
            // instead of a message the patient can read.
            dialog.alert(
              t('family.error'),
              extractErrorMessage(err, t('family.cancelInviteFailed')),
              'critical',
            );
          } finally {
            setCancellingId(null);
          }
        },
      });
    },
    [cancelInvitation, dialog, t],
  );

  const fieldIcon = (name: IconName) => <Icon name={name} size={18} color={colors.blue} />;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('family.title')}
        subtitle={t('family.subtitle')}
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.blue}
            colors={[colors.blue]}
          />
        }
      >
        {/* ── Care-circle summary ───────────────────────────────────────── */}
        <Card>
          <View style={styles.summaryHead}>
            <View style={styles.summaryCircle}>
              <Icon name="users" size={20} color={colors.blue} />
            </View>
            <View style={styles.summaryText}>
              <Text style={styles.summaryTitle}>{t('family.summaryTitle')}</Text>
              <Text style={styles.summaryDesc}>{t('family.summaryDesc')}</Text>
            </View>
          </View>

          <View style={styles.stats}>
            <SummaryStat
              label={t('family.summaryLinked')}
              value={initialLoading ? '…' : String(members.length)}
            />
            <View style={styles.statDivider} />
            <SummaryStat
              label={t('family.summaryPending')}
              value={initialLoading ? '…' : String(invitations.length)}
            />
          </View>
        </Card>

        {hasLoadError ? (
          <Notice
            tone="critical"
            icon="alert-triangle"
            text={t('family.loadFailed')}
            actionLabel={t('family.retry')}
            onAction={onRefresh}
          />
        ) : null}

        {/* ── Add someone to the circle ─────────────────────────────────── */}
        <View>
          <SectionHeader title={t('family.addTitle')} variant="overline" />

          {mode === null ? (
            <Card variant="flush">
              <Text style={styles.cardIntro}>{t('family.addDesc')}</Text>
              <ListRow
                icon="person-search"
                tint="blue"
                title={t('family.optionInviteTitle')}
                subtitle={t('family.optionInviteDesc')}
                onPress={() => openForm('invite')}
                divider
              />
              <ListRow
                icon="baby"
                tint="purple"
                title={t('family.optionRegisterTitle')}
                subtitle={t('family.optionRegisterDesc')}
                onPress={() => openForm('register')}
              />
            </Card>
          ) : (
            <Card>
              <View style={styles.formHead}>
                <View
                  style={[
                    styles.formCircle,
                    mode === 'register' && { backgroundColor: colors.tintPurpleBg },
                  ]}
                >
                  <Icon
                    name={mode === 'invite' ? 'person-search' : 'baby'}
                    size={20}
                    color={mode === 'invite' ? colors.tintBlue : colors.tintPurple}
                  />
                </View>
                <View style={styles.formHeadText}>
                  <Text style={styles.formTitle}>
                    {mode === 'invite'
                      ? t('family.optionInviteTitle')
                      : t('family.optionRegisterTitle')}
                  </Text>
                  <Text style={styles.formBody}>
                    {mode === 'invite' ? t('family.tabInviteHint') : t('family.tabRegisterHint')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeForm}
                  hitSlop={10}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('family.cancel')}
                  style={styles.formClose}
                >
                  <Icon name="close" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {mode === 'invite' ? (
                <View style={styles.formBodyWrap}>
                  <Text style={styles.fieldLabel}>{t('family.contactLabel')}</Text>
                  <PillInput
                    icon={fieldIcon(contact.includes('@') ? 'mail' : 'phone')}
                    placeholder={t('family.contactPlaceholder')}
                    value={contact}
                    onChangeText={setContact}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    accessibilityLabel={t('family.contactLabel')}
                  />

                  <Text style={styles.fieldLabel}>{t('family.relationshipLabel')}</Text>
                  <View style={styles.chipWrap}>
                    {RELATIONSHIP_OPTIONS.map((option) => (
                      <Chip
                        key={option}
                        label={t(`family.relationships.${option}`)}
                        selected={relationship === option}
                        onPress={() => setRelationship(option)}
                        accessibilityLabel={`${t('family.relationshipLabel')} ${t(
                          `family.relationships.${option}`,
                        )}`}
                      />
                    ))}
                  </View>

                  {formError ? (
                    <Notice tone="critical" icon="alert-triangle" text={formError} spaced />
                  ) : null}

                  <GradientButton
                    label={t('family.sendInvite')}
                    onPress={() => void handleSendInvitation()}
                    loading={sendInvitation.isPending}
                    icon="none"
                    style={styles.submit}
                  />
                </View>
              ) : (
                <View style={styles.formBodyWrap}>
                  <Text style={styles.fieldLabel}>{t('family.fullNameLabel')}</Text>
                  <PillInput
                    icon={fieldIcon('person')}
                    placeholder={t('family.fullNamePlaceholder')}
                    value={depFullName}
                    onChangeText={setDepFullName}
                    autoCapitalize="words"
                    accessibilityLabel={t('family.fullNameLabel')}
                  />

                  <Text style={styles.fieldLabel}>{t('family.dateOfBirth')}</Text>
                  <PillInput
                    icon={fieldIcon('calendar')}
                    placeholder={t('family.dateOfBirthPlaceholder')}
                    value={depDob}
                    onChangeText={(v) => setDepDob(formatDobInput(v))}
                    keyboardType="number-pad"
                    maxLength={10}
                    accessibilityLabel={t('family.dateOfBirth')}
                  />

                  <Text style={styles.fieldLabel}>{t('family.sexLabel')}</Text>
                  <SegmentedTabs
                    variant="pill"
                    value={depSex ?? ''}
                    onChange={(key) => setDepSex(key === 'female' ? 'female' : 'male')}
                    options={SEX_OPTIONS.map((option) => ({
                      key: option,
                      label: t(SEX_LABEL_KEYS[option]),
                    }))}
                    style={styles.picker}
                  />

                  <Text style={styles.fieldLabel}>{t('family.relationshipLabel')}</Text>
                  <View style={styles.chipWrap}>
                    {RELATIONSHIP_OPTIONS.map((option) => (
                      <Chip
                        key={option}
                        label={t(`family.relationships.${option}`)}
                        selected={depRelationship === option}
                        onPress={() => setDepRelationship(option)}
                        accessibilityLabel={`${t('family.relationshipLabel')} ${t(
                          `family.relationships.${option}`,
                        )}`}
                      />
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>{t('family.bloodGroupLabel')}</Text>
                  <PillInput
                    icon={fieldIcon('droplet')}
                    placeholder={t('family.bloodGroupPlaceholder')}
                    value={depBloodGroup}
                    onChangeText={setDepBloodGroup}
                    autoCapitalize="characters"
                    accessibilityLabel={t('family.bloodGroupLabel')}
                  />

                  <Text style={styles.fieldLabel}>{t('family.phoneLabel')}</Text>
                  <PillInput
                    icon={fieldIcon('phone')}
                    placeholder={t('family.phonePlaceholder')}
                    value={depPhone}
                    onChangeText={setDepPhone}
                    keyboardType="phone-pad"
                    accessibilityLabel={t('family.phoneLabel')}
                  />

                  {/* This creates a real patient record — the warning stays. */}
                  <Notice tone="warning" icon="baby" text={t('family.registerNotice')} spaced />

                  {formError ? (
                    <Notice tone="critical" icon="alert-triangle" text={formError} spaced />
                  ) : null}

                  <GradientButton
                    label={t('family.registerDependent')}
                    onPress={() => void handleRegisterDependent()}
                    loading={registerDependent.isPending}
                    icon="none"
                    style={styles.submit}
                  />
                </View>
              )}
            </Card>
          )}
        </View>

        {successMessage ? (
          <Notice tone="normal" icon="check-circle" text={successMessage} />
        ) : null}

        {/* ── Linked members ────────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('family.linkedMembers')} variant="overline" />
          {initialLoading ? (
            <LoadingCard label={t('opesCore.common.loading')} />
          ) : members.length === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="users"
                tint="blue"
                title={t('family.linkedMembers')}
                message={t('family.noMembers')}
                actionLabel={t('family.optionInviteTitle')}
                onAction={() => openForm('invite')}
              />
            </Card>
          ) : (
            <Card variant="flush">
              {members.map((member, index) => {
                const name = member.patient?.full_name ?? '—';
                const relationshipLabel = t(`family.relationships.${member.relationship}`, {
                  defaultValue: member.relationship,
                });
                const ageLabel =
                  member.patient?.age != null
                    ? t('family.age', { age: member.patient.age })
                    : undefined;
                const healthId = member.patient?.health_id
                  ? `${t('family.healthIdLabel')} ${member.patient.health_id}`
                  : undefined;
                const accessLabel = t(`family.accessLevels.${member.access_level}`, {
                  defaultValue: member.access_level,
                });
                return (
                  <ListRow
                    key={member.id}
                    leading={<Avatar initials={initialsOf(name)} />}
                    title={name}
                    meta={[relationshipLabel, ageLabel, healthId]}
                    divider={index < members.length - 1}
                    chevron={false}
                    trailing={
                      <StatusBadge
                        status={member.access_level}
                        tone={ACCESS_TONE[member.access_level] ?? 'neutral'}
                        label={accessLabel}
                        size="sm"
                      />
                    }
                  />
                );
              })}
            </Card>
          )}
        </View>

        {/* ── Pending invitations ───────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('family.pendingInvitations')} variant="overline" />
          {initialLoading ? (
            <LoadingCard label={t('opesCore.common.loading')} />
          ) : invitations.length === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="mail"
                tint="green"
                title={t('family.pendingInvitations')}
                message={t('family.noPendingInvitations')}
              />
            </Card>
          ) : (
            <Card variant="flush">
              {invitations.map((invitation, index) => {
                const busy = cancellingId === invitation.id;
                const relationshipLabel = t(`family.relationships.${invitation.relationship}`, {
                  defaultValue: invitation.relationship,
                });
                const expires = t('family.expiresOn', {
                  date: formatDate(invitation.expires_at, t('opesCore.common.none')),
                });
                return (
                  <ListRow
                    key={invitation.id}
                    icon="clock"
                    tint="amber"
                    title={invitation.contact}
                    meta={[relationshipLabel, expires]}
                    divider={index < invitations.length - 1}
                    chevron={false}
                    trailing={
                      <View style={styles.inviteTrailing}>
                        <StatusBadge
                          status="pending"
                          tone="pending"
                          label={t('opesCore.home.statusPending')}
                          size="sm"
                        />
                        <TouchableOpacity
                          onPress={() => handleCancelInvitation(invitation)}
                          disabled={busy}
                          hitSlop={8}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={t('family.cancelInviteConfirm')}
                          accessibilityState={{ disabled: busy, busy }}
                          style={[styles.cancelButton, busy && styles.cancelButtonBusy]}
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color={colors.statusCritical} />
                          ) : (
                            <Icon name="close" size={16} color={colors.statusCritical} />
                          )}
                        </TouchableOpacity>
                      </View>
                    }
                  />
                );
              })}
            </Card>
          )}
        </View>
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function SummaryStat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Initials disc, used as the `leading` slot of a member row. */
function Avatar({ initials }: { initials: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
}

/** Tinted inline notice, optionally with a retry affordance. */
function Notice({
  tone,
  icon,
  text,
  actionLabel,
  onAction,
  spaced,
}: {
  tone: StatusTone;
  icon: IconName;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Adds the bottom gap needed when the notice sits inside a form card. */
  spaced?: boolean;
}) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = statusMap[tone];
  return (
    <View
      style={[styles.notice, spaced && styles.noticeSpaced, { backgroundColor: skin.bg }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon name={icon} size={16} color={skin.fg} />
      <Text style={[styles.noticeText, { color: skin.fg }]}>{text}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={styles.noticeAction}
        >
          <Text style={[styles.noticeActionText, { color: skin.fg }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Placeholder while the two family queries resolve. */
function LoadingCard({ label }: { label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card>
      <View style={styles.loading} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.blue} />
        <Text style={styles.loadingText}>{label}</Text>
      </View>
    </Card>
  );
}

// ── Styles (colour-dependent, built per palette) ───────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },

    // Summary card
    summaryHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    summaryCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.tintBlueBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryText: { flex: 1, minWidth: 0 },
    summaryTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    summaryDesc: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    stats: {
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      paddingTop: spacing.md,
    },
    stat: { flex: 1, minWidth: 0 },
    statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.divider },
    statValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      color: colors.textPrimary,
    },
    statLabel: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },

    // Add-someone card
    cardIntro: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    formHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
    formCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.tintBlueBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formHeadText: { flex: 1, minWidth: 0 },
    formTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    formBody: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    formClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formBodyWrap: { marginTop: spacing.md },

    // Fields
    fieldLabel: {
      marginBottom: 6,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    picker: { marginBottom: spacing.md },
    submit: { marginTop: spacing.sm },

    // Rows
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      color: colors.blue,
    },
    inviteTrailing: { alignItems: 'flex-end', gap: spacing.sm },
    cancelButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.statusCriticalBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButtonBusy: { opacity: 0.5 },

    // Notices
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm + 4,
      borderRadius: radii.md,
    },
    /** Inside a form card the notice needs its own gap; the screen's
     *  ScrollView already supplies one between top-level blocks. */
    noticeSpaced: { marginBottom: spacing.md },
    noticeText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
    },
    noticeAction: {
      borderRadius: radii.pill,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.xs,
      backgroundColor: colors.surface,
    },
    noticeActionText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
    },

    // Loading
    loading: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
  });
