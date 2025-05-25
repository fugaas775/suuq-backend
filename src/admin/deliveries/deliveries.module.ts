import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminDeliveriesController } from './deliveries.controller';
import { AdminDeliveriesService } from './deliveries.service';
import { Delivery } from '../../deliveries/entities/delivery.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Delivery])],
  controllers: [AdminDeliveriesController],
  providers: [AdminDeliveriesService],
})
export class AdminDeliveriesModule {}
