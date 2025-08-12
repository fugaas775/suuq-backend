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
