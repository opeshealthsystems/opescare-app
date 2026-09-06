/**
 * Chrome shared by the result-action sheets (`components/results/*`).
 *
 * The same visual language as the kit's `Dialog` bottom sheet — a scrim, a
 * grab handle, a toned mark + title, a scrolling body and a stack of
 * buttons — because the clinician met that sheet for every confirmation
 * before this one. The kit's `Dialog` takes a `message` string only; these
 * sheets need form fields, so the shell is reproduced here from the same
 * tokens rather than forking the kit component.
 *
 * Built from RN `Modal` only (identical on iOS, Android and the web build).
 * `KeyboardAvoidingView` keeps the focused field above the keyboard on iOS;
 * Android resizes the window itself.
 */
import React, { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Icon,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';

/** `opesDoctor.<key>` with an English default — the screens' `tx`. */
export type ResultTx = (key: string, defaultValue: string, params?: Record<string, unknown>) => string;

export type SheetShellProps = {
  visible: boolean;
  /** Called on scrim tap, hardware back and (web) Escape. Ignored while `busy`. */
  onClose: () => void;
  busy?: boolean;
  icon: IconName;
  tone?: StatusTone;
  title: string;
  /** One line under the title — who and what this is about. */
  lead?: string;
  children: React.ReactNode;
  /** The button stack, rendered outside the scroll so it never hides. */
  actions: React.ReactNode;
  /** Spoken label of the scrim. */
  closeLabel: string;
};

export function SheetShell({
  visible,
  onClose,
  busy = false,
  icon,
  tone = 'pending',
  title,
  lead,
  children,
  actions,
  closeLabel,
}: SheetShellProps) {
  const insets = useSafeAreaInsets();
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = statusMap[tone];

  if (!visible) return null;

  return (
    // `onRequestClose` is always a function (Android warns otherwise); it is
    // simply a no-op while a write is in flight.
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={busy ? undefined : onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
          accessibilityViewIsModal
        >
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={[styles.mark, { backgroundColor: skin.bg }]}>
              <Icon name={icon} size={22} color={skin.fg} />
            </View>
            <View style={styles.headText}>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              {!!lead && <Text style={styles.lead}>{lead}</Text>}
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          <View style={styles.actions}>{actions}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Form primitives ───────────────────────────────────────────────────────

/** A field's caption, with an optional right-hand counter. */
export function FieldLabel({
  label,
  trailing,
  style,
}: {
  label: string;
  trailing?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.labelRow, style]}>
      <Text style={styles.label}>{label}</Text>
      {!!trailing && <Text style={styles.counter}>{trailing}</Text>}
    </View>
  );
}

/** Helper copy under a field. `tone` colours it when it carries a warning. */
export function FieldHelper({ text, tone }: { text: string; tone?: 'muted' | 'warning' }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Text style={[styles.helper, tone === 'warning' && { color: colors.statusWarning }]}>{text}</Text>
  );
}

/**
 * A multi-line note box in the kit's input tokens. The kit's `PillInput` is a
 * single-line pill — a 1000-character note in a pill reads badly, so long
 * text gets a rounded rectangle with the same border, focus and error colours.
 */
export function NoteField({
  error,
  minHeight = 96,
  style,
  ...rest
}: TextInputProps & { error?: string | null; minHeight?: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={styles.noteWrap}>
      <TextInput
        multiline
        textAlignVertical="top"
        placeholderTextColor={colors.textMuted}
        aria-invalid={!!error}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          styles.note,
          { minHeight },
          focused && styles.noteFocused,
          !!error && styles.noteError,
          style,
        ]}
      />
      {!!error && (
        <Text style={styles.errorText} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    fill: { flex: 1 },
    backdrop: { flex: 1, backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.page,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      maxHeight: '92%',
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
    lead: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    scroll: { flexGrow: 0 },
    body: { paddingBottom: spacing.sm, gap: spacing.xs },
    actions: { gap: spacing.sm, paddingTop: spacing.sm },

    labelRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    label: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    counter: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    helper: {
      marginTop: 2,
      marginBottom: spacing.xs,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    noteWrap: { minWidth: 0 },
    note: {
      minWidth: 0,
      borderWidth: 1.4,
      borderColor: colors.border,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md - 2,
      paddingVertical: spacing.sm + 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: colors.textPrimary,
    },
    noteFocused: { borderColor: colors.borderFocus },
    noteError: { borderColor: colors.danger },
    errorText: {
      color: colors.danger,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      marginTop: 4,
      marginLeft: spacing.sm,
    },
  });
