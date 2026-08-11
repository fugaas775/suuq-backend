import { randomBytes } from 'crypto';
import { RECEIPT_VERIFICATION_CODE_ALPHABET } from '../pos-sync/receipt-verification-code';

/**
 * The code a shopper holds for a checkout placed with no account.
 *
 * It is the only credential on the order, so it has to be unguessable — 10
 * characters of base32 is 50 bits, which no one is walking at the 60-per-minute
 * the status endpoint allows. And it has to survive being read aloud, squinted
 * at on a cracked screen, or typed in by someone who was handed a printed
 * slip — which is why it borrows the receipt token's Crockford alphabet (no I,
 * L, O or U) and the same I/L→1, O→0 folding on the way back in.
 *
 * Displayed grouped — `SQ-7K3MV-92XPA` — and matched with the dashes and case
 * stripped, so what a shopper types always finds what we minted.
 */
const CODE_LENGTH = 10;
const PREFIX = 'SQ';

export function mintConsumerOrderGroupRef(): string {
  const alphabet = RECEIPT_VERIFICATION_CODE_ALPHABET;
  // Rejection-free because 256 is not a multiple of 32 only in the sense that
  // it is exactly 8×32 — every byte maps to a symbol with uniform probability.
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }
  return `${PREFIX}-${code.slice(0, 5)}-${code.slice(5)}`;
}

/**
 * Folds anything a shopper might present — a pasted URL segment, a typed code,
 * lower case, missing dashes — into the stored form. Returns null when the input
 * cannot be a code at all, so callers 404 rather than querying with rubbish.
 */
export function normalizeConsumerOrderGroupRef(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') return null;

  const folded = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/^SQ/, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');

  if (folded.length !== CODE_LENGTH) return null;
  for (const char of folded) {
    if (!RECEIPT_VERIFICATION_CODE_ALPHABET.includes(char)) return null;
  }

  return `${PREFIX}-${folded.slice(0, 5)}-${folded.slice(5)}`;
}
