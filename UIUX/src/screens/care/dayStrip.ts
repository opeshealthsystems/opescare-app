/**
 * Locale-aware weekday / month labels for the seven-day pickers on the
 * available-slots and reschedule screens.
 *
 * Both screens previously carried `const WEEKDAY = ['Sun', 'Mon', …]` and
 * `const MONTH = ['Jan', 'Feb', …]` inline, which renders English regardless
 * of locale. `Intl` gives the correct abbreviation per language and Hermes
 * ships a full ICU, so this is the same answer on web and on device.
 *
 * Formatters are cached per locale: the strip builds up to seven of each on
 * every render, and constructing an `Intl.DateTimeFormat` per cell is
 * measurable on the low-end Androids this app targets.
 */
import { getLocale, toBcp47, type Locale } from '../../i18n';

const weekdayCache: Partial<Record<Locale, Intl.DateTimeFormat>> = {};
const monthCache: Partial<Record<Locale, Intl.DateTimeFormat>> = {};

const EN_WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EN_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `en-US`, not `toBcp47('en')` = `en-GB`, for MONTHS ONLY: en-GB abbreviates
 * September as "Sept", and the desktop — and therefore every printed document
 * and every web screen the patient has already seen — says "Sep".
 * `utils/format.shortMonth` makes the same choice for the same reason.
 */
const monthTag = (locale: Locale) => (locale === 'fr' ? 'fr-FR' : 'en-US');

/** `Mon` / `lun.` */
export function shortWeekday(d: Date): string {
  const locale = getLocale();
  try {
    if (!weekdayCache[locale]) {
      weekdayCache[locale] = new Intl.DateTimeFormat(toBcp47(locale), { weekday: 'short' });
    }
    return weekdayCache[locale]!.format(d);
  } catch {
    // No ICU (a stripped JSC build): fall back rather than throw mid-render.
    return EN_WEEKDAY[d.getDay()];
  }
}

/**
 * `Sep 1` / `1 sept.` — day before month in French, which is why this returns
 * the whole phrase rather than a bare month abbreviation.
 */
export function shortMonthDay(d: Date): string {
  const locale = getLocale();
  try {
    if (!monthCache[locale]) {
      monthCache[locale] = new Intl.DateTimeFormat(monthTag(locale), { month: 'short' });
    }
    const month = monthCache[locale]!.format(d);
    return locale === 'fr' ? `${d.getDate()} ${month}` : `${month} ${d.getDate()}`;
  } catch {
    return `${EN_MONTH[d.getMonth()]} ${d.getDate()}`;
  }
}

/**
 * The two all-caps labels on the 64pt date tile in `./shared` — `MAY` / `MAI`,
 * `THU` / `JEU`. `shared.tsx` used to build these from `const MONTHS = ['JAN',
 * …]` and `const DAYS = ['SUN', …]`, so the tile read English inside an
 * otherwise French screen.
 *
 * French abbreviations carry a trailing period ("sept.", "lun.") which reads
 * as a typo in an all-caps badge and costs a glyph in a 64pt slot, so it is
 * dropped.
 */
const caps = (s: string) => s.replace(/\.$/, '').toUpperCase();

/** `MAY` / `MAI`. */
export function capsMonth(d: Date): string {
  const locale = getLocale();
  try {
    if (!monthCache[locale]) {
      monthCache[locale] = new Intl.DateTimeFormat(monthTag(locale), { month: 'short' });
    }
    return caps(monthCache[locale]!.format(d));
  } catch {
    return caps(EN_MONTH[d.getMonth()]);
  }
}

/** `THU` / `JEU`. */
export function capsWeekday(d: Date): string {
  const locale = getLocale();
  try {
    if (!weekdayCache[locale]) {
      weekdayCache[locale] = new Intl.DateTimeFormat(toBcp47(locale), { weekday: 'short' });
    }
    return caps(weekdayCache[locale]!.format(d));
  } catch {
    return caps(EN_WEEKDAY[d.getDay()]);
  }
}
