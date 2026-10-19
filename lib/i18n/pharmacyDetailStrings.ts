/**
 * Registers the pharmacy detail page's strings (`pharmacyDetail.*`) from
 * lib/i18n/pending/ until they are merged into locales/{en,fr}.json.
 * Imported for its side effect by components/pharmacy/detail/PharmacyStockSection.
 */
import i18n from 'i18next';
import en from './pending/pharmacyDetail.en.json';
import fr from './pending/pharmacyDetail.fr.json';

let registered = false;

export function registerPharmacyDetailStrings(): void {
  if (registered) return;
  registered = true;
  try {
    i18n.addResourceBundle('en', 'translation', en, true, false);
    i18n.addResourceBundle('fr', 'translation', fr, true, false);
  } catch {
    // i18next not initialised yet in some tooling contexts.
  }
}

registerPharmacyDetailStrings();
