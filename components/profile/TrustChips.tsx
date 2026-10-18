import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Card, Icon, spacing, useTheme, type IconName } from '@/components/opes-ui';
import { useProfileStyles } from './styles';

export type TrustChip = { key: string; icon: IconName; label: string };

/**
 * The trust strip under the identity card. Four cells need ~70pt each:
 * "Interoperable" is 71pt of 10pt text and a 320pt screen leaves 60pt of
 * cell. Below that it becomes a 2x2 and the vertical rules go, because a rule
 * between wrapped cells divides nothing.
 */
export function TrustChips({ items }: { items: TrustChip[] }) {
  const { colors } = useTheme();
  const styles = useProfileStyles();
  const { width: windowWidth } = useWindowDimensions();
  const trustCols = (windowWidth - spacing.md * 4) / 4 >= 70 ? 4 : 2;
  return (
    <Card style={styles.trust}>
      {items.map((item, index) => (
        <React.Fragment key={item.key}>
          {/* A rule only between cells that actually sit side by side. */}
          {index > 0 && trustCols === 4 ? <View style={styles.trustRule} /> : null}
          <View style={[styles.trustCell, trustCols === 2 && styles.trustCellHalf]}>
            <Icon name={item.icon} size={19} color={colors.blue} />
            <Text style={styles.trustText} numberOfLines={2}>
              {item.label}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </Card>
  );
}
