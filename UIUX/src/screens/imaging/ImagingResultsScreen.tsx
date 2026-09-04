/**
 * DIA-007 — Imaging Results.
 *
 * The patient's radiology studies from `GET /patient/imaging`: a search field,
 * a modality filter row, one card per study (stored thumbnail, study name,
 * date, facility, result flag and impression), incremental paging, and the
 * report/download/share actions at the foot.
 */
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  fetchImagingStudies,
  type ImagingModality,
  type Page,
  type PortalImagingStudy,
} from '../../api';
import { Card, Chip, EmptyState, Icon, ScreenHeader, StatusBadge } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  flagLabel,
  flagTone,
  statusIcon,
  statusLabel,
  statusTone,
  studyDateLine,
  StudyThumb,
} from './detailShared';
import { modalityLabel } from './viewerShared';
import { AsyncBoundary, DiagButton, InfoStrip, useAsync } from '../diagnostics/shared';

const PER_PAGE = 5;

/**
 * The scan-type filter row. `all` and `other` are the screen's own words; the
 * rest reuse the shared scan-type vocabulary so this row and every chip, panel
 * and report header say the same thing.
 */
const FILTERS: { key: string; modality?: ImagingModality }[] = [
  { key: 'all' },
  { key: 'xray', modality: 'xray' },
  { key: 'ultrasound', modality: 'ultrasound' },
  { key: 'ct', modality: 'ct' },
  { key: 'mri', modality: 'mri' },
  { key: 'other', modality: 'other' },
];

export function ImagingResultsScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();

  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PER_PAGE);

  const modality = FILTERS.find((f) => f.key === filter)?.modality;
  const state = useAsync<Page<PortalImagingStudy>>(
    () => fetchImagingStudies({ modality, per_page: 100 }),
    [modality]
  );

  const openStudy = (study: PortalImagingStudy) =>
    study.has_report
      ? navigation.navigate('ImagingResultDetail', { studyId: study.id })
      : navigation.navigate('ImagingOrderDetail', { orderId: study.id });

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.results.navTitle')}
        align="center"
        actions={[
          { icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications') },
          { icon: 'more-vertical', onPress: () => navigation.navigate('DiagnosticsDashboard') },
        ]}
      />

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
        <View style={styles.hero}>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>{t('imaging.results.title')}</Text>
            <Text style={styles.heroSubtitle}>{t('imaging.results.subtitle')}</Text>
          </View>
          <View style={styles.heroArt}>
            <Icon name="image" size={44} color={colors.blue} strokeWidth={1.8} />
          </View>
        </View>

        {/* ── Search + filter ─────────────────────────────────────────── */}
        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <Icon name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('imaging.results.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
              autoComplete="off"
              textContentType="none"
              accessibilityRole="search"
              accessibilityLabel={t('imaging.results.searchPlaceholder')}
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('imaging.results.clearSearch')}
              >
                <Icon name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <DiagButton
            label={t('imaging.results.filter')}
            icon="filter"
            variant="secondary"
            onPress={() => navigation.navigate('ImagingHistory')}
            style={styles.filterButton}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={
                f.key === 'all'
                  ? t('imaging.results.filterAll')
                  : f.key === 'other'
                    ? t('imaging.results.filterOthers')
                    : modalityLabel(t, f.key)
              }
              selected={f.key === filter}
              onPress={() => {
                setFilter(f.key);
                setLimit(PER_PAGE);
              }}
            />
          ))}
        </ScrollView>

        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('imaging.results.loading')}
        >
          {(page) => {
            const needle = query.trim().toLowerCase();
            const matches = page.data.filter(
              (s) =>
                !needle ||
                s.study_name.toLowerCase().includes(needle) ||
                s.body_part.toLowerCase().includes(needle) ||
                (s.impression ?? '').toLowerCase().includes(needle) ||
                (s.accession_number ?? '').toLowerCase().includes(needle)
            );
            const shown = matches.slice(0, limit);

            if (matches.length === 0) {
              return (
                <EmptyState
                  icon="image"
                  tint="blue"
                  title={
                    needle ? t('imaging.results.noMatchTitle') : t('imaging.results.emptyTitle')
                  }
                  message={
                    needle ? t('imaging.results.noMatchBody') : t('imaging.results.emptyBody')
                  }
                  actionLabel={
                    needle ? t('imaging.results.noMatchCta') : t('imaging.results.emptyCta')
                  }
                  onAction={() =>
                    needle ? setQuery('') : navigation.navigate('BookImagingStudy')
                  }
                />
              );
            }

            return (
              <>
                {shown.map((study, i) => {
                  const flag = flagLabel(t, study);
                  return (
                    <TouchableOpacity
                      key={study.id}
                      activeOpacity={0.85}
                      onPress={() => openStudy(study)}
                      accessibilityRole="button"
                    >
                      <Card style={i === 0 ? styles.studyCardLead : undefined}>
                        <View style={styles.studyRow}>
                          <StudyThumb
                            url={study.thumbnail_url}
                            width={92}
                            height={112}
                           
                          />

                          <View style={styles.studyBody}>
                            <Text style={styles.studyTitle}>{study.study_name}</Text>
                            <Text style={styles.studyDate}>{studyDateLine(study.ordered_at)}</Text>
                            <Text style={styles.studyPlace} numberOfLines={1}>
                              {study.facility_name ?? t('imaging.common.facilityFallback')}
                            </Text>

                            {!!flag && (
                              <StatusBadge
                                status={flag}
                                tone={flagTone(study.result_flag)}
                                size="sm"
                                style={styles.studyFlag}
                              />
                            )}

                            <Text style={styles.studyImpression} numberOfLines={2}>
                              {study.impression ??
                                study.clinical_indication ??
                                t('imaging.results.reportPending')}
                            </Text>
                          </View>

                          <View style={styles.studyTrailing}>
                            <StatusBadge
                              status={statusLabel(t, study.status)}
                              tone={statusTone(study.status)}
                              icon={statusIcon(study.status)}
                              size="sm"
                            />
                            <Icon name="chevron-right" size={18} color={colors.link} />
                          </View>
                        </View>
                      </Card>
                    </TouchableOpacity>
                  );
                })}

                {matches.length > shown.length && (
                  <TouchableOpacity
                    onPress={() => setLimit((n) => n + PER_PAGE)}
                    activeOpacity={0.75}
                    style={styles.loadMore}
                    accessibilityRole="button"
                  >
                    <Text style={styles.loadMoreText}>{t('imaging.results.loadMore')}</Text>
                    <Icon name="chevron-down" size={18} color={colors.link} />
                  </TouchableOpacity>
                )}

                {/*
                 * The per-study report / download / share / send actions live
                 * on each study's own detail screen (opened by tapping a card),
                 * where they act on the study the patient is actually looking
                 * at. A list-level action row had no selected study to target —
                 * it silently operated on the first result regardless — so it is
                 * deliberately not rendered here.
                 */}
                <InfoStrip icon="info" tone="pending">
                  <Text style={styles.noteTitle}>{t('imaging.results.noteTitle')}</Text>
                  <Text style={styles.noteBody}>{t('imaging.results.noteBody')}</Text>
                </InfoStrip>
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  heroBody: { flex: 1, minWidth: 0 },
  heroTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    lineHeight: typography.lineHeight.xl,
    color: colors.textPrimary,
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },
  heroArt: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },

  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    padding: 0,
  },
  filterButton: { paddingHorizontal: spacing.md, height: 46 },

  chipRow: { gap: spacing.sm, paddingRight: spacing.md },

  studyCardLead: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  studyRow: { flexDirection: 'row', gap: spacing.sm + 4, alignItems: 'flex-start' },
  studyBody: { flex: 1, minWidth: 0, gap: 3 },
  studyTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.md,
    color: colors.textPrimary,
  },
  studyDate: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },
  studyPlace: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  studyFlag: { alignSelf: 'flex-start', marginTop: 2 },
  studyImpression: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },
  studyTrailing: { alignItems: 'flex-end', gap: spacing.md },

  loadMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  loadMoreText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },

  noteTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  noteBody: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

});
