/**
 * Messages tab — the inbox. The Finder port of OPES MSG-001
 * (`UIUX/src/screens/messaging/MessagesScreen.tsx`), laid out as a
 * `ScreenHeader` + search + filter chips + one flush `Card` of `ListRow`s.
 *
 * Opening a thread pushes `/messages/[id]` (app/messages/[id].tsx). Starting a
 * thread lives in the compose sheet below and lands on that same route once the
 * server has created it.
 *
 * Every field rendered comes from `MobileMessagingController`:
 *   • threads → id, title, status, priority, thread_type, updated_at,
 *               unread (boolean), last_message{body,is_mine,created_at}
 * The API returns no participant name beyond `title`, no avatar URL and no
 * unread *count*, so avatars are initials and "unread" is a dot, not a number.
 *
 * ── Who the compose sheet can address ─────────────────────────────────────
 * It used to list APPOINTMENTS, because the only way to open a thread was to
 * name one. A patient with no appointment therefore saw an info strip and no
 * way forward at all — "Start conversation" led nowhere, which is the bug this
 * screen was rewritten to fix.
 *
 * The sheet now asks the server who this patient may write to
 * (GET /mobile/messages/recipients) and offers two kinds of recipient, which
 * are NOT interchangeable:
 *
 *   FACILITY (the default tab) — the front desk. Always has somebody behind
 *     it, so the button always works. Most questions are desk questions:
 *     opening hours, help rebooking, "have my results come back", "do you
 *     stock this drug". Sending those to a named doctor makes a clinician's
 *     inbox unusable.
 *
 *   CLINICIAN — only people already looking after this patient. The list comes
 *     from the patient's own record and the server refuses anybody else
 *     (403 NO_CLINICAL_RELATIONSHIP), so this is never a directory to browse
 *     and DM. A clinician the server marks `deliverable: false` is shown, and
 *     shown as unwritable with the reason, rather than quietly dropped.
 *
 * A recipient's reason for being on the list (`basis_label`) is rendered as the
 * server sent it — already translated, from the same rule that enforces it.
 * The "not an emergency" line sits above both tabs, always, never behind a tap.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  a11yJoin,
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  radii,
  ScreenHeader,
  SectionHeader,
  spacing,
  StatusBadge,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { Avatar, ErrorBlock, LoadingBlock } from '@/components/chat';
import { useMessageThreads, type MessageThreadSummary } from '@/lib/api/queries';
import {
  countUnreadThreads,
  filterThreads,
  sortThreadsByActivity,
} from '@/lib/api/messagingQueries';
import {
  useMessageRecipients,
  useStartThread,
  type ClinicianRecipient,
  type FacilityRecipient,
} from '@/lib/api/messagingRecipients';
import { registerMessagingRecipientStrings } from '@/lib/i18n/messagingRecipientStrings';

/** Matches the controller's `max:4000` validation rule. */
const MESSAGE_MAX = 4000;

/** Below this the search box does nothing — the server ignores a 1-char `q`. */
const SEARCH_MIN = 2;

/** Keystroke settling time before the facility search reaches the server. */
const SEARCH_DEBOUNCE_MS = 350;

/** Which half of the picker is open. Facility is the default, deliberately. */
type RecipientKind = 'facility' | 'clinician';

// Renders the compose sheet's copy in both languages before the pending i18n
// files are merged. Module scope, so it has run before the first paint.
registerMessagingRecipientStrings();

export default function MessagesScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeBody, setComposeBody] = useState('');

  // Compose state: which tab, which recipient, and the facility search.
  const [kind, setKind] = useState<RecipientKind>('facility');
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [clinicianId, setClinicianId] = useState<string | null>(null);
  const [facilitySearch, setFacilitySearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const threadsQuery = useMessageThreads();
  const startThread = useStartThread();

  // Only asked for while the sheet is open — the inbox itself needs none of it.
  const recipientsQuery = useMessageRecipients(debouncedSearch, composeOpen);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(facilitySearch), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [facilitySearch]);

  const allThreads = useMemo(() => sortThreadsByActivity(threadsQuery.data ?? []), [threadsQuery.data]);
  const unreadCount = useMemo(() => countUnreadThreads(allThreads), [allThreads]);
  const visibleThreads = useMemo(() => {
    const scoped = unreadOnly ? allThreads.filter((thread) => thread.unread) : allThreads;
    return filterThreads(scoped, search);
  }, [allThreads, unreadOnly, search]);

  const facilities = recipientsQuery.data?.facilities ?? [];
  const clinicians = recipientsQuery.data?.clinicians ?? [];

  const openThread = (thread: MessageThreadSummary) =>
    router.push({ pathname: '/messages/[id]', params: { id: String(thread.id), title: thread.title } });

  const openCompose = () => {
    setKind('facility');
    setFacilityId(null);
    setClinicianId(null);
    setFacilitySearch('');
    setDebouncedSearch('');
    setComposeBody('');
    startThread.reset();
    setComposeOpen(true);
  };

  const selectFacility = (id: string) => {
    setFacilityId(id);
    setClinicianId(null);
  };

  const selectClinician = (id: string) => {
    setClinicianId(id);
    setFacilityId(null);
  };

  const recipientId = kind === 'facility' ? facilityId : clinicianId;

  const submitCompose = async () => {
    const body = composeBody.trim();
    if (!body || startThread.isPending) return;

    // The server rejects a request with no recipient, and would reject one with
    // two. The button is disabled without one; this is the second belt.
    const payload =
      kind === 'facility'
        ? facilityId && { facility_id: facilityId, body }
        : clinicianId && { clinician_id: clinicianId, body };

    if (!payload) return;

    try {
      const thread = await startThread.mutateAsync(payload);
      setComposeOpen(false);
      setComposeBody('');
      setFacilityId(null);
      setClinicianId(null);
      router.push({ pathname: '/messages/[id]', params: { id: String(thread.id), title: thread.title } });
    } catch {
      // startThread.isError renders the inline message below the form
    }
  };

  const hasThreads = allThreads.length > 0;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={t('opesMessaging.inbox.title')}
        subtitle={t('messages.subtitle')}
        showBack={false}
        actions={[
          {
            icon: 'bell',
            onPress: () => router.push('/notifications'),
            accessibilityLabel: t('opesMessaging.inbox.notificationsA11y'),
          },
          {
            icon: 'edit',
            onPress: openCompose,
            accessibilityLabel: t('messages.newConversation'),
          },
        ]}
      />

      {threadsQuery.isLoading ? (
        <LoadingBlock label={t('opesMessaging.inbox.loading')} />
      ) : threadsQuery.isError ? (
        <ErrorBlock
          message={t('messages.loadError')}
          onRetry={() => threadsQuery.refetch()}
          retryLabel={t('messages.retry')}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={threadsQuery.isRefetching}
              onRefresh={() => threadsQuery.refetch()}
              tintColor={colors.blue}
            />
          }
        >
          {hasThreads ? (
            <>
              <PillInput
                icon={<Icon name="search" size={18} color={colors.blue} />}
                placeholder={t('messages.searchPlaceholder')}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel={t('messages.searchPlaceholder')}
              />

              <View style={styles.chips}>
                <Chip
                  label={t('messages.filterAll')}
                  count={allThreads.length}
                  selected={!unreadOnly}
                  onPress={() => setUnreadOnly(false)}
                />
                <Chip
                  label={t('messages.filterUnread')}
                  count={unreadCount}
                  selected={unreadOnly}
                  onPress={() => setUnreadOnly(true)}
                />
              </View>

              {visibleThreads.length > 0 ? (
                <Card variant="flush">
                  {visibleThreads.map((thread, index) => (
                    <ThreadRow
                      key={thread.id}
                      thread={thread}
                      locale={i18n.language}
                      divider={index < visibleThreads.length - 1}
                      onPress={() => openThread(thread)}
                    />
                  ))}
                </Card>
              ) : unreadOnly && !search.trim() ? (
                // The Unread filter on an inbox with nothing unread is the
                // common case — it deserves reassurance, not a search hint.
                <EmptyState
                  icon="check-circle"
                  tint="green"
                  title={t('messages.caughtUpTitle')}
                  message={t('messages.caughtUpBody')}
                />
              ) : (
                <EmptyState
                  icon="search"
                  tint="blue"
                  title={t('messages.noResultsTitle')}
                  message={t('messages.noResultsBody')}
                />
              )}
            </>
          ) : (
            <EmptyState
              icon="chat"
              tint="blue"
              title={t('messages.emptyTitle')}
              message={t('messages.emptyBody')}
              actionLabel={t('messages.startFirstConversation')}
              onAction={openCompose}
            />
          )}
        </ScrollView>
      )}

      <ComposeSheet
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        notice={recipientsQuery.data?.notice}
        kind={kind}
        onChangeKind={setKind}
        facilities={facilities}
        clinicians={clinicians}
        loading={recipientsQuery.isLoading}
        failedToLoad={recipientsQuery.isError}
        onRetryLoad={() => recipientsQuery.refetch()}
        facilitySearch={facilitySearch}
        onChangeFacilitySearch={setFacilitySearch}
        selectedFacilityId={facilityId}
        selectedClinicianId={clinicianId}
        onSelectFacility={selectFacility}
        onSelectClinician={selectClinician}
        body={composeBody}
        onChangeBody={setComposeBody}
        onSubmit={submitCompose}
        submitting={startThread.isPending}
        failed={startThread.isError}
        hasRecipient={!!recipientId}
      />
    </SafeAreaView>
  );
}

/* ── Inbox row ────────────────────────────────────────────────────────── */

function ThreadRow({
  thread,
  locale,
  divider,
  onPress,
}: {
  thread: MessageThreadSummary;
  locale: string;
  divider: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const unread = !!thread.unread;
  const closed = thread.status === 'closed';
  const elevated = isElevated(thread.priority);
  const title = thread.title || t('messages.careTeam');
  const preview = thread.last_message
    ? `${thread.last_message.is_mine ? `${t('messages.you')}: ` : ''}${thread.last_message.body}`
    : t('messages.threadEmpty');
  const stampIso = thread.last_message?.created_at ?? thread.updated_at;
  const stamp = stampIso ? formatStamp(stampIso, locale, t) : '';

  return (
    <ListRow
      leading={<Avatar name={thread.title} size={44} />}
      title={title}
      subtitle={preview}
      chevron={false}
      divider={divider}
      onPress={onPress}
      accessibilityLabel={a11yJoin(title, preview, stamp, unread ? t('messages.unreadLabel') : null)}
      trailing={
        <View style={styles.rowTrailing}>
          {!!stamp && <Text style={[styles.stamp, unread && styles.stampUnread]}>{stamp}</Text>}
          <View style={styles.rowMarks}>
            {closed && <StatusBadge status="closed" tone="neutral" size="sm" label={t('messages.statusClosed')} />}
            {elevated && (
              <StatusBadge status={thread.priority} tone="warning" size="sm" label={priorityLabel(t, thread.priority)} />
            )}
            {unread && <View style={styles.unreadDot} />}
          </View>
        </View>
      }
    />
  );
}

/* ── Compose sheet ────────────────────────────────────────────────────── */

/**
 * Pick a recipient, then write.
 *
 * The order is not decoration: "who is this for" is the question the old sheet
 * could not answer, and it is answered before the keyboard ever opens. The
 * emergency line sits above the tabs so it is read whichever kind is chosen.
 */
function ComposeSheet({
  visible,
  onClose,
  notice,
  kind,
  onChangeKind,
  facilities,
  clinicians,
  loading,
  failedToLoad,
  onRetryLoad,
  facilitySearch,
  onChangeFacilitySearch,
  selectedFacilityId,
  selectedClinicianId,
  onSelectFacility,
  onSelectClinician,
  body,
  onChangeBody,
  onSubmit,
  submitting,
  failed,
  hasRecipient,
}: {
  visible: boolean;
  onClose: () => void;
  notice?: string;
  kind: RecipientKind;
  onChangeKind: (kind: RecipientKind) => void;
  facilities: FacilityRecipient[];
  clinicians: ClinicianRecipient[];
  loading: boolean;
  failedToLoad: boolean;
  onRetryLoad: () => void;
  facilitySearch: string;
  onChangeFacilitySearch: (value: string) => void;
  selectedFacilityId: string | null;
  selectedClinicianId: string | null;
  onSelectFacility: (id: string) => void;
  onSelectClinician: (id: string) => void;
  body: string;
  onChangeBody: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  failed: boolean;
  hasRecipient: boolean;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const searching = facilitySearch.trim().length >= SEARCH_MIN;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.scrimWrap}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('messages.composeCancel')}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.sheetGrab} />
            <View style={styles.sheetHead}>
              <View style={styles.flexMin}>
                <Text style={styles.sheetTitle} accessibilityRole="header">
                  {t('messages.composeTitle')}
                </Text>
                <Text style={styles.sheetSubtitle}>{t('messagingRecipients.sheetHelp')}</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('messages.composeCancel')}
              >
                <Icon name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Stated once, above everything, in both tabs. A patient who
                  reaches for this at 2am has to meet it before the keyboard. */}
              <View style={styles.emergencyNotice} accessibilityRole="alert">
                <Icon name="alert-triangle" size={18} color={colors.statusWarning} />
                <Text style={styles.emergencyNoticeText}>
                  {notice ?? t('messagingRecipients.notEmergency')}
                </Text>
              </View>

              {/* Not `messages.composeAbout` ("What is this about?") — the
                  question this sheet asks first is who, not what. */}
              <SectionHeader title={t('messagingRecipients.sheetSection')} variant="overline" />

              <View style={styles.chips}>
                <Chip
                  label={t('messagingRecipients.toFacility')}
                  icon="building"
                  selected={kind === 'facility'}
                  onPress={() => onChangeKind('facility')}
                />
                <Chip
                  label={t('messagingRecipients.toClinician')}
                  icon="stethoscope"
                  // Deliverable only. A badge counting names the patient cannot
                  // actually write to is a promise the tab does not keep.
                  count={clinicians.filter((c) => c.deliverable).length}
                  selected={kind === 'clinician'}
                  onPress={() => onChangeKind('clinician')}
                />
              </View>

              <Text style={styles.kindHint}>
                {kind === 'facility'
                  ? t('messagingRecipients.facilityHint')
                  : t('messagingRecipients.clinicianHint')}
              </Text>

              {failedToLoad ? (
                <ErrorBlock
                  message={t('messagingRecipients.loadError')}
                  onRetry={onRetryLoad}
                  retryLabel={t('messages.retry')}
                />
              ) : kind === 'facility' ? (
                <>
                  <PillInput
                    icon={<Icon name="search" size={18} color={colors.blue} />}
                    placeholder={t('messagingRecipients.facilitySearchPlaceholder')}
                    value={facilitySearch}
                    onChangeText={onChangeFacilitySearch}
                    autoCorrect={false}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                    accessibilityLabel={t('messagingRecipients.facilitySearchPlaceholder')}
                  />
                  {loading ? (
                    <LoadingBlock />
                  ) : facilities.length === 0 ? (
                    <EmptyState
                      icon={searching ? 'search' : 'building'}
                      tint="blue"
                      title={t(
                        searching
                          ? 'messagingRecipients.facilitySearchNoneTitle'
                          : 'messagingRecipients.facilityNoneTitle',
                      )}
                      message={t(
                        searching
                          ? 'messagingRecipients.facilitySearchNoneBody'
                          : 'messagingRecipients.facilityNoneBody',
                      )}
                    />
                  ) : (
                    <Card variant="flush">
                      {facilities.map((facility, index) => {
                        const selected = selectedFacilityId === facility.id;
                        return (
                          <ListRow
                            key={facility.id}
                            icon="building"
                            tint="blue"
                            title={facility.name}
                            // `basis_label` arrives translated from the server —
                            // the same rule that decides the row is allowed also
                            // writes the sentence explaining it.
                            meta={[facility.city, facility.basis_label]}
                            chevron={false}
                            divider={index < facilities.length - 1}
                            onPress={() => onSelectFacility(facility.id)}
                            style={selected ? styles.rowSelected : undefined}
                            accessibilityLabel={a11yJoin(
                              facility.name,
                              facility.city,
                              facility.basis_label,
                              selected ? t('messagingRecipients.selectedA11y') : null,
                            )}
                            trailing={
                              <Icon
                                name="check-circle"
                                size={22}
                                color={selected ? colors.statusNormal : colors.border}
                                strokeWidth={2}
                              />
                            }
                          />
                        );
                      })}
                    </Card>
                  )}
                </>
              ) : loading ? (
                <LoadingBlock />
              ) : clinicians.length === 0 ? (
                <EmptyState
                  icon="stethoscope"
                  tint="blue"
                  title={t('messagingRecipients.clinicianNoneTitle')}
                  message={t('messagingRecipients.clinicianNoneBody')}
                  actionLabel={t('messagingRecipients.writeToFacilityInstead')}
                  onAction={() => onChangeKind('facility')}
                />
              ) : (
                <Card variant="flush">
                  {clinicians.map((clinician, index) => {
                    const selected = selectedClinicianId === clinician.id;
                    // Authorised but with no inbox that can list the result.
                    // Shown, and shown as unusable: hiding it would leave the
                    // patient wondering where a name they know had gone.
                    const blocked = !clinician.deliverable;
                    return (
                      <ListRow
                        key={clinician.id}
                        leading={<Avatar name={clinician.name} size={40} />}
                        title={clinician.name}
                        meta={[
                          clinician.facility_name,
                          blocked
                            ? t('messagingRecipients.clinicianUnavailableHint', {
                                name: clinician.name,
                                facility: clinician.facility_name ?? t('messages.careTeam'),
                              })
                            : clinician.basis_label,
                        ]}
                        chevron={false}
                        divider={index < clinicians.length - 1}
                        onPress={blocked ? undefined : () => onSelectClinician(clinician.id)}
                        style={selected ? styles.rowSelected : undefined}
                        accessibilityLabel={a11yJoin(
                          clinician.name,
                          clinician.facility_name,
                          blocked
                            ? t('messagingRecipients.clinicianUnavailable')
                            : clinician.basis_label,
                          selected ? t('messagingRecipients.selectedA11y') : null,
                        )}
                        trailing={
                          blocked ? (
                            <StatusBadge
                              status="unavailable"
                              tone="neutral"
                              size="sm"
                              label={t('messagingRecipients.clinicianUnavailable')}
                            />
                          ) : (
                            <Icon
                              name="check-circle"
                              size={22}
                              color={selected ? colors.statusNormal : colors.border}
                              strokeWidth={2}
                            />
                          )
                        }
                      />
                    );
                  })}
                </Card>
              )}

              {/* Every name on the list is real and none of them can be
                  written to. Without this the tab is a wall: the patient reads
                  four clinicians they know and has nowhere to go. */}
              {kind === 'clinician' && clinicians.length > 0 && clinicians.every((c) => !c.deliverable) && (
                <TouchableOpacity
                  onPress={() => onChangeKind('facility')}
                  accessibilityRole="button"
                  accessibilityLabel={t('messagingRecipients.writeToFacilityInstead')}
                >
                  <Text style={styles.switchToFacility}>
                    {t('messagingRecipients.writeToFacilityInstead')}
                  </Text>
                </TouchableOpacity>
              )}

              <TextInput
                style={styles.composeInput}
                placeholder={t('messages.composeMessagePlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={body}
                onChangeText={onChangeBody}
                maxLength={MESSAGE_MAX}
                multiline
                textAlignVertical="top"
                accessibilityLabel={t('messages.composeMessagePlaceholder')}
              />
              <Text style={styles.charCount}>{t('messages.charCount', { used: body.length, max: MESSAGE_MAX })}</Text>

              {failed && (
                <View style={styles.formError} accessibilityLiveRegion="polite" accessibilityRole="alert">
                  <Icon name="alert-circle" size={16} color={colors.statusCritical} />
                  <Text style={styles.formErrorText}>{t('messages.sendError')}</Text>
                </View>
              )}

              {!hasRecipient && !!body.trim() && (
                <Text style={styles.pickPrompt}>{t('messagingRecipients.chooseRecipient')}</Text>
              )}

              <GradientButton
                label={t('messages.composeSend')}
                onPress={onSubmit}
                loading={submitting}
                disabled={!body.trim() || !hasRecipient}
                icon="none"
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ── Formatting ───────────────────────────────────────────────────────── */

type Translate = (key: string) => string;

function localeTag(locale: string) {
  return locale?.startsWith('fr') ? 'fr-FR' : 'en-US';
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysAgo(iso: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
}

function formatClock(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(localeTag(locale), { hour: '2-digit', minute: '2-digit' });
}

/** Inbox timestamp: time today, "Yesterday", weekday this week, date beyond. */
function formatStamp(iso: string, locale: string, t: Translate) {
  const diff = daysAgo(iso);
  if (diff === null) return '';
  if (diff <= 0) return formatClock(iso, locale);
  if (diff === 1) return t('messages.yesterday');
  if (diff < 7) return new Date(iso).toLocaleDateString(localeTag(locale), { weekday: 'short' });
  return new Date(iso).toLocaleDateString(localeTag(locale), { day: 'numeric', month: 'short' });
}

function isElevated(priority: string | null | undefined) {
  const value = (priority ?? '').toLowerCase();
  return value === 'high' || value === 'urgent';
}

function priorityLabel(t: Translate, priority: string | null | undefined) {
  return (priority ?? '').toLowerCase() === 'urgent' ? t('messages.priorityUrgent') : t('messages.priorityHigh');
}

/**
 * `#RRGGBB` → `rgba(r,g,b,a)`. The kit palette has no `overlay` token, so the
 * scrim is derived from the palette's `navy` rather than hardcoded — it follows
 * a palette switch like every other colour on the sheet.
 */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/* ── Styles ───────────────────────────────────────────────────────────── */

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    flexMin: { flex: 1, minWidth: 0 },
    content: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
    chips: { flexDirection: 'row', gap: spacing.sm },

    // Row trailing: stamp above the marks, right-aligned.
    rowTrailing: { alignItems: 'flex-end', gap: 6 },
    rowMarks: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stamp: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    stampUnread: { fontFamily: typography.fontFamily.semiBold, color: colors.link },
    unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.badge },
    rowSelected: { backgroundColor: colors.primarySoft },

    // Compose sheet
    scrimWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: withAlpha(colors.navy, 0.45) },
    scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    sheet: {
      maxHeight: '88%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    sheetGrab: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: radii.pill,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },
    sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
    sheetTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
    },
    sheetSubtitle: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    sheetScroll: { flexGrow: 0 },
    sheetBody: { gap: spacing.sm + 4, paddingBottom: spacing.sm },

    // The standing warning. Warning tint, not the info blue every other strip
    // uses — this one is the only line on the sheet that is about risk.
    emergencyNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radii.sm + 2,
      backgroundColor: colors.statusWarningBg,
    },
    emergencyNoticeText: {
      flex: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textPrimary,
    },
    kindHint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    pickPrompt: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    switchToFacility: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.link,
      textAlign: 'center',
      paddingVertical: spacing.sm,
    },
    composeInput: {
      minHeight: 96,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    charCount: {
      textAlign: 'right',
      fontFamily: typography.fontFamily.medium,
      fontSize: 10,
      color: colors.textMuted,
    },
    formError: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radii.sm + 2,
      backgroundColor: colors.statusCriticalBg,
    },
    formErrorText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.statusCritical,
    },
  });
