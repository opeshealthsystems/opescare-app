/**
 * A list of separate cards � the default (and only) way to show a list.
 *
 * Owner's rule (2026-10-19): nothing in the app is "jointed". No two rows or
 * items ever share one card behind hairline dividers � not results, not
 * settings, not key/value facts, not logs. Each item is its own card and the
 * gap between cards is what separates them. This replaces the older note that
 * kept settings groups, fact tables and logs as one flush card.
 *
 *   <ResultList>
 *     {rows.map((row) => (
 *       <Card key={row.id} variant="flush">
 *         <SomeRow row={row} onPress={...} />
 *       </Card>
 *     ))}
 *   </ResultList>
 *
 * Rows never carry `divider`: the gap does the separating, and a hairline
 * inside a lone card reads as a mistake. `CardStack spacing="sm"` is the same
 * idea for any other dense list. `__tests__/noJointedCards.test.ts` enforces
 * all of this.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { spacing } from '../theme';

export function ResultList({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.list, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  /**
   * 10pt. Wide enough that each card is plainly its own object at a glance,
   * tight enough that a screenful still reads as one list rather than a
   * scattering of unrelated panels.
   */
  list: { gap: spacing.sm + 2 },
});
