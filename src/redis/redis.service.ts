import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Use runtime require to avoid editor module resolution hiccups
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IORedis = require('ioredis');
type Redis = any;

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {
    // Only enable Redis if explicitly configured. Prevent noisy ECONNREFUSED logs
    // when no Redis is present by requiring REDIS_URL or REDIS_ENABLED=true.
    const url = this.config.get<string>('REDIS_URL');
    const enabledFlag = (
      this.config.get<string>('REDIS_ENABLED') || ''
    ).toLowerCase();
    const enabled = !!url || enabledFlag === 'true';

    if (!enabled) {
      this.logger.log(
        'Redis disabled (set REDIS_URL or REDIS_ENABLED=true to enable)',
      );
      this.client = null;
      return;
    }

    const host = this.config.get<string>('REDIS_HOST') || '127.0.0.1';
    const port = parseInt(this.config.get<string>('REDIS_PORT') || '6379', 10);

    try {
      const commonOpts = {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null as any, // one-shot attempt
      } as const;

      this.client = url
        ? new IORedis(url, commonOpts)
        : new IORedis({ host, port, ...commonOpts });

      this.client.on('error', (e) =>
        this.logger.warn(`Redis error: ${e?.message || e}`),
      );
      this.client.on('connect', () => this.logger.log('Redis connected'));

      // Attempt a single connect; if it fails, disable gracefully
      this.client.connect().catch((e: any) => {
        this.logger.warn(`Redis disabled: ${e?.message || e}`);
        try {
          this.client?.disconnect?.();
        } catch {}
        this.client = null;
      });
    } catch (e: any) {
      this.logger.error(`Failed to init Redis: ${e?.message || e}`);
      this.client = null;
    }
  }

  getClient(): Redis | null {
    return this.client;
  }
}
