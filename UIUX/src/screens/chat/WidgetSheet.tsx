/**
 * WGT-001 — the composer's attachment button.
 *
 * Two sheets: a picker of the workflows the server says this patient may
 * attach, then a form the server describes field by field. Nothing about any
 * individual workflow lives here — no appointment logic, no prescription
 * fields — so a workflow added to the server registry appears in this sheet
 * with no change to this file.
 *
 * Submitting posts to the widget endpoint, which writes the real module record
 * and returns the persisted message. That message is handed straight back to
 * the thread, so what the user sees is the row, not an optimistic guess.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  fetchChatWidgetForm,
  fetchChatWidgets,
  runChatWidget,
  type ChatWidgetForm,
  type ChatWidgetSummary,
  type PortalMessage,
  type WidgetField,
  type WidgetOption,
  type WidgetValues,
} from '../../api';
import { Icon, IconName } from '../../components';
import { useTranslation } from '../../i18n';
import { colors, radii, spacing, typography, Tint } from '../../theme/theme';
import { errorMessage } from './shared';

type Props = {
  visible: boolean;
  threadId: string;
  onClose: () => void;
  /** The persisted message the workflow produced. */
  onCompleted: (message: PortalMessage) => void;
};

export function WidgetSheet({ visible, threadId, onClose, onCompleted }: Props) {
  const { t } = useTranslation();
  const [widgets, setWidgets] = useState<ChatWidgetSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [active, setActive] = useState<ChatWidgetSummary | null>(null);

  useEffect(() => {
    if (!visible || widgets) return;
    let alive = true;
    fetchChatWidgets()
      .then((rows) => alive && setWidgets(rows))
      .catch((e) => alive && setListError(errorMessage(e, t('chat.widgets.unavailable'))));
    return () => {
      alive = false;
    };
  }, [visible, widgets, t]);

  const close = useCallback(() => {
    setActive(null);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable
        style={styles.backdrop}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={t('chat.widgets.closeSheetA11y')}
      />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        {active ? (
          <WidgetForm
            threadId={threadId}
            widget={active}
            onBack={() => setActive(null)}
            onCompleted={(m) => {
              setActive(null);
              onCompleted(m);
            }}
          />
        ) : (
          <>
            <Text style={styles.sheetTitle}>{t('chat.widgets.title')}</Text>
            <Text style={styles.sheetNote}>{t('chat.widgets.note')}</Text>
            {!!listError && <Text style={styles.error}>{listError}</Text>}
            {!widgets && !listError && <ActivityIndicator color={colors.link} style={styles.loader} />}
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {(widgets ?? []).map((w) => (
                <TouchableOpacity
                  key={w.id}
                  style={styles.row}
                  activeOpacity={0.8}
                  onPress={() => setActive(w)}
                  accessibilityRole="button"
                  accessibilityLabel={w.label}
                >
                  <View style={[styles.rowIcon, { backgroundColor: tintBg(w.tint) }]}>
                    <Icon name={w.icon as IconName} size={20} color={tintFg(w.tint)} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{w.label}</Text>
                    <Text style={styles.rowText}>{w.description}</Text>
                    <Text style={styles.rowModule}>{t('chat.widgets.savedIn', { module: w.module })}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
              {widgets?.length === 0 && (
                <Text style={styles.rowText}>{t('chat.widgets.none')}</Text>
              )}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

/** The server-described form for one workflow. */
function WidgetForm({
  threadId,
  widget,
  onBack,
  onCompleted,
}: {
  threadId: string;
  widget: ChatWidgetSummary;
  onBack: () => void;
  onCompleted: (message: PortalMessage) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ChatWidgetForm | null>(null);
  const [values, setValues] = useState<WidgetValues>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<WidgetField | null>(null);

  const load = useCallback(
    (next: WidgetValues) => {
      setError(null);
      fetchChatWidgetForm(threadId, widget.id, next)
        .then(setForm)
        .catch((e) => setError(errorMessage(e, t('chat.widgets.loadFailed'))));
    },
    // `t` belongs in the list (rule 3) or the memo keeps the English text.
    [threadId, widget.id, t]
  );

  useEffect(() => {
    load({});
  }, [load]);

  const setValue = (field: WidgetField, value: string) => {
    // A field that narrows later ones invalidates whatever depended on it.
    const cleared: WidgetValues = { ...values, [field.key]: value };
    if (field.refreshes) {
      form?.fields.forEach((f) => {
        if (f.depends_on === field.key) delete cleared[f.key];
      });
    }
    setValues(cleared);
    if (field.refreshes) load(cleared);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onCompleted(await runChatWidget(threadId, widget.id, values));
    } catch (e) {
      setError(errorMessage(e, t('chat.widgets.submitFailed')));
    } finally {
      setBusy(false);
    }
  };

  const missing = (form?.fields ?? []).some((f) => f.required && !values[f.key]);

  return (
    <>
      <View style={styles.formHead}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel={t('chat.widgets.back')}>
          <Icon name="chevron-left" size={22} color={colors.link} />
        </TouchableOpacity>
        <View style={styles.rowBody}>
          <Text style={styles.sheetTitle}>{widget.label}</Text>
          <Text style={styles.rowModule}>{t('chat.widgets.savedIn', { module: widget.module })}</Text>
        </View>
      </View>

      {!form && !error && <ActivityIndicator color={colors.link} style={styles.loader} />}
      {!!error && <Text style={styles.error}>{error}</Text>}

      <ScrollView style={styles.list} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        {(form?.fields ?? []).map((field) => (
          <FieldView
            key={field.key}
            field={field}
            value={values[field.key] == null ? '' : String(values[field.key])}
            onChange={(v) => setValue(field, v)}
            onPick={() => setPicking(field)}
          />
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[styles.submit, (busy || missing || !form) && styles.submitOff]}
        onPress={submit}
        disabled={busy || missing || !form}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={form?.submit_label ?? t('chat.widgets.send')}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.textOnBrand} />
        ) : (
          <Text style={styles.submitText}>{form?.submit_label ?? t('chat.widgets.send')}</Text>
        )}
      </TouchableOpacity>

      <OptionPicker
        field={picking}
        onClose={() => setPicking(null)}
        onSelect={(option) => {
          if (picking) setValue(picking, option);
          setPicking(null);
        }}
      />
    </>
  );
}

function FieldView({
  field,
  value,
  onChange,
  onPick,
}: {
  field: WidgetField;
  value: string;
  onChange: (v: string) => void;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  // `field.label` is the server's wording — only the "(optional)" marker is ours.
  const label = field.required ? field.label : t('chat.widgets.optionalLabel', { label: field.label });

  if (field.type === 'select') {
    const options = field.options ?? [];
    const chosen = options.find((o) => o.value === value);
    const blocked = options.length === 0;

    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TouchableOpacity
          style={[styles.input, styles.inputRow, blocked && !field.allow_custom && styles.inputOff]}
          onPress={blocked && !field.allow_custom ? undefined : onPick}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Text style={[styles.inputText, !chosen && !value && styles.placeholder]} numberOfLines={1}>
            {chosen?.label ?? value ?? ''}
            {!chosen && !value ? field.placeholder ?? t('chat.widgets.choose') : ''}
          </Text>
          <Icon name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        {blocked && !!field.empty_note && <Text style={styles.fieldNote}>{field.empty_note}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, field.type === 'textarea' && styles.textarea]}
        value={value}
        onChangeText={onChange}
        placeholder={field.placeholder ?? (field.type === 'date' ? t('chat.widgets.datePlaceholder') : '')}
        placeholderTextColor={colors.textMuted}
        multiline={field.type === 'textarea'}
        keyboardType={field.type === 'number' ? 'number-pad' : 'default'}
        // Clinical form answers, not saved credentials or contact details —
        // the keyboard must not offer to autofill them.
        autoComplete="off"
        textContentType="none"
        accessibilityLabel={label}
      />
    </View>
  );
}

/** The choice list for a select field, with search and optional free text. */
function OptionPicker({
  field,
  onClose,
  onSelect,
}: {
  field: WidgetField | null;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  useEffect(() => {
    setQuery('');
  }, [field?.key]);

  if (!field) return null;

  const all = field.options ?? [];
  const needle = query.trim().toLowerCase();
  const shown: WidgetOption[] = needle
    ? all.filter((o) => o.label.toLowerCase().includes(needle))
    : all;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>{field.label}</Text>
        {(field.searchable || field.allow_custom) && (
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder={field.allow_custom ? t('chat.widgets.searchOrType') : t('chat.widgets.search')}
            placeholderTextColor={colors.textMuted}
            autoComplete="off"
            textContentType="none"
            accessibilityRole="search"
            accessibilityLabel={field.allow_custom ? t('chat.widgets.searchOrType') : t('chat.widgets.search')}
          />
        )}
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {field.allow_custom && !!query.trim() && (
            <TouchableOpacity
              style={styles.option}
              onPress={() => onSelect(query.trim())}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('chat.widgets.useCustom', { value: query.trim() })}
            >
              <Text style={styles.optionLabel}>{t('chat.widgets.useCustom', { value: query.trim() })}</Text>
            </TouchableOpacity>
          )}
          {shown.map((o) => (
            <TouchableOpacity
              key={o.value}
              style={styles.option}
              onPress={() => onSelect(o.value)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={o.label}
            >
              <Text style={styles.optionLabel}>{o.label}</Text>
              {!!o.meta && <Text style={styles.optionMeta}>{o.meta}</Text>}
            </TouchableOpacity>
          ))}
          {shown.length === 0 && (
            <Text style={styles.fieldNote}>{field.empty_note ?? t('chat.widgets.nothingToChoose')}</Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const TINTS: Record<string, { bg: string; fg: string }> = {
  blue: { bg: colors.primarySoft, fg: colors.link },
  green: { bg: colors.statusNormalBg, fg: colors.statusNormal },
  amber: { bg: colors.statusWarningBg, fg: colors.statusWarning },
  red: { bg: colors.statusCriticalBg, fg: colors.statusCritical },
  purple: { bg: colors.primarySoft, fg: colors.link },
};

const tintBg = (tint: string) => (TINTS[tint] ?? TINTS.blue).bg;
const tintFg = (tint: string) => (TINTS[tint] ?? TINTS.blue).fg;

export type { Tint };

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '86%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.divider,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  sheetNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  loader: { paddingVertical: spacing.lg },
  list: { flexGrow: 0 },
  listContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  formContent: { gap: spacing.md, paddingBottom: spacing.md },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    padding: spacing.sm + 2,
    borderRadius: radii.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  rowText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  rowModule: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.4,
    color: colors.link,
  },

  formHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  field: { gap: 6 },
  fieldLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  fieldNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    // `colors.background` is now transparent (watermark redesign); use the
    // opaque surface fill so the field reads as a filled input, not see-through.
    backgroundColor: colors.surface,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  inputOff: { opacity: 0.55 },
  inputText: { flex: 1, fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textPrimary },
  placeholder: { color: colors.textMuted },
  textarea: { minHeight: 84, textAlignVertical: 'top' },

  option: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 2,
  },
  optionLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  optionMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  submit: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 4,
    borderRadius: radii.sm + 2,
    backgroundColor: colors.primary,
  },
  submitOff: { opacity: 0.5 },
  submitText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textOnBrand,
  },
  error: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.statusCritical,
  },
});
