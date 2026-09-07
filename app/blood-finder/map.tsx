import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  ScreenHeader,
  SectionHeader,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import { useBloodGroupMatrix } from '@/lib/api/bloodBankQueries';
import type { BloodComponentValue, BloodGroupValue } from '@/lib/api/queries';

/**
 * Blood Availability Map (SB-05).
 *
 * ── The grid is the point ─────────────────────────────────────────────────
 * The reference's value is not the map — the finder already has one — it is
 * the little per-GROUP grid on each blood bank: how much of O+, A+, B+ and AB+
 * each one reports, side by side, so somebody can see at a glance where to go
 * for a group that is scarce.
 *
 * That is one search per group for the whole page (useBloodGroupMatrix), keyed
 * exactly as the finder's own searches so anything already fetched is free.
 *
 * ── The legend has four states, not three ─────────────────────────────────
 * The reference's legend reads Good / Limited / Low / Unknown, and the fourth
 * is the one that must not be dropped. A facility that has published nothing
 * for a group has NOT reported zero — the search only ever returns rows a
 * facility actually published. So an unreported group is grey and reads "—",
 * never a red 0. On a screen whose whole job is "where should I drive to",
 * inventing a zero is the most dangerous thing it could do.
 */

const GROUPS: readonly BloodGroupValue[] = [
  'O+',
  'O-',
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
] as const;

/** The four the reference puts in its grid, in its order. */
const GRID_GROUPS: readonly BloodGroupValue[] = ['O+', 'A+', 'B+', 'AB+'] as const;

const CITIES = [
  { key: 'douala', name: 'Douala', lat: 4.0511, lng: 9.7679 },
  { key: 'yaounde', name: 'Yaounde', lat: 3.848, lng: 11.5021 },
] as const;

const RADII = [25, 50, 100] as const;

function dial(number: string | null | undefined): void {
  if (!number) return;
  void Linking.openURL(`tel:${number.replace(/\s+/g, '')}`);
}

export default function BloodMapScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [city, setCity] = useState<(typeof CITIES)[number]>(CITIES[0]);
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [component] = useState<BloodComponentValue>('whole_blood');

  const matrix = useBloodGroupMatrix({
    groups: GROUPS,
    componentType: component,
    lat: city.lat,
    lng: city.lng,
    radiusKm,
  });

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blood-finder'));

  const facilities = matrix.facilities;
  const mappable = facilities.filter((row) => row.latitude != null && row.longitude != null);

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('bloodMap.title')}
        subtitle={t('bloodMap.subtitle')}
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <NoticeBanner
          icon="info"
          tone="pending"
          title={t('bloodMap.realtimeTitle')}
          message={t('bloodMap.realtimeBody')}
        />

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <Card>
          <Text style={styles.fieldLabel}>{t('bloodFinder.stepWhere')}</Text>
          <View style={styles.chipWrap}>
            {CITIES.map((option) => (
              <Chip
                key={option.key}
                icon="location"
                label={option.name}
                selected={option.key === city.key}
                onPress={() => setCity(option)}
              />
            ))}
          </View>

          <Text style={[styles.fieldLabel, styles.spacer]}>{t('bloodFinder.stepRange')}</Text>
          <View style={styles.chipWrap}>
            {RADII.map((option) => (
              <Chip
                key={option}
                icon="target"
                label={t('bloodFinder.radius', { km: option })}
                selected={option === radiusKm}
                onPress={() => setRadiusKm(option)}
              />
            ))}
          </View>
        </Card>

        {/* ── The map ──────────────────────────────────────────────────────── */}
        {matrix.isPending ? (
          <LoadingBlock label={t('bloodFinder.searching')} />
        ) : mappable.length > 0 ? (
          <Card variant="flush">
            <FacilityMap facilities={mappable} height={260} />
          </Card>
        ) : null}

        {/* ── Legend ───────────────────────────────────────────────────────── */}
        <Card variant="flush">
          <View style={styles.legend}>
            {(
              [
                ['reported', colors.statusNormal],
                ['unknown', colors.textMuted],
              ] as const
            ).map(([key, tone]) => (
              <View key={key} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: tone }]} />
                <Text style={styles.legendText}>{t(`bloodMap.legend.${key}`)}</Text>
              </View>
            ))}
          </View>
          {/*
            The reference's legend has Good / Limited / Low bands. This
            platform's stock rows carry a RANGE ("20+", "5-10"), not a number,
            so banding them would mean inventing thresholds nobody published.
            Two honest states: reported, and not reported.
          */}
          <Text style={styles.legendNote}>{t('bloodMap.legendNote')}</Text>
        </Card>

        {/* ── The banks, with their grids ──────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader
            title={
              matrix.isPending
                ? t('bloodFinder.searching')
                : t('bloodMap.found', { count: facilities.length })
            }
          />

          {matrix.isPending ? null : facilities.length === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="droplet"
                tint="red"
                title={t('bloodMap.emptyTitle')}
                message={t('bloodMap.emptyBody')}
                actionLabel={t('bloodMap.widen')}
                onAction={() => setRadiusKm((r) => (r === 25 ? 50 : 100))}
              />
            </Card>
          ) : (
            facilities.map((facility) => {
              const grid = matrix
                .forFacility(facility.id)
                .filter((cell) => GRID_GROUPS.includes(cell.group));

              return (
                <Card key={facility.id} variant="flush">
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: '/blood-finder/bank',
                        params: {
                          facilityId: facility.id,
                          bloodGroup: 'O+',
                          componentType: component,
                          lat: String(city.lat),
                          lng: String(city.lng),
                          radiusKm: String(radiusKm),
                        },
                      })
                    }
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={facility.name}
                    style={styles.bankRow}
                  >
                    <View style={styles.bankHead}>
                      <View style={[styles.bankMark, { backgroundColor: colors.statusCriticalBg }]}>
                        <Icon name="droplet" size={19} color={colors.statusCritical} />
                      </View>
                      <View style={styles.bankBody}>
                        <Text style={styles.bankName} numberOfLines={2}>
                          {facility.name}
                        </Text>
                        <Text style={styles.bankMeta} numberOfLines={1}>
                          {[
                            [facility.city, facility.region].filter(Boolean).join(', ') || null,
                            facility.distance_km === null
                              ? null
                              : t('bloodFinder.distanceKm', { km: facility.distance_km }),
                          ]
                            .filter(Boolean)
                            .join('  •  ')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => dial(facility.phone ?? facility.emergency_contact)}
                        disabled={!facility.phone && !facility.emergency_contact}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('bloodFinder.callShort')}
                        style={[styles.bankCall, { borderColor: colors.border }]}
                      >
                        <Icon
                          name="phone"
                          size={16}
                          color={
                            facility.phone || facility.emergency_contact
                              ? colors.blue
                              : colors.textMuted
                          }
                        />
                      </TouchableOpacity>
                    </View>

                    {/* The grid the reference is built around. */}
                    <View style={styles.grid}>
                      {grid.map((cell) => (
                        <View
                          key={cell.group}
                          style={[
                            styles.gridCell,
                            {
                              borderColor: colors.border,
                              backgroundColor: cell.units
                                ? colors.statusNormalBg
                                : colors.surfaceMuted,
                            },
                          ]}
                        >
                          <Text style={styles.gridGroup}>{cell.group}</Text>
                          <Text
                            style={[
                              styles.gridValue,
                              { color: cell.units ? colors.statusNormal : colors.textMuted },
                            ]}
                          >
                            {/* Not reported is a dash, never a zero. */}
                            {cell.units ?? '—'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </TouchableOpacity>
                </Card>
              );
            })
          )}
        </View>

        <Card accentColor={colors.blue}>
          <Text style={styles.ctaTitle}>{t('bloodMap.ctaTitle')}</Text>
          <Text style={styles.ctaBody}>{t('bloodMap.ctaBody')}</Text>
          <CareButton
            label={t('bloodMap.ctaAction')}
            icon="droplet"
            variant="primary"
            size="sm"
            onPress={() => router.push('/blood-finder')}
            style={styles.ctaAction}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.sm },

    fieldLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
      marginBottom: spacing.xs,
    },
    spacer: { marginTop: spacing.md },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },

    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    legendNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      padding: spacing.md,
      paddingTop: spacing.xs,
    },

    bankRow: { padding: spacing.md, gap: spacing.sm },
    bankHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    bankMark: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bankBody: { flex: 1 },
    bankName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    bankMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
      marginTop: 2,
    },
    bankCall: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
    },

    grid: { flexDirection: 'row', gap: 6 },
    gridCell: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: 8,
      paddingVertical: 6,
      alignItems: 'center',
      gap: 1,
    },
    gridGroup: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      color: c.textSecondary,
    },
    gridValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
    },

    ctaTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    ctaBody: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
      marginTop: 4,
    },
    ctaAction: { marginTop: spacing.md, alignSelf: 'flex-start' },
  });
