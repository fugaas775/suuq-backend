import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { HomeService } from '../home/home.service';
import { FavoritesService } from '../favorites/favorites.service';
import { CategoriesService } from '../categories/categories.service';
import { CacheInterceptor } from '@nestjs/cache-manager';

describe('ProductsController', () => {
  let controller: ProductsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: {} },
        { provide: HomeService, useValue: {} },
        { provide: FavoritesService, useValue: {} },
        { provide: CategoriesService, useValue: {} },
        // CacheInterceptor dependencies
        {
          provide: 'CACHE_MANAGER',
          useValue: { get: jest.fn(), set: jest.fn() },
        },
        {
          provide: CacheInterceptor,
          useValue: { intercept: jest.fn((_, next) => next.handle()) },
        },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
