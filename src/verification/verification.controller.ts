import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/roles.enum';
import { UsersService } from '../users/users.service';
import { VerificationStatus } from '../users/entities/user.entity';

@Controller('verification')
export class VerificationController {
  constructor(private readonly usersService: UsersService) {}

  @Post('request')
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.VENDOR, UserRole.DELIVERER)
  async requestVerification(@Body('documents') documents: string[], @Req() req) {
    const userId = req.user.id;
    await this.usersService.update(userId, {
      verificationStatus: VerificationStatus.PENDING,
      verificationDocuments: documents,
    });
    return { message: 'Verification request submitted.' };
  }
}
