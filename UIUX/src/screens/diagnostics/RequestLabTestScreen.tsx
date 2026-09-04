/**
 * DIA-006 — Request a Lab Test.
 *
 * CONTRACTS — this screen is built on the one write path the server actually
 * gives a patient for a laboratory test, the `lab_order` chat workflow:
 *   • GET  /patient/messages/widgets                    → the workflow exists
 *   • GET  /patient/messages/threads                    → whom to send it to
 *   • GET  /patient/messages/threads/{t}/widgets/lab_order/form
 *       → LabOrderWidget::fields(): `test` (searchable select over the live
 *         `lab_tests` catalogue, each option carrying its category/specimen as
 *         `meta`), `priority` (routine | urgent | stat) and `clinical_notes`
 *         ("Why you want this test"). Typing ≥2 characters re-queries the
 *         catalogue server-side, so the search is the server's, not a local
 *         filter over a truncated list.
 *   • POST /patient/messages/threads/{t}/widgets/lab_order
 *       → LabOrderWidget::run() on the patient branch files a
 *         `patient_lab_requests` row with status `submitted` that a clinician
 *         must approve, and posts the request into the conversation.
 *
 * That approval step is the honest framing, and the screen says so: a patient
 * cannot place a laboratory order, only ask for one. The reference design's
 * "Change Patient", "Ordering Provider" picker, multi-test basket, sample type,
 * collection date, fasting toggle, patient instructions and "Save as Draft" are
 * a CLINICIAN order-entry form; none has a patient endpoint behind it, so none
 * is drawn here rather than shipped as a control that goes nowhere.
 */
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  fetchChatWidgetForm,
  fetchChatWidgets,
  fetchThreads,
  runChatWidget,
  type ChatWidgetForm,
  type PortalThread,
  type WidgetOption,
} from '../../api';
import { Card, EmptyState, Icon, ListRow, ScreenHeader, SegmentedTabs, useDialog } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  AsyncBoundary,
  DiagButton,
  HeroBand,
  InfoStrip,
  Overline,
  titleCase,
  useAsync,
} from './shared';

const WIDGET_ID = 'lab_order';
const NOTE_LIMIT = 2000;

type Setup = {
  /** The conversations this request could be sent to. */
  threads: PortalThread[];
  /** The workflow's form for the first usable thread. */
  form: ChatWidgetForm | null;
};

function optionsFor(form: ChatWidgetForm | null, key: string): WidgetOption[] {
  return form?.fields.find((f) => f.key === key)?.options ?? [];
}

export function RequestLabTestScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const dialog = useDialog();

  const [threadId, setThreadId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [test, setTest] = useState<string | null>(null);
  const [priority, setPriority] = useState('routine');
  const [notes, setNotes] = useState('');
  const [catalogue, setCatalogue] = useState<WidgetOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const load = useCallback(async (): Promise<Setup> => {
    const widgets = await fetchChatWidgets();
    if (!widgets.some((w) => w.id === WIDGET_ID && w.audiences.includes('patient'))) {
      return { threads: [], form: null };
    }

    const page = await fetchThreads({ status: 'open', per_page: 50 });
    const threads = page.data;
    const first = threads[0];
    const form = first ? await fetchChatWidgetForm(first.id, WIDGET_ID) : null;
    return { threads, form };
  }, []);

  const state = useAsync<Setup>(load, []);
  const form = state.data?.form ?? null;

  // Adopt the first conversation once the setup lands.
  useEffect(() => {
    if (!threadId && state.data?.threads.length) setThreadId(state.data.threads[0].id);
  }, [state.data, threadId]);

  useEffect(() => {
    if (catalogue === null && form) setCatalogue(optionsFor(form, 'test'));
  }, [form, catalogue]);

  /**
   * The catalogue search is the server's: ≥2 characters re-requests the form,
   * which re-queries `lab_tests`. Below that we show the default page the
   * server already sent.
   */
  useEffect(() => {
    if (!threadId || !form) return;
    const term = query.trim();
    let cancelled = false;

    if (term.length < 2) {
      setCatalogue(optionsFor(form, 'test'));
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      fetchChatWidgetForm(threadId, WIDGET_ID, { test: term })
        .then((next) => {
          if (!cancelled) setCatalogue(optionsFor(next, 'test'));
        })
        .catch(() => {
          if (!cancelled) setCatalogue([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, threadId, form]);

  const priorityOptions = optionsFor(form, 'priority');
  const notesLabel =
    form?.fields.find((f) => f.key === 'clinical_notes')?.label ??
    t('diagnostics.request.notesLabelFallback');
  const ready = !!threadId && !!test && !!priority;

  async function submit() {
    if (submittingRef.current || !ready || !threadId || !test) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const message = await runChatWidget(threadId, WIDGET_ID, {
        test,
        priority,
        clinical_notes: notes.trim() || null,
      });
      dialog.show({
        title: t('diagnostics.request.sentTitle'),
        message: t('diagnostics.request.sentBody'),
        tone: 'success',
        cancelLabel: t('diagnostics.request.sentClose'),
        actions: [
          {
            label: t('diagnostics.request.openConversation'),
            onPress: () => navigation.navigate('MessageThread', { threadId: message.thread_id ?? threadId }),
          },
        ],
      });
      setTest(null);
      setNotes('');
      setQuery('');
    } catch (e) {
      dialog.alert(
        t('diagnostics.request.failTitle'),
        writeFailureMessage(
          e,
          t('diagnostics.request.failHint'),
          t('diagnostics.request.failFallback')
        )
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('diagnostics.request.title')}
        align="center"
        actions={[
          { icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications') },
          { icon: 'more-vertical', onPress: () => navigation.navigate('DiagnosticsDashboard') },
        ]}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <HeroBand
          title={t('diagnostics.request.heroTitle')}
          subtitle={t('diagnostics.request.heroSubtitle')}
          icon="flask"
        />

        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('diagnostics.request.loading')}
        >
          {(setup) => {
            if (!setup.form || setup.threads.length === 0) {
              return (
                <EmptyState
                  icon="chat"
                  tint="blue"
                  title={t('diagnostics.request.noThreadTitle')}
                  message={t('diagnostics.request.noThreadBody')}
                  actionLabel={t('diagnostics.request.noThreadCta')}
                  onAction={() => navigation.navigate('NewMessage')}
                />
              );
            }

            const active = setup.threads.find((row) => row.id === threadId) ?? setup.threads[0];

            return (
              <>
                <InfoStrip icon="info" tone="pending">
                  <Text style={styles.noticeTitle}>{t('diagnostics.request.noticeTitle')}</Text>
                  <Text style={styles.noticeBody}>{t('diagnostics.request.noticeBody')}</Text>
                </InfoStrip>

                {/* ── 1. Who it goes to ──────────────────────────────── */}
                <Card>
                  <Overline label={t('diagnostics.request.step1')} style={styles.overlineGap} />
                  {setup.threads.map((thread, i) => (
                    <ListRow
                      key={thread.id}
                      icon={thread.id === active.id ? 'check-circle' : 'stethoscope'}
                      tint={thread.id === active.id ? 'green' : 'blue'}
                      title={thread.provider_name ?? t('diagnostics.request.yourCareTeam')}
                      meta={[thread.provider_specialty, thread.subject]}
                      chevron={false}
                      onPress={() => setThreadId(thread.id)}
                      divider={i < setup.threads.length - 1}
                    />
                  ))}
                </Card>

                {/* ── 2. The test ────────────────────────────────────── */}
                <Card>
                  <Overline label={t('diagnostics.request.step2')} style={styles.overlineGap} />
                  <View style={styles.search}>
                    <Icon name="search" size={18} color={colors.textMuted} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder={
                        form?.fields.find((f) => f.key === 'test')?.placeholder ??
                        t('diagnostics.request.searchPlaceholder')
                      }
                      placeholderTextColor={colors.textMuted}
                      style={styles.searchInput}
                      autoCorrect={false}
                      // A test-catalogue lookup, not a personal detail: keep the
                      // keyboard's autofill strip out of it.
                      autoComplete="off"
                      textContentType="none"
                      accessibilityRole="search"
                      accessibilityLabel={t('diagnostics.request.searchA11y')}
                    />
                    {searching ? <ActivityIndicator color={colors.blue} /> : null}
                    {!searching && query.length > 0 ? (
                      <TouchableOpacity
                        onPress={() => setQuery('')}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('diagnostics.request.clearSearch')}
                      >
                        <Icon name="close" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {test ? (
                    <View style={styles.selected}>
                      <Icon name="check-circle" size={18} color={colors.statusNormal} />
                      <Text style={styles.selectedText} numberOfLines={2}>
                        {test}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setTest(null)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('diagnostics.request.clearTest')}
                      >
                        <Icon name="close" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <View style={styles.list}>
                    {(catalogue ?? []).length === 0 && !searching ? (
                      <Text style={styles.emptyLine}>
                        {t('diagnostics.request.noMatch', { query: query.trim() })}
                      </Text>
                    ) : (
                      (catalogue ?? []).slice(0, 40).map((o, i, arr) => (
                        <ListRow
                          key={`${o.value}-${i}`}
                          icon={o.value === test ? 'check-circle' : 'flask'}
                          tint={o.value === test ? 'green' : 'purple'}
                          title={o.label}
                          subtitle={o.meta ? titleCase(o.meta) : undefined}
                          chevron={false}
                          onPress={() => setTest(o.value)}
                          divider={i < Math.min(arr.length, 40) - 1}
                        />
                      ))
                    )}
                  </View>
                </Card>

                {/* ── 3. How soon ────────────────────────────────────── */}
                {priorityOptions.length > 0 && (
                  <Card>
                    <Overline label={t('diagnostics.request.step3')} style={styles.overlineGap} />
                    <SegmentedTabs
                      variant="pill"
                      options={priorityOptions.map((o) => ({ key: o.value, label: o.label }))}
                      value={priority}
                      onChange={setPriority}
                    />
                    <Text style={styles.hint}>{t('diagnostics.request.urgencyHint')}</Text>
                  </Card>
                )}

                {/* ── 4. Why ────────────────────────────────────────── */}
                <Card>
                  <Overline
                    label={t('diagnostics.request.step4', { label: notesLabel })}
                    style={styles.overlineGap}
                  />
                  <TextInput
                    value={notes}
                    onChangeText={(v) => setNotes(v.slice(0, NOTE_LIMIT))}
                    placeholder={t('diagnostics.request.notesPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    style={styles.textarea}
                    multiline
                    textAlignVertical="top"
                    autoComplete="off"
                    textContentType="none"
                    accessibilityLabel={notesLabel}
                  />
                  <Text style={styles.counter}>
                    {notes.length}/{NOTE_LIMIT}
                  </Text>
                </Card>

                <DiagButton
                  label={
                    submitting
                      ? t('diagnostics.request.sending')
                      : (form?.submit_label ?? t('diagnostics.request.submit'))
                  }
                  icon="send"
                  disabled={!ready || submitting}
                  onPress={submit}
                />
                {!ready && !submitting ? (
                  <Text style={styles.hint}>{t('diagnostics.request.readyHint')}</Text>
                ) : null}
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
      {dialog.element}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  overlineGap: { marginBottom: spacing.sm },

  noticeTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  noticeBody: {
    marginTop: spacing.xs / 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    padding: 0,
  },

  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.statusNormalBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectedText: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  list: { marginTop: spacing.sm },
  emptyLine: {
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  hint: {
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textMuted,
  },

  textarea: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  counter: {
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
