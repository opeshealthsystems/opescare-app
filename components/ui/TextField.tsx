import { useState, type ReactNode } from 'react';
import { Text, TextInput, View, Pressable, type TextInputProps } from 'react-native';
import { CircleAlert, Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { colors, sizing, spacing, typography } from '../../theme/tokens';

interface TextFieldProps extends TextInputProps {
  label?: string;
  icon?: LucideIcon;
  error?: string;
  secureToggle?: boolean;
  /** Added, optional. Helper line under the field, hidden while `error` is set. */
  hint?: string;
  /** Added, optional. Appends a gold asterisk to the label. */
  required?: boolean;
  /** Added, optional. Node pinned to the right inside the field — a unit, a
   *  "Verify" link, a country-code picker. Renders before the secure toggle. */
  rightAdornment?: ReactNode;
  /** Added, optional. Classes for the outer wrapper (defaults to `mb-4`). */
  containerClassName?: string;
}

/** Bordered input matching the login/onboarding reference: gold-tinted border,
 * rounded corners, optional leading icon, optional password-visibility toggle.
 *
 * Use this when: you need any single-line text entry. Focus lifts the border to
 * brand gold with a soft ring and tints the leading icon, so the active field is
 * unmistakable — the previous static border made a focused form look inert.
 *
 * @example
 * <TextField label={t('auth.email')} icon={Mail} required
 *            keyboardType="email-address" autoCapitalize="none"
 *            value={email} onChangeText={setEmail} error={errors.email} />
 */
export function TextField({
  label,
  icon: Icon,
  error,
  secureToggle,
  secureTextEntry,
  hint,
  required,
  rightAdornment,
  containerClassName,
  onFocus,
  onBlur,
  editable,
  ...props
}: TextFieldProps) {
  const [hidden, setHidden] = useState(!!secureTextEntry);
  const [focused, setFocused] = useState(false);

  const isDisabled = editable === false;
  const borderColor = error
    ? colors.semantic.danger
    : focused
      ? colors.brand[500]
      : colors.cream[300];

  // Derive the handler types from TextInputProps — RN 0.86 narrowed these to
  // FocusEvent/BlurEvent, so hardcoding NativeSyntheticEvent no longer compiles.
  const handleFocus: NonNullable<TextInputProps['onFocus']> = (e) => {
    setFocused(true);
    onFocus?.(e);
  };

  const handleBlur: NonNullable<TextInputProps['onBlur']> = (e) => {
    setFocused(false);
    onBlur?.(e);
  };

  return (
    <View className={containerClassName ?? 'mb-4'}>
      {label ? (
        <View className="mb-2 flex-row items-center">
          <Text
            style={{
              fontSize: typography.size.sm,
              lineHeight: typography.lineHeight.sm,
              fontWeight: typography.weight.semibold,
              color: colors.navy.text,
            }}
          >
            {label}
          </Text>
          {required ? (
            <Text
              style={{
                marginLeft: 3,
                fontSize: typography.size.sm,
                lineHeight: typography.lineHeight.sm,
                fontWeight: typography.weight.bold,
                color: colors.brand[500],
              }}
            >
              *
            </Text>
          ) : null}
        </View>
      ) : null}

      <View
        className="h-14 flex-row items-center rounded-2xl bg-white px-4"
        style={{
          borderColor,
          // 1.5px on focus/error so the state change is legible at a glance.
          borderWidth: focused || error ? 1.5 : 1,
          backgroundColor: isDisabled ? colors.cream[100] : colors.surface.card,
          // A soft ring instead of a hard glow — matches the reference inputs.
          shadowColor: error ? colors.semantic.danger : colors.brand[500],
          shadowOpacity: focused || error ? 0.16 : 0,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
          elevation: 0,
        }}
      >
        {Icon ? (
          <Icon
            size={sizing.icon.md}
            color={error ? colors.semantic.danger : focused ? colors.brand[500] : colors.navy.muted}
            style={{ marginRight: spacing.sm }}
          />
        ) : null}

        <TextInput
          className="flex-1 text-base text-navy-text"
          placeholderTextColor={colors.navy.muted}
          secureTextEntry={secureToggle ? hidden : secureTextEntry}
          onFocus={handleFocus}
          onBlur={handleBlur}
          editable={editable}
          {...props}
        />

        {rightAdornment ? (
          <View style={{ marginLeft: spacing.sm }}>{rightAdornment}</View>
        ) : null}

        {secureToggle ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={8}
            accessibilityRole="button"
            style={{ marginLeft: spacing.sm }}
          >
            {hidden ? (
              <EyeOff size={sizing.icon.md} color={colors.navy.muted} />
            ) : (
              <Eye size={sizing.icon.md} color={colors.brand[500]} />
            )}
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View className="mt-1.5 flex-row items-center">
          <CircleAlert size={sizing.icon.xs} color={colors.semantic.danger} />
          <Text
            style={{
              marginLeft: 4,
              flex: 1,
              fontSize: typography.size.xs,
              lineHeight: typography.lineHeight.xs,
              color: colors.semantic.danger,
            }}
          >
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text
          style={{
            marginTop: spacing.xs + 2,
            fontSize: typography.size.xs,
            lineHeight: typography.lineHeight.xs,
            color: colors.navy.muted,
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
