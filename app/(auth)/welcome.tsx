import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, ShieldLock, UserRound, type LucideIcon } from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { Logo } from '../../components/ui/Logo';
import { MedicalWatermark } from '../../components/auth/MedicalWatermark';
import { colors } from '../../theme/tokens';

const GUTTER = 24;
/** Width of the hero panel that bleeds off the right edge. Its gradient starts
 * on the page background colour so the left edge feathers into the headline
 * column instead of showing a hard seam — the same soft overlap the reference
 * photograph has. */
const HERO_PANEL_WIDTH = 208;
const HERO_MIN_HEIGHT = 248;
/** Height of the gold sweep that clips the bottom of the hero. */
const CURVE_HEIGHT = 58;

/**
 * Stand-in for the reference's family photograph. No brand photography asset
 * ships with the app yet (`assets/` holds only launcher icons), so rather than
 * leaving the hero blank this renders the brand's concentric-ring motif with a
 * three-person cluster — one household, one shared record. Swap the whole
 * component for an <Image> once real photography exists.
 */
function HeroPortrait() {
  const { t } = useTranslation();

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('auth.familyIllustrationAlt')}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: HERO_PANEL_WIDTH,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        // className has no effect on LinearGradient (no cssInterop is
        // registered for it), so every value here must be an inline style.
        colors={[colors.cream[100], colors.cream[200], colors.brand[100]]}
        start={{ x: 0, y: 0.15 }}
        end={{ x: 0.95, y: 1 }}
        locations={[0, 0.35, 1]}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 34 }}
      >
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              width: 176,
              height: 176,
              borderRadius: 88,
              borderWidth: 1,
              borderColor: colors.brand[300],
              opacity: 0.45,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: 132,
              height: 132,
              borderRadius: 66,
              borderWidth: 1,
              borderColor: colors.brand[300],
              opacity: 0.65,
            }}
          />

          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <Avatar size={50} tint={colors.brand[300]} glyph={20} style={{ marginRight: -12 }} />
            <Avatar size={40} tint={colors.brand[600]} glyph={17} style={{ zIndex: 3 }} />
            <Avatar
              size={56}
              tint={colors.brand[500]}
              glyph={22}
              style={{ marginLeft: -12, marginBottom: 12 }}
            />
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

function Avatar({
  size,
  tint,
  glyph,
  style,
}: {
  size: number;
  tint: string;
  glyph: number;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tint,
          borderWidth: 3,
          borderColor: colors.cream[50],
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <UserRound size={glyph} color={colors.white} strokeWidth={2.25} />
    </View>
  );
}

/**
 * The gold arc sweeping under the hero. The filled half is painted in the page
 * background colour so it visually crops the bottom of the hero panel, exactly
 * as the reference's curve crops the photograph.
 */
function HeroCurve() {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: CURVE_HEIGHT }}
    >
      <Svg width="100%" height={CURVE_HEIGHT} viewBox="0 0 400 58" preserveAspectRatio="none">
        <Path d="M0 12 C 128 54, 286 58, 400 24 L400 58 L0 58 Z" fill={colors.cream[100]} />
        <Path
          d="M0 12 C 128 54, 286 58, 400 24"
          stroke={colors.brand[300]}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

/** Outline CTA: leading glyph, optically centred label, trailing chevron —
 * mirrors the "I already have an account" row in the reference. The shared
 * Button's outline variant centres the label with no icon affordances, so this
 * lays out locally rather than stacking absolutely-positioned icons on top. */
function OutlineNavButton({
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
      accessibilityLabel={label}
      className="h-14 flex-row items-center rounded-2xl border border-brand-500 px-4"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Icon size={20} color={colors.brand[600]} />
      <Text
        className="flex-1 text-center text-base font-semibold text-brand-600"
        numberOfLines={1}
      >
        {label}
      </Text>
      <ChevronRight size={20} color={colors.brand[600]} />
    </Pressable>
  );
}

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen>
      <MedicalWatermark />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'space-between',
          paddingTop: 12,
          paddingBottom: 20,
        }}
      >
        <View className="items-center">
          <Logo size={112} />
        </View>

        {/* Escapes the Screen's 24pt gutter so the hero panel and the gold
         * sweep both bleed to the physical screen edges, as in the reference. */}
        <View
          style={{
            minHeight: HERO_MIN_HEIGHT,
            justifyContent: 'center',
            marginTop: 20,
            marginHorizontal: -GUTTER,
          }}
        >
          <HeroPortrait />

          <View
            style={{
              paddingLeft: GUTTER,
              paddingRight: HERO_PANEL_WIDTH - 60,
              paddingBottom: CURVE_HEIGHT - 18,
              zIndex: 2,
            }}
          >
            <Text
              className="font-extrabold text-navy-text"
              style={{ fontSize: 26, lineHeight: 33 }}
            >
              {t('auth.welcomeHeadline1')}
            </Text>
            <Text
              className="font-extrabold text-navy-text"
              style={{ fontSize: 26, lineHeight: 33 }}
            >
              {t('auth.welcomeHeadline2')}
            </Text>
            <Text
              className="font-extrabold text-brand-500"
              style={{ fontSize: 26, lineHeight: 33 }}
            >
              {t('auth.welcomeHeadline3')}
            </Text>

            <View className="my-4 h-1 w-14 rounded-full bg-brand-500" />

            <Text
              className="text-navy-secondary"
              style={{ fontSize: 15, lineHeight: 23 }}
            >
              {t('auth.welcomeBody')}
            </Text>
          </View>

          <HeroCurve />
        </View>

        <View className="pt-6">
          <Button label={t('auth.getStarted')} onPress={() => router.push('/(auth)/signup')} />
          <View className="h-3" />
          <OutlineNavButton
            label={t('auth.haveAccount')}
            icon={UserRound}
            onPress={() => router.push('/(auth)/login')}
          />

          <View className="mt-6 flex-row items-start justify-center">
            <ShieldLock size={18} color={colors.brand[600]} style={{ marginTop: 1 }} />
            <Text
              className="ml-2 text-navy-secondary"
              style={{ fontSize: 12, lineHeight: 18, maxWidth: 250 }}
            >
              {t('auth.securityNote')}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
