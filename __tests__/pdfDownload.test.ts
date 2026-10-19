jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn(async () => undefined),
  downloadAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(async () => undefined),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));
jest.mock('expo-sharing', () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

import { Linking, Platform } from 'react-native';
import {
  downloadPdf,
  downloadPdfWithRefresh,
  isDownloadableUrl,
  looksLikePdf,
  PdfDownloadError,
  PdfLinkExpiredError,
  safePdfFilename,
} from '@/lib/pdfDownload';

const mockFs = jest.requireMock('expo-file-system/legacy') as Record<string, jest.Mock>;
const mockSharing = jest.requireMock('expo-sharing') as Record<string, jest.Mock>;

const PDF_HEAD = Buffer.from('%PDF-1.7').toString('base64');
const HTML_HEAD = Buffer.from('<!doctyp').toString('base64');
const URL_OK = 'https://opescare.com/api/mobile/documents/certificate/download?expires=1&signature=a';

function respond(status: number, type = 'application/pdf', head = PDF_HEAD) {
  mockFs.downloadAsync.mockResolvedValueOnce({
    uri: 'file:///cache/exports/x.pdf',
    status,
    headers: { 'Content-Type': type },
  });
  if (status === 200) mockFs.readAsStringAsync.mockResolvedValueOnce(head);
}

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
});

describe('helpers', () => {
  it('accepts https and refuses http outside dev, relative and empty', () => {
    expect(isDownloadableUrl(URL_OK, false)).toBe(true);
    expect(isDownloadableUrl('http://localhost:8010/x', false)).toBe(false);
    expect(isDownloadableUrl('http://localhost:8010/x', true)).toBe(true);
    expect(isDownloadableUrl('/api/mobile/documents/x', true)).toBe(false);
    expect(isDownloadableUrl(null)).toBe(false);
  });

  it('builds a safe filename', () => {
    expect(safePdfFilename('Lab report: CBC / 12')).toBe('Lab-report-CBC-12.pdf');
    expect(safePdfFilename('../../etc/passwd')).toBe('etc-passwd.pdf');
    expect(safePdfFilename('')).toBe('document.pdf');
  });

  it('recognises the PDF magic number', () => {
    expect(looksLikePdf(PDF_HEAD)).toBe(true);
    expect(looksLikePdf(HTML_HEAD)).toBe(false);
  });
});

describe('downloadPdf (native)', () => {
  it('downloads into cache/exports and opens the share sheet as a PDF', async () => {
    respond(200);
    await expect(downloadPdf({ url: URL_OK, filename: 'Certificate 1' })).resolves.toBe('shared');
    expect(mockFs.downloadAsync).toHaveBeenCalledWith(
      URL_OK,
      'file:///cache/exports/Certificate-1.pdf',
      expect.anything(),
    );
    expect(mockSharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/exports/x.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' }),
    );
  });

  it('never hands the link to the browser on native', async () => {
    const open = jest.spyOn(Linking, 'openURL');
    respond(200);
    await downloadPdf({ url: URL_OK, filename: 'a' });
    expect(open).not.toHaveBeenCalled();
  });

  it('reports an expired signature distinctly and removes the partial file', async () => {
    respond(403, 'application/json');
    await expect(downloadPdf({ url: URL_OK, filename: 'a' })).rejects.toBeInstanceOf(PdfLinkExpiredError);
    expect(mockFs.deleteAsync).toHaveBeenCalled();
    expect(mockSharing.shareAsync).not.toHaveBeenCalled();
  });

  it('refuses a body that is not a PDF', async () => {
    respond(200, 'text/html', HTML_HEAD);
    await expect(downloadPdf({ url: URL_OK, filename: 'a' })).rejects.toBeInstanceOf(PdfDownloadError);
    expect(mockSharing.shareAsync).not.toHaveBeenCalled();
  });

  it('reports saved when no share sheet exists', async () => {
    respond(200);
    mockSharing.isAvailableAsync.mockResolvedValueOnce(false);
    await expect(downloadPdf({ url: URL_OK, filename: 'a' })).resolves.toBe('saved');
  });

  it('refuses a missing or non-https link without a request', async () => {
    await expect(downloadPdf({ url: null, filename: 'a' })).rejects.toBeInstanceOf(PdfDownloadError);
    await expect(downloadPdf({ url: '/relative', filename: 'a' })).rejects.toBeInstanceOf(PdfDownloadError);
    expect(mockFs.downloadAsync).not.toHaveBeenCalled();
  });
});

describe('downloadPdfWithRefresh', () => {
  it('re-mints an expired link once and succeeds', async () => {
    respond(403);
    respond(200);
    const refresh = jest.fn(async () => `${URL_OK}&fresh=1`);
    await expect(downloadPdfWithRefresh({ url: URL_OK, filename: 'a' }, refresh)).resolves.toBe('shared');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mockFs.downloadAsync).toHaveBeenLastCalledWith(`${URL_OK}&fresh=1`, expect.any(String), expect.anything());
  });

  it('does not refresh on other failures', async () => {
    respond(500);
    const refresh = jest.fn(async () => URL_OK);
    await expect(downloadPdfWithRefresh({ url: URL_OK, filename: 'a' }, refresh)).rejects.toBeInstanceOf(PdfDownloadError);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('downloadPdf (web)', () => {
  it('hands the signed link to the browser', async () => {
    Platform.OS = 'web';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
    await expect(downloadPdf({ url: URL_OK, filename: 'a' })).resolves.toBe('opened');
    expect(open).toHaveBeenCalledWith(URL_OK);
    expect(mockFs.downloadAsync).not.toHaveBeenCalled();
  });
});
