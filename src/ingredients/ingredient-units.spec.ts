import {
  branchTracksIngredients,
  convertQuantity,
  normalizeUnit,
  purchaseLabelToUnit,
  roundMoney,
  roundQty,
} from './ingredient-units';

describe('ingredient-units', () => {
  it('normalises a unit code case-insensitively and refuses the unknown', () => {
    expect(normalizeUnit('kg')).toBe('KG');
    expect(normalizeUnit(' ml ')).toBe('ML');
    expect(normalizeUnit('sack')).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
  });

  it('converts within a family and refuses across families', () => {
    expect(convertQuantity(20, 'G', 'KG')).toBe(0.02);
    expect(convertQuantity(2.5, 'KG', 'G')).toBe(2500);
    expect(convertQuantity(750, 'ML', 'L')).toBe(0.75);
    expect(convertQuantity(3, 'L', 'L')).toBe(3);
    expect(convertQuantity(1, 'KG', 'L')).toBeNull();
    expect(convertQuantity(1, 'PCS', 'G')).toBeNull();
    expect(convertQuantity(1, 'sack' as any, 'KG')).toBeNull();
  });

  it('rounds quantities to 4dp and money to 2dp', () => {
    expect(roundQty(0.123456)).toBe(0.1235);
    expect(roundMoney(108.571428)).toBe(108.57);
    expect(roundQty(NaN)).toBe(0);
  });

  it("reads a market run's unit label, and gives up on sacks and crates", () => {
    expect(purchaseLabelToUnit('kg')).toBe('KG');
    expect(purchaseLabelToUnit('Kilos')).toBe('KG');
    expect(purchaseLabelToUnit('g')).toBe('G');
    expect(purchaseLabelToUnit('litre')).toBe('L');
    expect(purchaseLabelToUnit('ml')).toBe('ML');
    expect(purchaseLabelToUnit('pcs')).toBe('PCS');
    expect(purchaseLabelToUnit('sack')).toBeNull();
    expect(purchaseLabelToUnit('')).toBeNull();
  });

  it('gates on the service format: QSR only, case-insensitive', () => {
    expect(branchTracksIngredients({ serviceFormat: 'QSR' })).toBe(true);
    expect(branchTracksIngredients({ serviceFormat: 'qsr' })).toBe(true);
    expect(branchTracksIngredients({ serviceFormat: 'CAFETERIA' })).toBe(false);
    expect(branchTracksIngredients({ serviceFormat: 'RETAIL' })).toBe(false);
    expect(branchTracksIngredients(null)).toBe(false);
  });
});
