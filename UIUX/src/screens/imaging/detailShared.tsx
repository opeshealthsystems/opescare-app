/**
 * Additional plumbing for the imaging detail screens (DIA-007 / 008 / 011 / 015).
 *
 * `./shared.tsx` holds the pieces the viewer screens introduced — the study tab
 * strip, the grey fact panel, the stored-image tile. This file adds what the
 * list and the report/order detail screens need on top: an authenticated
 * thumbnail, the status/flag vocabulary, and the label-value rows the order
 * detail is built from. Composition only; every colour is a token.
 */
import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  type ImagingResultFlag,
  type ImagingStatus,
  type PortalImagingStudy,
} from '../../api';
import { Icon, IconName } from '../../components';
import { a11yJoin } from '../../components/a11y';
import { useTranslation, type TFunction } from '../../i18n';
import { colors, radii, spacing, StatusTone, typography } from '../../theme/theme';
import { formatDate, formatDateTime, formatTime } from '../../utils/format';

export type StudyThumbProps = {
  url?: string | null;
  width?: number;
  height?: number;
  radius?: number;
  selected?: boolean;
};

/**
 * A study image, or a placeholder mark when the study has none / the signed
 * link has expired. `url` is a short-lived signed link, so no auth header.
 */
export function StudyThumb({
  url,
  width = 92,
  height,
  radius = radii.sm,
  selected,
}: StudyThumbProps) {
  const [failed, setFailed] = useState(false);
  const box = {
    width,
    height: height ?? width,
    borderRadius: radius,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? colors.blue : colors.border,
  };

  if (!url || failed) {
    return (
      <View style={[styles.thumb, box]}>
        <Icon name="image" size={Math.max(18, Math.min(28, width / 3))} color={colors.textMuted} />
      </View>
    );
  }

  return (
    <View style={[styles.thumb, box]}>
      <Image
        source={{ uri: url }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
      {selected && (
        <View style={styles.thumbCheck}>
          <Icon name="check" size={12} color={colors.textOnBrand} strokeWidth={2.4} />
        </View>
      )}
    </View>
  );
}

// ── Status / flag vocabulary ──────────────────────────────────────────────

/**
 * `reported` reads as "Completed" / « Terminé » to a patient; the rest keep
 * their own word. `t` is passed in rather than hooked because the callers are
 * `.map()` bodies and plain helpers, not components.
 */
export function statusLabel(t: TFunction, status: ImagingStatus): string {
  switch (status) {
    case 'reported':
      return t('imaging.status.reported');
    case 'performed':
      return t('imaging.status.performed');
    case 'ordered':
      return t('imaging.status.ordered');
    case 'scheduled':
      return t('imaging.status.scheduled');
    case 'cancelled':
      return t('imaging.status.cancelled');
    default:
      return status;
  }
}

export function statusTone(status: ImagingStatus): StatusTone {
  switch (status) {
    case 'reported':
      return 'normal';
    case 'cancelled':
      return 'critical';
    case 'performed':
      return 'warning';
    default:
      return 'pending';
  }
}

export function statusIcon(status: ImagingStatus): IconName {
  switch (status) {
    case 'reported':
      return 'check-circle';
    case 'cancelled':
      return 'x-circle';
    case 'scheduled':
      return 'calendar-check';
    default:
      return 'clock';
  }
}

export function flagTone(flag: ImagingResultFlag | null): StatusTone {
  switch (flag) {
    case 'normal':
      return 'normal';
    case 'critical':
      return 'critical';
    case 'abnormal':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** DIA-007 shows a green "Normal" chip, or an amber "See Report" chip. */
export function flagLabel(t: TFunction, study: PortalImagingStudy): string | null {
  if (!study.has_report) return null;
  return study.result_flag === 'normal' ? t('imaging.flag.normal') : t('imaging.flag.seeReport');
}

export function priorityTone(priority: string): StatusTone {
  switch (priority) {
    case 'stat':
      return 'critical';
    case 'urgent':
      return 'warning';
    default:
      return 'warning';
  }
}

// ── Small layout pieces ───────────────────────────────────────────────────

/** An icon + blue title heading (DIA-015 "Examination", "Scheduling"). */
export function CardHeading({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.cardHeading}>
      <Icon name={icon} size={20} color={colors.blue} />
      <Text style={styles.cardHeadingText}>{label}</Text>
    </View>
  );
}

/** Left label / right value line — the DIA-015 detail tables. */
export function DetailLine({
  label,
  value,
  valueNode,
  last,
}: {
  label: string;
  value?: string | null;
  valueNode?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View
      style={[styles.detailLine, !last && styles.detailLineGap]}
      accessible={!valueNode}
      accessibilityLabel={valueNode ? undefined : a11yJoin(label, value && value.length ? value : undefined)}
    >
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailValueBox}>
        {valueNode ?? <Text style={styles.detailValue}>{value && value.length ? value : '—'}</Text>}
      </View>
    </View>
  );
}

/** Icon + label / value stack (DIA-008 "Key Details", the DIA-011 strip). */
export function IconFact({
  icon,
  label,
  value,
  valueColor,
  dot,
}: {
  icon: IconName;
  label: string;
  value: string;
  valueColor?: string;
  dot?: string;
}) {
  return (
    <View style={styles.iconFact} accessible accessibilityLabel={a11yJoin(label, value)}>
      <Icon name={icon} size={18} color={colors.blue} />
      <View style={styles.iconFactBody}>
        <Text style={styles.iconFactLabel}>{label}</Text>
        <View style={styles.iconFactValueRow}>
          {!!dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
          <Text style={[styles.iconFactValue, !!valueColor && { color: valueColor }]}>{value}</Text>
        </View>
      </View>
    </View>
  );
}

/** Splits a stored multi-line clinical narrative into bullet lines. */
export function narrativeLines(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[•\-\s]+/, '').trim())
    .filter(Boolean);
}

export function Bullets({ lines }: { lines: string[] }) {
  return (
    <View style={styles.bullets}>
      {lines.map((line, i) => (
        <View key={`${i}-${line.slice(0, 12)}`} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

/** Person identity block — patient, referrer, radiologist. */
export function PersonBlock({
  name,
  lines,
  icon = 'person',
  compact,
}: {
  name: string;
  lines: (string | null | undefined)[];
  icon?: IconName;
  compact?: boolean;
}) {
  return (
    <View style={styles.person}>
      <View style={[styles.personAvatar, compact && styles.personAvatarSm]}>
        <Icon name={icon} size={compact ? 18 : 26} color={colors.blue} />
      </View>
      <View style={styles.personBody}>
        <Text style={styles.personName}>{name}</Text>
        {lines.filter(Boolean).map((l) => (
          <Text key={l as string} style={styles.personLine}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Icon-over-label tab strip (DIA-015). */
export function IconTabs<T extends string>({
  value,
  tabs,
  onChange,
}: {
  value: T;
  tabs: { key: T; label: string; icon: IconName }[];
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.iconTabs}>
      {tabs.map((t) => {
        const on = t.key === value;
        const fg = on ? colors.blue : colors.textMuted;
        return (
          <TouchableOpacity
            key={t.key}
            onPress={() => onChange(t.key)}
            activeOpacity={0.75}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.iconTab, on && styles.iconTabOn]}
          >
            <Icon name={t.icon} size={20} color={fg} />
            <Text style={[styles.iconTabText, { color: fg }]} numberOfLines={1}>
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export type StudyTabKey = 'summary' | 'images' | 'report' | 'details' | 'activity';

/**
 * The "Summary · Images (4) · Report · Details · Activity" strip across the top
 * of the study screens. `SegmentedTabs` paints a filled active pill; the imaging
 * references use a blue underline with no fill, so this is its own strip built
 * from the same tokens.
 */
export function StudyTabStrip({
  value,
  imageCount,
  onSelect,
}: {
  value: StudyTabKey;
  imageCount: number;
  onSelect: (key: StudyTabKey) => void;
}) {
  const { t } = useTranslation();
  const tabs: { key: StudyTabKey; label: string }[] = [
    { key: 'summary', label: t('imaging.tabs.summary') },
    { key: 'images', label: t('imaging.tabs.images', { count: imageCount }) },
    { key: 'report', label: t('imaging.tabs.report') },
    { key: 'details', label: t('imaging.tabs.details') },
    { key: 'activity', label: t('imaging.tabs.activity') },
  ];

  return (
    <View style={styles.tabs}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <TouchableOpacity
            key={t.key}
            onPress={() => onSelect(t.key)}
            disabled={on}
            activeOpacity={0.75}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.tab, on && styles.tabOn]}
          >
            <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Technical details disclosure ──────────────────────────────────────────

export type TechnicalFact = { label: string; value?: string | null };

/**
 * Collapsed home for the identifiers a patient does not need — the DICOM study
 * UID, the accession number, the internal order reference. They stay available
 * (a clinic will ask for them) but they no longer compete with the thing the
 * patient came to read: what the study was and what it found.
 *
 * Renders nothing when every fact is empty.
 */
export function TechnicalDetails({
  facts,
  caption,
}: {
  facts: TechnicalFact[];
  /** Overrides the default framing; the default is translated, so leave it unset. */
  caption?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const shown = facts.filter((f) => !!f.value && f.value !== '—');
  if (shown.length === 0) return null;

  return (
    <View style={styles.tech}>
      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? t('imaging.tech.hide') : t('imaging.tech.show')}
        style={styles.techToggle}
      >
        <Icon name="info" size={16} color={colors.textSecondary} />
        <Text style={styles.techToggleText}>{t('imaging.tech.title')}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      {open ? (
        <View style={styles.techBody}>
          {shown.map((f) => (
            <View key={f.label} style={styles.techRow}>
              <Text style={styles.techLabel}>{f.label}</Text>
              <Text style={styles.techValue} selectable>
                {f.value}
              </Text>
            </View>
          ))}
          <Text style={styles.techCaption}>{caption ?? t('imaging.tech.caption')}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The `MODALITY` pill above a study title. */
export function ModalityChip({ label }: { label: string }) {
  return (
    <View style={styles.modalityChip}>
      <Text style={styles.modalityChipText}>{label.toUpperCase()}</Text>
    </View>
  );
}

/**
 * Dates, times and money do not belong in the catalogue (contract rule 8):
 * `utils/format` reads the same locale and matches the desktop's conventions —
 * `07 Jun 2024` / `07 juin 2024`, and a 24-hour clock in French, which is what
 * a Cameroonian hospital uses. These three wrappers exist only to keep the
 * imaging screens' `—` for a missing value.
 */
export const fmtDate = (iso?: string | null) => formatDate(iso, '—');
export const fmtTime = (iso?: string | null) => formatTime(iso, '—');
export const fmtDateTime = (iso?: string | null) => formatDateTime(iso, '—');

/** "294 KB" / "1.4 MB" — the size the reference prints beside a report. */
export function fmtBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "07 Jun 2024  •  10:30 AM" — the date line on a DIA-007 row. */
export const studyDateLine = (iso?: string | null) => `${fmtDate(iso)}  •  ${fmtTime(iso)}`;

const styles = StyleSheet.create({
  thumb: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardHeadingText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.link,
  },

  detailLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  detailLineGap: { marginBottom: 12 },
  detailLabel: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  detailValueBox: { flex: 1.2, alignItems: 'flex-start' },
  detailValue: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  iconFact: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, flex: 1, minWidth: 0 },
  iconFactBody: { flex: 1, minWidth: 0 },
  iconFactLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  iconFactValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  iconFactValue: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.statusNormal },

  bullets: { gap: 6 },
  bulletRow: { flexDirection: 'row', gap: spacing.sm },
  bulletDot: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  bulletText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  person: { flexDirection: 'row', gap: spacing.sm + 4, alignItems: 'flex-start' },
  personAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarSm: { width: 30, height: 30, borderRadius: 15 },
  personBody: { flex: 1, minWidth: 0, gap: 2 },
  personName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  personLine: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  iconTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  iconTab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  iconTabOn: { borderBottomColor: colors.blue },
  iconTabText: { fontFamily: typography.fontFamily.medium, fontSize: 11 },

  tabs: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 2,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabOn: { borderBottomColor: colors.blue },
  tabText: { fontFamily: typography.fontFamily.medium, fontSize: 13, color: colors.textMuted },
  tabTextOn: { fontFamily: typography.fontFamily.semiBold, color: colors.link },

  tech: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  techToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  techToggleText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  techBody: { marginTop: 6, gap: 8 },
  techRow: { gap: 1 },
  techLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  techValue: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
  },
  techCaption: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
  },
  modalityChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm - 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modalityChipText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.4,
    color: colors.link,
  },
});
