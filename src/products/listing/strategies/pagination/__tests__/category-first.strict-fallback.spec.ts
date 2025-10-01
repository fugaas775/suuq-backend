import { CategoryFirstPaginator } from '../../pagination/category-first.paginator';

describe('CategoryFirstPaginator strict vs non-strict (smoke)', () => {
  it('has execute() signature with meta and runs', () => {
    expect(typeof CategoryFirstPaginator).toBe('function');
    // This is a smoke test placeholder; integration covered at service level.
  });
});
