/**
 * A list of RESULTS — things a person compares and picks between.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * The kit has one list idiom: a `Card variant="flush"` holding rows divided by
 * hairlines. That idiom is right for a group of SETTINGS or a key/value table,
 * where the rows belong to one another and the hairline is what says so.
 *
 * It is wrong for results. Nine medicines, six blood banks or twelve
 * facilities are not one object with twelve properties — they are twelve
 * separate things, each with its own name, status and action, and the reader's
 * job is to compare them and choose. Joined into a single slab they read as a
 * settings screen: the eye finds no boundary, and the row it is about to tap
 * is not visibly a unit.
 *
 * So: each result gets its own card, and the gap between them is the thing
 * that says "these are separate". Nothing else changes — each row keeps its
 * own padding, because each card here is itself `flush`.
 *
 * ── How to use it ─────────────────────────────────────────────────────────
 *   <ResultList>
 *     {rows.map((row) => (
 *       <Card key={row.id} variant="flush">
 *         <SomeRow row={row} divider={false} onPress={...} />
 *       </Card>
 *     ))}
 *   </ResultList>
 *
 * Note `divider={false}` on every row: the hairline was doing the separating,
 * and the gap does it now. Leaving it on draws a rule along the bottom edge of
 * every card, inside the border, which reads as a mistake.
 *
 * ── When NOT to use it ────────────────────────────────────────────────────
 * Leave `Card variant="flush"` exactly as it is for: settings and preference
 * groups, navigation menus, option pickers, key/value fact tables, timelines
 * and steppers, and log tables. Those rows really are one group, and spacing
 * them apart would break a convention the whole platform follows.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { spacing } from '../theme';

export function ResultList({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
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
