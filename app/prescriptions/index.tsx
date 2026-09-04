import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  SectionHeader,
  SegmentedTabs,
  StatusBadge,
  a11yJoin,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type Tint,
} from '@/components/opes-ui';
import { Screen } from '../../components/ui/Screen';
import { usePrescriptions, type PrescriptionSummary } from '../../lib/api/queries';
import { useActivePrescriptionSummary } from '../../lib/api/prescriptionQueries';
import {
  EXPIRY_WARNING_WINDOW_DAYS,
  daysUntil,
  referenceCode,
  statusLabelKey,
} from '../../components/prescriptions/status';
import {
  LoadingBlock,
  MedButton,
  ROW_TINTS,
  TintCircle,
  fmtShortDate,
  prescriptionTone,
} from '../../components/meds/shared';

/**
 * Prescriptions — the medications a care team has issued to this patient.
 *
 * MED-001 layout on the existing data layer: `ScreenHeader` with the Medicine
 * Finder shortcut, the navy summary hero, a scrollable status filter, the
 * "MY PRESCRIPTIONS" overline and one accent-barred `Card` per prescription.
 * Every colour is a palette token and every glyph is the kit `<Icon />`.
 *
 * Read-only by design: the mobile API exposes only GET index + GET show
 * (routes/api.php:269-270), so this screen surfaces no refill or renewal
 * action. The one refill route in the codebase is a session-authenticated web
 * portal route (`POST /portals/patient/prescriptions/{id}/refill`) and is not
 * reachable from a bearer-token client.
 *
 * The demo patient has no prescriptions, so the empty state is the state most
 * users meet first: it explains how a prescription reaches this screen rather
 * than reading as a failure, and both of its actions lead somewhere real.
 */

const STATUS_FILTERS = [
  'all',
  'active',
  'dispensed',
  'partially_dispensed',
  'expired',
  'cancelled',
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function PrescriptionsListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const { data, isLoading, isError, isFetching, refetch } = usePrescriptions(
    filter === 'all' ? undefined : filter,
  );
  const summary = useActivePrescriptionSummary();

  const prescriptions = data?.data ?? [];
  const total = data?.pagination?.total ?? prescriptions.length;
  const hasAnyActive = (summary.data?.prescriptionCount ?? 0) > 0;
  const showCount = !isLoading && !isError && prescriptions.length > 0;

  const filterOptions = useMemo(
    () =>
      STATUS_FILTERS.map((option) => ({
        key: option,
        label: option === 'all' ? t('prescriptions.filterAll') : t(statusLabelKey(option)),
      })),
    [t],
  );

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('prescriptions.title')}
        subtitle={t('prescriptions.subtitle')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
        right={
          <MedButton
            label={t('prescriptions.findMedicine')}
            icon="search"
            variant="navy"
            size="sm"
            onPress={() => router.push('/pharmacy')}
          />
        }
      />

      <FlatList
        data={prescriptions}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => {
              refetch();
              summary.refetch();
            }}
            tintColor={colors.blue}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Active-medication summary. Rendered only once there is something
                to count — an all-zero strip would be noise above an empty list. */}
            {hasAnyActive ? (
              <SummaryHero
                prescriptions={summary.data?.prescriptionCount ?? 0}
                medications={summary.data?.medicationCount ?? 0}
              />
            ) : null}

            <SegmentedTabs
              scrollable
              options={filterOptions}
              value={filter}
              onChange={(key) => setFilter(key as StatusFilter)}
            />

            {showCount ? (
              <View style={styles.sectionRow}>
                <SectionHeader
                  variant="overline"
                  title={t('opesMeds.list.prescriptionsTitle')}
                  style={styles.sectionHeader}
                />
                <Text style={styles.count}>{t('prescriptions.resultCount', { count: total })}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <LoadingBlock label={t('opesMeds.list.loading')} />
          ) : isError ? (
            <Card>
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('prescriptions.loadError')}
                actionLabel={t('prescriptions.retry')}
                onAction={() => refetch()}
              />
            </Card>
          ) : filter === 'all' ? (
            <FirstRunEmptyState />
          ) : (
            <FilteredEmptyState
              statusLabel={t(statusLabelKey(filter))}
              onShowAll={() => setFilter('all')}
            />
          )
        }
        renderItem={({ item, index }) => (
          <PrescriptionRow
            prescription={item}
            index={index}
            onPress={() => router.push(`/prescriptions/${item.id}`)}
          />
        )}
      />
    </Screen>
  );
}

/* -- Pieces ---------------------------------------------------------------- */

/** The MED-001 navy hero: two numerals and the pill mark. */
function SummaryHero({ prescriptions, medications }: { prescriptions: number; medications: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View
      style={styles.hero}
      accessible
      accessibilityLabel={a11yJoin(
        `${prescriptions} ${t('prescriptions.summaryActive')}`,
        `${medications} ${t('prescriptions.summaryMedications')}`,
      )}
    >
      <View style={styles.heroCol}>
        <Text style={styles.heroLabel}>{t('prescriptions.summaryActive')}</Text>
        <Text style={styles.heroNumber}>{pad(prescriptions)}</Text>
      </View>
      <View style={styles.heroDivider} />
      <View style={styles.heroCol}>
        <Text style={styles.heroLabel}>{t('prescriptions.summaryMedications')}</Text>
        <Text style={[styles.heroNumber, styles.heroNumberGreen]}>{pad(medications)}</Text>
      </View>
      <View style={styles.heroMark}>
        <Icon name="pill" size={28} color={colors.textOnBrand} />
      </View>
    </View>
  );
}

function PrescriptionRow({
  prescription,
  index,
  onPress,
}: {
  prescription: PrescriptionSummary;
  index: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tint: Tint = ROW_TINTS[index % ROW_TINTS.length];

  const prescribedOn = prescription.prescribed_at ? fmtShortDate(prescription.prescribed_at) : null;
  const remaining = daysUntil(prescription.expires_at);
  const isOpen = prescription.status === 'active' || prescription.status === 'partially_dispensed';

  // An expiry is only worth a callout while the prescription can still be
  // filled, and only inside the window where the date changes what you'd do.
  const expiryDays =
    isOpen && remaining !== null && remaining >= 0 && remaining <= EXPIRY_WARNING_WINDOW_DAYS
      ? remaining
      : null;
  const expiryLabel =
    expiryDays === null
      ? null
      : expiryDays === 0
        ? t('prescriptions.expiresToday')
        : t('prescriptions.expiresInDays', { count: expiryDays });

  const title = prescription.facility_name ?? t('prescriptions.unknownFacility');
  const statusLabel = t(statusLabelKey(prescription.status));
  // The list endpoint returns a count but never the drug names, so the count
  // is what carries the weight here. Names live on the detail screen.
  const countLine = t('prescriptions.medicationCount', { count: prescription.item_count });
  const dateLine = prescribedOn
    ? t('prescriptions.prescribedOn', { date: prescribedOn })
    : t('prescriptions.dateUnknown');
  const reference = t('prescriptions.reference', { code: referenceCode(prescription.id) });

  return (
    <Card
      variant="flush"
      accentColor={tintMap[tint].fg}
      onPress={onPress}
      accessibilityLabel={a11yJoin(title, countLine, dateLine, reference, statusLabel, expiryLabel)}
    >
      <View style={styles.rxRow}>
        <TintCircle icon="pill" tint={tint} size={48} />
        <View style={styles.rxBody}>
          <Text style={styles.rxTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.rxPurpose}>{countLine}</Text>
          <View style={styles.rxMetaRow}>
            <Icon name="calendar" size={14} color={colors.textMuted} />
            <Text style={styles.rxMeta} numberOfLines={1}>
              {dateLine}
              {'  •  '}
              {reference}
            </Text>
          </View>
        </View>
        <View style={styles.rxRight}>
          <StatusBadge
            status={prescription.status}
            tone={prescriptionTone(prescription.status, prescription.status_color)}
            label={statusLabel}
            size="sm"
          />
          {expiryLabel ? (
            <StatusBadge status="due" tone="warning" icon="clock" label={expiryLabel} size="sm" />
          ) : null}
        </View>
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

/**
 * The state the demo patient — and anyone not yet prescribed anything — sees.
 * It explains the mechanism instead of apologising, and both actions are real
 * routes: `app/appointments/book.tsx` and `app/pharmacy.tsx`.
 */
function FirstRunEmptyState() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.stack}>
      <Card>
        <EmptyState
          icon="pill"
          tint="blue"
          title={t('prescriptions.emptyTitle')}
          message={t('prescriptions.emptyBody')}
          actionLabel={t('prescriptions.emptyBookAppointment')}
          onAction={() => router.push('/appointments/book')}
        />
      </Card>

      <View>
        <SectionHeader variant="overline" title={t('prescriptions.emptyHowTitle')} />
        <Card variant="flush">
          <StepRow
            index={1}
            icon="stethoscope"
            tint="blue"
            title={t('prescriptions.emptyStep1Title')}
            body={t('prescriptions.emptyStep1Body')}
            divider
          />
          <StepRow
            index={2}
            icon="document-text"
            tint="green"
            title={t('prescriptions.emptyStep2Title')}
            body={t('prescriptions.emptyStep2Body')}
            divider
          />
          <StepRow
            index={3}
            icon="store"
            tint="purple"
            title={t('prescriptions.emptyStep3Title')}
            body={t('prescriptions.emptyStep3Body')}
          />
        </Card>
      </View>

      <MedButton
        label={t('prescriptions.emptyFindMedicine')}
        icon="search"
        variant="secondary"
        onPress={() => router.push('/pharmacy')}
      />
    </View>
  );
}

/** One numbered step of the "how a prescription gets here" explainer. */
function StepRow({
  index,
  icon,
  tint,
  title,
  body,
  divider,
}: {
  index: number;
  icon: IconName;
  tint: Tint;
  title: string;
  body: string;
  divider?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.step, divider && styles.stepDivider]} accessible accessibilityLabel={a11yJoin(`${index}. ${title}`, body)}>
      <TintCircle icon={icon} tint={tint} size={40} />
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>
          {index}. {title}
        </Text>
        <Text style={styles.stepText}>{body}</Text>
      </View>
    </View>
  );
}

/** A filter that matched nothing — a far lighter message than a first run. */
function FilteredEmptyState({
  statusLabel,
  onShowAll,
}: {
  statusLabel: string;
  onShowAll: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <EmptyState
        icon="pill"
        tint="amber"
        title={t('prescriptions.emptyFilterTitle', { status: statusLabel })}
        message={t('prescriptions.emptyFilterBody')}
        actionLabel={t('prescriptions.showAll')}
        onAction={onShowAll}
      />
    </Card>
  );
}

/* -- Styles ---------------------------------------------------------------- */

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    header: { gap: spacing.md },
    stack: { gap: spacing.md },

    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    sectionHeader: { flex: 1, marginBottom: 0 },
    count: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    // -- Hero ----------------------------------------------------------------
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: c.navy,
    },
    heroCol: { flex: 1, minWidth: 0 },
    heroDivider: { width: 1, alignSelf: 'stretch', backgroundColor: c.navyLight },
    heroLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textOnBrand,
    },
    heroNumber: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xxl,
      lineHeight: typography.lineHeight.xxl,
      color: c.textOnBrand,
    },
    heroNumberGreen: { color: c.statusNormal },
    heroMark: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.navyLight,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // -- Prescription rows ---------------------------------------------------
    rxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
    rxBody: { flex: 1, minWidth: 0, gap: 2 },
    rxTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: c.textPrimary,
    },
    rxPurpose: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },
    rxMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    rxMeta: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    rxRight: { alignItems: 'flex-end', gap: 4, maxWidth: 120 },

    // -- Explainer steps -----------------------------------------------------
    step: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: spacing.md,
    },
    stepDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
    stepBody: { flex: 1, minWidth: 0, gap: 2 },
    stepTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
    },
    stepText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
  });
