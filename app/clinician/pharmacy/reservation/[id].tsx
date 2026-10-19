/**
 * Pharmacy desk — one medicine order (`/clinician/pharmacy/reservation/[id]`).
 *
 * A patient reserved a medicine at this pharmacy for pickup or delivery. The
 * desk takes it through its states with one button per allowed transition:
 *
 *   pickup    pending → accepted → ready → collected
 *   delivery  pending → accepted → ready → dispatched → delivered
 *   any open  → cancelled (with a reason the patient will read)
 *
 * The buttons drawn are the ones `reservationActionsFor()` allows for the
 * status on screen; the server's 409 `invalid_transition` is the last word
 * when the order moved on since it was listed, and the screen says so and
 * re-reads rather than guessing.
 *
 * Data comes from the list the row was opened from (`?status=`), because the
 * contract has no single-item GET — see `useReservationFromCache`. After a
 * write the server's returned row is pinned on screen.
 *
 * i18n: `pharmacyDesk.*`, present in both locales.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardStack,
  EmptyState,
  Icon,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
  StatusBadge,
  formatDateTime,
  formatNumber,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, InfoRow, LoadingBlock, NoticeBanner, describeFailure } from '@/components/care/shared';
import { RoleGate } from '@/components/doctor/RoleGate';
import {
  RESERVATION_STATUSES,
  reservationActionsFor,
  toNum,
  useReservationAction,
  useReservationFromCache,
  type DeskReservation,
  type ReservationAction,
  type ReservationStatus,
} from '@/lib/api/pharmacyDeskQueries';
import {
  DeskFailureState,
  Fact,
  describeWriteFailure,
  deskMoney,
  fulfilmentIcon,
  fulfilmentLabel,
  medicineLabel,
  patientLine,
  reservationActionIcon,
  reservationActionLabel,
  reservationStatusLabel,
  reservationTone,
  whenLabel,
} from '@/components/pharmacy/shared';
import { pharmacyRoutes } from '@/components/pharmacy/routes';

const CANCEL_REASON_MAX = 300;

export default function DeskReservationScreen() {
  return (
    <RoleGate need={['dispense']}>
      <DeskReservationBody />
    </RoleGate>
  );
}

function DeskReservationBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const params = useLocalSearchParams<{ id: string; status?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const statusHint =
    typeof params.status === 'string' && (RESERVATION_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as ReservationStatus)
      : null;

  const { reservation, query, settling } = useReservationFromCache(id, {
    status: statusHint,
  });

  const [pinned, setPinned] = useState<DeskReservation | null>(null);
  const lastSeen = useRef<DeskReservation | null>(null);
  useEffect(() => {
    if (reservation) lastSeen.current = reservation;
  }, [reservation]);
  const shown = pinned ?? reservation ?? lastSeen.current;
  const leftList = !!shown && !reservation && !pinned && !query.isPending;

  const transition = useReservationAction();

  // ── Cancel: a reason the patient will read ──────────────────────────
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const reportFailure = useCallback(
    (error: unknown) => {
      const f = describeWriteFailure(error, t('pharmacyDesk.write.checkReservations'));
      dialog.alert(f.title, f.message, f.kind === 'unknownOutcome' ? 'warning' : 'critical');
      if (f.kind === 'moved') void query.refetch();
    },
    [dialog, query, t],
  );

  const run = useCallback(
    (r: DeskReservation, action: ReservationAction, cancelReason?: string) => {
      const patient = patientLine(r.patient);
      const medicine = medicineLabel(r.medicine);
      dialog.confirm({
        title: t(`pharmacyDesk.reservationConfirm.${action}Title`),
        message: t(`pharmacyDesk.reservationConfirm.${action}Body`, {
          patient,
          medicine,
        }),
        confirmLabel: reservationActionLabel(action),
        destructive: action === 'cancel',
        onConfirm: async () => {
          try {
            const updated = await transition.mutateAsync({
              id: r.id,
              action,
              reason: cancelReason,
            });
            setPinned(updated);
            setCancelling(false);
            setReason('');
          } catch (e) {
            reportFailure(e);
          }
        },
      });
    },
    [dialog, reportFailure, t, transition],
  );

  const submitCancel = useCallback(
    (r: DeskReservation) => {
      const trimmed = reason.trim();
      if (trimmed.length < 3) {
        setReasonError(t('pharmacyDesk.cancel.reasonRequired'));
        return;
      }
      setReasonError(null);
      run(r, 'cancel', trimmed);
    },
    [reason, run, t],
  );

  const refreshing = query.isFetching && !query.isPending;
  const onRefresh = () => {
    setPinned(null);
    void query.refetch();
  };

  let body: React.ReactNode;
  if (!id) {
    body = (
      <EmptyState
        icon="alert-circle"
        tint="amber"
        title={t('opesCore.errors.notFoundTitle')}
        message={t('opesCore.errors.notFoundBody')}
      />
    );
  } else if (!shown && settling) {
    body = <LoadingBlock label={t('pharmacyDesk.reservation.loading')} />;
  } else if (!shown && query.isError) {
    body = (
      <Card variant="flush">
        <DeskFailureState error={query.error} onRetry={() => void query.refetch()} icon="cart" />
      </Card>
    );
  } else if (!shown) {
    body = (
      <Card variant="flush">
        <EmptyState
          icon="cart"
          tint="amber"
          title={t('pharmacyDesk.reservation.notInListsTitle')}
          message={t('pharmacyDesk.reservation.notInListsBody')}
          actionLabel={t('pharmacyDesk.prescription.backToDesk')}
          onAction={() => router.replace(pharmacyRoutes.desk())}
        />
      </Card>
    );
  } else {
    const r = shown;
    const delivery = (r.fulfilment_mode ?? 'pickup') === 'delivery';
    const actions = reservationActionsFor(r);
    const primary = actions.filter((a) => a !== 'cancel');
    const canCancel = actions.includes('cancel');
    const qty = toNum(r.quantity);
    const price = deskMoney(r.total_price, r.currency);
    const closed = actions.length === 0;

    body = (
      <>
        {query.isError && (
          <StaleNotice
            message={describeFailure(query.error).message}
            loadedAt={query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )}
        {leftList && (
          <NoticeBanner
            icon="info"
            tone="pending"
            title={t('pharmacyDesk.reservation.leftListTitle')}
            message={t('pharmacyDesk.reservation.leftListBody')}
          />
        )}

        {/* ── The order ────────────────────────────────────────────────── */}
        <Card>
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <Text style={styles.title}>{medicineLabel(r.medicine)}</Text>
              {!!r.medicine.form && <Text style={styles.subtitle}>{r.medicine.form}</Text>}
            </View>
            <StatusBadge
              status={String(r.status ?? 'unknown')}
              tone={reservationTone(r.status)}
              label={reservationStatusLabel(r.status)}
            />
          </View>
          <View style={styles.divider} />
          <Fact
            label={t('pharmacyDesk.reservation.quantity')}
            value={qty === null ? t('opesCore.common.notRecorded') : formatNumber(qty)}
            strong
          />
          <Fact label={t('pharmacyDesk.reservation.price')} value={price ?? t('opesCore.common.notRecorded')} strong />
          {!!r.reference && <Fact label={t('pharmacyDesk.reservation.reference')} value={r.reference} />}
          <Fact label={t('pharmacyDesk.reservation.placedAt')} value={whenLabel(r.created_at)} />
          <Fact
            label={t('pharmacyDesk.reservation.expiresAt')}
            value={r.expires_at ? formatDateTime(r.expires_at) : t('pharmacyDesk.reservation.noExpiry')}
          />
        </Card>

        {/* ── Who, and how they get it ─────────────────────────────────── */}
        <CardStack spacing="sm">
          <Card variant="flush">
            <InfoRow
              icon="person"
              tint="blue"
              label={t('pharmacyDesk.reservation.patient')}
              value={`${patientLine(r.patient)} · ${r.patient.health_id}`}
            />
          </Card>
          <Card variant="flush">
            <InfoRow
              icon={fulfilmentIcon(r.fulfilment_mode)}
              tint={delivery ? 'purple' : 'green'}
              label={t('pharmacyDesk.reservation.fulfilment')}
              value={fulfilmentLabel(r.fulfilment_mode)}
            />
          </Card>
          {delivery && (
            <Card variant="flush">
              <InfoRow
                icon="location"
                tint="purple"
                label={t('pharmacyDesk.reservation.deliveryAddress')}
                value={r.delivery_address?.trim() || t('pharmacyDesk.reservation.addressMissing')}
              />
            </Card>
          )}
          {delivery && (
            <Card variant="flush">
              <InfoRow
                icon="phone"
                tint="purple"
                label={t('pharmacyDesk.reservation.deliveryPhone')}
                value={r.delivery_phone?.trim() || t('pharmacyDesk.reservation.phoneMissing')}
              />
            </Card>
          )}
          {delivery && !!r.delivery_status && (
            <Card variant="flush">
              <InfoRow
                icon="truck"
                tint="purple"
                label={t('pharmacyDesk.reservation.deliveryStatus')}
                value={r.delivery_status}
              />
            </Card>
          )}
        </CardStack>

        {/* ── Actions by state ─────────────────────────────────────────── */}
        {closed ? (
          <NoticeBanner
            icon={String(r.status).toLowerCase() === 'cancelled' ? 'x-circle' : 'check-circle'}
            tone={String(r.status).toLowerCase() === 'cancelled' ? 'critical' : 'normal'}
            title={t('pharmacyDesk.reservation.closedTitle', {
              status: reservationStatusLabel(r.status),
            })}
            message={t('pharmacyDesk.reservation.closedBody')}
          />
        ) : cancelling ? (
          <>
            <SectionHeader
              title={t('pharmacyDesk.cancel.title')}
              actionLabel={t('pharmacyDesk.cancel.back')}
              onAction={() => setCancelling(false)}
            />
            <Card>
              <Text style={styles.note}>{t('pharmacyDesk.cancel.intro')}</Text>
              <Text style={styles.fieldLabel}>{t('pharmacyDesk.cancel.reasonLabel')}</Text>
              <PillInput
                icon={<Icon name="document-text" size={18} color={colors.blue} />}
                value={reason}
                onChangeText={(v) => {
                  setReason(v);
                  if (reasonError) setReasonError(null);
                }}
                placeholder={t('pharmacyDesk.cancel.reasonPlaceholder')}
                error={reasonError ?? undefined}
                multiline
                maxLength={CANCEL_REASON_MAX}
                style={styles.multiline}
                accessibilityLabel={t('pharmacyDesk.cancel.reasonLabel')}
              />
              <View style={styles.actions}>
                <CareButton
                  label={reservationActionLabel('cancel')}
                  icon="x-circle"
                  variant="danger"
                  style={styles.action}
                  onPress={() => submitCancel(r)}
                  loading={transition.isPending}
                  disabled={transition.isPending}
                />
                <CareButton
                  label={t('pharmacyDesk.cancel.back')}
                  icon="close"
                  variant="secondary"
                  style={styles.action}
                  onPress={() => setCancelling(false)}
                  disabled={transition.isPending}
                />
              </View>
            </Card>
          </>
        ) : (
          <View style={styles.actionsStack}>
            {primary.map((action) => (
              <CareButton
                key={action}
                label={reservationActionLabel(action)}
                icon={reservationActionIcon(action)}
                onPress={() => run(r, action)}
                loading={transition.isPending && transition.variables?.action === action}
                disabled={transition.isPending}
              />
            ))}
            {canCancel && (
              <CareButton
                label={reservationActionLabel('cancel')}
                icon="x-circle"
                variant="secondary"
                onPress={() => setCancelling(true)}
                disabled={transition.isPending}
              />
            )}
          </View>
        )}
        <Text style={styles.footer}>{t('pharmacyDesk.reservation.footer')}</Text>
      </>
    );
  }

  const headerTitle = shown ? medicineLabel(shown.medicine) : t('pharmacyDesk.reservation.title');
  const headerSubtitle = shown
    ? shown.reference
      ? t('pharmacyDesk.reservation.subtitleRef', { ref: shown.reference })
      : patientLine(shown.patient)
    : undefined;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={headerTitle} subtitle={headerSubtitle} onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}
      >
        {body}
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: {
      padding: spacing.md,
      paddingTop: 0,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    titleText: { flex: 1, minWidth: 0 },
    title: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textPrimary,
    },
    subtitle: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.divider,
      marginVertical: spacing.sm,
    },
    note: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    fieldLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
    },
    multiline: { minHeight: 64, textAlignVertical: 'top' },
    actions: { flexDirection: 'row', gap: spacing.sm },
    action: { flex: 1 },
    actionsStack: { gap: spacing.sm },
    footer: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: spacing.md,
    },
  });
