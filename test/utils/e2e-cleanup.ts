import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';
import { RedisService } from '../../src/redis/redis.service';

type CloseE2eAppOptions = {
  app?: INestApplication;
  moduleFixture?: TestingModule;
  dataSource?: DataSource;
  queueNames?: string[];
};

export async function closeE2eApp({
  app,
  moduleFixture,
  dataSource,
  queueNames = ['emails', 'notifications'],
}: CloseE2eAppOptions): Promise<void> {
  if (app) {
    for (const queueName of queueNames) {
      try {
        const queue = app.get<Queue>(getQueueToken(queueName), {
          strict: false,
        });
        if (queue) {
          await queue.close();
          if (typeof (queue as any).disconnect === 'function') {
            (queue as any).disconnect();
          }
        }
      } catch {
        // best-effort queue shutdown
      }
    }

    try {
      const redisService = app.get<RedisService>(RedisService, {
        strict: false,
      });
      const redisClient = redisService?.getClient?.();
      if (redisClient) {
        if (typeof redisClient.quit === 'function') {
          await redisClient.quit();
        } else if (typeof redisClient.disconnect === 'function') {
          redisClient.disconnect();
        }
      }
    } catch {
      // best-effort redis shutdown
    }

    await app.close();
  }

  if (moduleFixture) {
    try {
      await moduleFixture.close();
    } catch {
      // ignore module close failures in tests
    }
  }

  if (dataSource?.isInitialized) {
    try {
      await dataSource.destroy();
    } catch {
      // ignore datasource close failures in tests
    }
  }

  try {
    process.removeAllListeners('warning');
    process.removeAllListeners('uncaughtExceptionMonitor');
    process.removeAllListeners('unhandledRejection');
  } catch {
    // ignore process listener cleanup failures
  }

  if (process.env.DEBUG_E2E_HANDLES === '1') {
    try {
      const activeHandles: any[] =
        (process as any)._getActiveHandles?.().filter(Boolean) ?? [];
      const details = activeHandles.map((h) => {
        const name = h?.constructor?.name || typeof h;
        const isStd =
          h === process.stdin || h === process.stdout || h === process.stderr;
        const sock =
          name === 'Socket'
            ? {
                localAddress: h.localAddress,
                localPort: h.localPort,
                remoteAddress: h.remoteAddress,
                remotePort: h.remotePort,
                readable: h.readable,
                writable: h.writable,
              }
            : undefined;
        return { name, isStd, socket: sock };
      });
      console.log('[e2e-cleanup] Active handles after cleanup:', details);
    } catch {
      // ignore debug handle inspection failures
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 25));
}
