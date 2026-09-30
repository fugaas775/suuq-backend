import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosBranchAccessGuard } from '../auth/pos-branch-access.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Branch } from '../branches/entities/branch.entity';
import { Product } from '../products/entities/product.entity';
import { RetailModule } from '../retail/retail.module';
import { Ingredient } from './entities/ingredient.entity';
import { IngredientMovement } from './entities/ingredient-movement.entity';
import { ProductRecipe } from './entities/product-recipe.entity';
import { IngredientsController } from './ingredients.controller';
import { IngredientsService } from './ingredients.service';

/**
 * The kitchen's shelf — what a QSR USES, kept apart from what it sells.
 *
 * Imported by PurchasingModule (a signed-off run receives stock here) and by
 * PosSyncModule (a sale consumes it). BillingModule reads the movements
 * table for the P&L through its own repository rather than importing this
 * module, because Purchasing already imports Billing and the edge would
 * close a cycle.
 *
 * Imports nothing that imports either of those. `Branch` and `Product` are
 * read-only repositories here: the format gate and the recipe's product
 * check, nothing more.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ingredient,
      IngredientMovement,
      ProductRecipe,
      Branch,
      Product,
    ]),
    RetailModule,
  ],
  controllers: [IngredientsController],
  providers: [IngredientsService, PosBranchAccessGuard, RolesGuard],
  exports: [IngredientsService],
})
export class IngredientsModule {}
