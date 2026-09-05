import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { radii, StatusTone, typography, type Palette } from '../theme';
import { useTheme } from '../ThemeProvider';
import { formatLabel } from '../format';
import { Icon, IconName } from './Icon';

const NORMAL = ['completed', 'confirmed', 'active', 'paid', 'success', 'dispensed', 'normal', 'verified', 'taken', 'resolved', 'approved'];
const CRITICAL = ['cancelled', 'canceled', 'failed', 'overdue', 'expired', 'critical', 'abnormal', 'high', 'declined', 'missed', 'voided', 'entered_in_error', 'reversed'];
const WARNING = ['pending_payment', 'partial', 'due', 'low', 'warning', 'refill', 'attention', 'draft', 'amended'];
const PENDING = ['scheduled', 'pending', 'upcoming', 'in_progress', 'ordered', 'issued', 'processing', 'requested'];
const INFO = ['rescheduled', 'referred', 'archived', 'info'];

/**
 * RETRACTION VOCABULARY — why `voided` / `entered_in_error` / `reversed` are
 * CRITICAL and `amended` is WARNING.
 *
 * A clinical record on this platform is never overwritten or deleted: it is
 * amended, voided, reversed, or marked entered-in-error. Those four verbs are
 * the only ways a record stops being true, and until now this map knew none of
 * them — every one fell through to `'neutral'`, the same grey a merely lapsed
 * item gets. A prescription the prescriber TOOK BACK rendered exactly like one
 * that had simply run its course: a safety-legibility failure on a medication
 * list, not a styling nit.
 *
 * The three retractions are `critical` because the record must not be acted
 * on. `amended` is only `warning` — the record still stands, it was revised
 * after the fact, so it wants attention rather than alarm.
 *
 * These tones are not invented here. They are what the screens that could not
 * wait for this fix already do by hand, lifted into the one shared map:
 * `components/meds/shared.tsx` (`RETRACTED_STATUSES` → 'critical', with a
 * comment naming this exact gap), `app/prescriptions/index.tsx` (`headerTone`:
 * retracted → critical, `amended` → warning) and
 * `components/prescriptions/status.tsx` (`isRetracted` → the danger skin).
 *
 * `entered_in_error` covers FHIR's `entered-in-error` as well: the normalizer
 * below folds spaces and hyphens to underscores before the lookup.
 *
 * DELIBERATELY NOT ADDED
 *  - `revoked` — the only screen that shows it is `app/privacy/index.tsx`, for
 *    a consent the PATIENT withdrew on purpose, and it passes an explicit
 *    `tone="neutral"` for that reason. Turning the shared default red would
 *    tell a patient their own considered choice was an error.
 *  - `inactive` / `stopped` / `closed` — "ended", not "taken back". Neutral is
 *    the right answer for them, and that contrast is what makes the
 *    retractions above legible.
 *
 * `active` stays in NORMAL. It is tempting to move it — an ACTIVE allergy or
 * problem is not good news — but in this app `active` overwhelmingly means
 * "live and usable": a fillable prescription, a granted consent, a valid
 * licence, offline mode switched on. Re-toning it would break those four to
 * fix a case whose screens already pass an explicit tone.
 */

/** Map a raw domain status string onto a semantic tone. */
export function toneForStatus(status: string): StatusTone {
  const s = status.toLowerCase().replace(/[\s-]/g, '_');
  if (NORMAL.includes(s)) return 'normal';
  if (CRITICAL.includes(s)) return 'critical';
  if (WARNING.includes(s)) return 'warning';
  if (PENDING.includes(s)) return 'pending';
  if (INFO.includes(s)) return 'info';
  return 'neutral';
}

export type StatusBadgeProps = {
  /** Raw status string; mapped to a tone unless `tone` is given. */
  status: string;
  /** Force a tone, bypassing the keyword map. */
  tone?: StatusTone;
  /**
   * Display text override. `status` still drives the tone; this replaces the
   * shown label — used to render a localized enum (e.g. an encounter status)
   * without changing the value the tone map keys on. Falls back to
   * formatLabel(status) when absent.
   */
  label?: string;
  /** Optional leading icon (CARE-001 "Taken ✓", "Upcoming ⏱"). */
  icon?: IconName;
  /** `sm` for dense table cells, `md` (default) elsewhere. */
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

/**
 * Pill-style status badge.
 *
 * Recipe: pill radius, tinted background, same-hue bold-ish label at 12px,
 * 10px horizontal / 5px vertical padding. See CARE-001 and MED-001.
 */
export function StatusBadge({ status, tone, icon, size = 'md', style, label }: StatusBadgeProps) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const resolved = tone ?? toneForStatus(status);
  const { bg, fg } = statusMap[resolved];

  return (
    <View
      style={[styles.badge, size === 'sm' ? styles.sm : styles.md, { backgroundColor: bg }, style]}
    >
      {!!icon && <Icon name={icon} size={size === 'sm' ? 11 : 13} color={fg} strokeWidth={2} />}
      <Text style={[styles.text, size === 'sm' && styles.textSm, { color: fg }]}>
        {label ?? formatLabel(status)}
      </Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    gap: 4,
    // A pill is a LABEL, not a fixed object: in a row that has run out of
    // width it has to narrow and let its text wrap, rather than keep its
    // natural width and run off the edge of the screen. `minWidth: 0` is what
    // allows that on web, where a flex item's default minimum is its content.
    flexShrink: 1,
    minWidth: 0,
  },
  md: { paddingHorizontal: 10, paddingVertical: 5 },
  sm: { paddingHorizontal: 8, paddingVertical: 3 },
  text: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    // No textTransform: 'capitalize' — CSS capitalises EVERY word, which is
    // wrong for French sentence case ("Compte Rendu À Lire"). formatLabel()
    // upper-cases only the first character, correct in both languages, and
    // leaves an already-cased translated label untouched.
    color: colors.textSecondary,
  },
  textSm: { fontSize: 11 },
});
