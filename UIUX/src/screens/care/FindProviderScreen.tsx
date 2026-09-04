/**
 * CARE-006 — Find Provider.
 *
 * `GET /patient/providers` (q / department_id / specialty / sort), with the
 * department strip fed by `GET /patient/departments` and the category strip by
 * `GET /patient/providers/specialties`.
 *
 * OPES is a single hospital, so a patient narrows to a doctor by *department*
 * then specialty — never by site. Every provider listed here is a St. Mary's
 * doctor, which is exactly what booking and messaging route to.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  fetchSpecialties,
  findDepartments,
  findProviders,
  type PortalDepartment,
  type PortalProvider,
  type ProviderQuery,
  type SpecialtyCount,
} from '../../api';
import { Card, EmptyState, Icon, IconName, ScreenHeader, SectionHeader } from '../../components';
import { useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, statusMap, typography } from '../../theme/theme';
import { AsyncBoundary, CareButton, ProviderAvatar, RatingLine, SearchField, useAsync } from './shared';

type Sort = 'rating' | 'experience';

type Data = {
  providers: PortalProvider[];
  total: number;
  specialties: SpecialtyCount[];
  departments: PortalDepartment[];
};

export function specialtyIcon(name: string): IconName {
  const s = name.toLowerCase();
  if (s.includes('cardio')) return 'heart-pulse';
  if (s.includes('paed') || s.includes('pedia')) return 'baby';
  if (s.includes('derma')) return 'shield';
  if (s.includes('pulmo') || s.includes('respir')) return 'lungs';
  if (s.includes('radio') || s.includes('imaging')) return 'image';
  if (s.includes('lab')) return 'flask';
  if (s.includes('gyn') || s.includes('obstet')) return 'baby';
  if (s.includes('ortho')) return 'ruler';
  if (s.includes('neuro')) return 'activity';
  return 'stethoscope';
}

export function FindProviderScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'FindProvider'>>();

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState<string | null>(params?.specialty ?? null);
  const [department, setDepartment] = useState<string | null>(params?.departmentId ?? null);
  const [sort, setSort] = useState<Sort>('rating');

  const load = useCallback(async (): Promise<Data> => {
    const q: ProviderQuery = { per_page: 50, sort };
    if (search.trim()) q.q = search.trim();
    if (specialty) q.specialty = specialty;
    if (department) q.department_id = department;
    const [page, specialties, departments] = await Promise.all([
      findProviders(q),
      fetchSpecialties(),
      findDepartments({ per_page: 100 }),
    ]);
    return {
      providers: page.data,
      total: page.meta.pagination.total,
      specialties,
      departments: departments.data,
    };
  }, [search, specialty, department, sort]);

  const state = useAsync<Data>(load, [search, specialty, department, sort]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('care.findProvider.title')} subtitle={t('care.findProvider.subtitle')} />
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
            placeholder={t('care.findProvider.searchPlaceholder')}
            onSubmit={() => setSearch(query)}
          />
          <TouchableOpacity
            style={styles.filterButton}
            activeOpacity={0.8}
            onPress={() => setSearch(query)}
            accessibilityLabel={t('care.findProvider.applyFilters')}
          >
            <Icon name="filter" size={18} color={colors.link} />
            <Text style={styles.filterText}>{t('care.findProvider.filters')}</Text>
          </TouchableOpacity>
        </View>

        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('care.findProvider.loading')}>
          {(data) => {
            const totalAll = data.specialties.reduce((n, s) => n + s.provider_count, 0);
            return (
              <>
                <View>
                  <SectionHeader
                    title={t('care.findProvider.departments')}
                    actionLabel={
                      department
                        ? (data.departments.find((d) => d.id === department)?.name ?? t('care.findProvider.allDepartments'))
                        : t('care.findProvider.allDepartments')
                    }
                    onAction={() => setDepartment(null)}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                    <DepartmentChip
                      label={t('care.findProvider.allDepartments')}
                      selected={department === null}
                      onPress={() => setDepartment(null)}
                    />
                    {data.departments.map((d) => (
                      <DepartmentChip
                        key={d.id}
                        label={d.name}
                        selected={department === d.id}
                        onPress={() => setDepartment(department === d.id ? null : d.id)}
                      />
                    ))}
                  </ScrollView>
                </View>

                <View>
                  <SectionHeader title={t('care.findProvider.topCategories')} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                    <CategoryTile
                      icon="grid"
                      label={t('care.findProvider.all')}
                      count={totalAll}
                      selected={specialty === null}
                      onPress={() => setSpecialty(null)}
                    />
                    {data.specialties.map((s) => (
                      <CategoryTile
                        key={s.specialty}
                        icon={specialtyIcon(s.specialty)}
                        label={s.specialty}
                        count={s.provider_count}
                        selected={specialty === s.specialty}
                        onPress={() => setSpecialty(specialty === s.specialty ? null : s.specialty)}
                      />
                    ))}
                  </ScrollView>
                </View>

                <View>
                  <SectionHeader
                    title={t('care.findProvider.providersFound', { count: data.total })}
                    actionLabel={sort === 'rating' ? t('care.findProvider.sortRating') : t('care.findProvider.sortExperience')}
                    onAction={() => setSort((s) => (s === 'rating' ? 'experience' : 'rating'))}
                  />
                  {data.providers.length === 0 ? (
                    <Card>
                      <EmptyState
                        icon="person-search"
                        tint="blue"
                        title={t('care.findProvider.noMatchTitle')}
                        message={t('care.findProvider.noMatchMessage')}
                        actionLabel={t('care.findProvider.clearFilters')}
                        onAction={() => {
                          setSpecialty(null);
                          setDepartment(null);
                          setQuery('');
                          setSearch('');
                        }}
                      />
                    </Card>
                  ) : (
                    <View style={styles.stack}>
                      {data.providers.map((p) => (
                        <ProviderCard
                          key={p.id}
                          provider={p}
                          onPress={() => navigation.navigate('ProviderProfile', { providerId: String(p.id) })}
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
                      <Text style={styles.assistTitle}>{t('care.findProvider.assistTitle')}</Text>
                      <Text style={styles.assistText}>{t('care.findProvider.assistText')}</Text>
                    </View>
                  </View>
                  <CareButton
                    label={t('care.findProvider.requestAssistance')}
                    variant="secondary"
                    size="sm"
                    icon="chat"
                    onPress={() => navigation.navigate('NewMessage')}
                  />
                </View>
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

function DepartmentChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.deptChip, selected && styles.deptChipOn]}
    >
      <Text style={[styles.deptChipText, selected && styles.deptChipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function CategoryTile({
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
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.cat, selected && styles.catOn]}
      accessibilityRole="button"
    >
      <Icon name={icon} size={26} color={colors.blue} />
      <Text style={styles.catLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.catCount}>{count}</Text>
    </TouchableOpacity>
  );
}

export function ProviderCard({ provider, onPress }: { provider: PortalProvider; onPress: () => void }) {
  const { t } = useTranslation();
  const p = provider;
  const availableTone = p.accepts_new_patients ? statusMap.normal : statusMap.neutral;
  return (
    <Card>
      <View style={styles.provRow}>
        <ProviderAvatar name={p.name} size={64} />
        <View style={styles.provBody}>
          <View style={styles.provNameRow}>
            <Text style={styles.provName} numberOfLines={1}>
              {p.name}
            </Text>
            <Icon name="check-circle" size={16} color={colors.blue} />
          </View>
          <Text style={styles.provSpecialty} numberOfLines={1}>
            {p.title ?? p.specialty ?? t('care.findProvider.providerFallback')}
          </Text>
          <View style={styles.provMetaRow}>
            <Icon name="building" size={14} color={colors.textMuted} />
            <Text style={styles.provMeta} numberOfLines={1}>
              {p.department_name ?? p.facility_name ?? t('care.findProvider.deptTbc')}
            </Text>
          </View>
          {!!p.room && (
            <View style={styles.provMetaRow}>
              <Icon name="location" size={14} color={colors.textMuted} />
              <Text style={styles.provMeta} numberOfLines={1}>
                {p.room}
              </Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.provFooter}>
        <View style={[styles.availPill, { backgroundColor: availableTone.bg }]}>
          <Text style={[styles.availText, { color: availableTone.fg }]}>
            {p.accepts_new_patients ? t('care.findProvider.available') : t('care.findProvider.notAccepting')}
          </Text>
        </View>
        <RatingLine rating={p.rating} reviewCount={p.review_count} color={colors.textPrimary} />
        <View style={styles.provSpacer} />
        <CareButton label={t('care.findProvider.viewProfile')} size="sm" onPress={onPress} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  deptChip: {
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  deptChipOn: { backgroundColor: colors.primarySoft, borderColor: colors.blue },
  deptChipText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  deptChipTextOn: { color: colors.link, fontFamily: typography.fontFamily.semiBold },

  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  stack: { gap: spacing.sm + 2 },

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

  catRow: { gap: spacing.sm + 2, paddingRight: spacing.md },
  cat: {
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
  catOn: { backgroundColor: colors.primarySoft, borderColor: colors.blue },
  catLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  catCount: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },

  provRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 2 },
  provBody: { flex: 1, minWidth: 0, gap: 2 },
  provNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  provName: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  provSpecialty: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  provMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  provMeta: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  provFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  provSpacer: { flex: 1 },
  availPill: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  availText: { fontFamily: typography.fontFamily.semiBold, fontSize: 11 },

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
