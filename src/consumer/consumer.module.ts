import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { BranchInventory } from '../branches/entities/branch-inventory.entity';
import { KitchenProductAvailability } from '../hospitality/entities/kitchen-product-availability.entity';
import { PosSuspendedCart } from '../pos-sync/entities/pos-suspended-cart.entity';
import { VendorStore } from '../vendor/entities/vendor-store.entity';
import { Product } from '../products/entities/product.entity';
import { BranchCatalogProductLink } from '../retail/entities/branch-catalog-product-link.entity';
import { SchoolClass } from '../school/entities/school-class.entity';
import { PosSyncModule } from '../pos-sync/pos-sync.module';
import { NotificationsModule } from '../notifications/notifications.module';
// A family applying for a school place is emailed to the head teacher: a
// school office is not a till, and an unread push is gone by the afternoon.
import { EmailModule } from '../email/email.module';
import {
  ConsumerOrderGroup,
  ConsumerOrderGroupItem,
} from './entities/consumer-order-group.entity';
import { ConsumerBranchController } from './consumer-branch.controller';
import { ConsumerCatalogController } from './consumer-catalog.controller';
import { ConsumerOrderController } from './consumer-order.controller';
import { ConsumerOrderGroupController } from './consumer-order-group.controller';
import { ConsumerServiceFormatController } from './consumer-service-format.controller';
import { ConsumerOrderService } from './consumer-order.service';
import { ConsumerOrderGroupService } from './consumer-order-group.service';
import { ConsumerShelfService } from './consumer-shelf.service';

@Module({
  imports: [
    PosSyncModule,
    NotificationsModule,
    EmailModule,
    TypeOrmModule.forFeature([
      Branch,
      BranchInventory,
      KitchenProductAvailability,
      PosSuspendedCart,
      VendorStore,
      Product,
      BranchCatalogProductLink,
      // Read-only, and only for a SCHOOL: the public form offers a family the
      // school's real classes to pick from instead of a box to describe one in.
      // The repository, not `SchoolModule` — see the note on the controller's
      // constructor for why this module stays guardless and self-contained.
      SchoolClass,
      ConsumerOrderGroup,
      ConsumerOrderGroupItem,
    ]),
  ],
  controllers: [
    ConsumerBranchController,
    ConsumerCatalogController,
    ConsumerOrderController,
    ConsumerOrderGroupController,
    ConsumerServiceFormatController,
  ],
  providers: [
    ConsumerOrderService,
    ConsumerOrderGroupService,
    ConsumerShelfService,
  ],
})
export class ConsumerModule {}
