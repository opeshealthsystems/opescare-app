import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatDate,
  formatDateTime,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import { useAmendBloodRequest, useBloodRequest } from '@/lib/api/bloodRequestQueries';
import { useCancelBloodRequest, type BloodUrgencyValue } from '@/lib/api/queries';

/**
 * Modify or Cancel Request (PM-BLOOD-06).
 *
 * ── The two actions are not symmetrical, and the screen says so ───────────
 * The reference puts "Modify" and "Cancel" side by side as two cards of equal
 * size. They are NOT equal acts: an amendment adjusts a hold that stays yours,
 * and a cancellation releases units back to the blood bank and cannot be
 * undone. The arrangement here is the reference's — two cards, a radio each —
 * but the weighting is not: the cancel card is red-tinted whether or not it is
 * selected, its bullets are red crosses stating consequences (not features),
 * its button never becomes the page's default action, and pressing it still
 * goes through a confirmation that names the request.
 *
 * ── Three fields are missing on purpose ───────────────────────────────────
 * Blood group, component and facility cannot be edited here, because the API
 * refuses them: those three are what the facility checked against its stock
 * when it took the hold. Changing them is a different request, not an
 * amendment, and it has to re-run the availability check. The screen says that
 * plainly under the overview grid rather than showing three disabled dropdowns
 * and leaving the patient to guess.
 *
 * ── Only while it is still open ───────────────────────────────────────────
 * A request the facility has fulfilled, rejected or let expire is history.
 * The screen refuses to edit it and says which, rather than posting an
 * amendment the server will reject.
 *
 * ═══ WHAT THE REFERENCE DRAWS THAT THIS SCREEN DOES NOT ═══════════════════
 *  · "Change receiving facility" and "Change need by date/time" in the modify
 *    card's capability list, plus the Need By, Preferred Time, Receiving
 *    Facility and Department dropdowns in the field grid. `PATCH
 *    /mobile/blood/requests/{id}` accepts quantity, urgency, contact_phone and
 *    note. It has no department field at all, and it refuses the facility.
 *    Offering a control the server would reject is worse than not drawing it,
 *    so the capability list is the FOUR things that really are editable and
 *    the fields are those same four.
 *  · The "Help" button in the header. There is no help destination for this
 *    screen; it would have been a button that does nothing.
 *  · "Download Confirmation" in Quick Actions. There is no blood-request
 *    document endpoint — nothing to download. That slot goes to Copy ID.
 *  · The note counter reads 0/150 in the reference. The cap here stays 500,
 *    which is what this screen has always sent and what the API accepts;
 *    tightening it would silently truncate a note a patient could previously
 *    save. Only the counter's placement is the reference's.
 *
 * ═══ 375pt COMPROMISES ════════════════════════════════════════════════════
 *  · Reference is ~430pt. Choice cards are (343-10)/2 = 166pt each here, so
 *    their body text is 11px and their bullet labels are short verb phrases.
 *  · The field grid is a row of THREE (the three urgency options as one
 *    segmented control) then a row of TWO (units stepper | contact number)
 *    then the note full width — the reference's 3-then-2 rhythm, carrying the
 *    four fields that exist instead of seven that do not.
 *  · The contact input drops PillInput's hex icon badge: it costs 44pt of a
 *    150pt column, which a phone number needs more.
 */

const URGENCIES: { value: BloodUrgencyValue; icon: IconName }[] = [
  { value: 'emergency', icon: 'alert-triangle' },
  { value: 'urgent', icon: 'clock' },
  { value: 'routine', icon: 'calendar' },
];

/** The four things an amendment may actually carry. */
const MODIFY_POINTS = ['units', 'urgency', 'contact', 'note'] as const;

/** The two things cancelling does. Consequences, not features. */
const CANCEL_POINTS = ['release', 'undone'] as const;

const NOTE_MAX = 500;

/** One label/value cell of the 3-column overview grid. */
type Fact = {
  key: string;
  icon: IconName;
  iconColor: string;
  label: string;
  value: string;
  valueColor?: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function dial(number: string | null | undefined): void {
  if (!number) return;
  void Linking.openURL(`tel:${number.replace(/\s+/g, '')}`);
}

/** `needed_by` is `after_or_equal:today`, so every offer starts at today. */
const NEEDED_BY_OFFSETS = [0, 1, 3, 7] as const;

function dayFromNow(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

/** `YYYY-MM-DD` in the device's own zone — the API validates `date`. */
function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ModifyBloodRequestScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const request = useBloodRequest(requestId ?? null);
  const amend = useAmendBloodRequest();
  const cancel = useCancelBloodRequest();

  const [quantity, setQuantity] = useState<number | null>(null);
  const [urgency, setUrgency] = useState<BloodUrgencyValue | null>(null);
  const [phone, setPhone] = useState<string>('');
  const [note, setNote] = useState<string>('');
  // null = leave `needed_by` as it is; a number = that many days from today.
  // Same offsets the request screen offers, so the two screens agree.
  const [neededByOffset, setNeededByOffset] = useState<number | null>(null);
  /**
   * Which of the two cards is chosen. Choosing `cancel` does NOT cancel — it
   * shows what cancelling would do. Nothing leaves this screen without the
   * confirmation below.
   */
  const [mode, setMode] = useState<'modify' | 'cancel'>('modify');

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  // Seed the form from the request once it arrives, and never again — typing
  // must not be overwritten by a background refetch.
  useEffect(() => {
    if (!request.data || quantity !== null) return;
    setQuantity(request.data.quantity);
    setUrgency(request.data.urgency as BloodUrgencyValue);
    setPhone(request.data.contact_phone ?? '');
    setNote(request.data.patient_note ?? '');
  }, [request.data, quantity]);

  const reference = request.data?.reference ?? null;
  const copyReference = useCallback(async () => {
    if (!reference) return;
    try {
      await Clipboard.setStringAsync(reference);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — say nothing rather than claim a copy.
    }
  }, [reference]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  if (request.isPending) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodModify.title')} onBack={goBack} />
        <View style={styles.centred}>
          <LoadingBlock label={t('bloodStatus.loading')} />
        </View>
      </Screen>
    );
  }

  if (request.isError || !request.data) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodModify.title')} onBack={goBack} />
        <View style={styles.centred}>
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('bloodStatus.notFoundTitle')}
              message={t('bloodStatus.notFoundBody')}
              actionLabel={t('bloodStatus.backToFinder')}
              onAction={() => router.replace('/blood-finder')}
            />
          </Card>
        </View>
      </Screen>
    );
  }

  const data = request.data;

  if (!data.is_cancellable) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('bloodModify.title')} onBack={goBack} />
        <View style={styles.centred}>
          <Card variant="flush">
            <EmptyState
              icon="lock"
              tint="amber"
              title={t('bloodModify.closedTitle')}
              message={t('bloodModify.closedBody', { status: data.status_label })}
              actionLabel={t('bloodModify.viewStatus')}
              onAction={() =>
                router.replace({ pathname: '/blood-finder/status', params: { requestId: data.id } })
              }
            />
          </Card>
        </View>
      </Screen>
    );
  }

  const submit = () => {
    amend.mutate(
      {
        id: data.id,
        quantity: quantity ?? undefined,
        urgency: urgency ?? undefined,
        contact_phone: phone.trim() === '' ? null : phone.trim(),
        note: note.trim() === '' ? null : note.trim(),
        // Untouched means untouched: sending nothing leaves the date alone,
        // rather than overwriting it with today.
        needed_by: neededByOffset === null ? undefined : isoDay(dayFromNow(neededByOffset)),
      },
      {
        onSuccess: () =>
          router.replace({ pathname: '/blood-finder/status', params: { requestId: data.id } }),
      },
    );
  };

  const confirmCancel = () =>
    dialog.confirm({
      title: t('bloodModify.cancelConfirmTitle'),
      message: t('bloodModify.cancelConfirmBody', { reference: data.reference }),
      confirmLabel: t('bloodModify.cancelConfirmAction'),
      destructive: true,
      onConfirm: () =>
        cancel.mutate({ id: data.id }, { onSuccess: () => router.replace('/blood-finder') }),
    });

  /** The 3x3 overview grid — nine real fields of the payload. */
  const facts: Fact[] = [
    {
      key: 'group',
      icon: 'droplet',
      iconColor: colors.statusCritical,
      label: t('bloodStatus.group'),
      value: data.blood_group,
    },
    {
      key: 'urgency',
      icon: 'alert-triangle',
      iconColor: data.urgency === 'emergency' ? colors.statusCritical : colors.statusWarning,
      label: t('bloodStatus.urgency'),
      value: t(`bloodFinder.urgency.${data.urgency}`, { defaultValue: data.urgency }),
      valueColor:
        data.urgency === 'emergency'
          ? colors.statusCritical
          : data.urgency === 'urgent'
            ? colors.statusWarning
            : undefined,
    },
    {
      key: 'status',
      icon: 'shield-check',
      iconColor: colors.blue,
      label: t('bloodModify.statusLabel'),
      value: data.status_label,
    },
    {
      key: 'component',
      icon: 'flask',
      iconColor: colors.statusCritical,
      label: t('bloodStatus.component'),
      value: data.component_label ?? data.component_type,
    },
    {
      key: 'units',
      icon: 'receipt',
      iconColor: colors.blue,
      label: t('bloodStatus.quantity'),
      value: t('bloodStatus.units', { count: data.quantity }),
    },
    {
      key: 'expires',
      icon: 'clock',
      iconColor: colors.statusWarning,
      label: t('bloodStatus.expiresLabel'),
      value: data.expires_at ? formatDateTime(data.expires_at) : t('bloodStatus.notGiven'),
      valueColor: data.expires_at ? colors.statusWarning : undefined,
    },
    {
      key: 'bank',
      icon: 'building',
      iconColor: colors.blue,
      label: t('bloodStatus.bank'),
      value: data.facility?.name ?? t('bloodStatus.notGiven'),
    },
    {
      key: 'neededBy',
      icon: 'calendar',
      iconColor: colors.blue,
      label: t('bloodStatus.neededBy'),
      value: data.needed_by ? formatDateTime(data.needed_by) : t('bloodStatus.notGiven'),
    },
    {
      key: 'contact',
      icon: 'phone',
      iconColor: colors.blue,
      label: t('bloodStatus.contact'),
      value: data.contact_phone ?? t('bloodStatus.notGiven'),
    },
  ];

  const quick: {
    key: string;
    icon: IconName;
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }[] = [
    {
      key: 'status',
      icon: 'activity',
      label: t('bloodModify.quick.status'),
      onPress: () =>
        router.push({ pathname: '/blood-finder/status', params: { requestId: data.id } }),
    },
    {
      key: 'copy',
      icon: 'copy',
      label: copied ? t('bloodStatus.copied') : t('bloodModify.quick.copy'),
      onPress: () => void copyReference(),
    },
    {
      key: 'call',
      icon: 'phone',
      label: t('bloodModify.quick.call'),
      onPress: () => dial(data.facility?.phone),
      disabled: !data.facility?.phone,
    },
    {
      key: 'directions',
      icon: 'location',
      label: t('bloodModify.quick.directions'),
      onPress: () => {
        if (!data.facility) return;
        router.push({ pathname: '/facility/[id]', params: { id: data.facility.id } });
      },
      disabled: !data.facility,
    },
  ];

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('bloodModify.title')}
        subtitle={t('bloodModify.subtitle', { reference: data.reference })}
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── The amber rule, at the very top, always ──────────────────────── */}
        <NoticeBanner
          icon="alert-triangle"
          tone="warning"
          title={t('bloodModify.windowTitle')}
          message={
            data.expires_at
              ? t('bloodModify.windowBody', { when: formatDateTime(data.expires_at) })
              : t('bloodModify.windowBodyNoExpiry')
          }
        />

        {/* ── Current request overview: 3 columns x 3 rows ─────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodModify.overviewTitle')} />
          <Card>
            <View style={styles.grid}>
              {chunk(facts, 3).map((row, rowIndex) => (
                <View
                  key={row.map((f) => f.key).join('-')}
                  style={[styles.gridRow, rowIndex > 0 && styles.gridRowDivider]}
                >
                  {row.map((fact, colIndex) => (
                    <View
                      key={fact.key}
                      style={[styles.gridCell, colIndex > 0 && styles.gridCellDivider]}
                      accessible
                      accessibilityLabel={`${fact.label}: ${fact.value}`}
                    >
                      <View style={styles.gridHead}>
                        <Icon name={fact.icon} size={12} color={fact.iconColor} />
                        <Text style={styles.gridLabel} numberOfLines={2}>
                          {fact.label}
                        </Text>
                      </View>
                      <Text
                        style={[styles.gridValue, !!fact.valueColor && { color: fact.valueColor }]}
                        numberOfLines={3}
                      >
                        {fact.value}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>

            {/* Why three of those nine are not on the form below. */}
            <Text style={styles.fixedNote}>{t('bloodModify.fixedExplained')}</Text>
          </Card>
        </View>

        {/* ── The choice: two cards, deliberately unequal ──────────────────── */}
        <Card>
          <Text style={styles.choiceHeading}>{t('bloodModify.choiceTitle')}</Text>
          <View style={styles.choiceRow}>
            {/* Modify — the safe one. Blue, and selected by default. */}
            <TouchableOpacity
              style={[
                styles.choiceCard,
                mode === 'modify'
                  ? { borderColor: colors.blue, backgroundColor: colors.surface }
                  : { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              onPress={() => setMode('modify')}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === 'modify' }}
              accessibilityLabel={t('bloodModify.choose.modifyTitle')}
              accessibilityHint={t('bloodModify.choose.modifyBody')}
            >
              <View style={styles.choiceHead}>
                <View style={[styles.choiceIcon, { backgroundColor: colors.tintBlueBg }]}>
                  <Icon name="pencil" size={17} color={colors.blue} />
                </View>
                <View
                  style={[
                    styles.radio,
                    mode === 'modify'
                      ? { borderColor: colors.blue, backgroundColor: colors.blue }
                      : { borderColor: colors.border },
                  ]}
                >
                  {mode === 'modify' ? (
                    <Icon name="check" size={10} color={colors.textOnBrand} strokeWidth={2.6} />
                  ) : null}
                </View>
              </View>
              <Text style={[styles.choiceTitle, { color: colors.blue }]} numberOfLines={2}>
                {t('bloodModify.choose.modifyTitle')}
              </Text>
              <Text style={styles.choiceBody}>{t('bloodModify.choose.modifyBody')}</Text>
              <View style={styles.pointList}>
                {MODIFY_POINTS.map((key) => (
                  <View key={key} style={styles.point}>
                    <Icon name="check-circle" size={13} color={colors.statusNormal} />
                    <Text style={styles.pointText} numberOfLines={2}>
                      {t(`bloodModify.modifyPoints.${key}`)}
                    </Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>

            {/* Cancel — red-tinted whether chosen or not. It releases units and
                cannot be undone, and the card is not allowed to look like a
                neutral alternative to the one beside it. */}
            <TouchableOpacity
              style={[
                styles.choiceCard,
                { backgroundColor: colors.statusCriticalBg },
                mode === 'cancel'
                  ? { borderColor: colors.statusCritical }
                  : { borderColor: colors.statusCriticalBg },
              ]}
              onPress={() => setMode('cancel')}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === 'cancel' }}
              accessibilityLabel={t('bloodModify.choose.cancelTitle')}
              accessibilityHint={t('bloodModify.cancelPoints.undone')}
            >
              <View style={styles.choiceHead}>
                <View style={[styles.choiceIcon, { backgroundColor: colors.surface }]}>
                  <Icon name="trash" size={17} color={colors.statusCritical} />
                </View>
                <View
                  style={[
                    styles.radio,
                    mode === 'cancel'
                      ? { borderColor: colors.statusCritical, backgroundColor: colors.statusCritical }
                      : { borderColor: colors.statusCritical },
                  ]}
                >
                  {mode === 'cancel' ? (
                    <Icon name="check" size={10} color={colors.textOnBrand} strokeWidth={2.6} />
                  ) : null}
                </View>
              </View>
              <Text
                style={[styles.choiceTitle, { color: colors.statusCritical }]}
                numberOfLines={2}
              >
                {t('bloodModify.choose.cancelTitle')}
              </Text>
              <Text style={styles.choiceBody}>{t('bloodModify.choose.cancelBody')}</Text>
              <View style={styles.pointList}>
                {CANCEL_POINTS.map((key) => (
                  <View key={key} style={styles.point}>
                    <Icon name="x-circle" size={13} color={colors.statusCritical} />
                    <Text style={styles.pointText} numberOfLines={3}>
                      {t(`bloodModify.cancelPoints.${key}`)}
                    </Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          </View>
        </Card>

        {mode === 'modify' ? (
          <>
            {/* ── Editable fields ──────────────────────────────────────────── */}
            <View style={styles.stack}>
              <View style={styles.badgeHeader}>
                <Text style={styles.badgeHeaderTitle} numberOfLines={1}>
                  {t('bloodModify.detailsTitle')}
                </Text>
                <StatusBadge
                  status="editable"
                  tone="normal"
                  size="sm"
                  label={t('bloodModify.editableBadge')}
                />
              </View>

              <Card>
                {/* Row of three: the urgency options as one segmented control. */}
                <Text style={styles.fieldLabel}>{t('bloodStatus.urgency')}</Text>
                <View style={styles.segmentRow}>
                  {URGENCIES.map((option) => (
                    <Chip
                      key={option.value}
                      icon={option.icon}
                      label={t(`bloodFinder.urgency.${option.value}`)}
                      selected={option.value === urgency}
                      onPress={() => setUrgency(option.value)}
                      style={styles.segment}
                    />
                  ))}
                </View>

                {/* Needed by — the reference's "Need By (Date)". Offsets rather
                    than a calendar: the API takes a date and every offer has to
                    be today or later, which a picker cannot promise on its own. */}
                <Text style={[styles.fieldLabel, styles.fieldSpacer]}>
                  {t('bloodStatus.neededBy')}
                </Text>
                <View style={styles.dayRow}>
                  <Chip
                    icon="calendar"
                    label={t('bloodModify.neededByUnchanged')}
                    selected={neededByOffset === null}
                    onPress={() => setNeededByOffset(null)}
                  />
                  {NEEDED_BY_OFFSETS.map((offset) => (
                    <Chip
                      key={offset}
                      label={
                        offset === 0
                          ? t('bloodFinder.request.neededByToday', { defaultValue: 'Today' })
                          : offset === 1
                            ? t('bloodFinder.request.neededByTomorrow', { defaultValue: 'Tomorrow' })
                            : formatDate(dayFromNow(offset))
                      }
                      selected={neededByOffset === offset}
                      onPress={() => setNeededByOffset(offset)}
                    />
                  ))}
                </View>

                {/* Row of two: the stepper beside the contact number. */}
                <View style={styles.fieldRow}>
                  <View style={styles.fieldCol}>
                    <Text style={styles.fieldLabel}>{t('bloodStatus.quantity')}</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity
                        style={[
                          styles.stepButton,
                          { backgroundColor: colors.tintBlueBg },
                          (quantity ?? 1) <= 1 && styles.stepButtonOff,
                        ]}
                        onPress={() => setQuantity((q) => Math.max(1, (q ?? 1) - 1))}
                        disabled={(quantity ?? 1) <= 1}
                        accessibilityRole="button"
                        accessibilityLabel={t('bloodModify.modifyPoints.units')}
                      >
                        <Icon name="minus" size={16} color={colors.blue} strokeWidth={2.2} />
                      </TouchableOpacity>
                      <View style={styles.stepValue}>
                        <Text style={styles.stepNumber}>{quantity ?? 1}</Text>
                        <Text style={styles.stepUnit}>{t('bloodModify.unitsWord')}</Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.stepButton,
                          { backgroundColor: colors.tintBlueBg },
                          (quantity ?? 1) >= 6 && styles.stepButtonOff,
                        ]}
                        onPress={() => setQuantity((q) => Math.min(6, (q ?? 1) + 1))}
                        disabled={(quantity ?? 1) >= 6}
                        accessibilityRole="button"
                        accessibilityLabel={t('bloodModify.modifyPoints.units')}
                      >
                        <Icon name="plus" size={16} color={colors.blue} strokeWidth={2.2} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* PillInput carries its own 16pt bottom margin and a 16px
                      face. In a 150pt column both cost more than they earn:
                      the margin knocks this column out of line with the
                      stepper, and 16px truncates "+237 6XX XXX XXX". */}
                  <View style={styles.phoneCol}>
                    <Text style={styles.fieldLabel}>{t('bloodStatus.contact')}</Text>
                    <PillInput
                      value={phone}
                      onChangeText={setPhone}
                      placeholder={t('bloodModify.phonePlaceholder')}
                      keyboardType="phone-pad"
                      accessibilityLabel={t('bloodStatus.contact')}
                      style={styles.phoneInput}
                    />
                  </View>
                </View>

                {/* Full width: the note and its counter. */}
                <Text style={[styles.fieldLabel, styles.fieldSpacer]}>{t('bloodStatus.note')}</Text>
                <View style={styles.noteWrap}>
                  <Icon name="document-text" size={16} color={colors.blue} />
                  <TextInput
                    value={note}
                    onChangeText={(value) => setNote(value.slice(0, NOTE_MAX))}
                    placeholder={t('bloodModify.notePlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={styles.noteInput}
                    accessibilityLabel={t('bloodStatus.note')}
                  />
                </View>
                <Text style={styles.counter}>{`${note.length}/${NOTE_MAX}`}</Text>
              </Card>
            </View>

            {amend.isError ? (
              <NoticeBanner
                icon="alert-circle"
                tone="critical"
                title={t('bloodModify.saveFailedTitle')}
                message={t('bloodModify.saveFailedBody')}
              />
            ) : null}

            <NoticeBanner
              icon="info"
              tone="pending"
              title={t('bloodModify.approvalTitle')}
              message={t('bloodModify.approvalBody')}
            />

            {/* Primary blue submit beside the outlined red cancel, as drawn.
                The cancel is outlined, never solid, and still confirms. */}
            <View style={styles.actionRow}>
              <CareButton
                label={amend.isPending ? t('bloodModify.saving') : t('bloodModify.save')}
                icon="check-circle"
                iconRight="chevron-right"
                variant="primary"
                disabled={amend.isPending}
                onPress={submit}
                style={styles.actionPrimary}
              />
              <CareButton
                label={t('bloodModify.cancelAction')}
                icon="trash"
                variant="danger"
                disabled={cancel.isPending}
                onPress={confirmCancel}
                style={styles.actionSecondary}
              />
            </View>
          </>
        ) : (
          <>
            {/* ── What cancelling does ─────────────────────────────────────── */}
            <View style={styles.stack}>
              <SectionHeader title={t('bloodModify.cancelPanelTitle')} />
              <Card accentColor={colors.statusCritical}>
                <Text style={styles.cancelLead}>{t('bloodModify.cancelLead')}</Text>
                {CANCEL_POINTS.map((key) => (
                  <View key={key} style={styles.cancelPoint}>
                    <Icon name="x-circle" size={16} color={colors.statusCritical} />
                    <Text style={styles.cancelText}>{t(`bloodModify.cancelPoints.${key}`)}</Text>
                  </View>
                ))}
              </Card>
            </View>

            {/* The way back out is the wider, calmer control. */}
            <View style={styles.actionRow}>
              <CareButton
                label={t('bloodModify.keep')}
                icon="check-circle"
                variant="secondary"
                onPress={() => setMode('modify')}
                style={styles.actionPrimary}
              />
              <CareButton
                label={cancel.isPending ? t('bloodModify.cancelling') : t('bloodModify.cancelAction')}
                icon="trash"
                variant="dangerSolid"
                disabled={cancel.isPending}
                onPress={confirmCancel}
                style={styles.actionSecondary}
              />
            </View>
          </>
        )}

        {/* ── Quick actions ────────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodModify.quickTitle')} />
          <View style={styles.quickRow}>
            {quick.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={[styles.quickTile, action.disabled && styles.quickTileOff]}
                onPress={action.onPress}
                disabled={action.disabled}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityState={{ disabled: !!action.disabled }}
              >
                <Icon
                  name={action.icon}
                  size={17}
                  color={action.disabled ? colors.textMuted : colors.link}
                />
                <Text
                  style={[styles.quickLabel, action.disabled && { color: colors.textMuted }]}
                  numberOfLines={2}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {dialog.element}
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.sm },
    centred: { padding: spacing.md },

    // ── 3 x 3 overview grid ────────────────────────────────────────────────
    // 311pt interior / 3 = ~103pt a cell; labels are 11px and shortened.
    grid: { marginVertical: -6 },
    gridRow: { flexDirection: 'row', alignItems: 'stretch' },
    gridRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider },
    gridCell: { flex: 1, minWidth: 0, paddingVertical: 8, paddingHorizontal: 6 },
    gridCellDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.divider },
    gridHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    gridLabel: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      color: c.textMuted,
    },
    gridValue: {
      marginTop: 2,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: 16,
      color: c.textPrimary,
    },
    fixedNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textMuted,
      marginTop: spacing.md,
    },

    // ── The two choice cards ───────────────────────────────────────────────
    choiceHeading: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
      marginBottom: spacing.sm + 2,
    },
    choiceRow: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'stretch' },
    choiceCard: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1.5,
      borderRadius: radii.md,
      padding: spacing.sm + 2,
    },
    choiceHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    choiceIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    choiceTitle: {
      marginTop: spacing.sm,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      lineHeight: 18,
    },
    choiceBody: {
      marginTop: 3,
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 15,
      color: c.textSecondary,
    },
    pointList: { marginTop: spacing.sm, gap: 5 },
    point: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
    pointText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      color: c.textSecondary,
    },

    // ── Editable fields ────────────────────────────────────────────────────
    badgeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    badgeHeaderTitle: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    fieldLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textSecondary,
      marginBottom: spacing.xs + 2,
    },
    fieldSpacer: { marginTop: spacing.md },
    fieldRow: { flexDirection: 'row', gap: spacing.sm + 2, marginTop: spacing.md },
    fieldCol: { flex: 1, minWidth: 0 },
    phoneCol: { flex: 1, minWidth: 0, marginBottom: -spacing.md },
    phoneInput: { fontSize: typography.size.sm, paddingVertical: 10 },

    dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    segmentRow: { flexDirection: 'row', gap: 6 },
    segment: { flex: 1, minWidth: 0, justifyContent: 'center', paddingHorizontal: 6 },

    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.md,
      backgroundColor: c.surface,
      padding: 5,
      minHeight: 50,
    },
    stepButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepButtonOff: { opacity: 0.4 },
    stepValue: { flex: 1, minWidth: 0, alignItems: 'center' },
    stepNumber: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: 20,
      color: c.textPrimary,
    },
    stepUnit: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 13,
      color: c.textMuted,
    },

    noteWrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      minHeight: 76,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.md,
      padding: spacing.sm + 2,
      backgroundColor: c.surface,
    },
    noteInput: {
      flex: 1,
      minWidth: 0,
      padding: 0,
      textAlignVertical: 'top',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    counter: {
      alignSelf: 'flex-end',
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      color: c.textMuted,
      marginTop: 4,
    },

    // ── Actions ────────────────────────────────────────────────────────────
    actionRow: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'stretch' },
    actionPrimary: { flex: 1.5 },
    actionSecondary: { flex: 1 },

    cancelLead: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
      marginBottom: spacing.xs,
    },
    cancelPoint: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 3 },
    cancelText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },

    // ── Quick actions: four across ─────────────────────────────────────────
    // (343 - 3 gaps of 8) / 4 = ~80pt a tile.
    quickRow: { flexDirection: 'row', gap: spacing.sm },
    quickTile: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      gap: 4,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: 4,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    quickTileOff: { opacity: 0.45 },
    quickLabel: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.medium,
      fontSize: 10,
      lineHeight: 13,
      color: c.link,
    },
  });
