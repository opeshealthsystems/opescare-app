import { Pressable, Text, View } from 'react-native';
import { ArrowLeft, type LucideIcon } from 'lucide-react-native';
import { colors } from '../../theme/tokens';

/**
 * Shared primitives for the clinical read-only screens (referrals, care plans,
 * clinician profile). These live here rather than in `components/ui/` because
 * they encode a domain treatment — status tone, "how this works" explainers —
 * that only the clinical screens need.
 *
 * The visual language is taken from the reference set: white `rounded-2xl`
 * cards on cream, a tinted rounded-square icon tile leading every row, a tinted
 * status pill trailing it, and a tinted callout band for guidance copy.
 */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export const TONE: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: colors.semantic.successSurface, fg: colors.semantic.success },
  warning: { bg: colors.semantic.warningSurface, fg: colors.semantic.warning },
  danger: { bg: colors.semantic.dangerSurface, fg: colors.semantic.danger },
  info: { bg: colors.semantic.infoSurface, fg: colors.semantic.info },
  neutral: { bg: colors.cream[200], fg: colors.navy.secondary },
};

/** Back arrow + title (+ optional subtitle), consistent across all three screens. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  trailingIcon: TrailingIcon,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  trailingIcon?: LucideIcon;
}) {
  return (
    <View className="flex-row items-center px-6 pt-2">
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        className="h-11 w-11 items-center justify-center rounded-full border border-brand-300"
      >
        <ArrowLeft size={18} color={colors.brand[600]} />
      </Pressable>
      <View className="ml-4 flex-1">
        <Text className="text-xl font-extrabold text-navy-text" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-sm text-navy-secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {TrailingIcon ? (
        <View className="ml-3 h-11 w-11 items-center justify-center rounded-full bg-brand-50">
          <TrailingIcon size={19} color={colors.brand[600]} />
        </View>
      ) : null}
    </View>
  );
}

/** Small tinted capsule used for every status / urgency value. */
export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const c = TONE[tone];
  return (
    <View className="rounded-full px-3 py-1" style={{ backgroundColor: c.bg }}>
      <Text className="text-[11px] font-bold" style={{ color: c.fg }}>
        {label}
      </Text>
    </View>
  );
}

/** Rounded-square tinted icon tile that leads a list row (see Health Goals ref). */
export function IconTile({
  icon: Icon,
  tone = 'neutral',
  size = 38,
}: {
  icon: LucideIcon;
  tone?: Tone | 'gold';
  size?: number;
}) {
  const palette =
    tone === 'gold' ? { bg: colors.brand[50], fg: colors.brand[600] } : TONE[tone];
  return (
    <View
      className="items-center justify-center rounded-xl"
      style={{ width: size, height: size, backgroundColor: palette.bg }}
    >
      <Icon size={Math.round(size * 0.47)} color={palette.fg} />
    </View>
  );
}

/** Bold section label with an optional muted sub-line. */
export function SectionLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <View className="mb-2 mt-7">
      <Text className="text-sm font-bold text-navy-text">{title}</Text>
      {hint ? <Text className="mt-0.5 text-xs text-navy-muted">{hint}</Text> : null}
    </View>
  );
}

/** Icon + text metadata line (Building2 + facility, MapPin + city, …). */
export function MetaRow({
  icon: Icon,
  children,
  tint = colors.navy.muted,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  tint?: string;
}) {
  return (
    <View className="mt-1.5 flex-row items-center">
      <Icon size={13} color={tint} />
      <Text className="ml-2 flex-1 text-xs text-navy-secondary" numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

/**
 * Numbered "how this works" explainer.
 *
 * This is the load-bearing part of the referral / care-plan empty states: both
 * lists are populated exclusively by clinicians, so a patient who has none has
 * done nothing wrong and has no action to take. Rather than a dead "nothing
 * here", the screen explains who creates the record and what will appear.
 */
export function ExplainerSteps({
  steps,
}: {
  steps: { icon: LucideIcon; title: string; body: string }[];
}) {
  return (
    <View className="rounded-2xl bg-white p-4">
      {steps.map((step, index) => (
        <View key={step.title} className="flex-row">
          {/* Rail: numbered node + connector down to the next step. */}
          <View className="items-center" style={{ width: 30 }}>
            <View
              className="h-7 w-7 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.brand[50] }}
            >
              <Text className="text-[11px] font-extrabold text-brand-600">{index + 1}</Text>
            </View>
            {index < steps.length - 1 ? (
              <View
                className="my-1 flex-1"
                style={{ width: 2, backgroundColor: colors.cream[300] }}
              />
            ) : null}
          </View>
          <View className="ml-3 flex-1" style={{ paddingBottom: index < steps.length - 1 ? 18 : 0 }}>
            <View className="flex-row items-center">
              <step.icon size={14} color={colors.navy.text} />
              <Text className="ml-2 flex-1 text-sm font-bold text-navy-text">{step.title}</Text>
            </View>
            <Text className="mt-1 text-xs leading-5 text-navy-secondary">{step.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Tinted guidance band — the "Tip" callout treatment from the reference set. */
export function Callout({
  icon: Icon,
  title,
  body,
  tone = 'info',
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  tone?: Tone;
}) {
  const c = TONE[tone];
  return (
    // No outer margin — the caller owns spacing, so this sits correctly both
    // directly under a SectionLabel and at the foot of an empty state.
    <View className="flex-row items-start rounded-2xl p-4" style={{ backgroundColor: c.bg }}>
      <Icon size={18} color={c.fg} />
      <View className="ml-3 flex-1">
        <Text className="text-sm font-bold text-navy-text">{title}</Text>
        <Text className="mt-1 text-xs leading-5 text-navy-secondary">{body}</Text>
      </View>
    </View>
  );
}

/** Centred medallion + title + body — the head of every empty / error state. */
export function StateHeading({
  icon: Icon,
  title,
  body,
  tone = 'gold',
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  tone?: Tone | 'gold';
}) {
  const palette =
    tone === 'gold' ? { bg: colors.brand[50], fg: colors.brand[600] } : TONE[tone];
  return (
    <View className="items-center">
      <View
        className="h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: palette.bg }}
      >
        <Icon size={32} color={palette.fg} />
      </View>
      <Text className="mt-4 text-center text-lg font-extrabold text-navy-text">{title}</Text>
      <Text className="mt-1.5 text-center text-sm leading-6 text-navy-secondary">{body}</Text>
    </View>
  );
}

/** Secondary pressable used inside empty/error states. */
export function GhostButton({
  label,
  icon: Icon,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center justify-center rounded-2xl border px-5 py-3.5"
      style={{ borderColor: colors.brand[500] }}
    >
      <Icon size={16} color={colors.brand[600]} />
      <Text className="ml-2 text-sm font-bold text-brand-600">{label}</Text>
    </Pressable>
  );
}
