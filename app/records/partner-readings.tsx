import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
/**
 * Partner-reported readings — GET /mobile/records/partner-readings.
 *
 * Owner decision: readings a partner system sent in (FHIR ingest) are shown to
 * the patient, CLEARLY LABELLED with the sending facility and sending system,
 * and kept SEPARATE from readings taken at a facility. This screen is their
 * only home: nothing here is merged into the vitals/labs lists or charts, and
 * every card carries a "Partner-reported" badge plus a "Sent by" block.
 */
import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  StatusBadge,
  formatDate,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { LoadingBlock, NoticeBanner } from '@/components/care/shared';
import {
  sortPartnerReadings,
  usePartnerReadings,
  type PartnerReading,
} from '@/lib/api/partnerReadingsQueries';

const TYPE_ICON: Record<PartnerReading['type'], IconName> = {
  observation: 'activity',
  diagnostic_report: 'flask',
  immunization: 'syringe',
};

function fmtValue(value: number | string | null | undefined, unit: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  return unit ? `${value} ${unit}` : String(value);
}

export default function PartnerReadingsScreen() {
  usePrivateScreen();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const query = usePartnerReadings();

  const pages = query.data?.pages;
  const rows = useMemo(() => sortPartnerReadings((pages ?? []).flatMap((p) => p.data ?? [])), [pages]);
  const note = pages?.[0]?.meta?.note ?? t('partnerReadings.noteFallback');

  const header = (
    <View style={s.headerBlock}>
      <NoticeBanner icon="info" tone="pending" message={note} />
    </View>
  );

  let body: ReactNode = null;
  if (query.isPending) {
    body = <LoadingBlock />;
  } else if (query.isError && rows.length === 0) {
    body = (
      <Card>
        <EmptyState
          icon="alert-circle"
          tint="red"
          title={t('partnerReadings.errorTitle')}
          message={t('partnerReadings.errorBody')}
          actionLabel={t('partnerReadings.retry')}
          onAction={() => void query.refetch()}
        />
      </Card>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <ScreenHeader title={t('partnerReadings.title')} subtitle={t('partnerReadings.subtitle')} />
      {body ? (
        <View style={s.content}>
          {header}
          {body}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => `${r.type}-${r.id}`}
          contentContainerStyle={s.content}
          ListHeaderComponent={header}
          renderItem={({ item }) => <ReadingCard reading={item} />}
          ListEmptyComponent={
            <Card>
              <EmptyState
                icon="activity"
                tint="blue"
                title={t('partnerReadings.emptyTitle')}
                message={t('partnerReadings.emptyBody')}
              />
            </Card>
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          ListFooterComponent={
            query.isFetchingNextPage ? <ActivityIndicator style={s.footer} color={colors.tintBlue} /> : null
          }
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching && !query.isFetchingNextPage}
              onRefresh={() => void query.refetch()}
              tintColor={colors.tintBlue}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function ReadingCard({ reading }: { reading: PartnerReading }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const title = reading.display ?? reading.code ?? t('partnerReadings.untitled');
  const date = formatDate(reading.effective_at ?? reading.received_at, '');
  const facility = reading.sending_facility?.name ?? t('partnerReadings.unknownFacility');
  const system = reading.sending_system?.name ?? t('partnerReadings.unknownSystem');
  const badge = reading.provenance_label ?? t('partnerReadings.badge');

  let primary: string | null;
  if (reading.type === 'diagnostic_report') primary = reading.conclusion ?? reading.value_text;
  else if (reading.type === 'immunization') primary = reading.value_text ?? fmtValue(reading.value, reading.unit);
  else primary = fmtValue(reading.value, reading.unit) ?? reading.value_text;

  const components = (reading.components ?? []).filter(Boolean);
  const interp = reading.interpretation;
  const interpNormal = interp ? /^(n|normal)$/i.test(interp.trim()) : true;
  const sentBy = t('partnerReadings.sentBy', { facility, system });

  return (
    <View
      style={s.cardWrap}
      accessible
      accessibilityLabel={[badge, title, primary, date, sentBy].filter(Boolean).join('. ')}
    >
      <Card style={s.card}>
        <View style={s.topRow}>
          <View style={s.badge}>
            <Icon name="share" size={12} strokeWidth={2} color={colors.tintAmber} />
            <Text style={[s.badgeText, { color: colors.tintAmber }]}>{badge}</Text>
          </View>
          {date ? <Text style={s.date}>{date}</Text> : null}
        </View>

        <View style={s.titleRow}>
          <Icon name={TYPE_ICON[reading.type] ?? 'activity'} size={18} color={colors.tintBlue} />
          <Text style={s.title}>{title}</Text>
        </View>

        {components.length > 0 ? (
          components.map((c, i) => (
            <Text key={`${c.code ?? 'c'}-${i}`} style={s.value}>
              {`${c.display ?? c.code ?? ''}: ${fmtValue(c.value, c.unit) ?? c.value_text ?? '-'}`}
            </Text>
          ))
        ) : primary ? (
          <Text style={s.value}>{primary}</Text>
        ) : null}

        {reading.reference_range || interp ? (
          <View style={s.rangeRow}>
            {reading.reference_range ? (
              <Text style={s.meta}>{t('partnerReadings.referenceRange', { range: reading.reference_range })}</Text>
            ) : null}
            {interp ? (
              <StatusBadge status={interp} tone={interpNormal ? 'normal' : 'warning'} label={interp} />
            ) : null}
          </View>
        ) : null}

        <View style={s.provenance}>
          <Icon name="building" size={14} color={colors.textSecondary} />
          <Text style={s.provenanceText}>{sentBy}</Text>
        </View>
      </Card>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.md, paddingBottom: spacing.xl },
    headerBlock: { marginBottom: spacing.md },
    footer: { marginVertical: spacing.md },
    cardWrap: { marginBottom: spacing.sm },
    card: { gap: spacing.sm },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: c.tintAmberBg,
      borderRadius: 999,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    badgeText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs },
    date: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: c.textMuted },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    title: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    value: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: c.textPrimary },
    rangeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    meta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: c.textSecondary },
    provenance: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.divider,
      paddingTop: spacing.sm,
    },
    provenanceText: {
      flex: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
  });
}
