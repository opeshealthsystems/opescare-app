import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { typography, type Palette } from '../theme';
import { useTheme } from '../ThemeProvider';
import { useTranslation } from 'react-i18next';

type Props = {
  size?: 'md' | 'lg';
  showTagline?: boolean;
};

export function Wordmark({ size = 'lg', showTagline = true }: Props) {
  const { colors } = useTheme();
  // The kit shipped the template's own lockup ("OPES EMR" / "ELECTRONIC MEDICAL
  // RECORD"). This app keeps the OPES layout but its OWN brand, so the wordmark
  // reads Opes+Care and the tagline comes from the app's strings.
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fontSize = size === 'lg' ? 34 : 24;

  return (
    <View>
      <Text style={styles.row}>
        <Text style={[styles.opes, { fontSize }]}>Opes</Text>
        <Text style={[styles.emr, { fontSize }]}>Care</Text>
      </Text>
      {showTagline && (
        <View style={styles.taglineRow}>
          <View style={styles.taglineLine} />
          <Text style={styles.tagline}>{t('auth.tagline')}</Text>
          <View style={styles.taglineLine} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  row: {
    fontFamily: typography.fontFamily.bold,
  },
  opes: {
    color: colors.navy,
    fontFamily: typography.fontFamily.bold,
  },
  emr: {
    color: colors.blue,
    fontFamily: typography.fontFamily.bold,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  taglineLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  tagline: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    // 1.5 on a 10px face stretched "One Health ID. Connected Care." to 204pt
    // and the words came apart. 0.6 still reads as a spaced sub-brand line.
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
});
