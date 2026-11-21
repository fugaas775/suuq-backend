import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionPaymentClaim } from './entities/subscription-payment-claim.entity';
import { SubscriptionPaymentClaimsService } from './subscription-payment-claims.service';
import { SubscriptionPaymentMailerService } from './subscription-payment-mailer.service';
import { EmailModule } from '../email/email.module';
import { User } from '../users/entities/user.entity';
import { Branch } from '../branches/entities/branch.entity';

/**
 * The claim ledger for subscription payments made by transfer, and the emails
 * about them. Depends only on the mail queue, so the branch, supplier and equity modules can all import it without
 * a cycle; the code that APPROVES a claim lives in BillingModule, which already
 * sits above all three.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SubscriptionPaymentClaim, User, Branch]),
    EmailModule,
  ],
  providers: [
    SubscriptionPaymentClaimsService,
    SubscriptionPaymentMailerService,
  ],
  exports: [SubscriptionPaymentClaimsService, SubscriptionPaymentMailerService],
})
export class SubscriptionPaymentsModule {}
