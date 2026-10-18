import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Icon, spacing, useTheme, type IconName, type Tint } from '@/components/opes-ui';
import { useProfileStyles } from './styles';

export type OverviewTile = {
  key: string;
  icon: IconName;
  tint: Tint;
  value: string;
  label: string;
  hint: string;
  /** Absent draws a static tile with no chevron. */
  onPress?: () => void;
};

export type OverviewRing = {
  percent: number;
  label: string;
  hint: string;
  onPress: () => void;
};

/**
 * The "Quick overview" block: a heading with an optional trailing link, then
 * counted tiles (and optionally the completeness ring), measured so four
 * across only happens where four fit — otherwise a 2x2.
 */
export function OverviewTiles({
  title,
  action,
  tiles,
  ring,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  tiles: OverviewTile[];
  ring?: OverviewRing;
}) {
  const { colors } = useTheme();
  const styles = useProfileStyles();
  const [overviewWidth, setOverviewWidth] = useState(0);
  const { width: windowWidth } = useWindowDimensions();

  /**
   * Four across needs ~72pt each before the labels start breaking words; a
   * 320pt screen only offers 67.5pt, so it wraps to a 2x2 instead of
   * clipping. The ring is sized from the cell rather than pinned at 58pt.
   */
  const grid = useMemo(() => {
    const gap = spacing.sm - 2;
    const w = overviewWidth || windowWidth - spacing.md * 2;
    const fourUp = (w - gap * 3) / 4;
    const cols = fourUp >= 72 ? 4 : 2;
    const cell = Math.floor((w - gap * (cols - 1)) / cols);
    const ringSize = Math.max(44, Math.min(58, cell - spacing.sm * 2 - 4));
    return { cell, ring: ringSize, stroke: ringSize >= 52 ? 5 : 4 };
  }, [overviewWidth, windowWidth]);

  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <View style={styles.blockHeadLeft}>
          <Icon name="bar-chart" size={18} color={colors.blue} />
          <Text style={styles.blockTitle}>{title}</Text>
        </View>
        {action ? (
          <TouchableOpacity
            onPress={action.onPress}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={styles.blockAction}
          >
            <Text style={styles.blockActionText}>{action.label}</Text>
            <Icon name="chevron-right" size={14} color={colors.link} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.overviewRow} onLayout={(e) => setOverviewWidth(e.nativeEvent.layout.width)}>
        {tiles.map((tile) => (
          <OverviewCard key={tile.key} tile={tile} width={grid.cell} />
        ))}
        {ring ? (
          <ProfileRingCard
            width={grid.cell}
            ring={grid.ring}
            stroke={grid.stroke}
            percent={ring.percent}
            label={ring.label}
            hint={ring.hint}
            onPress={ring.onPress}
          />
        ) : null}
      </View>
    </View>
  );
}

/** A counted overview tile: tinted mark, chevron, figure, label, hint. */
export function OverviewCard({ tile, width }: { tile: OverviewTile; width: number }) {
  const { colors, tintMap } = useTheme();
  const styles = useProfileStyles();
  const skin = tintMap[tile.tint];
  const body = (
    <>
      <View style={styles.overviewTop}>
        <View style={[styles.overviewMark, { backgroundColor: skin.bg }]}>
          <Icon name={tile.icon} size={17} color={skin.fg} />
        </View>
        {tile.onPress ? <Icon name="chevron-right" size={14} color={colors.textMuted} /> : null}
      </View>
      <Text style={styles.overviewValue}>{tile.value}</Text>
      <Text style={styles.overviewLabel} numberOfLines={2}>
        {tile.label}
      </Text>
      <Text style={styles.overviewHint} numberOfLines={2}>
        {tile.hint}
      </Text>
    </>
  );
  const a11y = `${tile.value} ${tile.label}. ${tile.hint}`;
  return tile.onPress ? (
    <TouchableOpacity
      onPress={tile.onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[styles.overviewCard, { width }]}
    >
      {body}
    </TouchableOpacity>
  ) : (
    <View accessible accessibilityLabel={a11y} style={[styles.overviewCard, { width }]}>
      {body}
    </View>
  );
}

/**
 * The completeness ring. Drawn from stroked View segments rather than SVG: a
 * full ring in the track colour with a quarter arc per 25%, capped at four,
 * with the exact figure printed in the middle either way.
 */
export function ProfileRingCard({
  percent,
  label,
  hint,
  onPress,
  width,
  ring,
  stroke,
}: {
  percent: number;
  label: string;
  hint: string;
  onPress: () => void;
  width: number;
  ring: number;
  stroke: number;
}) {
  const { colors } = useTheme();
  const styles = useProfileStyles();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${percent}%. ${hint}`}
      style={[styles.overviewCard, { width }]}
    >
      <View style={[styles.ringWrap, { width: ring, height: ring }]}>
        <View
          style={[
            styles.ringTrack,
            { width: ring, height: ring, borderRadius: ring / 2, borderWidth: stroke },
          ]}
        />
        <View
          style={[
            styles.ringFill,
            { width: ring, height: ring, borderRadius: ring / 2, borderWidth: stroke },
            {
              borderTopColor: percent >= 25 ? colors.statusNormal : 'transparent',
              borderRightColor: percent >= 50 ? colors.statusNormal : 'transparent',
              borderBottomColor: percent >= 75 ? colors.statusNormal : 'transparent',
              borderLeftColor: percent >= 100 ? colors.statusNormal : 'transparent',
            },
          ]}
        />
        <Text style={styles.ringText}>{percent}%</Text>
      </View>
      <Text style={styles.overviewLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.overviewHint} numberOfLines={2}>
        {hint}
      </Text>
    </TouchableOpacity>
  );
}
