/**
 * Mint the Bureau's certificate signing keypair.
 *
 * The private half signs every certificate; the public half is published at
 * GET /api/public/vehicles/keys so an officer's device can verify one with no
 * network. Ed25519 because the signature is 64 bytes, and the QR the frontend
 * can actually print holds 216 — a larger scheme would not fit.
 *
 * SAFETY
 *   - Prints the private key ONCE, to stdout, and stores nothing. Put it in the
 *     server's .env as VEHICLE_REGISTRY_SIGNING_KEY and keep a copy somewhere
 *     the Bureau controls.
 *   - Rotating: raise VEHICLE_REGISTRY_SIGNING_KID and keep the OLD public key
 *     published too, or every certificate already in circulation stops
 *     verifying offline. The key id travels inside each signed payload
 *     precisely so both can be trusted at once.
 *   - Losing it means new certificates cannot be signed. It does NOT invalidate
 *     existing ones — their signatures are already printed, and the old public
 *     key still verifies them.
 *
 * USAGE
 *   node -r ts-node/register scripts/generate-vehicle-signing-key.ts
 */
import { generateKeyPairSync, createPublicKey } from 'crypto';

const { privateKey } = generateKeyPairSync('ed25519');
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = createPublicKey(privateKey)
  .export({ type: 'spki', format: 'pem' })
  .toString();

console.log('\n=== ADD TO THE SERVER .env (keep this secret) ===\n');
console.log(`VEHICLE_REGISTRY_SIGNING_KEY=${Buffer.from(privatePem).toString('base64')}`);
console.log('VEHICLE_REGISTRY_SIGNING_KID=1');
console.log('\n=== PUBLIC KEY (published; safe to share) ===\n');
console.log(publicPem);
console.log(
  'Rotating later: raise the KID and keep publishing the old public key, or\n' +
    'every certificate already in circulation stops verifying offline.\n',
);
