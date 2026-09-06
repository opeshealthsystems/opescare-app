/**
 * Front desk — book an appointment by EXACT Health ID
 * (`/clinician/desk/new-appointment?health_id=&date=`).
 *
 * `POST /mobile/desk/appointments { health_id, scheduled_at, appointment_type,
 * provider_id?, reason? }` → the new row, which this screen then opens.
 *
 * ── THE RULES THIS SCREEN KEEPS ──────────────────────────────────────────
 *  1. NO ENUMERATION. The Health ID is validated with `isPlausibleHealthId`
 *     before anything is sent; a partial ID is refused on the phone and the
 *     server is never asked a prefix or a name. `?health_id=` is what the
 *     scanner and the register screen hand over — a full ID, pre-filled.
 *  2. THE TIME IS A TIME, NOT A FREE TIME. The contract publishes no facility
 *     slot endpoint. The grid marks only what the facility's own book already
 *     holds for that day (a real read) and claims nothing else.
 *  3. A CLINICIAN IS OPTIONAL. The contract makes `provider_id` optional; an
 *     unrouted booking is legitimate and shows as "Unassigned" on the book,
 *     where it can be routed later.
 *  4. FAILURES ARE NAMED: an unknown Health ID (404 with a server body) goes
 *     under the ID field; a 422 puts each sentence under its field; a role
 *     refusal and an unserved server each say what they are.
 */
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGate } from '@/components/doctor/RoleGate';
import {
  Card,
  Chip,
  Icon,
  PillInput,
  ScreenHeader,
  SectionHeader,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, NoticeBanner, describeFailure, fmtDateLong, fmtTime } from '@/components/care/shared';
import { KNOWN_APPOINTMENT_TYPES, typeIconOf, typeLabelOf } from '@/components/care/apptLabels';
import {
  deskDay,
  deskDayOf,
  deskErrorMessage,
  deskFieldErrors,
  deskStatusFamily,
  isDeskRecordNotFound,
  isNotServed,
  isPlausibleHealthId,
  isRoleForbidden,
  isStateConflict,
  isValidDeskDay,
  isValidationFailure,
  normaliseHealthId,
  toDeskWallClock,
  useBookDeskAppointment,
  useDeskAppointments,
  useDeskProviders,
} from '@/lib/api/deskQueries';
import { FieldLabel } from '@/components/desk/shared';
import {
  DateField,
  DayChips,
  SlotGrid,
  TimeField,
  composeLocal,
  timeOfIso,
} from '@/components/desk/DateTimeFields';
import { ProviderPicker } from '@/components/desk/ProviderPicker';
import { deskRoutes } from '@/components/desk/routes';

/** The types a desk books. `lab` is the OPES spelling of the finder's `lab_test`; one of them is enough. */
const DESK_APPOINTMENT_TYPES = KNOWN_APPOINTMENT_TYPES.filter((v) => v !== 'lab');

const REASON_MAX = 500;

type Field = 'healthId' | 'date' | 'time' | 'type' | 'provider' | 'reason';

/** Laravel field → the input it belongs under. */
const FIELD_OF: Record<string, Field> = {
  health_id: 'healthId',
  scheduled_at: 'time',
  appointment_type: 'type',
  provider_id: 'provider',
  reason: 'reason',
};

export default function DeskNewAppointmentScreen() {
  return (
    <RoleGate need={['front_desk']}>
      <DeskNewAppointmentScreenBody />
    </RoleGate>
  );
}

function DeskNewAppointmentScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const params = useLocalSearchParams<{ health_id?: string; date?: string }>();

  const [healthId, setHealthId] = useState<string>(() =>
    typeof params.health_id === 'string' ? normaliseHealthId(params.health_id) : '',
  );
  const [day, setDay] = useState<string>(() =>
    typeof params.date === 'string' && isValidDeskDay(params.date) ? params.date : deskDay(),
  );
  const [time, setTime] = useState<string>('');
  const [type, setType] = useState<string>('consultation');
  const [providerId, setProviderId] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [banner, setBanner] = useState<{ tone: 'warning' | 'critical' | 'pending'; title: string; message: string } | null>(
    null,
  );

  const providers = useDeskProviders();
  const book = useBookDeskAppointment();

  // The facility's book for the chosen day — what the grid marks as taken.
  const dayBook = useDeskAppointments({ date: day });
  const taken = useMemo(() => {
    const set = new Set<string>();
    for (const row of dayBook.data ?? []) {
      const f = deskStatusFamily(row.status);
      if (f === 'cancelled' || f === 'no_show') continue;
      const hhmm = timeOfIso(row.scheduled_at);
      if (hhmm) set.add(hhmm);
    }
    return set;
  }, [dayBook.data]);

  const clearError = useCallback((field: Field) => {
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }, []);

  const validate = (): Date | null => {
    const next: Partial<Record<Field, string>> = {};
    if (!isPlausibleHealthId(healthId)) next.healthId = t('desk.book.healthIdInvalid');
    if (!isValidDeskDay(day)) next.date = t('desk.book.dateInvalid');
    const when = composeLocal(day, time);
    if (!when) {
      if (!next.date) next.time = t('desk.book.timeInvalid');
    } else if (when.getTime() < Date.now()) {
      next.time = t('desk.book.timePast');
    }
    if (!type) next.type = t('desk.book.typeRequired');
    setErrors(next);
    return Object.keys(next).length === 0 ? when : null;
  };

  const submit = () => {
    setBanner(null);
    const when = validate();
    if (!when) return;
    const id = normaliseHealthId(healthId);
    const provider = providers.data?.find((p) => p.id === providerId) ?? null;
    const iso = when.toISOString();

    dialog.confirm({
      title: t('desk.book.confirmTitle'),
      message: t('desk.book.confirmMessage', {
        healthId: id,
        type: typeLabelOf(t, type),
        date: fmtDateLong(iso),
        time: fmtTime(iso),
        provider: provider ? provider.name : t('desk.unassigned'),
      }),
      confirmLabel: t('desk.book.submit'),
      onConfirm: async () => {
        try {
          const created = await book.mutateAsync({
            health_id: id,
            scheduled_at: toDeskWallClock(when),
            appointment_type: type,
            provider_id: provider?.id,
            reason,
          });
          // The new row opens from the day it was booked into — derived from
          // that day's list, like every other row.
          router.replace(deskRoutes.appointment(created.id, deskDayOf(created.scheduled_at)));
        } catch (e) {
          fail(e);
        }
      },
    });
  };

  const fail = (e: unknown) => {
    if (isDeskRecordNotFound(e)) {
      setErrors((cur) => ({ ...cur, healthId: t('desk.book.patientNotFound') }));
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
    if (isStateConflict(e)) {
      setBanner({
        tone: 'warning',
        title: t('desk.errors.conflictTitle'),
        message: deskErrorMessage(e, t('desk.book.conflictBody')),
      });
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
      setBanner({ tone: 'pending', title: t('desk.notServedTitle'), message: t('desk.notServedBookWrite') });
      return;
    }
    const f = describeFailure(e);
    const outcomeUnknown = f.kind === 'timeout' || f.kind === 'server' || f.kind === 'unknown';
    setBanner({
      tone: 'critical',
      title: t('desk.errors.writeFailedTitle'),
      message: outcomeUnknown
        ? String(t('opesCore.errors.unknownOutcome', { message: f.message, checkHint: t('desk.book.checkHint') }))
        : f.message,
    });
  };

  const submitting = book.isPending;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={t('desk.book.newAppointment')} subtitle={t('desk.book.newSubtitle')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {banner && <NoticeBanner icon="alert-circle" tone={banner.tone} title={banner.title} message={banner.message} />}

        {/* ── Who ────────────────────────────────────────────────────── */}
        <Card>
          <SectionHeader title={t('desk.book.patientSection')} variant="overline" />
          <View style={styles.section}>
            <FieldLabel text={t('desk.book.healthIdLabel')} hint={t('desk.book.healthIdHint')} />
            <PillInput
              icon={<Icon name="id-card" size={18} color={colors.blue} />}
              value={healthId}
              onChangeText={(v) => {
                setHealthId(v.toUpperCase());
                clearError('healthId');
              }}
              onBlur={() => setHealthId((v) => normaliseHealthId(v))}
              placeholder={t('desk.book.healthIdPlaceholder')}
              autoCapitalize="characters"
              autoCorrect={false}
              error={errors.healthId}
              accessibilityLabel={t('desk.book.healthIdLabel')}
            />
            <Text style={styles.hint}>{t('desk.book.noEnumeration')}</Text>
          </View>
        </Card>

        {/* ── When ───────────────────────────────────────────────────── */}
        <Card>
          <SectionHeader title={t('desk.book.whenSection')} variant="overline" />
          <View style={styles.section}>
            <DayChips
              value={day}
              onChange={(d) => {
                setDay(d);
                clearError('date');
              }}
            />
            <DateField
              label={t('desk.book.dateLabel')}
              value={day}
              onChange={(d) => {
                setDay(d);
                clearError('date');
              }}
              error={errors.date}
            />
            <TimeField
              label={t('desk.book.timeLabel')}
              value={time}
              onChange={(v) => {
                setTime(v);
                clearError('time');
              }}
              error={errors.time}
            />
            <FieldLabel text={t('desk.slots.title')} />
            <SlotGrid
              day={day}
              value={time}
              onPick={(v) => {
                setTime(v);
                clearError('time');
              }}
              taken={dayBook.data ? taken : undefined}
              disabled={submitting}
            />
            {dayBook.isError && isValidDeskDay(day) && (
              <Text style={styles.hint}>{t('desk.appointment.bookReadFailed')}</Text>
            )}
          </View>
        </Card>

        {/* ── What ───────────────────────────────────────────────────── */}
        <Card>
          <SectionHeader title={t('desk.book.typeLabel')} variant="overline" />
          <View style={styles.chips}>
            {DESK_APPOINTMENT_TYPES.map((v) => (
              <Chip
                key={v}
                label={typeLabelOf(t, v)}
                icon={typeIconOf(v)}
                selected={type === v}
                onPress={() => {
                  setType(v);
                  clearError('type');
                }}
              />
            ))}
          </View>
          {!!errors.type && <Text style={styles.error}>{errors.type}</Text>}

          <View style={styles.section}>
            <FieldLabel text={t('desk.book.reasonLabel')} hint={t('desk.book.optional')} />
            <PillInput
              icon={<Icon name="document-text" size={18} color={colors.blue} />}
              value={reason}
              onChangeText={(v) => {
                setReason(v);
                clearError('reason');
              }}
              placeholder={t('desk.book.reasonPlaceholder')}
              multiline
              maxLength={REASON_MAX}
              error={errors.reason}
              accessibilityLabel={t('desk.book.reasonLabel')}
              style={styles.multiline}
            />
          </View>
        </Card>

        {/* ── Who sees them ──────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('desk.book.providerLabel')} variant="overline" />
          <ProviderPicker
            providers={providers.data ?? []}
            loading={providers.isPending}
            error={providers.isError ? providers.error : undefined}
            onRetry={() => void providers.refetch()}
            value={providerId}
            onChange={(id) => {
              setProviderId(id);
              clearError('provider');
            }}
            allowUnassigned
            disabled={submitting}
          />
          {!!errors.provider && <Text style={styles.error}>{errors.provider}</Text>}
        </View>

        <CareButton
          label={t('desk.book.submit')}
          icon="calendar-plus"
          loading={submitting}
          disabled={submitting}
          onPress={submit}
        />
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
    section: { marginTop: spacing.sm, gap: spacing.xs },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    error: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.danger,
      marginTop: spacing.xs,
      marginLeft: spacing.xs,
    },
    multiline: { minHeight: 72, textAlignVertical: 'top' },
  });
