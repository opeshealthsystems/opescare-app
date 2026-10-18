/**
 * Helpers shared by the documents library and its preview panel — the
 * OpesCare port of the OPES kit's `screens/docs/shared.tsx`.
 *
 * Same exports as the source (`fmtBytes`, `fmtDocDate`, `fmtDocTime`,
 * `fmtDocDateLong`, `pronoun`, `mintShareUrl`, `openDocument`,
 * `shareDocumentLink`); only the plumbing underneath changed:
 *
 * - dates and times come from the kit's `format.ts`, which reads the same
 *   locale as the rest of the app (« 30 mai 2024 » / 24-hour clock in French);
 * - strings come from the app's i18next catalogue (`opesDocs.*`);
 * - a document link is minted from THIS app's document endpoint. The backend
 *   issues a fresh, short-lived `verify_url` per view — the equivalent of the
 *   signed share link the source screens minted — and may return `null` when
 *   no file is attached, which every caller has to handle rather than open.
 *
 * `asyncStateOf` is the one addition: it bridges a TanStack Query result onto
 * the care slice's `AsyncState`, so the records hub screens can render through
 * the kit's `AsyncBoundary` (loading / not-linked / error / stale) without
 * abandoning their existing query hooks.
 */
import { openExternal } from '@/lib/openExternal';
import i18next from 'i18next';
import { Linking, Platform, Share } from 'react-native';
import { formatDate, formatDateLong, formatTime } from '@/components/opes-ui';
import { errorMessage, isNotLinkedError, type AsyncState } from '@/components/care/shared';
import { apiClient } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { OfficialDocumentDetail } from '@/lib/api/types';

/** Non-hook `t` for helpers that run outside a component. */
const tr = (key: string, params?: Record<string, unknown>): string =>
  String(i18next.t(key, params));

/** "185 KB" / "1.2 MB" — the file strip on the preview panel. */
export function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "30 May 2024" / "30 mai 2024" */
export function fmtDocDate(iso: string | null | undefined): string {
  return formatDate(iso, '—');
}

/** "10:48 AM" / "10:48" */
export function fmtDocTime(iso: string | null | undefined): string {
  return formatTime(iso, '');
}

/** "Monday, 03 June 2024" / "lundi 3 juin 2024" — certificate body copy. */
export function fmtDocDateLong(iso: string | null | undefined): string {
  // Noon avoids a date-only string sliding a day across the timezone.
  return iso ? formatDateLong(`${iso.slice(0, 10)}T12:00:00`, '—') : '—';
}

/**
 * The third-person subject the certificate prose needs — `il` / `elle` /
 * `le patient`. French would also need agreement on any participle that
 * follows, which is why the certificate copy is phrased to avoid one.
 */
export function pronoun(sex: string | null | undefined): { subject: string } {
  const s = (sex ?? '').toLowerCase();
  if (s.startsWith('f')) return { subject: tr('opesDocs.shared.pronounShe') };
  if (s.startsWith('m')) return { subject: tr('opesDocs.shared.pronounHe') };
  return { subject: tr('opesDocs.shared.pronounPatient') };
}

/**
 * Thrown when the backend answered but had no file to hand over
 * (`verify_url: null`). Distinct from a network failure so a screen can show
 * the "ask the facility to re-issue it" wording instead of "try again".
 */
export class DocumentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentUnavailableError';
  }
}

/**
 * Mint a fresh verification link for the document.
 *
 * The backend issues one per view and it stays valid for a short time only,
 * so the URL is fetched at tap time rather than cached with the list. A
 * document with no attached file answers `null`, which is surfaced as a
 * `DocumentUnavailableError` — never opened, never shared.
 */
export async function mintShareUrl(documentId: string): Promise<string> {
  const res = await apiClient.get<{ data: OfficialDocumentDetail }>(endpoints.document(documentId));
  const url = res.data?.data?.verify_url ?? null;
  if (!url) throw new DocumentUnavailableError(tr('documents.noVerifyUrl'));
  return url;
}

/** Opens the sealed original in the device's browser / viewer. */
export async function openDocument(documentId: string): Promise<void> {
  const url = await mintShareUrl(documentId);
  // `canOpenURL` is meaningless for https on the web build; only gate natively.
  const ok = Platform.OS === 'web' ? true : await Linking.canOpenURL(url);
  if (!ok) throw new Error(tr('opesDocs.shared.cannotOpen'));
  await openExternal(url);
}

/** Native share sheet carrying the verification link. */
export async function shareDocumentLink(documentId: string, title: string): Promise<void> {
  const url = await mintShareUrl(documentId);
  try {
    await Share.share({ message: `${title}\n${url}`, url, title });
  } catch {
    // react-native-web only has a share sheet where `navigator.share` exists;
    // elsewhere the link still reaches the patient through the browser.
    await openExternal(url);
  }
}

// ── TanStack Query → AsyncState bridge ────────────────────────────────────

/** The subset of a `useQuery` / `useInfiniteQuery` result the bridge reads. */
export type QueryLike<T> = {
  data: T | undefined;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  dataUpdatedAt: number;
};

/**
 * Present a query as the care slice's `AsyncState` so `AsyncBoundary` can
 * drive loading / not-linked / error / stale for it.
 *
 * `offline` marks data on screen as stale (with the offline wording) even when
 * the query itself has not failed — a paused refetch is silent, and a patient
 * reading last week's list as if it were live is exactly what the stale strip
 * exists to prevent.
 */
export function asyncStateOf<T>(
  query: QueryLike<T>,
  options: { offline?: boolean; offlineMessage?: string } = {},
): AsyncState<T> {
  const hasData = query.data !== undefined;
  const failure = query.isError ? errorMessage(query.error) : null;
  const offline = !!options.offline && hasData;
  const reload = () => {
    void query.refetch();
  };
  return {
    data: query.data ?? null,
    loading: query.isFetching,
    error: failure ?? (offline ? (options.offlineMessage ?? null) : null),
    notLinked: !hasData && query.isError && isNotLinkedError(query.error),
    reload,
    reloadIfStale: reload,
    setData: () => {},
    loadedAt: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
    stale: hasData && (query.isError || offline),
    fromCache: false,
  };
}
