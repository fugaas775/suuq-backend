import {
  createPublicKey,
  KeyObject,
  createPrivateKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'crypto';

/**
 * Offline verification: what an officer can check with no network at all.
 *
 * ── What a signature proves, and what it cannot ─────────────────────────────
 *
 * It proves the Bureau issued THIS certificate, for this plate, class, expiry
 * and chassis. It says nothing about what has happened since — a car flagged
 * stolen this morning still carries a perfectly valid signature printed last
 * year. Any surface showing an offline result must say so on its face, or we
 * will have built a forgery-resistant way to wave a stolen car through a
 * checkpoint.
 *
 * That is the whole reason the online page remains the authority and this is
 * the fallback, rather than the other way around.
 *
 * ── Why it fits in the QR ───────────────────────────────────────────────────
 *
 * The frontend's hand-rolled encoder tops out at version 10 / ECC-M — 216 bytes
 * in byte mode. Measured: a 19-byte packed payload plus a 64-byte Ed25519
 * signature is 111 base64url characters, and the whole URL comes to 150 bytes.
 * A JSON payload would not have fitted, which is why this is packed binary and
 * every field is fixed-width.
 *
 * ── Absent key = online-only, never a crash ─────────────────────────────────
 *
 * If no signing key is configured the registry still issues certificates; their
 * QR simply carries no `#d=` fragment and resolves online only. A registry that
 * refused to register vehicles because a key was missing would be worse than
 * one that cannot be checked at a roadside.
 */

/** Bumped only if the field layout changes. A verifier refuses what it cannot parse. */
export const CERTIFICATE_PAYLOAD_VERSION = 1;

/** version + kid + issued + expires + class + region + serial + vin6 */
const PAYLOAD_BYTES = 19;

const EPOCH_DAY_MS = 86_400_000;

export interface CertificatePayload {
  version: number;
  keyId: number;
  issuedAt: Date;
  expiresAt: Date;
  plateCode: string;
  regionCode: string;
  serial: number;
  vinLast6: string;
}

function toDays(date: Date): number {
  return Math.floor(date.getTime() / EPOCH_DAY_MS);
}

function fromDays(days: number): Date {
  return new Date(days * EPOCH_DAY_MS);
}

/**
 * Pack a certificate into 19 fixed-width bytes.
 *
 * Dates are days since epoch in 16 bits, which runs to the year 2149 — a
 * registry document does not need seconds, and seconds would have cost eight
 * more bytes for no reader who wants them.
 */
export function packCertificatePayload(input: {
  keyId: number;
  issuedAt: Date;
  expiresAt: Date;
  plateCode: string;
  regionCode: string;
  serial: number;
  vin: string;
}): Buffer {
  const buffer = Buffer.alloc(PAYLOAD_BYTES);
  let offset = 0;

  buffer.writeUInt8(CERTIFICATE_PAYLOAD_VERSION, offset++);
  buffer.writeUInt8(input.keyId & 0xff, offset++);
  buffer.writeUInt16BE(toDays(input.issuedAt), offset);
  offset += 2;
  buffer.writeUInt16BE(toDays(input.expiresAt), offset);
  offset += 2;

  // One character. Every numbered class is a single digit; the named ones
  // (police, UN, AU, temporary) take their first letter, which is unambiguous
  // among P/U/A/T and is only ever a display hint offline.
  const classChar = String(input.plateCode || '?').trim().charAt(0) || '?';
  buffer.write(classChar, offset++, 1, 'ascii');

  buffer.write(String(input.regionCode || '??').padEnd(2, '?').slice(0, 2), offset, 2, 'ascii');
  offset += 2;

  buffer.writeUInt32BE(Math.max(0, Math.floor(input.serial || 0)), offset);
  offset += 4;

  // Last six of the chassis: enough for an officer to match the certificate
  // against the stamped number, short enough to fit. Padded so the field is
  // fixed-width even for a short VIN.
  const vin = String(input.vin || '').toUpperCase().slice(-6).padStart(6, '0');
  buffer.write(vin, offset, 6, 'ascii');

  return buffer;
}

export function unpackCertificatePayload(buffer: Buffer): CertificatePayload | null {
  if (!buffer || buffer.length < PAYLOAD_BYTES) return null;

  const version = buffer.readUInt8(0);
  if (version !== CERTIFICATE_PAYLOAD_VERSION) return null;

  return {
    version,
    keyId: buffer.readUInt8(1),
    issuedAt: fromDays(buffer.readUInt16BE(2)),
    expiresAt: fromDays(buffer.readUInt16BE(4)),
    plateCode: buffer.toString('ascii', 6, 7),
    regionCode: buffer.toString('ascii', 7, 9),
    serial: buffer.readUInt32BE(9),
    vinLast6: buffer.toString('ascii', 13, 19),
  };
}

/** The bureau's signing key, or null when none is configured. */
export function resolveSigningKey(env: NodeJS.ProcessEnv = process.env): {
  key: KeyObject;
  keyId: number;
} | null {
  const raw = env.VEHICLE_REGISTRY_SIGNING_KEY;
  if (!raw || !raw.trim()) return null;

  try {
    const pem = raw.includes('BEGIN')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');
    return {
      key: createPrivateKey(pem),
      keyId: Number(env.VEHICLE_REGISTRY_SIGNING_KID || 1) || 1,
    };
  } catch {
    // A malformed key must not take the registry down. Certificates fall back
    // to online-only verification and the fault is visible in the /keys
    // endpoint answering empty.
    return null;
  }
}

/** The public half, for the officer app and the public key endpoint. */
export function resolvePublicKeyPem(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const signing = resolveSigningKey(env);
  if (!signing) return null;
  return createPublicKey(signing.key)
    .export({ type: 'spki', format: 'pem' })
    .toString();
}

/**
 * Sign a certificate, returning the base64url blob for the QR fragment.
 *
 * Null when no key is configured — the caller prints an online-only QR.
 */
export function signCertificate(
  input: Omit<Parameters<typeof packCertificatePayload>[0], 'keyId'>,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const signing = resolveSigningKey(env);
  if (!signing) return null;

  const payload = packCertificatePayload({ ...input, keyId: signing.keyId });
  const signature = cryptoSign(null, payload, signing.key);
  return Buffer.concat([payload, signature]).toString('base64url');
}

export interface OfflineVerdict {
  valid: boolean;
  reason?: 'MALFORMED' | 'BAD_SIGNATURE' | 'UNKNOWN_VERSION';
  payload?: CertificatePayload;
  /** True when the certificate's own expiry has passed. */
  expired?: boolean;
}

/**
 * Verify a blob against a public key, with no network.
 *
 * `expired` is reported separately from `valid`: a genuine certificate that has
 * run out is a real Bureau document AND not currently valid, and collapsing the
 * two would leave an officer unable to tell a forgery from a lapsed licence.
 */
export function verifyCertificateBlob(
  blob: string,
  publicKeyPem: string,
  now: Date = new Date(),
): OfflineVerdict {
  let raw: Buffer;
  try {
    raw = Buffer.from(String(blob || ''), 'base64url');
  } catch {
    return { valid: false, reason: 'MALFORMED' };
  }

  if (raw.length !== PAYLOAD_BYTES + 64) {
    return { valid: false, reason: 'MALFORMED' };
  }

  const payload = raw.subarray(0, PAYLOAD_BYTES);
  const signature = raw.subarray(PAYLOAD_BYTES);

  const parsed = unpackCertificatePayload(payload);
  if (!parsed) return { valid: false, reason: 'UNKNOWN_VERSION' };

  let ok = false;
  try {
    ok = cryptoVerify(null, payload, createPublicKey(publicKeyPem), signature);
  } catch {
    ok = false;
  }

  if (!ok) return { valid: false, reason: 'BAD_SIGNATURE', payload: parsed };

  return {
    valid: true,
    payload: parsed,
    expired: parsed.expiresAt.getTime() < now.getTime(),
  };
}
