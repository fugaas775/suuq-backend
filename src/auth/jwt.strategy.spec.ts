import { ConfigService } from '@nestjs/config';
import { JwtStrategy, carriesPossiblyDerivedAdmin } from './jwt.strategy';

/**
 * Tokens minted before VENDOR stopped deriving ADMIN still carry it until they
 * expire. The strategy strips an ADMIN the user row does not hold, and asks
 * the database only about the derived shape (VENDOR + ADMIN, no SUPER_ADMIN).
 */
describe('JwtStrategy — the ADMIN a vendor token used to be handed', () => {
  const config = { get: () => 'secret' } as unknown as ConfigService;

  function strategyWith(storedRoles: string[] | null, fail = false) {
    const findOne = jest.fn(async () => {
      if (fail) throw new Error('db down');
      return storedRoles ? { id: 41, roles: storedRoles } : null;
    });
    const dataSource = { getRepository: () => ({ findOne }) } as any;
    return { strategy: new JwtStrategy(config, dataSource), findOne };
  }

  it('recognises only the derived shape', () => {
    expect(
      carriesPossiblyDerivedAdmin(['VENDOR', 'POS_MANAGER', 'ADMIN']),
    ).toBe(true);
    expect(
      carriesPossiblyDerivedAdmin(['VENDOR', 'ADMIN', 'SUPER_ADMIN']),
    ).toBe(false);
    expect(carriesPossiblyDerivedAdmin(['ADMIN'])).toBe(false);
    expect(carriesPossiblyDerivedAdmin(['VENDOR', 'POS_MANAGER'])).toBe(false);
    expect(carriesPossiblyDerivedAdmin(undefined)).toBe(false);
  });

  it('strips ADMIN from a vendor whose row does not hold it', async () => {
    const { strategy } = strategyWith(['VENDOR']);
    const user = await strategy.validate({
      sub: 41,
      roles: ['VENDOR', 'POS_MANAGER', 'ADMIN'],
    });
    expect(user.roles).toEqual(['VENDOR', 'POS_MANAGER']);
  });

  it('keeps ADMIN for a vendor whose row holds it', async () => {
    const { strategy } = strategyWith(['VENDOR', 'ADMIN']);
    const user = await strategy.validate({
      sub: 41,
      roles: ['VENDOR', 'POS_MANAGER', 'ADMIN'],
    });
    expect(user.roles).toEqual(['VENDOR', 'POS_MANAGER', 'ADMIN']);
  });

  it('fails closed when the row cannot be read', async () => {
    const { strategy } = strategyWith(null, true);
    const user = await strategy.validate({
      sub: 41,
      roles: ['VENDOR', 'ADMIN'],
    });
    expect(user.roles).toEqual(['VENDOR']);
  });

  it('never asks the database about any other token', async () => {
    const { strategy, findOne } = strategyWith(['ADMIN']);
    const a = await strategy.validate({
      sub: 1,
      roles: ['SUPER_ADMIN', 'ADMIN', 'VENDOR'],
    });
    const b = await strategy.validate({
      sub: 2,
      roles: ['POS_OPERATOR'],
      tokenType: 'pos_operator',
    });
    const c = await strategy.validate({ sub: 3, roles: ['ADMIN'] });
    expect(a.roles).toEqual(['SUPER_ADMIN', 'ADMIN', 'VENDOR']);
    expect(b.roles).toEqual(['POS_OPERATOR']);
    expect(c.roles).toEqual(['ADMIN']);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('reads a user once per few minutes, not per request', async () => {
    const { strategy, findOne } = strategyWith(['VENDOR']);
    await strategy.validate({ sub: 41, roles: ['VENDOR', 'ADMIN'] });
    await strategy.validate({ sub: 41, roles: ['VENDOR', 'ADMIN'] });
    expect(findOne).toHaveBeenCalledTimes(1);
  });
});
