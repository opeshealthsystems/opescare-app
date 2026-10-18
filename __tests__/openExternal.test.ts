import { Linking } from 'react-native';
import { isOpenableUrl, openExternal } from '@/lib/openExternal';

describe('isOpenableUrl', () => {
  it.each([
    'https://finder.opescare.cloud/verify/doc/abc',
    'HTTPS://EXAMPLE.COM',
    '  https://example.com  ',
    'tel:+237600000000',
    'mailto:help@opescare.cloud',
  ])('allows %s', (url) => {
    expect(isOpenableUrl(url)).toBe(true);
  });

  it.each([
    'http://example.com',
    'javascript:alert(1)',
    'intent://scan/#Intent;scheme=zxing;end',
    'opescare://patient/1',
    'whatsapp://send?text=hi',
    'file:///etc/passwd',
    'data:text/html,<script>alert(1)</script>',
    'https:example.com',
    '',
  ])('refuses %s', (url) => {
    expect(isOpenableUrl(url)).toBe(false);
  });

  it('refuses null and undefined', () => {
    expect(isOpenableUrl(null)).toBe(false);
    expect(isOpenableUrl(undefined)).toBe(false);
  });
});

describe('openExternal', () => {
  beforeEach(() => {
    jest.spyOn(Linking, 'openURL').mockClear().mockResolvedValue(true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('opens an allowed URL, trimmed', async () => {
    await openExternal('  https://example.com/x ');
    expect(Linking.openURL).toHaveBeenCalledWith('https://example.com/x');
  });

  it('throws and never calls Linking for a refused URL', async () => {
    await expect(openExternal('javascript:alert(1)')).rejects.toThrow();
    await expect(openExternal('http://example.com')).rejects.toThrow();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
