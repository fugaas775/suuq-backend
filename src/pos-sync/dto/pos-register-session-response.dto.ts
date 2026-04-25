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

  @ApiPropertyOptional({
    example: 100.0,
    description: 'Opening cash float declared at the start of the shift.',
  })
  openingFloat?: number | null;

  @ApiPropertyOptional({
    example: 1234.5,
    description: 'Closing cash declared by the operator at end-of-shift.',
  })
  closingFloat?: number | null;

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
