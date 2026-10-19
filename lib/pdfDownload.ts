/**
 * Fetch a server-rendered PDF and hand it to the patient — the one path every
 * "Download PDF" button in the app goes through.
 *
 * Before this existed each screen passed the signed `download_url` to the
 * system browser via `openExternal`. On Android that is the bug the owner hit
 * ("PDFs are not available"): the browser either drops an `attachment` into
 * the Downloads folder behind a notification the patient never sees, or —
 * when the 15-minute signed link had expired while the screen sat open — shows
 * a bare 403 page. Neither looks like a document.
 *
 * Native now downloads the bytes into `cache/exports/` (the folder signing out
 * sweeps — see `clearExportedFiles`), checks that what came back really is a
 * PDF, and offers it through the OS share sheet, which on Android is where
 * "Open with…" a PDF viewer lives. Web still uses the browser, which is the
 * thing on the web that can save a file.
 *
 * An expired link is reported as `PdfLinkExpiredError` so the caller can mint
 * a fresh one and retry, rather than telling the patient to "try again".
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { openExternal } from '@/lib/openExternal';

export type PdfDownloadOutcome = 'shared' | 'saved' | 'opened';

/** The signed link was refused (expired or tampered): mint a new one. */
export class PdfLinkExpiredError extends Error {
  constructor() {
    super('This download link has expired.');
    this.name = 'PdfLinkExpiredError';
  }
}

/** The file could not be fetched, or what came back was not a PDF. */
export class PdfDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfDownloadError';
  }
}

export interface PdfDownloadRequest {
  url: string | null | undefined;
  /** Base name for the saved file; sanitised and given a `.pdf` suffix. */
  filename: string;
  /** Share-sheet title, already translated. */
  shareTitle?: string;
}

/** Signed links must be https; plain http is tolerated in a dev build only. */
export function isDownloadableUrl(url: string | null | undefined, dev = __DEV__): url is string {
  if (typeof url !== 'string') return false;
  const u = url.trim();
  if (/^https:\/\/[^/\s]+/i.test(u)) return true;
  return dev && /^http:\/\/[^/\s]+/i.test(u);
}

/** "Lab report: CBC / 12" → "Lab-report-CBC-12.pdf" — never a path. */
export function safePdfFilename(name: string): string {
  const base = name
    .replace(/\.pdf$/i, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  return `${base || 'document'}.pdf`;
}

/** True when the first bytes (base64) are the `%PDF` magic number. */
export function looksLikePdf(base64Head: string): boolean {
  try {
    return globalThis.atob(base64Head).startsWith('%PDF');
  } catch {
    return false;
  }
}

function headerValue(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return '';
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? String(headers[key]) : '';
}

export async function downloadPdf(req: PdfDownloadRequest): Promise<PdfDownloadOutcome> {
  if (!isDownloadableUrl(req.url)) {
    throw new PdfDownloadError('This document has no download link.');
  }
  const url = req.url.trim();

  if (Platform.OS === 'web') {
    await openExternal(url);
    return 'opened';
  }

  const base = FileSystem.cacheDirectory;
  if (!base) throw new PdfDownloadError('This device has no writable location for the file.');
  const directory = `${base}exports/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
  const target = `${directory}${safePdfFilename(req.filename)}`;

  let result: FileSystem.FileSystemDownloadResult;
  try {
    result = await FileSystem.downloadAsync(url, target, {
      headers: { Accept: 'application/pdf' },
    });
  } catch {
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
    throw new PdfDownloadError('The document could not be downloaded. Check your connection.');
  }

  const discard = () => FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);

  if (result.status === 403 || result.status === 401 || result.status === 410) {
    await discard();
    throw new PdfLinkExpiredError();
  }
  if (result.status !== 200) {
    await discard();
    throw new PdfDownloadError(`The server could not prepare the document (${result.status}).`);
  }

  const type = headerValue(result.headers, 'content-type').toLowerCase();
  const head = await FileSystem.readAsStringAsync(result.uri, {
    encoding: FileSystem.EncodingType.Base64,
    position: 0,
    length: 8,
  }).catch(() => '');
  if ((type && !type.includes('application/pdf')) || !looksLikePdf(head)) {
    await discard();
    throw new PdfDownloadError('The server did not return a PDF.');
  }

  try {
    if (!(await Sharing.isAvailableAsync())) return 'saved';
    await Sharing.shareAsync(result.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: req.shareTitle,
    });
    return 'shared';
  } catch {
    return 'saved';
  }
}

/**
 * `downloadPdf`, retried ONCE with a freshly minted link when the first one
 * had expired. `refreshUrl` re-asks the server (the link is never cached past
 * one attempt); a null answer means the document is no longer downloadable.
 */
export async function downloadPdfWithRefresh(
  req: PdfDownloadRequest,
  refreshUrl: () => Promise<string | null | undefined>,
): Promise<PdfDownloadOutcome> {
  try {
    return await downloadPdf(req);
  } catch (e) {
    if (!(e instanceof PdfLinkExpiredError)) throw e;
    const fresh = await refreshUrl();
    return downloadPdf({ ...req, url: fresh });
  }
}
