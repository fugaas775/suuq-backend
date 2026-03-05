import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CartService } from './cart.service';
import { Cart, CartItem } from './entities/cart.entity';
import { Product } from '../products/entities/product.entity';
import { CurrencyService } from '../common/services/currency.service';

describe('CartService', () => {
  let service: CartService;
  let cartRepositoryMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let cartItemRepositoryMock: {
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let productRepositoryMock: {
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    cartRepositoryMock = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 1, user: { id: 1 }, items: [] }),
      create: jest.fn(),
      save: jest.fn(),
    };

    cartItemRepositoryMock = {
      create: jest.fn((payload) => payload),
      save: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    productRepositoryMock = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getRepositoryToken(Cart), useValue: cartRepositoryMock },
        {
          provide: getRepositoryToken(CartItem),
          useValue: cartItemRepositoryMock,
        },
        {
          provide: getRepositoryToken(Product),
          useValue: productRepositoryMock,
        },
        {
          provide: CurrencyService,
          useValue: {
            convert: jest.fn((amount: number) => amount),
            getRate: jest.fn().mockReturnValue(1),
          },
        },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  it('rejects cart add when required selectable attributes are missing', async () => {
    productRepositoryMock.findOne.mockResolvedValue({
      id: 10,
      currency: 'ETB',
      price: 100,
      attributes: {
        categoryAttributes: [
          { key: 'color', required: true, options: ['Red', 'Blue'] },
        ],
      },
      category: null,
    });

    await expect(service.addItem(1, 10, 1, 'ETB', {})).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.addItem(1, 10, 1, 'ETB', {})).rejects.toThrow(
      'Missing required product selections: color',
    );

    expect(cartItemRepositoryMock.save).not.toHaveBeenCalled();
  });

  it('accepts cart add when required selectable attributes are provided', async () => {
    productRepositoryMock.findOne.mockResolvedValue({
      id: 11,
      currency: 'ETB',
      price: 120,
      attributes: {
        categoryAttributes: [
          { key: 'size', required: true, options: ['S', 'M', 'L'] },
        ],
      },
      category: null,
    });

    await expect(
      service.addItem(1, 11, 1, 'ETB', { size: 'M' }),
    ).resolves.toBeDefined();

    expect(cartItemRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: 1,
        attributes: { size: 'M' },
      }),
    );
    expect(cartItemRepositoryMock.save).toHaveBeenCalled();
  });

  it('rejects cart add when required variant selection value is invalid', async () => {
    productRepositoryMock.findOne.mockResolvedValue({
      id: 12,
      currency: 'ETB',
      price: 180,
      attributes: {
        categoryAttributes: [
          { key: 'size', required: true, options: ['S', 'M', 'L'] },
        ],
      },
      category: null,
    });

    await expect(
      service.addItem(1, 12, 1, 'ETB', { size: ['M'] as any }),
    ).rejects.toThrow('Invalid required product selections: size');

    await expect(
      service.addItem(1, 12, 1, 'ETB', { size: 'XL' }),
    ).rejects.toThrow('Invalid required product selections: size');

    expect(cartItemRepositoryMock.save).not.toHaveBeenCalled();
  });
});
