import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: {} }],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

describe('OrdersController — deciding a dispute is an admin act', () => {
  const { Reflector } = jest.requireActual('@nestjs/core');
  const { RolesGuard } = jest.requireActual('../auth/roles.guard');
  const { OrdersController: Controller } = jest.requireActual(
    './orders.controller',
  );
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const contextFor = (
    handler: (...args: never[]) => unknown,
    roles: string[],
  ) =>
    ({
      getHandler: () => handler,
      getClass: () => Controller,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 9, roles } }) }),
    }) as any;

  it.each(['resolveDispute', 'refundDispute'])(
    '%s refuses a vendor or a customer and admits an admin',
    (name) => {
      const handler = Controller.prototype[name];
      expect(reflector.get('roles', handler)).toEqual(['ADMIN', 'SUPER_ADMIN']);
      expect(
        guard.canActivate(contextFor(handler, ['VENDOR', 'POS_MANAGER'])),
      ).toBe(false);
      expect(guard.canActivate(contextFor(handler, ['CUSTOMER']))).toBe(false);
      expect(guard.canActivate(contextFor(handler, ['ADMIN']))).toBe(true);
      expect(guard.canActivate(contextFor(handler, ['SUPER_ADMIN']))).toBe(
        true,
      );
    },
  );
});
