/**
 * A vertical stack of separate cards, with the platform's card rhythm.
 *
 * Two `<Card>`s placed one under the other with nothing between them fuse
 * into one slab ("jointed cards"). Spacing is therefore the stack's job, not
 * each screen's: put sibling cards in a `CardStack` and never hand-tune a
 * `marginTop` on a card.
 *
 *   <CardStack>
 *     <Card variant="flush"><ListRow ... /></Card>
 *     <Card variant="flush"><ListRow ... /></Card>
 *   </CardStack>
 *
 * `ResultList` is the same idea for search results (a tighter 10pt gap).
 * `__tests__/noJointedCards.test.ts` fails the build on adjacent cards that
 * have no stack, no `gap` and no margin between them, and on a card that joins
 * several tappable navigation rows into one slab.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { spacing } from '../theme';

export function CardStack({
  children,
  style,
  spacing: size = 'md',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `md` (16pt, default) between sections; `sm` (12pt) between rows of one group. */
  spacing?: 'sm' | 'md';
}) {
  return <View style={[size === 'sm' ? styles.sm : styles.md, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  md: { gap: spacing.md },
  sm: { gap: spacing.sm + 4 },
});
