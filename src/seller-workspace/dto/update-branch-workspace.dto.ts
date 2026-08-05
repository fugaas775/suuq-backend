import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

// A Home quick-link target: an internal path ("/ops/reports") or an absolute
// https:// URL. Anything else — notably javascript: and data: URIs, which would
// render as a user-clickable link — is rejected. Mirrored by the client-side
// validation so both ends agree.
const HOME_QUICK_LINK_TARGET = /^(\/[^\s]*|https:\/\/[^\s]+)$/;

class HomeWidgetConfigDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @IsBoolean()
  enabled!: boolean;
}

class HomeQuickLinkDto {
  @IsString()
  @MaxLength(64)
  id!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(48)
  label!: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(512)
  @Matches(HOME_QUICK_LINK_TARGET, {
    message: 'quick-link target must be an internal path or an https:// URL',
  })
  to!: string;

  @IsOptional()
  @IsBoolean()
  external?: boolean;
}

class HomeWelcomeDto {
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @ValidateIf((o) => o.title !== null)
  @IsString()
  @MaxLength(80)
  title?: string | null;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @ValidateIf((o) => o.body !== null)
  @IsString()
  @MaxLength(600)
  body?: string | null;

  @IsBoolean()
  enabled!: boolean;
}

class HomeBrandingDto {
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @ValidateIf((o) => o.coverImageUrl !== null)
  @IsString()
  @MaxLength(512)
  coverImageUrl?: string | null;

  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @ValidateIf((o) => o.accent !== null)
  @IsString()
  @MaxLength(32)
  accent?: string | null;
}

/**
 * First-run milestones. Server-owned — a client may echo it back on a layout
 * save, but the service preserves the stored value either way, so nothing here
 * is trusted from the request.
 */
class HomeFirstRunDto {
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @ValidateIf((o) => o.businessTypeConfirmedAt !== null)
  @IsString()
  @MaxLength(40)
  businessTypeConfirmedAt?: string | null;
}

// The whole branch Home layout. Array sizes are capped because this blob ships on
// the login payload for EVERY branch a user can access, so an unbounded config
// would bloat every sign-in.
export class BranchHomeConfigDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => HomeWidgetConfigDto)
  widgets!: HomeWidgetConfigDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => HomeWelcomeDto)
  welcome?: HomeWelcomeDto | null;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => HomeQuickLinkDto)
  quickLinks!: HomeQuickLinkDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => HomeBrandingDto)
  branding?: HomeBrandingDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => HomeFirstRunDto)
  firstRun?: HomeFirstRunDto | null;
}

export class UpdateBranchWorkspaceDto {
  @ApiPropertyOptional({ description: 'Branch display name' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Street address' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ description: 'City' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  city?: string;

  @ApiPropertyOptional({ description: 'Country' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(128)
  country?: string;

  @ApiPropertyOptional({ description: 'IANA timezone identifier' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Branch phone number' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ description: 'Branch TIN number' })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tinNumber?: string;

  @ApiPropertyOptional({
    description:
      'Default RETAIL marketplace category id pre-selected when adding products. Send null to clear.',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultCategoryId?: number | null;

  @ApiPropertyOptional({
    description:
      'HOTEL standard checkout time as "HH:MM" 24h (e.g. "11:00", "11:30"). ' +
      'Seeds the folio default time and the early-check-in / late-checkout fee ' +
      'boundary on the register. Send null to clear (falls back to 11:00).',
    nullable: true,
    example: '11:30',
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @ValidateIf((o) => o.checkoutPolicyTime !== null)
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'checkoutPolicyTime must be a valid "HH:MM" 24h time',
  })
  checkoutPolicyTime?: string | null;

  @ApiPropertyOptional({
    description: 'Brand logo URL for this branch. Send null to clear.',
    nullable: true,
    example: 'https://cdn.example.com/branch-logo.png',
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(512)
  logoUrl?: string | null;

  @ApiPropertyOptional({
    description:
      'Whether this branch charges tax (VAT) on sales. Applies to all service ' +
      'formats. Off means the register behaves exactly as it does today.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  taxEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Tax (VAT) rate as a FRACTION, not a percent — 0.15 is 15%. Ignored ' +
      'while taxEnabled is false. Tax is exclusive: it is added on top of the ' +
      'discounted subtotal.',
    example: 0.15,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  taxRate?: number;

  @ApiPropertyOptional({
    description:
      'Per-branch layout for the customizable Home page (widgets, order, ' +
      'quick-links, welcome note, branding). Send null to reset to the ' +
      'per-format default.',
    nullable: true,
    type: BranchHomeConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BranchHomeConfigDto)
  homeConfig?: BranchHomeConfigDto | null;
}
