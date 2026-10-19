/**
 * Registers the over-the-air update banner's strings (`otaUpdate.*`) from
 * lib/i18n/pending/ until they are merged into locales/{en,fr}.json.
 */
import i18n from 'i18next';
import en from './pending/otaUpdate.en.json';
import fr from './pending/otaUpdate.fr.json';

let registered = false;

export function registerOtaUpdateStrings(): void {
  if (registered) return;
  registered = true;
  try {
    i18n.addResourceBundle('en', 'translation', en, true, false);
    i18n.addResourceBundle('fr', 'translation', fr, true, false);
  } catch {
    // i18next not initialised yet in some tooling contexts.
  }
}

registerOtaUpdateStrings();
