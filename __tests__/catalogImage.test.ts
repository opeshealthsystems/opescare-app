import {
  __resetCatalogImageFailures,
  isUsableImageUri,
  markImageFailed,
} from '@/components/ui/CatalogImage';

describe('CatalogImage link gate', () => {
  beforeEach(() => __resetCatalogImageFailures());

  it('accepts an absolute http(s) link from the API', () => {
    expect(isUsableImageUri('https://opescare.com/facility/photo/abc?expires=1&signature=x')).toBe(true);
    expect(isUsableImageUri('http://localhost:8010/api/mobile/medicines/abc/image?signature=x')).toBe(true);
  });

  it('falls back when there is no image, never inventing one', () => {
    expect(isUsableImageUri(null)).toBe(false);
    expect(isUsableImageUri(undefined)).toBe(false);
    expect(isUsableImageUri('')).toBe(false);
    expect(isUsableImageUri('facility-photos/abc/logo.jpg')).toBe(false);
  });

  it('remembers a link that failed to load so rows do not retry it', () => {
    const uri = 'https://opescare.com/facility/photo/dead?signature=x';
    markImageFailed(uri);
    expect(isUsableImageUri(uri)).toBe(false);
  });
});
