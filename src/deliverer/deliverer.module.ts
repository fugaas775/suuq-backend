import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DelivererService } from './deliverer.service';
import { Order } from '../orders/entities/order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  providers: [DelivererService],
  exports: [DelivererService],
})
export class DelivererModule {}
