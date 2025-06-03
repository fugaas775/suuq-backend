import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { SeedService } from './seed.service';
// 👇 Import your global TypeOrm connection (usually at root of app)
import { TypeOrmConfigModule } from '../typeorm-config.module'; // <-- adjust if needed

@Module({
  imports: [
    TypeOrmModule.forRoot(), // 👈 Ensures DataSource is provided (adjust if needed)
    TypeOrmModule.forFeature([Product, ProductImage]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedsModule {}
