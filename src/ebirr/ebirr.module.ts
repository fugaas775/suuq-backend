import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EbirrService } from './ebirr.service';
import { EbirrController } from './ebirr.controller';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EbirrTransaction])],
  controllers: [EbirrController],
  providers: [EbirrService],
  exports: [EbirrService],
})
export class EbirrModule {}
