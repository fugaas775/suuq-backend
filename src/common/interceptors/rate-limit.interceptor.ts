import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

type Bucket = { tokens: number; last: number };

type KeyScope = 'global' | 'path' | 'url' | 'route';
type KeyBy = 'user' | 'ip' | 'userOrIp';

export type RateLimitOptions = {
  // Approximate requests per second; also used to derive refill rate
  maxRps?: number;
  // Bucket capacity (burst). Defaults to maxRps when omitted
  burst?: number;
  // How to derive the key subject
  keyBy?: KeyBy;
  // Whether to include the request target in the key, and at which granularity
  scope?: KeyScope;
  // Attach informational headers like X-RateLimit-* and Retry-After
  headers?: boolean;
};

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxRps: number;
  private readonly burst: number;
  private readonly keyBy: KeyBy;
  private readonly scope: KeyScope;
  private readonly headers: boolean;

  constructor(
    maxRpsOrOptions?: number | RateLimitOptions,
    maybeOptions?: RateLimitOptions,
  ) {
    const opts: RateLimitOptions =
      typeof maxRpsOrOptions === 'number'
        ? { maxRps: maxRpsOrOptions, ...(maybeOptions || {}) }
        : maxRpsOrOptions || {};

    this.maxRps = Math.max(1, Math.floor(opts.maxRps ?? 30));
    this.burst = Math.max(1, Math.floor(opts.burst ?? this.maxRps));
    this.keyBy = opts.keyBy ?? 'userOrIp';
    this.scope = opts.scope ?? 'route';
    this.headers = opts.headers ?? true;
  }

  private buildKey(req: any): string {
    // Subject
    const ip = (req.ip || req.connection?.remoteAddress || 'anon').toString();
    const uid = (req.user?.id ?? '').toString();
    let subject = '';
    switch (this.keyBy) {
      case 'user':
        subject = `u:${uid || 'anon'}`;
        break;
      case 'ip':
        subject = `ip:${ip}`;
        break;
      default:
        subject = uid ? `u:${uid}` : `ip:${ip}`;
    }

    // Target
    let target = '';
    try {
      if (this.scope === 'global') target = '';
      else if (this.scope === 'route') {
        const base = (req.baseUrl || '').toString();
        const routePath = (req.route?.path || '').toString();
        target = `${base}${routePath}` || req.path || '';
      } else if (this.scope === 'path') {
        target = (req.path || req.url || '').toString().split('?')[0];
      } else if (this.scope === 'url') {
        target = (req.originalUrl || req.url || '').toString();
      }
    } catch {
      target = '';
    }
    return `rl:${subject}:${target}`;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const key = this.buildKey(req);
    const now = Date.now();
    const refillPerMs = this.maxRps / 1000; // tokens per ms
    const cap = this.burst;

    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: cap, last: now };
      this.buckets.set(key, b);
    }

    // Refill based on elapsed time
    const elapsed = now - b.last;
    if (elapsed > 0) {
      b.tokens = Math.min(cap, b.tokens + elapsed * refillPerMs);
      b.last = now;
    }

    if (b.tokens < 1) {
      const deficit = 1 - b.tokens;
      const retryMs = Math.ceil(deficit / refillPerMs);
      if (this.headers) {
        res.setHeader('Retry-After', Math.max(1, Math.ceil(retryMs / 1000)));
        res.setHeader('X-RateLimit-Limit', `${this.maxRps}`);
        res.setHeader(
          'X-RateLimit-Policy',
          `token-bucket; scope=${this.scope}; burst=${cap}; rate=${this.maxRps}/s`,
        );
        res.setHeader('X-RateLimit-Remaining', '0');
      }
      throw new HttpException('Rate limit exceeded', 429);
    }

    // Consume one token
    b.tokens -= 1;
    if (this.headers) {
      res.setHeader('X-RateLimit-Limit', `${this.maxRps}`);
      res.setHeader(
        'X-RateLimit-Policy',
        `token-bucket; scope=${this.scope}; burst=${cap}; rate=${this.maxRps}/s`,
      );
      res.setHeader(
        'X-RateLimit-Remaining',
        `${Math.max(0, Math.floor(b.tokens))}`,
      );
    }

    return next.handle();
  }
}
