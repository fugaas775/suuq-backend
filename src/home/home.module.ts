import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { HomeV1Controller } from './v1.home.controller';
import { ProductsModule } from '../products/products.module';
import { Category } from '../categories/entities/category.entity';
import { Favorite } from '../favorites/entities/favorite.entity';
import { Order } from '../orders/entities/order.entity';
import { CurationModule } from '../curation/curation.module';
import { HomeV2Controller } from './v2.home.controller';
import { MetricsModule } from '../metrics/metrics.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    forwardRef(() => ProductsModule),
    CurationModule,
    MetricsModule,
    SearchModule,
    TypeOrmModule.forFeature([Category, Favorite, Order]),
  ],
  controllers: [HomeController, HomeV1Controller, HomeV2Controller],
  providers: [HomeService],
  exports: [HomeService],
})
export class HomeModule {}
