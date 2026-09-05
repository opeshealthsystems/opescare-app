/**
 * The app's presentation layer for dates, times, numbers and money.
 *
 * This is the mobile twin of the desktop's `App\Support\Format`, and it
 * deliberately produces the SAME strings, because a patient reads their
 * appointment time on the web portal and then again in the app:
 *
 *   locale | date          | time     | date + time
 *   -------|---------------|----------|------------------------
 *   en     | 01 Sep 2026   | 09:27 AM | 01 Sep 2026 09:27 AM
 *   fr     | 01 sept. 2026 | 09:27    | 01 sept. 2026 09:27
 *
 * FR gets French month names and a 24-hour clock — what a Cameroonian
 * hospital uses. Money is `25 000 FCFA` in FR and `25,000 FCFA` in EN: one
 * currency label in both locales, the one counter staff and receipts say.
 * Numeric dates (`01/09/2026`) stay numeric in both — the institution's
 * print convention, and already correct French order.
 *
 * The locale comes from `src/i18n` (`getLocale()`), so these functions are
 * safe to call from outside React. A component that must re-render on a
 * language switch already re-renders, because it reads `t` from the context;
 * these helpers then pick up the new locale on that same render.
 *
 * PRESENTATION ONLY. Nothing here rounds, parses or stores.
 */
import { getLocale, toBcp47, type Locale } from './i18n';

/** Cameroon deployment: FCFA is what counter staff, patients and receipts say. */
export const CURRENCY = 'FCFA';

/** ISO 4217 — for exports and machine consumers only. */
export const CURRENCY_ISO = 'XAF';

function parse(value: string | Date | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `Sep` / `sept.` — Intl gives us the correct abbreviation per locale, and
 * Hermes ships a full ICU, so this is the same answer on web and on device.
 * The formatter is cached: constructing one per row of a list is measurable
 * on the low-end Androids this app targets.
 */
const monthCache: Partial<Record<Locale, Intl.DateTimeFormat>> = {};

function shortMonth(locale: Locale, d: Date): string {
  try {
    if (!monthCache[locale]) {
      // `en-US` rather than `en-GB` deliberately: en-GB abbreviates September
      // as "Sept", and the desktop — and therefore every printed document and
      // every web screen the patient has already seen — says "Sep".
      monthCache[locale] = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
        month: 'short',
      });
    }
    return monthCache[locale]!.format(d);
  } catch {
    // No ICU (a stripped JSC build): fall back rather than throw mid-render.
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
      d.getMonth()
    ];
  }
}

/** `01 Sep 2026` / `01 sept. 2026` */
export function formatDate(value: string | Date | null | undefined, empty = ''): string {
  const d = parse(value);
  if (!d) return empty;
  const locale = getLocale();
  return `${pad(d.getDate())} ${shortMonth(locale, d)} ${d.getFullYear()}`;
}

/** `09:27 AM` / `09:27` — FR is 24-hour, per the desktop. */
export function formatTime(value: string | Date | null | undefined, empty = ''): string {
  const d = parse(value);
  if (!d) return empty;
  if (getLocale() === 'fr') return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${pad(h12)}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

/** `01 Sep 2026 09:27 AM` / `01 sept. 2026 09:27` */
export function formatDateTime(value: string | Date | null | undefined, empty = ''): string {
  const d = parse(value);
  if (!d) return empty;
  return `${formatDate(d)} ${formatTime(d)}`;
}

/** `Tuesday, 01 September 2026` / `mardi 1 septembre 2026` — day before month in FR. */
export function formatDateLong(value: string | Date | null | undefined, empty = ''): string {
  const d = parse(value);
  if (!d) return empty;
  const locale = getLocale();
  try {
    const parts = new Intl.DateTimeFormat(toBcp47(locale), {
      weekday: 'long',
      day: locale === 'fr' ? 'numeric' : '2-digit',
      month: 'long',
      year: 'numeric',
    }).formatToParts(d);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '';
    return locale === 'fr'
      ? `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}`
      : `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')}`;
  } catch {
    return formatDate(d, empty);
  }
}

/** `01/09/2026` — numeric, locale-neutral, the print/official convention. */
export function formatDateNumeric(value: string | Date | null | undefined, empty = ''): string {
  const d = parse(value);
  if (!d) return empty;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * FR: narrow-no-break space for thousands, comma decimal (`1 250 000,50`).
 * EN: comma thousands, dot decimal (`1,250,000.50`).
 *
 * Hand-rolled rather than `toLocaleString` because Intl's FR grouping
 * separator differs between engines (U+202F on modern ICU, U+00A0 on older),
 * and a receipt that does not match the desktop's is a support ticket.
 */
export function formatNumber(value: number | string | null | undefined, decimals = 0): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return String(value ?? '');
  const fr = getLocale() === 'fr';
  const fixed = Math.abs(n).toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, fr ? ' ' : ',');
  const sign = n < 0 ? '-' : '';
  return frac ? `${sign}${grouped}${fr ? ',' : '.'}${frac}` : `${sign}${grouped}`;
}

/** `25 000 FCFA` / `25,000 FCFA`. Formatting only — never rounds the caller's value away. */
export function formatMoney(
  value: number | string | null | undefined,
  decimals = 0,
  iso = false
): string {
  return `${formatNumber(value, decimals)} ${iso ? CURRENCY_ISO : CURRENCY}`;
}

/** Bare label, for column headers ("Montant (FCFA)"). */
export function currencyLabel(iso = false): string {
  return iso ? CURRENCY_ISO : CURRENCY;
}

/**
 * "follow_up" -> "Follow up" — enum-ish backend values into readable labels.
 *
 * NOT translated on purpose: these are API vocabulary, and the API answers in
 * the account's language. A screen that needs a translated enum should carry
 * an explicit `t()` map in its own namespace instead of guessing here.
 */
export function formatLabel(value: string | null | undefined): string {
  if (!value) return '';
  const withSpaces = value.replace(/_/g, ' ');
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

/**
 * Words that are a TITLE, not a name — dropped before initials are taken.
 *
 * Held without a trailing dot, because the tokeniser below splits on
 * punctuation: "Dr." and "Dr" both arrive here as `dr`. EN and FR both, and the
 * FR forms matter — this deployment writes "Dr", "Pr", "M.", "Mme".
 */
const HONORIFICS = new Set([
  'dr', 'drs', 'doctor', 'docteur', 'doc',
  'pr', 'prof', 'professor', 'professeur',
  'mr', 'mrs', 'ms', 'miss', 'mx', 'sir', 'dame',
  'm', 'mm', 'mme', 'mlle',
  'rev', 'fr', 'sr', 'st', 'hon', 'esq',
]);

/** Whitespace and the punctuation that separates name parts. NOT `-` or `'`. */
const NAME_SEPARATORS = /[\s.,;:!?()[\]{}"“”«»/\\|_]+/;

/**
 * Up to two initials for an avatar — "Dr. Amara Diallo" → "AD".
 *
 * THE BUG THIS REPLACES. Four screens each carried their own copy of
 * `name.replace(/\b(dr|prof|…)\.?\b/gi, ' ')`, and that expression cannot
 * strip "Dr.": `\.?` is optional and the `\b` after it demands a word
 * boundary, but the character following the dot is a space — two non-word
 * characters, so there is no boundary there. The engine backtracks, matches
 * the bare "Dr", and leaves the orphaned dot behind as a token of its own. The
 * avatar then read ".A" (first two tokens) or ".D" (first and last), and the
 * doctor whose name every clinician screen shows had a full stop for an
 * initial.
 *
 * So the honorific is no longer pattern-matched out of the middle of a string.
 * The name is TOKENISED first — on whitespace and on the punctuation that
 * separates name parts — and whole tokens are then dropped by lookup. Nothing
 * can be left behind, because punctuation is never part of a token.
 *
 * Hyphens and apostrophes stay INSIDE a token, so "Jean-Pierre" and "M'Bala"
 * are one name part each and contribute one initial, not two.
 *
 * A string that is nothing but honorifics ("Dr.") falls back to its raw tokens
 * rather than to `empty`: something recognisable beats an empty circle.
 */
export function initialsFrom(name: string | null | undefined, empty = '?'): string {
  const tokens = (name ?? '')
    .split(NAME_SEPARATORS)
    // A token has to carry a letter or a digit. `-` and `'` are kept inside
    // names but are not, on their own, a name part.
    .filter((token) => token.replace(/[-'’]/g, '').length > 0);

  const named = tokens.filter((token) => !HONORIFICS.has(token.toLowerCase()));
  const parts = named.length > 0 ? named : tokens;

  if (parts.length === 0) return empty;
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}
