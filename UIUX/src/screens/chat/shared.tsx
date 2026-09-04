/**
 * Shared plumbing for the messaging (MSG-002) and financial (BILL-001/002/003)
 * screens.
 *
 * All four references are the same surface: a conversation header, a scrolling
 * column of bubbles and rich cards, a quick-action strip and a composer. Every
 * value here is composed from `src/components` and `src/theme/theme` — no new
 * colours, no inline SVG.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { EmptyState, Icon, IconName, StaleNotice } from '../../components';
import { decorative } from '../../components/a11y';
import { getLocale, translate, useTranslation } from '../../i18n';
import { patientErrorMessage } from '../../lib/errors';
import { colors, radii, spacing, typography, Tint, tintMap } from '../../theme/theme';
import {
  CURRENCY,
  CURRENCY_ISO,
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
} from '../../utils/format';

// ── Async loading ─────────────────────────────────────────────────────────

/**
 * One implementation, not three.
 *
 * This file and `diagnostics/shared.tsx` each carried a byte-for-byte copy of
 * the CARE hook. Offline read and the focus-freshness window had to live in all
 * three or in none, so they now live in one and the copies re-export it.
 */
import type { AsyncState } from '../care/shared';
export { useAsync, FOCUS_FRESH_MS } from '../care/shared';
export type { AsyncState, AsyncOptions } from '../care/shared';

/** Patient-readable failure text — never a raw library string. */
export function errorMessage(e: unknown, fallback?: string): string {
  return patientErrorMessage(e, fallback);
}

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.centre} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.blue} {...decorative} />
      <Text style={styles.centreText}>{label ?? t('chat.chrome.loading')}</Text>
    </View>
  );
}

/** Loading / not-linked / error gate. Renders `children(data)` once loaded. */
export function AsyncBoundary<T>({
  state,
  onLink,
  loadingLabel,
  children,
}: {
  state: AsyncState<T>;
  onLink: () => void;
  loadingLabel?: string;
  children: (data: T) => React.ReactNode;
}) {
  const { t } = useTranslation();
  if (state.data !== null) {
    if (state.stale) {
      return (
        <>
          <StaleNotice
            message={state.error ?? ''}
            loadedAt={state.loadedAt}
            onRetry={state.reload}
            retrying={state.loading}
          />
          {children(state.data)}
        </>
      );
    }
    return <>{children(state.data)}</>;
  }
  if (state.notLinked) {
    return (
      <EmptyState
        icon="id-card"
        tint="amber"
        title={t('chat.chrome.linkTitle')}
        message={t('chat.chrome.linkMessage')}
        actionLabel={t('chat.chrome.linkCta')}
        onAction={onLink}
      />
    );
  }
  if (state.error) {
    return (
      <EmptyState
        icon="alert-circle"
        tint="red"
        title={t('chat.chrome.errorTitle')}
        message={state.error}
        actionLabel={t('chat.chrome.errorRetry')}
        onAction={state.reload}
      />
    );
  }
  return <LoadingBlock label={loadingLabel} />;
}

// ── Formatting ────────────────────────────────────────────────────────────

/**
 * Rule 8: dates, times and money are `src/utils/format.ts`, never the
 * catalogue. These wrappers keep the names the BILL and MSG screens already
 * import while the locale-correct answer comes from one place — so a French
 * receipt reads `32 000 FCFA` and `01 sept. 2026 09:27`, exactly as the
 * desktop prints it.
 */

/** `32000` → `"32,000"` / `"32 000"`. XAF has no minor unit — never decimals. */
export function money(value: number | null | undefined): string {
  return formatNumber(Math.round(Number(value ?? 0)));
}

/** `32000` → `"32,000 FCFA"`. */
export function moneyFull(value: number | null | undefined, currency = CURRENCY_ISO): string {
  return `${money(value)} ${currency === CURRENCY_ISO ? CURRENCY : currency}`;
}

/** `"2026-08-27T20:50:11Z"` → `"08:50 PM"` / `"20:50"`. */
export function chatTime(iso: string | null | undefined): string {
  return formatTime(iso, '');
}

/** `"2026-08-27T20:50:11Z"` → `"27 Aug 2026"` / `"27 août 2026"`. */
export function shortDate(iso: string | null | undefined): string {
  return formatDate(iso, '—');
}

export function dateAndTime(iso: string | null | undefined): string {
  return formatDateTime(iso, '—');
}

/** The day separator label: "Today, 30 May 2026" / "Yesterday" / the date. */
export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(today.getTime() - 86_400_000);
  // A module-level helper cannot hold the hook, so it reads the live locale.
  const date = shortDate(iso);
  if (same(d, today)) return translate(getLocale(), 'chat.chrome.today', { date });
  if (same(d, yesterday)) return translate(getLocale(), 'chat.chrome.yesterday', { date });
  return date;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').replace(/^Dr\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ── Buttons ───────────────────────────────────────────────────────────────

export type ChatButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  loading?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
};

const buttonSkin: Record<NonNullable<ChatButtonProps['variant']>, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.blue, fg: colors.textOnBrand, border: colors.blue },
  secondary: { bg: colors.surface, fg: colors.link, border: colors.border },
  ghost: { bg: colors.primarySoft, fg: colors.link, border: colors.primarySoft },
};

/** The flat, 1px-bordered button used across the BILL and MSG references. */
export function ChatButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  disabled,
  loading,
  size = 'md',
  style,
}: ChatButtonProps) {
  const skin = buttonSkin[variant];
  const off = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.8}
      accessibilityRole="button"
      style={[
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: skin.bg, borderColor: skin.border },
        off && styles.buttonOff,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={skin.fg} />
      ) : (
        <>
          {!!icon && <Icon name={icon} size={18} color={skin.fg} />}
          <Text style={[styles.buttonLabel, size === 'sm' && styles.buttonLabelSm, { color: skin.fg }]}>{label}</Text>
          {!!iconRight && <Icon name={iconRight} size={18} color={skin.fg} />}
        </>
      )}
    </TouchableOpacity>
  );
}

// ── Conversation chrome ───────────────────────────────────────────────────

export type ChatHeaderProps = {
  name: string;
  subtitle?: string | null;
  /** Third line with a location pin (MSG-002 facility). */
  place?: string | null;
  online?: boolean;
  verified?: boolean;
  compact?: boolean;
  onBack: () => void;
  onCall?: () => void;
  onMore?: () => void;
  onProfile?: () => void;
  /** Avatar tint circle glyph — `person` for a provider, `building` for a facility. */
  avatarIcon?: IconName;
};

/** The provider/facility bar at the top of every MSG / BILL reference. */
export function ChatHeader({
  name,
  subtitle,
  place,
  online,
  verified,
  compact,
  onBack,
  onCall,
  onMore,
  onProfile,
  avatarIcon = 'person',
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const size = compact ? 48 : 62;
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={10}
        activeOpacity={0.7}
        style={styles.headerBack}
        accessibilityRole="button"
        accessibilityLabel={t('chat.chrome.backA11y')}
      >
        <Icon name="chevron-left" size={24} color={colors.link} strokeWidth={2.2} />
      </TouchableOpacity>

      <View style={[styles.avatarWrap, { width: size, height: size }]} {...decorative}>
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
          <Icon name={avatarIcon} size={compact ? 22 : 28} color={colors.tintBlue} />
        </View>
        {!!online && <View style={styles.onlineDot} />}
      </View>

      <View style={styles.headerBody}>
        <View style={styles.headerNameRow}>
          <Text style={[styles.headerName, compact && styles.headerNameCompact]} numberOfLines={1}>
            {name}
          </Text>
          {!!verified && <Icon name="check-circle" size={16} color={colors.statusNormal} strokeWidth={2} />}
        </View>
        {!!subtitle && (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        {compact
          ? !!online && (
              <View style={styles.headerMetaRow}>
                <View style={styles.onlineDotInline} />
                <Text style={styles.headerOnline}>{t('chat.chrome.online')}</Text>
              </View>
            )
          : !!place && (
              <View style={styles.headerMetaRow}>
                <Icon name="location" size={16} color={colors.textSecondary} />
                <Text style={styles.headerMeta} numberOfLines={1}>
                  {place}
                </Text>
              </View>
            )}
      </View>

      <View style={styles.headerActions}>
        {!compact && !!onProfile && (
          <ChatButton
            label={t('chat.chrome.viewProfile')}
            icon="person"
            variant="secondary"
            size="sm"
            onPress={onProfile}
          />
        )}
        {!!onCall && (
          <TouchableOpacity
            onPress={onCall}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('chat.chrome.callA11y')}
          >
            <Icon name="phone" size={22} color={colors.link} />
          </TouchableOpacity>
        )}
        {!!onMore && (
          <TouchableOpacity
            onPress={onMore}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('chat.chrome.moreA11y')}
          >
            <Icon name="more-vertical" size={22} color={colors.link} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/**
 * The soft blue "end-to-end encrypted" strip under the MSG-002 header.
 *
 * The claim is deliberately no larger in French than in English: end-to-end
 * encryption plus HIPAA conformity, and nothing about who else can read the
 * thread inside the hospital.
 */
export function EncryptionBanner({ text }: { text?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.encryption}>
      <Icon name="lock" size={18} color={colors.link} />
      <Text style={styles.encryptionText}>{text ?? t('chat.chrome.encryption')}</Text>
    </View>
  );
}

/** "Today, 30 May 2026" between two hairlines. */
export function DayDivider({ label }: { label: string }) {
  return (
    <View style={styles.dayRow}>
      <View style={styles.dayLine} />
      <Text style={styles.dayLabel}>{label}</Text>
      <View style={styles.dayLine} />
    </View>
  );
}

/** The pill-shaped "Today" chip used by the BILL references. */
export function DayChip({ label }: { label: string }) {
  return (
    <View style={styles.dayRow}>
      <View style={styles.dayLine} />
      <View style={styles.dayChip}>
        <Text style={styles.dayChipText}>{label}</Text>
      </View>
      <View style={styles.dayLine} />
    </View>
  );
}

/** A left (inbound) or right (outbound, mine) text bubble. */
export function Bubble({
  mine,
  body,
  time,
  senderName,
  showAvatar = true,
  pending,
  failed,
  read,
}: {
  mine: boolean;
  body: string;
  time: string;
  senderName?: string | null;
  showAvatar?: boolean;
  pending?: boolean;
  failed?: boolean;
  /** True once the recipient has actually read it — blue vs grey ticks. */
  read?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      {!mine && showAvatar && <Avatar name={senderName} />}
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {!mine && !!senderName && <Text style={styles.bubbleSender}>{senderName}</Text>}
        <Text style={styles.bubbleText}>{body}</Text>
        <View style={styles.bubbleFooter}>
          <Text style={styles.bubbleTime}>
            {failed ? t('chat.chrome.notSent') : pending ? t('chat.chrome.sending') : time}
          </Text>
          {mine && !pending && !failed && (
            <Icon name="check-double" size={15} color={read ? colors.link : colors.textMuted} strokeWidth={2} />
          )}
          {mine && failed && <Icon name="alert-circle" size={14} color={colors.statusCritical} strokeWidth={2} />}
        </View>
      </View>
    </View>
  );
}

export function Avatar({ name, size = 34 }: { name?: string | null; size?: number }) {
  return (
    <View style={[styles.msgAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.msgAvatarText, { fontSize: size <= 34 ? 12 : 14 }]}>{initials(name)}</Text>
    </View>
  );
}

/** The wrapper every rich in-chat card sits in: avatar + bordered card + time. */
export function CardBubble({
  senderName,
  time,
  children,
  showAvatar = true,
}: {
  senderName?: string | null;
  time: string;
  showAvatar?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.bubbleRow}>
      {showAvatar && <Avatar name={senderName} />}
      <View style={styles.cardBubble}>
        {children}
        <Text style={styles.cardBubbleTime}>{time}</Text>
      </View>
    </View>
  );
}

/** The card head: tint circle + title (+ subtitle) and a right-hand badge. */
export function CardHeading({
  icon,
  tint = 'blue',
  title,
  subtitle,
  meta,
  right,
}: {
  icon: IconName;
  tint?: Tint;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  right?: React.ReactNode;
}) {
  const t = tintMap[tint];
  return (
    <View style={styles.cardHeading}>
      <View style={[styles.cardHeadingCircle, { backgroundColor: t.bg }]}>
        <Icon name={icon} size={20} color={t.fg} />
      </View>
      <View style={styles.cardHeadingBody}>
        <Text style={styles.cardHeadingTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.cardHeadingSubtitle}>{subtitle}</Text>}
      </View>
      <View style={styles.cardHeadingRight}>
        {right}
        {!!meta && <Text style={styles.cardHeadingMeta}>{meta}</Text>}
      </View>
    </View>
  );
}

/** A blue-on-soft-blue band, e.g. "TOTAL PAYABLE  32,000 FCFA". */
export function TotalBand({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalBand}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
    </View>
  );
}

/** The soft info strip with a leading icon (invoice note, "valid receipt"). */
export function InfoStrip({
  icon = 'info',
  title,
  text,
  right,
}: {
  icon?: IconName;
  title?: string;
  text: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.infoStrip}>
      <Icon name={icon} size={20} color={colors.link} />
      <View style={styles.infoStripBody}>
        {!!title && <Text style={styles.infoStripTitle}>{title}</Text>}
        <Text style={styles.infoStripText}>{text}</Text>
      </View>
      {right}
    </View>
  );
}

/** "All transactions are secure and encrypted." */
export function SecureNote({ text }: { text?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.secureNote}>
      <Icon name="lock" size={16} color={colors.link} />
      <Text style={styles.secureNoteText}>{text ?? t('chat.chrome.secureNote')}</Text>
    </View>
  );
}

/** A label/value row inside a detail table. */
export function DetailRow({
  label,
  value,
  valueColor,
  bold,
  divider = true,
  trailing,
}: {
  label: string;
  value?: string;
  valueColor?: string;
  bold?: boolean;
  divider?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={[styles.detailRow, divider && styles.detailRowDivided]}>
      <Text style={styles.detailLabel}>{label}</Text>
      {trailing ?? (
        <Text style={[styles.detailValue, bold && styles.detailValueBold, !!valueColor && { color: valueColor }]}>
          {value}
        </Text>
      )}
    </View>
  );
}

/** The 3–5 quick actions above the composer. */
export function QuickActionStrip({
  actions,
}: {
  actions: { icon: IconName; label: string; tint?: Tint; onPress: () => void }[];
}) {
  return (
    <View style={styles.quickStrip}>
      {actions.map((a, i) => {
        const t = tintMap[a.tint ?? 'blue'];
        return (
          <TouchableOpacity
            key={a.label}
            onPress={a.onPress}
            activeOpacity={0.75}
            style={[styles.quickItem, i > 0 && styles.quickItemDivided]}
            accessibilityRole="button"
            accessibilityLabel={a.label}
          >
            <View style={[styles.quickCircle, { backgroundColor: t.bg }]}>
              <Icon name={a.icon} size={18} color={t.fg} />
            </View>
            <Text style={styles.quickLabel} numberOfLines={2}>
              {a.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Pill actions under a BILL card ("View Invoice", "Need Help?"). */
export function PillActions({ actions }: { actions: { icon: IconName; label: string; onPress: () => void }[] }) {
  return (
    <View style={styles.pillRow}>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.label}
          onPress={a.onPress}
          activeOpacity={0.8}
          style={styles.pill}
          accessibilityRole="button"
          accessibilityLabel={a.label}
        >
          <Icon name={a.icon} size={16} color={colors.link} />
          <Text style={styles.pillLabel}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** The message composer. `onSend` is awaited; the field clears only on success. */
export function Composer({
  placeholder,
  onSend,
  onAttach,
  sending,
  disabled,
  disabledNote,
}: {
  placeholder?: string;
  onSend: (body: string) => Promise<void> | void;
  /** Opens the workflow-widget picker (WGT-001). Omit to keep the clip inert. */
  onAttach?: () => void;
  sending?: boolean;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !sending && !disabled;

  if (disabled && disabledNote) {
    return (
      <View style={styles.composerWrap}>
        <Text style={styles.composerNote}>{disabledNote}</Text>
      </View>
    );
  }

  return (
    <View style={styles.composerWrap}>
      <View style={styles.composer}>
        {onAttach ? (
          <TouchableOpacity
            onPress={onAttach}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel={t('chat.chrome.attachA11y')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="paperclip" size={20} color={colors.link} />
          </TouchableOpacity>
        ) : (
          <Icon name="paperclip" size={20} color={colors.link} />
        )}
        <TextInput
          style={styles.composerInput}
          value={text}
          onChangeText={setText}
          placeholder={placeholder ?? t('chat.chrome.composerPlaceholder')}
          placeholderTextColor={colors.textMuted}
          multiline
          editable={!sending}
          autoComplete="off"
          textContentType="none"
          accessibilityLabel={placeholder ?? t('chat.chrome.composerPlaceholder')}
        />
        <Icon name="smile" size={20} color={colors.link} />
      </View>
      <TouchableOpacity
        onPress={async () => {
          const body = text.trim();
          if (!body) return;
          setText('');
          try {
            await onSend(body);
          } catch {
            // The screen surfaces the failure; put the draft back so nothing is lost.
            setText(body);
          }
        }}
        disabled={!canSend}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('chat.chrome.sendA11y')}
        style={[styles.sendButton, !canSend && styles.sendButtonOff]}
      >
        {sending ? (
          <ActivityIndicator size="small" color={colors.textOnBrand} />
        ) : (
          <Icon name="send" size={20} color={colors.textOnBrand} strokeWidth={2} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  centreText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  // Buttons
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
  },
  buttonSm: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: radii.sm + 2 },
  buttonOff: { opacity: 0.55 },
  buttonLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md },
  buttonLabelSm: { fontSize: typography.size.sm },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBack: { paddingRight: 2 },
  avatarWrap: { alignItems: 'center', justifyContent: 'center' },
  avatar: {
    backgroundColor: colors.tintBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.statusNormal,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  onlineDotInline: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.statusNormal },
  headerBody: { flex: 1, minWidth: 0 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  headerNameCompact: { fontSize: typography.size.md + 2 },
  headerSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  headerMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary, flexShrink: 1 },
  headerOnline: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.statusNormal },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },

  // Encryption strip
  encryption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm + 2,
    padding: spacing.sm + 4,
    borderRadius: radii.sm + 2,
    backgroundColor: colors.primarySoft,
  },
  encryptionText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },

  // Day divider
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, marginVertical: spacing.xs },
  dayLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dayLabel: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link },
  dayChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  dayChipText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link },

  // Bubbles
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm + 4,
    borderWidth: 1,
  },
  bubbleTheirs: { backgroundColor: colors.surface, borderColor: colors.border, borderBottomLeftRadius: radii.sm - 4 },
  bubbleMine: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
    borderBottomRightRadius: radii.sm - 4,
  },
  bubbleSender: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  bubbleText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.md,
    color: colors.textPrimary,
  },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  bubbleTime: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },

  msgAvatar: {
    backgroundColor: colors.tintBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  msgAvatarText: { fontFamily: typography.fontFamily.semiBold, color: colors.tintBlue },

  // Rich card bubble
  cardBubble: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    gap: spacing.sm + 2,
  },
  cardBubbleTime: {
    alignSelf: 'flex-end',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  cardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 2 },
  cardHeadingCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardHeadingBody: { flex: 1, minWidth: 0 },
  cardHeadingTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.link,
  },
  cardHeadingSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  cardHeadingRight: { alignItems: 'flex-end', gap: 4 },
  cardHeadingMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },

  totalBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm + 2,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm + 4,
  },
  totalLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    letterSpacing: 0.6,
    color: colors.link,
  },
  totalValue: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.lg, color: colors.link },

  infoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm + 2,
    padding: spacing.sm + 4,
  },
  infoStripBody: { flex: 1, minWidth: 0 },
  infoStripTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  infoStripText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  secureNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secureNoteText: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 11,
  },
  detailRowDivided: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  detailLabel: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  detailValue: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  detailValueBold: { fontFamily: typography.fontFamily.semiBold },

  quickStrip: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm + 2,
  },
  quickItem: { flex: 1, alignItems: 'center', gap: 5, paddingHorizontal: 2 },
  quickItemDivided: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  quickCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  quickLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    lineHeight: 13,
    color: colors.link,
    textAlign: 'center',
  },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillLabel: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link },

  composerWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  composer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  composerInput: {
    flex: 1,
    maxHeight: 96,
    paddingVertical: 6,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  composerNote: {
    flex: 1,
    textAlign: 'center',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonOff: { opacity: 0.45 },
});
