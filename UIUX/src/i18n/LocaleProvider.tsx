/**
 * Locale resolution, persistence and the `t` every screen uses.
 *
 * ── Resolution order ──────────────────────────────────────────────────────
 *
 *   1. The user's explicit choice, persisted on this device (AsyncStorage).
 *   2. The account's language from `GET /patient/settings`, adopted on first
 *      sign-in so a patient who chose French on the web opens the app in
 *      French without choosing again.
 *   3. The device locale.
 *   4. French — the deployment is a francophone Cameroonian hospital and the
 *      server's APP_LOCALE is `fr`. An unconfigured install must not open in
 *      the language most of its users do not work in.
 *
 * Steps 2–4 only run while the user has never chosen; once they have, their
 * choice wins over everything, including a differing server value. That is
 * what "explicit choice" means, and it is why the device-local copy exists at
 * all: the picker has to keep working offline and before the settings call
 * returns.
 *
 * ── Persistence ───────────────────────────────────────────────────────────
 *
 * Two places, deliberately:
 *
 *   • AsyncStorage, immediately and synchronously enough that the next render
 *     is already translated and a reload comes back in the chosen language
 *     even with no network.
 *   • `PUT /patient/settings` with `language: 'fr-FR'` — the SAME endpoint and
 *     the SAME field the existing picker already wrote to. No new API surface,
 *     and the value now means something. A failed write is not fatal: the
 *     local choice stands and the screen surfaces the error as it always did.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  toBcp47,
  toLocale,
  translator,
  type Locale,
  type TFunction,
} from './engine';

const STORAGE_KEY = 'opes_locale_v1';

/**
 * The active locale as a module-level value, for the handful of callers that
 * are not React components — `src/utils/format.ts` formats dates from inside
 * plain functions. Kept in sync by the provider; never written elsewhere.
 */
let currentLocale: Locale = DEFAULT_LOCALE;

export function getLocale(): Locale {
  return currentLocale;
}

/** Best guess from the platform. Web exposes `navigator.language`; Hermes has full Intl. */
function deviceLocale(): Locale | null {
  try {
    const nav = typeof navigator !== 'undefined' ? (navigator as { language?: string }) : undefined;
    const fromNav = toLocale(nav?.language);
    if (fromNav) return fromNav;
  } catch {
    // Some RN runtimes define `navigator` without `language`.
  }
  try {
    return toLocale(new Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return null;
  }
}

type LocaleState = {
  locale: Locale;
  /** True once the stored choice has been read — the app renders regardless. */
  ready: boolean;
  /** The user picked a language on this device; steps 2–4 no longer apply. */
  isExplicit: boolean;
  /** Persist locally and switch. Callers that also own the API write use `setLocale`. */
  setLocale: (next: Locale) => Promise<void>;
  /** Step 2: adopt the account's language, but never over an explicit choice. */
  adoptAccountLocale: (tag: string | null | undefined) => void;
  t: TFunction;
};

const LocaleContext = createContext<LocaleState | undefined>(undefined);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => deviceLocale() ?? DEFAULT_LOCALE);
  const [isExplicit, setIsExplicit] = useState(false);
  const [ready, setReady] = useState(false);

  currentLocale = locale;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = toLocale(await AsyncStorage.getItem(STORAGE_KEY));
        if (!cancelled && stored) {
          setLocaleState(stored);
          setIsExplicit(true);
        }
      } catch {
        // A cache we cannot read is a cache miss, not a failure to start.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    setIsExplicit(true);
    currentLocale = next;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, toBcp47(next));
    } catch {
      // The switch already happened in memory; it just will not survive a reload.
    }
  }, []);

  const adoptAccountLocale = useCallback(
    (tag: string | null | undefined) => {
      if (isExplicit) return;
      const fromAccount = toLocale(tag);
      if (fromAccount && fromAccount !== locale) {
        setLocaleState(fromAccount);
        currentLocale = fromAccount;
      }
    },
    [isExplicit, locale]
  );

  const t = useMemo(() => translator(locale), [locale]);

  const value = useMemo<LocaleState>(
    () => ({ locale, ready, isExplicit, setLocale, adoptAccountLocale, t }),
    [locale, ready, isExplicit, setLocale, adoptAccountLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleState {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}

/** The hook every screen uses. See rule 3 in `src/i18n/index.ts`. */
export function useTranslation(): { t: TFunction; locale: Locale } {
  const { t, locale } = useLocale();
  return { t, locale };
}
