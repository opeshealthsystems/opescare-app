/**
 * ═════════════════════════════════════════════════════════════════════════
 *  THE TRANSLATION CONTRACT — read this before you translate a screen.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * The hospital this app is deployed to works in French. The desktop EMR has
 * been bilingual since audit 22; the app had zero French and a language picker
 * that persisted `fr-FR` and changed nothing. This module is the mechanism.
 *
 * ── Why no library ────────────────────────────────────────────────────────
 *
 * i18next + react-i18next is ~45 kB min, i18n-js ~18 kB, and both bring an
 * ICU/plural machinery we do not need for two languages that share the same
 * plural axis. The app is 2 MB and serves patients on 2G. What a screen
 * actually needs is: nested keys, `{placeholder}` interpolation, a count-based
 * plural, a React hook that re-renders on change, and a locale that persists.
 * That is `engine.ts` + `LocaleProvider.tsx`, about 250 lines with no runtime
 * dependency at all. If a third locale with a different plural rule ever
 * arrives, `plural()` is the one function to replace.
 *
 * MEASURED COST of this whole change (`npx expo export --platform web`):
 * 2,063,407 → 2,147,915 bytes raw, 504,727 → 525,822 gzipped — +84.5 kB raw,
 * +21.1 kB over the wire, +4.2%. Roughly 15 kB of that is the two catalogues
 * themselves and it will grow as the remaining clusters are translated; a
 * library would have added its own weight on top of the same strings.
 *
 * ── The rules ─────────────────────────────────────────────────────────────
 *
 * 1. KEYS ARE NAMESPACED BY SCREEN CLUSTER, mirroring `src/screens/`:
 *
 *        common.*        buttons, states and words used on >1 screen
 *        tabs.*          bottom-bar labels (patient + clinician)
 *        auth.*          LoginScreen, SignupScreen, session messages
 *        profile.*       core/ProfileSettingsScreen and its sheets
 *        care.*          screens/care/*
 *        diagnostics.*   screens/diagnostics/*
 *        medications.*   …and so on, one top-level key per folder.
 *
 *    Inside a cluster, group by screen then by role:
 *    `care.appointmentDetail.title`, `care.appointmentDetail.cancelCta`.
 *    Never reach into another cluster's namespace — if two clusters want the
 *    same word, it belongs in `common.*`.
 *
 * 2. EVERY KEY EXISTS IN BOTH `catalog/en.ts` AND `catalog/fr.ts`, in the same
 *    order, with the same shape. `npm run i18n:check` fails otherwise.
 *
 * 3. A SCREEN USES IT LIKE THIS — three lines, always the same three:
 *
 *        import { useTranslation } from '../../i18n';
 *        …
 *        const { t } = useTranslation();
 *        …
 *        <Text>{t('profile.accountSettings')}</Text>
 *
 *    `t` is stable per locale, so it is safe in a `useMemo`/`useCallback`
 *    dependency list — and it MUST be listed there, or the memo will hold
 *    English after a language switch.
 *
 * 4. INTERPOLATION uses `{name}`, never string concatenation:
 *
 *        'profile.patientSince': 'Patient since {year}'
 *        t('profile.patientSince', { year: 2024 })
 *
 *    Concatenating translated fragments produces word order that is right in
 *    English and wrong in French. Put the whole sentence in one key.
 *
 * 5. PLURALS use two sibling keys and a `count` param:
 *
 *        'care.upcoming_one':   '{count} upcoming appointment'
 *        'care.upcoming_other': '{count} upcoming appointments'
 *        t('care.upcoming', { count: n })
 *
 *    French treats 0 as singular ("0 rendez-vous"), English does not
 *    ("0 appointments"). `plural()` already knows this; write both forms and
 *    let it choose.
 *
 * 6. FRENCH IS REAL HOSPITAL FRENCH. Before inventing a clinical word, grep
 *    `lang/fr/` in the repo root and reuse the desktop's term — dossier
 *    médical, numéro de dossier, ordonnance, prescripteur, soignant,
 *    partogramme, « Demandes de prise en charge » for insurance claims.
 *    Write correct accents and correct elisions ("l’ordonnance", "n’a pas").
 *
 *    APOSTROPHES: the French catalogue uses the typographic apostrophe U+2019
 *    (’), which is correct French typography AND needs no escaping inside a
 *    single-quoted TypeScript literal. `'l’ordonnance'` is valid as written.
 *    The desktop catalogue carried 193 elisions that had been broken by
 *    deleting the apostrophe to dodge PHP escaping; there is no escaping to
 *    dodge here, so there is no excuse. NEVER drop an apostrophe. If you do
 *    reach for the ASCII `'`, escape it (`'l\'ordonnance'`) — never delete it.
 *
 * 7. NOTHING CLINICAL IS TRANSLATED IN THE APP. Drug names, ICD-10 wording,
 *    lab analyte names and free-text notes come from the API already in the
 *    account's language. Translate chrome, not content.
 *
 * 8. DATES, TIMES AND MONEY do not belong in the catalogue. Use
 *    `src/utils/format.ts` — it reads the same locale and matches the
 *    desktop's `App\Support\Format` conventions exactly.
 *
 * 9. FRENCH RUNS 15–25% LONGER THAN ENGLISH. Look at your screen in French at
 *    a 375pt width before you call it done. Anything with `numberOfLines={1}`
 *    — a header, a chip, a tab label, a table cell — is where it will bite.
 *    Known overflow already: `profile.title` ("Profil et paramètres") is
 *    ellipsised by `ScreenHeader`'s single-line title. Prefer a shorter FR
 *    phrasing where one exists and is still correct hospital French; where it
 *    does not, say so rather than mistranslating to save characters.
 */
export * from './engine';
export { LocaleProvider, getLocale, useLocale, useTranslation } from './LocaleProvider';
export { AccountLocaleSync } from './AccountLocaleSync';
