/**
 * Makes the push-notification copy usable BEFORE the pending files are merged
 * into the shipped catalogue — the same device as
 * `lib/i18n/messagingRecipientStrings.ts`, for the same reason:
 * `lib/i18n/index.ts` loads only `locales/{en,fr}.json`, so a
 * `t('push.…')` call against a pending file would render the raw key, and
 * hardcoding English into the French build is not an option.
 *
 * This module does one thing the recipient-strings module does not: it
 * **corrects two strings that already ship**, because they are rendered by
 * `app/settings.tsx`, which this change does not own, and one of them is a
 * promise the app cannot keep.
 *
 *   settings.device.pushBody = "Real-time alerts on this device."
 *
 * There are no real-time alerts on this device. There is no push token, no
 * delivery path, and (see `lib/push/capability.ts`) no EAS project id with
 * which to mint one. Leaving that subtitle under a switch the patient can flip
 * is the same false promise this change exists to remove, so it is replaced —
 * but **only while the claim is actually false**. The override is applied
 * conditionally on `getPushCapability()`, so the day the owner runs `eas init`
 * and uploads FCM/APNs credentials, the original wording is used again,
 * untouched, and this override retires itself with no edit anywhere.
 *
 * `settings.device.unavailable` is a genuinely new key rather than a
 * correction: `app/settings.tsx` renders `t(`settings.device.${push.error}`)`,
 * so the new `PushRegistrationError` member `'unavailable'` needs copy under
 * that exact name or the screen shows a raw key.
 *
 * `addResourceBundle(lng, ns, resources, deep, overwrite)`:
 *  - new keys go in with `overwrite = false`, so folding them into
 *    `locales/{en,fr}.json` later makes those calls no-ops;
 *  - the correction goes in with `overwrite = true`, because replacing an
 *    existing value is the entire point of it.
 *
 * Idempotent, so importing it from more than one screen is safe.
 */
// Imported from `../i18n` rather than straight from `i18next`: this module is
// called at module scope by `app/(auth)/permissions.tsx` and
// `lib/api/settingsQueries.ts`, and `addResourceBundle` needs an initialised
// store. Importing the app's own instance makes `lib/i18n/index.ts` run first
// by construction, instead of relying on `app/_layout.tsx` having been
// evaluated already.
import i18n from '../i18n';
import en from '../i18n/pending/push.en.json';
import fr from '../i18n/pending/push.fr.json';
import { getPushCapability } from './capability';

let registered = false;

export function registerPushStrings(): void {
  if (registered) return;
  registered = true;

  try {
    // `_note` is documentation for whoever merges the files; it is not copy.
    i18n.addResourceBundle('en', 'translation', { push: en.push }, true, false);
    i18n.addResourceBundle('fr', 'translation', { push: fr.push }, true, false);

    i18n.addResourceBundle('en', 'translation', en.corrections.always, true, false);
    i18n.addResourceBundle('fr', 'translation', fr.corrections.always, true, false);

    if (!getPushCapability().deliverable) {
      i18n.addResourceBundle('en', 'translation', en.corrections.whenUndeliverable, true, true);
      i18n.addResourceBundle('fr', 'translation', fr.corrections.whenUndeliverable, true, true);
    }
  } catch {
    // Every `push.*` lookup also carries a `defaultValue`, so the onboarding
    // screen still reads correctly in English. Allow a retry on the next
    // import; a translation-catalogue hiccup must not take a screen down.
    registered = false;
  }
}
