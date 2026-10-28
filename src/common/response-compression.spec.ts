import express from 'express';
import * as http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { brotliDecompressSync, constants as zlib, gunzipSync } from 'zlib';
import {
  BROTLI_QUALITY,
  BROTLI_WINDOW_BITS,
  responseCompression,
  responseCompressionOptions,
} from './response-compression';

/**
 * The API's responses go out brotli-encoded to a browser that accepts it,
 * gzip to one that does not, plain when small or told not to transform —
 * and decode back to the exact JSON either way.
 */
function makeApp() {
  const app = express();
  app.use(responseCompression());
  const rows = Array.from({ length: 400 }, (_, i) => ({
    id: i + 1,
    name: `Category ${i + 1}`,
    slug: `category-${i + 1}`,
    children: [{ id: 10000 + i, name: `Child of ${i + 1}` }],
  }));
  app.get('/big', (_req, res) => res.json({ items: rows }));
  app.get('/small', (_req, res) => res.json({ ok: true }));
  app.get('/no-transform', (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-transform');
    res.json({ items: rows });
  });
  return { app, rows };
}

/**
 * The bytes as they cross the wire. supertest decodes gzip and brotli on the
 * way in, which is exactly what these two tests must see through.
 */
function rawGet(
  app: express.Express,
  path: string,
  headers: Record<string, string>,
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      http
        .get({ host: '127.0.0.1', port, path, headers }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            server.close();
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: Buffer.concat(chunks),
            });
          });
        })
        .on('error', (error) => {
          server.close();
          reject(error);
        });
    });
  });
}

describe('responseCompression', () => {
  it('is brotli quality 7 in a 1 MiB window, above a kilobyte', () => {
    const options = responseCompressionOptions();
    expect(options.threshold).toBe(1024);
    expect(options.brotli?.params?.[zlib.BROTLI_PARAM_QUALITY]).toBe(
      BROTLI_QUALITY,
    );
    expect(options.brotli?.params?.[zlib.BROTLI_PARAM_LGWIN]).toBe(
      BROTLI_WINDOW_BITS,
    );
    expect(BROTLI_QUALITY).toBe(7);
    expect(BROTLI_WINDOW_BITS).toBe(20);
  });

  it('answers a brotli-capable browser with br that decodes to the JSON', async () => {
    const { app, rows } = makeApp();
    const res = await rawGet(app, '/big', {
      'accept-encoding': 'gzip, deflate, br, zstd',
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(String(res.headers.vary)).toMatch(/Accept-Encoding/);
    const body = JSON.parse(brotliDecompressSync(res.body).toString('utf8'));
    expect(body.items).toEqual(rows);
    expect(res.body.length).toBeLessThan(
      JSON.stringify({ items: rows }).length / 4,
    );
  });

  it('falls back to gzip for a client that only takes gzip', async () => {
    const { app, rows } = makeApp();
    const res = await rawGet(app, '/big', { 'accept-encoding': 'gzip' });
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(JSON.parse(gunzipSync(res.body).toString('utf8')).items).toEqual(
      rows,
    );
  });

  it('leaves a small body, and a no-transform body, alone', async () => {
    const { app } = makeApp();
    const small = await request(app).get('/small').set('Accept-Encoding', 'br');
    expect(small.headers['content-encoding']).toBeUndefined();
    expect(small.body).toEqual({ ok: true });
    const untouched = await request(app)
      .get('/no-transform')
      .set('Accept-Encoding', 'br');
    expect(untouched.headers['content-encoding']).toBeUndefined();
    expect(untouched.body.items).toHaveLength(400);
  });
});
