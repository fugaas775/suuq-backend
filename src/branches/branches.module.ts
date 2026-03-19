import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import {
  PurchaseOrder,
  PurchaseOrderItem,
} from '../purchase-orders/entities/purchase-order.entity';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { SupplierOffer } from '../supplier-offers/entities/supplier-offer.entity';
import { SupplierProfile } from '../suppliers/entities/supplier-profile.entity';
import { User } from '../users/entities/user.entity';
import { BranchTransfersController } from './branch-transfers.controller';
import { BranchTransfersService } from './branch-transfers.service';
import { BranchesController } from './branches.controller';
import { InventoryLedgerService } from './inventory-ledger.service';
import { ReplenishmentService } from './replenishment.service';
import { BranchInventory } from './entities/branch-inventory.entity';
import {
  BranchTransfer,
  BranchTransferItem,
} from './entities/branch-transfer.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { BranchesService } from './branches.service';
import { Branch } from './entities/branch.entity';
import { RetailModule as RetailAccessModule } from '../retail/retail.module';

@Module({
  imports: [
    forwardRef(() => PurchaseOrdersModule),
    RetailAccessModule,
    TypeOrmModule.forFeature([
      Branch,
      User,
      Product,
      PurchaseOrder,
      PurchaseOrderItem,
      SupplierOffer,
      SupplierProfile,
      BranchInventory,
      BranchTransfer,
      BranchTransferItem,
      StockMovement,
    ]),
  ],
  controllers: [BranchesController, BranchTransfersController],
  providers: [
    BranchesService,
    InventoryLedgerService,
    BranchTransfersService,
    ReplenishmentService,
  ],
  exports: [
    BranchesService,
    InventoryLedgerService,
    BranchTransfersService,
    ReplenishmentService,
  ],
})
export class BranchesModule {}
