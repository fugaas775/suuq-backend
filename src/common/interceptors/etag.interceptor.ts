import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class EtagInterceptor implements NestInterceptor {
  constructor(private readonly cacheSeconds = 300) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    return next.handle().pipe(
      map((data) => {
        try {
          // If response already sent/ended by controller, don't touch headers
          const resAny: any = res as any;
          if (resAny?.headersSent || resAny?.writableEnded || resAny?.writableFinished) {
            return data;
          }

          // Apply only for idempotent reads and successful responses
          const method = String(req?.method || '').toUpperCase();
          const statusCode: number = typeof res.statusCode === 'number' ? res.statusCode : 200;
          if ((method !== 'GET' && method !== 'HEAD') || statusCode < 200 || statusCode >= 300) {
            return data;
          }

          // Bypass ETag/Cache for curation endpoints entirely
          const originalUrl: string = (
            req?.originalUrl || req?.url || ''
          ).toString();
          // For some endpoints (like v1/products) we avoid 304 because of client concurrency issues
          // Consider both with and without a global prefix (e.g., /api)
          const avoid304 = originalUrl.includes('/v1/products');
          if (originalUrl.includes('/curation/')) {
            // Force no-store and suppress ETag generation by Express
            if (!res.getHeader('Cache-Control')) {
              res.setHeader('Cache-Control', 'no-store');
            }
            // do not set an ETag for curation
            return data;
          }

          const routeCache = res.getHeader('Cache-Control');
          if (routeCache) {
            const cc = String(routeCache).toLowerCase();
            if (cc.includes('no-store')) {
              // Respect route opting out of caching/etag
              return data;
            }
          }

          // If controller already set an ETag, respect it and skip unless this is an avoid304 route
          if (!avoid304 && res.getHeader('ETag')) {
            return data;
          }

          const body = JSON.stringify(data ?? '');
          const etag = 'W/"' + createHash('sha1').update(body).digest('hex') + '"';
          const ifNoneMatch = req.headers['if-none-match'];

          // Prepare common caching headers
          const ensureCachingHeaders = () => {
            // Do not set ETag for avoid304 routes, and remove any pre-set one to prevent Express fresh() from issuing 304
            if (!avoid304) {
              if (!res.getHeader('ETag')) {
                res.setHeader('ETag', etag);
              }
            } else {
              if (res.getHeader('ETag')) {
                res.removeHeader('ETag');
              }
            }
            if (!res.getHeader('Last-Modified')) {
              res.setHeader('Last-Modified', new Date().toUTCString());
            }
            if (!res.getHeader('Cache-Control')) {
              res.setHeader('Cache-Control', `public, max-age=${this.cacheSeconds}`);
            }
          };

          // Always set headers for normal 200 flow
          ensureCachingHeaders();

          if (!avoid304 && ifNoneMatch && ifNoneMatch === etag) {
            // For 304, explicitly (re)apply headers to be safe
            res.status(304);
            ensureCachingHeaders();
            return undefined;
          }
        } catch {
          // ignore hashing errors
        }
        return data;
      }),
    );
  }
}
