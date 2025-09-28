import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { ETradeVerificationService } from './etrade-verification.service';
import {
  VerificationStatus,
  VerificationMethod,
} from '../users/entities/user.entity';

@Injectable()
export class VerificationService {
  constructor(
    private readonly usersService: UsersService,
    private readonly etradeVerificationService: ETradeVerificationService,
  ) {}

  async checkBusinessLicense(userId: number, licenseNumber: string) {
    const licenseInfo = await this.etradeVerificationService.verifyLicense(
      licenseNumber,
    );

    await this.usersService.update(userId, {
      verificationStatus: VerificationStatus.APPROVED,
      verificationMethod: VerificationMethod.AUTOMATIC,
      businessLicenseInfo: licenseInfo,
      businessLicenseNumber: licenseNumber,
    });

    return licenseInfo;
  }
}
