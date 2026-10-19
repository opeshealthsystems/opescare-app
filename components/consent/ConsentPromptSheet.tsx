/**
 * The consent prompt — presentation only.
 *
 * A bottom sheet in the same visual language as the kit `Dialog` (a `Modal`,
 * not `Alert.alert`, which is a silent no-op on react-native-web), opened by
 * `ConsentPromptWatcher` when a clinician asks to open the patient's record.
 * It says who is asking, from where, why, which parts of the record, for how
 * long and by when an answer is needed — then Approve / Deny / Decide later.
 *
 * Every word the patient reads about the request itself comes from the
 * server, in their language (`purpose_label`, `scope_items[].label`,
 * `duration_label` — see the note on `ConsentRequestItem`). Where a server is
 * old enough not to send labels the raw code is shown AS the label with the
 * standing caution (`consentCopy.unnamedCode`), never a name invented here.
 *
 * Glyphs are kit `<Icon>`s; colours are palette tokens; strings are
 * `consentPrompt.*` plus the `privacy.*` / `consentCopy.*` vocabulary the
 * Privacy & Data hub already uses, so the prompt and the hub say the same
 * thing about the same request.
 */
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Chip,
  Icon,
  formatDateTime,
  formatLabel,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { useReducedMotion } from '@/components/health-id/motion';
import type { ConsentRequestItem, VocabularyItem } from '@/lib/api/queries';

export type ConsentPromptOutcome = {
  kind: 'approved' | 'denied' | 'failed';
  message: string;
};

export type ConsentPromptBusy = 'approve' | 'deny' | null;

export interface ConsentPromptSheetProps {
  request: ConsentRequestItem;
  /** Requests still waiting behind this one. */
  morePending: number;
  outcome: ConsentPromptOutcome | null;
  busy: ConsentPromptBusy;
  onApprove: () => void;
  onDeny: () => void;
  onLater: () => void;
  /** After an outcome: dismiss, and let the next request (if any) come up. */
  onClose: () => void;
  onOpenInbox: () => void;
}

// ── Vocabulary helpers (shared with the watcher) ─────────────────────────────

/** Facility name: the nested object newer servers send, the flat field older ones do. */
export function facilityNameOf(t: TFunction, item: ConsentRequestItem): string {
  return (
    item.requesting_facility?.name?.trim() ||
    item.requesting_facility_name?.trim() ||
    t('privacy.unknownFacility')
  );
}

export function requesterNameOf(t: TFunction, item: ConsentRequestItem): string {
  return item.requesting_user?.name?.trim() || t('consentPrompt.unnamedRequester');
}

/** The requester's role in the patient's language; the raw token, tidied, when the app has no word for it. */
export function requesterRoleOf(t: TFunction, item: ConsentRequestItem): string | null {
  const role = item.requesting_user?.role?.trim();
  if (!role) return null;
  return t(`consentPrompt.roles.${role}`, { defaultValue: formatLabel(role) });
}

/**
 * How long the access would last. The server's own wording first; otherwise
 * the minutes are framed in the largest whole unit so "1440 min" never
 * reaches a patient.
 */
export function durationTextOf(t: TFunction, item: ConsentRequestItem): string {
  if (item.duration_label?.trim()) return item.duration_label;
  const minutes = item.duration_minutes;
  if (!minutes || minutes <= 0) return t('consentCopy.durationUnknown');
  if (minutes % 1440 === 0) return t('consentPrompt.durationDays', { count: minutes / 1440 });
  if (minutes % 60 === 0) return t('consentPrompt.durationHours', { count: minutes / 60 });
  return t('consentPrompt.durationMinutes', { count: minutes });
}

/**
 * The record parts to show as chips, plus the caution that goes under them.
 * Same precedence as the Privacy & Data hub: `scope_items` (labelled and
 * flagged), then `scope_labels` aligned with `requested_scope`, then the raw
 * codes marked unrecognised.
 */
export function scopeViewOf(
  t: TFunction,
  item: ConsentRequestItem,
): { items: VocabularyItem[]; note: string | null } {
  if (item.scope_items && item.scope_items.length > 0) {
    return { items: item.scope_items, note: item.scope_note ?? null };
  }
  const codes = item.requested_scope ?? [];
  if (codes.length === 0) return { items: [], note: null };

  const labels = item.scope_labels ?? [];
  if (labels.length === codes.length && labels.every((label) => typeof label === 'string' && label.trim())) {
    return { items: codes.map((code, i) => ({ code, label: labels[i], recognised: true })), note: null };
  }
  return {
    items: codes.map((code) => ({ code, label: code, recognised: false })),
    note: t('consentCopy.unnamedCode'),
  };
}

// ── The sheet ────────────────────────────────────────────────────────────────

export function ConsentPromptSheet({
  request,
  morePending,
  outcome,
  busy,
  onApprove,
  onDeny,
  onLater,
  onClose,
  onOpenInbox,
}: ConsentPromptSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();

  const facility = facilityNameOf(t, request);
  const requester = requesterNameOf(t, request);
  const role = requesterRoleOf(t, request);
  const purpose = request.purpose_label?.trim() || formatLabel(request.purpose);
  const scope = scopeViewOf(t, request);
  const duration = durationTextOf(t, request);
  const answerBy = request.expires_at ? formatDateTime(request.expires_at) : '';

  const isBusy = busy !== null;
  const decided = outcome !== null && outcome.kind !== 'failed';

  const outcomeSkin =
    outcome?.kind === 'approved'
      ? { ...statusMap.normal, icon: 'check-circle' as IconName }
      : outcome?.kind === 'denied'
        ? { ...statusMap.neutral, icon: 'x-circle' as IconName }
        : { ...statusMap.critical, icon: 'alert-circle' as IconName };

  return (
    <Modal
      visible
      transparent
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={isBusy ? undefined : decided ? onClose : onLater}
    >
      <Pressable
        style={styles.backdrop}
        onPress={isBusy ? undefined : decided ? onClose : onLater}
        accessibilityRole="button"
        accessibilityLabel={decided ? t('consentPrompt.close') : t('consentPrompt.later')}
      />
      <View
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
        accessibilityViewIsModal
        accessibilityRole="alert"
        accessibilityLabel={t('consentPrompt.sheetLabel', { facility })}
      >
        <View style={styles.grab} />

        <View style={styles.head}>
          <View style={styles.mark}>
            <Icon name="shield-check" size={24} color={colors.tintBlue} />
          </View>
          <View style={styles.headText}>
            <Text style={styles.overline}>{t('consentPrompt.overline')}</Text>
            <Text style={styles.title}>{t('consentPrompt.title')}</Text>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.body} bounces={false}>
          <View style={styles.requester}>
            <View style={styles.requesterRow}>
              <Icon name="person" size={16} color={colors.textSecondary} />
              <View style={styles.requesterText}>
                <Text style={styles.label}>{t('consentPrompt.requestedBy')}</Text>
                <Text style={styles.value}>
                  {requester}
                  {role ? <Text style={styles.valueMuted}>{`  ·  ${role}`}</Text> : null}
                </Text>
              </View>
            </View>
            <View style={styles.requesterRow}>
              <Icon name="building" size={16} color={colors.textSecondary} />
              <View style={styles.requesterText}>
                <Text style={styles.label}>{t('consentPrompt.facilityLabel')}</Text>
                <Text style={styles.value}>{facility}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.label}>{t('privacy.purposeLabel')}</Text>
          <Text style={styles.value}>{purpose}</Text>
          {request.purpose_recognised === false ? (
            <Text style={styles.caution}>{t('consentCopy.unnamedPurpose')}</Text>
          ) : null}
          {request.purpose_note ? <Text style={styles.caution}>{request.purpose_note}</Text> : null}

          <Text style={[styles.label, styles.labelSpaced]}>{t('privacy.scopeLabel')}</Text>
          {scope.items.length === 0 ? (
            <Text style={styles.value}>{t('privacy.scopeUnspecified')}</Text>
          ) : (
            <View style={styles.chips} accessibilityRole="list">
              {scope.items.map((part) => (
                <Chip
                  key={part.code}
                  label={part.label}
                  icon={part.recognised ? 'lock' : 'help-circle'}
                  accessibilityLabel={part.label}
                />
              ))}
            </View>
          )}
          {scope.note ? <Text style={styles.caution}>{scope.note}</Text> : null}

          <View style={styles.facts}>
            <View style={styles.fact}>
              <Icon name="clock" size={16} color={colors.textSecondary} />
              <View style={styles.factText}>
                <Text style={styles.label}>{t('consentPrompt.durationLabel')}</Text>
                <Text style={styles.value}>{duration}</Text>
              </View>
            </View>
            {answerBy ? (
              <View style={styles.fact}>
                <Icon name="calendar" size={16} color={colors.textSecondary} />
                <View style={styles.factText}>
                  <Text style={styles.label}>{t('consentPrompt.expiresLabel')}</Text>
                  <Text style={styles.value}>{answerBy}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <Text style={styles.footnote}>{t('consentPrompt.nothingShared')}</Text>

          {outcome ? (
            <View
              style={[styles.outcome, { backgroundColor: outcomeSkin.bg }]}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Icon name={outcomeSkin.icon} size={18} color={outcomeSkin.fg} />
              <Text style={[styles.outcomeText, { color: outcomeSkin.fg }]}>{outcome.message}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          {decided ? (
            <>
              {morePending > 0 ? (
                <Text style={styles.more}>{t('consentPrompt.morePending', { count: morePending })}</Text>
              ) : null}
              <SheetButton
                label={morePending > 0 ? t('consentPrompt.next') : t('consentPrompt.close')}
                icon={morePending > 0 ? 'arrow-right' : 'check'}
                onPress={onClose}
                bg={colors.blue}
                fg={colors.textOnBrand}
                border={colors.blue}
              />
              <TextButton label={t('consentPrompt.openInbox')} onPress={onOpenInbox} color={colors.link} />
            </>
          ) : (
            <>
              <SheetButton
                label={t('privacy.approve')}
                icon="check"
                onPress={onApprove}
                loading={busy === 'approve'}
                disabled={isBusy}
                bg={colors.statusNormal}
                fg={colors.textOnBrand}
                border={colors.statusNormal}
              />
              <SheetButton
                label={t('privacy.deny')}
                icon="close"
                onPress={onDeny}
                loading={busy === 'deny'}
                disabled={isBusy}
                bg={colors.surface}
                fg={colors.statusCritical}
                border={colors.statusCritical}
              />
              <TextButton
                label={t('consentPrompt.later')}
                hint={t('consentPrompt.laterHint')}
                onPress={onLater}
                disabled={isBusy}
                color={colors.link}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────

function SheetButton({
  label,
  icon,
  onPress,
  loading,
  disabled,
  bg,
  fg,
  border,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  bg: string;
  fg: string;
  border: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const off = !!disabled || !!loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!loading }}
      style={[styles.button, { backgroundColor: bg, borderColor: border }, off && !loading && styles.buttonOff]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          <Icon name={icon} size={18} color={fg} />
          <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

function TextButton({
  label,
  hint,
  onPress,
  disabled,
  color,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
  color: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.textButton, disabled && styles.buttonOff]}
    >
      <Text style={[styles.textButtonLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay },
    sheet: {
      // Opaque page colour: `background` is transparent by design and this
      // floats in a transparent Modal with nothing opaque behind it.
      backgroundColor: colors.page,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      maxHeight: '90%',
    },
    grab: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: radii.pill,
      backgroundColor: colors.border,
      marginBottom: spacing.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, paddingBottom: spacing.sm },
    mark: {
      width: 44,
      height: 44,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headText: { flex: 1, minWidth: 0 },
    overline: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.tintBlue,
    },
    title: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textPrimary,
    },
    scroll: { flexGrow: 0 },
    body: { paddingBottom: spacing.sm, gap: 4 },
    requester: {
      gap: spacing.sm,
      padding: spacing.sm + 4,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    requesterRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    requesterText: { flex: 1, minWidth: 0 },
    label: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    labelSpaced: { marginTop: spacing.sm },
    value: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    valueMuted: {
      fontFamily: typography.fontFamily.regular,
      color: colors.textSecondary,
    },
    caution: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.statusWarning,
      marginTop: 2,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, marginTop: 4 },
    facts: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
    fact: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs + 2 },
    factText: { flex: 1, minWidth: 0 },
    footnote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
      marginTop: spacing.sm,
    },
    outcome: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm + 4,
      borderRadius: radii.md,
      marginTop: spacing.sm,
    },
    outcomeText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
    },
    actions: { gap: spacing.sm, paddingTop: spacing.sm },
    more: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    button: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs + 2,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
    },
    buttonOff: { opacity: 0.5 },
    buttonLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    textButton: { alignSelf: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
    textButtonLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
  });
