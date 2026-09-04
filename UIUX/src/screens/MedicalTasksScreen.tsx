/**
 * MED-002 — Medical Tasks.
 *
 * The patient's own action list over `GET /patient/medical-tasks`: the lab test
 * to get done before the next visit, the follow-up to book, the daily symptom
 * check. Unlike every other list in the patient app this one is WRITABLE by the
 * patient — they tick items off — so the completion path is the only write here
 * and it is treated with the care a write deserves: the row is never redrawn as
 * done until the server says it is, and when the answer never arrives the
 * screen says so rather than guessing.
 *
 * The right-hand due text is the server's decision, carried in `due_kind`:
 *
 *   due_today  → `due_at`, as a time ("Today, 02:00 PM")
 *   due_before → `due_at`, as a date ("Before 16 May 2026")
 *   upcoming   → `due_at`, the scheduled appointment date and time
 *   recurring  → `cadence_label` alone ("Daily")
 *   none       → nothing at all
 *
 * That mapping is the table's designed behaviour; the app does not second-guess
 * it by falling back to a date when a kind says there should be no text.
 */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  completeMedicalTask,
  fetchMedicalTasks,
  type MedicalTaskDueKind,
  type MedicalTaskType,
  type PortalMedicalTask,
} from '../api/medicalTasks';
import {
  Card,
  EmptyState,
  Icon,
  IconName,
  LastUpdatedLine,
  ScreenHeader,
  SegmentedTabs,
  iconNames,
} from '../components';
import { useTranslation, type TFunction } from '../i18n';
import { writeFailureMessage } from '../lib/errors';
import { colors, radii, spacing, tintMap, typography, Tint } from '../theme/theme';
import { AsyncBoundary, fmtDate, fmtTime, useAsync } from './care/shared';

// ── Vocabulary ─────────────────────────────────────────────────────────────

/** Glyph and tint per task kind. No new colours — theme tints only. */
const TYPE_LOOK: Record<MedicalTaskType, { icon: IconName; tint: Tint }> = {
  medication: { icon: 'pill', tint: 'purple' },
  lab_test: { icon: 'flask', tint: 'green' },
  appointment: { icon: 'calendar', tint: 'blue' },
  monitoring: { icon: 'activity', tint: 'amber' },
  results: { icon: 'document-text', tint: 'blue' },
  lifestyle: { icon: 'heart-pulse', tint: 'green' },
  other: { icon: 'check-circle', tint: 'blue' },
};

const FALLBACK_LOOK = TYPE_LOOK.other;

/**
 * The server may name an icon of its own. It is validated against the shipped
 * glyph set before it is rendered — an unknown name would otherwise draw
 * nothing and leave a hole where the tile should be.
 */
function look(task: PortalMedicalTask): { icon: IconName; tint: Tint } {
  const base = TYPE_LOOK[task.task_type] ?? FALLBACK_LOOK;
  const named = task.icon;
  if (named && (iconNames as readonly string[]).includes(named)) {
    return { icon: named as IconName, tint: base.tint };
  }
  return base;
}

function isDone(task: PortalMedicalTask): boolean {
  return task.completed_at !== null || task.status === 'completed';
}

type Filter = 'todo' | 'done' | 'all';

const FILTERS: { key: Filter; labelKey: string }[] = [
  { key: 'todo', labelKey: 'tasks.tabTodo' },
  { key: 'done', labelKey: 'tasks.tabDone' },
  { key: 'all', labelKey: 'tasks.tabAll' },
];

// ── Screen ─────────────────────────────────────────────────────────────────

export function MedicalTasksScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('todo');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  const load = useCallback(() => fetchMedicalTasks({ per_page: 100 }).then((p) => p.data), []);
  const state = useAsync<PortalMedicalTask[]>(load, []);
  const { reload, reloadIfStale, setData } = state;

  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  const all = state.data ?? [];

  const ordered = useMemo(
    () =>
      [...all].sort((a, b) => {
        const doneDiff = Number(isDone(a)) - Number(isDone(b));
        if (doneDiff !== 0) return doneDiff;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      }),
    [all]
  );

  const shown = useMemo(
    () =>
      ordered.filter((task) => {
        if (filter === 'todo') return !isDone(task);
        if (filter === 'done') return isDone(task);
        return true;
      }),
    [ordered, filter]
  );

  const doneCount = all.filter(isDone).length;
  const remaining = all.length - doneCount;

  /**
   * Tick a task off.
   *
   * The write is idempotent server-side, so a double tap is harmless — but a
   * lost answer is not the same as a refusal, and `writeFailureMessage` is what
   * keeps the screen from claiming either outcome it cannot see. The row is
   * replaced only with what the server sends back.
   */
  const complete = async (task: PortalMedicalTask) => {
    if (busyId || isDone(task)) return;
    setBusyId(task.id);
    setWriteError(null);
    try {
      const saved = await completeMedicalTask(task.id);
      setData(all.map((row) => (row.id === task.id ? { ...row, ...saved } : row)));
    } catch (e) {
      setWriteError(writeFailureMessage(e, t('tasks.checkHint'), t('tasks.completeFailed')));
      // The list on screen may no longer be the truth — say nothing about this
      // row's state until a fresh read settles it.
      reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('tasks.title')}
        subtitle={t('tasks.subtitle')}
        showBack={navigation.canGoBack()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.loading && state.data !== null}
            onRefresh={reload}
            tintColor={colors.blue}
          />
        }
      >
        <AsyncBoundary state={state} loadingLabel={t('tasks.loading')}>
          {() => (
            <>
              {all.length > 0 && (
                <Card>
                  <Text style={styles.overline}>{t('tasks.progressOverline')}</Text>
                  <Text style={styles.progress}>
                    {t('tasks.progress', { done: doneCount, total: all.length })}
                  </Text>
                  <Text style={styles.progressNote}>
                    {remaining === 0 ? t('tasks.allDone') : t('tasks.remaining', { count: remaining })}
                  </Text>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.trackFill,
                        { width: `${all.length ? Math.round((doneCount / all.length) * 100) : 0}%` },
                      ]}
                    />
                  </View>
                </Card>
              )}

              {writeError && (
                <View style={styles.writeError} accessibilityRole="alert">
                  <Icon name="alert-circle" size={18} color={colors.statusCritical} />
                  <Text style={styles.writeErrorText}>{writeError}</Text>
                </View>
              )}

              <SegmentedTabs
                options={FILTERS.map((f) => ({ key: f.key, label: t(f.labelKey) }))}
                value={filter}
                onChange={(k) => setFilter(k as Filter)}
              />

              {shown.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="clipboard"
                    tint="blue"
                    title={filter === 'done' ? t('tasks.emptyDoneTitle') : t('tasks.emptyTitle')}
                    message={filter === 'done' ? t('tasks.emptyDoneBody') : t('tasks.emptyBody')}
                  />
                </Card>
              ) : (
                <Card variant="flush">
                  {shown.map((task, i) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      divider={i < shown.length - 1}
                      busy={busyId === task.id}
                      locked={busyId !== null && busyId !== task.id}
                      onComplete={() => complete(task)}
                    />
                  ))}
                </Card>
              )}

              {/* Due dates move — say when this was read. */}
              <LastUpdatedLine loadedAt={state.loadedAt} />
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

/**
 * The right-hand due text, exactly as `due_kind` specifies. Returning an empty
 * string is a real answer — `none` means the row shows nothing there.
 */
function dueText(task: PortalMedicalTask, t: TFunction): string {
  const kind: MedicalTaskDueKind = task.due_kind;
  if (isDone(task)) {
    return task.completed_at ? t('tasks.completedOn', { date: fmtDate(task.completed_at) }) : '';
  }
  switch (kind) {
    case 'due_today':
      return task.due_at ? t('tasks.dueToday', { time: fmtTime(task.due_at) }) : '';
    case 'due_before':
      return task.due_at ? t('tasks.dueBefore', { date: fmtDate(task.due_at) }) : '';
    case 'upcoming':
      return task.due_at
        ? t('tasks.upcoming', { date: fmtDate(task.due_at), time: fmtTime(task.due_at) })
        : '';
    case 'recurring':
      return task.cadence_label ?? '';
    case 'none':
    default:
      return '';
  }
}

function TaskRow({
  task,
  divider,
  busy,
  locked,
  onComplete,
}: {
  task: PortalMedicalTask;
  divider?: boolean;
  busy: boolean;
  locked: boolean;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const { icon, tint } = look(task);
  const done = isDone(task);
  const due = dueText(task, t);
  const skin = tintMap[tint];

  return (
    <View style={[styles.row, divider && styles.rowDivided]}>
      <View style={[styles.mark, { backgroundColor: skin.bg }]}>
        <Icon name={icon} size={20} color={skin.fg} />
      </View>

      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, done && styles.rowTitleDone]} numberOfLines={2}>
          {task.title}
        </Text>
        {!!task.description && (
          <Text style={styles.rowSub} numberOfLines={2}>
            {task.description}
          </Text>
        )}
        {/* `recurring` already prints the cadence on the right — never twice. */}
        {!!task.cadence_label && task.due_kind !== 'recurring' && (
          <View style={styles.cadence}>
            <Text style={styles.cadenceText}>{task.cadence_label}</Text>
          </View>
        )}
      </View>

      <View style={styles.rowEnd}>
        {!!due && (
          <Text style={[styles.due, done && styles.dueDone]} numberOfLines={2}>
            {due}
          </Text>
        )}
        <TouchableOpacity
          onPress={onComplete}
          disabled={done || busy || locked}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done, disabled: done || busy || locked }}
          accessibilityLabel={busy ? t('tasks.saving') : t('tasks.markDone')}
          style={[styles.check, done && styles.checkOn, (busy || locked) && styles.checkOff]}
        >
          <Icon
            name="check"
            size={16}
            color={done ? colors.textOnBrand : colors.textSecondary}
            strokeWidth={2.6}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  overline: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    letterSpacing: 0.6,
  },
  progress: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  progressNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },
  track: {
    marginTop: spacing.sm,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.divider,
    overflow: 'hidden',
  },
  trackFill: { height: 6, borderRadius: radii.pill, backgroundColor: colors.blue },

  writeError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md - 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.statusCriticalBg,
    backgroundColor: colors.statusCriticalBg,
  },
  writeErrorText: {
    flex: 1,
    minWidth: 0,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.statusCritical,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 4,
    paddingVertical: spacing.md - 4,
  },
  rowDivided: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  mark: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  rowTitleDone: { color: colors.textSecondary },
  rowSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  cadence: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  cadenceText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.link,
  },

  rowEnd: { alignItems: 'flex-end', gap: spacing.xs, maxWidth: 128 },
  due: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  dueDone: { color: colors.tintGreen },
  check: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.tintGreen, borderColor: colors.tintGreen },
  checkOff: { opacity: 0.5 },
});
