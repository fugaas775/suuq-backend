import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { createHash } from 'crypto';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class EtagInterceptor implements NestInterceptor {
  constructor(private readonly cacheSeconds = 300) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    return next.handle().pipe(
      tap((data) => {
        try {
          // Bypass ETag/Cache for curation endpoints entirely
          const originalUrl: string = (req?.originalUrl || req?.url || '').toString();
          if (originalUrl.includes('/curation/')) {
            // Force no-store and suppress ETag generation by Express
            if (!res.getHeader('Cache-Control')) {
              res.setHeader('Cache-Control', 'no-store');
            }
            res.setHeader('ETag', '');
            return;
          }
          const routeCache = res.getHeader('Cache-Control');
          if (routeCache && String(routeCache).toLowerCase().includes('no-store')) {
            // Respect route opting out of caching/etag
            return;
          }
          const body = JSON.stringify(data ?? '');
          const etag = 'W/"' + createHash('sha1').update(body).digest('hex') + '"';
          const ifNoneMatch = req.headers['if-none-match'];
          res.setHeader('ETag', etag);
          if (!res.getHeader('Last-Modified')) {
            res.setHeader('Last-Modified', new Date().toUTCString());
          }
          res.setHeader('Cache-Control', `public, max-age=${this.cacheSeconds}`);
          if (ifNoneMatch && ifNoneMatch === etag) {
            res.status(304).end();
          }
        } catch {
          // ignore hashing errors
        }
      }),
    );
  }
}
