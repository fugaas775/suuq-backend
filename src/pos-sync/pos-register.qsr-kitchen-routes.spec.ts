import 'reflect-metadata';
import { POS_REQUIRED_PERMISSIONS_KEY } from '../auth/decorators/require-pos-permissions.decorator';
import { PosRegisterController } from './pos-register.controller';

/**
 * The QSR cook holds exactly ONE permission, and it has to open the route the
 * kitchen display writes through.
 *
 * A QSR kitchen display is derived from the order itself — there is no ticket
 * table behind it, because the order is the only record a quick-service shop
 * keeps and a second one could only disagree with it. So "this station's food
 * is up" is a `metadata` write on PATCH /suspended-carts/:id.
 *
 * The cook lane (`QSR_KITCHEN`) is deliberately minimal: it cannot park a
 * basket, open a folio, enrol a pupil or settle anything, so it holds none of
 * the other members of that OR-list. Without MARK_KITCHEN_TICKET_READY on this
 * route the board renders, the cook taps Ready, and the tap 403s — leaving the
 * pass believing food is served while every other screen still shows it
 * cooking. That is the exact failure the SCHOOL fee desk hit in August, in a
 * kitchen instead of an office.
 */
const permissionsOn = (method: keyof PosRegisterController): string[] =>
  Reflect.getMetadata(
    POS_REQUIRED_PERMISSIONS_KEY,
    PosRegisterController.prototype[method],
  ) ?? [];

describe('PosRegisterController — QSR kitchen route permissions', () => {
  it('lets a cook record that their station is ready', () => {
    expect(permissionsOn('updateSuspendedCart')).toContain(
      'MARK_KITCHEN_TICKET_READY',
    );
  });

  it('does NOT let the cook create or discard an order', () => {
    // The one permission opens one route. A cook who could POST a suspended
    // cart could invent an order; one who could discard could clear the board.
    // Both are the counter's, and this is what keeps the lane honest.
    expect(permissionsOn('suspendCart')).not.toContain(
      'MARK_KITCHEN_TICKET_READY',
    );
    expect(permissionsOn('discardSuspendedCart')).not.toContain(
      'MARK_KITCHEN_TICKET_READY',
    );
    expect(permissionsOn('resumeSuspendedCart')).not.toContain(
      'MARK_KITCHEN_TICKET_READY',
    );
  });

  it("leaves every other format's grant on the route untouched", () => {
    expect(permissionsOn('updateSuspendedCart')).toEqual(
      expect.arrayContaining([
        'SUSPEND_SALE',
        'OPEN_ROOM_FOLIO',
        'VIEW_FOLIO_BOARD',
        'ENROL_STUDENT',
        'POST_FEE_CHARGE',
        'SETTLE_FEE_PAYMENT',
      ]),
    );
  });
});
