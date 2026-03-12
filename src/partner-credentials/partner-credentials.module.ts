import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnerCredential } from './entities/partner-credential.entity';
import { PartnerCredentialsController } from './partner-credentials.controller';
import { PartnerCredentialsService } from './partner-credentials.service';

@Module({
  imports: [TypeOrmModule.forFeature([PartnerCredential])],
  controllers: [PartnerCredentialsController],
  providers: [PartnerCredentialsService],
  exports: [PartnerCredentialsService],
})
export class PartnerCredentialsModule {}
