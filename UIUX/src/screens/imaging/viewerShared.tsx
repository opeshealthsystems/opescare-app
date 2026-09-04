/**
 * Shared plumbing for the imaging screens (DIA-009 / 010 / 012 / 014).
 *
 * Composition only. Async loading, formatting and flag helpers are reused from
 * the diagnostics slice (`../diagnostics/shared`) rather than re-implemented;
 * what lives here is the handful of patterns the imaging references introduce
 * and the lab screens do not — the blue study tab strip, the labelled fact
 * panel, and a stored-image tile that shows its own loading and failed states.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Icon, type IconName } from '../../components';
import { toneForStatus } from '../../components/StatusBadge';
import { useTranslation, type TFunction } from '../../i18n';
import { colors, radii, spacing, typography, type StatusTone } from '../../theme/theme';
import { titleCase } from '../diagnostics/shared';

export {
  AsyncBoundary,
  DiagButton,
  errorMessage,
  InfoStrip,
  LoadingBlock,
  Overline,
  titleCase,
  useAsync,
} from '../diagnostics/shared';

// Dates and times come from `utils/format` via `detailShared`, so the viewer
// screens and the detail screens print the same string in the same locale.
export { fmtBytes, fmtDate, fmtDateTime, fmtTime } from './detailShared';

// ── Study tab strip ───────────────────────────────────────────────────────

export type StudyTab = { key: string; label: string; onPress?: () => void };

/**
 * The "Summary · Images (4) · Report · Details · Activity" strip across the top
 * of every imaging screen. `SegmentedTabs` is the lab-flag control and paints
 * its active item green; the imaging references use a blue underline with no
 * fill, so this is a separate, purely presentational strip over the same tokens.
 */
export function StudyTabs({ tabs, value }: { tabs: StudyTab[]; value: string }) {
  return (
    <View style={styles.tabs}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <TouchableOpacity
            key={t.key}
            onPress={t.onPress}
            disabled={!t.onPress || on}
            activeOpacity={0.7}
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

// ── Fact panel ────────────────────────────────────────────────────────────

export type Fact = { label: string; value: string };

/** The soft grey "Study ID / Accession No. / Modality / Body Part" block. */
export function FactPanel({ facts, style }: { facts: Fact[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.panel, style]}>
      {facts.map((f) => (
        <View key={f.label} style={styles.panelItem}>
          <Text style={styles.panelLabel}>{f.label}</Text>
          <Text style={styles.panelValue}>{f.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** The same facts laid out as a horizontal strip (the viewer's dark header). */
export function FactStrip({ facts, dark }: { facts: Fact[]; dark?: boolean }) {
  return (
    <View style={styles.strip}>
      {facts.map((f, i) => (
        <View key={f.label} style={[styles.stripItem, i > 0 && (dark ? styles.stripEdgeDark : styles.stripEdge)]}>
          <Text style={[styles.stripLabel, dark && styles.stripLabelDark]} numberOfLines={1}>
            {f.label}
          </Text>
          <Text style={[styles.stripValue, dark && styles.stripValueDark]}>{f.value}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Stored image tile ─────────────────────────────────────────────────────

/**
 * Renders one stored image instance. The URL is a short-lived signed link to
 * the bytes on the server's local disk, so it needs no auth header — but it
 * can still fail (expired signature, no connectivity), and the references never
 * show an empty black square, so both states are drawn explicitly.
 */
export function StoredImage({
  uri,
  style,
  resizeMode = 'contain',
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
  resizeMode?: 'contain' | 'cover';
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  return (
    <View style={[styles.imageWrap, style]}>
      {!failed && (
        <Image
          source={{ uri }}
          resizeMode={resizeMode}
          style={StyleSheet.absoluteFill}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
        />
      )}
      {loading && !failed && (
        <View style={styles.imageState}>
          <ActivityIndicator color={colors.textOnBrand} />
        </View>
      )}
      {failed && (
        <View style={styles.imageState}>
          <Icon name="image" size={26} color={colors.textMuted} />
          <Text style={styles.imageStateText}>{t('imaging.common.imageUnavailable')}</Text>
        </View>
      )}
    </View>
  );
}

// ── Formatting ────────────────────────────────────────────────────────────

/**
 * The app's own name for a scan type, from the modality token. NOT the API's
 * `modality_label` — that is server content and is never translated here.
 *
 * The patient-facing word is "Scan Type" / « Type d’examen », never "Modality"
 * / « Modalité »: a patient knows they had an ultrasound and does not know
 * what a modality is.
 */
const SCAN_TYPE_KEYS: Record<string, string> = {
  xray: 'imaging.scanType.xray',
  ct: 'imaging.scanType.ct',
  mri: 'imaging.scanType.mri',
  ultrasound: 'imaging.scanType.ultrasound',
  mammography: 'imaging.scanType.mammography',
  fluoroscopy: 'imaging.scanType.fluoroscopy',
  other: 'imaging.scanType.other',
};

export function modalityLabel(t: TFunction, modality: string): string {
  const key = SCAN_TYPE_KEYS[modality];
  return key ? t(key) : modality.toUpperCase();
}

/**
 * A study's status in a patient's words, in the active locale.
 *
 * `imaging.status.*` already carries the patient-facing wording ("reported" →
 * "Completed" / « Terminé », "scheduled" → "Scheduled" / « Planifié »). The
 * engine returns the key on a miss, so an unmapped status falls back to
 * `titleCase` rather than printing the raw token in either language. Replaces
 * the ad-hoc `status === 'reported' ? …completed : status` the viewer screens
 * used, which left every non-reported status untranslated.
 */
export function studyStatusLabel(t: TFunction, status: string): string {
  const key = `imaging.status.${status}`;
  const hit = t(key);
  return hit === key ? titleCase(status) : hit;
}

/**
 * An icon that matches the study's state. A green check is only honest for a
 * final, reported study; a cancelled one reads as an error, and anything still
 * in flight (ordered, scheduled, awaiting report) shows a clock — never a tick
 * for work that has not happened.
 */
export function studyStatusIcon(status: string): IconName {
  switch (status) {
    case 'reported':
      return 'check-circle';
    case 'cancelled':
      return 'x-circle';
    default:
      return 'clock';
  }
}

/**
 * Design tone for a study status. A reported study reads green ("Completed");
 * everything else follows the shared keyword map, so a scheduled/ordered study
 * is amber-pending and a cancelled one is critical — never green.
 */
export function studyStatusTone(status: string): StatusTone {
  return status === 'reported' ? 'normal' : toneForStatus(status);
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabOn: { borderBottomColor: colors.blue },
  tabText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  tabTextOn: { fontFamily: typography.fontFamily.semiBold, color: colors.blue },

  panel: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.md - 4,
    gap: 10,
  },
  panelItem: { gap: 1 },
  panelLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  panelValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },

  strip: { flexDirection: 'row', alignItems: 'flex-start' },
  stripItem: { flex: 1, paddingHorizontal: 10, gap: 2 },
  stripEdge: { borderLeftWidth: 1, borderLeftColor: colors.border },
  stripEdgeDark: { borderLeftWidth: 1, borderLeftColor: colors.navyLight },
  stripLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  stripLabelDark: { color: colors.textMuted },
  stripValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
  },
  stripValueDark: { color: colors.textOnBrand },

  imageWrap: {
    backgroundColor: colors.navy,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageState: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  imageStateText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
