import { ApiProperty } from '@nestjs/swagger';
import { BranchTransferStatus } from '../../branches/entities/branch-transfer.entity';
import { RetailDesktopWorkbenchActionResponseDto } from './retail-desktop-workbench-response.dto';

export class RetailDesktopTransferDetailItemResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  productId!: number;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ nullable: true })
  note!: string | null;
}

export class RetailDesktopTransferDetailSummaryResponseDto {
  @ApiProperty()
  transferId!: number;

  @ApiProperty()
  transferNumber!: string;

  @ApiProperty()
  branchId!: number;

  @ApiProperty({ enum: ['INBOUND', 'OUTBOUND'] })
  direction!: 'INBOUND' | 'OUTBOUND';

  @ApiProperty()
  fromBranchId!: number;

  @ApiProperty()
  toBranchId!: number;

  @ApiProperty({ enum: BranchTransferStatus })
  status!: BranchTransferStatus;

  @ApiProperty()
  ageHours!: number;

  @ApiProperty()
  totalUnits!: number;

  @ApiProperty({ enum: ['CRITICAL', 'HIGH', 'NORMAL'] })
  priority!: 'CRITICAL' | 'HIGH' | 'NORMAL';

  @ApiProperty()
  priorityReason!: string;

  @ApiProperty({ nullable: true })
  note!: string | null;

  @ApiProperty({ nullable: true })
  requestedAt!: Date | null;

  @ApiProperty({ nullable: true })
  dispatchedAt!: Date | null;

  @ApiProperty({ nullable: true })
  receivedAt!: Date | null;

  @ApiProperty({ nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class RetailDesktopTransferDetailResponseDto {
  @ApiProperty({ type: RetailDesktopTransferDetailSummaryResponseDto })
  summary!: RetailDesktopTransferDetailSummaryResponseDto;

  @ApiProperty({ type: [RetailDesktopWorkbenchActionResponseDto] })
  actions!: RetailDesktopWorkbenchActionResponseDto[];

  @ApiProperty({ type: [RetailDesktopTransferDetailItemResponseDto] })
  items!: RetailDesktopTransferDetailItemResponseDto[];
}
