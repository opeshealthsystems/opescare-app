/**
 * The app's i18next instance — and the one place that decides which language
 * the app starts in.
 *
 * **Why the boot language is read back from the device, not just guessed.**
 * This module used to start i18next from `expo-localization`'s device locale,
 * and the ONLY code that ever applied the patient's chosen language was an
 * effect inside `useLanguagePreference()` — a hook mounted by exactly one
 * screen, `app/settings.tsx`. So every launch (and, on the web build, every
 * page reload) came up in the device locale, and the chosen language was
 * re-applied only if and when the patient happened to open Settings. From the
 * outside that reads as "the language switch only translates the Settings
 * screen": Settings flips itself, everything else stays in the previous
 * language for the rest of the session.
 *
 * So the choice is now persisted on the device and read back here, before the
 * first screen paints. The server's `preferred_language` remains the
 * cross-device source of truth (see `useLanguagePreference`); this is the
 * local cache that keeps the app from being wrong while that request is in
 * flight — or when there is no network at all.
 *
 * `applyLanguage()` is the single writer: it changes the running language and
 * records it. Nothing else should call `i18next.changeLanguage` directly, or
 * the two halves drift apart again.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { Platform } from 'react-native';
import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import en from './locales/en.json';
import fr from './locales/fr.json';

/** The two languages the app ships. */
export type AppLocale = 'en' | 'fr';

/**
 * Device-local record of the patient's choice. Named like the other
 * device-local flags in `lib/` (`opescare_device_fingerprint`,
 * `opescare_push_token_id`) because that is exactly what it is.
 */
export const LANGUAGE_STORAGE_KEY = 'opescare_language';

/** Collapse any BCP-47 tag (or a stray null) onto the two we ship. */
export function normalizeLocale(value: string | null | undefined): AppLocale {
  return value?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

const isWeb = Platform.OS === 'web';

/**
 * The stored choice, when it can be read synchronously. Only the web build
 * can: `localStorage` is synchronous, so the browser starts in the right
 * language on the very first paint rather than flashing the device locale.
 */
function readStoredSync(): AppLocale | null {
  if (!isWeb) return null;
  try {
    const raw = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return raw ? normalizeLocale(raw) : null;
  } catch {
    return null;
  }
}

async function readStored(): Promise<AppLocale | null> {
  if (isWeb) return readStoredSync();
  try {
    const raw = await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
    return raw ? normalizeLocale(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(locale: AppLocale): void {
  try {
    if (isWeb) globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, locale);
    else void SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // A language preference is not worth an error state. The switch has
    // already taken effect in memory; the worst case is the device locale on
    // the next launch.
  }
}

const deviceLocale = normalizeLocale(Localization.getLocales()[0]?.languageCode);

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: readStoredSync() ?? deviceLocale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Native has no synchronous store, so the stored choice lands a tick after
// init. `changeLanguage` re-renders every `useTranslation` subscriber, so this
// correction reaches the whole tree — not only the screen that asked for it.
if (!isWeb) {
  void readStored().then((stored) => {
    if (stored && normalizeLocale(i18n.language) !== stored) void i18n.changeLanguage(stored);
  });
}

/**
 * Switch the running language and remember it on this device.
 *
 * Idempotent for the same reason `components/opes-ui/i18n.ts#setLocale` is:
 * i18next emits `languageChanged` even for a change to the language it already
 * has, and `components/care/shared.tsx` listens to that event. Re-emitting for
 * a no-op change is pure churn. (This function is not itself a
 * `languageChanged` listener, so it cannot re-enter that loop.)
 */
export async function applyLanguage(next: AppLocale): Promise<void> {
  writeStored(next);
  if (normalizeLocale(i18n.language) === next) return;
  await i18n.changeLanguage(next);
}

export default i18n;
