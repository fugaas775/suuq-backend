import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { Tag } from '../tags/tag.entity';
import { Category } from '../categories/entities/category.entity';
import { ProductImpression } from './entities/product-impression.entity';
import { SearchKeyword } from './entities/search-keyword.entity';

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(ProductImage), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(Order), useValue: {} },
        { provide: getRepositoryToken(Tag), useValue: {} },
        { provide: getRepositoryToken(Category), useValue: {} },
        { provide: getRepositoryToken(ProductImpression), useValue: {} },
        { provide: getRepositoryToken(SearchKeyword), useValue: {} },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
