import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WithdrawalsController } from './withdrawals.controller';
import { WithdrawalsService } from './withdrawals.service';
import { Withdrawal } from './entities/withdrawal.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Withdrawal])],
  controllers: [WithdrawalsController],
  providers: [WithdrawalsService],
  exports: [WithdrawalsService],
})
export class WithdrawalsModule {}
