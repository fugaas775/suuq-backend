import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { MarketingLeadsController } from './marketing-leads.controller';
import { MarketingLeadsService } from './marketing-leads.service';

@Module({
  imports: [EmailModule],
  controllers: [MarketingLeadsController],
  providers: [MarketingLeadsService],
  exports: [MarketingLeadsService],
})
export class MarketingLeadsModule {}
