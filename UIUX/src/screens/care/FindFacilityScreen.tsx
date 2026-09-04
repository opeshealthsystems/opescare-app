/**
 * CARE-007 — Find Department.
 *
 * OPES is a single hospital, so discovery is by *department*, not by site:
 * `GET /patient/departments` (q / department_type). The reference layout is
 * unchanged — the type strip, the result cards and the help banner all still
 * render, they just describe departments of St. Mary's. The type counts are
 * derived from the unfiltered page, so the numbers are real rather than seeded
 * constants.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { findDepartments, type DepartmentQuery, type PortalDepartment } from '../../api';
import { Card, EmptyState, Icon, IconName, ScreenHeader, SectionHeader } from '../../components';
import { useTranslation, type TFunction } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, statusMap, typography } from '../../theme/theme';
import { AsyncBoundary, CareButton, RatingLine, SearchField, useAsync } from './shared';

type DepartmentType = PortalDepartment['department_type'];

/**
 * English constant kept for `FacilityProfileScreen`, which imports it. The
 * FindFacility render itself uses the translated helpers below.
 */
export const DEPARTMENT_TYPE_LABEL: Record<DepartmentType, string> = {
  clinic: 'Clinical',
  laboratory: 'Laboratory',
  pharmacy: 'Pharmacy',
  imaging: 'Imaging',
  emergency: 'Emergency',
};

const TYPE_LABEL_KEY: Record<DepartmentType, string> = {
  clinic: 'care.findFacility.typeClinical',
  laboratory: 'care.findFacility.typeLaboratory',
  pharmacy: 'care.findFacility.typePharmacy',
  imaging: 'care.findFacility.typeImaging',
  emergency: 'care.findFacility.typeEmergency',
};

const TYPE_PLURAL_KEY: Record<DepartmentType, string> = {
  clinic: 'care.findFacility.pluralClinic',
  laboratory: 'care.findFacility.pluralLab',
  pharmacy: 'care.findFacility.pluralPharmacy',
  imaging: 'care.findFacility.pluralImaging',
  emergency: 'care.findFacility.pluralEmergency',
};

const typeLabelTr = (t: TFunction, d: DepartmentType) => t(TYPE_LABEL_KEY[d]);
const typePluralTr = (t: TFunction, d: DepartmentType) => t(TYPE_PLURAL_KEY[d]);

export const DEPARTMENT_TYPE_ICON: Record<DepartmentType, IconName> = {
  clinic: 'first-aid',
  laboratory: 'flask',
  pharmacy: 'pill',
  imaging: 'image',
  emergency: 'building',
};

const TYPES: DepartmentType[] = ['clinic', 'emergency', 'laboratory', 'imaging', 'pharmacy'];

type Data = {
  departments: PortalDepartment[];
  total: number;
  counts: Record<string, number>;
  allTotal: number;
  hospital: string | null;
};

export function FindFacilityScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'FindFacility'>>();

  const [query, setQuery] = useState(params?.query ?? '');
  const [search, setSearch] = useState(params?.query ?? '');
  const [type, setType] = useState<DepartmentType | null>(null);

  const load = useCallback(async (): Promise<Data> => {
    const q: DepartmentQuery = { per_page: 100 };
    if (search.trim()) q.q = search.trim();
    if (type) q.department_type = type;
    const [page, all] = await Promise.all([findDepartments(q), findDepartments({ per_page: 100 })]);
    const counts: Record<string, number> = {};
    for (const d of all.data) counts[d.department_type] = (counts[d.department_type] ?? 0) + 1;
    return {
      departments: page.data,
      total: page.meta.pagination.total,
      counts,
      allTotal: all.meta.pagination.total,
      hospital: all.data[0]?.hospital_name ?? null,
    };
  }, [search, type]);

  const state = useAsync<Data>(load, [search, type]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('care.findFacility.title')} subtitle={t('care.findFacility.subtitle')} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={state.loading && state.data !== null}
            onRefresh={state.reload}
            tintColor={colors.blue}
          />
        }
      >
        <View style={styles.searchRow}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder={t('care.findFacility.searchPlaceholder')}
            onSubmit={() => setSearch(query)}
          />
          <TouchableOpacity
            style={styles.filterButton}
            activeOpacity={0.8}
            onPress={() => setSearch(query)}
            accessibilityLabel={t('care.findFacility.applyFilters')}
          >
            <Icon name="filter" size={18} color={colors.link} />
            <Text style={styles.filterText}>{t('care.findFacility.filters')}</Text>
          </TouchableOpacity>
        </View>

        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('care.findFacility.loading')}
        >
          {(data) => (
            <>
              {!!data.hospital && (
                <View style={styles.hospitalBanner}>
                  <Icon name="building" size={18} color={colors.blue} />
                  <Text style={styles.hospitalText} numberOfLines={1}>
                    {data.hospital}
                  </Text>
                </View>
              )}

              <View>
                <SectionHeader
                  title={t('care.findFacility.departmentTypes')}
                  actionLabel={type ? typeLabelTr(t, type) : t('care.findFacility.allTypes')}
                  onAction={() => setType(null)}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
                  <TypeTile
                    icon="grid"
                    label={t('care.findFacility.all')}
                    count={data.allTotal}
                    selected={type === null}
                    onPress={() => setType(null)}
                  />
                  {TYPES.filter((dt) => (data.counts[dt] ?? 0) > 0).map((dt) => (
                    <TypeTile
                      key={dt}
                      icon={DEPARTMENT_TYPE_ICON[dt]}
                      label={typePluralTr(t, dt)}
                      count={data.counts[dt] ?? 0}
                      selected={type === dt}
                      onPress={() => setType(type === dt ? null : dt)}
                    />
                  ))}
                </ScrollView>
              </View>

              <View>
                <SectionHeader title={t('care.findFacility.departmentsFound', { count: data.total })} />
                {data.departments.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon="building"
                      tint="blue"
                      title={t('care.findFacility.noMatchTitle')}
                      message={t('care.findFacility.noMatchMessage')}
                      actionLabel={t('care.findFacility.clearFilters')}
                      onAction={() => {
                        setType(null);
                        setQuery('');
                        setSearch('');
                      }}
                    />
                  </Card>
                ) : (
                  <View style={styles.stack}>
                    {data.departments.map((d) => (
                      <DepartmentCard
                        key={d.id}
                        department={d}
                        onPress={() => navigation.navigate('FacilityProfile', { departmentId: d.id })}
                        t={t}
                      />
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.assist}>
                <View style={styles.assistTop}>
                  <View style={styles.assistIcon}>
                    <Icon name="info" size={20} color={colors.textOnBrand} />
                  </View>
                  <View style={styles.assistBody}>
                    <Text style={styles.assistTitle}>{t('care.findFacility.assistTitle')}</Text>
                    <Text style={styles.assistText}>{t('care.findFacility.assistText')}</Text>
                  </View>
                </View>
                <CareButton
                  label={t('care.findFacility.requestHelp')}
                  variant="secondary"
                  size="sm"
                  icon="chat"
                  onPress={() => navigation.navigate('NewMessage')}
                />
              </View>
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

function TypeTile({
  icon,
  label,
  count,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.type, selected && styles.typeOn]}>
      <Icon name={icon} size={26} color={colors.blue} />
      <Text style={styles.typeLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.typeCount}>{count}</Text>
    </TouchableOpacity>
  );
}

function DepartmentCard({ department, onPress, t }: { department: PortalDepartment; onPress: () => void; t: TFunction }) {
  const d = department;
  const tone = d.is_24_7 ? statusMap.normal : statusMap.pending;
  return (
    <Card onPress={onPress}>
      <View style={styles.facRow}>
        <View style={styles.facThumb}>
          <Icon name={DEPARTMENT_TYPE_ICON[d.department_type]} size={30} color={colors.blue} />
        </View>
        <View style={styles.facBody}>
          <Text style={styles.facName} numberOfLines={2}>
            {d.name}
          </Text>
          <Text style={styles.facType}>{typeLabelTr(t, d.department_type)}</Text>
          <View style={styles.facMetaRow}>
            <Icon name="location" size={14} color={colors.textMuted} />
            <Text style={styles.facMeta} numberOfLines={1}>
              {d.location ?? [d.address, d.city].filter(Boolean).join(', ')}
            </Text>
          </View>
          <View style={styles.facMetaRow}>
            <Icon name="users" size={14} color={colors.textMuted} />
            <Text style={styles.facMeta} numberOfLines={1}>
              {t('care.findFacility.doctors', { count: d.provider_count })}
            </Text>
          </View>
        </View>
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </View>
      <View style={styles.facFooter}>
        <View style={[styles.openPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.openText, { color: tone.fg }]}>{d.is_24_7 ? t('care.findFacility.open247') : t('care.findFacility.byHours')}</Text>
        </View>
        <RatingLine rating={d.rating} reviewCount={d.review_count} color={colors.textPrimary} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  stack: { gap: spacing.sm + 2 },

  hospitalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  hospitalText: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
  },
  filterText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },

  typeRow: { gap: spacing.sm + 2, paddingRight: spacing.md },
  type: {
    width: 96,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 6,
  },
  typeOn: { backgroundColor: colors.primarySoft, borderColor: colors.blue },
  typeLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  typeCount: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },

  facRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 2 },
  facThumb: {
    width: 74,
    height: 74,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  facBody: { flex: 1, minWidth: 0, gap: 2 },
  facName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  facType: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },
  facMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  facMeta: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  facFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  openPill: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  openText: { fontFamily: typography.fontFamily.semiBold, fontSize: 11 },

  assist: {
    gap: spacing.sm + 2,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  assistTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  assistIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistBody: { flex: 1, minWidth: 0 },
  assistTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  assistText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
