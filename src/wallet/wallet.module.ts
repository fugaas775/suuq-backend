import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { TopUpRequest } from './entities/top-up-request.entity';
import { User } from '../users/entities/user.entity';
import { CurrencyModule } from '../common/services/currency.module';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { MediaModule } from '../media/media.module';
import { UsersModule } from '../users/users.module';

import { PayoutLog } from './entities/payout-log.entity';
import { Settlement } from './entities/settlement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      WalletTransaction,
      TopUpRequest,
      PayoutLog,
      Settlement,
      User,
      UiSetting,
    ]),
    CurrencyModule,
    MediaModule,
    forwardRef(() => UsersModule),
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
