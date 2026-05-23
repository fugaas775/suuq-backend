import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Product } from '../products/entities/product.entity';
import { HotelRoom } from '../hospitality/entities/hotel-room.entity';
import { HotelRatePlan } from '../hospitality/entities/hotel-rate-plan.entity';
import { HotelReservation } from '../hospitality/entities/hotel-reservation.entity';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VendorStore,
      Branch,
      Product,
      HotelRoom,
      HotelRatePlan,
      HotelReservation,
    ]),
  ],
  controllers: [StorefrontController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
