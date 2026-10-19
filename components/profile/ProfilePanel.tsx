import React, { useMemo, useState } from 'react';
import {
  Image,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Icon, spacing, useTheme, type IconName, type Tint } from '@/components/opes-ui';
import { HEALTH_ID_ART } from '@/components/health-id/assets';
import { useProfileStyles } from './styles';

export type Fact = {
  /** Spans both columns — for a field whose value runs to two lines. */
  wide?: boolean;
  icon: IconName;
  tint: Tint;
  label: string;
  value: string;
  sub?: string;
  onPress?: () => void;
};

export type LinkTile = {
  icon: IconName;
  tint: Tint;
  label: string;
  onPress: () => void;
  /** Unread count; absent or 0 draws no badge. */
  badge?: number;
  /** Beyond the first four — revealed by "View all". */
  extra?: boolean;
};

/** Panel header: rounded brand mark, title, subtitle, optional trailing action. */
export function PanelHeader({
  icon,
  title,
  subtitle,
  actionLabel,
  actionIcon,
  onAction,
  style,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useProfileStyles();
  return (
    <View style={[styles.panelHead, style]}>
      <View style={styles.panelMark}>
        <Icon name={icon} size={24} color={colors.blue} />
      </View>
      <View style={styles.panelHeadText}>
        <Text style={styles.panelTitle} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.panelSub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={styles.panelAction}
        >
          {actionIcon ? <Icon name={actionIcon} size={14} color={colors.link} /> : null}
          <Text style={styles.panelActionText} numberOfLines={1}>
            {actionLabel}
          </Text>
          {actionIcon ? null : <Icon name="chevron-right" size={14} color={colors.link} />}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * A section card in the profile language: brand-marked header over content.
 * `seal` debosses the OpesCare seal into the corner as stationery, never a
 * claim.
 */
export function ProfilePanel({
  icon,
  title,
  subtitle,
  actionLabel,
  actionIcon,
  onAction,
  seal,
  flush,
  children,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  seal?: boolean;
  /** Content sits edge to edge (list rows) under a padded header. */
  flush?: boolean;
  children?: React.ReactNode;
}) {
  const styles = useProfileStyles();
  return (
    <Card style={[styles.panel, flush && { paddingHorizontal: 0, paddingBottom: 0 }]}>
      <View style={flush ? { paddingHorizontal: spacing.md } : undefined}>
        <PanelHeader
          icon={icon}
          title={title}
          subtitle={subtitle}
          actionLabel={actionLabel}
          actionIcon={actionIcon}
          onAction={onAction}
        />
      </View>
      {seal ? <PanelSeal /> : null}
      {children}
    </Card>
  );
}

/** The debossed seal in a panel's corner. Decorative and hidden from readers. */
export function PanelSeal() {
  const styles = useProfileStyles();
  return (
    <Image
      source={HEALTH_ID_ART.seal}
      style={styles.panelSeal}
      resizeMode="contain"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      alt=""
    />
  );
}

/** The two-column fact grid. */
export function FactGrid({ facts }: { facts: Fact[] }) {
  const styles = useProfileStyles();
  return (
    <View style={styles.factGrid}>
      {facts.map((fact, index) => (
        <FactCell
          key={fact.label}
          fact={fact}
          // A rule only where a cell actually sits on the other side of it:
          // never against a full-width field, and never trailing into the
          // empty half of an odd last row.
          rule={!fact.wide && index % 2 === 0 && !!facts[index + 1] && !facts[index + 1]!.wide}
        />
      ))}
    </View>
  );
}

/** One cell of the two-column fact grid. */
export function FactCell({ fact, rule }: { fact: Fact; rule: boolean }) {
  const { colors, tintMap } = useTheme();
  const styles = useProfileStyles();
  const skin = tintMap[fact.tint];
  const body = (
    <>
      <View style={styles.factMark}>
        <Icon name={fact.icon} size={26} color={skin.fg} />
      </View>
      <View style={styles.factBody}>
        <Text style={styles.factLabel} numberOfLines={1}>
          {fact.label}
        </Text>
        <Text style={styles.factValue} numberOfLines={2}>
          {fact.value}
        </Text>
        {fact.sub ? (
          <Text style={styles.factSub} numberOfLines={1}>
            {fact.sub}
          </Text>
        ) : null}
      </View>
      {fact.onPress ? <Icon name="chevron-right" size={14} color={colors.textMuted} /> : null}
    </>
  );

  return (
    <View style={[styles.factCell, fact.wide && styles.factCellWide, rule && styles.factCellRule]}>
      {fact.onPress ? (
        <TouchableOpacity
          onPress={fact.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${fact.label}: ${fact.value}`}
          style={styles.factInner}
        >
          {body}
        </TouchableOpacity>
      ) : (
        <View
          style={styles.factInner}
          accessible
          accessibilityLabel={`${fact.label}: ${fact.value}`}
        >
          {body}
        </View>
      )}
    </View>
  );
}

/**
 * A grid of tinted square link tiles. Columns and an exact tile width come
 * from the measured grid, and tiles do not grow, so a short last row sits
 * left-aligned rather than stretching to fill a hole.
 */
export function TileGrid({ tiles }: { tiles: LinkTile[] }) {
  const styles = useProfileStyles();
  const [gridWidth, setGridWidth] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const grid = useMemo(() => {
    const gap = spacing.sm;
    const w = gridWidth || windowWidth - spacing.md * 4;
    const cols = Math.max(2, Math.min(4, Math.floor((w + gap) / (68 + gap))));
    const tile = Math.min(132, Math.floor((w - gap * (cols - 1)) / cols));
    return { cols, tile };
  }, [gridWidth, windowWidth]);
  return (
    <View style={styles.tileGrid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
      {tiles.map((tile) => (
        <LinkTileView key={tile.label} tile={tile} width={grid.tile} />
      ))}
    </View>
  );
}

/** One tinted square tile. */
export function LinkTileView({ tile, width }: { tile: LinkTile; width: number }) {
  const { t } = useTranslation();
  const { tintMap } = useTheme();
  const styles = useProfileStyles();
  const skin = tintMap[tile.tint];
  return (
    <TouchableOpacity
      onPress={tile.onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={
        tile.badge
          ? `${tile.label}, ${t('profile.unreadBadge', { n: tile.badge, defaultValue: '{{n}} unread' })}`
          : tile.label
      }
      style={[styles.linkTile, { width, backgroundColor: skin.bg }]}
    >
      <View style={styles.linkTileTop}>
        <Icon name={tile.icon} size={22} color={skin.fg} />
        {tile.badge ? (
          <View style={styles.linkTileBadge}>
            <Text style={styles.linkTileBadgeText}>{tile.badge > 9 ? '9+' : tile.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.linkTileLabel} numberOfLines={3}>
        {tile.label}
      </Text>
    </TouchableOpacity>
  );
}

/** The green privacy footer with the motto column on wide-enough screens. */
export function PrivacyFooter({ title, body }: { title: string; body: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useProfileStyles();
  const { width: windowWidth } = useWindowDimensions();
  // Below 360pt the decorative motto column drops — the trust strip already
  // says the same three words.
  const showPrivacyMotto = windowWidth >= 360;
  return (
    <View style={styles.privacy}>
      <View style={styles.privacyMark}>
        <Icon name="shield-check" size={22} color={colors.statusNormal} />
      </View>
      <View style={styles.privacyBody}>
        <Text style={styles.privacyTitle}>{title}</Text>
        <Text style={styles.privacyText}>{body}</Text>
      </View>
      {showPrivacyMotto ? (
        <>
          <View style={styles.privacyRule} />
          <Text style={styles.privacyMotto}>
            {t('profile.privacyMotto', { defaultValue: 'SECURE\nINTEROPERABLE\nPEOPLE-CENTERED' })}
          </Text>
        </>
      ) : null}
    </View>
  );
}

/** The outlined red sign-out button that closes a profile. */
export function SignOutButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useProfileStyles();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={styles.signOut}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Icon name="logout" size={18} color={colors.statusCritical} />
      <Text style={styles.signOutText}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * A section in the profile language for content that is already its own
 * card(s): the brand-marked header stands above them instead of wrapping them.
 */
export function ProfileSection({
  icon,
  title,
  subtitle,
  actionLabel,
  actionIcon,
  onAction,
  children,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <PanelHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        actionLabel={actionLabel}
        actionIcon={actionIcon}
        onAction={onAction}
      />
      {children}
    </View>
  );
}
