/**
 * Makes the `messagingRecipients` strings usable BEFORE the pending files are
 * merged into the shipped catalogue.
 *
 * `lib/i18n/pending/*.json` is a staging area: `lib/i18n/index.ts` loads only
 * `locales/{en,fr}.json`, so a `t('messagingRecipients.…')` call against a
 * pending file renders the raw key. Shipping the recipient picker with raw keys
 * on screen — or with English hardcoded into the French build — was not an
 * option, so the bundle is registered at module load instead.
 *
 * `addResourceBundle(lng, ns, resources, deep = true, overwrite = false)` is a
 * deep merge that never overwrites: once someone folds these keys into
 * `locales/{en,fr}.json` and deletes the pending files, this call becomes a
 * no-op against values that already exist, and deleting this module is then a
 * one-line change in the two screens that import it.
 *
 * Idempotent, so importing it from more than one screen is safe.
 */
import i18n from 'i18next';
import en from './pending/messaging_recipients.en.json';
import fr from './pending/messaging_recipients.fr.json';

let registered = false;

export function registerMessagingRecipientStrings(): void {
  if (registered) return;
  registered = true;

  // `_note` is documentation for whoever merges the file; it is not copy.
  i18n.addResourceBundle('en', 'translation', { messagingRecipients: en.messagingRecipients }, true, false);
  i18n.addResourceBundle('fr', 'translation', { messagingRecipients: fr.messagingRecipients }, true, false);
}
