/**
 * The client-side chrome around the consent screens, usable BEFORE the pending
 * files are merged into the shipped catalogue.
 *
 * Same arrangement as `messagingRecipientStrings.ts`: `lib/i18n/index.ts` loads
 * only `locales/{en,fr}.json`, so a `t('consentCopy.…')` call against a file in
 * `lib/i18n/pending/` would render the raw key. Registering the bundle at
 * module load keeps both languages working until someone folds the keys in.
 *
 * `addResourceBundle(lng, ns, resources, deep = true, overwrite = false)` is a
 * deep merge that never overwrites, so once these keys exist in the locale
 * files THOSE win and this module can be deleted with a one-line change in each
 * importer.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────────
 *
 * The vocabulary itself. Every scope name, purpose, duration and access-log
 * reason the patient reads is resolved by the SERVER
 * (App\Support\PatientVocabulary, out of lang/{en,fr}/consent_requests.php and
 * lang/{en,fr}/access_log.php — the same files the clinician's picker is built
 * from) and arrives already in the patient's language.
 *
 * That is the whole point. The app used to carry its own scope table
 * (`privacy.scope.read_records`, `privacy.scope.outpatient`, …) built from a
 * vocabulary this API has never emitted, so every real code — `patient.summary`,
 * `allergies.read` — missed it and fell through to the raw string. A patient
 * deciding whether to open their medical record was reading `Patient.summary`
 * and `1440 min`, in French as well as English. A second copy of a vocabulary
 * does not stay in step with the first; there is now one copy, on the server.
 *
 * What IS here is sentence structure the server has no business owning (how a
 * duration is framed, how the approve confirmation is worded) plus the fallback
 * caution for a payload from a server old enough not to send labels at all.
 *
 * `profile.profileStrengthHint_*` rides along because it is the same class of
 * bug from the same QA pass: the key interpolated `{{missing}}`, which is not
 * i18next's plural variable, so both languages printed the lazy parenthesis —
 * "2 detail(s) still missing". Passing `count` and giving it real `_one`/
 * `_other` forms is the fix; French agrees the adjective as well as the noun.
 */
import i18n from 'i18next';
import en from './pending/consent_copy.en.json';
import fr from './pending/consent_copy.fr.json';

let registered = false;

export function registerConsentCopyStrings(): void {
  if (registered) return;
  registered = true;

  try {
    i18n.addResourceBundle('en', 'translation', en, true, false);
    i18n.addResourceBundle('fr', 'translation', fr, true, false);
  } catch {
    // i18next not initialised yet in some test/tooling contexts. Every lookup
    // in the importing screens carries a defaultValue, so they still render.
  }
}

registerConsentCopyStrings();
