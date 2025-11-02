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

  async sendCode(
    to: string,
    region?: string,
    preferredChannel: 'sms' | 'whatsapp' = 'sms',
  ): Promise<{ success: true; channel: 'sms' | 'whatsapp'; message?: string }>{
    this.ensureConfigured();
    const phone = this.normalizeE164(to, region);
    const tryChannel = async (channel: 'sms' | 'whatsapp') => {
      return this.client!.verify.v2
        .services(this.serviceSid!)
        .verifications.create({ to: phone, channel });
    };
    const safe = (s: string) => (s.length > 6 ? s.slice(0, s.length - 6) + '******' : '******');
    try {
      await tryChannel(preferredChannel);
      return { success: true, channel: preferredChannel };
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      const code = e?.code || e?.status || '';
      this.logger.warn(`sendCode failed ch=${preferredChannel} to=${safe(phone)} code=${code} msg=${msg}`);
      const looksBlocked = /blocked\s+for\s+the\s+SMS\s+channel/i.test(msg) || /temporarily\s+blocked/i.test(msg);
      const canFallback = preferredChannel === 'sms';
      if (looksBlocked && canFallback) {
        try {
          await tryChannel('whatsapp');
          return {
            success: true,
            channel: 'whatsapp',
            message: 'SMS is blocked for this destination. We sent your code via WhatsApp instead.',
          };
        } catch (e2: any) {
          const msg2 = String(e2?.message || e2 || '');
          const code2 = e2?.code || e2?.status || '';
          this.logger.error(`fallback whatsapp failed to=${safe(phone)} code=${code2} msg=${msg2}`);
          throw new BadRequestException('SMS to this number is blocked and WhatsApp also failed. Please try a different phone number.');
        }
      }
      // Other errors: surface a friendly message
      if (/invalid\s+phone/i.test(msg)) {
        throw new BadRequestException('Invalid phone number. Please check the number and try again.');
      }
      throw new BadRequestException('We couldn\'t send a verification code right now. Please try again later.');
    }
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
