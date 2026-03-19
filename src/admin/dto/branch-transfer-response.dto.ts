import { ApiProperty } from '@nestjs/swagger';
import { BranchTransferStatus } from '../../branches/entities/branch-transfer.entity';

export class BranchTransferItemResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  productId!: number;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ nullable: true })
  note!: string | null;
}

export class BranchTransferResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  transferNumber!: string;

  @ApiProperty()
  fromBranchId!: number;

  @ApiProperty()
  toBranchId!: number;

  @ApiProperty({ enum: BranchTransferStatus })
  status!: BranchTransferStatus;

  @ApiProperty({ nullable: true })
  note!: string | null;

  @ApiProperty({ nullable: true })
  requestedByUserId!: number | null;

  @ApiProperty({ nullable: true })
  requestedAt!: Date | null;

  @ApiProperty({ nullable: true })
  dispatchedByUserId!: number | null;

  @ApiProperty({ nullable: true })
  dispatchedAt!: Date | null;

  @ApiProperty({ nullable: true })
  receivedByUserId!: number | null;

  @ApiProperty({ nullable: true })
  receivedAt!: Date | null;

  @ApiProperty({ nullable: true })
  cancelledByUserId!: number | null;

  @ApiProperty({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ type: [BranchTransferItemResponseDto] })
  items!: BranchTransferItemResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
