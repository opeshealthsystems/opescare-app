/**
 * MSG-001 — Messages & Notifications (the Messages tab).
 *
 * The reference opens straight onto a live conversation with the care team,
 * so the tab renders the most recent thread from `GET /patient/messages/threads`
 * and its messages from `GET /patient/messages/threads/{id}` — including the
 * structured in-chat cards (medication list, prescription, invoice, care plan,
 * referral, follow-up instructions, imaging result).
 *
 * The header's ⋮ opens the thread switcher (every real thread, with its unread
 * count) and the bell opens the notification feed; both are live. Opening a
 * thread marks it read server-side, so the Messages tab badge is refreshed from
 * `GET /patient/messages/unread-count` after every load and pushed into
 * `useUnread()`.
 */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchNotifications,
  fetchThread,
  fetchThreads,
  fetchUnreadCounts,
  markAllNotificationsRead,
  markNotificationRead,
  sendMessage,
  type CarePlanCard,
  type FollowUpInstructionsCard,
  type ImagingResultCard,
  type InvoiceCard,
  type MedicationListCard,
  type PortalMessage,
  type PortalNotification,
  type PortalThread,
  type PortalThreadDetail,
  type PrescriptionCard,
  type ReferralCard,
  type UnreadCounts,
} from '../../api';
import { Card, EmptyState, Icon, IconName, ListRow, ScreenHeader, StatusBadge } from '../../components';
import { a11yJoin, decorative } from '../../components/a11y';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation, type TFunction } from '../../i18n';
import { colors, radii, spacing, Tint, tintMap, typography } from '../../theme/theme';
import { formatDate, formatNumber, formatTime } from '../../utils/format';
import { AsyncBoundary, CareButton, errorMessage, useAsync } from '../care/shared';
import { notificationTarget } from './NotificationsScreen';

// ── Data ──────────────────────────────────────────────────────────────────

type MessagesData = {
  threads: PortalThread[];
  detail: PortalThreadDetail | null;
  counts: UnreadCounts;
  /** Unread notifications — drives the header bell badge. */
  unreadNotifications: number;
};

// ── Formatting ────────────────────────────────────────────────────────────

// Rule 8: dates, times and money come from `src/utils/format.ts`, which reads
// the same locale and matches the desktop's conventions.
const fmtDate = (iso: string | null | undefined): string => formatDate(iso, '—');
const fmtTime = (iso: string): string => formatTime(iso, '');

/** "Today, 27 Aug 2026" / "Aujourd’hui, 27 août 2026" — the day separator. */
function daySeparator(iso: string, t: TFunction): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const date = fmtDate(iso);
  if (d.toDateString() === today.toDateString()) return t('messaging.inbox.today', { date });
  if (d.toDateString() === yesterday.toDateString()) return t('messaging.inbox.yesterday', { date });
  return date;
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function money(amount: number, currency: string): string {
  return `${formatNumber(Math.round(amount))} ${currency}`;
}

// ── Screen ────────────────────────────────────────────────────────────────

type Overlay = 'none' | 'threads' | 'notifications';

export function MessagesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { notifications, setMessages, setNotifications } = useUnread();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Synchronous double-send guard — `sending` state does not flip until the
  // next render, so two same-frame taps both pass `!sending` and post twice.
  const sendingRef = useRef(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<MessagesData> => {
    const page = await fetchThreads({ per_page: 20 });
    const threads = page.data;
    const id = selectedId && threads.some((t) => t.id === selectedId) ? selectedId : (threads[0]?.id ?? null);
    const detail = id ? await fetchThread(id) : null;
    // fetchThread marks the thread read, so read the counts *after* it.
    const [counts, unread] = await Promise.all([
      fetchUnreadCounts(),
      fetchNotifications({ unread: true, per_page: 1 }),
    ]);
    return { threads, detail, counts, unreadNotifications: unread.meta.pagination.total };
  }, [selectedId]);

  const state = useAsync<MessagesData>(load, [selectedId]);
  const { reload, reloadIfStale, setData } = state;

  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  const counts = state.data?.counts;
  const unreadNotifications = state.data?.unreadNotifications;
  React.useEffect(() => {
    if (counts) setMessages(counts.unread_threads);
  }, [counts, setMessages]);
  React.useEffect(() => {
    if (unreadNotifications !== undefined) setNotifications(unreadNotifications);
  }, [unreadNotifications, setNotifications]);

  const detail = state.data?.detail ?? null;

  async function send() {
    const body = draft.trim();
    if (!body || !detail || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const message = await sendMessage(detail.id, body);
      setDraft('');
      if (state.data) {
        setData({
          ...state.data,
          detail: { ...detail, messages: [...detail.messages, message] },
        });
      }
    } catch (e) {
      setSendError(errorMessage(e, t('messaging.inbox.sendFailed')));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('messaging.inbox.title')}
        align="center"
        showBack={navigation.canGoBack()}
        actions={[
          {
            icon: 'bell',
            badge: notifications,
            onPress: () => setOverlay('notifications'),
            accessibilityLabel: t('messaging.inbox.notificationsA11y'),
          },
          {
            icon: 'more-vertical',
            onPress: () => setOverlay('threads'),
            accessibilityLabel: t('messaging.inbox.conversationsA11y'),
          },
        ]}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('messaging.inbox.loading')}
          isEmpty={(d) => d.detail === null}
          empty={
            <EmptyState
              icon="chat"
              tint="blue"
              title={t('messaging.inbox.emptyTitle')}
              message={t('messaging.inbox.emptyMessage')}
              actionLabel={t('messaging.inbox.emptyCta')}
              onAction={() => navigation.navigate('NewMessage')}
            />
          }
        >
          {(data) =>
            data.detail ? (
              <>
                <ProviderStrip
                  thread={data.detail}
                  onViewProfile={() =>
                    data.detail?.provider_id
                      ? navigation.navigate('ProviderProfile', { providerId: String(data.detail.provider_id) })
                      : navigation.navigate('FindProvider')
                  }
                />

                <ScrollView contentContainerStyle={styles.thread}>
                  <View style={styles.encrypted}>
                    <Icon name="lock" size={18} color={colors.link} />
                    <Text style={styles.encryptedText}>{t('messaging.inbox.encryption')}</Text>
                  </View>

                  <Timeline messages={data.detail.messages} thread={data.detail} navigation={navigation} />
                </ScrollView>

                <QuickActions
                  onAction={(key) => {
                    if (key === 'ask') return;
                    if (key === 'reminder') return navigation.navigate('MedicationSchedule');
                    if (key === 'pharmacy') return navigation.navigate('OrderFromPharmacy');
                    if (key === 'followup' || key === 'video') {
                      return navigation.navigate('BookAppointmentForm', {
                        providerId: data.detail?.provider_id ? String(data.detail.provider_id) : undefined,
                      });
                    }
                  }}
                />

                <Composer
                  value={draft}
                  onChange={setDraft}
                  onSend={send}
                  sending={sending}
                  error={sendError}
                  bottomInset={insets.bottom}
                />
              </>
            ) : null
          }
        </AsyncBoundary>
      </KeyboardAvoidingView>

      {overlay === 'threads' && state.data ? (
        <ThreadSwitcher
          threads={state.data.threads}
          activeId={state.data.detail?.id ?? null}
          onClose={() => setOverlay('none')}
          onPick={(id) => {
            setOverlay('none');
            setSelectedId(id);
          }}
          onNew={() => {
            setOverlay('none');
            navigation.navigate('NewMessage');
          }}
        />
      ) : null}

      {overlay === 'notifications' ? (
        <NotificationsSheet
          onClose={() => setOverlay('none')}
          onCount={setNotifications}
          onOpen={(n) => {
            setOverlay('none');
            // Same table the full NotificationsScreen uses: carries `action_id`
            // so an invoice notification lands on the invoice, and maps imaging.
            const target = notificationTarget(n);
            if (target) navigation.navigate(target.route, target.params);
          }}
        />
      ) : null}
    </View>
  );
}

// ── Provider strip ────────────────────────────────────────────────────────

function ProviderStrip({ thread, onViewProfile }: { thread: PortalThreadDetail; onViewProfile: () => void }) {
  const { t } = useTranslation();
  // Provider and facility names are the server's — never translated.
  const name = thread.provider_name ?? thread.facility_name ?? t('messaging.inbox.careTeamFallback');
  return (
    <View style={styles.strip}>
      <View>
        <View style={styles.stripAvatar}>
          <Text style={styles.stripAvatarText}>{initials(name)}</Text>
        </View>
        {thread.provider_is_online ? <View style={styles.onlineDot} /> : null}
      </View>

      <View style={styles.stripBody}>
        <View style={styles.stripNameRow}>
          <Text style={styles.stripName} numberOfLines={1}>
            {name}
          </Text>
          <Icon name="check-circle" size={16} color={colors.statusNormal} />
        </View>
        {thread.provider_specialty ? <Text style={styles.stripMeta}>{thread.provider_specialty}</Text> : null}
        {thread.facility_name ? (
          <View style={styles.stripFacility}>
            <Icon name="location" size={14} color={colors.textMuted} />
            <Text style={styles.stripMeta} numberOfLines={1}>
              {thread.facility_name}
            </Text>
          </View>
        ) : null}
      </View>

      <CareButton
        label={t('messaging.inbox.viewProfile')}
        icon="person"
        variant="secondary"
        size="sm"
        onPress={onViewProfile}
      />
    </View>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────

function Timeline({
  messages,
  thread,
  navigation,
}: {
  messages: PortalMessage[];
  thread: PortalThreadDetail;
  navigation: any;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const out: { key: string; separator?: string; message?: PortalMessage }[] = [];
    let day = '';
    for (const m of messages) {
      const d = new Date(m.sent_at).toDateString();
      if (d !== day) {
        day = d;
        out.push({ key: `sep-${d}`, separator: daySeparator(m.sent_at, t) });
      }
      out.push({ key: m.id, message: m });
    }
    return out;
    // `t` is a dependency (rule 3): the separators are translated text.
  }, [messages, t]);

  if (messages.length === 0) {
    return (
      <EmptyState
        icon="chat"
        tint="blue"
        title={t('messaging.inbox.noMessagesTitle')}
        message={t('messaging.inbox.noMessagesMessage')}
      />
    );
  }

  return (
    <View style={styles.timeline}>
      {rows.map((row) =>
        row.separator ? (
          <View key={row.key} style={styles.separator}>
            <View style={styles.separatorRule} />
            <Text style={styles.separatorText}>{row.separator}</Text>
            <View style={styles.separatorRule} />
          </View>
        ) : (
          <MessageBubble key={row.key} message={row.message!} thread={thread} navigation={navigation} />
        )
      )}
    </View>
  );
}

function MessageBubble({
  message,
  thread,
  navigation,
}: {
  message: PortalMessage;
  thread: PortalThreadDetail;
  navigation: any;
}) {
  const mine = message.is_mine;
  const card = message.card_type !== 'none';

  if (card) {
    return (
      <View style={styles.cardRow}>
        {!mine ? <Avatar name={message.sender_name ?? thread.provider_name} /> : null}
        <View style={styles.cardBody}>
          <MessageCard message={message} navigation={navigation} />
          <Text style={[styles.stamp, styles.stampRight]}>{fmtTime(message.sent_at)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      {!mine ? <Avatar name={message.sender_name ?? thread.provider_name} /> : null}
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={styles.bubbleText}>{message.body}</Text>
        <View style={styles.bubbleFoot}>
          <Text style={styles.stamp}>{fmtTime(message.sent_at)}</Text>
          {mine ? (
            <Icon name="check-double" size={14} color={message.read_at ? colors.link : colors.textMuted} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Avatar({ name }: { name: string | null }) {
  return (
    <View style={styles.msgAvatar}>
      <Text style={styles.msgAvatarText}>{initials(name)}</Text>
    </View>
  );
}

// ── In-chat cards ─────────────────────────────────────────────────────────

function MessageCard({ message, navigation }: { message: PortalMessage; navigation: any }) {
  const { t } = useTranslation();
  switch (message.card_type) {
    case 'medication_list':
      return <MedicationListBlock card={message.card_payload as MedicationListCard} navigation={navigation} />;
    case 'prescription':
      return <PrescriptionBlock card={message.card_payload as PrescriptionCard} reference={message.card_reference_id} navigation={navigation} />;
    case 'invoice':
      return <InvoiceBlock card={message.card_payload as InvoiceCard} reference={message.card_reference_id} navigation={navigation} />;
    case 'care_plan':
      return <CarePlanBlock card={message.card_payload as CarePlanCard} reference={message.card_reference_id} navigation={navigation} />;
    case 'referral':
      return <ReferralBlock card={message.card_payload as ReferralCard} reference={message.card_reference_id} navigation={navigation} />;
    case 'follow_up_instructions':
      return <FollowUpBlock card={message.card_payload as FollowUpInstructionsCard} />;
    case 'imaging_result':
      return <ImagingBlock card={message.card_payload as ImagingResultCard} reference={message.card_reference_id} navigation={navigation} />;
    default:
      return (
        <Card>
          <Text style={styles.cardTitle}>{t('messaging.inbox.sharedItemTitle')}</Text>
          <Text style={styles.cardMeta}>{t('messaging.inbox.sharedItemNote')}</Text>
        </Card>
      );
  }
}

function CardHead({ icon, tint, title, meta }: { icon: IconName; tint: Tint; title: string; meta?: string }) {
  return (
    <View style={styles.cardHead}>
      <View style={[styles.cardHeadCircle, { backgroundColor: tintMap[tint].bg }]}>
        <Icon name={icon} size={20} color={tintMap[tint].fg} />
      </View>
      <View style={styles.flexMin}>
        <Text style={styles.cardTitle}>{title}</Text>
        {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}
      </View>
    </View>
  );
}

/** The reference's "Your Medication List" table. */
function MedicationListBlock({ card, navigation }: { card: MedicationListCard; navigation: any }) {
  const { t } = useTranslation();
  const MED_TINTS: Tint[] = ['purple', 'blue', 'amber', 'red', 'green'];
  return (
    <Card variant="flush" style={styles.cardShell}>
      <View style={styles.cardPad}>
        <CardHead
          icon="capsule"
          tint="green"
          title={card.title}
          meta={t('messaging.cards.lastUpdated', {
            date: fmtDate(card.last_updated),
            time: fmtTime(card.last_updated),
          })}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.colDrug]}>{t('messaging.cards.thMedication')}</Text>
            <Text style={[styles.th, styles.colDose]}>{t('messaging.cards.thDose')}</Text>
            <Text style={[styles.th, styles.colFor]}>{t('messaging.cards.thTakenFor')}</Text>
            <Text style={[styles.th, styles.colDate]}>{t('messaging.cards.thStartDate')}</Text>
            <Text style={[styles.th, styles.colStatus]}>{t('messaging.cards.thStatus')}</Text>
          </View>

          {card.medications.map((m, i) => (
            <View key={`${m.drug_name}-${i}`} style={[styles.tr, i < card.medications.length - 1 && styles.trDivider]}>
              <View style={[styles.tdDrug, styles.colDrug]}>
                <View style={[styles.pillCircle, { backgroundColor: tintMap[MED_TINTS[i % MED_TINTS.length]].bg }]}>
                  <Icon name="pill" size={16} color={tintMap[MED_TINTS[i % MED_TINTS.length]].fg} />
                </View>
                <View style={styles.flexMin}>
                  <Text style={styles.tdStrong}>{m.drug_name}</Text>
                  <Text style={styles.td}>{m.form}</Text>
                </View>
              </View>
              <Text style={[styles.td, styles.colDose]}>{m.dosage}</Text>
              <Text style={[styles.td, styles.colFor]}>{m.taken_for}</Text>
              <Text style={[styles.td, styles.colDate]}>{fmtDate(m.start_date)}</Text>
              <View style={styles.colStatus}>
                <StatusBadge status={m.status} size="sm" />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.important}>
        <Icon name="shield" size={18} color={colors.statusNormal} />
        <View style={styles.flexMin}>
          <Text style={styles.importantTitle}>{t('messaging.cards.important')}</Text>
          <Text style={styles.importantText}>{card.important}</Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        {/* Four labels share one row at 10 pt with numberOfLines={1}; the FR
            wording is a bare verb so it still fits at 375 pt. */}
        <CardAction
          icon="download"
          label={t('messaging.cards.actionDownload')}
          onPress={() => navigation.navigate('Documents')}
        />
        <CardAction
          icon="plus"
          label={t('messaging.cards.actionAdd')}
          onPress={() => navigation.navigate('Medications')}
        />
        <CardAction
          icon="cart"
          label={t('messaging.cards.actionRefill')}
          onPress={() => navigation.navigate('RequestRefill')}
        />
        <CardAction
          icon="share"
          label={t('messaging.cards.actionShare')}
          onPress={() => navigation.navigate('Documents')}
        />
      </View>
    </Card>
  );
}

function CardAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.cardAction} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <Icon name={icon} size={16} color={colors.link} />
      <Text style={styles.cardActionText} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function KeyValues({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <View style={styles.kvBlock}>
      {rows
        .filter(([, v]) => !!v)
        .map(([k, v]) => (
          <View key={k} style={styles.kv}>
            <Text style={styles.kvKey}>{k}</Text>
            <Text style={styles.kvValue}>{v}</Text>
          </View>
        ))}
    </View>
  );
}

function PrescriptionBlock({
  card,
  reference,
  navigation,
}: {
  card: PrescriptionCard;
  reference: string | null;
  navigation: any;
}) {
  const { t } = useTranslation();
  return (
    <Card style={styles.cardShell} accentColor={colors.tintGreen}>
      <CardHead
        icon="pill"
        tint="green"
        title={card.drug_name}
        meta={t('messaging.cards.prescribedBy', { name: card.prescribed_by })}
      />
      <KeyValues
        rows={[
          [t('messaging.cards.dose'), [card.dosage, card.frequency].filter(Boolean).join(' · ')],
          [t('messaging.cards.route'), card.route],
          [t('messaging.cards.duration'), card.duration],
          [t('messaging.cards.purpose'), card.purpose],
          [t('messaging.cards.refillsLeft'), String(card.refills_left)],
          [t('messaging.cards.instructions'), card.instructions],
        ]}
      />
      {reference ? (
        <CareButton
          label={t('messaging.cards.viewPrescription')}
          variant="secondary"
          size="sm"
          iconRight="chevron-right"
          onPress={() => navigation.navigate('PrescriptionDetail', { prescriptionId: reference })}
        />
      ) : null}
    </Card>
  );
}

function InvoiceBlock({ card, reference, navigation }: { card: InvoiceCard; reference: string | null; navigation: any }) {
  const { t } = useTranslation();
  return (
    <Card variant="flush" style={styles.cardShell}>
      <View style={styles.cardPad}>
        <CardHead
          icon="credit-card"
          tint="blue"
          title={card.invoice_number ?? t('messaging.cards.invoiceFallback')}
          meta={t('messaging.cards.invoiceMeta', { facility: card.facility, date: fmtDate(card.due_at) })}
        />
      </View>
      <View style={styles.cardPadTight}>
        {card.items.map((it) => (
          <View key={it.description} style={styles.lineItem}>
            <Text style={styles.lineItemLabel} numberOfLines={2}>
              {it.description}
            </Text>
            <Text style={styles.lineItemValue}>{money(it.line_total, card.currency)}</Text>
          </View>
        ))}
        <View style={[styles.lineItem, styles.lineTotal]}>
          <Text style={styles.lineTotalLabel}>{t('messaging.cards.balanceDue')}</Text>
          <Text style={styles.lineTotalValue}>{money(card.balance, card.currency)}</Text>
        </View>
      </View>
      <View style={styles.cardPad}>
        <CareButton
          label={t('messaging.cards.payNow')}
          onPress={() =>
            reference ? navigation.navigate('PaymentRequestInvoice', { invoiceId: reference }) : navigation.navigate('Billing')
          }
        />
      </View>
    </Card>
  );
}

function CarePlanBlock({ card, reference, navigation }: { card: CarePlanCard; reference: string | null; navigation: any }) {
  const { t } = useTranslation();
  return (
    <Card style={styles.cardShell}>
      <CardHead
        icon="clipboard"
        tint="purple"
        title={card.title}
        meta={t('messaging.cards.carePlanBy', { name: card.created_by })}
      />
      <View style={styles.badgeRow}>
        <StatusBadge status={card.status} size="sm" />
        <StatusBadge status={card.priority === 'high' ? 'attention' : card.priority} size="sm" />
      </View>
      <KeyValues
        rows={[
          [t('messaging.cards.goal'), card.goal],
          [t('messaging.cards.targetDate'), fmtDate(card.target_date)],
        ]}
      />
      <View style={styles.bullets}>
        {card.interventions.map((step) => (
          <View key={step} style={styles.bullet}>
            <Icon name="check-circle" size={16} color={colors.statusNormal} />
            <Text style={styles.bulletText}>{step}</Text>
          </View>
        ))}
      </View>
      {reference ? (
        <CareButton
          label={t('messaging.cards.openCarePlan')}
          variant="secondary"
          size="sm"
          iconRight="chevron-right"
          onPress={() => navigation.navigate('CarePlanDetail', { carePlanId: reference })}
        />
      ) : null}
    </Card>
  );
}

function ReferralBlock({ card, reference, navigation }: { card: ReferralCard; reference: string | null; navigation: any }) {
  const { t } = useTranslation();
  return (
    <Card style={styles.cardShell}>
      <CardHead
        icon="share"
        tint="purple"
        title={card.referred_to}
        meta={t('messaging.cards.referralMeta', { specialty: card.specialty, facility: card.facility })}
      />
      <View style={styles.badgeRow}>
        <StatusBadge status={card.status} size="sm" />
        <StatusBadge status={card.urgency} size="sm" />
      </View>
      <KeyValues
        rows={[
          [t('messaging.cards.reason'), card.reason],
          [t('messaging.cards.referredBy'), card.referred_by],
          [t('messaging.cards.referredOn'), fmtDate(card.referred_at)],
          [
            t('messaging.cards.appointment'),
            card.appointment_at ? `${fmtDate(card.appointment_at)}, ${fmtTime(card.appointment_at)}` : null,
          ],
        ]}
      />
      {reference ? (
        <CareButton
          label={t('messaging.cards.viewReferral')}
          variant="secondary"
          size="sm"
          iconRight="chevron-right"
          onPress={() => navigation.navigate('ReferralDetail', { referralId: reference })}
        />
      ) : null}
    </Card>
  );
}

function FollowUpBlock({ card }: { card: FollowUpInstructionsCard }) {
  const { t } = useTranslation();
  return (
    <Card style={styles.cardShell}>
      <CardHead
        icon="calendar-check"
        tint="blue"
        title={card.title}
        meta={t('messaging.cards.dueBy', { date: fmtDate(card.due_by) })}
      />
      <View style={styles.bullets}>
        {card.steps.map((s) => (
          <View key={s.label} style={styles.bullet}>
            <Icon name="check-circle" size={16} color={colors.link} />
            <View style={styles.flexMin}>
              <Text style={styles.bulletTitle}>{s.label}</Text>
              <Text style={styles.bulletText}>{s.detail}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.warning}>
        <Icon name="alert-triangle" size={18} color={colors.statusCritical} />
        <View style={styles.flexMin}>
          <Text style={styles.warningTitle}>{t('messaging.cards.warningTitle')}</Text>
          <Text style={styles.warningText}>{card.warning_signs.join(' · ')}</Text>
        </View>
      </View>
    </Card>
  );
}

function ImagingBlock({ card, reference, navigation }: { card: ImagingResultCard; reference: string | null; navigation: any }) {
  const { t } = useTranslation();
  return (
    <Card style={styles.cardShell}>
      <CardHead
        icon="image"
        tint="blue"
        title={card.study}
        meta={t('messaging.cards.imagingMeta', { modality: card.modality, bodyPart: card.body_part })}
      />
      <View style={styles.badgeRow}>
        <StatusBadge status={card.is_abnormal ? 'abnormal' : 'normal'} size="sm" />
        <StatusBadge status={card.status} size="sm" />
      </View>
      <KeyValues
        rows={[
          [t('messaging.cards.summary'), card.result_summary],
          [t('messaging.cards.impression'), card.impression],
          [t('messaging.cards.reportedBy'), card.reported_by],
          [t('messaging.cards.performed'), fmtDate(card.performed_at)],
        ]}
      />
      {reference ? (
        <CareButton
          label={t('messaging.cards.viewFullReport')}
          variant="secondary"
          size="sm"
          iconRight="chevron-right"
          onPress={() => navigation.navigate('ImagingResultDetail', { studyId: reference })}
        />
      ) : null}
    </Card>
  );
}

// ── Quick actions + composer ──────────────────────────────────────────────

/** Built per render so the labels follow the locale (and stay literal keys). */
function quickItems(t: TFunction): { key: string; icon: IconName; tint: Tint; label: string }[] {
  return [
    { key: 'reminder', icon: 'bell', tint: 'purple', label: t('messaging.quick.reminder') },
    { key: 'pharmacy', icon: 'cart', tint: 'green', label: t('messaging.quick.pharmacy') },
    { key: 'ask', icon: 'help-circle', tint: 'purple', label: t('messaging.quick.ask') },
    { key: 'followup', icon: 'calendar-plus', tint: 'amber', label: t('messaging.quick.followUp') },
    { key: 'video', icon: 'video', tint: 'green', label: t('messaging.quick.video') },
  ];
}

function QuickActions({ onAction }: { onAction: (key: string) => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.quickWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
        {quickItems(t).map((q, i) => (
          <TouchableOpacity
            key={q.key}
            style={[styles.quick, i > 0 && styles.quickDivided]}
            activeOpacity={0.7}
            onPress={() => onAction(q.key)}
            accessibilityRole="button"
          >
            <View style={[styles.quickCircle, { backgroundColor: tintMap[q.tint].bg }]}>
              <Icon name={q.icon} size={20} color={tintMap[q.tint].fg} />
            </View>
            <Text style={styles.quickLabel} numberOfLines={2}>
              {q.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  sending,
  error,
  bottomInset,
}: {
  value: string;
  onChange: (t: string) => void;
  onSend: () => void;
  sending: boolean;
  error: string | null;
  bottomInset: number;
}) {
  const { t } = useTranslation();
  const canSend = value.trim().length > 0 && !sending;
  return (
    <View style={[styles.composerWrap, { paddingBottom: Math.max(bottomInset, spacing.sm) }]}>
      {error ? <Text style={styles.composerError}>{error}</Text> : null}
      <View style={styles.composer}>
        <View style={styles.composerIcon} {...decorative}>
          <Icon name="paperclip" size={20} color={colors.link} />
        </View>
        <TextInput
          style={styles.composerInput}
          value={value}
          onChangeText={onChange}
          placeholder={t('messaging.inbox.composerPlaceholder')}
          placeholderTextColor={colors.textMuted}
          multiline
          onSubmitEditing={onSend}
          autoComplete="off"
          textContentType="none"
          accessibilityLabel={t('messaging.inbox.composerPlaceholder')}
        />
        <Icon name="smile" size={22} color={colors.link} />
        <TouchableOpacity
          style={[styles.sendButton, !canSend && styles.sendButtonOff]}
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={t('messaging.inbox.sendA11y')}
        >
          {sending ? (
            <ActivityIndicator color={colors.textOnBrand} />
          ) : (
            <Icon name="send" size={20} color={colors.textOnBrand} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Overlays ──────────────────────────────────────────────────────────────

function Sheet({
  title,
  subtitle,
  onClose,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('messaging.inbox.closeA11y')}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.sheetGrab} />
        <View style={styles.sheetHead}>
          <View style={styles.flexMin}>
            <Text style={styles.sheetTitle}>{title}</Text>
            {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
          </View>
          {right}
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('messaging.inbox.closeA11y')}>
            <Icon name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

function ThreadSwitcher({
  threads,
  activeId,
  onClose,
  onPick,
  onNew,
}: {
  threads: PortalThread[];
  activeId: string | null;
  onClose: () => void;
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet
      title={t('messaging.threads.title')}
      subtitle={t('messaging.threads.subtitle', { count: threads.length })}
      onClose={onClose}
    >
      <Card variant="flush">
        {/* `row`, not `t` — the loop variable used to shadow the translator. */}
        {threads.map((row, i) => (
          <ListRow
            key={row.id}
            icon="chat"
            tint={row.unread_count > 0 ? 'blue' : 'green'}
            // Provider, facility, subject and preview are all the server's text.
            title={row.provider_name ?? row.facility_name ?? t('messaging.threads.careTeamFallback')}
            subtitle={row.last_message_preview ?? row.subject ?? undefined}
            onPress={() => onPick(row.id)}
            divider={i < threads.length - 1}
            trailing={
              row.unread_count > 0 ? (
                <View style={styles.unreadPill}>
                  <Text style={styles.unreadPillText}>{row.unread_count}</Text>
                </View>
              ) : row.id === activeId ? (
                <Icon name="check-circle" size={20} color={colors.statusNormal} />
              ) : undefined
            }
          />
        ))}
      </Card>
      <CareButton label={t('messaging.threads.newMessage')} icon="send" onPress={onNew} />
    </Sheet>
  );
}

function NotificationsSheet({
  onClose,
  onCount,
  onOpen,
}: {
  onClose: () => void;
  onCount: (n: number) => void;
  onOpen: (n: PortalNotification) => void;
}) {
  const { t } = useTranslation();
  const state = useAsync(() => fetchNotifications({ per_page: 25 }), []);
  const { reload, data } = state;

  React.useEffect(() => {
    if (data) onCount(data.data.filter((n) => !n.is_read).length);
  }, [data, onCount]);

  const tintFor = (n: PortalNotification): Tint =>
    n.severity === 'critical' ? 'red' : n.severity === 'warning' ? 'amber' : n.severity === 'success' ? 'green' : 'blue';

  return (
    <Sheet
      title={t('messaging.notifications.title')}
      onClose={onClose}
      right={
        <TouchableOpacity
          onPress={async () => {
            await markAllNotificationsRead();
            reload();
          }}
          accessibilityRole="button"
        >
          <Text style={styles.sheetAction}>{t('messaging.notifications.markAllRead')}</Text>
        </TouchableOpacity>
      }
    >
      <AsyncBoundary
        state={state}
        onLink={onClose}
        loadingLabel={t('messaging.notifications.loading')}
        isEmpty={(d) => d.data.length === 0}
        empty={
          <EmptyState
            icon="bell-off"
            tint="blue"
            title={t('messaging.notifications.emptyTitle')}
            message={t('messaging.notifications.sheetEmptyMessage')}
          />
        }
      >
        {(page) => (
          <Card variant="flush">
            {page.data.map((n, i) => (
              <ListRow
                key={n.id}
                icon="bell"
                tint={tintFor(n)}
                title={n.title}
                subtitle={n.body ?? undefined}
                meta={n.body ? undefined : [n.category, `${fmtDate(n.created_at)}, ${fmtTime(n.created_at)}`]}
                divider={i < page.data.length - 1}
                onPress={async () => {
                  if (!n.is_read) await markNotificationRead(n.id);
                  onOpen(n);
                }}
                trailing={!n.is_read ? <View style={styles.unreadDot} /> : undefined}
              />
            ))}
          </Card>
        )}
      </AsyncBoundary>
    </Sheet>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  flexMin: { flex: 1, minWidth: 0 },

  // Provider strip
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stripAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripAvatarText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.blue,
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.statusNormal,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  stripBody: { flex: 1, minWidth: 0, gap: 1 },
  stripNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stripName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  stripFacility: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stripMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    flexShrink: 1,
  },

  // Thread
  thread: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.lg },
  encrypted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  encryptedText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.link,
  },
  timeline: { gap: spacing.md },
  separator: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  separatorRule: { flex: 1, height: 1, backgroundColor: colors.border },
  separatorText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  bubbleTheirs: { backgroundColor: colors.surface, borderColor: colors.border, borderBottomLeftRadius: radii.sm },
  bubbleMine: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft, borderBottomRightRadius: radii.sm },
  bubbleText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  bubbleFoot: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 5, marginTop: 2 },
  stamp: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  stampRight: { alignSelf: 'flex-end', marginTop: 4 },

  msgAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgAvatarText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    color: colors.blue,
  },

  // Cards
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardBody: { flex: 1, minWidth: 0 },
  cardShell: { width: '100%' },
  cardPad: { padding: spacing.md },
  cardPadTight: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardHeadCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  cardMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  th: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  trDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  tdDrug: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tdStrong: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
  },
  td: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  colDrug: { width: 150 },
  colDose: { width: 110 },
  colFor: { width: 100 },
  colDate: { width: 92 },
  colStatus: { width: 70 },
  pillCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  important: {
    flexDirection: 'row',
    gap: spacing.sm,
    margin: spacing.md,
    padding: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.statusNormalBg,
  },
  importantTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.statusNormal,
  },
  importantText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  cardAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderLeftWidth: 1,
    borderLeftColor: colors.divider,
  },
  cardActionText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    color: colors.link,
    textAlign: 'center',
  },

  kvBlock: { gap: 6, marginTop: spacing.md, marginBottom: spacing.md },
  kv: { flexDirection: 'row', gap: spacing.sm },
  kvKey: {
    width: 96,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  kvValue: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textPrimary,
  },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  bullets: { gap: spacing.sm, marginBottom: spacing.md },
  bullet: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bulletTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
  },
  bulletText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  warning: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.statusCriticalBg,
  },
  warningTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.statusCritical,
  },
  warningText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  lineItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
  lineItemLabel: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  lineItemValue: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
  },
  lineTotal: { borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 4 },
  lineTotalLabel: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  lineTotalValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.sm,
    color: colors.blue,
  },

  // Quick actions
  quickWrap: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  quickRow: { paddingHorizontal: spacing.sm, paddingVertical: 10 },
  quick: { width: 96, alignItems: 'center', gap: 6, paddingHorizontal: 6 },
  quickDivided: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  quickCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  quickLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    color: colors.link,
  },

  // Composer
  composerWrap: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 6,
  },
  composerError: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.statusCritical,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  composerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    maxHeight: 96,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    paddingVertical: Platform.OS === 'ios' ? 6 : 2,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonOff: { backgroundColor: colors.textMuted },

  // Sheets
  backdrop: { flex: 1, backgroundColor: 'rgba(11,26,92,0.35)' },
  sheet: {
    // Opaque `page`, not the now-transparent `background`: this sheet floats in
    // a transparent Modal with no opaque layer behind it, so `background` let
    // the screen bleed through. `page` restores the pre-watermark look.
    backgroundColor: colors.page,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    maxHeight: '86%',
  },
  sheetGrab: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.sm },
  sheetTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  sheetSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  sheetAction: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.link,
  },
  sheetBody: { gap: spacing.md, paddingBottom: spacing.md },

  unreadPill: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadPillText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    color: colors.textOnBrand,
  },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.badge },
});
