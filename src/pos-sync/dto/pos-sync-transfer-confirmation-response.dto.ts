import { ApiProperty } from '@nestjs/swagger';
import { BranchTransferStatus } from '../../branches/entities/branch-transfer.entity';

export class PosSyncTransferConfirmationResponseDto {
  @ApiProperty({ nullable: true })
  entryIndex!: number | null;

  @ApiProperty()
  transferId!: number;

  @ApiProperty()
  transferNumber!: string;

  @ApiProperty({ enum: BranchTransferStatus })
  status!: BranchTransferStatus;

  @ApiProperty()
  fromBranchId!: number;

  @ApiProperty()
  toBranchId!: number;

  @ApiProperty({ type: [Number] })
  productIds!: number[];

  @ApiProperty()
  createdAt!: Date;
}
