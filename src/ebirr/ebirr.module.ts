import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EbirrService } from './ebirr.service';
import { EbirrController } from './ebirr.controller';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { Order } from '../orders/entities/order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EbirrTransaction, Order])],
  controllers: [EbirrController],
  providers: [EbirrService],
  exports: [EbirrService],
})
export class EbirrModule {}
