import compression from 'compression';
import { constants as zlib } from 'zlib';

/**
 * How the API compresses its own responses — brotli for the browsers that
 * take it, gzip for the rest.
 *
 * nginx on the box has no brotli module, so this is where brotli happens:
 * the `compression` middleware (1.8+) negotiates `br` ahead of `gzip` from
 * the client's Accept-Encoding and nginx passes an already-encoded body
 * through untouched. The middleware's own default is brotli quality 4, which
 * on this API's JSON is no smaller than gzip at level 6 (22.7 % against
 * 22.3 % of the raw bytes on the category tree) — it bought nothing but a
 * faster encode. Quality 7 is where brotli earns its place on text: about
 * 9 % under gzip on a 78 KB tree, 6 % on a 126 KB vocabulary, for the same
 * encode time as gzip (measured 2026-10-28 on Node 22). Qualities above 9
 * are for build-time assets, not for a response someone is waiting on.
 *
 * The window is 1 MiB (lgwin 20) rather than brotli's 4 MiB default: the
 * encoder's memory is native, outside the V8 heap and inside pm2's RSS cap,
 * and a worker streaming a few dozen responses at once should not grow by
 * a few dozen times 5 MB for a ratio this JSON cannot use.
 *
 * Only bodies over a kilobyte, only compressible types, never a response
 * that says `Cache-Control: no-transform` — the middleware's own rules,
 * unchanged. `ENABLE_NODE_COMPRESSION=false` turns it off (main.ts).
 */
export const RESPONSE_COMPRESSION_THRESHOLD_BYTES = 1024;
export const BROTLI_QUALITY = 7;
export const BROTLI_WINDOW_BITS = 20;

/** The middleware's own options type — reached through the function, as the typings export it. */
type CompressionOptions = NonNullable<Parameters<typeof compression>[0]>;

export function responseCompressionOptions(): CompressionOptions {
  return {
    threshold: RESPONSE_COMPRESSION_THRESHOLD_BYTES,
    brotli: {
      params: {
        [zlib.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
        [zlib.BROTLI_PARAM_LGWIN]: BROTLI_WINDOW_BITS,
        [zlib.BROTLI_PARAM_MODE]: zlib.BROTLI_MODE_TEXT,
      },
    },
  };
}

/** The middleware, configured as above. */
export function responseCompression() {
  return compression(responseCompressionOptions());
}
