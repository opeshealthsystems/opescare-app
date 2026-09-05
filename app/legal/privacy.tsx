import { useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Icon,
  ScreenHeader,
  SectionHeader,
  spacing,
  radii,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { Screen } from '@/components/ui/Screen';

/**
 * Privacy Policy — the in-app copy.
 *
 * ── WHY THIS SCREEN EXISTS ────────────────────────────────────────────────
 * Apple (App Review Guideline 5.1.1) and Google Play (User Data policy) both
 * require a health app to disclose, in the app AND at a publicly reachable
 * URL, exactly what it collects and why. This app previously had neither.
 *
 * ── WHAT IT IS NOT ────────────────────────────────────────────────────────
 * This screen does NOT satisfy the store requirement on its own. Both stores
 * demand a policy hosted at an https URL that a reviewer can open in a browser
 * WITHOUT installing the app. This text is the source of truth for that page;
 * someone still has to publish it. See docs/STORE_SUBMISSION.md.
 *
 * ── ACCURACY ──────────────────────────────────────────────────────────────
 * Every claim below was checked against the code, not against intent:
 *  - one first-party host (`lib/api/endpoints.ts`), no third-party SDK, no
 *    analytics, no advertising, no tracking — verified by dependency audit;
 *  - precise coordinates leave the device in exactly one flow, Blood Finder
 *    (`GET /mobile/blood/search?lat=&lng=`), and the Care Map sends only a
 *    reverse-geocoded city name;
 *  - on-device storage is Keychain/Keystore-backed natively and plaintext
 *    `localStorage` on web (`lib/offline/storage.ts` says so explicitly);
 *  - there is NO in-app account deletion today, so the policy tells the user
 *    the route that actually works instead of pretending otherwise.
 * If any of those change, this text is wrong and must change with it.
 *
 * ── i18n ──────────────────────────────────────────────────────────────────
 * Keys carry `defaultValue` so the screen renders correct English before the
 * strings are merged into `lib/i18n/locales/{en,fr}.json`. The French copy is
 * written and waiting in `lib/i18n/pending/legal.fr.json`; until someone
 * merges it, a French device sees English here. That is a known, reported gap.
 */

/** Last substantive revision of this text. Shown to the user, and the date the
 *  hosted policy page must match. Bump it whenever a section below changes. */
const LAST_UPDATED = '2026-09-05';

/** Where a privacy request actually lands. Also the address the hosted policy
 *  page and both store listings must quote — three copies that have to agree. */
const PRIVACY_CONTACT = 'privacy@opescare.cloud';

type Section = {
  key: string;
  icon: IconName;
  title: string;
  body: string[];
};

/**
 * The policy itself.
 *
 * Ordered the way a reader needs it, not the way a lawyer files it: what is
 * collected, who sees it, what the user controls, then the formalities.
 */
function useSections(): Section[] {
  const { t } = useTranslation();
  const tx = (key: string, defaultValue: string) =>
    String(t(`legal.privacy.${key}`, { defaultValue }));

  return [
    {
      key: 'collect',
      icon: 'document-text',
      title: tx('collectTitle', 'What we collect'),
      body: [
        tx(
          'collectIdentity',
          'Identity and contact details you give us: your name, date of birth, sex, phone number, email address, postal address, and the name and phone number of the emergency contact you nominate. If you register a dependent, we collect the same details for them.',
        ),
        tx(
          'collectHealth',
          'Health information held in your OpesCare record: your Health ID, blood group, allergies, diagnoses and conditions, immunisations, prescriptions, laboratory orders and results, vital signs, care plans, referrals, appointments, and clinical documents issued to you.',
        ),
        tx(
          'collectUsage',
          'Requests you make in the app: appointment bookings and cancellations, medicine reservations, blood requests, laboratory test requests, messages you send to your care team, support tickets, and any free-text note or reason you type into them.',
        ),
        tx(
          'collectDevice',
          'A device identifier the app generates for itself — a random string, not your hardware serial number and not an advertising ID. It lets us tie a notification registration and an offline-access authorisation to this handset, and nothing else.',
        ),
      ],
    },
    {
      key: 'location',
      icon: 'location',
      title: tx('locationTitle', 'Location'),
      body: [
        tx(
          'locationWhen',
          'The app asks for location only while you are using it, and only on the screens that need it. It never tracks you in the background.',
        ),
        tx(
          'locationBlood',
          'In Blood Finder, your coordinates are sent to our server so it can rank blood banks by real distance from you. This is the only place your precise position leaves the device.',
        ),
        tx(
          'locationMap',
          'On the Care Map, your coordinates stay on the device. They are used to sort nearby facilities and to work out how far away each one is. The app converts your position into a city name and sends only that city name to filter the directory.',
        ),
        tx(
          'locationDecline',
          'You can decline location entirely. Both screens then fall back to a city you choose from a list, and everything else in them keeps working.',
        ),
      ],
    },
    {
      key: 'use',
      icon: 'heart-pulse',
      title: tx('useTitle', 'Why we use it'),
      body: [
        tx(
          'useCare',
          'To give you and the clinicians you authorise a single, accurate view of your health record across the facilities you visit, so your care does not restart from nothing at every door.',
        ),
        tx(
          'useOperate',
          'To operate the features you ask for: finding medicines and blood in stock, booking appointments, issuing your Health ID, and delivering the copies of your record that you export.',
        ),
        tx(
          'useSafety',
          'To keep the platform safe and accountable: authenticating you, preventing abuse, and recording who opened your record so you can audit it.',
        ),
        tx(
          'useLegal',
          'To meet obligations that apply to health records under the law of the country where your care is delivered.',
        ),
      ],
    },
    {
      key: 'never',
      icon: 'shield-check',
      title: tx('neverTitle', 'What we never do'),
      body: [
        tx(
          'neverSell',
          'We do not sell your personal or health information, and we never have.',
        ),
        tx(
          'neverAds',
          'We do not use your information for advertising, and the app carries no advertising.',
        ),
        tx(
          'neverTrack',
          'The app contains no analytics, tracking, attribution or crash-reporting service of any kind. It talks to one server — ours — and to no other company. Nothing you do in the app is reported to a third party.',
        ),
      ],
    },
    {
      key: 'sharing',
      icon: 'users',
      title: tx('sharingTitle', 'Who else can see your record'),
      body: [
        tx(
          'sharingConsent',
          'A health facility or clinician sees your record only within a consent you granted. You approve or refuse each request in the app, you can see every consent that is currently active, and you can revoke any of them at any time.',
        ),
        tx(
          'sharingLogs',
          'Every access is logged. Privacy › Access log shows you who opened your record, when, from where, and for what stated purpose — including any emergency access.',
        ),
        tx(
          'sharingPrescription',
          'When you share a prescription with a pharmacy, the app creates a limited, expiring link that shows that prescription and nothing else. You can revoke it before it expires.',
        ),
        tx(
          'sharingFamily',
          'If you invite a family member, they see only what the access level you chose allows. You can withdraw that access.',
        ),
      ],
    },
    {
      key: 'storage',
      icon: 'lock',
      title: tx('storageTitle', 'How it is stored'),
      body: [
        tx(
          'storageTransit',
          'Everything the app sends travels over an encrypted HTTPS connection.',
        ),
        tx(
          'storageDevice',
          'On your phone, your session token and any offline copy of your record are held in the operating system’s secure store — the iOS Keychain or the Android Keystore — which is encrypted at rest and tied to your device unlock.',
        ),
        tx(
          'storageOffline',
          'Offline access is off until you switch it on, and it stores only the categories you approve: your demographics, upcoming appointments, medications, allergies, and an emergency profile. You can erase that copy from the device at any time in Settings › Offline access. The authorisation itself expires on its own within 24 hours.',
        ),
        tx(
          'storageWeb',
          'If you use OpesCare in a web browser rather than the installed app, browser storage offers no encryption at rest. The app warns you before it stores anything there.',
        ),
      ],
    },
    {
      key: 'rights',
      icon: 'key',
      title: tx('rightsTitle', 'Your rights'),
      body: [
        tx(
          'rightsSee',
          'See your record: every clinical section in the app is your own data, shown to you in full.',
        ),
        tx(
          'rightsExport',
          'Take a copy: Settings › Download my records exports your record as a PDF or as a FHIR R4 bundle you can hand to any other system.',
        ),
        tx(
          'rightsCorrect',
          'Correct it: if something in your record is wrong, Privacy › Data requests raises a correction request against the specific entry. Clinical records are never silently overwritten — a correction is recorded as an amendment, which is what makes the history trustworthy.',
        ),
        tx(
          'rightsRevoke',
          'Withdraw consent: revoke any facility’s access from the Privacy screen, at any time, without giving a reason.',
        ),
        tx(
          'rightsDelete',
          'Delete your account: the app cannot yet do this for you. Email us at the address below from the address on your account and we will close it and delete the personal data we are not legally required to retain. Medical records that a facility is obliged by law to keep are retained by that facility, and we will tell you which ones those are.',
        ),
      ],
    },
    {
      key: 'children',
      icon: 'baby',
      title: tx('childrenTitle', 'Children and dependents'),
      body: [
        tx(
          'childrenBody',
          'The app is intended for adults. A parent or guardian may hold a dependent’s record through the Family feature, and is responsible for that child’s information in the app. We do not knowingly let a child create an account for themselves.',
        ),
      ],
    },
    {
      key: 'changes',
      icon: 'clock',
      title: tx('changesTitle', 'Changes to this policy'),
      body: [
        tx(
          'changesBody',
          'If we change what we collect or what we do with it, we will update this page and the date shown at the top of it, and — where the change is significant — tell you in the app before it takes effect.',
        ),
      ],
    },
  ];
}

export default function PrivacyPolicyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const sections = useSections();

  const handleBack = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('legal.privacy.title', { defaultValue: 'Privacy Policy' })}
        subtitle={t('legal.privacy.updated', {
          defaultValue: 'Last updated {{date}}',
          date: LAST_UPDATED,
        })}
        onBack={handleBack}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Card>
          <Text style={styles.lede}>
            {t('legal.privacy.lede', {
              defaultValue:
                'OpesCare Finder holds medical information about you. This page explains, in plain words, what the app collects, who can see it, and what you can do about it. It describes what the app actually does today — not what it might do later.',
            })}
          </Text>
        </Card>

        {sections.map((section) => (
          <View key={section.key} style={styles.section}>
            <SectionHeader title={section.title} variant="overline" />
            <Card>
              <View style={styles.iconRow}>
                <View style={styles.iconCircle}>
                  <Icon name={section.icon} size={18} color={colors.blue} />
                </View>
              </View>
              {section.body.map((paragraph, index) => (
                <Text
                  key={`${section.key}-${index}`}
                  style={[styles.body, index > 0 && styles.bodySpaced]}
                >
                  {paragraph}
                </Text>
              ))}
            </Card>
          </View>
        ))}

        <View style={styles.section}>
          <SectionHeader
            title={t('legal.privacy.contactTitle', { defaultValue: 'Contact us' })}
            variant="overline"
          />
          <Card>
            <Text style={styles.body}>
              {t('legal.privacy.contactBody', {
                defaultValue:
                  'Questions about this policy, or a request about your data — including deleting your account — go to:',
              })}
            </Text>
            <Text
              style={[styles.body, styles.bodySpaced, styles.link]}
              accessibilityRole="link"
              onPress={() => {
                Linking.openURL(`mailto:${PRIVACY_CONTACT}`).catch(() => undefined);
              }}
            >
              {PRIVACY_CONTACT}
            </Text>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    lede: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.md,
      color: colors.textSecondary,
    },
    section: { gap: spacing.sm },
    iconRow: { flexDirection: 'row', marginBottom: spacing.sm },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: radii.pill,
      backgroundColor: colors.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.md,
      color: colors.textSecondary,
    },
    bodySpaced: { marginTop: spacing.sm },
    link: {
      fontFamily: typography.fontFamily.semiBold,
      color: colors.link,
    },
  });
