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

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const started = process.hrtime.bigint();
    const ctx = context.switchToHttp();
  const req = ctx.getRequest() as any;
    const method = String((req?.method as string) || 'GET').toUpperCase();
    // Use originalUrl but normalize dynamic params (simple stripping of numeric IDs)
    const originalUrl = String((req?.originalUrl as string) || req?.url || '/');
    const route = originalUrl
      .replace(/\d+/g, ':id')
      .replace(/[a-f0-9]{24}/gi, ':id');

    return next.handle().pipe(
      tap({
        next: () => {
          const res = ctx.getResponse() as any;
          const status = Number(res?.statusCode || 200);
          const durationSec = Number(process.hrtime.bigint() - started) / 1e9;
          this.prom.incHttpRequests(method, route, status);
          this.prom.observeDuration(method, route, status, durationSec);
        },
        error: () => {
          const res = ctx.getResponse() as any;
          const status = Number(res?.statusCode || 500);
          const durationSec = Number(process.hrtime.bigint() - started) / 1e9;
          this.prom.incHttpRequests(method, route, status);
          this.prom.observeDuration(method, route, status, durationSec);
        },
      }),
    );
  }
}
