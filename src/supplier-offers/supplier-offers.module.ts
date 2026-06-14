import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { SupplierProfile } from '../suppliers/entities/supplier-profile.entity';
import { SupplierOffer } from './entities/supplier-offer.entity';
import { SupplierOffersController } from './supplier-offers.controller';
import { SupplierOffersService } from './supplier-offers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupplierOffer, SupplierProfile, Product]),
  ],
  controllers: [SupplierOffersController],
  providers: [SupplierOffersService],
  exports: [SupplierOffersService],
})
export class SupplierOffersModule {}
