import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

type Bucket = { tokens: number; last: number };

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(private maxRps = 30) {}
  private buckets = new Map<string, Bucket>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const userId = (req.user?.id ?? req.ip ?? 'anon').toString();
    const key = `fav:${userId}`;
    const now = Date.now();
    const refillPerMs = this.maxRps / 1000; // tokens per ms
    const cap = this.maxRps;
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: cap, last: now };
      this.buckets.set(key, b);
    }
    // Refill
    const elapsed = now - b.last;
    b.tokens = Math.min(cap, b.tokens + elapsed * refillPerMs);
    b.last = now;
    if (b.tokens < 1) {
      const retryMs = Math.ceil((1 - b.tokens) / refillPerMs);
      res.setHeader('Retry-After', Math.ceil(retryMs / 1000));
      throw new HttpException('Rate limit exceeded', 429);
    }
    b.tokens -= 1;
    return next.handle();
  }
}
