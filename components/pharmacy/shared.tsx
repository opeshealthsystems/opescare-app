/**
 * Shared vocabulary and rows for the pharmacy DESK (`/clinician/pharmacy/*`).
 *
 * Composition only — every colour, radius, type size and icon comes from
 * `@/components/opes-ui`; nothing new is introduced. NOTHING IN HERE FETCHES:
 * the screens own their queries (`lib/api/pharmacyDeskQueries.ts`); these
 * helpers render whatever rows they are handed and render nothing when handed
 * none.
 *
 * i18n: every string is a `pharmacyDesk.*` key that exists in BOTH locale
 * files (added through the shared `i18n_add_keys.py` helper). The non-hook
 * label helpers use `i18next.t` directly — the same pattern as
 * `components/doctor/shared.tsx` — and are called from render, where the
 * caller has already re-rendered off the i18n context.
 */
import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  EmptyState,
  Icon,
  ListRow,
  StatusBadge,
  formatMoney,
  formatNumber,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { describeFailure, fmtMoney } from '@/components/care/shared';
import { RoleRefusedNotice } from '@/components/doctor/RoleGate';
import { fmtReported } from '@/components/doctor/shared';
import {
  deskServerMessage,
  isInvalidTransition,
  isLowStock,
  isOutcomeUnknown,
  isPharmacyDeskNotServed,
  isRoleForbidden,
  isValidationRefusal,
  prescriptionStage,
  toNum,
  type DeskPrescription,
  type DeskPrescriptionItem,
  type DeskReservation,
  type FulfilmentMode,
  type PrescriptionQueueStatus,
  type ReservationAction,
  type ReservationStatus,
  type StockItem,
} from '@/lib/api/pharmacyDeskQueries';

// ── Non-hook `t` ─────────────────────────────────────────────────────────

const tx = (key: string, params?: Record<string, unknown>): string =>
  i18next.t(`pharmacyDesk.${key}`, params) as string;

// ── Prescription stage vocabulary ────────────────────────────────────────

const STAGE_META: Record<PrescriptionQueueStatus, { icon: IconName; tint: Tint; tone: StatusTone }> = {
  incoming: { icon: 'pill', tint: 'amber', tone: 'pending' },
  preparing: { icon: 'clipboard', tint: 'blue', tone: 'pending' },
  ready: { icon: 'check-circle', tint: 'green', tone: 'normal' },
  dispensed: { icon: 'check', tint: 'green', tone: 'neutral' },
};

/** "Incoming" / « Reçues » — never the raw token. */
export function stageLabel(stage: PrescriptionQueueStatus | null): string {
  return stage ? tx(`stage.${stage}`) : tx('stage.unknown');
}

export function stageTone(stage: PrescriptionQueueStatus | null): StatusTone {
  return stage ? STAGE_META[stage].tone : 'neutral';
}

export function stageIcon(stage: PrescriptionQueueStatus | null): IconName {
  return stage ? STAGE_META[stage].icon : 'pill';
}

export function stageTint(stage: PrescriptionQueueStatus | null): Tint {
  return stage ? STAGE_META[stage].tint : 'blue';
}

// ── Reservation vocabulary ───────────────────────────────────────────────

const RESERVATION_TONE: Record<ReservationStatus, StatusTone> = {
  pending: 'pending',
  accepted: 'pending',
  ready: 'normal',
  collected: 'neutral',
  dispatched: 'info',
  delivered: 'neutral',
  cancelled: 'critical',
};

const KNOWN_RESERVATION = new Set<string>(Object.keys(RESERVATION_TONE));

export function reservationStatusLabel(status: string | null | undefined): string {
  const s = (status ?? '').toLowerCase();
  if (KNOWN_RESERVATION.has(s)) return tx(`reservationStatus.${s}`);
  if (s === 'expired') return tx('reservationStatus.expired');
  return tx('reservationStatus.unknown');
}

export function reservationTone(status: string | null | undefined): StatusTone {
  const s = (status ?? '').toLowerCase();
  if (s === 'expired') return 'critical';
  return RESERVATION_TONE[s as ReservationStatus] ?? 'neutral';
}

export function fulfilmentLabel(mode: FulfilmentMode | (string & {}) | null | undefined): string {
  return (mode ?? 'pickup') === 'delivery' ? tx('fulfilment.delivery') : tx('fulfilment.pickup');
}

export function fulfilmentIcon(mode: FulfilmentMode | (string & {}) | null | undefined): IconName {
  return (mode ?? 'pickup') === 'delivery' ? 'truck' : 'store';
}

/** The button label for a transition — "Accept", "Mark ready", "Collected"… */
export function reservationActionLabel(action: ReservationAction): string {
  return tx(`reservationAction.${action}`);
}

export function reservationActionIcon(action: ReservationAction): IconName {
  switch (action) {
    case 'accept':
      return 'check';
    case 'ready':
      return 'check-circle';
    case 'collected':
      return 'store';
    case 'dispatch':
      return 'truck';
    case 'delivered':
      return 'check-double';
    case 'cancel':
      return 'x-circle';
  }
}

// ── Numbers, money, medicines ────────────────────────────────────────────

/**
 * `12 500 FCFA` / `12,500 FCFA` — the app's one currency label when the
 * server says XAF (or nothing); any other ISO code is printed as sent.
 */
export function deskMoney(
  value: number | string | null | undefined,
  currency: string | null | undefined,
): string | null {
  const n = toNum(value);
  if (n === null) return null;
  const code = (currency ?? '').toUpperCase();
  if (!code || code === 'XAF' || code === 'FCFA' || code === 'CFA') return formatMoney(n);
  return fmtMoney(n, code);
}

/** "×21" — a quantity the wire sent, or nothing. */
export function qtyLabel(value: number | string | null | undefined): string | null {
  const n = toNum(value);
  return n === null ? null : tx('qty', { count: formatNumber(n) });
}

/** "Amoxicillin 500 mg" — a medicine with its strength when there is one. */
export function medicineLabel(m: { name: string; strength?: string | null; form?: string | null }): string {
  return [m.name, m.strength].filter(Boolean).join(' ');
}

/** The one-line medicines summary a queue row shows: "Amoxicillin ×21 · Paracetamol ×10". */
export function itemsSummary(items: DeskPrescriptionItem[] | undefined): string {
  if (!items || items.length === 0) return tx('row.noItems');
  return items.map((it) => [it.drug_name, qtyLabel(it.quantity)].filter(Boolean).join(' ')).join(' · ');
}

/** The patient line on every row: short name, or the Health ID when there is none. */
export function patientLine(p: { display_name: string | null; health_id: string }): string {
  return p.display_name?.trim() || p.health_id;
}

/** "Today at 14:20" — the doctor layer's relative clock, one vocabulary app-wide. */
export function whenLabel(iso: string | null | undefined): string {
  return fmtReported(iso ?? null);
}

// ── Failure copy for a WRITE ─────────────────────────────────────────────

export type WriteFailure = {
  kind: 'moved' | 'role' | 'gone' | 'refused' | 'unknownOutcome' | 'other';
  title: string;
  message: string;
};

/**
 * What a failed accept / ready / dispense / adjust means, in words the
 * pharmacist can act on. Four distinct answers, never one generic sentence:
 *   409 → the row moved on since it was listed; re-read;
 *   403 role_forbidden → not part of your role; nothing changed;
 *   404/405 → not here (any more), or the desk is not served on this host yet;
 *   422 → refused on its merits — the server's own sentence;
 *   no answer / 5xx → the OUTCOME IS UNKNOWN — check before doing it again.
 */
export function describeWriteFailure(error: unknown, checkHint: string): WriteFailure {
  if (isInvalidTransition(error)) {
    return {
      kind: 'moved',
      title: tx('write.movedTitle'),
      message: deskServerMessage(error) ?? tx('write.movedBody'),
    };
  }
  if (isRoleForbidden(error)) {
    return {
      kind: 'role',
      title: i18next.t('opesDoctor.roleGate.serverRefusedTitle') as string,
      message: i18next.t('opesDoctor.roleGate.serverRefusedBody') as string,
    };
  }
  if (isPharmacyDeskNotServed(error)) {
    return {
      kind: 'gone',
      title: tx('write.goneTitle'),
      message: tx('write.goneBody'),
    };
  }
  if (isValidationRefusal(error)) {
    return {
      kind: 'refused',
      title: tx('write.refusedTitle'),
      message: deskServerMessage(error) ?? tx('write.refusedBody'),
    };
  }
  const f = describeFailure(error);
  if (isOutcomeUnknown(error)) {
    return {
      kind: 'unknownOutcome',
      title: f.title,
      message: i18next.t('opesCore.errors.unknownOutcome', {
        message: f.message,
        checkHint,
      }) as string,
    };
  }
  return { kind: 'other', title: f.title, message: f.message };
}

// ── Failure state for a READ ─────────────────────────────────────────────

/**
 * The empty state for a list or a home read that failed with nothing on
 * screen. A role refusal gets the app-wide notice; a 404/405 the honest
 * "not served here yet" (with the server's sentence when it sent one); every
 * other failure the classified copy and a retry.
 */
export function DeskFailureState({
  error,
  onRetry,
  icon = 'store',
}: {
  error: unknown;
  onRetry: () => void;
  icon?: IconName;
}) {
  const { t } = useTranslation();
  if (isRoleForbidden(error)) return <RoleRefusedNotice />;
  if (isPharmacyDeskNotServed(error)) {
    const server = deskServerMessage(error);
    return (
      <EmptyState
        icon={icon}
        tint="amber"
        title={t('pharmacyDesk.notServed.title')}
        message={server ? `${t('pharmacyDesk.notServed.body')} (${server})` : t('pharmacyDesk.notServed.body')}
        actionLabel={t('opesCore.common.retry')}
        onAction={onRetry}
      />
    );
  }
  const f = describeFailure(error);
  return (
    <EmptyState
      icon="alert-circle"
      tint="red"
      title={f.title}
      message={f.message}
      actionLabel={t('opesCore.common.retry')}
      onAction={onRetry}
    />
  );
}

// ── Tiles ────────────────────────────────────────────────────────────────

/**
 * One count on the desk: a figure the SERVER counted, a label, a door. Zero
 * is drawn as zero — a pharmacist has to tell "nothing waiting" from "we
 * don't know", and the latter never reaches this component (the failure
 * state does).
 */
export function DeskTile({
  icon,
  tint,
  count,
  label,
  onPress,
  emphasise,
}: {
  icon: IconName;
  tint: Tint;
  count: number;
  label: string;
  onPress: () => void;
  /** Paint the figure in the warning colour when it is above zero (low stock). */
  emphasise?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = tintMap[tint];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count}`}
      accessibilityHint={t('pharmacyDesk.home.tileHint')}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <View style={styles.tileIcon}>
        <Icon name={icon} size={24} color={skin.fg} />
      </View>
      <Text style={[styles.tileCount, emphasise && count > 0 && { color: colors.statusWarning }]}>
        {formatNumber(count)}
      </Text>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────

/** One prescription in a queue or a lookup result: patient + Health ID, medicines, time, stage. */
export function PrescriptionRow({
  prescription: p,
  onPress,
}: {
  prescription: DeskPrescription;
  onPress: () => void;
  /** Ignored: each row sits in its own card; none draws a hairline. */
  divider?: boolean;
}) {
  const stage = prescriptionStage(p);
  return (
    <ListRow
      icon={stageIcon(stage)}
      tint={stageTint(stage)}
      title={patientLine(p.patient)}
      meta={[p.patient.health_id, itemsSummary(p.items), whenLabel(p.prescribed_at)]}
      subtitleLines={3}
      trailing={<StatusBadge status={stage ?? 'unknown'} tone={stageTone(stage)} label={stageLabel(stage)} size="sm" />}
      onPress={onPress}
      divider={false}
    />
  );
}

/** One reservation: medicine, quantity, patient, mode, time, status. */
export function ReservationRow({
  reservation: r,
  onPress,
}: {
  reservation: DeskReservation;
  onPress: () => void;
  /** Ignored: each row sits in its own card; none draws a hairline. */
  divider?: boolean;
}) {
  const delivery = (r.fulfilment_mode ?? 'pickup') === 'delivery';
  return (
    <ListRow
      icon={fulfilmentIcon(r.fulfilment_mode)}
      tint={delivery ? 'purple' : 'green'}
      title={[medicineLabel(r.medicine), qtyLabel(r.quantity)].filter(Boolean).join(' ')}
      meta={[patientLine(r.patient), r.patient.health_id, fulfilmentLabel(r.fulfilment_mode), whenLabel(r.created_at)]}
      subtitleLines={3}
      trailing={
        <StatusBadge
          status={String(r.status ?? 'unknown')}
          tone={reservationTone(r.status)}
          label={reservationStatusLabel(r.status)}
          size="sm"
        />
      }
      onPress={onPress}
      divider={false}
    />
  );
}

/** One shelf line: name + strength/form, quantity against the reorder level, unit price. */
export function StockRow({
  item,
  onPress,
}: {
  item: StockItem;
  onPress: () => void;
  /** Ignored: each row sits in its own card; none draws a hairline. */
  divider?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const low = isLowStock(item);
  const qty = toNum(item.quantity);
  const level = toNum(item.reorder_level);
  const price = deskMoney(item.unit_price, item.currency);
  return (
    <ListRow
      icon="archive"
      tint={low ? 'amber' : 'green'}
      title={medicineLabel(item)}
      meta={[
        item.form,
        level !== null
          ? t('pharmacyDesk.stock.reorderAt', { count: formatNumber(level) })
          : t('pharmacyDesk.stock.reorderUnknown'),
        price ? t('pharmacyDesk.stock.unitPrice', { price }) : null,
      ]}
      trailing={
        <View style={styles.stockTrailing}>
          <Text
            style={[styles.stockQty, low === true && { color: colors.statusWarning }]}
            accessibilityLabel={
              qty === null
                ? t('pharmacyDesk.stock.qtyUnknown')
                : t('pharmacyDesk.stock.onShelf', { count: formatNumber(qty) })
            }
          >
            {qty === null ? '—' : formatNumber(qty)}
          </Text>
          {low === true && (
            <StatusBadge status="low" tone="warning" label={t('pharmacyDesk.stock.lowBadge')} size="sm" />
          )}
        </View>
      }
      onPress={onPress}
      divider={false}
    />
  );
}

// ── Sheet ────────────────────────────────────────────────────────────────

/**
 * A bottom sheet in the Dialog's visual language, for a form the pharmacist
 * fills (the stock adjustment). `Alert.alert` is a no-op on web, and a Modal
 * is the one thing that behaves the same on all three platforms.
 */
export function DeskSheet({
  visible,
  title,
  onClose,
  busy,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** While true the backdrop and the close control do nothing. */
  busy?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={busy ? undefined : onClose}
        accessibilityRole="button"
        accessibilityLabel={t('opesCore.common.close')}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} accessibilityViewIsModal>
        <View style={styles.grab} />
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            {title}
          </Text>
          <Pressable
            onPress={busy ? undefined : onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('opesCore.common.close')}
          >
            <Icon name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Small text blocks ────────────────────────────────────────────────────

/** A label / value pair inside a card, the desk's own compact form. */
export function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, strong && styles.factStrong]}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    tile: {
      flexBasis: '47%',
      flexGrow: 1,
      minWidth: 0,
      padding: spacing.sm + 4,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    tilePressed: { opacity: 0.8 },
    stockTrailing: { alignItems: 'flex-end', gap: 4 },
    stockQty: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
    },
    tileIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileCount: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      lineHeight: typography.lineHeight.xl,
      color: colors.textPrimary,
    },
    tileLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    backdrop: { flex: 1, backgroundColor: colors.overlay },
    sheet: {
      backgroundColor: colors.page,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      maxHeight: '88%',
    },
    grab: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: radii.pill,
      backgroundColor: colors.border,
      marginBottom: spacing.sm,
    },
    sheetHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingBottom: spacing.sm,
    },
    sheetTitle: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textPrimary,
    },
    sheetBody: { paddingBottom: spacing.sm, gap: spacing.sm },
    fact: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingVertical: 6,
    },
    factLabel: {
      flexShrink: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    factValue: {
      flex: 1,
      minWidth: 0,
      textAlign: 'right',
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    factStrong: { fontFamily: typography.fontFamily.bold },
  });
