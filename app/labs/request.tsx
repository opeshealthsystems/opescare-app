/**
 * Request a Lab Test — `/labs/request`.
 *
 * Port of OPES DIA-006 (design reference src/screens/diagnostics/RequestLabTestScreen.tsx (archived prototype, see docs/DESIGN_REFERENCE.md)).
 *
 * The framing the OPES source insists on is kept word for word: a patient
 * cannot PLACE a laboratory order, only ASK for one. `POST /mobile/labs/requests`
 * files a `submitted` request a clinician must approve, and the screen says so
 * before the patient fills anything in.
 *
 * What changed from the OPES source, and why:
 *  - The chat-widget plumbing is gone. OPES had to route the request through
 *    the `lab_order` message widget (pick a thread, fetch its form, run the
 *    widget); this app has a first-class endpoint pair — `useLabTestCatalogue`
 *    for the searchable catalogue and `useRequestLabTest` for the write — so
 *    "Step 1: who it goes to" has no counterpart here and is not drawn.
 *  - The search is still the SERVER's, not a local filter over a truncated
 *    list: the term is debounced and handed to the hook, which sends it at
 *    `CATALOGUE_MIN_QUERY` characters and shows the default page below that.
 *  - `@react-navigation/native` → expo-router; the sent-dialog offers the labs
 *    dashboard and the Messages tab rather than a thread.
 *  - Priority stays `routine | urgent | stat` — the `LabPriority` union, not a
 *    server-sent option list, because that union IS the contract.
 *
 * The catalogue read
 * degrades to the kit `EmptyState` (`LabsUnavailable`) and the form stays
 * disabled, never a crash, never an endless spinner, never an invented test.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Card,
  CardStack,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  StepProgress,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { HeroBand, InfoStrip, LoadingBlock, Overline, errorMessage, titleCase } from '@/components/diagnostics/shared';
import {
  CATALOGUE_MIN_QUERY,
  isLabsUnavailable,
  useLabTestCatalogue,
  useRequestLabTest,
  type LabPriority,
  type LabTestCatalogueItem,
} from '@/lib/api/labsQueries';
import { LabsUnavailable, useLabsT } from './index';

/** The contract's own union — not a server-sent option list. */
const PRIORITIES: LabPriority[] = ['routine', 'urgent', 'stat'];

const NOTE_LIMIT = 2000;
const SEARCH_DEBOUNCE_MS = 350;
/** However long the catalogue is, this is how much of it one screen shows. */
const MAX_ROWS = 40;

export default function RequestLabTestScreen() {
  const { t, tx } = useLabsT();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [test, setTest] = useState<LabTestCatalogueItem | null>(null);
  const [priority, setPriority] = useState<LabPriority>('routine');
  const [notes, setNotes] = useState('');

  // The server owns the search; this only decides when to ask it.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const catalogueQuery = useLabTestCatalogue(search);
  const catalogue = catalogueQuery.data ?? [];
  const request = useRequestLabTest();

  const term = query.trim();
  const searching = catalogueQuery.isFetching && term.length >= CATALOGUE_MIN_QUERY;
  const ready = !!test && !request.isPending;

  // Step 1 choose the test, step 2 how soon, step 3 why. The strip reports
  // where the patient actually is, so it never claims progress they have not made.
  const steps = useMemo(
    () => [
      { key: 'test', label: tx('request.stepTest', 'Test') },
      { key: 'priority', label: tx('request.stepPriority', 'Urgency') },
      { key: 'notes', label: tx('request.stepNotes', 'Reason') },
    ],
    [tx],
  );
  const stepIndex = !test ? 0 : notes.trim().length === 0 ? 1 : 2;

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/labs');
  }, [router]);

  const closeLabel = t('opesUi.components.close', { defaultValue: 'Close' });

  const submit = useCallback(async () => {
    if (!test || request.isPending) return;
    try {
      await request.mutateAsync({
        test_code: test.code,
        priority,
        ...(notes.trim() ? { clinical_notes: notes.trim() } : {}),
      });
      dialog.show({
        title: tx('request.sentTitle', 'Request sent'),
        message: tx(
          'request.sentBody',
          'Your care team has your request for {{test}}. A clinician has to approve it before the laboratory can run it — you will see it in your results once they do.',
          { test: test.name },
        ),
        tone: 'success',
        cancelLabel: closeLabel,
        actions: [
          {
            label: tx('request.sentOpenLabs', 'Go to my results'),
            onPress: () => router.push('/labs'),
          },
        ],
      });
      setTest(null);
      setNotes('');
      setQuery('');
    } catch (e) {
      dialog.alert(
        tx('request.failTitle', 'The request was not sent'),
        errorMessage(
          e,
          tx('request.failFallback', 'Your request could not be sent. Nothing was filed — please try again.'),
        ),
      );
    }
  }, [test, priority, notes, request, dialog, tx, closeLabel, router]);

  function priorityLabel(value: LabPriority): string {
    switch (value) {
      case 'urgent':
        return tx('request.priorityUrgent', 'Urgent');
      case 'stat':
        return tx('request.priorityStat', 'Immediate');
      default:
        return tx('request.priorityRoutine', 'Routine');
    }
  }

  function renderCatalogue() {
    if (catalogueQuery.isLoading && catalogue.length === 0) {
      return <LoadingBlock label={tx('request.loading', 'Loading the test catalogue…')} />;
    }
    if (catalogueQuery.error && catalogue.length === 0) {
      return (
        <LabsUnavailable
          unavailable={isLabsUnavailable(catalogueQuery.error)}
          message={errorMessage(catalogueQuery.error)}
          onRetry={() => void catalogueQuery.refetch()}
          onFindLab={() => router.push('/care-map')}
          tx={tx}
        />
      );
    }
    if (catalogue.length === 0) {
      return (
        <EmptyState
          icon="search"
          tint="green"
          title={
            term
              ? tx('request.noMatchTitle', 'No test matches “{{query}}”', {
                  query: term,
                })
              : tx('request.emptyCatalogueTitle', 'No tests to request yet')
          }
          message={
            term
              ? tx('request.noMatchBody', 'Try the test’s full name, or the name your clinician used.')
              : tx(
                  'request.emptyCatalogueBody',
                  'Your laboratory has not published an orderable test list. Your care team can still order a test for you.',
                )
          }
        />
      );
    }
    const rows = catalogue.slice(0, MAX_ROWS);
    return (
      <View style={styles.list}>
        <CardStack spacing="sm">
          {rows.map((o) => (
            <Card key={o.code} variant="flush">
              <ListRow
                icon={o.code === test?.code ? 'check-circle' : 'flask'}
                // Labs are the green tint (DESIGN_SPEC §1); the chosen row keeps it
                // and earns the tick, so selection never rides on colour alone.
                tint="green"
                title={o.name}
                meta={[o.category ? titleCase(o.category) : null, o.specimen ? titleCase(o.specimen) : null]}
                chevron={false}
                onPress={() => setTest(o)}
                accessibilityHint={tx('request.chooseTestHint', 'Choose this test for your request')}
              />
            </Card>
          ))}
        </CardStack>
        {catalogue.length > rows.length && (
          <Text style={styles.hint}>
            {tx('request.moreResults', 'Showing the first {{count}} matches — narrow your search to see others.', {
              count: rows.length,
            })}
          </Text>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('request.title', 'Request a Test')}
        align="center"
        onBack={goBack}
        actions={[
          {
            icon: 'bell',
            onPress: () => router.push('/notifications'),
            accessibilityLabel: t('opesCore.common.notifications', {
              defaultValue: 'Notifications',
            }),
          },
          {
            icon: 'more-vertical',
            onPress: () => router.push('/labs'),
            accessibilityLabel: t('opesCore.common.moreOptions', {
              defaultValue: 'More options',
            }),
          },
        ]}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <HeroBand
          title={tx('request.heroTitle', 'Ask for a Lab Test')}
          subtitle={tx('request.heroSubtitle', 'Send your care team a request for a laboratory test.')}
          icon="flask"
        />

        <StepProgress
          steps={steps}
          currentIndex={stepIndex}
          accessibilityLabel={tx('request.stepA11y', 'Step {{step}} of {{total}}: {{label}}', {
            step: stepIndex + 1,
            total: steps.length,
            label: steps[stepIndex].label,
          })}
        />

        <InfoStrip icon="info" tone="pending">
          <Text style={styles.noticeTitle}>{tx('request.noticeTitle', 'This is a request, not an order')}</Text>
          <Text style={styles.noticeBody}>
            {tx(
              'request.noticeBody',
              'A clinician has to approve it before a laboratory will run it. You can follow it in your results once it is approved.',
            )}
          </Text>
        </InfoStrip>

        {/* ── 1. The test ────────────────────────────────────────────── */}
        <Card>
          <Overline label={tx('request.step1', 'Choose a test')} style={styles.overlineGap} />
          <PillInput
            value={query}
            onChangeText={setQuery}
            placeholder={tx('request.searchPlaceholder', 'Search tests — e.g. Full Blood Count')}
            icon={<Icon name="search" size={18} color={colors.blue} />}
            autoCorrect={false}
            autoCapitalize="none"
            // A test-catalogue lookup, not a personal detail: keep the
            // keyboard's autofill strip out of it.
            autoComplete="off"
            textContentType="none"
            accessibilityLabel={tx('request.searchA11y', 'Search the laboratory test catalogue')}
          />

          {!!test && (
            <View style={styles.selected}>
              <Icon name="check-circle" size={18} color={colors.statusNormal} />
              <View style={styles.selectedBody}>
                <Text style={styles.selectedText} numberOfLines={2}>
                  {test.name}
                </Text>
                <Text style={styles.selectedMeta} numberOfLines={1}>
                  {[test.code, test.specimen ? titleCase(test.specimen) : null].filter(Boolean).join('  •  ')}
                </Text>
              </View>
              <Chip
                label={tx('request.clearTest', 'Change')}
                icon="close"
                onPress={() => setTest(null)}
                accessibilityLabel={tx('request.clearTestA11y', 'Choose a different test')}
              />
            </View>
          )}

          {searching && (
            <View style={styles.searching} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.blue} />
              <Text style={styles.hint}>{tx('request.searching', 'Searching the catalogue…')}</Text>
            </View>
          )}

          {renderCatalogue()}
        </Card>

        {/* ── 2. How soon ────────────────────────────────────────────── */}
        <Card>
          <Overline label={tx('request.step2', 'How soon')} style={styles.overlineGap} />
          <View style={styles.chipWrap}>
            {PRIORITIES.map((p) => (
              <Chip
                key={p}
                label={priorityLabel(p)}
                selected={p === priority}
                onPress={() => setPriority(p)}
                accessibilityHint={tx('request.priorityHint', 'Sets how urgently you are asking for this test')}
              />
            ))}
          </View>
          <Text style={styles.hint}>
            {tx(
              'request.urgencyHint',
              'Urgency is a request, not a promise — your care team decides how quickly a test is run.',
            )}
          </Text>
        </Card>

        {/* ── 3. Why ─────────────────────────────────────────────────── */}
        <Card>
          <Overline label={tx('request.step3', 'Why you want this test')} style={styles.overlineGap} />
          <TextInput
            value={notes}
            onChangeText={(v) => setNotes(v.slice(0, NOTE_LIMIT))}
            placeholder={tx(
              'request.notesPlaceholder',
              'Symptoms, what changed, or what your clinician asked for. Optional.',
            )}
            placeholderTextColor={colors.textMuted}
            style={styles.textarea}
            multiline
            textAlignVertical="top"
            autoComplete="off"
            textContentType="none"
            accessibilityLabel={tx('request.notesLabel', 'Why you want this test')}
          />
          <Text style={styles.counter}>{`${notes.length}/${NOTE_LIMIT}`}</Text>
        </Card>

        <GradientButton
          label={request.isPending ? tx('request.sending', 'Sending…') : tx('request.submit', 'Send request')}
          loading={request.isPending}
          disabled={!ready}
          onPress={() => void submit()}
          accessibilityHint={tx('request.submitHint', 'Sends this request to your care team for approval')}
        />
        {!ready && !request.isPending && (
          <Text style={styles.hint}>{tx('request.readyHint', 'Choose a test to send your request.')}</Text>
        )}
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: {
      padding: spacing.md,
      gap: spacing.md,
      paddingBottom: spacing.xxl,
    },

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

    selected: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radii.md,
      backgroundColor: colors.statusNormalBg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    selectedBody: { flex: 1, minWidth: 0 },
    selectedText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    selectedMeta: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },

    searching: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },

    list: { marginTop: spacing.sm },

    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

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
