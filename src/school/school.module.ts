import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RetailModule } from '../retail/retail.module';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PosSuspendedCart } from '../pos-sync/entities/pos-suspended-cart.entity';
import { SchoolClass } from './entities/school-class.entity';
import { SchoolClassController } from './school-class.controller';
import { SchoolClassService } from './school-class.service';

/**
 * SCHOOL — a term-based POS format whose board unit is a CLASS: a container
 * holding one open folio per enrolled student, concurrently, all term.
 *
 * Owns its own registry under `pos/v1/school/*`, independent of the night-based
 * HOTEL and month-based PROPERTY_RENTAL modules, exactly as those two are
 * independent of each other. Fees are NOT owned here — they stay on products,
 * because the checkout re-prices every line from the product it names; a class
 * only points at the product that prices it.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SchoolClass,
      // Read-only: refusing to delete a class that still holds children means
      // counting the student folios sitting in it.
      PosSuspendedCart,
    ]),
    RetailModule,
  ],
  controllers: [SchoolClassController],
  providers: [SchoolClassService, PosBranchAccessGuard, RolesGuard],
  exports: [SchoolClassService],
})
export class SchoolModule {}
