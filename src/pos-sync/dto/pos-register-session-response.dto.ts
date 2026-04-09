import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PosRegisterSessionStatus } from '../entities/pos-register-session.entity';

export class PosRegisterSessionResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  branchId!: number;

  @ApiProperty()
  registerId!: string;

  @ApiProperty({ enum: PosRegisterSessionStatus })
  status!: PosRegisterSessionStatus;

  @ApiProperty()
  openedAt!: Date;

  @ApiPropertyOptional()
  closedAt?: Date | null;

  @ApiPropertyOptional()
  openedByUserId?: number | null;

  @ApiPropertyOptional()
  openedByName?: string | null;

  @ApiPropertyOptional()
  closedByUserId?: number | null;

  @ApiPropertyOptional()
  closedByName?: string | null;

  @ApiPropertyOptional()
  note?: string | null;

  @ApiPropertyOptional({ type: Object })
  metadata?: Record<string, any> | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PosRegisterSessionPageResponseDto {
  @ApiProperty({ type: [PosRegisterSessionResponseDto] })
  items!: PosRegisterSessionResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  perPage!: number;

  @ApiProperty()
  totalPages!: number;
}
