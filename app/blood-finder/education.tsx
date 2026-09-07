import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  Icon,
  ScreenHeader,
  SectionHeader,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, NoticeBanner } from '@/components/care/shared';

/**
 * Blood Education (SB-04).
 *
 * The one screen in the finder set that carries no live data at all, and the
 * only one where that is correct: this is reference material about donating
 * and receiving blood, not a report about any facility or any patient.
 *
 * ── Why every figure here is safe to hardcode ─────────────────────────────
 * Everywhere else in this feature the never-invent rule forbids a number that
 * did not come from the API — a unit count, a distance, a price. The figures
 * on this screen are of a different kind: donation intervals, the volume of a
 * standard donation and the ABO compatibility table are clinical constants,
 * not observations about this deployment. They would read identically on a
 * poster in any blood bank in the country.
 *
 * The compatibility table is the part worth being careful about, because it is
 * the one thing here a patient might act on. It states who may RECEIVE from
 * whom for whole blood, which is the direction the finder searches in, and it
 * says plainly that the transfusion decision is a clinician's — the app never
 * tells anyone which blood to accept.
 *
 * ── Not a substitute for the eligibility screen ───────────────────────────
 * The reference set also contains SB-03 "Become a Donor", which collects
 * health information and runs an eligibility check. This screen deliberately
 * does not pre-empt it: the eligibility notes here are written as "what is
 * usually asked", not as a decision about the reader.
 */

type Topic = {
  key: string;
  icon: IconName;
  tint: 'blue' | 'red' | 'green';
};

const TOPICS: Topic[] = [
  { key: 'who', icon: 'person', tint: 'blue' },
  { key: 'before', icon: 'cup', tint: 'green' },
  { key: 'during', icon: 'droplet', tint: 'red' },
  { key: 'after', icon: 'heart-pulse', tint: 'green' },
];

/**
 * Whole-blood compatibility, receiver → the groups they may receive from.
 *
 * O− is the universal donor and AB+ the universal receiver, which is why the
 * finder's search lets a patient widen to compatible groups rather than only
 * their own. Kept in the order the finder lists groups so the two screens do
 * not disagree about ordering.
 */
const COMPATIBILITY: { group: string; from: string }[] = [
  { group: 'O−', from: 'O−' },
  { group: 'O+', from: 'O−, O+' },
  { group: 'A−', from: 'O−, A−' },
  { group: 'A+', from: 'O−, O+, A−, A+' },
  { group: 'B−', from: 'O−, B−' },
  { group: 'B+', from: 'O−, O+, B−, B+' },
  { group: 'AB−', from: 'O−, A−, B−, AB−' },
  { group: 'AB+', from: 'All groups' },
];

export default function BloodEducationScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  const tintOf = (tint: Topic['tint']) =>
    tint === 'red'
      ? { fg: colors.statusCritical, bg: colors.statusCriticalBg }
      : tint === 'green'
        ? { fg: colors.statusNormal, bg: colors.statusNormalBg }
        : { fg: colors.blue, bg: colors.tintBlueBg };

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('bloodEducation.title')}
        subtitle={t('bloodEducation.subtitle')}
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* The one claim the whole screen rests on, stated once and up front. */}
        <Card accentColor={colors.statusCritical}>
          <View style={styles.leadRow}>
            <View style={[styles.leadMark, { backgroundColor: colors.statusCriticalBg }]}>
              <Icon name="droplet" size={22} color={colors.statusCritical} />
            </View>
            <View style={styles.leadBody}>
              <Text style={styles.leadTitle}>{t('bloodEducation.leadTitle')}</Text>
              <Text style={styles.leadText}>{t('bloodEducation.leadBody')}</Text>
            </View>
          </View>
        </Card>

        {/* ── Donating ─────────────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodEducation.donatingTitle')} />
          {TOPICS.map((topic) => {
            const tone = tintOf(topic.tint);
            return (
              <Card key={topic.key}>
                <View style={styles.topicRow}>
                  <View style={[styles.topicMark, { backgroundColor: tone.bg }]}>
                    <Icon name={topic.icon} size={19} color={tone.fg} />
                  </View>
                  <View style={styles.topicBody}>
                    <Text style={styles.topicTitle}>
                      {t(`bloodEducation.topics.${topic.key}.title`)}
                    </Text>
                    <Text style={styles.topicText}>
                      {t(`bloodEducation.topics.${topic.key}.body`)}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>

        {/* ── Compatibility ────────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodEducation.compatibilityTitle')} />
          <Card variant="flush">
            <View style={styles.tableHead}>
              <Text style={[styles.tableHeadCell, styles.groupCol]}>
                {t('bloodEducation.receiverColumn')}
              </Text>
              <Text style={styles.tableHeadCell}>{t('bloodEducation.donorColumn')}</Text>
            </View>
            {COMPATIBILITY.map((row, index) => (
              <View
                key={row.group}
                style={[
                  styles.tableRow,
                  index < COMPATIBILITY.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.groupCell, styles.groupCol, { color: colors.statusCritical }]}>
                  {row.group}
                </Text>
                <Text style={styles.fromCell}>
                  {row.from === 'All groups' ? t('bloodEducation.allGroups') : row.from}
                </Text>
              </View>
            ))}
          </Card>

          {/*
            The screen's most important sentence. A compatibility table read on
            a phone is not a transfusion decision, and this app must never let
            it be mistaken for one.
          */}
          <NoticeBanner
            icon="alert-triangle"
            tone="warning"
            title={t('bloodEducation.clinicalTitle')}
            message={t('bloodEducation.clinicalBody')}
          />
        </View>

        {/* ── Eligibility ──────────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('bloodEducation.eligibilityTitle')} />
          <Card>
            {(['age', 'weight', 'health', 'interval'] as const).map((key, index) => (
              <View
                key={key}
                style={[
                  styles.checkRow,
                  index < 3 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <Icon name="check-circle" size={18} color={colors.statusNormal} />
                <Text style={styles.checkText}>
                  {t(`bloodEducation.eligibility.${key}`)}
                </Text>
              </View>
            ))}
            <Text style={styles.eligibilityNote}>{t('bloodEducation.eligibilityNote')}</Text>
          </Card>
        </View>

        <CareButton
          label={t('bloodEducation.backToFinder')}
          icon="search"
          variant="primary"
          onPress={() => router.replace('/blood-finder')}
        />
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.sm },

    leadRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    leadMark: {
      width: 44,
      height: 44,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leadBody: { flex: 1 },
    leadTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    leadText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
      marginTop: 4,
    },

    topicRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
    topicMark: {
      width: 38,
      height: 38,
      borderRadius: radii.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topicBody: { flex: 1 },
    topicTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    topicText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
      marginTop: 3,
    },

    tableHead: {
      flexDirection: 'row',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: c.surfaceMuted,
    },
    tableHeadCell: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    groupCol: { flex: 0, width: 74 },
    groupCell: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
    },
    fromCell: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    checkText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
    },
    eligibilityNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      marginTop: spacing.sm,
    },
  });
