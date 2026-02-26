import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditLimit } from './entities/credit-limit.entity';
import { CreditTransaction } from './entities/credit-transaction.entity';
import { CreditService } from './credit.service';
import { CreditController } from './credit.controller';
import { CurrencyModule } from '../common/services/currency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreditLimit, CreditTransaction]),
    CurrencyModule,
  ],
  providers: [CreditService],
  controllers: [CreditController],
  exports: [CreditService],
})
export class CreditModule {}
