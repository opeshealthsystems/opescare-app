/**
 * The recorded interpretation, read-only — what an acknowledged result shows
 * on `/clinician/results/[id]`: the note as the patient sees it (or the fact
 * that it was kept private), the clinician-private comment, and the next
 * step that was chosen.
 *
 * Renders ONLY what the server returned. It never composes a note from other
 * fields and never shows a "shared" state the row does not carry.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Card,
  Icon,
  StatusBadge,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import type { ResultInterpretation } from '@/lib/api/resultActionQueries';
import { NEXT_ACTION_ICON, nextActionLabel } from './AcknowledgeSheet';
import type { ResultTx } from './SheetShell';

export function InterpretationCard({
  interpretation,
  tx,
}: {
  interpretation: ResultInterpretation;
  tx: ResultTx;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const note = interpretation.patient_note?.trim() || null;
  const comment = interpretation.clinician_comment?.trim() || null;
  const next = interpretation.next_action && interpretation.next_action !== 'none' ? interpretation.next_action : null;

  return (
    <Card style={styles.card}>
      {/* ── The patient's view ─────────────────────────────────────── */}
      <View style={styles.headRow}>
        <Icon name="person" size={16} color={colors.blue} />
        <Text style={styles.headText}>{tx('result.noteSharedTitle', 'What the patient sees')}</Text>
        {note ? (
          <StatusBadge
            status={
              interpretation.shared
                ? tx('result.noteSharedBadge', 'Shared')
                : tx('result.noteNotSharedBadge', 'Not shared')
            }
            tone={interpretation.shared ? 'normal' : 'neutral'}
            size="sm"
          />
        ) : null}
      </View>
      {note && interpretation.shared ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>{note}</Text>
        </View>
      ) : note ? (
        <>
          <View style={[styles.noteBox, styles.noteBoxMuted]}>
            <Text style={styles.noteText}>{note}</Text>
          </View>
          <Text style={styles.caption}>
            {tx('result.noteNotShared', 'Your note was kept on the record and not shared with the patient.')}
          </Text>
        </>
      ) : (
        <Text style={styles.caption}>
          {tx('result.noNoteRecorded', 'No note was recorded with this acknowledgement.')}
        </Text>
      )}

      {/* ── Private comment ────────────────────────────────────────── */}
      {!!comment && (
        <>
          <View style={styles.divider} />
          <View style={styles.headRow}>
            <Icon name="lock" size={16} color={colors.textSecondary} />
            <Text style={styles.headText}>{tx('result.privateCommentTitle', 'Private comment')}</Text>
          </View>
          <Text style={styles.commentText}>{comment}</Text>
        </>
      )}

      {/* ── Chosen next step ───────────────────────────────────────── */}
      {!!next && (
        <>
          <View style={styles.divider} />
          <View style={styles.headRow}>
            <Icon name={NEXT_ACTION_ICON[next]} size={16} color={colors.textSecondary} />
            <Text style={styles.headText}>
              {tx('result.recordedNextStep', 'Next step recorded: {{step}}', { step: nextActionLabel(next, tx) })}
            </Text>
          </View>
        </>
      )}
    </Card>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    card: { gap: spacing.xs },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    headText: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    noteBox: {
      marginTop: spacing.xs,
      backgroundColor: colors.statusNormalBg,
      borderRadius: 12,
      paddingHorizontal: spacing.md - 2,
      paddingVertical: spacing.sm + 2,
    },
    noteBoxMuted: { backgroundColor: colors.surfaceMuted },
    noteText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    commentText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    caption: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs },
  });
