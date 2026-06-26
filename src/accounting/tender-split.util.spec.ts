import { splitTenders, extractBadDebt } from './tender-split.util';

describe('extractBadDebt', () => {
  it('separates BAD_DEBT tenders from the collectable ones', () => {
    const { badDebt, collected } = extractBadDebt([
      { method: 'CASH', amount: 60 },
      { method: 'BAD_DEBT', amount: 40 },
    ]);
    expect(badDebt).toBe(40);
    expect(collected).toEqual([{ method: 'CASH', amount: 60 }]);
  });

  it('sums multiple BAD_DEBT rows and is case-insensitive', () => {
    const { badDebt, collected } = extractBadDebt([
      { method: 'bad_debt', amount: 10 },
      { method: 'BAD_DEBT', amount: 5 },
    ]);
    expect(badDebt).toBe(15);
    expect(collected).toEqual([]);
  });

  it('returns zero bad debt and all rows when there is none', () => {
    const { badDebt, collected } = extractBadDebt([
      { method: 'CARD', amount: 80 },
    ]);
    expect(badDebt).toBe(0);
    expect(collected).toEqual([{ method: 'CARD', amount: 80 }]);
  });

  it('composes with splitTenders to keep a write-off out of cash/clearing', () => {
    // A full BAD_DEBT settle: nothing is collected, so the split target is 0 and
    // the caller posts the whole amount to BAD_DEBT_EXPENSE.
    const { badDebt, collected } = extractBadDebt([
      { method: 'BAD_DEBT', amount: 100 },
    ]);
    const target = Math.max(0, 100 - badDebt);
    const { cash, clearing } = splitTenders(collected, target);
    expect(badDebt).toBe(100);
    expect(cash).toBe(0);
    expect(clearing).toBe(0);
    // Debits balance: cash + clearing + badDebt == the recognized total.
    expect(cash + clearing + badDebt).toBe(100);
  });
});
