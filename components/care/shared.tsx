/**
 * Shared plumbing for the CARE slice (facility / provider discovery,
 * appointment rows and booking) — the expo-router port of
 * `UIUX/src/screens/care/shared.tsx`.
 *
 * ONE copy. Every care screen (find-facility, facility-profile, find-provider,
 * provider-profile, appointments) imports from here so nothing forks.
 *
 * Everything is composition on top of the OPES UI kit (`@/components/opes-ui`)
 * — no new colours, no inline SVG. Colours come from the kit's `colors` token
 * object (the `opescare` brand palette by default), never from a literal.
 *
 * What changed from the OPES source, and why:
 *  - `@react-navigation/native` → `expo-router` (`useRouter`).
 *  - `../../i18n` → `react-i18next` / `i18next`; every OPES key keeps its path
 *    under the `opes*` prefix (`care.x` → `opesCare.x`, `core.common.x` →
 *    `opesCore.common.x`, `enrol.gate.x` → `opesEnrol.gate.x`).
 *  - `../../api` is gone: this file NEVER fetches. `useAsync` is a generic
 *    async-state hook — screens pass their own loaders. The "account not
 *    linked" 409 is detected by duck typing (`isNotLinkedError`), and the
 *    offline cache is an optional adapter the screen injects.
 *  - `lib/errors.patientErrorMessage` is reproduced as a compact classifier
 *    (`describeFailure` / `errorMessage`) over the `opesCore.errors.*` keys.
 *  - `apptLabels.ts` and `dayStrip.ts` are folded in, so the appointment
 *    vocabulary and the locale-aware day/month labels live here too.
 *  - `DEPARTMENT_TYPE_ICON` / `DEPARTMENT_TYPE_LABEL` (previously exported by
 *    `FindFacilityScreen`) live here so the finder AND the profile import them
 *    from one place.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import * as kit from '@/components/opes-ui';
import {
  EmptyState,
  Icon,
  StaleNotice,
  a11yJoin,
  colors,
  formatDate,
  formatDateLong,
  formatLabel,
  formatNumber,
  formatTime,
  initialsFrom,
  radii,
  spacing,
  statusMap,
  tintMap,
  typography,
  type IconName,
  type Tint,
} from '@/components/opes-ui';

// ── Locale plumbing ───────────────────────────────────────────────────────

export type CareLocale = 'en' | 'fr';

/**
 * A `t` that any of the helpers below accept: react-i18next's hook `t`,
 * `i18next.t`, or a test stub. Kept deliberately narrow so screens are not
 * tied to i18next's generic `TFunction` signature.
 */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/** The active language, collapsed to the two the app ships. */
export function getCareLocale(): CareLocale {
  const lng = (i18next.language ?? 'en').toLowerCase();
  return lng.startsWith('fr') ? 'fr' : 'en';
}

/**
 * The kit's `formatDate` / `formatTime` / `formatNumber` read the locale from
 * the kit's own tiny i18n shim, not from i18next. Keep the two in step so a
 * French patient sees « 01 sept. 2026 » and a 24-hour clock, not English
 * dates inside an otherwise French screen. Guarded, so it is a no-op if the
 * kit's shim has been replaced by an i18next re-export that has no
 * `setLocale`.
 */
function syncKitLocale(): void {
  const shim = kit as unknown as { setLocale?: (l: CareLocale) => void };
  shim.setLocale?.(getCareLocale());
}
syncKitLocale();
i18next.on('languageChanged', syncKitLocale);

/** Non-hook `t` for helpers called outside a component (e.g. `fmtRelativeDay`). */
const tr: Translate = (key, params) => i18next.t(key, params as Record<string, unknown>) as string;

// ── Mutation clock ────────────────────────────────────────────────────────

let mutationClock = 0;

/**
 * Call after any write that changes what a list may show — a booking, a
 * cancellation. `reloadIfStale` then refetches on the next focus regardless of
 * the freshness window, so a patient never sees a stale list after acting.
 */
export function markMutation(): void {
  mutationClock = Date.now();
}

/** Epoch ms of the last `markMutation()`; 0 if none this session. */
export function lastMutationAt(): number {
  return mutationClock;
}

// ── Failure classification ────────────────────────────────────────────────

/** True for the 409 every clinical endpoint answers when no record is linked. */
export function isNotLinkedError(e: unknown): boolean {
  if (e instanceof Error && e.name === 'NotLinkedError') return true;
  return axios.isAxiosError(e) && e.response?.status === 409;
}

export type FailureKind =
  | 'offline'
  | 'timeout'
  | 'server'
  | 'notFound'
  | 'permission'
  | 'session'
  | 'busy'
  | 'notLinked'
  | 'conflict'
  | 'validation'
  | 'unknown';

export type Failure = { kind: FailureKind; title: string; message: string };

const failure = (kind: FailureKind, titleKey: string, bodyKey: string): Failure => ({
  kind,
  title: tr(`opesCore.errors.${titleKey}`),
  message: tr(`opesCore.errors.${bodyKey}`),
});

/**
 * Turn any thrown value into something a patient can read. A library string
 * such as `timeout of 15000ms exceeded` is never rendered. Rendered in the
 * locale active when the failure happens, not the one the app booted in.
 */
export function describeFailure(e: unknown, fallbackMessage?: string): Failure {
  if (isNotLinkedError(e)) return failure('notLinked', 'notLinkedTitle', 'notLinkedBody');

  if (axios.isAxiosError(e)) {
    const status = e.response?.status;
    if (status === undefined) {
      if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' || /timeout/i.test(e.message)) {
        return failure('timeout', 'timeoutTitle', 'timeoutBody');
      }
      return failure('offline', 'offlineTitle', 'offlineBody');
    }
    if (status === 401) return failure('session', 'sessionTitle', 'sessionBody');
    if (status === 403) return failure('permission', 'permissionTitle', 'permissionBody');
    if (status === 404) return failure('notFound', 'notFoundTitle', 'notFoundBody');
    if (status === 408) return failure('timeout', 'timeoutTitle', 'timeoutBody');
    if (status === 422) {
      // Laravel 422: the first field message is written for people.
      const body = e.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined;
      const first = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
      return {
        kind: 'validation',
        title: tr('opesCore.errors.validationTitle'),
        message: first || body?.message || tr('opesCore.errors.validationBody'),
      };
    }
    if (status === 429) return failure('busy', 'busyTitle', 'busyBody');
    if (status >= 500) return failure('server', 'serverTitle', 'serverBody');

    const detail = (e.response?.data as { message?: string; detail?: string } | undefined)?.detail
      ?? (e.response?.data as { message?: string } | undefined)?.message;
    if (detail) return { kind: 'conflict', title: tr('opesCore.errors.conflictTitle'), message: detail };
  }

  return {
    kind: 'unknown',
    title: tr('opesCore.errors.unknownTitle'),
    message: fallbackMessage || tr('opesCore.errors.unknownBody'),
  };
}

/**
 * Patient-readable failure text. `fallback` is used only when the failure
 * cannot be classified — a raw library string is never returned.
 */
export function errorMessage(e: unknown, fallback?: string): string {
  return describeFailure(e, fallback).message;
}

// ── Async loading ─────────────────────────────────────────────────────────

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  notLinked: boolean;
  reload: () => void;
  /**
   * Reload only if what is on screen is older than `maxAgeMs`.
   *
   * A `useFocusEffect(reloadIfStale)` costs nothing when a patient idly moves
   * between tabs; pull-to-refresh and the explicit retry still call `reload`
   * and are never throttled.
   */
  reloadIfStale: (maxAgeMs?: number) => void;
  setData: (next: T) => void;
  /** When `data` was last replaced by a successful load. */
  loadedAt: Date | null;
  /** A refresh failed while earlier data is still on screen. */
  stale: boolean;
  /** `data` came from the offline cache, not from the server this session. */
  fromCache: boolean;
};

export type AsyncCacheHit<T> = { data: T; capturedAt: Date };

/**
 * Optional offline read-through. This file never touches storage itself; a
 * screen that wants cached fallback passes an adapter (over `lib/offline`,
 * react-query's persister, or anything else).
 */
export type AsyncCache = {
  read<T>(key: string, maxAgeMs?: number): Promise<AsyncCacheHit<T> | null>;
  write<T>(key: string, data: T): Promise<void>;
};

export type AsyncOptions = {
  /**
   * Enables offline read when `cache` is also given. On success the payload
   * is written under this key; when a load fails and there is nothing on
   * screen, the cached copy is shown instead — always with the failure set,
   * so `AsyncBoundary` renders the StaleNotice above it. Cached data is never
   * presented as live. Without a `cache` adapter the key is inert.
   */
  cacheKey?: string;
  /** How old a cached payload may be before it is discarded rather than shown. */
  cacheMaxAgeMs?: number;
  cache?: AsyncCache;
  /** Override the "account not linked" detection for a loader with its own error shape. */
  isNotLinked?: (e: unknown) => boolean;
};

/**
 * How long a payload stays "fresh enough" for a focus event not to refetch it.
 * Short enough that a patient returning from a booking flow sees the result;
 * long enough that flicking between tabs costs nothing.
 */
export const FOCUS_FRESH_MS = 60_000;

/**
 * Minimal data hook: runs `fn` on mount and whenever `deps` change, and
 * separates the "account not linked" 409 from a genuine failure.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], options: AsyncOptions = {}): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notLinked, setNotLinked] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { cacheKey } = options;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotLinked(false);
    fnRef
      .current()
      .then((res) => {
        if (cancelled) return;
        const { cache, cacheKey: key } = optionsRef.current;
        setData(res);
        setLoadedAt(new Date());
        setFromCache(false);
        if (cache && key) void cache.write(key, res).catch(() => {});
      })
      .catch(async (e: unknown) => {
        if (cancelled) return;
        const { cache, cacheKey: key, cacheMaxAgeMs, isNotLinked } = optionsRef.current;
        if ((isNotLinked ?? isNotLinkedError)(e)) {
          setNotLinked(true);
          return;
        }
        setError(errorMessage(e));
        // Nothing on screen and a cached copy on disk: show it rather than an
        // error block. The error stays set, so the patient is told plainly that
        // this is not live and when it was captured.
        if (cache && key) {
          const hit = await cache.read<T>(key, cacheMaxAgeMs).catch(() => null);
          if (hit && !cancelled) {
            setData((current) => current ?? hit.data);
            setLoadedAt((current) => current ?? hit.capturedAt);
            setFromCache(true);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, cacheKey]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Read through a ref so the returned callback is stable: it is passed
  // straight to `useFocusEffect`, which re-subscribes whenever it changes.
  const freshness = useRef({ loadedAt, loading, error });
  freshness.current = { loadedAt, loading, error };
  const reloadIfStale = useCallback((maxAgeMs: number = FOCUS_FRESH_MS) => {
    const { loadedAt: at, loading: busy, error: err } = freshness.current;
    if (busy) return;
    // A screen showing a failure, or cached data, should always try again.
    if (err !== null || at === null) {
      setNonce((n) => n + 1);
      return;
    }
    // Anything written since this loaded may have changed it — a cancellation,
    // a booking. Never withhold that behind a freshness window.
    if (lastMutationAt() > at.getTime()) {
      setNonce((n) => n + 1);
      return;
    }
    if (Date.now() - at.getTime() < maxAgeMs) return;
    setNonce((n) => n + 1);
  }, []);

  const replace = useCallback((next: T) => {
    setData(next);
    setLoadedAt(new Date());
    setFromCache(false);
  }, []);

  return {
    data,
    loading,
    error,
    notLinked,
    reload,
    reloadIfStale,
    setData: replace,
    loadedAt,
    stale: error !== null && data !== null,
    fromCache,
  };
}

// ── Async boundary ────────────────────────────────────────────────────────

/**
 * After this long, a load that is still running stops looking like a hang and
 * says so. On the 2G/EDGE links this app targets a healthy request routinely
 * runs many seconds, so the cue must not fire early enough to cry wolf on a
 * normal load.
 */
const SLOW_LOAD_HINT_MS = 8_000;

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useTranslation();
  const text = label ?? t('opesCore.common.loading');
  // Reveals the "still working" line once a load outlasts the ordinary case,
  // so a long-but-healthy request on a weak signal reads as patience, not a
  // frozen screen. Reset per mount; cleared if the load resolves first.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), SLOW_LOAD_HINT_MS);
    return () => clearTimeout(id);
  }, []);

  return (
    // The whole screen is this block while it loads, and it resolves without
    // the patient doing anything. Polite so the "loaded" state that replaces
    // it is announced too, rather than the screen simply going quiet.
    <View
      style={styles.centre}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator color={colors.blue} />
      <Text style={styles.centreText}>{text}</Text>
      {slow && <Text style={styles.slowHint}>{t('opesCore.components.slowHint')}</Text>}
    </View>
  );
}

/**
 * The 409 every clinical endpoint answers for an account with no record behind
 * it. The CTA opens the Health ID tab (where a patient links a record);
 * a screen with a better destination passes `onLink`.
 */
export function NotLinkedBlock({ onLink }: { onLink?: () => void }) {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="id-card"
      tint="amber"
      title={t('opesEnrol.gate.title')}
      message={t('opesEnrol.gate.message')}
      actionLabel={t('opesEnrol.gate.action')}
      onAction={onLink ?? (() => router.push('/(tabs)/health-id'))}
    />
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="alert-circle"
      tint="red"
      title={t('opesCore.errors.unknownTitle')}
      message={message}
      actionLabel={t('opesCore.common.retry')}
      onAction={onRetry}
    />
  );
}

/** Renders loading / not-linked / error / empty, else the children. */
export function AsyncBoundary<T>({
  state,
  onLink,
  isEmpty,
  empty,
  loadingLabel,
  children,
}: {
  state: AsyncState<T>;
  /** Where the not-linked CTA goes; defaults to the Health ID tab. */
  onLink?: () => void;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loadingLabel?: string;
  children: (data: T) => ReactNode;
}) {
  const { t } = useTranslation();
  if (state.loading && state.data === null) return <LoadingBlock label={loadingLabel} />;
  if (state.notLinked) return <NotLinkedBlock onLink={onLink} />;
  if (state.error && state.data === null) return <ErrorBlock message={state.error} onRetry={state.reload} />;
  if (state.data === null) return <LoadingBlock label={loadingLabel} />;
  const body = isEmpty?.(state.data) && empty ? empty : children(state.data);
  // A refresh that failed while data is on screen must never pass as fresh.
  if (state.stale) {
    const cacheNote = t('opesCore.components.fromCacheNote', {
      defaultValue: 'This is the copy saved on your phone.',
    });
    return (
      <>
        <StaleNotice
          message={state.fromCache ? `${state.error ?? ''} ${cacheNote}` : (state.error ?? '')}
          loadedAt={state.loadedAt}
          onRetry={state.reload}
          retrying={state.loading}
        />
        {body}
      </>
    );
  }
  return <>{body}</>;
}

// ── Buttons ───────────────────────────────────────────────────────────────

export type CareButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'deep' | 'secondary' | 'ghost' | 'danger' | 'dangerSolid';
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  loading?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
};

const buttonFill: Record<NonNullable<CareButtonProps['variant']>, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.blue, fg: colors.textOnBrand, border: colors.blue },
  deep: { bg: colors.primaryDeep, fg: colors.textOnBrand, border: colors.primaryDeep },
  secondary: { bg: colors.surface, fg: colors.link, border: colors.border },
  ghost: { bg: colors.primarySoft, fg: colors.link, border: colors.primarySoft },
  danger: { bg: colors.surface, fg: colors.statusCritical, border: colors.statusCriticalBg },
  dangerSolid: { bg: colors.statusCritical, fg: colors.textOnBrand, border: colors.statusCritical },
};

/** The flat, 1px-bordered button used across the CARE references. */
export function CareButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  disabled,
  loading,
  size = 'md',
  style,
}: CareButtonProps) {
  const skin = buttonFill[variant];
  const off = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.8}
      accessibilityRole="button"
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
        <ActivityIndicator color={skin.fg} size="small" />
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

// ── Search field ──────────────────────────────────────────────────────────

export function SearchField({
  value,
  onChangeText,
  placeholder,
  onSubmit,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  /** What is being searched. A placeholder is not a label — it disappears. */
  accessibilityLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.search}>
      <Icon name="search" size={18} color={colors.textMuted} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        // A search box must never be offered a saved name or address, and
        // `off` is the value that says so rather than leaving it to guesswork.
        autoComplete="off"
        textContentType="none"
        accessibilityRole="search"
        // The placeholder vanishes the moment there is a character in the
        // field, so on a re-visit a placeholder-only field is nameless.
        accessibilityLabel={accessibilityLabel ?? placeholder}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('opesCare.appt.clearSearch')}
        >
          <Icon name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Date / time formatting ────────────────────────────────────────────────

/**
 * These are THIN WRAPPERS on the kit's `format.ts`, on purpose: it is the one
 * implementation and it matches the desktop's `App\Support\Format`
 * (`01 Sep 2026` / `01 sept. 2026`, 12-hour EN / 24-hour FR). Two
 * implementations of the same date drift; that is how English dates survived
 * inside French screens in the original app.
 */
export const toDate = (iso: string) => new Date(iso);

/** "10:30 AM" / « 22:30 » — FR is 24-hour, the clock a Cameroonian hospital uses. */
export function fmtTime(iso: string | null | undefined): string {
  return formatTime(iso);
}

/** "16 May 2026" / « 16 mai 2026 » */
export function fmtDate(iso: string | null | undefined): string {
  return formatDate(iso);
}

/** "Thursday, 16 May 2026" / « jeudi 16 mai 2026 » */
export function fmtDateLong(iso: string | null | undefined): string {
  return formatDateLong(iso);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a) - startOfDay(b)) / 86_400_000);
}

/**
 * "Today" / "Tomorrow" / "Yesterday", else a short date — « Aujourd’hui » /
 * « Demain » / « Hier » / « 01 sept. 2026 ». Takes a `t` so a component
 * re-renders on a language switch.
 */
export function relativeDay(t: Translate, iso: string): string {
  const d = toDate(iso);
  if (Number.isNaN(d.getTime())) return formatDate(iso);
  const diff = dayDiff(d, new Date());
  if (diff === 0) return t('opesCare.appt.today');
  if (diff === 1) return t('opesCare.appt.tomorrow');
  if (diff === -1) return t('opesCare.appt.yesterday');
  return formatDate(iso);
}

/** `relativeDay` for callers outside a hook; reads the active locale at call time. */
export function fmtRelativeDay(iso: string): string {
  return relativeDay(tr, iso);
}

/** True when `iso` falls on the local calendar day. Never compare a rendered label. */
export function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = toDate(iso);
  return !Number.isNaN(d.getTime()) && dayDiff(d, new Date()) === 0;
}

/** "2026-08-28" in local time — what the slots endpoint expects. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "1h 30m" / "30 min" — units read the same in both languages. */
export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * `25,000 FCFA` / « 25 000 FCFA ». The currency label is the API's, so this
 * cannot use the kit's `formatMoney` — but the grouping is still the locale's.
 */
export function fmtMoney(amount: number, currency: string): string {
  return `${formatNumber(Math.round(amount))} ${currency}`;
}

// ── Locale-aware weekday / month labels (was `dayStrip.ts`) ───────────────

const weekdayCache: Partial<Record<CareLocale, Intl.DateTimeFormat>> = {};
const monthCache: Partial<Record<CareLocale, Intl.DateTimeFormat>> = {};

const EN_WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EN_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `en-US` rather than `en-GB` for MONTHS: en-GB abbreviates September as
 * "Sept", and the desktop — and every printed document — says "Sep".
 */
const monthTag = (locale: CareLocale) => (locale === 'fr' ? 'fr-FR' : 'en-US');
const weekdayTag = (locale: CareLocale) => (locale === 'fr' ? 'fr-FR' : 'en-GB');

function weekdayFormatter(locale: CareLocale): Intl.DateTimeFormat {
  if (!weekdayCache[locale]) {
    weekdayCache[locale] = new Intl.DateTimeFormat(weekdayTag(locale), { weekday: 'short' });
  }
  return weekdayCache[locale]!;
}

function monthFormatter(locale: CareLocale): Intl.DateTimeFormat {
  if (!monthCache[locale]) {
    monthCache[locale] = new Intl.DateTimeFormat(monthTag(locale), { month: 'short' });
  }
  return monthCache[locale]!;
}

/** `Mon` / `lun.` */
export function shortWeekday(d: Date): string {
  try {
    return weekdayFormatter(getCareLocale()).format(d);
  } catch {
    // No ICU (a stripped JSC build): fall back rather than throw mid-render.
    return EN_WEEKDAY[d.getDay()];
  }
}

/** `Sep 1` / `1 sept.` — day before month in French. */
export function shortMonthDay(d: Date): string {
  const locale = getCareLocale();
  try {
    const month = monthFormatter(locale).format(d);
    return locale === 'fr' ? `${d.getDate()} ${month}` : `${month} ${d.getDate()}`;
  } catch {
    return `${EN_MONTH[d.getMonth()]} ${d.getDate()}`;
  }
}

/**
 * The two all-caps labels on the 64pt date tile — `MAY` / `MAI`, `THU` / `JEU`.
 * French abbreviations carry a trailing period ("sept.", "lun.") which reads
 * as a typo in an all-caps badge, so it is dropped.
 */
const caps = (s: string) => s.replace(/\.$/, '').toUpperCase();

/** `MAY` / `MAI`. */
export function capsMonth(d: Date): string {
  try {
    return caps(monthFormatter(getCareLocale()).format(d));
  } catch {
    return caps(EN_MONTH[d.getMonth()]);
  }
}

/** `THU` / `JEU`. */
export function capsWeekday(d: Date): string {
  try {
    return caps(weekdayFormatter(getCareLocale()).format(d));
  } catch {
    return caps(EN_WEEKDAY[d.getDay()]);
  }
}

/** Original OPES names for the date-tile labels, so no call site has to move. */
export { capsMonth as monthShort, capsWeekday as dayShort };

// ── Appointment vocabulary (types were `api/scheduling`, labels `apptLabels`) ─

export type VisitMode = 'in_person' | 'telemedicine';

/**
 * OPES's lifecycle plus the two this app's own API emits (`booked`,
 * `checked_in`). Every helper below accepts any string as well, because the
 * finder API types `status` as `string`.
 */
export type AppointmentStatus =
  | 'booked'
  | 'scheduled'
  | 'confirmed'
  | 'arrived'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export type AppointmentType =
  | 'consultation'
  | 'follow_up'
  | 'vaccination'
  | 'procedure'
  | 'lab'
  | 'imaging'
  | 'telemedicine'
  | 'antenatal'
  | 'other';

/** A known value with autocomplete, or whatever the API sent. */
export type AppointmentStatusLike = AppointmentStatus | (string & {});
export type AppointmentTypeLike = AppointmentType | (string & {});

/** The OPES portal appointment shape — the contract the appointment screens were designed against. */
export type PortalAppointment = {
  id: string;
  provider_id: number | null;
  provider_name: string | null;
  provider_specialty: string | null;
  provider_photo_url: string | null;
  facility_id: string | null;
  facility_name: string | null;
  department_id: string | null;
  department_name: string | null;
  location: string | null;
  scheduled_at: string;
  duration_minutes: number;
  appointment_type: AppointmentType;
  visit_mode: VisitMode;
  reason: string | null;
  status: AppointmentStatus;
  checked_in_at: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  rescheduled_from_id: string | null;
  booking_channel: string;
  is_upcoming: boolean;
  can_cancel: boolean;
  can_reschedule: boolean;
  can_check_in: boolean;
  created_at: string;
};

/**
 * What `AppointmentRow` actually reads. A `PortalAppointment` satisfies it,
 * and so does this app's own `Appointment` (`lib/api/types.ts`) without a
 * mapping step.
 */
export type AppointmentRowData = {
  id: string;
  scheduled_at: string | null;
  status: AppointmentStatusLike;
  appointment_type: AppointmentTypeLike;
  provider_name?: string | null;
  provider_specialty?: string | null;
  facility_name?: string | null;
  location?: string | null;
};

/** English fallback tables — the translated forms are `typeLabelOf` / `statusLabelOf` / `visitModeLabelOf`. */
export const APPOINTMENT_TYPE_LABEL: Record<AppointmentType, string> = {
  consultation: 'Consultation',
  follow_up: 'Follow-up',
  vaccination: 'Vaccination',
  procedure: 'Procedure',
  lab: 'Lab Appointment',
  imaging: 'Imaging',
  telemedicine: 'Telemedicine',
  antenatal: 'Antenatal Care',
  other: 'Other',
};

export const VISIT_MODE_LABEL: Record<VisitMode, string> = {
  in_person: 'In Person',
  telemedicine: 'Telemedicine',
};

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: 'Booked',
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  checked_in: 'Checked In',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
  rescheduled: 'Rescheduled',
};

/** Grouped exports for screens that prefer one import. */
export const APPOINTMENT = { TYPE_LABEL: APPOINTMENT_TYPE_LABEL } as const;
export const VISIT = { MODE_LABEL: VISIT_MODE_LABEL } as const;
export const STATUS = { LABEL: STATUS_LABEL } as const;

/** `consultation` → "Consultation"; unknown → "Appointment" / « Rendez-vous ». */
export function typeLabelOf(t: Translate, type: AppointmentTypeLike): string {
  return t(`opesCare.type.${type}`, { defaultValue: t('opesCare.type.fallback') });
}

/**
 * `no_show` → "No Show" / « Absent ». A status the catalogue does not know
 * (this app's `booked`) is sentence-cased by the kit's `formatLabel`, never
 * by `textTransform: 'capitalize'` — which upper-cases every word and is wrong
 * for French.
 */
export function statusLabelOf(t: Translate, status: AppointmentStatusLike): string {
  return t(`opesCare.apptStatus.${status}`, {
    defaultValue: STATUS_LABEL[status as AppointmentStatus] ?? formatLabel(status),
  });
}

export function visitModeLabelOf(t: Translate, mode: VisitMode | (string & {})): string {
  return t(`opesCare.visitMode.${mode}`, { defaultValue: formatLabel(mode) });
}

/** Non-hook `typeLabelOf`; reads the active locale at call time. */
export function typeLabel(type: AppointmentTypeLike): string {
  return typeLabelOf(tr, type);
}

/** Tint for the date block / icon chip on a row. */
export function statusTint(status: AppointmentStatusLike): Tint {
  if (status === 'completed') return 'green';
  if (status === 'cancelled' || status === 'no_show') return 'amber';
  return 'blue';
}

export function typeIcon(type: AppointmentTypeLike): IconName {
  switch (type) {
    case 'lab':
      return 'flask';
    case 'imaging':
      return 'image';
    case 'telemedicine':
      return 'video';
    case 'vaccination':
      return 'syringe';
    case 'procedure':
      return 'first-aid';
    case 'antenatal':
      return 'baby';
    case 'follow_up':
      return 'refresh';
    default:
      return 'stethoscope';
  }
}

// ── Department vocabulary (was exported by `FindFacilityScreen`) ──────────

export type DepartmentType = 'clinic' | 'laboratory' | 'pharmacy' | 'imaging' | 'emergency';

/** English fallback — use `departmentTypeLabel(t, d)` for the translated form. */
export const DEPARTMENT_TYPE_LABEL: Record<DepartmentType, string> = {
  clinic: 'Clinical',
  laboratory: 'Laboratory',
  pharmacy: 'Pharmacy',
  imaging: 'Imaging',
  emergency: 'Emergency',
};

export const DEPARTMENT_TYPE_ICON: Record<DepartmentType, IconName> = {
  clinic: 'first-aid',
  laboratory: 'flask',
  pharmacy: 'pill',
  imaging: 'image',
  emergency: 'building',
};

const DEPARTMENT_TYPE_LABEL_KEY: Record<DepartmentType, string> = {
  clinic: 'opesCare.findFacility.typeClinical',
  laboratory: 'opesCare.findFacility.typeLaboratory',
  pharmacy: 'opesCare.findFacility.typePharmacy',
  imaging: 'opesCare.findFacility.typeImaging',
  emergency: 'opesCare.findFacility.typeEmergency',
};

const DEPARTMENT_TYPE_PLURAL_KEY: Record<DepartmentType, string> = {
  clinic: 'opesCare.findFacility.pluralClinic',
  laboratory: 'opesCare.findFacility.pluralLab',
  pharmacy: 'opesCare.findFacility.pluralPharmacy',
  imaging: 'opesCare.findFacility.pluralImaging',
  emergency: 'opesCare.findFacility.pluralEmergency',
};

/** "Clinical" / « Clinique » — singular, for a card's type line. */
export function departmentTypeLabel(t: Translate, type: DepartmentType | (string & {})): string {
  const key = DEPARTMENT_TYPE_LABEL_KEY[type as DepartmentType];
  return key ? t(key) : formatLabel(type);
}

/** "Clinics" / « Cliniques » — plural, for the filter chips. */
export function departmentTypePlural(t: Translate, type: DepartmentType | (string & {})): string {
  const key = DEPARTMENT_TYPE_PLURAL_KEY[type as DepartmentType];
  return key ? t(key) : formatLabel(type);
}

// ── Date block (the MAY / 16 / THU tile on every appointment row) ─────────

export function DateBlock({
  iso,
  tint = 'blue',
  check,
}: {
  iso: string | null | undefined;
  tint?: Tint;
  check?: boolean;
}) {
  const d = iso ? toDate(iso) : new Date(NaN);
  const valid = !Number.isNaN(d.getTime());
  const skin = tintMap[tint];
  return (
    <View style={[styles.dateBlock, { backgroundColor: skin.bg }]}>
      <Text style={[styles.dateMonth, { color: skin.fg }]}>{valid ? capsMonth(d) : ''}</Text>
      <Text style={styles.dateDay}>{valid ? String(d.getDate()).padStart(2, '0') : '--'}</Text>
      <Text style={styles.dateWeekday}>{valid ? capsWeekday(d) : ''}</Text>
      {check && (
        <View style={[styles.dateCheck, { backgroundColor: skin.fg }]}>
          <Icon name="check" size={12} color={colors.textOnBrand} />
        </View>
      )}
    </View>
  );
}

// ── Appointment card (CARE-001 / CARE-002 rows) ───────────────────────────

export function AppointmentRow({
  appointment,
  onPress,
  onMenu,
}: {
  appointment: AppointmentRowData;
  onPress: () => void;
  onMenu?: () => void;
}) {
  const { t } = useTranslation();
  const a = appointment;
  const tint = statusTint(a.status);
  const fallbackTitle = typeLabelOf(t, a.appointment_type);
  const where = a.facility_name ?? a.location ?? t('opesCare.appt.locationTbd');
  return (
    <View style={styles.apptRowWrap}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={styles.apptRow}
        accessibilityRole="button"
        // Nine `Text` nodes and a date tile. Spoken piecemeal a patient hears
        // "MAY", "16", "THU", "10:30 AM", "Dr Ndongo"… before reaching anything
        // that says which appointment this is. One sentence, in the order a
        // person would say it out loud.
        accessibilityLabel={a11yJoin(
          fmtDateLong(a.scheduled_at),
          fmtTime(a.scheduled_at),
          a.provider_name ?? fallbackTitle,
          a.provider_specialty ?? fallbackTitle,
          where,
          statusLabelOf(t, a.status)
        )}
        accessibilityHint={t('opesCare.appt.apptRowHint')}
      >
        <DateBlock iso={a.scheduled_at} tint={tint} check={a.status === 'completed'} />
        <View style={styles.apptBody}>
          <Text style={styles.apptTime}>{fmtTime(a.scheduled_at)}</Text>
          <Text style={styles.apptTitle} numberOfLines={1}>
            {a.provider_name ?? fallbackTitle}
          </Text>
          <Text style={styles.apptSubtitle} numberOfLines={1}>
            {a.provider_specialty ?? fallbackTitle}
          </Text>
          <View style={styles.apptMetaRow}>
            <Icon name="location" size={14} color={colors.textMuted} />
            <Text style={styles.apptMeta} numberOfLines={1}>
              {where}
            </Text>
          </View>
        </View>
        <View style={styles.apptTrailing}>
          <View style={styles.apptTrailingTop}>
            <StatusPill status={a.status} />
            {/* The actions control is a SIBLING of the row, never a child of
                it: react-native-web renders both as <button>, and a button
                inside a button is invalid HTML that the browser un-nests while
                parsing. A spacer holds its place inside the row so the layout
                is unchanged. */}
            {!!onMenu && <View style={styles.apptMenuSpacer} />}
          </View>
          <Icon name="chevron-right" size={18} color={colors.textMuted} />
        </View>
      </TouchableOpacity>

      {!!onMenu && (
        <TouchableOpacity
          onPress={onMenu}
          hitSlop={12}
          style={styles.apptMenu}
          accessibilityRole="button"
          accessibilityLabel={t('opesCare.appt.apptActions')}
        >
          <Icon name="more-vertical" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Status tone for the pill: completed → normal, cancelled/no-show → critical, in-visit → info, else pending. */
export function statusTone(status: AppointmentStatusLike): 'normal' | 'critical' | 'info' | 'pending' {
  if (status === 'completed') return 'normal';
  if (status === 'cancelled' || status === 'no_show') return 'critical';
  if (status === 'in_progress' || status === 'arrived' || status === 'checked_in' || status === 'rescheduled') {
    return 'info';
  }
  return 'pending';
}

/** StatusBadge with the API's snake_case mapped to the reference wording. */
export function StatusPill({ status, size = 'md' }: { status: AppointmentStatusLike; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  const skin = statusMap[statusTone(status)];
  return (
    <View style={[styles.pill, size === 'sm' ? styles.pillSm : styles.pillMd, { backgroundColor: skin.bg }]}>
      <Text style={[styles.pillText, size === 'sm' && styles.pillTextSm, { color: skin.fg }]}>
        {statusLabelOf(t, status)}
      </Text>
    </View>
  );
}

// ── Detail rows ───────────────────────────────────────────────────────────

export function InfoRow({
  icon,
  tint = 'blue',
  label,
  value,
  valueColor,
  divider,
}: {
  icon: IconName;
  tint?: Tint;
  label: string;
  value: string;
  valueColor?: string;
  divider?: boolean;
}) {
  const skin = tintMap[tint];
  return (
    // "Date" and "16 May 2026" are one fact, not two. Grouped, it is one swipe
    // that says "Date, 16 May 2026"; ungrouped it is two, and the second one
    // is a bare date with nothing saying what it is the date of.
    <View style={[styles.infoRow, divider && styles.infoDivider]} accessible accessibilityLabel={a11yJoin(label, value)}>
      <View style={[styles.infoCircle, { backgroundColor: skin.bg }]}>
        <Icon name={icon} size={20} color={skin.fg} />
      </View>
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, !!valueColor && { color: valueColor }]}>{value}</Text>
      </View>
    </View>
  );
}

/** Left label / right value line inside a summary card. */
export function SummaryLine({
  label,
  value,
  valueColor,
  strong,
}: {
  label: string;
  value: string;
  valueColor?: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.summaryLine} accessible accessibilityLabel={a11yJoin(label, value)}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[styles.summaryValue, strong && styles.summaryValueStrong, !!valueColor && { color: valueColor }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

/** The soft-blue / amber advisory strip used on the booking screens. */
export function NoticeBanner({
  icon = 'info',
  tone = 'pending',
  title,
  message,
}: {
  icon?: IconName;
  tone?: 'pending' | 'warning' | 'critical' | 'normal';
  title?: string;
  message: string;
}) {
  const skin = statusMap[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: skin.bg }]}
      accessible
      accessibilityLabel={a11yJoin(title, message)}
      // The colour is the only thing marking this as a warning for a sighted
      // reader, so the role has to carry it for everyone else.
      accessibilityRole={tone === 'critical' || tone === 'warning' ? 'alert' : undefined}
    >
      <Icon name={icon} size={20} color={skin.fg} />
      <View style={styles.noticeBody}>
        {!!title && <Text style={[styles.noticeTitle, { color: skin.fg }]}>{title}</Text>}
        <Text style={styles.noticeText}>{message}</Text>
      </View>
    </View>
  );
}

/**
 * Circular initials avatar — the reference providers have no photos.
 *
 * `initialsFrom` handles the honorific: this used to strip a leading "Dr."
 * only, so "Prof. Ngo Bell" or a trailing title kept its title's letter.
 */
export function ProviderAvatar({ name, size = 56 }: { name: string; size?: number }) {
  const initials = initialsFrom(name, '');
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{initials}</Text>
    </View>
  );
}

export function RatingLine({
  rating,
  reviewCount,
  color = colors.textSecondary,
}: {
  rating: number;
  reviewCount: number;
  color?: string;
}) {
  const { t } = useTranslation();
  return (
    // Without this the star is silent and the text reads "4.8 120 reviews",
    // which does not say 4.8 out of what.
    <View
      style={styles.ratingRow}
      accessible
      accessibilityLabel={t('opesCare.appt.ratingA11y', {
        rating: rating.toFixed(1),
        count: reviewCount,
      })}
    >
      <Icon name="star" size={14} color={colors.statusWarning} />
      <Text style={[styles.ratingText, { color }]}>
        {rating.toFixed(1)}{' '}
        <Text style={styles.ratingCount}>
          {t('opesCare.appt.reviews', {
            count: reviewCount,
            defaultValue: `(${formatNumber(reviewCount)} reviews)`,
          })}
        </Text>
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

export const styles = StyleSheet.create({
  centre: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  centreText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
  slowHint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
    marginTop: spacing.xs,
  },

  button: {
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  buttonSm: { minHeight: 40, borderRadius: radii.sm + 2, paddingHorizontal: spacing.md - 4 },
  buttonOff: { opacity: 0.5 },
  buttonLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
  },
  buttonLabelSm: { fontSize: typography.size.sm },

  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 46,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },

  dateBlock: {
    width: 64,
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dateMonth: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  dateDay: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
    lineHeight: 30,
  },
  dateWeekday: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textMuted,
  },
  dateCheck: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },

  // The wrapper exists so the row and its actions control can be siblings
  // rather than nested buttons; the menu is absolutely positioned over the
  // spacer the row reserves for it, so the visual result is unchanged.
  apptRowWrap: { position: 'relative' },
  apptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md - 4,
    padding: spacing.md - 2,
  },
  apptMenuSpacer: { width: 18, height: 18 },
  apptMenu: {
    position: 'absolute',
    top: spacing.md - 2,
    right: spacing.md - 2,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apptBody: { flex: 1, minWidth: 0, gap: 2 },
  apptTime: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.link,
  },
  apptTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  apptSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  apptMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  apptMeta: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  apptTrailing: { alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', gap: spacing.md },
  apptTrailingTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  pill: { borderRadius: radii.pill, alignSelf: 'flex-start' },
  pillMd: { paddingHorizontal: 10, paddingVertical: 5 },
  pillSm: { paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs },
  pillTextSm: { fontSize: 11 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  infoDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  infoCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  infoText: { flex: 1, minWidth: 0 },
  infoLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  infoValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    marginTop: 1,
  },

  summaryLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 7,
  },
  summaryLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  summaryValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  summaryValueStrong: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    padding: spacing.md - 2,
    borderRadius: radii.md,
  },
  noticeBody: { flex: 1, minWidth: 0, gap: 2 },
  noticeTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
  },
  noticeText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  avatar: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: typography.fontFamily.bold,
    color: colors.blue,
  },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs },
  ratingCount: { fontFamily: typography.fontFamily.regular, color: colors.textMuted },
});
