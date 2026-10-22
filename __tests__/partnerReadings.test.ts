import {
  nextPartnerReadingsPage,
  sortPartnerReadings,
  type PartnerReading,
  type PartnerReadingsPage,
} from '@/lib/api/partnerReadingsQueries';

const meta = (page: number, has_more: boolean): PartnerReadingsPage['meta'] => ({
  page, per_page: 20, total: 40, has_more, provenance: 'partner_reported', provenance_label: null, note: null,
});

const row = (id: number, effective_at: string | null, received_at: string | null = null) =>
  ({ id, effective_at, received_at }) as unknown as PartnerReading;

describe('partner readings pagination', () => {
  it('asks for the next page only while has_more is true', () => {
    expect(nextPartnerReadingsPage({ data: [], meta: meta(1, true) })).toBe(2);
    expect(nextPartnerReadingsPage({ data: [], meta: meta(2, false) })).toBeUndefined();
  });

  it('sorts newest first, falling back to received_at', () => {
    const out = sortPartnerReadings([
      row(1, '2026-01-01T00:00:00Z'),
      row(2, null, '2026-03-01T00:00:00Z'),
      row(3, '2026-02-01T00:00:00Z'),
    ]);
    expect(out.map((r) => r.id)).toEqual([2, 3, 1]);
  });
});
