import { Text, View } from 'react-native';
import { HeartPulse } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { colors, elevation, radii, spacing, typography } from '../../theme/tokens';

/** Heartbeat-in-ring mark + "OpesCare" wordmark + tagline — the recurring brand
 * header seen on splash/onboarding/login. `size` scales the ring; wordmark
 * and tagline are hidden via `markOnly` for the splash screen variant.
 *
 * The mark is three concentric layers, matching the spiral-ring reference:
 * a soft gold halo, the gradient ring itself, and a cream disc holding the
 * heartbeat glyph. Everything — ring thickness, wordmark size, tagline size —
 * derives from `size`, so it stays proportional from a 48px inline mark to the
 * 128px splash lockup.
 *
 * @example
 * <Logo />                    // full lockup, default 96px ring
 * <Logo size={80} markOnly /> // mark only, for compact auth headers
 */
export function Logo({ size = 96, markOnly = false }: { size?: number; markOnly?: boolean }) {
  const { t } = useTranslation();

  const halo = size * 1.16;
  const inner = size * 0.7;
  const wordmark = size * 0.3;
  const tagline = Math.max(11, size * 0.135);

  return (
    <View className="items-center">
      {/* Halo — a barely-there gold bloom that lifts the mark off the cream. */}
      <View
        style={{
          width: halo,
          height: halo,
          borderRadius: halo / 2,
          backgroundColor: colors.brand[50],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LinearGradient
          // NativeWind's className does not apply to LinearGradient.
          colors={[colors.brand[300], colors.brand[500], colors.brand[700]]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            ...elevation.brand,
          }}
        >
          <View
            style={{
              width: inner,
              height: inner,
              borderRadius: inner / 2,
              backgroundColor: colors.cream[50],
              alignItems: 'center',
              justifyContent: 'center',
              // Hairline that separates the disc from the ring — without it the
              // two golds bleed into each other at small sizes.
              borderWidth: Math.max(1, size * 0.012),
              borderColor: colors.brand[100],
            }}
          >
            <HeartPulse color={colors.brand[500]} size={inner * 0.5} strokeWidth={2.25} />
          </View>
        </LinearGradient>
      </View>

      {!markOnly && (
        <>
          <View style={{ marginTop: spacing.lg, flexDirection: 'row', alignItems: 'baseline' }}>
            <Text
              style={{
                fontSize: wordmark,
                lineHeight: wordmark * 1.15,
                fontWeight: typography.weight.extrabold,
                letterSpacing: -wordmark * 0.02,
                color: colors.navy.text,
              }}
            >
              Opes
            </Text>
            <Text
              style={{
                fontSize: wordmark,
                lineHeight: wordmark * 1.15,
                fontWeight: typography.weight.extrabold,
                letterSpacing: -wordmark * 0.02,
                color: colors.brand[500],
              }}
            >
              Care
            </Text>
          </View>

          {/* Short gold rule under the wordmark — the reference lockups all
              separate the mark from the tagline this way. */}
          <View
            style={{
              width: size * 0.34,
              height: 2,
              borderRadius: radii.pill,
              backgroundColor: colors.brand[200],
              marginTop: spacing.sm,
            }}
          />

          <Text
            style={{
              marginTop: spacing.sm,
              fontSize: tagline,
              lineHeight: tagline * 1.4,
              fontWeight: typography.weight.medium,
              letterSpacing: typography.tracking.wide,
              color: colors.navy.secondary,
              textAlign: 'center',
            }}
          >
            {t('auth.tagline')}
          </Text>
        </>
      )}
    </View>
  );
}
