import { Module } from '@nestjs/common';
import { CurrencyService } from '../common/services/currency.service';

@Module({
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
