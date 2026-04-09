import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../auth/roles.enum';
import { VendorPermission } from '../vendor-permissions.enum';

export class VendorPortalUserSummaryDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserRole, isArray: true })
  roles!: UserRole[];

  @ApiPropertyOptional({ nullable: true })
  displayName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  storeName?: string | null;
}

export class VendorPortalStoreSummaryDto {
  @ApiProperty()
  vendorId!: number;

  @ApiProperty()
  storeName!: string;

  @ApiProperty({ enum: VendorPermission, isArray: true })
  permissions!: VendorPermission[];

  @ApiPropertyOptional({ nullable: true })
  title!: string | null;

  @ApiProperty()
  joinedAt!: Date;
}

export class VendorPortalSessionResponseDto {
  @ApiProperty({ type: VendorPortalUserSummaryDto })
  user!: VendorPortalUserSummaryDto;

  @ApiProperty({ type: VendorPortalStoreSummaryDto, isArray: true })
  stores!: VendorPortalStoreSummaryDto[];

  @ApiPropertyOptional({ nullable: true })
  defaultVendorId!: number | null;

  @ApiProperty()
  requiresStoreSelection!: boolean;
}

export class VendorPortalAuthResponseDto extends VendorPortalSessionResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;
}

export class VendorPortalAccessDeniedResponseDto {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: 'VENDOR_PORTAL_ACCESS_DENIED' })
  code!: string;

  @ApiProperty({
    example:
      'This account is not linked to any vendor store or staff workspace.',
  })
  message!: string;

  @ApiProperty({ example: 'Forbidden' })
  error!: string;
}
