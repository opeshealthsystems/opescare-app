import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';
import { ChevronLeft, type LucideIcon } from 'lucide-react-native';
import { colors, radii, sizing, spacing, typography } from '../../theme/tokens';
import { Card } from '../ui/Card';
import { toneOf, type Tone } from '../ui/tone';

/**
 * Shapes shared by the four account-and-support screens — settings, help,
 * notifications and offline access.
 *
 * These are deliberately NOT in `components/ui`: they are compositions of the
 * design-system primitives (`Card`, `ListRow`, `Chip`…) for one cluster of
 * screens, not new primitives. Anything genuinely reusable belongs in
 * `components/ui` instead — see its README.
 */

// ---------------------------------------------------------------------------
// ScreenHeader
// ---------------------------------------------------------------------------

/**
 * The back-and-title row every one of these screens opens with. The reference
 * screens put the screen name at display size on the page (not in a nav bar),
 * with the one page-level action aligned to its right — see
 * `a_bright_clean_white_mobile_app_settings_screen.png` ("Account Settings")
 * and `a_crisp_mobile_app_screenshot_of_a_notification_c.png`
 * ("Notification Center" + "Mark all as read").
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  /** Right-aligned page action, level with the title. */
  action?: ReactNode;
}) {
  return (
    <View style={{ marginTop: spacing.sm }}>
      <Pressable
        onPress={onBack}
        hitSlop={10}
        accessibilityRole="button"
        style={({ pressed }) => ({
          width: sizing.control.md,
          height: sizing.control.md,
          borderRadius: radii.pill,
          borderWidth: 1,
          borderColor: colors.line.default,
          backgroundColor: colors.surface.card,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <ChevronLeft color={colors.brand[600]} size={sizing.icon.lg} />
      </Pressable>

      <View
        style={{
          marginTop: spacing.lg,
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: typography.size['2xl'],
            lineHeight: typography.lineHeight['2xl'],
            fontWeight: typography.weight.extrabold,
            letterSpacing: typography.tracking.tight,
            color: colors.navy.text,
          }}
        >
          {title}
        </Text>
        {action ? <View style={{ marginLeft: spacing.md, paddingTop: 6 }}>{action}</View> : null}
      </View>

      {subtitle ? (
        <Text
          style={{
            marginTop: spacing.xs + 2,
            fontSize: typography.size.md,
            lineHeight: typography.lineHeight.md,
            color: colors.navy.secondary,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// InlineNotice
// ---------------------------------------------------------------------------

/**
 * A tone-coloured message block. Used for every error, caveat and confirmation
 * result on these screens, because `Alert.alert` is a silent no-op on React
 * Native Web — a message the patient must read cannot live in an OS dialog.
 */
export function InlineNotice({
  tone = 'info',
  icon: Icon,
  title,
  body,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  title?: string;
  body: string;
  className?: string;
}) {
  const palette = toneOf(tone);

  return (
    <View
      className={className}
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: spacing.lg,
        borderRadius: radii.card,
        backgroundColor: palette.surface,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      {Icon ? <Icon color={palette.fg} size={sizing.icon.md} style={{ marginTop: 1 }} /> : null}
      <View style={{ flex: 1, marginLeft: Icon ? spacing.md : 0 }}>
        {title ? (
          <Text
            style={{
              fontSize: typography.size.sm,
              lineHeight: typography.lineHeight.sm,
              fontWeight: typography.weight.bold,
              color: palette.fg,
              marginBottom: 2,
            }}
          >
            {title}
          </Text>
        ) : null}
        <Text
          style={{
            fontSize: typography.size.sm,
            lineHeight: typography.lineHeight.sm,
            color: colors.navy.secondary,
          }}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ConfirmPanel
// ---------------------------------------------------------------------------

/**
 * An in-screen destructive confirmation.
 *
 * Replaces `Alert.alert(...)` for anything the patient must be able to refuse:
 * on React Native Web `Alert.alert` does nothing at all, so a confirm built on
 * it silently either never fires or — worse — is skipped entirely. This states
 * the consequence in the page, where it is always visible.
 */
export function ConfirmPanel({
  icon: Icon,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
  tone = 'danger',
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  tone?: Tone;
}) {
  const palette = toneOf(tone);

  return (
    <View
      accessibilityLiveRegion="assertive"
      style={{
        padding: spacing.xl,
        borderRadius: radii.card,
        backgroundColor: palette.surface,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {Icon ? <Icon color={palette.fg} size={sizing.icon.lg} /> : null}
        <Text
          style={{
            marginLeft: Icon ? spacing.sm : 0,
            flex: 1,
            fontSize: typography.size.md,
            lineHeight: typography.lineHeight.md,
            fontWeight: typography.weight.bold,
            color: palette.fg,
          }}
        >
          {title}
        </Text>
      </View>

      <Text
        style={{
          marginTop: spacing.sm,
          fontSize: typography.size.sm,
          lineHeight: typography.lineHeight.sm,
          color: colors.navy.secondary,
        }}
      >
        {body}
      </Text>

      <View style={{ flexDirection: 'row', marginTop: spacing.lg, gap: spacing.md }}>
        <Pressable
          onPress={onCancel}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            height: sizing.control.md,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: colors.line.default,
            backgroundColor: colors.surface.card,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed || busy ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              fontSize: typography.size.sm,
              fontWeight: typography.weight.semibold,
              color: colors.navy.text,
            }}
          >
            {cancelLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={onConfirm}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flex: 1,
            height: sizing.control.md,
            borderRadius: radii.pill,
            backgroundColor: palette.solid,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed || busy ? 0.7 : 1,
          })}
        >
          {busy ? (
            <ActivityIndicator color={palette.onSolid} size="small" />
          ) : (
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.bold,
                color: palette.onSolid,
              }}
            >
              {confirmLabel}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ToggleRow
// ---------------------------------------------------------------------------

/**
 * A preference row whose trailing control is a switch.
 *
 * `value` is `boolean | null`: `null` means the server did not tell us, and the
 * row renders disabled with an explicit "unavailable" note rather than showing
 * a confident OFF. A settings screen that reports a preference is off when it
 * is actually on is worse than one that admits it does not know — this screen
 * has already shipped that bug once.
 */
export function ToggleRow({
  icon: Icon,
  label,
  body,
  value,
  onChange,
  busy = false,
  disabled = false,
  unknownLabel,
  divider = false,
}: {
  icon: LucideIcon;
  label: string;
  body?: string;
  value: boolean | null | undefined;
  onChange: (next: boolean) => void;
  busy?: boolean;
  disabled?: boolean;
  /** Shown in place of `body` when `value` is null/undefined. */
  unknownLabel?: string;
  divider?: boolean;
}) {
  const known = typeof value === 'boolean';
  const isDisabled = disabled || busy || !known;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.md + 2,
        borderBottomWidth: divider ? sizing.hairline : 0,
        borderBottomColor: colors.line.subtle,
        opacity: isDisabled && !busy ? 0.6 : 1,
      }}
    >
      <View
        style={{
          width: sizing.tile.sm,
          height: sizing.tile.sm,
          borderRadius: radii.tile,
          backgroundColor: colors.brand[50],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon color={colors.brand[600]} size={sizing.icon.md} />
      </View>

      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text
          style={{
            fontSize: typography.size.md,
            lineHeight: typography.lineHeight.md,
            fontWeight: typography.weight.semibold,
            color: colors.navy.text,
          }}
        >
          {label}
        </Text>
        {!known && unknownLabel ? (
          <Text
            style={{
              marginTop: 2,
              fontSize: typography.size.sm,
              lineHeight: typography.lineHeight.sm,
              color: colors.semantic.warning,
            }}
          >
            {unknownLabel}
          </Text>
        ) : body ? (
          <Text
            style={{
              marginTop: 2,
              fontSize: typography.size.sm,
              lineHeight: typography.lineHeight.sm,
              color: colors.navy.secondary,
            }}
          >
            {body}
          </Text>
        ) : null}
      </View>

      <View style={{ marginLeft: spacing.md, minWidth: 52, alignItems: 'flex-end' }}>
        {busy ? (
          <ActivityIndicator color={colors.brand[500]} />
        ) : (
          <Switch
            value={known ? value : false}
            onValueChange={onChange}
            disabled={isDisabled}
            accessibilityLabel={label}
            trackColor={{ false: colors.cream[300], true: colors.brand[300] }}
            thumbColor={known && value ? colors.brand[600] : colors.white}
            ios_backgroundColor={colors.cream[300]}
          />
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SegmentedControl
// ---------------------------------------------------------------------------

/**
 * The Light / Dark / System-style segmented picker from the settings
 * reference, used here for the EN / FR language choice.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        padding: 4,
        borderRadius: radii.lg,
        backgroundColor: colors.surface.sunken,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={option.label}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              height: sizing.control.md - 4,
              borderRadius: radii.md,
              backgroundColor: active ? colors.surface.card : 'transparent',
              opacity: pressed ? 0.75 : 1,
              ...(active
                ? {
                    shadowColor: colors.brand[900],
                    shadowOpacity: 0.06,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 1,
                  }
                : null),
            })}
          >
            {option.icon ? (
              <option.icon
                color={active ? colors.brand[600] : colors.navy.muted}
                size={sizing.icon.sm}
                style={{ marginRight: 6 }}
              />
            ) : null}
            <Text
              style={{
                fontSize: typography.size.sm,
                fontWeight: typography.weight.semibold,
                color: active ? colors.brand[600] : colors.navy.secondary,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// GroupCard
// ---------------------------------------------------------------------------

/**
 * A titled group of rows: an overline label sitting on the page background,
 * then one padding-free `Card` holding the rows. This is the settings
 * reference's block anatomy, and keeps every group on one rhythm.
 */
export function GroupCard({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={className}>
      <Text
        style={{
          marginBottom: spacing.md,
          fontSize: typography.size.xs,
          lineHeight: typography.lineHeight.xs,
          fontWeight: typography.weight.bold,
          letterSpacing: typography.tracking.overline,
          textTransform: 'uppercase',
          color: colors.brand[600],
        }}
      >
        {label}
      </Text>
      <Card padding="none" style={{ paddingHorizontal: spacing.lg }}>
        {children}
      </Card>
    </View>
  );
}
