import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { randomInt, randomBytes, createHash, timingSafeEqual } from 'crypto';

const RESEND_COOLDOWN_MS = 60_000; // 60s
const OTP_EXPIRY_MS = 5 * 60_000; // 5 minutes
const MAX_ATTEMPTS = 5;
const OTP_LENGTH = 6;

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly redis: RedisService,
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
  ) {}

  private normalize(email: string): string {
    return email.trim().toLowerCase();
  }

  private getSendKey(email: string): string {
    const e = this.normalize(email);
    return `ev:send:${e}`;
  }

  private getCodeKey(email: string): string {
    const e = this.normalize(email);
    return `ev:code:${e}`;
  }

  private getAttemptsKey(email: string): string {
    const e = this.normalize(email);
    return `ev:attempts:${e}`;
  }

  // Generate a numeric OTP of fixed length using cryptographically secure RNG
  private generateNumericOtp(length: number = OTP_LENGTH): string {
    const max = 10 ** length; // exclusive upper bound for randomInt
    const n = randomInt(0, max);
    return n.toString().padStart(length, '0');
  }

  private hashOtp(saltHex: string, code: string): string {
    const h = createHash('sha256');
    h.update(saltHex);
    h.update(':');
    h.update(code);
    return h.digest('hex');
  }

  async sendCode(email: string): Promise<void> {
    if (process.env.EMAIL_VERIFICATION_ENABLED !== 'true') {
      throw new HttpException('Not Found', HttpStatus.NOT_FOUND);
    }
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new HttpException(
        'User with this email does not exist.',
        HttpStatus.NOT_FOUND,
      );
    }

    const sendKey = this.getSendKey(email);
    const client = this.redis.getClient();
    if (!client) {
      throw new HttpException(
        'Verification temporarily unavailable. Please try again shortly.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const ttl = await client.pttl(sendKey);
    if (ttl > 0) {
      throw new HttpException(
        'Please wait before requesting another code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.generateNumericOtp(OTP_LENGTH);
    const saltHex = randomBytes(16).toString('hex');
    const hashHex = this.hashOtp(saltHex, code);

    await this.emailService.send({
      to: email,
      subject: 'Your Email Verification Code',
      text: `Your verification code is: ${code}`,
      html: `<p>Your verification code is: <strong>${code}</strong></p>`,
    });

    const codeKey = this.getCodeKey(email);
    // Store salted hash to avoid keeping OTP in plaintext. Backward-compatible verify handles both formats.
    await client.set(codeKey, `${saltHex}:${hashHex}`, 'PX', OTP_EXPIRY_MS);
    await client.set(sendKey, '1', 'PX', RESEND_COOLDOWN_MS);
  }

  async verifyCode(email: string, code: string): Promise<{ success: boolean }> {
    if (process.env.EMAIL_VERIFICATION_ENABLED !== 'true') {
      throw new HttpException('Not Found', HttpStatus.NOT_FOUND);
    }
    const client = this.redis.getClient();
    if (!client) {
      throw new HttpException(
        'Verification temporarily unavailable. Please try again shortly.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const attemptsKey = this.getAttemptsKey(email);

    const attempts = await client.incr(attemptsKey);
    if (attempts === 1) {
      await client.pexpire(attemptsKey, 10 * 60_000); // 10 minute window
    }

    if (attempts > MAX_ATTEMPTS) {
      throw new HttpException(
        'Too many verification attempts. Please try later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const codeKey = this.getCodeKey(email);
    const storedCode = await client.get(codeKey);

    if (!storedCode) {
      return { success: false };
    }

    let valid = false;
    if (storedCode.includes(':')) {
      // New format: salt:hash
      const [saltHex, hashHex] = storedCode.split(':', 2);
      const computedHex = this.hashOtp(saltHex, code);
      try {
        valid = timingSafeEqual(
          Buffer.from(hashHex, 'hex'),
          Buffer.from(computedHex, 'hex'),
        );
      } catch {
        valid = false;
      }
    } else {
      // Legacy format: plain OTP
      valid = storedCode === code;
    }

    if (!valid) {
      return { success: false };
    }

    await client.del(codeKey);
    await client.del(attemptsKey);

    return { success: true };
  }
}
