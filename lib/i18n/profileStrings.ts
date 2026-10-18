/**
 * Registers the shared profile design's strings (`profiles.*`) from
 * lib/i18n/pending/ until they are merged into locales/{en,fr}.json.
 * Imported for its side effect by components/profile/index.ts, so any screen
 * that draws a profile has them.
 */
import i18n from 'i18next';
import en from './pending/profiles.en.json';
import fr from './pending/profiles.fr.json';

let registered = false;

export function registerProfileStrings(): void {
  if (registered) return;
  registered = true;
  try {
    i18n.addResourceBundle('en', 'translation', en, true, false);
    i18n.addResourceBundle('fr', 'translation', fr, true, false);
  } catch {
    // i18next not initialised yet in some tooling contexts.
  }
}

registerProfileStrings();
