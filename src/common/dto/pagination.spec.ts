import { buildPagination } from './pagination';

describe('buildPagination', () => {
  it('computes total pages by rounding up', () => {
    expect(buildPagination(1, 10, 25)).toEqual({
      page: 1,
      limit: 10,
      total_records: 25,
      total_pages: 3,
    });
  });

  it('returns 0 pages when there are no records', () => {
    expect(buildPagination(1, 10, 0).total_pages).toBe(0);
  });
});
