import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { colors } from '../../theme/tokens';

/**
 * Shared building blocks for the patient's data-rights surface —
 * app/documents.tsx, app/export-records.tsx and app/privacy/*.
 *
 * These screens are how a patient actually exercises the rights Cameroon Law
 * No. 2010/012 gives them over their record, so they need one calm, consistent
 * voice: same header, same card weight, same way of asking "are you sure?".
 *
 * Two deliberate choices live here:
 *  1. `ConfirmBar` instead of `Alert.alert`. `Alert` is a no-op on React Native
 *     Web, so an Alert-based confirmation silently never fires in a browser —
 *     a destructive action would either do nothing or (worse, if wired the
 *     other way) run unconfirmed. The confirmation is rendered in-screen so it
 *     works identically on every platform and the consequence stays visible
 *     while the patient decides.
 *  2. `InlineNotice` instead of `Alert.alert` for results, for the same reason:
 *     feedback the patient can actually read on every platform.
 */

export type Tone = 'brand' | 'success' | 'danger' | 'warning' | 'info' | 'muted';

interface ToneColors {
  surface: string;
  ink: string;
}

export function toneColors(tone: Tone): ToneColors {
  switch (tone) {
    case 'success':
      return { surface: colors.semantic.successSurface, ink: colors.semantic.success };
    case 'danger':
      return { surface: colors.semantic.dangerSurface, ink: colors.semantic.danger };
    case 'warning':
      return { surface: colors.semantic.warningSurface, ink: colors.semantic.warning };
    case 'info':
      return { surface: colors.semantic.infoSurface, ink: colors.semantic.info };
    case 'muted':
      return { surface: colors.cream[200], ink: colors.navy.secondary };
    case 'brand':
    default:
      return { surface: colors.brand[50], ink: colors.brand[600] };
  }
}

/** Soft elevation shared by every white card, matching the home dashboard. */
export const CARD_SHADOW: ViewStyle = {
  shadowColor: colors.navy.text,
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
};

/** Back chip + title + optional subtitle, identical on all five screens. */
export function RightsHeader({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
}) {
  const router = useRouter();
  return (
    <View className="mt-2">
      <View className="flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={title}
          className="h-11 w-11 items-center justify-center rounded-full border border-brand-300"
        >
          <ArrowLeft size={18} color={colors.brand[600]} />
        </Pressable>
        <Text className="ml-3 flex-1 text-[22px] font-extrabold leading-7 text-navy-text">
          {title}
        </Text>
        {Icon ? (
          <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-50">
            <Icon size={20} color={colors.brand[600]} />
          </View>
        ) : null}
      </View>
      {subtitle ? (
        <Text className="mt-3 text-[13px] leading-5 text-navy-secondary">{subtitle}</Text>
      ) : null}
    </View>
  );
}

/** Tinted banner used for reassurance, results and legal context. */
export function InlineNotice({
  tone = 'brand',
  icon: Icon,
  title,
  body,
}: {
  tone?: Tone;
  icon: LucideIcon;
  title?: string;
  body: string;
}) {
  const { surface, ink } = toneColors(tone);
  return (
    <View className="flex-row items-start rounded-2xl p-4" style={{ backgroundColor: surface }}>
      <Icon size={17} color={ink} style={{ marginTop: 1 }} />
      <View className="ml-3 flex-1">
        {title ? (
          <Text className="text-[13px] font-bold" style={{ color: ink }}>
            {title}
          </Text>
        ) : null}
        <Text
          className={`text-[12px] leading-[18px] text-navy-secondary ${title ? 'mt-1' : ''}`}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}

/**
 * In-screen confirmation for a consequential action. Renders the consequence
 * in full, then two clearly-labelled choices — the safe one first, and never
 * pre-selected or styled to be the obvious tap.
 */
export function ConfirmBar({
  message,
  cancelLabel,
  confirmLabel,
  tone = 'danger',
  loading = false,
  onCancel,
  onConfirm,
}: {
  message: string;
  cancelLabel: string;
  confirmLabel: string;
  tone?: Tone;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { surface, ink } = toneColors(tone);
  return (
    <View className="mt-4 rounded-2xl p-4" style={{ backgroundColor: surface }}>
      <Text className="text-[13px] leading-5 text-navy-text">{message}</Text>
      <View className="mt-3 flex-row" style={{ gap: 10 }}>
        <Pressable
          onPress={onCancel}
          disabled={loading}
          accessibilityRole="button"
          className="flex-1 items-center justify-center rounded-xl bg-white py-3"
          style={{ borderWidth: 1, borderColor: colors.cream[300] }}
        >
          <Text className="text-[13px] font-bold text-navy-text">{cancelLabel}</Text>
        </Pressable>
        <Pressable
          onPress={onConfirm}
          disabled={loading}
          accessibilityRole="button"
          className="flex-1 items-center justify-center rounded-xl py-3"
          style={{ backgroundColor: ink, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text className="text-[13px] font-bold text-white">{confirmLabel}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/** Small rounded label — data scopes, categories, statuses. */
export function Chip({
  label,
  tone = 'muted',
  icon: Icon,
}: {
  label: string;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  const { surface, ink } = toneColors(tone);
  return (
    <View
      className="flex-row items-center self-start rounded-full px-2.5 py-1"
      style={{ backgroundColor: surface }}
    >
      {Icon ? <Icon size={11} color={ink} style={{ marginRight: 4 }} /> : null}
      <Text className="text-[11px] font-bold" style={{ color: ink }}>
        {label}
      </Text>
    </View>
  );
}

/** Selectable pill used for filters and type pickers. */
export function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="rounded-full border px-4 py-2"
      style={{
        borderColor: selected ? colors.brand[500] : colors.cream[300],
        backgroundColor: selected ? colors.brand[500] : colors.white,
      }}
    >
      <Text
        className="text-[12px] font-semibold"
        style={{ color: selected ? colors.white : colors.navy.secondary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionTitle({
  label,
  count,
  hint,
}: {
  label: string;
  count?: number;
  hint?: string;
}) {
  return (
    <View className="mb-3 mt-7">
      <View className="flex-row items-center">
        <Text className="text-[15px] font-extrabold text-navy-text">{label}</Text>
        {typeof count === 'number' && count > 0 ? (
          <View className="ml-2 rounded-full bg-brand-100 px-2 py-0.5">
            <Text className="text-[11px] font-bold text-brand-600">{count}</Text>
          </View>
        ) : null}
      </View>
      {hint ? <Text className="mt-1 text-[12px] text-navy-muted">{hint}</Text> : null}
    </View>
  );
}

/**
 * Empty states on this surface are usually *good* news (no pending requests,
 * nobody outside your care team has opened your record), so they are built to
 * read as a settled state, not a failure: a gold medallion, a plain-language
 * headline, and an optional next step.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
  tone = 'brand',
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: Tone;
}) {
  const { surface, ink } = toneColors(tone);
  return (
    <View className="items-center rounded-2xl bg-white px-6 py-9" style={CARD_SHADOW}>
      <View
        className="h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: surface }}
      >
        <Icon size={26} color={ink} />
      </View>
      <Text className="mt-4 text-center text-[15px] font-extrabold text-navy-text">{title}</Text>
      <Text className="mt-1.5 max-w-[280px] text-center text-[13px] leading-5 text-navy-secondary">
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          className="mt-5 flex-row items-center rounded-full border border-brand-500 px-5 py-2.5"
        >
          <Text className="text-[13px] font-bold text-brand-600">{actionLabel}</Text>
          <ChevronRight size={15} color={colors.brand[600]} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Full-width white card row that navigates somewhere. */
export function NavRow({
  icon: Icon,
  title,
  description,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center rounded-2xl bg-white p-4"
      style={CARD_SHADOW}
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-100">
        <Icon size={18} color={colors.brand[600]} />
      </View>
      <View className="ml-3 flex-1">
        <Text className="text-[14px] font-bold text-navy-text">{title}</Text>
        <Text className="mt-0.5 text-[12px] leading-[17px] text-navy-secondary">{description}</Text>
      </View>
      <ChevronRight size={18} color={colors.navy.muted} />
    </Pressable>
  );
}

/** Turns an API slug (`patient_request`, `clinical_summary`) into readable text
 * when no translation exists for it — the backend allows free-form scope and
 * purpose strings, so a fallback is required rather than optional. */
export function humanizeSlug(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}
