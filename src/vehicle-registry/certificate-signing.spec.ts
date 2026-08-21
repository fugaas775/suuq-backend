import { generateKeyPairSync, createPublicKey } from 'crypto';
import {
  packCertificatePayload,
  unpackCertificatePayload,
  signCertificate,
  verifyCertificateBlob,
  resolvePublicKeyPem,
  CERTIFICATE_PAYLOAD_VERSION,
} from './certificate-signing';

function keyEnv() {
  const { privateKey } = generateKeyPairSync('ed25519');
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return {
    env: {
      VEHICLE_REGISTRY_SIGNING_KEY: Buffer.from(pem).toString('base64'),
      VEHICLE_REGISTRY_SIGNING_KID: '7',
    } as NodeJS.ProcessEnv,
    publicPem: createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString(),
  };
}

const cert = {
  issuedAt: new Date('2026-08-21T00:00:00Z'),
  expiresAt: new Date('2027-08-21T00:00:00Z'),
  plateCode: '2',
  regionCode: 'SM',
  serial: 1,
  vin: 'JTDBR32E060123456',
};

describe('offline certificate signing', () => {
  it('fits the QR budget the frontend encoder can actually print', () => {
    // The hand-rolled encoder tops out at version 10 / ECC-M — 216 bytes in
    // byte mode. This is the constraint that forced packed binary over JSON, so
    // it is asserted rather than remembered.
    const { env } = keyEnv();
    const blob = signCertificate(cert, env)!;
    const url = `https://suuq-s.com/vr/K7M2QF9XB4TH3P#d=${blob}`;
    expect(Buffer.byteLength(url)).toBeLessThanOrEqual(216);
  });

  it('round-trips every field', () => {
    const packed = packCertificatePayload({ ...cert, keyId: 7 });
    const back = unpackCertificatePayload(packed)!;
    expect(back.version).toBe(CERTIFICATE_PAYLOAD_VERSION);
    expect(back.keyId).toBe(7);
    expect(back.plateCode).toBe('2');
    expect(back.regionCode).toBe('SM');
    expect(back.serial).toBe(1);
    expect(back.vinLast6).toBe('123456');
    // Day precision: same calendar day, seconds deliberately not carried.
    expect(back.issuedAt.toISOString().slice(0, 10)).toBe('2026-08-21');
    expect(back.expiresAt.toISOString().slice(0, 10)).toBe('2027-08-21');
  });

  it('verifies a genuine certificate', () => {
    const { env, publicPem } = keyEnv();
    const blob = signCertificate(cert, env)!;
    const verdict = verifyCertificateBlob(blob, publicPem, new Date('2026-09-01T00:00:00Z'));
    expect(verdict.valid).toBe(true);
    expect(verdict.expired).toBe(false);
    expect(verdict.payload?.regionCode).toBe('SM');
  });

  it('rejects a tampered payload', () => {
    // The whole point: change the plate on the paper and the signature stops
    // matching. Flip one byte of the payload, leaving the signature intact.
    const { env, publicPem } = keyEnv();
    const blob = signCertificate(cert, env)!;
    const raw = Buffer.from(blob, 'base64url');
    raw.writeUInt32BE(9999, 9); // a different serial
    const verdict = verifyCertificateBlob(raw.toString('base64url'), publicPem);
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe('BAD_SIGNATURE');
  });

  it("rejects a certificate signed by somebody else's key", () => {
    const a = keyEnv();
    const b = keyEnv();
    const blob = signCertificate(cert, a.env)!;
    expect(verifyCertificateBlob(blob, b.publicPem).valid).toBe(false);
  });

  it('reports expiry SEPARATELY from validity', () => {
    // A genuine certificate that has run out is a real Bureau document AND not
    // currently valid. Collapsing the two would leave an officer unable to tell
    // a forgery from a lapsed licence — very different conversations.
    const { env, publicPem } = keyEnv();
    const blob = signCertificate(cert, env)!;
    const verdict = verifyCertificateBlob(blob, publicPem, new Date('2030-01-01T00:00:00Z'));
    expect(verdict.valid).toBe(true);
    expect(verdict.expired).toBe(true);
  });

  it('refuses malformed input without throwing', () => {
    const { publicPem } = keyEnv();
    for (const junk of ['', 'not-base64!!', 'AAAA', 'x'.repeat(500)]) {
      const verdict = verifyCertificateBlob(junk, publicPem);
      expect(verdict.valid).toBe(false);
    }
  });

  it('issues online-only when no key is configured, rather than failing', () => {
    // A registry that refused to register vehicles because a signing key was
    // missing would be worse than one that cannot be checked at a roadside.
    expect(signCertificate(cert, {} as NodeJS.ProcessEnv)).toBeNull();
    expect(resolvePublicKeyPem({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('survives a malformed key without taking the registry down', () => {
    const env = { VEHICLE_REGISTRY_SIGNING_KEY: 'this is not a key' } as NodeJS.ProcessEnv;
    expect(signCertificate(cert, env)).toBeNull();
    expect(resolvePublicKeyPem(env)).toBeNull();
  });

  it('publishes the public half, never the private one', () => {
    const { env } = keyEnv();
    const pem = resolvePublicKeyPem(env)!;
    expect(pem).toContain('BEGIN PUBLIC KEY');
    expect(pem).not.toContain('PRIVATE');
  });

  it('carries the key id, so keys can rotate without reprinting certificates', () => {
    const { env, publicPem } = keyEnv();
    const blob = signCertificate(cert, env)!;
    expect(verifyCertificateBlob(blob, publicPem).payload?.keyId).toBe(7);
  });
});
