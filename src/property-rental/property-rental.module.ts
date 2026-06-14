import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetailModule } from '../retail/retail.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PropertyRentalBooking } from './entities/property-rental-booking.entity';
import { PropertyRentalBookingCharge } from './entities/property-rental-booking-charge.entity';
import { PropertyUnit } from './entities/property-unit.entity';
import { PropertyRatePlan } from './entities/property-rate-plan.entity';
import { PropertyReservation } from './entities/property-reservation.entity';
import { PropertyRentalBookingController } from './property-rental-booking.controller';
import { PropertyRentalBookingService } from './property-rental-booking.service';
import { PropertyRentalInventoryController } from './property-rental-inventory.controller';
import { PropertyRentalInventoryService } from './property-rental-inventory.service';
import { RevenueAccrualService } from './revenue-accrual.service';

/**
 * Property Rental — a month-based POS format, fully independent of the
 * night-based HOTEL (Hospitality) module. Owns its own controllers, services,
 * entities, permissions and tables under the `pos/v1/property-rental/*` route
 * namespace.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PropertyRentalBooking,
      PropertyRentalBookingCharge,
      PropertyUnit,
      PropertyRatePlan,
      PropertyReservation,
    ]),
    RetailModule,
    AccountingModule,
  ],
  controllers: [
    PropertyRentalBookingController,
    PropertyRentalInventoryController,
  ],
  providers: [
    PropertyRentalBookingService,
    PropertyRentalInventoryService,
    RevenueAccrualService,
    PosBranchAccessGuard,
    RolesGuard,
  ],
})
export class PropertyRentalModule {}
