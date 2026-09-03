import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CloudOff,
  FileText,
  Headset,
  Mail,
  MessageSquare,
  Phone,
  QrCode,
  Send,
  ShieldCheck,
  Ticket,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../components/ui/Screen';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { ListRow } from '../components/ui/ListRow';
import { SkeletonCard } from '../components/ui/Skeleton';
import { InlineNotice, ScreenHeader } from '../components/settings/SettingsUi';
import { toneOf, type Tone } from '../components/ui/tone';
import { colors, radii, sizing, spacing, typography } from '../theme/tokens';
import {
  useCreateSupportTicket,
  useSendSupportTicketMessage,
  useSupportContact,
  useSupportTicket,
  useSupportTickets,
  type SupportTicketCategory,
  type SupportTicketSummary,
} from '../lib/api/queries';

/**
 * Help & Support — a real helpdesk, not a contact form.
 *
 * Reference: `Mobile app screens/a_full_screen_mobile_app_ui_screenshot_help_sup.png`
 * — "How can we help you today?" contact channels, popular help topics, a
 * "Submit a Request" block, then "My Support Requests" with a status per row,
 * closing on a medical-emergency notice.
 *
 * Backed end-to-end by MobileSupportController (`routes/mobile_support.php`):
 * GET /support/contact, GET|POST /support/tickets, GET /support/tickets/{id},
 * POST /support/tickets/{id}/messages. A ticket the patient opens here is the
 * same record the staff helpdesk works, so it gets a real status, a thread and
 * a resolution note.
 *
 * Departures from the reference, each because the platform cannot honestly
 * support what it draws:
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
const HELP_TOPICS: { icon: LucideIcon; tone: Tone; titleKey: string; bodyKey: string; route: string }[] =
  [
    {
      icon: QrCode,
      tone: 'gold',
      titleKey: 'help.topic.healthId',
      bodyKey: 'help.topic.healthIdBody',
      route: '/(tabs)/health-id',
    },
    {
      icon: Calendar,
      tone: 'info',
      titleKey: 'help.topic.appointments',
      bodyKey: 'help.topic.appointmentsBody',
      route: '/appointments',
    },
    {
      icon: FileText,
      tone: 'success',
      titleKey: 'help.topic.records',
      bodyKey: 'help.topic.recordsBody',
      route: '/(tabs)/records',
    },
    {
      icon: ShieldCheck,
      tone: 'warning',
      titleKey: 'help.topic.privacy',
      bodyKey: 'help.topic.privacyBody',
      route: '/privacy',
    },
    {
      icon: Users,
      tone: 'neutral',
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
function statusTone(status: string): Tone {
  switch (status) {
    case 'resolved':
      return 'success';
    case 'escalated':
      return 'danger';
    case 'assigned':
      return 'warning';
    default:
      return 'info';
  }
}

/** A short, stable handle for a ticket: the leading segment of its real UUID.
 * Not a fabricated "SR-…" number — the API has no reference field. */
function shortRef(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function HelpScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';

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

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing['2xl'], paddingBottom: spacing['4xl'] }}
        refreshControl={
          <RefreshControl
            refreshing={ticketsQuery.isRefetching || contactQuery.isRefetching}
            onRefresh={() => {
              ticketsQuery.refetch();
              contactQuery.refetch();
            }}
            tintColor={colors.brand[500]}
          />
        }
      >
        <ScreenHeader
          title={t('help.title')}
          subtitle={t('help.subtitle')}
          onBack={() => router.back()}
        />

        {/* ── How can we help? — the real channels ────────────────────── */}
        <Card className="mt-6" padding="lg">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: sizing.tile.md,
                height: sizing.tile.md,
                borderRadius: radii.tile,
                backgroundColor: colors.brand[50],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Headset color={colors.brand[600]} size={sizing.icon.lg} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text
                style={{
                  fontSize: typography.size.lg,
                  lineHeight: typography.lineHeight.lg,
                  fontWeight: typography.weight.bold,
                  color: colors.navy.text,
                }}
              >
                {t('help.contact.title')}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: typography.size.sm,
                  lineHeight: typography.lineHeight.sm,
                  color: colors.navy.secondary,
                }}
              >
                {t('help.contact.body')}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
            {contactQuery.isLoading ? (
              <ActivityIndicator color={colors.brand[500]} />
            ) : (
              <>
                {email ? (
                  <ChannelRow
                    icon={Mail}
                    tone="info"
                    title={t('help.contact.email')}
                    body={t('help.contact.emailBody')}
                    value={email}
                    onPress={() => {
                      Linking.openURL(`mailto:${email}`).catch(() => undefined);
                    }}
                  />
                ) : null}

                {phone ? (
                  <ChannelRow
                    icon={Phone}
                    tone="success"
                    title={t('help.contact.phone')}
                    body={t('help.contact.phoneBody')}
                    value={phone}
                    onPress={() => {
                      Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`).catch(() => undefined);
                    }}
                  />
                ) : null}

                {!email && !phone ? (
                  <InlineNotice tone="warning" icon={CircleAlert} body={t('help.contact.unavailable')} />
                ) : null}

                <ChannelRow
                  icon={MessageSquare}
                  tone="gold"
                  title={t('help.contact.ticket')}
                  body={t('help.contact.ticketBody')}
                  value={
                    openTickets > 0
                      ? t('help.contact.ticketOpen', { count: openTickets })
                      : t('help.contact.ticketNone')
                  }
                />
              </>
            )}
          </View>
        </Card>

        {/* ── Popular help topics ─────────────────────────────────────── */}
        <SectionLabel text={t('help.topicsTitle')} />
        <Card padding="none" style={{ paddingHorizontal: spacing.lg }}>
          {HELP_TOPICS.map((topic, index) => (
            <ListRow
              key={topic.titleKey}
              icon={topic.icon}
              tone={topic.tone}
              title={t(topic.titleKey)}
              subtitle={t(topic.bodyKey)}
              onPress={() => router.push(topic.route)}
              divider={index < HELP_TOPICS.length - 1}
            />
          ))}
        </Card>

        {/* ── FAQ ─────────────────────────────────────────────────────── */}
        <SectionLabel text={t('help.faqTitle')} />
        <Card padding="none" style={{ paddingHorizontal: spacing.lg }}>
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

        {/* ── Submit a request ────────────────────────────────────────── */}
        <SectionLabel text={t('help.requestForm.title')} />
        <Card padding="lg">
          <Text
            style={{
              fontSize: typography.size.sm,
              lineHeight: typography.lineHeight.sm,
              color: colors.navy.secondary,
            }}
          >
            {t('help.requestForm.body')}
          </Text>

          <FieldLabel text={t('help.requestForm.category')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {categories.map((value) => (
              <Chip
                key={value}
                label={t(`help.category.${value}`)}
                size="md"
                variant="outline"
                tone="gold"
                selected={category === value}
                onPress={() => setCategory(value)}
              />
            ))}
          </View>

          <FieldLabel text={t('help.requestForm.subject')} />
          <TextInput
            style={{
              height: sizing.control.lg,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.line.default,
              backgroundColor: colors.surface.card,
              paddingHorizontal: spacing.lg,
              fontSize: typography.size.md,
              color: colors.navy.text,
            }}
            placeholder={t('help.requestForm.subjectPlaceholder')}
            placeholderTextColor={colors.navy.muted}
            value={subject}
            onChangeText={setSubject}
            maxLength={255}
          />

          <FieldLabel text={t('help.requestForm.description')} />
          <TextInput
            style={{
              minHeight: 110,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.line.default,
              backgroundColor: colors.surface.card,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              fontSize: typography.size.md,
              lineHeight: typography.lineHeight.md,
              color: colors.navy.text,
            }}
            placeholder={t('help.requestForm.descriptionPlaceholder')}
            placeholderTextColor={colors.navy.muted}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            maxLength={5000}
          />
          <Text
            style={{
              marginTop: spacing.sm,
              fontSize: typography.size.xs,
              color: colors.navy.muted,
            }}
          >
            {t('help.requestForm.privacyHint')}
          </Text>

          {createTicket.isError ? (
            <View style={{ marginTop: spacing.md }}>
              <InlineNotice tone="danger" icon={CircleAlert} body={t('help.requestForm.submitError')} />
            </View>
          ) : null}

          {submittedRef ? (
            <View style={{ marginTop: spacing.md }}>
              <InlineNotice
                tone="success"
                icon={Ticket}
                title={t('help.requestForm.submitted')}
                body={t('help.requestForm.submittedBody', { ref: submittedRef })}
              />
            </View>
          ) : null}

          <View style={{ marginTop: spacing.lg }}>
            <Button
              label={t('help.requestForm.submit')}
              onPress={submitRequest}
              loading={createTicket.isPending}
              disabled={!canSubmit}
              showChevron={false}
              leftIcon={Send}
            />
          </View>
        </Card>

        {/* ── My support requests ─────────────────────────────────────── */}
        <SectionLabel text={t('help.myRequests.title')} />
        {ticketsQuery.isLoading ? (
          <SkeletonCard rows={3} />
        ) : ticketsQuery.isError ? (
          <Card padding="none">
            <EmptyState
              compact
              tone="danger"
              icon={CircleAlert}
              title={t('help.myRequests.loadError')}
              description={t('help.myRequests.loadErrorBody')}
              actionLabel={t('help.myRequests.retry')}
              onAction={() => ticketsQuery.refetch()}
            />
          </Card>
        ) : tickets.length === 0 ? (
          <Card padding="none">
            <EmptyState
              compact
              icon={Ticket}
              title={t('help.myRequests.emptyTitle')}
              description={t('help.myRequests.empty')}
            />
          </Card>
        ) : (
          <Card padding="none" style={{ paddingHorizontal: spacing.lg }}>
            {tickets.map((ticket, index) => (
              <ListRow
                key={ticket.id}
                icon={Ticket}
                tone={statusTone(ticket.status)}
                title={ticket.subject}
                subtitle={t('help.myRequests.meta', {
                  ref: shortRef(ticket.id),
                  category: t(`help.category.${ticket.category}`),
                  updated: formatDate(ticket.updated_at, locale),
                })}
                trailing={
                  <Chip
                    label={t(`help.status.${ticket.status}`, { defaultValue: ticket.status })}
                    tone={statusTone(ticket.status)}
                  />
                }
                onPress={() => setActiveTicketId(ticket.id)}
                divider={index < tickets.length - 1}
              />
            ))}
          </Card>
        )}

        {/* ── Emergency ───────────────────────────────────────────────── */}
        <View style={{ marginTop: spacing.xl }}>
          <InlineNotice
            tone="danger"
            icon={AlertTriangle}
            title={t('help.emergency.title')}
            body={t('help.emergency.body')}
          />
        </View>

        <Card className="mt-4" padding="none" style={{ paddingHorizontal: spacing.lg }}>
          <ListRow
            icon={CloudOff}
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
        locale={locale}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function SectionLabel({ text }: { text: string }) {
  return (
    <Text
      style={{
        marginTop: spacing['3xl'],
        marginBottom: spacing.md,
        fontSize: typography.size.xs,
        lineHeight: typography.lineHeight.xs,
        fontWeight: typography.weight.bold,
        letterSpacing: typography.tracking.overline,
        textTransform: 'uppercase',
        color: colors.brand[600],
      }}
    >
      {text}
    </Text>
  );
}

function FieldLabel({ text }: { text: string }) {
  return (
    <Text
      style={{
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
        fontSize: typography.size.xs,
        fontWeight: typography.weight.semibold,
        color: colors.navy.secondary,
      }}
    >
      {text}
    </Text>
  );
}

/** One contact channel: icon tile, what it is, and the real value. */
function ChannelRow({
  icon: Icon,
  tone,
  title,
  body,
  value,
  onPress,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  body: string;
  value: string;
  onPress?: () => void;
}) {
  const palette = toneOf(tone);

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        borderRadius: radii.lg,
        backgroundColor: colors.surface.sunken,
      }}
    >
      <View
        style={{
          width: sizing.tile.sm,
          height: sizing.tile.sm,
          borderRadius: radii.tile,
          backgroundColor: colors.surface.card,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon color={palette.fg} size={sizing.icon.md} />
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text
          style={{
            fontSize: typography.size.sm,
            lineHeight: typography.lineHeight.sm,
            fontWeight: typography.weight.semibold,
            color: colors.navy.text,
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            marginTop: 1,
            fontSize: typography.size.xs,
            lineHeight: typography.lineHeight.xs,
            color: colors.navy.secondary,
          }}
        >
          {body}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            marginTop: 2,
            fontSize: typography.size.sm,
            fontWeight: typography.weight.semibold,
            color: palette.fg,
          }}
        >
          {value}
        </Text>
      </View>
      {onPress ? <ChevronRight color={colors.navy.muted} size={sizing.icon.lg} /> : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} — ${value}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      {content}
    </Pressable>
  );
}

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
  return (
    <View
      style={{
        borderBottomWidth: divider ? sizing.hairline : 0,
        borderBottomColor: colors.line.subtle,
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={question}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing.lg,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={{
            flex: 1,
            paddingRight: spacing.md,
            fontSize: typography.size.md,
            lineHeight: typography.lineHeight.md,
            fontWeight: typography.weight.semibold,
            color: colors.navy.text,
          }}
        >
          {question}
        </Text>
        {open ? (
          <ChevronUp color={colors.brand[600]} size={sizing.icon.lg} />
        ) : (
          <ChevronDown color={colors.navy.muted} size={sizing.icon.lg} />
        )}
      </Pressable>

      {open ? (
        <View style={{ paddingBottom: spacing.lg }}>
          <Text
            style={{
              fontSize: typography.size.sm,
              lineHeight: typography.lineHeight.sm,
              color: colors.navy.secondary,
            }}
          >
            {answer}
          </Text>
          <Pressable
            onPress={onFollowLink}
            accessibilityRole="button"
            accessibilityLabel={linkLabel}
            style={({ pressed }) => ({
              marginTop: spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: colors.brand[600],
              }}
            >
              {linkLabel}
            </Text>
            <ChevronRight color={colors.brand[600]} size={sizing.icon.sm} />
          </Pressable>
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
  locale,
}: {
  ticketId: string | null;
  visible: boolean;
  onClose: () => void;
  locale: string;
}) {
  const { t } = useTranslation();
  const ticketQuery = useSupportTicket(ticketId);
  const sendMessage = useSendSupportTicketMessage(ticketId);
  const [reply, setReply] = useState('');

  const ticket = ticketQuery.data;
  const tone = statusTone(ticket?.status ?? 'open');

  const submitReply = async () => {
    const body = reply.trim();
    if (!body || sendMessage.isPending) return;
    setReply('');
    try {
      await sendMessage.mutateAsync(body);
    } catch {
      setReply(body);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.surface.overlay }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            style={{
              maxHeight: '88%',
              borderTopLeftRadius: radii.card + 4,
              borderTopRightRadius: radii.card + 4,
              backgroundColor: colors.surface.app,
              paddingHorizontal: spacing['2xl'],
              paddingTop: spacing.xl,
              paddingBottom: spacing['2xl'],
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: spacing.md }}>
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: typography.size.lg,
                    lineHeight: typography.lineHeight.lg,
                    fontWeight: typography.weight.bold,
                    color: colors.navy.text,
                  }}
                >
                  {ticket?.subject ?? t('help.detail.loading')}
                </Text>
                {ticket ? (
                  <Text
                    style={{
                      marginTop: 3,
                      fontSize: typography.size.xs,
                      color: colors.navy.muted,
                    }}
                  >
                    {t('help.myRequests.meta', {
                      ref: shortRef(ticket.id),
                      category: t(`help.category.${ticket.category}`),
                      updated: formatDate(ticket.updated_at, locale),
                    })}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
                <X color={colors.navy.muted} size={sizing.icon.xl} />
              </Pressable>
            </View>

            {ticketQuery.isLoading ? (
              <View style={{ paddingVertical: spacing['3xl'], alignItems: 'center' }}>
                <ActivityIndicator color={colors.brand[500]} />
              </View>
            ) : !ticket ? (
              <EmptyState
                compact
                tone="danger"
                icon={CircleAlert}
                title={t('help.myRequests.loadError')}
                description={t('help.myRequests.loadErrorBody')}
                actionLabel={t('help.myRequests.retry')}
                onAction={() => ticketQuery.refetch()}
              />
            ) : (
              <>
                <View
                  style={{
                    marginTop: spacing.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                  }}
                >
                  <Chip
                    label={t(`help.status.${ticket.status}`, { defaultValue: ticket.status })}
                    tone={tone}
                  />
                  {ticket.sla_due_at && !ticket.resolved_at ? (
                    <Text style={{ fontSize: typography.size.xs, color: colors.navy.muted }}>
                      {t('help.detail.slaDue', { date: formatDate(ticket.sla_due_at, locale) })}
                    </Text>
                  ) : null}
                </View>

                <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                  <Card className="mt-4" padding="md">
                    <Text
                      style={{
                        fontSize: typography.size.xs,
                        fontWeight: typography.weight.semibold,
                        color: colors.navy.secondary,
                      }}
                    >
                      {t('help.detail.description')}
                    </Text>
                    <Text
                      style={{
                        marginTop: spacing.sm,
                        fontSize: typography.size.sm,
                        lineHeight: typography.lineHeight.sm,
                        color: colors.navy.text,
                      }}
                    >
                      {ticket.description}
                    </Text>
                  </Card>

                  {ticket.resolution_note ? (
                    <View style={{ marginTop: spacing.md }}>
                      <InlineNotice
                        tone="success"
                        icon={ShieldCheck}
                        title={t('help.detail.resolutionNote')}
                        body={ticket.resolution_note}
                      />
                    </View>
                  ) : null}

                  <Text
                    style={{
                      marginTop: spacing.xl,
                      marginBottom: spacing.sm,
                      fontSize: typography.size.xs,
                      fontWeight: typography.weight.semibold,
                      color: colors.navy.secondary,
                    }}
                  >
                    {t('help.detail.conversation')}
                  </Text>

                  {ticket.messages.length === 0 ? (
                    <Text
                      style={{
                        fontSize: typography.size.sm,
                        lineHeight: typography.lineHeight.sm,
                        color: colors.navy.muted,
                      }}
                    >
                      {t('help.detail.empty')}
                    </Text>
                  ) : (
                    ticket.messages.map((message) => (
                      <View
                        key={message.id}
                        style={{
                          marginBottom: spacing.sm,
                          maxWidth: '86%',
                          alignSelf: message.is_mine ? 'flex-end' : 'flex-start',
                          paddingHorizontal: spacing.md,
                          paddingVertical: spacing.sm,
                          borderRadius: radii.lg,
                          borderBottomRightRadius: message.is_mine ? radii.xs : radii.lg,
                          borderBottomLeftRadius: message.is_mine ? radii.lg : radii.xs,
                          backgroundColor: message.is_mine ? colors.brand[500] : colors.surface.card,
                          borderWidth: message.is_mine ? 0 : 1,
                          borderColor: colors.line.subtle,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: typography.size.sm,
                            lineHeight: typography.lineHeight.sm,
                            color: message.is_mine ? colors.white : colors.navy.text,
                          }}
                        >
                          {message.body}
                        </Text>
                        <Text
                          style={{
                            marginTop: 2,
                            fontSize: 11,
                            color: message.is_mine ? colors.brand[50] : colors.navy.muted,
                          }}
                        >
                          {formatDate(message.created_at, locale)}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>

                {sendMessage.isError ? (
                  <View style={{ marginTop: spacing.md }}>
                    <InlineNotice tone="danger" icon={CircleAlert} body={t('help.detail.replyError')} />
                  </View>
                ) : null}

                <View
                  style={{
                    marginTop: spacing.lg,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                  }}
                >
                  <TextInput
                    style={{
                      flex: 1,
                      height: sizing.control.md,
                      borderRadius: radii.pill,
                      borderWidth: 1,
                      borderColor: colors.line.default,
                      backgroundColor: colors.surface.card,
                      paddingHorizontal: spacing.lg,
                      fontSize: typography.size.sm,
                      color: colors.navy.text,
                    }}
                    placeholder={t('help.detail.replyPlaceholder')}
                    placeholderTextColor={colors.navy.muted}
                    value={reply}
                    onChangeText={setReply}
                    maxLength={5000}
                  />
                  <Pressable
                    onPress={submitReply}
                    disabled={!reply.trim() || sendMessage.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={t('help.detail.send')}
                    style={{
                      width: sizing.control.md,
                      height: sizing.control.md,
                      borderRadius: radii.pill,
                      backgroundColor: colors.brand[500],
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: !reply.trim() || sendMessage.isPending ? 0.5 : 1,
                    }}
                  >
                    {sendMessage.isPending ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <Send color={colors.white} size={sizing.icon.md} />
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
