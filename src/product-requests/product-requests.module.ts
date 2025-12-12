import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductRequestsService } from './product-requests.service';
import { ProductRequestsController } from './product-requests.controller';
import { ProductRequest } from './entities/product-request.entity';
import { ProductRequestOffer } from './entities/product-request-offer.entity';
import { ProductRequestForward } from './entities/product-request-forward.entity';
import { Category } from '../categories/entities/category.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductRequest,
      ProductRequestOffer,
      ProductRequestForward,
      Category,
      Product,
      User,
    ]),
    NotificationsModule,
  ],
  controllers: [ProductRequestsController],
  providers: [ProductRequestsService],
  exports: [ProductRequestsService],
})
export class ProductRequestsModule {}
