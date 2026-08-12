import 'reflect-metadata';
import { ConsumerHotelController } from './consumer-hotel.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

/**
 * The guards on this controller are the only thing standing between an
 * anonymous request and every hotel guest's name and phone number.
 *
 * It used to carry `@UseGuards(JwtAuthGuard)` on the CLASS. Opening booking to
 * guests meant taking that off, because Nest adds method guards to class guards
 * rather than replacing them — and each `/me/` route reads its user id from the
 * token and queries `where: { customerUserId: userId }`. TypeORM DROPS an
 * undefined condition, so an unguarded `/me/` route would return the fifty most
 * recent reservations across every hotel on the platform.
 *
 * There is no global guard in this application, so a missing decorator is an
 * open route rather than a failing one. These tests are the tripwire.
 */
const guardsOn = (method: string): unknown[] =>
  Reflect.getMetadata(
    '__guards__',
    ConsumerHotelController.prototype[method],
  ) ?? [];

describe('ConsumerHotelController guards', () => {
  it('leaves no guard on the class, deliberately and knowingly', () => {
    // If this ever comes back, the POST below stops accepting guests and the
    // whole point of the change is undone.
    expect(
      Reflect.getMetadata('__guards__', ConsumerHotelController) ?? [],
    ).toEqual([]);
  });

  it('lets a guest book without an account', () => {
    expect(guardsOn('createReservation')).toContain(OptionalJwtAuthGuard);
    expect(guardsOn('createReservation')).not.toContain(JwtAuthGuard);
  });

  it.each([
    'listMyReservations',
    'getMyReservation',
    'payReservation',
    'cancelReservation',
  ])('keeps %s behind a real token', (method) => {
    expect(guardsOn(method)).toContain(JwtAuthGuard);
    // Optional auth on any of these would be the data leak.
    expect(guardsOn(method)).not.toContain(OptionalJwtAuthGuard);
  });

  it('refuses a /me/ read with no user even if the guard were removed', () => {
    // Belt and braces: the handler itself must not query on an undefined id.
    const controller = Object.create(
      ConsumerHotelController.prototype,
    ) as ConsumerHotelController;
    const find = jest.fn();
    (controller as unknown as { reservationRepo: unknown }).reservationRepo = {
      find,
      findOne: find,
    };

    return Promise.all([
      expect(controller.listMyReservations({ user: {} })).rejects.toThrow(),
      expect(controller.getMyReservation(1, { user: {} })).rejects.toThrow(),
    ]).then(() => {
      expect(find).not.toHaveBeenCalled();
    });
  });
});
