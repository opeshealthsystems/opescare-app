import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  ResultList,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  a11yJoin,
  formatDate,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import {
  useCreateSupportTicket,
  useSendSupportTicketMessage,
  useSupportContact,
  useSupportTicket,
  useSupportTickets,
  type SupportTicketCategory,
} from '../lib/api/queries';

/**
 * Help & Support — a real helpdesk, not a contact form, in the OPES layout.
 *
 * Backed end-to-end by MobileSupportController (`routes/mobile_support.php`):
 * GET /support/contact, GET|POST /support/tickets, GET /support/tickets/{id},
 * POST /support/tickets/{id}/messages. Those routes were only recently
 * restored, so every one of them is still rendered defensively: a missing
 * contact channel is never invented, a failed ticket list gets its own
 * `EmptyState` with a retry, and a failed submit leaves the form filled.
 *
 * Presentation in this pass: `ScreenHeader`, overline `SectionHeader`s,
 * `Card variant="flush"` lists of `ListRow`s for the contact channels, the
 * help topics and the ticket list, `StatusBadge` for ticket state,
 * `PillInput` + `GradientButton` for the request form, and kit `EmptyState`s.
 *
 * Departures from the OPES reference, each because the platform cannot
 * honestly support what it draws:
 *  - **No Live Chat channel.** There is no chat transport for support; the
 *    ticket thread is the real-time channel and is presented as such.
 *  - **No article search or "Support Center" link.** There is no help-article
 *    API and no published support site to link to. The help topics below
 *    navigate to the screens that actually do the thing, and the FAQ answers
 *    describe only behaviour this app really has.
 *  - **No "SR-2025-0456" request number.** `support_tickets` has no reference
 *    column — the id is a bare UUID — so rows show a short prefix of the real
 *    id rather than a fabricated ticket number.
 *  - **No system-status panel and no satisfaction rating.** Neither has an
 *    endpoint.
 *
 * One deliberate departure from the kit's `ListRow`: the FAQ rows are built
 * here rather than composed from `ListRow`, because `ListRow` clamps its title
 * to a single line and every FAQ question is a full sentence. The geometry
 * (14/16 padding, 40px tint circle, 18px chevron) is the DESIGN_SPEC §8 row
 * recipe, so the two read as the same component.
 */

/** Fallback order if GET /support/contact does not return the category list. */
const FALLBACK_CATEGORIES: SupportTicketCategory[] = [
  'technical_issue',
  'appointment_issue',
  'billing_question',
  'account_access',
  'medical_records',
  'prescription_pharmacy',
  'other',
];

/** Help topics — each navigates to the screen that actually does the thing. */
const HELP_TOPICS: { icon: IconName; tint: Tint; titleKey: string; bodyKey: string; route: string }[] =
  [
    {
      icon: 'qr',
      tint: 'blue',
      titleKey: 'help.topic.healthId',
      bodyKey: 'help.topic.healthIdBody',
      route: '/(tabs)/health-id',
    },
    {
      icon: 'calendar',
      tint: 'blue',
      titleKey: 'help.topic.appointments',
      bodyKey: 'help.topic.appointmentsBody',
      route: '/appointments',
    },
    {
      icon: 'document-text',
      tint: 'green',
      titleKey: 'help.topic.records',
      bodyKey: 'help.topic.recordsBody',
      route: '/(tabs)/records',
    },
    {
      icon: 'shield-check',
      tint: 'amber',
      titleKey: 'help.topic.privacy',
      bodyKey: 'help.topic.privacyBody',
      route: '/privacy',
    },
    {
      icon: 'users',
      tint: 'purple',
      titleKey: 'help.topic.family',
      bodyKey: 'help.topic.familyBody',
      route: '/family',
    },
  ];

/**
 * FAQ. Every answer describes behaviour this app genuinely has, and links to
 * the screen that performs it — nothing here is invented, and each entry was
 * checked against the screen it points at.
 */
const FAQS: { id: string; route: string; routeLabelKey: string }[] = [
  { id: 'healthId', route: '/(tabs)/health-id', routeLabelKey: 'help.faq.openHealthId' },
  { id: 'whoSees', route: '/privacy', routeLabelKey: 'help.faq.openPrivacy' },
  { id: 'copy', route: '/export-records', routeLabelKey: 'help.faq.openExport' },
  { id: 'offline', route: '/offline-access', routeLabelKey: 'help.faq.openOffline' },
  { id: 'booking', route: '/appointments/book', routeLabelKey: 'help.faq.openBooking' },
  { id: 'family', route: '/family', routeLabelKey: 'help.faq.openFamily' },
];

/** open | assigned | escalated | resolved — the four SupportService writes. */
function statusTone(status: string): StatusTone {
  switch (status) {
    case 'resolved':
      return 'normal';
    case 'escalated':
      return 'critical';
    case 'assigned':
      return 'warning';
    default:
      return 'pending';
  }
}

/** A short, stable handle for a ticket: the leading segment of its real UUID.
 * Not a fabricated "SR-…" number — the API has no reference field. */
function shortRef(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export default function HelpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const contactQuery = useSupportContact();
  const ticketsQuery = useSupportTickets();
  const createTicket = useCreateSupportTicket();

  const categories = contactQuery.data?.categories?.length
    ? contactQuery.data.categories
    : FALLBACK_CATEGORIES;

  const [category, setCategory] = useState<SupportTicketCategory>('technical_issue');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);

  const email = contactQuery.data?.email ?? null;
  const phone = contactQuery.data?.phone ?? null;
  const tickets = ticketsQuery.data ?? [];
  const openTickets = tickets.filter((ticket) => ticket.status !== 'resolved').length;

  const canSubmit =
    subject.trim().length > 0 && description.trim().length > 0 && !createTicket.isPending;

  const submitRequest = async () => {
    if (!canSubmit) return;
    setSubmittedRef(null);
    try {
      const created = await createTicket.mutateAsync({
        category,
        subject: subject.trim(),
        description: description.trim(),
      });
      setSubject('');
      setDescription('');
      setCategory('technical_issue');
      setSubmittedRef(shortRef(created.id));
    } catch {
      // createTicket.isError renders the inline error below the form.
    }
  };

  const onRefresh = useCallback(() => {
    ticketsQuery.refetch();
    contactQuery.refetch();
  }, [ticketsQuery, contactQuery]);

  const ticketMeta = useCallback(
    (id: string, ticketCategory: string, updatedAt: string | null) =>
      t('help.myRequests.meta', {
        ref: shortRef(id),
        category: t(`help.category.${ticketCategory}`, { defaultValue: ticketCategory }),
        updated: formatDate(updatedAt, t('opesCore.common.none')),
      }),
    [t],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* No `onBack`: the kit falls back to the app-wide handler registered in
          app/_layout.tsx (`canGoBack() ? back() : replace('/(tabs)/home')`).
          Passing `() => router.back()` here OVERRODE that with a call that is
          a silent no-op when there is no stack to pop — and Help is reached
          without one every time it is opened from a notification or a deep
          link, leaving a chevron that does nothing. */}
      <ScreenHeader title={t('help.title')} subtitle={t('help.subtitle')} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={ticketsQuery.isRefetching || contactQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.blue}
            colors={[colors.blue]}
          />
        }
      >
        {/* ── How can we help? — the real channels ──────────────────────── */}
        <Card>
          <View style={styles.head}>
            <View style={styles.circle}>
              <Icon name="headset" size={24} color={tintMap.blue.fg} />
            </View>
            <View style={styles.headText}>
              <Text style={styles.headTitle}>{t('help.contact.title')}</Text>
              <Text style={styles.headBody}>{t('help.contact.body')}</Text>
            </View>
          </View>
        </Card>

        {contactQuery.isLoading ? (
          <LoadingCard label={t('opesCore.common.loading')} />
        ) : (
          <Card variant="flush">
            {email ? (
              <ListRow
                icon="mail"
                tint="blue"
                title={t('help.contact.email')}
                subtitle={t('help.contact.emailBody')}
                value={email}
                valueColor={colors.link}
                onPress={() => {
                  Linking.openURL(`mailto:${email}`).catch(() => undefined);
                }}
                accessibilityLabel={a11yJoin(t('help.contact.email'), email)}
                divider
              />
            ) : null}

            {phone ? (
              <ListRow
                icon="phone"
                tint="green"
                title={t('help.contact.phone')}
                subtitle={t('help.contact.phoneBody')}
                value={phone}
                valueColor={colors.link}
                onPress={() => {
                  Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`).catch(() => undefined);
                }}
                accessibilityLabel={a11yJoin(t('help.contact.phone'), phone)}
                divider
              />
            ) : null}

            {!email && !phone ? (
              <View style={styles.flushNotice}>
                <Notice tone="warning" icon="alert-circle" text={t('help.contact.unavailable')} />
              </View>
            ) : null}

            <ListRow
              icon="chat"
              tint="purple"
              title={t('help.contact.ticket')}
              subtitle={t('help.contact.ticketBody')}
              value={
                openTickets > 0
                  ? t('help.contact.ticketOpen', { count: openTickets })
                  : t('help.contact.ticketNone')
              }
              valueColor={colors.textSecondary}
              chevron={false}
            />
          </Card>
        )}

        {/* ── Popular help topics ───────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('help.topicsTitle')} variant="overline" />
          <Card variant="flush">
            {HELP_TOPICS.map((topic, index) => (
              <ListRow
                key={topic.titleKey}
                icon={topic.icon}
                tint={topic.tint}
                title={t(topic.titleKey)}
                subtitle={t(topic.bodyKey)}
                onPress={() => router.push(topic.route)}
                divider={index < HELP_TOPICS.length - 1}
              />
            ))}
          </Card>
        </View>

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('help.faqTitle')} variant="overline" />
          <Card variant="flush">
            {FAQS.map((faq, index) => (
              <FaqRow
                key={faq.id}
                question={t(`help.faq.${faq.id}Q`)}
                answer={t(`help.faq.${faq.id}A`)}
                linkLabel={t(faq.routeLabelKey)}
                open={openFaq === faq.id}
                onToggle={() => setOpenFaq((current) => (current === faq.id ? null : faq.id))}
                onFollowLink={() => router.push(faq.route)}
                divider={index < FAQS.length - 1}
              />
            ))}
          </Card>
        </View>

        {/* ── Submit a request ──────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('help.requestForm.title')} variant="overline" />
          <Card>
            <Text style={styles.formIntro}>{t('help.requestForm.body')}</Text>

            <Text style={styles.fieldLabel}>{t('help.requestForm.category')}</Text>
            <View style={styles.chipWrap}>
              {categories.map((value) => (
                <Chip
                  key={value}
                  label={t(`help.category.${value}`, { defaultValue: value })}
                  selected={category === value}
                  onPress={() => setCategory(value)}
                  accessibilityLabel={`${t('help.requestForm.category')} ${t(
                    `help.category.${value}`,
                    { defaultValue: value },
                  )}`}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>{t('help.requestForm.subject')}</Text>
            <PillInput
              icon={<Icon name="edit" size={18} color={colors.blue} />}
              placeholder={t('help.requestForm.subjectPlaceholder')}
              value={subject}
              onChangeText={setSubject}
              maxLength={255}
              accessibilityLabel={t('help.requestForm.subject')}
            />

            <Text style={styles.fieldLabel}>{t('help.requestForm.description')}</Text>
            <TextInput
              style={styles.textArea}
              placeholder={t('help.requestForm.descriptionPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
              maxLength={5000}
              accessibilityLabel={t('help.requestForm.description')}
            />

            {/* Redaction promise — a consent statement, kept verbatim. */}
            <Text style={styles.privacyHint}>{t('help.requestForm.privacyHint')}</Text>

            {createTicket.isError ? (
              <Notice
                tone="critical"
                icon="alert-circle"
                text={t('help.requestForm.submitError')}
                spaced
              />
            ) : null}

            {submittedRef ? (
              <Notice
                tone="normal"
                icon="check-circle"
                title={t('help.requestForm.submitted')}
                text={t('help.requestForm.submittedBody', { ref: submittedRef })}
                spaced
              />
            ) : null}

            <GradientButton
              label={t('help.requestForm.submit')}
              onPress={() => void submitRequest()}
              loading={createTicket.isPending}
              disabled={!canSubmit}
              icon="none"
              style={styles.submit}
            />
          </Card>
        </View>

        {/* ── My support requests ───────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('help.myRequests.title')} variant="overline" />
          {ticketsQuery.isLoading ? (
            <LoadingCard label={t('opesCore.common.loading')} />
          ) : ticketsQuery.isError ? (
            <Card variant="flush">
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('help.myRequests.loadError')}
                message={t('help.myRequests.loadErrorBody')}
                actionLabel={t('help.myRequests.retry')}
                onAction={() => ticketsQuery.refetch()}
              />
            </Card>
          ) : tickets.length === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="clipboard"
                tint="blue"
                title={t('help.myRequests.emptyTitle')}
                message={t('help.myRequests.empty')}
              />
            </Card>
          ) : (
            <ResultList>
              {tickets.map((ticket) => (
                <Card key={ticket.id} variant="flush">
                  <ListRow
                    icon="clipboard"
                    tint={statusTone(ticket.status) === 'critical' ? 'red' : 'blue'}
                    title={ticket.subject}
                    subtitle={ticketMeta(ticket.id, ticket.category, ticket.updated_at)}
                    onPress={() => setActiveTicketId(ticket.id)}
                    divider={false}
                    trailing={
                      <StatusBadge
                        status={ticket.status}
                        tone={statusTone(ticket.status)}
                        label={t(`help.status.${ticket.status}`, { defaultValue: ticket.status })}
                        size="sm"
                      />
                    }
                  />
                </Card>
              ))}
            </ResultList>
          )}
        </View>

        {/* ── Emergency — never soften this. ────────────────────────────── */}
        <Notice
          tone="critical"
          icon="alert-triangle"
          title={t('help.emergency.title')}
          text={t('help.emergency.body')}
        />

        <Card variant="flush">
          <ListRow
            // The kit has no "cloud-off" glyph; the lock reads as "an
            // encrypted copy on this device", which is what the row is.
            icon="lock"
            tint="amber"
            title={t('help.offlineTitle')}
            subtitle={t('help.offlineBody')}
            onPress={() => router.push('/offline-access')}
          />
        </Card>
      </ScrollView>

      <TicketDetailModal
        ticketId={activeTicketId}
        visible={activeTicketId !== null}
        onClose={() => setActiveTicketId(null)}
      />
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/**
 * An expandable FAQ row. Geometry follows DESIGN_SPEC §8 so it stacks with the
 * `ListRow`s above it, but the question is allowed to wrap — `ListRow` clamps
 * its title to one line, which truncated every question here.
 */
function FaqRow({
  question,
  answer,
  linkLabel,
  open,
  onToggle,
  onFollowLink,
  divider,
}: {
  question: string;
  answer: string;
  linkLabel: string;
  open: boolean;
  onToggle: () => void;
  onFollowLink: () => void;
  divider: boolean;
}) {
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.faqWrap, divider && styles.faqDivider]}>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={question}
        style={styles.faqRow}
      >
        <View style={styles.circle}>
          <Icon name="help-circle" size={26} color={tintMap.blue.fg} />
        </View>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={open ? colors.link : colors.textMuted}
        />
      </TouchableOpacity>

      {open ? (
        <View style={styles.faqAnswerWrap}>
          <Text style={styles.faqAnswer}>{answer}</Text>
          <TouchableOpacity
            onPress={onFollowLink}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={linkLabel}
            style={styles.faqLink}
          >
            <Text style={styles.faqLinkText}>{linkLabel}</Text>
            <Icon name="chevron-right" size={16} color={colors.link} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

/** The ticket thread — description, resolution note, messages, and a reply box. */
function TicketDetailModal({
  ticketId,
  visible,
  onClose,
}: {
  ticketId: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const ticketQuery = useSupportTicket(ticketId);
  const sendMessage = useSendSupportTicketMessage(ticketId);
  const [reply, setReply] = useState('');

  const ticket = ticketQuery.data;

  const submitReply = async () => {
    const body = reply.trim();
    if (!body || sendMessage.isPending) return;
    setReply('');
    try {
      await sendMessage.mutateAsync(body);
    } catch {
      // Put the text back so a failed send never loses what was typed.
      setReply(body);
    }
  };

  const canSend = !!reply.trim() && !sendMessage.isPending;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('opesCore.common.close')}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
          accessibilityViewIsModal
        >
          <View style={styles.grab} />

          <View style={styles.sheetHead}>
            <View style={styles.sheetHeadText}>
              <Text style={styles.sheetTitle} numberOfLines={2}>
                {ticket?.subject ?? t('help.detail.loading')}
              </Text>
              {ticket ? (
                <Text style={styles.sheetMeta}>
                  {t('help.myRequests.meta', {
                    ref: shortRef(ticket.id),
                    category: t(`help.category.${ticket.category}`, {
                      defaultValue: ticket.category,
                    }),
                    updated: formatDate(ticket.updated_at, t('opesCore.common.none')),
                  })}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('opesCore.common.close')}
              style={styles.sheetClose}
            >
              <Icon name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {ticketQuery.isLoading ? (
            <View style={styles.loading} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.blue} />
              <Text style={styles.loadingText}>{t('opesCore.common.loading')}</Text>
            </View>
          ) : !ticket ? (
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('help.myRequests.loadError')}
              message={t('help.myRequests.loadErrorBody')}
              actionLabel={t('help.myRequests.retry')}
              onAction={() => ticketQuery.refetch()}
            />
          ) : (
            <>
              <View style={styles.sheetStatus}>
                <StatusBadge
                  status={ticket.status}
                  tone={statusTone(ticket.status)}
                  label={t(`help.status.${ticket.status}`, { defaultValue: ticket.status })}
                  size="sm"
                />
                {ticket.sla_due_at && !ticket.resolved_at ? (
                  <Text style={styles.sheetSla}>
                    {t('help.detail.slaDue', {
                      date: formatDate(ticket.sla_due_at, t('opesCore.common.none')),
                    })}
                  </Text>
                ) : null}
              </View>

              <ScrollView style={styles.thread} showsVerticalScrollIndicator={false}>
                <Card>
                  <Text style={styles.threadLabel}>{t('help.detail.description')}</Text>
                  <Text style={styles.threadBody}>{ticket.description}</Text>
                </Card>

                {ticket.resolution_note ? (
                  <View style={styles.threadBlock}>
                    <Notice
                      tone="normal"
                      icon="shield-check"
                      title={t('help.detail.resolutionNote')}
                      text={ticket.resolution_note}
                    />
                  </View>
                ) : null}

                <Text style={styles.threadHeading}>{t('help.detail.conversation')}</Text>

                {ticket.messages.length === 0 ? (
                  <Text style={styles.threadEmpty}>{t('help.detail.empty')}</Text>
                ) : (
                  ticket.messages.map((message) => (
                    <View
                      key={message.id}
                      style={[
                        styles.bubble,
                        message.is_mine ? styles.bubbleMine : styles.bubbleTheirs,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bubbleText,
                          message.is_mine && styles.bubbleTextMine,
                        ]}
                      >
                        {message.body}
                      </Text>
                      <Text
                        style={[
                          styles.bubbleStamp,
                          message.is_mine && styles.bubbleStampMine,
                        ]}
                      >
                        {formatDate(message.created_at)}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>

              {sendMessage.isError ? (
                <Notice tone="critical" icon="alert-circle" text={t('help.detail.replyError')} />
              ) : null}

              <View style={styles.composer}>
                <View style={styles.composerInput}>
                  <PillInput
                    placeholder={t('help.detail.replyPlaceholder')}
                    value={reply}
                    onChangeText={setReply}
                    maxLength={5000}
                    accessibilityLabel={t('help.detail.replyPlaceholder')}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => void submitReply()}
                  disabled={!canSend}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('help.detail.send')}
                  accessibilityState={{ disabled: !canSend, busy: sendMessage.isPending }}
                  style={[styles.sendButton, !canSend && styles.sendButtonOff]}
                >
                  {sendMessage.isPending ? (
                    <ActivityIndicator size="small" color={colors.textOnBrand} />
                  ) : (
                    <Icon name="send" size={20} color={colors.textOnBrand} />
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Tinted inline notice: icon, optional title, body. */
function Notice({
  tone,
  icon,
  title,
  text,
  spaced,
}: {
  tone: StatusTone;
  icon: IconName;
  title?: string;
  text: string;
  spaced?: boolean;
}) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = statusMap[tone];
  return (
    <View
      style={[styles.notice, spaced && styles.noticeSpaced, { backgroundColor: skin.bg }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon name={icon} size={18} color={skin.fg} />
      <View style={styles.noticeBody}>
        {title ? <Text style={[styles.noticeTitle, { color: skin.fg }]}>{title}</Text> : null}
        <Text style={styles.noticeText}>{text}</Text>
      </View>
    </View>
  );
}

function LoadingCard({ label }: { label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card>
      <View style={styles.loading} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.blue} />
        <Text style={styles.loadingText}>{label}</Text>
      </View>
    </Card>
  );
}

// ── Styles (colour-dependent, built per palette) ───────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },

    // Intro card
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    circle: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headText: { flex: 1, minWidth: 0 },
    headTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    headBody: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    flushNotice: { padding: spacing.md },

    // FAQ
    faqWrap: { paddingHorizontal: spacing.md },
    faqDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    faqRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    faqQuestion: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: colors.textPrimary,
    },
    faqAnswerWrap: { paddingBottom: 14, paddingLeft: 52 },
    faqAnswer: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    faqLink: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 2 },
    faqLinkText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
    },

    // Request form
    formIntro: {
      marginBottom: spacing.md,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    fieldLabel: {
      marginBottom: 6,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    textArea: {
      minHeight: 110,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    privacyHint: {
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    submit: { marginTop: spacing.xs },

    // Notices
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      padding: spacing.md - 2,
      borderRadius: radii.md,
    },
    noticeSpaced: { marginBottom: spacing.md },
    noticeBody: { flex: 1, minWidth: 0, gap: 2 },
    noticeTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
    noticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    // Loading
    loading: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    // Ticket sheet
    // Scrim painted from the palette's own navy — no literal colour. Opacity
    // sits on the Pressable itself, which has no children to fade.
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.navy,
      opacity: 0.45,
    },
    sheetWrap: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      maxHeight: '88%',
      backgroundColor: colors.page,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    grab: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: radii.pill,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },
    sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    sheetHeadText: { flex: 1, minWidth: 0 },
    sheetTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textPrimary,
    },
    sheetMeta: {
      marginTop: 3,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    sheetClose: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetStatus: {
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    sheetSla: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    thread: { maxHeight: 360, marginTop: spacing.md },
    threadBlock: { marginTop: spacing.md },
    threadLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    threadBody: {
      marginTop: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    threadHeading: {
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    threadEmpty: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textMuted,
    },

    bubble: {
      marginBottom: spacing.sm,
      maxWidth: '86%',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.md,
    },
    bubbleMine: {
      alignSelf: 'flex-end',
      backgroundColor: colors.blue,
      borderBottomRightRadius: radii.sm / 2,
    },
    bubbleTheirs: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: radii.sm / 2,
    },
    bubbleText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    bubbleTextMine: { color: colors.textOnBrand },
    bubbleStamp: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    bubbleStampMine: { color: colors.primarySoft },

    composer: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    // `PillInput` carries a 16px bottom margin for stacked form fields; the
    // composer is a single row, so it is cancelled here.
    composerInput: { flex: 1, minWidth: 0, marginBottom: -spacing.md },
    sendButton: {
      width: 48,
      height: 48,
      borderRadius: radii.pill,
      backgroundColor: colors.blue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonOff: { opacity: 0.5 },
  });
