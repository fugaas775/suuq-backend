import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetailModule } from '../retail/retail.module';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Branch } from '../branches/entities/branch.entity';
import { PosCheckout } from '../pos-sync/entities/pos-checkout.entity';
import { VehicleClass } from './entities/vehicle-class.entity';
import { VehicleOwner } from './entities/vehicle-owner.entity';
import { Vehicle } from './entities/vehicle.entity';
import { VehiclePlateSeries } from './entities/vehicle-plate-series.entity';
import { VehiclePlate } from './entities/vehicle-plate.entity';
import { VehicleRegistration } from './entities/vehicle-registration.entity';
import { VehicleEvent } from './entities/vehicle-event.entity';
import { VehicleRegistryController } from './vehicle-registry.controller';
import { VehicleRegistryService } from './vehicle-registry.service';

/**
 * The vehicle registry for the Somali Regional State Bureau of Trade and
 * Transport.
 *
 * A leaf module: it reads Branch (to resolve the bureau behind an office) and
 * PosCheckout (to prove a fee was paid) but nothing depends on it, which keeps
 * it out of the DI cycles the supplier modules had to be untangled from.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      VehicleClass,
      VehicleOwner,
      Vehicle,
      VehiclePlateSeries,
      VehiclePlate,
      VehicleRegistration,
      VehicleEvent,
      Branch,
      PosCheckout,
    ]),
    RetailModule,
  ],
  controllers: [VehicleRegistryController],
  // Guards provided rather than AuthModule imported, following SchoolModule:
  // the registry is a leaf and pulling in the auth module would be a new edge
  // into a graph the supplier modules already had to be untangled from.
  providers: [VehicleRegistryService, PosBranchAccessGuard, RolesGuard],
  exports: [VehicleRegistryService],
})
export class VehicleRegistryModule {}
