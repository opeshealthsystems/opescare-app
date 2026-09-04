import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { typography, type Palette } from '../theme';
import { useTheme } from '../ThemeProvider';

type Props = {
  size?: 'md' | 'lg';
  showTagline?: boolean;
};

export function Wordmark({ size = 'lg', showTagline = true }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fontSize = size === 'lg' ? 34 : 24;

  return (
    <View>
      <Text style={styles.row}>
        <Text style={[styles.opes, { fontSize }]}>OPES </Text>
        <Text style={[styles.emr, { fontSize }]}>EMR</Text>
      </Text>
      {showTagline && (
        <View style={styles.taglineRow}>
          <View style={styles.taglineLine} />
          <Text style={styles.tagline}>ELECTRONIC MEDICAL RECORD</Text>
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
    letterSpacing: 1.5,
    color: colors.textSecondary,
  },
});
