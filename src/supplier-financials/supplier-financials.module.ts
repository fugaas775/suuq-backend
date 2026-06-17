import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrder } from '../purchase-orders/entities/purchase-order.entity';
import { BillingModule } from '../billing/billing.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { SupplierFinancialsController } from './supplier-financials.controller';
import { SupplierFinancialsService } from './supplier-financials.service';

/**
 * A dedicated leaf module for the supplier-scoped Financials + Reports surface.
 *
 * It deliberately lives outside SuppliersModule: a Billing → BranchStaff →
 * Suppliers import chain already exists, so importing BillingModule into
 * SuppliersModule would close a dependency cycle. Because nothing imports this
 * module, it can freely import SuppliersModule (supplier context + outlet
 * resolution) AND BillingModule (the counter P&L/BS/TB engine) with zero
 * forwardRef. Modelled on SupplierOffersModule, which imports SuppliersModule
 * for the same reason.
 */
@Module({
  imports: [
    SuppliersModule, // SupplierStaffService — supplier context + outletBranchId
    BillingModule, // BranchFinancialReportsService — counter statements
    TypeOrmModule.forFeature([PurchaseOrder]),
  ],
  controllers: [SupplierFinancialsController],
  providers: [SupplierFinancialsService],
})
export class SupplierFinancialsModule {}
