import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisService } from '../../redis/redis.service';

// Simple Redis-backed idempotency cache for POST/PUT requests.
// Uses the Idempotency-Key header as cache key; TTL configurable via IDEMPOTENCY_TTL_SEC (default: 600s)

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly ttlSec: number;
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  constructor(private readonly redis: RedisService) {
    this.ttlSec = parseInt(process.env.IDEMPOTENCY_TTL_SEC || '600', 10);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();

    const method = String(req?.method || 'GET').toUpperCase();
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
      return next.handle();
    }

    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key) {
      return next.handle();
    }

    const cacheKey = `idemp:${method}:${req.originalUrl || req.url}:${key}`;
    const client: any = this.redis.getClient();
    if (!client) {
      return next.handle();
    }

    return from(
      (async () => {
        const cached = await client.get(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            // Reapply cached status and headers (limited set)
            if (parsed.headers) {
              for (const [h, v] of Object.entries(parsed.headers)) {
                try {
                  res.setHeader(h, v as any);
                } catch (err) {
                  this.logger.debug(
                    'Idempotency header replay failed',
                    err as Error,
                  );
                }
              }
            }
            res.status(parsed.status || 200);
            return parsed.body;
          } catch (err) {
            this.logger.debug('Idempotency cache parse failed', err as Error);
          }
        }
        // no cached value - proceed and cache on success (2xx)
        let capturedStatus = 200;
        const origStatus = res.status?.bind(res);
        if (origStatus) {
          res.status = (code: number) => {
            capturedStatus = code;
            return origStatus(code);
          };
        }
        return next.handle().pipe(
          tap((body) => {
            if (capturedStatus >= 200 && capturedStatus < 300) {
              const headers: Record<string, string> = {};
              try {
                const keys = Object.keys(res.getHeaders?.() || {});
                for (const h of keys) {
                  const v = res.getHeader?.(h);
                  if (typeof v === 'string') headers[h] = v;
                }
              } catch (err) {
                this.logger.debug(
                  'Idempotency header capture failed',
                  err as Error,
                );
              }
              const payload = JSON.stringify({
                status: capturedStatus,
                headers,
                body,
              });
              void client
                .set(cacheKey, payload, 'EX', this.ttlSec)
                .catch((err: Error) =>
                  this.logger.debug('Idempotency cache write failed', err),
                );
            }
          }),
        );
      })(),
    ) as unknown as Observable<any>;
  }
}
