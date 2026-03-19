import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Order, OrderItem } from './entities/order.entity';
import { Dispute } from './entities/dispute.entity';
import { CartService } from '../cart/cart.service';
import { CreditService } from '../credit/credit.service';
import { MpesaService } from '../mpesa/mpesa.service';
import { TelebirrService } from '../telebirr/telebirr.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DoSpacesService } from '../media/do-spaces.service';
import { AuditService } from '../audit/audit.service';
import { CurrencyService } from '../common/services/currency.service';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { Message } from '../chat/entities/message.entity';
import { ProductsService } from '../products/products.service';
import { EbirrService } from '../ebirr/ebirr.service';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { PromotionsService } from '../promotions/promotions.service';
import { PayoutLog } from '../wallet/entities/payout-log.entity';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { Branch } from '../branches/entities/branch.entity';
import { InventoryLedgerService } from '../branches/inventory-ledger.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepositoryMock: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let cartServiceMock: { getCart: jest.Mock };
  let productsServiceMock: { findManyByIds: jest.Mock };
  let branchesRepositoryMock: { findOne: jest.Mock };
  let inventoryLedgerServiceMock: { adjustReservedOnline: jest.Mock };
  let uiSettingRepoMock: { findOne: jest.Mock };
  let emailServiceMock: {
    sendOrderCancelled: jest.Mock;
    sendOrderConfirmation: jest.Mock;
  };

  beforeEach(async () => {
    orderRepositoryMock = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: any) => ({ id: value.id ?? 999, ...value })),
      save: jest.fn(async (value: any) => value),
    };

    cartServiceMock = {
      getCart: jest.fn().mockResolvedValue({ items: [] }),
    };

    productsServiceMock = {
      findManyByIds: jest.fn().mockResolvedValue([]),
    };

    branchesRepositoryMock = {
      findOne: jest.fn().mockResolvedValue({ id: 11 }),
    };

    uiSettingRepoMock = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    inventoryLedgerServiceMock = {
      adjustReservedOnline: jest.fn(),
    };

    emailServiceMock = {
      sendOrderCancelled: jest.fn().mockResolvedValue(undefined),
      sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepositoryMock },
        { provide: getRepositoryToken(OrderItem), useValue: {} },
        { provide: getRepositoryToken(Dispute), useValue: {} },
        { provide: CartService, useValue: cartServiceMock },
        { provide: CreditService, useValue: {} },
        { provide: MpesaService, useValue: {} },
        { provide: TelebirrService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: DoSpacesService, useValue: {} },
        { provide: AuditService, useValue: {} },
        { provide: getRepositoryToken(UiSetting), useValue: uiSettingRepoMock },
        { provide: getRepositoryToken(Message), useValue: {} },
        { provide: getRepositoryToken(PayoutLog), useValue: {} },
        { provide: getRepositoryToken(EbirrTransaction), useValue: {} },
        {
          provide: getRepositoryToken(Branch),
          useValue: branchesRepositoryMock,
        },
        { provide: ProductsService, useValue: productsServiceMock },
        { provide: EbirrService, useValue: {} },
        { provide: EmailService, useValue: emailServiceMock },
        { provide: UsersService, useValue: {} },
        { provide: WalletService, useValue: {} },
        {
          provide: CurrencyService,
          useValue: {
            convert: jest.fn((value: number) => value),
            getRate: jest.fn().mockReturnValue(1),
          },
        },
        { provide: PromotionsService, useValue: {} },
        {
          provide: InventoryLedgerService,
          useValue: inventoryLedgerServiceMock,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('normalizes duplicated country codes in EBIRR phones', () => {
    expect((service as any).normalizeEbirrPhone('251+251912615526')).toBe(
      '251912615526',
    );
  });

  it('resolves verified EBIRR phone from stored profile number without double prefixing', () => {
    expect(
      (service as any).resolveVerifiedEbirrPhone({
        isPhoneVerified: true,
        phoneCountryCode: '+251',
        phoneNumber: '251912615526',
      }),
    ).toBe('251912615526');
  });

  it('rejects BUY_NOW checkout without items', async () => {
    await expect(
      service.createFromCart(
        1,
        {
          checkoutMode: 'BUY_NOW',
          paymentMethod: 'EBIRR',
          shippingAddress: {
            fullName: 'Buyer',
            address: 'Bole',
            city: 'Addis Ababa',
            country: 'ET',
            phoneNumber: '251912345678',
          },
        } as any,
        'ETB',
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createFromCart(
        1,
        {
          checkoutMode: 'BUY_NOW',
          paymentMethod: 'EBIRR',
          shippingAddress: {
            fullName: 'Buyer',
            address: 'Bole',
            city: 'Addis Ababa',
            country: 'ET',
            phoneNumber: '251912345678',
          },
        } as any,
        'ETB',
      ),
    ).rejects.toThrow('BUY_NOW checkout requires items in request body.');
  });

  it('CART mode does not require items and proceeds to cart lookup', async () => {
    await expect(
      service.createFromCart(
        7,
        {
          checkoutMode: 'CART',
          paymentMethod: 'EBIRR',
          shippingAddress: {
            fullName: 'Buyer',
            address: 'Bole',
            city: 'Addis Ababa',
            country: 'ET',
            phoneNumber: '251912345678',
          },
        } as any,
        'ETB',
      ),
    ).rejects.toThrow('Cannot create an order from an empty cart.');

    expect(cartServiceMock.getCart).toHaveBeenCalledWith(7, 'ETB');
  });

  it('rejects BUY_NOW when required selectable attributes are missing', async () => {
    productsServiceMock.findManyByIds.mockResolvedValue([
      {
        id: 101,
        attributes: {
          categoryAttributes: [
            { key: 'color', required: true, options: ['Red', 'Blue'] },
          ],
        },
      },
    ]);

    await expect(
      service.createFromCart(
        1,
        {
          checkoutMode: 'BUY_NOW',
          paymentMethod: 'EBIRR',
          shippingAddress: {
            fullName: 'Buyer',
            address: 'Bole',
            city: 'Addis Ababa',
            country: 'ET',
            phoneNumber: '251912345678',
          },
          items: [
            {
              productId: 101,
              quantity: 1,
              attributes: {},
            },
          ],
        } as any,
        'ETB',
      ),
    ).rejects.toThrow(
      'Missing required product selections for product 101: color',
    );
  });

  it('rejects CART checkout when cart item required selections are missing', async () => {
    cartServiceMock.getCart.mockResolvedValue({
      items: [
        {
          product: { id: 202 },
          quantity: 1,
          attributes: {},
        },
      ],
    });
    productsServiceMock.findManyByIds.mockResolvedValue([
      {
        id: 202,
        attributes: {
          categoryAttributes: [
            { key: 'size', required: true, options: ['S', 'M', 'L'] },
          ],
        },
      },
    ]);

    await expect(
      service.createFromCart(
        7,
        {
          checkoutMode: 'CART',
          paymentMethod: 'EBIRR',
          shippingAddress: {
            fullName: 'Buyer',
            address: 'Bole',
            city: 'Addis Ababa',
            country: 'ET',
            phoneNumber: '251912345678',
          },
        } as any,
        'ETB',
      ),
    ).rejects.toThrow(
      'Missing required product selections for product 202: size',
    );
  });

  it('rejects BUY_NOW when required variant selection value is invalid', async () => {
    productsServiceMock.findManyByIds.mockResolvedValue([
      {
        id: 303,
        attributes: {
          categoryAttributes: [
            { key: 'color', required: true, options: ['Red', 'Blue'] },
          ],
        },
      },
    ]);

    await expect(
      service.createFromCart(
        1,
        {
          checkoutMode: 'BUY_NOW',
          paymentMethod: 'EBIRR',
          shippingAddress: {
            fullName: 'Buyer',
            address: 'Bole',
            city: 'Addis Ababa',
            country: 'ET',
            phoneNumber: '251912345678',
          },
          items: [
            {
              productId: 303,
              quantity: 1,
              attributes: { color: 'Green' },
            },
          ],
        } as any,
        'ETB',
      ),
    ).rejects.toThrow(
      'Invalid required product selections for product 303: color',
    );
  });

  it('includes sanitized selected attributes in order response items', () => {
    const response = service.mapToResponseDto(
      {
        id: 77,
        total: 100,
        status: 'PENDING',
        paymentMethod: 'COD',
        paymentStatus: 'UNPAID',
        createdAt: new Date('2026-03-03T00:00:00.000Z'),
        shippingAddress: {},
        user: { id: 9 },
        items: [
          {
            quantity: 1,
            price: 100,
            attributes: {
              size: 'M',
              offerId: 999,
              client_ref: 'abc123',
              image_url: 'https://cdn/thumb.png',
            },
            product: {
              id: 401,
              name: 'Shirt',
              imageUrl: 'https://cdn/image.png',
              currency: 'ETB',
              attributes: {
                categoryAttributes: [
                  { key: 'size', required: true, options: ['S', 'M', 'L'] },
                ],
              },
            },
          },
        ],
      } as any,
      'ETB',
    );

    expect(response.items[0].attributes).toEqual({ size: 'M' });
  });

  it('verifying payment proof triggers post-payment processing', async () => {
    orderRepositoryMock.findOne.mockResolvedValue({
      id: 377,
      paymentMethod: 'BANK_TRANSFER',
      paymentStatus: 'UNPAID',
      paymentProofKey: 'payments/proofs/377/file.jpg',
      paymentProofStatus: 'PENDING_REVIEW',
    });

    const processedOrder = {
      id: 377,
      paymentStatus: 'PAID',
      status: 'PROCESSING',
      paymentProofStatus: 'VERIFIED',
    } as any;

    const triggerSpy = jest
      .spyOn(service as any, 'triggerPostPaymentProcessing')
      .mockResolvedValue(processedOrder);

    const result = await service.setPaymentProofStatusForAdmin(377, 'VERIFIED');

    expect(orderRepositoryMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 377,
        paymentProofStatus: 'VERIFIED',
      }),
    );
    expect(triggerSpy).toHaveBeenCalledWith(377);
    expect(result).toEqual(processedOrder);
  });

  it('rejecting payment proof does not trigger post-payment processing', async () => {
    orderRepositoryMock.findOne.mockResolvedValue({
      id: 378,
      paymentMethod: 'BANK_TRANSFER',
      paymentStatus: 'UNPAID',
      paymentProofKey: 'payments/proofs/378/file.jpg',
      paymentProofStatus: 'PENDING_REVIEW',
    });

    const triggerSpy = jest.spyOn(
      service as any,
      'triggerPostPaymentProcessing',
    );

    const result = await service.setPaymentProofStatusForAdmin(378, 'REJECTED');

    expect(orderRepositoryMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 378,
        paymentProofStatus: 'REJECTED',
      }),
    );
    expect(triggerSpy).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ id: 378, paymentProofStatus: 'REJECTED' }),
    );
  });

  it('reserves online inventory when a fulfillment branch is provided', async () => {
    productsServiceMock.findManyByIds.mockResolvedValue([
      {
        id: 501,
        price: 20,
        currency: 'ETB',
        vendor: { id: 90 },
        images: [],
        attributes: {},
      },
    ]);

    await service.createFromCart(
      1,
      {
        checkoutMode: 'BUY_NOW',
        paymentMethod: 'COD',
        fulfillmentBranchId: 11,
        shippingAddress: {
          fullName: 'Buyer',
          address: 'Bole',
          city: 'Addis Ababa',
          country: 'ET',
          phoneNumber: '251912345678',
        },
        items: [{ productId: 501, quantity: 2, attributes: {} }],
      } as any,
      'ETB',
    );

    expect(
      inventoryLedgerServiceMock.adjustReservedOnline,
    ).toHaveBeenCalledWith({
      branchId: 11,
      productId: 501,
      quantityDelta: 2,
    });
  });

  it('rejects an unknown fulfillment branch before order creation', async () => {
    branchesRepositoryMock.findOne.mockResolvedValueOnce(null);

    await expect(
      service.createFromCart(
        1,
        {
          checkoutMode: 'BUY_NOW',
          paymentMethod: 'COD',
          fulfillmentBranchId: 404,
          shippingAddress: {
            fullName: 'Buyer',
            address: 'Bole',
            city: 'Addis Ababa',
            country: 'ET',
            phoneNumber: '251912345678',
          },
          items: [],
        } as any,
        'ETB',
      ),
    ).rejects.toThrow('Fulfillment branch 404 not found.');
  });

  it('releases online inventory when an admin cancels a reserved order', async () => {
    orderRepositoryMock.findOne.mockResolvedValue({
      id: 901,
      status: 'PENDING',
      fulfillmentBranchId: 11,
      onlineReservationReleasedAt: null,
      items: [{ quantity: 2, product: { id: 501 } }],
    });

    await service.cancelOrderForAdmin(901);

    expect(
      inventoryLedgerServiceMock.adjustReservedOnline,
    ).toHaveBeenCalledWith({
      branchId: 11,
      productId: 501,
      quantityDelta: -2,
    });
    expect(orderRepositoryMock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 901,
        status: 'CANCELLED',
        onlineReservationReleasedAt: expect.any(Date),
      }),
    );
  });
});
