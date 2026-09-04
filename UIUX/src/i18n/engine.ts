/** The engine behind `src/i18n/index.ts`. Read the contract there first. */
import { en } from './catalog/en';
import { fr } from './catalog/fr';

/** The two languages the product ships. Internal, short form. */
export type Locale = 'en' | 'fr';

export const LOCALES: Locale[] = ['en', 'fr'];

/** The deployment is a francophone Cameroonian hospital; the server's APP_LOCALE is `fr`. */
export const DEFAULT_LOCALE: Locale = 'fr';

export type Catalog = { [key: string]: string | Catalog };

export const catalogs: Record<Locale, Catalog> = { en, fr };

/**
 * The picker persists BCP-47 tags (`fr-FR`) through `PUT /patient/settings`,
 * because that is what the column already held and what the desktop stores on
 * `users.locale`. Everything inside the app works in the short form.
 */
export function toLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const head = String(tag).toLowerCase().split(/[-_]/)[0];
  return head === 'fr' ? 'fr' : head === 'en' ? 'en' : null;
}

/** `fr` → `fr-FR`, `en` → `en-GB`. Used for Intl and for the settings payload. */
export function toBcp47(locale: Locale): string {
  return locale === 'fr' ? 'fr-FR' : 'en-GB';
}

// ── Lookup ────────────────────────────────────────────────────────────────

function lookup(catalog: Catalog, key: string): string | undefined {
  let node: string | Catalog | undefined = catalog;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export type TParams = Record<string, string | number>;

function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
  );
}

/**
 * Which of `<key>_one` / `<key>_other` a count selects.
 *
 * English: only exactly 1 is singular. French: 0 and 1 are both singular
 * ("0 rendez-vous", "1 rendez-vous", "2 rendez-vous"). This is the CLDR rule
 * for both languages and the only place a third locale would need work.
 */
function plural(locale: Locale, count: number): 'one' | 'other' {
  const n = Math.abs(count);
  if (locale === 'fr') return n < 2 ? 'one' : 'other';
  return n === 1 ? 'one' : 'other';
}

/**
 * Resolve one key in one locale.
 *
 * Missing keys fall back to English, then to the key itself — a screen must
 * never render blank because a translation is outstanding. In `__DEV__` the
 * miss is warned once so it shows up while the sibling agents are working;
 * `npm run i18n:check` is the thing that actually gates it.
 */
const warned = new Set<string>();

export function translate(locale: Locale, key: string, params?: TParams): string {
  const suffixed =
    params && typeof params.count === 'number' ? `${key}_${plural(locale, params.count)}` : key;

  const hit =
    lookup(catalogs[locale], suffixed) ??
    lookup(catalogs[locale], key) ??
    lookup(catalogs.en, suffixed) ??
    lookup(catalogs.en, key);

  if (hit === undefined) {
    if (typeof __DEV__ !== 'undefined' && __DEV__ && !warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] missing key "${key}" (${locale})`);
    }
    return key;
  }

  return interpolate(hit, params);
}

export type TFunction = (key: string, params?: TParams) => string;

/** A `t` bound to one locale. Stable identity per locale — see rule 3. */
const bound: Partial<Record<Locale, TFunction>> = {};

export function translator(locale: Locale): TFunction {
  if (!bound[locale]) {
    bound[locale] = (key, params) => translate(locale, key, params);
  }
  return bound[locale]!;
}

