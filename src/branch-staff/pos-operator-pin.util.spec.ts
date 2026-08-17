import {
  buildUnlockPinFingerprint,
  isPinEligibleLane,
  isWeakUnlockPin,
  normalizeUnlockPin,
} from './pos-operator-pin.util';

describe('pos-operator-pin.util', () => {
  describe('isPinEligibleLane', () => {
    it('accepts only a QSR branch waiter lane', () => {
      expect(isPinEligibleLane('QSR', 'QSR_WAITER')).toBe(true);
      expect(isPinEligibleLane('qsr', 'qsr_waiter')).toBe(true);
    });

    it('rejects a QSR cashier or manager', () => {
      expect(isPinEligibleLane('QSR', 'QSR_CASHIER')).toBe(false);
      expect(isPinEligibleLane('QSR', 'QSR_MANAGER')).toBe(false);
    });

    it('rejects a waiter-shaped lane at a non-QSR branch', () => {
      expect(isPinEligibleLane('CAFETERIA', 'CAFETERIA_WAITER')).toBe(false);
      expect(isPinEligibleLane('HOTEL', 'QSR_WAITER')).toBe(false);
      expect(isPinEligibleLane('RETAIL', 'QSR_WAITER')).toBe(false);
    });

    it('rejects missing values', () => {
      expect(isPinEligibleLane(null, null)).toBe(false);
      expect(isPinEligibleLane('QSR', null)).toBe(false);
      expect(isPinEligibleLane(undefined, 'QSR_WAITER')).toBe(false);
    });
  });

  describe('normalizeUnlockPin', () => {
    it('accepts exactly four digits', () => {
      expect(normalizeUnlockPin('4827')).toBe('4827');
      expect(normalizeUnlockPin(' 4827 ')).toBe('4827');
    });

    it('rejects anything that is not four digits', () => {
      expect(normalizeUnlockPin('482')).toBeNull();
      expect(normalizeUnlockPin('48270')).toBeNull();
      expect(normalizeUnlockPin('48a7')).toBeNull();
      expect(normalizeUnlockPin('')).toBeNull();
      expect(normalizeUnlockPin(null)).toBeNull();
    });
  });

  describe('isWeakUnlockPin', () => {
    it('rejects repeated digits and runs in both directions', () => {
      expect(isWeakUnlockPin('0000')).toBe(true);
      expect(isWeakUnlockPin('7777')).toBe(true);
      expect(isWeakUnlockPin('1234')).toBe(true);
      expect(isWeakUnlockPin('6789')).toBe(true);
      expect(isWeakUnlockPin('4321')).toBe(true);
      expect(isWeakUnlockPin('9876')).toBe(true);
    });

    it('allows an ordinary PIN', () => {
      expect(isWeakUnlockPin('4827')).toBe(false);
      expect(isWeakUnlockPin('1357')).toBe(false);
      expect(isWeakUnlockPin('2020')).toBe(false);
    });
  });

  describe('buildUnlockPinFingerprint', () => {
    it('is stable for the same branch and PIN', () => {
      expect(buildUnlockPinFingerprint('pepper', 42, '4827')).toBe(
        buildUnlockPinFingerprint('pepper', 42, '4827'),
      );
    });

    it('separates the same PIN across branches, so two branches may reuse digits', () => {
      expect(buildUnlockPinFingerprint('pepper', 42, '4827')).not.toBe(
        buildUnlockPinFingerprint('pepper', 43, '4827'),
      );
    });

    it('separates different PINs within a branch', () => {
      expect(buildUnlockPinFingerprint('pepper', 42, '4827')).not.toBe(
        buildUnlockPinFingerprint('pepper', 42, '4828'),
      );
    });

    it('changes with the pepper, so a database dump alone cannot be replayed', () => {
      expect(buildUnlockPinFingerprint('pepper-a', 42, '4827')).not.toBe(
        buildUnlockPinFingerprint('pepper-b', 42, '4827'),
      );
    });
  });
});
