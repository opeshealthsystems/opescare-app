/**
 * The app's confirm / notice sheet.
 *
 * `Alert.alert` from react-native is a no-op on react-native-web — the shipped
 * web bundle contains an empty static method — so every confirmation and every
 * failure notice was silently dropped on the surface patients actually use.
 * This is the replacement: a real bottom sheet built from `Modal`, in the same
 * visual language as the profile settings sheets, and identical on web, iOS
 * and Android.
 *
 * Usage — local to the screen, no provider needed:
 *
 *   const dialog = useDialog();
 *   dialog.confirm({
 *     title: 'End this visit?',
 *     message: 'The consultation will be closed and its record saved.',
 *     confirmLabel: 'End Visit',
 *     destructive: true,
 *     onConfirm: async () => { await endVisit(); },
 *   });
 *   …
 *   return (<View>…{dialog.element}</View>);
 *
 * An action whose `onPress` returns a promise keeps the sheet open with a
 * spinner on that button until it settles, and every other button is disabled
 * meanwhile — so a patient on a slow link cannot submit the same thing twice.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { useTranslation } from '../i18n';
import { radii, spacing, typography, type Palette } from '../theme';
import { useTheme } from '../ThemeProvider';
import { Icon, IconName } from './Icon';

export type DialogTone = 'info' | 'success' | 'warning' | 'critical';

export type DialogAction = {
  label: string;
  /** May be async; the sheet stays open with a spinner until it settles. */
  onPress?: () => void | Promise<void>;
  /** `destructive` is red, `secondary` is an outlined button. */
  variant?: 'primary' | 'destructive' | 'secondary';
};

export type DialogRequest = {
  title: string;
  message?: string;
  tone?: DialogTone;
  /** Defaults to a single "OK" that just closes the sheet. */
  actions?: DialogAction[];
  /** Text of the dismiss button; pass `null` to leave the sheet without one. */
  cancelLabel?: string | null;
};

const TONE_ICON: Record<DialogTone, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert-circle',
  critical: 'alert-circle',
};

const TONE_STATUS = {
  info: 'pending',
  success: 'normal',
  warning: 'warning',
  critical: 'critical',
} as const;

export type DialogController = {
  /** Render this inside the screen's root view. */
  element: React.ReactNode;
  /** Open the sheet. Replaces anything already showing. */
  show: (request: DialogRequest) => void;
  /** A notice with one dismiss button. */
  alert: (title: string, message?: string, tone?: DialogTone) => void;
  /** A yes/no question. */
  confirm: (options: {
    title: string;
    message?: string;
    confirmLabel: string;
    cancelLabel?: string;
    destructive?: boolean;
    tone?: DialogTone;
    onConfirm: () => void | Promise<void>;
  }) => void;
  close: () => void;
  /** True while an action from the sheet is still running. */
  busy: boolean;
};

export function useDialog(): DialogController {
  const { t } = useTranslation();
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  // Identifies the currently-open request, so an action that opens a *new*
  // sheet (a failure notice, typically) is not closed again by the action it
  // was opened from.
  const seq = useRef(0);
  const running = useRef(false);

  const show = useCallback((next: DialogRequest) => {
    seq.current += 1;
    running.current = false;
    setBusyIndex(null);
    setRequest(next);
  }, []);

  const close = useCallback(() => {
    if (running.current) return;
    seq.current += 1;
    setRequest(null);
    setBusyIndex(null);
  }, []);

  const alert = useCallback(
    (title: string, message?: string, tone: DialogTone = 'critical') =>
      show({ title, message, tone, cancelLabel: t('components.ok') }),
    [show, t]
  );

  const confirm = useCallback<DialogController['confirm']>(
    ({ title, message, confirmLabel, cancelLabel, destructive, tone, onConfirm }) =>
      show({
        title,
        message,
        tone: tone ?? (destructive ? 'warning' : 'info'),
        cancelLabel: cancelLabel ?? t('common.cancel'),
        actions: [{ label: confirmLabel, onPress: onConfirm, variant: destructive ? 'destructive' : 'primary' }],
      }),
    [show, t]
  );

  const run = useCallback(async (action: DialogAction, index: number) => {
    if (running.current) return;
    const mine = seq.current;
    running.current = true;
    setBusyIndex(index);
    try {
      await action.onPress?.();
    } finally {
      running.current = false;
      setBusyIndex(null);
      // Only dismiss if the action did not put something else on screen.
      if (seq.current === mine) {
        seq.current += 1;
        setRequest(null);
      }
    }
  }, []);

  const element = request ? (
    <DialogSheet request={request} busyIndex={busyIndex} onAction={run} onClose={close} />
  ) : null;

  return { element, show, alert, confirm, close, busy: busyIndex !== null };
}

function DialogSheet({
  request,
  busyIndex,
  onAction,
  onClose,
}: {
  request: DialogRequest;
  busyIndex: number | null;
  onAction: (action: DialogAction, index: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const tone = request.tone ?? 'info';
  const skin = statusMap[TONE_STATUS[tone]];
  const actions = request.actions ?? [];
  const busy = busyIndex !== null;
  const cancelLabel =
    request.cancelLabel === undefined
      ? actions.length
        ? t('common.cancel')
        : t('components.ok')
      : request.cancelLabel;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={busy ? undefined : onClose}
        accessibilityRole="button"
        accessibilityLabel={t('components.close')}
      />
      <View
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
        accessibilityViewIsModal
        accessibilityRole="alert"
      >
        <View style={styles.grab} />
        <View style={styles.head}>
          <View style={[styles.mark, { backgroundColor: skin.bg }]}>
            <Icon name={TONE_ICON[tone]} size={22} color={skin.fg} />
          </View>
          <View style={styles.headText}>
            <Text style={styles.title}>{request.title}</Text>
          </View>
        </View>

        {!!request.message && (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
            <Text style={styles.message}>{request.message}</Text>
          </ScrollView>
        )}

        <View style={styles.actions}>
          {actions.map((a, i) => (
            <DialogButton
              key={`${a.label}-${i}`}
              action={a}
              loading={busyIndex === i}
              disabled={busy && busyIndex !== i}
              onPress={() => onAction(a, i)}
            />
          ))}
          {cancelLabel !== null && (
            <DialogButton
              action={{ label: cancelLabel, variant: 'secondary' }}
              loading={false}
              disabled={busy}
              onPress={onClose}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeFill = (
  colors: Palette,
): Record<NonNullable<DialogAction['variant']>, { bg: string; fg: string; border: string }> => ({
  primary: { bg: colors.blue, fg: colors.textOnBrand, border: colors.blue },
  destructive: { bg: colors.statusCritical, fg: colors.textOnBrand, border: colors.statusCritical },
  secondary: { bg: colors.surface, fg: colors.link, border: colors.border },
});

function DialogButton({
  action,
  loading,
  disabled,
  onPress,
}: {
  action: DialogAction;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const FILL = useMemo(() => makeFill(colors), [colors]);
  const skin = FILL[action.variant ?? 'primary'];
  const off = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      style={[styles.button, { backgroundColor: skin.bg, borderColor: skin.border }, off && styles.buttonOff]}
    >
      {loading ? (
        <ActivityIndicator color={skin.fg} size="small" />
      ) : (
        <Text style={[styles.buttonLabel, { color: skin.fg }]}>{action.label}</Text>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,26,92,0.35)' },
  sheet: {
    // Opaque page colour, NOT `colors.background` — that is now transparent
    // (the watermark sits behind screen roots), and this sheet floats in a
    // `<Modal transparent>` with no opaque layer behind it, so a transparent
    // fill let the screen bleed through. `page` is the opaque colour
    // `background` used to be, so the sheet looks exactly as before.
    backgroundColor: colors.page,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '86%',
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
  mark: { width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    lineHeight: typography.lineHeight.lg,
    color: colors.textPrimary,
  },
  scroll: { flexGrow: 0 },
  body: { paddingBottom: spacing.sm },
  message: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },
  actions: { gap: spacing.sm, paddingTop: spacing.sm },
  button: {
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  buttonOff: { opacity: 0.5 },
  buttonLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md },
});
