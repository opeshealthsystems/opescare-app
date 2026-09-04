/**
 * Minimal i18n shim for the UI kit.
 *
 * The kit's i18n-aware components (Dialog, PillInput, ScreenHeader,
 * SectionHeader, StaleNotice) and the `format` helpers only need a tiny
 * translation contract: a `useTranslation()` hook returning `{ t }`, a `t`
 * that resolves a dotted key and interpolates `{name}` params, plus
 * `getLocale` / `toBcp47`. This file provides exactly that, self-contained,
 * with the strings those components use in English and French.
 *
 * DROP-IN OVERRIDE — a consuming app that already has its own i18n should
 * either (a) call `setMessages('en', {...})` to override individual strings,
 * or (b) replace this file wholesale with a shim that re-exports its own
 * `useTranslation`/`getLocale`/`toBcp47` under the same names. Nothing else in
 * the kit imports i18n, so that is the only integration point.
 */
import { useEffect, useState } from 'react';

export type Locale = 'en' | 'fr';
export type TParams = Record<string, string | number>;
export type TFunction = (key: string, params?: TParams) => string;

/** BCP-47 tag for a locale (e.g. for `Intl` / `toLocaleString`). */
export function toBcp47(locale: Locale): string {
  return locale === 'fr' ? 'fr-FR' : 'en-US';
}

type Dict = Record<string, Record<string, string>>;

// Only the keys the kit's components actually read. Add your own with
// setMessages(); consumers typically localise these to their own product.
const messages: Record<Locale, Dict> = {
  en: {
    common: { cancel: 'Cancel' },
    components: {
      close: 'Close',
      ok: 'OK',
      goBack: 'Go Back',
      viewAll: 'View all',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      staleTitle: 'Not up to date',
      staleRetry: 'Try Again',
      staleRetryHint: 'Reloads this screen from the server',
      staleRetrying: 'Trying…',
      staleBody: '{message} You are seeing what was loaded {when}, so it may have changed since.',
      whenJustNow: 'just now',
      whenNotYet: 'not yet loaded',
      whenAt: 'at {clock}',
      whenMinutes_one: '{count} minute ago',
      whenMinutes_other: '{count} minutes ago',
      whenYesterdayAt: 'yesterday at {clock}',
      whenOnAt: 'on {date} at {clock}',
      loadedAt: 'Loaded {when}',
      loadedA11y: 'Information loaded {when}',
    },
  },
  fr: {
    common: { cancel: 'Annuler' },
    components: {
      close: 'Fermer',
      ok: 'OK',
      goBack: 'Retour',
      viewAll: 'Voir tout',
      showPassword: 'Afficher le mot de passe',
      hidePassword: 'Masquer le mot de passe',
      staleTitle: 'Informations non à jour',
      staleRetry: 'Réessayer',
      staleRetryHint: 'Recharge cet écran depuis le serveur',
      staleRetrying: 'Nouvel essai…',
      staleBody: '{message} Vous voyez les informations chargées {when}, elles ont pu changer depuis.',
      whenJustNow: 'à l’instant',
      whenNotYet: 'pas encore chargé',
      whenAt: 'à {clock}',
      whenMinutes_one: 'il y a {count} minute',
      whenMinutes_other: 'il y a {count} minutes',
      whenYesterdayAt: 'hier à {clock}',
      whenOnAt: 'le {date} à {clock}',
      loadedAt: 'Chargé {when}',
      loadedA11y: 'Informations chargées {when}',
    },
  },
};

let currentLocale: Locale = 'en';
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return currentLocale;
}

/** Switch locale app-wide; every mounted `useTranslation()` re-renders. */
export function setLocale(next: Locale): void {
  if (next === currentLocale) return;
  currentLocale = next;
  listeners.forEach((l) => l());
}

/** Merge overrides into a locale's dictionary (namespace -> key -> string). */
export function setMessages(locale: Locale, overrides: Dict): void {
  const target = messages[locale];
  for (const ns of Object.keys(overrides)) {
    target[ns] = { ...(target[ns] ?? {}), ...overrides[ns] };
  }
  listeners.forEach((l) => l());
}

function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    params[name] === undefined ? `{${name}}` : String(params[name])
  );
}

function lookup(locale: Locale, key: string, params?: TParams): string {
  const [ns, name] = key.includes('.') ? key.split('.', 2) : ['', key];
  const table = messages[locale][ns] ?? {};
  // Simple plural: `t('x.y', { count })` falls back to y_one / y_other.
  if (table[name] === undefined && params && params.count !== undefined) {
    const variant = Number(params.count) === 1 ? `${name}_one` : `${name}_other`;
    if (table[variant] !== undefined) return interpolate(table[variant], params);
  }
  const raw = table[name];
  return raw === undefined ? key : interpolate(raw, params);
}

/** Standalone translate against the current locale (for non-hook code). */
export const t: TFunction = (key, params) => lookup(currentLocale, key, params);

/** Hook form — re-renders on `setLocale` / `setMessages`. */
export function useTranslation(): { t: TFunction; locale: Locale } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { t: (key, params) => lookup(currentLocale, key, params), locale: currentLocale };
}
