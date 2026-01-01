import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class SendCodeDto {
  @IsString()
  @Matches(/^[+0-9]{7,16}$/, {
    message: 'phone must contain digits and may start with +',
  })
  phone: string;

  // Optional ISO country code to help parse local formats: ET, SO, KE, DJ
  @IsOptional()
  @IsString()
  region?: 'ET' | 'SO' | 'KE' | 'DJ';

  // Optional preferred channel; defaults to 'sms'. Server may fall back to 'whatsapp' if SMS is blocked.
  @IsOptional()
  @IsString()
  @IsIn(['sms', 'whatsapp'])
  channel?: 'sms' | 'whatsapp';
}
