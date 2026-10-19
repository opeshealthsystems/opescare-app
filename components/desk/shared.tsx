/**
 * Shared pieces for the FRONT DESK slice (`app/clinician/desk/**`).
 *
 * Composition only: every colour, radius, type size and icon comes from
 * `@/components/opes-ui`; dates from `@/components/care/shared`; the status
 * vocabulary from `lib/api/deskQueries.ts`. A receptionist's screen shows
 * different FACTS from a clinician's — the whole facility's book, the
 * patient's short name and Health ID, who the row is routed to — not a
 * different design system.
 *
 * NOTHING IN HERE FETCHES. Screens own their queries.
 *
 * i18n: every string is `t('desk.…')` against keys that exist in BOTH
 * locales (`lib/i18n/locales/{en,fr}.json`, added through the shared helper).
 * No `defaultValue` anywhere, so a missing key is caught by the static check
 * rather than papered over in English.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  EmptyState,
  Icon,
  StatusBadge,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { describeFailure, fmtTime } from '@/components/care/shared';
import { statusLabelOf, typeIconOf, typeLabelOf } from '@/components/care/apptLabels';
import { roleLabelKey } from '@/lib/staffCapabilities';
import {
  deskStatusFamily,
  isNotServed,
  isRoleForbidden,
  type DeskAppointment,
  type DeskHomeCounts,
  type DeskPatientRef,
  type DeskProvider,
  type DeskStatusFamily,
} from '@/lib/api/deskQueries';

type T = ReturnType<typeof useTranslation>['t'];

// ── Vocabulary ─────────────────────────────────────────────────────────────

/**
 * The family → label map, spelled out key by key (no string building) so the
 * static locale check can see every key this file needs.
 */
export function deskStatusLabel(t: T, status: string | null | undefined): string {
  switch (deskStatusFamily(status)) {
    case 'awaiting':
      return t('desk.status.awaiting');
    case 'confirmed':
      return t('desk.status.confirmed');
    case 'checked_in':
      return t('desk.status.checked_in');
    case 'in_progress':
      return t('desk.status.in_progress');
    case 'completed':
      return t('desk.status.completed');
    case 'cancelled':
      return t('desk.status.cancelled');
    case 'no_show':
      return t('desk.status.no_show');
    default:
      // A spelling nobody mapped: the appointment vocabulary humanises it. Never a bare key.
      return statusLabelOf(t, status) || t('desk.status.unknown');
  }
}

/** Filter-chip wording for a family — the same words as the badge, plus "All". */
export function deskFamilyFilterLabel(t: T, family: DeskStatusFamily | 'all'): string {
  if (family === 'all') return t('desk.filter.all');
  return deskStatusLabel(t, family === 'awaiting' ? 'scheduled' : family === 'checked_in' ? 'arrived' : family);
}

export function deskStatusTone(status: string | null | undefined): StatusTone {
  switch (deskStatusFamily(status)) {
    case 'awaiting':
      return 'pending';
    case 'confirmed':
      return 'normal';
    case 'checked_in':
    case 'in_progress':
      return 'info';
    case 'completed':
      return 'normal';
    case 'cancelled':
      return 'critical';
    case 'no_show':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function deskStatusIcon(status: string | null | undefined): IconName {
  switch (deskStatusFamily(status)) {
    case 'awaiting':
      return 'clock';
    case 'confirmed':
      return 'check-circle';
    case 'checked_in':
      return 'location';
    case 'in_progress':
      return 'activity';
    case 'completed':
      return 'check-double';
    case 'cancelled':
      return 'x-circle';
    case 'no_show':
      return 'alert-circle';
    default:
      return 'clipboard';
  }
}

/** Tint for the time block on a row: closed-bad states amber, done green, live blue. */
export function deskRowTint(status: string | null | undefined): Tint {
  switch (deskStatusFamily(status)) {
    case 'completed':
      return 'green';
    case 'cancelled':
    case 'no_show':
      return 'amber';
    case 'checked_in':
    case 'in_progress':
      return 'purple';
    default:
      return 'blue';
  }
}

/** The patient's short name as the server sent it; never a UUID, never blank. */
export function patientShortName(t: T, p: DeskPatientRef | null | undefined): string {
  return p?.display_name?.trim() || t('desk.patient.fallback');
}

/** "Dr Amara Diallo · Doctor" or the neutral "Unassigned". */
export function providerLabel(t: T, p: DeskProvider | null | undefined): string {
  if (!p) return t('desk.unassigned');
  return p.name?.trim() || t('desk.provider.fallback');
}

/** The role under a clinician's name, from the app's role catalogue. */
export function providerRoleLabel(t: T, p: DeskProvider | null | undefined): string {
  if (!p?.role) return '';
  return t(roleLabelKey(p.role));
}

export function DeskStatusBadge({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  return (
    <StatusBadge
      status={status}
      tone={deskStatusTone(status)}
      label={deskStatusLabel(t, status)}
      icon={deskStatusIcon(status)}
      size={size}
    />
  );
}

// ── One row of the book ────────────────────────────────────────────────────

/**
 * Time-first: the receptionist reads the clock, then who, then who is seeing
 * them. `Unassigned` is a badge, not a blank — an unrouted row is something to
 * act on, and it must be visible as such.
 */
export function DeskAppointmentRow({ appointment: a, onPress }: { appointment: DeskAppointment; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = tintMap[deskRowTint(a.status)];
  const name = patientShortName(t, a.patient);
  const type = typeLabelOf(t, a.appointment_type);
  const who = a.provider ? providerLabel(t, a.provider) : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={[
        fmtTime(a.scheduled_at),
        name,
        a.patient.health_id ?? '',
        type,
        who ?? t('desk.unassigned'),
        deskStatusLabel(t, a.status),
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <View style={[styles.timeBlock, { backgroundColor: skin.bg }]}>
        <Text style={[styles.timeText, { color: skin.fg }]}>{fmtTime(a.scheduled_at)}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {!!a.patient.health_id && (
          <Text style={styles.healthId} numberOfLines={1}>
            {a.patient.health_id}
          </Text>
        )}
        <View style={styles.typeRow}>
          <Icon name={typeIconOf(a.appointment_type)} size={14} color={colors.textMuted} />
          <Text style={styles.type} numberOfLines={1}>
            {type}
          </Text>
        </View>
        <View style={styles.whoRow}>
          {who ? (
            <>
              <Icon name="stethoscope" size={13} color={colors.textSecondary} />
              <Text style={styles.who} numberOfLines={1}>
                {who}
              </Text>
            </>
          ) : (
            <UnassignedBadge />
          )}
        </View>
      </View>

      <View style={styles.trailing}>
        <DeskStatusBadge status={a.status} size="sm" />
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

/** The amber "Unassigned" pill — the row still needs a clinician. */
export function UnassignedBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  return <StatusBadge status="unassigned" tone="warning" label={t('desk.unassigned')} icon="person" size={size} />;
}

// ── The day's counts (server-side numbers only) ────────────────────────────

/**
 * Five tiles from `GET /home`. Every figure is the server's; when the read
 * failed the tiles are simply not drawn — a dash would still be a claim.
 */
export function DeskTiles({
  counts,
  active,
  onPress,
}: {
  counts: DeskHomeCounts;
  /** Which family the book is currently filtered to, so its tile reads pressed. */
  active: DeskStatusFamily | 'all';
  onPress: (family: DeskStatusFamily | 'all') => void;
}) {
  const { t } = useTranslation();
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const tiles: {
    key: DeskStatusFamily | 'all';
    label: string;
    value: number;
    tint: Tint;
    icon: IconName;
  }[] = [
    {
      key: 'all',
      label: t('desk.tiles.today'),
      value: counts.today_total,
      tint: 'blue',
      icon: 'calendar',
    },
    {
      key: 'awaiting',
      label: t('desk.tiles.awaiting'),
      value: counts.awaiting_confirmation,
      tint: 'amber',
      icon: 'clock',
    },
    {
      key: 'checked_in',
      label: t('desk.tiles.checkedIn'),
      value: counts.checked_in,
      tint: 'purple',
      icon: 'location',
    },
    {
      key: 'no_show',
      label: t('desk.tiles.noShow'),
      value: counts.no_show,
      tint: 'amber',
      icon: 'alert-circle',
    },
    {
      key: 'cancelled',
      label: t('desk.tiles.cancelled'),
      value: counts.cancelled,
      tint: 'red',
      icon: 'x-circle',
    },
  ];

  return (
    <View style={styles.tiles}>
      {tiles.map((tile) => {
        const skin = tintMap[tile.tint];
        const on = active === tile.key;
        return (
          <TouchableOpacity
            key={tile.key}
            onPress={() => onPress(tile.key)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${tile.label}: ${tile.value}`}
            style={[styles.tile, on && { borderColor: skin.fg }]}
          >
            <View style={styles.tileIcon}>
              <Icon name={tile.icon} size={28} color={skin.fg} />
            </View>
            <Text style={[styles.tileValue, { color: skin.fg }]}>{tile.value}</Text>
            <Text style={styles.tileLabel} numberOfLines={2}>
              {tile.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Failure states ─────────────────────────────────────────────────────────

/**
 * The honest empty state for a desk read that failed with nothing on screen:
 *   • the role does not hold `front_desk`      → amber shield, no retry;
 *   • this server does not serve the desk yet  → blue calendar, "not available";
 *   • anything else                            → red, the classified failure + retry.
 */
export function DeskFailureState({
  error,
  onRetry,
  notServedMessage,
}: {
  error: unknown;
  onRetry?: () => void;
  /** The desk-specific sentence for "not served" — what WILL appear here once it is. */
  notServedMessage: string;
}) {
  const { t } = useTranslation();
  if (isRoleForbidden(error)) {
    return (
      <EmptyState
        icon="shield"
        tint="amber"
        title={t('opesDoctor.roleGate.serverRefusedTitle')}
        message={t('opesDoctor.roleGate.serverRefusedBody')}
      />
    );
  }
  if (isNotServed(error)) {
    return (
      <EmptyState
        icon="calendar"
        tint="blue"
        title={t('desk.notServedTitle')}
        message={notServedMessage}
        actionLabel={onRetry ? t('opesCore.common.retry') : undefined}
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
      actionLabel={onRetry ? t('opesCore.common.retry') : undefined}
      onAction={onRetry}
    />
  );
}

// ── Small form furniture ───────────────────────────────────────────────────

/** A label above an input — the pill has no label of its own. */
export function FieldLabel({ text, hint }: { text: string; hint?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.fieldLabel}>{text}</Text>
      {!!hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

/** One fact, `label` then `value`, inside a card. */
export function FactRow({
  icon,
  tint = 'blue',
  label,
  value,
  trailing,
}: {
  icon: IconName;
  tint?: Tint;
  label: string;
  value: string;
  trailing?: React.ReactNode;
}) {
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = tintMap[tint];
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}, ${value}`}>
      <View style={styles.factCircle}>
        <Icon name={icon} size={26} color={skin.fg} />
      </View>
      <View style={styles.factText}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{value}</Text>
      </View>
      {trailing}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md - 4,
      padding: spacing.md - 2,
    },
    timeBlock: {
      width: 72,
      borderRadius: radii.md,
      paddingVertical: 12,
      paddingHorizontal: 4,
      alignItems: 'center',
    },
    timeText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
    },
    body: { flex: 1, minWidth: 0, gap: 2 },
    name: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    healthId: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      letterSpacing: 0.4,
      color: colors.textMuted,
    },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    type: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    whoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
      minHeight: 20,
    },
    who: {
      flex: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    trailing: {
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
      gap: spacing.md,
    },

    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    tile: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: 100,
      padding: spacing.sm + 2,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
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
      marginTop: 2,
    },
    tileLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    fieldLabelRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.xs,
      marginLeft: spacing.xs,
    },
    fieldLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    fieldHint: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    fact: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      paddingVertical: spacing.sm + 2,
    },
    factCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    factText: { flex: 1, minWidth: 0, gap: 1 },
    factLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    factValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
  });
