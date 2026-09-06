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
 * Terms of Service — the in-app copy.
 *
 * ── WHY THIS SCREEN EXISTS ────────────────────────────────────────────────
 * A health app that lets people book clinical appointments, reserve medicines
 * and request blood needs to state, before they rely on it, what it is and
 * what it is not. Apple reviews medical apps against Guideline 1.4.1
 * (physical harm) and expects the limits to be stated; Google Play's Health
 * apps policy expects the same. The emergency-care warning below is the part
 * that actually matters to a user, so it comes first, not last.
 *
 * ── ACCURACY ──────────────────────────────────────────────────────────────
 * The limits described here are real properties of the system, checked in the
 * code, not disclaimers written to be safe:
 *  - stock and availability are reported by facilities and can be stale — the
 *    finder surfaces a freshness timestamp precisely because of this;
 *  - reserving a medicine takes no payment (`en.json`: "You pay at the
 *    pharmacy"), and the app has no payment integration at all;
 *  - clinical records are amended, never overwritten, which is why the
 *    correction route is a request rather than an edit.
 *
 * ── i18n ──────────────────────────────────────────────────────────────────
 * Keys carry `defaultValue` so the screen is correct in English before the
 * strings land in `lib/i18n/locales/{en,fr}.json`. French copy is written and
 * waiting in `lib/i18n/pending/legal.fr.json`.
 */

/** Last substantive revision. Must match the hosted terms page. */
const LAST_UPDATED = '2026-09-05';

/** Where a question about these terms lands. */
const SUPPORT_CONTACT = 'support@opescare.cloud';

type Section = {
  key: string;
  icon: IconName;
  title: string;
  body: string[];
};

function useSections(): Section[] {
  const { t } = useTranslation();
  const tx = (key: string, defaultValue: string) =>
    String(t(`legal.terms.${key}`, { defaultValue }));

  return [
    {
      key: 'notEmergency',
      icon: 'alert-triangle',
      title: tx('emergencyTitle', 'This app is not emergency care'),
      body: [
        tx(
          'emergencyBody',
          'If you are having a medical emergency, stop and call your local emergency number or go to the nearest emergency department. Do not use this app to seek urgent help. Messages, appointment requests and blood requests are not monitored continuously and may not be seen in time.',
        ),
      ],
    },
    {
      key: 'notAdvice',
      icon: 'stethoscope',
      title: tx('adviceTitle', 'It does not give medical advice'),
      body: [
        tx(
          'adviceBody',
          'OpesCare shows you information from your health record and from the facilities in the national directory. It does not diagnose, treat, or tell you what to do about your health. Nothing in the app replaces a consultation with a qualified clinician, and no result, value or flag shown here should be acted on without one.',
        ),
        tx(
          'adviceResults',
          'Laboratory results and vital signs are shown as your facility reported them. A reference range or an out-of-range marker is a laboratory’s own annotation, not an interpretation of what it means for you.',
        ),
      ],
    },
    {
      key: 'account',
      icon: 'person',
      title: tx('accountTitle', 'Your account'),
      body: [
        tx(
          'accountTruthful',
          'You must give accurate identity details. Your Health ID is issued against them, and a record attached to wrong details is a danger to you: it can put someone else’s allergies or blood group in front of the person treating you.',
        ),
        tx(
          'accountSecurity',
          'Keep your password, PIN and one-time codes to yourself. Anyone who signs in as you can read your entire medical record. Tell us immediately if you think someone else has access.',
        ),
        tx(
          'accountOne',
          'One account belongs to one person. Use the Family feature to hold a dependent’s record rather than sharing a login.',
        ),
        tx(
          'accountClosing',
          'You may close your account at any time by writing to us. The app cannot yet close it for you; the Privacy Policy explains what happens to your data when you do.',
        ),
      ],
    },
    {
      key: 'availability',
      icon: 'store',
      title: tx('availabilityTitle', 'Stock, availability and bookings'),
      body: [
        tx(
          'availabilityReported',
          'Medicine stock, blood availability and appointment slots are reported to OpesCare by the pharmacies, blood banks and facilities themselves. We publish what they tell us, with the time it was last updated. We do not hold the stock, and we cannot guarantee that an item shown as available still is when you arrive. Call ahead when it matters.',
        ),
        tx(
          'availabilityReservation',
          'A reservation is a request to a pharmacy, not a purchase. The app takes no payment. You pay the pharmacy directly, at the pharmacy.',
        ),
        tx(
          'availabilityBlood',
          'OpesCare takes no payment for blood, and a blood request placed here is a request to a blood bank — it is not a guarantee that units will be held for you.',
        ),
        tx(
          'availabilityAppointment',
          'An appointment booked in the app is confirmed by the facility, and the facility’s own rules on lateness, cancellation and fees apply.',
        ),
      ],
    },
    {
      key: 'record',
      icon: 'folder',
      title: tx('recordTitle', 'Your record'),
      body: [
        tx(
          'recordSource',
          'Your record is written by the clinicians and facilities that treat you. OpesCare carries it between them; it does not author it.',
        ),
        tx(
          'recordAmend',
          'Clinical entries are never silently overwritten. If something is wrong, you can raise a correction request against that entry, and the change is recorded as an amendment with its history intact. That is what makes the record safe to rely on.',
        ),
        tx(
          'recordConsent',
          'You control who sees your record. Access is granted by your consent, is limited to what that consent covers, and is logged so you can check it.',
        ),
      ],
    },
    {
      key: 'acceptable',
      icon: 'shield',
      title: tx('acceptableTitle', 'Acceptable use'),
      body: [
        tx(
          'acceptableBody',
          'Do not use the app to impersonate anyone, to access a record that is not yours or lawfully shared with you, to place false blood or medicine requests, or to disrupt the service for others. Do not attempt to break, probe or circumvent its security. We may suspend an account that does.',
        ),
      ],
    },
    {
      key: 'liability',
      icon: 'info',
      title: tx('liabilityTitle', 'Availability and limits'),
      body: [
        tx(
          'liabilityUptime',
          'We work to keep the service available, but we do not promise it will be uninterrupted or error-free. Maintenance, network failures and the systems of the facilities we connect to can all interrupt it.',
        ),
        tx(
          'liabilityThird',
          'Where the app shows information supplied by a facility, a pharmacy, a blood bank or a laboratory, that party is responsible for its accuracy.',
        ),
        tx(
          'liabilityExtent',
          'To the extent the law allows, we are not liable for loss arising from your reliance on information the app displays where that information came from a third party, or from your use of the app in place of professional medical care.',
        ),
      ],
    },
    {
      key: 'changes',
      icon: 'clock',
      title: tx('changesTitle', 'Changes'),
      body: [
        tx(
          'changesBody',
          'We may update these terms. When we do, we will change the date at the top of this page, and tell you in the app before a significant change takes effect. Continuing to use the app after that means you accept the updated terms.',
        ),
      ],
    },
  ];
}

export default function TermsOfServiceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const sections = useSections();

  const handleBack = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('legal.terms.title', { defaultValue: 'Terms of Service' })}
        subtitle={t('legal.terms.updated', {
          defaultValue: 'Last updated {{date}}',
          date: LAST_UPDATED,
        })}
        onBack={handleBack}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.lede}>
            {t('legal.terms.lede', {
              defaultValue:
                'These terms cover your use of the OpesCare app. The first two sections are the ones that matter most to your safety — please read them even if you read nothing else.',
            })}
          </Text>
        </Card>

        {sections.map((section, sectionIndex) => (
          <View key={section.key} style={styles.section}>
            <SectionHeader title={section.title} variant="overline" />
            {/* The emergency warning is the one section a reader must not skim
                past: it carries the kit's red accent bar and red tint circle,
                every other section the neutral blue one. */}
            <Card accentColor={sectionIndex === 0 ? colors.tintRed : undefined}>
              <View style={styles.iconRow}>
                <View
                  style={[
                    styles.iconCircle,
                    sectionIndex === 0 && { backgroundColor: colors.tintRedBg },
                  ]}
                >
                  <Icon
                    name={section.icon}
                    size={18}
                    color={sectionIndex === 0 ? colors.tintRed : colors.blue}
                  />
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
            title={t('legal.terms.contactTitle', { defaultValue: 'Contact us' })}
            variant="overline"
          />
          <Card>
            <Text style={styles.body}>
              {t('legal.terms.contactBody', {
                defaultValue: 'Questions about these terms:',
              })}
            </Text>
            <Text
              style={[styles.body, styles.bodySpaced, styles.link]}
              accessibilityRole="link"
              onPress={() => {
                Linking.openURL(`mailto:${SUPPORT_CONTACT}`).catch(() => undefined);
              }}
            >
              {SUPPORT_CONTACT}
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
