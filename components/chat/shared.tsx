/**
 * Shared chat chrome — the OPES MSG-002 conversation surface, ported from
 * `UIUX/src/screens/chat/shared.tsx` for the Finder app.
 *
 * Pure presentation: no API calls, no navigation. Every colour comes from the
 * active kit palette (`useTheme()`), every glyph from the kit `<Icon>`, every
 * string from the app's i18next catalog (`opesChat.chrome.*`). Loading /
 * error gating is expressed over a TanStack-Query-shaped state rather than the
 * OPES `useAsync` hook, because that is what the Finder's data layer returns.
 */
import React, { useMemo, useState } from 'react';
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
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  decorative,
  EmptyState,
  formatDate,
  formatDateTime,
  formatTime,
  Icon,
  initialsFrom,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type Tint,
} from '@/components/opes-ui';

// ── Async loading ─────────────────────────────────────────────────────────

/** The slice of a TanStack `UseQueryResult` the boundary needs. */
export type QueryLike<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetching?: boolean;
  refetch: () => unknown;
};

/**
 * Patient-readable failure text — never a raw library string.
 *
 * Only a validation reply (422) carries a message written for the person
 * typing; anything else (401, 5xx, a network drop) falls back to the screen's
 * own translated copy.
 */
export function errorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { status?: number; data?: { message?: unknown } } } | null | undefined;
  const status = err?.response?.status;
  const message = err?.response?.data?.message;
  if (status === 422 && typeof message === 'string' && message.trim()) return message;
  return fallback;
}

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.centre} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.blue} {...decorative} />
      <Text style={styles.centreText}>{label ?? t('opesChat.chrome.loading')}</Text>
    </View>
  );
}

/** Failure state with a retry — the red-tinted `EmptyState` of the references. */
export function ErrorBlock({
  title,
  message,
  onRetry,
  retryLabel,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="alert-circle"
      tint="red"
      title={title ?? t('opesChat.chrome.errorTitle')}
      message={message}
      actionLabel={onRetry ? (retryLabel ?? t('opesChat.chrome.errorRetry')) : undefined}
      onAction={onRetry}
    />
  );
}

/**
 * Loading / error / empty gate. Renders `children(data)` once loaded. A failed
 * refetch that still has data keeps showing the data — the screen decides
 * whether to surface the stale refresh.
 */
export function AsyncBoundary<T>({
  state,
  loadingLabel,
  errorLabel,
  isEmpty,
  empty,
  children,
}: {
  state: QueryLike<T>;
  loadingLabel?: string;
  /** Translated copy for the failure state; the server text is never shown raw. */
  errorLabel?: string;
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  const { t } = useTranslation();
  if (state.data !== undefined && state.data !== null) {
    if (isEmpty?.(state.data) && empty !== undefined) return <>{empty}</>;
    return <>{children(state.data)}</>;
  }
  if (state.isError) {
    return (
      <ErrorBlock
        message={errorMessage(state.error, errorLabel ?? t('opesChat.chrome.errorTitle'))}
        onRetry={() => state.refetch()}
      />
    );
  }
  return <LoadingBlock label={loadingLabel} />;
}

// ── Formatting ────────────────────────────────────────────────────────────
// Dates and times come from the kit's `format.ts`, which reads the same
// i18next locale as the screens — a French thread prints `20:50`, an English
// one `08:50 PM`.

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

/** The day separator label: "Today, 30 May 2026" / "Yesterday, …" / the date. */
export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const date = shortDate(iso);
  // A module-level helper cannot hold the hook, so it reads i18next directly;
  // the calling screen re-renders on a language switch and re-evaluates it.
  if (same(d, today)) return String(i18next.t('opesChat.chrome.today', { date }));
  if (same(d, yesterday)) return String(i18next.t('opesChat.chrome.yesterday', { date }));
  return date;
}

/**
 * Up to two initials for an avatar; honorifics are dropped.
 *
 * The rule now lives in the kit (`initialsFrom`) — its own copy of the
 * honorific regex could not strip "Dr." and left the dot behind as an initial,
 * so "Dr. Amara Diallo" rendered ".D". Kept as a named export because the chat
 * screens import it from here.
 */
export function initials(name: string | null | undefined): string {
  return initialsFrom(name);
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = {
    primary: { bg: colors.blue, fg: colors.textOnBrand, border: colors.blue },
    secondary: { bg: colors.surface, fg: colors.link, border: colors.border },
    ghost: { bg: colors.primarySoft, fg: colors.link, border: colors.primarySoft },
  }[variant];
  const off = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
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
  /** When given, the avatar shows these initials instead of `avatarIcon`. */
  avatarName?: string | null;
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
  avatarName,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const size = compact ? 48 : 62;
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={10}
        activeOpacity={0.7}
        style={styles.headerBack}
        accessibilityRole="button"
        accessibilityLabel={t('opesChat.chrome.backA11y')}
      >
        <Icon name="chevron-left" size={24} color={colors.link} strokeWidth={2.2} />
      </TouchableOpacity>

      <View style={[styles.avatarWrap, { width: size, height: size }]} {...decorative}>
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
          {avatarName ? (
            <Text style={[styles.avatarInitials, compact && styles.avatarInitialsCompact]}>{initials(avatarName)}</Text>
          ) : (
            <Icon name={avatarIcon} size={compact ? 22 : 28} color={colors.tintBlue} />
          )}
        </View>
        {!!online && <View style={styles.onlineDot} />}
      </View>

      <View style={styles.headerBody}>
        <View style={styles.headerNameRow}>
          <Text
            style={[styles.headerName, compact && styles.headerNameCompact]}
            numberOfLines={1}
            accessibilityRole="header"
          >
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
                <Text style={styles.headerOnline}>{t('opesChat.chrome.online')}</Text>
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
            label={t('opesChat.chrome.viewProfile')}
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
            accessibilityLabel={t('opesChat.chrome.callA11y')}
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
            accessibilityLabel={t('opesChat.chrome.moreA11y')}
          >
            <Icon name="more-vertical" size={22} color={colors.link} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/**
 * The soft "encrypted" strip under the MSG-002 header. Pass `text` to state
 * exactly what this deployment guarantees — the default is the template's copy.
 */
export function EncryptionBanner({ text }: { text?: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.encryption}>
      <Icon name="lock" size={18} color={colors.link} />
      <Text style={styles.encryptionText}>{text ?? t('opesChat.chrome.encryption')}</Text>
    </View>
  );
}

/** "Today, 30 May 2026" between two hairlines. */
export function DayDivider({ label }: { label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

export const AVATAR_SIZE = 34;

export function Avatar({ name, size = AVATAR_SIZE }: { name?: string | null; size?: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.msgAvatar, { width: size, height: size, borderRadius: size / 2 }]} {...decorative}>
      <Text style={[styles.msgAvatarText, { fontSize: size <= AVATAR_SIZE ? 12 : 14 }]}>{initials(name)}</Text>
    </View>
  );
}

/** A left (inbound) or right (outbound, mine) text bubble. */
export function Bubble({
  mine,
  body,
  time,
  senderName,
  avatarName,
  showAvatar = true,
  pending,
  failed,
  read,
  tick = 'double',
}: {
  mine: boolean;
  body: string;
  time: string;
  /** Printed inside an inbound bubble (group threads). Omit for a 1:1 thread. */
  senderName?: string | null;
  /** Initials for the inbound avatar; falls back to `senderName`. */
  avatarName?: string | null;
  /** Inbound only. `false` keeps the avatar gutter so clustered bubbles align. */
  showAvatar?: boolean;
  pending?: boolean;
  failed?: boolean;
  /** True once the recipient has actually read it — link vs muted ticks. */
  read?: boolean;
  /** `double` = delivered/read receipts exist; `single` = the API only knows "sent". */
  tick?: 'single' | 'double';
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tickName: IconName = tick === 'single' ? 'check' : 'check-double';
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      {!mine && (showAvatar ? <Avatar name={avatarName ?? senderName} /> : <View style={styles.avatarGutter} />)}
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, pending && styles.bubblePending]}>
        {!mine && !!senderName && <Text style={styles.bubbleSender}>{senderName}</Text>}
        <Text style={styles.bubbleText}>{body}</Text>
        <View style={styles.bubbleFooter}>
          <Text style={styles.bubbleTime}>
            {failed ? t('opesChat.chrome.notSent') : pending ? t('opesChat.chrome.sending') : time}
          </Text>
          {mine && pending && <Icon name="clock" size={13} color={colors.textMuted} strokeWidth={2} />}
          {mine && !pending && !failed && (
            <Icon name={tickName} size={15} color={read ? colors.link : colors.textMuted} strokeWidth={2} />
          )}
          {mine && failed && <Icon name="alert-circle" size={14} color={colors.statusCritical} strokeWidth={2} />}
        </View>
      </View>
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.bubbleRow}>
      {showAvatar && <Avatar name={senderName} />}
      <View style={styles.cardBubble}>
        {children}
        {!!time && <Text style={styles.cardBubbleTime}>{time}</Text>}
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
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tone = tintMap[tint];
  return (
    <View style={styles.cardHeading}>
      <View style={[styles.cardHeadingCircle, { backgroundColor: tone.bg }]}>
        <Icon name={icon} size={20} color={tone.fg} />
      </View>
      <View style={styles.cardHeadingBody}>
        <Text style={styles.cardHeadingTitle} numberOfLines={2}>
          {title}
        </Text>
        {!!subtitle && <Text style={styles.cardHeadingSubtitle}>{subtitle}</Text>}
      </View>
      {(!!right || !!meta) && (
        <View style={styles.cardHeadingRight}>
          {right}
          {!!meta && <Text style={styles.cardHeadingMeta}>{meta}</Text>}
        </View>
      )}
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.quickStrip}>
      {actions.map((a, i) => {
        const tone = tintMap[a.tint ?? 'blue'];
        return (
          <TouchableOpacity
            key={a.label}
            onPress={a.onPress}
            activeOpacity={0.75}
            style={[styles.quickItem, i > 0 && styles.quickItemDivided]}
            accessibilityRole="button"
            accessibilityLabel={a.label}
          >
            <View style={[styles.quickCircle, { backgroundColor: tone.bg }]}>
              <Icon name={a.icon} size={18} color={tone.fg} />
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

/** Pill actions under a card ("View Invoice", "Need Help?"). */
export function PillActions({ actions }: { actions: { icon: IconName; label: string; onPress: () => void }[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

/**
 * The message composer. `onSend` is awaited; the field clears optimistically
 * and the draft is put back if `onSend` throws, so nothing typed is lost.
 */
export function Composer({
  placeholder,
  onSend,
  onAttach,
  sending,
  disabled,
  disabledNote,
  error,
  maxLength,
  bottomInset = 0,
}: {
  placeholder?: string;
  onSend: (body: string) => Promise<void> | void;
  /** Opens an attachment picker. Omit and no clip is drawn — no inert controls. */
  onAttach?: () => void;
  sending?: boolean;
  disabled?: boolean;
  /** Replaces the whole composer with a note (e.g. "This conversation is closed."). */
  disabledNote?: string;
  /** Send failure surfaced above the field; the draft is already restored. */
  error?: string | null;
  /** Hard cap; a counter appears within 200 characters of it. */
  maxLength?: number;
  /** Safe-area inset under the composer (the route owns the insets). */
  bottomInset?: number;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !sending && !disabled;
  const showCount = !!maxLength && text.length > maxLength - 200;
  const padBottom = Math.max(bottomInset, spacing.sm + 2);

  if (disabled && disabledNote) {
    return (
      <View style={[styles.composerOuter, { paddingBottom: padBottom }]}>
        <View style={styles.composerNoteRow}>
          <Icon name="lock" size={14} color={colors.textMuted} />
          <Text style={styles.composerNote}>{disabledNote}</Text>
        </View>
      </View>
    );
  }

  async function submit() {
    const body = text.trim();
    if (!body || !canSend) return;
    setText('');
    try {
      await onSend(body);
    } catch {
      // The screen surfaces the failure; put the draft back so nothing is lost.
      setText(body);
    }
  }

  return (
    <View style={[styles.composerOuter, { paddingBottom: padBottom }]}>
      {!!error && (
        <View style={styles.composerError} accessibilityLiveRegion="polite" accessibilityRole="alert">
          <Icon name="alert-circle" size={16} color={colors.statusCritical} />
          <Text style={styles.composerErrorText}>{error}</Text>
        </View>
      )}
      {showCount && (
        <Text style={styles.composerCount}>{t('messages.charCount', { used: text.length, max: maxLength })}</Text>
      )}
      <View style={styles.composerRow}>
        <View style={styles.composer}>
          {!!onAttach && (
            <TouchableOpacity
              onPress={onAttach}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel={t('opesChat.chrome.attachA11y')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="paperclip" size={20} color={colors.link} />
            </TouchableOpacity>
          )}
          <TextInput
            style={styles.composerInput}
            value={text}
            onChangeText={setText}
            placeholder={placeholder ?? t('opesChat.chrome.composerPlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={maxLength}
            editable={!sending && !disabled}
            autoComplete="off"
            textContentType="none"
            accessibilityLabel={placeholder ?? t('opesChat.chrome.composerPlaceholder')}
          />
        </View>
        <TouchableOpacity
          onPress={submit}
          disabled={!canSend}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('opesChat.chrome.sendA11y')}
          accessibilityState={{ disabled: !canSend, busy: !!sending }}
          style={[styles.sendButton, !canSend && styles.sendButtonOff]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.textOnBrand} />
          ) : (
            <Icon name="send" size={20} color={colors.textOnBrand} strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles (built per palette so a runtime palette switch re-skins them) ──

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
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
    avatarInitials: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.lg,
      color: colors.tintBlue,
    },
    avatarInitialsCompact: { fontSize: typography.size.md },
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
    headerMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
      flexShrink: 1,
    },
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
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
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
    avatarGutter: { width: AVATAR_SIZE },
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
    bubblePending: { opacity: 0.7 },
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
      flex: 1,
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

    // Composer
    composerOuter: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: spacing.sm,
    },
    composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
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
      minHeight: 46,
    },
    composerInput: {
      flex: 1,
      maxHeight: 96,
      paddingVertical: 6,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    composerNoteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: spacing.sm,
    },
    composerNote: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textMuted,
    },
    composerError: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radii.sm + 2,
      backgroundColor: colors.statusCriticalBg,
    },
    composerErrorText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.statusCritical,
    },
    composerCount: {
      textAlign: 'right',
      fontFamily: typography.fontFamily.medium,
      fontSize: 10,
      color: colors.textMuted,
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
