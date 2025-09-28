import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards, Req, HttpException } from '@nestjs/common';
import { PhoneVerificationService } from './phone-verification.service';
import { SendCodeDto, VerifyCodeDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';

// Simple in-memory rate limiting (per normalized phone)
const RESEND_COOLDOWN_MS = 60_000; // 60s
const MAX_ATTEMPTS = 5;

@Controller('verification/phone')
export class PhoneVerificationController {
  constructor(
    private readonly phoneService: PhoneVerificationService,
    private readonly usersService: UsersService,
  private readonly redis: RedisService,
  ) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(@Body() dto: SendCodeDto) {
    // Normalize first to rate-limit consistently per E.164
    const normalized = (this.phoneService as any)['normalizeE164'](dto.phone, dto.region);
    const key = `pv:send:${normalized}`;
    const client = this.redis.getClient();
    if (client) {
      const ttl = await client.pttl(key);
      if (ttl > 0) {
        throw new HttpException('Please wait before requesting another code.', HttpStatus.TOO_MANY_REQUESTS);
      }
      await client.set(key, '1', 'PX', RESEND_COOLDOWN_MS);
    }
    await this.phoneService.sendCode(dto.phone, dto.region);
    return { success: true };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async verify(@Body() dto: VerifyCodeDto, @Req() req: any) {
    const normalized = (this.phoneService as any)['normalizeE164'](dto.phone, dto.region);
    const akey = `pv:attempts:${normalized}`;
    const client = this.redis.getClient();
    if (client) {
      const attempts = await client.incr(akey);
      if (attempts === 1) await client.pexpire(akey, 10 * 60_000); // window 10 minutes
      if (attempts > MAX_ATTEMPTS) {
        throw new HttpException('Too many verification attempts. Please try later.', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const result = await this.phoneService.checkCode(dto.phone, dto.code, dto.region);
    if (!result.success) return result;

    // Persist to user profile
    const userId = req.user?.id;
    if (userId) {
      await this.usersService.update(userId, {
        phoneCountryCode: result.countryCode || undefined,
        phoneNumber: result.nationalNumber || normalized.replace(/^\+/, ''),
        isPhoneVerified: true,
      } as any);
    }

    // Reset attempt counter on success
    if (client) await client.del(akey);
    return { success: true, phone: result.e164 || normalized };
  }
}
