import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Lockout counters for register quick-unlock PINs.
 *
 * A 4-digit PIN is a 10,000-wide space, so the hash is not what protects it —
 * this is. Two independent counters:
 *
 *  - per waiter: 5 wrong PINs locks that one staff member out for 10 minutes.
 *    Deliberately the same numbers as the frontend's existing password-unlock
 *    throttle so the two paths feel identical to a cashier.
 *  - per branch: 15 wrong PINs in a 10-minute window disables PIN unlock for
 *    the whole branch for 15 minutes. This is what catches somebody walking the
 *    tile grid trying 1234 against every name.
 *
 * Password unlock is never affected by either counter — it stays available as
 * the escape hatch for a locked-out or forgetful waiter.
 *
 * Redis is optional in this deployment (RedisService yields a null client when
 * unconfigured), so there is an in-memory fallback. Per-process rather than
 * cluster-wide, but a PIN endpoint with no throttle at all is not an option.
 */

export interface PinLockoutState {
  locked: boolean;
  scope: 'USER' | 'BRANCH' | null;
  retryAfterSeconds: number;
}

interface MemoryCounter {
  count: number;
  expiresAt: number;
}

@Injectable()
export class PosOperatorPinThrottleService {
  private readonly logger = new Logger(PosOperatorPinThrottleService.name);

  static readonly USER_MAX_ATTEMPTS = 5;
  static readonly USER_LOCKOUT_SECONDS = 10 * 60;
  static readonly BRANCH_MAX_ATTEMPTS = 15;
  static readonly BRANCH_WINDOW_SECONDS = 10 * 60;
  static readonly BRANCH_LOCKOUT_SECONDS = 15 * 60;

  private readonly memory = new Map<string, MemoryCounter>();

  constructor(private readonly redisService: RedisService) {}

  private userKey(branchId: number, userId: number): string {
    return `pos:pin:fail:${branchId}:${userId}`;
  }

  private branchKey(branchId: number): string {
    return `pos:pin:fail:branch:${branchId}`;
  }

  /**
   * Reports whether this waiter (or their whole branch) is currently locked
   * out, without consuming an attempt.
   */
  async getLockoutState(
    branchId: number,
    userId: number,
  ): Promise<PinLockoutState> {
    const [userCount, userTtl] = await this.read(
      this.userKey(branchId, userId),
    );
    if (userCount >= PosOperatorPinThrottleService.USER_MAX_ATTEMPTS) {
      return {
        locked: true,
        scope: 'USER',
        retryAfterSeconds: Math.max(userTtl, 1),
      };
    }

    const [branchCount, branchTtl] = await this.read(this.branchKey(branchId));
    if (branchCount >= PosOperatorPinThrottleService.BRANCH_MAX_ATTEMPTS) {
      return {
        locked: true,
        scope: 'BRANCH',
        retryAfterSeconds: Math.max(branchTtl, 1),
      };
    }

    return { locked: false, scope: null, retryAfterSeconds: 0 };
  }

  /**
   * Records one wrong PIN. Returns the resulting lockout state so the caller
   * can tell the waiter to switch to their password rather than keep guessing.
   */
  async recordFailure(
    branchId: number,
    userId: number,
  ): Promise<PinLockoutState> {
    const userCount = await this.bump(
      this.userKey(branchId, userId),
      PosOperatorPinThrottleService.USER_LOCKOUT_SECONDS,
    );
    const branchCount = await this.bump(
      this.branchKey(branchId),
      PosOperatorPinThrottleService.BRANCH_WINDOW_SECONDS,
    );

    if (branchCount >= PosOperatorPinThrottleService.BRANCH_MAX_ATTEMPTS) {
      // Re-stamp the branch key with the longer lockout TTL so the block
      // outlives the rolling window that triggered it.
      await this.expire(
        this.branchKey(branchId),
        PosOperatorPinThrottleService.BRANCH_LOCKOUT_SECONDS,
      );
      this.logger.warn(
        `PIN unlock disabled for branch ${branchId} after ${branchCount} failed attempts.`,
      );
      return {
        locked: true,
        scope: 'BRANCH',
        retryAfterSeconds: PosOperatorPinThrottleService.BRANCH_LOCKOUT_SECONDS,
      };
    }

    if (userCount >= PosOperatorPinThrottleService.USER_MAX_ATTEMPTS) {
      return {
        locked: true,
        scope: 'USER',
        retryAfterSeconds: PosOperatorPinThrottleService.USER_LOCKOUT_SECONDS,
      };
    }

    return { locked: false, scope: null, retryAfterSeconds: 0 };
  }

  /** Successful unlock clears that waiter's counter (never the branch one). */
  async clearFailures(branchId: number, userId: number): Promise<void> {
    const key = this.userKey(branchId, userId);
    const client = this.redisService.getClient();
    if (client) {
      try {
        await client.del(key);
        return;
      } catch (err) {
        this.logger.warn(
          `Redis del failed for ${key}: ${(err as Error)?.message || err}`,
        );
      }
    }
    this.memory.delete(key);
  }

  private async read(key: string): Promise<[number, number]> {
    const client = this.redisService.getClient();
    if (client) {
      try {
        const [raw, ttl] = await Promise.all([
          client.get(key),
          client.ttl(key),
        ]);
        return [Number(raw) || 0, Number(ttl) > 0 ? Number(ttl) : 0];
      } catch (err) {
        this.logger.warn(
          `Redis read failed for ${key}: ${(err as Error)?.message || err}`,
        );
      }
    }

    const entry = this.memory.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return [0, 0];
    }
    return [entry.count, Math.ceil((entry.expiresAt - Date.now()) / 1000)];
  }

  private async bump(key: string, ttlSeconds: number): Promise<number> {
    const client = this.redisService.getClient();
    if (client) {
      try {
        const next = Number(await client.incr(key));
        if (next === 1) {
          await client.expire(key, ttlSeconds);
        }
        return next;
      } catch (err) {
        this.logger.warn(
          `Redis incr failed for ${key}: ${(err as Error)?.message || err}`,
        );
      }
    }

    const now = Date.now();
    const entry = this.memory.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.memory.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  private async expire(key: string, ttlSeconds: number): Promise<void> {
    const client = this.redisService.getClient();
    if (client) {
      try {
        await client.expire(key, ttlSeconds);
        return;
      } catch (err) {
        this.logger.warn(
          `Redis expire failed for ${key}: ${(err as Error)?.message || err}`,
        );
      }
    }

    const entry = this.memory.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
  }
}
