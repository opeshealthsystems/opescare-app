/**
 * Shared pieces for the doctor's schedule slice.
 *
 * Composition only: every colour, radius, type size and icon comes from
 * `src/theme/theme` and `src/components`, and the async plumbing, date
 * formatting and status pill are the patient app's own (`screens/care/shared`).
 * A doctor screen shows different *facts* from a patient screen — the patient's
 * name rather than the provider's — not a different design system.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon, IconName } from '../../components';
import type {
  StaffAppointment,
  StaffAppointmentStatus,
  StaffAppointmentType,
} from '../../api/doctorScheduling';
import type { AppointmentType } from '../../api';
import { getLocale, translator, useTranslation } from '../../i18n';
import { formatTime } from '../../utils/format';
import { colors, radii, spacing, typography, Tint, tintMap } from '../../theme/theme';
import { StatusPill, dayShort, monthShort, typeIcon, typeLabel } from '../care/shared';

/** A `t` for the module-level helpers below — same pattern as `utils/format`. */
const tr = () => translator(getLocale());

/** The statuses that still need the clinician to decide whether to take it. */
export const REQUEST_STATUSES: StaffAppointmentStatus[] = ['scheduled'];

/** Statuses that are still live on the day (what a schedule leads with). */
export const ACTIVE_STATUSES: StaffAppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'arrived',
  'in_progress',
];

/**
 * The staff column is wider than the staff writer's `Rule::in` list, so a row
 * can carry a type the patient vocabulary knows (`lab`, `telemedicine`) or one
 * neither knows. Fall back to the generic wording rather than showing a raw
 * enum such as `follow_up`.
 */
export function staffTypeLabel(type: StaffAppointmentType | null): string {
  if (!type) return tr()('doctor.vocab.appointmentTypeFallback');
  return typeLabel(type as AppointmentType);
}

export function staffTypeIcon(type: StaffAppointmentType | null): IconName {
  if (!type) return 'stethoscope';
  return typeIcon(type as AppointmentType);
}

export function isTelemedicine(a: StaffAppointment): boolean {
  return a.visit_mode === 'telemedicine' || a.appointment_type === 'telemedicine';
}

/** "31 y • F • OPES-24-AEDL-4L8D" — the clinical shorthand line under a name. */
export function patientLine(a: StaffAppointment): string {
  const bits: string[] = [];
  const age = ageFrom(a.patient_dob);
  if (age !== null) bits.push(`${age} y`);
  const sex = a.patient_sex ? a.patient_sex[0]?.toUpperCase() : null;
  if (sex) bits.push(sex);
  if (a.patient_medical_id) bits.push(a.patient_medical_id);
  return bits.join(' • ');
}

export function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const before =
    now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (before) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** The name to show. Never a bare UUID — the API omits the name on some paths. */
export function patientName(a: StaffAppointment): string {
  return a.patient_name?.trim() || tr()('doctor.vocab.patientFallback');
}

/** Time-first row: a doctor between consultations reads the clock first. */
export function ScheduleRow({
  appointment,
  onPress,
  showDate,
}: {
  appointment: StaffAppointment;
  onPress: () => void;
  showDate?: boolean;
}) {
  const { t } = useTranslation();
  const a = appointment;
  const d = new Date(a.scheduled_at);
  const tint: Tint =
    a.status === 'completed' ? 'green' : a.status === 'cancelled' || a.status === 'no_show' ? 'amber' : 'blue';
  const skin = tintMap[tint];

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.row} accessibilityRole="button">
      <View style={[styles.timeBlock, { backgroundColor: skin.bg }]}>
        <Text style={[styles.timeText, { color: skin.fg }]}>{formatTime(a.scheduled_at)}</Text>
        {showDate && (
          <Text style={styles.timeDate}>
            {dayShort(d)} {String(d.getDate()).padStart(2, '0')} {monthShort(d)}
          </Text>
        )}
        {!!a.duration_minutes && (
          <Text style={styles.timeDuration}>
            {t('doctor.schedule.minutes', { count: a.duration_minutes })}
          </Text>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {patientName(a)}
        </Text>
        {!!patientLine(a) && (
          <Text style={styles.meta} numberOfLines={1}>
            {patientLine(a)}
          </Text>
        )}
        <View style={styles.typeRow}>
          <Icon name={staffTypeIcon(a.appointment_type)} size={14} color={colors.textMuted} />
          <Text style={styles.type} numberOfLines={1}>
            {staffTypeLabel(a.appointment_type)}
            {a.reason ? ` — ${a.reason}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.trailing}>
        <StatusPill status={a.status} size="sm" />
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

/** A count that is always derived from rows actually on screen. */
export function CountStrip({ items }: { items: { label: string; value: number; tint: Tint }[] }) {
  return (
    <View style={styles.counts}>
      {items.map((c) => {
        const skin = tintMap[c.tint];
        return (
          <View key={c.label} style={styles.count}>
            <Text style={[styles.countValue, { color: skin.fg }]}>{c.value}</Text>
            <Text style={styles.countLabel}>{c.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md - 4,
    padding: spacing.md - 2,
  },
  timeBlock: { width: 78, borderRadius: radii.md, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center' },
  timeText: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.sm },
  timeDate: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.4,
    color: colors.textMuted,
    marginTop: 2,
  },
  timeDuration: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 2,
  },

  body: { flex: 1, minWidth: 0, gap: 2 },
  name: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  meta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  type: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  trailing: { alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', gap: spacing.md },

  counts: { flexDirection: 'row', gap: spacing.sm },
  count: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  countValue: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.lg },
  countLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
});
