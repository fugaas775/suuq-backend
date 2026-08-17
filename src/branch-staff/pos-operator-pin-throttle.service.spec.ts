import { PosOperatorPinThrottleService } from './pos-operator-pin-throttle.service';
import { RedisService } from '../redis/redis.service';

/**
 * Exercises the in-memory fallback path (RedisService yields a null client
 * whenever Redis is unconfigured, which is the case on a plain dev box).
 */
describe('PosOperatorPinThrottleService (no Redis)', () => {
  let service: PosOperatorPinThrottleService;

  beforeEach(() => {
    const redis = { getClient: () => null } as unknown as RedisService;
    service = new PosOperatorPinThrottleService(redis);
  });

  it('starts unlocked', async () => {
    await expect(service.getLockoutState(1, 10)).resolves.toEqual({
      locked: false,
      scope: null,
      retryAfterSeconds: 0,
    });
  });

  it('locks one waiter after five wrong PINs', async () => {
    for (let i = 0; i < 4; i += 1) {
      const state = await service.recordFailure(1, 10);
      expect(state.locked).toBe(false);
    }

    const fifth = await service.recordFailure(1, 10);
    expect(fifth.locked).toBe(true);
    expect(fifth.scope).toBe('USER');
    expect(fifth.retryAfterSeconds).toBe(
      PosOperatorPinThrottleService.USER_LOCKOUT_SECONDS,
    );

    await expect(service.getLockoutState(1, 10)).resolves.toMatchObject({
      locked: true,
      scope: 'USER',
    });
  });

  it('does not lock a different waiter at the same branch', async () => {
    for (let i = 0; i < 5; i += 1) {
      await service.recordFailure(1, 10);
    }

    await expect(service.getLockoutState(1, 11)).resolves.toMatchObject({
      locked: false,
    });
  });

  it('does not lock the same waiter at a different branch', async () => {
    for (let i = 0; i < 5; i += 1) {
      await service.recordFailure(1, 10);
    }

    await expect(service.getLockoutState(2, 10)).resolves.toMatchObject({
      locked: false,
    });
  });

  it('disables PIN unlock branch-wide when someone walks the tile grid', async () => {
    // Three failures each against five different waiters: no single waiter
    // trips the per-user counter, but the branch counter reaches 15.
    let last;
    for (let userId = 100; userId < 105; userId += 1) {
      for (let i = 0; i < 3; i += 1) {
        last = await service.recordFailure(7, userId);
      }
    }

    expect(last?.locked).toBe(true);
    expect(last?.scope).toBe('BRANCH');

    // A waiter who never typed a wrong PIN is now blocked too.
    await expect(service.getLockoutState(7, 999)).resolves.toMatchObject({
      locked: true,
      scope: 'BRANCH',
    });
  });

  it('clears the waiter counter on a successful unlock but leaves the branch counter alone', async () => {
    for (let i = 0; i < 4; i += 1) {
      await service.recordFailure(3, 20);
    }
    await service.clearFailures(3, 20);

    await expect(service.getLockoutState(3, 20)).resolves.toMatchObject({
      locked: false,
    });

    // The four branch-level failures survive, so a sweep across many waiters
    // still adds up.
    for (let i = 0; i < 11; i += 1) {
      await service.recordFailure(3, 21);
    }
    await expect(service.getLockoutState(3, 22)).resolves.toMatchObject({
      locked: true,
      scope: 'BRANCH',
    });
  });
});
