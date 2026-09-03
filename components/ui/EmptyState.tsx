import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Inbox, type LucideIcon } from 'lucide-react-native';
import { colors, radii, sizing, spacing, typography } from '../../theme/tokens';
import { Button } from './Button';
import { toneOf, type Tone } from './tone';

interface EmptyStateProps {
  title: string;
  /** One or two sentences. Say what will appear here, or what to do next. */
  description?: string;
  /** Defaults to `Inbox`. Pick something that names the missing thing. */
  icon?: LucideIcon;
  /**
   * `gold` (default) — nothing here yet, all is well.
   * `danger`         — the request failed. Pair with a "Try again" action.
   * `info` / `success` / `warning` as the situation warrants.
   */
  tone?: Tone;
  /** Primary action. Both `actionLabel` and `onAction` are required to render. */
  actionLabel?: string;
  onAction?: () => void;
  /** Optional outline button under the primary one. */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  /** Tighter spacing + smaller ring, for empties inside a Card rather than a page. */
  compact?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The deliberate version of "there is nothing here".
 *
 * Use this when: a list came back empty, a search found nothing, or a request
 * failed. The demo patient has no labs, prescriptions or documents, so these
 * WILL be on screen — an unstyled "No results" line is the single clearest
 * tell that a screen was not finished.
 *
 * Renders the concentric gold ring from the "You're All Set!" reference, a
 * short gold rule, then the copy and up to two actions.
 *
 * @example
 * <EmptyState icon={FlaskConical} title={t('labs.emptyTitle')}
 *             description={t('labs.emptyBody')}
 *             actionLabel={t('labs.bookTest')} onAction={() => router.push('/appointments/book')} />
 *
 * @example Error
 * <EmptyState tone="danger" icon={CircleAlert} title={t('common.errorTitle')}
 *             description={t('common.errorBody')}
 *             actionLabel={t('common.retry')} onAction={() => query.refetch()} />
 */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  tone = 'gold',
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  compact = false,
  className,
  style,
  testID,
}: EmptyStateProps) {
  const palette = toneOf(tone);
  const ring = compact ? 64 : sizing.avatar.xl;

  return (
    <View
      className={className}
      testID={testID}
      style={[
        {
          alignItems: 'center',
          paddingHorizontal: spacing.xl,
          paddingVertical: compact ? spacing['2xl'] : spacing['5xl'],
        },
        style,
      ]}
    >
      {/* Concentric ring: soft halo, hairline ring, icon. */}
      <View
        style={{
          width: ring,
          height: ring,
          borderRadius: radii.pill,
          backgroundColor: palette.surface,
          borderWidth: compact ? 1.5 : 2,
          borderColor: palette.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon color={palette.fg} size={compact ? 26 : 38} strokeWidth={1.75} />
      </View>

      {!compact ? (
        <View
          style={{
            width: 56,
            height: 3,
            borderRadius: radii.pill,
            backgroundColor: palette.border,
            marginTop: spacing.xl,
          }}
        />
      ) : null}

      <Text
        style={{
          marginTop: compact ? spacing.lg : spacing.xl,
          fontSize: compact ? typography.size.lg : typography.size.xl,
          lineHeight: compact ? typography.lineHeight.lg : typography.lineHeight.xl,
          fontWeight: typography.weight.bold,
          letterSpacing: typography.tracking.tight,
          color: colors.navy.text,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>

      {description ? (
        <Text
          style={{
            marginTop: spacing.sm,
            maxWidth: 320,
            fontSize: typography.size.md,
            lineHeight: typography.lineHeight.md,
            color: colors.navy.secondary,
            textAlign: 'center',
          }}
        >
          {description}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing['2xl'], alignSelf: 'stretch', maxWidth: 340, width: '100%' }}>
          <Button label={actionLabel} onPress={onAction} showChevron={false} />
        </View>
      ) : null}

      {secondaryActionLabel && onSecondaryAction ? (
        <View
          style={{
            marginTop: spacing.md,
            alignSelf: 'stretch',
            maxWidth: 340,
            width: '100%',
          }}
        >
          <Button
            label={secondaryActionLabel}
            onPress={onSecondaryAction}
            variant="outline"
            showChevron={false}
          />
        </View>
      ) : null}
    </View>
  );
}
