import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parsePhoneNumberFromString, AsYouType } from 'libphonenumber-js';

@Injectable()
export class PhoneVerificationService {
  private readonly logger = new Logger(PhoneVerificationService.name);
  private client: any | null = null;
  private serviceSid: string | null = null;

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.serviceSid = this.configService.get<string>('TWILIO_VERIFY_SERVICE_SID');

    if (!accountSid || !authToken || !this.serviceSid) {
      this.logger.warn('Twilio Verify not fully configured (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_VERIFY_SERVICE_SID).');
    } else {
      // Use runtime require to avoid TS editor module resolution hiccups
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio');
      this.client = twilio(accountSid, authToken);
      this.logger.log('Twilio Verify client initialized');
    }
  }

  private ensureConfigured() {
    if (!this.client || !this.serviceSid) {
      throw new InternalServerErrorException('Phone verification is not configured');
    }
  }

  private normalizeE164(phone: string, region?: string): string {
    const raw = (phone || '').trim();
    // If already E.164-looking and valid, accept
    if (raw.startsWith('+')) {
      const parsed = parsePhoneNumberFromString(raw);
      if (parsed && parsed.isValid()) return parsed.number; // E.164
    }

    // Try parse with provided region or auto-guess for EA countries
    const candidateRegions = [
      ...(region ? [region] : []),
      'ET', 'SO', 'KE', 'DJ',
    ].filter((v, i, a) => a.indexOf(v) === i);

    for (const r of candidateRegions) {
      const parsed = parsePhoneNumberFromString(raw, r as any);
      if (parsed && parsed.isValid()) return parsed.number; // E.164
    }

    throw new BadRequestException('Invalid phone number. Use local or E.164 (e.g., +251915333513).');
  }

  async sendCode(to: string, region?: string): Promise<{ success: true }> {
    this.ensureConfigured();
    const phone = this.normalizeE164(to, region);
    await this.client!.verify.v2.services(this.serviceSid!)
      .verifications.create({ to: phone, channel: 'sms' });
    return { success: true };
  }

  async checkCode(
    to: string,
    code: string,
    region?: string,
  ): Promise<{ success: boolean; e164?: string; countryCode?: string; nationalNumber?: string }>{
    this.ensureConfigured();
    const phone = this.normalizeE164(to, region);
    const res = await this.client!.verify.v2.services(this.serviceSid!)
      .verificationChecks.create({ to: phone, code });
    const approved = res.status === 'approved';
    if (!approved) return { success: false };
    const parsed = parsePhoneNumberFromString(phone);
    return parsed
      ? {
          success: true,
          e164: parsed.number,
          countryCode: `+${parsed.countryCallingCode}`,
          nationalNumber: parsed.nationalNumber?.toString?.() || '',
        }
      : { success: true, e164: phone };
  }
}
