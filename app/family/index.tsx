import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
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
  ResultList,
  ScreenHeader,
  SectionHeader,
  SegmentedTabs,
  StatusBadge,
  formatDate,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { Avatar } from '@/components/core/shared';
import {
  AccessBadge,
  LoadingCard,
  Notice,
  relationshipLabelOf,
  accessLabelOf,
} from '@/components/family/shared';
import { titleCase } from '@/components/health-id/model';
import {
  apiErrorMessage,
  classifyInviteContact,
  dependentIdentity,
  isDependentAdult,
  isFamilyNotServed,
  useAcceptInvitation,
  useCancelInvitation,
  useDeclineInvitation,
  useFamilyMembers,
  useIncomingInvitations,
  useInviteAdult,
  useOutgoingInvitations,
  useRegisterChild,
} from '@/lib/api/familyQueries';
import type { FamilyIncomingInvitation, FamilyOutgoingInvitation } from '@/lib/api/types';

/**
 * Family & Caregivers — the guardian's circle, in the OPES layout.
 *
 * Data: GET /mobile/family (links I hold), GET /mobile/family/invitations
 * (invitations I sent), GET /mobile/family/invitations/incoming (invitations
 * addressed to me — the older relative's side), POST /mobile/family (add a
 * child), POST /mobile/family/invitations (invite an adult), DELETE
 * /mobile/family/invitations/{id}, POST …/{id}/accept|decline. Backend:
 * App\Http\Controllers\Api\Mobile\MobileFamilyController.
 *
 * Two genuinely different ways in, kept as a deliberate choice rather than one
 * blob of fields:
 *  - **Add a child** — under 18, in my care. Mints a real Patient + Health ID
 *    and links it to me at once. A DOB of 18+ is refused by the server
 *    (422 `dependent_is_adult`) and the screen turns that into the invite path.
 *  - **Invite an adult** — someone who already holds a Health ID. Found by the
 *    exact Health ID, email or phone; they accept from their own account.
 *    Defaults to read-only, with both levels explained in plain words.
 *
 * Every member row opens app/family/[id].tsx — the dependent's card + records.
 * The avatar (photo or initials) is the identity representation here; the
 * anatomical hologram appears only inside the credential card on that screen.
 *
 * `relationship` is MY role toward THEM ("I am their parent") — the web
 * portal's definition, so the two surfaces store the same word.
 *
 * The cancel confirmation is the kit `Dialog`: `Alert.alert` is a no-op on
 * react-native-web, so a confirm there never happened at all.
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

// patients.sex on the server is constrained to these two; the payload type keeps 'other' for older servers.
const SEX_OPTIONS = ['male', 'female'] as const;
type SexOption = (typeof SEX_OPTIONS)[number];
const SEX_LABEL_KEYS: Record<SexOption, string> = {
  male: 'family.sexMale',
  female: 'family.sexFemale',
};

const ACCESS_OPTIONS = ['read_only', 'full'] as const;
type AccessOption = (typeof ACCESS_OPTIONS)[number];

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

type Mode = 'invite' | 'register';

export default function FamilyScreen() {
  usePrivateScreen();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const membersQuery = useFamilyMembers();
  const outgoingQuery = useOutgoingInvitations();
  const incomingQuery = useIncomingInvitations();
  const inviteAdult = useInviteAdult();
  const cancelInvitation = useCancelInvitation();
  const registerChild = useRegisterChild();
  const acceptInvitation = useAcceptInvitation();
  const declineInvitation = useDeclineInvitation();

  const [mode, setMode] = useState<Mode | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  /** Set when the server refused a registration because the person is 18+. */
  const [adultRefused, setAdultRefused] = useState(false);

  // Invite-an-adult form (POST /mobile/family/invitations).
  const [contact, setContact] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('child');
  const [inviteAccess, setInviteAccess] = useState<AccessOption>('read_only');

  // Add-a-child form (POST /mobile/family — a brand-new Patient with no
  // account of their own).
  const [depFirstName, setDepFirstName] = useState('');
  const [depLastName, setDepLastName] = useState('');
  const [depDob, setDepDob] = useState('');
  const [depSex, setDepSex] = useState<SexOption | null>(null);
  const [depRelationship, setDepRelationship] = useState<Relationship>('parent');
  const [depBloodGroup, setDepBloodGroup] = useState('');
  const [depAccess, setDepAccess] = useState<AccessOption>('full');

  const members = useMemo(
    () =>
      (membersQuery.data ?? []).filter(
        (m) => !m.is_pending && m.status !== 'pending_invite' && m.patient,
      ),
    [membersQuery.data],
  );
  const invitations = outgoingQuery.data ?? [];
  // A server without the incoming route answers 404: that is "no section",
  // not "no invitations" — and never an error banner over the whole screen.
  const incomingUnavailable = incomingQuery.isError && isFamilyNotServed(incomingQuery.error);
  const incoming = incomingUnavailable ? [] : incomingQuery.data ?? [];

  const refreshing = membersQuery.isRefetching || outgoingQuery.isRefetching;
  const initialLoading =
    (membersQuery.isLoading && !membersQuery.data) ||
    (outgoingQuery.isLoading && !outgoingQuery.data);
  const hasLoadError = membersQuery.isError || outgoingQuery.isError;

  const onRefresh = useCallback(() => {
    membersQuery.refetch();
    outgoingQuery.refetch();
    incomingQuery.refetch();
  }, [membersQuery, outgoingQuery, incomingQuery]);

  const closeForm = useCallback(() => {
    setMode(null);
    setFormError(null);
  }, []);

  const openForm = useCallback((next: Mode) => {
    setMode(next);
    setFormError(null);
    setSuccessMessage(null);
    setAdultRefused(false);
  }, []);

  /** The 18+ refusal hands the typed relationship over to the invite form. */
  const switchToInvite = useCallback(() => {
    setRelationship(depRelationship);
    setInviteAccess('read_only');
    setAdultRefused(false);
    openForm('invite');
  }, [depRelationship, openForm]);

  const handleInviteAdult = async () => {
    setFormError(null);
    setSuccessMessage(null);
    if (!contact.trim()) {
      setFormError(t('family.contactRequired'));
      return;
    }
    if (classifyInviteContact(contact) === null) {
      setFormError(t('family.contactInvalid'));
      return;
    }
    try {
      await inviteAdult.mutateAsync({
        contact: contact.trim(),
        relationship,
        access_level: inviteAccess,
      });
      setContact('');
      setRelationship('child');
      setInviteAccess('read_only');
      setMode(null);
      setSuccessMessage(t('family.invitationSent'));
    } catch (err) {
      setFormError(apiErrorMessage(err, t('family.invitationFailed')));
    }
  };

  const handleRegisterChild = async () => {
    setFormError(null);
    setSuccessMessage(null);
    setAdultRefused(false);
    if (!depFirstName.trim()) {
      setFormError(t('family.firstNameRequired'));
      return;
    }
    if (!depLastName.trim()) {
      setFormError(t('family.lastNameRequired'));
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
      await registerChild.mutateAsync({
        first_name: depFirstName.trim(),
        last_name: depLastName.trim(),
        date_of_birth: depDob,
        sex: depSex,
        relationship: depRelationship,
        access_level: depAccess,
        ...(depBloodGroup.trim() ? { blood_group: depBloodGroup.trim().toUpperCase() } : {}),
      });
      setDepFirstName('');
      setDepLastName('');
      setDepDob('');
      setDepSex(null);
      setDepRelationship('parent');
      setDepBloodGroup('');
      setDepAccess('full');
      setMode(null);
      setSuccessMessage(t('family.dependentRegistered'));
    } catch (err) {
      if (isDependentAdult(err)) {
        // Not an error the guardian can fix by retyping: the person is an
        // adult, and an adult is invited, not registered.
        setAdultRefused(true);
        return;
      }
      setFormError(apiErrorMessage(err, t('family.dependentRegisterFailed')));
    }
  };

  const handleCancelInvitation = useCallback(
    (invitation: FamilyOutgoingInvitation) => {
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
              apiErrorMessage(err, t('family.cancelInviteFailed')),
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

  const decideIncoming = useCallback(
    async (invitation: FamilyIncomingInvitation, decision: 'accept' | 'decline') => {
      setDecidingId(invitation.id);
      setSuccessMessage(null);
      try {
        if (decision === 'accept') {
          await acceptInvitation.mutateAsync(invitation.id);
          setSuccessMessage(t('family.incoming.accepted'));
        } else {
          await declineInvitation.mutateAsync(invitation.id);
          setSuccessMessage(t('family.incoming.declined'));
        }
      } catch (err) {
        dialog.alert(t('family.error'), apiErrorMessage(err, t('family.incoming.failed')), 'critical');
      } finally {
        setDecidingId(null);
      }
    },
    [acceptInvitation, declineInvitation, dialog, t],
  );

  const fieldIcon = (name: IconName) => <Icon name={name} size={18} color={colors.blue} />;

  const contactKind = classifyInviteContact(contact);
  const contactIcon: IconName =
    contactKind === 'health_id' ? 'id-card' : contactKind === 'phone' ? 'phone' : 'mail';

  const accessOptions = ACCESS_OPTIONS.map((key) => ({ key, label: accessLabelOf(t, key) }));

  const relationshipChips = (value: Relationship, onChange: (next: Relationship) => void) => (
    <>
      <Text style={styles.fieldLabel}>{t('family.relationshipHint')}</Text>
      <View style={styles.chipWrap}>
        {RELATIONSHIP_OPTIONS.map((option) => (
          <Chip
            key={option}
            label={t(`family.relationships.${option}`)}
            selected={value === option}
            onPress={() => onChange(option)}
            accessibilityLabel={`${t('family.relationshipLabel')} ${t(
              `family.relationships.${option}`,
            )}`}
          />
        ))}
      </View>
    </>
  );

  const accessPicker = (value: AccessOption, onChange: (next: AccessOption) => void) => (
    <>
      <Text style={styles.fieldLabel}>{t('family.accessLevelLabel')}</Text>
      <SegmentedTabs
        variant="pill"
        value={value}
        onChange={(key) => onChange(key === 'full' ? 'full' : 'read_only')}
        options={accessOptions}
        style={styles.pickerTight}
      />
      <Text style={styles.helpText}>
        {value === 'full' ? t('family.access.fullExplain') : t('family.access.readOnlyExplain')}
      </Text>
    </>
  );

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
              <Icon name="users" size={24} color={colors.blue} />
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

        {/* ── Invitations addressed to me (the dependent's side) ────────── */}
        {incoming.length > 0 ? (
          <View>
            <SectionHeader title={t('family.incoming.title')} variant="overline" />
            <ResultList>
              <Text style={styles.introStandalone}>{t('family.incoming.explain')}</Text>
              {incoming.map((invitation) => {
                const busy = decidingId === invitation.id;
                const guardian =
                  (invitation.guardian_name ?? '').trim() || t('family.incoming.unknownGuardian');
                return (
                  <Card key={invitation.id} variant="flush">
                    <ListRow
                      leading={<Avatar name={guardian} size={40} />}
                      title={guardian}
                      meta={[
                        relationshipLabelOf(t, invitation.relationship),
                        t('family.incoming.requested', {
                          access: accessLabelOf(t, invitation.access_level),
                        }),
                        invitation.expires_at
                          ? t('family.expiresOn', {
                              date: formatDate(invitation.expires_at, t('opesCore.common.none')),
                            })
                          : undefined,
                      ]}
                      chevron={false}
                      divider={false}
                    />
                    <View style={styles.decisionRow}>
                      <TouchableOpacity
                        onPress={() => void decideIncoming(invitation, 'decline')}
                        disabled={busy}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={t('family.incoming.decline')}
                        accessibilityState={{ disabled: busy, busy }}
                        style={[styles.decisionButton, styles.decisionDecline, busy && styles.busy]}
                      >
                        <Icon name="close" size={16} color={colors.statusCritical} />
                        <Text style={[styles.decisionText, { color: colors.statusCritical }]}>
                          {t('family.incoming.decline')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void decideIncoming(invitation, 'accept')}
                        disabled={busy}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={t('family.incoming.accept')}
                        accessibilityState={{ disabled: busy, busy }}
                        style={[styles.decisionButton, styles.decisionAccept, busy && styles.busy]}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color={colors.textOnBrand} />
                        ) : (
                          <Icon name="check" size={16} color={colors.textOnBrand} />
                        )}
                        <Text style={[styles.decisionText, { color: colors.textOnBrand }]}>
                          {t('family.incoming.accept')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                );
              })}
            </ResultList>
          </View>
        ) : null}

        {/* ── Add someone to the circle ─────────────────────────────────── */}
        <View>
          <SectionHeader title={t('family.addTitle')} variant="overline" />

          {mode === null ? (
            <Card variant="flush">
              <Text style={styles.cardIntro}>{t('family.addDesc')}</Text>
              <ListRow
                icon="baby"
                tint="purple"
                title={t('family.addChildTitle')}
                subtitle={t('family.addChildDesc')}
                onPress={() => openForm('register')}
                divider
              />
              <ListRow
                icon="person-search"
                tint="blue"
                title={t('family.inviteAdultTitle')}
                subtitle={t('family.inviteAdultDesc')}
                onPress={() => openForm('invite')}
              />
            </Card>
          ) : (
            <Card>
              <View style={styles.formHead}>
                <View style={styles.formCircle}>
                  <Icon
                    name={mode === 'invite' ? 'person-search' : 'baby'}
                    size={24}
                    color={colors.tintBlue}
                  />
                </View>
                <View style={styles.formHeadText}>
                  <Text style={styles.formTitle}>
                    {mode === 'invite' ? t('family.inviteAdultTitle') : t('family.addChildTitle')}
                  </Text>
                  <Text style={styles.formBody}>
                    {mode === 'invite' ? t('family.inviteHint') : t('family.registerHint')}
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
                  <Text style={styles.fieldLabel}>{t('family.contactLabelFull')}</Text>
                  <PillInput
                    icon={fieldIcon(contactIcon)}
                    placeholder={t('family.contactPlaceholderFull')}
                    value={contact}
                    onChangeText={setContact}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="default"
                    accessibilityLabel={t('family.contactLabelFull')}
                  />

                  {relationshipChips(relationship, setRelationship)}
                  {accessPicker(inviteAccess, setInviteAccess)}

                  {formError ? (
                    <Notice tone="critical" icon="alert-triangle" text={formError} spaced />
                  ) : null}

                  <GradientButton
                    label={t('family.sendInvite')}
                    onPress={() => void handleInviteAdult()}
                    loading={inviteAdult.isPending}
                    icon="none"
                    style={styles.submit}
                  />
                </View>
              ) : (
                <View style={styles.formBodyWrap}>
                  <Text style={styles.fieldLabel}>{t('family.firstNameLabel')}</Text>
                  <PillInput
                    icon={fieldIcon('person')}
                    placeholder={t('family.firstNamePlaceholder')}
                    value={depFirstName}
                    onChangeText={setDepFirstName}
                    autoCapitalize="words"
                    accessibilityLabel={t('family.firstNameLabel')}
                  />

                  <Text style={styles.fieldLabel}>{t('family.lastNameLabel')}</Text>
                  <PillInput
                    icon={fieldIcon('person')}
                    placeholder={t('family.lastNamePlaceholder')}
                    value={depLastName}
                    onChangeText={setDepLastName}
                    autoCapitalize="words"
                    accessibilityLabel={t('family.lastNameLabel')}
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
                    onChange={(key) =>
                      setDepSex(key === 'female' ? 'female' : 'male')
                    }
                    options={SEX_OPTIONS.map((option) => ({
                      key: option,
                      label: t(SEX_LABEL_KEYS[option]),
                    }))}
                    style={styles.picker}
                  />

                  {relationshipChips(depRelationship, setDepRelationship)}

                  <Text style={styles.fieldLabel}>{t('family.bloodGroupLabel')}</Text>
                  <PillInput
                    icon={fieldIcon('droplet')}
                    placeholder={t('family.bloodGroupPlaceholder')}
                    value={depBloodGroup}
                    onChangeText={setDepBloodGroup}
                    autoCapitalize="characters"
                    accessibilityLabel={t('family.bloodGroupLabel')}
                  />

                  {accessPicker(depAccess, setDepAccess)}

                  {/* This creates a real patient record — the warning stays. */}
                  <Notice tone="warning" icon="baby" text={t('family.registerNotice')} spaced />

                  {adultRefused ? (
                    <View style={styles.adultBlock}>
                      <Notice tone="info" icon="info" text={t('family.adultBody')} />
                      <GradientButton
                        label={t('family.adultAction')}
                        onPress={switchToInvite}
                        icon="none"
                        style={styles.submit}
                      />
                    </View>
                  ) : null}

                  {formError ? (
                    <Notice tone="critical" icon="alert-triangle" text={formError} spaced />
                  ) : null}

                  <GradientButton
                    label={t('family.registerDependent')}
                    onPress={() => void handleRegisterChild()}
                    loading={registerChild.isPending}
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
                actionLabel={t('family.addChildTitle')}
                onAction={() => openForm('register')}
              />
            </Card>
          ) : (
            <ResultList>
              {members.map((member) => {
                const who = dependentIdentity(member);
                const name = who.name || t('family.member.title');
                const ageLabel = who.age != null ? t('family.age', { age: who.age }) : undefined;
                const statusLabel = who.statusKey
                  ? t(`healthId.statusValues.${who.statusKey}`, {
                      defaultValue: titleCase(who.statusKey),
                    })
                  : undefined;
                return (
                  <Card key={member.id} variant="flush">
                    <ListRow
                      leading={<Avatar name={name} size={40} uri={who.photoUrl} />}
                      title={name}
                      meta={[relationshipLabelOf(t, member.relationship), ageLabel, statusLabel]}
                      divider={false}
                      onPress={() => router.push(`/family/${member.id}`)}
                      accessibilityHint={t('family.viewMemberHint')}
                      trailing={<AccessBadge level={member.access_level} />}
                    />
                  </Card>
                );
              })}
            </ResultList>
          )}
        </View>

        {/* ── Invitations I sent ────────────────────────────────────────── */}
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
            <ResultList>
              {invitations.map((invitation) => {
                const busy = cancellingId === invitation.id;
                const expires = t('family.expiresOn', {
                  date: formatDate(invitation.expires_at, t('opesCore.common.none')),
                });
                return (
                  <Card key={invitation.id} variant="flush">
                    <ListRow
                      icon="clock"
                      tint="amber"
                      title={invitation.contact}
                      meta={[relationshipLabelOf(t, invitation.relationship), expires]}
                      divider={false}
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
                            style={[styles.cancelButton, busy && styles.busy]}
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
                  </Card>
                );
              })}
            </ResultList>
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

    // The same intro, standing outside a card in a ResultList: the list gap
    // supplies the space the card padding used to.
    introStandalone: {
      paddingHorizontal: spacing.xs,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
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
    helpText: {
      marginTop: -spacing.xs,
      marginBottom: spacing.md,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    picker: { marginBottom: spacing.md },
    pickerTight: { marginBottom: spacing.sm },
    submit: { marginTop: spacing.sm },
    adultBlock: { marginBottom: spacing.md, gap: spacing.xs },

    // Rows
    inviteTrailing: { alignItems: 'flex-end', gap: spacing.sm },
    cancelButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    busy: { opacity: 0.5 },

    // Incoming decision buttons
    decisionRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    decisionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 40,
      borderRadius: 20,
    },
    decisionDecline: { backgroundColor: colors.statusCriticalBg },
    decisionAccept: { backgroundColor: colors.blue },
    decisionText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
  });
