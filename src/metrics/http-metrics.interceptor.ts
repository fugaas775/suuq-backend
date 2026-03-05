import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrometheusService } from './prometheus.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly prom: PrometheusService) {}

  private normalizeRoute(req: any): string {
    const routePath = req?.route?.path;
    const baseUrl = String(req?.baseUrl || '');

    if (routePath) {
      const normalizedRoutePath = String(routePath).replace(/\/+/g, '/');
      const fullPath = `${baseUrl}${normalizedRoutePath}` || '/';
      return fullPath.startsWith('/') ? fullPath : `/${fullPath}`;
    }

    const originalUrl = String((req?.originalUrl as string) || req?.url || '/');
    const pathname = originalUrl.split('?')[0].split('#')[0] || '/';

    return pathname
      .replace(/\/(\d+)(?=\/|$)/g, '/:id')
      .replace(/\/[a-f0-9]{24}(?=\/|$)/gi, '/:id')
      .replace(
        /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi,
        '/:id',
      );
  }

  private statusClass(status: number): string {
    if (!Number.isFinite(status) || status < 100) return 'unknown';
    return `${Math.floor(status / 100)}xx`;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const started = process.hrtime.bigint();
    const ctx = context.switchToHttp();
    const req = ctx.getRequest();
    const method = String((req?.method as string) || 'GET').toUpperCase();
    const route = this.normalizeRoute(req);

    return next.handle().pipe(
      tap({
        next: () => {
          const res = ctx.getResponse();
          const status = Number(res?.statusCode || 200);
          const statusClass = this.statusClass(status);
          const durationSec = Number(process.hrtime.bigint() - started) / 1e9;
          this.prom.incHttpRequests(method, route, status);
          this.prom.incHttpRequestsByStatusClass(method, route, statusClass);
          if (status >= 400) {
            this.prom.incHttpFailedRequests(method, route, status, statusClass);
          }
          this.prom.observeDuration(method, route, status, durationSec);
        },
        error: () => {
          const res = ctx.getResponse();
          const status = Number(res?.statusCode || 500);
          const statusClass = this.statusClass(status);
          const durationSec = Number(process.hrtime.bigint() - started) / 1e9;
          this.prom.incHttpRequests(method, route, status);
          this.prom.incHttpRequestsByStatusClass(method, route, statusClass);
          this.prom.incHttpFailedRequests(method, route, status, statusClass);
          this.prom.observeDuration(method, route, status, durationSec);
        },
      }),
    );
  }
}
