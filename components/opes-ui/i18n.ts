/**
 * i18n bridge — replaces the kit's standalone shim with the app's i18next.
 *
 * The kit's components (Dialog, PillInput, ScreenHeader, SectionHeader,
 * StaleNotice) and `format.ts` read a tiny contract: `useTranslation()`
 * returning `{ t, locale }`, a bare `t`, plus `getLocale` / `toBcp47` /
 * `setLocale` / `setMessages`. This file provides exactly that on top of
 * react-i18next, so the kit speaks the app's language switch and resources.
 *
 * Every kit key (`common.cancel`, `components.viewAll`, …) lives in the app
 * locales under the `opesUi` namespace, so a kit lookup is prefixed here.
 */
import i18next from 'i18next';
import { useTranslation as useI18nTranslation } from 'react-i18next';

export type Locale = 'en' | 'fr';
export type TParams = Record<string, string | number>;
export type TFunction = (key: string, params?: TParams) => string;

const PREFIX = 'opesUi.';

function toLocale(tag: string | undefined): Locale {
  return (tag ?? 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** BCP-47 tag for a locale (e.g. for `Intl` / `toLocaleString`). */
export function toBcp47(locale: Locale): string {
  return locale === 'fr' ? 'fr-FR' : 'en-US';
}

export function getLocale(): Locale {
  return toLocale(i18next.language);
}

/**
 * Idempotent on purpose. i18next emits `languageChanged` from every
 * `changeLanguage()` call — even one that sets the language it already has —
 * and `components/care/shared.tsx` listens to that event and calls back into
 * this function. Without the guard the two would echo each other forever.
 */
export function setLocale(next: Locale): void {
  if (getLocale() === next) return;
  void i18next.changeLanguage(next);
}

/**
 * Per-app string overrides, merged into the `opesUi` namespace (deep, overwrite)
 * so `setMessages('en', { components: { viewAll: 'See all' } })` still works.
 */
export function setMessages(locale: Locale, overrides: Record<string, Record<string, string>>): void {
  i18next.addResourceBundle(locale, 'translation', { opesUi: overrides }, true, true);
}

export const t: TFunction = (key, params) =>
  String(i18next.t(PREFIX + key, params as Record<string, unknown>));

export function useTranslation(): { t: TFunction; locale: Locale } {
  const { t: translate, i18n } = useI18nTranslation();
  return {
    t: (key, params) => String(translate(PREFIX + key, params as Record<string, unknown>)),
    locale: toLocale(i18n.language),
  };
}
