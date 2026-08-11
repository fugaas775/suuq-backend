/**
 * Shared normalisation for the public receipt verification token.
 *
 * The register mints the token (see pos-s `receiptVerification.js`) and prints
 * it twice on the receipt: once inside the QR, once as human-readable text
 * grouped in fours, so a customer with a broken camera can type it in. Both
 * paths land here, and both must agree character-for-character or a scan and a
 * keystroke would resolve to different rows.
 *
 * The alphabet is Crockford base32 — no I, L, O or U, so nothing in the printed
 * code can be confused with 1, 0 or read as an accidental word. Typed input is
 * folded the Crockford way (I/L -> 1, O -> 0) before lookup, and the group
 * dashes are stripped, so "9f3k-7qp2-wxol" resolves the same as "9F3K7QP2WX01".
 */
export const RECEIPT_VERIFICATION_CODE_ALPHABET =
  '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Length the register mints. 14 chars of base32 = 70 bits. */
export const RECEIPT_VERIFICATION_CODE_LENGTH = 14;

const MIN_LENGTH = 8;
const MAX_LENGTH = 16;

export function normalizeReceiptVerificationCode(
  value?: string | null,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const folded = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');

  if (folded.length < MIN_LENGTH || folded.length > MAX_LENGTH) {
    return null;
  }

  for (const char of folded) {
    if (!RECEIPT_VERIFICATION_CODE_ALPHABET.includes(char)) {
      return null;
    }
  }

  return folded;
}

/** Groups a stored code in fours for printing: "9F3K7QP2WX0123" -> "9F3K-7QP2-WX01-23". */
export function formatReceiptVerificationCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? []).join('-');
}
