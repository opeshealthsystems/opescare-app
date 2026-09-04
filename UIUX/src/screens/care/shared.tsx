/**
 * Shared plumbing for the CARE slice (appointment discovery + booking).
 *
 * Everything here is composition on top of `src/components` and
 * `src/theme/theme` — no new colours, no inline SVG.
 */
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { EmptyState, Icon, IconName, StaleNotice } from '../../components';
import { a11yJoin } from '../../components/a11y';
import { NotLinkedError } from '../../api';
import { lastMutationAt } from '../../api/client';
import { getLocale, translator, useTranslation } from '../../i18n';
import { patientErrorMessage } from '../../lib/errors';
import { readCache, writeCache } from '../../lib/offlineCache';
import { colors, radii, spacing, statusMap, typography, Tint, tintMap } from '../../theme/theme';
import { formatDate, formatDateLong, formatNumber, formatTime } from '../../utils/format';
import { relativeDay, statusLabelOf } from './apptLabels';
import { capsMonth, capsWeekday } from './dayStrip';
import type { AppointmentStatus, AppointmentType, PortalAppointment, VisitMode } from '../../api';

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
   * Every `useFocusEffect(reload)` in the app used to re-download the whole
   * payload on every tab switch and every back press — on the appointments home
   * that was three parallel requests, so a patient idly moving between tabs
   * spent tens of KB seeing nothing new. Pull-to-refresh and the explicit
   * retry still call `reload` and are never throttled.
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

export type AsyncOptions = {
  /**
   * Enables offline read. On success the payload is written to
   * `lib/offlineCache` under this key; when a load fails and there is nothing
   * on screen, the cached copy is shown instead — always with the failure set,
   * so `AsyncBoundary` renders the StaleNotice and its capture time above it.
   * Cached clinical data is never presented as live.
   */
  cacheKey?: string;
  /** How old a cached payload may be before it is discarded rather than shown. */
  cacheMaxAgeMs?: number;
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
  const alive = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const { cacheKey, cacheMaxAgeMs } = options;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotLinked(false);
    fnRef
      .current()
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoadedAt(new Date());
        setFromCache(false);
        if (cacheKey) void writeCache(cacheKey, res);
      })
      .catch(async (e: unknown) => {
        if (cancelled) return;
        if (e instanceof NotLinkedError) {
          setNotLinked(true);
          return;
        }
        setError(errorMessage(e));
        // Nothing on screen and a cached copy on disk: show it rather than an
        // error block. The error stays set, so the patient is told plainly that
        // this is not live and when it was captured.
        if (cacheKey && !cancelled) {
          const hit = await readCache<T>(cacheKey, cacheMaxAgeMs);
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
    // a booking, a recorded dose. Never withhold that behind a freshness window.
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

/**
 * Patient-readable failure text. Delegates to the shared classifier so a
 * library string such as `timeout of 15000ms exceeded` is never rendered.
 */
export function errorMessage(e: unknown, fallback?: string): string {
  return patientErrorMessage(e, fallback);
}

// ── Async boundary ────────────────────────────────────────────────────────

/**
 * After this long, a load that is still running stops looking like a hang and
 * says so. On the 2G/EDGE links this app targets a healthy request routinely
 * runs many seconds (see TIMEOUT_MS in api/client, 45 s), so the cue must not
 * fire early enough to cry wolf on a normal load — 8 s is past the ordinary
 * case but well inside the timeout-plus-two-retries budget (report 39, F3).
 */
const SLOW_LOAD_HINT_MS = 8_000;

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  const { t } = useTranslation();
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
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator color={colors.blue} />
      <Text style={styles.centreText}>{label}</Text>
      {slow && <Text style={styles.slowHint}>{t('components.slowHint')}</Text>}
    </View>
  );
}

/**
 * The 409 every clinical endpoint answers for an account with no record behind
 * it.
 *
 * Until P8 this was the end of the road: the CTA pointed at a Health ID screen
 * that answers the same 409, and linking needed an ID only staff can issue. It
 * now opens `AccountSetup`, where a patient who has an ID still links it and a
 * patient who has never visited can verify a phone number and open a record.
 */
export function NotLinkedBlock() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="id-card"
      tint="amber"
      title={t('enrol.gate.title')}
      message={t('enrol.gate.message')}
      actionLabel={t('enrol.gate.action')}
      onAction={() => navigation.navigate('AccountSetup')}
    />
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon="alert-circle"
      tint="red"
      title="Couldn't load this"
      message={message}
      actionLabel="Try Again"
      onAction={onRetry}
    />
  );
}

/** Renders loading / not-linked / error / empty, else the children. */
export function AsyncBoundary<T>({
  state,
  isEmpty,
  empty,
  loadingLabel,
  children,
}: {
  state: AsyncState<T>;
  /**
   * Legacy. Every caller passes one, so the prop stays accepted — but the
   * not-linked block now routes to the enrolment flow itself rather than to
   * whatever each screen guessed at.
   */
  onLink?: () => void;
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  loadingLabel?: string;
  children: (data: T) => React.ReactNode;
}) {
  if (state.loading && state.data === null) return <LoadingBlock label={loadingLabel} />;
  if (state.notLinked) return <NotLinkedBlock />;
  if (state.error && state.data === null) return <ErrorBlock message={state.error} onRetry={state.reload} />;
  if (state.data === null) return <LoadingBlock label={loadingLabel} />;
  const body = isEmpty?.(state.data) && empty ? empty : children(state.data);
  // A refresh that failed while data is on screen must never pass as fresh.
  if (state.stale) {
    return (
      <>
        <StaleNotice
          message={
            state.fromCache
              ? `${state.error ?? ''} This is the copy saved on your phone.`
              : state.error ?? ''
          }
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
          accessibilityLabel={t('care.appt.clearSearch')}
        >
          <Icon name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Date / time formatting ────────────────────────────────────────────────

/**
 * These four are THIN WRAPPERS on `utils/format`, on purpose.
 *
 * They used to carry `const MONTHS_LONG = ['January', …]`, `DAYS_LONG` and an
 * unconditional AM/PM clock, so a French patient read "Thursday, 16 May 2026"
 * and "02:30 PM" inside otherwise fully French screens — 39 files import from
 * here, so that one block was the app's largest bilingual defect. The arrays
 * are gone rather than translated: two implementations of the same date drift,
 * which is exactly how this survived. `utils/format` is the one implementation
 * and it matches the desktop's `App\Support\Format` (contract rule 8).
 *
 * The signatures are unchanged, so no call site had to move — the one
 * exception is `HomeDashboardScreen`, which compared `fmtRelativeDay(iso)`
 * against the literal `'Today'` and would have silently gone false in French;
 * that test is now `isToday` below, on the dates rather than the labels.
 *
 * ENGLISH DOES CHANGE, deliberately and in one direction: `fmtDate` was
 * "1 February 2026" and is now "01 Feb 2026", because that is the string the
 * desktop, the printed documents and the rest of this app (diagnostics,
 * imaging, meds, the telemedicine screens) already show. The clock is NOT
 * touched in English — `formatTime` emits the same "02:30 PM" this file did.
 */
export const toDate = (iso: string) => new Date(iso);

/** "10:30 AM" / « 22:30 » — FR is 24-hour, the clock a Cameroonian hospital uses. */
export function fmtTime(iso: string): string {
  return formatTime(iso);
}

/** "16 May 2026" / « 16 mai 2026 » */
export function fmtDate(iso: string): string {
  return formatDate(iso);
}

/** "Thursday, 16 May 2026" / « jeudi 16 mai 2026 » */
export function fmtDateLong(iso: string): string {
  return formatDateLong(iso);
}

/**
 * "Today" / "Tomorrow" / "16 May 2026" — « Aujourd’hui » / « Demain » / …
 *
 * Delegates to `apptLabels.relativeDay`, which is the same thing the
 * appointment screens already call; this overload just builds the translator
 * itself so the existing `(iso)` callers keep working outside a hook.
 */
export function fmtRelativeDay(iso: string): string {
  return relativeDay(translator(getLocale()), iso);
}

/** True when `iso` falls on the local calendar day. Never compare a rendered label. */
export function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = toDate(iso);
  return !Number.isNaN(d.getTime()) && dayDiff(d, new Date()) === 0;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a) - startOfDay(b)) / 86_400_000);
}

/** "2026-08-28" in local time — what the slots endpoint expects. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The two all-caps labels on the 64pt date tile — `MAY` / `MAI`, `THU` / `JEU`.
 * They live in `./dayStrip` (a plain `.ts`, and already the home of the
 * locale-aware short weekday/month labels) so the test suite can import them
 * without pulling this whole component module in; re-exported under their
 * original names so no call site moved.
 */
export { capsMonth as monthShort, capsWeekday as dayShort } from './dayStrip';

/** "1h 30m" / "30 min" */
export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * `25,000 FCFA` / « 25 000 FCFA ». The currency label is the API's, so this
 * cannot use `formatMoney` — but the grouping must still be the locale's, and
 * it was hard-coded `toLocaleString('en-US')`.
 */
export function fmtMoney(amount: number, currency: string): string {
  return `${formatNumber(Math.round(amount))} ${currency}`;
}

// ── Appointment vocabulary ────────────────────────────────────────────────

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
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
};

export function typeLabel(t: AppointmentType): string {
  return APPOINTMENT_TYPE_LABEL[t] ?? 'Appointment';
}

/** Tint for the date block / icon chip on a row. */
export function statusTint(status: AppointmentStatus): Tint {
  if (status === 'completed') return 'green';
  if (status === 'cancelled' || status === 'no_show') return 'amber';
  return 'blue';
}

export function typeIcon(t: AppointmentType): IconName {
  switch (t) {
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

// ── Date block (the MAY / 16 / THU tile on every appointment row) ─────────

export function DateBlock({ iso, tint = 'blue', check }: { iso: string; tint?: Tint; check?: boolean }) {
  const d = toDate(iso);
  const skin = tintMap[tint];
  return (
    <View style={[styles.dateBlock, { backgroundColor: skin.bg }]}>
      <Text style={[styles.dateMonth, { color: skin.fg }]}>{capsMonth(d)}</Text>
      <Text style={styles.dateDay}>{String(d.getDate()).padStart(2, '0')}</Text>
      <Text style={styles.dateWeekday}>{capsWeekday(d)}</Text>
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
  appointment: PortalAppointment;
  onPress: () => void;
  onMenu?: () => void;
}) {
  const { t } = useTranslation();
  const a = appointment;
  const tint = statusTint(a.status);
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
        a.provider_name ?? typeLabel(a.appointment_type),
        a.provider_specialty ?? typeLabel(a.appointment_type),
        a.facility_name ?? a.location ?? t('care.appt.locationTbd'),
        statusLabelOf(t, a.status)
      )}
      accessibilityHint={t('care.appt.apptRowHint')}
    >
      <DateBlock iso={a.scheduled_at} tint={tint} check={a.status === 'completed'} />
      <View style={styles.apptBody}>
        <Text style={styles.apptTime}>{fmtTime(a.scheduled_at)}</Text>
        <Text style={styles.apptTitle} numberOfLines={1}>
          {a.provider_name ?? typeLabel(a.appointment_type)}
        </Text>
        <Text style={styles.apptSubtitle} numberOfLines={1}>
          {a.provider_specialty ?? typeLabel(a.appointment_type)}
        </Text>
        <View style={styles.apptMetaRow}>
          <Icon name="location" size={14} color={colors.textMuted} />
          <Text style={styles.apptMeta} numberOfLines={1}>
            {a.facility_name ?? a.location ?? t('care.appt.locationTbd')}
          </Text>
        </View>
      </View>
        <View style={styles.apptTrailing}>
          <View style={styles.apptTrailingTop}>
            <StatusPill status={a.status} />
            {/* The actions control is a SIBLING of the row, never a child of
                it: react-native-web renders both as <button>, and a button
                inside a button is invalid HTML that the browser un-nests while
                parsing — so on /app/ this menu silently did nothing, or opened
                the appointment instead. A spacer holds its place inside the
                row so the layout is unchanged. */}
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
          accessibilityLabel={t('care.appt.apptActions')}
        >
          <Icon name="more-vertical" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/** StatusBadge with the API's snake_case mapped to the reference wording. */
export function StatusPill({ status, size = 'md' }: { status: AppointmentStatus; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  const tone =
    status === 'completed'
      ? 'normal'
      : status === 'cancelled' || status === 'no_show'
        ? 'critical'
        : status === 'in_progress' || status === 'arrived'
          ? 'info'
          : 'pending';
  const skin = statusMap[tone];
  return (
    <View
      style={[
        styles.pill,
        size === 'sm' ? styles.pillSm : styles.pillMd,
        { backgroundColor: skin.bg },
      ]}
    >
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
    <View
      style={[styles.infoRow, divider && styles.infoDivider]}
      accessible
      accessibilityLabel={a11yJoin(label, value)}
    >
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

/** Circular initials avatar — the reference providers have no photos. */
export function ProviderAvatar({ name, size = 56 }: { name: string; size?: number }) {
  const initials = name
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
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
      accessibilityLabel={t('care.appt.ratingA11y', {
        rating: rating.toFixed(1),
        count: reviewCount,
      })}
    >
      <Icon name="star" size={14} color={colors.statusWarning} />
      <Text style={[styles.ratingText, { color }]}>
        {rating.toFixed(1)} <Text style={styles.ratingCount}>({reviewCount} reviews)</Text>
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

  summaryLine: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 7 },
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
