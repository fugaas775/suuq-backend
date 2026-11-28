import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

/**
 * Where a till in the field reports what it could not show anybody.
 *
 * The POS front end posts here when a panel crashes, when an error escapes
 * every boundary, and once per page load with how the page felt (LCP, INP,
 * CLS). Each report becomes ONE structured log line — `grep client-telemetry`
 * in the pm2 log is the whole query surface. No table, no migration: this is
 * for finding out that something broke and where, not for keeping.
 *
 * Anonymous on purpose. A crash can happen before sign-in, and a report must
 * never fail for want of a token. That makes it writable by anyone, so:
 *   - it is tightly throttled per client;
 *   - every field is coerced to a short string or a number, and anything not
 *     named below is dropped — nothing a caller sends is logged verbatim as a
 *     structure, and a line can never exceed a few kilobytes;
 *   - line breaks are flattened, so a report cannot forge a second log line.
 */
const TEXT_LIMITS: Record<string, number> = {
  type: 16,
  kind: 24,
  where: 80,
  name: 80,
  message: 600,
  stack: 1500,
  componentStack: 1500,
  build: 64,
  path: 200,
  serviceFormat: 40,
  lane: 60,
  detail: 120,
  at: 40,
};

function text(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const flat = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function finite(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

export function sanitizeClientTelemetry(
  body: unknown,
): Record<string, string | number | boolean | null> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const type = text(input.type, TEXT_LIMITS.type);
  if (type !== 'error' && type !== 'metric') return null;

  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    const value = text(input[key], max);
    if (value !== null) out[key] = value;
  }
  const branchId = finite(input.branchId);
  if (branchId !== null && Number.isInteger(branchId) && branchId > 0) {
    out.branchId = branchId;
  }
  const value = finite(input.value);
  if (value !== null) out.value = value;
  if (typeof input.online === 'boolean') out.online = input.online;

  if (type === 'error' && !out.message) return null;
  if (type === 'metric' && (!out.name || out.value === undefined)) return null;
  return out;
}

@ApiTags('client-telemetry')
@Controller('client-telemetry')
export class ClientTelemetryController {
  private readonly logger = new Logger('client-telemetry');

  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Front-end error / web-vital report (anonymous, log-only)',
  })
  report(@Body() body: unknown): void {
    const event = sanitizeClientTelemetry(body);
    // Malformed input is dropped without an error: a client that cannot
    // report must not be given a reason to retry.
    if (!event) return;
    const line = JSON.stringify(event);
    if (event.type === 'error') {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
  }
}
