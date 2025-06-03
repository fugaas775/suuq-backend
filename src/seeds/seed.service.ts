import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { ProductImage } from '../products/entities/product-image.entity';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly imageRepo: Repository<ProductImage>,
  ) {}

  async seed(productName = 'Sample Product', imageCount = 3) {
    try {
      // ... (your seeding logic)
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error('Seeding failed', err.stack || err.message);
      } else {
        this.logger.error('Seeding failed', String(err));
      }
      throw err;
    }
  }
}
