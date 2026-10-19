/**
 * Front desk — register a walk-in patient (`/clinician/desk/register-patient`).
 *
 * `POST /mobile/desk/patients { first_name, last_name, date_of_birth, sex, phone? }`
 * → 201 `ProviderPatientSummary` with the NEW Health ID, minted through the
 * server's `PatientIdentityService`.
 *
 * ── THE RULES THIS SCREEN KEEPS ──────────────────────────────────────────
 *  1. IDENTITY IS THE SERVER'S DECISION. `409 duplicate_identity` means the
 *     person may already hold a Health ID. It is never retried, never
 *     bypassed: the screen explains and offers the exact lookup instead, so a
 *     second identity is not created for someone who has one.
 *  2. THE HEALTH ID IS THE DELIVERABLE. On success it is the biggest thing on
 *     the screen, with a copy button and a one-tap "Book appointment" that
 *     carries it into the booking form (`?health_id=`).
 *  3. NOTHING CLINICAL. Name, date of birth, sex, phone — what the summary
 *     returns is identity only, and that is all this screen shows.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGate } from '@/components/doctor/RoleGate';
import {
  Card,
  Chip,
  Icon,
  PillInput,
  ScreenHeader,
  SectionHeader,
  formatDate,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, NoticeBanner, describeFailure } from '@/components/care/shared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';
import {
  deskErrorMessage,
  deskFieldErrors,
  isDuplicateIdentity,
  isNotServed,
  isRoleForbidden,
  isValidationFailure,
  useRegisterDeskPatient,
  type DeskPatientSex,
  type ProviderPatientSummary,
} from '@/lib/api/deskQueries';
import { FieldLabel } from '@/components/desk/shared';
import { DateField, isPastDay } from '@/components/desk/DateTimeFields';
import { deskRoutes } from '@/components/desk/routes';

const NAME_MAX = 80;
const PHONE_MIN_DIGITS = 6;

type Field = 'first' | 'last' | 'dob' | 'sex' | 'phone';

/** Laravel field → the input it belongs under. */
const FIELD_OF: Record<string, Field> = {
  first_name: 'first',
  last_name: 'last',
  date_of_birth: 'dob',
  sex: 'sex',
  phone: 'phone',
};

export default function DeskRegisterPatientScreen() {
  return (
    <RoleGate need={['front_desk']}>
      <DeskRegisterPatientScreenBody />
    </RoleGate>
  );
}

function DeskRegisterPatientScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState<DeskPatientSex | null>(null);
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [banner, setBanner] = useState<{ tone: 'warning' | 'critical' | 'pending'; title: string; message: string } | null>(
    null,
  );
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [created, setCreated] = useState<ProviderPatientSummary | null>(null);

  const register = useRegisterDeskPatient();

  const clearError = useCallback((field: Field) => {
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }, []);

  const validate = (): boolean => {
    const next: Partial<Record<Field, string>> = {};
    if (!first.trim()) next.first = t('desk.register.firstNameRequired');
    if (!last.trim()) next.last = t('desk.register.lastNameRequired');
    if (!isPastDay(dob)) next.dob = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? t('desk.register.dobPast') : t('desk.register.dobInvalid');
    if (!sex) next.sex = t('desk.register.sexRequired');
    const digits = phone.replace(/\D/g, '');
    if (phone.trim() && digits.length < PHONE_MIN_DIGITS) next.phone = t('desk.register.phoneInvalid');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = () => {
    setBanner(null);
    setDuplicate(null);
    if (!validate() || !sex) return;
    const fullName = `${first.trim()} ${last.trim()}`;

    dialog.confirm({
      title: t('desk.register.confirmTitle'),
      message: t('desk.register.confirmMessage', {
        name: fullName,
        dob: formatDate(dob, dob),
        sex: sex === 'male' ? t('desk.register.male') : t('desk.register.female'),
      }),
      confirmLabel: t('desk.register.submit'),
      onConfirm: async () => {
        try {
          const summary = await register.mutateAsync({
            first_name: first,
            last_name: last,
            date_of_birth: dob,
            sex,
            phone,
          });
          setCreated(summary);
        } catch (e) {
          fail(e);
        }
      },
    });
  };

  const fail = (e: unknown) => {
    if (isDuplicateIdentity(e)) {
      setDuplicate(deskErrorMessage(e, t('desk.register.duplicateBody')));
      return;
    }
    if (isValidationFailure(e)) {
      const fields = deskFieldErrors(e);
      const mapped: Partial<Record<Field, string>> = {};
      for (const [k, v] of Object.entries(fields)) {
        const field = FIELD_OF[k];
        if (field) mapped[field] = v;
      }
      setErrors((cur) => ({ ...cur, ...mapped }));
      if (Object.keys(mapped).length === 0) {
        const f = describeFailure(e);
        setBanner({ tone: 'warning', title: f.title, message: f.message });
      }
      return;
    }
    if (isRoleForbidden(e)) {
      setBanner({
        tone: 'warning',
        title: t('opesDoctor.roleGate.serverRefusedTitle'),
        message: t('opesDoctor.roleGate.serverRefusedBody'),
      });
      return;
    }
    if (isNotServed(e)) {
      setBanner({ tone: 'pending', title: t('desk.notServedTitle'), message: t('desk.notServedRegister') });
      return;
    }
    const f = describeFailure(e);
    const outcomeUnknown = f.kind === 'timeout' || f.kind === 'server' || f.kind === 'unknown';
    setBanner({
      tone: 'critical',
      title: t('desk.errors.writeFailedTitle'),
      message: outcomeUnknown
        ? String(t('opesCore.errors.unknownOutcome', { message: f.message, checkHint: t('desk.register.checkHint') }))
        : f.message,
    });
  };

  const reset = () => {
    setFirst('');
    setLast('');
    setDob('');
    setSex(null);
    setPhone('');
    setErrors({});
    setBanner(null);
    setDuplicate(null);
    setCreated(null);
  };

  const submitting = register.isPending;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={t('desk.register.title')} subtitle={t('desk.register.subtitle')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {created ? (
          <CreatedView
            summary={created}
            styles={styles}
            onBook={() => router.push(deskRoutes.newAppointment({ health_id: created.health_id }))}
            onAnother={reset}
          />
        ) : (
          <>
            {banner && (
              <NoticeBanner icon="alert-circle" tone={banner.tone} title={banner.title} message={banner.message} />
            )}

            {duplicate !== null && (
              <Card>
                <NoticeBanner
                  icon="id-card"
                  tone="warning"
                  title={t('desk.register.duplicateTitle')}
                  message={duplicate}
                />
                <Text style={[styles.hint, styles.duplicateHint]}>{t('desk.register.duplicateHint')}</Text>
                <View style={styles.rail}>
                  <CareButton
                    label={t('desk.register.lookupInstead')}
                    icon="person-search"
                    style={styles.railAction}
                    onPress={() => router.push(doctorRoutes.patients)}
                  />
                </View>
              </Card>
            )}

            <Card>
              <SectionHeader title={t('desk.register.identitySection')} variant="overline" />
              <View style={styles.section}>
                <FieldLabel text={t('desk.register.firstName')} />
                <PillInput
                  icon={<Icon name="person" size={18} color={colors.blue} />}
                  value={first}
                  onChangeText={(v) => {
                    setFirst(v);
                    clearError('first');
                  }}
                  placeholder={t('desk.register.firstNamePlaceholder')}
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={NAME_MAX}
                  error={errors.first}
                  accessibilityLabel={t('desk.register.firstName')}
                />
                <FieldLabel text={t('desk.register.lastName')} />
                <PillInput
                  icon={<Icon name="person" size={18} color={colors.blue} />}
                  value={last}
                  onChangeText={(v) => {
                    setLast(v);
                    clearError('last');
                  }}
                  placeholder={t('desk.register.lastNamePlaceholder')}
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={NAME_MAX}
                  error={errors.last}
                  accessibilityLabel={t('desk.register.lastName')}
                />
                <DateField
                  label={t('desk.register.dob')}
                  hint={t('desk.register.dobHint')}
                  value={dob}
                  onChange={(v) => {
                    setDob(v);
                    clearError('dob');
                  }}
                  error={errors.dob}
                />

                <FieldLabel text={t('desk.register.sex')} />
                <View style={styles.chips}>
                  <Chip
                    label={t('desk.register.male')}
                    selected={sex === 'male'}
                    onPress={() => {
                      setSex('male');
                      clearError('sex');
                    }}
                  />
                  <Chip
                    label={t('desk.register.female')}
                    selected={sex === 'female'}
                    onPress={() => {
                      setSex('female');
                      clearError('sex');
                    }}
                  />
                </View>
                {!!errors.sex && <Text style={styles.error}>{errors.sex}</Text>}
              </View>
            </Card>

            <Card>
              <SectionHeader title={t('desk.register.contactSection')} variant="overline" />
              <View style={styles.section}>
                <FieldLabel text={t('desk.register.phone')} hint={t('desk.book.optional')} />
                <PillInput
                  icon={<Icon name="phone" size={18} color={colors.blue} />}
                  value={phone}
                  onChangeText={(v) => {
                    setPhone(v);
                    clearError('phone');
                  }}
                  placeholder={t('desk.register.phonePlaceholder')}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                  error={errors.phone}
                  accessibilityLabel={t('desk.register.phone')}
                />
                <Text style={styles.hint}>{t('desk.register.phoneHint')}</Text>
              </View>
            </Card>

            <NoticeBanner icon="shield-check" tone="pending" message={t('desk.register.identityNotice')} />

            <CareButton
              label={t('desk.register.submit')}
              icon="id-card"
              loading={submitting}
              disabled={submitting}
              onPress={submit}
            />
          </>
        )}
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

// ── The new Health ID ──────────────────────────────────────────────────────

function CreatedView({
  summary,
  styles,
  onBook,
  onAnother,
}: {
  summary: ProviderPatientSummary;
  styles: ReturnType<typeof makeStyles>;
  onBook: () => void;
  onAnother: () => void;
}) {
  const { t } = useTranslation();
  const { colors, tintMap } = useTheme();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    await Clipboard.setStringAsync(summary.health_id);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };

  const name = summary.full_name?.trim() || [summary.first_name, summary.last_name].filter(Boolean).join(' ');
  const sexLabel =
    summary.sex === 'male'
      ? t('desk.register.male')
      : summary.sex === 'female'
        ? t('desk.register.female')
        : summary.sex ?? '';
  const meta = [summary.date_of_birth ? formatDate(summary.date_of_birth, '') : '', sexLabel].filter(Boolean).join(' · ');

  return (
    <>
      <Card>
        <View style={styles.createdHead}>
          <View style={styles.createdMark}>
            <Icon name="check-circle" size={40} color={tintMap.green.fg} />
          </View>
          <View style={styles.createdText}>
            <Text style={styles.createdTitle}>{t('desk.register.successTitle')}</Text>
            <Text style={styles.createdBody}>{t('desk.register.successBody', { name })}</Text>
          </View>
        </View>

        <View style={styles.idBlock}>
          <Text style={styles.idLabel}>{t('desk.register.healthIdLabel')}</Text>
          <Text style={styles.idValue} selectable accessibilityRole="text">
            {summary.health_id}
          </Text>
          {!!name && <Text style={styles.idName}>{name}</Text>}
          {!!meta && <Text style={styles.idMeta}>{meta}</Text>}
        </View>

        <View style={styles.rail}>
          <CareButton
            label={copied ? t('desk.register.copied') : t('desk.register.copy')}
            icon={copied ? 'check' : 'copy'}
            variant="secondary"
            style={styles.railAction}
            onPress={() => void copy()}
          />
          <CareButton label={t('desk.register.bookNow')} icon="calendar-plus" style={styles.railAction} onPress={onBook} />
        </View>
      </Card>

      <NoticeBanner icon="id-card" tone="normal" message={t('desk.register.tellPatient')} />

      <CareButton
        label={t('desk.register.registerAnother')}
        icon="plus"
        variant="ghost"
        onPress={onAnother}
      />
      <Text style={[styles.hint, { color: colors.textMuted }]}>{t('desk.register.recordedNotice')}</Text>
    </>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    section: { marginTop: spacing.sm, gap: spacing.xs },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    rail: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    railAction: { flex: 1 },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    duplicateHint: { marginTop: spacing.sm },
    error: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.danger,
      marginTop: spacing.xs,
      marginLeft: spacing.xs,
    },

    createdHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    createdMark: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    createdText: { flex: 1, minWidth: 0, gap: 2 },
    createdTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
    },
    createdBody: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    idBlock: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: 14,
      backgroundColor: colors.navy,
      gap: 4,
    },
    idLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.textOnBrand,
      opacity: 0.75,
    },
    idValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 26,
      lineHeight: 32,
      letterSpacing: 1.5,
      color: colors.textOnBrand,
    },
    idName: {
      marginTop: spacing.xs,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textOnBrand,
    },
    idMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textOnBrand,
      opacity: 0.8,
    },
  });
