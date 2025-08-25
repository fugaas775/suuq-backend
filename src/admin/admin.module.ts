import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { RolesGuard } from '../auth/roles.guard';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';

// 1. Import the modules that provide the services you need
import { UsersModule } from '../users/users.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminCurationController } from './curation.controller';
import { Product } from '../products/entities/product.entity';
import { Tag } from '../tags/tag.entity';
import { ProductsModule } from '../products/products.module';
import { VendorModule } from '../vendor/vendor.module';
import { AdminVendorsController } from './vendors.admin.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  // 2. Add UsersModule and OrdersModule here
  imports: [UsersModule, OrdersModule, WithdrawalsModule, ProductsModule, VendorModule, AuditModule, TypeOrmModule.forFeature([Product, Tag])],
  controllers: [AdminController, AdminCurationController, AdminVendorsController],
  // 3. Remove the services from providers. They are now correctly provided by the imported modules.
  providers: [RolesGuard], 
})
export class AdminModule {}