import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { PartnerCredential } from '../partner-credentials/entities/partner-credential.entity';
import { Product } from '../products/entities/product.entity';
import { RetailTenant } from '../retail/entities/retail-tenant.entity';
import { ProductAlias } from './entities/product-alias.entity';
import { ProductAliasesController } from './product-aliases.controller';
import { ProductAliasesService } from './product-aliases.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductAlias,
      RetailTenant,
      Branch,
      PartnerCredential,
      Product,
    ]),
  ],
  controllers: [ProductAliasesController],
  providers: [ProductAliasesService],
  exports: [ProductAliasesService],
})
export class ProductAliasesModule {}
