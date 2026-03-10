import { createHmac, timingSafeEqual } from 'crypto';

export type VerifyStarpaySignatureInput = {
  payload: unknown;
  signature: string | null | undefined;
  timestamp: string | null | undefined;
  secret: string | null | undefined;
  toleranceMs?: number;
  now?: number;
};

export type VerifyStarpaySignatureResult = {
  ok: boolean;
  reason:
    | 'ok'
    | 'missing_secret'
    | 'missing_signature'
    | 'missing_timestamp'
    | 'invalid_timestamp'
    | 'timestamp_out_of_range'
    | 'signature_mismatch';
};

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return timingSafeEqual(aBuf, bBuf);
}

export function computeStarpaySignature(
  payload: unknown,
  timestamp: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${JSON.stringify(payload || {})}`)
    .digest('hex');
}

export function verifyStarpaySignature(
  input: VerifyStarpaySignatureInput,
): VerifyStarpaySignatureResult {
  const signature = String(input.signature || '').trim();
  const timestamp = String(input.timestamp || '').trim();
  const secret = String(input.secret || '').trim();
  const toleranceMs = input.toleranceMs ?? 300000;
  const now = input.now ?? Date.now();

  if (!secret) {
    return { ok: false, reason: 'missing_secret' };
  }

  if (!signature) {
    return { ok: false, reason: 'missing_signature' };
  }

  if (!timestamp) {
    return { ok: false, reason: 'missing_timestamp' };
  }

  const timestampValue = Number(timestamp);
  if (!Number.isFinite(timestampValue)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }

  const timestampMs =
    timestampValue > 1e12 ? timestampValue : timestampValue * 1000;
  if (Math.abs(now - timestampMs) > toleranceMs) {
    return { ok: false, reason: 'timestamp_out_of_range' };
  }

  const normalizedSignature = signature.replace(/^sha256=/i, '');
  const computedSignature = computeStarpaySignature(
    input.payload,
    timestamp,
    secret,
  );

  if (!safeEqual(normalizedSignature, computedSignature)) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  return { ok: true, reason: 'ok' };
}
