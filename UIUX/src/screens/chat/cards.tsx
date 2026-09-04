/**
 * The rich in-chat cards a provider can send (MSG-002 and its siblings
 * MSG-012 prescription, MSG-024 care plan, MSG-025 follow-up, MSG-026
 * referral, DIA-020 imaging result, BILL-001 invoice).
 *
 * The API hands us a discriminated union — `card_type` picks the payload shape
 * (see `src/api/messaging.ts`). Each renderer below follows the MSG-026
 * reference: a tint-circle heading with a status pill, a bordered document
 * body of labelled sections, then the card's actions.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type {
  AppointmentCard,
  CarePlanCard,
  DocumentRequestCard,
  ImagingOrderCard,
  LabOrderCard,
  FollowUpInstructionsCard,
  ImagingResultCard,
  InvoiceCard,
  PortalMessage,
  PrescriptionCard,
  ReferralCard,
} from '../../api';
import { Icon, IconName, StatusBadge } from '../../components';
import { useTranslation } from '../../i18n';
import { colors, radii, spacing, typography, Tint } from '../../theme/theme';
import {
  CardHeading,
  ChatButton,
  dateAndTime,
  DetailRow,
  money,
  moneyFull,
  shortDate,
  TotalBand,
} from './shared';

/** A labelled block inside the document body ("REASON FOR REFERRAL"). */
function Section({ icon, title, children }: { icon?: IconName; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        {!!icon && <Icon name={icon} size={16} color={colors.link} />}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <View style={styles.docBody}>{children}</View>;
}

function Para({ children }: { children: React.ReactNode }) {
  return <Text style={styles.para}>{children}</Text>;
}

function Bullets({ items, ordered }: { items: string[]; ordered?: boolean }) {
  return (
    <View style={styles.bullets}>
      {items.map((item, i) => (
        <View key={`${i}-${item}`} style={styles.bulletRow}>
          <Text style={styles.bulletMark}>{ordered ? `${i + 1}.` : '•'}</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const URGENCY_TINT: Record<ReferralCard['urgency'], Tint> = {
  routine: 'blue',
  urgent: 'amber',
  emergency: 'red',
};

const PRIORITY_TINT: Record<CarePlanCard['priority'], Tint> = {
  low: 'green',
  medium: 'amber',
  high: 'red',
};

/**
 * The API's enum tokens are not prose — the card composes them into an English
 * phrase ("high priority", "Routine"). Because the app builds the phrase, the
 * phrase is chrome, so it is translated. The raw `card.status` badges are left
 * exactly as the server sent them.
 */
const PLAN_PRIORITY_KEY: Record<CarePlanCard['priority'], string> = {
  low: 'chat.cards.priorityLow',
  medium: 'chat.cards.priorityMedium',
  high: 'chat.cards.priorityHigh',
};

const URGENCY_KEY: Record<ReferralCard['urgency'], string> = {
  routine: 'chat.cards.urgencyRoutine',
  urgent: 'chat.cards.urgencyUrgent',
  emergency: 'chat.cards.urgencyEmergency',
};

const ORDER_PRIORITY_KEY: Record<string, string> = {
  routine: 'chat.cards.priorityRoutine',
  urgent: 'chat.cards.priorityUrgent',
  stat: 'chat.cards.priorityStat',
};

// ── Individual cards ──────────────────────────────────────────────────────

export function PrescriptionCardView({ card, onOpen }: { card: PrescriptionCard; onOpen?: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <CardHeading
        icon="pill"
        tint="green"
        title={t('chat.cards.prescriptionTitle')}
        subtitle={t('chat.cards.prescribedBy', { name: card.prescribed_by })}
        right={<StatusBadge status={t('chat.cards.issued')} tone="normal" size="sm" />}
      />
      <Body>
        <Text style={styles.docTitle}>{card.drug_name}</Text>
        <DetailRow label={t('chat.cards.dosage')} value={card.dosage ?? '—'} />
        <DetailRow label={t('chat.cards.frequency')} value={card.frequency ?? '—'} />
        <DetailRow label={t('chat.cards.route')} value={card.route ?? '—'} />
        <DetailRow label={t('chat.cards.duration')} value={card.duration ?? '—'} />
        <DetailRow label={t('chat.cards.refillsLeft')} value={String(card.refills_left)} divider={!!card.purpose} />
        {!!card.purpose && <DetailRow label={t('chat.cards.purpose')} value={card.purpose} divider={false} />}
        {!!card.instructions && (
          <Section title={t('chat.cards.instructionsSection')}>
            <Para>{card.instructions}</Para>
          </Section>
        )}
      </Body>
      {!!onOpen && (
        <ChatButton
          label={t('chat.cards.viewPrescription')}
          icon="document-text"
          variant="secondary"
          onPress={onOpen}
        />
      )}
    </>
  );
}

export function CarePlanCardView({ card, onOpen }: { card: CarePlanCard; onOpen?: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <CardHeading
        icon="clipboard"
        tint="purple"
        title={t('chat.cards.carePlanTitle')}
        subtitle={t('chat.cards.createdBy', { name: card.created_by })}
        right={<StatusBadge status={card.status} size="sm" />}
      />
      <Body>
        <Text style={styles.docTitle}>{card.title}</Text>
        <View style={styles.chipRow}>
          <StatusBadge
            status={t(PLAN_PRIORITY_KEY[card.priority])}
            tone={PRIORITY_TINT[card.priority] === 'red' ? 'critical' : PRIORITY_TINT[card.priority] === 'amber' ? 'warning' : 'normal'}
            size="sm"
          />
          <StatusBadge
            status={t('chat.cards.targetBadge', { date: shortDate(card.target_date) })}
            tone="pending"
            size="sm"
          />
        </View>
        <Section icon="activity" title={t('chat.cards.goalSection')}>
          <Para>{card.goal}</Para>
        </Section>
        {card.interventions.length > 0 && (
          <Section icon="list" title={t('chat.cards.interventionsSection')}>
            <Bullets items={card.interventions} ordered />
          </Section>
        )}
      </Body>
      {!!onOpen && (
        <ChatButton label={t('chat.cards.viewCarePlan')} icon="clipboard" variant="secondary" onPress={onOpen} />
      )}
    </>
  );
}

export function FollowUpCardView({ card }: { card: FollowUpInstructionsCard }) {
  const { t } = useTranslation();
  return (
    <>
      <CardHeading
        icon="calendar-check"
        tint="blue"
        title={t('chat.cards.followUpTitle')}
        subtitle={t('chat.cards.dueBy', { date: shortDate(card.due_by) })}
        right={<StatusBadge status={t('chat.cards.actionNeeded')} tone="warning" size="sm" />}
      />
      <Body>
        <Text style={styles.docTitle}>{card.title}</Text>
        <View style={styles.steps}>
          {card.steps.map((s, i) => (
            <View key={s.label} style={styles.step}>
              <View style={styles.stepIndex}>
                <Text style={styles.stepIndexText}>{i + 1}</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepLabel}>{s.label}</Text>
                <Text style={styles.stepDetail}>{s.detail}</Text>
              </View>
            </View>
          ))}
        </View>
        {card.warning_signs.length > 0 && (
          <View style={styles.warning}>
            <View style={styles.sectionHead}>
              <Icon name="alert-triangle" size={16} color={colors.statusCritical} />
              <Text style={[styles.sectionTitle, styles.warningTitle]}>{t('chat.cards.warningSection')}</Text>
            </View>
            <Bullets items={card.warning_signs} />
          </View>
        )}
      </Body>
    </>
  );
}

export function ReferralCardView({ card, onOpen }: { card: ReferralCard; onOpen?: () => void }) {
  const { t } = useTranslation();
  const tint = URGENCY_TINT[card.urgency];
  return (
    <>
      <CardHeading
        icon="document-text"
        tint="purple"
        title={t('chat.cards.referralTitle')}
        subtitle={t('chat.cards.referredBy', { name: card.referred_by, facility: card.facility })}
        right={<StatusBadge status={card.status} size="sm" />}
      />
      <Body>
        <View style={styles.docHead}>
          <Text style={styles.docTitle}>{t('chat.cards.referralDocTitle')}</Text>
          <Text style={styles.docMeta}>{shortDate(card.referred_at)}</Text>
        </View>
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.colLabel}>{t('chat.cards.from')}</Text>
            <Text style={styles.colValue}>{card.referred_by}</Text>
            <Text style={styles.colMeta}>{card.facility}</Text>
          </View>
          <View style={styles.col}>
            <Text style={styles.colLabel}>{t('chat.cards.to')}</Text>
            <Text style={styles.colValue}>{card.referred_to}</Text>
            <Text style={styles.colMeta}>{card.specialty}</Text>
          </View>
        </View>
        <Section icon="info" title={t('chat.cards.reasonSection')}>
          <Para>{card.reason}</Para>
        </Section>
        <DetailRow
          label={t('chat.cards.urgency')}
          value={t(URGENCY_KEY[card.urgency])}
          valueColor={tint === 'red' ? colors.statusCritical : tint === 'amber' ? colors.statusWarning : colors.link}
        />
        <DetailRow
          label={t('chat.cards.appointment')}
          value={card.appointment_at ? shortDate(card.appointment_at) : t('chat.cards.toBeScheduled')}
          divider={false}
        />
      </Body>
      {!!onOpen && (
        <ChatButton label={t('chat.cards.viewReferral')} icon="external-link" variant="secondary" onPress={onOpen} />
      )}
    </>
  );
}

export function ImagingResultCardView({ card, onOpen }: { card: ImagingResultCard; onOpen?: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <CardHeading
        icon="image"
        tint={card.is_abnormal ? 'amber' : 'blue'}
        title={t('chat.cards.imagingResultTitle')}
        subtitle={t('chat.cards.reportedBy', { name: card.reported_by })}
        right={
          <StatusBadge
            status={card.is_abnormal ? t('chat.cards.abnormal') : t('chat.cards.normal')}
            tone={card.is_abnormal ? 'critical' : 'normal'}
            size="sm"
          />
        }
      />
      <Body>
        <Text style={styles.docTitle}>{card.study}</Text>
        <DetailRow label={t('chat.cards.modality')} value={card.modality} />
        <DetailRow label={t('chat.cards.bodyPart')} value={card.body_part} />
        <DetailRow label={t('chat.cards.performed')} value={shortDate(card.performed_at)} divider={false} />
        <Section icon="document-text" title={t('chat.cards.resultSection')}>
          <Para>{card.result_summary}</Para>
        </Section>
        {!!card.findings && (
          <Section title={t('chat.cards.findingsSection')}>
            <Para>{card.findings}</Para>
          </Section>
        )}
        {!!card.impression && (
          <Section title={t('chat.cards.impressionSection')}>
            <Para>{card.impression}</Para>
          </Section>
        )}
      </Body>
      {!!onOpen && (
        <ChatButton label={t('chat.cards.viewFullReport')} icon="eye" variant="secondary" onPress={onOpen} />
      )}
    </>
  );
}

export function InvoiceCardView({ card, onPay }: { card: InvoiceCard; onPay?: () => void }) {
  const { t } = useTranslation();
  const paid = card.balance <= 0;
  return (
    <>
      <CardHeading
        icon="document-text"
        tint="blue"
        title={t('chat.cards.invoiceTitle')}
        subtitle={card.facility}
        right={
          <StatusBadge
            status={paid ? t('chat.cards.paid') : t('chat.cards.due')}
            tone={paid ? 'normal' : 'warning'}
            size="sm"
          />
        }
        meta={card.invoice_number}
      />
      <Body>
        <View style={styles.tableHead}>
          <Text style={[styles.thText, styles.tdDesc]}>{t('chat.cards.thDescription')}</Text>
          <Text style={[styles.thText, styles.tdQty]}>{t('chat.cards.thQty')}</Text>
          <Text style={[styles.thText, styles.tdAmount]}>{t('chat.cards.thTotal')}</Text>
        </View>
        {card.items.map((item, i) => (
          <View key={`${i}-${item.description}`} style={styles.tableRow}>
            <Text style={[styles.tdText, styles.tdDesc]}>{item.description}</Text>
            <Text style={[styles.tdText, styles.tdQty]}>{item.quantity}</Text>
            <Text style={[styles.tdText, styles.tdAmount, styles.tdStrong]}>{money(item.line_total)}</Text>
          </View>
        ))}
        <TotalBand label={t('chat.cards.totalPayable')} value={moneyFull(card.total, card.currency)} />
        {!paid && (
          <Text style={styles.balanceNote}>
            {t('chat.cards.balanceNote', {
              amount: moneyFull(card.balance, card.currency),
              date: shortDate(card.due_at),
            })}
          </Text>
        )}
      </Body>
      {!!onPay && !paid && (
        <ChatButton
          label={t('chat.cards.payNow', { amount: moneyFull(card.balance, card.currency) })}
          icon="lock"
          onPress={onPay}
        />
      )}
      {!!onPay && paid && (
        <ChatButton label={t('chat.cards.viewInvoice')} icon="document-text" variant="secondary" onPress={onPay} />
      )}
    </>
  );
}

// ── Dispatcher ────────────────────────────────────────────────────────────

/**
 * WGT-001 appointment card — the real booking, re-derived from the scheduling
 * module on every read. Cancel or move the appointment anywhere else in the
 * platform and that is what shows here.
 */
export function AppointmentCardView({ card, onOpen }: { card: AppointmentCard; onOpen?: () => void }) {
  const { t } = useTranslation();
  const cancelled = card.is_cancelled;

  return (
    <>
      <CardHeading
        icon="calendar-check"
        tint={cancelled ? 'red' : 'amber'}
        title={t('chat.cards.appointmentTitle')}
        subtitle={card.department ?? card.facility ?? undefined}
        right={<StatusBadge status={card.status} size="sm" />}
      />
      <Body>
        <Text style={styles.docTitle}>{card.provider_name}</Text>
        {!!card.specialty && <Text style={styles.docMeta}>{card.specialty}</Text>}
        <DetailRow label={t('chat.cards.when')} value={dateAndTime(card.scheduled_at)} />
        <DetailRow
          label={t('chat.cards.duration')}
          value={t('chat.cards.durationMinutes', { count: card.duration_minutes })}
        />
        <DetailRow
          label={t('chat.cards.mode')}
          value={card.visit_mode === 'telemedicine' ? t('chat.cards.modeVideo') : t('chat.cards.modeInPerson')}
        />
        <DetailRow
          label={t('chat.cards.where')}
          value={card.location ?? card.room ?? '—'}
          divider={!!card.reason || cancelled}
        />
        {!!card.reason && (
          <Section icon="clipboard" title={t('chat.cards.appointmentReasonSection')}>
            <Para>{card.reason}</Para>
          </Section>
        )}
        {cancelled && (
          <View style={styles.warning}>
            <Text style={[styles.sectionTitle, styles.warningTitle]}>{t('chat.cards.cancelledSection')}</Text>
            <Para>{card.cancel_reason ?? t('chat.cards.cancelledFallback')}</Para>
          </View>
        )}
      </Body>
      {!!onOpen && !cancelled && (
        <ChatButton label={t('chat.cards.viewAppointment')} icon="calendar" variant="secondary" onPress={onOpen} />
      )}
    </>
  );
}

/** WGT-001 lab order — an order placed, or a request awaiting approval. */
export function LabOrderCardView({ card, onOpen }: { card: LabOrderCard; onOpen?: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <CardHeading
        icon="flask"
        tint="purple"
        title={card.needs_approval ? t('chat.cards.labRequestTitle') : t('chat.cards.labOrderTitle')}
        subtitle={t('chat.cards.orderedBy', { name: card.ordered_by })}
        right={<StatusBadge status={card.status} size="sm" />}
      />
      <Body>
        <Text style={styles.docTitle}>{card.title}</Text>
        <View style={styles.chipRow}>
          <StatusBadge
            status={t(ORDER_PRIORITY_KEY[card.priority] ?? 'chat.cards.priorityRoutine')}
            tone={card.priority === 'stat' ? 'critical' : card.priority === 'urgent' ? 'warning' : 'normal'}
            size="sm"
          />
          {!!card.reference && <StatusBadge status={card.reference} tone="neutral" size="sm" />}
        </View>
        <DetailRow label={t('chat.cards.ordered')} value={shortDate(card.ordered_at)} divider={!!card.clinical_notes} />
        {!!card.clinical_notes && (
          <Section icon="clipboard" title={t('chat.cards.clinicalIndicationSection')}>
            <Para>{card.clinical_notes}</Para>
          </Section>
        )}
        {!!card.result_summary && (
          <Section
            icon="activity"
            title={card.needs_approval ? t('chat.cards.decisionSection') : t('chat.cards.labResultSection')}
          >
            <Para>{card.result_summary}</Para>
          </Section>
        )}
        {card.needs_approval && !card.result_summary && (
          <Text style={styles.docMeta}>{t('chat.cards.awaitingReview')}</Text>
        )}
      </Body>
      {!!onOpen && (
        <ChatButton label={t('chat.cards.viewResults')} icon="flask" variant="secondary" onPress={onOpen} />
      )}
    </>
  );
}

/** WGT-001 imaging order — the row the radiology worklist picked up. */
export function ImagingOrderCardView({ card, onOpen }: { card: ImagingOrderCard; onOpen?: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <CardHeading
        icon="image"
        tint="blue"
        title={t('chat.cards.imagingOrderTitle')}
        subtitle={t('chat.cards.orderedBy', { name: card.ordered_by })}
        right={<StatusBadge status={card.status} size="sm" />}
      />
      <Body>
        <Text style={styles.docTitle}>{card.study}</Text>
        <View style={styles.chipRow}>
          <StatusBadge status={card.modality} tone="info" size="sm" />
          {!!card.body_part && <StatusBadge status={card.body_part} tone="neutral" size="sm" />}
          <StatusBadge
            status={t(ORDER_PRIORITY_KEY[card.priority] ?? 'chat.cards.priorityRoutine')}
            tone={card.priority === 'stat' ? 'critical' : card.priority === 'urgent' ? 'warning' : 'normal'}
            size="sm"
          />
        </View>
        <DetailRow label={t('chat.cards.ordered')} value={shortDate(card.ordered_at)} />
        <DetailRow
          label={t('chat.cards.scheduled')}
          value={card.scheduled_at ? dateAndTime(card.scheduled_at) : t('chat.cards.notScheduled')}
        />
        <DetailRow
          label={t('chat.cards.orderNumber')}
          value={card.order_number ?? '—'}
          divider={!!card.clinical_indication}
        />
        {!!card.clinical_indication && (
          <Section icon="clipboard" title={t('chat.cards.clinicalIndicationSection')}>
            <Para>{card.clinical_indication}</Para>
          </Section>
        )}
        {!!card.patient_note && (
          <Section icon="info" title={t('chat.cards.patientNoteSection')}>
            <Para>{card.patient_note}</Para>
          </Section>
        )}
      </Body>
      {!!onOpen && (
        <ChatButton label={t('chat.cards.viewImaging')} icon="image" variant="secondary" onPress={onOpen} />
      )}
    </>
  );
}

/** WGT-001 document request — tracked in Documents until someone attaches the file. */
export function DocumentRequestCardView({ card, onOpen }: { card: DocumentRequestCard; onOpen?: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <CardHeading
        icon="document-text"
        tint="green"
        title={t('chat.cards.documentRequestTitle')}
        subtitle={t('chat.cards.requestedBy', { name: card.requested_by })}
        right={
          <StatusBadge
            // Only the app's own "ready" is translated; `card.status` is the
            // server's word and keeps its own tone mapping.
            status={card.is_fulfilled ? t('chat.cards.ready') : card.status}
            tone={card.is_fulfilled ? 'normal' : undefined}
            size="sm"
          />
        }
      />
      <Body>
        <Text style={styles.docTitle}>{card.label}</Text>
        <Text style={styles.docMeta}>{card.type_label}</Text>
        <DetailRow label={t('chat.cards.requested')} value={shortDate(card.requested_at)} />
        <DetailRow
          label={t('chat.cards.neededBy')}
          value={card.needed_by ? shortDate(card.needed_by) : t('chat.cards.noDeadline')}
        />
        <DetailRow label={t('chat.cards.reference')} value={card.reference ?? '—'} divider={!!card.note} />
        {!!card.note && (
          <Section icon="info" title={t('chat.cards.noteSection')}>
            <Para>{card.note}</Para>
          </Section>
        )}
      </Body>
      {!!onOpen && card.file_available && (
        <ChatButton label={t('chat.cards.openDocument')} icon="document-text" variant="secondary" onPress={onOpen} />
      )}
    </>
  );
}

export type CardHandlers = {
  onOpenPrescription?: (id: string | null) => void;
  onOpenCarePlan?: (id: string | null) => void;
  onOpenReferral?: (id: string | null) => void;
  onOpenImaging?: (id: string | null) => void;
  onOpenInvoice?: (id: string | null) => void;
  onOpenAppointment?: (id: string | null) => void;
  onOpenLabOrder?: (id: string | null) => void;
  onOpenImagingOrder?: (id: string | null) => void;
  onOpenDocument?: (id: string | null) => void;
};

/**
 * Renders the card carried by `message`, or `null` when the type isn't one we
 * have a design for (the bubble body still renders in that case).
 */
export function MessageCard({ message, handlers }: { message: PortalMessage; handlers: CardHandlers }) {
  const ref = message.card_reference_id;
  const payload = message.card_payload;
  if (!payload || typeof payload !== 'object') return null;

  switch (message.card_type) {
    case 'prescription':
      return (
        <PrescriptionCardView
          card={payload as PrescriptionCard}
          onOpen={handlers.onOpenPrescription ? () => handlers.onOpenPrescription?.(ref) : undefined}
        />
      );
    case 'care_plan':
      return (
        <CarePlanCardView
          card={payload as CarePlanCard}
          onOpen={handlers.onOpenCarePlan ? () => handlers.onOpenCarePlan?.(ref) : undefined}
        />
      );
    case 'follow_up_instructions':
      return <FollowUpCardView card={payload as FollowUpInstructionsCard} />;
    case 'referral':
      return (
        <ReferralCardView
          card={payload as ReferralCard}
          onOpen={handlers.onOpenReferral ? () => handlers.onOpenReferral?.(ref) : undefined}
        />
      );
    case 'imaging_result':
      return (
        <ImagingResultCardView
          card={payload as ImagingResultCard}
          onOpen={handlers.onOpenImaging ? () => handlers.onOpenImaging?.(ref) : undefined}
        />
      );
    case 'invoice':
      return (
        <InvoiceCardView
          card={payload as InvoiceCard}
          onPay={handlers.onOpenInvoice ? () => handlers.onOpenInvoice?.(ref) : undefined}
        />
      );
    case 'appointment':
      return (
        <AppointmentCardView
          card={payload as AppointmentCard}
          onOpen={handlers.onOpenAppointment ? () => handlers.onOpenAppointment?.(ref) : undefined}
        />
      );
    case 'lab_order':
      return (
        <LabOrderCardView
          card={payload as LabOrderCard}
          onOpen={handlers.onOpenLabOrder ? () => handlers.onOpenLabOrder?.(ref) : undefined}
        />
      );
    case 'imaging_order':
      return (
        <ImagingOrderCardView
          card={payload as ImagingOrderCard}
          onOpen={handlers.onOpenImagingOrder ? () => handlers.onOpenImagingOrder?.(ref) : undefined}
        />
      );
    case 'document_request':
      return (
        <DocumentRequestCardView
          card={payload as DocumentRequestCard}
          onOpen={handlers.onOpenDocument ? () => handlers.onOpenDocument?.(ref) : undefined}
        />
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  docBody: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm + 2,
    padding: spacing.sm + 4,
    gap: spacing.sm,
  },
  docHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  docTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  docMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },

  section: { gap: 4, marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.link,
  },
  para: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.md,
    color: colors.textPrimary,
  },

  bullets: { gap: 4 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletMark: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textMuted,
    minWidth: 16,
  },
  bulletText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  twoCol: { flexDirection: 'row', gap: spacing.md },
  col: { flex: 1, minWidth: 0, gap: 1 },
  colLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.link,
  },
  colValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  colMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },

  steps: { gap: spacing.sm + 2 },
  step: { flexDirection: 'row', gap: spacing.sm + 2 },
  stepIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndexText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: colors.link },
  stepBody: { flex: 1, minWidth: 0 },
  stepLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  stepDetail: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },
  warning: {
    gap: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.statusCriticalBg,
    padding: spacing.sm + 2,
  },
  warningTitle: { color: colors.statusCritical },

  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm - 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  thText: { fontFamily: typography.fontFamily.semiBold, fontSize: 11, letterSpacing: 0.4, color: colors.link },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tdText: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textPrimary },
  tdStrong: { fontFamily: typography.fontFamily.semiBold },
  tdDesc: { flex: 1, minWidth: 0 },
  tdQty: { width: 38, textAlign: 'center' },
  tdAmount: { width: 96, textAlign: 'right' },
  balanceNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
});
