import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, OrderItem } from './entities/order.entity';
import { Dispute } from './entities/dispute.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CartModule } from '../cart/cart.module';
import { ProductsModule } from '../products/products.module';
import { TelebirrModule } from '../telebirr/telebirr.module';
import { MpesaModule } from '../mpesa/mpesa.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { AuditModule } from '../audit/audit.module';
import { CurrencyModule } from '../common/services/currency.module';
import { EmailModule } from '../email/email.module';
import { UiSetting } from '../settings/entities/ui-setting.entity';
import { EbirrModule } from '../ebirr/ebirr.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { CreditModule } from '../credit/credit.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { Message } from '../chat/entities/message.entity';
import { Conversation } from '../chat/entities/conversation.entity';
import { PayoutLog } from '../wallet/entities/payout-log.entity';
import { EbirrTransaction } from '../payments/entities/ebirr-transaction.entity';
import { Branch } from '../branches/entities/branch.entity';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItem,
      Dispute,
      UiSetting,
      Message,
      Conversation,
      PayoutLog,
      EbirrTransaction,
      Branch,
    ]),
    BranchesModule,
    CartModule,
    ProductsModule,
    TelebirrModule,
    forwardRef(() => EbirrModule),
    UsersModule,
    MpesaModule,
    NotificationsModule,
    MediaModule,
    AuditModule,
    CurrencyModule,
    EmailModule,
    WalletModule,
    CreditModule,
    PromotionsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [TypeOrmModule, OrdersService],
})
export class OrdersModule {}
