import { Module, forwardRef } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { RedisModule } from '../redis/redis.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EbirrService } from './ebirr.service';
import { EbirrController } from './ebirr.controller';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { Order } from '../orders/entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EbirrTransaction, Order]),
    forwardRef(() => OrdersModule),
    RedisModule,
  ],
  controllers: [EbirrController],
  providers: [EbirrService],
  exports: [EbirrService],
})
export class EbirrModule {}
