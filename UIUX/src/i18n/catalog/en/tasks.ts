/**
 * `tasks` strings, English — MED-002 Medical Tasks and its entry point.
 *
 * One cluster per file so translators do not collide. Contract:
 * src/i18n/index.ts. Keys and order must match the fr twin exactly.
 */
export const tasks = {
  // ── Screen chrome ────────────────────────────────────────────────────────
  title: 'Medical Tasks',
  subtitle: 'What your care team has asked you to do',
  loading: 'Loading your tasks…',

  // ── Filters ──────────────────────────────────────────────────────────────
  tabTodo: 'To do',
  tabDone: 'Completed',
  tabAll: 'All',

  // ── Progress hero ────────────────────────────────────────────────────────
  progressOverline: 'Your tasks',
  progress: '{done} of {total} done',
  remaining_one: '{count} task still to do',
  remaining_other: '{count} tasks still to do',
  allDone: 'Everything on your list is done.',

  // ── Due text. One key per `due_kind`; `none` prints nothing at all. ───────
  dueToday: 'Today, {time}',
  dueBefore: 'Before {date}',
  upcoming: '{date}, {time}',
  completedOn: 'Completed {date}',

  // ── Completing a task ────────────────────────────────────────────────────
  markDone: 'Mark as done',
  saving: 'Saving…',
  completeFailed: 'Couldn’t mark this task as done. Please try again.',
  /** Where the patient can confirm for themselves — see lib/errors.ts. */
  checkHint: 'Open Medical Tasks again to see whether it was recorded.',

  // ── Empty states ─────────────────────────────────────────────────────────
  emptyTitle: 'Nothing to do',
  emptyBody:
    'Your care team has not asked you to do anything right now. New tasks will appear here.',
  emptyDoneTitle: 'No completed tasks',
  emptyDoneBody: 'Tasks you tick off will appear here.',

  // ── Entry point on MED-001 ───────────────────────────────────────────────
  entryTitle: 'Medical Tasks',
  entrySubtitle: 'Lab tests, follow-ups and daily checks from your care team',
} as const;
