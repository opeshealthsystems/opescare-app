import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { typography, type Palette } from '../theme';
import { useTheme } from '../ThemeProvider';

export type Step = {
  key: string;
  label: string;
};

type Props = {
  steps: Step[];
  currentIndex: number;
  /**
   * The whole strip spoken as one sentence, e.g. "Step 2 of 4: Choose a time".
   * Built by the caller because only the caller has `t`.
   */
  accessibilityLabel?: string;
};

function CheckIcon() {
  const { colors } = useTheme();
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M4 12l6 6L20 6" stroke={colors.textOnBrand} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function StepProgress({ steps, currentIndex, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    // Read as one element. Left as ten separate nodes this strip is ten swipes
    // of bare digits and half-words before the patient reaches the form.
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={
        accessibilityLabel ??
        `${currentIndex + 1}/${steps.length} — ${steps[currentIndex]?.label ?? ''}`
      }
      accessibilityValue={{ min: 1, max: steps.length, now: currentIndex + 1 }}
    >
      {steps.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isLast = index === steps.length - 1;

        return (
          <React.Fragment key={step.key}>
            <View style={styles.stepCol}>
              <View
                style={[
                  styles.circle,
                  isCurrent && styles.circleCurrent,
                  isDone && styles.circleDone,
                ]}
              >
                {isDone ? <CheckIcon /> : <Text style={[styles.circleText, isCurrent && styles.circleTextCurrent]}>{index + 1}</Text>}
              </View>
              <Text style={[styles.label, isCurrent && styles.labelCurrent]} numberOfLines={2}>
                {step.label}
              </Text>
            </View>
            {!isLast && <View style={[styles.connector, isDone && styles.connectorDone]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const CIRCLE = 44;

const makeStyles = (colors: Palette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  stepCol: {
    alignItems: 'center',
    width: 76,
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleCurrent: {
    borderColor: colors.blue,
    backgroundColor: colors.blue,
  },
  circleDone: {
    borderColor: colors.blue,
    backgroundColor: colors.blue,
  },
  circleText: {
    fontFamily: typography.fontFamily.semiBold,
    color: colors.textMuted,
  },
  circleTextCurrent: {
    color: colors.textOnBrand,
  },
  label: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: typography.fontFamily.medium,
    // 10, not 11: a 76pt column broke FR "Établissement" into "Établissemen / t".
    fontSize: 10,
    letterSpacing: -0.1,
    color: colors.textMuted,
  },
  labelCurrent: {
    color: colors.blue,
  },
  connector: {
    height: 1.5,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: CIRCLE / 2,
    marginHorizontal: -8,
  },
  connectorDone: {
    backgroundColor: colors.blue,
  },
});
