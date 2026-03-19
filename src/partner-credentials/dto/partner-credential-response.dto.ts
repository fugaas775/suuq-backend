import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PartnerCredentialStatus,
  PartnerType,
} from '../entities/partner-credential.entity';

export class PartnerCredentialBranchSummaryDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  code?: string | null;

  @ApiPropertyOptional()
  city?: string | null;

  @ApiPropertyOptional()
  country?: string | null;
}

export class PartnerCredentialResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: PartnerType })
  partnerType!: PartnerType;

  @ApiPropertyOptional()
  branchId?: number | null;

  @ApiPropertyOptional({ type: PartnerCredentialBranchSummaryDto })
  branch?: PartnerCredentialBranchSummaryDto | null;

  @ApiProperty({ type: [String] })
  scopes!: string[];

  @ApiProperty({ enum: PartnerCredentialStatus })
  status!: PartnerCredentialStatus;

  @ApiPropertyOptional()
  lastUsedAt?: Date | null;

  @ApiPropertyOptional()
  revokedAt?: Date | null;

  @ApiPropertyOptional()
  revokedByUserId?: number | null;

  @ApiPropertyOptional()
  revocationReason?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
