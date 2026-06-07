import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { PosSuspendedCart } from '../pos-sync/entities/pos-suspended-cart.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { Product } from '../products/entities/product.entity';
import { BranchCatalogProductLink } from '../retail/entities/branch-catalog-product-link.entity';
import { PosSyncModule } from '../pos-sync/pos-sync.module';
import { ConsumerBranchController } from './consumer-branch.controller';
import { ConsumerOrderController } from './consumer-order.controller';
import { ConsumerOrderService } from './consumer-order.service';

@Module({
  imports: [
    PosSyncModule,
    TypeOrmModule.forFeature([
      Branch,
      PosSuspendedCart,
      VendorStore,
      Product,
      BranchCatalogProductLink,
    ]),
  ],
  controllers: [ConsumerBranchController, ConsumerOrderController],
  providers: [ConsumerOrderService],
})
export class ConsumerModule {}
