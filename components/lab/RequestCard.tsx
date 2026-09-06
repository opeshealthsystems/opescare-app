/**
 * One patient test request on the lab desk's Requests segment.
 *
 *   Test name  CODE                               [Urgent]
 *   Name • HEALTH-ID • Submitted 01 Sep 2026 09:27 AM
 *   "Clinical notes the patient or their clinician attached"
 *   [ Approve ]  [ Decline ]
 *
 * Decline needs a REASON — the patient reads it — so pressing Decline opens an
 * inline field on this card rather than firing at once; Approve confirms in
 * the screen's dialog (the card only asks). A request that is already decided
 * renders read-only with its status badge and no buttons.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Card,
  Icon,
  PillInput,
  StatusBadge,
  formatDateTime,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { CareButton } from '@/components/care/shared';
import { isLabRequestOpen, type LabTestRequest } from '@/lib/api/labDeskQueries';
import { FieldLabel, UrgencyBadge, isUrgentOrder, useLabT } from './shared';

/** The decline reason the server stores and the patient reads: short, but not empty. */
export const DECLINE_REASON_MIN = 3;
export const DECLINE_REASON_MAX = 500;

export function LabRequestCard({
  request,
  onApprove,
  onDecline,
  busy,
}: {
  request: LabTestRequest;
  onApprove: () => void;
  onDecline: (reason: string) => Promise<void> | void;
  /** True while a decision on THIS request is in flight. */
  busy?: boolean;
}) {
  const tx = useLabT();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const open = isLabRequestOpen(request.status);
  const submitted = request.submitted_at
    ? tx('requests.submitted', { when: formatDateTime(request.submitted_at, '—') })
    : tx('requests.submittedUnknown');
  const patient = [request.patient?.display_name?.trim() || null, request.patient?.health_id]
    .filter(Boolean)
    .join('  •  ');

  async function confirmDecline() {
    const trimmed = reason.trim();
    if (trimmed.length < DECLINE_REASON_MIN) {
      setReasonError(tx('requests.reasonTooShort', { min: DECLINE_REASON_MIN }));
      return;
    }
    setReasonError(null);
    await onDecline(trimmed);
    setDeclining(false);
    setReason('');
  }

  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title}>
            {request.test_name}
            {request.test_code ? <Text style={styles.code}>{`  ${request.test_code}`}</Text> : null}
          </Text>
          <Text style={styles.meta}>{patient || tx('row.patientUnknown')}</Text>
          <Text style={styles.metaMuted}>{submitted}</Text>
        </View>
        {open ? (
          isUrgentOrder(request.priority) ? <UrgencyBadge urgency={request.priority} /> : null
        ) : (
          <StatusBadge status={request.status} size="sm" />
        )}
      </View>

      {!!request.clinical_notes && (
        <View style={styles.notes}>
          <Icon name="document-text" size={16} color={colors.textMuted} />
          <Text style={styles.notesText}>{request.clinical_notes}</Text>
        </View>
      )}

      {open && !declining && (
        <View style={styles.actions}>
          <CareButton
            label={tx('requests.approve')}
            icon="check"
            style={styles.action}
            onPress={onApprove}
            loading={busy}
            disabled={busy}
          />
          <CareButton
            label={tx('requests.decline')}
            icon="close"
            variant="secondary"
            style={styles.action}
            onPress={() => setDeclining(true)}
            disabled={busy}
          />
        </View>
      )}

      {open && declining && (
        <View style={styles.declineBox}>
          <FieldLabel>{tx('requests.reasonLabel')}</FieldLabel>
          <PillInput
            icon={<Icon name="document-text" size={18} color={colors.blue} />}
            value={reason}
            onChangeText={(v) => {
              setReason(v);
              if (reasonError) setReasonError(null);
            }}
            placeholder={tx('requests.reasonPlaceholder')}
            error={reasonError ?? undefined}
            multiline
            maxLength={DECLINE_REASON_MAX}
            style={styles.multiline}
            accessibilityLabel={tx('requests.reasonLabel')}
          />
          <Text style={styles.hint}>{tx('requests.reasonHint')}</Text>
          <View style={styles.actions}>
            <CareButton
              label={tx('requests.confirmDecline')}
              icon="close"
              variant="dangerSolid"
              style={styles.action}
              onPress={() => void confirmDecline()}
              loading={busy}
              disabled={busy}
            />
            <CareButton
              label={tx('requests.keep')}
              variant="secondary"
              style={styles.action}
              onPress={() => {
                setDeclining(false);
                setReason('');
                setReasonError(null);
              }}
              disabled={busy}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    head: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    headText: { flex: 1, minWidth: 0, gap: 2 },
    title: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    code: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    meta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    metaMuted: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    notes: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: 10,
      backgroundColor: colors.surfaceMuted,
    },
    notesText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    action: { flex: 1 },
    declineBox: { marginTop: spacing.md },
    multiline: { minHeight: 64, textAlignVertical: 'top' },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      marginTop: -spacing.sm,
    },
  });
