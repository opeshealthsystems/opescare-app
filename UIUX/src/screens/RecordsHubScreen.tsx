import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTranslation } from '../i18n';
import { colors, radii, shadow, spacing, typography } from '../theme/theme';

/** Route + glyph only; the label and hint are looked up per render, in locale. */
const ITEMS: Array<{ key: string; labelKey: string; hintKey: string; icon: React.ReactNode }> = [
  {
    key: 'Encounters',
    labelKey: 'records.hub.visitsLabel',
    hintKey: 'records.hub.visitsHint',
    icon: (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M4 4h16v16H4z" fill="none" stroke={colors.blue} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d="M8 9h8M8 13h8M8 17h5" stroke={colors.blue} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    ),
  },
  {
    key: 'Diagnoses',
    labelKey: 'records.hub.diagnosesLabel',
    hintKey: 'records.hub.diagnosesHint',
    icon: (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={9} fill="none" stroke={colors.blue} strokeWidth={1.6} />
        <Path d="M12 8v8M8 12h8" stroke={colors.blue} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    ),
  },
  {
    key: 'Prescriptions',
    labelKey: 'records.hub.prescriptionsLabel',
    hintKey: 'records.hub.prescriptionsHint',
    icon: (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M9 3h6v4l5 5a4 4 0 01-11.3 5.7L4 13.3A4 4 0 019 8V3z" fill="none" stroke={colors.blue} strokeWidth={1.5} strokeLinejoin="round" />
      </Svg>
    ),
  },
  {
    key: 'Vitals',
    labelKey: 'records.hub.vitalsLabel',
    hintKey: 'records.hub.vitalsHint',
    icon: (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M3 12h4l2-6 4 12 2-6h6" stroke={colors.blue} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    ),
  },
  {
    key: 'Immunizations',
    labelKey: 'records.hub.immunizationsLabel',
    hintKey: 'records.hub.immunizationsHint',
    icon: (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M19 5l-4 4m0 0l-7 7-2 4 4-2 7-7m-5-2l5-5 2 2-5 5m-2-2l2 2" stroke={colors.blue} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    ),
  },
  {
    key: 'Allergies',
    labelKey: 'records.hub.allergiesLabel',
    hintKey: 'records.hub.allergiesHint',
    icon: (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path
          d="M10.3 3.7a2.5 2.5 0 013.4 0l6.6 6.6a2.5 2.5 0 010 3.4l-6.6 6.6a2.5 2.5 0 01-3.4 0L3.7 13.7a2.5 2.5 0 010-3.4z"
          fill="none"
          stroke={colors.blue}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <Path d="M12 8v4.5M12 16h.01" stroke={colors.blue} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    ),
  },
  {
    key: 'Documents',
    labelKey: 'records.hub.documentsLabel',
    hintKey: 'records.hub.documentsHint',
    icon: (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M6 2h9l5 5v15H6z" fill="none" stroke={colors.blue} strokeWidth={1.6} strokeLinejoin="round" />
        <Path d="M15 2v5h5" stroke={colors.blue} strokeWidth={1.6} strokeLinejoin="round" fill="none" />
      </Svg>
    ),
  },
  {
    key: 'Timeline',
    labelKey: 'records.hub.timelineLabel',
    hintKey: 'records.hub.timelineHint',
    icon: (
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M6 3v18" stroke={colors.blue} strokeWidth={1.6} strokeLinecap="round" />
        <Circle cx={6} cy={7} r={2.2} fill="none" stroke={colors.blue} strokeWidth={1.6} />
        <Circle cx={6} cy={15} r={2.2} fill="none" stroke={colors.blue} strokeWidth={1.6} />
        <Path d="M10 7h9M10 15h6" stroke={colors.blue} strokeWidth={1.6} strokeLinecap="round" />
      </Svg>
    ),
  },
];

export function RecordsHubScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('records.hub.title')}</Text>
      <Text style={styles.subtitle}>{t('records.hub.subtitle')}</Text>

      {ITEMS.map((item) => (
        <TouchableOpacity key={item.key} style={styles.row} activeOpacity={0.7} onPress={() => navigation.navigate(item.key)}>
          <View style={styles.iconWrap}>{item.icon}</View>
          <View style={styles.textWrap}>
            <Text style={styles.label}>{t(item.labelKey)}</Text>
            <Text style={styles.description}>{t(item.hintKey)}</Text>
          </View>
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M9 6l6 6-6 6" stroke={colors.textMuted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingTop: spacing.xl },
  title: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.xl, color: colors.textPrimary },
  subtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  textWrap: { flex: 1 },
  label: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
  description: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted, marginTop: 2 },
});
