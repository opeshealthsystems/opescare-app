/**
 * Small helpers shared by DOC-001 and DOC-002. Everything heavier
 * (`useAsync`, `AsyncBoundary`, `CareButton`) is reused from the CARE slice.
 */
import { Linking, Share } from 'react-native';
import { absoluteShareUrl, shareDocument } from '../../api';
import { getLocale, translate } from '../../i18n';
import { formatDate, formatDateLong, formatTime } from '../../utils/format';

/** "185 KB" / "1.2 MB" — the file strip on both references. */
export function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Rule 8: dates and times belong to `src/utils/format.ts`, which reads the
 * same locale and prints what the desktop prints — `30 May 2024` in English,
 * `30 mai 2024` in French, and a 24-hour clock in French.
 */

/** "30 May 2024" / "30 mai 2024" */
export function fmtDocDate(iso: string | null | undefined): string {
  return formatDate(iso, '—');
}

/** "10:48 AM" / "10:48" */
export function fmtDocTime(iso: string | null | undefined): string {
  return formatTime(iso, '');
}

/** "Monday, 03 June 2024" / "lundi 3 juin 2024" — the certificate body copy. */
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
  const locale = getLocale();
  if (s.startsWith('f')) return { subject: translate(locale, 'docs.shared.pronounShe') };
  if (s.startsWith('m')) return { subject: translate(locale, 'docs.shared.pronounHe') };
  return { subject: translate(locale, 'docs.shared.pronounPatient') };
}

/**
 * Mint a fresh signed link for the document and hand it to the OS.
 *
 * The link is self-authorising and short-lived — the recipient needs no OPES
 * account — and it streams the same real PDF the download endpoint serves.
 */
export async function mintShareUrl(documentId: string): Promise<string> {
  const res = await shareDocument(documentId);
  return absoluteShareUrl(res.share_url);
}

/** Opens the real PDF in the device's browser / viewer. */
export async function openDocument(documentId: string): Promise<void> {
  const url = await mintShareUrl(documentId);
  const ok = await Linking.canOpenURL(url);
  if (!ok) throw new Error(translate(getLocale(), 'docs.shared.cannotOpen'));
  await Linking.openURL(url);
}

/** Native share sheet carrying the signed link. */
export async function shareDocumentLink(documentId: string, title: string): Promise<void> {
  const url = await mintShareUrl(documentId);
  await Share.share({ message: `${title}\n${url}`, url, title });
}
