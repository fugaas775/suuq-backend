import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CurrencyService } from './currency.service';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
