/**
 * Shared presentation for the LAB DESK (`app/clinician/lab/**`).
 *
 * One copy of everything the queue and the order screen both draw: the route
 * vocabulary, the status / urgency / flag badges, the order row, the count
 * tile, the timeline and the failure state — all composition over the OPES
 * UI kit (`@/components/opes-ui`), no new colours, no inline SVG.
 *
 * Every string goes through `labDesk.*` (EN + FR, added through the shared
 * locale helper) — nothing here carries English by default.
 *
 * NOTHING HERE CLASSIFIES A RESULT. A flag is drawn exactly as the laboratory
 * recorded it (`LabFlag`), an urgency exactly as the ordering clinician set
 * it. Where a value is absent the row says "not recorded", never "normal".
 */
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  EmptyState,
  Icon,
  StatusBadge,
  StepProgress,
  a11yJoin,
  formatDateTime,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { describeFailure } from '@/components/care/shared';
import { RoleRefusedNotice } from '@/components/doctor/RoleGate';
import { sexLabel } from '@/components/doctor/chartShared';
import { ageFromDateOfBirth } from '@/lib/api/doctorQueries';
import {
  LAB_ORDER_STATUSES,
  isNotServed,
  isRoleForbidden,
  labServerMessage,
  labStatusIndex,
  type LabFlag,
  type LabOrderPatient,
  type LabOrderStatusLike,
  type LabOrderSummary,
  type LabUrgency,
} from '@/lib/api/labDeskQueries';

// ── Routes ────────────────────────────────────────────────────────────────

const seg = (value: string) => encodeURIComponent(value);

/** The queue's segments — the four order states plus the patient requests. */
export type LabSegment = 'ordered' | 'collected' | 'in_progress' | 'resulted' | 'requests';

/**
 * Every lab-desk destination, as an expo-router path. Plain strings, like
 * `doctorRoutes`: typed routes are off in this app, so an object href would
 * compile and then dead-end at runtime.
 *
 *   desk      /clinician/lab                 app/clinician/lab/index.tsx
 *   order     /clinician/lab/order/[id]      app/clinician/lab/order/[id].tsx
 */
export const labRoutes = {
  /** The queue. Optional `?segment=` opens one segment; `?health_id=` filters rows to one patient. */
  desk: '/clinician/lab',
  deskSegment: (segment: LabSegment) => `/clinician/lab?segment=${segment}`,
  deskForPatient: (healthId: string) => `/clinician/lab?health_id=${seg(healthId)}`,
  /** One order — collect, enter results, release. */
  order: (id: string) => `/clinician/lab/order/${seg(id)}`,
} as const;

// ── Translation helper ────────────────────────────────────────────────────

export type LabTranslate = (key: string, params?: Record<string, unknown>) => string;

/** `t` scoped to `labDesk.*`, so a screen reads `tx('queue.title')`. */
export function useLabT(): LabTranslate {
  const { t } = useTranslation();
  return useCallback<LabTranslate>(
    (key, params) => String(t(`labDesk.${key}`, params as Record<string, unknown>)),
    [t],
  );
}

// ── Vocabulary ────────────────────────────────────────────────────────────

export function statusTone(status: LabOrderStatusLike): StatusTone {
  switch (status) {
    case 'ordered':
      return 'neutral';
    case 'collected':
      return 'pending';
    case 'in_progress':
      return 'warning';
    case 'resulted':
      return 'normal';
    case 'cancelled':
    case 'canceled':
    case 'voided':
    case 'entered_in_error':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function statusLabel(tx: LabTranslate, status: LabOrderStatusLike): string {
  if (LAB_ORDER_STATUSES.includes(status as (typeof LAB_ORDER_STATUSES)[number])) {
    return tx(`status.${status}`);
  }
  if (status === 'cancelled' || status === 'canceled') return tx('status.cancelled');
  // An unknown wire value is data, not a reason to print a raw token.
  return status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function urgencyTone(urgency: LabUrgency | null | undefined): StatusTone {
  switch (urgency) {
    case 'stat':
      return 'critical';
    case 'urgent':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function urgencyTint(urgency: LabUrgency | null | undefined): Tint {
  switch (urgency) {
    case 'stat':
      return 'red';
    case 'urgent':
      return 'amber';
    default:
      return 'green';
  }
}

export function urgencyLabel(tx: LabTranslate, urgency: LabUrgency | null | undefined): string {
  switch (urgency) {
    case 'routine':
    case 'urgent':
    case 'stat':
      return tx(`urgency.${urgency}`);
    default:
      return urgency ? urgency.replace(/^\w/, (c) => c.toUpperCase()) : tx('urgency.routine');
  }
}

/** Anything the ordering clinician marked above routine. */
export function isUrgentOrder(urgency: LabUrgency | null | undefined): boolean {
  return urgency === 'urgent' || urgency === 'stat';
}

export function flagTone(flag: string | null | undefined): StatusTone {
  switch ((flag ?? '').toUpperCase()) {
    case 'N':
      return 'normal';
    case 'H':
    case 'L':
      return 'warning';
    case 'C':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function flagLabel(tx: LabTranslate, flag: string | null | undefined): string {
  const f = (flag ?? '').toUpperCase();
  if (f === 'H' || f === 'L' || f === 'N' || f === 'C') return tx(`flag.${f as LabFlag}`);
  return f || tx('flag.none');
}

/** "Name · HEALTH-ID · 34 yrs · Female" — identity only, never clinical history. */
export function patientLine(tx: LabTranslate, p: LabOrderPatient | null | undefined): string {
  if (!p) return tx('row.patientUnknown');
  const years = ageFromDateOfBirth(p.dob);
  return [
    p.display_name?.trim() || null,
    p.health_id,
    years !== null ? tx('row.years', { count: years }) : null,
    p.sex ? sexLabel(p.sex) : null,
  ]
    .filter(Boolean)
    .join('  •  ');
}

// ── Badges ────────────────────────────────────────────────────────────────

export function UrgencyBadge({ urgency, size = 'sm' }: { urgency: LabUrgency | null | undefined; size?: 'sm' | 'md' }) {
  const tx = useLabT();
  return (
    <StatusBadge
      status={urgency ?? 'routine'}
      tone={urgencyTone(urgency)}
      label={urgencyLabel(tx, urgency)}
      icon={urgency === 'stat' ? 'alert-triangle' : urgency === 'urgent' ? 'clock' : undefined}
      size={size}
    />
  );
}

export function LabStatusBadge({ status, size = 'sm' }: { status: LabOrderStatusLike; size?: 'sm' | 'md' }) {
  const tx = useLabT();
  return <StatusBadge status={status} tone={statusTone(status)} label={statusLabel(tx, status)} size={size} />;
}

/** The laboratory's own flag, or a muted "no flag" when none was recorded. */
export function FlagBadge({ flag }: { flag: string | null | undefined }) {
  const tx = useLabT();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!flag) return <Text style={styles.noFlag}>{tx('flag.none')}</Text>;
  return <StatusBadge status={flag} tone={flagTone(flag)} label={flagLabel(tx, flag)} size="sm" />;
}

// ── The order row ─────────────────────────────────────────────────────────

/**
 * One order in the queue.
 *
 *   [flask]  Test name  CODE                      [Urgent] ›
 *            Name • HEALTH-ID • 34 yrs • Female
 *            Ordered 01 Sep 2026 09:27 AM • 3 results
 *
 * The tint follows the urgency (red STAT, amber urgent, green routine) so a
 * technician scanning the list sees the hot samples before reading a word.
 */
export function LabOrderRow({
  order,
  onPress,
}: {
  order: LabOrderSummary;
  onPress: () => void;
  /** Ignored: each order sits in its own card; none draws a hairline. */
  divider?: boolean;
}) {
  const tx = useLabT();
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tint = tintMap[urgencyTint(order.urgency)];

  const ordered = order.ordered_at
    ? tx('row.ordered', { when: formatDateTime(order.ordered_at, '—') })
    : tx('row.orderedUnknown');
  const results = tx('row.results', { count: order.results_count ?? 0 });
  const patient = patientLine(tx, order.patient);
  const title = order.test_code ? `${order.test_name} (${order.test_code})` : order.test_name;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={a11yJoin(title, urgencyLabel(tx, order.urgency), patient, ordered, results)}
      style={styles.row}
    >
      <View style={styles.circle}>
        <Icon name="flask" size={26} color={tint.fg} />
      </View>
      <View style={styles.center}>
        <View style={styles.titleLine}>
          <Text style={styles.title} numberOfLines={2}>
            {order.test_name}
            {order.test_code ? <Text style={styles.code}>{`  ${order.test_code}`}</Text> : null}
          </Text>
          {isUrgentOrder(order.urgency) && <UrgencyBadge urgency={order.urgency} />}
        </View>
        <Text style={styles.meta} numberOfLines={2}>
          {patient}
        </Text>
        <Text style={styles.metaMuted} numberOfLines={1}>
          {`${ordered}  •  ${results}`}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

// ── The count tile ────────────────────────────────────────────────────────

/** A "3 awaiting collection" figure on the desk's landing strip. Tap opens the matching queue. */
export function LabTile({
  icon,
  tint,
  count,
  label,
  onPress,
  emphasise,
}: {
  icon: IconName;
  tint: Tint;
  count: number | null;
  label: string;
  onPress: () => void;
  /** Paint the figure in the critical colour when non-zero (urgent orders). */
  emphasise?: boolean;
}) {
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = tintMap[tint];
  const value = count === null ? '—' : String(count);
  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={a11yJoin(label, value)}
    >
      <View style={styles.tileIcon}>
        <Icon name={icon} size={28} color={skin.fg} />
      </View>
      <Text style={[styles.tileValue, emphasise && count !== null && count > 0 && { color: colors.statusCritical }]}>
        {value}
      </Text>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── The timeline ──────────────────────────────────────────────────────────

/** ordered → collected → in progress → resulted, with the order's state lit. */
export function LabTimeline({ status }: { status: LabOrderStatusLike }) {
  const tx = useLabT();
  const index = labStatusIndex(status);
  const steps = LAB_ORDER_STATUSES.map((key) => ({
    key,
    label: tx(`status.${key}`),
  }));
  // `resulted` is the LAST step and also DONE: light it as completed rather
  // than "current", so a released order shows four ticks, not three and a dot.
  const current = index < 0 ? 0 : index === LAB_ORDER_STATUSES.length - 1 ? LAB_ORDER_STATUSES.length : index;
  return (
    <StepProgress
      steps={steps}
      currentIndex={current}
      accessibilityLabel={tx('timeline.a11y', {
        step: index < 0 ? statusLabel(tx, status) : tx(`status.${LAB_ORDER_STATUSES[index]}`),
      })}
    />
  );
}

// ── Failure state ─────────────────────────────────────────────────────────

/**
 * What a failed desk read means, in words. Four honest states:
 *   • 403 role_forbidden → "not part of your role" (no retry — final);
 *   • 404/405 nothing served → "not available on this server yet";
 *   • 404 with a server sentence → the server's own words;
 *   • anything else → `describeFailure`'s classification, with a retry.
 */
export function LabFailureState({
  error,
  onRetry,
  notServedBody,
}: {
  error: unknown;
  onRetry: () => void;
  /** What WOULD be here once the desk is served — one sentence per screen. */
  notServedBody: string;
}) {
  const tx = useLabT();
  const { t } = useTranslation();
  if (isRoleForbidden(error)) return <RoleRefusedNotice />;
  if (isNotServed(error)) {
    return (
      <EmptyState
        icon="flask"
        tint="green"
        title={tx('shared.notServedTitle')}
        message={notServedBody}
        actionLabel={String(t('opesCore.common.retry'))}
        onAction={onRetry}
      />
    );
  }
  const failure = describeFailure(error);
  return (
    <EmptyState
      icon="alert-circle"
      tint="red"
      title={failure.title}
      message={labServerMessage(error) ?? failure.message}
      actionLabel={String(t('opesCore.common.retry'))}
      onAction={onRetry}
    />
  );
}

// ── Small text bits ───────────────────────────────────────────────────────

/** A muted caption under a card or a button. */
export function LabCaption({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={styles.caption}>{children}</Text>;
}

/** Label above a form field. */
export function FieldLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

// ── Styles ────────────────────────────────────────────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      gap: 12,
    },
    circle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    center: { flex: 1, minWidth: 0, gap: 2 },
    titleLine: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    title: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    code: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    meta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    metaMuted: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    noFlag: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    tile: {
      flexBasis: '47%',
      flexGrow: 1,
      minWidth: 0,
      padding: spacing.sm + 4,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    tileIcon: {
      width: 32,
      height: 32,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      color: colors.textPrimary,
    },
    tileLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    caption: {
      paddingHorizontal: spacing.xs,
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
    },
  });
