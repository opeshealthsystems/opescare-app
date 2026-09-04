/**
 * `tasks` — français hospitalier. MED-002 Tâches médicales et son point
 * d’entrée. Vocabulaire repris du bureau : « équipe soignante », « analyse »,
 * « consultation de suivi », « terminée ».
 *
 * Apostrophes U+2019 (’). Ne jamais en supprimer une.
 * Mêmes clés, même ordre que le jumeau anglais.
 */
export const tasks = {
  // ── Cadre de l’écran ─────────────────────────────────────────────────────
  title: 'Tâches médicales',
  subtitle: 'Ce que votre équipe soignante vous demande de faire',
  loading: 'Chargement de vos tâches…',

  // ── Filtres ──────────────────────────────────────────────────────────────
  tabTodo: 'À faire',
  tabDone: 'Terminées',
  tabAll: 'Toutes',

  // ── Bandeau de progression ───────────────────────────────────────────────
  progressOverline: 'Vos tâches',
  progress: '{done} sur {total} terminées',
  remaining_one: '{count} tâche encore à faire',
  remaining_other: '{count} tâches encore à faire',
  allDone: 'Tout ce qui figure sur votre liste est terminé.',

  // ── Échéances. Une clé par « due_kind » ; « none » n’affiche rien. ────────
  dueToday: 'Aujourd’hui, {time}',
  dueBefore: 'Avant le {date}',
  upcoming: '{date}, {time}',
  completedOn: 'Terminée le {date}',

  // ── Cocher une tâche ─────────────────────────────────────────────────────
  markDone: 'Marquer comme faite',
  saving: 'Enregistrement…',
  completeFailed:
    'Impossible de marquer cette tâche comme faite. Veuillez réessayer.',
  /** Où la patiente ou le patient peut vérifier — voir lib/errors.ts. */
  checkHint:
    'Ouvrez de nouveau Tâches médicales pour voir si elle a bien été enregistrée.',

  // ── États vides ──────────────────────────────────────────────────────────
  emptyTitle: 'Rien à faire',
  emptyBody:
    'Votre équipe soignante ne vous demande rien pour le moment. Les nouvelles tâches apparaîtront ici.',
  emptyDoneTitle: 'Aucune tâche terminée',
  emptyDoneBody: 'Les tâches que vous cochez apparaîtront ici.',

  // ── Point d’entrée sur MED-001 ───────────────────────────────────────────
  entryTitle: 'Tâches médicales',
  entrySubtitle:
    'Analyses, consultations de suivi et contrôles quotidiens demandés par votre équipe soignante',
} as const;
