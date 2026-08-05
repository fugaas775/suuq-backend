import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import { KitchenProductAvailability } from '../hospitality/entities/kitchen-product-availability.entity';
import { PosSuspendedCart } from '../pos-sync/entities/pos-suspended-cart.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { Product } from '../products/entities/product.entity';
import { BranchCatalogProductLink } from '../retail/entities/branch-catalog-product-link.entity';
import { PosSyncModule } from '../pos-sync/pos-sync.module';
import { ConsumerBranchController } from './consumer-branch.controller';
import { ConsumerCatalogController } from './consumer-catalog.controller';
import { ConsumerOrderController } from './consumer-order.controller';
import { ConsumerServiceFormatController } from './consumer-service-format.controller';
import { ConsumerOrderService } from './consumer-order.service';
import { ConsumerShelfService } from './consumer-shelf.service';

@Module({
  imports: [
    PosSyncModule,
    TypeOrmModule.forFeature([
      Branch,
      BranchInventory,
      KitchenProductAvailability,
      PosSuspendedCart,
      VendorStore,
      Product,
      BranchCatalogProductLink,
    ]),
  ],
  controllers: [
    ConsumerBranchController,
    ConsumerCatalogController,
    ConsumerOrderController,
    ConsumerServiceFormatController,
  ],
  providers: [ConsumerOrderService, ConsumerShelfService],
})
export class ConsumerModule {}
