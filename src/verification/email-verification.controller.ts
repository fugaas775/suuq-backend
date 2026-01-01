import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';
import { SendEmailCodeDto } from './dto/send-email-code.dto';
import { VerifyEmailCodeDto } from './dto/verify-email-code.dto';

@Controller('verification/email')
export class EmailVerificationController {
  constructor(
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(@Body() dto: SendEmailCodeDto) {
    await this.emailVerificationService.sendCode(dto.email);
    return { success: true };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: VerifyEmailCodeDto) {
    return this.emailVerificationService.verifyCode(dto.email, dto.code);
  }
}
