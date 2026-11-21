import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionPaymentClaim } from './entities/subscription-payment-claim.entity';
import { SubscriptionPaymentClaimsService } from './subscription-payment-claims.service';

/**
 * The claim ledger for subscription payments made by transfer. Depends on
 * nothing, so the branch, supplier and equity modules can all import it without
 * a cycle; the code that APPROVES a claim lives in BillingModule, which already
 * sits above all three.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionPaymentClaim])],
  providers: [SubscriptionPaymentClaimsService],
  exports: [SubscriptionPaymentClaimsService],
})
export class SubscriptionPaymentsModule {}
