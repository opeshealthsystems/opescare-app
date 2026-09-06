/**
 * Doctor — Emergency access / BREAK-GLASS (`/clinician/break-glass`).
 *
 * The one screen in this app that opens someone's record without their
 * permission. It exists for exactly one situation: a person who cannot consent
 * — unconscious, unaccompanied, unidentified — at a facility that has never
 * seen them before, where `MobileDoctorChartController` correctly answers 403
 * because there is no care relationship to justify a read.
 *
 * ── WHY THIS IS A DESTINATION, NEVER A FALLBACK ──────────────────────────
 *
 * Nothing navigates here automatically. The chart's 403 does NOT offer a
 * "break glass instead" button, and no error handler in this app calls
 * `useOpenBreakGlass`. A refusal that hands you the override in the same
 * breath is not a refusal — it is a two-step door, and after a week nobody
 * reads the first step. A clinician arrives here because they decided to,
 * types what happened, and confirms they know what it costs.
 *
 * ── THE FRICTION IS THE FEATURE ──────────────────────────────────────────
 *
 * Four things stand between arriving and reading:
 *
 *   1. The PATIENT IS CONFIRMED FIRST — exact Health ID, looked up, shown by
 *      name and date of birth, and explicitly chosen. Overriding onto the
 *      wrong record is the worst outcome available here and it is the same
 *      hazard `prescribe.tsx` guards against, guarded the same way.
 *   2. A REASON IN THE CLINICIAN'S OWN WORDS, at least
 *      `MIN_REASON_LENGTH` characters. No dropdown: a picklist turns an
 *      account of what happened into a click, and the account is the only
 *      part of this record a reviewer cannot reconstruct from the data.
 *   3. THREE SEPARATE ACKNOWLEDGEMENTS, each ticked by hand — this is logged,
 *      the patient will be told, a human will review it. Three taps, not one
 *      checkbox, because the three consequences are different and a single
 *      "I agree" is read by nobody.
 *   4. A CONFIRMATION SHEET naming the patient, their Health ID and the
 *      window, with a red confirm button.
 *
 * ── WHAT IT OPENS, AND FOR HOW LONG ──────────────────────────────────────
 *
 * The emergency profile only: identity, emergency contact, blood group, active
 * allergies, chronic conditions. No notes, no encounters, no prescriptions, no
 * results. The screen says so out loud, because a clinician who assumes they
 * are seeing the whole chart may conclude "no known problems" from a list that
 * was never going to contain them.
 *
 * The grant expires `GRANT_TTL_HOURS` after it was opened — an absolute clock
 * that reading does not extend. The countdown on this screen ticks from the
 * device clock so the clinician watches it run down rather than discovering it
 * as a 403 mid-resuscitation.
 *
 * ── NEVER A FAKE SUCCESS, NEVER A SILENT DOUBLE ──────────────────────────
 *
 * The override is never retried automatically. A POST that got no answer at
 * all may already have opened a grant, alerted the patient and created a
 * review case, so `openOutcomeIsUncertain()` gets its own outcome: "we do not
 * know — check your open grants before trying again". And if the server says
 * the patient could NOT be notified, this screen says that too, in red,
 * instead of quietly implying they were.
 *
 * i18n: every string goes through `opesDoctor.breakGlass.*` with an English
 * `defaultValue`; the keys are staged in
 * `lib/i18n/pending/emergency_access.{en,fr}.json`. Locale files are not
 * edited here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGate } from '@/components/doctor/RoleGate';
import {
  Card,
  Icon,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatDate,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { allergySeverityLabel, allergyTone, sexLabel } from '@/components/doctor/chartShared';
import { CareButton, LoadingBlock, NoticeBanner, describeFailure } from '@/components/care/shared';
import {
  ageFromDob,
  patientDisplayName,
  usePrescribingPatientLookup,
  type PrescribingPatient,
} from '@/lib/api/prescribingQueries';
import {
  GRANT_TTL_HOURS,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  breakGlassMessage,
  breakGlassRetryAfter,
  formatRemaining,
  isBreakGlassBlocked,
  isBreakGlassUnavailable,
  isPatientNotFound,
  isPlausibleHealthId,
  isReasonSufficient,
  normaliseHealthId,
  openOutcomeIsUncertain,
  reasonShortfall,
  secondsLeft,
  useOpenBreakGlass,
  type BreakGlassResult,
  type EmergencyAllergy,
} from '@/lib/api/emergencyAccessQueries';

/** `opesDoctor.<key>` with a readable English default until the key lands. */
type Tx = (key: string, defaultValue: string, params?: Record<string, unknown>) => string;

/** The three things a clinician must acknowledge, each on its own. */
const ACKS = ['logged', 'patientTold', 'reviewed'] as const;
type Ack = (typeof ACKS)[number];

const ACK_COPY: Record<Ack, { icon: IconName; en: string }> = {
  logged: {
    icon: 'document-text',
    en: 'This access is recorded against my name, this facility and this patient, and is marked as an emergency override.',
  },
  patientTold: {
    icon: 'bell',
    en: 'The patient is notified — immediately, and again when they next sign in — and my reason is shown to them word for word.',
  },
  reviewed: {
    icon: 'shield',
    en: 'A human reviews this afterwards, and repeated overrides on the same patient are escalated.',
  },
};

/**
 * Role gate — emergency_access. A role without it never mounts the screen
 * below, so none of its queries run and the server is never asked what it
 * would refuse (`lib/staffCapabilities.ts`, mirror of config/staff_capabilities.php).
 */
export default function BreakGlassScreen() {
  return (
    <RoleGate need={['emergency_access']}>
      <BreakGlassScreenBody />
    </RoleGate>
  );
}

function BreakGlassScreenBody() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const dialog = useDialog();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const tx = useCallback<Tx>(
    (key, defaultValue, params) =>
      String(t(`opesDoctor.${key}`, { defaultValue, ...(params ?? {}) })),
    [t],
  );

  // A Health ID can be handed in by whatever sent the clinician here; it is
  // still confirmed by lookup before anything is overridden.
  const params = useLocalSearchParams<{ patient?: string }>();
  const initialId = typeof params.patient === 'string' ? normaliseHealthId(params.patient) : '';

  const [healthId, setHealthId] = useState(initialId);
  const [lookupFor, setLookupFor] = useState(initialId);
  const [chosen, setChosen] = useState<PrescribingPatient | null>(null);
  const [reason, setReason] = useState('');
  const [acks, setAcks] = useState<Record<Ack, boolean>>({
    logged: false,
    patientTold: false,
    reviewed: false,
  });

  const lookup = usePrescribingPatientLookup(lookupFor || null);
  const open = useOpenBreakGlass();
  const result: BreakGlassResult | undefined = open.data;

  // The countdown runs off the device clock so it keeps moving between
  // requests. `secondsLeft` re-derives it from `expires_at` every tick.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!result) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [result]);
  const remaining = useMemo(
    () => (result ? secondsLeft(result.grant) : 0),
    // `now` is the tick that forces the recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, now],
  );

  const idIsPlausible = isPlausibleHealthId(healthId);
  const reasonOk = isReasonSufficient(reason);
  const allAcked = ACKS.every((k) => acks[k]);
  const canOpen = Boolean(chosen) && reasonOk && allAcked && !open.isPending;

  const runLookup = useCallback(() => {
    setChosen(null);
    setLookupFor(normaliseHealthId(healthId));
  }, [healthId]);

  const clearPatient = useCallback(() => {
    setChosen(null);
    setLookupFor('');
    setHealthId('');
  }, []);

  const toggleAck = useCallback((key: Ack) => {
    setAcks((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /** The last gate: a sheet that names the patient and the cost. */
  const confirmAndOpen = useCallback(() => {
    if (!chosen || !canOpen) return;
    const name = patientDisplayName(chosen) ?? tx('breakGlass.unnamedPatient', 'this patient');

    dialog.confirm({
      title: tx('breakGlass.confirmTitle', 'Open emergency access?'),
      message: tx(
        'breakGlass.confirmBody',
        'You are about to read {{name}} ({{healthId}}) without their consent. It is logged as an emergency override, {{name}} is told immediately and shown your reason, a reviewer looks at it afterwards, and it closes by itself in {{hours}} hours.',
        {
          name,
          healthId: chosen.health_id ?? tx('breakGlass.noHealthId', 'no Health ID'),
          hours: GRANT_TTL_HOURS,
        },
      ),
      confirmLabel: tx('breakGlass.confirmAction', 'Break the glass'),
      destructive: true,
      onConfirm: async () => {
        try {
          await open.mutateAsync({
            patient: chosen.health_id ?? chosen.id,
            reason,
            acknowledged: true,
          });
        } catch {
          // Rendered below from `open.error` — a thrown dialog action would
          // leave the sheet spinning.
        }
      },
    });
  }, [canOpen, chosen, dialog, open, reason, tx]);

  // ── The outcome ─────────────────────────────────────────────────────────
  if (result) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader
          title={tx('breakGlass.grantedTitle', 'Emergency access open')}
          subtitle={tx('breakGlass.grantedSubtitle', 'Recorded, reviewable, and time-limited')}
          onBack={() => router.back()}
        />
        <ScrollView contentContainerStyle={styles.body}>
          <NoticeBanner
            icon="alert-triangle"
            tone="critical"
            title={tx('breakGlass.grantedBannerTitle', 'This access is on the record')}
            message={tx(
              'breakGlass.grantedBannerBody',
              'Every section you open under this grant is logged against your name as an emergency override, and a reviewer will read it alongside the reason you gave.',
            )}
          />

          {!result.meta.patient_notified && (
            <NoticeBanner
              icon="bell-off"
              tone="warning"
              title={tx('breakGlass.notNotifiedTitle', 'The patient has NOT been notified')}
              message={tx(
                'breakGlass.notNotifiedBody',
                'The alert could not be sent. The access still stands and is still logged — tell the patient or their next of kin directly, and report this to your facility’s governance team.',
              )}
            />
          )}

          {result.meta.status === 'reused' && (
            <NoticeBanner
              icon="clock"
              tone="pending"
              message={tx(
                'breakGlass.reusedBody',
                'You already had emergency access to this record, so the existing grant was reopened rather than a second override created.',
              )}
            />
          )}

          {result.meta.repeat && (
            <NoticeBanner
              icon="history"
              tone="warning"
              title={tx('breakGlass.repeatTitle', 'This is a repeat override')}
              message={tx(
                'breakGlass.repeatBody',
                'You have broken the glass on this patient before in the last 24 hours. This one has been escalated for review.',
              )}
            />
          )}

          <Card style={styles.card}>
            <View style={styles.countdownRow}>
              <Icon name="clock" size={20} color={remaining > 0 ? colors.blue : colors.statusCritical} />
              <Text style={styles.countdown}>
                {remaining > 0
                  ? tx('breakGlass.closesIn', 'Closes in {{time}}', { time: formatRemaining(remaining) })
                  : tx('breakGlass.closed', 'This access has closed')}
              </Text>
            </View>
            <Text style={styles.muted}>
              {tx(
                'breakGlass.windowNote',
                'The window is {{hours}} hours from when you opened it and reading does not extend it. When it closes the record is refused again, exactly as it was before.',
                { hours: result.grant.ttl_hours },
              )}
            </Text>
          </Card>

          <SectionHeader title={tx('breakGlass.profileTitle', 'Emergency profile')} />

          <Card style={styles.card}>
            <Text style={styles.name}>
              {[result.profile.identity.first_name, result.profile.identity.last_name]
                .filter(Boolean)
                .join(' ') || tx('breakGlass.unnamedPatient', 'this patient')}
            </Text>
            <Field
              styles={styles}
              label={tx('breakGlass.healthId', 'Health ID')}
              value={result.profile.identity.health_id}
            />
            <Field
              styles={styles}
              label={tx('breakGlass.dob', 'Date of birth')}
              value={
                result.profile.identity.date_of_birth
                  ? formatDate(result.profile.identity.date_of_birth)
                  : null
              }
            />
            <Field
              styles={styles}
              label={tx('breakGlass.sex', 'Sex')}
              value={result.profile.identity.sex ? sexLabel(result.profile.identity.sex) : null}
            />
            <Field
              styles={styles}
              label={tx('breakGlass.bloodGroup', 'Blood group')}
              value={result.profile.identity.blood_group}
              strong
            />
          </Card>

          <SectionHeader title={tx('breakGlass.allergiesTitle', 'Allergies')} />
          <Card style={styles.card}>
            {result.profile.allergies.length === 0 ? (
              // "None recorded" is NOT "no known allergies" and must never be
              // rendered as reassurance.
              <Text style={styles.warnText}>
                {tx(
                  'breakGlass.noAllergiesRecorded',
                  'No allergies are recorded on this record. That is not the same as no known allergies — treat this as unknown.',
                )}
              </Text>
            ) : (
              result.profile.allergies.map((a: EmergencyAllergy, i: number) => (
                <View key={`${a.substance}-${i}`} style={styles.allergyRow}>
                  <Icon name="alert-triangle" size={18} color={colors.statusCritical} />
                  <Text style={styles.allergyText}>{a.substance ?? '—'}</Text>
                  {!!a.severity && (
                    <StatusBadge
                      status={a.severity}
                      tone={allergyTone(a.severity)}
                      label={allergySeverityLabel(a.severity)}
                      size="sm"
                    />
                  )}
                </View>
              ))
            )}
          </Card>

          <SectionHeader title={tx('breakGlass.conditionsTitle', 'Chronic conditions')} />
          <Card style={styles.card}>
            {result.profile.chronic_conditions.length === 0 ? (
              <Text style={styles.muted}>
                {tx('breakGlass.noConditions', 'No active conditions are recorded.')}
              </Text>
            ) : (
              result.profile.chronic_conditions.map((c, i) => (
                <Field
                  key={`${c.code}-${i}`}
                  styles={styles}
                  label={[c.code_system, c.code].filter(Boolean).join(' ') || '—'}
                  value={c.display_name}
                />
              ))
            )}
          </Card>

          <SectionHeader title={tx('breakGlass.contactTitle', 'Emergency contact')} />
          <Card style={styles.card}>
            {result.profile.emergency_contact ? (
              <>
                <Field
                  styles={styles}
                  label={tx('breakGlass.contactName', 'Name')}
                  value={result.profile.emergency_contact.name ?? null}
                  strong
                />
                <Field
                  styles={styles}
                  label={tx('breakGlass.contactRelationship', 'Relationship')}
                  value={result.profile.emergency_contact.relationship ?? null}
                />
                <Field
                  styles={styles}
                  label={tx('breakGlass.contactPhone', 'Phone')}
                  value={result.profile.emergency_contact.phone ?? null}
                  strong
                />
              </>
            ) : (
              <Text style={styles.muted}>
                {tx('breakGlass.noContact', 'No emergency contact is recorded.')}
              </Text>
            )}
          </Card>

          <NoticeBanner
            icon="info"
            tone="pending"
            title={tx('breakGlass.scopeTitle', 'This is not the whole chart')}
            message={tx(
              'breakGlass.scopeBody',
              'Emergency access opens only what an emergency needs. Consultation notes, past visits, prescriptions and results are not included and are not missing — they were never part of this grant.',
            )}
          />

          <Card style={styles.card}>
            <Text style={styles.label}>{tx('breakGlass.yourReason', 'The reason you gave')}</Text>
            <Text style={styles.reasonEcho}>{result.grant.reason}</Text>
          </Card>

          <CareButton
            label={tx('breakGlass.done', 'Back to my patients')}
            variant="secondary"
            icon="arrow-left"
            onPress={() => router.back()}
          />
          <View style={styles.footerPad} />
        </ScrollView>
        {dialog.element}
      </SafeAreaView>
    );
  }

  // ── The gate ────────────────────────────────────────────────────────────
  const failure = open.error ? describeFailure(open.error) : null;
  const serverSaid = open.error ? breakGlassMessage(open.error) : null;
  const retryAfter = open.error ? breakGlassRetryAfter(open.error) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader
        title={tx('breakGlass.title', 'Emergency access')}
        subtitle={tx('breakGlass.subtitle', 'For a patient who cannot consent')}
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <NoticeBanner
          icon="alert-triangle"
          tone="critical"
          title={tx('breakGlass.warnTitle', 'This opens a record without consent')}
          message={tx(
            'breakGlass.warnBody',
            'Use this only when the patient cannot consent and care cannot wait — not because a chart was refused. It is logged under your name, the patient is told, and a reviewer reads it.',
          )}
        />

        {/* ── 1. Who ─────────────────────────────────────────────────── */}
        <SectionHeader title={tx('breakGlass.step1', '1. Confirm the patient')} />
        <Card style={styles.card}>
          <Text style={styles.label}>{tx('breakGlass.healthId', 'Health ID')}</Text>
          <PillInput
            value={healthId}
            onChangeText={(v) => setHealthId(v.toUpperCase())}
            placeholder={tx('breakGlass.healthIdPlaceholder', 'CM-HID-XXXX-XXXX-XXXX')}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!chosen}
          />
          <Text style={styles.muted}>
            {tx(
              'breakGlass.noSearch',
              'An exact Health ID only. There is no name search here, and never a list of patients.',
            )}
          </Text>

          {!chosen && (
            <CareButton
              label={tx('breakGlass.lookUp', 'Look up')}
              icon="search"
              variant="secondary"
              disabled={!idIsPlausible || lookup.isFetching}
              loading={lookup.isFetching}
              onPress={runLookup}
              style={styles.spaced}
            />
          )}

          {lookup.isFetching && <LoadingBlock />}

          {!!lookupFor && !lookup.isFetching && lookup.isError && (
            <NoticeBanner
              icon="alert-circle"
              tone="warning"
              message={tx(
                'breakGlass.lookupFailed',
                'No record matches that Health ID on this server. Check it with the escort, the referring team or the patient’s card.',
              )}
            />
          )}

          {!!lookup.data && !chosen && (
            <View style={styles.matchCard}>
              <Text style={styles.name}>
                {patientDisplayName(lookup.data) ?? tx('breakGlass.unnamedPatient', 'this patient')}
              </Text>
              <Field
                styles={styles}
                label={tx('breakGlass.healthId', 'Health ID')}
                value={lookup.data.health_id}
              />
              <Field
                styles={styles}
                label={tx('breakGlass.dob', 'Date of birth')}
                value={
                  lookup.data.date_of_birth
                    ? `${formatDate(lookup.data.date_of_birth)}${
                        ageFromDob(lookup.data.date_of_birth) !== null
                          ? ` · ${ageFromDob(lookup.data.date_of_birth)}`
                          : ''
                      }`
                    : null
                }
              />
              <Field
                styles={styles}
                label={tx('breakGlass.sex', 'Sex')}
                value={lookup.data.sex ? sexLabel(lookup.data.sex) : null}
              />
              <CareButton
                label={tx('breakGlass.usePatient', 'This is the patient')}
                icon="check"
                onPress={() => setChosen(lookup.data ?? null)}
                style={styles.spaced}
              />
            </View>
          )}

          {!!chosen && (
            <View style={styles.chosenCard}>
              <View style={styles.chosenRow}>
                <Icon name="id-card" size={20} color={colors.blue} />
                <Text style={styles.chosenName}>
                  {patientDisplayName(chosen) ?? tx('breakGlass.unnamedPatient', 'this patient')}
                </Text>
              </View>
              <Text style={styles.muted}>{chosen.health_id}</Text>
              <CareButton
                label={tx('breakGlass.changePatient', 'Change patient')}
                variant="ghost"
                size="sm"
                icon="refresh"
                onPress={clearPatient}
                style={styles.spaced}
              />
            </View>
          )}
        </Card>

        {/* ── 2. Why ─────────────────────────────────────────────────── */}
        <SectionHeader title={tx('breakGlass.step2', '2. Say what happened')} />
        <Card style={styles.card}>
          <Text style={styles.muted}>
            {tx(
              'breakGlass.reasonHelp',
              'In your own words. This is stored on the record, shown to the patient exactly as you type it, and read by whoever reviews the override.',
            )}
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={MAX_REASON_LENGTH}
            editable={!!chosen}
            placeholder={tx(
              'breakGlass.reasonPlaceholder',
              'e.g. Unresponsive after an RTA, no escort and no ID; need allergies and blood group before induction.',
            )}
            placeholderTextColor={colors.textMuted}
            style={[styles.reasonInput, !chosen && styles.reasonDisabled]}
            textAlignVertical="top"
          />
          <Text style={reasonOk ? styles.muted : styles.warnText}>
            {reasonOk
              ? tx(
                  'breakGlass.reasonOk',
                  '{{chars}} characters — this will be stored and shown to the patient.',
                  { chars: reason.trim().length },
                )
              : tx(
                  'breakGlass.reasonShort',
                  '{{needed}} more characters needed. A few words is not an account.',
                  { needed: reasonShortfall(reason) },
                )}
          </Text>
        </Card>

        {/* ── 3. What it costs ───────────────────────────────────────── */}
        <SectionHeader title={tx('breakGlass.step3', '3. Confirm you understand')} />
        <Card style={styles.card}>
          {ACKS.map((key) => (
            <TouchableOpacity
              key={key}
              style={styles.ackRow}
              onPress={() => toggleAck(key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acks[key] }}
              accessibilityLabel={tx(`breakGlass.ack.${key}`, ACK_COPY[key].en)}
              activeOpacity={0.7}
            >
              <Icon
                name={acks[key] ? 'check-circle' : 'circle'}
                size={22}
                color={acks[key] ? colors.statusNormal : colors.textMuted}
              />
              <Text style={styles.ackText}>{tx(`breakGlass.ack.${key}`, ACK_COPY[key].en)}</Text>
            </TouchableOpacity>
          ))}
        </Card>

        {/* ── Failures ───────────────────────────────────────────────── */}
        {open.error && openOutcomeIsUncertain(open.error) && (
          <NoticeBanner
            icon="help-circle"
            tone="warning"
            title={tx('breakGlass.uncertainTitle', 'We do not know whether this opened')}
            message={tx(
              'breakGlass.uncertainBody',
              'The request got no answer, so emergency access may already be open and the patient may already have been alerted. Check your open grants before trying again — do not simply retry.',
            )}
          />
        )}

        {open.error && !openOutcomeIsUncertain(open.error) && isBreakGlassUnavailable(open.error) && (
          <NoticeBanner
            icon="alert-circle"
            tone="critical"
            title={tx('breakGlass.unavailableTitle', 'This server cannot open emergency access')}
            message={tx(
              'breakGlass.unavailableBody',
              'The emergency access route is not available on this deployment. Use your facility’s paper emergency procedure.',
            )}
          />
        )}

        {open.error &&
          !openOutcomeIsUncertain(open.error) &&
          !isBreakGlassUnavailable(open.error) && (
            <NoticeBanner
              icon={isBreakGlassBlocked(open.error) ? 'lock' : 'alert-circle'}
              tone="critical"
              title={
                isPatientNotFound(open.error)
                  ? tx('breakGlass.notFoundTitle', 'No such record')
                  : isBreakGlassBlocked(open.error)
                    ? tx('breakGlass.blockedTitle', 'Emergency access is blocked')
                    : (failure?.title ?? tx('breakGlass.failedTitle', 'Emergency access was not opened'))
              }
              message={[
                serverSaid ?? failure?.message ?? '',
                retryAfter
                  ? tx('breakGlass.retryAfter', 'Try again in about {{time}}.', {
                      time: formatRemaining(retryAfter),
                    })
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          )}

        <CareButton
          label={tx('breakGlass.action', 'Break the glass')}
          icon="lock-open"
          variant="dangerSolid"
          disabled={!canOpen}
          loading={open.isPending}
          onPress={confirmAndOpen}
        />
        <Text style={styles.footNote}>
          {tx(
            'breakGlass.footNote',
            'Emergency access opens the emergency profile only — identity, emergency contact, blood group, allergies and chronic conditions — and closes by itself after {{hours}} hours.',
            { hours: GRANT_TTL_HOURS },
          )}
        </Text>
        <View style={styles.footerPad} />
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

/** label / value line. A missing value reads "not recorded", never blank. */
function Field({
  styles,
  label,
  value,
  strong,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string | null;
  strong?: boolean;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, strong && styles.valueStrong]} numberOfLines={3}>
        {value ?? '—'}
      </Text>
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    body: { padding: spacing.md, gap: spacing.md },
    card: { padding: spacing.md, gap: spacing.sm },
    spaced: { marginTop: spacing.sm },
    label: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 13,
      color: colors.textSecondary,
    },
    value: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 15,
      color: colors.textPrimary,
      flexShrink: 1,
      textAlign: 'right',
    },
    valueStrong: { fontFamily: typography.fontFamily.semiBold },
    fieldRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingVertical: 4,
    },
    name: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    muted: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
    },
    warnText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 13,
      color: colors.statusCritical,
      lineHeight: 19,
    },
    matchCard: {
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.primarySoft,
      gap: 2,
    },
    chosenCard: {
      marginTop: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 2,
    },
    chosenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    chosenName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    reasonInput: {
      minHeight: 120,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.md,
      backgroundColor: colors.surface,
      fontFamily: typography.fontFamily.regular,
      fontSize: 15,
      color: colors.textPrimary,
    },
    reasonDisabled: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
    ackRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    ackText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    countdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    countdown: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 17,
      color: colors.textPrimary,
    },
    allergyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 6,
    },
    allergyText: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    reasonEcho: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    footNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
      textAlign: 'center',
    },
    footerPad: { height: spacing.xl },
  });
}
