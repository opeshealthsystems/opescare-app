/** Translator shape accepted here — react-i18next's `t` satisfies it. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * "just now" / "12 min ago" / "3 h ago" / "2 d ago", localized.
 *
 * Coarse on purpose: the offline banner has to answer "how stale is what I am
 * looking at?" at a glance, and to the minute is precise enough for that.
 */
export function formatSavedAt(iso: string | null | undefined, t: Translate): string | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return null;

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return t('offline.justNow');
  if (minutes < 60) return t('offline.minutesAgo', { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('offline.hoursAgo', { count: hours });

  return t('offline.daysAgo', { count: Math.floor(hours / 24) });
}

/** Absolute local date+time, for policy expiry where precision matters. */
export function formatDateTime(iso: string | null | undefined, language: string): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
